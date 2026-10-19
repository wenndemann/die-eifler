# Die Eifeler (op Platt)

En Opbauspill em Jees von Siedler 2 op der echten Eifel von hück. Mer spillt en kleen, krummbeenijes,
schlitzohrijes Bergvölkche, dat niemols stiehlt – et **fingk** die Saache.

Three.js + TypeScript + Vite im Browser, Kaate-Pipeline in Python. Wat jebaut weed, steiht em
[Drehbuch](DREHBUCH.md), de Reihfolg in d'r [Roadmap](ROADMAP.md).

## Flotte Start

Wat mer bruche deit: Node.js ≥ 20, Python ≥ 3.10, Internet (de Jeodate weede beim Setup jelade).

    git clone https://github.com/wenndemann/die-eifler.git
    cd die-eifler
    npm ci
    pip install -r tools/map/requirements.txt
    npm run setup -- --gebiet nideggen      # Testjebiet Nideggen–Heimbach, ~10 Minütche
    npm run dev                              # http://localhost:5173

**Flotter:** fäädich jerechnete Weltdate usem GitHub-Release lade, statt se selvs ze rechne:

    tools/welt-laden.sh nideggen            # oder nordeifel

De Releases rechnet dä Workflow „Weltdaten“ (`.github/workflows/weltdaten.yml`) op GitHub: em Tab „Actions“
starte oder ene Branch `weltdaten/<jebiet>` pushe.

`npm run setup` rööf `tools/map/setup.py` op un läät en Dateversion unger `welt-daten/` aaf (nit in Git).
Ohne `--gebiet` weed de **janze Welt** jerechnet (Oche – Trier – Maria Laach, mit Ostbeljie un
Nord-Luxemburch): dat duurt etliche Stündche, lädt rund 25 GB amtlische Höhendate kachelwies un schmießt se
donoh widder fott. Ungebroche? Einfach neu starte, et määt do wigger wo et opjehööt hät. Details un Lizenze:
[tools/map/README.md](tools/map/README.md).

| Jebiet | Umfang | Duur (esugefähr) |
|---|---|---|
| `nideggen` | 18 × 18 km öm Nideggen, Heimbach, Rursee-Nord | 10 min |
| `nordeifel` | Monschau – Düre inkl. beljischem Venn, beid Vorschläch | 1 h |
| `welt` (Standard) | janze Eifel | etliche Stündche |

## Em Spill

- **Kaatewahl:** Jrööße wähle (kleen/mittel/jroß), et Uswahl-Hex op d'r Üvversich verschoove oder ene
  Ocht intippe, „He siedele!“. De Vorschläch „Monschauer Land & Rursee“ un „Rureifel“ bruche mindestens
  et Jebiet `nordeifel`.
- En Usschnitt steiht in d'r Adress (`#v=<version>&q=..&r=..&g=mittel`) un hät en **Prüfsumm** övver
  de Simulationsdate (Koppleist). Jleiche Adress = jleiche Prüfsumm, in jedem Browser.
- Steuerung: <kbd>WASD</kbd> bewääge, <kbd>Q</kbd>/<kbd>E</kbd> drihe, Rädche zoome, räächte Musdaste trecke;
  <kbd>G</kbd> Hex-Rastel, <kbd>F3</kbd> Leistungsanzäich. Touch: ee Finger verschoove, zwei zoome/drihe.
- **Weech un Dräjer (M3):** Et Lager steiht em Ochtskään vum Startocht. Bauleiss unge: <kbd>1</kbd> Wääch
  (Fahn aanklicke, dann dä Wääch selvs führe: frei Hexe sin Zwescheponkte, de Vörschau sök jedes Stöck un zeich
  de nächste müjjelije Schrette, su jeiht et Hex för Hex; en Fahn oder ene Wääch aanklicke baut dä janze Wääch,
  dä letzte Zwescheponk nochens aanklicke oder <kbd>Enter</kbd> baut bes dohin, <kbd>Röcktaste</kbd> bzw. „Zeröck“
  nimmp dä letzte Ponk fott, hüchstens 60 Schrette; Weech looße sich aneinanderhange),
  <kbd>2</kbd> Fahn (op enem Wääch deilt se en), <kbd>B</kbd> Baumenü, <kbd>X</kbd> Avress, <kbd>Esc</kbd>/Räächsklick
  avbreche, <kbd>Leertaste</kbd> Paus, <kbd>+</kbd>/<kbd>−</kbd> Tempo 1–3×. Op jedem Wääch pendelt ene Dräjer un
  dräht sichbar en Wor; lang Weech met Fahne deile, söns stäut et. ⚠ heiß: kei Wäächverbindung nohm Lager.
  Am Handy jeiht alles met Tippe: Weech baue söfort beim Tipp op en Fahn, Jebäude zeije eets dä Jeis, dann „Baue“.
