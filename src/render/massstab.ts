// Spiel-Maßstab (Drehbuch 3, ROADMAP M1). Alle Größenfaktoren an einer Stelle, damit Häuser,
// Bäume und Maßstabs-Probe (mockup.ts) zusammenpassen.

/** Gebäude in etwa 3-facher echter Größe (Drehbuch 3): so sind sie aus der Spielansicht lesbar.
 *  Ein Hofhaus (14 × 9 m echt, also 42 × 27 m im Spiel) füllt ein 60-m-Hex (104 m breit) gut aus,
 *  daneben bleibt Platz für Nebengebäude und Wege. */
export const HAUS_SKALE = 3.4;

/** Bäume in rund 1,6-facher echter Größe (Geometrie ist in echten Metern gebaut): neben 3×-Häusern
 *  wirken sie nicht wie Gras, ein Wald bleibt trotzdem keine Mauer. */
export const BAUM_SKALE = 1.3;

/** Die Kronen decken mit BAUM_SKALE etwa das 2,6-fache an Fläche. Damit der Wald nicht dichter wird
 *  (und die Zahl der Instanzen nicht steigt), sinkt die Dichte um etwa diesen Faktor. */
export const BAUM_DICHTE = 0.8;

/** Ortskern-Häuser: Anzahl je Ortskern-Hex (Hauptbau immer, Nebenbau mit dieser Wahrscheinlichkeit). */
export const NEBENBAU_P: Record<string, number> = { stadt: 0.7, dorf: 0.5, weiler: 0.3 };
/** Nachbar-Hexe eines Ortskerns bekommen mit dieser Wahrscheinlichkeit ein Haus (Stadt dichter als Dorf). */
export const NACHBAR_P: Record<string, number> = { stadt: 0.45, dorf: 0.2, weiler: 0 };

// ---- Spielfiguren und Waren (M3). Alles in Metern im Spiel (nicht „echt“): bei 400 bis 1500 m Kameraabstand
// müssen Figuren und Waren lesbar sein, deshalb deutlich übertrieben.

/** Höhe eines Trägers samt Kappe in Metern (Richtwert 8–12 m, per Screenshot auf 13 abgestimmt). */
export const TRAEGER_H = 17.5;
/** Kantenlänge einer Ware (Würfel-Äquivalent) in Metern. */
export const WARE_M = 5.5;
/** Höhe der Fahnenstange in Metern. */
export const FAHNE_H = 21;
/** Breite eines Erdpfads in Metern (Mindestverkehr / Höchstverkehr). */
export const WEG_BREITE: readonly [number, number] = [8, 14];
/** Mit wachsendem Kameraabstand werden Figuren, Waren und Fahnen bis zu diesem Faktor größer (Lesbarkeit von weit weg). */
export const FERN_MAX = 2.4;
/** Ab diesem Kameraabstand (m) beginnt die Vergrößerung; bei FERN_ENDE ist FERN_MAX erreicht. */
export const FERN_START = 450, FERN_ENDE = 2200;

/** Vergrößerungsfaktor für Figuren/Waren/Fahnen bei Kameraabstand d (m). */
export function fernFaktor(d: number): number {
  const t = Math.min(1, Math.max(0, (d - FERN_START) / (FERN_ENDE - FERN_START)));
  return 1 + (FERN_MAX - 1) * t;
}
