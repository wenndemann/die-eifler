# Spieltest „Die ersten 30 Minuten“ (M5)

Spieltest-Drehbuch zu [Drehbuch 4.4](DREHBUCH.md) und zur Abnahme von [ROADMAP M5](ROADMAP.md):
**Ein Testspieler erreicht in 30–45 Minuten die erste Kirmes, ohne die Regeln erklärt zu bekommen, und will danach weiterspielen.**

Es gibt zwei Teile: den Test mit einem Menschen (unten) und den Spieltest-Bot, der dieselbe Partie in Zahlen nachspielt
(`tests/m5-szenario.ts`, Abnahmetest in `tests/m5.test.ts`). Der Bot zeigt, dass die Zahlen tragen; ob es Spaß macht,
zeigt nur der Mensch.

## Vorbereitung

- Weltdaten mit mindestens `--gebiet nideggen` (README), `npm run dev`, Browser am PC (Maus und Tastatur).
- Start in einem Ortskern mit Wald und Felsen in der Nähe, z. B. Heimbach oder Nideggen. Tempo 1×.
- Der Testspieler hat Siedler 2 oder ein ähnliches Spiel gespielt **oder** nicht – beides ist interessant, bitte notieren.
- **Nichts erklären.** Nur zuschauen und mitschreiben. Fragen beantwortet man mit „Was meinst du?“.
- Uhr mitlaufen lassen (Spielzeit steht oben links), am besten Bildschirm aufnehmen.

## Ablauf und Beobachtungspunkte

| Schritt (Drehbuch 4.4) | Zielzeit | Darauf achten | Notiz |
|---|---|---|---|
| 1. Lager steht, Kamera zeigt das Tal, die Erzählfigur begrüßt | 0:00 | Wird die Begrüßung gelesen? Versteht er, was die Kirmes-Zeile oben links will? | |
| 2. Holzfäller und Förster an den Waldrand, Weg dahin, erste Stämme | bis ~3:00 | Findet er das Baumenü (B)? Den Weg (1)? Kommt der Tipp nach einer Minute? | |
| 3. Sägewerk und Steinbruch, Bretter und Steine fließen, Baustellen wachsen in drei Phasen | bis ~8:00 | Sieht er Bauarbeiter (Hammer) und Planierer (Schaufel)? Versteht er „Wartet auf einen Planierer“? | |
| 4. Kartoffelfeld und Wohnhaus, erste neue Bewohner, ein Stau an einer Fahne, zweiter Weg | bis ~15:00 | Merkt er, dass Essen Bewohner bringt (Meldung „Der erste Neue ist da!“)? Löst er einen Stau selbst? | |
| 5. Kirmesplatz steht, die Warenliste füllt sich, Ziel ist klar | bis ~25:00 | Baut er Küche, Mostkeller, Käserei von selbst? Liest er die Warenliste? | |
| Kirmes: Fest, Karussell, Feuerwerk, Dorf | **30–45 min** | Reaktion aufs Fest. Will er weiterspielen? Was will er als Nächstes bauen? | |

Nach jedem Schritt kurz festhalten: **Wo hat er gezögert (länger als 30 s)? Was hat er falsch verstanden? Was hat ihn gefreut?**

## Fragen danach

1. Was war dein Ziel? Wann war dir das klar?
2. Was hat am längsten gedauert, und warum?
3. Welche Meldung oder welcher Spruch ist dir im Kopf geblieben?
4. Was hat genervt?
5. Willst du weiterspielen? Was würdest du als Nächstes tun?

## Auswertung und Zahlen

Alle Zahlen stehen in `data/*.json` und werden nach dem Spieltest dort eingestellt. Typische Stellschrauben:

| Zu langsam / zu schnell bei … | Stellschraube |
|---|---|
| Holz und Bretter | `buildings.json`: Holzfäller `zeiten`, Sägewerk `wandelt.dauer_s`; Bäume je Hex und Wachstumszeit in `src/sim/daten.ts` (BAUM_*) |
| Stein | Steinbruch `zeiten`, Steinmengen FELS_* und fairer Start START_STEIN_* in `src/sim/daten.ts` |
| Bauen | `dorf.json` `bauen.je_ware_s` (Startwert 2,5 s), Planieren `planieren_ab_grad`, `planieren_s` |
| Bewohner | `dorf.json` `start.bewohner`, `wohnen.zyklus_s`, Notnagel; Wohnraum je Wohnhaus in `buildings.json` |
| Kirmes-Ketten | Erzeuger `zeiten.arbeit_s`, Verarbeiter `wandelt.dauer_s`, Warenliste `dorf.json` `kirmes[0].liste` |

