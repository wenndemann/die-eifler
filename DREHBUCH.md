# Drehbuch – Die Eifeler

Das Drehbuch ersetzt Schritt für Schritt den Vorentwurf in [DESIGN.md](DESIGN.md). Wir gehen es Kapitel für Kapitel durch.
Ein Kapitel gilt als **beschlossen**, wenn wir es gemeinsam durchgesprochen haben. Erst dann wird daraus Code.

| Kapitel | Stand |
|---|---|
| 1. Idee und Ton | ✅ beschlossen (Grundzüge), Erzählfiguren für alle 10 Völkchen, „Mer renne nit.“ |
| 2. Spielmodi | ✅ beschlossen (Grundzüge) |
| 3. Welt und Maßstab | ✅ beschlossen (Grundzüge) |
| 4. Kern-Spielschleife | ✅ beschlossen (Grundzüge), Planierer und Bauarbeiter |
| 5. Wirtschaft und Gebäude | ✅ beschlossen (Grundzüge), Grenzvölkchen und Kirmes-Warenlisten fest, Einzelwerte beim Spielen |
| 6. Finden, Nachbarn, Ziele | ✅ beschlossen (Grundzüge), Eifel-Punkte verteilt, Orte mit Einstand, Flachländer am Kartenrand, viele Feste |
| 7. Stil und Figuren | ✅ beschlossen (Grundzüge), Waren erst lesbar, dann schön |
| 8. Technik und Mehrspieler | ✅ beschlossen (Grundzüge) |

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
| **„Mer renne nit.“** | angelehnt an das geflügelte Wort „Et jit net jerannt“ | Träger-Spruch, wenn man das Tempo hochdreht. **Beschlossen:** eigene Abwandlungen statt des wörtlichen Zitats (Buchtitel), z. B. „Mer renne nit.“ oder „Langsam, mir sin en d'r Eifel.“ |
| **„Von bei Aachen“** | Früher verschwiegen Eifeler im Urlaub ihre Herkunft. | Händler aus der Eifel stellen sich in der Stadt als „von bei Aachen“ oder „von bei Trier“ vor. |
| **Grenzsteine** | Volkssage: Wer Grenzsteine versetzt, muss nach dem Tod als Geist umgehen. | Finder können Grenzsteine „finden“ und dabei ein Stück weiter tragen (siehe 2.3). Spukende Grenzsteinversetzer als Nachtgeräusch. |

### 1.3 Regionale Eigenheiten (Material für die Völkchen)

- **Monschauer Land:** Tuchmacher-Stadt, das Rote Haus (Tuchmacher Scheibler, um 1752–1768), Monschauer Senf (seit 1882). Heckenland gegen den Venn-Wind, Hohes Venn, Kaffeeschmuggel in Mützenich.
- **Rureifel und Dürener Land:** Rurtal, Buntsandsteinfelsen um Nideggen, Papiermühlen an der Rur (Düren als Papierstadt), Annakirmes. Düren als großer Flachländer-Nachbar.
- **Vulkaneifel:** Maare, Sprudel, Basalt. Hillesheim und Gerolstein liegen am Eifelsteig.
- **Sprache:** Im Norden ripuarisches Platt (nah am Kölsch und Öcher Platt), im Süden moselfränkisch (nah am Luxemburgischen). Die Sprüche der Völkchen färben sich danach.

### 1.4 Erzählfiguren (beschlossen)

**Jedes Völkchen hat seine eigene Erzählfigur.** Sie begrüßt, kündigt das Wetter als Bauernregel an, kommentiert Feste und Funde und führt durch Einführung und Kampagne.

