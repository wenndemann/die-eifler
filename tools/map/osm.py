"""OpenStreetMap-Auswertung für build_map.py: Flächen rastern, Fluss-Ketten bilden, Orte lesen.

Eingabe ist die Overpass-Antwort (`out geom`) aus fetch_osm.py.
Kartendaten © OpenStreetMap-Mitwirkende, ODbL.
"""
import json
import math

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage

SS = 4  # Unterabtastung beim Rastern (Anteil je Zelle)

# Gewässerflächen, die NICHT als stehendes Wasser zählen (Flüsse kommen als Linien)
WATER_SKIP = {"river", "stream", "canal", "ditch", "drain", "wastewater"}

PLACE_KIND = {"city": "stadt", "town": "stadt", "village": "dorf", "hamlet": "weiler"}

# Standardbreiten (m), falls kein width-Tag; je Flussname eigene Werte
RIVER_WIDTH = {"Rur": 16.0, "Urft": 11.0, "Olef": 8.0}
DEFAULT_WIDTH = {"river": 8.0, "canal": 4.0, "stream": 3.0}
WIDTH_MIN = {"river": 6.0, "canal": 3.0, "stream": 2.5}
KIND_ID = {"river": 0, "stream": 1, "canal": 2}


class Projector:
    """lon/lat -> Welt-Meter (x nach Osten, z nach Süden, Ursprung NW-Ecke der Bbox)."""

    def __init__(self, bbox, m_lon, m_lat):
        self.lon0, self.lat1 = bbox[0], bbox[3]
        self.m_lon, self.m_lat = m_lon, m_lat

    def xz(self, lon, lat):
        return (lon - self.lon0) * self.m_lon, (self.lat1 - lat) * self.m_lat

    def pts(self, geom):
        return [self.xz(p["lon"], p["lat"]) for p in geom if p]


def load(path):
    with open(path, encoding="utf-8") as f:
        return json.load(f)["elements"]


def _key(p):
    return (round(p[0], 2), round(p[1], 2))


def _rings(lines):
    """Linienstücke (Listen von Punkten) zu geschlossenen Ringen verbinden."""
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
        if len(cur) >= 4:
            rings.append(cur)
    return rings


def polygons(elements, proj, pred):
    """Alle Flächen (geschlossene Wege, Multipolygone), deren Tags pred erfüllen.

    Liefert [(tags, outer_rings, inner_rings)] in Welt-Metern.
    """
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


def _ring_area(r):
    a = 0.0
    for (x0, z0), (x1, z1) in zip(r, r[1:]):
        a += x0 * z1 - x1 * z0
    return abs(a) / 2


def rasterize(polys, nx, nz, cell, ids=False):
    """Flächen rastern. ids=False: Anteil 0..1 je Zelle.
    ids=True: (Abstand zur Kante in m je Zelle, >0 außen, Index je Zelle, 0 = keiner).

    Bei ids werden große Flächen zuerst gezeichnet, kleinere liegen obenauf.
    """
    W, Hh = nx * SS, nz * SS
    s = SS / cell
    mask = Image.new("L", (W, Hh), 0)
    dm = ImageDraw.Draw(mask)
    idimg = Image.new("I", (W, Hh), 0) if ids else None
    di = ImageDraw.Draw(idimg) if ids else None
    order = sorted(range(len(polys)), key=lambda i: -sum(_ring_area(r) for r in polys[i][1]))
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
    # Vorzeichenbehafteter Abstand zur Flächenkante, am Zellmittelpunkt (zwischen den mittleren Pixeln)
    inside = hi > 127
    sd = (ndimage.distance_transform_edt(~inside) - ndimage.distance_transform_edt(inside)) * (cell / SS)
    m = SS // 2
    sd = sd.reshape(nz, SS, nx, SS)[:, m - 1:m + 1, :, m - 1:m + 1].mean(axis=(1, 3))
    idc = np.asarray(idimg, np.int32)[m::SS, m::SS][:nz, :nx]
    return sd.astype(np.float32), idc


def waterways(elements, proj):
    """Fluss-/Bach-/Kanal-Linien, über gemeinsame Endpunkte zu Ketten verbunden.

    Wegrichtung = Fließrichtung (OSM-Konvention). Tunnel/Verrohrungen werden ausgelassen.
    Liefert [{name, kind, width, pts:[(x,z),...]}].
    """
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

    # Ketten bilden: Ende eines Stücks -> Anfang genau eines gleichartigen Stücks
    starts = {}
    for i, s in enumerate(segs):
        starts.setdefault(_key(s["pts"][0]), []).append(i)
    ends = {}
    for i, s in enumerate(segs):
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
    for i in sorted(range(len(segs)), key=has_prev):  # Kettenanfänge zuerst
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
    out = [pts[0]]
    for (x0, z0), (x1, z1) in zip(pts, pts[1:]):
        n = max(1, int(math.ceil(math.hypot(x1 - x0, z1 - z0) / step)))
        for k in range(1, n + 1):
            out.append((x0 + (x1 - x0) * k / n, z0 + (z1 - z0) * k / n))
    return out


def places(elements, proj, sx, sz):
    """Benannte Orte (Stadt/Dorf/Weiler) innerhalb der Karte, Dubletten zusammengefasst."""
    rank = {"stadt": 0, "dorf": 1, "weiler": 2}
    out = []
    for e in elements:
        t = e.get("tags", {})
        if e["type"] != "node" or t.get("place") not in PLACE_KIND or not t.get("name"):
            continue
        x, z = proj.xz(e["lon"], e["lat"])
        if not (0 <= x < sx and 0 <= z < sz):
            continue
        kind = PLACE_KIND[t["place"]]
        dup = next((p for p in out if p["name"] == t["name"] and math.hypot(p["x"] - x, p["z"] - z) < 2000), None)
        if dup:
            if rank[kind] < rank[dup["kind"]]:
                dup["kind"] = kind
            continue
        out.append({"name": t["name"], "kind": kind, "x": round(x, 1), "z": round(z, 1)})
    out.sort(key=lambda p: (rank[p["kind"]], p["name"]))
    return out
