#!/usr/bin/env python3
"""Vorschau-PNG aus den r10-Kacheln einer Datenversion (Bedeckung + Schummerung).

Aufruf: python3 tools/map/vorschau.py --version V --out bild.png [--schritt 2] [--daten welt-daten]
Testet nebenbei, dass Kachelnähte unsichtbar und Flüsse durchgehend sind.
"""
import argparse
import gzip
import json
import os

import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
COVER_MINI = ["#3f6f8c", "#86ad4d", "#c2ae63", "#2f5228", "#8d6b80", "#958a5c", "#8e8a82", "#c9bba3"]


def lesen(pfad, n=600):
    raw = gzip.open(pfad, "rb").read()
    h = np.frombuffer(raw, "<u2", n * n).reshape(n, n).astype(np.int64)
    h = np.cumsum(h, axis=1) & 0xFFFF
    c = np.frombuffer(raw, np.uint8, n * n, n * n * 2).reshape(n, n)
    w = np.frombuffer(raw, "<u2", n * n, n * n * 3).reshape(n, n)
    return h, c, w


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--version", required=True)
    ap.add_argument("--daten", default=os.path.join(ROOT, "welt-daten"))
    ap.add_argument("--out", required=True)
    ap.add_argument("--schritt", type=int, default=1, help="jede n-te Zelle (Verkleinerung)")
    ap.add_argument("--mitte", help="Ausschnitt um Weltmeter x,z (z. B. 57500,17000)")
    ap.add_argument("--halb", type=float, default=2500, help="halbe Ausschnittsbreite in m (mit --mitte)")
    ap.add_argument("--vec", action="store_true", help="Flüsse/Bäche (blau, Linien) und Bahn (rot) aus vec/ einzeichnen")
    a = ap.parse_args()
    basis = os.path.join(a.daten, a.version)
    man = json.load(open(os.path.join(basis, "manifest.json"), encoding="utf-8"))
    ks = [tuple(k) for k in man["kacheln"]]
    tx0, tx1 = min(k[0] for k in ks), max(k[0] for k in ks)
    tz0, tz1 = min(k[1] for k in ks), max(k[1] for k in ks)
    N = 600
    H = np.zeros(((tz1 - tz0 + 1) * N, (tx1 - tx0 + 1) * N))
    Cv = np.zeros(H.shape, np.uint8)
    W = np.zeros(H.shape, np.uint16)
    ok = np.zeros(H.shape, bool)
    for tx, tz in ks:
        h, c, w = lesen(os.path.join(basis, "r10", f"{tx}_{tz}.bin.gz"))
        s = (slice((tz - tz0) * N, (tz - tz0 + 1) * N), slice((tx - tx0) * N, (tx - tx0 + 1) * N))
        H[s], Cv[s], W[s], ok[s] = h / 10.0, c, w, True
    cell = 10.0
    gz, gx = np.gradient(H * 2.5, cell)
    shade = np.clip(0.75 + (-gx * 0.6 - gz * 0.6) / np.sqrt(1 + gx * gx + gz * gz) * 0.6, 0.35, 1.3)
    pal = np.array([[int(c[i:i + 2], 16) for i in (1, 3, 5)] for c in COVER_MINI], np.float32)
    cov = np.where(W > 0, 0, Cv)
    img = np.clip(pal[cov] * shade[..., None], 0, 255).astype(np.uint8)
    img[~ok] = 0
    st = a.schritt
    ox, oz = tx0 * 6000, tz0 * 6000       # Weltmeter der linken oberen Ecke des Bildes
    if a.mitte:
        from PIL import ImageDraw
        mx, mz = (float(v) for v in a.mitte.split(","))
        x0, z0 = int((mx - a.halb - ox) / 10), int((mz - a.halb - oz) / 10)
        n = int(2 * a.halb / 10)
        im = Image.fromarray(img).crop((x0, z0, x0 + n, z0 + n))
        zoom = max(1, 1000 // n)
        im = im.resize((n * zoom, n * zoom), Image.NEAREST)
        if a.vec:
            dr = ImageDraw.Draw(im)
            f = zoom / 10.0
            for tx, tz in ks:
                vj = json.loads(gzip.open(os.path.join(basis, "vec", f"{tx}_{tz}.json.gz")).read())
                for r in vj["rivers"]:
                    p = r["p"]
                    xy = [((p[i] - ox) / 10 - x0) * zoom for i in range(0, len(p), 3)]
                    zz = [((p[i + 1] - oz) / 10 - z0) * zoom for i in range(0, len(p), 3)]
                    dr.line(list(zip(xy, zz)), fill=(40, 120, 255) if r["k"] == 0 else (0, 220, 255), width=3 if r["k"] == 0 else 2)
                for r in vj.get("rails", []):
                    p = r["p"]
                    xy = [((p[i] - ox) / 10 - x0) * zoom for i in range(0, len(p), 3)]
                    zz = [((p[i + 1] - oz) / 10 - z0) * zoom for i in range(0, len(p), 3)]
                    dr.line(list(zip(xy, zz)), fill=(230, 40, 40), width=2)
        im.save(a.out)
        print(f"{a.out}: {im.size[0]}×{im.size[1]} px")
        return
    Image.fromarray(img[::st, ::st]).save(a.out)
    print(f"{a.out}: {img[::st, ::st].shape[1]}×{img[::st, ::st].shape[0]} px")


if __name__ == "__main__":
    main()
