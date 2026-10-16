"""Stufe 3: OpenStreetMap für das Gebiet laden und auswerten.

Zwei Wege zum selben Ergebnis (Elementliste im Format von Overpass `out geom`):
  - Geofabrik-Länderauszüge (*.osm.pbf) per pyosmium filtern und zuschneiden,
  - Overpass in Blöcken von ~12 km.
Die Auswertung (Flächen, Fluss-Ketten, Orte) arbeitet in Weltmetern (UTM) und stammt aus osm.py.
Kartendaten © OpenStreetMap-Mitwirkende, ODbL.
"""
import gzip
import hashlib
import json
import math
import os
import time
import urllib.parse
import urllib.request

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage

import welt
from util import Fortschritt, atomar_schreiben, json_lesen

CREDIT = "Kartendaten © OpenStreetMap-Mitwirkende (ODbL)"

ENDPOINTS = [
    "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
]
BLOCK = 12000.0

GEOFABRIK = "https://download.geofabrik.de/{pfad}-latest.osm.pbf"
# Länderauszüge mit grober Ausdehnung (lon0, lat0, lon1, lat1)
AUSZUEGE = [
    ("europe/germany/nordrhein-westfalen/koeln-regbez", (5.8, 50.2, 8.0, 51.2)),
    ("europe/germany/rheinland-pfalz", (6.1, 48.9, 8.6, 50.95)),
    ("europe/belgium", (2.5, 49.4, 6.5, 51.6)),
    ("europe/luxembourg", (5.7, 49.4, 6.6, 50.2)),
    ("europe/netherlands/limburg", (5.4, 50.7, 6.2, 51.8)),
]

WATER_SKIP = {"river", "stream", "canal", "ditch", "drain", "wastewater"}
PLACE_KIND = {"city": "stadt", "town": "stadt", "village": "dorf", "hamlet": "weiler"}
RIVER_WIDTH = {"Rur": 16.0, "Urft": 11.0, "Olef": 8.0}
DEFAULT_WIDTH = {"river": 8.0, "canal": 4.0, "stream": 3.0}
WIDTH_MIN = {"river": 6.0, "canal": 3.0, "stream": 2.5}
KIND_ID = {"river": 0, "stream": 1, "canal": 2}
SS = 4


# ============================================================ Laden: Overpass
def bahn_abfrage(b):
    s_, w, n, e = b[1], b[0], b[3], b[2]
    return f"""[out:json][timeout:240];
way["railway"~"^(rail|light_rail|narrow_gauge)$"]({s_:.5f},{w:.5f},{n:.5f},{e:.5f});
out geom;"""


def overpass_abfrage(b, art="welt"):
    if art == "wege":
        return wege_abfrage(b)
    if art == "bahn":
        return bahn_abfrage(b)
    s, w, n, e = b[1], b[0], b[3], b[2]
    bb = f"({s:.5f},{w:.5f},{n:.5f},{e:.5f})"
    return f"""[out:json][timeout:240];
(
  way["natural"="water"]{bb};
  relation["natural"="water"]{bb};
  way["waterway"~"^(river|stream|canal|dam|weir)$"]{bb};
  way["landuse"="reservoir"]{bb};
  relation["landuse"="reservoir"]{bb};
  way["natural"="heath"]{bb};
  relation["natural"="heath"]{bb};
  way["natural"~"^(wetland|bog|moor)$"]{bb};
  relation["natural"~"^(wetland|bog|moor)$"]{bb};
  way["landuse"="quarry"]{bb};
  relation["landuse"="quarry"]{bb};
  node["place"~"^(city|town|village|hamlet)$"]["name"]{bb};
  way["boundary"="administrative"]["admin_level"="2"]{bb};
);
out geom;"""


def wege_abfrage(b):
    """Große Wanderrouten (iwn/nwn/rwn) samt übergeordneter Routen (Etappen -> Hauptroute)."""
    s_, w, n, e = b[1], b[0], b[3], b[2]
    bb = f"({s_:.5f},{w:.5f},{n:.5f},{e:.5f})"
    return f"""[out:json][timeout:240];
relation["route"="hiking"]["network"~"^(iwn|nwn|rwn)$"]{bb}->.r;
(.r; rel(br.r)["route"="hiking"];);
out geom;"""


