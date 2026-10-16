# Drehbuch – Die Eifeler

Das Drehbuch ersetzt Schritt für Schritt den Vorentwurf in [DESIGN.md](DESIGN.md). Wir gehen es Kapitel für Kapitel durch.
Ein Kapitel gilt als **beschlossen**, wenn wir es gemeinsam durchgesprochen haben. Erst dann wird daraus Code.

| Kapitel | Stand |
|---|---|
| 1. Idee und Ton | ✅ beschlossen (Grundzüge) |
| 2. Spielmodi | ✅ beschlossen (Grundzüge) |
| 3. Welt und Maßstab | 🟡 teilweise beschlossen |
| 4. Kern-Spielschleife | ✅ beschlossen (Grundzüge) |
| 5. Wirtschaft und Gebäude | ⬜ offen |
| 6. Finden, Nachbarn, Ziele | ⬜ offen |
| 7. Stil und Figuren | ⬜ offen |
| 8. Technik und Mehrspieler | 🟡 Vorschlag Weltdaten und Ausschnitte |

---

## 1. Idee und Ton

**In einem Satz:** Ein Aufbauspiel im Geist von Siedler 2 auf der echten Eifel von heute. Man spielt ein kleines, krummbeiniges, schlitzohriges Bergvolk, das niemals stiehlt. Es **findet** Dinge.

**Keine feste Epoche.** Das Gelände ist das von heute, mit Talsperren und allem. Die Gags kommen bunt aus allen Zeiten: Kaffeeschmuggel, „Preußisch Sibirien“, Tuchmacher, Kirmes, Eifelsteig. Die Architektur lehnt sich an das Fachwerk des 18. Jahrhunderts an, aber bunt und verspielt wie in Siedler.

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
| **Schmuggel und Zöllner** | Die Nordeifel war 1945–1953 Zentrum des Kaffeeschmuggels („Aachener Kaffeefront“), besonders Mützenich. | An Regionsgrenzen stehen Zöllner, also Gelegenheit zum „Finden“. Kaffee ist eine Luxusware, die irgendwie immer über die Grenze kommt. Mützenich als Schmugglernest. |
| **Das Wetter** | rau, nass, windig; das Hohe Venn | Regen ist ein Dauerzustand. Bauern-Sprüche zum Wetter, der Bootsverleih am Rursee hat nie geöffnet. |
| **„Preußisch Sibirien“** | Ab 1815 galt die Eifel als Armenhaus Preußens. | Das Selbstmitleid der Eifeler als Gag: Meldungen bei Kälte und Missernte, ein Zuschuss-Gebäude („Eifelfonds“) für arme Dörfer. |
| **Kirmes** | Die Dürener Annakirmes geht auf 1501 zurück. | Kirmes als großes Ziel jedes Dorfes. Die Annakirmes in Düren ist das Fest, auf das alle neidisch sind. |
| **Schützenfest** | Schützenbruderschaften, Vogelschuss und Schützenkönig sind in den Dörfern fest verankert. | Zweites großes Fest neben der Kirmes, ähnlich behandelt (Vorschlag zur Abgrenzung in Kapitel 6). Der Vogelschuss auf den Holzvogel ist die einzige Schießerei im ganzen Spiel. Der Schützenkönig muss die Runde zahlen. |
| **„Et jit net jerannt.“** | geflügeltes Wort (Kolumne „Eifel-Einsichten“) | Träger-Spruch, wenn man das Tempo hochdreht. Klären, ob wir das Zitat so verwenden. |
| **„Von bei Aachen“** | Früher verschwiegen Eifeler im Urlaub ihre Herkunft. | Händler aus der Eifel stellen sich in der Stadt als „von bei Aachen“ oder „von bei Trier“ vor. |
| **Grenzsteine** | Volkssage: Wer Grenzsteine versetzt, muss nach dem Tod als Geist umgehen. | Finder können Grenzsteine „finden“ und dabei ein Stück weiter tragen (siehe 2.3). Spukende Grenzsteinversetzer als Nachtgeräusch. |

### 1.3 Regionale Eigenheiten (Material für die Völkchen)

- **Monschauer Land:** Tuchmacher-Stadt, das Rote Haus (Tuchmacher Scheibler, um 1752–1768), Monschauer Senf (seit 1882). Heckenland gegen den Venn-Wind, Hohes Venn, Kaffeeschmuggel in Mützenich.
- **Rureifel und Dürener Land:** Rurtal, Buntsandsteinfelsen um Nideggen, Papiermühlen an der Rur (Düren als Papierstadt), Annakirmes. Düren als großer Flachländer-Nachbar.
- **Vulkaneifel:** Maare, Sprudel, Basalt. Hillesheim und Gerolstein liegen am Eifelsteig.
- **Sprache:** Im Norden ripuarisches Platt (nah am Kölsch und Öcher Platt), im Süden moselfränkisch (nah am Luxemburgischen). Die Sprüche der Völkchen färben sich danach.

