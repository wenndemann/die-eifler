// Noten aus data/klang.json lesen (rein, ohne WebAudio; getestet in tests/klang.test.ts).
// Schreibweise: „G4:2“ = Note G in Oktave 4, zwei Achtel; „Bb5“ mit b, „F#4“ mit #; „-:2“ Pause. Bass: eine Note je Schlag.

const STUFE: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** Frequenz in Hz zur Note („A4“ = 440), null bei Pause oder Unsinn. */
export function frequenz(note: string): number | null {
  const m = /^([A-G])([#b]?)(-?\d)$/.exec(note.trim());
  if (!m) return null;
  const halbton = STUFE[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + (Number(m[3]) + 1) * 12;
  return 440 * Math.pow(2, (halbton - 69) / 12);
}

export interface Ton { hz: number | null; achtel: number }

/** Melodie als Folge von Tönen (Pausen mit hz null). */
export function leseMelodie(text: string): Ton[] {
  return text.trim().split(/\s+/).filter(Boolean).map((t) => {
    const [n, l] = t.split(':');
    return { hz: n === '-' ? null : frequenz(n), achtel: Math.max(1, Number(l) || 1) };
  });
}

/** Bass: eine Note je Schlag (Viertel). */
export function leseBass(text: string): (number | null)[] {
  return text.trim().split(/\s+/).filter(Boolean).map((n) => (n === '-' ? null : frequenz(n)));
}

/** Länge einer Melodie in Achteln. */
export function laengeAchtel(m: readonly Ton[]): number {
  return m.reduce((s, t) => s + t.achtel, 0);
}

/** Vokale eines Worts in Reihenfolge (für das Gebrabbel), mindestens einer. */
export function vokaleVon(wort: string, bekannt: readonly string[]): string[] {
  const v = [...wort.toLowerCase()].filter((c) => bekannt.includes(c));
  return v.length ? v : [bekannt[0]];
}
