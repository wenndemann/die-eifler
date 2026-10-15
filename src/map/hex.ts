// Hex-Mathematik: pointy-top, axiale Koordinaten (q, r), Speicherung als odd-r-Offset.
// Welt: x = Osten, z = Süden (Meter). Hex (col=0,row=0) liegt bei (√3·R/2, R).

export interface Axial { q: number; r: number }

const SQRT3 = Math.sqrt(3);

export class HexGrid {
  readonly w: number;   // Breite eines Hex (Abstand der Spalten)
  readonly ox: number;
  readonly oz: number;

  constructor(readonly size: number, readonly cols: number, readonly rows: number) {
    this.w = SQRT3 * size;
    this.ox = this.w / 2;
    this.oz = size;
  }

  toWorld(h: Axial): { x: number; z: number } {
    return { x: this.ox + this.size * SQRT3 * (h.q + h.r / 2), z: this.oz + this.size * 1.5 * h.r };
  }

  fromWorld(x: number, z: number): Axial {
    const px = x - this.ox, pz = z - this.oz;
    const q = ((SQRT3 / 3) * px - pz / 3) / this.size;
    const r = ((2 / 3) * pz) / this.size;
    return round(q, r);
  }

  toOffset(h: Axial): { col: number; row: number } {
    return { col: h.q + (h.r - (h.r & 1)) / 2, row: h.r };
  }

  fromOffset(col: number, row: number): Axial {
    return { q: col - (row - (row & 1)) / 2, r: row };
  }

  /** Index ins Hex-Array oder -1, wenn außerhalb der Karte. */
  index(h: Axial): number {
    const { col, row } = this.toOffset(h);
    if (col < 0 || row < 0 || col >= this.cols || row >= this.rows) return -1;
    return row * this.cols + col;
  }
}

function round(q: number, r: number): Axial {
  const s = -q - r;
  let rq = Math.round(q), rr = Math.round(r);
  const rs = Math.round(s);
  const dq = Math.abs(rq - q), dr = Math.abs(rr - r), ds = Math.abs(rs - s);
  if (dq > dr && dq > ds) rq = -rr - rs;
  else if (dr > ds) rr = -rq - rs;
  return { q: rq, r: rr };
}
