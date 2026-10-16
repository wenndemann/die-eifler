#!/usr/bin/env python3
"""Ausschnitt-Prüfsumme nach FORMAT.md aus den Hex-Kacheln einer Datenversion.

Aufruf: python3 tools/map/pruefsumme.py --version V --q Q --r R --size mittel
        python3 tools/map/pruefsumme.py --version V --ort Nideggen --size klein
Dient als Gegenprobe zur Berechnung im Browser.
"""
import argparse
import gzip
import json
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import welt  # noqa: E402

RADIUS = {"klein": 45, "mittel": 60, "gross": 80}
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
FELDER = [("terrain", 1), ("height", 2), ("slope", 1), ("build", 1), ("flags", 1), ("country", 1), ("place", 2)]


def fnv1a(daten, start):
    h = start
    for b in daten:
        h = ((h ^ b) * 0x01000193) & 0xFFFFFFFF
    return h


def hex_kachel(basis, hx, hz, cache):
    k = (hx, hz)
    if k not in cache:
        p = os.path.join(basis, "hex", f"{hx}_{hz}.bin.gz")
        if not os.path.exists(p):
            cache[k] = None
        else:
            raw = gzip.open(p, "rb").read()
            f, o = {}, 0
            for name, sz in FELDER:
                a = np.frombuffer(raw, dtype=np.uint8 if sz == 1 else "<u2", count=4096, offset=o).reshape(64, 64)
                f[name] = a.astype(np.int64)
                o += 4096 * sz
            cache[k] = f
    return cache[k]


def ausschnitt_hexe(q0, r0, radius):
    """Alle Hexe (q, r) mit Hex-Abstand <= radius, r aufsteigend, dann q aufsteigend."""
    out = []
    for r in range(r0 - radius, r0 + radius + 1):
        for q in range(q0 - radius, q0 + radius + 1):
            if welt.hex_abstand(q0, r0, q, r) <= radius:
                out.append((q, r))
    return out


def pruefsumme(basis, version, q0, r0, size):
    radius = RADIUS[size]
    cache = {}
    daten = bytearray(f"{version}|{q0}|{r0}|{radius}".encode("utf-8"))
    for q, r in ausschnitt_hexe(q0, r0, radius):
        col = q + (r - (r & 1)) // 2
        v = None
        if 0 <= r < welt.HEX_ROWS and 0 <= col < welt.HEX_COLS:
            f = hex_kachel(basis, col // 64, r // 64, cache)
            if f is not None:
                lc, lr = col % 64, r % 64
                v = {k: int(a[lr, lc]) for k, a in f.items()}
        if v is None:
            v = {"terrain": 0, "height": 0, "slope": 0, "build": 0, "flags": 16, "country": 0, "place": 0}
        daten += bytes([v["terrain"], v["height"] & 255, v["height"] >> 8, v["slope"], v["build"], v["flags"],
                        v["country"], v["place"] & 255, v["place"] >> 8])
    return f"{fnv1a(daten, 0x811c9dc5):08x}{fnv1a(daten, 0x050c5d1f):08x}"


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--version", help="Datenversion (Standard: aktuell aus versions.json)")
    ap.add_argument("--daten", default=os.path.join(ROOT, "welt-daten"))
    ap.add_argument("--q", type=int)
    ap.add_argument("--r", type=int)
    ap.add_argument("--ort", help="Ortsname statt --q/--r (Mitte = Ortskern-Hex)")
    ap.add_argument("--size", default="mittel", choices=list(RADIUS))
    a = ap.parse_args()
    version = a.version
    if not version:
        version = json.load(open(os.path.join(a.daten, "versions.json"), encoding="utf-8"))["aktuell"]
    basis = os.path.join(a.daten, version)
    q, r = a.q, a.r
    if a.ort:
        orte = json.load(open(os.path.join(basis, "orte.json"), encoding="utf-8"))["orte"]
        treffer = [o for o in orte if o[0] == a.ort]
        if not treffer:
            raise SystemExit(f"Ort {a.ort!r} nicht in orte.json")
        if len(treffer) > 1:
            print("Mehrere Treffer, nehme den ersten:", ", ".join(f"{o[0]} bei {o[7]}" for o in treffer), file=sys.stderr)
        q, r = treffer[0][5], treffer[0][6]
    if q is None or r is None:
        raise SystemExit("--q und --r oder --ort angeben")
    print(f"{version} q={q} r={r} size={a.size}  {pruefsumme(basis, version, q, r, a.size)}")


if __name__ == "__main__":
    main()