| Völkchen | Figur | Charakter |
|---|---|---|
| **Monschauer & Venner** | **Herr Leck, der Europa-Schützenkönig** | Hat einmal den europäischen Königsschuss geholt und erzählt das jedem. Wichtig, gönnerhaft, mit Königskette auch beim Holzhacken. Sagt in jedem Satz **„sag ich mal“**. Erfundene Figur, kein echter Schützenkönig. |
| **Rursee-Leute** | **Kapitän Kalle** | Bootsverleiher, dessen Verleih noch nie geöffnet hatte. Trägt Kapitänsmütze, war nie auf See. Vertröstet jeden mit **„Morje vielleicht.“** |
| **Rureifeler** | **Papiermüller Arnold** | Pedantischer Müller, schreibt alles auf eigenes Papier mit. Misst sich ständig an Düren: **„In Düren hätten se dat schon.“** |
| **Vulkaneifeler** | **Maar-Mattes** | Wünschelrutengänger mit Gummistiefeln, hält alles für ein Zeichen aus der Tiefe. Wenn etwas klappt: **„Et blubbert!“** |
| **Ahrtaler** | **Winzerin Traudel** | Herzlich und laut, will jede Meldung erst bei einem Glas besprechen: **„Do drop e Schöppche.“** Darum dauern ihre Feste länger. |
| **Laacher & Mayener** | **Pater Benno und Küsterin Hedwig** | Er will das Gute, sie weiß, wie es wirklich läuft. Er beginnt feierlich, sie unterbricht mit **„Psst, nit esu laut!“** (wegen der Abtei). |
| **Südeifeler** | **Tante Fin** | Wirtin der Schänke, erzählt alles als Gerücht, auch das Wetter: **„Hab ich von der Nachbarin.“** |
| **Schneifeler** | **Oma Billa** | Resolute Dorfälteste mit Kittelschürze und Gehstock, hat schon jeden Winter überlebt und lobt nie zu viel: **„Et hätt schlimmer kumme künne.“** |
| **Ostbelgier** | **Zöllner a. D. Gerd** | Pensionierter Grenzbeamter, liebt Formulare in drei Sprachen und mischt sie alle: **„Bon, also, dat jeht so nit.“** Merkt nie, was über die Grenze geschmuggelt wird. |
| **Öslinger** | **Gerbermeister Jängi** | Stolz, gut angezogen, riecht leicht nach Lohe. Hält alle anderen für arm und bedauert sie freundlich: **„Dir Aarm, gell?“** |

Alle Figuren sind frei erfunden. Jede hat einen festen Sprachtick, damit man sie sofort erkennt, wie „sag ich mal“ bei Herrn Leck.

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
- **Gebiet gewinnen ohne Krieg:** alle drei Wege kommen ins Spiel (siehe 6.1):
  - **Grenzsteine versetzen:** Finder verschieben die Grenze Stück für Stück, mit Risiko, erwischt zu werden.
  - **Abwerben:** Die bessere Kirmes und das bessere Essen locken Bewohner der Nachbarn ins eigene Dorf.
  - **Einfluss:** Gut versorgte Dörfer strahlen auf benachbarte Hexe aus, so wie in Siedler die Grenzen wachsen.

---

## 3. Welt und Maßstab

Erste Festlegungen:

- **Gelände von heute, Orte als Kerne:** Gelände, Flüsse, Seen und Talsperren sind die von heute. Die heutigen Häuser fallen weg. Echte Orte gibt es nur als kleine Kerne (Kirche, ein paar Höfe) an der richtigen Stelle, das Land drumherum ist frei. Dort kann man sein Dorf gründen und wachsen lassen.
- **Eine Partie dauert etwa 2 Stunden** (Mehrspieler-Abend, freies Spiel).
- **Gebäude etwa 3× echte Größe**, damit sie aus der Spielansicht gut lesbar sind (Maßstabs-Probe bei Einruhr).
- **Bahnlinien ja, Straßen nein (beschlossen):** Die heutigen Bahnstrecken (z. B. Rurtalbahn Düren–Heimbach, Eifelstrecke, Ahrtalbahn) liegen als Gleisbett im Gelände und geben Orientierung. Auf einem Hex mit Gleis wird nicht gebaut, Wege dürfen es kreuzen (Bahnübergang). Stillgelegte Strecken wie die Vennbahn fehlen, die Vennbahn bleibt Spezialität der Ostbelgier (5.3). **Straßen gibt es nicht**, das Wegenetz baut der Spieler selbst (Kapitel 4).
- **Bauplätze werden planiert**, damit Gebäude am Hang nicht im Boden versinken. An steilen Hängen nur kleine Gebäude.

**Maßstab (beschlossen):**

- **Hex-Umkreisradius 60 m** statt bisher 90 m. Ein Hex ist rund 104 m breit.
- Begründung: In einer 2-Stunden-Partie baut ein Spieler grob 60–120 Gebäude und braucht dafür samt Wegen etwa 1.000–2.500 Hexe. Mit 90-m-Hexen war Einruhr nach fünf Gebäuden voll.
- Gebäude in etwa 3× echter Größe passen gut ins Hex, Ortskerne wie Einruhr bekommen genug Platz drumherum.
- Spielkarten sind damit etwa 10–17 km groß (Größen siehe 3.1). Die bisherigen Regionen (20–25 km) werden zu Vorschlägen oder zur Übersicht.

### 3.1 Kartenwahl: den Ausschnitt selbst wählen

Im **freien Spiel und im Mehrspieler** gibt es keine festen Karten mehr. Man wählt selbst, wo man spielt:

