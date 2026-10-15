#!/usr/bin/env python3
"""Konverter: echte Geodaten -> Spielkarte (public/maps/<name>/).

Quellen (in tools/map/raw/, siehe tools/map/README.md):
  - Copernicus GLO-30 DEM  (Höhe, 30 m, DSM – enthält Baumkronen, wird korrigiert)
  - ESA WorldCover 2021    (Landbedeckung, 10 m)
  - osm_<id>.json          (OpenStreetMap per fetch_osm.py: Gewässer, Flüsse, Heide, Moor,
                             Steinbrüche, Orte – © OpenStreetMap-Mitwirkende, ODbL)
  - places.json            (nur Fallback ohne OSM: Orte als Näherungswerte)

Ausgabe:
  map.json     Metadaten, Orte, Gelände-Typen, Credits
  height.bin   Uint16, Höhe in Dezimetern pro Rasterzelle (Zeilen von Nord nach Süd)
  cover.bin    Uint8, Bedeckungsklasse pro Rasterzelle (für die Optik)
  water.bin    Uint16, Wasserspiegel in Dezimetern (0 = kein Wasser)
  hex.bin      Uint8, Gelände-Typ pro Hex (Spiellogik), odd-r-Offset, Zeile für Zeile
  lakes.json   Seen als Polygone (Uferlinie aus OSM): [{n Name, l Spiegel m, o [x,z,...], h [[x,z,...]]}]
  rivers.json  Flüsse/Bäche als Linien: [{n Name, k 0=Fluss 1=Bach 2=Kanal, w Breite m, p [x,z,Spiegel,...]}]

Aufruf: python3 tools/map/build_map.py [--preview out.png]
"""
import argparse
import json
import math
import os

import numpy as np
import rasterio
from rasterio.windows import from_bounds
from scipy import ndimage
from scipy.spatial import cKDTree

import osm

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))

MAP = {
    "id": "monschau-rursee",
    "name": "Monschauer Land & Rursee",
    # lon_min, lat_min, lon_max, lat_max
    "bbox": [6.17, 50.51, 6.52, 50.67],
    "cell": 30.0,        # Rasterweite in Metern
    "hexSize": 90.0,     # Hex-Umkreisradius in Metern (pointy-top)
    "exaggeration": 2.5, # Standard-Überhöhung (im Spiel einstellbar)
}

# Bedeckungsklassen (Optik + Grundlage für Hex-Gelände)
COVER = ["wasser", "wiese", "acker", "wald", "heide", "moor", "fels", "siedlung"]
C = {name: i for i, name in enumerate(COVER)}
# Spiel-Gelände pro Hex (Spiellogik); acker zählt als wiese
HEX_TERRAIN = ["wasser", "wiese", "wald", "heide", "moor", "stein", "siedlung"]
H = {name: i for i, name in enumerate(HEX_TERRAIN)}

# ESA WorldCover -> Bedeckungsklasse
WORLDCOVER = {10: "wald", 20: "heide", 30: "wiese", 40: "acker", 50: "siedlung",
              60: "fels", 70: "fels", 80: "wasser", 90: "moor", 95: "moor", 100: "moor"}

# Fallback ohne OSM-Daten: näherungsweise Regionen für Heide und Moor
REGIONS = [
    # Hohes Venn (Moor) bei Mützenich: Grünland auf der Hochfläche wird Moor
    {"terrain": "moor", "lon": [6.17, 6.235], "lat": [50.545, 50.62], "minHeight": 560},
    # Dreiborner Hochfläche (Heide, ehem. Truppenübungsplatz)
    {"terrain": "heide", "lon": [6.395, 6.47], "lat": [50.555, 50.60], "minHeight": 450},
]

# Flussbett je Linienart: Tiefe unter dem Spiegel (m), Uferneigung (m/m), Einflussradius (m)
CHANNEL = {"river": (2.5, 0.22, 90.0), "canal": (1.2, 0.2, 45.0), "stream": (1.0, 0.12, 40.0)}

