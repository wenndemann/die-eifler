# Die Eifeler

Für de Lück von he: [Lies mich op Platt](README-platt.md)

Ein Aufbauspiel im Geist von Siedler 2 auf der echten Eifel von heute. Man spielt ein kleines, krummbeiniges,
schlitzohriges Bergvolk, das niemals stiehlt – es **findet** Dinge.

Three.js + TypeScript + Vite im Browser, Karten-Pipeline in Python. Was gebaut wird, steht im
[Drehbuch](DREHBUCH.md), die Reihenfolge in der [Roadmap](ROADMAP.md).

## Schnellstart

Voraussetzungen: Node.js ≥ 20, Python ≥ 3.10, Internet (die Geodaten werden beim Setup geladen).

    git clone https://github.com/wenndemann/die-eifler.git
    cd die-eifler
    npm ci
    pip install -r tools/map/requirements.txt
    npm run setup -- --gebiet nideggen      # Testgebiet Nideggen–Heimbach, ~10 Minuten
    npm run dev                              # http://localhost:5173

**Schneller:** fertig gerechnete Weltdaten aus dem GitHub-Release laden, statt sie selbst zu rechnen:

    tools/welt-laden.sh nideggen            # oder nordeifel

Die Releases rechnet der Workflow „Weltdaten“ (`.github/workflows/weltdaten.yml`) auf GitHub: im Tab „Actions“
starten oder einen Branch `weltdaten/<gebiet>` pushen.

`npm run setup` ruft `tools/map/setup.py` auf und legt eine Datenversion unter `welt-daten/` ab (nicht in Git).
Ohne `--gebiet` wird die **ganze Welt** gerechnet (Aachen – Trier – Maria Laach, mit Ostbelgien und
Nord-Luxemburg): das dauert viele Stunden, lädt rund 25 GB amtliche Höhendaten kachelweise und löscht sie
nach Gebrauch wieder. Unterbrochen? Einfach neu starten, es setzt fort. Details und Lizenzen:
[tools/map/README.md](tools/map/README.md).

| Gebiet | Umfang | Dauer (ca.) |
|---|---|---|
| `nideggen` | 18 × 18 km um Nideggen, Heimbach, Rursee-Nord | 10 min |
| `nordeifel` | Monschau – Düren inkl. belgischem Venn, beide Vorschläge | 1 h |
| `welt` (Standard) | ganze Eifel | viele Stunden |

## Im Spiel

- **Kartenwahl:** Größe wählen (klein/mittel/groß), das Auswahl-Hex auf der Übersicht verschieben oder einen
  Ort eintippen, „Hier siedeln!“. Die Vorschläge „Monschauer Land & Rursee“ und „Rureifel“ brauchen mindestens
  das Gebiet `nordeifel`.
- Ein Ausschnitt steht in der Adresse (`#v=<version>&q=..&r=..&g=mittel`) und hat eine **Prüfsumme** über
  die Simulationsdaten (Kopfleiste). Gleiche Adresse = gleiche Prüfsumme, in jedem Browser.
- Steuerung: <kbd>WASD</kbd> bewegen, <kbd>Q</kbd>/<kbd>E</kbd> drehen, Rad zoomen, rechte Maustaste ziehen;
  <kbd>G</kbd> Hex-Raster, <kbd>F3</kbd> Leistungsanzeige. Touch: ein Finger verschieben, zwei zoomen/drehen.
- **Wege und Träger (M3):** Das Lager steht im Ortskern des Startorts. Bauleiste unten: <kbd>1</kbd> Weg
  (Fahne anklicken, dann den Weg selbst führen: freie Hexe sind Zwischenpunkte, die Vorschau sucht jeweils das Teilstück
  und markiert die möglichen nächsten Schritte, so geht es Hex für Hex; eine Fahne oder ein Weg anklicken baut den ganzen Weg,
  den letzten Zwischenpunkt nochmal anklicken oder <kbd>Enter</kbd> baut bis dorthin, <kbd>Rücktaste</kbd> bzw. „Zurück“ nimmt
  den letzten Punkt weg, höchstens 60 Schritte; Wege lassen sich verketten),
  <kbd>2</kbd> Fahne (auf einem Weg teilt sie ihn), <kbd>B</kbd> Baumenü, <kbd>X</kbd> Abriss, <kbd>Esc</kbd>/Rechtsklick
  abbrechen, <kbd>Leertaste</kbd> Pause, <kbd>+</kbd>/<kbd>−</kbd> Tempo 1–3×. Auf jedem Weg pendelt ein Träger und trägt
  sichtbar eine Ware; lange Wege mit Fahnen teilen, sonst staut es. ⚠ heißt: keine Wegverbindung zum Lager.
  Am Handy geht alles per Tippen: Wege bauen sofort beim Tipp auf eine Fahne, Gebäude zeigen erst den Geist, dann „Bauen“.
