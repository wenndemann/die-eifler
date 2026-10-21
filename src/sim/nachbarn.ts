// Gebiet, Orte, Flachländer, Finden, Schützenfest und Eifel-Punkte (Drehbuch 6, ROADMAP M10): Zahlen aus data/nachbarn.json
// in Ganzzahlen (Ticks, Mengen je Warenart) und die reinen Rechnungen dazu (Orte aus der Karte, Marktposten am Spielfeldrand).
// Wie alles unter src/sim/: nur Ganzzahlen, kein Zufall außer aus der Saat.
import nachbarnJson from '../../data/nachbarn.json';
import { FLAG } from '../welt/format';
import { WARE, WAREN } from './daten';
import type { SimKarte } from './karte';
import { TICK_HZ } from './typen';

const J = nachbarnJson;
const sek = (s: number) => Math.round(s * TICK_HZ);
function jeWare(m: Record<string, number | undefined> | undefined): number[] {
  const a = new Array<number>(WAREN.length).fill(0);
  if (m) for (const [id, n] of Object.entries(m)) {
    const i = WARE[id];
    if (i === undefined) throw new Error(`Unbekannte Ware "${id}" in data/nachbarn.json`);
    a[i] = Math.floor(n ?? 0);
  }
  return a;
}

// ---------------------------------------------------------------- Gebiet (Einfluss)

/** Gebiet neu rechnen alle GEBIET_TAKT Ticks. */
export const GEBIET_TAKT = sek(J.gebiet.takt_s);
/** Einfluss-Radius je Gebäudetyp (nur diese strahlen). */
export const GEBIET_RADIUS: Readonly<Record<string, number>> = J.gebiet.radius;
export const VERSORGT_BONUS = J.gebiet.versorgt_bonus;
export const KOENIG_BONUS = J.gebiet.koenig_bonus;
/** Fahnen dürfen auch auf neutralem Land stehen, wenn ein Ort oder Marktposten höchstens so weit weg ist (Anschluss). */
export const ANSCHLUSS = J.gebiet.anschluss;

// ---------------------------------------------------------------- Orte mit Einstand

export interface OrtGroesse { id: string; bisHexe: number; radius: number; bewohner: number; punkte: number; posten: number; wunsch: number[]; fundkiste: number[] }
export const ORT_GROESSEN: readonly OrtGroesse[] = J.orte.groessen.map((g) => ({
  id: g.id, bisHexe: g.bis_hexe, radius: g.radius, bewohner: g.bewohner, punkte: g.punkte, posten: g.posten,
  wunsch: jeWare(g.wunsch), fundkiste: jeWare(g.fundkiste),
}));
export const ORT_LAUFZEIT_JE_HEX = sek(J.orte.laufzeit_s_je_hex);

/** Ein Eifel-Ort im Spielfeld (statisch aus der Karte). */
export interface OrtDaten {
  /** Ort-Nummer: Index + 1 in orte.json (wie KarteDaten.place). */
  nr: number;
  /** Mittel-Hex (Index) und Größe (Index in ORT_GROESSEN). */
  h: number; groesse: number;
  /** Wunschliste je Warenart. */
  wunsch: number[];
}

/** Kleiner Ganzzahl-Hash (für feste Auswahl je Ort). */
function mische(a: number, b: number): number {
  let x = (Math.imul(a | 0, 0x9e3779b1) ^ Math.imul(b | 0, 0x85ebca6b)) | 0;
  x ^= x >>> 15; x = Math.imul(x, 0x2c1b3c6d); x ^= x >>> 12;
  return x >>> 0;
}

/**
 * Orte aus den Ortskern-Hexen der Karte (place > 0): Mittel-Hex = der Ortskern-Hex mit der kleinsten Summe der Abstände zu den anderen
 * (bei Gleichstand kleinerer Index), Größe nach Zahl der Hexe. Wunsch: `posten` Waren aus dem Pool der Größe, fest aus Ort-Nummer und Saat.
 */