1. **Größe wählen:** klein, mittel oder groß.
2. **Ort wählen**, auf einer von zwei Arten:
   - Auf der **großen Übersichtskarte der ganzen Eifel** liegt ein **Auswahl-Hex**. Man schiebt es mit dem Finger oder der Maus frei dorthin, wo man spielen will. Es rastet immer auf dem Hex-Raster ein.
   - Oder man **tippt einen Ort ein** („Gemünd“), der dann die Mitte wird. Gibt es den Namen mehrfach, kommt eine Auswahlliste („Welches Gemünd? Et jitt zwei.“).
3. Die Übersicht zeigt im Hex schon die **Ortskerne als mögliche Startplätze**, Seen, Wald und Höhen. Reichen die Ortskerne nicht für alle Spieler (z. B. mitten im Hohen Venn), sagt das Spiel das gleich: „Hier wohnt keiner.“

**Form und Größen (beschlossen):** Die Spielkarte ist ein **großes Hex** mit Norden oben.

| Größe | Radius | Hexe | Breite | Fläche | Spieler |
|---|---|---|---|---|---|
| klein | 45 Hexe | ca. 6.200 | ca. 9,5 km | ca. 58 km² | 1–2 |
| mittel | 60 Hexe | ca. 11.000 | ca. 12,6 km | ca. 103 km² | 2–4 |
| groß | 80 Hexe | ca. 19.400 | ca. 16,7 km | ca. 182 km² | 4–6 |

- Rechnung: je Spieler 1.000–2.500 Hexe für 2 Stunden, dazu rund ein Drittel unbebaubar (Wasser, steile Hänge, Moor).
- Zum Vergleich: Das heutige Monschauer Land ist mit rund 440 km² mehr als doppelt so groß wie „groß“. Die Leistung ist damit schon erprobt.
- Das Hex als Form passt zum Spiel und verteilt die Startplätze gleichmäßiger als ein Rechteck.

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

- Man beginnt mit einem **Lager in einem echten Ortskern**, zum Beispiel Einruhr, mit ein paar Bewohnern und einem kleinen Vorrat an Brettern, Steinen und Essen. Der Startort gehört einem von Anfang an.
- Zum Start gehören **4 Bauarbeiter und 2 Planierer** (4.5).
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

### 4.5 Bauen: Planierer und Bauarbeiter (beschlossen)

Wie in Siedler bauen eigene Berufe, nicht die Träger.

- **Träger liefern nur.** Sie legen die Ware auf einen kleinen Stapel an der Baustelle und gehen zurück an ihren Weg. Der Vorentwurf (DESIGN §4.6, „Träger verbaut selbst“) gilt nicht mehr.
- **Planierer** gehen nur zu Bauplätzen am Hang. Sie ebnen den Platz, man sieht die Erde glatt werden. Flache Plätze brauchen keinen Planierer. Erst planieren, dann bauen.
- **Bauarbeiter:** einer je Baustelle. Er läuft über die Wege hin, sobald die erste Ware da ist, und verbaut sie Stück für Stück (Startwert 2–3 s je Ware, mit Hämmern). Danach geht er zur nächsten Baustelle oder zurück ins Lager.
- **Fester Vorrat:** Zum Start gibt es **4 Bauarbeiter und 2 Planierer**. Das reicht bis Dorfstufe 2. Mehr Baustellen gleichzeitig heißt warten, Priorität entscheidet, wer zuerst drankommt.
- **Neue Bauarbeiter und Planierer brauchen Werkzeug** (Hammer bzw. Schaufel) und einen freien Bewohner. Werkzeug macht die Schmiede ab Dorfstufe 2 (5.1). Vorher gibt es höchstens mal ein Stück als Fund (6.3).

## 5. Wirtschaft und Gebäude

Beschlossen:

- **Umfang wie Siedler 2:** rund **25 Grundgebäude**, dazu **2–3 Spezialgebäude je Völkchen**.
- **Das Völkchen ergibt sich aus dem Startort.** Wer in Gerolstein startet, spielt Vulkaneifeler. Liegt ein Ausschnitt über zwei Gegenden, haben die Spieler verschiedene Völkchen.
- **Eisen und Werkzeug schlank, ab Dorfstufe 2.** Nicht jeder Beruf braucht Werkzeug, nur die Fachkräfte der besseren Gebäude sowie neue Bauarbeiter und Planierer (4.5).
- **10 Völkchen:** die 8 aus dem Vorentwurf und zwei Grenzvölkchen, weil die Welt jetzt nach Belgien und Luxemburg reicht.

Die Zahlen (Raten, Kosten, Puffer) aus [DESIGN.md §6](DESIGN.md) gelten als Startwerte und werden beim Spielen eingestellt.

