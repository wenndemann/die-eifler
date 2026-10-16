# ROADMAP – Die Eifeler

> **Hinweis:** Ab M3 wird die Roadmap nach dem neuen [Drehbuch](DREHBUCH.md) überarbeitet. M1 bleibt gültig, M2 ist schon an die freie Kartenwahl (Drehbuch 3.1, 8.1) angepasst.

Reihenfolge der Meilensteine. Jeder endet mit einem **lauffähigen, vorzeigbaren Stand** und einer Abnahme.
Regeln und Zahlen stehen in [DESIGN.md](DESIGN.md).

Leitidee: **erst die Welt, dann die Wirtschaft.** Die echte Eifel ist das Fundament. Optik und Leistung werden von Anfang an mitgebaut und nicht am Ende nachgerüstet.

---

## M1 – Die Karte ✅ (erster Stand) → 🔨 Feinschliff

**Ziel:** Das Monschauer Land mit dem Rursee als schöne, flüssige 3D-Karte.

Erledigt:
- [x] Vite + TypeScript + Three.js
- [x] Konverter `tools/map/build_map.py`: Copernicus GLO-30 + ESA WorldCover → Höhe, Bedeckung, Wasser, Hex-Gelände
- [x] Gelände in Chunks mit 4 LOD-Stufen und Schürzen, Vertex-Farben, eingebackene Verschattung, Feinstruktur
- [x] Talsperren und Seen mit ebenem Spiegel, Tiefenfarbe, Schaum und Wellen
- [x] Wald (Fichte/Buche) und Häuser per Instancing, Wind, Schatten
- [x] Strategie-Kamera, Hex-Hover mit Info, Ortsnamen, Minimap, Überhöhungs-Regler, Hex-Raster (G), Leistungsanzeige (F3)
- [x] **OpenStreetMap eingebunden** (`tools/map/fetch_osm.py`): Rur und Bäche als Flüsse, echte Heide- und Moorflächen (Hohes Venn), Steinbrüche, Orte mit echten Koordinaten (`places.json` nur noch Fallback)
- [x] Flüsse als eigene Wasserbänder mit Strömung und Stromschnellen, Bett ins Gelände gegraben (keine Raster-Treppen)
- [x] Seen und Talsperren mit echter OSM-Uferlinie (Polygon statt Raster)

Offen:
- [ ] Maßstab: Häuser und Bäume im Spiel-Maßstab aufeinander abstimmen
- [ ] Hecken im Monschauer Heckenland an Feldgrenzen (Kulisse)
- [ ] Post-Processing: SSAO, dezentes Bloom, Farb-Grading, Qualitätsstufen
- [ ] Talnebel (Höhennebel im Shader)
- [ ] Leistungsmessung auf echter Hardware: 60 fps bei „Mittel“ nachweisen
- [ ] Playwright-Smoke-Test: Karte lädt, Screenshots aus 3 festen Kamerapositionen

**Abnahme:** Rursee, Obersee, Urftsee, Rur durch Monschau und Hohes Venn sind klar erkennbar. Mit F3 zeigt sich 60 fps bei „Mittel“. Die Screenshots sind auf der Projektseite vorzeigbar.

---

## M2 – Eifel-Weltkarte und freie Kartenwahl

**Ziel:** die ganze Eifel (Aachen – Trier – Maria Laach, mit Ostbelgien und Nord-Luxemburg) als Weltkarte. Man wählt Größe und Ort und spielt genau dort (Drehbuch 3.1 und 8.1).