Offen: eine Erzähler- oder Beraterfigur (z. B. eine resolute Dorfälteste), die durch Kampagne und Tutorial führt.

---

## 2. Spielmodi

### 2.1 Kampagne „Der Eifelsteig“

**Später.** Erst muss das Spiel im freien Spiel funktionieren und Spaß machen, dann bauen wir Missionen.

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
- **Kampagnenkarten sind feste Ausschnitte** aus denselben Weltdaten wie das freie Spiel (3.1), mit fest eingestellter Datenversion und handgesetzten Extras für die Mission.

### 2.2 Freies Spiel

Man wählt seinen **Kartenausschnitt selbst**, irgendwo in der Eifel (siehe 3.1), dazu Startort, Nachbarn und Siegbedingung. Die bisherigen Karten (Monschauer Land, Rureifel) werden zu fertigen Vorschlägen in dieser Auswahl.

### 2.3 Mehrspieler

- **Klassisch wie früher:** Einer legt in einer Lobby ein Spiel an und lädt Freunde per Link ein. **Ohne Konto**, nur mit Spielername.
- **Friedlich:** keine Armeen, keine Kämpfe. Man misst sich über Wirtschaft, Feste, Handel und das „Finden“.
- **Zwei Varianten, beide erwünscht:**
  1. **Gemeinsame Karte:** Der Gastgeber wählt einen Ausschnitt (3.1), jeder startet in einem anderen Ortskern darin.
  2. **Verbundene Regionen:** Jeder spielt seinen eigenen Ausschnitt (z. B. Rureifel gegen Monschauer Land) und schickt Händler und Finder zum anderen hinüber.
- **Gebiet gewinnen ohne Krieg:** noch offen (Kapitel 6). Ideen:
  - **Grenzsteine versetzen:** Finder verschieben die Grenze Stück für Stück, mit Risiko, erwischt zu werden.
  - **Abwerben:** Die bessere Kirmes und das bessere Essen locken Bewohner der Nachbarn ins eigene Dorf.
  - **Einfluss:** Gut versorgte Dörfer strahlen auf benachbarte Hexe aus, so wie in Siedler die Grenzen wachsen.

---

## 3. Welt und Maßstab (teilweise beschlossen)

Erste Festlegungen:

- **Gelände von heute, Orte als Kerne:** Gelände, Flüsse, Seen und Talsperren sind die von heute. Die heutigen Häuser fallen weg. Echte Orte gibt es nur als kleine Kerne (Kirche, ein paar Höfe) an der richtigen Stelle, das Land drumherum ist frei. Dort kann man sein Dorf gründen und wachsen lassen.
- **Eine Partie dauert etwa 2 Stunden** (Mehrspieler-Abend, freies Spiel).
- **Gebäude etwa 3× echte Größe**, damit sie aus der Spielansicht gut lesbar sind (Maßstabs-Probe bei Einruhr).
- **Bauplätze werden planiert**, damit Gebäude am Hang nicht im Boden versinken. An steilen Hängen nur kleine Gebäude.

Offene Fragen:

- Hex-Größe, Gebäudegröße und Kartengröße gemeinsam festlegen. Mit 90-m-Hexen ist Einruhr nach fünf Gebäuden voll. Kleinere Hexe verlangen kleinere Kartenausschnitte, sonst wird eine Partie endlos.
- **Vorschlag Karten- und Hexgröße** (noch zu bestätigen):
  - In einer 2-Stunden-Partie baut ein Spieler grob 60–120 Gebäude und braucht dafür samt Wegen etwa 1.000–2.500 Hexe.
  - Für bis zu 4 Spieler ergibt das Karten von etwa **100–120 Hexen Kantenlänge**.
  - **Hex-Umkreisradius 60 m** (ein Hex ist rund 104 m breit) statt bisher 90 m. Damit wird eine Karte **etwa 10–12 km** groß, zum Beispiel Einruhr bis Monschau oder Nideggen bis Heimbach.
  - Gebäude in etwa 3× echter Größe passen dann gut ins Hex, Ortskerne wie Einruhr bekommen genug Platz drumherum.
  - Die bisherigen Regionen (20–25 km) werden in mehrere Spielkarten geteilt oder dienen als Übersicht.

