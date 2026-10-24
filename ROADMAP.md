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
| M14 | Der Mai: Maibaum und Maijungen | Maibaum stellen, Maibaumklau statt Krieg |
| M15 | Grenzland und lebendige Eifel | Grenzsteine, Zöllner, Kaffeeschmuggel, Fundbüro, Der Große Fund; alles bewegt sich |

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
- [x] Weitere kleine Animationen (Mühlrad, Bienen, Schafe) – in M15 (Lebendige Eifel)
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
- [x] **Grenzsteine versetzen** (nachts, mit Risiko) und **Abwerben** über Kirmes und Essen – in M15; Gebäude werden nie zerstört, sie stehen still (umgesetzt)
- [x] **Orte mit Einstand** (Drehbuch 6.2): jeder Ortskern im Spielfeld ist ein Ort (Weiler/Dorf/Städtchen nach Größe), Ortsschild, Wunschliste je Ort, Weg bis an den Ortskern, „Einstand liefern“ aus dem Lager, dann Lager mit Fundkiste, Gebiet, Bewohner und Punkte; im Mehrspieler gewinnt, wer zuerst ankommt, der andere hat umsonst geliefert
- [x] Jahresfest je gewonnenem Ort – in M15
- [x] **Flachländer am Kartenrand:** die zwei nächsten Städte (Aachen, Düren, Euskirchen, Bonn, Koblenz, Trier, Lüttich) als Marktposten mit Wegweiser in ihre echte Richtung und echter Entfernung; Handel sofort (6 Tauschangebote, ab Marktflecken je Tausch 1 Stück mehr), Wachsamkeit gegen Finder, nicht zu gewinnen
- [x] Finderhütte, **Finden mit Gegenwehr** (Wachhund, Dorfpolizist), **Ausredenstube** mit Sprüchen (Gänge abstrakt, ohne Figur auf der Karte)
- [x] Fundbüro, Finder als Figur – in M15
- [x] Zöllner an der Staatsgrenze, Kaffeeschmuggel – in M15
- [x] **Schützenfest** mit Schützenhaus, Schießstand und **Vogelschuss** (Vorbereitung + etwas Glück), Schützenkönig zahlt die Runde, bringt Punkte und Einfluss
- [x] Siegbedingungen: **Eifel-Punkte** bis zur Zielpunktzahl (kurz 600, normal 1000, lang 1500) aus Lobby bzw. Einstellungen, Zwischenstand im Status, **Wettlauf** zum Marktflecken, allein auch **„ohne Ende“**
- [x] **Der Große Fund** – in M15
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

## M13 – Kampagne „Der Eifelsteig“ ✅ (erster Stand) → 🔨 Weltdaten „eifelsteig“ rechnen, Etappen durchspielen

**Ziel:** Mit dem eigenen Völkchen den Eifelsteig entlang wandern (Drehbuch 2.1).

- [x] Kampagnenkarten als feste Ausschnitte (globales Hex und Größe je Etappe, aus der Lage der echten Orte gerechnet) mit Missionsdaten in `data/kampagne.json`; Start im Ort „von“, gewandert wird nach „nach“. Neues Weltdaten-Gebiet **„eifelsteig“** (nur die Kacheln der Etappen, Workflow „Weltdaten“ und `tools/welt-laden.sh eifelsteig`); fehlen die Daten, sagt die Übersicht es
- [x] 15 Etappen in 4 Abschnitten (Nordeifel, Kalkeifel, Vulkaneifel, Südeifel), je eigenes Ziel: Bewohner, Kirmes/Stufe, Waren im Lager, Gebäude, Eifel-Punkte, Schützenkönig und den Zielort gewinnen (Einstand). Die Etappenziele stehen links im Spiel
- [x] Eifel-Übersicht mit dem gewanderten Weg (rot) und den Flachland-Städten zwischen den Etappen; die Erzählfigur des gewählten Völkchens führt durch (Einleitung je Etappe, Kommentar beim Abschluss)
- [x] **Mitnahme** (Stufe 1 von „die Karte wächst“): Völkchen und Punkte bleiben, ein **Rucksack** mit bis zu 15 Waren aus dem Lager kommt als Startwaren in die nächste Etappe (`StartDaten.waren`, Teil von Stand und Replay)
- [x] Zusatzweg **„Entlang der Rur“** (Monschau – Einruhr – Heimbach – Nideggen – Kreuzau, Düren in Sicht); „Heimbach – Nideggen“ ist mit den Nideggen-Daten spielbar und wird im Rauchtest durchlaufen
- [ ] Alle Etappen mit echten Weltdaten durchspielen und die Ziele einstellen (Spieltest)

