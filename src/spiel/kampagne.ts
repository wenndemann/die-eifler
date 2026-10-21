// Kampagne „Der Eifelsteig“ (Drehbuch 2.1, ROADMAP M13): Wege, Etappen und Ziele aus data/kampagne.json, der Kampagnenstand im
// Browser (welche Etappen geschafft, Völkchen, Punkte, Rucksack) und die Prüfung der Etappenziele an der Sicht. Rein (für Tests);
// die Etappe selbst ist ein normales Einzelspiel auf einem festen Ausschnitt, die Simulation weiß nichts von der Kampagne
// außer den mitgebrachten Waren im Startlager (StartDaten.waren).
import daten from '../../data/kampagne.json';
import { GEBAEUDE, WARE, WAREN, WAREN_NAMEN } from '../sim/daten';
import { PROMILLE, type SimSicht } from '../sim/typen';
import type { Groesse } from '../welt/format';

export type Ziel =
  | { art: 'bewohner'; n: number }
  | { art: 'stufe'; n: number }
  | { art: 'lager'; ware: string; n: number }
  | { art: 'gebaeude'; typ: string; n: number }
  | { art: 'punkte'; n: number }
  | { art: 'koenig' }
  | { art: 'ort'; name: string };

export interface Etappe {
  nr: number; name: string; von: string; nach: string;
  /** Hex der Orte „von“ (Startlager) und „nach“ (Ziel), global. */
  start: { q: number; r: number }; ziel: { q: number; r: number };
  /** Mitte des Ausschnitts (globales Hex) und Größe. */
  q: number; r: number; groesse: Groesse;
  ziele: Ziel[];
  einleitung: string; geschafft: string;
}
export interface Abschnitt { name: string; etappen: Etappe[] }
export interface Weg { id: string; name: string; beschreibung: string; abschnitte: Abschnitt[] }

export const WEGE: readonly Weg[] = (daten as unknown as { wege: Weg[] }).wege;
export const RUCKSACK_MAX: number = daten.rucksack_max;

/** Alle Etappen eines Wegs in Reihenfolge (Index = Etappe im Kampagnenstand). */
export function etappenVon(weg: Weg): Etappe[] {
  return weg.abschnitte.flatMap((a) => a.etappen);
}

export function wegVon(id: string): Weg | undefined {
  return WEGE.find((w) => w.id === id);
}

/** Abschnitt einer Etappe (für die Übersicht). */
export function abschnittVon(weg: Weg, index: number): Abschnitt | undefined {
  let i = index;
  for (const a of weg.abschnitte) { if (i < a.etappen.length) return a; i -= a.etappen.length; }
  return undefined;
}

// ---------------------------------------------------------------- Kampagnenstand

export const KAMPAGNE_SPEICHER = 'eifeler.kampagne';

export interface KampagnenStand {
  weg: string;
  voelkchen: string;
  /** Geschaffte Etappen (Indizes) und die Eifel-Punkte je geschaffter Etappe. */
  geschafft: number[];
  punkte: Record<string, number>;
  /** Waren für die nächste Etappe (Ware-Id → Stück). */
  rucksack: Record<string, number>;
}

export function neueKampagne(weg: string, voelkchen: string): KampagnenStand {
  return { weg, voelkchen, geschafft: [], punkte: {}, rucksack: {} };
}

/** Gelesener Kampagnenstand (kaputt oder fremd → null). */
export function leseKampagne(text: string | null): KampagnenStand | null {
  if (!text) return null;
  try {
    const d = JSON.parse(text) as Partial<KampagnenStand>;
    const weg = d.weg && wegVon(d.weg);
    if (!weg || typeof d.voelkchen !== 'string') return null;
    const n = etappenVon(weg).length;
    const geschafft = Array.isArray(d.geschafft) ? [...new Set(d.geschafft.filter((i) => Number.isInteger(i) && i >= 0 && i < n))].sort((a, b) => a - b) : [];
    const punkte: Record<string, number> = {};
    for (const [k, v] of Object.entries(d.punkte ?? {})) if (Number.isFinite(v)) punkte[k] = Math.max(0, Math.floor(v));
    return { weg: weg.id, voelkchen: d.voelkchen, geschafft, punkte, rucksack: rucksackPruefen(d.rucksack ?? {}) };
  } catch { return null; }
}

/** Nächste offene Etappe (Index) oder -1, wenn alles geschafft ist. */
export function naechsteEtappe(k: KampagnenStand): number {
  const weg = wegVon(k.weg);
  if (!weg) return -1;
  const n = etappenVon(weg).length;
  for (let i = 0; i < n; i++) if (!k.geschafft.includes(i)) return i;
  return -1;
}

/** Eine Etappe darf man spielen, wenn sie geschafft ist (nochmal) oder die nächste offene ist. */
export function etappeOffen(k: KampagnenStand, i: number): boolean {
  return k.geschafft.includes(i) || i === naechsteEtappe(k);
}

