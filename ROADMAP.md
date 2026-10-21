# ROADMAP – Die Eifeler

> **Hinweis:** Die Roadmap folgt dem [Drehbuch](DREHBUCH.md). Was dort festgelegt ist, gilt. Der Vorentwurf [DESIGN.md](DESIGN.md) liefert nur noch technische Details und Startwerte, wo das Drehbuch auf ihn verweist (z. B. Routing §4, Zahlen §6) oder noch nichts festlegt.

Reihenfolge der Meilensteine. Jeder endet mit einem **lauffähigen, vorzeigbaren Stand** und einer Abnahme.

Leitideen:

- **Erst die Welt, dann die Wirtschaft.** Die echte Eifel ist das Fundament. Optik und Leistung werden von Anfang an mitgebaut.
- **Deterministisch ab dem ersten Tick.** Die Simulation ist von M3 an befehlsbasiert, rechnet nur mit Ganzzahlen und hat eine Prüfsumme (Drehbuch 8.3). Mehrspieler kommt deshalb schon in M6, nicht am Ende.
- **Früh eine echte Partie.** Ab M5 macht eine Stunde Spaß, ab **M10 läuft die erste volle 2-Stunden-Partie** mit Nachbarn, Finden und Eifel-Punkten, allein und zu mehreren.
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
| M9 | Stil: Siedler trifft Comic | das Spiel sieht aus wie im Drehbuch (Kapitel 7) |
| M10 | Gebiet, Nachbarn, Finden, Ziele | **erste 2-Stunden-Partie** |
| M11 | Die 10 Völkchen | jeder Startort spielt sich anders |
| M12 | Feinschliff Figuren, Wetter, Klang, Erzählerin | Version 1.0 (freies Spiel + Mehrspieler) |
| M13 | Kampagne „Der Eifelsteig“ | 15 Etappen von Aachen nach Trier |

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
- [x] Playwright-Smoke-Test (`npm run test:smoke`): Kartenwahl → Ausschnitt lädt, Screenshots aus 3 festen Kamerapositionen, Prüfsumme Browser = Python

Verschoben:
- Hecken im Monschauer Heckenland → M11 (Monschauer Spezialität)
- Post-Processing (SSAO, Bloom, Farb-Grading, Qualitätsstufen) und Talnebel → M12

**Abnahme:** Rursee, Obersee, Urftsee, Rur durch Monschau und Hohes Venn sind klar erkennbar. Mit F3 zeigt sich 60 fps bei „Mittel“. Die Screenshots sind auf der Projektseite vorzeigbar.

---

## M2 – Eifel-Weltkarte und freie Kartenwahl ✅

**Ziel:** die ganze Eifel (Aachen – Trier – Maria Laach, mit Ostbelgien und Nord-Luxemburg) als Weltkarte. Man wählt Größe und Ort und spielt genau dort (Drehbuch 3.1 und 8.1).

- [x] Karten als Konfiguration im Konverter, Kartenwahl im Viewer (abgelöst durch die Weltdaten)
- [x] Zweite Karte: **Rureifel & Dürener Land** (Heimbach – Nideggen – Kreuzau – Düren)
- [x] Teilen-Version für Handy/Tablet (`npm run build:share`, jetzt mit Teil-Datenversion), Touch-Steuerung
- [x] Pipeline auf die ganze Welt: UTM 32N, WorldCover N48E003 + N48E006, OSM aus Geofabrik-Auszügen (Rückfall Overpass), dazu Bahnstrecken und Wanderrouten; Straßen bewusst nicht
- [x] **Genaues Höhenmodell:** NRW DGM1 (dl-de/zero), RLP DGM1 (dl-de/by), Luxemburg LiDAR 2024 (CC0); Wallonien (CC BY 4.0) nur als Provinz-ZIP verfügbar → beschlossen: dort Copernicus GLO-30 (30 m), eigene Dateien möglich; Copernicus als Lückenfüller
- [x] Darstellung mit **10-m-Höhenraster** (aus 1 m heruntergerechnet), damit Klippen wie um Nideggen sichtbar werden; Simulation bleibt beim 60-m-Hex, Kulisse gröber
- [x] Flüsse, Bäche (Durchlässe geschlossen), Talsperren und Flussbetten für das ganze Gebiet am Stück, danach in Kacheln (~6 × 6 km) schneiden
- [x] Globales Hex-Raster (60 m), Simulationsdaten als Ganzzahl-Hex-Kacheln
- [x] Datenversion mit Manifest und Prüfsummen, versionierte Pfade, Auslieferung außerhalb von Git
- [x] **Setup-Skript** (`npm run setup`) (ein Befehl): lädt die Rohdaten, rechnet eine neue Datenversion und legt sie ab. Läuft beim Entwickler oder auf dem Server, wenn man eine neue Version will, nie beim Spieler und nie bei jedem Start
- [x] Rohdaten archivieren: `setup.py --archiv DIR` (Lizenzen erlauben das)
- [x] `public/maps` aus Git entfernen, Entwicklungsserver lädt die Kacheln aus dem lokalen Datenordner
- [x] Übersichtskarte (~200 m Raster, Relief, Orte, Staatsgrenzen, Wanderwege) und Ortsverzeichnis
- [x] Kartenwahl: Größe klein/mittel/groß, Auswahl-Hex verschieben, Ortssuche, Startplätze anzeigen
- [x] Client schneidet den Ausschnitt aus den Kacheln, Kulisse am Rand, Browser-Cache
- [x] Prüfsumme über die Simulationsdaten des Ausschnitts
- [x] `monschau-rursee` und `rureifel` als gespeicherte Ausschnitte
- [x] `data/regions.json`: Völkchen, Boni, Startwaren, Sprüche (Drehbuch Kapitel 5)
- [x] Übergang Übersicht → Ausschnitt (Kamerafahrt)