### 5.1 Grundketten (für alle)

| Kette | Ablauf | ab |
|---|---|---|
| 🪵 Holz | Holzfäller → Stamm → Sägewerk → Bretter; Förster pflanzt nach | Start |
| 🪨 Stein | Steinbruch an Felsen (endlich) → Stein | Start |
| 🥔 Kartoffel | Kartoffelfeld → Kartoffeln → Küche → Bratkartoffeln | Start |
| 🍏 Most | Obstwiese → Äpfel → Mostkeller → Most | Start |
| 🧀 Käse | Schafstall → Milch → Käserei → Käse → Reifekeller → Bergkäse | Start / Stufe 1 |
| 🍯 Honig | Bienenstock → Honig | Start |
| 🍺 Bier | Gerstenfeld → Gerste → Brauerei → Landbier (für Feste) | Stufe 1 |
| 🥃 Schnaps | Wacholderheide → Wacholder → Brennerei → Schnaps (Schänke, Boten, Feste) | Stufe 1 |
| ⚒️ Eisen | Erzgrube + Köhlerei (Holz → Holzkohle) → Eisenhütte → Eisen → Schmiede → Werkzeug | Stufe 2 |

Eisen ist echt Eifel: Im Schleidener Tal und um Gemünd standen jahrhundertelang Eisenhütten.

**Grundgebäude (Vorschlag, rund 25):** Lager/Dorfkern, Wohnhaus, Holzfäller, Förster, Sägewerk, Steinbruch, Kartoffelfeld, Küche, Obstwiese, Mostkeller, Schafstall, Käserei, Reifekeller, Bienenstock, Gerstenfeld, Brauerei, Wacholderheide, Brennerei, Schänke, Erzgrube, Köhlerei, Eisenhütte, Schmiede, Kirmesplatz, Schützenhaus mit Schießstand. Dazu kommen Gebäude für Gebiet und Finderei aus Kapitel 6.

### 5.2 Dorfstufen über die Kirmes

| Stufe | Kirmes liefert (beschlossene Startwerte) | Ziel in der Partie | Schaltet frei |
|---|---|---|---|
| Weiler → Dorf | 10 Bratkartoffeln, 10 Most, 6 Käse | nach ~30–45 min | Reifekeller, Brauerei, Brennerei, Schänke, Schützenhaus |
| Dorf → Kirchdorf | 10 Bergkäse, 12 Honig, 15 Landbier, 5 Schnaps | nach ~75 min | Eisenkette und Werkzeug, **Spezialkette des Völkchens** |
| Kirchdorf → Marktflecken | 10 Spezialität des Völkchens, 10 Werkzeug, Mischkorb aus 20 beliebigen veredelten Waren | nach ~110 min | Edle Spezialität, Handel mit Nachbarn |

Die Mengen werden beim Spielen eingestellt, die Zeitziele bleiben.

### 5.3 Völkchen

Jedes Völkchen hat einen **Bonus**, eine **Spezialkette** (2–3 Gebäude, ab Stufe 2), eine **augenzwinkernde Schwäche** und eigene Sprüche (Platt nördlich ripuarisch, südlich moselfränkisch).

| Völkchen | Bonus | Spezialkette | Schwäche |
|---|---|---|---|
| **Monschauer & Venner** | Hecken wachsen schneller | Schafwolle → Spinnerei → Tuchmacherei (Rotes Haus); Senfmühle | Bauen ungern im Moor |
| **Rursee-Leute** | Fischerei an Talsperren | Fisch → Räucherei | Bei Regen ruht der Bootsverleih |
| **Rureifeler** | Steinbrüche im Buntsandstein ergiebiger | Rotsandstein → Steinmetz; Papiermühle an der Rur | Schielen ständig nach Düren |
| **Vulkaneifeler** | Basaltbrüche ergiebiger | Sprudelquelle, Lavastein | Maare sind heilig, dort wird nicht gebaut |
| **Ahrtaler** | Wein auf Steilhängen | Trauben → Kelter → Rotwein | Feste dauern länger |
| **Laacher & Mayener** | Mühlsteine als wertvolle Handelsware | Basalt → Mühlstein; Schiefer → Dächer | Kein Lärm nahe der Abtei |
| **Südeifeler** | Bier besser und schneller | Hopfen → Edelbier; Römerstraße (schnelle Wege) | Finden dauernd „alte Steine“ |
| **Schneifeler** | Holz und Köhlerei ergiebiger | Holzkohle im großen Stil, Harz | Kurzer Sommer, Felder langsamer |
| **Ostbelgier** (Eupen, Venn, St. Vith) | Torfstich im Venn als Brennstoff (statt Holzkohle) | Milch → Molkerei → **Butter** (Butterland Eupen); **Vennbahn** als schnelle Trasse | Formulare in drei Sprachen: neue Gebäude starten etwas langsamer |
| **Öslinger** (Nord-Luxemburg) | Schiefer fürs Dach, Gebäude günstiger | Lohhecke (Eichen) → Lohe → **Gerberei** (Wiltz) → Leder; **Éislécker Ham** (Räucherschinken) | Halten alle anderen für arm und handeln teurer |

