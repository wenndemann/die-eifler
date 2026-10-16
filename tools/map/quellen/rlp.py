"""Rheinland-Pfalz: DGM1 (1 m, GeoTIFF, 1-km-Kacheln, EPSG:25832 + DHHN2016-Höhe), GeoBasis-RLP."""
import os
import re

from . import _http

BASIS = "https://geobasis-rlp.de/data/dgm1/current/tif/"


def _mb(s):
    zahl, einheit = float(s[:-1]), s[-1]
    return zahl * {"K": 1 / 1024, "M": 1.0, "G": 1024.0}.get(einheit, 0.0)


class RLP:
    id = "rlp"
    name = "DGM1 Rheinland-Pfalz"
    land = 1
    credit = "© GeoBasis-DE / LVermGeoRP 2026, dl-de/by-2-0, www.lvermgeo.rlp.de [Daten bearbeitet]"
    lizenz = "Datenlizenz Deutschland – Namensnennung – Version 2.0 (dl-de/by-2-0), https://www.govdata.de/dl-de/by-2-0"

    def __init__(self, cache_dir=None):
        self.cache_dir = cache_dir or _http.standard_cache()
        self._index = None

    def _lade_index(self):
        """{ "E_N": [dateiname, MB] } aus der Apache-Verzeichnisliste (9 MB HTML, einmal geladen, dann Cache)."""
        if self._index is None:
            def erzeuge():
                html = _http.text(BASIS, timeout=300).decode("utf-8", "replace")
                aus = {}
                for m in re.finditer(r'<a href="(dgm1_32_(\d+)_(\d+)_1_rp_\d{4}\.tif)"[^<]*</a></td>'
                                     r'<td[^>]*>[^<]*</td><td[^>]*>\s*([\d.]+[KMG])', html):
                    aus[f"{m.group(2)}_{m.group(3)}"] = [m.group(1), round(_mb(m.group(4)), 2)]
                if not aus:
                    raise RuntimeError("RLP-Index: keine Kacheln erkannt (Seitenformat geändert?)")
                return aus
            self._index = _http.index_cache(os.path.join(self.cache_dir, "rlp_index.json"), erzeuge)
        return self._index

    def kacheln(self, bounds):
        idx = self._lade_index()
        return [k for k in (f"{e // 1000}_{n // 1000}" for e, n in _http.km_kacheln(bounds)) if k in idx]

    def groesse_mb(self, kachel_id):
        v = self._lade_index().get(kachel_id)
        return v[1] if v else None

    def laden(self, kachel_id, ziel_dir):
        name = self._lade_index()[kachel_id][0]
        ziel = os.path.join(ziel_dir, name)
        _http.herunterladen(BASIS + name, ziel)
        return [ziel]  # GeoTIFF, EPSG:25832 (zusammengesetztes CRS mit DHHN2016), float32, NoData -9999