---

## M14 – Der Mai: Maibaum und Maijungen ✅ (erster Stand) → 🔨 Spieltest der Mainacht

**Ziel:** Maibaum stellen und den Nachbarn den Maibaum klauen – der Wettstreit zwischen Dörfern ohne Krieg (Idee aus der Spielrunde). Vorbild ist der echte Brauch: Junggesellen stellen den Baum in der Nacht zum 1. Mai auf, Nachbardörfer versuchen ihn zu klauen, zurück gibt es ihn gegen Auslöse in Bier und Brotzeit (Bayern, Österreich, Rheinland; in der Eifel stellen ihn die Junggesellenvereine, dazu das Mailehen).

- [x] **Junggesellenverein** (Gebäude, ab Dorf): macht aus Bewohnern und Landbier **Maijungen** (nur Jungs, wie im Brauch)
- [x] **Maibaum stellen** in der **Mainacht** (zu Beginn des Frühjahrs, nur an diesem Tag): Stamm mit Bändern am Kirmesplatz; ein stehender Baum gibt Eifel-Punkte und macht das **Maifest** größer
- [x] **Maibaumklau** nur in der Mainacht: Maijungen ziehen ins Nachbardorf und tragen den Baum weg, er steht dann beim Dieb (Punkte für ihn). Regeln wie im Brauch: nie den eigenen, nichts geht kaputt, keine Gewalt
- [x] **Abwehr:** Maijungen wachen am eigenen Baum (Hand am Stamm = tabu), oder man gibt den Angreifern **Bier** – dann torkeln sie zurück (wie die Boten)
- [x] **Auslöse:** gestohlenen Baum gegen Bier und Bratkartoffeln zurückholen, die Erzählfigur kommentiert; Feier bei der Übergabe
- [x] Allein: Nachbarorte (und Flachländer) versuchen ab und zu einen Klau, damit es auch etwas zu verteidigen gibt
- [x] **Mailehen**: am Ende der Mainacht bringt der Verein Zuzug (2 Bewohner, einmal im Jahr)
- [x] Maijungen als Helfer bei Festen und beim Schützenfest, beim „Finden“ von Grenzsteinen – in M15
- [x] Zahlen in `data/mai.json`; Mainacht ist Nacht (Optik), Uhr und „Mainacht in … min“ in der Statusleiste, Meldungen der Erzählfigur, Tusch
- [x] Mehrspieler: Klau, Abwehr und Auslöse im Gleichschritt, getestet in `tests/partie.test.ts` und `tests/mehrspieler.mjs`

**Abnahme:** In einer Mehrspieler-Partie stellen beide Dörfer in der Mainacht ihren Baum, einer wird geklaut, mit Bier abgewehrt oder ausgelöst – und alle lachen.

## M15 – Grenzland und lebendige Eifel (Grenzland ✅, lebendige Eifel 🔨)

**Ziel:** Die offenen Teile aus M10 (Drehbuch 2.3, 6.2–6.4). Die Grenzen werden lebendig: zwischen Dörfern verschiebt man Grenzsteine und wirbt Leute ab, an der Staatsgrenze stehen Zöllner und der Kaffee kommt trotzdem rüber. Was die Finder mitbringen, macht das Fundbüro wertvoll, bis zum **Großen Fund**. Mit der ganzen Eifel liegen jetzt echte Staatsgrenzen (Belgien, Luxemburg) auf der Karte.