Die zwei Grenzvölkchen sind beschlossen (Hintergrund: Eupener Butter und die alte Vennbahn-Trasse; Lohhecken und Gerbereien in Wiltz, Éislécker Ham als Spezialität des Ösling). Wo nicht klar ist, zu welchem Völkchen ein Startort gehört, entscheidet eine Gebietskarte im Konverter.

## 6. Finden, Nachbarn, Ziele

### 6.1 Gebiet ohne Krieg

Alle drei Wege sind beschlossen und greifen ineinander:

| Weg | Wie | Gegenmittel |
|---|---|---|
| **Einfluss** | Lager, Höfe, Kirche und Festplätze strahlen auf die Hexe drumherum aus, gut versorgt weiter als schlecht versorgt. So wächst die Grenze wie in Siedler. | selbst besser versorgen |
| **Grenzsteine versetzen** | Ein Finder trägt nachts einen Grenzstein ein Stück weiter. Gelingt es, wechseln ein paar Hexe den Besitzer. | Wachhund, Dorfpolizist; Erwischte gehen in die Ausredenstube |
| **Abwerben** | Wer die bessere Kirmes und das bessere Essen hat, lockt Bewohner vom Rand der Nachbarn herüber. Manchmal zieht ein ganzer Hof mit seinem Land um. | eigene Leute satt und bei Laune halten |

Gebäude werden nie zerstört. Wechselt ein Hex mit Gebäude den Besitzer, steht das Gebäude still, bis man es zurückgewinnt oder freiwillig abreißt.

**Hecken (beschlossen):** Die hohen Buchenhecken um die Höfe in Höfen und im Monschauer Land werden **Spezialität der Monschauer & Venner**, keine Regel für alle. Sie schützen vor dem Venn-Wind (Gebäude dahinter arbeiten im Winter schneller) und sind eine **lebende Grenze**: Grenzsteine hinter einer Hecke lassen sich kaum versetzen. Sie brauchen Setzlinge und Jahre zum Wachsen. In anderen Gegenden gibt es Hecken nur als Kulisse.

### 6.2 Orte und Nachbarn (beschlossen)

**Eifel-Orte gewinnt man mit einem Einstand.** Jeder echte Ort in der Eifel hat ein Dorfzentrum, vom Weiler bis zum Städtchen wie Monschau, Gerolstein, Daun oder Prüm. Der Startort gehört einem von Anfang an, alle anderen muss man gewinnen:

1. **Erreichen:** Ein Weg führt bis an die Fahne des Dorfzentrums. Der Ort ist entdeckt, gehört aber noch niemandem.
2. **Wunsch:** Die Leute sind misstrauisch gegen Fremde. Der Ortsvorsteher äußert eine kleine Warenliste, je Ort anders, mit Spruch („Wer seid ihr denn? Kommt mal mit was zu essen wieder.“). Beispiel: Höfen will 4 Käse und 2 Most, Rurberg 5 Bratkartoffeln.
3. **Einstand:** Ist alles geliefert, wird ein kleines Fest gefeiert, und der Ort gehört dazu. Man bekommt ein **zusätzliches Lager**, ein kleines Gebiet um den Ortskern, ein paar Bewohner und eine **Fundkiste** mit Waren, die man dort „gefunden“ hat. Manchmal ist ein **besonderer Fund** dabei (Werkzeug, Sonderware; mehr dazu mit der Kampagne).
- **Größe zählt:** Je größer der Ort, desto größer der Wunsch und desto mehr bekommt man. Ein Städtchen wie Monschau will vielleicht 10 Käse, 5 Most und 3 Werkzeug, das schafft man erst spät.
- **Im Mehrspieler** ist das ein Wettlauf: Wer den Wunsch zuerst erfüllt, gewinnt den Ort. Wer zu spät kommt, hat umsonst geliefert, die Waren sind „verschwunden“.

**Flachländer sind die Städte außerhalb der Eifel:** Aachen, Düren, Euskirchen, Bonn, Koblenz, Trier, Lüttich. („Euskirchen? Dat es noch kein Eifel.“)

