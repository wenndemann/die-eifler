"""Stufe 4: Wasser für das GANZE Gebiet am Stück (Seen, Flussketten), erst danach wird je Kachel geschnitten.

Ergebnis in `<arbeit>/<version>/wasser/wasser.pkl`:
  seen:    [{n, l (Spiegel m), geom (WKB, Weltmeter), bbox, flaeche}]
  fluesse: [{n, k (0 Fluss, 1 Bach, 2 Kanal), w (Breite), p (float32 N×3: x, z, Spiegel; ~10 m Abstand)}]
  labels:  [[name, x, z], ...] Namen großer Seen und Flüsse
"""
import math
import os
import pickle
from collections import OrderedDict

import numpy as np
import shapely
from rasterio import features
from rasterio.transform import Affine
from scipy import ndimage
from shapely.algorithms.polylabel import polylabel
from shapely.geometry import Polygon
from shapely.strtree import STRtree
from shapely.validation import make_valid

import osm_welt as ow
import welt
from mosaik import Mosaik, nachbar_fuellen
from util import Fortschritt, atomar_schreiben

MIN_SEE = 4000.0   # m², kleinere Teiche entfallen


def pfad(arbeit_ver):
    return os.path.join(arbeit_ver, "wasser", "wasser.pkl")


def see_filter(t):
    return (t.get("natural") == "water" and t.get("water") not in ow.WATER_SKIP) or t.get("landuse") == "reservoir"


def seen_geometrien(elems, proj):
    """Stehende Gewässer als shapely-Geometrie (Weltmeter): [(tags, geom)]."""
    out = []
    for tags, outer, inner in ow.polygons(elems, proj, see_filter):
        g = None
        for r in outer:
            p = make_valid(Polygon(r))
            g = p if g is None else g.union(p)
        for r in inner:
            g = make_valid(g).difference(make_valid(Polygon(r)))
        g = make_valid(g)
        polys = [x for x in getattr(g, "geoms", [g]) if x.geom_type == "Polygon" and not x.is_empty]
        if not polys:
            continue
        g = shapely.MultiPolygon(polys) if len(polys) > 1 else polys[0]
        if g.area >= MIN_SEE:
            out.append((tags, g))
    return out


def ringe(geom, dx=0.0, dz=0.0):
    """shapely -> (outer_rings, inner_rings) als Punktlisten, um (dx, dz) verschoben."""
    outer, inner = [], []
    for p in getattr(geom, "geoms", [geom]):
        outer.append([(x + dx, z + dz) for x, z in p.exterior.coords])
        for h in p.interiors:
            inner.append([(x + dx, z + dz) for x, z in h.coords])
    return outer, inner


def monotone_fallend(y):
    """Isotone Regression (Pool Adjacent Violators): bestangepasste fallende Folge."""
    vals, wts, cnt = [], [], []
    for v in np.asarray(y, np.float64):
        vals.append(v); wts.append(1.0); cnt.append(1)  # noqa: E702
        while len(vals) > 1 and vals[-2] < vals[-1]:
            w = wts[-2] + wts[-1]
            vals[-2] = (vals[-2] * wts[-2] + vals[-1] * wts[-1]) / w
            wts[-2] = w; cnt[-2] += cnt[-1]  # noqa: E702
            vals.pop(); wts.pop(); cnt.pop()  # noqa: E702
    return np.repeat(vals, cnt).astype(np.float32)


