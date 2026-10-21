"""Konstanten und Koordinaten-Helfer der Welt (siehe FORMAT.md).

Alles in ETRS89 / UTM 32N (EPSG:25832). Weltmeter: x = E - E0 (Osten), z = N0 - N (Süden).
"""
import math

import numpy as np

E0, N0 = 266000, 5643000
WELT_X, WELT_Z = 126000, 138000
KACHEL = 6000                     # Raster-Kachel in m
NTX, NTZ = 21, 23                 # Kacheln der Welt
N10, N40 = 600, 150               # Zellen je Kachel
R = 60.0                          # Hex-Umkreisradius (m)
HEX_W = R * math.sqrt(3)          # Hex-Breite
HEX_COLS, HEX_ROWS = 1213, 1534
HEX_TILE = 64
HEX_NTX, HEX_NTZ = 19, 24

COVER = ["wasser", "wiese", "acker", "wald", "heide", "moor", "fels", "siedlung"]
C = {n: i for i, n in enumerate(COVER)}
HEX_TERRAIN = ["wasser", "wiese", "wald", "heide", "moor", "stein", "siedlung"]
H = {n: i for i, n in enumerate(HEX_TERRAIN)}
HEX_FIELDS = ["terrain", "height", "slope", "build", "flags", "country", "place"]
LAENDER = {"DE": 1, "BE": 2, "LU": 3, "NL": 4}
# Startpunkte je Land (lon, lat) als Rückfall für die Landeszuordnung
LAND_START = {1: (6.083, 50.776), 2: (6.036, 50.628), 3: (6.032, 50.054), 4: (5.69, 50.85)}

