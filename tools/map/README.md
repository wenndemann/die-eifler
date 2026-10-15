# Karten-Pipeline

`build_map.py` erzeugt aus echten Geodaten eine Spielkarte unter `public/maps/<id>/`.

## Rohdaten (nicht im Repo, nach `tools/map/raw/`)

| Datei | Quelle |
|---|---|
| `cop_N50_E006.tif` | Copernicus GLO-30 DEM, Kachel N50 E006: `https://copernicus-dem-30m.s3.amazonaws.com/Copernicus_DSM_COG_10_N50_00_E006_00_DEM/Copernicus_DSM_COG_10_N50_00_E006_00_DEM.tif` |
| `worldcover_monschau.tif` | Ausschnitt aus ESA WorldCover 2021 v200, Kachel N48E006 (per HTTP-Range mit rasterio gelesen, Bbox 6.15–6.55 °O, 50.50–50.69 °N) |
| `osm_monschau-rursee.json` | OpenStreetMap per Overpass (`python3 tools/map/fetch_osm.py`), © OpenStreetMap-Mitwirkende, ODbL |

WorldCover im Agent-Container: per rasterio `/vsicurl/` mit `CURL_CA_BUNDLE=/root/.ccr/ca-bundle.crt`
und `GDAL_HTTP_PROXY=$HTTPS_PROXY` lesen.

`fetch_osm.py` probiert mehrere Overpass-Instanzen nacheinander (overpass-api.de, maps.mail.ru, kumi)
mit Wiederholungen; mit `--endpoint URL` lässt sich eine eigene angeben.
Geholt werden Gewässer (Flächen, Flüsse, Bäche, Kanäle, Wehre, Dämme), Heide, Feuchtgebiete/Moor,
Steinbrüche und benannte Orte (city/town/village/hamlet).

Abhängigkeiten: `pip install numpy scipy rasterio pillow shapely`

## Aufruf

    python3 tools/map/fetch_osm.py                      # einmalig bzw. zum Aktualisieren
    python3 tools/map/build_map.py --preview vorschau.png

## Was aus OSM kommt

- **Seen und Talsperren:** Uferlinie als Polygon (`lakes.json`, im Viewer trianguliert), Spiegel aus dem DSM.
  Uferzellen werden so tief gelegt, dass die Wasserlinie auf der echten Kante liegt.
- **Flüsse und Bäche:** Linien zu Ketten verbunden (Wegrichtung = Fließrichtung, Verrohrungen ausgelassen).
  Spiegel je Punkt per isotoner Regression aus der Talsohle (fällt immer stromab, nie unter einen
  durchflossenen See). Das Bett wird ins Höhenraster gegraben; Ausgabe als `rivers.json`.
- **Heide, Moor, Steinbrüche:** gerastert, überschreiben die WorldCover-Klasse (Heide/Moor auch bei lockerem Wald).
- **Orte:** echte Koordinaten; dazu Namen der großen Seen und Flüsse.

Ohne OSM-Datei fällt der Konverter auf WorldCover-Wasser, die Näherungs-Regionen im Skript und
`places.json` zurück.
