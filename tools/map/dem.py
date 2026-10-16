"""Stufe 1: Höhenraster je Kachel (10 m, 600×600 float32) aus amtlichen Modellen + Copernicus GLO-30.

Pro Kachel `dem10/{tx}_{tz}.npy` (float32 m ü. NN) und `dem10/{tx}_{tz}.q.npy` (uint8: Quelle je Zelle,
Index in `QUELLEN_CODES`: 0 keine, 1 Copernicus, 2.. amtliche Quellen in Reihenfolge).
Rechnung mit 40 Zellen (400 m) Rand, damit Nähte zwischen Quellen über Kachelgrenzen hinweg passen.
"""
import inspect
import io
import json
import os
import threading
from concurrent.futures import ThreadPoolExecutor

import numpy as np
import rasterio
from rasterio.transform import from_origin
from rasterio.warp import Resampling, reproject
from scipy import ndimage

import welt
from mosaik import Mosaik, nachbar_fuellen
from util import Fortschritt, Roh, atomar_schreiben, json_lesen, json_schreiben

CANOPY = 18.0        # mittlere Baumhöhe, wird aus dem DSM herausgerechnet (m)
RAND = 40            # Zellen Rand
BLEND = 30.0         # Zellen (300 m) für die weiche Naht
PLAUSIBEL = (-50.0, 2500.0)


def amtliche_quellen():
    try:
        from quellen import AMTLICH  # noqa: PLC0415
        return list(AMTLICH)
    except Exception:  # noqa: BLE001  (Modul fehlt oder noch leer)
        return []


def kopernikus():
    from quellen.copernicus import COPERNICUS
    return COPERNICUS


def quellen_codes(amtlich):
    return ["-", "cop"] + [q.id for q in amtlich]


def pfade(arbeit, tx, tz):
    return (os.path.join(arbeit, "dem10", f"{tx}_{tz}.npy"), os.path.join(arbeit, "dem10", f"{tx}_{tz}.q.npy"))


def fertig(arbeit, tx, tz):
    return all(os.path.exists(p) for p in pfade(arbeit, tx, tz))


def lader(arbeit):
    def f(tx, tz):
        p = pfade(arbeit, tx, tz)[0]
        return np.load(p) if os.path.exists(p) else None
    return f


def quellen_lader(arbeit):
    def f(tx, tz):
        p = pfade(arbeit, tx, tz)[1]
        return np.load(p) if os.path.exists(p) else None
    return f


# ------------------------------------------------------------------ Quellen laden
class QuellenLader:
    """Lädt Quell-Kacheln (parallel, vorausschauend) und löscht sie nach der letzten Verwendung."""

    def __init__(self, quellen, arbeit, jobs, fp):
        self.q, self.arbeit, self.fp = quellen, arbeit, fp
        self.pool = ThreadPoolExecutor(max_workers=max(1, jobs))
        self.futures, self.pfade, self.refs = {}, {}, {}
        self.lock = threading.Lock()
        self.ahead = max(2, jobs) * 2

    def _laden(self, qi, kid):
        src = self.q[qi]
        ziel = os.path.join(self.arbeit, "roh", src.id)
        os.makedirs(ziel, exist_ok=True)
        kw = {}
        if "fortschritt" in inspect.signature(src.laden).parameters:
            kw["fortschritt"] = self.fp.laden
        return list(src.laden(kid, ziel, **kw))

    def anfordern(self, schluessel):
        for k in schluessel:
            if k not in self.futures and sum(1 for f in self.futures.values() if not f.done()) < self.ahead:
                self.futures[k] = self.pool.submit(self._laden, *k)

    def holen(self, k):
        if k not in self.futures:
            self.futures[k] = self.pool.submit(self._laden, *k)
        p = self.futures[k].result()
        self.pfade[k] = p
        return p

    def abgeben(self, schluessel):
        for k in schluessel:
            self.refs[k] -= 1
            if self.refs[k] <= 0:
                f = self.futures.pop(k, None)
                ps = self.pfade.pop(k, None)
                if ps is None and f is not None:
                    try:
                        ps = f.result()
                    except Exception:  # noqa: BLE001
                        ps = []
                for p in ps or []:
                    Roh.entsorgen(p)

    def schliessen(self):
        self.pool.shutdown(wait=False, cancel_futures=True)


# ------------------------------------------------------------------ Rechnen
def lies_auf_fenster(pfad, shape, tr, mit_filter=True):
    """GeoTIFF auf das Zielraster (EPSG:25832, 10 m) bringen: average bei feinerer Quelle, sonst bilinear."""
    with rasterio.open(pfad) as src:
        geo = bool(src.crs and src.crs.is_geographic)
        res = abs(src.res[0])
        rs = Resampling.average if (not geo and res < 9.5) else Resampling.bilinear
        dst = np.full(shape, np.nan, np.float32)
        reproject(rasterio.band(src, 1), dst, src_nodata=src.nodata, dst_nodata=np.nan,
                  dst_transform=tr, dst_crs="EPSG:25832", resampling=rs)
    if mit_filter:
        dst[(dst < PLAUSIBEL[0]) | (dst > PLAUSIBEL[1])] = np.nan
    return dst


def fenster_transform(tx, tz):
    i0, j0 = tx * welt.N10 - RAND, tz * welt.N10 - RAND
    n = welt.N10 + 2 * RAND
    return i0, j0, n, from_origin(welt.E0 + i0 * 10.0, welt.N0 - j0 * 10.0, 10, 10)


def fenster_bounds(tx, tz):
    e0, n0, e1, n1 = welt.kachel_utm(tx, tz)
    p = RAND * 10 + 20
    return e0 - p, n0 - p, e1 + p, n1 + p


