# DESIGN – Die Eifeler

Aufbauspiel im Geist von *Die Siedler 2* auf der **echten Eifel**: echte Höhen, echte Täler, echte Orte.
Ton: liebevoll, augenzwinkernd, regional. **Die Eifeler stehlen nie – sie „finden“ Dinge.**

Diese Datei beschreibt den **Soll-Zustand** des Spiels. Wann was gebaut wird, steht in [ROADMAP.md](ROADMAP.md).
Zahlen-Wahrheit sind `data/*.json`; bei Abweichung gewinnt die JSON, diese Datei wird nachgezogen.

---

## 1. Säulen

1. **Echte Heimat.** Jede Karte ist ein Stück echte Eifel. Man erkennt seinen Ort, sein Tal, seine Talsperre.
2. **Sichtbare Wirtschaft.** Jede Ware ist ein Gegenstand auf einem Rücken oder einem Stapel. Engpässe sieht man, bevor man sie in einer Statistik liest.
3. **Diorama-Optik.** Stilisiertes Low-Poly mit echtem Licht: Relief, Schatten, Talnebel, Wind im Wald. Es soll aussehen wie eine liebevoll gebaute Modelllandschaft und nicht wie Kästchen auf Gitter.
4. **Regionale Eigenart.** Jede Region hat ihr eigenes Völkchen mit Spezialitäten, Sprüchen und Schwächen.
5. **Humor statt Gewalt.** Kein Krieg. Konkurrenz läuft über Finderei, Ausreden und die Kirmes.

---

## 2. Welt

### 2.1 Eifel-Übersicht und Regionen

- **Eifel-Übersicht (Weltkarte):** die ganze Eifel von Aachen über Trier bis Maria Laach (ca. 100 × 120 km) als 3D-Karte mit grobem Raster (~100 m). Hier wählt man Region und Startort, sieht freigeschaltete Regionen und den Fortschritt der Kampagne.
- **Regionen (Spielkarten):** Ausschnitte von ca. 20–30 km Kantenlänge, Hex-Größe ~156 m (Umkreisradius 90 m), also 20.000–40.000 Hexe pro Karte.

| Region | Ausschnitt | Charakter |
|---|---|---|
| **Monschauer Land & Rursee** (erste Karte) | Monschau – Simmerath – Heimbach | Hohes Venn (Moor), Heckenland, Rursee/Obersee/Urftsee, tiefe Rurschleifen |
| Vulkaneifel | Daun – Gerolstein – Manderscheid | Maare, Basalt, Sprudelquellen |
| Ahrtal | Altenahr – Bad Neuenahr | Steile Weinhänge, enges Tal |
| Laacher See & Mayener Land | Maria Laach – Mayen – Mendig | Vulkansee, Basalt-Mühlsteine, Schiefer, Kloster |
| Südeifel & Trierer Land | Bitburg – Irrel – Trier | Sandstein-Felsenland, Römerstraßen, Braugerste |
| Schneifel & Prümer Land | Prüm – Bleialf | Wald, Abtei, rauer Kamm |

### 2.2 Regionale Völkchen

Jede Region bringt eine **Bevölkerungs-Eigenart** mit: einen Bonus, eine Spezialkette, eine Schwäche und Sprüche. Werte stehen in `data/regions.json`.

