# ROADMAP – Die Eifeler

> **Hinweis:** Die Roadmap folgt dem [Drehbuch](DREHBUCH.md). Was dort festgelegt ist, gilt. Der Vorentwurf [DESIGN.md](DESIGN.md) liefert nur noch technische Details und Startwerte, wo das Drehbuch auf ihn verweist (z. B. Routing §4, Zahlen §6) oder noch nichts festlegt.

Reihenfolge der Meilensteine. Jeder endet mit einem **lauffähigen, vorzeigbaren Stand** und einer Abnahme.

Leitideen:

- **Erst die Welt, dann die Wirtschaft.** Die echte Eifel ist das Fundament. Optik und Leistung werden von Anfang an mitgebaut.
- **Deterministisch ab dem ersten Tick.** Die Simulation ist von M3 an befehlsbasiert, rechnet nur mit Ganzzahlen und hat eine Prüfsumme (Drehbuch 8.3). Mehrspieler kommt deshalb schon in M6, nicht am Ende.
- **Früh eine echte Partie.** Ab M5 macht eine Stunde Spaß, ab **M9 läuft die erste volle 2-Stunden-Partie** mit Nachbarn, Finden und Eifel-Punkten, allein und zu mehreren.
- **Freies Spiel und Mehrspieler vor der Kampagne.** Der Eifelsteig kommt zuletzt (Drehbuch 2.1).

| | Meilenstein | Vorzeigbar am Ende |
|---|---|---|
| M1 | Die Karte | Eifel-Landschaft in 3D |
| M2 | Weltkarte und Kartenwahl | Ausschnitt frei wählen, Prüfsumme gleich |
| M3 | Simulationskern, Wege, Träger | Waren wandern über ein Wegenetz |
| M4 | Bauen mit Holz und Stein | Dorf wächst aus eigenem Material |
| M5 | Bewohner, Nahrung, erste Kirmes | erste spaßige Stunde allein |
| M6 | Mehrspieler-Grundgerüst | zwei Browser bauen zusammen |
| M7 | Bedienung und Speichern | spielbar ohne Erklärung |
| M8 | Volle Grundwirtschaft und Jahreszeiten | 3 Dorfstufen, Winter, Schnaps |
| M9 | Gebiet, Nachbarn, Finden, Ziele | **erste 2-Stunden-Partie** |
| M10 | Die 10 Völkchen | jeder Startort spielt sich anders |
| M11 | Figuren, Wetter, Klang, Erzählerin | Version 1.0 (freies Spiel + Mehrspieler) |
| M12 | Kampagne „Der Eifelsteig“ | 15 Etappen von Aachen nach Trier |

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

Offen (wird zusammen mit M2 erledigt):
- [x] Maßstab: Häuser (3×) und Bäume (1,6×) im Spiel-Maßstab aufeinander abgestimmt, Konstanten in `src/render/massstab.ts`
- [ ] Leistungsmessung auf echter Hardware: 60 fps bei „Mittel“ nachweisen (Werkzeug fertig: `#…&bench=1` startet einen 30-s-Kameraflug mit Ergebnisfeld, Qualitätsstufen Niedrig/Mittel/Hoch)
- [ ] Playwright-Smoke-Test: Karte lädt, Screenshots aus 3 festen Kamerapositionen

Verschoben:
- Hecken im Monschauer Heckenland → M10 (Monschauer Spezialität)
- Post-Processing (SSAO, Bloom, Farb-Grading, Qualitätsstufen) und Talnebel → M11

**Abnahme:** Rursee, Obersee, Urftsee, Rur durch Monschau und Hohes Venn sind klar erkennbar. Mit F3 zeigt sich 60 fps bei „Mittel“. Die Screenshots sind auf der Projektseite vorzeigbar.

---

## M2 – Eifel-Weltkarte und freie Kartenwahl