- [x] **Grenzsteine versetzen** (Drehbuch 6.2): ein Finder trägt nachts einen Grenzstein ein Stück weiter; gelingt es, wechseln ein paar Hexe den Besitzer. Gegenwehr wie beim Finden (Wachhund, Dorfpolizist), Erwischte in die Ausredenstube. **Hecken** der Monschauer & Venner machen Grenzsteine dahinter fast unversetzbar
- [x] **Maijungen als Helfer** (aus M14): tragen Grenzsteine schneller und helfen bei Festen und beim Schützenfest
- [x] **Abwerben:** die bessere Kirmes und das bessere Essen locken Bewohner vom Rand der Nachbarn herüber, selten zieht ein ganzer Hof mit seinem Land um; die eigenen Leute satt und bei Laune halten schützt
- [x] **Zöllner an der Staatsgrenze** (Drehbuch 2.3, 3.1): Zollhaus der Gegenseite an der gestrichelten Linie im Spielfeld, Wachsamkeit wie bei den Flachländern; keine harte Regel, nur Gelegenheit
- [x] **Kaffeeschmuggel:** Kaffee als Luxusware (neue Ware, in Verteilung, Warenübersicht und Statistik), kommt mit Findern über die Grenze; Mützenich als Schmugglernest, Zöllner a. D. Gerd merkt nie etwas. Ohne Staatsgrenze im Ausschnitt gibt es Kaffee nur bei den Flachländern
- [x] **Fundbüro** (Gebäude, Fenster ohne Sondercode): wertet Funde auf (Werkzeug, besseres Gewehr für den Vogelschuss, Kaffee), große Funde 30–100 Punkte
- [x] **Finder als Figur** auf der Karte (statt abstrakter Gänge), auch beim Grenzstein-Tragen
- [x] **Jahresfest je gewonnenem Ort**: der Ort feiert einmal im Jahr mit, kleine Punkte und Laune
- [x] **Der Große Fund** (Drehbuch 6.4): Teile eines seltenen Schatzes bei verschiedenen Nachbarn finden und im Fundbüro zusammensetzen (75 Punkte je Teil); auch als Siegbedingung in der Lobby
- [x] Nachts **spukende Grenzsteinversetzer** als Geräusch, Meldungen der Erzählfiguren
- [x] Zahlen in `data/grenzland.json` (dazu Ware Kaffee in `data/goods.json`, Fundbüro in `data/buildings.json`, Ziel „Der Große Fund“ und Kaffee-Handel in `data/nachbarn.json`), alles über Befehle, in Prüfsumme und Spielstand (alte Spielstände laden mit Standardwerten)
- [x] Mehrspieler: Grenzsteine, Abwerben, Schmuggel und Fund im Gleichschritt, getestet in `tests/partie.test.ts` und `tests/mehrspieler.mjs`

**Startwerte (`data/grenzland.json`):** Nacht 21–5 Uhr (die Mainacht zählt mit); ein Grenzstein nimmt dem Nachbarn das Land im Umkreis von 2 Hexen (seine Lager bleiben), höchstens 6 je Dorf, hinter einer ausgewachsenen Hecke 95 % Erwischt-Chance; Abwerben alle 90 s bei 15 Reiz Vorsprung mit 40 %, davon 20 % ein ganzer Hof (2 Bewohner und Land); Zollhaus 35 % wachsam, Schmuggler-Völkchen (Monschauer & Venner) 25 % weniger, 2 Kaffee je Gang; Fundbüro: +1 je Fund, 15 % großer Fund, Kaffeekränzchen 2 Punkte (bis 60); Großer Fund „Der Schatz vom Hohen Venn“ in 4 Teilen zu je 75 Punkten, 35 % je Fund, 50 % beim Einstand; Jahresfest 5 Punkte (bis 100); Maijungen als Helfer ab 2 freien: Stein 50 % schneller, +5 je Fest, +10 beim Schützenfest. Bilder: `tools/grenz-shots.mjs`.