| Völkchen | Bonus | Spezialkette | Schwäche (augenzwinkernd) |
|---|---|---|---|
| **Monschauer & Venner** | Hecken wachsen 25 % schneller (Heckenland gegen den Venn-Wind) | Tuch: Schafwolle → Spinnerei → Tuchmacherei (Rotes Haus), Monschauer Senf | Bauen nur ungern im Moor („Do bliev ich stäche!“) |
| **Rursee-Leute** | Fischerei an Talsperren | Fisch → Räucherei | Bei Regen arbeitet der Bootsverleih nicht |
| **Vulkaneifeler** | Basalt- und Steinbrüche ergiebiger | Sprudel aus Quellen, Lavastein | Maare sind heilig, dort wird nicht gebaut |
| **Ahrtaler** | Wein auf Steilhängen (Hänge sind sonst schlecht) | Trauben → Kelter → Rotwein | Feste dauern länger (Arbeitspause nach der Kirmes) |
| **Laacher & Mayener** | Mühlsteine als wertvolle Handelsware | Basalt → Steinmetz → Mühlstein; Schiefer → Dächer | Mönche verlangen Ruhe: kein Lärmgebäude nahe der Abtei |
| **Südeifeler** | Braugerste und Bier | Gerste → Mälzerei → Brauerei | Römerstraßen sind schnell, aber man findet dauernd „alte Steine“ |
| **Schneifeler** | Holz und Wald ergiebiger | Holzkohle, Köhlerei | Kurzer Sommer: Felder langsamer |

### 2.3 Gelände

| Typ | Herkunft (Pipeline) | Spiel |
|---|---|---|
| `wiese` | Grünland, Acker (ESA WorldCover) | Standard-Bauland, Felder |
| `wald` | Baumbedeckung | Holzfäller, Förster, Bienen |
| `heide` | Strauchland, OSM `natural=heath` | Schafe, Wacholder |
| `moor` | Feuchtgebiet, OSM `natural=wetland/bog`, Venn-Hochfläche | Torf; schlechtes Bauland |
| `stein` | kahler Fels, steile Hänge (> 22°), OSM `landuse=quarry` | Steinbruch, Felsen-Vorrat |
| `wasser` | Wasser, OSM-Gewässer | nicht bebaubar; Fischerei am Ufer |
| `siedlung` | bebaute Fläche, OSM-Orte | bestehende Orte: nicht bebaubar, Standorte für Dorfgründung |

Höhe kommt aus dem Copernicus GLO-30 DEM und ist **überhöht dargestellt** (Standard 2,5×, einstellbar 1–5×). Die Spiellogik rechnet mit echten Metern, die Überhöhung ist reine Optik.

### 2.4 Koordinaten

- Welt: Meter, `x` = Osten, `z` = Süden, `y` = Höhe. Höhenraster 30 m.
- Hex: pointy-top, axial `(q, r)`, gespeichert als odd-r-Offset. Hex (0,0) liegt bei `(√3·R/2, R)`.
- Spiellogik (Gebäude, Fahnen, Wege) arbeitet **nur auf Hexen**. Das Höhenraster ist feiner und dient der Optik und der Weg-Steigung.

---

## 3. Grundregeln

- Der Spieler baut Gebäude auf Hexen. Jedes Gebäude bekommt automatisch eine **Fahne vor dem Eingang**. Fahnen sind die Knoten des Wegenetzes.
- **Wege** verlaufen von Fahne zu Fahne (Segment). Menschen bewegen sich nur auf Wegen. Ausnahme sind beschwipste Boten (§10.3).
- Ein Gebäude ohne Wegverbindung zu einem Lager ist **getrennt** (⚠). Es produziert nichts und bekommt nichts geliefert.
- **Lager** sind der Dorfkern und später Lagerhäuser. Waren liegen dort oder sind unterwegs auf dem Netz. Nichts wird herbeigezaubert.

---

## 4. Logistik

### 4.1 Fahnen

- **Gebäude-Fahne:** automatisch, auf dem Gebäude-Hex (optisch vor dem Eingang).
- **Freie Fahne:** auf jedem freien Hex auf entdecktem Land, auch außerhalb des Gebiets (Feldwege).
- Benachbarte Fahnen sind erlaubt (ein Segment kann ein Hex lang sein).
- Stapel: bis **FLAG_CAP = 8** Waren, sichtbar gestapelt. Dazu kommen **2 Notplätze**, die nur Träger beim Tausch nutzen dürfen, nie Produzenten (§4.4).

### 4.2 Wege (Segmente)

