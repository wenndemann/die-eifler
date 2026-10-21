// Wetter und Tageszeit für die Optik (M12, Drehbuch 7.4): aus Spieltick und Wetter der Simulation die Stärken für Regen, Schnee,
// Talnebel, Wind und Hochwasser sowie die Stimmung der Bühne. Reine Funktion, nur Darstellung; Zahlen aus data/optik.json.
import optik from '../../data/optik.json';
import { JAHRESZEIT_TICKS, WETTER } from '../sim/daten';
import { TICK_HZ, type SichtJahr } from '../sim/typen';
import type { Stimmung } from '../render/scene';
import type { WetterLage } from '../render/wetter';

/** Länge eines Tages in Ticks (läuft mit dem Spieltempo). */
export const TAG_TICKS = optik.tag.tag_min * 60 * TICK_HZ;

/** Tageszeit 0..1 zum (gleitenden) Tick: 0 Mitternacht, 0.5 Mittag; das Spiel beginnt am Vormittag. */
export function tageszeit(tick: number): number {
  const t = optik.tag.start + tick / TAG_TICKS;
  return t - Math.floor(t);
}

/** Stunde (0..23) zur Tageszeit, für die Anzeige. */
export function stunde(tag: number): number {
  return Math.floor(tag * 24) % 24;
}

export function wetterStimmung(tick: number, j: SichtJahr): { lage: WetterLage; stimmung: Stimmung } {
  const an = new Set(j.wetter.map((w) => WETTER[w.art]?.id));
  const tag = tageszeit(tick);
  const winter = j.jahreszeit === 3;
  const seit = JAHRESZEIT_TICKS - j.rest;
  const nass = an.has('regen') ? 1 : an.has('hochwasser') ? 0.6 : 0;
  // Im Winter fällt Schnee statt Regen: kräftig, solange die Decke wächst (wie setzeSchnee), danach ab und zu leicht
  const schnee = winter ? Math.max(nass, seit < 90 * TICK_HZ ? 1 : optik.schnee.winter_anteil) : 0;
  const regen = winter ? 0 : nass;
  const morgen = tag > 0.2 && tag < 0.36 ? 1 - Math.abs(tag - 0.28) / 0.08 : 0;
  const nebel = an.has('talnebel') ? 1 : j.jahreszeit === 2 ? optik.talnebel.morgen_herbst * Math.max(0, morgen) : 0;
  const wind = an.has('wind') ? 1 : 0;
  const hochwasser = an.has('hochwasser') ? 1 : 0;
  const duerre = an.has('duerre') ? 1 : 0;
  const wolken = Math.min(1, Math.max(regen, schnee * 0.8, nebel * 0.5, wind * 0.4, hochwasser * 0.7));
  return {
    lage: { regen, schnee, nebel, wind, hochwasser, wolken },
    stimmung: { tag, nachtLicht: optik.tag.nacht_licht, wolken, duerre },
  };
}
