"""Stufe 5: Kacheln fertigstellen und nach FORMAT.md schreiben (r10, r40, vec).

Je Kachel wird mit 300 m Rand aus den Nachbarkacheln gerechnet (am Gebietsrand wird der Rand
fortgesetzt): Seen rastern (Uferglättung), Seegrund absenken, Flussbetten eingraben, Fels aus
Hangneigung, Heide/Moor/Steinbruch aus OSM. Das fertige 10-m-Raster bleibt zusätzlich im
Arbeitsordner (`fertig/{tx}_{tz}.npz`) für die Hex-Stufe.
"""
import io
import json
import os

import numpy as np
import shapely
from scipy import ndimage
from scipy.spatial import cKDTree
from shapely.geometry import box
from shapely.strtree import STRtree

import dem as demmod
import osm_welt as ow
import wasser as wasser_mod
import welt
import worldcover
from mosaik import Mosaik, nachbar_fuellen
from util import atomar_schreiben, gz_schreiben

C = welt.C
RAND = 30                    # Zellen (300 m)
N = welt.N10 + 2 * RAND
FELS_GRAD = 34.0             # Hangneigung (Grad) auf geglättetem 10-m-Gelände, ab der Fels beginnt
FELS_MIN = 8                 # kleinere Fels-Flecken (Zellen) entfallen
# Flussbett je Linienart: Tiefe unter dem Spiegel (m), Uferneigung (m/m), Einflussradius (m).
# Wie in build_map.py, nur mit kürzerer Reichweite und steilerem Ufer: bei 10 m Zellen und echten
# Geländemodellen soll nur das Bett selbst eingetieft werden, nicht das ganze Tal.
CHANNEL = {0: (2.5, 0.35, 45.0), 2: (1.2, 0.35, 30.0), 1: (1.0, 0.30, 25.0)}   # Schlüssel: Art k
BETT_MIN = 6.0               # Halbbreite des Bettbandes mindestens (m), damit es auf 10-m-Zellen lückenlos bleibt


def npy_bytes(a):
    b = io.BytesIO()
    np.save(b, a)
    return b.getvalue()


def diff_kodieren(h):
    """Höhe uint16 [n,n] -> zeilenweise Differenzen mod 65536 (little-endian Bytes)."""
    a = h.astype(np.int32)
    d = a.copy()
    d[:, 1:] = (a[:, 1:] - a[:, :-1]) & 0xFFFF
    return d.astype("<u2").tobytes()


def raster_bytes(h, cover, wasser):
    return diff_kodieren(h) + cover.astype(np.uint8).tobytes() + wasser.astype("<u2").tobytes()


def r40_aus_r10(h, cover, wasser):
    n = welt.N40
    hm = np.round(h.reshape(n, 4, n, 4).astype(np.float64).mean(axis=(1, 3))).astype(np.uint16)
    cnt = np.stack([(cover == k).reshape(n, 4, n, 4).sum(axis=(1, 3)) for k in range(len(welt.COVER))])
    cm = cnt.argmax(axis=0).astype(np.uint8)
    wm = (wasser > 0).reshape(n, 4, n, 4)
    wn = wm.sum(axis=(1, 3))
    ws = (wasser.reshape(n, 4, n, 4).astype(np.int64) * wm).sum(axis=(1, 3))
    wl = np.where(wn >= 8, np.round(ws / np.maximum(wn, 1)), 0).astype(np.uint16)
    return hm, cm, wl


def smooth_shore(ground, water, level, sd):
    """Uferzellen im Wasser so tief legen, dass die Wasserlinie auf der echten Uferkante liegt (wie build_map)."""
    req = np.zeros_like(ground)
    cnt = np.zeros_like(ground)
    for dj, di in ((0, 1), (0, -1), (1, 0), (-1, 0)):
        g_nb = np.roll(ground, (dj, di), axis=(0, 1))
        sd_nb = np.roll(sd, (dj, di), axis=(0, 1))
        land_nb = ~np.roll(water, (dj, di), axis=(0, 1))
        m = water & land_nb
        need = (g_nb - level) * (-sd) / np.maximum(sd_nb, 1.0)
        req[m] += need[m]
        cnt[m] += 1
    edge = cnt > 0
    depth = np.clip(req / np.maximum(cnt, 1), 0.3, 30.0)
    return np.where(edge, level - depth, ground)


