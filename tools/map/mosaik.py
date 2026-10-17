"""Mosaik-Leser: beliebige Fenster (globale 10-m-Zellindizes) aus Kachel-Dateien lesen.

Zelle (i, j) hat ihren Mittelpunkt bei x = 10·i + 5, z = 10·j + 5 (Weltmeter).
Fehlende Kacheln liefern `fuell` und `gueltig = False`.
"""
from collections import OrderedDict

import numpy as np
from scipy import ndimage

from welt import N10, NTX, NTZ


class Mosaik:
    def __init__(self, lader, dtype, fuell, cache=16, extra=()):
        """lader(tx, tz) -> Array (600×600) oder None."""
        self.lader, self.dtype, self.fuell, self.extra = lader, np.dtype(dtype), fuell, tuple(extra)
        self.cache, self.max = OrderedDict(), cache

    def kachel(self, tx, tz):
        if not (0 <= tx < NTX and 0 <= tz < NTZ):
            return None
        k = (tx, tz)
        if k in self.cache:
            self.cache.move_to_end(k)
            return self.cache[k]
        a = self.lader(tx, tz)
        self.cache[k] = a
        if len(self.cache) > self.max:
            self.cache.popitem(last=False)
        return a

    def fenster(self, i0, j0, w, h):
        out = np.full((h, w) + self.extra, self.fuell, self.dtype)
        ok = np.zeros((h, w), bool)
        for tz in range(max(0, j0 // N10), min(NTZ - 1, (j0 + h - 1) // N10) + 1):
            for tx in range(max(0, i0 // N10), min(NTX - 1, (i0 + w - 1) // N10) + 1):
                a = self.kachel(tx, tz)
                if a is None:
                    continue
                gi0, gj0 = tx * N10, tz * N10
                a0, a1 = max(i0, gi0), min(i0 + w, gi0 + N10)
                b0, b1 = max(j0, gj0), min(j0 + h, gj0 + N10)
                out[b0 - j0:b1 - j0, a0 - i0:a1 - i0] = a[b0 - gj0:b1 - gj0, a0 - gi0:a1 - gi0]
                ok[b0 - j0:b1 - j0, a0 - i0:a1 - i0] = True
        return out, ok


def nachbar_fuellen(a, ok):
    """Ungültige Zellen mit dem Wert der nächsten gültigen belegen (Gebietsrand fortsetzen)."""
    if ok.all() or not ok.any():
        return a
    _, (ii, jj) = ndimage.distance_transform_edt(~ok, return_indices=True)
    return a[ii, jj]
