// Grenzland (ROADMAP M15): Zahlen aus data/grenzland.json in Ticks und Warenlisten, dazu Nacht und Zollhäuser. Die Regeln selbst
// stehen in sim.ts (Abschnitt „Grenzland“). Wie alles unter src/sim/: nur Ganzzahlen.
import grenzland from '../../data/grenzland.json';
import optik from '../../data/optik.json';
import { FLAG } from '../welt/format';
import { WARE, WAREN } from './daten';
import type { SimKarte } from './karte';
import { TICK_HZ } from './typen';

const s = (x: number) => Math.round(x * TICK_HZ);
function liste(m: Record<string, number> | undefined): number[] {
  const a = new Array<number>(WAREN.length).fill(0);
  if (m) for (const [id, n] of Object.entries(m)) {
    if (WARE[id] === undefined) throw new Error(`Unbekannte Ware "${id}" in data/grenzland.json`);
    a[WARE[id]] = Math.floor(n);
  }
  return a;
}

/** Tag in Ticks und Tick-Versatz des Spielbeginns (wie die Tageszeit der Optik, data/optik.json: tag). */
export const TAG_TICKS = Math.max(24, Math.round(optik.tag.tag_min * 60 * TICK_HZ));
const TAG_START = Math.round(optik.tag.start * TAG_TICKS);
const NACHT_AB = grenzland.nacht.ab_uhr, NACHT_BIS = grenzland.nacht.bis_uhr;

/** Ist es zum Tick t Nacht (ab NACHT_AB bis NACHT_BIS Uhr)? Ganzzahlig: Stunde = ⌊24 · Tagesanteil⌋. */
export function istNacht(t: number): boolean {
  const x = (((t + TAG_START) % TAG_TICKS) + TAG_TICKS) % TAG_TICKS;
  const stunde = Math.floor((x * 24) / TAG_TICKS);
  return NACHT_AB > NACHT_BIS ? stunde >= NACHT_AB || stunde < NACHT_BIS : stunde >= NACHT_AB && stunde < NACHT_BIS;
}

/** Ticks bis zur nächsten Nacht (0 = es ist Nacht). */
export function bisNacht(t: number): number {
  if (istNacht(t)) return 0;
  const x = (((t + TAG_START) % TAG_TICKS) + TAG_TICKS) % TAG_TICKS;
  const ab = Math.ceil((NACHT_AB * TAG_TICKS) / 24);
  return ab > x ? ab - x : ab + TAG_TICKS - x;
}

