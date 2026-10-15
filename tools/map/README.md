# Karten-Pipeline

`build_map.py` erzeugt aus echten Geodaten eine Spielkarte unter `public/maps/<id>/`.

## Rohdaten (nicht im Repo, nach `tools/map/raw/`)

| Datei | Quelle |
|---|---|
| `cop_N50_E006.tif` | Copernicus GLO-30 DEM, Kachel N50 E006: `https://copernicus-dem-30m.s3.amazonaws.com/Copernicus_DSM_COG_10_N50_00_E006_00_DEM/Copernicus_DSM_COG_10_N50_00_E006_00_DEM.tif` |
| `worldcover_monschau.tif` | Ausschnitt aus ESA WorldCover 2021 v200, Kachel N48E006 (per HTTP-Range mit rasterio gelesen, Bbox 6.15–6.55 °O, 50.50–50.69 °N) |

Abhängigkeiten: `pip install numpy scipy rasterio pillow`

## Aufruf

    python3 tools/map/build_map.py --preview vorschau.png

Orte stehen vorerst als Näherungswerte in `places.json`; Heide/Moor über grobe Regionen im Skript.
Beides wird durch OpenStreetMap-Daten ersetzt, sobald die OSM-Anbindung steht.