### 3.1 Kartenwahl: den Ausschnitt selbst wählen

Im **freien Spiel und im Mehrspieler** gibt es keine festen Karten mehr. Man wählt selbst, wo man spielt:

1. **Größe wählen:** klein, mittel oder groß.
2. **Ort wählen**, auf einer von zwei Arten:
   - Auf der **großen Übersichtskarte der ganzen Eifel** liegt ein **Auswahl-Hex**. Man schiebt es mit dem Finger oder der Maus frei dorthin, wo man spielen will. Es rastet immer auf dem Hex-Raster ein.
   - Oder man **tippt einen Ort ein** („Gemünd“), der dann die Mitte wird. Gibt es den Namen mehrfach, kommt eine Auswahlliste („Welches Gemünd? Et jitt zwei.“).
3. Die Übersicht zeigt im Hex schon die **Ortskerne als mögliche Startplätze**, Seen, Wald und Höhen. Reichen die Ortskerne nicht für alle Spieler (z. B. mitten im Hohen Venn), sagt das Spiel das gleich: „Hier wohnt keiner.“

**Vorschlag Form und Größen** (Hex-Umkreisradius 60 m, Karte als großes Hex mit Norden oben):

| Größe | Radius | Hexe | Breite | Fläche | Spieler |
|---|---|---|---|---|---|
| klein | 45 Hexe | ca. 6.200 | ca. 9,5 km | ca. 58 km² | 1–2 |
| mittel | 60 Hexe | ca. 11.000 | ca. 12,6 km | ca. 103 km² | 2–4 |
| groß | 80 Hexe | ca. 19.400 | ca. 16,7 km | ca. 182 km² | 4–6 |

- Rechnung: je Spieler 1.000–2.500 Hexe für 2 Stunden, dazu rund ein Drittel unbebaubar (Wasser, steile Hänge, Moor).
- Zum Vergleich: Das heutige Monschauer Land ist mit rund 440 km² mehr als doppelt so groß wie „groß“. Die Leistung ist damit schon erprobt.
- Ein Hex als Form passt zum Spiel und verteilt die Startplätze gleichmäßiger als ein Rechteck. Alternative wäre ein Rechteck, das den Bildschirm besser füllt.

**Am Rand:** Außerhalb des Spiel-Hex geht die echte Landschaft noch etwa 2 km als **Kulisse** weiter (nicht bebaubar, leicht ausgegraut), dann verschwindet sie im Nebel. So gibt es keine harte Tischkante.

**Grenzen der Auswahl:**

- **Weltrand:** Die Weltdaten reichen von Aachen bis Trier und von Luxemburg und Ostbelgien bis an den Rhein bei Maria Laach. Das Auswahl-Hex samt Kulisse bleibt immer innerhalb. Liegt ein eingetippter Ort zu nah am Rand, rückt das Hex nach innen und der Ort ist nicht ganz in der Mitte.
- **Über Landesgrenzen hinweg** darf man spielen, zum Beispiel Monschau mit Kalterherberg und dem belgischen Venn, oder die Our an der luxemburgischen Grenze. Die Staatsgrenze ist als gestrichelte Linie zu sehen und bringt **Zöllner** ins Spiel, also Gelegenheit für den Kaffeeschmuggel. Eine harte Regel ist sie nicht.

**Kampagne:** Kampagnenkarten bleiben **feste Ausschnitte**. Technisch sind sie nur gespeicherte Auswahlen (Mitte, Größe, Datenversion) plus die Missionsdaten.

## 4. Kern-Spielschleife

Die Spielschleife folgt bewusst **Siedler 2**: Das Wegenetz ist das Herz des Spiels. Die technischen Regeln dafür (Fahnen, Segmente, Routing ohne Verklemmung, Baustellen, Abriss) stehen ausgearbeitet im Vorentwurf [DESIGN.md §3–4](DESIGN.md) und werden übernommen.

### 4.1 Wege und Träger

- Jedes Gebäude steht auf einem Hex und hat eine **Fahne** vor dem Eingang. Fahnen sind die Knoten des Wegenetzes.
- **Wege** führen von Fahne zu Fahne. Auf jedem Abschnitt pendelt genau **ein Träger** und trägt eine Ware nach der anderen.
- Alle Waren sind sichtbar unterwegs: Man sieht Stämme, Steine und Kartoffeln über die Wege wandern und sich an Fahnen stapeln, wenn es hakt.
- **Bergauf ist langsamer.** Die echten Täler und Hänge der Eifel spielen damit eine Rolle beim Wegebau.
- Ein Gebäude ohne Wegverbindung zum Lager arbeitet nicht (⚠).