- Sie liegen fast nie im Ausschnitt. Man erreicht sie über einen **Marktposten am Kartenrand**: Ein Wegweiser zeigt in die Richtung, in der die Stadt wirklich liegt („Nach Düren, 18 km“). Jede Karte hat so ein bis drei Flachländer, auch wenn man mitten in der Eifel startet.
- Wer einen Weg zum Marktposten baut, kann dort **handeln und finden**. Flachländer haben ein Lager, eine Wachsamkeit und Waren, bauen aber nicht selbst. Je weiter die echte Stadt weg ist, desto länger brauchen Händler und Finder.
- **Flachländer kann man nicht gewinnen.** Ist ja keine Eifel.
- Volle KI-Gegner, die selbst bauen, kommen höchstens später.
- **Im Mehrspieler** sind die Mitspieler die Nachbarn. Orte und Flachländer gibt es zusätzlich.

### 6.3 Finden

- **Finderhütte** schickt Finder über das Wegenetz (beschwipst auch querfeldein) zu Nachbarn. Sie bringen Waren mit oder werden erwischt.
- **Auch bei Mitspielern darf man finden, mit Gegenwehr:** Wachhund und Dorfpolizist schützen das eigene Dorf. Ein Ertappter landet in der **Ausredenstube**. Je besser die Ausrede, desto schneller ist er frei (Spruch-Gag).
- **Fundbüro** wertet Funde auf. Gefundenes Werkzeug, ein besseres Gewehr für den Vogelschuss oder Kaffee über die Grenze sind die begehrten Funde.

### 6.4 Siegbedingungen

- **Standard: Eifel-Punkte.** Nach 2 Stunden gewinnt, wer die meisten Punkte hat. Zwischenstand jederzeit sichtbar. Verteilung (beschlossene Startwerte):

  | Wofür | Punkte |
  |---|---|
  | Dorfstufe Dorf / Kirchdorf / Marktflecken | 100 / 250 / 450 (insgesamt, nicht zusätzlich) |
  | jede Kirmes, jedes Schützenfest | 50 |
  | jedes kleine Fest, jeder Einstand | 10–30 je nach Fest und Ortsgröße |
  | Schützenkönig | 150 je Titel |
  | Bewohner | 1 je Bewohner |
  | Gebiet | 1 je 10 Hexe |
  | große Funde | 30–100 je nach Fund |
  | Teil des Großen Funds | 75 |

  Kein Bereich allein reicht zum Sieg.
- **Wählbar in der Lobby:**
  - **Wettlauf:** Wer zuerst Marktflecken wird.
  - **Der Große Fund:** Teile eines seltenen Schatzes bei verschiedenen Nachbarn finden und im Fundbüro zusammensetzen.
- **Kampagne:** Jede Etappe hat ihr eigenes Ziel (Kapitel 2.1).

### Feste

**Viele Feste (beschlossen):** Neben Kirmes und Schützenfest gibt es viele kleine Feste. Alle funktionieren gleich: Warenliste liefern, feiern, Punkte bekommen. Je mehr Feste man schafft, desto mehr Eifel-Punkte.

- **Kleine Feste**, jedes zu seiner Jahreszeit (7.4): Maifest, Erntedank, Viehmarkt, Martinsfeuer, Fastelovend, Weinfest (an Mosel und Ahr) und mehr. Kurze Warenliste, 10–30 Punkte.
- **Einstand:** Jeder gewonnene Ort feiert seinen Einstand (6.2). Danach feiert jeder angeschlossene Ort einmal im Jahr **sein eigenes Fest**. Mehr Orte heißt mehr Feste.
- **Kein Dauerfeiern:** Jedes kleine Fest gibt es höchstens einmal je Spieljahr und Ort, dazu eine Obergrenze für die Punkte aus kleinen Festen (Startwert beim Spielen). Kein Bereich allein reicht zum Sieg (6.4).
- **Die Kirmes bleibt das Tor zur nächsten Dorfstufe**, das Schützenfest das Kräftemessen. Kleine Feste schalten nichts frei.

**Kirmes und Schützenfest** funktionieren ähnlich: Man baut einen Festplatz, liefert eine Warenliste, dann wird gefeiert. Vorschlag zur Abgrenzung:

| | Kirmes | Schützenfest |
|---|---|---|
| Wofür | Wachstum des eigenen Dorfes: nächste Dorfstufe, neue Gebäude | Kräftemessen mit den Nachbarn: Schützenkönig der Region |
| Wer feiert | jedes Dorf für sich | alle Dörfer der Region bzw. alle Spieler gemeinsam |
| Ablauf | Warenliste erfüllen → Fest → Freischaltungen | Ausrichter liefert Bier, Schnaps, Essen; jedes Dorf schickt einen Schützen zum Vogelschuss |
| Lohn | Dorfstufe, Bewohner | Königstitel bis zum nächsten Schützenfest: mehr Einfluss auf Nachbar-Hexe, Bewohner wandern zu |
| Haken | – | Der König muss die Runde zahlen (teure Warenlieferung) |

