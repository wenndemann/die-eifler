// Reine Spiel-Logik ohne Browser, three oder Simulation: Lager-Hex wählen, Klick von Ziehen unterscheiden,
// Tick-Akkumulator, Saat aus der Karten-Prüfsumme, Hex-Linie für rote Vorschauen. Einzeln testbar (tests/spiel.test.ts).
import { TICK_HZ } from '../sim/typen';

export interface Hx { q: number; r: number }

/** Hex-Abstand in Schritten (axial). */
export function hexAbstand(a: Hx, b: Hx): number {
  const dq = a.q - b.q, dr = a.r - b.r;
  return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
}

// ---------------------------------------------------------------- Lager-Hex

/** Was die Wahl des Lagers von der Karte braucht (HexFeld erfüllt das). */
export interface LagerKarte {
  q: number; r: number; n: number;
  terrain: Uint8Array;
  index(q: number, r: number): number;
}
export interface LagerKern { q: number; r: number; name: string }

/** Begehbar wie in der Simulation: alles außer Wasser (Terrain 0). */
export function begehbar(k: LagerKarte, h: Hx): boolean {
  const i = k.index(h.q, h.r);
  return i >= 0 && k.terrain[i] !== 0;
}

/**
 * Lager im echten Ortskern (Drehbuch 4.2): der Kern des Startorts (Name), sonst der Kern, der der Mitte am nächsten liegt
 * (bei Gleichstand der mit kleinerem r, dann q), sonst die Mitte. Ist der Hex nicht begehbar, der nächste begehbare Hex
 * (Ringe nach außen, innerhalb eines Rings r aufsteigend, dann q).
 */
export function waehleLagerHex(k: LagerKarte, kerne: readonly LagerKern[], startName?: string): Hx {
  const mitte: Hx = { q: k.q, r: k.r };
  let wahl: Hx = mitte;
  const passend = startName ? kerne.find((c) => c.name === startName) : undefined;
  if (passend) wahl = { q: passend.q, r: passend.r };
  else if (kerne.length) {
    let best = kerne[0];
    for (const c of kerne) {
      const a = hexAbstand(c, mitte), b = hexAbstand(best, mitte);
      if (a < b || (a === b && (c.r < best.r || (c.r === best.r && c.q < best.q)))) best = c;
    }
    wahl = { q: best.q, r: best.r };
  }
  if (begehbar(k, wahl)) return wahl;
  for (let d = 1; d <= 2 * k.n; d++) {
    for (let dr = -d; dr <= d; dr++) {
      for (let dq = Math.max(-d, -dr - d); dq <= Math.min(d, -dr + d); dq++) {
        const c = { q: wahl.q + dq, r: wahl.r + dr };
        if (hexAbstand(c, wahl) === d && begehbar(k, c)) return c;
      }
    }
  }
  return wahl;
}

/** Saat der Simulation aus der Karten-Prüfsumme (hex): die ersten 8 Zeichen als vorzeichenbehaftete Ganzzahl; nie 0. */
export function saatAusPruefsumme(pruefsumme: string): number {
  const v = parseInt(pruefsumme.slice(0, 8), 16);
  const s = Number.isFinite(v) ? v | 0 : 1;
  return s === 0 ? 1 : s;
}

// ---------------------------------------------------------------- Klick oder Ziehen

/** Ein Tipp/Klick darf sich höchstens so weit bewegen (Pixel) und nicht länger dauern (ms). */
export const KLICK_PIXEL = 9;
export const KLICK_MS = 550;

/**
 * Unterscheidet Klick von Ziehen: Klick nur bei kleiner Bewegung und kurzer Dauer und nur mit einem Zeiger.
 * Ein zweiter Zeiger (Zwei-Finger-Zoom) macht alle laufenden Berührungen ungültig.
 */
export class KlickErkenner {
  private z = new Map<number, { x: number; y: number; t: number; ok: boolean; knopf: number }>();
  constructor(private maxPixel = KLICK_PIXEL, private maxMs = KLICK_MS) {}