**Abnahme:** Auf der Übersicht „mittel“ wählen, „Gemünd“ eintippen, der Ausschnitt lädt in unter 5 Sekunden. Zwei Browser bekommen für dieselben Parameter dieselbe Prüfsumme. Ein Ausschnitt über die belgische Grenze funktioniert. Die Felsen um Nideggen sind deutlich zu erkennen. **Der Nutzer checkt das Repo frisch aus und baut alles selbst nach der Anleitung** (Setup-Skript, dann `npm run dev`).

---

## M3 – Simulationskern, Wegenetz und Träger ✅ (erster Stand)

**Voraussetzung:** M2 ist abgenommen (die Simulation liest die Hex-Kacheln).

**Ziel:** das Herz von Siedler – Fahnen, Wege, Träger, sichtbare Waren – auf der echten Karte, und zwar von Anfang an deterministisch (Drehbuch 4.1, 8.3).

- [x] `src/sim/` getrennt von der Darstellung: fester Tick (20/s), nur Ganzzahlen, serialisierbarer Zustand, Zufall nur aus der Saat
- [x] **Befehle statt Direktzugriff:** Jede Spieleraktion ist ein Befehl mit Tick-Nummer. Die Oberfläche ruft nie die Simulation direkt.
- [x] Prüfsumme über den Zustand, Befehlsprotokoll zum Abspielen (Replay)
- [x] Simulation liest nur die Ganzzahl-Hex-Kacheln aus M2 (Höhe, Steigung, Bauplatzgröße)
- [x] Lager im echten Ortskern als Startgebäude (Drehbuch 4.2), Gebäude in etwa **3× echter Größe**, **planierte Bauplätze**, an steilen Hängen nur kleine Gebäude (Drehbuch 3)
- [x] Erste prozedurale Gebäudemodelle (Fachwerk, 3 Bauphasen)
- [x] Fahnen, Wegbau Fahne → Fahne mit Vorschau, Segmente, Teilung (DESIGN §4.1–4.3)
- [x] Weg-Darstellung als Erdpfad, der sich ins Gelände schmiegt
- [x] Träger als erste knubbelige Figur (Siedler + Comic, Drehbuch 7.1) mit Laufanimation, sichtbarer Ware, Stapel an Fahnen
- [x] Routing nach DESIGN §4.4: Steigung, monoton, Tausch, Rückstau, Reservierung, Neu-Routing; ⚠ bei getrennten Gebäuden
- [x] Tests: Verklemmungs-Szenarien, Ringnetz, Abriss mitten im Transport; **Determinismus-Test**: dasselbe Befehlsprotokoll ergibt in Node und im Browser dieselbe Prüfsumme

**Abnahme:** Ein Netz mit 30 Segmenten läuft 10 Minuten ohne Verklemmung. Das Replay davon ergibt in zwei Browsern dieselbe Prüfsumme.

---

## M4 – Bauen mit Holz und Stein ✅ (erster Stand)

**Ziel:** Bauen kostet Material, Holz und Stein tragen das Wachstum (Drehbuch 4.2, 5.1).

- [x] Baustellen: Bedarf statt Sofortkosten, Einzel-Lieferung, Bau-Aktion, Priorität (DESIGN §4.6)
- [x] Holzkette: Holzfäller, Förster, Sägewerk; Bäume als Zustand, aus dem Kartenwald übernommen
- [x] Steinkette: Steinbruch an endlichen Felsen
- [x] Input-Puffer, Lager-Auslieferung (Pull), Abriss (DESIGN §4.5, §4.7)
- [x] Datengetrieben: `data/goods.json`, `data/buildings.json` (Startwerte aus DESIGN §6)
- [x] Erstes Baumenü mit Geistermodell, Bauplatz-Anzeige (klein/mittel/groß) und Bauvorschau (Taste B, P; Gebäudekarte mit Priorität)

**Abnahme:** Aus 12 Brettern und 8 Steinen entsteht ohne Eingriff eine laufende Holzwirtschaft. Holzfäller und Förster nebeneinander liefern nach 2 Minuten weiter Stämme.
→ Vitest-Szenario `tests/m4-abnahme.test.ts` (mit Förster zwischen Minute 8 und 12 noch 16 Stämme, ohne Förster nach 4 Minuten keine mehr); Holzwirtschaft auch im Smoke-Test auf der echten Karte, Node = Browser.

Nachgezogen nach dem ersten Anspielen: Im Spielfeld gibt es nur Bäume und Steine, die die Simulation kennt (Wald 3, Wiese/Heide/Moor teils 1 Baum; Fels 80, Klippe 25, Lesesteine 6–8 Steine), Bauen rodet und gibt Stämme, Arbeitsbereich mit setzbarem Mittelpunkt, Radius 4 mit innerem Ring 2, fairer Start (mindestens 150 Steine im Umkreis 8 ums Lager).

Später (Feinschliff, nicht jetzt):
- Gebäude-Effizienz als Anzeige (Auslastung, Laufwege) – mit den Gebäudefenstern (M7) und dem Balancing (M8)
- Zahlen: Radien, Gebäudeabstand, Bäume je Hex, Wachstumszeit, Steinmengen → im M5-Spieltest (mit Menschen, SPIELTEST.md)
- ~~Bauarbeiter als eigener Beruf statt „Träger verbaut selbst“ → M5 (Drehbuch 4.5)~~ erledigt in M5

