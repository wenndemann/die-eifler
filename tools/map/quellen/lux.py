"""Luxemburg: LiDAR-DGM 2024 (50 cm, Cloud Optimized GeoTIFF, LUREF EPSG:2169), data.public.lu, CC0.

Der Anbieter liefert eine einzige 40-GB-Datei (COG). Der Adapter liest per HTTP-Range nur das Nötige und schneidet
2-km-Kacheln (EPSG:25832-Gitter, ID "E_N" in km der SW-Ecke) mit 1 m Zellen heraus (Mittelwert aus 4 Zellen).
"""
import os

import numpy as np
import rasterio
from rasterio.warp import transform_bounds

from . import _http, _raster

URL = ("https://download.data.public.lu/resources/bd-l-lidar2024-releve-3d-du-territoire-luxembourgeois/"
       "20241223-093912/MNT_Lidar2024.tif")
SEITE = 2000  # m


class LUX:
    id = "lux"
    name = "LiDAR-DGM 2024 Luxemburg"
    land = 3
    credit = "Administration du cadastre et de la topographie (ACT), Luxemburg, LiDAR 2024 MNT (CC0), data.public.lu"
    lizenz = "CC0 1.0 (Creative Commons Zero), https://creativecommons.org/publicdomain/zero/1.0/"

    def __init__(self, cache_dir=None, url=URL):
        self.cache_dir = cache_dir or _http.standard_cache()
        self.url = url
        self._maske = None

    def _vsi(self):
        return "/vsicurl/" + self.url

    def _lade_maske(self):
        """Grobe Gültigkeitsmaske des COG (aus der gröbsten Pyramide), einmal berechnet und gecacht."""
        if self._maske is None:
            pfad = os.path.join(self.cache_dir, "lux_maske.npz")
            try:
                z = np.load(pfad)
                self._maske = (z["maske"], rasterio.coords.BoundingBox(*map(float, z["bounds"])))
            except (OSError, ValueError, KeyError):
                def lesen():
                    with _raster.gdal_env(), rasterio.open(self._vsi()) as s:
                        return _raster.grob_maske(s, 700)
                m, b = _http.mit_wiederholung(lesen, 4, 3.0)
                os.makedirs(self.cache_dir, exist_ok=True)
                np.savez_compressed(pfad, maske=m, bounds=np.array(tuple(b)))
                self._maske = (m, b)
        return self._maske

    def kacheln(self, bounds):
        m, b = self._lade_maske()
        e0, n0, e1, n1 = bounds
        ids = []
        for e, n in _http.km_kacheln(bounds, SEITE):
            bb = transform_bounds("EPSG:25832", "EPSG:2169", e - 50, n - 50, e + SEITE + 50, n + SEITE + 50)
            if _raster.maske_trifft(m, b, bb):
                ids.append(f"{e // 1000}_{n // 1000}")
        return ids

    def groesse_mb(self, kachel_id):
        return 8.0  # Größe der fertigen 2-km-Kachel (1 m, float32); gelesen werden dabei grob 15 MB/km² 50-cm-Rohdaten

    def laden(self, kachel_id, ziel_dir):
        e, n = (int(v) * 1000 for v in kachel_id.split("_"))
        ziel = os.path.join(ziel_dir, f"lux_dgm_{kachel_id}.tif")
        if os.path.exists(ziel) and os.path.getsize(ziel) > 0:
            return [ziel]

        def schneiden():
            with _raster.gdal_env(), rasterio.open(self._vsi()) as s:
                return _raster.kachel_schreiben([s], e, n, SEITE, ziel, 1.0)
        ok = _http.mit_wiederholung(schneiden, 5, 3.0)
        return [ziel] if ok else []
