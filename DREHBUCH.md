# Drehbuch – Die Eifeler

Das Drehbuch ersetzt Schritt für Schritt den Vorentwurf in [DESIGN.md](DESIGN.md). Wir gehen es Kapitel für Kapitel durch.
Ein Kapitel gilt als **beschlossen**, wenn wir es gemeinsam durchgesprochen haben. Erst dann wird daraus Code.

| Kapitel | Stand |
|---|---|
| 1. Idee und Ton | ✅ beschlossen (Grundzüge) |
| 2. Spielmodi | ✅ beschlossen (Grundzüge) |
| 3. Welt und Maßstab | 🟡 offen, erste Festlegungen |
| 4. Kern-Spielschleife | ⬜ offen |
| 5. Wirtschaft und Gebäude | ⬜ offen |
| 6. Finden, Nachbarn, Ziele | ⬜ offen |
| 7. Stil und Figuren | ⬜ offen |
| 8. Technik und Mehrspieler | ⬜ offen |

---

## 1. Idee und Ton

**In einem Satz:** Ein Aufbauspiel im Geist von Siedler 2 auf der echten Eifel um 1750. Man spielt ein kleines, krummbeiniges, schlitzohriges Bergvolk, das niemals stiehlt. Es **findet** Dinge.

### 1.1 Der Ton

- **Sprüche und Seitenhiebe**, eher Monkey Island und Asterix als brave Wuselidylle. Jede Figur, jedes Gebäude und jede Meldung darf einen Spruch haben.
- **Selbstironie zuerst.** Die Eifeler nehmen sich selbst auf die Schippe: stur, sparsam, wetterfest, bauernschlau, misstrauisch gegen alles hinter dem nächsten Hügel. Das Spiel lacht *mit* den Eifelern, nicht über sie.
- **Seitenhiebe nach außen** gehen an Flachländer, Städter, Zöllner, Obrigkeit und das jeweilige Nachbardorf. Nie an echte Personen.
- **Liebe zum Detail:** echte Orte, echte Flüsse, echte Eigenheiten der Regionen. Wer aus der Gegend kommt, soll sich ertappt fühlen.

### 1.2 Running Gags (Grundstock, wird erweitert)

| Gag | Woher | Im Spiel |
|---|---|---|
| **„Die Eifel fängt erst hinter meinem Dorf an.“** Das Nachbardorf ist immer noch Flachland. | Selbstbild in der Region | Jedes Dorf hält die Nachbarn für „Flachländer“. Tooltips über Nachbardörfern: „Noch keine Eifel.“ Eigene Dörfer bekommen Rivalität untereinander. |
| **Finden statt Stehlen** | Spielidee | Finder, Fundbüro, Ausredenstube. Wer erwischt wird, braucht eine gute Ausrede. |
| **Schmuggel und Zöllner** | Die Nordeifel war 1945–1953 Zentrum des Kaffeeschmuggels („Aachener Kaffeefront“), besonders Mützenich. | Um 1750 ist die Eifel ein Flickenteppich kleiner Herrschaften: an jeder Grenze ein Zöllner, also Gelegenheit zum „Finden“. Kaffee ist eine Luxusware, die irgendwie immer über die Grenze kommt. |
| **Das Wetter** | rau, nass, windig; das Hohe Venn | Regen ist ein Dauerzustand. Bauern-Sprüche zum Wetter, der Bootsverleih am Rursee hat nie geöffnet. |
| **„Preußisch Sibirien“** | Ab 1815 galt die Eifel als Armenhaus Preußens. | Um 1750 liegt das noch in der Zukunft. Ein Wahrsager oder alter Kauz warnt: „Wartet ab, bis die Preußen kommen …“ |
| **Kirmes** | Die Dürener Annakirmes geht auf 1501 zurück. | Kirmes als großes Ziel jedes Dorfes. Die Annakirmes in Düren ist das Fest, auf das alle neidisch sind. |
| **„Et jit net jerannt.“** | geflügeltes Wort (Kolumne „Eifel-Einsichten“) | Träger-Spruch, wenn man das Tempo hochdreht. Klären, ob wir das Zitat so verwenden. |
| **„Von bei Aachen“** | Früher verschwiegen Eifeler im Urlaub ihre Herkunft. | Händler aus der Eifel stellen sich in der Stadt als „von bei Aachen“ oder „von bei Trier“ vor. |
| **Grenzsteine** | Volkssage: Wer Grenzsteine versetzt, muss nach dem Tod als Geist umgehen. | Finder können Grenzsteine „finden“ und dabei ein Stück weiter tragen (siehe 2.3). Spukende Grenzsteinversetzer als Nachtgeräusch. |