- Bau: Taste `1` → Startfahne → Zielfahne. Die Vorschau zeigt die Route (Pfadsuche über freie, entdeckte Hexe, kein Wasser, keine Gebäude außer an den Endpunkten). Bestätigen mit Enter oder zweitem Klick, abbrechen mit Esc.
- Kosten: keine (ausgetretene Erdpfade). Starker Verkehr macht den Weg optisch breiter, ab Stufe 2 mit Pflaster.
- **Steigung zählt:** Die Laufzeit eines Segments hängt von Länge und Höhenunterschied ab (bergauf langsamer). So sind echte Täler spielerisch relevant.
- **Teilung:** Eine freie Fahne auf einem Segment teilt es in zwei Segmente mit je eigenem Träger.
- Wo ein Weg die Hecke kreuzt, entsteht automatisch ein **Gatter** (§7).

### 4.3 Träger

- Jedes Segment hat genau **einen Träger** aus dem Einwohnervorrat. Ist keiner frei, bleibt es unbesetzt, bis einer kommt.
- Er pendelt nur auf seinem Segment, trägt genau **1 Ware** und übergibt sie an der Fahne.
- **CARRIER_SPEED = 3 Hex/s** in der Ebene, mit Steigungsfaktor.

### 4.4 Routing ohne Stau-Tod

- **Distanz** ist die gewichtete Laufzeit im Fahnen-Graphen (Dijkstra). Sie wird pro Ziel-Fahne gecacht und bei jeder Netzänderung verworfen.
- **Monoton:** An Fahne F nimmt der Träger eine Ware nur mit, wenn das andere Ende O näher am Ziel ist und O sie annehmen kann. So gibt es keine Kreisfahrten.
- **Tausch:** Kommt ein Träger mit Ware an einer vollen Fahne an und liegt dort eine Ware für seine Rückrichtung, legt er ab und nimmt die andere im selben Schritt mit (Notplatz). Das löst die klassische Verklemmung zweier voller Fahnen.
- **Rückstau:** Produzenten liefern nur, wenn ihre Fahne unter FLAG_CAP liegt. So staut sich das Netz sichtbar, ohne zu platzen.
- **Reservierung:** Jedes Ziel zählt Waren, die schon unterwegs sind (`incoming`). Bedarf und Puffer rechnen mit `vorhanden + unterwegs`, es wird also nie doppelt geliefert.
- **Neu-Routing:** Wird ein Ziel ungültig (abgerissen, getrennt, voll), sucht die Ware an der nächsten Fahne ein neues Ziel.

### 4.5 Warenfluss

Zielwahl beim Einlagern an der Fahne:

1. Baustelle mit Bedarf (höchste Priorität, dann nächste)
2. Verarbeiter mit Platz im Input-Puffer
3. Nächstes Lager, das die Ware annimmt (Lager-Einstellung §9.3)

Lager-Auslieferung (Pull): Ein Abnehmer meldet Bedarf, und das nächste Lager mit Vorrat gibt die Ware frei.

### 4.6 Baustellen

- Beim Platzieren wird nichts abgezogen. Die Baustelle meldet Bedarf, und die Waren kommen einzeln.
- Der liefernde Träger verbaut die Ware selbst (**BUILD_ACTION = 0,4 s**).
- Fortschritt = verbautes Material / Gesamtbedarf und steuert die Bauphasen-Modelle (§11.4).
- Priorität 1–3 (Rechtsklick oder Gebäudefenster). Höher wird zuerst beliefert.
- Auf Fahnen-Hexen kann nicht gebaut werden.

### 4.7 Abriss

- **Gebäude:** Die Fahne bleibt als freie Fahne. Puffer-Inhalte und die Hälfte des verbauten Materials landen an der Fahne, soweit Platz ist. Der Rest ist „verloren gegangen“ (vermutlich gefunden worden).
- **Segment:** Der Träger geht zurück in den Vorrat. Eine getragene Ware legt er an der nächsten Fahne ab.
- **Freie Fahne:** Die anliegenden Segmente fallen weg, die Waren im Stapel sind verloren.

