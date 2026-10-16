# Weltdaten – Format (Datenformat 1)

Verbindliche Vorgabe für Konverter (`tools/map/`) und Client (`src/`). Grundlage: Drehbuch 3.1 und 8.1.

## Koordinaten

- Projektion **ETRS89 / UTM 32N (EPSG:25832)** für alles.
- **Welt-Ursprung** `E0 = 266000`, `N0 = 5643000` (NW-Ecke). Weltgröße **126 000 × 138 000 m**
  (Aachen/Maastricht – Trier, Ösling – Rhein bei Andernach).
- **Weltmeter:** `x = E − E0` (nach Osten), `z = N0 − N` (nach Süden). Der Client rendert in
  Ausschnitt-Koordinaten (Weltmeter minus Ausschnitt-Ursprung), damit Float32 genau bleibt.

## Raster-Kacheln

- Kachelgröße **6000 m**, Kachel `(tx, tz)` deckt `x ∈ [6000·tx, 6000·tx+6000)`, `z` ebenso. Welt: 21 × 23 Kacheln.
- **r10** (Darstellung): 600 × 600 Zellen à 10 m. Zelle `(i, j)` hat ihren Mittelpunkt bei
  `x = 6000·tx + 10·i + 5`, `z = 6000·tz + 10·j + 5`. Zeile `j = 0` ist Norden.
- **r40** (Kulisse, grob): 150 × 150 Zellen à 40 m, gleiche Logik.
- Datei `r10/{tx}_{tz}.bin.gz` bzw. `r40/{tx}_{tz}.bin.gz`, gzip, darin hintereinander (little-endian):
  1. **Höhe** `uint16[n·n]`, Dezimeter ü. NN, **zeilenweise Differenzen**: erster Wert jeder Zeile absolut,
     danach `(h[i] − h[i−1]) mod 65536`. (Dekodieren: laufende Summe mod 65536.)
  2. **Bedeckung** `uint8[n·n]`, Index in `manifest.cover`.
  3. **Wasserspiegel** `uint16[n·n]`, Dezimeter ü. NN, 0 = kein stehendes Wasser.
- r40 entsteht aus r10: Höhe Mittelwert, Bedeckung häufigste Klasse, Wasser: Spiegel, wenn ≥ 50 % Wasser.
- Bedeckung `cover`: `["wasser","wiese","acker","wald","heide","moor","fels","siedlung"]`.

## Vektor-Kacheln

`vec/{tx}_{tz}.json.gz`, gzip-JSON, Koordinaten in Weltmetern (0,1 m gerundet):

```json
{ "rivers": [{ "n": "Rur", "k": 0, "w": 16, "p": [x, z, spiegel, ...] }],
  "lakes":  [{ "n": "Rursee", "l": 281.5, "o": [x, z, ...], "h": [[x, z, ...]] }] }
```

- `k`: 0 Fluss, 1 Bach, 2 Kanal; `w` Breite (m); Spiegel in m ü. NN.
- Flüsse und Seen werden **für das ganze Gebiet am Stück** berechnet (Spiegel fällt stromab), dann an der
  Kachelkante geschnitten. Schnittpunkte auf der Kante werden interpoliert, damit Stücke nahtlos aneinanderpassen.

## Hex-Raster und Hex-Kacheln (Simulation)

- **Pointy-top**, Umkreisradius **R = 60 m**, axiale Koordinaten `(q, r)`, weltweit eindeutig.
  Mittelpunkt: `x = R·√3·(q + r/2)`, `z = 1,5·R·r`. Hex `(0,0)` liegt im Welt-Ursprung.
- Versatz-Koordinaten **odd-r**: `col = q + (r − (r & 1)) / 2`, `row = r`. Welt: `row ∈ [0, 1534)`, `col ∈ [0, 1213)`.
- Hex-Kachel `(hx, hz)` = `col ∈ [64·hx, 64·hx+64)`, `row ∈ [64·hz, 64·hz+64)`. Welt: 19 × 24 Hex-Kacheln.
- Datei `hex/{hx}_{hz}.bin.gz`, gzip, **Felder nacheinander** (je 4096 Werte, Index `row_lokal·64 + col_lokal`), little-endian:

| Feld | Typ | Bedeutung |
|---|---|---|
| `terrain` | uint8 | Index in `manifest.hex.terrain`: `wasser, wiese, wald, heide, moor, stein, siedlung` |
| `height` | uint16 | mittlere Geländehöhe des Hex in dm ü. NN |
| `slope` | uint8 | mittlere Hangneigung in Grad (gerundet) |
| `build` | uint8 | Bauplatz: 0 keiner, 1 klein, 2 mittel, 3 groß |
| `flags` | uint8 | Bit 0 Ortskern, Bit 1 Fließgewässer im Hex, Bit 2 Ufer (Nachbar ist Wasser), Bit 3 Staatsgrenze im Hex, Bit 4 keine Weltdaten |
| `country` | uint8 | 0 unbekannt, 1 DE, 2 BE, 3 LU, 4 NL |
| `place` | uint16 | Ortskern: Index+1 in `orte.json` (`orte`), sonst 0 |