- **Bauen mit Holz und Stein (M4):** Das Lager startet mit 12 Brettern, 8 Steinen und 8 Kartoffeln. Das Baumenü
  (<kbd>B</kbd>, Ziffern ab <kbd>3</kbd> direkt) zeigt die Gebäude aus `data/buildings.json` mit Kosten und Bauplatzgröße.
  Mit gewähltem Gebäude zeigt die Karte die Bauplätze (klein/mittel/groß, <kbd>P</kbd> auch ohne Werkzeug), ein
  Geistermodell am Ziel und den Arbeitsradius („36 Bäume in Reichweite“). Platzieren kostet nichts: Die Baustelle
  meldet Bedarf, Träger bringen Bretter und Steine einzeln und legen sie an der Baustelle ab, ein Bauarbeiter verbaut sie
  (seit M5), das Haus wächst in drei Phasen.
  Gebäude anklicken öffnet sein Fenster (seit M7) mit Zustand („Wartet auf Bretter“, „Kein Baum mehr in Reichweite“), Bedarf und
  Priorität 1–3 (Rechtsklick auf eine Baustelle schaltet sie reihum). Holzfäller fällt Bäume im Arbeitsbereich (der Kartenwald
  im Spielfeld ist Simulationszustand: was man sieht, gibt es, auch die Einzelbäume auf der Wiese), Förster pflanzt nach, Jungbäume wachsen in drei Stufen, Sägewerk macht aus Stämmen Bretter,
  Steinbruch haut endliche Steine ab, je nach Art unterschiedlich gezeichnet: Felsgruppe (viel), Klippe (mittel),
  Lesesteinhaufen (wenig), alles schrumpft mit der Restmenge. Das Lager liefert auf Abruf (Pull), Abriss gibt die Hälfte
  des verbauten Materials zurück. **Arbeitsbereich:** Bauvorschau und Gebäudefenster zeigen zwei Ringe, innen „gut“
  (kurze Wege), außen „geht noch“, dazu den Hinweis „31 Bäume in Reichweite, 9 davon nah“. Im Gebäudefenster von
  Holzfäller, Förster und Steinbruch (auch als Baustelle) setzt „Arbeitsbereich“ einen Mittelpunkt (höchstens 6 Hexe
  vom Haus): Ringe folgen dem Zeiger, Klick setzt, am Handy zeigt der Tipp und „Setzen“ bzw. zweiter Tipp bestätigt,
  <kbd>Esc</kbd> bricht ab, „Zurücksetzen“ legt ihn wieder aufs Haus. Ein Fähnchen und eine dünne Linie zeigen den
  gesetzten Mittelpunkt. Waren und Gebäude sind Daten: `data/goods.json`, `data/buildings.json`.
- **Bewohner, Nahrung, erste Kirmes (M5):** Man startet mit 10 Bewohnern, 4 Bauarbeitern und 2 Planierern
  (`data/dorf.json`). Träger liefern nur ab; Planierer ebnen Bauplätze am Hang (man sieht die Erde glatt werden), dann
  kommt ein Bauarbeiter mit Hammer und verbaut den Stapel Stück für Stück. Mehr Baustellen als Bauleute heißt warten,
  die Priorität entscheidet. Ein **Wohnhaus** mit Essen bringt neue Bewohner, bis der Wohnraum voll ist (Dorfkern 10,
  Wohnhaus 8); besseres Essen geht schneller (Kartoffeln 14 s, Bratkartoffeln/Most/Käse/Honig 9 s). Ohne Nachwuchs
  in Sicht und mit weniger als 4 freien Bewohnern kommt alle 30 s ein Zugezogener (Notnagel). Die Ketten der Stufe
  Weiler: Kartoffelfeld → Küche → Bratkartoffeln, Obstwiese → Mostkeller → Most, Schafstall → Käserei → Käse,
  Bienenstock → Honig. Am **Kirmesplatz** liefert man 10 Bratkartoffeln, 10 Most und 6 Käse; dann wird gefeiert
  (Karussell, Feuerwerk), der Weiler wird zum Dorf und der Reifekeller ist frei. Statusleiste oben links: Dorfstufe,
  Bewohner/Wohnraum, Bauleute und die Warenliste. Über Gebäuden steht in Klartext, was fehlt („Wartet auf Milch“),
  die Erzählfigur des Völkchens meldet sich mit Sprüchen (Platt mit Übersetzung im Tooltip). Waren haben klare Formen
  und Farben (Käserad, Mostkrug, Pfanne …). Spieltest-Drehbuch: [SPIELTEST.md](SPIELTEST.md).
