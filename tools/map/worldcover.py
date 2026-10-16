"""Stufe 2: ESA WorldCover 2021 (v200, 10 m) auf das 10-m-UTM-Raster je Kachel (nearest).

Pro Kachel `wc10/{tx}_{tz}.npy`: uint8[640,640] (600 + je 20 Zellen Rand, damit das Ergebnis nicht von
Nachbarkacheln abhängt), Index in welt.COVER. © ESA WorldCover, CC BY 4.0.
"""
import io
import math
import os

import numpy as np
import rasterio
from rasterio.transform import from_origin
from rasterio.warp import Resampling, reproject

import welt
from util import Fortschritt, atomar_schreiben

RANDW = 20   # Zellen Rand je Seite
URL = ("/vsicurl/https://esa-worldcover.s3.eu-central-1.amazonaws.com/v200/2021/map/"
       "ESA_WorldCover_10m_2021_v200_{tile}_Map.tif")
WORLDCOVER = {10: "wald", 20: "heide", 30: "wiese", 40: "acker", 50: "siedlung",
              60: "fels", 70: "fels", 80: "wasser", 90: "moor", 95: "moor", 100: "moor"}
CREDIT = "Landbedeckung: ESA WorldCover 2021 (v200), © ESA, CC BY 4.0"


def lut():
    t = np.full(256, welt.C["wiese"], np.uint8)
    for code, name in WORLDCOVER.items():
        t[code] = welt.C[name]
    return t


def kacheln_fuer(tx, tz):
    """WorldCover-Kacheln (3°×3°, Name nach der SW-Ecke), die die Kachel berühren."""
    lon0, lat0, lon1, lat1 = welt.gebiet_lonlat([(tx, tz)], pad=50)
    out = []
    for la in range(int(math.floor(lat0 / 3)) * 3, int(math.floor(lat1 / 3)) * 3 + 1, 3):
        for lo in range(int(math.floor(lon0 / 3)) * 3, int(math.floor(lon1 / 3)) * 3 + 1, 3):
            out.append(f"N{la:02d}E{lo:03d}")
    return out


def pfad(arbeit, tx, tz):
    return os.path.join(arbeit, "wc10", f"{tx}_{tz}.npy")


def bauen(kacheln, arbeit, neu=False):
    voll = 128 + (welt.N10 + 2 * RANDW) ** 2   # Dateigröße einer vollständigen Kachel (npy-Kopf + Daten)

    def fertig(k):
        p = pfad(arbeit, *k)
        return os.path.exists(p) and os.path.getsize(p) == voll

    todo = [k for k in kacheln if neu or not fertig(k)]
    print(f"WorldCover: {len(kacheln) - len(todo)} fertig, {len(todo)} zu rechnen")
    if not todo:
        return
    fp = Fortschritt("WorldCover", len(todo))
    tabelle = lut()
    offen = {}
    env = dict(GDAL_DISABLE_READDIR_ON_OPEN="EMPTY_DIR", CPL_VSIL_CURL_ALLOWED_EXTENSIONS=".tif",
               VSI_CACHE="TRUE", VSI_CACHE_SIZE="50000000", GDAL_HTTP_MAX_RETRY="5",
               GDAL_HTTP_RETRY_DELAY="3", CPL_CURL_VERBOSE="NO")
    with rasterio.Env(**env):
        for tx, tz in todo:
            e0, n0, e1, n1 = welt.kachel_utm(tx, tz)
            tr = from_origin(e0 - 10 * RANDW, n1 + 10 * RANDW, 10, 10)
            ziel = np.zeros((welt.N10 + 2 * RANDW, welt.N10 + 2 * RANDW), np.uint8)
            for name in kacheln_fuer(tx, tz):
                if name not in offen:
                    offen[name] = rasterio.open(URL.format(tile=name))
                src = offen[name]
                tmp = np.zeros_like(ziel)
                reproject(rasterio.band(src, 1), tmp, dst_transform=tr, dst_crs="EPSG:25832",
                          resampling=Resampling.nearest)
                m = (tmp > 0) & (ziel == 0)
                ziel[m] = tmp[m]
            if not (ziel > 0).all():
                fehl = 100.0 * (ziel == 0).mean()
                if fehl > 50:
                    raise SystemExit(f"WorldCover: Kachel {tx}_{tz} hat {fehl:.0f} % Lücken – Download gestört?")
            cover = tabelle[ziel]
            cover[ziel == 0] = welt.C["wiese"]
            b = io.BytesIO()
            np.save(b, cover)
            atomar_schreiben(pfad(arbeit, tx, tz), b.getvalue())
            fp.schritt(f"Kachel {tx}_{tz}")
        for s in offen.values():
            s.close()


def lader(arbeit):
    """Mosaik-Lader: nur die 600×600 der Kachel selbst."""
    def f(tx, tz):
        p = pfad(arbeit, tx, tz)
        return np.load(p)[RANDW:-RANDW, RANDW:-RANDW] if os.path.exists(p) else None
    return f


def mit_rand(arbeit, tx, tz):
    """Kachel samt 20 Zellen Rand (640×640)."""
    return np.load(pfad(arbeit, tx, tz))