---

## 5. Bevölkerung und Nahrung

- **Einwohner** = freie Einwohner + Träger + Spezialisten (Finder, Boten).
- **Wohnraum:** Dorfkern 10, Eifeler Hütte 8. Die Bevölkerung wächst nur bis zum Wohnraum.
- **Wachstum braucht Nahrung.** Eine Hütte mit Nahrung im Input-Puffer (4 Plätze) bringt pro Zyklus einen neuen Einwohner hervor und verbraucht 1 Nahrung. Bessere Nahrung ergibt einen schnelleren Zyklus:

| Stufe | Waren | Zyklus |
|---|---|---|
| einfach | kartoffeln, aepfel, milch | 14 s |
| veredelt | kaese, bratkartoffeln, most, honig, fisch | 9 s |
| edel | bergkaese, doeppekooche, regionale Spezialität | 6 s |

- **Notnagel:** Sind weniger als 4 freie Einwohner da und es gibt keine Nahrung, kommt alle 30 s ein Zugezogener. So kann man sich nicht festfahren.
- Start: 10 Einwohner, 8 Kartoffeln im Lager.

---

## 6. Waren und Gebäude

### 6.1 Waren (`data/goods.json`)

| ID | Name | Gruppe |
|---|---|---|
| stamm | Eifeler Baumstamm | Grundstoff |
| bretter | Eifeler Bretterstapel | Grundstoff |
| stein | Eifeler Stein | Grundstoff |
| setzling | Buchensetzling | Grundstoff |
| milch | Eifeler Milch | Nahrung (einfach) |
| aepfel | Eifeler Äpfel | Nahrung (einfach) |
| kartoffeln | Eifeler Kartoffeln | Nahrung (einfach) |
| kaese | Eifeler Schafkäse | Nahrung (veredelt) |
| most | Eifeler Most | Nahrung (veredelt) |
| bratkartoffeln | Eifeler Bratkartoffeln | Nahrung (veredelt) |
| honig | Eifeler Waldhonig | Nahrung (veredelt) |
| bergkaese | Eifeler Bergkäse | Nahrung (edel) |

Spätere Waren: wolle, garn, tuch, torf, wacholder, schnaps, speck, doeppekooche, senfkorn, senf, fisch, schiefer, basalt, muehlstein sowie regionale Waren (§2.2).

### 6.2 Gebäude (`data/buildings.json`)

Kosten in Brettern (B) und Stein (S). Rate = Sekunden pro Einheit.

| ID | Name | Funktion | Rate | Terrain | Kosten |
|---|---|---|---|---|---|
| dorfkern | Dorfkern | Lager, Gebiet r = 4, Wohnraum 10 | – | wiese, heide | 4 B, 3 S (Dorfgründung, auch außerhalb des Gebiets) |
| huette | Eifeler Hütte | Wohnraum 8, Einwohner aus Nahrung | §5 | wiese, heide, wald, stein | 3 B, 2 S |
| hoelzfaeller | Holzfällerhütte | → stamm (Baum im Radius 2) | 4 s | wald, wiese | 2 B |
| foerster | Försterei | pflanzt Bäume (≤ 3/Hex) im Radius 2 | 6 s | wald, wiese | 1 B |
| saegewerk | Sägewerk | 1 stamm → 1 bretter | 4 s | wald, wiese | 2 B, 1 S |
| steinbruch | Steinbruch | → stein (Felsen im Radius 2, endlich) | 4 s | stein | 2 B |
| schafstall | Schafstall | → milch | 3 s | wiese, heide | 2 B, 1 S |
| obstwiese | Obstwiese | → aepfel | 4 s | wiese | 2 B |
| kartoffelfeld | Kartoffelfeld | → kartoffeln | 3 s | wiese, heide | 2 B |
| kaeserei | Käserei | 1 milch → kaese | 4 s | wiese, heide | 2 B, 1 S |
| mostkeller | Mostkeller | 2 aepfel → most | 5 s | wiese, heide | 2 B, 1 S |
| bratpfanne | Bratpfanne | 2 kartoffeln → bratkartoffeln | 4 s | wiese, heide | 2 B, 1 S |
| bienenstock | Bienenstock | → honig | 5 s | wald, wiese | 2 B, 1 S |
| reifekeller | Reifekeller | 1 kaese → bergkaese | 6 s | wiese, heide, stein | 3 B, 2 S |
| heckenhof | Heckenhof | Gebiet r = 3, Hecke wächst mit Setzlingen | – | wiese, heide | 2 B, 1 S |
| baumschule | Baumschule | → setzling | 8 s | wiese | 2 B |
| ausguck | Ausguck | Sichtradius 6, darf außerhalb stehen | – | wiese, stein, heide | 2 B, 2 S |
| kirmesplatz | Kirmesplatz | Ziel-Gebäude für die Kirmes (§10.1) | – | wiese | 4 B, 2 S |

