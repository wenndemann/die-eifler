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
  Steen einzel un läje se an d'r Baustell av, ene Bauarbeiter verbaut se (sick M5), et Huus wääß en drei Phase. Jebäude aanklicke maht si Finster op (sick M7) met Zostand
  („Waat op Brädder“, „Kei Baum mieh en Reichwigg“), Bedarf un Priorität 1–3 (Räächsklick op en Baustell schalt se
  reihöm). Dä Holzfäller fällt Bäum em Arbeitsbereich (wat mer em Spillfeld süht, dat jitt et och), dä Förster planz
  noh, Jungbäum wahße en drei Stufe, et Sägewerk määt us Stämm Brädder, dä Steenbroch hau endlije Steen av:
  Felsjrupp (vill), Klipp (mittel), Lesesteenhaufe (winnich). Et Lager liefert op Avrof, Avress jitt de Hälfde vum
  verbaute Material zeröck. **Arbeitsbereich:** zwei Ringe, enne „jot“ (koote Weech), usse „jeiht noch“. Em
  Jebäudefinster vun Holzfäller, Förster un Steenbroch setz „Arbeitsbereich“ ene Meddeponk (hüchstens 6 Hexe vum Huus),
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
- **Met de Fründe spille (M6):** En d'r Kaatewahl „👥 Mit Freunden spielen“, Name enjevve, dä Enladungslink
  (`…#raum=CODE`) verschecke. Kei Konto, nur ene Name. En d'r Lobby süht mer, wä do es un ov all de selve Kaat han
  (Prüfsumm); d'r Jastjevver verdeilt de Startöchter (ongerschiedlije Ochtskääne, su wigg usenander wie et jeiht), stellt
  et Tempo 1–3× en un fängk eets aan, wenn all Prüfsumme jlich sin. Jeder baut si eije Dorf; fremde Fahne weihe en d'r Färv
  vum Nohber, fremde Weech un Jebäude darf mer nit aanpacke. **Paus** darf jeder, dreimol pro Partie un hüchstens 2 Minütche.
  **Erusjefloore oder neu jelade?** Dat Spill waat, d'r Link brängk ene op dä selve Platz zeröck, d'r Stand kütt vum
  Metspiller. Noh 5 Minütche övvernimmp ene **Verwalter** dat Dorf (de Wirtschaft läuf, nix Neues) un jitt et zeröck, wenn
  mer widderkütt. Alle 5 Spillsekunde verjliche all ehr Prüfsumm; läuf eine usenander, weed dat jemeldt un hä kritt dä
  Stand vum Taktjevver. Zahle: `data/mehrspieler.json`.
- **Spiechere un Lade (M6):** „💾 Speichern“ läät en Datei met d'm janze Stand erunger (Kaat, all Dörfer, Name, Pause).
  „📂 Spielstand laden“ läät de passende Kaat dobei; ene Stand met mieh Spiller määt de Lobby op.
