# Stil-Leitfaden – Die Eifeler

Verbindlich für alle Modelle, Figuren, Waren und die Oberfläche (Drehbuch 7, ROADMAP M9). Gewählt nach der Stilprobe
(`tools/stilprobe/`, `?v=m`): **Wimmelbuch kräftig mit Linie** – ein Bilderbuch-Diorama mit viel Leben, satten Farben und einer
feinen braunen Linie. Siedler 2 liefert die Lesbarkeit und den Maßstab, der Comic die Übertreibung, das Wimmelbuch den Kleinkram.

## 1. Formen

- **Rund statt kantig.** Große Quader haben weich gebrochene Kanten (`weicheKiste` in `src/render/mockup.ts`), Kugeln, Zylinder,
  Kegel und Baumkronen sind weich schattiert. Nur dünne Teile (Balken, Leisten, Stäbe) bleiben scharf.
- **Leicht schief.** Jedes Gebäude neigt sich um bis zu 3 % (fest je Typ), Dachfirste und Fensterläden dürfen schief sitzen.
  Nie so schief, dass es kaputt aussieht.
- **Übertrieben, aber lesbar.** Gebäude in etwa 3× echter Größe (Drehbuch 3), Dächer mit kräftigem Überstand, Schornsteine mit
  Rauchwölkchen. Was ein Gebäude tut, sieht man von außen (Fässer an der Brauerei, Käseregal an der Käserei).

## 2. Figuren

- Knubbelig wie Siedler 2, Gesichter wie im Comic: **großer Kopf** (Faktor 1,2), **runder Bauch** (1,12), krumme Beine, dicke
  Knollennase, Augen mit Pupille, Brauen, Schnauzer, Kappe mit Bommel (`KOPF`, `BAUCH` in `src/render/traeger.ts`).
- Tracht und Farbe je Völkchen (M11); Berufe an Hemd und Werkzeug erkennbar.
- **Betrunkene sofort erkennbar:** rote Nase und Wangen, schiefe Mütze, Flasche unterm Arm, Schlagseite, Hicks-Bläschen (Drehbuch 7.1).

## 3. Farben

- **Satt und warm**, nie grau. Der Bilderbuch-Pass hebt die Sättigung um 28 % und wärmt leicht (`BUCH` in `src/render/buchpass.ts`).
- **Gemalter Verlauf je Teil:** unten 80 %, oben 106 % Helligkeit, dazu ein leichtes Pinsel-Flimmern (`MAL_*` in `mockup.ts`).
- Palette (Grundtöne, sRGB):

  | Wofür | Farbe |
  |---|---|
  | Wiese | `#93b85e` |
  | Acker | `#c9b06a` |
  | Waldboden | `#4a6a3a` |
  | Buche | `#6f9a48`, `#7aa652` |
  | Fichte | `#2f5a3a` … `#3b6a46` |
  | Gefache (Putz) | `#f6e6cf` |
  | Fachwerkbalken | `#5a3a26` |
  | Ziegeldach | `#b0563e`, `#c96a52` |
  | Schieferdach | `#5f7090` |
  | Sockel, Bruchstein | `#a39a8c` |
  | Fensterläden | grün `#2f7a55`, blau `#3b5a78`, rot `#c8402e` |
  | Linie | `#4a2e1c` |

- Regionale Baustoffe (M11): Buntsandstein rot an der Rur, Basalt dunkel in der Vulkaneifel, Schiefer im Ösling – immer in der
  warmen, satten Lesart dieser Palette.

## 4. Linie

- **Feine braune Linie** um alle Formen wie in einem gezeichneten Bilderbuch: aus Tiefensprüngen im Bilderbuch-Pass, etwa 1 Pixel,
  zur Ferne hin zarter. Keine schwarzen Comic-Umrisse.
- **Keine Unschärfe, kein Papierkorn** (stören beim Bauen).

## 5. Licht

- Warme Sonne (`#ffe4bc`) aus Westnordwest, mittlere Höhe; Himmel kühl, Boden warm (Halbkugellicht `#cfe3f2` / `#8a7350`), dazu
  ein schwaches warmes Gegenlicht für runde Formen. Weiche Schatten.
- Dunst hell und warm (`#d3dccf`), Winter mit Schnee (Drehbuch 7.4), Wetter-Optik in M12.

## 6. Wimmel-Kleinkram

- Jedes fertige Gebäude bekommt Leben dazu: Hühner und Wäscheleine am Wohnhaus, Brunnen und Hühner am Lager, Vogelscheuche auf
  großen Feldern, Blumen überall (`kleinkram()` in `src/render/gebaeude.ts`). Mehr Kleinkram folgt mit den Feinschliff-Runden
  der Gutachter.
- Kleinkram ist Schmuck, nie Spielzustand, und darf Wege und Fahnen nicht verdecken.

## 7. Oberfläche

- Fenster und Leisten in warmem Dunkelbraun mit Pergament-Schrift (bestehend seit M7), Icons aus den 3D-Modellen; sie folgen dem
  Stil automatisch.

## 8. Prüfen

- **Bildstrecke** (`node tools/bildstrecke.mjs`): feste Kameras, feste Saat – Übersicht, Dorf, Gebäude, Figuren, Waren,
  Fenster, Winter, Fest, Bildfolge eines laufenden Trägers.
- **Gutachter-Agenten** benoten die Bildstrecke nach dem Bogen unten (je 1–10 mit Begründung), 5 unabhängig, einer gezielt kritisch,
  dazu der Vergleich mit der vorigen Version. Abnahme: 4 von 5 „Stilziel erreicht“, kein Punkt unter 7, die neue Version gewinnt.
  Ergebnisse stehen in `test-results/gutachten/` und als Zusammenfassung im PR.
- Bewertungsbogen: (1) Siedler-Comic-Wimmelbuch-Mischung, (2) Figuren, (3) Gebäude, (4) Waren lesbar, (5) Einheitlichkeit,
  (6) Licht und Farbe, (7) Linie, (8) Oberfläche.
- Leistung: das Budget aus M1 bleibt (F3 zeigt Draw-Calls und Dreiecke).