Puffer: Output 6 (Kartoffelfeld 8), Input = Bedarf pro Zyklus × 2.
IDs sind ASCII (`hoelzfaeller`, `kaese`), Anzeigenamen mit Umlauten.

### 6.3 Warenketten

- 🪵 **Holz:** Bäume → Holzfäller → stamm → Sägewerk → bretter. Der Förster pflanzt nach, beide arbeiten im Radius 2.
- 🪨 **Stein:** Felsen (endlich, `state.rocks`) → Steinbruch → stein. Ist der Vorrat leer, ruht der Steinbruch.
- 🧀 **Käse:** Schafstall → milch → Käserei → kaese → Reifekeller → bergkaese
- 🍏 **Most:** Obstwiese → aepfel → Mostkeller (2:1) → most
- 🥔 **Kartoffel:** Kartoffelfeld → kartoffeln → Bratpfanne (2:1) → bratkartoffeln
- 🍯 **Honig:** Bienenstock → honig
- 🌱 **Hecke:** Baumschule → setzling → Heckenhof

---

## 7. Gebiet, Hecke, Dörfer

- **Gebiet** ist die Vereinigung der Hex-Kreise um fertige Gebietsgebäude: Dorfkern r = 4, Heckenhof r = 3.
- **Hecke:** Entlang der Gebietsgrenze entsteht automatisch eine Buchenhecke, typisch fürs Monschauer Heckenland. Sie durchläuft drei Stufen: Setzling (0) → niedrig (1) → hoch (2). Wo ein Weg die Hecke kreuzt, steht ein Gatter.
- **Gesichert:** Ein Hex ist bebaubar, wenn die Hecke seiner Gebietsquelle mindestens Stufe 1 hat. Altes Land bleibt bebaubar, während neue Hecke wächst.
- **Heckenhof:** steht nur auf gesichertem Gebiet. Seine Hecke wächst nur mit angelieferten Setzlingen (1 Setzling pro 4 Kanten und Stufe). Das Land wächst so in Ringen, ohne Sprünge.
- **Start-Hecke** des ersten Dorfkerns: kostenlos und schon voll gewachsen.
- **Wasser** ist eine natürliche Grenze, dort endet die Hecke am Ufer.
- **Schrumpft das Gebiet**, verdorrt die überzählige Hecke langsam.
- **Dörfer:** Dorfkern (Lager + Gebiet) + Hütten + Hecke. Mehrere Dörfer sind möglich, verbunden über Feldwege außerhalb der Hecken.
- **Bestehende Orte** (`siedlung`) sind nicht bebaubar. Wer neben einem echten Ort ein Dorf gründet, bekommt dessen Namen und einen kleinen Bonus („Zugezogene aus Einruhr“).
- Konstanten: HEDGE_GROW_TIME 8 s/Stufe, HEDGE_WITHER_TIME 6 s/Stufe.

---

## 8. Erkundung