- **Mit Freunden spielen (M6):** In der Kartenwahl „👥 Mit Freunden spielen“, Namen eingeben, den Einladungslink
  (`…#raum=CODE`) verschicken. Kein Konto, nur ein Name. Die Lobby zeigt, wer da ist und ob alle dieselbe Karte haben
  (Prüfsumme); der Gastgeber verteilt die Startorte (verschiedene Ortskerne, möglichst weit auseinander), wählt Tempo 1–3×
  und startet erst, wenn alle Prüfsummen gleich sind. Jeder baut sein eigenes Dorf; fremde Fahnen wehen in der Farbe des
  Nachbarn, fremde Wege und Gebäude kann man nicht anfassen. Die Partieleiste oben zeigt alle Dörfer. **Pause** darf jeder,
  dreimal je Partie und höchstens 2 Minuten (weiter darf, wer pausiert hat, und der Gastgeber); das Tempo stellt nur der
  Gastgeber. **Rausgeflogen oder neu geladen?** Das Spiel wartet, der Link (gleicher Browser) bringt einen auf denselben Platz
  zurück, den Stand gibt ein Mitspieler. Nach 5 Minuten übernimmt ein **Verwalter** das Dorf (Wirtschaft läuft, nichts Neues)
  und gibt es bei der Rückkehr zurück. Alle 5 Spielsekunden vergleichen alle ihre Prüfsumme; läuft einer auseinander, wird
  das gemeldet und er bekommt den Stand des Taktgebers. Zahlen: `data/mehrspieler.json`.
- **Speichern und Laden (M6):** „💾 Speichern“ lädt eine Datei mit dem ganzen Stand (Datenversion und Prüfsumme der Karte,
  alle Dörfer, Spielernamen, übrige Pausen) herunter. „📂 Spielstand laden“ (Kartenwahl oder im Spiel) lädt die passende
  Karte dazu; ein Stand mehrerer Spieler öffnet die Lobby, die Mitspieler kommen über den Link und spielen ihr Dorf weiter.
- **Bedienung und Oberfläche (M7):** Ein Klick auf ein Gebäude, eine Fahne oder einen Weg öffnet sein **Fenster**. Fenster
  lassen sich am Kopf verschieben, mit 📌 anpinnen (bleiben dann offen) und zeigen ihre Daten live (4× je Sekunde);
  <kbd>Esc</kbd> bricht erst ab, schließt dann das oberste Fenster und öffnet zuletzt die Einstellungen. Das **Gebäudefenster**
  ergibt sich nur aus `data/buildings.json` (Eingang, Ausgang, was es macht, Arbeitsbereich, Produktivität, Essen, Warenliste)
  mit Hinsehen, Anhalten/Weiterarbeiten und Abreißen (zweimal drücken); das **Lager** zeigt den Bestand nach Kategorie, die
  **Fahne** ihren Stapel mit Zielen und die Wege, der **Weg** seinen Träger. Das **Baumenü** hat Reiter je Gruppe, Tooltips
  (Kosten, Bauplatz, „2 Kartoffeln → 1 Bratkartoffel in 12 s“, Spruch), Begründungen fürs Sperren und Knappheit und eine Taste
  je Gebäude bei offenem Menü (z. B. <kbd>F</kbd> Holzfäller). Icons von Waren und Gebäuden sind aus den 3D-Modellen gerendert.
  Statusleiste: 📦 **Waren** (<kbd>I</kbd>), ⚖️ **Warenverteilung** (<kbd>V</kbd>, wie in Siedler 2: je Ware, wer sie zuerst
  bekommt – Baustellen, Kirmesplatz, Verarbeiter, Wohnhäuser; Standard wie in M5), 📈 **Statistik** (<kbd>T</kbd>, Bewohner,
  Gebäude und Waren über die Zeit, alle Dörfer im Vergleich), 📜 **Ereignisprotokoll** (<kbd>L</kbd>, Klick springt zum Ort),
  ⚙️ **Einstellungen** (Grafik, Oberflächengröße 80–150 %, Farbenblind-Modus, Kamera-Tempo, Autosave, Tipps) und ❓ **Hilfe**
  (<kbd>H</kbd>). Störungen stehen zusammengefasst am rechten Rand („2× Gebäude ohne Weg zum Lager“), ein Klick springt hin.
  **Autosave** alle 10 Spielminuten in den Browser (ein Platz), „⏱ Weiterspielen“ in der Kartenwahl. Am Handy kommen Fenster
  als Blatt über der Bauleiste. Warenverteilung, Anhalten und Statistik sind Spielzustand und gehen auch im Mehrspieler.