### 4.2 Start

- Man beginnt mit einem **Lager in einem echten Ortskern**, zum Beispiel Einruhr, mit ein paar Bewohnern und einem kleinen Vorrat an Brettern, Steinen und Essen.
- Von dort baut man Wege ins Land, setzt Holzfäller und Steinbruch und wächst Schritt für Schritt.

### 4.3 Wachstum

- **Nahrung bringt neue Bewohner.** Wohnhäuser mit Essen im Vorrat bringen neue Eifeler hervor. Besseres Essen geht schneller (einfach: Kartoffeln, Äpfel, Milch; veredelt: Käse, Bratkartoffeln, Most, Honig; edel: regionale Spezialitäten).
- **Feste sind die großen Zwischenziele:**
  - **Kirmes:** Das Dorf steigt eine Stufe auf und schaltet neue Gebäude frei.
  - **Schützenfest:** Kräftemessen mit den Nachbarn um den Königstitel (Kapitel 6).
- **Notnagel:** Sind kaum noch freie Bewohner da und es gibt nichts zu essen, kommt ab und zu ein Zugezogener. Man kann sich nicht festfahren.

### 4.4 Die ersten 30 Minuten (Zielbild)

1. Lager steht im Ortskern, Kamera zeigt das Tal. Die Dorfälteste begrüßt mit einem Spruch.
2. Holzfäller und Förster an den Waldrand, Weg dahin legen, die ersten Stämme laufen ins Lager.
3. Sägewerk und Steinbruch: Bretter und Steine fließen, die ersten Baustellen wachsen sichtbar in drei Phasen.
4. Kartoffelfeld und Wohnhaus: Die ersten neuen Bewohner kommen, das Netz wird dichter, an einer Fahne staut es sich, man baut einen zweiten Weg.
5. Kirmesplatz steht, die Warenliste füllt sich. Ziel für die nächste halbe Stunde ist klar.

## 5. Wirtschaft und Gebäude (offen)

Grundketten (Holz, Stein, Nahrung), regionale Spezialketten, Kirmes-Stufen.

## 6. Finden, Nachbarn, Ziele (offen)

Finderei, Ausreden, Grenzsteine, Gebiet ohne Krieg, Siegbedingungen in Kampagne und Mehrspieler.

### Feste: Kirmes und Schützenfest

Beide Feste funktionieren ähnlich: Man baut einen Festplatz, liefert eine Warenliste, dann wird gefeiert. Vorschlag zur Abgrenzung:

| | Kirmes | Schützenfest |
|---|---|---|
| Wofür | Wachstum des eigenen Dorfes: nächste Dorfstufe, neue Gebäude | Kräftemessen mit den Nachbarn: Schützenkönig der Region |
| Wer feiert | jedes Dorf für sich | alle Dörfer der Region bzw. alle Spieler gemeinsam |
| Ablauf | Warenliste erfüllen → Fest → Freischaltungen | Ausrichter liefert Bier, Schnaps, Essen; jedes Dorf schickt einen Schützen zum Vogelschuss |
| Lohn | Dorfstufe, Bewohner | Königstitel bis zum nächsten Schützenfest: mehr Einfluss auf Nachbar-Hexe, Bewohner wandern zu |
| Haken | – | Der König muss die Runde zahlen (teure Warenlieferung) |

**Vogelschuss:** vor allem **Vorbereitung** mit einem kleinen **Glücksanteil**. Wer einen Schießstand hat, seine Schützen trainiert und ein besseres Gewehr „gefunden“ hat, trifft öfter. Ganz sicher ist es nie.

## 7. Stil und Figuren (offen)

Lustiger Siedler-Look: übertriebene Proportionen, krummbeinige Figuren, Gebäude mit Charakter, Sprüche und Animationen.

## 8. Technik und Mehrspieler (offen)

### 8.1 Weltdaten und Ausschnitte (Vorschlag)

Damit man den Ausschnitt frei wählen kann (3.1), liegt die **ganze Eifel vorab fertig in Spielauflösung** vor. Der Server erzeugt nichts, der Client schneidet sich den Ausschnitt selbst aus.

**Ein Raster für die ganze Welt**