**Ziel:** die ganze Eifel (Aachen – Trier – Maria Laach, mit Ostbelgien und Nord-Luxemburg) als Weltkarte. Man wählt Größe und Ort und spielt genau dort (Drehbuch 3.1 und 8.1).

- [x] Karten als Konfiguration im Konverter (`MAPS` in `build_map.py`, `--map <id>`), Kartenwahl im Viewer (`#id`)
- [x] Zweite Karte: **Rureifel & Dürener Land** (Heimbach – Nideggen – Kreuzau – Düren)
- [x] Teilen-Version für Handy/Tablet (`npm run build:share`), Touch-Steuerung
- [ ] Pipeline auf die ganze Welt: UTM 32N, WorldCover N48E003 + N48E006, OSM aus Geofabrik-Auszügen
- [ ] **Genaues Höhenmodell:** amtliche Geländemodelle (ohne Bäume) statt Copernicus-Oberflächenmodell: NRW DGM1, RLP DGM1, Luxemburg LiDAR 50 cm, Wallonien LiDAR 1 m (Lizenzen RLP und Wallonien noch prüfen); Copernicus GLO-30 (6 Kacheln N49/N50 × E005–E007) nur als Lückenfüller
- [ ] Darstellung mit **10-m-Höhenraster** (aus 1 m heruntergerechnet), damit Klippen wie um Nideggen sichtbar werden; Simulation bleibt beim 60-m-Hex, Kulisse gröber
- [ ] Flüsse, Talsperren und Flussbetten für die ganze Welt am Stück, danach in Kacheln (~6 × 6 km) schneiden
- [ ] Globales Hex-Raster (60 m), Simulationsdaten als Ganzzahl-Hex-Kacheln
- [ ] Datenversion mit Manifest und Prüfsummen, versionierte Pfade, Auslieferung außerhalb von Git
- [ ] **Setup-Skript** (ein Befehl): lädt die Rohdaten, rechnet eine neue Datenversion und legt sie ab. Läuft beim Entwickler oder auf dem Server, wenn man eine neue Version will, nie beim Spieler und nie bei jedem Start
- [ ] Rohdaten einer Datenversion einmal archivieren (Lizenzen erlauben das), damit wir unabhängig sind, falls ein Dienst wegfällt
- [ ] `public/maps` aus Git entfernen, Entwicklungsserver lädt die Kacheln aus dem lokalen Datenordner
- [ ] Übersichtskarte (~200 m Raster, Relief, Orte, Staatsgrenzen) und Ortsverzeichnis
- [ ] Kartenwahl: Größe klein/mittel/groß, Auswahl-Hex verschieben, Ortssuche, Startplätze anzeigen
- [ ] Client schneidet den Ausschnitt aus den Kacheln, Kulisse am Rand, Browser-Cache
- [ ] Prüfsumme über die Simulationsdaten des Ausschnitts
- [ ] `monschau-rursee` und `rureifel` als gespeicherte Ausschnitte
- [ ] `data/regions.json`: Völkchen, Boni, Startwaren, Sprüche (Drehbuch Kapitel 5)
- [ ] Übergang Übersicht → Ausschnitt (Kamerafahrt)

**Abnahme:** Auf der Übersicht „mittel“ wählen, „Gemünd“ eintippen, der Ausschnitt lädt in unter 5 Sekunden. Zwei Browser bekommen für dieselben Parameter dieselbe Prüfsumme. Ein Ausschnitt über die belgische Grenze funktioniert. Die Felsen um Nideggen sind deutlich zu erkennen. **Der Nutzer checkt das Repo frisch aus und baut alles selbst nach der Anleitung** (Setup-Skript, dann `npm run dev`).

---

## M3 – Simulationskern, Wegenetz und Träger

**Voraussetzung:** M2 ist abgenommen (die Simulation liest die Hex-Kacheln).

**Ziel:** das Herz von Siedler – Fahnen, Wege, Träger, sichtbare Waren – auf der echten Karte, und zwar von Anfang an deterministisch (Drehbuch 4.1, 8.3).