export function orteAusKarte(karte: SimKarte, place: ArrayLike<number> | undefined, saat: number): OrtDaten[] {
  if (!place) return [];
  const je = new Map<number, number[]>();
  for (let i = 0; i < karte.count; i++) {
    const p = place[i] | 0;
    if (p <= 0 || !(karte.flags[i] & FLAG.ortskern) || !karte.begehbar[i]) continue;
    let l = je.get(p);
    if (!l) { l = []; je.set(p, l); }
    l.push(i);
  }
  const orte: OrtDaten[] = [];
  for (const nr of [...je.keys()].sort((a, b) => a - b)) {
    const hexe = je.get(nr)!;
    let best = hexe[0], bs = Infinity;
    for (const a of hexe) {
      let s = 0;
      for (const b of hexe) s += karte.abstand(a, b);
      if (s < bs) { bs = s; best = a; }
    }
    let groesse = 0;
    while (groesse < ORT_GROESSEN.length - 1 && hexe.length > ORT_GROESSEN[groesse].bisHexe) groesse++;
    const g = ORT_GROESSEN[groesse];
    const pool = g.wunsch.map((n, a) => (n > 0 ? a : -1)).filter((a) => a >= 0);
    const wunsch = new Array<number>(WAREN.length).fill(0);
    let k = mische(nr, saat);
    for (let i = 0; i < g.posten && pool.length; i++) {
      const j = k % pool.length;
      const a = pool.splice(j, 1)[0];
      wunsch[a] = g.wunsch[a];
      k = mische(k, i + 1);
    }
    orte.push({ nr, h: best, groesse, wunsch });
  }
  return orte;
}

// ---------------------------------------------------------------- Flachländer (Marktposten am Kartenrand)

export interface Stadt { id: string; name: string; q: number; r: number }
export const STAEDTE: readonly Stadt[] = J.flachland.staedte;
export const POSTEN_MAX = J.flachland.max;
export const POSTEN_LAUFZEIT_JE_KM = sek(J.flachland.laufzeit_s_je_km);
export const FLACH_WACHSAMKEIT = J.flachland.wachsamkeit;
export const HANDEL: readonly { gib: number[]; nimm: number[] }[] = J.flachland.handel.map((h) => ({ gib: jeWare(h.gib), nimm: jeWare(h.nimm) }));
export const HANDEL_BESSER = J.flachland.besser;
/** Hex-Breite in Metern (Weltdaten: Umkreisradius 60 m, Breite 60·√3 ≈ 103,92 m) als Ganzzahl-Bruch 10392/100. */
const HEX_BREITE_CM = 10392;

export interface PostenDaten {
  /** Index in STAEDTE, Hex am Spielfeldrand (Index), Entfernung zur echten Stadt in km (ganz). */
  stadt: number; h: number; km: number;
}

const hexAbstand = (q0: number, r0: number, q1: number, r1: number) => {
  const dq = q1 - q0, dr = r1 - r0;
  return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) >> 1;
};

/**
 * Marktposten: die POSTEN_MAX nächsten Städte (Hex-Abstand vom Spielfeld-Mittelpunkt, bei Gleichstand Reihenfolge der Datei). Jeder
 * Posten steht am Rand (Abstand n − 1 vom Mittelpunkt) in Richtung der Stadt; ist der Hex nicht begehbar oder schon belegt, rückt er
 * schrittweise zur Mitte. km = Abstand vom Posten zur Stadt in Hex-Breiten.
 */
