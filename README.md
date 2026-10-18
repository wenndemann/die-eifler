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
  <kbd>2</kbd> Fahne (auf einem Weg teilt sie ihn), <kbd>3</kbd>–<kbd>6</kbd> Holzfäller, Steinbruch, Sägewerk,
  Wohnhaus, <kbd>X</kbd> Abriss, <kbd>Esc</kbd>/Rechtsklick abbrechen, <kbd>Leertaste</kbd> Pause,
  <kbd>+</kbd>/<kbd>−</kbd> Tempo 1–3×. Auf jedem Weg pendelt ein Träger und trägt sichtbar eine Ware;
  ⚠ heißt: keine Wegverbindung zum Lager. Am Handy geht alles per Tippen (Tippen, dann „Bauen“).
  Bauen kostet in M3 noch nichts, Holzfäller und Steinbruch sind Platzhalter (echte Bäume und Felsen kommen in M4).
- **Simulation** (`src/sim/`): fester Tick (20/s), nur Ganzzahlen, jede Aktion ist ein Befehl mit Tick-Nummer,
  Prüfsumme über den Zustand (Statusleiste „Sim“), Befehlsprotokoll zum Abspielen (`spieleAb`). Der Smoke-Test
  prüft, dass Node und Browser dieselbe Prüfsumme bekommen und ein Replay im zweiten Browser-Fenster gleich ausgeht.

## Befehle

| Befehl | Zweck |
|---|---|
| `npm run dev` | Entwicklungsserver, liefert `welt-daten/` unter `/welt/` aus |
| `npm run build` | Typprüfung und Produktions-Build (ohne Weltdaten) |
| `npm test` | Unit-Tests (Vitest) |
| `npm run test:smoke` | Browser-Test: Kartenwahl → Ausschnitt laden → Screenshots, Prüfsumme |
| `npm run setup -- [Optionen]` | Weltdaten rechnen (siehe oben) |
| `npm run build:share` | eigenständige Teilen-Version mit einem Teil der Weltdaten (z. B. als Artifact-Seite fürs Handy) |
| `npm run build:share -- --gebiet nordeifel` | Teilen-Version zusätzlich mit allen Kacheln eines Gebiets (`nordeifel`, `nideggen`, `alle` oder `tx0-tx1,tz0-tz1`); Kacheln liegen in wenigen Bündel-Dateien. Bei Überschreiten der Artifact-Grenzen (Seite 16 MB, Datei 15 MB, Summe 60 MB, 250 Dateien) Abbruch, außer mit `--trotzdem`. Auch kombinierbar: `-- --gebiet nordeifel --vorschlaege monschau-rursee,rureifel` |

In der Teilen-Version sagt die Kartenwahl, wenn das Hex am Ende der vorhandenen Kacheln klemmt („Hier enden die Kacheln dieser Version – <Ort> liegt deshalb nicht in der Mitte.“), und schraffiert Bereiche ohne Kacheln.

Weltdaten liegen für eine Veröffentlichung als statische Dateien neben dem Spiel (`VITE_WELT_URL`).

## Quellen

Höhendaten: Geobasis NRW (dl-de/zero-2.0), GeoBasis-DE / LVermGeoRP (dl-de/by-2.0), ACT Luxemburg (CC0),
Copernicus GLO-30 DEM. Landbedeckung: ESA WorldCover 2021 (CC BY 4.0). Kartendaten © OpenStreetMap-Mitwirkende (ODbL).