## Spieltest-Bot (automatisch)

`spieleM5()` spielt wie ein ruhiger Mensch: höchstens drei offene Baustellen, mindestens eine Minute zwischen zwei
Bauaufträgen, Reihenfolge wie Drehbuch 4.4, Wohnhäuser, wenn die Leute ausgehen, und alle 90 s ein zweiter Weg an der
vollsten Fahne. Er läuft auf einer Testkarte mit Hängen (Planierer nötig). Der Abnahmetest verlangt die Kirmes zwischen
Minute 15 und 40 (der Bot denkt schneller als ein Mensch, darum etwas unter dem Ziel 30–45).

Stand der Zahlen nach dem Einstellen (M5):

| Bot-Takt (Denkpause, offene Baustellen) | Kirmes ab Minute |
|---|---|
| 45 s, 3 | 20,8 |
| 60 s, 3 (Abnahmetest) | 22,1 |
| 90 s, 3 | 28,5 |
| 120 s, 3 | 31,4 |

Eingestellt wurde dabei:

- **Erzeuger langsamer** als die Startwerte aus DESIGN §6 (Kartoffelfeld 20 s, Obstwiese 24 s, Schafstall 24 s, Bienenstock
  30 s; Küche 12 s, Mostkeller 15 s, Käserei 12 s): Mit den alten Werten liefen die Fahnen voll, bevor ein Weg nachkam.
- **Verklemmung gelöst:** Zwei volle Fahnen, deren Waren sich gegenseitig blockieren, drehen sich jetzt über die Notplätze frei
  (Tausch auch auf einen Notplatz der Gegenseite, Direktlieferung ans Zielgebäude auch an einer vollen Fahne).
- **Notnagel greift auch, wenn kein Nachwuchs in Sicht ist** (kein Wohnhaus mit Essen oder kein Wohnraum frei), nicht nur
  ohne Essen im Lager: Sonst blieb der Bot mit 10 Bewohnern hängen, weil für das erste Wohnhaus kein Träger mehr frei war.
- **Wohnhäuser essen nicht weg, was die Kirmes noch braucht**, und holen nach Verarbeitern und Kirmesplatz.

Offen für den Spieltest mit Menschen: Start mit 10 Bewohnern (eng, aber der Notnagel hilft), Bauzeit je Ware 2,5 s,
Planieren ab 6° Steigung, Radien, Gebäudeabstand, Bäume je Hex, Wachstumszeit und Steinmengen (aus M4 übernommen).

## Zusatz M7: Findet sich ein neuer Spieler ohne Hilfe zurecht?

Abnahme von [ROADMAP M7](ROADMAP.md). Gleicher Ablauf wie oben, dazu auf die Oberfläche achten (nichts erklären, auch nicht die Fenster):

| Frage | Darauf achten | Notiz |
|---|---|---|
| Öffnet er ein Gebäude von selbst? | Klickt er aufs Lager oder eine Baustelle? Liest er „Wartet auf …“ und „Fehlt noch“? | |
| Findet er die Fenster oben links? | 📦 Waren, ⚖️ Verteilung, 📈 Statistik, 📜 Protokoll, ⚙️, ❓ – oder die Tasten I, V, T, L, H? | |
| Nutzt er den Tooltip im Baumenü? | Hover über ein Gebäude: versteht er „2 Kartoffeln → 1 Bratkartoffel“ und warum etwas gesperrt ist? | |
| Reagiert er auf Meldungen am rechten Rand? | Klickt er „Gebäude ohne Weg zum Lager“ an und baut den Weg? | |
| Stellt er die Warenverteilung um, wenn die Kirmes hakt? | Zum Beispiel Käse für den Kirmesplatz statt fürs Wohnhaus | |
| Pinnt oder verschiebt er Fenster, stören sie? | Werden zu viele Fenster lästig? Findet er Esc? | |
| Handy oder Tablet (optional) | Gehen Fenster, Baumenü und Wegebau mit dem Finger? | |