- **Bedeenung un Ovverfläch (M7):** Ene Klick op e Jebäude, en Fahn oder ene Wääch maht si **Finster** op. Finster
  kann mer am Kopp verschiebe, met 📌 aanpenne (dann blieve se op), un se zeije alles live (4× en d'r Sekund);
  <kbd>Esc</kbd> bricht eets av, maht dann et bovverschte Finster zo un zoletz de Enstellunge op. Et **Jebäudefinster** kütt
  janz us `data/buildings.json` (Engang, Usjang, wat et määt, Arbeitsbereich, Produktivität, Ääße, Warelist), met Hinluure,
  Aanhalde/Wiggerarbeide un Avresse (zweimol drücke); et **Lager** zeich d'r Bestand noh Sorte, de **Fahn** ehre Stapel met
  Ziele, d'r **Wääch** singe Dräjer. Et **Baumenü** hät Reiter, Tooltips (Koste, Bauplatz, „2 Ääpel → 1 Bratäppel en 12 s“,
  Sproch), Jründ för Jesperrtes un e Taas för jedes Jebäude (z. B. <kbd>F</kbd> Holzfäller). De Bildcher vun Ware un
  Jebäude sin us de 3D-Modelle jemolt. Bovve links: 📦 **Ware** (<kbd>I</kbd>), ⚖️ **Wareverdeilung** (<kbd>V</kbd>, wie en
  Siedler 2: för jede Waar, wä se eets kritt – Baustelle, Kirmesplatz, Verarbeider, Wonnhüüser), 📈 **Statistik**
  (<kbd>T</kbd>, all Dörfer zom Verjliche), 📜 **Protokoll** (<kbd>L</kbd>, Klick sprengk hin), ⚙️ **Enstellunge** (Jrafik,
  Jrööß vun d'r Ovverfläch, Färveblind-Modus, Kamera-Tempo, Autosave, Tipps) un ❓ **Hölp** (<kbd>H</kbd>). Wat hängk, steiht
  rääts am Rand („2× Jebäude ohne Wääch zom Lager“), ene Klick sprengk hin. **Autosave** alle 10 Spillminütte em Browser,
  „⏱ Weiterspielen“ en d'r Kaatewahl. Am Handy kumme de Finster unge övver de Bauleiss. Jeiht och em Mehrspiller.
- **Janze Wirtschaff un Johreszigge (M8):** Ab Dorf **Bier** (Jerstefeld → Brauerei → Landbier), **Schnaps** (Wacholderheid →
  Brennerei), **Schänk** un **Lagerhuus**; ab Kirchdorf **Iise** (Ääzjrov, Köhlerei, Iisehött, Schmied → Werkzeuch). Em
  Lagerfinster stellt mer de Wunschzahl vun Bauarbeider un Planierer en un för jede Waar „normal / nit enlagere / uslagere“.
  Kirmes bes zom **Marktflecke**, **kleine Feste** (Maifest, Viehmaat, Ääntedank, Mätesfüür, Fastelovend) eimol em Johr för
  Punkte. **Johreszigge:** e Johr dorrt 60 Spillminütte; em Winter litt Schnie, de Felder ruhe, un et Dorf ääß vum Vürrot – wä
  nix hät, früss (lahm, ävver keiner stirv). **Wedder** kütt för all jlich, aanjekündich als Buureräjel. **Beschwipste Bote**
  vun d'r Schänk loofe querfeldein, torkele un verliere ens jet. Zahle: `data/jahr.json`, `data/feste.json`, `data/dorf.json`.
- **Stil „Wimmelbooch met Strich“ (M9):** Bilderbooch-Pass met feinem brune Strich, sacke, warme Färve; runde Forme, ä bessje
  scheive Fachwerkhüüser met Rauch un Kleinkrom (Hohnder, Wäsch, Beet, Immekörv), Blome un Pilze op d'r Wies, Schnie op de
  Däächer. Figure met jroße Kopp un Jesich, Kapp en Trachtfärv. Leitfaden: `STIL.md`, Pröfung: `tools/bildstrecke.mjs`.
- **Jebiet, Noobere, Finge, Ziele (M10):** Lager, Hüüser, Kirmesplatz, Schötzehuus un Dörpspolizist striehle **Enfluss** us;
  jebout weed nur om eije Jebiet, de Jrenz süht mer als Band met Jrenzsteen. **Ööt met Enstand:** Wääch bes an d'r Ortskään,
  Wunschzeddel liefere – dann jitt et e Lager met Fungkess, Jebiet, Lück un Punkte. **Flachländer** om Kaaterand (Maatposte met
  Wääschwieser), **Fingerhött**, Wachhungk, Dörpspolizist un Usredestuff, **Schötzefess** met Vurrelschoss. **Eifel-Punkte** bes
  zom Ziel (600/1000/1500), Wettlouf zom Maatflecke oder ohne Engk. Zahle: `data/nachbarn.json`.
- **De 10 Völkcher (M11):** Wo mer aanfängk, dat Völkche hät mer: Monschauer, Rursee-Lück, Rureifeler, Vulkaneifeler,
  Ahrtaler, Laacher, Südeifeler, Schneifeler, Ostbelgier un Öslinger – jedes met Bonus, Schwäch un eijener Spezialität för de
  Maatflecke-Kirmes (Tuch, Forell, Papier, Sprudel, Rotwein, Möhlesteen, Edelbier, Harz, Botter, Ham). Allein kann mer
  sich dat Völkche en de Enstellunge ussöke, em Mehrspiller kütt et luuter vum Startort. Rejele:
  `data/voelkchen.json`.
- **Feinschliff (M12):** Startmenü met de Lück, die metjemaat han; de Verzällfijur zeich, wie mer aanfängk. Mer süht dat Wedder:
  Räen, Schnie, Nevvel em Dal, Wolkeschadde, Huhwasser un Daach un Naach. De Männcher laache, schänge, winke un jubele op d'r Kirmes.
  Musik un Jeräusche maach dä Browser selvs: Quetsch, Blosmusik, Fiddel, Tusch, Jebrabbel, Sääch, Amboss, Schof, Vüjel – un naaks
  spök dä Jrenzsteenversetzer. „Mer renne nit.“ un dä Eifelfonds för ärm Dörfer sin och dobei.
- **Kampagne „Dä Eifelsteig“ (M13):** Met dem eijene Völkche vun Kornelimünster bes Trier, 15 Etappe, un dä Rur-Wäch dobei.
  Jede Etapp hät e Ziel, de Verzällfijur verzällt, un em Rucksack kumme bes 15 Wore met. Daate: `data/kampagne.json`.
- **Simulation** (`src/sim/`): faste Tick (20/s), nur janze Zahle, jede Aktion es ene Befehl met Tick-Nummer,
  Prüfsumm övver dä Zostand, Befehlsprotokoll zom Avspille. Dä Smoke-Test pröf, dat Node un Browser de selve
  Prüfsumm krije.

## Befehle

| Befehl | För wat |
|---|---|
| `npm run dev` | Entwicklungsserver, liefert `welt-daten/` unger `/welt/` us |
| `npm run build` | Typprüfung un Produktions-Build (ohne Weltdate) |
| `npm test` | Unit-Tests (Vitest) |
| `npm run test:smoke` | Browser-Test: Kaatewahl → Usschnitt lade → Screenshots, Prüfsumm; och zwei Finster em Mehrspiller övver schlääch Netz |
| `npm run vermittlung` | Vermittlungs-Server för d'r Mehrspiller (Port 8787; Relais övver `TURN_URLS`/`TURN_SECRET`, luur `server/coturn/`) |
| `npm run setup -- [Optione]` | Weltdate rechne (luur bovve) |
| `npm run build:share` | eijeständije Deile-Version mit enem Deil der Weltdate (z. B. als Artifact-Sigg fürs Handy) |
| `npm run build:share -- --gebiet nordeifel` | Deile-Version och met alle Kachele vun enem Jebiet (`nordeifel`, `nideggen`, `alle`); wenn et ze jroß weed, hööt et op, ussem met `--trotzdem` |

Weltdate lieje för en Veröffentlichung als statische Dateie nevven d'm Spill (`VITE_WELT_URL`).

## Quelle

Höhendate: Jeobasis NRW (dl-de/zero-2.0), JeoBasis-DE / LVermJeoRP (dl-de/by-2.0), ACT Luxemburch (CC0),
Copernicus GLO-30 DEM. Landbedeckung: ESA WorldCover 2021 (CC BY 4.0). Kaatedate © OpenStreetMap-Metmacher (ODbL).