### 1.3 Regionale Eigenheiten (Material für die Völkchen)

- **Monschauer Land:** Tuchmacher-Stadt, das Rote Haus (Tuchmacher Scheibler, um 1752–1768, also genau unsere Zeit). Heckenland gegen den Venn-Wind, Hohes Venn. Senf erst ab 1882, also im Spiel nur als Augenzwinkern („Das wird mal was“).
- **Rureifel und Dürener Land:** Rurtal, Buntsandsteinfelsen um Nideggen, Papiermühlen an der Rur (Düren als Papierstadt), Annakirmes. Düren als großer Flachländer-Nachbar.
- **Vulkaneifel:** Maare, Sprudel, Basalt. Hillesheim und Gerolstein liegen am Eifelsteig.
- **Sprache:** Im Norden ripuarisches Platt (nah am Kölsch und Öcher Platt), im Süden moselfränkisch (nah am Luxemburgischen). Die Sprüche der Völkchen färben sich danach.

Offen: eine Erzähler- oder Beraterfigur (z. B. eine resolute Dorfälteste), die durch Kampagne und Tutorial führt.

---

## 2. Spielmodi

### 2.1 Kampagne „Der Eifelsteig“

Die Einzelkampagne folgt dem echten **Eifelsteig**: 15 Etappen, rund 313 km, von Aachen-Kornelimünster nach Trier. Jede Kampagnenkarte ist eine Region entlang des Weges; man wandert sozusagen mit seinem Völkchen durch die Eifel.

| Abschnitt | Etappen | Karte (Vorschlag) |
|---|---|---|
| Nordeifel | 1 Kornelimünster–Roetgen, 2 Roetgen–Monschau, 3 Monschau–Einruhr, 4 Einruhr–Gemünd | Monschauer Land & Rursee (existiert) |
| Kalkeifel | 5 Gemünd–Kloster Steinfeld, 6 Steinfeld–Blankenheim, 7 Blankenheim–Mirbach | Steinfeld & Blankenheim |
| Vulkaneifel | 8 Mirbach–Hillesheim, 9 Hillesheim–Gerolstein, 10 Gerolstein–Daun, 11 Daun–Manderscheid | Vulkaneifel |
| Südeifel | 12 Manderscheid–Kloster Himmerod, 13 Himmerod–Bruch, 14 Bruch–Kordel, 15 Kordel–Trier | Südeifel & Trierer Land |

- Jede Etappe ist eine Mission mit eigenem Ziel (z. B. ein Dorf gründen, eine Kirmes ausrichten, eine Ware nach Gemünd schaffen).
- **Weitere Wege** als Zusatzkampagnen. Die Rureifel mit Düren liegt nicht am Eifelsteig, sie wird ein eigener Weg entlang der Rur.
- Zwischen den Etappen: Eifel-Übersichtskarte mit dem gewanderten Weg.

### 2.2 Freies Spiel

Jede vorhandene Region mit frei wählbarem Startort, Nachbarn und Siegbedingung.

### 2.3 Mehrspieler

- **Klassisch wie früher:** Einer legt in einer Lobby ein Spiel an und lädt Freunde per Link ein. **Ohne Konto**, nur mit Spielername.
- **Friedlich:** keine Armeen, keine Kämpfe. Man misst sich über Wirtschaft, Feste, Handel und das „Finden“.
- **Zwei Varianten, beide erwünscht:**
  1. **Gemeinsame Karte:** Jeder startet in einem anderen Dorf derselben Region.
  2. **Verbundene Regionen:** Jeder spielt seine eigene Region (z. B. Rureifel gegen Monschauer Land) und schickt Händler und Finder zum anderen hinüber.
- **Gebiet gewinnen ohne Krieg:** noch offen (Kapitel 6). Ideen:
  - **Grenzsteine versetzen:** Finder verschieben die Grenze Stück für Stück, mit Risiko, erwischt zu werden.
  - **Abwerben:** Die bessere Kirmes und das bessere Essen locken Bewohner der Nachbarn ins eigene Dorf.
  - **Einfluss:** Gut versorgte Dörfer strahlen auf benachbarte Hexe aus, so wie in Siedler die Grenzen wachsen.

---

## 3. Welt und Maßstab (offen)

Erste Festlegungen:

- **Die Eifel von damals:** Das Spiel spielt um 1750. Heutige Häuser fallen weg. Echte Orte gibt es nur als kleine Kerne (Kirche, ein paar Höfe) an der richtigen Stelle, das Land drumherum ist frei. Gelände, Flüsse und Seen bleiben echt. Die Talsperren gibt es um 1750 natürlich noch nicht (Augenzwinkern oder Rückbau, offen).
- **Gebäude etwa 3× echte Größe**, damit sie aus der Spielansicht gut lesbar sind (Maßstabs-Probe bei Einruhr).
- **Bauplätze werden planiert**, damit Gebäude am Hang nicht im Boden versinken. An steilen Hängen nur kleine Gebäude.

Offene Fragen:

- Hex-Größe, Gebäudegröße und Kartengröße gemeinsam festlegen. Mit 90-m-Hexen ist Einruhr nach fünf Gebäuden voll. Kleinere Hexe verlangen kleinere Kartenausschnitte, sonst wird eine Partie endlos.
- Wie lang soll eine Partie dauern (Kampagnen-Etappe, Mehrspieler-Abend)?
- Die Talsperren um 1750: weglassen (Rur als Fluss) oder als Augenzwinkern behalten?

## 4. Kern-Spielschleife (offen)

Wege, Träger, Waren, Wachstum. Was macht die ersten 30 Minuten spaßig?

## 5. Wirtschaft und Gebäude (offen)

Grundketten (Holz, Stein, Nahrung), regionale Spezialketten, Kirmes-Stufen.

## 6. Finden, Nachbarn, Ziele (offen)

Finderei, Ausreden, Grenzsteine, Gebiet ohne Krieg, Siegbedingungen in Kampagne und Mehrspieler.

## 7. Stil und Figuren (offen)

Lustiger Siedler-Look: übertriebene Proportionen, krummbeinige Figuren, Gebäude mit Charakter, Sprüche und Animationen.

## 8. Technik und Mehrspieler (offen)

- Simulation von Anfang an **deterministisch und befehlsbasiert**, damit Mehrspieler im Gleichschritt (Lockstep) später möglich ist.
- Lobby ohne Konto: ein kleiner Vermittlungs-Server (Lobby, Verbindungsaufbau), die Spiele laufen zwischen den Browsern.
- Speichern, Laden und Wiederaufnahme von Mehrspielerpartien.

---

## Quellen der Recherche

- Eifelsteig, Etappen: [Wikipedia (de)](https://de.wikipedia.org/wiki/Eifelsteig), [eifel.info](https://www.eifel.info/en/the-premium-trail-eifelsteig-1)
- Kaffeeschmuggel: [eifel.info: Der Schmuggler](https://www.eifel.info/en/pois/der-schmuggler), [t-online: Als in der Eifel der Kaffeekrieg tobte](https://www.t-online.de/nachrichten/wissen/geschichte/id_85928392/aachen-als-in-der-eifel-der-kaffeekrieg-tobte.html), [Uni Bamberg](https://www.uni-bamberg.de/histgeo/news/artikel/kaffee-schmuggel-in-der-eifel-lukratives-geschaeft-in-den-nachkriegsjahren-eine-historisch-geographische-betrachtung/)
- „Preußisch Sibirien“: [Landeszentrale für politische Bildung RLP](https://www.lpb.rlp.de/fileadmin/files/Blaetter_zum_Land/Eifel.pdf), [Die Eifel ist im Kommen (dpa 2010)](https://www.pro-nationalpark-steigerwald.de/fileadmin/pro-nationalpark-steigerwald/download/Wirtschaftlichkeit_Nationalparke/Die_Eifel_ist_im_Kommen_az-web-160510.pdf)
- „Et jit net jerannt“: [Perlego: Et jit net jerannt 3](https://www.perlego.com/de/book/1039078/et-jit-net-jerannt-3-gesammelte-eifeleinsichten-pdf)
- Dialekte: [Wikipedia: Eifel dialects](https://en.wikipedia.org/wiki/Eifel_dialects)
- Annakirmes: [ADAC](https://www.adac.de/der-adac/regionalclubs/nrw/reise-freizeit/kirmes-nrw-top/), [festivalsindeutschland.de](https://www.festivalsindeutschland.de/festival/duerener-annakirmes)
- Monschau, Rotes Haus und Senfmühle: [KuLaDig](https://www.kuladig.de/Objektansicht/Drucken/KLD-344046), [Merian](https://www.merian.de/deutschland/rheinland-pfalz/stolz-der-eifel-monschau-und-bad-muenstereifel)
