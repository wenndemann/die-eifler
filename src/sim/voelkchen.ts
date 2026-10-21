// Die 10 Völkchen (Drehbuch 5.3, ROADMAP M11): Regeln aus data/voelkchen.json in Ganzzahlen. Welches Völkchen ein Dorf hat, ergibt
// sich aus dem Startort (StartDaten.voelkchen); ohne Angabe (Tests, alte Spielstände) spielt das Dorf ohne Bonus und Schwäche.
import voelkchenJson from '../../data/voelkchen.json';
import { KIRMES, WARE, WAREN } from './daten';
import { TICK_HZ } from './typen';

interface VoelkchenJson {
  id: string; spezialitaet: string; tempo: Record<string, number>; bauzeit: number; fest: number; handel: number;
  am_wasser_verboten?: boolean; moor_kosten?: number; moor_bauzeit?: number; regen_ruht?: string[]; hecke_winter?: number; hecke_wachstum?: number;
  start?: Record<string, number>; fest_pause?: boolean; laerm_radius?: number; altstein_prozent?: number; altstein_s?: number;
  ersatz?: Record<string, string>; kosten_rabatt?: boolean;
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
  /** Bauen auf Moor: Prozent der Kosten und der Bauzeit (Monschauer: ungern). */
  moorKosten: number; moorBauzeit: number;
  regenRuht: readonly string[];
  /** Hecken: Windschutz im Winter (Prozent) und Wachstumstempo (Prozent). */
  heckeWinter: number; heckeWachstum: number;
  start: readonly number[];
  /** Während der Feste ruht die Arbeit (Ahrtaler). */
  festPause: boolean;
  /** Laute Gebäude nicht näher als so viele Hexe an der eigenen Abtei (0 = egal). */
  laermRadius: number;
  /** „Alte Steine“: so viel Prozent der verbauten Waren kosten so viele Ticks extra (Südeifeler). */
  altsteinProzent: number; altsteinTicks: number;
  /** Ersatz: Warenart → Warenart, die sie als Zutat ersetzt (-1 keiner), z. B. Torf für Holzkohle (Ostbelgier). */
  ersatzFuer: readonly number[];
  /** Schiefer statt Stein fürs Dach: Gebäude etwas günstiger (Öslinger). */
  kostenRabatt: boolean;
  tracht: string; dach: string;
}

function ware(id: string): number {
  const i = WARE[id];
  if (i === undefined) throw new Error(`Unbekannte Ware "${id}" in data/voelkchen.json`);
  return i;
}

const ALLGEMEIN = (voelkchenJson as unknown as { allgemein: { hecke_wachsen_s: number; boote_takt_s: number; boote_punkte: number } }).allgemein;
/** Hecken wachsen so lange heran, bis sie Windschutz geben; Bootsverleih: alle BOOTE_TAKT Ticks BOOTE_PUNKTE Eifel-Punkte. */
export const HECKE_WACHSEN = Math.round(ALLGEMEIN.hecke_wachsen_s * TICK_HZ);
export const BOOTE_TAKT = Math.round(ALLGEMEIN.boote_takt_s * TICK_HZ);
export const BOOTE_PUNKTE = ALLGEMEIN.boote_punkte;

export const VOELKCHEN: readonly VoelkchenRegeln[] = (voelkchenJson as unknown as { voelkchen: VoelkchenJson[] }).voelkchen.map((v) => {
  const start = new Array<number>(WAREN.length).fill(0);
  // ersatzFuer[zutat] = Ersatzware (z. B. Holzkohle → Torf)
  const ersatzFuer = new Array<number>(WAREN.length).fill(-1);
  for (const [zutat, ersatz] of Object.entries(v.ersatz ?? {})) ersatzFuer[ware(zutat)] = ware(ersatz);
  for (const [id, n] of Object.entries(v.start ?? {})) start[ware(id)] = Math.floor(n);
  return {
    id: v.id, spezialitaet: ware(v.spezialitaet), tempo: { ...v.tempo }, bauzeit: v.bauzeit, fest: v.fest, handel: v.handel,
    amWasserVerboten: !!v.am_wasser_verboten, moorKosten: v.moor_kosten ?? 100, moorBauzeit: v.moor_bauzeit ?? 100, regenRuht: v.regen_ruht ?? [],
    heckeWinter: v.hecke_winter ?? 0, heckeWachstum: v.hecke_wachstum ?? 100, start, festPause: !!v.fest_pause, laermRadius: v.laerm_radius ?? 0,
    altsteinProzent: v.altstein_prozent ?? 0, altsteinTicks: Math.round((v.altstein_s ?? 0) * TICK_HZ), ersatzFuer, kostenRabatt: !!v.kosten_rabatt,
    tracht: v.tracht, dach: v.dach,
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