  runter(id: number, x: number, y: number, t: number, knopf = 0): void {
    const mehrere = this.z.size > 0;
    this.z.set(id, { x, y, t, ok: !mehrere, knopf });
    if (mehrere) for (const e of this.z.values()) e.ok = false;
  }

  bewegt(id: number, x: number, y: number): void {
    const e = this.z.get(id);
    if (e && Math.hypot(x - e.x, y - e.y) > this.maxPixel) e.ok = false;
  }

  /** Beendet den Zeiger; liefert den Knopf (0 links, 2 rechts), wenn es ein Klick war, sonst -1. */
  hoch(id: number, x: number, y: number, t: number): number {
    const e = this.z.get(id);
    this.z.delete(id);
    if (!e) return -1;
    const klick = e.ok && Math.hypot(x - e.x, y - e.y) <= this.maxPixel && t - e.t <= this.maxMs;
    return klick ? e.knopf : -1;
  }

  abbruch(id: number): void {
    this.z.delete(id);
  }
}

// ---------------------------------------------------------------- Tick-Akkumulator

export const MAX_TICKS_JE_FRAME = 10;
export const TEMPI = [1, 2, 3] as const;

/**
 * Fester Tick im Frame: sammelt die echte Zeit (mal Tempo) und liefert, wie viele Ticks zu rechnen sind.
 * Höchstens `maxJeFrame` (danach wird der Rest verworfen, damit das Spiel nach einem Ruckler nicht hinterherrennt).
 */
export class TickTakt {
  private acc = 0;
  constructor(private hz = TICK_HZ, private maxJeFrame = MAX_TICKS_JE_FRAME) {}

  vor(dt: number, tempo: number, pausiert: boolean): { ticks: number; alpha: number } {
    if (pausiert) return { ticks: 0, alpha: 0 };
    this.acc += Math.max(0, dt) * tempo;
    const td = 1 / this.hz;
    let n = Math.floor(this.acc / td + 1e-9);
    this.acc = Math.max(0, this.acc - n * td);
    if (n > this.maxJeFrame) { n = this.maxJeFrame; this.acc = 0; }
    return { ticks: n, alpha: this.alpha };
  }

  /** Rest in Ticks (0..1) für die Interpolation. */
  get alpha(): number {
    return Math.min(0.999, Math.max(0, this.acc * this.hz));
  }

  zuruecksetzen(): void {
    this.acc = 0;
  }
}

// ---------------------------------------------------------------- Vorschau-Hilfe

/** Gerade Hex-Linie von a nach b (beide eingeschlossen), höchstens `max` Schritte; für die rote „geht nicht“-Vorschau. */
export function hexLinie(a: Hx, b: Hx, max = 60): Hx[] {
  const dist = hexAbstand(a, b);
  if (dist === 0) return [{ ...a }];
  const n = Math.min(dist, max);
  const out: Hx[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / dist;
    const fq = a.q + (b.q - a.q) * t, fr = a.r + (b.r - a.r) * t, fs = -fq - fr;
    let rq = Math.round(fq), rr = Math.round(fr);
    const rs = Math.round(fs);
    const dq = Math.abs(rq - fq), dr = Math.abs(rr - fr), ds = Math.abs(rs - fs);
    if (dq > dr && dq > ds) rq = -rr - rs;
    else if (dr > ds) rr = -rq - rs;
    out.push({ q: rq + 0, r: rr + 0 });
  }
  return out;
}

// ---------------------------------------------------------------- Selbst geführter Weg

/** Die sechs Nachbarn eines Hex (axial, gleiche Reihenfolge wie die Simulation). */
export const NACHBAR_RICHTUNGEN: readonly [number, number][] = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];

export function nachbarn(h: Hx): Hx[] {
  return NACHBAR_RICHTUNGEN.map(([dq, dr]) => ({ q: h.q + dq, r: h.r + dr }));
}

/** Höchstzahl der Schritte eines Wegs (wie WEG_MAX_SCHRITTE der Simulation). */
export const WEG_MAX = 60;