**Lebendige Eifel (aus M9):** Das ganze Spiel soll grafisch interessanter werden – überall bewegt sich etwas, man sieht, was ein Gebäude tut. Stil nach `STIL.md`, Leistung im Rahmen (Instanzen, wenige Draw-Calls, aus der Ferne ausblenden).

- [x] **Arbeitende Gebäude:** Mühlrad und Windmühlenflügel drehen sich, Säge und Amboss bewegen sich, Rauch aus Schornsteinen, Brennerei und Köhlerei dampft, Brauerei mit Fässern, nur wenn das Gebäude wirklich arbeitet (Sicht)
- [x] **Tiere:** Schafe auf den Weiden am Schafstall, Kühe, Hühner im Hof, Bienen um die Bienenkörbe, Hund am Hof; ein paar Vögel und Raben über Feldern
- [x] **Natur:** Bäume und Hecken wiegen im Wind (stärker bei Sturm), Wasser mit Glitzern und Strömung an Bächen, Blätter im Herbst, Rauchschwaden im Winter
- [x] **Dorfleben:** Wäsche flattert, Kinder spielen am Kirmesplatz, Leute stehen schwätzend vor der Schänke, Laternen und Fensterlicht in der Nacht
- [x] **Feste und Ereignisse** sichtbarer: Fahnen und Wimpel, Konfetti beim Tusch, Funken beim Martinsfeuer
- [x] **Bildstrecke** (`tools/bildstrecke.mjs`) mit kurzen Bildfolgen für Bewegung, Gutachter-Runde wie in M9 (Vergleich mit der vorigen Version)
- [x] **Berufe erkennbar:** Tracht je Beruf (Holzfäller mit Pudelmütze und Bart, Förster mit Jägerhut, Steinbrecher mit Lederkappe und Schutzbrille, Bauleute mit Zimmermanns- bzw. Strohhut), größere Werkzeuge; vor arbeitenden Gebäuden steht der Meister in Tracht (Schmied, Koch, Käserin, Brauer, Wirt, Köhler, Imker, Bauer, Fischer)
- [x] **Schindeldächer** (versetzte Schindeln bzw. Schieferplatten) und **Kontaktschatten** unter Kleinkram, Tieren und Figuren
- [x] **Gesichter und Zöpfe:** Gesichtsvarianten (Schnauzer, Vollbart, Brille, Frau mit geflochtenen Zöpfen und Schleife, Alter mit weißem Bart); Laternen an belebten Fahnen; Träger stellen sich am Lager in die Schlange
- [x] **Frauen, Fest und Feinschliff (Gutachter-Runden 9–10):** Frauen mit Kopftuch, Rock, Stupsnase und roten Lippen statt Bart; Festbesucher im Ring um das Karussell (nur beim Fest); Figuren etwas kleiner, Meister seitlich der Tür; Bach breiter mit Ufer; Laterne mit Glaskopf; Winterwege als festgetretene Spur; violettblauere Nacht; Wege leicht geglättet (Zickzack übers Hex-Gitter)
- [x] **Wege sauber geführt:** Wege gehen von der Fahne nicht nach hinten durchs Haus, hinter Plätzen mit Hof (Kirmesplatz, Schützenhaus, Abtei) führt kein Weg; Bäche und Flüsse kreuzen sie quer statt am Wasser entlang (`tests/weg-fuehren.test.ts`)
- [x] **Holzbrücken als Ware:** Ein Weg über einen Bach oder Fluss bleibt zu (kein Träger, keine Waren), bis ein Träger je Fluss-Hex eine Holzbrücke an das angeschlossene Ende bringt; dann steht dort eine kleine Brücke. 2 Brücken im Startlager, mehr baut die **Zimmerei** aus 3 Brettern (wie die Boote in Siedler 1). Keine Fahne mitten im Bach auf dem Weg. Gebaute Brücken im Spielstand und in der Prüfsumme; ältere Spielstände bekommen die Brücken unter bestehenden Wegen geschenkt (`tests/bruecke.test.ts`, Gleichschritt in `tests/partie.test.ts`, `tests/mehrspieler.mjs`)
- [x] **Wildtiere** am Waldrand und im Wald: Rehe, Hirsche, Wildschweine mit Frischlingen, Füchse, Hasen, selten Wildkatze und ein Wolfsrudel (`src/render/wild.ts`)
- [x] **Gebäude und Figuren deutlicher:** Fensterrahmen mit Kreuz und Bank, Tür mit Sturz und Stufe, Bruchsteinsockel, gedecktes Dach mit First und Ortgang, Schornstein über dem First; Zunftschild mit der Ware des Gebäudes; Figuren größer mit Hosenträgern, Kragen, Ohren und schmalem Randlicht; Baumenü-Icons aufs Motiv zugeschnitten, Symbole für alle Waren