- [ ] `src/sim/` getrennt von der Darstellung: fester Tick (20/s), nur Ganzzahlen, serialisierbarer Zustand, Zufall nur aus der Saat
- [ ] **Befehle statt Direktzugriff:** Jede Spieleraktion ist ein Befehl mit Tick-Nummer. Die Oberfläche ruft nie die Simulation direkt.
- [ ] Prüfsumme über den Zustand, Befehlsprotokoll zum Abspielen (Replay)
- [ ] Simulation liest nur die Ganzzahl-Hex-Kacheln aus M2 (Höhe, Steigung, Bauplatzgröße)
- [ ] Lager im echten Ortskern als Startgebäude (Drehbuch 4.2), Gebäude in etwa **3× echter Größe**, **planierte Bauplätze**, an steilen Hängen nur kleine Gebäude (Drehbuch 3)
- [ ] Erste prozedurale Gebäudemodelle (Fachwerk, 3 Bauphasen)
- [ ] Fahnen, Wegbau Fahne → Fahne mit Vorschau, Segmente, Teilung (DESIGN §4.1–4.3)
- [ ] Weg-Darstellung als Erdpfad, der sich ins Gelände schmiegt
- [ ] Träger als erste knubbelige Figur (Siedler + Comic, Drehbuch 7.1) mit Laufanimation, sichtbarer Ware, Stapel an Fahnen
- [ ] Routing nach DESIGN §4.4: Steigung, monoton, Tausch, Rückstau, Reservierung, Neu-Routing; ⚠ bei getrennten Gebäuden
- [ ] Tests: Verklemmungs-Szenarien, Ringnetz, Abriss mitten im Transport; **Determinismus-Test**: dasselbe Befehlsprotokoll ergibt in Node und im Browser dieselbe Prüfsumme

**Abnahme:** Ein Netz mit 30 Segmenten läuft 10 Minuten ohne Verklemmung. Das Replay davon ergibt in zwei Browsern dieselbe Prüfsumme.

---

## M4 – Bauen mit Holz und Stein

**Ziel:** Bauen kostet Material, Holz und Stein tragen das Wachstum (Drehbuch 4.2, 5.1).

- [ ] Baustellen: Bedarf statt Sofortkosten, Einzel-Lieferung, Bau-Aktion, Priorität (DESIGN §4.6)
- [ ] Holzkette: Holzfäller, Förster, Sägewerk; Bäume als Zustand, aus dem Kartenwald übernommen
- [ ] Steinkette: Steinbruch an endlichen Felsen
- [ ] Input-Puffer, Lager-Auslieferung (Pull), Abriss (DESIGN §4.5, §4.7)
- [ ] Datengetrieben: `data/goods.json`, `data/buildings.json` (Startwerte aus DESIGN §6)
- [ ] Erstes Baumenü mit Geistermodell, Bauplatz-Anzeige (klein/mittel/groß) und Bauvorschau

**Abnahme:** Aus 12 Brettern und 8 Steinen entsteht ohne Eingriff eine laufende Holzwirtschaft. Holzfäller und Förster nebeneinander liefern nach 2 Minuten weiter Stämme.

---

## M5 – Bewohner, Nahrung, erste Kirmes

**Ziel:** die erste **spaßige Spielschleife** – Nahrung lässt das Dorf wachsen, die Kirmes gibt ein Ziel (Drehbuch 4.3, 4.4, 5.2).

- [ ] Wohnhaus mit Wohnraum, Bewohner aus Nahrung (3 Stufen), Notnagel (DESIGN §5)
- [ ] Ketten der Stufe Weiler: Kartoffel → Küche → Bratkartoffeln, Obstwiese → Mostkeller → Most, Schafstall → Käserei → Käse, Bienenstock → Honig
- [ ] Kirmesplatz, Warenliste, Fest mit Animation, Dorfstufe **Weiler → Dorf** und Freischaltungen
- [ ] Meldungen und Zustand in Klartext über Gebäuden („Wartet auf Stämme“), erste Sprüche
- [ ] Ablauf „Die ersten 30 Minuten“ aus Drehbuch 4.4 als Spieltest-Drehbuch