CANOPY = 18.0  # mittlere Baumhöhe, wird aus dem DSM herausgerechnet (m)


def lonlat_grid(meta):
    lon0, lat0, lon1, lat1 = meta["bbox"]
    latc = (lat0 + lat1) / 2
    m_lon = 111320.0 * math.cos(math.radians(latc))
    m_lat = 110574.0
    width_m = (lon1 - lon0) * m_lon
    height_m = (lat1 - lat0) * m_lat
    cell = meta["cell"]
    nx, nz = int(width_m // cell), int(height_m // cell)
    xs = (np.arange(nx) + 0.5) * cell
    zs = (np.arange(nz) + 0.5) * cell
    lons = lon0 + xs / m_lon
    lats = lat1 - zs / m_lat  # Zeile 0 = Norden
    return nx, nz, lons, lats, m_lon, m_lat


def sample(path, bbox, lons, lats, order, sub=1):
    """Rasterwerte an (lon,lat)-Gitterpunkten. sub>1: sub×sub Unterabtastung je Zelle."""
    pad = 0.01
    with rasterio.open(path) as src:
        w = from_bounds(bbox[0] - pad, bbox[1] - pad, bbox[2] + pad, bbox[3] + pad, src.transform)
        arr = src.read(1, window=w, boundless=True).astype(np.float32)
        t = src.window_transform(w)
    if sub == 1:
        LON, LAT = np.meshgrid(lons, lats)
        cols, rows = ~t * (LON, LAT)
        return ndimage.map_coordinates(arr, [rows - 0.5, cols - 0.5], order=order, mode="nearest")
    dlon = (lons[1] - lons[0]) if len(lons) > 1 else 0
    dlat = (lats[1] - lats[0]) if len(lats) > 1 else 0
    out = []
    for sy in range(sub):
        for sx in range(sub):
            ox = (sx + 0.5) / sub - 0.5
            oy = (sy + 0.5) / sub - 0.5
            LON, LAT = np.meshgrid(lons + ox * dlon, lats + oy * dlat)
            cols, rows = ~t * (LON, LAT)
            out.append(ndimage.map_coordinates(arr, [rows - 0.5, cols - 0.5], order=0, mode="nearest"))
    return np.stack(out)


def build(args):
    meta = dict(MAP)
    raw = os.path.join(HERE, "raw")
    nx, nz, lons, lats, m_lon, m_lat = lonlat_grid(meta)
    cell = meta["cell"]
    print(f"Raster {nx}×{nz} Zellen à {cell:.0f} m = {nx*cell/1000:.1f} × {nz*cell/1000:.1f} km")

    # --- Landbedeckung: Anteil je Klasse pro Zelle ---------------------------
    wc = sample(os.path.join(raw, "worldcover_monschau.tif"), meta["bbox"], lons, lats, 0, sub=4)
    lut = np.full(256, C["wiese"], np.uint8)
    for code, name in WORLDCOVER.items():
        lut[code] = C[name]
    cls = lut[wc.astype(np.uint8)]                       # (16, nz, nx)
    frac = np.stack([(cls == i).mean(axis=0) for i in range(len(COVER))])  # (K, nz, nx)
    cover = frac.argmax(axis=0).astype(np.uint8)

    # --- Höhe: DSM -> Gelände ------------------------------------------------
    dem = sample(os.path.join(raw, "cop_N50_E006.tif"), meta["bbox"], lons, lats, 1)
    forest = ndimage.gaussian_filter(frac[C["wald"]], 1.5)
    ground = dem - CANOPY * np.clip(forest * 1.2, 0, 1)
    ground = ndimage.gaussian_filter(ground, 0.8)

    # --- OpenStreetMap -----------------------------------------------------
    osm_path = os.path.join(raw, f"osm_{meta['id']}.json")
    els = osm.load(osm_path) if os.path.exists(osm_path) else None
    proj = osm.Projector(meta["bbox"], m_lon, m_lat)
    print("OSM:", f"{len(els)} Elemente" if els else "keine Daten, Fallback auf WorldCover/places.json")

    # --- Stehendes Wasser: Seen, Talsperren, Teiche ----------------------------
    level = np.zeros_like(ground)
    lakes = []
    if els:
        lakes = osm.polygons(els, proj, lambda t: (t.get("natural") == "water" and t.get("water") not in osm.WATER_SKIP)
                             or t.get("landuse") == "reservoir")
        shore_sd, lake_id = osm.rasterize(lakes, nx, nz, cell, ids=True)
        water = shore_sd < 0
        # Wasserzellen ohne Id am Zellmittelpunkt: nächste Id übernehmen
        _, (ii, jj) = ndimage.distance_transform_edt(lake_id == 0, return_indices=True)
        lake_id = np.where(water, lake_id[ii, jj], 0)
    else:
        water = frac[C["wasser"]] >= 0.4
        lake_id, _ = ndimage.label(water)
    lab, n = ndimage.label(water)
    sizes = ndimage.sum(water, lab, range(1, n + 1))
    for i, size in enumerate(sizes, start=1):
        if size < (6 if els else 300):  # Kleinstteiche; ohne OSM sind kleine Flecken Flussstücke
            water[lab == i] = False
    lake_id[~water] = 0
    for i in np.unique(lake_id[water]):
        m = lake_id == i
        level[m] = np.percentile(dem[m], 30)  # DSM ist über Wasser flach
    cover[water] = C["wasser"]
    cover[(~water) & (cover == C["wasser"])] = C["wiese"]

    ground_pre = ground.copy()
    # Seegrund absenken
    dist_in = ndimage.distance_transform_edt(water)
    depth = np.clip(1.5 + dist_in * 3.0, 0, 30)
    ground = np.where(water, level - depth, ground)
    # Uferzellen (Land direkt am Wasser) über den Spiegel heben -> saubere Uferlinie
    near_level = ndimage.maximum_filter(level, size=5)
    shore = (~water) & (near_level > 0)
    ground = np.where(shore, np.maximum(ground, near_level + 0.8), ground)
    if els:
        ground = smooth_shore(ground, water, level, shore_sd)

    # --- Fließgewässer: Linien aus OSM, Spiegel fällt stromab, Bett eingetieft --
    rivers, riverside = [], np.zeros_like(water)
    if els:
        rivers, riverside = carve_rivers(els, proj, ground, ground_pre, water, level, cover, cell, nx, nz)

    # Hangneigung (echte Meter)
    gz, gx = np.gradient(ground, cell)
    slope = np.degrees(np.arctan(np.hypot(gx, gz)))
    rock = (slope > 26) & (cover != C["wasser"]) & (cover != C["wald"]) & ~riverside
    cover[rock] = C["fels"]

    # Heide, Moor (Hohes Venn), Steinbrüche
    open_land = np.isin(cover, [C["wiese"], C["acker"], C["heide"], C["moor"], C["fels"]])
    if els:
        # Lockerer Baumbestand (WorldCover-Wald < 60 %) zählt in Heide/Moor als Offenland
        sparse = open_land | ((cover == C["wald"]) & (frac[C["wald"]] < 0.6))
        heath = osm.rasterize(osm.polygons(els, proj, lambda t: t.get("natural") == "heath"), nx, nz, cell)
        bog = osm.rasterize(osm.polygons(els, proj, lambda t: t.get("natural") in ("wetland", "bog", "moor")),
                            nx, nz, cell)
        quarry = osm.rasterize(osm.polygons(els, proj, lambda t: t.get("landuse") == "quarry"), nx, nz, cell)
        cover[(heath >= 0.5) & sparse] = C["heide"]
        cover[(bog >= 0.5) & sparse] = C["moor"]
        cover[(quarry >= 0.5) & (cover != C["wasser"])] = C["fels"]
        print(f"OSM-Flächen: Heide {int((heath >= 0.5).sum())}, Moor {int((bog >= 0.5).sum())}, "
              f"Steinbruch {int((quarry >= 0.5).sum())} Zellen")
    else:
        LON, LAT = np.meshgrid(lons, lats)
        for reg in REGIONS:
            m = ((LON >= reg["lon"][0]) & (LON <= reg["lon"][1]) & (LAT >= reg["lat"][0]) &
                 (LAT <= reg["lat"][1]) & (ground >= reg["minHeight"]) & open_land)
            cover[m] = C[reg["terrain"]]

    # --- Hex-Gitter (pointy-top, odd-r) -------------------------------------
    R = meta["hexSize"]
    hw, vs = math.sqrt(3) * R, 1.5 * R
    cols = int((nx * cell - hw * 0.5) // hw)
    rows = int((nz * cell - R * 0.5) // vs)
    hexes = np.zeros((rows, cols), np.uint8)
    XS = (np.arange(nx) + 0.5) * cell
    ZS = (np.arange(nz) + 0.5) * cell
    cover_to_hex = {C["wasser"]: H["wasser"], C["wiese"]: H["wiese"], C["acker"]: H["wiese"],
                    C["wald"]: H["wald"], C["heide"]: H["heide"], C["moor"]: H["moor"],
                    C["fels"]: H["stein"], C["siedlung"]: H["siedlung"]}
    rr = int(math.ceil(R / cell)) + 1
    for r in range(rows):
        for q in range(cols):
            cx = hw * (q + 0.5 + 0.5 * (r & 1))
            cz = R + vs * r
            i0, j0 = int(cx // cell), int(cz // cell)
            i_lo, i_hi = max(0, i0 - rr), min(nx, i0 + rr + 1)
            j_lo, j_hi = max(0, j0 - rr), min(nz, j0 + rr + 1)
            dx = XS[i_lo:i_hi][None, :] - cx
            dz = ZS[j_lo:j_hi][:, None] - cz
            inside = (dx * dx + dz * dz) <= (0.85 * R) ** 2
            c = cover[j_lo:j_hi, i_lo:i_hi][inside]
            sl = slope[j_lo:j_hi, i_lo:i_hi][inside]
            if c.size == 0:
                continue
            counts = np.bincount(c, minlength=len(COVER)) / c.size
            if counts[C["wasser"]] >= 0.5:
                t = H["wasser"]
            elif counts[C["siedlung"]] >= 0.35:
                t = H["siedlung"]
            elif counts[C["fels"]] >= 0.3 or np.mean(sl) > 22:
                t = H["stein"]
            else:
                counts[C["wasser"]] = 0
                counts[C["wiese"]] += counts[C["acker"]]
                counts[C["acker"]] = 0
                t = cover_to_hex[int(counts.argmax())]
            hexes[r, q] = t

    # --- Orte ---------------------------------------------------------------
    if els:
        places = osm.places(els, proj, nx * cell, nz * cell)
        places += water_labels(lakes, lake_id, water, rivers, cell)
    else:
        with open(os.path.join(HERE, "places.json"), encoding="utf-8") as f:
            places_in = json.load(f)
        places = []
        for p in places_in:
            x, z = proj.xz(p["lon"], p["lat"])
            if 0 <= x < nx * cell and 0 <= z < nz * cell:
                places.append({"name": p["name"], "kind": p["kind"], "x": round(x, 1), "z": round(z, 1)})

    # --- Schreiben ----------------------------------------------------------
    out = os.path.join(ROOT, "public", "maps", meta["id"])
    os.makedirs(out, exist_ok=True)
    h_dm = np.clip(np.round(ground * 10), 0, 65535).astype("<u2")
    w_dm = np.where(water, np.clip(np.round(level * 10), 1, 65535), 0).astype("<u2")
    h_dm.tofile(os.path.join(out, "height.bin"))
    cover.astype(np.uint8).tofile(os.path.join(out, "cover.bin"))
    w_dm.tofile(os.path.join(out, "water.bin"))
    hexes.tofile(os.path.join(out, "hex.bin"))
    with open(os.path.join(out, "lakes.json"), "w", encoding="utf-8") as f:
        json.dump(lake_shapes(lakes, lake_id, level, water, nx * cell, nz * cell), f,
                  ensure_ascii=False, separators=(",", ":"))
    with open(os.path.join(out, "rivers.json"), "w", encoding="utf-8") as f:
        json.dump(rivers, f, ensure_ascii=False, separators=(",", ":"))
    info = {
        "id": meta["id"], "name": meta["name"], "bbox": meta["bbox"],
        "cell": cell, "width": nx, "height": nz,
        "heightMin": float(ground.min()), "heightMax": float(ground.max()),
        "exaggeration": meta["exaggeration"],
        "cover": COVER,
        "hex": {"size": R, "cols": cols, "rows": rows, "layout": "pointy-odd-r", "terrain": HEX_TERRAIN},
        "places": places,
        "credits": [
            "Höhendaten: Copernicus GLO-30 DEM © DLR e.V. 2010–2014 und © Airbus Defence and Space GmbH 2014–2018, bereitgestellt unter COPERNICUS durch die Europäische Union und ESA",
            "Landbedeckung: ESA WorldCover 2021 (v200), © ESA, CC BY 4.0",
        ] + (["Kartendaten © OpenStreetMap-Mitwirkende (ODbL)"] if els else []),
    }
    with open(os.path.join(out, "map.json"), "w", encoding="utf-8") as f:
        json.dump(info, f, ensure_ascii=False, indent=1)

    hc = np.bincount(hexes.ravel(), minlength=len(HEX_TERRAIN))
    print(f"Hex-Gitter {cols}×{rows} = {cols*rows} Hexe:",
          ", ".join(f"{HEX_TERRAIN[i]} {hc[i]}" for i in range(len(HEX_TERRAIN))))
    print(f"Höhe {ground.min():.0f}–{ground.max():.0f} m, Orte: {len(places)}, "
          f"Fließgewässer: {len(rivers)}, Ausgabe: {out}")

    if args.preview:
        preview(args.preview, ground, cover, water, cell)


def smooth_shore(ground, water, level, sd):
    """Uferzellen im Wasser so tief legen, dass die Wasserlinie (linear zwischen den Rasterpunkten)
    auf der echten OSM-Uferkante liegt statt auf der Zellgrenze -> keine Treppen am Seeufer."""
    req = np.zeros_like(ground)
    cnt = np.zeros_like(ground)
    for dj, di in ((0, 1), (0, -1), (1, 0), (-1, 0)):
        g_nb = np.roll(ground, (dj, di), axis=(0, 1))
        sd_nb = np.roll(sd, (dj, di), axis=(0, 1))
        land_nb = ~np.roll(water, (dj, di), axis=(0, 1))
        m = water & land_nb
        need = (g_nb - level) * (-sd) / np.maximum(sd_nb, 3.0)
        req[m] += need[m]
        cnt[m] += 1
    edge = cnt > 0
    depth = np.clip(req / np.maximum(cnt, 1), 0.3, 30.0)
    return np.where(edge, level - depth, ground)


def monotone_decreasing(y):
    """Isotone Regression (Pool Adjacent Violators): bestangepasste fallende Folge."""
    vals, wts, cnt = [], [], []
    for v in np.asarray(y, np.float64):
        vals.append(v); wts.append(1.0); cnt.append(1)
        while len(vals) > 1 and vals[-2] < vals[-1]:
            w = wts[-2] + wts[-1]
            vals[-2] = (vals[-2] * wts[-2] + vals[-1] * wts[-1]) / w
            wts[-2] = w; cnt[-2] += cnt[-1]
            vals.pop(); wts.pop(); cnt.pop()
    return np.repeat(vals, cnt).astype(np.float32)


def carve_rivers(els, proj, ground, ground_pre, water, level, cover, cell, nx, nz):
    """Fluss-Ketten aus OSM: Spiegel je Punkt bestimmen, Bett ins Gelände graben.

    Ändert ground und cover in place, liefert die Linien für rivers.json.
    """
    sx, sz = nx * cell, nz * cell
    low = ndimage.minimum_filter(ground_pre, size=3)  # Talsohle statt Hangkante
    out, carve = [], {k: [] for k in CHANNEL}
    for ch in osm.waterways(els, proj):
        allp = np.array(osm.densify(ch["pts"], 10.0), np.float32)
        inside = (allp[:, 0] >= 0) & (allp[:, 0] < sx) & (allp[:, 1] >= 0) & (allp[:, 1] < sz)
        # Kartenrand: jedes Stück innerhalb der Karte einzeln behandeln
        runs = np.split(np.flatnonzero(inside), np.flatnonzero(np.diff(np.flatnonzero(inside)) > 1) + 1)
        for run in runs:
            if len(run) >= 2:
                river_run(ch, allp[run], low, water, level, cell, nx, nz, carve, out)
    return out, finish_carving(carve, ground, water, cover, cell, nx, nz)


def river_run(ch, pts, low, water, level, cell, nx, nz, carve, out):
    """Ein Stück einer Fluss-Kette innerhalb der Karte: Spiegel bestimmen, in Teile ohne Seen zerlegen."""
    fi, fj = pts[:, 0] / cell - 0.5, pts[:, 1] / cell - 0.5
    lv = ndimage.map_coordinates(low, [fj, fi], order=1, mode="nearest")
    ci = np.clip(fi.round().astype(int), 0, nx - 1)
    cj = np.clip(fj.round().astype(int), 0, nz - 1)
    in_lake = water[cj, ci]
    # Wasser fließt nie bergauf: monotone Ausgleichskurve (robust gegen DEM-Senken).
    # Stromauf eines durchflossenen Sees liegt der Spiegel nie unter dem Seespiegel.
    above = np.maximum.accumulate(np.where(in_lake, level[cj, ci], 0)[::-1])[::-1]
    lv = np.maximum(monotone_decreasing(lv), above)
    keep = ~in_lake
    # In zusammenhängende Stücke außerhalb der Seen zerlegen
    idx = np.flatnonzero(keep)
    if idx.size == 0:
        return
    breaks = np.flatnonzero(np.diff(idx) > 1)
    for part in np.split(idx, breaks + 1):
        # ein Punkt in den See hinein, damit das Band die Uferlinie erreicht
        a, b = part[0], part[-1]
        if a > 0 and in_lake[a - 1]:
            a -= 1
        if b < len(pts) - 1 and in_lake[b + 1]:
            b += 1
        seg = slice(a, b + 1)
        p, l = pts[seg], lv[seg]
        length = float(np.hypot(*np.diff(p, axis=0).T).sum()) if len(p) > 1 else 0.0
        if length < (60 if ch["kind"] != "stream" else 150):
            continue
        carve[ch["kind"]].append((p, l, ch["width"]))
        ds = np.r_[0, np.cumsum(np.hypot(*np.diff(p, axis=0).T))]
        # Ausgabe ausgedünnt (~20 m), Endpunkt immer
        sel = np.unique(np.r_[np.searchsorted(ds, np.arange(0, ds[-1], 20.0)), len(p) - 1])
        flat = np.column_stack([p[sel], l[sel]]).round(1).ravel().tolist()
        out.append({"n": ch["name"], "k": osm.KIND_ID[ch["kind"]], "w": round(ch["width"], 1), "p": flat})


def finish_carving(carve, ground, water, cover, cell, nx, nz):
    """Bett eingraben: je Linienart nächster Punkt, Spiegel - Tiefe + Uferneigung * Abstand.

    Ändert ground und cover in place, liefert die Maske der Ufer-Zellen.
    """
    riverside = np.zeros_like(water)
    gx, gz = np.meshgrid((np.arange(nx) + 0.5) * cell, (np.arange(nz) + 0.5) * cell)
    cells = np.column_stack([gx.ravel(), gz.ravel()])
    for kind, items in carve.items():
        if not items:
            continue
        depth, bank, reach = CHANNEL[kind]
        P = np.concatenate([p for p, _, _ in items])
        L = np.concatenate([l for _, l, _ in items])
        Wd = np.concatenate([np.full(len(p), w / 2) for p, _, w in items])
        d, k = cKDTree(P).query(cells, distance_upper_bound=reach)
        ok = np.isfinite(d)
        d, k = d[ok], k[ok]
        target = L[k] - depth + bank * np.maximum(0.0, d - Wd[k])
        flat_idx = np.flatnonzero(ok)
        g = ground.ravel()
        land = ~water.ravel()[flat_idx]
        g[flat_idx[land]] = np.minimum(g[flat_idx[land]], target[land])
        riverside.ravel()[flat_idx[land & (d < Wd[k] + 45)]] = True
        if kind != "stream":  # Flussbett: kein Wald, keine Häuser
            bed = flat_idx[land & (d < Wd[k] + 6)]
            cover.ravel()[bed] = C["wasser"]
    print("Fließgewässer: " + ", ".join(f"{k} {len(v)} Stücke" for k, v in carve.items()))
    return riverside


def lake_shapes(lakes, lake_id, level, water, sx, sz):
    """Seen-Polygone (auf die Karte zugeschnitten, vereinfacht) mit ihrem Spiegel für den Viewer."""
    from shapely.geometry import Polygon, box
    from shapely.validation import make_valid
    out = []
    frame = box(0, 0, sx, sz)
    for i in np.unique(lake_id[water]):
        tags, outer, inner = lakes[i - 1]
        lv = float(np.median(level[lake_id == i]))
        geom = None
        for r in outer:
            g = Polygon(r)
            geom = g if geom is None else geom.union(make_valid(g))
        for r in inner:
            geom = make_valid(geom).difference(make_valid(Polygon(r)))
        geom = make_valid(geom).intersection(frame).simplify(2.0)
        polys = getattr(geom, "geoms", [geom])
        for pg in polys:
            if pg.geom_type != "Polygon" or pg.area < 900:
                continue
            ring = lambda c: [round(v, 1) for xy in list(c.coords)[:-1] for v in xy]  # noqa: E731
            out.append({"n": tags.get("name", ""), "l": round(lv, 2), "o": ring(pg.exterior),
                        "h": [ring(h) for h in pg.interiors]})
    return out


def water_labels(lakes, lake_id, water, rivers, cell):
    """Namen großer Seen (an der Stelle mit größtem Uferabstand) und Flüsse (Mitte des längsten Stücks)."""
    labels = []
    for i in np.unique(lake_id[water]):
        tags = lakes[i - 1][0]
        m = lake_id == i
        if not tags.get("name") or m.sum() < 60:
            continue
        dt = ndimage.distance_transform_edt(m)
        j, k = np.unravel_index(dt.argmax(), dt.shape)
        labels.append({"name": tags["name"], "kind": "gewaesser",
                       "x": round((k + 0.5) * cell, 1), "z": round((j + 0.5) * cell, 1)})
    best = {}
    for r in rivers:
        if r["k"] != 0 or not r["n"]:
            continue
        if len(r["p"]) > len(best.get(r["n"], {"p": []})["p"]):
            best[r["n"]] = r
    for name, r in best.items():
        m = (len(r["p"]) // 3) // 2 * 3
        labels.append({"name": name, "kind": "gewaesser", "x": r["p"][m], "z": r["p"][m + 1]})
    return labels


def preview(path, ground, cover, water, cell):
    from PIL import Image
    pal = np.array([[70, 120, 170], [120, 170, 80], [200, 180, 100], [40, 90, 45],
                    [150, 110, 140], [140, 130, 90], [150, 150, 150], [210, 200, 190]], np.float32)
    gz, gx = np.gradient(ground * 2.5, cell)
    shade = np.clip(0.75 + (-gx * 0.6 - gz * 0.6) / np.sqrt(1 + gx * gx + gz * gz) * 0.6, 0.35, 1.3)
    img = pal[cover] * shade[..., None]
    Image.fromarray(np.clip(img, 0, 255).astype(np.uint8)).save(path)
    print("Vorschau:", path)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--preview", help="PNG mit Hillshade + Bedeckung schreiben")
    build(ap.parse_args())