export function marktpostenAusKarte(karte: SimKarte): PostenDaten[] {
  const q0 = karte.q, r0 = karte.r, n = karte.n;
  const nach = STAEDTE.map((s, i) => ({ i, d: hexAbstand(q0, r0, s.q, s.r) })).sort((a, b) => a.d - b.d || a.i - b.i).slice(0, POSTEN_MAX);
  const aus: PostenDaten[] = [];
  const belegt = new Set<number>();
  for (const { i, d } of nach) {
    const s = STAEDTE[i];
    if (d === 0) continue;
    let h = -1;
    for (let k = n - 1; k >= 1 && h < 0; k--) {
      // Punkt auf der Strecke im Abstand k (kubisch, ganzzahlig gerundet)
      const fq = s.q - q0, fr = s.r - r0, fs = -fq - fr;
      const rq = Math.round((fq * k) / d), rr = Math.round((fr * k) / d), rs = Math.round((fs * k) / d);
      let q = rq, r = rr;
      const eq = Math.abs(rq * d - fq * k), er = Math.abs(rr * d - fr * k), es = Math.abs(rs * d - fs * k);
      if (eq > er && eq > es) q = -rr - rs; else if (er > es) r = -rq - rs;
      const x = karte.index(q0 + q, r0 + r);
      if (x >= 0 && karte.begehbar[x] && !belegt.has(x)) h = x;
    }
    if (h < 0) continue;
    belegt.add(h);
    const km = Math.max(1, Math.floor((hexAbstand(karte.qs[h], karte.rs[h], s.q, s.r) * HEX_BREITE_CM) / 100_000));
    aus.push({ stadt: i, h, km });
  }
  return aus;
}

// ---------------------------------------------------------------- Finden

const F = J.finden;
export const FIND_TICKS_JE_HEX = sek(F.dauer_s_je_hex);
export const FIND_PAUSE = sek(F.pause_s);
export const FIND_BASIS = F.basis;
export const FIND_WACHHUND = F.wachhund;
export const FIND_POLIZIST = F.polizist;
export const FIND_UMKREIS = F.umkreis;
export const FIND_HOECHSTENS = F.hoechstens;
export const FIND_BEUTE = F.beute;
export const FIND_PUNKTE = F.fund_punkte;
export const AUSREDE_TICKS: readonly number[] = F.ausrede_s.map(sek);
export const AUSREDEN: readonly string[] = F.ausreden;

// ---------------------------------------------------------------- Schützenfest

const S = J.schuetzen;
export const SCHUETZEN_LISTE: readonly number[] = jeWare(S.liste);
export const SCHUETZEN_FEST = sek(S.fest_s);
export const SCHUSS_GRUND = S.grund;
export const SCHUSS_STAND = S.schiessstand;
export const SCHUSS_GLUECK = S.glueck;
export const KOENIG_AB = S.koenig_ab;
export const KOENIG_RUNDE: readonly number[] = jeWare(S.runde);

// ---------------------------------------------------------------- Eifel-Punkte und Ziele

const P = J.punkte;
export const PUNKTE_STUFE: readonly number[] = P.stufe;
export const PUNKTE_KIRMES = P.kirmes;
export const PUNKTE_SCHUETZENFEST = P.schuetzenfest;
export const PUNKTE_KOENIG = P.koenig;
export const PUNKTE_BEWOHNER = P.bewohner;
export const HEXE_JE_PUNKT = P.hexe_je_punkt;
/** Wählbare Ziele (Lobby): punkte 0 bei Wettlauf und „ohne Ende“. */
export const ZIELE: readonly { id: string; name: string; punkte: number }[] = P.ziele;

/** Regeln einer Partie (Lobby; fehlt bei alten Spielständen und in Tests: dann wie vor M10, kein Gebiet und kein Ende). */
export interface Regeln {
  /** 1 = Bauen nur auf eigenem Gebiet, Gebäude auf fremdem Gebiet stehen still. */
  gebiet: number;
  /** Ziel-Id aus ZIELE ('' = kein Ende). */
  ziel: string;
}
export const REGELN_ALT: Regeln = { gebiet: 0, ziel: '' };
export const REGELN_STANDARD: Regeln = { gebiet: 1, ziel: 'normal' };

/** Zielpunktzahl (0 = keine). */
export function zielPunkte(r: Regeln): number {
  return ZIELE.find((z) => z.id === r.ziel)?.punkte ?? 0;
}
