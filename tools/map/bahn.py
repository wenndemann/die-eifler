"""Stufe 5b: Bahnstrecken (OSM railway=rail|light_rail|narrow_gauge in Betrieb, ohne Tunnel).

Ketten gleichen Namens, auf 10 m verdichtet; Höhe y je Punkt aus dem fertigen Gelände (r10 nach dem
Flussgraben), entlang der Linie leicht geglättet, über Brücken linear zwischen den Brückenenden, nie unter
dem Spiegel eines Flusses in der Nähe. Das Gleisbett wird NICHT ins Gelände gegraben. Ergebnis: Eintrag
`rails` in den vec-Kacheln (nach dem Schneiden der Kacheln ergänzt) und `bahn.pkl` für die Hex-Stufe.
"""
import gzip
import json
import os
import pickle

import numpy as np
from scipy import ndimage
from scipy.spatial import cKDTree

import kacheln as kmod
import osm_welt as ow
import welt
from mosaik import Mosaik
from util import atomar_schreiben, gz_schreiben
from wasser import Talsohle


def hoehen_mosaik(arbeit_ver):
    def lader(tx, tz):
        p = os.path.join(arbeit_ver, "fertig", f"{tx}_{tz}.npz")
        if not os.path.exists(p):
            return None
        return np.load(p)["hoehe"].astype(np.float32) / 10.0
    return Mosaik(lader, np.float32, np.nan, cache=16)


def bauen(elems, proj, arbeit_ver, fluesse):
    ketten = ow.bahnketten(elems, proj)
    smp = Talsohle(hoehen_mosaik(arbeit_ver), groesse=1)
    # Flusspunkte (alle Arten) für „nie unter dem Flussspiegel"
    if fluesse:
        P = np.concatenate([f["p"][:, :2] for f in fluesse])
        L = np.concatenate([f["p"][:, 2] for f in fluesse])
        baum = cKDTree(P)
    else:
        baum = None
    out = []
    for ch in ketten:
        p, br = ch["p"], ch["br"]
        y = smp.hoehe(p[:, 0], p[:, 1])
        gut = ~np.isnan(y) & (p[:, 0] >= 0) & (p[:, 0] < welt.WELT_X) & (p[:, 1] >= 0) & (p[:, 1] < welt.WELT_Z)
        idx = np.flatnonzero(gut)
        if idx.size < 2:
            continue
        for run in np.split(idx, np.flatnonzero(np.diff(idx) > 1) + 1):
            if len(run) < 5:
                continue
            q, b, h = p[run], br[run], y[run].astype(np.float64)
            h = ndimage.gaussian_filter1d(h, 2.0, mode="nearest")
            n = len(h)
            # Brücken: Höhe linear zwischen den Brückenenden
            lab, nl = ndimage.label(b)
            for k in range(1, nl + 1):
                ii = np.flatnonzero(lab == k)
                a, e = ii[0] - 1, ii[-1] + 1
                if a < 0 and e >= n:
                    continue
                if a < 0:
                    h[ii] = h[e]
                elif e >= n:
                    h[ii] = h[a]
                else:
                    h[ii] = np.interp(ii, [a, e], [h[a], h[e]])
            if baum is not None:
                d, k = baum.query(q, distance_upper_bound=12.0)
                nah = np.isfinite(d)
                h[nah] = np.maximum(h[nah], L[k[nah]] + 0.5)
            laenge = float(np.hypot(*np.diff(q, axis=0).T).sum())
            if laenge < 100:
                continue
            out.append({"n": ch["n"], "p": np.column_stack([q, h]).astype(np.float32), "laenge": laenge})
    atomar_schreiben(os.path.join(arbeit_ver, "bahn.pkl"), pickle.dumps(out, protocol=4))
    return out


def laden(arbeit_ver):
    with open(os.path.join(arbeit_ver, "bahn.pkl"), "rb") as f:
        return pickle.load(f)


def vec_ergaenzen(ausgabe, kacheln, ketten):
    """`rails` in alle vec-Kacheln schreiben (an der Kachelkante geschnitten, ~20 m ausgedünnt)."""
    bb = np.array([[c["p"][:, 0].min(), c["p"][:, 1].min(), c["p"][:, 0].max(), c["p"][:, 1].max()]
                   for c in ketten], float).reshape(-1, 4)
    n = 0
    for tx, tz in kacheln:
        pfad = os.path.join(ausgabe, "vec", f"{tx}_{tz}.json.gz")
        with gzip.open(pfad, "rb") as f:
            j = json.loads(f.read())
        x0, z0, x1, z1 = welt.kachel_grenzen(tx, tz)
        rails = []
        for i in np.flatnonzero((bb[:, 2] >= x0) & (bb[:, 0] <= x1) & (bb[:, 3] >= z0) & (bb[:, 1] <= z1)):
            c = ketten[i]
            for part in kmod.clip_linie(c["p"].astype(np.float64), x0, z0, x1, z1):
                part = kmod.ausduennen(part)
                if len(part) >= 2:
                    rails.append({"n": c["n"], "p": np.round(part, 1).ravel().tolist()})
        j["rails"] = rails
        n += len(rails)
        gz_schreiben(pfad, json.dumps(j, ensure_ascii=False, separators=(",", ":")).encode("utf-8"))
    return n


def hex_punkte(ketten):
    """Alle Kettenpunkte (x, z) für die Hex-Flags."""
    if not ketten:
        return np.zeros((0, 2))
    return np.concatenate([c["p"][:, :2] for c in ketten]).astype(np.float64)