export function kampagnenPunkte(k: KampagnenStand): number {
  return Object.values(k.punkte).reduce((s, n) => s + n, 0);
}

/** Etappe geschafft: Punkte (bester Wert bleibt), Rucksack für die nächste. */
export function etappeAbschliessen(k: KampagnenStand, i: number, punkte: number, rucksack: Record<string, number>): KampagnenStand {
  const geschafft = [...new Set([...k.geschafft, i])].sort((a, b) => a - b);
  const p = { ...k.punkte, [String(i)]: Math.max(k.punkte[String(i)] ?? 0, Math.max(0, Math.floor(punkte))) };
  return { ...k, geschafft, punkte: p, rucksack: rucksackPruefen(rucksack) };
}

/** Rucksack: nur bekannte Waren, ganze Stück, zusammen höchstens RUCKSACK_MAX. */
export function rucksackPruefen(r: Record<string, number>): Record<string, number> {
  const aus: Record<string, number> = {};
  let rest = RUCKSACK_MAX;
  for (const [id, n] of Object.entries(r)) {
    if (WARE[id] === undefined) continue;
    const k = Math.min(rest, Math.max(0, Math.floor(Number(n) || 0)));
    if (k > 0) { aus[id] = k; rest -= k; }
  }
  return aus;
}

/** Vorschlag für den Rucksack: die wertvollsten Waren im Lager zuerst (Werkzeug, Eisen, Bretter, Stein, Essen). */
export function rucksackVorschlag(lager: readonly number[]): Record<string, number> {
  const reihe = ['werkzeug', 'eisen', 'bretter', 'stein', 'kaese', 'bratkartoffeln', 'most', 'landbier', 'kartoffeln'];
  const aus: Record<string, number> = {};
  let rest = RUCKSACK_MAX;
  for (const id of reihe) {
    const a = WARE[id];
    if (a === undefined || rest <= 0) continue;
    const k = Math.min(rest, lager[a] ?? 0, 5);
    if (k > 0) { aus[id] = k; rest -= k; }
  }
  return aus;
}

// ---------------------------------------------------------------- Ziele

export interface ZielStand { text: string; erfuellt: boolean; fehlt?: boolean }

const STUFEN = ['Weiler', 'Dorf', 'Kirchdorf', 'Marktflecken'];

/**
 * Stand jedes Ziels an der Sicht. `ortName(i)` nennt den Namen des Orts mit Index i in sicht.orte. Ein Ort, den es auf der Karte
 * nicht gibt, zählt als erfüllt (fehlt = true), damit eine Etappe nie unschaffbar wird.
 */
export function zieleStand(ziele: readonly Ziel[], s: SimSicht, ich: number, ortName: (i: number) => string): ZielStand[] {
  const d = s.dorf, sp = s.spieler[ich];
  const lager = new Array<number>(WAREN.length).fill(0);
  for (const g of s.gebaeude) if (g.sp === ich && g.typ === 'lager' && g.vorrat) g.vorrat.forEach((n, a) => { lager[a] += n; });
  return ziele.map((z): ZielStand => {
    switch (z.art) {
      case 'bewohner': return { text: `${Math.min(d.bewohner, z.n)}/${z.n} Bewohner`, erfuellt: d.bewohner >= z.n };
      case 'stufe': return { text: `${STUFEN[z.n] ?? z.n} werden (jetzt ${STUFEN[d.stufe] ?? d.stufe})`, erfuellt: d.stufe >= z.n };
      case 'lager': {
        const a = WARE[z.ware] ?? -1, n = a >= 0 ? lager[a] : 0;
        return { text: `${Math.min(n, z.n)}/${z.n} ${warenName(z.ware)} im Lager`, erfuellt: n >= z.n };
      }
      case 'gebaeude': {
        const n = s.gebaeude.filter((g) => g.sp === ich && g.typ === z.typ && g.bau >= PROMILLE).length;
        return { text: `${GEBAEUDE[z.typ]?.name ?? z.typ}: ${Math.min(n, z.n)}/${z.n}`, erfuellt: n >= z.n };
      }
      case 'punkte': return { text: `${Math.min(sp?.punkte ?? 0, z.n)}/${z.n} Eifel-Punkte`, erfuellt: (sp?.punkte ?? 0) >= z.n };
      case 'koenig': return { text: 'Schützenkönig werden', erfuellt: !!sp?.koenig };
      case 'ort': {
        const i = s.orte.findIndex((_, k) => ortName(k) === z.name);
        if (i < 0) return { text: `${z.name} (nicht auf dieser Karte)`, erfuellt: true, fehlt: true };
        return { text: `${z.name} gewinnen (Einstand liefern)`, erfuellt: s.orte[i].besitzer === ich };
      }
    }
  });
}

/** Anzeigename einer Ware ohne Symbol („Käse“). */
export function warenName(id: string): string {
  const a = WARE[id];
  return a === undefined ? id : WAREN_NAMEN[a].split(' ').slice(1).join(' ') || WAREN_NAMEN[a];
}