class Talsohle:
    """Talsohle (Minimum über 5×5 Zellen) des Höhenrasters an beliebigen Punkten, kachelweise gepuffert."""

    def __init__(self, mosaik, groesse=5):
        self.m = mosaik
        self.groesse = groesse
        self.cache = OrderedDict()

    def _fenster(self, tx, tz):
        k = (tx, tz)
        if k in self.cache:
            self.cache.move_to_end(k)
            return self.cache[k]
        i0, j0 = tx * welt.N10 - 3, tz * welt.N10 - 3
        n = welt.N10 + 6
        a, ok = self.m.fenster(i0, j0, n, n)
        if not ok[3:-3, 3:-3].any():
            r = None
        else:
            a = nachbar_fuellen(a, ok)
            r = (ndimage.minimum_filter(a, size=self.groesse) if self.groesse > 1 else a, i0, j0, ok[3:-3, 3:-3].all())
        self.cache[k] = r
        if len(self.cache) > 24:
            self.cache.popitem(last=False)
        return r

    def hoehe(self, x, z):
        """Talsohle in m an (x, z); NaN, wo keine Daten."""
        x = np.asarray(x, np.float64)
        z = np.asarray(z, np.float64)
        out = np.full(x.shape, np.nan, np.float32)
        tx = np.clip((x // welt.KACHEL).astype(int), -1, welt.NTX)
        tz = np.clip((z // welt.KACHEL).astype(int), -1, welt.NTZ)
        key = tx * 1000 + tz
        for kv in np.unique(key):
            sel = key == kv
            t = (int(tx[sel][0]), int(tz[sel][0]))
            if not (0 <= t[0] < welt.NTX and 0 <= t[1] < welt.NTZ):
                continue
            f = self._fenster(*t)
            if f is None:
                continue
            low, i0, j0, _ = f
            fi = x[sel] / 10.0 - 0.5 - i0
            fj = z[sel] / 10.0 - 0.5 - j0
            out[sel] = ndimage.map_coordinates(low, [fj, fi], order=1, mode="nearest")
        return out


def see_spiegel(geom, mosaik):
    """Spiegel eines Sees: 30. Perzentil der Höhen im Polygon (Modell über Wasser ist flach)."""
    x0, z0, x1, z1 = geom.bounds
    i0, j0 = int(x0 // 10) - 1, int(z0 // 10) - 1
    w, h = int(x1 // 10) + 2 - i0, int(z1 // 10) + 2 - j0
    a, ok = mosaik.fenster(i0, j0, w, h)
    m = features.rasterize([(geom, 1)], out_shape=(h, w), transform=Affine(10, 0, i0 * 10.0, 0, 10, j0 * 10.0),
                           fill=0, all_touched=False).astype(bool)
    v = a[m & ok]
    if v.size < 5:
        # sehr schmale Gewässer: alle berührten Zellen
        m = features.rasterize([(geom, 1)], out_shape=(h, w), transform=Affine(10, 0, i0 * 10.0, 0, 10, j0 * 10.0),
                               fill=0, all_touched=True).astype(bool)
        v = a[m & ok]
    if v.size < 3:
        return None
    return float(np.percentile(v, 30))


def bauen(elems, proj, dem_mosaik, arbeit_ver):
    print("Wasser: Seen ...", flush=True)
    seen = []
    for tags, g in seen_geometrien(elems, proj):
        lv = see_spiegel(g, dem_mosaik)
        if lv is None:
            continue
        seen.append({"n": tags.get("name", ""), "l": lv, "geom": g.wkb, "bbox": g.bounds, "flaeche": g.area})
    print(f"  {len(seen)} Seen mit Spiegel")
    geoms = [shapely.from_wkb(s["geom"]) for s in seen]
    tree = STRtree(geoms) if geoms else None
    pegel = np.array([s["l"] for s in seen], np.float32)

    print("Wasser: Fließgewässer ...", flush=True)
    ketten = ow.waterways(elems, proj)
    talsohle = Talsohle(dem_mosaik)
    fluesse = []
    fp = Fortschritt("Flüsse", len(ketten))
    for ch in ketten:
        p = ow.densify(ch["pts"], 10.0)
        x, z = p[:, 0], p[:, 1]
        lv = talsohle.hoehe(x, z)
        inside = ~np.isnan(lv) & (x >= 0) & (x < welt.WELT_X) & (z >= 0) & (z < welt.WELT_Z)
        idx = np.flatnonzero(inside)
        if idx.size < 2:
            fp.schritt(stumm=True)
            continue
        for run in np.split(idx, np.flatnonzero(np.diff(idx) > 1) + 1):
            if len(run) >= 2:
                _lauf(ch, p[run].astype(np.float64), lv[run], tree, pegel, fluesse)
        fp.schritt(ch["name"] or "-")
    print(f"  {len(fluesse)} Fließgewässer-Stücke")
    labels = _labels(seen, geoms, fluesse)
    os.makedirs(os.path.dirname(pfad(arbeit_ver)), exist_ok=True)
    atomar_schreiben(pfad(arbeit_ver), pickle.dumps({"seen": seen, "fluesse": fluesse, "labels": labels}, protocol=4))
    return {"seen": len(seen), "fluesse": len(fluesse)}


def _lauf(ch, pts, lv0, tree, pegel, out):
    """Ein Stück einer Kette innerhalb der Welt: Spiegel bestimmen, an Seen zerlegen."""
    n = len(pts)
    in_lake = np.zeros(n, bool)
    lake_lv = np.zeros(n, np.float32)
    if tree is not None:
        pk = shapely.points(pts[:, 0], pts[:, 1])
        hit = tree.query(pk, predicate="intersects")
        if hit.shape[1]:
            in_lake[hit[0]] = True
            np.maximum.at(lake_lv, hit[0], pegel[hit[1]])
    # Wasser fließt nie bergauf; stromauf eines durchflossenen Sees nie unter dem Seespiegel
    above = np.maximum.accumulate(np.where(in_lake, lake_lv, 0)[::-1])[::-1]
    lv = np.maximum(monotone_fallend(lv0), above)
    idx = np.flatnonzero(~in_lake)
    if idx.size == 0:
        return
    for part in np.split(idx, np.flatnonzero(np.diff(idx) > 1) + 1):
        a, b = part[0], part[-1]
        if a > 0 and in_lake[a - 1]:
            a -= 1
        if b < n - 1 and in_lake[b + 1]:
            b += 1
        p, l = pts[a:b + 1], lv[a:b + 1]
        laenge = float(np.hypot(*np.diff(p, axis=0).T).sum()) if len(p) > 1 else 0.0
        if laenge < (60 if ch["kind"] != "stream" else 150):
            continue
        out.append({"n": ch["name"], "k": ow.KIND_ID[ch["kind"]], "w": float(ch["width"]),
                    "p": np.column_stack([p, l]).astype(np.float32)})


def _labels(seen, geoms, fluesse):
    labels = []
    for s, g in zip(seen, geoms):
        if not s["n"] or s["flaeche"] < 40000:
            continue
        gp = max(getattr(g, "geoms", [g]), key=lambda q: q.area)
        c = polylabel(gp, tolerance=5.0)
        labels.append([s["n"], round(c.x, 1), round(c.y, 1)])
    best = {}
    for f in fluesse:
        if f["k"] != 0 or not f["n"]:
            continue
        if len(f["p"]) > len(best.get(f["n"], {"p": []})["p"]):
            best[f["n"]] = f
    for name, f in sorted(best.items()):
        m = len(f["p"]) // 2
        labels.append([name, round(float(f["p"][m, 0]), 1), round(float(f["p"][m, 1]), 1)])
    return labels


def laden(arbeit_ver):
    with open(pfad(arbeit_ver), "rb") as f:
        return pickle.load(f)