**Umgesetzt (Lebendige Eifel, `src/render/leben.ts`, `src/render/gras.ts`, Werte in `data/leben.json`):** Rauch und Dampf aus den Schornsteinen (Herdfeuer immer ein wenig, Werkstätten nur bei der Arbeit, im Winter und nachts mehr), Wasserräder an Sägewerk, Eisenhütte, Senf- und Papiermühle, Säge mit Sägemehl, Schmiedehammer mit Funken und Glut, Windmühle am Gerstenfeld; Schafe und Kühe grasen, Hühner picken, Hofhund am Lager, Bienen, Vogelschwärme (im Winter Raben); Bäume wiegen im Wind (Böen, stärker bei Sturm), Herbstlaub je Baum, Glitzern auf Seen und Bächen, Grasbüschel im Wind rund um den Blickpunkt, gemalter Boden mit erdigen Hängen; Wäsche flattert, Kinder toben über den Kirmesplatz, Leute schwätzen vor der Schänke, nachts Fensterlicht (auch in den Kulissendörfern) und Laternen; Konfetti beim Tusch, Martinsfeuer mit Funken; dazu Leuchten und Vignette in der Nachbearbeitung (aus auf „Niedrig“). Die Anker (wo Rauch aufsteigt, wo Fenster sind, wo Hühner laufen) kommen aus den Gebäudemodellen selbst. Alles als Instanzen bzw. Punktwolken, nur bis 2,2 km von der Kamera. Reine Darstellung: keine Prüfsumme, kein Spielstand, im Mehrspieler bei beiden gleich gezeichnet. Bilder: `tools/leben-shots.mjs`. Hecken (Gebäude) stehen still. Gutachten (zwei Runden, je 5 Gutachter; lokal in `test-results/gutachten/`, Zusammenfassung im PR) – die neue Version gewinnt jeweils; nach Runde 1 Rauch wieder als Comic-Wölkchen, Randlicht ohne Überstrahlen, warme Nacht mit Lichtfleck vor den Fenstern, satteres Herbstlaub; nach Runde 2 weicheres Gras und Icons aus den Modellen statt Zeichen. Später zehn Runden insgesamt: in Runde 10 sagen 4 von 5 Gutachtern „Stilziel erreicht“ (STIL §8, kein Punkt unter 7); offen bleibt die AAA-Nähe (6–7: Materialtiefe, Übergänge Weg/Wiese, Berufe aus der Spielkamera).

**Abnahme:** In einer Mehrspieler-Partie an der belgischen Grenze (z. B. Monschau/Mützenich) verschiebt einer nachts die Grenze, der andere schmuggelt Kaffee am Zöllner vorbei, und einer setzt im Fundbüro den Großen Fund zusammen. Die Gutachter finden das Dorf deutlich lebendiger als vorher, die Bildrate bleibt im Rahmen.

## Nachtrag: Wunsch-Ort als Startpunkt ✅