---

## M5 – Bewohner, Nahrung, erste Kirmes ✅ (erster Stand) → 🔨 Spieltest mit Menschen

**Ziel:** die erste **spaßige Spielschleife** – Nahrung lässt das Dorf wachsen, die Kirmes gibt ein Ziel (Drehbuch 4.3, 4.4, 5.2).

- [x] Wohnhaus mit Wohnraum, Bewohner aus Nahrung (3 Stufen), Notnagel (DESIGN §5; Zahlen in `data/dorf.json`)
- [x] **Planierer und Bauarbeiter** (Drehbuch 4.5): Träger liefern nur ab (Stapel an der Baustelle), Planierer ebnen Plätze am Hang, ein Bauarbeiter je Baustelle hämmert Stück für Stück; Start mit 4 Bauarbeitern und 2 Planierern
- [x] **Waren lesbar** (Drehbuch 7.6): jede Ware mit klarer Form und Farbe (`form`, `farbe` in `data/goods.json`), auch die neuen Nahrungswaren
- [x] Ketten der Stufe Weiler: Kartoffel → Küche → Bratkartoffeln, Obstwiese → Mostkeller → Most, Schafstall → Käserei → Käse, Bienenstock → Honig
- [x] Kirmesplatz, Warenliste, Fest mit Animation (Karussell, Feuerwerk), Dorfstufe **Weiler → Dorf** und Freischaltungen (Reifekeller; Brauerei, Brennerei, Schänke, Schützenhaus, Lagerhaus kommen mit M8)
- [x] Meldungen und Zustand in Klartext über Gebäuden („Wartet auf Milch“, „Wird planiert“), erste Sprüche der Erzählfigur (`data/meldungen.json`)
- [x] Ablauf „Die ersten 30 Minuten“ aus Drehbuch 4.4 als Spieltest-Drehbuch: [SPIELTEST.md](SPIELTEST.md), dazu der Spieltest-Bot (`tests/m5-szenario.ts`)
- [x] Zahlen im Spieltest-Bot eingestellt (Erzeuger, Verarbeiter, Notnagel); Radien, Gebäudeabstand, Bäume je Hex, Wachstumszeit, Steinmengen und Bauzeit je Ware warten auf den Test mit Menschen

**Abnahme:** Ein Testspieler erreicht in 30–45 Minuten die erste Kirmes, ohne die Regeln erklärt zu bekommen, und will danach weiterspielen.
→ Automatisch: `tests/m5.test.ts` (der Bot erreicht die Kirmes nach rund 22 Spielminuten, Replay gleich, Node = Browser im Smoke-Test).
Offen: der Test mit einem Menschen nach [SPIELTEST.md](SPIELTEST.md).

Nachgezogen beim Einstellen: Zwei volle Fahnen, die sich gegenseitig blockieren, drehen sich über die Notplätze frei (Tausch und Direktlieferung); der Notnagel greift, wenn kein Nachwuchs in Sicht ist; Wohnhäuser lassen liegen, was die Kirmes braucht.

---

## M6 – Mehrspieler-Grundgerüst ✅ (erster Stand) → 🔨 Test mit Menschen über echtes Internet

**Ziel:** Zwei bis vier Spieler bauen in einem Ausschnitt nebeneinander. Ab jetzt wird jeder neue Inhalt automatisch auch im Mehrspieler getestet (Drehbuch 2.3, 8.3).

- [x] Vermittlungs-Server, klein und ohne Konto: Lobby, Einladungslink, Spielername, Verbindungsaufbau (`server/vermittlung.mjs`, `npm run vermittlung`; Platz per Token zurück)
- [x] Verbindung direkt zwischen den Browsern (**WebRTC**, jeder mit jedem), Notfall-**Relais (TURN)** für Firmen- und Handynetze: eigener coturn (`server/coturn/turnserver.conf`), der Server vergibt kurzlebige Zugangsdaten
- [x] **Gleichschritt (Lockstep):** Ein Taktgeber (anfangs der Gastgeber) verteilt Züge; Befehle wirken 200 ms Spielzeit später bei allen am selben Tick (`src/netz/partie.ts`)
- [x] Start erst, wenn die Prüfsumme der Kartendaten bei allen gleich ist (Lobby und Server prüfen), danach alle 5 Spielsekunden **Abgleich-Prüfsummen**; bei Auseinanderlaufen Meldung und Neuverteilung vom Taktgeber
- [x] Lobby: Ausschnitt aus der Kartenwahl, Startplätze in verschiedenen Ortskernen (möglichst weit auseinander, änderbar), Tempo **1–3×** (nur der Gastgeber)
- [x] Pause für jeden, begrenzt: dreimal je Spieler und Partie, höchstens 2 Minuten; weiter darf, wer pausiert hat, und der Gastgeber
- [x] **Speichern und Laden** (Zustand + Datenversion und Prüfsumme der Karte), auch für Mehrspieler (Stand mehrerer Spieler → Lobby)
- [x] **Rausgeflogen:** Spiel wartet, Wiederbeitritt über den Link mit Stand vom Mitspieler (auch wenn der Taktgeber selbst neu lädt); nach **5 Minuten** übernimmt ein einfacher **Verwalter** das Dorf (Wirtschaft läuft, keine neuen Bauten), fehlt der Taktgeber so lange, gibt der nächste den Takt
- [x] Testaufbau: zwei Browser-Fenster auf einem Rechner, simuliertes schlechtes Netz (`tests/mehrspieler.mjs` im Smoke-Test, `#…&netz=schlecht`); ohne Browser dasselbe über ein simuliertes Netz (`tests/partie.test.ts`)
- [x] Simulation für mehrere Spieler umgebaut: Dorf je Spieler, Besitz an Fahnen, Wegen, Gebäuden und Bauleuten, getrennte Wegenetze, Befehl `verwalter`, Spielstand `stand()`/`ausStand()` (`tests/mehrspieler-sim.test.ts`)