/**
 * Der „offene Weg“ beim Wegbau von Hand: Start (Fahne), dann Zwischenpunkte; zwischen je zwei Punkten steht ein Teilstück
 * (Hex für Hex benachbart). Kennt die Simulation nicht – die Teilstücke kommen von außen (wegAbschnitt) und werden nur angehängt.
 */
export class OffenerWeg {
  private _pfad: Hx[] = [];
  /** Länge von `_pfad` nach jedem festen Punkt (Index 0 = Start: 1). */
  private enden: number[] = [];

  get aktiv(): boolean { return this._pfad.length > 0; }
  get start(): Hx | null { return this._pfad.length ? this._pfad[0] : null; }
  /** Letzter fester Punkt (Start oder Zwischenpunkt). */
  get letzter(): Hx | null { return this._pfad.length ? this._pfad[this._pfad.length - 1] : null; }
  /** Alle Hexe des festen Stücks, Start bis letzter Punkt (Kopie). */
  get pfad(): Hx[] { return this._pfad.map((h) => ({ ...h })); }
  get schritte(): number { return Math.max(0, this._pfad.length - 1); }
  /** Noch erlaubte Schritte bis WEG_MAX. */
  get rest(): number { return Math.max(0, WEG_MAX - this.schritte); }
  /** Zwischenpunkte ohne den Start. */
  get zwischenpunkte(): Hx[] {
    return this.enden.slice(1).map((n) => ({ ...this._pfad[n - 1] }));
  }
  /** Kurzform für Vergleiche (Vorschau-Zwischenspeicher). */
  get sig(): string { return this._pfad.map((h) => `${h.q},${h.r}`).join(';'); }

  beginne(h: Hx): void {
    this._pfad = [{ q: h.q, r: h.r }];
    this.enden = [1];
  }

  leeren(): void {
    this._pfad = [];
    this.enden = [];
  }

  /** Teilstück anhängen: muss am letzten Punkt beginnen, aus benachbarten, noch unbenutzten Hexen bestehen und in WEG_MAX passen. */
  haengeAn(abschnitt: readonly Hx[]): boolean {
    if (!this.aktiv || abschnitt.length < 2) return false;
    const l = this._pfad[this._pfad.length - 1];
    if (abschnitt[0].q !== l.q || abschnitt[0].r !== l.r) return false;
    if (abschnitt.length - 1 > this.rest) return false;
    const benutzt = new Set(this._pfad.map((h) => `${h.q},${h.r}`));
    for (let i = 1; i < abschnitt.length; i++) {
      const k = `${abschnitt[i].q},${abschnitt[i].r}`;
      if (benutzt.has(k) || hexAbstand(abschnitt[i - 1], abschnitt[i]) !== 1) return false;
      benutzt.add(k);
    }
    for (let i = 1; i < abschnitt.length; i++) this._pfad.push({ q: abschnitt[i].q, r: abschnitt[i].r });
    this.enden.push(this._pfad.length);
    return true;
  }

  /** Letzten Zwischenpunkt samt Teilstück entfernen; der Start bleibt. */
  zurueck(): boolean {
    if (this.enden.length < 2) return false;
    this.enden.pop();
    this._pfad.length = this.enden[this.enden.length - 1];
    return true;
  }

  /** Ist der Hex schon Teil des offenen Wegs? */
  benutzt(h: Hx): boolean {
    return this._pfad.some((p) => p.q === h.q && p.r === h.r);
  }
}

/**
 * Welche der sechs Nachbarn des letzten Punkts sind als nächster Schritt gültig? `abschnitt(von, nach)` liefert das Teilstück
 * (Simulation: wegAbschnitt mit Schrittgrenze 1); gültig ist ein Nachbar, wenn genau ein Schritt herauskommt.
 */
export function naechsteSchritte(weg: OffenerWeg, abschnitt: (von: Hx, nach: Hx) => Hx[] | null): Hx[] {
  const l = weg.letzter;
  if (!l || weg.rest < 1) return [];
  return nachbarn(l).filter((n) => !weg.benutzt(n) && abschnitt(l, n)?.length === 2);
}