- **Volle Grundwirtschaft und Jahreszeiten (M8):** Ab Dorf: **Bier** (Gerstenfeld → Brauerei → Landbier), **Schnaps**
  (Wacholderheide → Brennerei), **Schänke** und **Lagerhaus**; ab Kirchdorf **Eisen** (Erzgrube, Köhlerei, Eisenhütte, Schmiede →
  Werkzeug). Erzgrube und Eisenhütte brauchen Werkzeug für ihre Fachkraft, die Kirchdorf-Kirmes schenkt 2 Stück. Im Lagerfenster
  stellt man die **Wunschzahl Bauarbeiter und Planierer** ein (je neuer: 1 Werkzeug + 1 Bewohner) und je Ware die
  **Lagerregel** normal / nicht einlagern / auslagern (Zeile antippen). Kirmes **Dorf → Kirchdorf** (15 Bergkäse, 20 Honig,
  25 Landbier, 10 Schnaps) und **Kirchdorf → Marktflecken** (10 Bergkäse als Platzhalter der Völkchen-Spezialität bis M10,
  10 Werkzeug, Mischkorb aus 20 beliebigen veredelten Waren). **Kleine Feste** am Kirmesplatz, jedes in seiner Jahreszeit und
  einmal im Jahr: Maifest, Viehmarkt, Erntedank, Martinsfeuer, Fastelovend, 15–25 Punkte, höchstens 200 (`data/feste.json`).
  **Jahreszeiten:** ein Spieljahr = 60 Spielminuten, Start im Frühjahr. Felder (Kartoffel, Obst, Bienen, Gerste, Wacholder)
  ruhen im Winter, säen im Frühjahr 2 min und ernten im Herbst schneller; im Winter liegt Schnee, Wege sind langsamer und das
  Dorf isst je 10 Bewohner jede Minute 1 Essen aus dem Lager – fehlt es, frieren die Leute (halbes Tempo, kein Nachwuchs, niemand
  stirbt). **Wetter** aus der gemeinsamen Saat, 2 Minuten vorher als Bauernregel angekündigt: Regen, Talnebel, Venn-Wind,
  Dürre, Missernte, Hochwasser in der Aue (Gebäude stehen still, an Ufer-Fahnen schwimmen Waren weg). **Beschwipste Boten:**
  die Schänke macht aus Schnaps Boten, die weite Lieferungen querfeldein tragen, torkeln, rote Nase und Flasche haben und jede
  zehnte Ware verlieren (liest später einer auf). Zahlen: `data/jahr.json`, `data/feste.json`, `data/dorf.json`.
  Balancing: der Spieltest-Bot (`tests/m8-szenario.ts`) wird in 2 Stunden allein Marktflecken (Dorf ~27, Kirchdorf ~52,
  Marktflecken ~75 Bot-Minuten; Menschen brauchen länger).
- **Simulation** (`src/sim/`): fester Tick (20/s), nur Ganzzahlen, jede Aktion ist ein Befehl mit Tick-Nummer,
  Prüfsumme über den Zustand (Statusleiste „Sim“), Befehlsprotokoll zum Abspielen (`spieleAb`). Der Smoke-Test
  prüft, dass Node und Browser dieselbe Prüfsumme bekommen und ein Replay im zweiten Browser-Fenster gleich ausgeht.
  Mehrere Spieler: jeder hat ein Dorf, Fahnen, Wege, Gebäude und Bauleute gehören einem Spieler; `stand()`/`ausStand()`
  speichern und laden den ganzen Zustand.

