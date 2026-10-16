"""Copernicus GLO-30 (30 m, Oberflächenmodell) als Lückenfüller.

Schnittstelle wie die amtlichen Quellen (Duck-Typing): id, name, land, credit, lizenz,
kacheln(bounds) und laden(kachel_id, ziel_dir). bounds = (Emin, Nmin, Emax, Nmax) in EPSG:25832.
"""
import math
import os
import time
import urllib.request

URL = ("https://copernicus-dem-30m.s3.amazonaws.com/Copernicus_DSM_COG_10_{b}_00_{l}_00_DEM/"
       "Copernicus_DSM_COG_10_{b}_00_{l}_00_DEM.tif")
# Kacheln, die die Welt überhaupt berührt
BREITEN = (49, 50)
LAENGEN = (5, 6, 7)


class Copernicus:
    id = "cop"
    name = "Copernicus GLO-30"
    land = None          # gilt für alle Länder
    credit = ("Höhendaten: Copernicus GLO-30 DEM © DLR e.V. 2010–2014 und © Airbus Defence and Space GmbH "
              "2014–2018, bereitgestellt unter COPERNICUS durch die Europäische Union und ESA")
    lizenz = "Copernicus-Lizenz (frei nutzbar mit Quellenangabe)"
    oberflaeche = True   # DSM: Baumkronen müssen herausgerechnet werden

    def kacheln(self, bounds):
        from pyproj import Transformer
        t = Transformer.from_crs(25832, 4326, always_xy=True)
        e0, n0, e1, n1 = bounds
        pts = [(e0, n0), (e1, n0), (e0, n1), (e1, n1), ((e0 + e1) / 2, n0), ((e0 + e1) / 2, n1),
               (e0, (n0 + n1) / 2), (e1, (n0 + n1) / 2)]
        lon, lat = t.transform([p[0] for p in pts], [p[1] for p in pts])
        out = []
        for b in range(int(math.floor(min(lat))), int(math.floor(max(lat))) + 1):
            for l in range(int(math.floor(min(lon))), int(math.floor(max(lon))) + 1):
                if b in BREITEN and l in LAENGEN:
                    out.append(f"N{b:02d}_E{l:03d}")
        return out

    def laden(self, kachel_id, ziel_dir, fortschritt=None):
        b, l = kachel_id.split("_")
        os.makedirs(ziel_dir, exist_ok=True)
        pfad = os.path.join(ziel_dir, f"cop_{kachel_id}.tif")
        if os.path.exists(pfad):
            return [pfad]
        url = URL.format(b=b, l=l)
        letzter = None
        for versuch in range(5):
            try:
                req = urllib.request.Request(url, headers={"User-Agent": "die-eifeler-mapbuild/1.0"})
                with urllib.request.urlopen(req, timeout=120) as r, open(pfad + ".tmp", "wb") as f:
                    while True:
                        blk = r.read(1 << 20)
                        if not blk:
                            break
                        f.write(blk)
                        if fortschritt:
                            fortschritt(len(blk))
                os.replace(pfad + ".tmp", pfad)
                return [pfad]
            except Exception as ex:  # noqa: BLE001
                letzter = ex
                time.sleep(3 * (versuch + 1))
        raise RuntimeError(f"Copernicus {kachel_id}: {letzter}")


COPERNICUS = Copernicus()