- [x] Karten als Konfiguration im Konverter (`MAPS` in `build_map.py`, `--map <id>`), Kartenwahl im Viewer (`#id`)
- [x] Zweite Karte: **Rureifel & Dürener Land** (Heimbach – Nideggen – Kreuzau – Düren)
- [x] Teilen-Version für Handy/Tablet (`npm run build:share`), Touch-Steuerung
- [ ] Pipeline auf die ganze Welt: UTM 32N, 6 DEM-Kacheln (N49/N50 × E005–E007), WorldCover N48E003 + N48E006, OSM aus Geofabrik-Auszügen
- [ ] Flüsse, Talsperren und Flussbetten für die ganze Welt am Stück, danach in Kacheln (~6 × 6 km) schneiden
- [ ] Globales Hex-Raster (60 m), Simulationsdaten als Ganzzahl-Hex-Kacheln
- [ ] Datenversion mit Manifest und Prüfsummen, versionierte Pfade, Auslieferung außerhalb von Git
- [ ] Übersichtskarte (~200 m Raster, Relief, Orte, Staatsgrenzen) und Ortsverzeichnis
- [ ] Kartenwahl: Größe klein/mittel/groß, Auswahl-Hex verschieben, Ortssuche, Startplätze anzeigen
- [ ] Client schneidet den Ausschnitt aus den Kacheln, Kulisse am Rand, Browser-Cache
- [ ] Prüfsumme über die Simulationsdaten des Ausschnitts
- [ ] `monschau-rursee` und `rureifel` als gespeicherte Ausschnitte
- [ ] `data/regions.json`: Völkchen, Boni, Startwaren, Sprüche (Drehbuch Kapitel 5)
- [ ] Übergang Übersicht → Ausschnitt (Kamerafahrt)

**Abnahme:** Auf der Übersicht „mittel“ wählen, „Gemünd“ eintippen, der Ausschnitt lädt in unter 5 Sekunden. Zwei Browser bekommen für dieselben Parameter dieselbe Prüfsumme. Ein Ausschnitt über die belgische Grenze funktioniert.

---

## M3 – Wegenetz und Träger

**Ziel:** das Herz von Siedler – Fahnen, Wege, Träger, sichtbare Waren – auf der echten Karte.

- [ ] `src/sim/` mit festem Tick (20/s), serialisierbarem State, deterministischem Zufall
- [ ] Dorfkern (Lager) als Startgebäude, erste prozedurale Gebäudemodelle (Fachwerk, 3 Bauphasen)
- [ ] Fahnen (Gebäude- und freie), Wegbau Fahne → Fahne mit Vorschau, Segmente, Teilung
- [ ] Weg-Darstellung als Erdpfad, der sich ins Gelände schmiegt (Decal oder Band-Mesh)
- [ ] Träger mit Laufanimation, sichtbarer Ware, Stapel an Fahnen
- [ ] Routing nach DESIGN §4.4: Dijkstra mit Steigung, monoton, Tausch, Rückstau, Reservierungen, Neu-Routing
- [ ] ⚠ bei getrennten Gebäuden
- [ ] Unit-Tests der Logistik: Verklemmungs-Szenarien, Ringnetz, Abriss mitten im Transport

**Abnahme:** Ein Netz mit 30 Segmenten läuft 10 Minuten ohne Verklemmung. Getrennte Gebäude zeigen ⚠.

---

## M4 – Wirtschafts-Kern

**Ziel:** Bauen kostet Material, die Holz- und die Steinkette tragen das Wachstum.

- [ ] Baustellen: Bedarf statt Sofortkosten, Einzel-Lieferung, Bau-Aktion, Priorität
- [ ] Holzkette (Holzfäller, Förster, Sägewerk), Bäume als Zustand (`state.trees`), aus dem Kartenwald übernommen
- [ ] Steinkette mit endlichen Felsen (`state.rocks`)
- [ ] Input-Puffer, Lager-Auslieferung (Pull)
- [ ] Abriss nach DESIGN §4.7
- [ ] Baumenü (erste Version) mit Geistermodell und Bauvorschau

**Abnahme:** Aus 12 Brettern und 8 Steinen entsteht ohne Eingriff ins Lager eine laufende Holzwirtschaft. Holzfäller und Förster nebeneinander liefern nach 2 Minuten weiter Stämme.

---

## M5 – Bevölkerung, Nahrung, Kirmes

**Ziel:** Die erste **spaßige Spielschleife** – Nahrung lässt das Dorf wachsen, die Kirmes gibt ein Ziel.

