"""Wallonien: MNT 2021–2022 (50 cm, GeoTIFF, EPSG:3812 bzw. 31370), SPW, CC BY 4.0.

WICHTIG: Der Anbieter bietet KEINE Kacheln, keinen WCS und keinen ImageServer an (nur ArcGIS-MapServer, der
eingefärbte 8-Bit-Bilder liefert, also unbrauchbar). Die offenen Downloads sind Provinz-ZIPs mit je EINER riesigen
GeoTIFF (Provinz Lüttich ~45 GB, Provinz Luxemburg ~52 GB, EPSG:3812); der Server ignoriert Range-Anfragen und liefert
nur ~1,3 MB/s. Deshalb arbeitet dieser Adapter mit lokalen Dateien, die der Nutzer einmal bereitstellt:

    tools/map/arbeit/raw/wal/*.tif | *.vrt     (entpackte Provinz-GeoTIFFs oder ein Gebietsauszug)

Ohne diese Dateien meldet `kacheln()` nichts (leere Liste), und die Pipeline fällt auf Copernicus zurück.
Wege an die Daten (siehe README-Vorschlag): (1) Provinz-ZIPs Lüttich + Luxemburg laden und entpacken,
(2) „Téléchargement personnalisé“ im Géoportail (Ausschnitt, GeoTIFF, EPSG:3812, kommt per E-Mail),
(3) `python3 -m quellen.wal --zip-laden PROVINZ` (Streaming-Download + Entpacken der GeoTIFF; Stunden).

Kacheln: 2 km, EPSG:25832-Gitter, ID "E_N" in km der SW-Ecke; 1 m Zellen (Mittelwert aus 4 Zellen).
"""
import glob
import os

import numpy as np
import rasterio
from rasterio.warp import transform_bounds

from . import _http, _raster

SEITE = 2000
ZIP_BASIS = "https://geoservices.wallonie.be/geotraitement/spwdatadownload/results/a004e570-99d6-4fe5-b83d-49b774409278/"
ZIPS = {
    "LIEGE": "RELIEF_WALLONIE_MNT_50CM_2021_2022_GEOTIFF_3812_PROV_LIEGE.zip",
    "LUXEMBOURG": "RELIEF_WALLONIE_MNT_50CM_2021_2022_GEOTIFF_3812_PROV_LUXEMBOURG.zip",
}


def standard_raw():
    return os.path.join(os.path.dirname(_http.standard_cache()), "raw", "wal")


class WAL:
    id = "wal"
    name = "MNT 2021–2022 Wallonien"
    land = 2
    credit = ("Service public de Wallonie (SPW), Relief de la Wallonie – Modèle Numérique de Terrain (MNT) 2021–2022, "
              "CC BY 4.0, https://geodata.wallonie.be/id/a004e570-99d6-4fe5-b83d-49b774409278 "
              "[auf 1 m umgerechnet, weiter gemittelt]")
    lizenz = "Creative Commons Namensnennung 4.0 (CC BY 4.0), https://creativecommons.org/licenses/by/4.0/"

    def __init__(self, cache_dir=None, raw_dir=None):
        self.cache_dir = cache_dir or _http.standard_cache()
        self.raw_dir = raw_dir or standard_raw()
        self._masken = None  # [(Pfad, Maske, Bounds, CRS)]

    def _dateien(self):
        fs = []
        for ext in ("*.tif", "*.tiff", "*.vrt"):
            fs += glob.glob(os.path.join(self.raw_dir, ext))
        return sorted(fs)

    def verfuegbar(self):
        return bool(self._dateien())

    def _lade_masken(self):
        if self._masken is None:
            self._masken = []
            for p in self._dateien():
                cache = os.path.join(self.cache_dir, "wal_maske_" + os.path.basename(p) + ".npz")
                with _raster.gdal_env(), rasterio.open(p) as s:
                    try:
                        z = np.load(cache)
                        if float(z["mtime"]) != os.path.getmtime(p):
                            raise ValueError
                        m, b = z["maske"], rasterio.coords.BoundingBox(*map(float, z["bounds"]))
                    except (OSError, ValueError, KeyError):
                        m, b = _raster.grob_maske(s, 700)
                        os.makedirs(self.cache_dir, exist_ok=True)
                        np.savez_compressed(cache, maske=m, bounds=np.array(tuple(b)), mtime=os.path.getmtime(p))
                    self._masken.append((p, m, b, s.crs))
        return self._masken

    def kacheln(self, bounds):
        masken = self._lade_masken()
        ids = []
        for e, n in _http.km_kacheln(bounds, SEITE):
            for _p, m, b, crs in masken:
                bb = transform_bounds("EPSG:25832", crs, e - 50, n - 50, e + SEITE + 50, n + SEITE + 50)
                if _raster.maske_trifft(m, b, bb):
                    ids.append(f"{e // 1000}_{n // 1000}")
                    break
        return ids

    def groesse_mb(self, kachel_id):
        return None  # lokale Daten, kein Download

    def laden(self, kachel_id, ziel_dir):
        e, n = (int(v) * 1000 for v in kachel_id.split("_"))
        ziel = os.path.join(ziel_dir, f"wal_dgm_{kachel_id}.tif")
        if os.path.exists(ziel) and os.path.getsize(ziel) > 0:
            return [ziel]
        quellen = []
        with _raster.gdal_env():
            try:
                quellen = [rasterio.open(p) for p in self._dateien()]
                ok = _raster.kachel_schreiben(quellen, e, n, SEITE, ziel, 1.0)
            finally:
                for s in quellen:
                    s.close()
        return [ziel] if ok else []


def zip_laden(provinz, ziel_dir=None):
    """Lädt das Provinz-ZIP als Datenstrom und entpackt die GeoTIFF nach ziel_dir (Standard: arbeit/raw/wal).
    Dauert Stunden (Server ~1,3 MB/s, keine Wiederaufnahme) und braucht ~100 GB Platz je Provinz (ZIP + TIF)."""
    import subprocess
    import zipfile
    ziel_dir = ziel_dir or standard_raw()
    os.makedirs(ziel_dir, exist_ok=True)
    name = ZIPS[provinz.upper()]
    zp = os.path.join(ziel_dir, name)
    if not os.path.exists(zp):
        subprocess.run(["curl", "-fL", "--retry", "5", "--cacert",
                        os.environ.get("SSL_CERT_FILE", _http.CA_CONTAINER), "-o", zp + ".part", ZIP_BASIS + name],
                       check=True)
        os.replace(zp + ".part", zp)
    with zipfile.ZipFile(zp) as z:
        for i in z.infolist():
            if i.filename.lower().endswith(".tif"):
                z.extract(i, ziel_dir)
    os.remove(zp)


if __name__ == "__main__":
    import sys
    if len(sys.argv) == 3 and sys.argv[1] == "--zip-laden":
        zip_laden(sys.argv[2])
    else:
        print("Aufruf: python3 -m quellen.wal --zip-laden LIEGE|LUXEMBOURG")