**Abnahme:** Zwei Spieler an verschiedenen Orten bauen 30 Minuten lang jeder ein Dorf bis zur ersten Kirmes, ohne Auseinanderlaufen. Einer lädt die Seite neu und ist in unter 30 Sekunden wieder drin.
→ Automatisch: `tests/m6.test.ts` (zwei Spieltest-Bots über schlechtes Netz, beide Kirmes nach rund 22 Spielminuten, Neuladen nach 12 Minuten, keine Abweichung, Replay gleich) und im Browser `tests/mehrspieler.mjs` (zwei Fenster, Neuladen in rund 20 s selbst mit Software-Grafik, Prüfsummen gleich). Node = Browser auch für zwei Dörfer im Smoke-Test.
Offen: eine Partie zwischen zwei Menschen an verschiedenen Orten über das echte Internet mit eingerichtetem coturn.

Noch nicht drin (kommt später): Gebiet und Grenzen zwischen den Dörfern (M10) – bis dahin darf jeder überall bauen, nur nichts Fremdes anfassen; Variante „Verbundene Regionen“ (Drehbuch 2.3); Wechsel des Gastgebers.

---

## M7 – Bedienung und Oberfläche ✅ (erster Stand) → 🔨 Test mit neuen Spielern

**Ziel:** Alles sichtbar, alles erklärbar, mit Maus und Tastatur am PC zuerst (Drehbuch 8.2, DESIGN §9).

- [x] Fenster-System (verschiebbar, anpinnbar, Esc, Live-Daten 4× je Sekunde): `src/ui/fenster.ts`; Fenster beschreiben ihren Inhalt nur als Daten (Zustand, Balken, Waren, Tabelle, Knöpfe, Rangliste, Kurve, Eingaben)
- [x] Gebäude-, Fahnen-, Träger- und Lagerfenster, datengetrieben: `src/spiel/fensterdaten.ts` liest nur die Felder aus `data/buildings.json` (Eingang, Ausgang, wandelt, Radius, Wohnraum, Vorrat, Funktion), kein Code für einzelne Gebäude (Test prüft das); Knöpfe Hinsehen, Anhalten (neuer Befehl `ruhen`), Abreißen, Priorität, Arbeitsbereich; Produktivität der letzten 2 Minuten
- [x] Baumenü mit Reitern je Gruppe, Tooltips (Kosten, Bauplatz, Ein- → Ausgang, Arbeiter, Spruch), Begründungen (gesperrt: Stufe/steht schon; knapp: was im Lager fehlt), Tasten je Gebäude bei offenem Menü (`taste` in `data/buildings.json`), Ziffern 3–9 wie bisher
- [x] **Warenverteilung einstellbar** (wie in Siedler 2): je Ware und Dorf eine Rangfolge der Abnehmer (Baustellen, Kirmesplatz, Verarbeiter, Wohnhäuser), Befehl `verteilung`, Teil von Prüfsumme und Spielstand; Standard = die feste Reihenfolge aus M5 (`data/dorf.json`: verteilung)
- [x] Icons aus den 3D-Modellen (`src/render/icons.ts`: Waren und Gebäude einmal beim Start gerendert, Zeichen als Ersatz ohne WebGL)
- [x] Warenübersicht (<kbd>I</kbd>), Statistik (<kbd>T</kbd>; Messpunkt je Spielminute im Spielstand, alle Dörfer im Vergleich), Ereignisprotokoll (<kbd>L</kbd>), Meldungen am rechten Rand zusammengefasst, Klick springt zum Ort (auch bei Meldungen der Erzählfigur). W und S bleiben bei der Kamera (beschlossen: I, T statt W, S)
- [x] Einstellungen (Grafik, Oberfläche: Größe 80–150 % und Farbenblind-Modus, Steuerung: Kamera-Tempo, Spiel: Autosave und Tipps) mit <kbd>Esc</kbd> oder ⚙️, Hilfe (<kbd>H</kbd>); Autosave alle 10 Spielminuten in den Browser-Speicher (ein Platz, Spielstand-Format aus M6), „⏱ Weiterspielen“ in der Kartenwahl; im Mehrspieler speichert jeder für sich
- [x] Tablet und Handy spielbar: Fenster als Blatt über der Bauleiste, nur eins auf einmal (außer angepinnten), Tipp öffnet Fenster