def clip_linie(p, x0, z0, x1, z1):
    """Polylinie p (N×3: x, z, Spiegel) am Rechteck schneiden (Liang-Barsky), Kantenpunkte interpoliert."""
    if len(p) < 2:
        return []
    a, b = p[:-1], p[1:]
    dx, dz = b[:, 0] - a[:, 0], b[:, 1] - a[:, 1]
    m = len(a)
    t0 = np.zeros(m)
    t1 = np.ones(m)
    ok = np.ones(m, bool)
    for pk, qk in ((-dx, a[:, 0] - x0), (dx, x1 - a[:, 0]), (-dz, a[:, 1] - z0), (dz, z1 - a[:, 1])):
        par = pk == 0
        ok &= ~(par & (qk < 0))
        with np.errstate(divide="ignore", invalid="ignore"):
            r = np.where(par, 0.0, qk / np.where(par, 1.0, pk))
        t0 = np.where((pk < 0) & ~par, np.maximum(t0, r), t0)
        t1 = np.where((pk > 0) & ~par, np.minimum(t1, r), t1)
    ok &= t1 > t0 + 1e-9
    idx = np.flatnonzero(ok)
    out, cur, prev = [], None, -2
    for i in idx:
        A = a[i] + (b[i] - a[i]) * t0[i]
        B = a[i] + (b[i] - a[i]) * t1[i]
        if cur is not None and i == prev + 1 and t1[prev] >= 1.0 and t0[i] <= 0.0:
            cur.append(B)
        else:
            if cur is not None:
                out.append(np.array(cur))
            cur = [A, B]
        prev = i
    if cur is not None:
        out.append(np.array(cur))
    return out


def ausduennen(p, abstand=20.0):
    if len(p) <= 2:
        return p
    ds = np.r_[0, np.cumsum(np.hypot(*np.diff(p[:, :2], axis=0).T))]
    sel = np.unique(np.r_[0, np.searchsorted(ds, np.arange(0, ds[-1], abstand)), len(p) - 1])
    return p[sel]


class Flaechen:
    """OSM-Flächen einer Art (Weltmeter) mit Bounding-Boxen für schnelle Auswahl."""

    def __init__(self, polys):
        self.polys = polys
        self.bb = np.array([[min(x for r in o for x, _ in r), min(z for r in o for _, z in r),
                             max(x for r in o for x, _ in r), max(z for r in o for _, z in r)]
                            for _, o, _ in polys], float).reshape(-1, 4)

    def raster(self, x0, z0, n):
        """Anteil 0..1 je Zelle im Fenster [x0, x0+10n)."""
        if not len(self.polys):
            return None
        x1, z1 = x0 + n * 10, z0 + n * 10
        sel = np.flatnonzero((self.bb[:, 2] >= x0) & (self.bb[:, 0] <= x1) & (self.bb[:, 3] >= z0) & (self.bb[:, 1] <= z1))
        if not sel.size:
            return None
        loc = [(self.polys[i][0],
                [[(x - x0, z - z0) for x, z in r] for r in self.polys[i][1]],
                [[(x - x0, z - z0) for x, z in r] for r in self.polys[i][2]]) for i in sel]
        return ow.rasterize(loc, n, n, 10.0)


