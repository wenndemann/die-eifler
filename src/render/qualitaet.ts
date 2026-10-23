// Qualitätsstufen (Einstellungsfenster: Niedrig / Mittel / Hoch). Eine Tabelle, die Bühne, Gelände und Wald lesen.
// Standard ist Mittel, am Handy (grober Zeiger) Niedrig.

export type Qualitaet = 'niedrig' | 'mittel' | 'hoch';
export const QUALITAETEN: Qualitaet[] = ['niedrig', 'mittel', 'hoch'];
export const QUALITAET_NAME: Record<Qualitaet, string> = { niedrig: 'Niedrig', mittel: 'Mittel', hoch: 'Hoch' };

export interface QualiParam {
  /** Obergrenze des Pixelverhältnisses (min mit devicePixelRatio). */
  pixel: number;
  /** Kantenlänge der Schattenkarte (Pixel). */
  schattenKarte: number;
  /** Größte Halbbreite des Schattenfensters (m) – die Reichweite der Schatten. */
  schattenReichweite: number;
  /** Bäume mit Einzelheiten (und Schatten) bis zu diesem Abstand (m). */
  baumNah: number;
  /** Anteil der Bäume, der im Nahbereich gezeichnet wird (0..1). */
  baumDichteNah: number;
  /** Anteil der Bäume in der Ferne (die einzelnen Silhouetten). */
  baumDichteFern: number;
  /** Faktor auf die Abstände der Gelände-Detailstufen (kleiner = früher grob). */
  lod: number;
  /** M12 Nachbearbeitung: weiche Verdeckung (0..1) und Leuchten heller Stellen (0..1). */
  ao: number;
  glanz: number;
  /** Lebendige Eifel: weiches Leuchten heller Stellen (Fensterlicht, Feuer, Sonne auf Wasser) 0..1, aus auf „Niedrig“. */
  leuchten: number;
}

export const QUALI: Record<Qualitaet, QualiParam> = {
  niedrig: { pixel: 1, schattenKarte: 1024, schattenReichweite: 3500, baumNah: 1400, baumDichteNah: 0.55, baumDichteFern: 0.35, lod: 0.65, ao: 0, glanz: 0, leuchten: 0 },
  mittel: { pixel: 1.5, schattenKarte: 2048, schattenReichweite: 5500, baumNah: 2400, baumDichteNah: 0.85, baumDichteFern: 0.6, lod: 1, ao: 0.6, glanz: 0, leuchten: 0.7 },
  hoch: { pixel: 2, schattenKarte: 4096, schattenReichweite: 9000, baumNah: 3400, baumDichteNah: 1, baumDichteFern: 1, lod: 1.25, ao: 1, glanz: 1, leuchten: 1 },
};

export const SETTINGS_KEY = 'eifeler.view';

export function istHandy(): boolean {
  try { return matchMedia('(pointer: coarse)').matches; } catch { return false; }
}

export function standardQualitaet(): Qualitaet {
  return istHandy() ? 'niedrig' : 'mittel';
}

/** Gespeicherte Stufe (gleicher Speicher wie die übrigen Ansichts-Einstellungen) oder der Standard. */
export function gespeicherteQualitaet(): Qualitaet {
  try {
    const q = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}').quality;
    if (QUALITAETEN.includes(q)) return q;
  } catch { /* egal */ }
  return standardQualitaet();
}