**Abnahme:** Jedes Gebäude hat ein funktionierendes Fenster ohne Sondercode. Ein neuer Spieler findet sich ohne Hilfe zurecht. Mit 5 offenen Fenstern bleibt das Leistungsbudget eingehalten.
→ Automatisch: `tests/fensterdaten.test.ts` (Fenster für jedes Gebäude, fertig und als Baustelle, aus seinen Daten; der Fenstercode nennt kein Gebäude), `tests/m7-sim.test.ts` (Verteilung, Ruhen, Statistik, alte Spielstände), `tests/partie.test.ts` (Verteilung und Ruhen über schlechtes Netz, nach Neuladen gleich), im Browser `tests/bedienung.mjs` (Reiter, Tooltip, Taste, 5 Fenster mit Pin, Verschieben, Esc, Aktualisierung im Mittel unter 4 ms je Runde, Verteilung per Klick, Meldung am Rand, Handy-Blatt) und `tests/mehrspieler.mjs` (Verteilung, Ruhen, Statistik, Autosave in zwei Fenstern).
Offen: Test mit Menschen, die das Spiel nicht kennen („findet sich ohne Hilfe zurecht“) – Spieltest-Drehbuch [SPIELTEST.md](SPIELTEST.md).

Noch nicht drin (kommt später): „nicht einlagern/auslagern“ je Ware im Lagerfenster (mit dem Lagerhaus in M8, vorher gibt es nur ein Lager); frei belegbare Tasten (Tasten stehen fest in der Hilfe).

---

## M8 – Volle Grundwirtschaft und Jahreszeiten ✅ (erster Stand) → 🔨 Spieltest mit Menschen

**Ziel:** alle rund **25 Grundgebäude**, drei Dorfstufen und ein Jahreslauf (Drehbuch 5.1, 5.2, 7.4).

- [x] Reifekeller (Bergkäse), Bier (Gerstenfeld → Brauerei → Landbier), Schnaps (Wacholderheide → Brennerei), Schänke, Lagerhaus (Drehbuch 6.2); neue Waren Gerste, Landbier (veredelte Nahrung), Wacholder, Schnaps (zählt im Mischkorb), Erz, Holzkohle, Eisen, Werkzeug, jede mit eigenem Modell
- [x] **Lagerhaus und Lagerregeln** (wie Siedler 2, je Lager): normal / nicht einlagern / auslagern je Ware (Befehl `lagerregel`, Lagerfenster); Abriss trägt den Bestand ins nächste Lager
- [x] Eisen schlank ab Stufe 2: Erzgrube, Köhlerei, Eisenhütte (zwei Zutaten), Schmiede → Werkzeug; Fachkräfte von Erzgrube und Eisenhütte brauchen Werkzeug, die Kirchdorf-Kirmes schenkt 2; neue Bauarbeiter und Planierer über die **Wunschzahl** im Lagerfenster (Befehl `bauleute`, je 1 Werkzeug und 1 Bewohner); Werkzeug geht zuerst an Fachkräfte, an die Kirmes erst, wenn das Dorf selbst schmiedet (sonst Verklemmung)
- [x] **Kleine Feste** am Kirmesplatz zu ihrer Jahreszeit (Maifest, Viehmarkt, Erntedank, Martinsfeuer, Fastelovend; Weinfest mit M11): Warenliste, Fest, 15–25 Punkte, einmal je Spieljahr, Obergrenze 200 (`data/feste.json`); Waren, die die Kirmes braucht, gehen erst an die Kirmes
- [x] Kirmes-Stufen **Dorf → Kirchdorf** und **Kirchdorf → Marktflecken** mit Mischkorb (Bergkäse als Platzhalter für die Spezialität bis M11)
- [x] Beschwipste Boten: Schänke macht aus Schnaps Boten (3 min), die weite Lieferungen querfeldein tragen, torkeln und jede zehnte Ware verlieren (liest nach 2 min einer auf); **sofort erkennbar** (rote Nase, Flasche, schiefe Mütze, Schlagseite, Hicks-Bläschen; Pegel 1–3)
- [x] **Jahreszeiten mit Wirkung:** Spieljahr 60 min ab Frühjahr; Felder ruhen im Winter, säen im Frühjahr, ernten im Herbst schneller; Winter mit Schnee (Gelände und Wald), langsameren Wegen und Wintervorrat (frieren statt sterben); alles aus dem Tick
- [x] **Wetter stark, aber fair:** Regen, Talnebel, Venn-Wind, Dürre, Missernte, Hochwasser in der Aue; aus der gemeinsamen Saat, 2 Minuten vorher als Bauernregel der Erzählfigur, nie zerstörerisch (`data/jahr.json`)
- [x] Oberfläche: Jahreszeit und Wetter in der Statuszeile, Zeile fürs kleine Fest, Festpunkte, „friert“; Gebäudefenster zeigt Lagerregeln, Bauleute, Mischkorb, Fest, Boten, Feld- und Werkzeugregeln aus den Daten; neue Zustände (Winter, Saat, Hochwasser, Werkzeug) mit Symbol
- [x] Balancing der Startwerte über einen 2-Stunden-Lauf (`tests/m8-szenario.ts`): Kirchdorf-Liste auf 15/20/25/10 gehoben, Marktflecken bei 10/10/20

**Abnahme:** Ein Dorf erreicht in einer Partie allein den Marktflecken. Der erste Winter ist spürbar, aber wer vorsorgt, kommt gut durch. Im Mehrspieler trifft das Wetter alle gleich.
→ Automatisch: `tests/m8.test.ts` (Bot allein: Dorf nach 27, Kirchdorf nach 52, Marktflecken nach 75 Spielminuten, 95 Festpunkte, mit Vorrat 2 Minuten gefroren; dasselbe Dorf ohne Vorrat friert den ganzen Winter und schafft rund 30 % weniger; Replay gleich), `tests/m8-sim.test.ts` (Ketten, Lagerregeln, Bauleute, Kirmes-Stufen, Feste, Jahreszeiten, Winter, Wetterplan, Hochwasser, Boten, alte Spielstände), `tests/partie.test.ts` (Lagerregel, Bauleute, Jahreszeit und Wetter über schlechtes Netz, nach Neuladen gleich), im Browser `tests/mehrspieler.mjs` (Lagerregel und Bauleute per Klick, Jahreszeit gleich) und Node = Browser für 55 Minuten Bot im Smoke-Test.
Offen: Spieltest mit Menschen (Zeitziele ~30–45 / ~75 / ~110 min; der Bot ist wie in M5 schneller).