- **Baue met Holz un Steen (M4):** Et Lager fängk aan met 12 Brädder, 8 Steen un 8 Ääpel. Et Baumenü
  (<kbd>B</kbd>, Zeffere av <kbd>3</kbd> tirek) zeich de Jebäude us `data/buildings.json` met Koste un Bauplatzjrööß.
  Met jewähltem Jebäude zeich de Kaat de Bauplätz (kleen/mittel/jroß, <kbd>P</kbd> och söns), e Jeistermodell am Ziel
  un dä Arbeitsradius („36 Bäum en Reichwigg“). Platziere koss nix: De Baustell meld Bedarf, Dräjer bränge Brädder un
  Steen einzel un läje se an d'r Baustell av, ene Bauarbeiter verbaut se (sick M5), et Huus wääß en drei Phase. Jebäude aanklicke maht en Kaat op met Zostand
  („Waat op Brädder“, „Kei Baum mieh en Reichwigg“), Bedarf un Priorität 1–3 (Räächsklick op en Baustell schalt se
  reihöm). Dä Holzfäller fällt Bäum em Arbeitsbereich (wat mer em Spillfeld süht, dat jitt et och), dä Förster planz
  noh, Jungbäum wahße en drei Stufe, et Sägewerk määt us Stämm Brädder, dä Steenbroch hau endlije Steen av:
  Felsjrupp (vill), Klipp (mittel), Lesesteenhaufe (winnich). Et Lager liefert op Avrof, Avress jitt de Hälfde vum
  verbaute Material zeröck. **Arbeitsbereich:** zwei Ringe, enne „jot“ (koote Weech), usse „jeiht noch“. En d'r
  Jebäudekaat vun Holzfäller, Förster un Steenbroch setz „Arbeitsbereich“ ene Meddeponk (hüchstens 6 Hexe vum Huus),
  „Zeröcksetze“ läät en widder op et Huus.
- **Lück, Ääße, eetste Kirmes (M5):** Mer fängk aan met 10 Lück, 4 Bauarbeiter un 2 Planierer (`data/dorf.json`).
  Dräjer liefere nur; Planierer maache de Bauplätz am Hang jlatt (mer süht de Äd jlatt weede), dann kütt ene
  Bauarbeiter met Hammer un verbaut dä Stapel Stöck för Stöck. Mieh Baustelle wie Baulück heiß waade, de Priorität
  entscheid. E **Wonnhuus** met Ääße brängk neu Lück, bes dä Wonnrohm voll es (Dorfkään 10, Wonnhuus 8); bessere
  Ääße jeiht flotter (Ääpel 14 s, Bratääpel/Moss/Kies/Honnich 9 s). Kütt kein Nohwuchs un sin winnijer wie 4 Lück
  frei, kütt alle 30 s ene Zojetrockene (Notnagel). De Ketten vum Weiler: Ääpelfeld → Köch → Bratääpel,
  Obswies → Mosskeller → Moss, Schafstall → Kieserei → Kies, Immestock → Honnich. Om **Kirmesplatz** liefert mer
  10 Bratääpel, 10 Moss un 6 Kies; dann weed jefiert (Karussell, Füerwerk), us d'm Weiler weed e Dorf un d'r
  Riefekeller es frei. Bovve links stonn Dorfstuf, Lück/Wonnrohm, Baulück un de Warelist. Üvver de Jebäude steiht
  em Klartext, wat fählt („Waat op Milch“), un de Verzällfijur vum Völkche meld sich met Sprüch (Platt, de
  Övversetzung em Tooltip). De Ware han klor Forme un Färve (Kiesrad, Mosskrog, Pann …). Spilltest-Drehbuch:
  [SPIELTEST.md](SPIELTEST.md).
- **Simulation** (`src/sim/`): faste Tick (20/s), nur janze Zahle, jede Aktion es ene Befehl met Tick-Nummer,
  Prüfsumm övver dä Zostand, Befehlsprotokoll zom Avspille. Dä Smoke-Test pröf, dat Node un Browser de selve
  Prüfsumm krije.

## Befehle

| Befehl | För wat |
|---|---|
| `npm run dev` | Entwicklungsserver, liefert `welt-daten/` unger `/welt/` us |
| `npm run build` | Typprüfung un Produktions-Build (ohne Weltdate) |
| `npm test` | Unit-Tests (Vitest) |
| `npm run test:smoke` | Browser-Test: Kaatewahl → Usschnitt lade → Screenshots, Prüfsumm |
| `npm run setup -- [Optione]` | Weltdate rechne (luur bovve) |
| `npm run build:share` | eijeständije Deile-Version mit enem Deil der Weltdate (z. B. als Artifact-Sigg fürs Handy) |
| `npm run build:share -- --gebiet nordeifel` | Deile-Version och met alle Kachele vun enem Jebiet (`nordeifel`, `nideggen`, `alle`); wenn et ze jroß weed, hööt et op, ussem met `--trotzdem` |

Weltdate lieje för en Veröffentlichung als statische Dateie nevven d'm Spill (`VITE_WELT_URL`).

## Quelle

Höhendate: Jeobasis NRW (dl-de/zero-2.0), JeoBasis-DE / LVermJeoRP (dl-de/by-2.0), ACT Luxemburch (CC0),
Copernicus GLO-30 DEM. Landbedeckung: ESA WorldCover 2021 (CC BY 4.0). Kaatedate © OpenStreetMap-Metmacher (ODbL).