def overpass_bloecke(kacheln):
    """Blöcke von höchstens ~12 km als (lon0, lat0, lon1, lat1)."""
    xs = [k[0] for k in kacheln]
    zs = [k[1] for k in kacheln]
    x0, x1 = min(xs) * welt.KACHEL, (max(xs) + 1) * welt.KACHEL
    z0, z1 = min(zs) * welt.KACHEL, (max(zs) + 1) * welt.KACHEL
    nx, nz = math.ceil((x1 - x0) / BLOCK), math.ceil((z1 - z0) / BLOCK)
    out = []
    ks = set(kacheln)
    for j in range(nz):
        for i in range(nx):
            bx0, bx1 = x0 + (x1 - x0) * i / nx, x0 + (x1 - x0) * (i + 1) / nx
            bz0, bz1 = z0 + (z1 - z0) * j / nz, z0 + (z1 - z0) * (j + 1) / nz
            # Block nur, wenn er eine Kachel des Gebiets berührt
            if not any((tx, tz) in ks for tx in range(int(bx0 // welt.KACHEL), int((bx1 - 1) // welt.KACHEL) + 1)
                       for tz in range(int(bz0 // welt.KACHEL), int((bz1 - 1) // welt.KACHEL) + 1)):
                continue
            pad = 600.0  # Rand, damit Linien über die Blockkante hinweg vollständig sind
            xs_ = [bx0 - pad, bx1 + pad, bx0 - pad, bx1 + pad, (bx0 + bx1) / 2, (bx0 + bx1) / 2]
            zs_ = [bz0 - pad, bz0 - pad, bz1 + pad, bz1 + pad, bz0 - pad, bz1 + pad]
            lon, lat = welt.xz_zu_lonlat(xs_, zs_)
            out.append((float(lon.min()), float(lat.min()), float(lon.max()), float(lat.max())))
    return out


def lade_overpass(kacheln, arbeit, endpunkte=None, art="welt"):
    bloecke = overpass_bloecke(kacheln)
    odir = os.path.join(arbeit, "osm_roh")
    os.makedirs(odir, exist_ok=True)
    elems = {}
    fp = Fortschritt({"welt": "OSM Overpass", "wege": "OSM Wanderwege", "bahn": "OSM Bahn"}[art], len(bloecke))
    for b in bloecke:
        h = hashlib.sha1(repr([round(v, 4) for v in b]).encode()).hexdigest()[:10]
        cache = os.path.join(odir, f"overpass_{h}.json.gz" if art == "welt" else f"overpass_{art}_{h}.json.gz")
        js = None
        if os.path.exists(cache):
            try:
                with gzip.open(cache, "rt", encoding="utf-8") as f:
                    js = json.load(f)
            except (OSError, ValueError):
                js = None
        if js is None:
            js = _overpass_block(b, endpunkte or ENDPOINTS, fp, art=art)
            atomar_schreiben(cache, gzip.compress(json.dumps(js).encode("utf-8"), mtime=0))
        for e in js["elements"]:
            elems[(e["type"], e["id"])] = e
        fp.schritt(f"Block {b[0]:.2f},{b[1]:.2f}")
    return list(elems.values())


def _overpass_block(b, endpunkte, fp, tiefe=0, art="welt"):
    """Ein Block; scheitert er überall (Zeitüberschreitung bei dichten Gebieten), wird er geviertelt."""
    try:
        return _overpass_holen(b, endpunkte, fp, versuche=3 if tiefe < 2 else 6, art=art)
    except SystemExit:
        if tiefe >= 2:
            raise
        print("  Block zu groß für Overpass, teile ihn", flush=True)
        mx, my = (b[0] + b[2]) / 2, (b[1] + b[3]) / 2
        elems = {}
        for sub in ((b[0], b[1], mx, my), (mx, b[1], b[2], my), (b[0], my, mx, b[3]), (mx, my, b[2], b[3])):
            for e in _overpass_block(sub, endpunkte, fp, tiefe + 1, art)["elements"]:
                elems[(e["type"], e["id"])] = e
        return {"elements": list(elems.values())}


def _overpass_holen(b, endpunkte, fp, versuche=6, art="welt"):
    data = urllib.parse.urlencode({"data": overpass_abfrage(b, art)}).encode()
    letzter = ""
    for versuch in range(versuche):
        for ep in endpunkte:
            try:
                req = urllib.request.Request(ep, data=data, headers={"User-Agent": "die-eifeler-mapbuild/1.0"})
                with urllib.request.urlopen(req, timeout=300) as r:
                    body = r.read()
                fp.laden(len(body))
                js = json.loads(body)
                if "remark" in js and not js.get("elements"):
                    raise RuntimeError(js["remark"])
                return js
            except Exception as ex:  # noqa: BLE001
                letzter = f"{ep}: {str(ex)[:100]}"
                print("  Overpass:", letzter, flush=True)
        time.sleep(10 * (versuch + 1))
    raise SystemExit(f"Keine Overpass-Instanz erreichbar ({letzter}).")


# ============================================================ Laden: Geofabrik / pyosmium
def passt(tags):
    """Gleiche Auswahl wie die Overpass-Abfrage (ohne Orte)."""
    g = tags.get
    return (g("natural") in ("water", "heath", "wetland", "bog", "moor")
            or g("waterway") in ("river", "stream", "canal", "dam", "weir")
            or g("landuse") in ("reservoir", "quarry")
            or g("railway") in BAHN
            or (g("boundary") == "administrative" and g("admin_level") == "2"))


WEGE_NETZE = ("iwn", "nwn", "rwn")
BAHN = ("rail", "light_rail", "narrow_gauge")
REL_TAGS = [("route", "hiking")] + [("natural", v) for v in ("water", "heath", "wetland", "bog", "moor")] + \
           [("landuse", "reservoir"), ("landuse", "quarry")]


def pbf_filtern(pbf, bbox):
    """Eine *.osm.pbf nach den Overpass-Kriterien filtern und auf bbox (lon0,lat0,lon1,lat1) zuschneiden."""
    import osmium
    lon0, lat0, lon1, lat1 = bbox

    def innen(geom):
        return any(lon0 <= p["lon"] <= lon1 and lat0 <= p["lat"] <= lat1 for p in geom)

    # Durchgang 1: Relationen (Seen u. a. als Multipolygon) und ihre Wege
    rels, need = {}, set()
    for r in osmium.FileProcessor(pbf, osmium.osm.RELATION).with_filter(osmium.filter.TagFilter(*REL_TAGS)):
        tags = {t.k: t.v for t in r.tags}
        wanderweg = tags.get("route") == "hiking" and (tags.get("network") in WEGE_NETZE or tags.get("type") == "superroute")
        if not wanderweg and tags.get("type") not in ("multipolygon", "boundary"):
            continue
        if tags.get("route") == "hiking" and not wanderweg:
            continue
        mem = [(m.ref, m.role) for m in r.members if m.type == "w"]
        rels[r.id] = (tags, mem, [(m.ref, m.role) for m in r.members if m.type == "r"] if wanderweg else [])
        need.update(ref for ref, _ in mem)
    # Durchgang 2: Wege mit Knotenpositionen
    ways, member_geom = [], {}
    fp = osmium.FileProcessor(pbf, osmium.osm.NODE | osmium.osm.WAY).with_locations() \
        .with_filter(osmium.filter.EntityFilter(osmium.osm.WAY))
    for w in fp:
        tags = {t.k: t.v for t in w.tags} if len(w.tags) else {}
        gewollt = bool(tags) and passt(tags)
        if not gewollt and w.id not in need:
            continue
        geom = [{"lat": n.lat, "lon": n.lon} for n in w.nodes if n.location.valid()]
        if len(geom) < 2:
            continue
        if w.id in need:
            member_geom[w.id] = geom
        if gewollt and innen(geom):
            ways.append({"type": "way", "id": w.id, "tags": tags, "geometry": geom})
    elems = list(ways)
    for rid, (tags, mem, sub) in rels.items():
        ms = [{"type": "way", "ref": ref, "role": role, "geometry": member_geom[ref]}
              for ref, role in mem if ref in member_geom]
        ms += [{"type": "relation", "ref": ref, "role": role} for ref, role in sub]
        if (ms and any(innen(m["geometry"]) for m in ms if "geometry" in m)) or (sub and not mem):
            elems.append({"type": "relation", "id": rid, "tags": tags, "members": ms})
    # Durchgang 3: Orte
    ortetags = [("place", p) for p in PLACE_KIND]
    for n in osmium.FileProcessor(pbf, osmium.osm.NODE).with_filter(osmium.filter.TagFilter(*ortetags)):
        tags = {t.k: t.v for t in n.tags}
        if tags.get("name") and n.location.valid() and lon0 <= n.location.lon <= lon1 and lat0 <= n.location.lat <= lat1:
            elems.append({"type": "node", "id": n.id, "lat": n.location.lat, "lon": n.location.lon, "tags": tags})
    return elems


def lade_geofabrik(kacheln, arbeit, fp_mb=None):
    """Länderauszüge laden (ungetestet gegen den echten Host, siehe README), filtern, zuschneiden."""
    bbox = welt.gebiet_lonlat(kacheln, pad=800)
    elems = {}
    zdir = os.path.join(arbeit, "roh", "osm")
    os.makedirs(zdir, exist_ok=True)
    wahl = [(p, b) for p, b in AUSZUEGE if not (b[2] < bbox[0] or b[0] > bbox[2] or b[3] < bbox[1] or b[1] > bbox[3])]
    print(f"Geofabrik: {len(wahl)} Auszüge: {', '.join(p.split('/')[-1] for p, _ in wahl)}")
    for pfad, _ in wahl:
        name = pfad.replace("/", "_")
        pbf = os.path.join(zdir, name + ".osm.pbf")
        cache = os.path.join(arbeit, "osm_roh", f"geofabrik_{name}_{hashlib.sha1(repr([round(v, 3) for v in bbox]).encode()).hexdigest()[:8]}.json.gz")
        if os.path.exists(cache):
            with gzip.open(cache, "rt", encoding="utf-8") as f:
                part = json.load(f)
        else:
            if not os.path.exists(pbf):
                _herunterladen(GEOFABRIK.format(pfad=pfad), pbf, fp_mb)
            t0 = time.time()
            part = pbf_filtern(pbf, bbox)
            print(f"  {name}: {len(part)} Elemente gefiltert in {time.time() - t0:.0f} s", flush=True)
            atomar_schreiben(cache, gzip.compress(json.dumps(part).encode("utf-8"), mtime=0))
            from util import Roh
            Roh.entsorgen(pbf)
        for e in part:
            elems[(e["type"], e["id"])] = e
    return list(elems.values())


def _herunterladen(url, ziel, fp_mb=None):
    print(f"  lade {url}", flush=True)
    req = urllib.request.Request(url, headers={"User-Agent": "die-eifeler-mapbuild/1.0"})
    with urllib.request.urlopen(req, timeout=60) as r, open(ziel + ".tmp", "wb") as f:
        n, t0 = 0, time.time()
        while True:
            b = r.read(1 << 20)
            if not b:
                break
            f.write(b)
            n += len(b)
            if fp_mb:
                fp_mb(len(b))
    os.replace(ziel + ".tmp", ziel)


def geofabrik_erreichbar():
    try:
        req = urllib.request.Request(GEOFABRIK.format(pfad=AUSZUEGE[3][0]), method="HEAD",
                                     headers={"User-Agent": "die-eifeler-mapbuild/1.0"})
        urllib.request.urlopen(req, timeout=15).close()
        return True
    except Exception:  # noqa: BLE001
        return False


def lade(kacheln, arbeit, modus="auto", endpunkte=None, fp=None):
    """Elementliste für das Gebiet (dedupliziert nach (type, id))."""
    if modus in ("auto", "geofabrik"):
        if modus == "geofabrik" or geofabrik_erreichbar():
            try:
                return lade_geofabrik(kacheln, arbeit, fp)
            except ImportError:
                if modus == "geofabrik":
                    raise SystemExit("pyosmium fehlt: pip install osmium")
                print("pyosmium fehlt, nehme Overpass")
            except Exception as ex:  # noqa: BLE001
                if modus == "geofabrik":
                    raise
                print(f"Geofabrik fehlgeschlagen ({str(ex)[:100]}), nehme Overpass")
        else:
            print("Geofabrik nicht erreichbar, nehme Overpass")
    return lade_overpass(kacheln, arbeit, endpunkte)


def lade_wege_overpass(kacheln, arbeit, endpunkte=None):
    """Nur für den Overpass-Weg nötig: Wanderrouten-Relationen (beim Geofabrik-Weg sind sie schon in lade())."""
    return lade_overpass(kacheln, arbeit, endpunkte, art="wege")


def lade_bahn_overpass(kacheln, arbeit, endpunkte=None):
    return lade_overpass(kacheln, arbeit, endpunkte, art="bahn")


# ============================================================ Auswertung (aus osm.py, Weltmeter)
def _key(p):
    return (round(p[0], 2), round(p[1], 2))


def _rings(lines):
    lines = [list(l) for l in lines if len(l) >= 2]
    rings = []
    while lines:
        cur = lines.pop()
        changed = True
        while _key(cur[0]) != _key(cur[-1]) and changed:
            changed = False
            for i, l in enumerate(lines):
                if _key(l[0]) == _key(cur[-1]):
                    cur += l[1:]
                elif _key(l[-1]) == _key(cur[-1]):
                    cur += l[::-1][1:]
                elif _key(l[-1]) == _key(cur[0]):
                    cur = l[:-1] + cur
                elif _key(l[0]) == _key(cur[0]):
                    cur = l[::-1][:-1] + cur
                else:
                    continue
                lines.pop(i)
                changed = True
                break
        if len(cur) >= 4 and _key(cur[0]) == _key(cur[-1]):
            rings.append(cur)
    return rings


def polygons(elements, proj, pred):
    """Flächen (geschlossene Wege, Multipolygone) mit passenden Tags: [(tags, outer_rings, inner_rings)]."""
    out = []
    for e in elements:
        t = e.get("tags", {})
        if not pred(t):
            continue
        if e["type"] == "way":
            g = proj.pts(e.get("geometry", []))
            if len(g) >= 4 and _key(g[0]) == _key(g[-1]):
                out.append((t, [g], []))
        elif e["type"] == "relation":
            outer = [proj.pts(m["geometry"]) for m in e.get("members", [])
                     if m["type"] == "way" and m.get("role") in ("outer", "") and "geometry" in m]
            inner = [proj.pts(m["geometry"]) for m in e.get("members", [])
                     if m["type"] == "way" and m.get("role") == "inner" and "geometry" in m]
            o = _rings(outer)
            if o:
                out.append((t, o, _rings(inner)))
    return out


def ring_flaeche(r):
    a = 0.0
    for (x0, z0), (x1, z1) in zip(r, r[1:]):
        a += x0 * z1 - x1 * z0
    return abs(a) / 2


def rasterize(polys, nx, nz, cell, ids=False):
    """Flächen rastern. ids=False: Anteil 0..1 je Zelle.
    ids=True: (Abstand zur Kante in m am Zellmittelpunkt, >0 außen; Index+1 je Zelle). Große Flächen zuerst."""
    W, Hh = nx * SS, nz * SS
    s = SS / cell
    mask = Image.new("L", (W, Hh), 0)
    dm = ImageDraw.Draw(mask)
    idimg = Image.new("I", (W, Hh), 0) if ids else None
    di = ImageDraw.Draw(idimg) if ids else None
    order = sorted(range(len(polys)), key=lambda i: -sum(ring_flaeche(r) for r in polys[i][1]))
    for i in order:
        _, outer, inner = polys[i]
        for r in outer:
            xy = [(x * s, z * s) for x, z in r]
            dm.polygon(xy, fill=255)
            if di:
                di.polygon(xy, fill=i + 1)
        for r in inner:
            xy = [(x * s, z * s) for x, z in r]
            dm.polygon(xy, fill=0)
            if di:
                di.polygon(xy, fill=0)
    hi = np.asarray(mask, np.uint8)
    if not ids:
        return hi.astype(np.float32).reshape(nz, SS, nx, SS).mean(axis=(1, 3)) / 255.0
    inside = hi > 127
    sd = (ndimage.distance_transform_edt(~inside) - ndimage.distance_transform_edt(inside)) * (cell / SS)
    m = SS // 2
    sd = sd.reshape(nz, SS, nx, SS)[:, m - 1:m + 1, :, m - 1:m + 1].mean(axis=(1, 3))
    idc = np.asarray(idimg, np.int32)[m::SS, m::SS][:nz, :nx]
    return sd.astype(np.float32), idc


def waterways(elements, proj):
    """Fluss-/Bach-/Kanal-Linien zu Ketten verbunden (Wegrichtung = Fließrichtung, Tunnel ausgelassen)."""
    segs = []
    for e in elements:
        t = e.get("tags", {})
        ww = t.get("waterway")
        if e["type"] != "way" or ww not in DEFAULT_WIDTH:
            continue
        if t.get("tunnel") in ("yes", "culvert") or t.get("location") == "underground":
            continue
        g = proj.pts(e.get("geometry", []))
        if len(g) < 2:
            continue
        name = t.get("name", "")
        w = RIVER_WIDTH.get(name, DEFAULT_WIDTH[ww]) if ww == "river" else DEFAULT_WIDTH[ww]
        try:
            w = max(float(t["width"].replace(",", ".").split()[0]), WIDTH_MIN[ww])
        except (KeyError, ValueError, IndexError):
            pass
        segs.append({"name": name, "kind": ww, "width": w, "pts": g})
    starts, ends = {}, {}
    for i, s in enumerate(segs):
        starts.setdefault(_key(s["pts"][0]), []).append(i)
        ends.setdefault(_key(s["pts"][-1]), []).append(i)
    used = [False] * len(segs)

    def nxt(i):
        s = segs[i]
        cand = [j for j in starts.get(_key(s["pts"][-1]), []) if not used[j]
                and segs[j]["kind"] == s["kind"] and segs[j]["name"] == s["name"]]
        return cand[0] if len(cand) == 1 else None

    def has_prev(i):
        s = segs[i]
        return any(segs[j]["kind"] == s["kind"] and segs[j]["name"] == s["name"]
                   for j in ends.get(_key(s["pts"][0]), []) if j != i)

    chains = []
    for i in sorted(range(len(segs)), key=has_prev):
        if used[i]:
            continue
        used[i] = True
        c = dict(segs[i])
        c["pts"] = list(c["pts"])
        j = nxt(i)
        while j is not None:
            used[j] = True
            c["pts"] += segs[j]["pts"][1:]
            c["width"] = max(c["width"], segs[j]["width"])
            j = nxt(j)
        chains.append(c)
    return chains


def densify(pts, step):
    p = np.asarray(pts, np.float64)
    d = np.hypot(*np.diff(p, axis=0).T)
    n = np.maximum(1, np.ceil(d / step).astype(int))
    out = [p[:1]]
    for k in range(len(d)):
        t = np.arange(1, n[k] + 1) / n[k]
        out.append(p[k] + (p[k + 1] - p[k]) * t[:, None])
    return np.concatenate(out)


def orte(elements, proj):
    """Benannte Orte (city/town/village/hamlet), Dubletten (gleicher Name <2 km) zusammengefasst.
    Liefert [{name, kind, art (city/town/..), x, z}]."""
    rank = {"stadt": 0, "dorf": 1, "weiler": 2}
    out = []
    for e in elements:
        t = e.get("tags", {})
        if e["type"] != "node" or t.get("place") not in PLACE_KIND or not t.get("name"):
            continue
        x, z = proj.xz(e["lon"], e["lat"])
        kind = PLACE_KIND[t["place"]]
        dup = next((p for p in out if p["name"] == t["name"] and math.hypot(p["x"] - x, p["z"] - z) < 2000), None)
        if dup:
            if rank[kind] < rank[dup["kind"]]:
                dup["kind"] = kind
            continue
        out.append({"name": t["name"], "kind": kind, "x": round(x, 1), "z": round(z, 1)})
    out.sort(key=lambda p: (rank[p["kind"]], p["name"], p["x"], p["z"]))
    return out


def grenzlinien(elements, proj):
    """Staatsgrenzen als Linienliste [[(x,z),...], ...] in Weltmetern."""
    out = []
    for e in elements:
        t = e.get("tags", {})
        if e["type"] == "way" and t.get("boundary") == "administrative" and t.get("admin_level") == "2":
            g = proj.pts(e.get("geometry", []))
            if len(g) >= 2:
                out.append(g)
    return out


def wanderwege(elements, proj, gebiet_box=None, mindestlaenge=1500.0, toleranz=10.0):
    """Große Wanderrouten: Etappen-Unterrelationen zur Hauptroute zusammenfassen, Wege zu Linien verketten,
    auf ~20 m vereinfachen (Toleranz 10 m), auf das Gebiet (shapely-Geometrie, Weltmeter) zuschneiden.
    Liefert [{n, ref, netz, p:[[x,z,...],...]}]."""
    from shapely.geometry import LineString
    rels = {e["id"]: e for e in elements if e["type"] == "relation" and e.get("tags", {}).get("route") == "hiking"}
    kinder = {m["ref"] for r in rels.values() for m in r.get("members", []) if m["type"] == "relation" and m["ref"] in rels}
    out = []
    for rid, r in rels.items():
        if rid in kinder:
            continue
        # alle Wege der Hauptroute samt Etappen einsammeln
        linien, gesehen, stack, netz = [], set(), [rid], r["tags"].get("network", "")
        while stack:
            cur = stack.pop()
            if cur in gesehen or cur not in rels:
                continue
            gesehen.add(cur)
            if not netz and rels[cur]["tags"].get("network") in WEGE_NETZE:
                netz = rels[cur]["tags"]["network"]
            for m in rels[cur].get("members", []):
                if m["type"] == "relation":
                    stack.append(m["ref"])
                elif m["type"] == "way" and m.get("geometry"):
                    g = proj.pts(m["geometry"])
                    if len(g) >= 2:
                        linien.append(g)
        if netz not in WEGE_NETZE or not linien:
            continue
        verkettet = []
        for l in _verketten(linien):
            ls = LineString(l).simplify(toleranz)
            if gebiet_box is not None:
                ls = ls.intersection(gebiet_box)
            verkettet += [g for g in getattr(ls, "geoms", [ls]) if g.geom_type == "LineString" and not g.is_empty]
        laenge = sum(g.length for g in verkettet)
        if laenge < mindestlaenge:
            continue
        t = r["tags"]
        out.append({"n": t.get("name") or t.get("ref") or "", "ref": t.get("ref", ""), "netz": netz,
                    "laenge": round(laenge), "p": [[int(round(v)) for xz in g.coords for v in xz[:2]] for g in verkettet]})
    out.sort(key=lambda w: (WEGE_NETZE[::-1].index(w["netz"]), w["n"], w["ref"]))
    return out


def _verketten(linien):
    """Linienstücke an gemeinsamen Endpunkten zu möglichst langen Linien verbinden (Richtung egal)."""
    ends = {}
    for i, l in enumerate(linien):
        for k in (_key(l[0]), _key(l[-1])):
            ends.setdefault(k, []).append(i)
    benutzt = [False] * len(linien)

    def weiter(cur, vorn):
        k = _key(cur[-1]) if vorn else _key(cur[0])
        for j in ends.get(k, []):
            if benutzt[j]:
                continue
            benutzt[j] = True
            l = linien[j]
            if _key(l[0]) == k:
                nxt = l[1:]
            else:
                nxt = l[::-1][1:]
            return (cur + nxt) if vorn else (nxt[::-1] + cur)
        return None

    out = []
    for i in range(len(linien)):
        if benutzt[i]:
            continue
        benutzt[i] = True
        cur = list(linien[i])
        for vorn in (True, False):
            while True:
                n = weiter(cur, vorn)
                if n is None:
                    break
                cur = n
        out.append(cur)
    return out


def bahnketten(elements, proj, schritt=10.0):
    """Bahnstrecken in Betrieb (rail, light_rail, narrow_gauge; ohne Tunnel) als Ketten gleichen Namens,
    auf ~10 m verdichtet. Liefert [{n, p: N×2 (x, z), br: N bool (Brücke)}]."""
    items = []
    for e in elements:
        t = e.get("tags", {})
        if e["type"] != "way" or t.get("railway") not in BAHN:
            continue
        if t.get("tunnel") in ("yes", "culvert", "building_passage"):
            continue
        g = proj.pts(e.get("geometry", []))
        if len(g) < 2:
            continue
        p = densify(g, schritt)
        brueck = t.get("bridge", "no") not in ("no", "")
        items.append((t.get("name", ""), p, np.full(len(p), brueck), _key(g[0]), _key(g[-1])))
    ends = {}
    for i, it in enumerate(items):
        for k in (it[3], it[4]):
            ends.setdefault((it[0], k), []).append(i)
    benutzt = [False] * len(items)
    out = []
    for i, it in enumerate(items):
        if benutzt[i]:
            continue
        benutzt[i] = True
        name, p, br = it[0], it[1], it[2]
        k0, k1 = it[3], it[4]
        for vorn in (True, False):
            while True:
                k = k1 if vorn else k0
                j = next((j for j in ends.get((name, k), []) if not benutzt[j]), None)
                if j is None:
                    break
                benutzt[j] = True
                _, q, qb, a, b = items[j]
                if a != k:      # Richtung drehen
                    q, qb, a, b = q[::-1], qb[::-1], b, a
                if vorn:
                    p, br, k1 = np.concatenate([p, q[1:]]), np.concatenate([br, qb[1:]]), b
                else:
                    p, br, k0 = np.concatenate([q[::-1][:-1], p]), np.concatenate([qb[::-1][:-1], br]), b
        out.append({"n": name, "p": p, "br": br})
    return out