**Abnahme:** Ein Testspieler erreicht in 30–45 Minuten die erste Kirmes, ohne die Regeln erklärt zu bekommen, und will danach weiterspielen.

---

## M6 – Mehrspieler-Grundgerüst

**Ziel:** Zwei bis vier Spieler bauen in einem Ausschnitt nebeneinander. Ab jetzt wird jeder neue Inhalt automatisch auch im Mehrspieler getestet (Drehbuch 2.3, 8.3).

- [ ] Vermittlungs-Server, klein und ohne Konto: Lobby, Einladungslink, Spielername, Verbindungsaufbau
- [ ] Verbindung direkt zwischen den Browsern (**WebRTC**), Notfall-**Relais (TURN)** für Firmen- und Handynetze
- [ ] **Gleichschritt (Lockstep):** Befehle mit Verzögerung um einige Ticks, alle rechnen dasselbe
- [ ] Start erst, wenn die Prüfsumme der Kartendaten bei allen gleich ist (M2), danach laufend **Abgleich-Prüfsummen** über den Spielstand; bei Auseinanderlaufen Meldung und Neuverteilung vom Gastgeber
- [ ] Lobby: Ausschnitt wählen (M2), Startplätze in verschiedenen Ortskernen, Tempo **1–3×**
- [ ] Pause für jeden, begrenzt (z. B. dreimal je Partie)
- [ ] **Speichern und Laden** (Zustand + Datenversion der Karte), auch für Mehrspieler
- [ ] **Rausgeflogen:** Spiel pausiert, Wiederbeitritt über den Link mit Stand vom Mitspieler; nach **5 Minuten** übernimmt ein einfacher **Verwalter** das Dorf
- [ ] Testaufbau: zwei Browser-Fenster auf einem Rechner, simuliertes schlechtes Netz

**Abnahme:** Zwei Spieler an verschiedenen Orten bauen 30 Minuten lang jeder ein Dorf bis zur ersten Kirmes, ohne Auseinanderlaufen. Einer lädt die Seite neu und ist in unter 30 Sekunden wieder drin.

---

## M7 – Bedienung und Oberfläche

**Ziel:** Alles sichtbar, alles erklärbar, mit Maus und Tastatur am PC zuerst (Drehbuch 8.2, DESIGN §9).

- [ ] Fenster-System (verschiebbar, anpinnbar, Esc, Live-Daten)
- [ ] Gebäude-, Fahnen-, Träger- und Lagerfenster, datengetrieben
- [ ] Baumenü mit Gruppen, Tooltips, Begründungen, Tastenkürzeln
- [ ] Icons aus den 3D-Modellen
- [ ] Warenübersicht (W), Statistik (S), Ereignisprotokoll (L), Meldungen mit Sprung zum Ort
- [ ] Einstellungen (Grafik, Oberfläche, Steuerung, Spiel), Autosave
- [ ] Tablet und Handy spielbar, aber nicht Schwerpunkt

**Abnahme:** Jedes Gebäude hat ein funktionierendes Fenster ohne Sondercode. Ein neuer Spieler findet sich ohne Hilfe zurecht. Mit 5 offenen Fenstern bleibt das Leistungsbudget eingehalten.

---

## M8 – Volle Grundwirtschaft und Jahreszeiten

**Ziel:** alle rund **25 Grundgebäude**, drei Dorfstufen und ein Jahreslauf (Drehbuch 5.1, 5.2, 7.4).