- Eine Projektion für alles: **ETRS89 / UTM Zone 32N** (in Metern, wenig Verzerrung über die ganze Eifel). Heute rechnet jede Karte mit eigenem Nullpunkt, das fällt weg.
- Ein **globales Hex-Raster** mit festem Ursprung, Umkreisradius 60 m. Jedes Hex hat weltweit eindeutige Koordinaten (q, r). Ein Ausschnitt ist damit nur „Mittel-Hex + Größe“ und liegt immer auf dem Raster.
- Das Höhen- und Bedeckungsraster (30 m) hängt am selben Ursprung.

**Kacheln**

- Der Konverter (`tools/map/`) rechnet die Welt einmal auf dem Entwicklerrechner durch und schneidet sie in **Kacheln von etwa 6 × 6 km**: Höhe, Bedeckung, Wasser, dazu Flüsse, Seeufer und Orte als Vektoren, beschnitten auf die Kachel.
- Flüsse, Talsperren und gegrabene Flussbetten werden **für die ganze Welt am Stück** berechnet, dann erst zerschnitten. Sonst passen die Kanten nicht aneinander.
- Alles, was die **Simulation** braucht (Hex-Gelände, Höhe und Steigung je Hex, Wasser, Bauplatzgröße, Ortskerne), steht fertig als **Ganzzahlen** in eigenen Hex-Kacheln. Der Client rechnet daran nichts mit Kommazahlen. So kommt in jedem Browser exakt dasselbe heraus.
- Dazu eine **Übersichtskarte** der ganzen Welt (ca. 200 m Raster plus Reliefbild, rund 2 MB) und ein **Ortsverzeichnis** für die Suche (einige tausend Orte, rund 150 KB). Beides lädt zuerst, die Suche läuft ohne Server.
- Die Kulisse am Rand kommt aus gröberen Daten, das spart Ladezeit.

**Datenversion und Prüfsumme**

- Jeder Durchlauf des Konverters ist eine **Datenversion** (z. B. `eifel-2026.11`) mit einem Verzeichnis (Manifest) aller Kacheln und ihrer Prüfsummen. Kacheln liegen unter versionierten Pfaden und ändern sich nie.
- Ein Ausschnitt ist komplett beschrieben durch: **Datenversion, Mittel-Hex (q, r), Größe**, dazu Startplätze und Zufallssaat.
- **Mehrspieler:** Der Gastgeber schickt diese Parameter. Jeder Client schneidet den Ausschnitt selbst und bildet eine **Prüfsumme über die Simulationsdaten**. Erst wenn alle gleich sind, startet die Partie. Danach gehen nur noch Befehle hin und her.
- Alte Datenversionen bleiben abrufbar, solange Spielstände und Kampagnen sie brauchen.

**Datenmenge und Ladezeit (Schätzung)**

- Heute: Monschauer Land, rund 440 km², ist gepackt etwa 1 MB.
- **Welt:** rund 16.000 km² (Rechteck um die Eifel), gepackt etwa **30–40 MB**. Das ist zu viel für das Git-Repo. Die Kacheln liegen deshalb als statische Dateien neben dem Spiel (z. B. Webspeicher oder CDN), nicht in der Git-Geschichte.
- **Eine Partie:** Ausschnitt „groß“ mit Kulisse ist rund 400 km², also **etwa 1 MB**. Bei normalem Internet dauert der Download 1–2 Sekunden, dazu 1–2 Sekunden Aufbau des Geländes. Der Browser merkt sich geladene Kacheln, das nächste Spiel in der Gegend startet sofort.

**Datenquellen für die ganze Welt**

| Quelle | Heute | Für die ganze Eifel |
|---|---|---|
| Copernicus GLO-30 (Höhe) | Kachel N50E006 | 6 Kacheln: N49/N50 × E005/E006/E007 (Luxemburg und Ostbelgien in E005, Maria Laach und Rhein in E007, Trier in N49) |
| ESA WorldCover (Bedeckung) | Ausschnitt aus N48E006 | dazu N48E003 für alles westlich von 6° O |
| OpenStreetMap | Overpass je Karte | Abfragen dieser Größe überlasten Overpass. Besser die Länder-Auszüge von Geofabrik (NRW, Rheinland-Pfalz, Belgien, Luxemburg) laden und lokal ausschneiden. |

Alle Quellen sind weltweit einheitlich, die Landesgrenzen machen technisch keine Probleme. Rohdaten insgesamt mehrere hundert MB, die bleiben wie bisher draußen.

**Vorhandene Karten:** `monschau-rursee` und `rureifel` werden zu gespeicherten Ausschnitten (Vorschläge) aus der Welt.

### 8.2 Simulation und Mehrspieler

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
