// Spiel-Maßstab (Drehbuch 3, ROADMAP M1). Alle Größenfaktoren an einer Stelle, damit Häuser,
// Bäume und Maßstabs-Probe (mockup.ts) zusammenpassen.

/** Gebäude in etwa 3-facher echter Größe (Drehbuch 3): so sind sie aus der Spielansicht lesbar.
 *  Ein Hofhaus (14 × 9 m echt, also 42 × 27 m im Spiel) füllt ein 60-m-Hex (104 m breit) gut aus,
 *  daneben bleibt Platz für Nebengebäude und Wege. */
export const HAUS_SKALE = 3;

/** Bäume in rund 1,6-facher echter Größe (Geometrie ist in echten Metern gebaut): neben 3×-Häusern
 *  wirken sie nicht wie Gras, ein Wald bleibt trotzdem keine Mauer. */
export const BAUM_SKALE = 1.6;

/** Die Kronen decken mit BAUM_SKALE etwa das 2,6-fache an Fläche. Damit der Wald nicht dichter wird
 *  (und die Zahl der Instanzen nicht steigt), sinkt die Dichte um etwa diesen Faktor. */
export const BAUM_DICHTE = 1.6 / (BAUM_SKALE * BAUM_SKALE);

/** Ortskern-Häuser: Anzahl je Ortskern-Hex (Hauptbau immer, Nebenbau mit dieser Wahrscheinlichkeit). */
export const NEBENBAU_P: Record<string, number> = { stadt: 0.7, dorf: 0.5, weiler: 0.3 };
/** Nachbar-Hexe eines Ortskerns bekommen mit dieser Wahrscheinlichkeit ein Haus (Stadt dichter als Dorf). */
export const NACHBAR_P: Record<string, number> = { stadt: 0.45, dorf: 0.2, weiler: 0 };