Noch nicht drin (kommt später): Schützenhaus und Schützenfest (M10), Regler Boten/Finder in der Schänke (mit den Findern, M10), Spezialität der Völkchen (M11), Regen-, Nebel- und Hochwasser-Optik (M12).

---

## M9 – Stil: Siedler trifft Comic ✅ (erster Stand) → 🔨 Nutzer-Blick und weitere Gutachter-Runden

**Ziel:** Der Stil aus Drehbuch 7 wird verbindlich und überall umgesetzt, bevor die 2-Stunden-Partien beginnen: Siedler-2-Look mit Asterix-Comic-Einschlag, knubbelige Figuren, bunte, schiefe Fachwerkhäuser mit Charakter und Kleinkram, lesbare Waren. Damit der Stil nicht untergeht, ist er ein eigener Meilenstein mit messbarer Abnahme.

- [x] **Stilprobe** (Wohnhaus, Träger, Ware) in drei Varianten, der Nutzer wählt eine aus (`tools/stilprobe/`): **gewählt: Wimmelbuch kräftig mit Linie** (`?v=m`: Kleinkram aus C1, Farben und Licht aus C2, feine Linie aus C3, ohne Unschärfe)
- [x] **Stil-Leitfaden** (`STIL.md`): Proportionen der Figuren, Farbpalette je Region, Dachneigung und „Schiefe“, Konturen/Schattierung, Licht und Farb-Grading, Oberfläche
- [x] **Alle Gebäude** im gewählten Stil: gemalte Verläufe, weiche Kanten, Schiefe, Ziegelreihen, Rauch, Kleinkram je Hof (Hühner, Beete, Fässer, Bienenkörbe, Wäsche); drei Bauphasen wie bisher
- [ ] Weitere kleine Animationen (Mühlrad, Bienen, Schafe) – mit M12
- [x] **Figuren** (Träger, Arbeiter, Bauleute, Boten) im gewählten Stil: großer Kopf, Bauch, Gesicht unter der Kappe sichtbar, Kappe in Trachtfarbe
- [x] **Waren** an den Stil angepasst (getragen größer) (lesbar bleibt Pflicht, Drehbuch 7.6)
- [x] Gelände, Wald und Wasser farblich zum Stil passend, Wiesen-Deko, Schnee auf Dächern und Felsen; Oberfläche im selben Ton, Lagerzeile einklappbar
- [x] **Bildstrecke** als Skript (`tools/bildstrecke.mjs`): feste Kameras, feste Saat – Übersicht, Dorf nah, jedes Gebäude, Figuren groß, Waren, Fenster, Sommer und Winter, Fest, kurze Bildfolgen für Bewegung
- [x] **Bewertung durch Gutachter-Agenten** (6 Runden in M9, Ergebnis im PR) auf der Bildstrecke: Bewertungsbogen aus Drehbuch 7 (Siedler-Comic-Mischung, Figuren, Gebäude, Waren, Einheitlichkeit, Licht und Farbe, Oberfläche, je 1–10 mit Begründung), 5 unabhängige Gutachter, einer davon gezielt kritisch, dazu der Vergleich mit der vorigen Version; die häufigste Kritik wird zur Aufgabenliste der nächsten Runde (Feinschliff)
- [x] Leistung: Dreiecke im Rahmen gehalten (Fernbäume sparsam, Deko als Oktaeder-Tupfen); Messung auf echter Hardware steht mit M1/M12 aus

**Abnahme:** 4 von 5 Gutachter-Agenten sagen „Stilziel aus Drehbuch 7 erreicht“, kein Punkt des Bogens unter 7, und die neue Version gewinnt den Vergleich mit der vorigen. Das letzte Wort hat der Nutzer (Menschen-Blick wie beim Spieltest).

---

## M10 – Gebiet, Nachbarn, Finden, Ziele → erste 2-Stunden-Partie ✅ (erster Stand) → 🔨 Spieltest einer vollen Partie

**Ziel:** Man misst sich ohne Krieg. Danach ist **eine volle Partie von 2 Stunden** allein und zu mehreren spielbar (Drehbuch 6).