## Mehrspieler betreiben

Das Spiel läuft direkt zwischen den Browsern (WebRTC, Gleichschritt: nur Befehle gehen über die Leitung). Dazu braucht es
einen kleinen **Vermittlungs-Server** (Lobby und Verbindungsaufbau, kein Konto, keine Spieldaten) und für Firmen- und
Handynetze ein **Notfall-Relais** (TURN, [coturn](https://github.com/coturn/coturn)).

    npm run vermittlung                      # Port 8787; npm run dev reicht /vermittlung dorthin durch

Zum Ausprobieren auf einem Rechner: `npm run vermittlung` und `npm run dev` starten, zwei Browser-Fenster öffnen, im ersten
„Mit Freunden spielen“, den Link ins zweite. `…#raum=CODE&netz=schlecht` simuliert ein schlechtes Netz (Verzögerung,
Schwankung, Stau; Werte in `data/mehrspieler.json`). Im Internet: coturn nach `server/coturn/turnserver.conf` einrichten und
den Server mit denselben Zugangsdaten starten:

    TURN_URLS=turn:turn.example.de:3478,turns:turn.example.de:5349 TURN_SECRET=<geheim> npm run vermittlung

Der Server vergibt jedem Spieler kurzlebige TURN-Zugangsdaten. Mit `STATISCH=dist WELT_DATEN=welt-daten` liefert er auch
das gebaute Spiel und die Weltdaten aus (ein Prozess für alles); sonst zeigt `VITE_VERMITTLUNG=wss://…/vermittlung` beim
Bauen auf einen anderen Server (oder `…&vm=wss://…` in der Adresse).

## Befehle

| Befehl | Zweck |
|---|---|
| `npm run dev` | Entwicklungsserver, liefert `welt-daten/` unter `/welt/` aus |
| `npm run build` | Typprüfung und Produktions-Build (ohne Weltdaten) |
| `npm test` | Unit-Tests (Vitest) |
| `npm run test:smoke` | Browser-Test: Kartenwahl → Ausschnitt laden → Screenshots, Prüfsumme; dazu zwei Fenster im Mehrspieler über schlechtes Netz (Neuladen in unter 30 s) |
| `node tools/m8-ansicht.mjs [ordner]` | Ansicht M8: stellt alle neuen Gebäude, Boten und verlorene Waren ans Lager und macht Screenshots im Sommer, im Winter und nah am Boten |
| `npm run vermittlung` | Vermittlungs-Server für den Mehrspieler (Port `PORT`, Standard 8787; TURN über `TURN_URLS`/`TURN_SECRET`) |
| `npm run setup -- [Optionen]` | Weltdaten rechnen (siehe oben) |
| `npm run build:share` | eigenständige Teilen-Version mit einem Teil der Weltdaten (z. B. als Artifact-Seite fürs Handy) |
| `npm run build:share -- --gebiet nordeifel` | Teilen-Version zusätzlich mit allen Kacheln eines Gebiets (`nordeifel`, `nideggen`, `alle` oder `tx0-tx1,tz0-tz1`); Kacheln liegen in wenigen Bündel-Dateien. Bei Überschreiten der Artifact-Grenzen (Seite 16 MB, Datei 15 MB, Summe 60 MB, 250 Dateien) Abbruch, außer mit `--trotzdem`. Auch kombinierbar: `-- --gebiet nordeifel --vorschlaege monschau-rursee,rureifel` |

In der Teilen-Version sagt die Kartenwahl, wenn das Hex am Ende der vorhandenen Kacheln klemmt („Hier enden die Kacheln dieser Version – <Ort> liegt deshalb nicht in der Mitte.“), und schraffiert Bereiche ohne Kacheln.

Weltdaten liegen für eine Veröffentlichung als statische Dateien neben dem Spiel (`VITE_WELT_URL`).

## Quellen

Höhendaten: Geobasis NRW (dl-de/zero-2.0), GeoBasis-DE / LVermGeoRP (dl-de/by-2.0), ACT Luxemburg (CC0),
Copernicus GLO-30 DEM. Landbedeckung: ESA WorldCover 2021 (CC BY 4.0). Kartendaten © OpenStreetMap-Mitwirkende (ODbL).
