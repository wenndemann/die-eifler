#!/usr/bin/env python3
"""Konverter: echte Geodaten -> Spielkarte (public/maps/<name>/).

Quellen (in tools/map/raw/, siehe tools/map/README.md):
  - Copernicus GLO-30 DEM  (Höhe, 30 m, DSM – enthält Baumkronen, wird korrigiert)
  - ESA WorldCover 2021    (Landbedeckung, 10 m)
  - places.json            (Orte; Näherungswerte, später aus OSM)

Ausgabe:
  map.json     Metadaten, Orte, Gelände-Typen, Credits
  height.bin   Uint16, Höhe in Dezimetern pro Rasterzelle (Zeilen von Nord nach Süd)
  cover.bin    Uint8, Bedeckungsklasse pro Rasterzelle (für die Optik)
  water.bin    Uint16, Wasserspiegel in Dezimetern (0 = kein Wasser)
  hex.bin      Uint8, Gelände-Typ pro Hex (Spiellogik), odd-r-Offset, Zeile für Zeile

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

# Näherungsweise Regionen, bis OSM-Daten (natural=heath/wetland) verfügbar sind
REGIONS = [
    # Hohes Venn (Moor) bei Mützenich: Grünland auf der Hochfläche wird Moor
    {"terrain": "moor", "lon": [6.17, 6.235], "lat": [50.545, 50.62], "minHeight": 560},
    # Dreiborner Hochfläche (Heide, ehem. Truppenübungsplatz)
    {"terrain": "heide", "lon": [6.395, 6.47], "lat": [50.555, 50.60], "minHeight": 450},
]

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
    water = frac[C["wasser"]] >= 0.4
    cover[water] = C["wasser"]
    cover[(~water) & (cover == C["wasser"])] = C["wiese"]

    # --- Höhe: DSM -> Gelände ------------------------------------------------
    dem = sample(os.path.join(raw, "cop_N50_E006.tif"), meta["bbox"], lons, lats, 1)
    forest = ndimage.gaussian_filter(frac[C["wald"]], 1.5)
    ground = dem - CANOPY * np.clip(forest * 1.2, 0, 1)
    ground = ndimage.gaussian_filter(ground, 0.8)

    # Kleine Wasserflecken entfernen, Seen vs. Flüsse
    lab, n = ndimage.label(water)
    sizes = ndimage.sum(water, lab, range(1, n + 1))
    level = np.zeros_like(ground)
    for i, size in enumerate(sizes, start=1):
        m = lab == i
        if size < 8:
            water[m] = False
            cover[m] = C["wiese"]
            continue
        if size > 300:  # See / Talsperre: ebener Spiegel (DSM ist über Wasser flach)
            level[m] = np.percentile(dem[m], 30)
    river = water & (level == 0)
    if river.any():
        lv = ndimage.minimum_filter(np.where(river, dem, 1e4), size=3)
        level[river] = ndimage.gaussian_filter(np.where(river, lv, 0), 1)[river] / np.maximum(
            ndimage.gaussian_filter(river.astype(np.float32), 1)[river], 1e-3)
    # Ufer: Gelände nahe dem Wasser nicht unter den Spiegel fallen lassen, Seegrund absenken
    dist_in = ndimage.distance_transform_edt(water)
    depth = np.clip(1.5 + dist_in * 3.0, 0, 30)
    ground = np.where(water, level - depth, ground)
    # Uferzellen (Land direkt am Wasser) über den Spiegel heben -> saubere Uferlinie
    near_level = ndimage.maximum_filter(level, size=5)
    shore = (~water) & (near_level > 0)
    ground = np.where(shore, np.maximum(ground, near_level + 0.8), ground)

    # Hangneigung (echte Meter)
    gz, gx = np.gradient(ground, cell)
    slope = np.degrees(np.arctan(np.hypot(gx, gz)))
    rock = (slope > 26) & (cover != C["wasser"]) & (cover != C["wald"])
    cover[rock] = C["fels"]

    # Regionen (Heide, Moor) – nur Offenland
    LON, LAT = np.meshgrid(lons, lats)
    open_land = np.isin(cover, [C["wiese"], C["acker"], C["heide"], C["moor"]])
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
    with open(os.path.join(HERE, "places.json"), encoding="utf-8") as f:
        places_in = json.load(f)
    places = []
    lon0, lat1 = meta["bbox"][0], meta["bbox"][3]
    for p in places_in:
        x = (p["lon"] - lon0) * m_lon
        z = (lat1 - p["lat"]) * m_lat
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
        ],
    }
    with open(os.path.join(out, "map.json"), "w", encoding="utf-8") as f:
        json.dump(info, f, ensure_ascii=False, indent=1)

    hc = np.bincount(hexes.ravel(), minlength=len(HEX_TERRAIN))
    print(f"Hex-Gitter {cols}×{rows} = {cols*rows} Hexe:",
          ", ".join(f"{HEX_TERRAIN[i]} {hc[i]}" for i in range(len(HEX_TERRAIN))))
    print(f"Höhe {ground.min():.0f}–{ground.max():.0f} m, Orte: {len(places)}, Ausgabe: {out}")

    if args.preview:
        preview(args.preview, ground, cover, water, cell)


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