class WeltKacheln:
    def __init__(self, arbeit, arbeit_ver, ausgabe, kacheln, elems, proj, wasserdaten):
        self.arbeit, self.arbeit_ver, self.aus = arbeit, arbeit_ver, ausgabe
        self.kacheln = set(kacheln)
        self.dem = Mosaik(demmod.lader(arbeit), np.float32, np.nan, cache=12)
        self.demq = Mosaik(demmod.quellen_lader(arbeit), np.uint8, 0, cache=12)
        self.wc = Mosaik(worldcover.lader(arbeit), np.uint8, 1, cache=12)
        # Seen
        self.seen = wasserdaten["seen"]
        self.lgeom = [shapely.from_wkb(s["geom"]) for s in self.seen]
        self.lvec = [g.simplify(1.5) for g in self.lgeom]
        self.ltree = STRtree(self.lgeom) if self.lgeom else None
        # Flüsse
        self.fluss = wasserdaten["fluesse"]
        self.fbb = np.array([[f["p"][:, 0].min(), f["p"][:, 1].min(), f["p"][:, 0].max(), f["p"][:, 1].max()]
                             for f in self.fluss], float).reshape(-1, 4)
        self._carve_vorbereiten()
        # OSM-Flächen
        self.heide = Flaechen(ow.polygons(elems, proj, lambda t: t.get("natural") == "heath"))
        self.moor = Flaechen(ow.polygons(elems, proj, lambda t: t.get("natural") in ("wetland", "bog", "moor")))
        self.bruch = Flaechen(ow.polygons(elems, proj, lambda t: t.get("landuse") == "quarry"))

    # ---------------------------------------------------------------- Fluss-Punkte je Kachel
    def _carve_vorbereiten(self):
        self.carve = {}
        for k in CHANNEL:
            items = [f for f in self.fluss if f["k"] == k]
            if not items:
                continue
            P = np.concatenate([f["p"][:, :2] for f in items]).astype(np.float64)
            L = np.concatenate([f["p"][:, 2] for f in items]).astype(np.float64)
            Wd = np.concatenate([np.full(len(f["p"]), f["w"] / 2.0) for f in items])
            key = (P[:, 0] // welt.KACHEL).astype(int) * 1000 + (P[:, 1] // welt.KACHEL).astype(int)
            order = np.argsort(key, kind="stable")
            ks = key[order]
            ukeys, start = np.unique(ks, return_index=True)
            ends = np.r_[start[1:], len(ks)]
            buckets = {int(u): order[s:e] for u, s, e in zip(ukeys, start, ends)}
            self.carve[k] = (P, L, Wd, buckets)

    def _carve_punkte(self, k, tx, tz):
        P, L, Wd, buckets = self.carve[k]
        idx = [buckets[(a * 1000 + b)] for a in range(tx - 1, tx + 2) for b in range(tz - 1, tz + 2)
               if (a * 1000 + b) in buckets]
        if not idx:
            return None
        idx = np.concatenate(idx)
        return P[idx], L[idx], Wd[idx]

    # ---------------------------------------------------------------- Pfade
    def pfade(self, tx, tz):
        n = f"{tx}_{tz}"
        return [os.path.join(self.aus, "r10", n + ".bin.gz"), os.path.join(self.aus, "r40", n + ".bin.gz"),
                os.path.join(self.aus, "vec", n + ".json.gz"), os.path.join(self.arbeit_ver, "fertig", n + ".npz")]

    def fertig(self, tx, tz):
        return all(os.path.exists(p) for p in self.pfade(tx, tz))

    # ---------------------------------------------------------------- Kachel
    def bauen(self, tx, tz):
        i0, j0 = tx * welt.N10 - RAND, tz * welt.N10 - RAND
        x0w, z0w = i0 * 10.0, j0 * 10.0
        g, ok = self.dem.fenster(i0, j0, N, N)
        ground = nachbar_fuellen(g, ok).astype(np.float64)
        wcv, okc = self.wc.fenster(i0, j0, N, N)
        cover = nachbar_fuellen(wcv, okc).astype(np.uint8)
        wald_anteil = ndimage.gaussian_filter((cover == C["wald"]).astype(np.float32), 1.5)

        # --- stehendes Wasser
        water = np.zeros((N, N), bool)
        level = np.zeros((N, N))
        sd = np.full((N, N), 1e3, np.float32)
        if self.ltree is not None:
            hits = np.sort(self.ltree.query(box(x0w, z0w, x0w + N * 10, z0w + N * 10)))
            if hits.size:
                polys = [({}, *wasser_mod.ringe(self.lgeom[h], -x0w, -z0w)) for h in hits]
                sd, lid = ow.rasterize(polys, N, N, 10.0, ids=True)
                water = sd < 0
                if water.any():
                    _, (ii, jj) = ndimage.distance_transform_edt(lid == 0, return_indices=True)
                    lid = np.where(water, lid[ii, jj], 0)
                    lv = np.array([0.0] + [self.seen[h]["l"] for h in hits])
                    level = lv[lid]
        cover[water] = C["wasser"]
        cover[(~water) & (cover == C["wasser"])] = C["wiese"]
        if water.any():
            dist_in = ndimage.distance_transform_edt(water) * 10.0
            depth = np.clip(1.5 + dist_in * 0.1, 0, 30)
            ground = np.where(water, level - depth, ground)
            near = ndimage.maximum_filter(level, size=3)
            shore = (~water) & (near > 0)
            ground = np.where(shore, np.maximum(ground, near + 0.8), ground)
            ground = smooth_shore(ground, water, level, sd)

        # --- Fließgewässer: Bett eingraben
        riverside = np.zeros((N, N), bool)
        lauf = np.zeros((N, N), bool)
        gx, gz = np.meshgrid(x0w + (np.arange(N) + 0.5) * 10.0, z0w + (np.arange(N) + 0.5) * 10.0)
        cells = np.column_stack([gx.ravel(), gz.ravel()])
        for k, (tief, ufer, reich) in CHANNEL.items():
            if k not in self.carve:
                continue
            pk = self._carve_punkte(k, tx, tz)
            if pk is None:
                continue
            P, L, Wd = pk
            m = (P[:, 0] > x0w - reich) & (P[:, 0] < x0w + N * 10 + reich) & \
                (P[:, 1] > z0w - reich) & (P[:, 1] < z0w + N * 10 + reich)
            if not m.any():
                continue
            P, L, Wd = P[m], L[m], Wd[m]
            d, nn = cKDTree(P).query(cells, distance_upper_bound=reich)
            okc_ = np.isfinite(d)
            if not okc_.any():
                continue
            d, nn = d[okc_], nn[okc_]
            target = L[nn] - tief + ufer * np.maximum(0.0, d - Wd[nn])
            flat = np.flatnonzero(okc_)
            gf = ground.ravel()
            land = ~water.ravel()[flat]
            gf[flat[land]] = np.minimum(gf[flat[land]], target[land])
            band = np.maximum(Wd[nn] + 1.0, BETT_MIN)
            riverside.ravel()[flat[land & (d < Wd[nn] + 12)]] = True
            lauf.ravel()[flat[land & (d < band)]] = True
            if k != 1:   # Flussbett (Fluss, Kanal): kein Wald, keine Häuser
                cover.ravel()[flat[land & (d < band)]] = C["wasser"]

        # --- Hangneigung, Fels
        gs = ndimage.gaussian_filter(ground, 1.0)
        gzs, gxs = np.gradient(gs, 10.0)
        slope = np.degrees(np.arctan(np.hypot(gxs, gzs)))
        rock = (slope > FELS_GRAD) & (cover != C["wasser"]) & (cover != C["wald"]) & ~riverside
        if rock.any():
            lab, nl = ndimage.label(rock)
            gr = ndimage.sum(rock, lab, range(1, nl + 1))
            klein = np.isin(lab, 1 + np.flatnonzero(np.asarray(gr) < FELS_MIN))
            rock &= ~klein
        cover[rock] = C["fels"]

        # --- Heide, Moor, Steinbruch
        offen = np.isin(cover, [C["wiese"], C["acker"], C["heide"], C["moor"], C["fels"]])
        sparse = offen | ((cover == C["wald"]) & (wald_anteil < 0.6))
        fh = self.heide.raster(x0w, z0w, N)
        fm = self.moor.raster(x0w, z0w, N)
        fq = self.bruch.raster(x0w, z0w, N)
        if fh is not None:
            cover[(fh >= 0.5) & sparse] = C["heide"]
        if fm is not None:
            cover[(fm >= 0.5) & sparse] = C["moor"]
        if fq is not None:
            cover[(fq >= 0.5) & (cover != C["wasser"])] = C["fels"]

        # --- Mitte ausschneiden und schreiben
        s = slice(RAND, RAND + welt.N10)
        h_dm = np.clip(np.round(ground[s, s] * 10), 0, 65535).astype(np.uint16)
        w_dm = np.where(water[s, s], np.clip(np.round(level[s, s] * 10), 1, 65535), 0).astype(np.uint16)
        cv = cover[s, s].astype(np.uint8)
        gz_schreiben_(self.pfade(tx, tz)[0], raster_bytes(h_dm, cv, w_dm))
        hm, cm, wl = r40_aus_r10(h_dm, cv, w_dm)
        gz_schreiben_(self.pfade(tx, tz)[1], raster_bytes(hm, cm, wl))
        self.vec_schreiben(tx, tz)
        sl8 = np.clip(np.round(slope[s, s] * 2), 0, 255).astype(np.uint8)
        b = io.BytesIO()
        np.savez(b, hoehe=h_dm, bedeckung=cv, wasser=w_dm, steil=sl8, lauf=lauf[s, s].astype(np.uint8))
        atomar_schreiben(self.pfade(tx, tz)[3], b.getvalue())   # zuletzt: Marker "Kachel fertig"
        q = self.demq.kachel(tx, tz)
        codes = sorted(set(np.unique(q).tolist()) - {0}) if q is not None else []
        return {"min": float(h_dm.min()) / 10, "max": float(h_dm.max()) / 10, "codes": codes,
                "fels": int((cv == C["fels"]).sum()), "wasser": int((w_dm > 0).sum())}

    # ---------------------------------------------------------------- Vektoren
    def vec_schreiben(self, tx, tz):
        x0, z0, x1, z1 = welt.kachel_grenzen(tx, tz)
        rivers, lakes = [], []
        if len(self.fbb):
            sel = np.flatnonzero((self.fbb[:, 2] >= x0) & (self.fbb[:, 0] <= x1) & (self.fbb[:, 3] >= z0) & (self.fbb[:, 1] <= z1))
            for i in sel:
                f = self.fluss[i]
                for part in clip_linie(f["p"].astype(np.float64), x0, z0, x1, z1):
                    part = ausduennen(part)
                    if len(part) < 2:
                        continue
                    flat = np.round(part, 1).ravel().tolist()
                    rivers.append({"n": f["n"], "k": int(f["k"]), "w": round(f["w"], 1), "p": flat})
        if self.ltree is not None:
            frame = box(x0, z0, x1, z1)
            for i in sorted(self.ltree.query(frame)):
                geom = self.lvec[i].intersection(frame)
                for pg in getattr(geom, "geoms", [geom]):
                    if pg.geom_type != "Polygon" or pg.area < 40:
                        continue
                    ring = lambda c: [round(v, 1) for xy in list(c.coords)[:-1] for v in xy]  # noqa: E731
                    lakes.append({"n": self.seen[i]["n"], "l": round(self.seen[i]["l"], 2),
                                  "o": ring(pg.exterior), "h": [ring(h) for h in pg.interiors]})
        gz_schreiben_(self.pfade(tx, tz)[2], json.dumps({"rivers": rivers, "lakes": lakes}, ensure_ascii=False,
                                                         separators=(",", ":")).encode("utf-8"))


def gz_schreiben_(pfad, daten):
    gz_schreiben(pfad, daten)


def fertig_lader(arbeit_ver):
    def f(tx, tz):
        p = os.path.join(arbeit_ver, "fertig", f"{tx}_{tz}.npz")
        if not os.path.exists(p):
            return None
        z = np.load(p)
        return {k: z[k] for k in z.files}
    return f