def cop_boden(cop, wald):
    """Copernicus (DSM): Baumhöhe abziehen, glätten."""
    forest = ndimage.gaussian_filter((wald).astype(np.float32), 4.5)
    g = cop - CANOPY * np.clip(forest * 1.2, 0, 1)
    return ndimage.gaussian_filter(g, 2.4)


def kachel_rechnen(tx, tz, amtlich, pfade_je_quelle, cop_pfade, wc_mosaik):
    i0, j0, n, tr = fenster_transform(tx, tz)
    off = np.full((n, n), np.nan, np.float32)
    code = np.zeros((n, n), np.uint8)
    for qi, ps in enumerate(pfade_je_quelle):
        for p in ps:
            a = lies_auf_fenster(p, (n, n), tr)
            m = np.isnan(off) & ~np.isnan(a)
            off[m] = a[m]
            code[m] = 2 + qi
    gueltig = ~np.isnan(off)
    if gueltig.all():
        return off[RAND:-RAND, RAND:-RAND], code[RAND:-RAND, RAND:-RAND]
    cop = np.full((n, n), np.nan, np.float32)
    for p in cop_pfade:
        a = lies_auf_fenster(p, (n, n), tr, mit_filter=False)
        m = np.isnan(cop) & ~np.isnan(a)
        cop[m] = a[m]
    if np.isnan(cop).any():
        cop = np.where(np.isnan(cop), np.nanmean(cop) if (~np.isnan(cop)).any() else 0, cop)
    wc, ok = wc_mosaik.fenster(i0, j0, n, n)
    wc = nachbar_fuellen(wc, ok)
    g = cop_boden(cop, wc == welt.C["wald"])
    if gueltig.any():
        delta = np.where(gueltig, off - g, 0).astype(np.float32)
        w = gueltig.astype(np.float32)
        num = ndimage.gaussian_filter(delta, 15)
        den = ndimage.gaussian_filter(w, 15)
        ds = np.where(den > 1e-4, num / np.maximum(den, 1e-4), 0)
        dist, (ii, jj) = ndimage.distance_transform_edt(~gueltig, return_indices=True)
        ext = np.clip(ds[ii, jj], -15, 15)
        fill = g + ext * np.clip(1 - dist / BLEND, 0, 1)
    else:
        fill = g
    out = np.where(gueltig, off, fill).astype(np.float32)
    code = np.where(gueltig, code, 1).astype(np.uint8)
    return out[RAND:-RAND, RAND:-RAND], code[RAND:-RAND, RAND:-RAND]


def npy_bytes(a):
    b = io.BytesIO()
    np.save(b, a)
    return b.getvalue()


def bauen(kacheln, arbeit, wc_lader, nur_cop, jobs, neu=False):
    """Alle Höhenkacheln rechnen. Liefert (fehlerliste, quellen_codes)."""
    amtlich = [] if nur_cop else amtliche_quellen()
    cop = kopernikus()
    alle = amtlich + [cop]
    codes = quellen_codes(amtlich)
    sig = {"codes": codes, "nur_cop": bool(nur_cop)}
    sigpfad = os.path.join(arbeit, "dem10", "_signatur.json")
    alt = json_lesen(sigpfad)
    if alt is not None and alt != sig:
        print("Höhenquellen haben sich geändert: dem10 wird neu gerechnet")
        neu = True
    if neu:
        for k in kacheln:
            for p in pfade(arbeit, *k):
                if os.path.exists(p):
                    os.remove(p)
    json_schreiben(sigpfad, sig)
    todo = [k for k in kacheln if not fertig(arbeit, *k)]
    print(f"Höhe: {len(kacheln) - len(todo)} Kacheln fertig, {len(todo)} zu rechnen; "
          f"Quellen: {', '.join(q.id for q in alle)}")
    if not todo:
        return [], codes
    fp = Fortschritt("Höhe", len(todo))
    # Bedarf je Kachel und Referenzzählung der Rohkacheln
    bedarf = {}
    ql = QuellenLader(alle, arbeit, jobs, fp)
    for t in todo:
        b = fenster_bounds(*t)
        bedarf[t] = [(qi, kid) for qi, q in enumerate(alle) for kid in q.kacheln(b)]
        for k in bedarf[t]:
            ql.refs[k] = ql.refs.get(k, 0) + 1
    wc = Mosaik(wc_lader, np.uint8, 1, cache=20)
    fehler = []
    ncop = len(amtlich)
    try:
        for idx, t in enumerate(todo):
            # vorausschauend laden
            vor = []
            for u in todo[idx:idx + 1 + ql.ahead]:
                vor += bedarf[u]
            ql.anfordern(dict.fromkeys(vor))
            je = [[] for _ in alle]
            ok = True
            for k in bedarf[t]:
                try:
                    je[k[0]] += ql.holen(k)
                except Exception as ex:  # noqa: BLE001
                    print(f"  FEHLER Quelle {alle[k[0]].id} {k[1]}: {str(ex)[:150]}")
                    ok = False
            if ok:
                h, q = kachel_rechnen(t[0], t[1], amtlich, je[:ncop], je[ncop], wc)
                if np.isnan(h).any():
                    fehler.append(t)
                    print(f"  Kachel {t}: Lücken ohne Quelle")
                else:
                    pf = pfade(arbeit, *t)
                    atomar_schreiben(pf[1], npy_bytes(q))
                    atomar_schreiben(pf[0], npy_bytes(h.astype(np.float32)))
            else:
                fehler.append(t)
            ql.abgeben(bedarf[t])
            fp.schritt(f"Kachel {t[0]}_{t[1]}")
    finally:
        ql.schliessen()
    return fehler, codes
