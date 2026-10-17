// Globales Hex-Raster (FORMAT.md): pointy-top, axial (q, r), Hex (0,0) im Welt-Ursprung, odd-r-Versatz.
import { HEX } from './format';

export interface Axial { q: number; r: number }

const SQRT3 = Math.sqrt(3);
const W = SQRT3 * HEX.R;

/** Mittelpunkt in Weltmetern. */
export function hexToWorld(q: number, r: number): { x: number; z: number } {
  return { x: W * (q + r / 2), z: 1.5 * HEX.R * r };
}

/** Hex unter einem Weltpunkt. */
export function worldToHex(x: number, z: number): Axial {
  const q = ((SQRT3 / 3) * x - z / 3) / HEX.R;
  const r = ((2 / 3) * z) / HEX.R;
  return hexRound(q, r);
}

export function hexRound(q: number, r: number): Axial {
  const s = -q - r;
  let rq = Math.round(q), rr = Math.round(r);
  const rs = Math.round(s);
  const dq = Math.abs(rq - q), dr = Math.abs(rr - r), ds = Math.abs(rs - s);
  if (dq > dr && dq > ds) rq = -rr - rs;
  else if (dr > ds) rr = -rq - rs;
  return { q: rq + 0, r: rr + 0 };
}

export function toOffset(q: number, r: number): { col: number; row: number } {
  return { col: q + (r - (r & 1)) / 2, row: r };
}

export function fromOffset(col: number, row: number): Axial {
  return { q: col - (row - (row & 1)) / 2, r: row };
}

export function hexDistance(a: Axial, b: Axial): number {
  const dq = a.q - b.q, dr = a.r - b.r;
  return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
}

/** Alle Hexe mit Abstand ≤ n um (q, r), Reihenfolge r aufsteigend, dann q aufsteigend (wie die Prüfsumme). */
export function* hexesInRadius(q: number, r: number, n: number): Generator<Axial> {
  for (let dr = -n; dr <= n; dr++) {
    const q0 = Math.max(-n, -dr - n), q1 = Math.min(n, -dr + n);
    for (let dq = q0; dq <= q1; dq++) yield { q: q + dq, r: r + dr };
  }
}

/** Zahl der Hexe im Radius n. */
export const hexCount = (n: number) => 3 * n * (n + 1) + 1;

/** Umriss des Spielfelds (großes Hex aus allen Hexen mit Abstand ≤ n) als Eckpunkte in Weltmetern. */
export function bigHexOutline(q: number, r: number, n: number): { x: number; z: number }[] {
  const c = hexToWorld(q, r);
  // Die Ecken des großen Hex liegen in den 6 Nachbar-Richtungen, n Schritte weit, plus eine halbe Hex-Breite.
  const d = n * W + W / 2;
  return [0, 1, 2, 3, 4, 5].map((k) => {
    const a = (Math.PI / 3) * k;
    return { x: c.x + d * Math.cos(a), z: c.z + d * Math.sin(a) };
  });
}

/** Begrenzungsrechteck des Spielfelds in Weltmetern (ohne Kulisse). */
export function bigHexBounds(q: number, r: number, n: number) {
  const c = hexToWorld(q, r);
  const hw = n * W + W / 2;
  const hh = n * 1.5 * HEX.R + HEX.R;
  return { x0: c.x - hw, z0: c.z - hh, x1: c.x + hw, z1: c.z + hh };
}

/** Hex-Kachel und Index innerhalb der Kachel; null außerhalb der Welt. */
export function hexTileIndex(q: number, r: number): { hx: number; hz: number; i: number } | null {
  const { col, row } = toOffset(q, r);
  if (col < 0 || row < 0 || col >= HEX.cols || row >= HEX.rows) return null;
  const hx = Math.floor(col / HEX.tile), hz = Math.floor(row / HEX.tile);
  return { hx, hz, i: (row - hz * HEX.tile) * HEX.tile + (col - hx * HEX.tile) };
}