const G = grenzland;
/** Grenzsteine: Umkreis, Höchstzahl je Spieler, Hecken-Schutz. */
export const STEIN_RADIUS = G.grenzstein.radius;
export const STEIN_MAX = G.grenzstein.max;
export const STEIN_HECKE_RADIUS = G.grenzstein.hecke_radius;
export const STEIN_HECKE_PROZENT = G.grenzstein.hecke_prozent;
/** Maijungen als Helfer. */
export const HELFER_MIN = G.maijungen.helfer_min;
export const HELFER_TEMPO = G.maijungen.tempo_prozent;
export const HELFER_FEST_PUNKTE = G.maijungen.fest_punkte;
export const HELFER_SCHUETZEN_PUNKTE = G.maijungen.schuetzenfest_punkte;
/** Abwerben. */
const A = G.abwerben;
export const ABWERB_TAKT = Math.max(1, s(A.takt_s));
export const ABWERB_VORSPRUNG = A.vorsprung;
export const ABWERB_CHANCE = A.chance_prozent;
export const ABWERB_MIN = A.min_bewohner;
export const HOF_PROZENT = A.hof_prozent;
export const HOF_BEWOHNER = A.hof_bewohner;
export const HOF_RADIUS = A.hof_radius;
export const REIZ = {
  stufe: A.reiz.je_stufe, fest: A.reiz.je_fest, festMax: A.reiz.fest_max, satt: A.reiz.satt, essen: A.reiz.essen_je_bewohner,
  friert: A.reiz.friert, festLaeuft: A.reiz.fest_laeuft, koenig: A.reiz.koenig,
} as const;
/** Zoll und Kaffeeschmuggel. */
export const ZOLL_MAX = G.zoll.max;
export const ZOLL_ABSTAND = G.zoll.abstand;
export const ZOLL_WACHSAMKEIT = G.zoll.wachsamkeit;
export const ZOLL_RABATT = G.zoll.schmuggler_rabatt;
export const ZOLL_SCHMUGGLER: readonly string[] = G.zoll.schmuggler;
export const ZOLL_BEUTE = G.zoll.beute;
/** Fundbüro und große Funde. */
const F = G.fundbuero;
export const FUNDBUERO_BONUS = F.beute_bonus;
export const GROSS_PROZENT = F.gross_prozent;
export const GEWEHR_BONUS = F.gewehr_bonus;
export const KAFFEE_TAKT = Math.max(1, s(F.kaffee_takt_s));
export const KAFFEE_JE = F.kaffee;
export const KAFFEE_PUNKTE = F.kaffee_punkte;
export const KAFFEE_MAX = F.kaffee_max;
export interface GrosserFundArt { id: string; name: string; symbol: string; punkte: number; waren: number[]; gewehr: boolean }
export const FUNDE: readonly GrosserFundArt[] = F.funde.map((x) => ({
  id: x.id, name: x.name, symbol: x.symbol, punkte: x.punkte, waren: liste((x as { waren?: Record<string, number> }).waren), gewehr: !!(x as { gewehr?: boolean }).gewehr,
}));
/** Der Große Fund. */
export const SCHATZ_NAME = G.grosser_fund.name;
export const SCHATZ_TEILE = G.grosser_fund.teile;
export const SCHATZ_PUNKTE = G.grosser_fund.punkte;
export const TEIL_PROZENT = G.grosser_fund.teil_prozent;
export const TEIL_PROZENT_ORT = G.grosser_fund.teil_prozent_ort;
export const TEIL_NAMEN: readonly string[] = G.grosser_fund.teil_namen;
/** Jahresfest je gewonnenem Ort. */
export const JFEST_PUNKTE = G.jahresfest.punkte;
export const JFEST_OBERGRENZE = G.jahresfest.obergrenze;
export const JFEST_DAUER = Math.max(1, s(G.jahresfest.dauer_s));
/** Spuk: Abstand der Geräusche (Darstellung). */
export const SPUK_GERAEUSCH_S = G.spuk.geraeusch_s;

/**
 * Zollhäuser: Hexe mit Staatsgrenze im Spielfeld, begehbar, kein Ortskern, keine Bahn, kein Fluss; offenes Land vor Wald, zuerst der zur Spielfeldmitte nächste
 * (bei Gleichstand kleinerer Index), weitere mit Mindestabstand ZOLL_ABSTAND.
 */
export function zollAusKarte(karte: SimKarte): number[] {
  const mitte = karte.index(karte.q, karte.r);
  const kand: number[] = [];
  for (let i = 0; i < karte.count; i++) {
    if (!(karte.flags[i] & FLAG.grenze) || !karte.begehbar[i] || (karte.flags[i] & (FLAG.ortskern | FLAG.bahn | FLAG.fluss))) continue;
    kand.push(i);
  }
  // lieber auf offenem Land als im Wald (terrain 2), dann zur Mitte
  const wald = (i: number) => (karte.terrain[i] === 2 ? 1 : 0);
  kand.sort((a, b) => wald(a) - wald(b) || karte.abstand(a, mitte) - karte.abstand(b, mitte) || a - b);
  const aus: number[] = [];
  for (const i of kand) {
    if (aus.length >= ZOLL_MAX) break;
    if (aus.some((h) => karte.abstand(h, i) < ZOLL_ABSTAND)) continue;
    aus.push(i);
  }
  return aus;
}