- [ ] Hütte mit Wohnraum, Einwohner aus Nahrung (3 Stufen), Notnagel
- [ ] Ketten: Kartoffel, Käse, Most, Honig
- [ ] Kirmesplatz und Kirmes-Stufe 1 mit Fest-Animation und Freischaltungen
- [ ] Erste Meldungen (Toasts) und Zustand-Klartext über Gebäuden

**Abnahme:** Ein Testspieler erreicht in 30–45 Minuten die erste Kirmes, ohne die Regeln erklärt zu bekommen.

---

## M6 – Oberfläche und Spielsteuerung

**Ziel:** AAA-Bedienung – alles sichtbar, alles erklärbar.

- [ ] Fenster-System (verschiebbar, anpinnbar, Esc, Live-Daten)
- [ ] Gebäude-, Fahnen-, Träger- und Lagerfenster (datengetrieben)
- [ ] Baumenü mit Gruppen, Tooltips, Begründungen, Tastenkürzeln
- [ ] Icons aus den 3D-Modellen rendern
- [ ] Warenübersicht (W), Statistik (S), Ereignisprotokoll (L)
- [ ] Einstellungen (Grafik, Oberfläche, Steuerung, Spiel), Spieltempo und Pause
- [ ] **Speichern und Laden** (State als JSON mit Version) plus Autosave

**Abnahme:** Jedes Gebäude hat ein funktionierendes Fenster ohne Sondercode. Ein Spielstand übersteht das Neuladen. Mit 5 offenen Fenstern bleibt das Leistungsbudget eingehalten.

---

## M7 – Erkundung und Gebiet

**Ziel:** Das Land erobern – Nebel, Hecke, mehrere Dörfer.

- [ ] Nebel mit Kartenpapier-Optik, Sichtradien, dauerhafte Entdeckung
- [ ] Gebiet und Buchenhecke (Wachstum, Gatter, Verdorren), Bauregeln „gesichert“
- [ ] Heckenhof, Baumschule, Ausguck
- [ ] Dorfgründung an echten Orten, mehrere Lager, Lager-Einstellungen pro Ware

**Abnahme:** Von einem Dorf aus wird ein zweites Dorf gegründet und per Feldweg versorgt. Die Hecke wächst nur mit Setzlingen.

---

## M8 – Regionale Wirtschaft

**Ziel:** Jede Region spielt sich anders.

- [ ] Spezialketten der Völkchen: Tuch und Senf (Monschau), Fisch (Rursee), Sprudel und Basalt (Vulkaneifel), Wein (Ahr), Mühlstein und Schiefer (Mayen), Bier (Südeifel)
- [ ] Kirmes-Stufen 2 und 3
- [ ] Schnaps-Kette (Wacholder, Torf, Brennerei) und Schänke
- [ ] Weitere Regionen als Spielkarten

---

## M9 – Finderei, Nachbarn, Großer Fund

- [ ] Flachländer-Dörfer an echten größeren Orten am Kartenrand
- [ ] Finderhütte, Ausredenstube, Fundbüro, Schatzhöhle
- [ ] Beschwipste Boten (eigene Einheit, querfeldein, Risiken)
- [ ] Spielziel „Der Große Fund“ mit Abschluss-Bildschirm und Statistik

---

## M10 – Atmosphäre und Veröffentlichung

- [ ] Tageszeiten, Wetter (Talnebel, Regen, Wolkenschatten), Jahreszeiten-Optik
- [ ] Sound und Musik, räumliche Geräusche
- [ ] Startmenü, Credits mit Quellenangaben, Kampagne über die Eifel-Übersicht
- [ ] Leistungsdurchgang, Qualitätsstufen auf echter Hardware geprüft
- [ ] Optional: Desktop-Paket (Tauri/Electron)

---

## Laufende Pflichten (jeder Meilenstein)

- DESIGN.md wird mitgeführt, die JSON-Daten sind die Wahrheit
- Screenshot-Test (`tools/shot.mjs`) aus festen Kamerapositionen, damit die Optik nicht unbemerkt kaputtgeht
- Leistungsanzeige (F3) im Blick: Draw-Calls, Dreiecke, CPU-Zeit
