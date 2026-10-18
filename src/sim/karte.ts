// Die Simulation liest von der Karte nur diese Felder: Begehbarkeit, Bauplatz, Höhe, Nachbarn.
import { FLAG } from '../welt/format';
import { GEFAELLE_DM, SCHRITT_EBENE, STEIGUNG_DM } from './daten';
import type { KarteDaten } from './typen';

/** Nachbar-Richtungen (axial). */
export const RICHTUNGEN: readonly (readonly [number, number])[] = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];

export class SimKarte {
  readonly q: number;
  readonly r: number;
  readonly n: number;
  readonly count: number;
  /** Hex-Koordinaten je Index. */
  readonly qs: Int32Array;
  readonly rs: Int32Array;
  /** Nachbarn je Hex: 6 Einträge (Richtung wie RICHTUNGEN), -1 außerhalb. */
  readonly nachbarn: Int32Array;
  /** 1 = Träger können den Hex betreten (alles außer Wasser). */
  readonly begehbar: Uint8Array;
  /** Bauplatz 0 keiner … 3 groß; Wasser, Fels und Bahn-Hexe sind 0. */
  readonly bebaubar: Uint8Array;
  readonly hoehe: Uint16Array;
  private readonly start: Int32Array;

  constructor(d: KarteDaten) {
    const n = d.n;
    this.q = d.q; this.r = d.r; this.n = n;
    this.count = 3 * n * (n + 1) + 1;
    if (d.terrain.length !== this.count || d.height.length !== this.count || d.build.length !== this.count || d.flags.length !== this.count) {
      throw new Error('Kartendaten passen nicht zum Radius');
    }
    this.start = new Int32Array(2 * n + 1);
    this.qs = new Int32Array(this.count);
    this.rs = new Int32Array(this.count);
    let s = 0;
    for (let dr = -n; dr <= n; dr++) {
      this.start[dr + n] = s;
      const a = Math.max(-n, -dr - n), b = Math.min(n, -dr + n);
      for (let dq = a; dq <= b; dq++) { this.qs[s] = d.q + dq; this.rs[s] = d.r + dr; s++; }
    }
    this.begehbar = new Uint8Array(this.count);
    this.bebaubar = new Uint8Array(this.count);
    this.hoehe = Uint16Array.from(d.height);
    for (let i = 0; i < this.count; i++) {
      const t = d.terrain[i];
      this.begehbar[i] = t === 0 ? 0 : 1;
      this.bebaubar[i] = t === 0 || t === 5 || (d.flags[i] & FLAG.bahn) ? 0 : Math.min(3, d.build[i]);
    }
    this.nachbarn = new Int32Array(this.count * 6);
    for (let i = 0; i < this.count; i++) {
      for (let k = 0; k < 6; k++) this.nachbarn[i * 6 + k] = this.index(this.qs[i] + RICHTUNGEN[k][0], this.rs[i] + RICHTUNGEN[k][1]);
    }
  }

  /** Index des Hex (q, r) oder -1 (gleiche Formel wie HexFeld.index). */
  index(q: number, r: number): number {
    const dr = r - this.r, n = this.n;
    if (dr < -n || dr > n) return -1;
    const a = Math.max(-n, -dr - n), b = Math.min(n, -dr + n);
    const dq = q - this.q;
    if (dq < a || dq > b) return -1;
    return this.start[dr + n] + dq - a;
  }

  /** Hex-Abstand in Schritten. */
  abstand(a: number, b: number): number {
    const dq = this.qs[a] - this.qs[b], dr = this.rs[a] - this.rs[b];
    return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) >> 1;
  }

  /** Ticks für einen Schritt zum Nachbar-Hex: eben 24, bergauf +1 je 5 dm, bergab +1 je 20 dm. */
  schritt(von: number, nach: number): number {
    const dh = this.hoehe[nach] - this.hoehe[von];
    return SCHRITT_EBENE + (dh > 0 ? Math.floor(dh / STEIGUNG_DM) : Math.floor(-dh / GEFAELLE_DM));
  }

  /** Laufzeit entlang einer Hex-Folge in Ticks. */
  pfadKosten(pfad: ArrayLike<number>): number {
    let c = 0;
    for (let i = 0; i + 1 < pfad.length; i++) c += this.schritt(pfad[i], pfad[i + 1]);
    return c;
  }
}