- [ ] Reifekeller (Bergkäse), Bier (Gerstenfeld → Brauerei → Landbier), Schnaps (Wacholderheide → Brennerei), Schänke
- [ ] Eisen schlank ab Stufe 2: Erzgrube, Köhlerei, Eisenhütte, Schmiede → Werkzeug nur für die Fachkräfte der besseren Gebäude
- [ ] Kirmes-Stufen **Dorf → Kirchdorf** und **Kirchdorf → Marktflecken**
- [ ] Beschwipste Boten: querfeldein, torkelnd, verlieren mal Waren (DESIGN §10.3); **Betrunkene sofort erkennbar** (rote Nase, Schlagseite, Hicksen, Drehbuch 7.1)
- [ ] **Jahreszeiten mit Wirkung:** Partie ≈ 2 Jahre, Winter mit Schnee und Vorratswirtschaft, Saat im Frühjahr, Ernte und Kirmeszeit im Herbst
- [ ] **Wetter stark, aber fair:** Regen, Talnebel, Wind, Dürre, Missernte, Hochwasser in der Aue; angekündigt als Bauernregel, nie zerstörerisch, aus der gemeinsamen Saat
- [ ] Balancing der Startwerte über einen 2-Stunden-Lauf

**Abnahme:** Ein Dorf erreicht in einer Partie allein den Marktflecken. Der erste Winter ist spürbar, aber wer vorsorgt, kommt gut durch. Im Mehrspieler trifft das Wetter alle gleich.

---

## M9 – Gebiet, Nachbarn, Finden, Ziele → erste 2-Stunden-Partie

**Ziel:** Man misst sich ohne Krieg. Danach ist **eine volle Partie von 2 Stunden** allein und zu mehreren spielbar (Drehbuch 6).

- [ ] **Einfluss:** Lager, Höfe, Kirche und Festplätze strahlen aus, gut versorgt weiter; Grenzen wachsen wie in Siedler
- [ ] Erkundung und Nebel in Kartenpapier-Optik (DESIGN §8, im Drehbuch noch nicht festgelegt)
- [ ] **Grenzsteine versetzen** (nachts, mit Risiko) und **Abwerben** über Kirmes und Essen; Gebäude werden nie zerstört, sie stehen still
- [ ] **Flachländer-Dörfer** (KI) an größeren echten Orten im Ausschnitt: Lager, Wachsamkeit, Handel, keine eigene Bauerei
- [ ] Finderhütte, **Finden mit Gegenwehr** (Wachhund, Dorfpolizist), **Ausredenstube** mit Sprüchen, Fundbüro
- [ ] Zöllner an der Staatsgrenze, Kaffeeschmuggel
- [ ] **Schützenfest** mit Schützenhaus, Schießstand und **Vogelschuss** (Vorbereitung + etwas Glück), Schützenkönig zahlt die Runde
- [ ] Siegbedingungen: **Eifel-Punkte** nach 2 Stunden (Standard, Zwischenstand jederzeit), wählbar **Wettlauf** zum Marktflecken und **Der Große Fund**
- [ ] Abschluss-Bildschirm mit Statistik

**Abnahme:** Vier Testspieler (oder zwei plus Flachländer) spielen eine 2-Stunden-Partie bis zum Ende ohne Abbruch. Danach sagen sie: „Noch eine.“

---

## M10 – Die 10 Völkchen

**Ziel:** Jeder Startort spielt sich anders (Drehbuch 5.3).