- [x] Kartenwahl merkt sich den gesuchten Ort (Ortssuche oder Ort-Knopf), auch in der Adresse (`&o=`) und im Browser
- [x] Das Lager steht im Wunsch-Ort, solange er im Spielfeld liegt, auch wenn das Hex am Welt- oder Datenrand nach innen rückt; das Völkchen kommt von dort
- [x] Fällt der Ort beim Nach-innen-Rücken heraus, sagt die Kartenwahl es klar; Zeile „Startort“ im Infofeld
- [x] Mehrspieler: der Gastgeber startet im Wunsch-Ort (`tests/wunschort.test.ts`, `tests/mehrspieler.mjs`)

## Nachtrag: READMEs kurz ✅

- [x] README und README-platt neu: kurz, was das Spiel ist und kann, Schnellstart, Mehrspieler betreiben, Befehle; die Details der Meilensteine stehen nur noch hier in der Roadmap und im Drehbuch

## Höfe und Felder (wie Siedler 2) ✅ (erster Stand) → 🔨 Spieltest

Felder sind keine großen Gebäude mehr, sondern wachsen wie der Wald – ohne Sonderregeln, mit denselben Regeln wie Bäume:
- [x] **Hof** (Kartoffel-, Gersten-, Obst-, Wacholder-, Winzer-, Hopfen- und Lohhof; Ids wie bisher): ein normales Gebäude in seinem Hex (Wohnhaus mit Scheune, in voller Größe); der Bauer sät auf freien Hexen im Umkreis (wie der Förster pflanzt) und erntet das nächste reife Feld seiner Art (wie der Holzfäller fällt). Der Bienenstock bleibt ein Erzeuger
- [x] **Feld als Natur je Hex** (gesät, wächst in 3 Stadien, reif, abgeerntet), im Winter ruhen Bauer und Wachstum, in der Saatzeit im Frühjahr wird nur gesät (wie bisher die Feld-Saison); Ernte im Herbst und Wetter wirken auf den Bauern
- [x] **Platz zählt:** gesät wird nur auf freiem Land (kein Baum, kein Feld, keine Fahne, kein Weg, kein Fels); ein neuer Weg über ein Feld zertrampelt es (wie Wege Bäume roden), Bauen räumt es; ohne Platz meldet der Hof „Kein Platz für Felder“. Der Förster pflanzt nicht auf Felder
- [x] **Darstellung** (`src/render/felder.ts`): Furchen in der Bodenfarbe der Art, Pflanzen in Reihen (Kartoffelstauden, Ähren, Ranken an Stangen, Obstbäumchen, Wacholdersäulen, Eichenbüsche), reif mit Erntefarbe und Früchten; Reihen je Hex in eine von drei Richtungen (Flickenteppich); kein Gras auf Äckern; Bauer mit Schiebermütze und Hacke
- [x] Zahlen in `data/buildings.json` (`acker`: Name, Wachstum, Ernte; Radius, Säen/Ernten), `data/jahr.json` (Saat, alte Spielstände) und `data/leben.json` (`felder`); deterministisch (Felder in Spielstand und Prüfsumme wie die Bäume); alte Spielstände laden (die Feld-Gebäude sind jetzt Höfe und bekommen 3 reife Felder)
- [x] Tests: `tests/hoefe.test.ts`, Gleichschritt mit Neuladen und Weg über ein Feld in `tests/partie.test.ts`, Kartoffelhöfe beider Fenster in `tests/mehrspieler.mjs`; Bilder `tools/_hoefe.mjs`
- [ ] Spieltest: Wachstum und Radius mit Menschen einstellen

**Startwerte:** Radius 3 (gut 2), Säen bzw. Ernten 3 s, Ruhe 2 s, 1 Ware je reifem Feld; reif nach 90 s (Kartoffel, Hopfen), 100 s (Gerste, Wein, Lohe), 110 s (Obst), 120 s (Wacholder). Der M8-Bot setzt seine Höfe ins freie Land und erreicht Dorf, Kirchdorf und Marktflecken nach 26, 50 und 95 Minuten (vorher 26, 51, 82).

## Wald und Wild (Jäger) ✅ (erster Stand) → 🔨 Spieltest