**Vogelschuss:** vor allem **Vorbereitung** mit einem kleinen **Glücksanteil**. Wer einen Schießstand hat, seine Schützen trainiert und ein besseres Gewehr „gefunden“ hat, trifft öfter. Ganz sicher ist es nie.

## 7. Stil und Figuren

Lustiger Siedler-Look: übertriebene Proportionen, krummbeinige Figuren, Gebäude mit Charakter, Sprüche und Animationen.

### 7.1 Figuren

- **Mischung aus Siedler 2 und Asterix-Comic:** knubbelig wie in Siedler (großer Kopf, krumme Beine, dicke Nase, Kappe oder Kopftuch), dazu mehr Mimik und übertriebene Gesten wie im Comic.
- Jedes **Völkchen erkennt man an Tracht und Farbe**.
- **Betrunkene erkennt man sofort:** rote Nase und Wangen, Schlagseite, Torkeln im Zickzack, Hicksen mit Bläschen über dem Kopf, schiefe Mütze, Flasche unterm Arm. Je mehr Schnaps, desto deutlicher (leicht angeheitert bis sternhagelvoll). Das ist wichtig fürs Spiel, weil beschwipste Boten und Finder anders laufen und leichter erwischt werden.

### 7.2 Sprache und Stimmen

- **Hochdeutsch mit Platt-Prisen:** Meldungen und Menüs auf Hochdeutsch, damit alle mitkommen. Sprüche und Ausrufe auf Platt, je Völkchen gefärbt (Norden ripuarisch, Süden moselfränkisch, Ostbelgien und Ösling mit eigenem Einschlag). Ein Tooltip übersetzt für Flachländer.
- **Gebrabbel statt Sprecher:** Die Figuren brabbeln ein kurzes Kauderwelsch mit Eifeler Klang (wie bei den Sims), der Spruch steht als Text dabei. Betrunkene brabbeln schleppender und singen.

### 7.3 Gebäude

- **Bunt und mit echten Baustoffen der Gegend:** Fachwerk mit Schieferdach im Norden und Monschauer Land, Bruchstein und roter Buntsandstein an der Rur, dunkler Basalt in der Vulkaneifel, Schiefer im Ösling.
- Dazu bunte Fensterläden, schiefe Dächer, Blumenkästen und Kleinkram, der verrät, was drinnen passiert.
- Baustellen wachsen sichtbar in drei Phasen (Kapitel 4).

### 7.4 Jahreszeiten und Wetter

- **Jahreszeiten mit Wirkung:** Eine Partie läuft durch etwa **2 Jahre**. Im Winter liegt Schnee, Felder und Obstwiesen ruhen, man lebt vom Vorrat. Im Frühjahr wird gesät, im Herbst geerntet, und dann ist Kirmeszeit.
- **Starkes Wetter:** Regen, Talnebel, Venn-Wind, Schnee, Dürre, dazu Ereignisse wie **Missernte** oder **Hochwasser** an Bächen und Flüssen. Gebäude in der Aue können dann ein paar Minuten stillstehen und Waren am Ufer davonschwimmen.
- **Fair bleibt es trotzdem:**
  - Wetter kündigt sich an, als **Bauernregel** der Dorfältesten („Ist der Mai kühl und nass …“). Wer vorsorgt (Vorräte, nicht in die Aue bauen, Hecken), kommt glimpflich davon.
  - Kein Wetter zerstört Gebäude oder Bewohner, und dank Notnagel fährt man sich nicht fest.
  - Im Mehrspieler kommt das Wetter aus der gemeinsamen Zufallssaat und trifft alle im Ausschnitt gleich.
- **Feingefühl:** Das Ahr-Hochwasser 2021 ist echt und schmerzhaft. Hochwasser kommt im Spiel vor, aber nie als Witz und nie mit Anspielung darauf.

### 7.5 Musik und Klang

- **Volksmusik-Anklang:** Akkordeon, Blasmusik und Fiedel, leicht schräg und verspielt. Auf Kirmes und Schützenfest gibt es richtig Tusch.
- Räumliche Geräusche: Säge, Hämmern, Schafe, Bach, Wind über dem Venn, nachts spukende Grenzsteinversetzer.

### 7.6 Waren (beschlossen)

