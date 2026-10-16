"""NRW: DGM1 (1 m, GeoTIFF, 1-km-Kacheln, EPSG:25832), Open Data Geobasis NRW."""
import json
import os

from . import _http

BASIS = "https://www.opengeodata.nrw.de/produkte/geobasis/hm/dgm1_tiff/dgm1_tiff/"


class NRW:
    id = "nrw"
    name = "DGM1 NRW"
    land = 1
    credit = "Geobasis NRW, Land NRW (Datenlizenz Deutschland – Zero – Version 2.0), Digitales Geländemodell 1 m"
    lizenz = "Datenlizenz Deutschland – Zero – Version 2.0 (dl-de/zero-2.0), https://www.govdata.de/dl-de/zero-2-0"

    def __init__(self, cache_dir=None):
        self.cache_dir = cache_dir or _http.standard_cache()
        self._index = None

    def _lade_index(self):
        """{ "E_N": [dateiname, bytes] } aus dem Verzeichnis-Index des Anbieters (einmal geladen, dann Cache)."""
        if self._index is None:
            def erzeuge():
                d = json.loads(_http.text(BASIS + "index.json", timeout=180))
                aus = {}
                for ds in d["datasets"]:
                    for f in ds["files"]:
                        n = f["name"]
                        if not n.endswith(".tif"):
                            continue
                        t = n.split("_")  # dgm1_32_280_5652_1_nw_2022.tif
                        aus[f"{t[2]}_{t[3]}"] = [n, int(f["size"])]
                return aus
            self._index = _http.index_cache(os.path.join(self.cache_dir, "nrw_index.json"), erzeuge)
        return self._index

    def kacheln(self, bounds):
        idx = self._lade_index()
        ids = []
        for e, n in _http.km_kacheln(bounds):
            k = f"{e // 1000}_{n // 1000}"
            if k in idx:
                ids.append(k)
        return ids

    def groesse_mb(self, kachel_id):
        v = self._lade_index().get(kachel_id)
        return v[1] / 1e6 if v else None

    def laden(self, kachel_id, ziel_dir):
        name = self._lade_index()[kachel_id][0]
        ziel = os.path.join(ziel_dir, name)
        _http.herunterladen(BASIS + name, ziel)
        return [ziel]  # GeoTIFF, EPSG:25832, float32, NoData -9999