- **Alles Ganzzahl, fertig gerechnet.** Der Client rechnet an diesen Werten nichts mit Kommazahlen.
- `siedlung` gibt es nur in Ortskern-Hexen (Drehbuch 3: heutige Häuser fallen weg). Bebaute Flächen
  außerhalb der Ortskerne zählen als `wiese`.
- **Bauplatz:** `wasser`, `stein` → 0. Sonst nach Neigung (größter Höhenunterschied zu den 6 Nachbar-Mittelpunkten,
  umgerechnet in Grad): ≤ 5° groß, ≤ 10° mittel, ≤ 18° klein, sonst 0. `moor` höchstens klein.

## Orte und Übersicht

- `orte.json` (Ortsverzeichnis, unkomprimiert):
  ```json
  { "kinds": ["stadt","dorf","weiler"],
    "orte": [["Gemünd", 1, x, z, country, q, r, "Schleiden"], ...],
    "gewaesser": [["Rursee", x, z], ...] }
  ```
  Je Ort: Name, Art (Index in `kinds`), Weltmeter, Land, Hex `(q, r)` des Ortskerns,
  „bei“-Ort (nächste Stadt, für gleichnamige Orte: „Welches Gemünd? Et jitt zwei.“).
- `uebersicht/hoehe.bin.gz`: uint16 dm, 200-m-Raster über die ganze Welt (630 × 690), Zelle wie bei r10.
- `uebersicht/relief.webp`: Reliefbild, 100 m je Pixel (1260 × 1380), Bedeckung + Schummerung + Wasser.
  Gebiete ohne Daten sind transparent.
- `uebersicht/grenzen.json`: Staatsgrenzen als Linien `[[x, z, x, z, ...], ...]`.

## Datenversion und Manifest

```
welt-daten/                       (lokal, nicht in Git; Vite liefert es unter /welt/ aus)
  versions.json                   { "aktuell": "eifel-2026.10", "versionen": [{ "id", "gebiet", "erstellt" }] }
  eifel-2026.10/
    manifest.json
    orte.json
    uebersicht/ hoehe.bin.gz  relief.webp  grenzen.json
    r10/  r40/  vec/  hex/
```

`manifest.json`:

```json
{ "format": 1, "version": "eifel-2026.10", "gebiet": "welt", "erstellt": "2026-10-16T12:00:00Z",
  "crs": "EPSG:25832", "origin": [266000, 5643000], "size": [126000, 138000],
  "tile": 6000, "tiles": [21, 23], "kacheln": [[tx, tz], ...],
  "hex": { "size": 60, "tile": 64, "tiles": [19, 24], "cols": 1213, "rows": 1534,
           "terrain": ["wasser","wiese","wald","heide","moor","stein","siedlung"],
           "fields": ["terrain","height","slope","build","flags","country","place"],
           "kacheln": [[hx, hz], ...] },
  "cover": ["wasser","wiese","acker","wald","heide","moor","fels","siedlung"],
  "heightRange": [min_m, max_m],
  "quellen": { "tx_tz": ["nrw", "cop"] },
  "files": { "r10/9_4.bin.gz": "<sha256>", ... },
  "credits": ["..."] }
```

- `files`: sha256 je Datei über den **entpackten** Inhalt (bei `.gz` also nach dem Entpacken), damit es
  egal ist, ob ein Server gzip selbst auspackt.
- Versionsname `eifel-JJJJ.MM`, bei Teilgebieten mit Zusatz (`eifel-2026.10-nideggen`).
- Kacheln liegen unter dem Versionspfad und ändern sich nie. `kacheln` listet nur gebaute Kacheln
  (Teilgebiete). Der Client hält Auswahl-Hex samt Kulisse innerhalb der gebauten Kacheln.

## Ausschnitt und Prüfsumme

- Ein Ausschnitt ist `{ version, q, r, size }`, `size` ∈ `klein` (Radius 45 Hexe), `mittel` (60), `gross` (80).
  Das Spielfeld sind alle Hexe mit Hex-Abstand ≤ Radius vom Mittel-Hex. Dazu **2000 m Kulisse** ringsum.
- **Prüfsumme** über die Simulationsdaten: Bytefolge = UTF-8 von `"{version}|{q}|{r}|{radius}"`, danach je Hex
  in der Reihenfolge `r` aufsteigend, dann `q` aufsteigend: `terrain, height & 255, height >> 8, slope, build,
  flags, country, place & 255, place >> 8`.
  Darüber **FNV-1a 32 Bit zweimal** (Startwerte `0x811c9dc5` und `0x050c5d1f`, Primzahl `0x01000193`),
  Ausgabe als 16 Hex-Zeichen (erst der erste, dann der zweite Wert, je 8 Zeichen, Kleinbuchstaben).
- Gespeicherte Ausschnitte (Vorschläge) stehen in `src/map/presets.ts`.
