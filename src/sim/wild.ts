// Wald und Wild (data/wild.json): Zahlen der Simulation in Ticks und Ganzzahlen. Das Wild lebt je Hex wie der Wald (sim.ts).
import { TICK_HZ } from './typen';
import wildJson from '../../data/wild.json';

const J = wildJson as {
  takt_s: number; wald_min: number; max_je_hex: number;
  start_prozent: { reh: number; sau: number }; nachwuchs_prozent: { reh: number; sau: number };
  wildschaden: { radius: number; prozent: number };
  wolf: { start_promille: number; wandert_prozent: number; radius: number; riss_prozent: number; ausfall_s: number };
  wildkatze: { start_promille: number; wandert_prozent: number; takt_s: number; punkte: number; max_punkte: number };
};
const sek = (s: number) => Math.max(1, Math.round(s * TICK_HZ));

/** Alle so viele Ticks: Nachwuchs, Umzug, Wildschaden, Wolf und Wildkatze ziehen. */
export const WILD_TAKT = sek(J.takt_s);
/** Wild lebt nur auf Hexen mit mindestens so vielen ausgewachsenen Bäumen. */
export const WILD_WALD = J.wald_min;
/** Höchstens so viele Rehe bzw. Wildschweine je Hex. */
export const WILD_MAX = J.max_je_hex;
export const WILD_START = J.start_prozent;
export const WILD_NACHWUCHS = J.nachwuchs_prozent;
export const SAU_RADIUS = J.wildschaden.radius;
export const SAU_PROZENT = J.wildschaden.prozent;
export const WOLF_START = J.wolf.start_promille;
export const WOLF_WANDERT = J.wolf.wandert_prozent;
export const WOLF_RADIUS = J.wolf.radius;
export const WOLF_RISS = J.wolf.riss_prozent;
export const WOLF_AUSFALL = sek(J.wolf.ausfall_s);
export const KATZE_START = J.wildkatze.start_promille;
export const KATZE_WANDERT = J.wildkatze.wandert_prozent;
export const KATZE_TAKT = sek(J.wildkatze.takt_s);
export const KATZE_PUNKTE = J.wildkatze.punkte;
export const KATZE_MAX = J.wildkatze.max_punkte;