Das Wild gab es bisher nur als Leben; jetzt führt es die Simulation, die Darstellung zeigt es (baut auf „Höfe und Felder“ auf):
- [x] **Wild je Hex wie der Wald:** Rehe und Wildschweine (je bis zu 2) leben auf Hexen mit mindestens 2 Bäumen, Startbestand fest aus der Karte. Nachwuchs alle 20 s nur, wo es selbst oder nebenan schon lebt – **zu viel Jagd leert den Wald**, bis Wild von nebenan einwandert. Wird der Wald gerodet oder bebaut, zieht das Wild ins waldreichste Nachbar-Hex
- [x] **Jagdhütte mit Hochsitz** (Jäger mit Lodenhut und Flinte): erlegt im Umkreis zuerst Wildschweine, dann Rehe → **Wildbret**; die **Wildküche** (ab Dorf) macht aus Wildbret und Kartoffeln **Wildgulasch** (veredelte Nahrung, zählt im Mischkorb)
- [x] **Wildschaden:** Wildschweine wühlen Kartoffel- und Gerstenfelder in ihrer Nähe um (das Feld fängt von vorn an, weniger Ernte); im Revier einer arbeitenden Jagdhütte nicht. Meldung der Erzählfigur
- [x] **Wolf und Wildkatze sind geschützt** (nicht jagbar), leben einzeln im vollen Wald und ziehen umher: der **Wolf** reißt ab und zu ein Schaf am Schafstall oder an der Schafweide (das Gebäude steht eine Minute), der **Herdenschutzhund** (Gebäude) schützt im Umkreis; die **Wildkatze** bringt dem Dorf, auf dessen Land ihr Wald steht, Ansehen (Eifel-Punkte, bis 60), solange ihr Wald bleibt
- [x] Darstellung: Rehe, Wildschweine mit Frischlingen, Wolfsrudel und Wildkatze stehen, wo die Simulation sie führt; Hirsch, Fuchs und Hase bleiben Schmuck am Waldrand
- [x] Zahlen in `data/wild.json` (dazu Jagdhütte, Wildküche, Herdenschutzhund, `schafe` und `acker.wuehlbar` in `data/buildings.json`, Wildbret und Wildgulasch in `data/goods.json`); deterministisch, in Spielstand und Prüfsumme; ältere Spielstände bekommen das Start-Wild auf den heutigen Wald
- [x] Tests: `tests/wild.test.ts`, Gleichschritt mit Neuladen in `tests/partie.test.ts`, Jagdhütte des Gasts und Wild bei beiden in `tests/mehrspieler.mjs`; Bilder `tools/_jagd.mjs`
- [ ] Spieltest: Nachwuchs, Wildschaden und Wolf mit Menschen einstellen

**Startwerte (`data/wild.json`):** Takt 20 s; Start 14 % der Wald-Hexe mit Reh, 9 % mit Wildschwein; Nachwuchs 7 % (Reh) bzw. 6 % (Sau) je Takt; Wildschaden 4 % je Wildschwein und Feld im Umkreis 2; Wolf auf 0,3 % der vollen Wald-Hexe, zieht mit 35 % weiter, reißt im Umkreis 5 mit 10 % je Takt; Wildkatze auf 0,5 %, 2 Punkte alle 2 min; Jagdhütte Radius 4, 8 s Ansitz; Herdenschutzhund Radius 3.

## Danach (offen)

- **Verbundene Regionen** im Mehrspieler: jeder spielt seinen eigenen Ausschnitt und schickt Händler und Finder hinüber (Drehbuch 2.3)
- **Die Karte wächst in andere Gebiete** (Wunsch aus M11, „die Eifel erobern“), in Stufen: (1) Kampagne M13 wandert von Karte zu Karte, Völkchen, Punkte und ein Teil der Waren kommen mit (✅ M13: Rucksack); (2) im freien Spiel „umziehen“: am Kartenrand den Ausschnitt vergrößern, das Dorf bleibt (Spielstand auf größerer Karte); (3) echtes Wachsen während der Partie, auch im Mehrspieler (neues Speicherformat, Kacheln nachladen im Gleichschritt, Leistung) – eigener Meilenstein
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
