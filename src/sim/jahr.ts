// Jahreszeiten und Wetter (Drehbuch 7.4; data/jahr.json). Alles folgt allein aus Tick und Saat: Jahreszeit, Spieljahr und der
// Wetterplan jeder Jahreszeit. Im Mehrspieler rechnen alle mit derselben Saat und bekommen dasselbe Wetter. Nur Ganzzahlen.
import {
  GEBAEUDE, GEBAEUDE_IDS, JAHR_TICKS, JAHRESZEIT_TICKS, WETTER, WETTER_DAUER_MAX, WETTER_DAUER_MIN, WETTER_JE_JAHRESZEIT, WETTER_MAX, WETTER_MIN,
} from './daten';
import { hashMit } from './natur';

/** Spieljahr (0 = erstes) und Jahreszeit (0 Frühjahr … 3 Winter) zum Tick. */
export const jahrVon = (tick: number): number => Math.floor(tick / JAHR_TICKS);
export const jahreszeitVon = (tick: number): number => Math.floor((tick % JAHR_TICKS) / JAHRESZEIT_TICKS);
/** Ticks seit Beginn der laufenden Jahreszeit. */
export const inJahreszeit = (tick: number): number => (tick % JAHR_TICKS) % JAHRESZEIT_TICKS;

/** Feld-Gebäudetypen (saison 'feld') in Datei-Reihenfolge – daraus wählt die Missernte. */
export const FELD_TYPEN: readonly string[] = GEBAEUDE_IDS.filter((id) => GEBAEUDE[id].feld);

/** Ein Wetterereignis: Art (Index in WETTER), Beginn und Ende (Tick, ausschließlich), bei Missernte der betroffene Feldtyp. */
export interface WetterEreignis { art: number; start: number; ende: number; feld: string }

/**
 * Wetterplan einer Jahreszeit (Spieljahr `jahr`, Jahreszeit `jz`) aus der Saat: WETTER_MIN..WETTER_MAX Ereignisse aus der Liste der
 * Jahreszeit, je eins in einem gleich großen Abschnitt, keine Art zweimal. Im ersten Frühjahr gibt es kein Wetter.
 */
export function wetterPlan(saat: number, jahr: number, jz: number): WetterEreignis[] {
  if (jahr === 0 && jz === 0) return [];
  const h = (i: number) => hashMit(saat, jahr * 4 + jz, 101 + i);
  const liste = WETTER_JE_JAHRESZEIT[jz] ?? [];
  if (!liste.length) return [];
  const n = WETTER_MIN + (h(0) % (WETTER_MAX - WETTER_MIN + 1));
  const beginn = jahr * JAHR_TICKS + jz * JAHRESZEIT_TICKS;
  const abschnitt = Math.floor(JAHRESZEIT_TICKS / Math.max(1, n));
  const aus: WetterEreignis[] = [];
  const gehabt = new Set<number>();
  for (let i = 0; i < n; i++) {
    let k = h(1 + 4 * i) % liste.length;
    for (let j = 0; j < liste.length && gehabt.has(liste[k]); j++) k = (k + 1) % liste.length;
    if (gehabt.has(liste[k])) break;
    const art = liste[k];
    gehabt.add(art);
    const dauer = Math.min(abschnitt, WETTER_DAUER_MIN + (h(2 + 4 * i) % (WETTER_DAUER_MAX - WETTER_DAUER_MIN + 1)));
    const start = beginn + i * abschnitt + (h(3 + 4 * i) % Math.max(1, abschnitt - dauer));
    const feld = WETTER[art].missernte && FELD_TYPEN.length ? FELD_TYPEN[h(4 + 4 * i) % FELD_TYPEN.length] : '';
    aus.push({ art, start, ende: start + dauer, feld });
  }
  return aus;
}

/** Wetterpläne mit Zwischenspeicher (abgeleitet, nicht Teil des Zustands). */
export class Wetterkalender {
  private cache = new Map<number, WetterEreignis[]>();
  constructor(private readonly saat: number) {}

  /** Plan der Jahreszeit mit laufender Nummer `nr` (= Jahr · 4 + Jahreszeit). */
  plan(nr: number): WetterEreignis[] {
    let p = this.cache.get(nr);
    if (!p) {
      p = nr < 0 ? [] : wetterPlan(this.saat, Math.floor(nr / 4), nr % 4);
      if (this.cache.size > 16) this.cache.clear();
      this.cache.set(nr, p);
    }
    return p;
  }

  /** Ereignisse, die am Tick laufen. */
  aktiv(tick: number): WetterEreignis[] {
    return this.plan(Math.floor(tick / JAHRESZEIT_TICKS)).filter((e) => e.start <= tick && tick < e.ende);
  }

  /** Ereignisse dieser und der nächsten Jahreszeit, die noch nicht vorbei sind (für Ankündigung und Anzeige). */
  kommend(tick: number): WetterEreignis[] {
    const nr = Math.floor(tick / JAHRESZEIT_TICKS);
    return [...this.plan(nr), ...this.plan(nr + 1)].filter((e) => e.ende > tick);
  }
}
