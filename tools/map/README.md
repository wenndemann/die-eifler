# Karten-Pipeline (Weltdaten)

`setup.py` lädt die Rohdaten, rechnet eine **Datenversion** der Eifel-Welt und legt sie unter
`welt-daten/<version>/` ab (nicht in Git). Format: [FORMAT.md](FORMAT.md). Hintergrund: Drehbuch 3.1 und 8.1.

Läuft beim Entwickler oder auf einem Server, wenn man eine neue Version will – nie beim Spieler.

## Aufruf

    pip install -r tools/map/requirements.txt
    python3 tools/map/setup.py --gebiet nideggen      # Testgebiet, 18 × 18 km, ~10 min
    python3 tools/map/setup.py --gebiet nordeifel     # Monschau – Düren mit belgischem Venn, ~1 h
    python3 tools/map/setup.py                        # ganze Welt, viele Stunden

| Option | Bedeutung |
|---|---|
| `--gebiet welt\|nordeifel\|nideggen` | Umfang (Kacheln à 6 km). `welt` = 21 × 23 Kacheln, Aachen – Trier – Maria Laach |
| `--version NAME` | Name der Datenversion (Standard `eifel-JJJJ.MM`, bei Teilgebieten mit Zusatz) |
| `--daten DIR` | Ausgabe (Standard `welt-daten/`) |
| `--arbeit DIR` | Arbeitsordner für Zwischenstände und Rohdaten (Standard `tools/map/arbeit/`) |
| `--archiv DIR` | Rohdaten nach Gebrauch dorthin verschieben statt löschen (einmal archivieren, falls ein Dienst wegfällt) |
| `--osm auto\|geofabrik\|overpass` | OSM-Quelle; `auto` versucht Geofabrik, sonst Overpass |
| `--nur-copernicus` | amtliche Höhenmodelle auslassen (schnell, gröber) |
| `--jobs N` | parallele Downloads |
| `--neu` | alles neu rechnen (geladene OSM-Rohdaten bleiben) |

**Unterbrochen?** Einfach noch einmal starten: fertige Stufen und Kacheln werden übersprungen.
Amtliche Rohkacheln werden gelöscht, sobald keine offene Weltkachel sie mehr braucht – so reicht der Platz
auch für die ganze Welt (Arbeitsordner bleibt bei einigen GB, Download insgesamt ~25 GB amtlich + Luxemburg-Ausschnitte).

Stufen: WorldCover → Höhe → OSM → Wasser (für das ganze Gebiet am Stück) → Kacheln (r10, r40, vec) →
Bahnstrecken → Hex-Kacheln → Übersicht und Orte → Manifest (sha256) → `versions.json`.

Werkzeuge:

    python3 tools/map/pruefsumme.py --ort Nideggen --size klein     # Prüfsumme eines Ausschnitts (Gegenprobe zum Browser)
    python3 tools/map/vorschau.py --version V --out bild.png [--mitte x,z --halb m --vec]

## Höhenmodelle und Lizenzen

Amtliche Geländemodelle (DGM, ohne Bäume und Häuser), auf 10 m gemittelt; Lücken füllt Copernicus GLO-30.
Ausgeliefert werden nur abgeleitete Raster, keine Rohdaten.

| Quelle | Auflösung, Kachelung, CRS | Lizenz | Quellenvermerk | Menge für die Welt |
|---|---|---|---|---|
| **NRW DGM1** (Geobasis NRW) | 1 m, 1-km-GeoTIFF, EPSG:25832 | [dl-de/zero-2.0](https://www.govdata.de/dl-de/zero-2-0) | nicht nötig; im Spiel „Geobasis NRW“ | ~4 700 km², ~11 GB |
| **RLP DGM1** (GeoBasis-RLP) | 1 m, 1-km-GeoTIFF, EPSG:25832 + DHHN2016 | [dl-de/by-2.0](https://www.govdata.de/dl-de/by-2-0) | `© GeoBasis-DE / LVermGeoRP <Jahr>, dl-de/by-2-0, www.lvermgeo.rlp.de [Daten bearbeitet]` | ~8 300 km², ~13 GB |
| **Luxemburg LiDAR-MNT 2024** (ACT) | 50 cm, ein COG (40 GB), EPSG:2169, gelesen per HTTP-Range | [CC0](https://creativecommons.org/publicdomain/zero/1.0/) | nicht nötig; im Spiel „ACT Luxemburg“ | ~2 100 km², ~30 GB gelesen |
| **Wallonien MNT 2021–2022** (SPW) | 50 cm, nur Provinz-ZIPs (45 + 52 GB), EPSG:3812 | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) | „Service public de Wallonie (SPW), Relief de la Wallonie – MNT 2021–2022; umgerechnet“ | ~3 000 km² |
| **Copernicus GLO-30** | 30 m, 1°-Kacheln | Copernicus-Lizenz | „© DLR e.V. 2010–2014 und © Airbus Defence and Space GmbH 2014–2018, bereitgestellt unter COPERNICUS durch die EU und ESA“ | 6 Kacheln, ~150 MB |

- **Wallonien ist standardmäßig Copernicus (30 m)** – beschlossen, weil es dort keinen kachelweisen Download gibt.
  Wer es genauer will: GeoTIFFs (beliebiges CRS) nach `tools/map/arbeit/raw/wal/` legen
  (Géoportail „Téléchargement personnalisé“ oder Provinz-ZIP), dann nimmt `setup.py` sie automatisch.
- Weitere Quellen: **ESA WorldCover 2021** (10 m, CC BY 4.0) für die Bedeckung, **OpenStreetMap** (ODbL) für
  Gewässer, Heide, Moor, Steinbrüche, Orte, Staatsgrenzen, Bahnstrecken und Wanderrouten. Straßen werden bewusst
  nicht übernommen (Drehbuch 3).
- Alle Quellen erlauben Archivieren und Weitergeben (dl-de/by und CC BY mit Namensnennung).
- Die Credits im Spiel kommen aus `manifest.json` (je benutzte Quelle).

## Netzwerk

Gebraucht werden: `opengeodata.nrw.de`, `geobasis-rlp.de`, `data.public.lu`/`download.data.public.lu`,
`copernicus-dem-30m.s3.amazonaws.com`, `esa-worldcover.s3.eu-central-1.amazonaws.com`, für OSM
`download.geofabrik.de` oder ein Overpass-Server (`overpass-api.de`, `maps.mail.ru`, `overpass.kumi.systems`).
In Claude-Cloud-Containern ist Geofabrik gesperrt; dann holt `auto` die OSM-Daten über Overpass (dauert länger).
Hinter einem Proxy liest `setup.py` `HTTPS_PROXY` und ein CA-Bundle aus `SSL_CERT_FILE`/`CURL_CA_BUNDLE`.