- [x] **Einfluss:** Lager (+1 je Dorfstufe), Wohnhäuser, Kirmesplatz, Schützenhaus und Dorfpolizist strahlen aus, gut versorgt (friert nicht) +1, Schützenkönig +1; bauen und Fahnen nur auf eigenem Gebiet, Wege auch über freies Land, nie über fremdes; Gebäude auf fremdem Gebiet stehen still; Grenzband und Grenzsteine in Spielerfarbe (`data/nachbarn.json`: gebiet). Eine Kirche gibt es noch nicht
- [ ] Erkundung und Nebel in Kartenpapier-Optik (DESIGN §8, im Drehbuch noch nicht festgelegt) – offen
- [ ] **Grenzsteine versetzen** (nachts, mit Risiko) und **Abwerben** über Kirmes und Essen – offen; Gebäude werden nie zerstört, sie stehen still (umgesetzt)
- [x] **Orte mit Einstand** (Drehbuch 6.2): jeder Ortskern im Spielfeld ist ein Ort (Weiler/Dorf/Städtchen nach Größe), Ortsschild, Wunschliste je Ort, Weg bis an den Ortskern, „Einstand liefern“ aus dem Lager, dann Lager mit Fundkiste, Gebiet, Bewohner und Punkte; im Mehrspieler gewinnt, wer zuerst ankommt, der andere hat umsonst geliefert
- [ ] Jahresfest je gewonnenem Ort – offen
- [x] **Flachländer am Kartenrand:** die zwei nächsten Städte (Aachen, Düren, Euskirchen, Bonn, Koblenz, Trier, Lüttich) als Marktposten mit Wegweiser in ihre echte Richtung und echter Entfernung; Handel sofort (6 Tauschangebote, ab Marktflecken je Tausch 1 Stück mehr), Wachsamkeit gegen Finder, nicht zu gewinnen
- [x] Finderhütte, **Finden mit Gegenwehr** (Wachhund, Dorfpolizist), **Ausredenstube** mit Sprüchen (Gänge abstrakt, ohne Figur auf der Karte)
- [ ] Fundbüro, Finder als Figur – offen
- [ ] Zöllner an der Staatsgrenze, Kaffeeschmuggel – offen
- [x] **Schützenfest** mit Schützenhaus, Schießstand und **Vogelschuss** (Vorbereitung + etwas Glück), Schützenkönig zahlt die Runde, bringt Punkte und Einfluss
- [x] Siegbedingungen: **Eifel-Punkte** bis zur Zielpunktzahl (kurz 600, normal 1000, lang 1500) aus Lobby bzw. Einstellungen, Zwischenstand im Status, **Wettlauf** zum Marktflecken, allein auch **„ohne Ende“**
- [ ] **Der Große Fund** – offen
- [x] Abschluss-Bildschirm (Rangliste mit Punkten, Stufe, Bewohnern, Gebiet, Orten; Statistik; Weiterspielen)

**Abnahme:** Vier Testspieler (oder zwei plus Flachländer) spielen eine 2-Stunden-Partie bis zum Ende ohne Abbruch. Danach sagen sie: „Noch eine.“

---

## M11 – Die 10 Völkchen ✅ (erster Stand) → 🔨 Balancing in Testpartien

**Ziel:** Jeder Startort spielt sich anders (Drehbuch 5.3).

- [x] Völkchen aus dem Startort (Kerngebiete in `data/regions.json`, sonst der erste Ortskern des Ausschnitts in einem Kerngebiet); eine echte Gebietskarte im Konverter folgt
- [x] Allein im freien Spiel frei wählbar (Einstellungen → „Völkchen für neue Spiele“), im Mehrspieler immer aus dem Startort; fehlt dem Ausschnitt Wasser oder Moor für eigene Gebäude, warnt die Erzählfigur beim Start
- [x] Je Völkchen Bonus, **Spezialkette (2–3 Gebäude, ab Stufe 2)**, augenzwinkernde Schwäche, edle Spezialität für die Marktflecken-Kirmes (statt des Bergkäse-Platzhalters); Regeln in `data/voelkchen.json`
- [x] Monschauer & Venner, Rursee-Leute, Rureifeler, Vulkaneifeler, Ahrtaler, Laacher & Mayener, Südeifeler, Schneifeler, **Ostbelgier**, **Öslinger** mit Römerstraße, Vennbahn, Abtei, Bootsverleih, Torf, Basaltbruch und wachsenden Hecken wie im Drehbuch
- [x] **Hecken als Monschauer Spezialität:** Buchenhecke aus Setzlingen, wächst erst heran (Monschauer 25 % schneller), dann Windschutz im Winter (+30 % bis 2 Hexe); als lebende Grenze gegen Grenzsteinversetzer kommt sie mit dem Versetzen
- [x] Tracht und Farbe je Völkchen (Figuren im Farbton des Völkchens), Dächer in regionaler Farbe (Schiefer, Buntsandstein, Basalt); Wände und Mauern regional folgen
- [x] Sprüche je Völkchen (ripuarisch, moselfränkisch, Ostbelgien, Ösling) mit Übersetzung, Erzählfigur je Völkchen auch im Mehrspieler
- [ ] Balancing: kein Völkchen gewinnt in Testpartien deutlich öfter – Faustregel in den Daten (Bonus ≤ +25 %, Schwäche ≥ −20 %), Testpartien stehen aus

**Abnahme:** Ein Ausschnitt über die belgische Grenze bringt Monschauer gegen Ostbelgier. Beide spielen sich erkennbar anders und sind gleich stark.

---

## M12 – Feinschliff Figuren, Wetter, Klang → Version 1.0 ✅ (erster Stand) → 🔨 Leistung auf echter Hardware, Spieltest

**Ziel:** Charme und Fertigstellung. Freies Spiel und Mehrspieler sind fertig (Drehbuch 1, 7).

