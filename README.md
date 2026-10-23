# Die Eifeler

Für de Lück von he: [Lies mich op Platt](README-platt.md)

Ein Aufbauspiel im Geist von Siedler 2 auf der echten Eifel von heute. Man spielt ein kleines, krummbeiniges,
schlitzohriges Bergvolk, das niemals stiehlt – es **findet** Dinge.

Läuft im Browser (Three.js, TypeScript, Vite), die Karten rechnet eine Python-Pipeline aus amtlichen Geodaten.
Was ins Spiel kommt, steht im [Drehbuch](DREHBUCH.md), was schon drin ist und was als Nächstes kommt, in der [Roadmap](ROADMAP.md).

## Was es gibt

- **Die echte Eifel als Karte:** Ausschnitt frei wählen (oder einen Ort eintippen), Gelände, Flüsse, Wald und Orte von heute.
- **Wege, Träger, Waren:** Wegenetz selbst bauen (über Bäche nur mit Holzbrücke aus der Zimmerei), über 40 Waren in Ketten vom Baumstamm bis zum Schnaps.
- **Dorf wachsen lassen:** Bewohner, Wohnhäuser, Kirmes als Tor zur nächsten Dorfstufe, Jahreszeiten, Wetter und Winter.
- **Nachbarn ohne Krieg:** Gebiet, Orte mit Einstand gewinnen, Handel mit den Flachländern, Finden statt Stehlen,
  Schützenfest, Maibaumklau, Grenzsteine versetzen, Abwerben, Kaffeeschmuggel am Zollhaus und der Große Fund.
- **Die Eifel lebt:** Rauch aus den Schornsteinen, Wasserräder, Schafe und Hühner, Kinder auf dem Kirmesplatz, Wind in Bäumen
  und Gras, Herbstlaub, nachts Licht in den Fenstern; Zunftschilder und Meister in Tracht zeigen, was ein Haus macht; Rehe, Wildschweine, Füchse, selten Wolf und Wildkatze am Waldrand.
- **10 Völkchen** mit eigener Erzählfigur, Spezialität und Sprüchen; Musik und Geräusche aus dem Browser.
- **Allein, zu mehreren (Link reicht, ohne Konto) oder als Kampagne** „Der Eifelsteig“ von Aachen bis Trier.

Bedienung: <kbd>WASD</kbd>, <kbd>Q</kbd>/<kbd>E</kbd>, Mausrad; <kbd>H</kbd> zeigt die Hilfe im Spiel. Touch geht auch.

## Schnellstart

Voraussetzungen: Node.js ≥ 20 (für eigene Weltdaten zusätzlich Python ≥ 3.10).

    git clone https://github.com/wenndemann/die-eifler.git
    cd die-eifler
    npm ci
    tools/welt-laden.sh eifel               # fertige Weltdaten der ganzen Eifel aus dem GitHub-Release
    npm run dev                             # http://localhost:5173

Kleinere Gebiete: `tools/welt-laden.sh nideggen` (oder `nordeifel`, `eifelsteig`, ein Völkchen-Gebiet). Selbst rechnen:
`pip install -r tools/map/requirements.txt` und `npm run setup -- --gebiet nideggen` (~10 min; Details und Lizenzen in
[tools/map/README.md](tools/map/README.md)). In Cloud-Sessions von Claude Code lädt der Session-Start-Hook die Daten selbst.

## Mehrspieler betreiben

Gespielt wird direkt zwischen den Browsern (WebRTC, nur Befehle gehen über die Leitung). Dazu braucht es den kleinen
Vermittlungs-Server und für schwierige Netze ein TURN-Relais ([coturn](https://github.com/coturn/coturn), Vorlage in `server/coturn/`):

    npm run vermittlung                                                   # lokal, Port 8787
    TURN_URLS=turn:turn.example.de:3478 TURN_SECRET=<geheim> npm run vermittlung

Mit `STATISCH=dist WELT_DATEN=welt-daten` liefert derselbe Prozess auch das gebaute Spiel und die Weltdaten aus.

## Befehle

| Befehl | Zweck |
|---|---|
| `npm run dev` | Entwicklungsserver |
| `npm run build` | Typprüfung und Produktions-Build |
| `npm test` | Unit-Tests (Vitest), u. a. Determinismus und Mehrspieler im Gleichschritt |
| `npm run test:smoke` | Browser-Test mit echter Karte, dazu zwei Fenster im Mehrspieler über schlechtes Netz |
| `npm run vermittlung` | Vermittlungs-Server für den Mehrspieler |
| `npm run setup -- [Optionen]` | Weltdaten selbst rechnen |
| `npm run build:share` | eigenständige Teilen-Version mit einem Teil der Weltdaten |

## Quellen

Höhendaten: Geobasis NRW (dl-de/zero-2.0), GeoBasis-DE / LVermGeoRP (dl-de/by-2.0), ACT Luxemburg (CC0),
Copernicus GLO-30 DEM. Landbedeckung: ESA WorldCover 2021 (CC BY 4.0). Kartendaten © OpenStreetMap-Mitwirkende (ODbL).