- **Nebel:** Entdeckt sind nur die Hexe im Sichtradius von Fahnen (freie Fahne 1, Gebäude-Fahne 3, Ausguck 6). Einmal entdeckt bleibt entdeckt.
- Gebäude, Fahnen und Wege nur auf entdecktem Land. Gebiets-Hexe sind immer entdeckt.
- Unentdecktes Land wird als **Kartenpapier-Optik** gezeichnet (Höhenlinien auf Pergament), nicht als schwarzes Loch. Der Rand löst sich weich auf.
- **Minimap:** Gelände mit Hillshade, Gebäude, Kamera-Ausschnitt, Nebel. Ein Klick springt dorthin, Taste M blendet sie ein und aus.

---

## 9. Bedienung und Oberfläche

### 9.1 Grundsätze

- HTML/CSS-Overlay über dem Canvas mit einem gemeinsamen Fenster-System: verschiebbar, anpinnbar, Esc schließt das oberste Fenster, Live-Daten 4× pro Sekunde.
- **Stil:** dunkles Holz und Schiefer, Messing- und Goldakzente, Alegreya SC für Titel, Alegreya Sans für Text.
- **Icons** werden aus den 3D-Modellen gerendert (gleiches Licht, gleiche Palette), damit Welt und UI aus einem Guss sind.
- Datengetrieben: Gebäudefenster ergeben sich aus `buildings.json`, ohne gebäudespezifischen Code.
- UI-Skalierung 80–150 %, Tastenbelegung frei wählbar, Farbenblind-Modus für Warenfarben.

### 9.2 Fenster

- **Baumenü** mit Gruppen-Tabs (Grundstoffe, Nahrung, Handwerk, Gebiet & Erkundung, Finderei, Prestige). Tooltips zeigen Kosten, Input → Output und Flavortext. Gesperrte Gebäude mit Begründung.
- **Bauvorschau:** Geistermodell am Cursor, grüne oder rote Hex-Umrandung, Fahne und Wegvorschlag gleich mit angezeigt.
- **Gebäudefenster:** Zustand in Klartext („Wartet auf Stämme“), Puffer, Fortschritt, Produktivität, Knöpfe für Pause, Kamera und Abriss.
- **Fahnen- und Trägerfenster:** Stapel mit Zielen, angeschlossene Segmente.
- **Lagerfenster:** Bestand nach Kategorie. Pro Ware „normal“, „nicht einlagern“ oder „auslagern“.
- **Warenübersicht** (W), **Statistik** (S), **Ereignisprotokoll** (L), **Einstellungen** (Esc).
- **Meldungen** am rechten Rand, zusammengefasst („3× Fahne voll“). Ein Klick springt zum Ort.

### 9.3 Spielsteuerung

- Kamera: WASD/Pfeile bzw. rechte Maustaste ziehen = verschieben, Q/E bzw. mittlere Maustaste = drehen, Mausrad = Zoom (nah flacher, fern steiler).
- Spieltempo: Pause (Leertaste), 1×, 2×, 3×.

---

## 10. Ziele, Finderei, Feste

### 10.1 Kirmes (Fortschritt)

Jedes Dorf wächst über **Kirmes-Stufen**. Man baut einen Kirmesplatz und liefert eine Warenliste. Ist sie erfüllt, wird gefeiert: Musik, Fahnen, Feuerwerk, eine neue Dorfstufe und Freischaltungen.

| Stufe | Liefern (Startwerte) | Ergebnis |
|---|---|---|
| Weiler → Dorf | 10 bratkartoffeln, 10 most, 5 kaese | Reifekeller, Heckenhof, Ausguck, Dorfgründung |
| Dorf → Kirchdorf | 10 bergkaese, 15 honig, 10 tuch/Regionalware | Regionale Spezialkette, Schänke |
| Kirchdorf → Marktflecken | Regionale Spezialität + Mischkorb | Finderei, Nachbarschaft |

### 10.2 Finderei und Nachbarn

