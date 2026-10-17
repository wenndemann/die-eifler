"""Stufe 7: Übersicht (200-m-Höhen, Reliefbild 100 m/Pixel, Staatsgrenzen) und Ortsverzeichnis."""
import io
import math
import os

import numpy as np
from PIL import Image
from shapely.geometry import LineString

import welt
from util import atomar_schreiben, gz_schreiben, json_schreiben

# Bedeckungsfarben wie COVER_MINI in src/ui/hud.ts
COVER_MINI = ["#3f6f8c", "#86ad4d", "#c2ae63", "#2f5228", "#8d6b80", "#958a5c", "#8e8a82", "#c9bba3"]
KINDS = ["stadt", "dorf", "weiler"]


def hoehe_und_relief(kacheln, fertig, ausgabe):
    """uebersicht/hoehe.bin.gz (200 m) und relief.webp (100 m). Liefert (min_m, max_m)."""
    n200, n100 = welt.N10 // 20, welt.N10 // 10
    W200, H200 = welt.WELT_X // 200, welt.WELT_Z // 200
    W100, H100 = welt.WELT_X // 100, welt.WELT_Z // 100
    h200 = np.zeros((H200, W200), np.uint16)
    cov = np.zeros((H100, W100), np.uint8)
    hm = np.zeros((H100, W100), np.float32)
    ok = np.zeros((H100, W100), bool)
    lo, hi = 1e9, -1e9
    for tx, tz in kacheln:
        d = fertig(tx, tz)
        if d is None:
            continue
        h, c, w = d["hoehe"].astype(np.float64), d["bedeckung"], d["wasser"]
        lo, hi = min(lo, h.min() / 10), max(hi, h.max() / 10)
        h200[tz * n200:(tz + 1) * n200, tx * n200:(tx + 1) * n200] = \
            np.round(h.reshape(n200, 20, n200, 20).mean(axis=(1, 3))).astype(np.uint16)
        # Bedeckung: häufigste Klasse je 10×10; Wasser, wenn >= 50 % Seefläche
        cnt = np.stack([(c == k).reshape(n100, 10, n100, 10).sum(axis=(1, 3)) for k in range(len(welt.COVER))])
        cm = cnt.argmax(axis=0).astype(np.uint8)
        wn = (w > 0).reshape(n100, 10, n100, 10).sum(axis=(1, 3))
        cm[wn >= 50] = welt.C["wasser"]
        hh = np.where(w > 0, w, h).reshape(n100, 10, n100, 10).mean(axis=(1, 3)) / 10.0
        sl = (slice(tz * n100, (tz + 1) * n100), slice(tx * n100, (tx + 1) * n100))
        cov[sl], hm[sl], ok[sl] = cm, hh, True
    gz_schreiben(os.path.join(ausgabe, "uebersicht", "hoehe.bin.gz"), h200.astype("<u2").tobytes())
    # Schummerung wie im HUD (Überhöhung 3)
    g = np.pad(hm, 1, mode="edge")
    dx = (g[1:-1, 2:] - g[1:-1, :-2]) / 200.0 * 3
    dz = (g[2:, 1:-1] - g[:-2, 1:-1]) / 200.0 * 3
    shade = np.clip(0.85 + (-dx - dz) * 0.45 / np.sqrt(1 + dx * dx + dz * dz), 0.45, 1.35)
    pal = np.array([[int(c[i:i + 2], 16) for i in (1, 3, 5)] for c in COVER_MINI], np.float32)
    rgb = np.clip(pal[cov] * shade[..., None], 0, 255).astype(np.uint8)
    img = np.dstack([rgb, np.where(ok, 255, 0).astype(np.uint8)])
    b = io.BytesIO()
    Image.fromarray(img, "RGBA").save(b, "WEBP", quality=85, method=6)
    atomar_schreiben(os.path.join(ausgabe, "uebersicht", "relief.webp"), b.getvalue())
    return (lo if lo < 1e8 else 0.0), (hi if hi > -1e8 else 0.0)


def grenzen(grenzlinien, ausgabe):
    """uebersicht/grenzen.json: Staatsgrenzen, auf ~50 m vereinfacht, ganze Meter."""
    out = []
    for line in grenzlinien:
        ls = LineString(line).simplify(25.0)
        xs, zs = ls.xy
        if max(xs) < 0 or min(xs) > welt.WELT_X or max(zs) < 0 or min(zs) > welt.WELT_Z:
            continue
        out.append([int(round(v)) for xz in zip(xs, zs) for v in xz])
    out.sort()
    json_schreiben(os.path.join(ausgabe, "uebersicht", "grenzen.json"), out)
    return len(out)


def orte_json(orte, orte_roh, labels, kacheln, ausgabe):
    """orte.json. `orte`: Ergebnis der Hex-Stufe (mit q, r, land), `orte_roh` alle Orte (für „bei“)."""
    staedte = [o for o in orte_roh if o["kind"] == "stadt"]
    liste = []
    for o in orte:
        bei = ""
        best = 1e18
        for s in staedte:
            if s["name"] == o["name"] and abs(s["x"] - o["x"]) < 2000 and abs(s["z"] - o["z"]) < 2000:
                continue
            d = math.hypot(s["x"] - o["x"], s["z"] - o["z"])
            if d < best:
                best, bei = d, s["name"]
        liste.append([o["name"], KINDS.index(o["kind"]), o["x"], o["z"], o["land"], o["q"], o["r"], bei])
    ks = set(kacheln)
    gew = sorted([n, x, z] for n, x, z in labels
                 if (int(x // welt.KACHEL), int(z // welt.KACHEL)) in ks)
    json_schreiben(os.path.join(ausgabe, "orte.json"), {"kinds": KINDS, "orte": liste, "gewaesser": gew})
    return len(liste), len(gew)


def wanderwege(routen, ausgabe):
    """uebersicht/wanderwege.json: [{n, ref, netz, p: [[x, z, ...], ...]}]."""
    liste = [{k: w[k] for k in ("n", "ref", "netz", "p")} for w in routen]
    json_schreiben(os.path.join(ausgabe, "uebersicht", "wanderwege.json"), liste)
    return len(liste)
