# Die Eifeler (op Platt)

En Opbauspill em Jees von Siedler 2 op der echten Eifel von hück. Mer spillt en kleen, krummbeenijes,
schlitzohrijes Bergvölkche, dat niemols stiehlt – et **fingk** die Saache.

Läuf em Browser (Three.js, TypeScript, Vite), de Kaate rechnet en Python-Pipeline us amtlische Jeodate.
Wat noch kütt, steiht em [Drehbuch](DREHBUCH.md), wat ald dren es, en d'r [Roadmap](ROADMAP.md).

## Wat et jitt

- **De echte Eifel als Kaat:** Usschnitt selvs wähle (oder ene Ort enjevve), Jelände, Flöss, Bösch un Dörfer vun hück.
- **Wäje, Dräjer, Wore:** Wäje selvs baue (övver de Baach nur met Holzbröck us d'r Zimmerei), mieh als 40 Wore vum Boumstamm bes zom Schnaps.
- **Et Dorf wähße looße:** Lück, Hüüser, Kirmes als Döör noh d'r nächste Dorfstuf, Johreszigge, Wedder un Winter.
- **Höff un Felder wie bei Siedler 2:** Dä Buur sieht rund öm singe Hoff Ääpel, Jääsch, Obs, Wacholder, Wing, Hoppe oder Loh un brengk eren, wat riev es; Felder bruche frei Land, ene Wääch trampelt se kapott.
- **Bösch un Wild:** Rehe un Wildsäu levve em Bösch un kumme noh, dä Jäjer om Hochsitz brengk Wild för Wildgulasch un hält de Säu vun de Felder fään; Wolf un Wildkatz sin jeschötz – jäje dä Wolf hilf dä Hirtehund, de Wildkatz brengk Ansinn.
- **Nohbere ohne Kreech:** Jebiet, Dörfer met Ensteiht jewenne, Handel met de Flachländer, Finge statt Klaue,
  Schötzefess, Maibaumklau, Jrenzsteen versetze, Lück avwerbe, Kaffeeschmuggel am Zollhuus un dä Jruße Fund.
- **De Eifel läv:** Rauch us de Schornsteen, Wasserräder, Schof un Hohner, Pänz om Kirmesplatz, Wind en Bäum un Jras,
  bunt Laub em Hervs, naaks Leech en de Finster; Zunftscheld un Meister en Tracht zeije, wat e Huus mäht; Rehe, Wildsäu, Füss, selde Wolf un Wildkatz am Bösch.
- **10 Völkcher** met eijene Verzällfijur, Spezialität un Sprüch; Musik un Jeräusche usem Browser.
- **Allein, met Fründe (ene Link reck, ohne Konto) oder als Kampagne** „Dä Eifelsteig“ vun Oche bes Trier.

## Flotte Start

Wat mer bruche deit: Node.js ≥ 20 (för eijene Weltdate och Python ≥ 3.10).

    git clone https://github.com/wenndemann/die-eifler.git
    cd die-eifler
    npm ci
    tools/welt-laden.sh eifel               # fäädije Weltdate vun d'r janze Eifel usem GitHub-Release
                                            # Windows: powershell -ExecutionPolicy Bypass -File tools\welt-laden.ps1 eifel
    npm run dev                             # http://localhost:5173

Kleener Jebiete: `tools/welt-laden.sh nideggen` (oder `nordeifel`, `eifelsteig`). Selvs rechne:
`npm run setup -- --gebiet nideggen` (~10 Minütche, luur [tools/map/README.md](tools/map/README.md)).

## Met Docker

Alles en eenem Kiss – Spill, Weltdate un Vermittlung, eene Port:

    docker build -t die-eifeler .
    docker run -p 8787:8787 die-eifeler                                # http://localhost:8787
    docker compose up -d --build                                       # oder met Compose (Relais: --profile relais)

Eijene Weltdate enhänge: `-v "$PWD/welt-daten:/app/welt-daten:ro"`. Mieh dovun steiht em [README](README.md#mit-docker).

## Befehle

| Befehl | För wat |
|---|---|
| `npm run dev` | Entwicklungsserver |
| `npm run build` | Typprüfung un Produktions-Build |
| `npm test` | Unit-Tests (Vitest) |
| `npm run test:smoke` | Browser-Test met echter Kaat, och zwei Finster em Mehrspiller |
| `npm run vermittlung` | Vermittlungs-Server för d'r Mehrspiller (Relais luur `server/coturn/`) |
| `npm run setup -- [Optione]` | Weltdate selvs rechne |

## Quelle

Höhendate: Jeobasis NRW (dl-de/zero-2.0), JeoBasis-DE / LVermJeoRP (dl-de/by-2.0), ACT Luxemburch (CC0),
Copernicus GLO-30 DEM. Landbedeckung: ESA WorldCover 2021 (CC BY 4.0). Kaatedate © OpenStreetMap-Metmacher (ODbL).