def _kampagnen_kacheln():
    """Kacheln aller Kampagnen-Etappen (data/kampagne.json): Spielfeld plus 2 km Kulisse je Etappe (ROADMAP M13)."""
    import json
    import os
    pfad = os.path.join(os.path.dirname(__file__), "..", "..", "data", "kampagne.json")
    groessen = {"klein": 45, "mittel": 60, "gross": 80}
    aus = set()
    with open(pfad, encoding="utf-8") as f:
        daten = json.load(f)
    for weg in daten["wege"]:
        for ab in weg["abschnitte"]:
            for e in ab["etappen"]:
                x = HEX_W * (e["q"] + e["r"] / 2)
                z = 1.5 * R * e["r"]
                rad = (groessen[e["groesse"]] + 1) * HEX_W + 2000
                for tz in range(max(0, int((z - rad) // KACHEL)), min(NTZ - 1, int((z + rad) // KACHEL)) + 1):
                    for tx in range(max(0, int((x - rad) // KACHEL)), min(NTX - 1, int((x + rad) // KACHEL)) + 1):
                        aus.add((tx, tz))
    return sorted(aus, key=lambda k: (k[1], k[0]))


GEBIETE = {
    "welt": [(tx, tz) for tz in range(NTZ) for tx in range(NTX)],
    "eifelsteig": _kampagnen_kacheln(),
    "nordeifel": [(tx, tz) for tz in range(0, 8) for tx in range(5, 11)],
    "nideggen": [(tx, tz) for tz in range(3, 6) for tx in range(8, 11)],
}

_T = None


def transformer():
    """lon/lat (WGS84) -> EPSG:25832 (x=Ost, y=Nord)."""
    global _T
    if _T is None:
        from pyproj import Transformer
        _T = Transformer.from_crs(4326, 25832, always_xy=True)
    return _T


_TI = None


def rueck_transformer():
    global _TI
    if _TI is None:
        from pyproj import Transformer
        _TI = Transformer.from_crs(25832, 4326, always_xy=True)
    return _TI


def lonlat_zu_xz(lon, lat):
    e, n = transformer().transform(np.asarray(lon, np.float64), np.asarray(lat, np.float64))
    return e - E0, N0 - n


def xz_zu_lonlat(x, z):
    lon, lat = rueck_transformer().transform(np.asarray(x, np.float64) + E0, N0 - np.asarray(z, np.float64))
    return lon, lat


class WeltProjektor:
    """Wie osm.Projector, aber lon/lat -> Weltmeter (UTM 32N)."""

    def xz(self, lon, lat):
        x, z = lonlat_zu_xz(lon, lat)
        return float(x), float(z)

    def pts(self, geom):
        g = [p for p in geom if p]
        if not g:
            return []
        x, z = lonlat_zu_xz([p["lon"] for p in g], [p["lat"] for p in g])
        return list(zip(x.tolist(), z.tolist()))


def kachel_grenzen(tx, tz):
    """Weltmeter: (x0, z0, x1, z1)."""
    return tx * KACHEL, tz * KACHEL, (tx + 1) * KACHEL, (tz + 1) * KACHEL


def kachel_utm(tx, tz):
    """EPSG:25832: (Emin, Nmin, Emax, Nmax)."""
    x0, z0, x1, z1 = kachel_grenzen(tx, tz)
    return E0 + x0, N0 - z1, E0 + x1, N0 - z0


def gebiet_utm(kacheln, pad=0):
    xs = [k[0] for k in kacheln]
    zs = [k[1] for k in kacheln]
    return (E0 + min(xs) * KACHEL - pad, N0 - (max(zs) + 1) * KACHEL - pad,
            E0 + (max(xs) + 1) * KACHEL + pad, N0 - min(zs) * KACHEL + pad)


def gebiet_lonlat(kacheln, pad=0):
    e0, n0, e1, n1 = gebiet_utm(kacheln, pad)
    xs = [e0, e1, e0, e1]
    ns = [n0, n0, n1, n1]
    # Kanten mitnehmen (Konvergenz): zusätzlich Mittelpunkte
    xs += [(e0 + e1) / 2] * 2 + [e0, e1]
    ns += [n0, n1] + [(n0 + n1) / 2] * 2
    lon, lat = rueck_transformer().transform(np.array(xs), np.array(ns))
    return float(lon.min()), float(lat.min()), float(lon.max()), float(lat.max())


# ---------------------------------------------------------------- Hex-Mathematik
def hex_mitte(q, r):
    """axial (q, r) -> Weltmeter."""
    return HEX_W * (q + r / 2.0), 1.5 * R * r


def odd_r(col, row):
    """Versatz (col, row) -> axial (q, r)."""
    return col - (row - (row & 1)) // 2, row


def hex_mitte_cr(col, row):
    """Mittelpunkt eines Versatz-Hex (Arrays erlaubt)."""
    col = np.asarray(col)
    row = np.asarray(row)
    return HEX_W * (col + (row & 1) / 2.0), 1.5 * R * row


def xz_zu_hex(x, z):
    """Weltmeter -> axiales Hex (q, r) (Rundung über Kubus-Koordinaten)."""
    x = np.asarray(x, np.float64)
    z = np.asarray(z, np.float64)
    qf = (x / HEX_W) - (z / (1.5 * R)) / 2.0
    rf = z / (1.5 * R)
    sf = -qf - rf
    q, r, s = np.round(qf), np.round(rf), np.round(sf)
    dq, dr, ds = np.abs(q - qf), np.abs(r - rf), np.abs(s - sf)
    fix_q = (dq > dr) & (dq > ds)
    fix_r = ~fix_q & (dr > ds)
    q = np.where(fix_q, -r - s, q)
    r = np.where(fix_r, -q - s, r)
    return q.astype(np.int64), r.astype(np.int64)


def hex_abstand(q0, r0, q1, r1):
    dq, dr = q1 - q0, r1 - r0
    return (abs(dq) + abs(dr) + abs(dq + dr)) // 2


# pointy-top Nachbarn (axial)
HEX_NACHBARN = [(1, 0), (1, -1), (0, -1), (-1, 0), (-1, 1), (0, 1)]


def hex_nachbarn_cr(col, row):
    """Versatz-Nachbarn (6) von (col,row) (Arrays), Reihenfolge wie HEX_NACHBARN."""
    col = np.asarray(col)
    row = np.asarray(row)
    odd = row & 1
    out = []
    for dq, dr in HEX_NACHBARN:
        q = col - (row - odd) // 2 + dq
        r = row + dr
        out.append((q + (r - (r & 1)) // 2, r))
    return out


def hex_gueltig(col, row):
    return (col >= 0) & (col < HEX_COLS) & (row >= 0) & (row < HEX_ROWS)


def gebaute_hexkacheln(kacheln):
    """Hex-Kacheln, die eine gebaute Raster-Kachel berühren (Obermenge, Prüfung später)."""
    ks = set(kacheln)
    out = []
    for hz in range(HEX_NTZ):
        for hx in range(HEX_NTX):
            x0 = hx * HEX_TILE * HEX_W
            x1 = (hx * HEX_TILE + HEX_TILE) * HEX_W
            z0 = hz * HEX_TILE * 1.5 * R
            z1 = (hz * HEX_TILE + HEX_TILE) * 1.5 * R
            tx0, tx1 = int(x0 // KACHEL), int(min(x1, WELT_X - 1) // KACHEL)
            tz0, tz1 = int(z0 // KACHEL), int(min(z1, WELT_Z - 1) // KACHEL)
            if any((tx, tz) in ks for tx in range(tx0, tx1 + 1) for tz in range(tz0, tz1 + 1)):
                out.append((hx, hz))
    return out


def gebiet_kacheln(name):
    if name not in GEBIETE:
        raise SystemExit(f"Unbekanntes Gebiet {name!r}, vorhanden: {', '.join(GEBIETE)}")
    return list(GEBIETE[name])