- **Flachländer-Dörfer** (KI-Nachbarn) liegen am Kartenrand, sie sind echte größere Orte. Jedes hat ein Lager und eine Wachsamkeit.
- **Finderhütte** schickt Finder über das Wegenetz in Nachbardörfer. Sie bringen Funde mit oder werden erwischt und müssen dann in die **Ausredenstube**.
- **Fundbüro** wertet Funde auf, die **Schatzhöhle** sichert große Funde.
- **Spielziel einer Region:** „Der Große Fund“. Teile eines seltenen Objekts aus mehreren Nachbardörfern finden, im Fundbüro zusammenführen und in der Schatzhöhle sichern.

### 10.3 Schänke und beschwipste Boten

- Die Schänke schenkt Schnaps aus. Wer welchen bekommt, wird ein **Bote**. Das ist eine eigene Einheit, kein Segment-Träger.
- Boten laufen **querfeldein** auf direktem Weg (Express zwischen Lager und Abnehmer). Sie torkeln im Zickzack, machen Nickerchen unter Bäumen, verlaufen sich und lassen manchmal Waren fallen (die dann liegen bleiben und eingesammelt werden).
- Beschwipste Finder kommen ohne Weg in Nachbardörfer, werden aber leichter erwischt, weil sie singen.
- Ein Regler in der Schänke bestimmt, wie viel Schnaps an Boten und wie viel an Finder geht. Alle Werte stehen in `data/*.json`.

---

## 11. Art Direction und Technik

### 11.1 Look

- **Stil:** stilisiertes Low-Poly-Diorama. Referenzen: Townscaper, Dorfromantik, Anno 1800 (Licht), Bad North (Klarheit).
- **Gelände:** echtes Relief, überhöht. Weiche Farbverläufe je Bedeckung, Ackerstreifen, Fels an Steilhängen, Mulden dunkler (eingebackene Verschattung), feine Bodenstruktur im Shader. Das Hex-Raster erscheint nur im Baumodus.
- **Wasser:** Spiegel auf Talsperren-Höhe, Tiefenfarbe, Ufer-Schaum, Wellen, Himmelsreflexion. Später Fluss-Strömung entlang der Rur.
- **Vegetation:** Fichten (Höhenlagen, Venn) und Buchen (Täler), per Instancing, mit Wind. Hecken als durchgehende Buchenstreifen. Heide mit lila Blüten, Moor mit Wollgras und Bohlenwegen.
- **Gebäude:** Eifeler Bauweise mit schwarz-weißem Fachwerk, Bruchsteinsockel und Schieferdach. Monschau im Fachwerk-Stil, Vulkaneifel mit Basalt, Südeifel mit Sandstein. Jedes Gebäude hat eine Arbeitsanimation (Rauch, Sägeblatt, Schafe, Bienen).
- **Figuren:** Low-Poly-Eifeler mit prozeduraler Laufanimation (Wippen, Armschwung). Die Ware ist sichtbar auf Schulter oder Rücken. Berufe erkennt man an den Hüten.
- **Licht und Atmosphäre:** Sonne mit weichen Schatten, Himmelslicht, Dunst in der Ferne, ACES-Tonemapping. Später kommen dazu: Umgebungsverdeckung (SSAO), dezentes Bloom, Tageszeiten, Wetter (Eifel-Nebel in den Tälern, Regen, Wolkenschatten).
- **Rückmeldung (Juice):** Staubwolke bei Baufertigstellung, Fähnchen bei der Kirmes, aufsteigende Zahlen, Geräusche bei jeder Aktion.
- **Audio:** Ambiente-Ebenen (Wind, Vögel, Bach, Schafe), räumliche Gebäude-Geräusche, Folk-Musik (Akkordeon, Geige). Nur CC0- oder selbst lizenziertes Material.

### 11.2 Technik

