#!/usr/bin/env python3
"""Schneidet den Karten-Ausschnitt (+ Rand) aus ESA WorldCover 2021 v200 per HTTP-Range aus.

Ausgabe: raw/worldcover_<id>.tif. Quelle © ESA WorldCover, CC BY 4.0.
Aufruf: python3 tools/map/fetch_worldcover.py [--map ID]
Im Agent-Container vorher: CURL_CA_BUNDLE=/root/.ccr/ca-bundle.crt GDAL_HTTP_PROXY=$HTTPS_PROXY
"""
import argparse
import math
import os
import sys

import rasterio
from rasterio.windows import from_bounds

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from build_map import map_config  # noqa: E402

URL = "/vsicurl/https://esa-worldcover.s3.eu-central-1.amazonaws.com/v200/2021/map/ESA_WorldCover_10m_2021_v200_{tile}_Map.tif"
PAD = 0.02


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--map", default="monschau-rursee")
    meta = map_config(ap.parse_args().map)
    lon0, lat0, lon1, lat1 = meta["bbox"]
    # WorldCover-Kacheln sind 3°×3°, benannt nach der SW-Ecke
    tile = f"N{int(math.floor(lat0 / 3) * 3):02d}E{int(math.floor(lon0 / 3) * 3):03d}"
    with rasterio.Env(GDAL_DISABLE_READDIR_ON_OPEN="EMPTY_DIR"):
        with rasterio.open(URL.format(tile=tile)) as src:
            w = from_bounds(lon0 - PAD, lat0 - PAD, lon1 + PAD, lat1 + PAD, src.transform)
            a = src.read(1, window=w)
            prof = src.profile
            prof.update(width=a.shape[1], height=a.shape[0], transform=src.window_transform(w),
                        compress="deflate", tiled=False)
    prof.pop("blockxsize", None)
    prof.pop("blockysize", None)
    out = os.path.join(HERE, "raw", f"worldcover_{meta['id']}.tif")
    with rasterio.open(out, "w", **prof) as d:
        d.write(a, 1)
    print(f"Kachel {tile}, {a.shape[1]}×{a.shape[0]} px -> {out}")


if __name__ == "__main__":
    main()
