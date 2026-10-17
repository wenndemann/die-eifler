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

## Befehle

| Befehl | För wat |
|---|---|
| `npm run dev` | Entwicklungsserver, liefert `welt-daten/` unger `/welt/` us |
| `npm run build` | Typprüfung un Produktions-Build (ohne Weltdate) |
| `npm test` | Unit-Tests (Vitest) |
| `npm run test:smoke` | Browser-Test: Kaatewahl → Usschnitt lade → Screenshots, Prüfsumm |
| `npm run setup -- [Optione]` | Weltdate rechne (luur bovve) |
| `npm run build:share` | eijeständije Deile-Version mit enem Deil der Weltdate (z. B. als Artifact-Sigg fürs Handy) |

Weltdate lieje för en Veröffentlichung als statische Dateie nevven d'm Spill (`VITE_WELT_URL`).

## Quelle

Höhendate: Jeobasis NRW (dl-de/zero-2.0), JeoBasis-DE / LVermJeoRP (dl-de/by-2.0), ACT Luxemburch (CC0),
Copernicus GLO-30 DEM. Landbedeckung: ESA WorldCover 2021 (CC BY 4.0). Kaatedate © OpenStreetMap-Metmacher (ODbL).