- **Stack:** TypeScript, Vite, Three.js (WebGL2, WebGPU später möglich). UI als HTML/CSS. Tests mit Playwright (Headless-Chromium) für Screenshots und Smoke-Tests.
- **Trennung:** `src/sim/` (reine Spiellogik, ohne Three.js, deterministisch), `src/render/` (Darstellung, liest den State), `src/ui/`, `src/map/`.
- **Feste Simulationsschritte:** 20 Ticks/s. Die Darstellung interpoliert. Spieltempo bedeutet mehrere Ticks pro Frame. Gleiche Eingaben ergeben das gleiche Ergebnis, was für Speichern, Tests und Bug-Nachstellung wichtig ist.
- **Speicherbarkeit von Anfang an:** Der State ist ein serialisierbares Objekt (Maps als Arrays) mit Versionsfeld.
- **Performance-Budget:** 60 fps bei 1080p auf einer mittleren integrierten GPU (Qualitätsstufe „Mittel“), höchstens 500 Draw-Calls, Frame-CPU unter 8 ms.
  - Gelände in Chunks (64 × 64 Zellen) mit 4 LOD-Stufen und Schürzen gegen Risse
  - Bäume und Häuser per Instancing je Chunk, nah detailliert mit Schatten, fern als Silhouette
  - Schatten-Ausschnitt folgt der Kamera, Leistungsanzeige mit F3
- **Qualitätsstufen:** Niedrig, Mittel, Hoch, Ultra (Schatten, Baumdichte, LOD-Abstände, Post-Processing).

### 11.3 Karten-Pipeline (`tools/map/`)

- Quellen:
  - Copernicus GLO-30 DEM (Höhe, DSM: Baumkronen werden herausgerechnet)
  - ESA WorldCover 2021 (Bedeckung, 10 m)
  - OpenStreetMap (Gewässer inkl. Bäche, Heide, Moor, Steinbrüche, Orte mit Namen, Straßen als Hinweis)
- Ausgabe je Region `public/maps/<id>/`: `map.json` (Metadaten, Orte, Credits), `height.bin` (Uint16 dm), `cover.bin`, `water.bin`, `hex.bin`.
- Seen und Talsperren bekommen einen ebenen Spiegel und einen abgesenkten Grund. Ufer-Zellen liegen über dem Spiegel, damit die Uferlinie sauber wird.
- Credits im Spiel und im Menü: „Copernicus GLO-30 © DLR/Airbus, EU/ESA“, „ESA WorldCover © ESA, CC BY 4.0“, „Kartendaten © OpenStreetMap-Mitwirkende (ODbL)“.

### 11.4 Modelle

- Gebäude werden **prozedural in TypeScript** aus Bauteilen (Box, Prisma, Zylinder, Kegel) erzeugt. Jedes Teil gehört zu einer Bauphase: p1 Fundament, p2 Gerüst und Wände, p3 Dach und Details.
- Eine gemeinsame Farbpalette pro Region (Fachwerk, Basalt, Sandstein). Alle Teile eines Gebäudes werden zu einer Geometrie verschmolzen, damit es wenige Draw-Calls gibt.
- Später können Hero-Modelle als glTF ersetzt werden, ohne dass sich die Spiellogik ändert.

---

## 12. Konstanten

| Konstante | Wert | Ort |
|---|---|---|
| Hex-Größe (Umkreisradius) | 90 m | map.json |
| Höhenraster | 30 m | map.json |
| Überhöhung (Standard) | 2,5× | map.json / Einstellungen |
| Simulations-Takt | 20 Ticks/s | sim |
| FLAG_CAP | 8 (+2 Notplätze) | sim |
| CARRIER_SPEED | 3 Hex/s (eben) | sim |
| BUILD_ACTION | 0,4 s | sim |
| TREE_MAX | 3 pro Hex | sim |
| Start | 12 bretter, 8 stein, 8 kartoffeln, 10 Einwohner | regions.json |
| HEDGE_GROW / WITHER | 8 s / 6 s pro Stufe | sim |
| Sichtradius freie Fahne / Gebäude / Ausguck | 1 / 3 / 6 | buildings.json |