Alle Waren sind sichtbar unterwegs (4.1). Ihre Optik kommt in zwei Schritten:

- **Erst lesbar (M5):** Jede Ware hat eine klare Form und Farbe und ist auf Wegen, an Fahnen und in Warenlisten sofort zu erkennen. Der Stamm ist ein Stamm, das Brett ein Brett, der Käse ein gelbes Rad. Aus diesen Modellen entstehen auch die Icons (M7).
- **Dann schön (M11):** feine Modelle, Holzmaserung, Steine mit Moos, Wackeln beim Tragen.

## 8. Technik und Mehrspieler

### 8.1 Weltdaten und Ausschnitte

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

### 8.2 Plattform

- **Im Browser, PC zuerst.** Volle Bedienung mit Maus und Tastatur. Auf Tablet und Handy spielbar, aber dort nicht der Schwerpunkt.
- Eine App für Desktop oder Store höchstens später (ROADMAP M10).

### 8.3 Simulation und Mehrspieler

- Simulation von Anfang an **deterministisch und befehlsbasiert**, Mehrspieler im **Gleichschritt (Lockstep)**: Alle rechnen dasselbe, verschickt werden nur Befehle. Zufall (auch Wetter) kommt aus der gemeinsamen Saat.
- **Verbindung direkt zwischen den Browsern (WebRTC).** Ein kleiner Vermittlungs-Server macht nur Lobby und Verbindungsaufbau, ohne Konto. Klappt die direkte Verbindung nicht (Firmen- oder Handynetz), leitet ein **Notfall-Relais** (TURN) weiter.
- **Rausgeflogen:** Das Spiel **pausiert**, der Spieler kommt über den Einladungslink zurück und holt sich den aktuellen Stand von einem Mitspieler. Ist er nach **5 Minuten** nicht zurück, übernimmt ein einfacher **Verwalter** sein Dorf (hält die Wirtschaft am Laufen, baut nichts Neues), bis er wiederkommt.
- **Tempo:** Der Gastgeber stellt **1× bis 3×** ein. Pause darf jeder, aber begrenzt (z. B. dreimal je Partie).
- Ständige **Abgleich-Prüfsummen** über den Spielstand. Laufen zwei Spieler auseinander, wird das gemeldet und der Stand vom Gastgeber neu verteilt.
- Speichern, Laden und Wiederaufnahme von Mehrspielerpartien. Ein Spielstand merkt sich die Datenversion der Karte (8.1).

---

## Quellen der Recherche

- Eifelsteig, Etappen: [Wikipedia (de)](https://de.wikipedia.org/wiki/Eifelsteig), [eifel.info](https://www.eifel.info/en/the-premium-trail-eifelsteig-1)
- Kaffeeschmuggel: [eifel.info: Der Schmuggler](https://www.eifel.info/en/pois/der-schmuggler), [t-online: Als in der Eifel der Kaffeekrieg tobte](https://www.t-online.de/nachrichten/wissen/geschichte/id_85928392/aachen-als-in-der-eifel-der-kaffeekrieg-tobte.html), [Uni Bamberg](https://www.uni-bamberg.de/histgeo/news/artikel/kaffee-schmuggel-in-der-eifel-lukratives-geschaeft-in-den-nachkriegsjahren-eine-historisch-geographische-betrachtung/)
- „Preußisch Sibirien“: [Landeszentrale für politische Bildung RLP](https://www.lpb.rlp.de/fileadmin/files/Blaetter_zum_Land/Eifel.pdf), [Die Eifel ist im Kommen (dpa 2010)](https://www.pro-nationalpark-steigerwald.de/fileadmin/pro-nationalpark-steigerwald/download/Wirtschaftlichkeit_Nationalparke/Die_Eifel_ist_im_Kommen_az-web-160510.pdf)
- „Et jit net jerannt“: [Perlego: Et jit net jerannt 3](https://www.perlego.com/de/book/1039078/et-jit-net-jerannt-3-gesammelte-eifeleinsichten-pdf)
- Dialekte: [Wikipedia: Eifel dialects](https://en.wikipedia.org/wiki/Eifel_dialects)
- Annakirmes: [ADAC](https://www.adac.de/der-adac/regionalclubs/nrw/reise-freizeit/kirmes-nrw-top/), [festivalsindeutschland.de](https://www.festivalsindeutschland.de/festival/duerener-annakirmes)
- Monschau, Rotes Haus und Senfmühle: [KuLaDig](https://www.kuladig.de/Objektansicht/Drucken/KLD-344046), [Merian](https://www.merian.de/deutschland/rheinland-pfalz/stolz-der-eifel-monschau-und-bad-muenstereifel)