- [x] Figuren mit **Mimik** (Brauen, Mund lacht/Strich/Flunsch, Blinzeln) und **Gesten** (Winken beim Übergeben, Kopfkratzen beim Warten, Jubeln und Hüpfen beim Fest, Schimpfen); Laune aus dem Dorf (Fest froh, Frieren grimmig, schwere Last verzieht das Gesicht); Boten grinsen und singen; Arbeiter mit Mimik, die Arme bleiben beim Werkzeug
- [x] **Waren schöner** (Drehbuch 7.6): Stamm mit Jahresringen, Rindenfurchen und Aststummel, Bretter mit Maserung und Ast, Steine mit Moos und Feldstein; Waren wackeln beim Tragen (schwere mehr)
- [x] **Gebrabbel** mit Eifeler Klang statt Sprecher (Formant-Stimme, Silben aus Eifeler Wörtern, Stimmlage je Erzählfigur), Betrunkene singen schief (Drehbuch 7.2)
- [x] Wetter- und Tageszeiten-Optik (`data/optik.json`): Regen und Schneefall um den Blickpunkt, Talnebel in den Tälern (gleiche Tal-Regel wie die Simulation, im Herbst auch Morgennebel), ziehende **Wolkenschatten**, Hochwasser in der Aue, Tageszeit (Tag = 12 Spielminuten: goldener Morgen und Abend, blaue Nacht – spielbar hell), Uhrzeit in der Statusleiste
- [x] Nachbearbeitung je Qualitätsstufe: weiche Verdeckung (SSAO-artig aus der Tiefe, Mittel abgeschwächt, Hoch voll), dezentes Leuchten (Hoch), Farb-Grading nach Tageszeit und Wetter; Niedrig ohne
- [x] **Volksmusik** im Browser erzeugt (`data/klang.json`): Akkordeon-Walzer, Blasmusik mit Tuba-Umtata, Fiedel; Tusch mit Pauke bei Kirmes, Festen, neuer Stufe und Schützenkönig; Arbeitsgeräusche räumlich um den Blickpunkt (Säge, Axt, Amboss, Steinklopfen, Schafe, Kühe, Hunde, Bienen), Vögel, Grillen, Wind, Regen, Bach; nachts heulen die **spukenden Grenzsteinversetzer**; Regler für Musik und Geräusche
- [x] **Einführung durch die Erzählfigur** des eigenen Völkchens (`data/einfuehrung.json`): „Erste Schritte mit …“ – acht Schritte bis zur ersten Kirmes, die Figur kommentiert jeden geschafften Schritt mit ihrem Sprachtick; Bauernregeln kündigen das Wetter an (seit M8)
- [x] Running Gags aus Drehbuch 1.2: „Mer renne nit.“ beim schnellsten Tempo, „Noch keine Eifel.“ über fremden Dörfern und Orten, **Eifelfonds** („Preußisch Sibirien“: zahlt nur armen Dörfern), Annakirmes, Kaffee über die Grenze, „von bei Aachen“, Bootsverleih mit Kapitän Kalle, spukende Grenzsteinversetzer
- [x] **Startmenü** (Weiterspielen, Freies Spiel, Mit Freunden, Kampagne kommt mit M13, Mitwirkende) mit Spruch der Völkchen; **Mitwirkende und Quellen** (Weltdaten aus dem Manifest, Erzählfiguren, Technik, Recherche)
- [ ] Leistungsdurchgang auf echter Hardware (60 fps bei „Mittel“) – im Container nur Software-Rendering

**Abnahme:** Eine Gruppe Fremder spielt über den Link eine Partie ohne Hilfe von uns. Die Leistung hält 60 fps bei „Mittel“. Die Bildstrecke aus M9 besteht die Gutachter-Bewertung weiterhin.

---

## M13 – Kampagne „Der Eifelsteig“

**Ziel:** Mit dem eigenen Völkchen den Eifelsteig entlang wandern (Drehbuch 2.1).

- [ ] Kampagnenkarten als feste Ausschnitte mit fester Datenversion und Missionsdaten
- [ ] 15 Etappen in 4 Abschnitten (Nordeifel, Kalkeifel, Vulkaneifel, Südeifel), je eigenes Ziel
- [ ] Eifel-Übersicht mit dem gewanderten Weg zwischen den Etappen, Erzählfigur führt durch
- [ ] Danach Zusatzwege, z. B. entlang der Rur mit Düren

---

## Danach (offen)

- **Verbundene Regionen** im Mehrspieler: jeder spielt seinen eigenen Ausschnitt und schickt Händler und Finder hinüber (Drehbuch 2.3)
- **Die Karte wächst in andere Gebiete** (Wunsch aus M11, „die Eifel erobern“), in Stufen: (1) Kampagne M13 wandert von Karte zu Karte, Völkchen, Punkte und ein Teil der Waren kommen mit; (2) im freien Spiel „umziehen“: am Kartenrand den Ausschnitt vergrößern, das Dorf bleibt (Spielstand auf größerer Karte); (3) echtes Wachsen während der Partie, auch im Mehrspieler (neues Speicherformat, Kacheln nachladen im Gleichschritt, Leistung) – eigener Meilenstein
- Volle KI-Gegner, die selbst bauen (Drehbuch 6.2)
- Desktop- oder Store-App (Drehbuch 8.2)

---

## Laufende Pflichten (jeder Meilenstein)

- Das Drehbuch wird mitgeführt, die JSON-Daten sind die Wahrheit für Zahlen
- **Determinismus-Test** (Replay → gleiche Prüfsumme) läuft ab M3 bei jeder Änderung an der Simulation
- Ab M6 wird jedes neue Feature auch im Mehrspieler angespielt
- Screenshot-Test (`tools/shot.mjs`) aus festen Kamerapositionen, damit die Optik nicht unbemerkt kaputtgeht
- Ab M9: neue Gebäude, Figuren und Waren folgen dem Stil-Leitfaden (`STIL.md`); an jedem Meilenstein läuft die Bildstrecke mit Gutachter-Bewertung
- Leistungsanzeige (F3) im Blick: Draw-Calls, Dreiecke, CPU-Zeit
