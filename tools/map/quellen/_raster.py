"""Raster-Hilfen für Quellen, die nicht schon als 25832-GeoTIFF-Kacheln vorliegen (Luxemburg, Wallonien)."""
import os

import numpy as np
import rasterio
from rasterio.enums import Resampling
from rasterio.transform import from_origin
from rasterio.warp import reproject, transform_bounds

NODATA = -9999.0
CA_CONTAINER = "/root/.ccr/ca-bundle.crt"


def gdal_env(**extra):
    """rasterio.Env mit CA-Bundle (Proxy-Container) und Wiederholungen für /vsicurl/-Lesen."""
    opt = dict(GDAL_DISABLE_READDIR_ON_OPEN="EMPTY_DIR", CPL_VSIL_CURL_ALLOWED_EXTENSIONS=".tif,.tiff",
               GDAL_HTTP_MAX_RETRY="6", GDAL_HTTP_RETRY_DELAY="2", GDAL_HTTP_TIMEOUT="120",
               GDAL_HTTP_MERGE_CONSECUTIVE_RANGES="YES", VSI_CACHE="TRUE", VSI_CACHE_SIZE="134217728")
    if not os.environ.get("CURL_CA_BUNDLE") and os.path.exists(CA_CONTAINER):
        opt["CURL_CA_BUNDLE"] = CA_CONTAINER
    opt.update(extra)
    return rasterio.Env(**opt)


def kachel_schreiben(quellen, e0, n0, groesse, ziel, aufloesung=1.0):
    """Schneidet die Kachel [e0, e0+groesse) × [n0, n0+groesse) (EPSG:25832) aus den geöffneten Rastern `quellen`
    und schreibt sie als float32-GeoTIFF (EPSG:25832, NoData -9999, Mittelwert beim Verkleinern).
    Liefert False (und schreibt nichts), wenn die Kachel keine gültigen Werte enthält."""
    n = int(round(groesse / aufloesung))
    dst = np.full((n, n), np.nan, dtype="float32")
    tf = from_origin(e0, n0 + groesse, aufloesung, aufloesung)
    for src in quellen:
        if src.crs is None:
            raise ValueError(f"{src.name}: kein CRS")
        bb = transform_bounds("EPSG:25832", src.crs, e0 - 20, n0 - 20, e0 + groesse + 20, n0 + groesse + 20)
        sb = src.bounds
        if bb[2] <= sb.left or bb[0] >= sb.right or bb[3] <= sb.bottom or bb[1] >= sb.top:
            continue
        teil = np.full((n, n), np.nan, dtype="float32")
        reproject(rasterio.band(src, 1), teil, dst_transform=tf, dst_crs="EPSG:25832",
                  src_nodata=src.nodata, dst_nodata=np.nan, resampling=Resampling.average)
        luecke = np.isnan(dst)
        dst[luecke] = teil[luecke]
    ok = np.isfinite(dst) & (dst > -500) & (dst < 5000)
    if not ok.any():
        return False
    dst[~ok] = NODATA
    tmp = ziel + ".part"
    os.makedirs(os.path.dirname(os.path.abspath(ziel)), exist_ok=True)
    with rasterio.open(tmp, "w", driver="GTiff", width=n, height=n, count=1, dtype="float32", crs="EPSG:25832",
                       transform=tf, nodata=NODATA, compress="deflate", predictor=3, tiled=True,
                       blockxsize=256, blockysize=256) as o:
        o.write(dst, 1)
    os.replace(tmp, ziel)
    return True


def grob_maske(src, ziel_zellen=400):
    """Grobe Gültigkeitsmaske (bool) eines Rasters aus einer stark verkleinerten Lesung (nutzt Pyramiden, falls da).
    Rückgabe (maske, Bounds in src.crs)."""
    f = max(1, int(max(src.width, src.height) / ziel_zellen))
    h, w = max(1, src.height // f), max(1, src.width // f)
    a = src.read(1, out_shape=(h, w), resampling=Resampling.nearest, masked=True)
    return (~np.ma.getmaskarray(a)) & (np.ma.getdata(a) > -500), src.bounds


def maske_trifft(maske, bounds, bb):
    """Gibt es in der Grobmaske gültige Zellen im Rechteck bb (xmin, ymin, xmax, ymax im selben CRS)?"""
    h, w = maske.shape
    sx = (bounds.right - bounds.left) / w
    sy = (bounds.top - bounds.bottom) / h
    c0 = max(0, int((bb[0] - bounds.left) // sx))
    c1 = min(w, int((bb[2] - bounds.left) // sx) + 1)
    r0 = max(0, int((bounds.top - bb[3]) // sy))
    r1 = min(h, int((bounds.top - bb[1]) // sy) + 1)
    if c0 >= c1 or r0 >= r1:
        return False
    return bool(maske[r0:r1, c0:c1].any())