- [ ] Gebietskarte im Konverter: welcher Startort gehört zu welchem Völkchen
- [ ] Je Völkchen Bonus, **Spezialkette (2–3 Gebäude, ab Stufe 2)**, augenzwinkernde Schwäche, edle Spezialität für Stufe 3
- [ ] Monschauer & Venner, Rursee-Leute, Rureifeler, Vulkaneifeler, Ahrtaler, Laacher & Mayener, Südeifeler, Schneifeler, **Ostbelgier**, **Öslinger**
- [ ] **Hecken als Monschauer Spezialität:** lebende Grenze, Windschutz, wachsen nur mit Setzlingen (Drehbuch 6.1); anderswo nur Kulisse an Feldgrenzen (aus M1)
- [ ] Tracht und Farbe je Völkchen, Gebäude mit regionalen Baustoffen (Schiefer, Buntsandstein, Basalt, Drehbuch 7.3)
- [ ] Sprüche je Völkchen (ripuarisch, moselfränkisch, Ostbelgien, Ösling), Tooltip-Übersetzung für Flachländer
- [ ] Balancing: kein Völkchen gewinnt in Testpartien deutlich öfter

**Abnahme:** Ein Ausschnitt über die belgische Grenze bringt Monschauer gegen Ostbelgier. Beide spielen sich erkennbar anders und sind gleich stark.

---

## M11 – Figuren, Wetter, Klang → Version 1.0

**Ziel:** Charme und Fertigstellung. Freies Spiel und Mehrspieler sind fertig (Drehbuch 1, 7).

- [ ] Figuren fertig im Siedler-Comic-Stil: Mimik, übertriebene Gesten, alle Berufe
- [ ] **Gebrabbel** mit Eifeler Klang statt Sprecher, Betrunkene singen (Drehbuch 7.2)
- [ ] Wetter- und Jahreszeiten-Optik: Talnebel (Höhennebel im Shader), Regen, Schnee, Wolkenschatten, Tageszeiten
- [ ] Post-Processing: SSAO, dezentes Bloom, Farb-Grading, Qualitätsstufen (aus M1)
- [ ] **Volksmusik** (Akkordeon, Blasmusik, Fiedel), Tusch auf den Festen, räumliche Geräusche, spukende Grenzsteinversetzer
- [ ] **Erzählfigur** (Dorfälteste, siehe Drehbuch 1.3) mit Bauernregeln und kurzer Einführung ins freie Spiel
- [ ] Running Gags aus Drehbuch 1.2 durchgehend eingebaut
- [ ] Startmenü, Credits mit Quellenangaben, Leistungsdurchgang auf echter Hardware

**Abnahme:** Eine Gruppe Fremder spielt über den Link eine Partie ohne Hilfe von uns. Die Leistung hält 60 fps bei „Mittel“.

---

## M12 – Kampagne „Der Eifelsteig“

**Ziel:** Mit dem eigenen Völkchen den Eifelsteig entlang wandern (Drehbuch 2.1).

- [ ] Kampagnenkarten als feste Ausschnitte mit fester Datenversion und Missionsdaten
- [ ] 15 Etappen in 4 Abschnitten (Nordeifel, Kalkeifel, Vulkaneifel, Südeifel), je eigenes Ziel
- [ ] Eifel-Übersicht mit dem gewanderten Weg zwischen den Etappen, Erzählfigur führt durch
- [ ] Danach Zusatzwege, z. B. entlang der Rur mit Düren

---

## Danach (offen)

- **Verbundene Regionen** im Mehrspieler: jeder spielt seinen eigenen Ausschnitt und schickt Händler und Finder hinüber (Drehbuch 2.3)
- Volle KI-Gegner, die selbst bauen (Drehbuch 6.2)
- Desktop- oder Store-App (Drehbuch 8.2)

---

## Laufende Pflichten (jeder Meilenstein)

- Das Drehbuch wird mitgeführt, die JSON-Daten sind die Wahrheit für Zahlen
- **Determinismus-Test** (Replay → gleiche Prüfsumme) läuft ab M3 bei jeder Änderung an der Simulation
- Ab M6 wird jedes neue Feature auch im Mehrspieler angespielt
- Screenshot-Test (`tools/shot.mjs`) aus festen Kamerapositionen, damit die Optik nicht unbemerkt kaputtgeht
- Leistungsanzeige (F3) im Blick: Draw-Calls, Dreiecke, CPU-Zeit
