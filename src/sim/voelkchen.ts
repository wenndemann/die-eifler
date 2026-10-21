// Die 10 Völkchen (Drehbuch 5.3, ROADMAP M11): Regeln aus data/voelkchen.json in Ganzzahlen. Welches Völkchen ein Dorf hat, ergibt
// sich aus dem Startort (StartDaten.voelkchen); ohne Angabe (Tests, alte Spielstände) spielt das Dorf ohne Bonus und Schwäche.
import voelkchenJson from '../../data/voelkchen.json';
import { KIRMES, WARE, WAREN } from './daten';
import { TICK_HZ } from './typen';

interface VoelkchenJson {
  id: string; spezialitaet: string; tempo: Record<string, number>; bauzeit: number; fest: number; handel: number;
  am_wasser_verboten?: boolean; moor_planieren_s?: number; regen_ruht?: string[]; hecke_winter?: number; start?: Record<string, number>;
  tracht: string; dach: string;
}

export interface VoelkchenRegeln {
  id: string;
  /** Warenart der Spezialität (edle Ware für die Marktflecken-Kirmes). */
  spezialitaet: number;
  /** Tempo in Prozent je Gebäudetyp. */
  tempo: Readonly<Record<string, number>>;
  /** Prozent der Bauzeit, der Festdauer und der Waren beim Handel. */
  bauzeit: number; fest: number; handel: number;
  amWasserVerboten: boolean;
  moorPlanieren: number;
  regenRuht: readonly string[];
  heckeWinter: number;
  start: readonly number[];
  tracht: string; dach: string;
}

function ware(id: string): number {
  const i = WARE[id];
  if (i === undefined) throw new Error(`Unbekannte Ware "${id}" in data/voelkchen.json`);
  return i;
}

export const VOELKCHEN: readonly VoelkchenRegeln[] = (voelkchenJson as unknown as { voelkchen: VoelkchenJson[] }).voelkchen.map((v) => {
  const start = new Array<number>(WAREN.length).fill(0);
  for (const [id, n] of Object.entries(v.start ?? {})) start[ware(id)] = Math.floor(n);
  return {
    id: v.id, spezialitaet: ware(v.spezialitaet), tempo: { ...v.tempo }, bauzeit: v.bauzeit, fest: v.fest, handel: v.handel,
    amWasserVerboten: !!v.am_wasser_verboten, moorPlanieren: Math.round((v.moor_planieren_s ?? 0) * TICK_HZ), regenRuht: v.regen_ruht ?? [],
    heckeWinter: v.hecke_winter ?? 0, start, tracht: v.tracht, dach: v.dach,
  };
});

/** Index des Völkchens zur Id oder -1 (kein Völkchen). */
export function voelkchenIndex(id: string | undefined): number {
  return id ? VOELKCHEN.findIndex((v) => v.id === id) : -1;
}

/**
 * Kirmes-Stufen je Völkchen: In der Kirmes Kirchdorf → Marktflecken tritt die Spezialität an die Stelle des Bergkäse-Platzhalters (M8).
 * Index vk + 1 (0 = ohne Völkchen, unverändert).
 */
export const KIRMES_JE_VOELKCHEN: readonly (typeof KIRMES)[] = [KIRMES, ...VOELKCHEN.map((v) => KIRMES.map((k, stufe) => {
  if (stufe !== KIRMES.length - 1) return k;
  const liste = k.liste.slice();
  const platzhalter = WARE.bergkaese;
  if (platzhalter !== undefined && liste[platzhalter] > 0) { liste[v.spezialitaet] += liste[platzhalter]; liste[platzhalter] = 0; }
  return { ...k, liste };
}))];
