// Der Mai (ROADMAP M14): Zahlen aus data/mai.json in Ticks und Warenlisten. Die Regeln selbst stehen in sim.ts (Abschnitt „Der Mai“).
import mai from '../../data/mai.json';
import { WARE, WAREN } from './daten';
import { TICK_HZ } from './typen';

const s = (x: number) => Math.round(x * TICK_HZ);
function liste(m: Record<string, number>): number[] {
  const a = new Array<number>(WAREN.length).fill(0);
  for (const [id, n] of Object.entries(m)) {
    if (WARE[id] === undefined) throw new Error(`Unbekannte Ware "${id}" in data/mai.json`);
    a[WARE[id]] = Math.floor(n);
  }
  return a;
}

/** Mainacht: Beginn (Ticks nach Frühjahrsbeginn), Dauer, Ankündigung vorher. */
export const MAI_AB = s(mai.mainacht.ab_s);
export const MAI_DAUER = s(mai.mainacht.dauer_s);
export const MAI_ANKUENDIGUNG = s(mai.mainacht.ankuendigung_s);
/** Junggesellenverein: höchstens so viele Maijungen, je einer alle MAI_TAKT Ticks aus Bewohner + Landbier. */
export const MAI_MAX = mai.verein.max;
export const MAI_TAKT = s(mai.verein.takt_s);
export const MAI_BIER = mai.verein.bier;
/** Maibaum: Waren, Maijungen zum Stellen, Punkte. */
export const MAIBAUM_WAREN = liste(mai.maibaum.waren);
export const MAIBAUM_STELLEN = mai.maibaum.stellen;
export const MAI_PUNKTE_STEHT = mai.maibaum.punkte_steht;
export const MAI_MAIFEST_BONUS = mai.maibaum.maifest_bonus;
/** Klau und Abwehr. */
export const MAI_KLAU_MIN = mai.klau.min;
export const MAI_PUNKTE_KLAU = mai.klau.punkte_klau;
export const MAI_PUNKTE_ABWEHR = mai.klau.punkte_abwehr;
export const MAI_BIER_JE_JUNGE = mai.klau.bier_je_junge;
export const MAI_TORKELN_PROZENT = mai.klau.torkeln_prozent;
export const MAI_ORT_WACHE = mai.klau.wache_prozent;
export const MAI_AUSLOESE = liste(mai.ausloese);
/** Mailehen: Zuzug am Ende der Mainacht. */
export const MAI_LEHEN_ZUZUG = mai.mailehen.zuzug;
export const MAI_LEHEN_MIN = mai.mailehen.min;
/** Burschen aus den Nachbarorten. */
export const MAI_FREMDE_CHANCE = mai.fremde.chance_prozent;
export const MAI_FREMDE_N = mai.fremde.n;
export const MAI_FREMDE_VERZUG = s(mai.fremde.verzug_s);
