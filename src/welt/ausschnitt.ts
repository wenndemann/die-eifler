// Ausschnitt aus den Weltkacheln schneiden (Drehbuch 3.1 / 8.1, FORMAT.md): Spielfeld = großes Hex,
// dazu 2000 m Kulisse. Ein gemeinsames 10-m-Gitter, Ursprung auf dem 10-m-Raster der Welt.
import {
  GROESSEN, HEX, KACHEL, KULISSE, WELT,
  type AusschnittParam, type Manifest, type OrtEintrag, type OrtWunsch,
} from './format';
import { bigHexBounds, hexDistance, hexTileIndex, hexToWorld, hexesInRadius, hexCount, toOffset } from './hexwelt';
import { holeBytes, holeJson, sha256, type Welt } from './laden';
import { pruefsumme, type HexWerte } from './pruefsumme';

export const ZELLE = 10;
/** Rand um das Spielfeld, der aus den feinen r10-Kacheln kommt (Meter). */
export const RAND10 = 300;
/** Breite (in Zellen) des Übergangs von r10 zu r40. */
const UEBERGANG = 15;

export type Fortschritt = (text: string, anteil: number) => void;

export interface Rechteck { x0: number; z0: number; x1: number; z1: number }

/** Fließgewässer: p = [x, z, Spiegel, ...] in Ausschnitt-Koordinaten. */
export interface Fluss { n: string; k: number; w: number; p: number[] }
export interface See { n: string; l: number; o: number[]; h: number[][] }
/** Bahnstrecke: p = [x, z, y, ...] in Ausschnitt-Koordinaten. */
export interface Bahn { n: string; p: number[] }

export interface AusschnittOrt {
  name: string; kind: 'stadt' | 'dorf' | 'weiler' | 'gewaesser';
  x: number; z: number; q: number; r: number; land: number; bei: string; imSpielfeld: boolean;
}

/** Simulationsdaten des Spielfelds als Ganzzahl-Arrays, Reihenfolge r aufsteigend, dann q. */
export class HexFeld {
  readonly count: number;
  readonly terrain: Uint8Array;
  readonly height: Uint16Array;
  readonly slope: Uint8Array;
  readonly build: Uint8Array;
  readonly flags: Uint8Array;
  readonly country: Uint8Array;
  readonly place: Uint16Array;
  private readonly start: Int32Array;

  constructor(readonly q: number, readonly r: number, readonly n: number) {
    this.count = hexCount(n);
    this.terrain = new Uint8Array(this.count);
    this.height = new Uint16Array(this.count);
    this.slope = new Uint8Array(this.count);
    this.build = new Uint8Array(this.count);
    this.flags = new Uint8Array(this.count);
    this.country = new Uint8Array(this.count);
    this.place = new Uint16Array(this.count);
    this.start = new Int32Array(2 * n + 1);
    let s = 0;
    for (let dr = -n; dr <= n; dr++) {
      this.start[dr + n] = s;
      s += Math.min(n, -dr + n) - Math.max(-n, -dr - n) + 1;
    }
  }

  /** Index des Hex (q, r) im Spielfeld oder -1. */
  index(q: number, r: number): number {
    const dr = r - this.r, n = this.n;
    if (dr < -n || dr > n) return -1;
    const a = Math.max(-n, -dr - n), b = Math.min(n, -dr + n);
    const dq = q - this.q;
    if (dq < a || dq > b) return -1;
    return this.start[dr + n] + dq - a;
  }

  *werte(): Generator<HexWerte> {
    for (let i = 0; i < this.count; i++) {
      yield { terrain: this.terrain[i], height: this.height[i], slope: this.slope[i], build: this.build[i],
        flags: this.flags[i], country: this.country[i], place: this.place[i] };
    }
  }
}

/** Ortskern-Hex im Spielfeld (Mitte in Ausschnitt-Koordinaten). */
export interface Ortskern { q: number; r: number; x: number; z: number; name: string; kind: 'stadt' | 'dorf' | 'weiler' }

export interface Ausschnitt {
  kerne: Ortskern[];
  param: AusschnittParam;
  angefragt: AusschnittParam;
  geklemmt: boolean;
  radius: number;
  /** Ursprung des Gitters in Weltmetern (Vielfache von 10). */
  originX: number;
  originZ: number;
  breite: number;
  hoehe: number;
  cell: number;
  ground: Float32Array;
  water: Float32Array;
  cover: Uint8Array;
  hex: HexFeld;
  pruefsumme: string;
  rivers: Fluss[];
  lakes: See[];
  rails: Bahn[];
  /** Staatsgrenze als Linien [x, z, ...] in Ausschnitt-Koordinaten. */
  grenze: number[][];
  orte: AusschnittOrt[];
  heightMin: number;
  heightMax: number;
  /** Spielfeld-Rechteck (ohne Kulisse) in Ausschnitt-Koordinaten. */
  spielfeld: Rechteck;
}

// ---------------------------------------------------------------- Kacheln und Klemmen

const tileSets = new WeakMap<Manifest, { r: Set<number>; h: Set<number> }>();
function sets(m: Manifest) {
  let s = tileSets.get(m);
  if (!s) {
    s = { r: new Set(m.kacheln.map(([x, z]) => z * 1000 + x)), h: new Set(m.hex.kacheln.map(([x, z]) => z * 1000 + x)) };
    tileSets.set(m, s);
  }
  return s;
}

/** Rechteck, das Spielfeld samt Kulisse deckt (Weltmeter). */
export function datenRechteck(q: number, r: number, n: number): Rechteck {
  const b = bigHexBounds(q, r, n);
  return { x0: b.x0 - KULISSE, z0: b.z0 - KULISSE, x1: b.x1 + KULISSE, z1: b.z1 + KULISSE };
}

function kachelBereich(b: Rechteck) {
  const k = KACHEL.m;
  return { tx0: Math.floor(b.x0 / k), tx1: Math.floor((b.x1 - 1e-6) / k), tz0: Math.floor(b.z0 / k), tz1: Math.floor((b.z1 - 1e-6) / k) };
}

/** Liegen Spielfeld, Kulisse und alle Spielfeld-Hexe in den gebauten Kacheln? */
export function ausschnittMoeglich(m: Manifest, q: number, r: number, size: AusschnittParam['size']): boolean {
  const n = GROESSEN[size];
  const b = datenRechteck(q, r, n);
  if (b.x0 < 0 || b.z0 < 0 || b.x1 > WELT.SX || b.z1 > WELT.SZ) return false;
  const s = sets(m);
  const t = kachelBereich(b);
  for (let tz = t.tz0; tz <= t.tz1; tz++) for (let tx = t.tx0; tx <= t.tx1; tx++) if (!s.r.has(tz * 1000 + tx)) return false;
  // Hex-Kacheln: je Zeile von der ersten bis zur letzten Spalte
  for (let dr = -n; dr <= n; dr++) {
    const a = Math.max(-n, -dr - n), z = Math.min(n, -dr + n);
    const row = r + dr;
    if (row < 0 || row >= HEX.rows) return false;
    const c0 = toOffset(q + a, row).col, c1 = toOffset(q + z, row).col;
    if (c0 < 0 || c1 >= HEX.cols) return false;
    const hz = Math.floor(row / HEX.tile);
    for (let hx = Math.floor(c0 / HEX.tile); hx <= Math.floor(c1 / HEX.tile); hx++) if (!s.h.has(hz * 1000 + hx)) return false;
  }
  return true;
}

/**
 * Schiebt den Mittel-Hex nach innen, bis Spielfeld und Kulisse in den gebauten Kacheln liegen
 * (Drehbuch 3.1 „Weltrand“). Liefert den nächstgelegenen zulässigen Mittel-Hex.
 */
export function klemmeAusschnitt(m: Manifest, p: AusschnittParam): AusschnittParam {
  if (ausschnittMoeglich(m, p.q, p.r, p.size)) return { ...p };
  const o = hexToWorld(p.q, p.r);
  const dirs = [[1, 0], [0, 1], [-1, 1], [-1, 0], [0, -1], [1, -1]];
  let best: { q: number; r: number; d: number } | null = null;
  let seit = 0;
  for (let d = 1; d < 1600 && seit < 3; d++) {
    if (best) seit++;
    let q = p.q + dirs[4][0] * d, r = p.r + dirs[4][1] * d;
    for (let k = 0; k < 6; k++) {
      for (let s = 0; s < d; s++) {
        if (ausschnittMoeglich(m, q, r, p.size)) {
          const w = hexToWorld(q, r);
          const dist = Math.hypot(w.x - o.x, w.z - o.z);
          if (!best || dist < best.d) best = { q, r, d: dist };
        }
        q += dirs[k][0]; r += dirs[k][1];
      }
    }
  }
  if (!best) throw new Error('Kein passender Ausschnitt in den gebauten Kacheln dieser Datenversion.');
  return { ...p, q: best.q, r: best.r };
}

/**
 * Startort zum Wunsch-Ort: der Ortskern auf dem Hex des Orts, sonst der gleichnamige Kern in der Nähe, sonst der nächste Kern.
 * Liegt der Wunsch-Ort nicht im Spielfeld (Mitte q/r, Radius n), gibt es keinen (undefined).
 */
export function wunschKern(kerne: readonly { q: number; r: number; name: string }[], w: OrtWunsch | undefined, q: number, r: number, n: number): string | undefined {
  if (!w || hexDistance(w, { q, r }) > n) return undefined;
  const benannt = kerne.filter((k) => k.name);
  const ab = (k: { q: number; r: number }) => hexDistance(k, w);
  const naechster = (l: typeof benannt) => l.reduce<(typeof benannt)[number] | undefined>((b, k) => (!b || ab(k) < ab(b) ? k : b), undefined);
  const gleich = naechster(benannt.filter((k) => k.name === w.name));
  if (gleich && ab(gleich) <= WUNSCH_NAH) return gleich.name;
  return naechster(benannt)?.name;
}
/** So weit (Hexe) darf ein gleichnamiger Ortskern vom Wunsch-Hex weg sein. */
const WUNSCH_NAH = 6;

// ---------------------------------------------------------------- Dekodieren

/** Zeilenweise Differenzen (FORMAT.md) in absolute Höhen zurückrechnen: laufende Summe mod 65536. */
export function dekodiereZeilen(diff: Uint16Array, n: number): Uint16Array {
  const out = new Uint16Array(diff.length);
  for (let j = 0; j < diff.length / n; j++) {
    let h = 0;
    const o = j * n;
    for (let i = 0; i < n; i++) {
      h = i === 0 ? diff[o] : (h + diff[o + i]) & 0xffff;
      out[o + i] = h;
    }
  }
  return out;
}

function u16(bytes: Uint8Array, off: number, count: number): Uint16Array {
  if (((bytes.byteOffset + off) & 1) === 0) return new Uint16Array(bytes.buffer, bytes.byteOffset + off, count);
  return new Uint16Array(bytes.slice(off, off + count * 2).buffer);
}

export interface RasterKachel { height: Uint16Array; cover: Uint8Array; water: Uint16Array }

/** Raster-Kachel (r10 oder r40) mit n×n Zellen: Höhe (Differenzen), Bedeckung, Wasserspiegel. */
export function dekodiereRaster(bytes: Uint8Array, n: number): RasterKachel {
  const c = n * n;
  if (bytes.length < c * 5) throw new Error(`Raster-Kachel zu kurz: ${bytes.length} statt ${c * 5} Bytes`);
  return {
    height: dekodiereZeilen(u16(bytes, 0, c), n),
    cover: bytes.subarray(c * 2, c * 3),
    water: u16(bytes, c * 3, c),
  };
}

const HEX_N = HEX.tile * HEX.tile;
export interface HexKachel {
  terrain: Uint8Array; height: Uint16Array; slope: Uint8Array; build: Uint8Array;
  flags: Uint8Array; country: Uint8Array; place: Uint16Array;
}

/** Hex-Kachel: Felder nacheinander (FORMAT.md). */
export function dekodiereHex(b: Uint8Array): HexKachel {
  const N = HEX_N;
  if (b.length < N * 9) throw new Error(`Hex-Kachel zu kurz: ${b.length}`);
  return {
    terrain: b.subarray(0, N), height: u16(b, N, N), slope: b.subarray(3 * N, 4 * N), build: b.subarray(4 * N, 5 * N),
    flags: b.subarray(5 * N, 6 * N), country: b.subarray(6 * N, 7 * N), place: u16(b, 7 * N, N),
  };
}

// ---------------------------------------------------------------- Vektoren

interface Linie { n: string; k?: number; w?: number; p: number[] }

/** Stücke gleichen Namens, die an einer Kachelkante enden und beginnen, wieder zusammensetzen. */
export function fuegeLinien<T extends Linie>(items: T[]): T[] {
  const key = (it: T, x: number, z: number) => `${it.n}|${it.k ?? ''}|${x.toFixed(1)},${z.toFixed(1)}`;
  const starts = new Map<string, T[]>();
  for (const it of items) {
    if (it.p.length < 6) continue;
    const kk = key(it, it.p[0], it.p[1]);
    (starts.get(kk) ?? starts.set(kk, []).get(kk)!).push(it);
  }
  const used = new Set<T>();
  const out: T[] = [];
  const endKey = (it: T) => key(it, it.p[it.p.length - 3], it.p[it.p.length - 2]);
  const hasPred = new Set<T>();
  for (const it of items) {
    if (it.p.length < 6) continue;
    const nx = starts.get(endKey(it))?.find((o) => o !== it);
    if (nx) hasPred.add(nx);
  }
  const chain = (first: T) => {
    const p = first.p.slice();
    used.add(first);
    let cur = first;
    for (;;) {
      const nx = starts.get(endKey(cur))?.find((o) => !used.has(o));
      if (!nx) break;
      used.add(nx);
      for (let i = 3; i < nx.p.length; i++) p.push(nx.p[i]);
      cur = nx;
    }
    out.push({ ...first, p });
  };
  for (const it of items) if (!used.has(it) && it.p.length >= 6 && !hasPred.has(it)) chain(it);
  for (const it of items) if (!used.has(it) && it.p.length >= 6) chain(it); // Ringe o. Ä.
  return out;
}

/** Linienzug (Schrittweite stride) auf ein Rechteck [0,w]×[0,h] zuschneiden. */
export function schneideLinie(p: number[], stride: number, w: number, h: number): number[][] {
  const res: number[][] = [];
  let cur: number[] = [];
  const flush = () => { if (cur.length >= 2 * stride) res.push(cur); cur = []; };
  const n = p.length / stride;
  for (let i = 0; i + 1 < n; i++) {
    const a = i * stride, b = a + stride;
    const dx = p[b] - p[a], dz = p[b + 1] - p[a + 1];
    let t0 = 0, t1 = 1;
    const clip = (pp: number, qq: number) => {
      if (pp === 0) return qq >= 0;
      const t = qq / pp;
      if (pp < 0) { if (t > t1) return false; if (t > t0) t0 = t; } else { if (t < t0) return false; if (t < t1) t1 = t; }
      return true;
    };
    const ok = clip(-dx, p[a]) && clip(dx, w - p[a]) && clip(-dz, p[a + 1]) && clip(dz, h - p[a + 1]);
    if (!ok || t0 >= t1) { flush(); continue; }
    const pt = (t: number) => { const o: number[] = []; for (let k = 0; k < stride; k++) o.push(p[a + k] + (p[b + k] - p[a + k]) * t); return o; };
    if (t0 > 0) flush();
    if (cur.length === 0) cur.push(...pt(t0));
    cur.push(...pt(t1));
    if (t1 < 1) flush();
  }
  flush();
  return res;
}

/** Ring (x,z,...) mit Sutherland-Hodgman auf [0,w]×[0,h] zuschneiden. */
export function schneideRing(ring: number[], w: number, h: number): number[] {
  let pts: [number, number][] = [];
  for (let i = 0; i < ring.length; i += 2) pts.push([ring[i], ring[i + 1]]);
  const planes: ((p: [number, number]) => number)[] = [
    (p) => p[0], (p) => w - p[0], (p) => p[1], (p) => h - p[1],
  ];
  for (const f of planes) {
    const out: [number, number][] = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      const fa = f(a), fb = f(b);
      if (fa >= 0) out.push(a);
      if ((fa >= 0) !== (fb >= 0)) {
        const t = fa / (fa - fb);
        out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
      }
    }
    pts = out;
    if (!pts.length) break;
  }
  return pts.flat();
}

// ---------------------------------------------------------------- Laden

async function pool(jobs: (() => Promise<void>)[], parallel = 8): Promise<void> {
  let next = 0;
  const worker = async () => {
    while (next < jobs.length) { const i = next++; await jobs[i](); }
  };
  await Promise.all(Array.from({ length: Math.min(parallel, jobs.length) }, worker));
}

const smooth = (t: number) => { t = t < 0 ? 0 : t > 1 ? 1 : t; return t * t * (3 - 2 * t); };

export async function ladeAusschnitt(welt: Welt, angefragt: AusschnittParam, fortschritt?: Fortschritt): Promise<Ausschnitt> {
  const m = welt.manifest;
  const param = klemmeAusschnitt(m, { ...angefragt, version: welt.version });
  const n = GROESSEN[param.size];
  const { q, r } = param;
  const geklemmt = q !== angefragt.q || r !== angefragt.r;

  const full = datenRechteck(q, r, n);
  const sp = bigHexBounds(q, r, n);
  const originX = Math.floor(full.x0 / ZELLE) * ZELLE, originZ = Math.floor(full.z0 / ZELLE) * ZELLE;
  const breite = Math.ceil((full.x1 - originX) / ZELLE), hoehe = Math.ceil((full.z1 - originZ) / ZELLE);
  const tb = kachelBereich(full);
  const K = KACHEL.m;

  // r10-Bereich: Spielfeld + Rand, auf das Gitter gerundet
  const a0 = Math.max(0, Math.ceil((sp.x0 - RAND10 - originX) / ZELLE)), a1 = Math.min(breite, Math.floor((sp.x1 + RAND10 - originX) / ZELLE));
  const b0 = Math.max(0, Math.ceil((sp.z0 - RAND10 - originZ) / ZELLE)), b1 = Math.min(hoehe, Math.floor((sp.z1 + RAND10 - originZ) / ZELLE));
  const t10 = kachelBereich({ x0: originX + a0 * ZELLE, z0: originZ + b0 * ZELLE, x1: originX + a1 * ZELLE, z1: originZ + b1 * ZELLE });

  // Hex-Kacheln des Spielfelds
  const hexKeys = new Set<number>();
  for (let dr = -n; dr <= n; dr++) {
    const a = Math.max(-n, -dr - n), z = Math.min(n, -dr + n);
    const c0 = toOffset(q + a, r + dr).col, c1 = toOffset(q + z, r + dr).col;
    for (let hx = Math.floor(c0 / HEX.tile); hx <= Math.floor(c1 / HEX.tile); hx++) hexKeys.add(Math.floor((r + dr) / HEX.tile) * 1000 + hx);
  }

  const ntx = tb.tx1 - tb.tx0 + 1, ntz = tb.tz1 - tb.tz0 + 1;
  let fertig = 0;
  let gesamt = 1;
  const tick = (text: string) => { fertig++; fortschritt?.(text, Math.min(0.94, fertig / gesamt)); };
  const r10Kacheln = new Map<number, RasterKachel>();
  const r40Kacheln = new Map<number, RasterKachel>();
  const vecKacheln: { rivers?: Linie[]; lakes?: { n: string; l: number; o: number[]; h: number[][] }[]; rails?: Linie[] }[] = [];
  const hexKacheln = new Map<number, HexKachel>();
  const jobs: (() => Promise<void>)[] = [];

  const pruefe = async (pfad: string, bytes: Uint8Array) => {
    const soll = m.files[pfad];
    if (!soll || typeof crypto === 'undefined' || !crypto.subtle) return;
    if ((await sha256(bytes)) !== soll) throw new Error(`Prüfsumme der Datei ${pfad} stimmt nicht (Datenversion ${welt.version}).`);
  };

  for (let tz = t10.tz0; tz <= t10.tz1; tz++) for (let tx = t10.tx0; tx <= t10.tx1; tx++) {
    jobs.push(async () => {
      r10Kacheln.set(tz * 1000 + tx, dekodiereRaster(await holeBytes(welt.datei(`r10/${tx}_${tz}.bin.gz`)), KACHEL.r10));
      tick('Gelände (fein)');
    });
  }
  for (let tz = tb.tz0; tz <= tb.tz1; tz++) for (let tx = tb.tx0; tx <= tb.tx1; tx++) {
    jobs.push(async () => {
      r40Kacheln.set(tz * 1000 + tx, dekodiereRaster(await holeBytes(welt.datei(`r40/${tx}_${tz}.bin.gz`)), KACHEL.r40));
      tick('Gelände (Kulisse)');
    });
    jobs.push(async () => {
      try { vecKacheln.push(await holeJson(welt.datei(`vec/${tx}_${tz}.json.gz`))); } catch { /* Kachel ohne Vektoren */ }
      tick('Flüsse, Seen, Bahn');
    });
  }
  for (const key of hexKeys) {
    jobs.push(async () => {
      const hx = key % 1000, hz = Math.floor(key / 1000);
      const pfad = `hex/${hx}_${hz}.bin.gz`;
      const bytes = await holeBytes(welt.datei(pfad));
      await pruefe(pfad, bytes);
      hexKacheln.set(key, dekodiereHex(bytes));
      tick('Simulationsdaten');
    });
  }
  gesamt = jobs.length;
  fortschritt?.('Weltdaten', 0);
  const grenzenJob = holeJson<number[][]>(welt.datei('uebersicht/grenzen.json')).catch(() => [] as number[][]);
  await pool(jobs);

  fortschritt?.('Gelände wird zusammengesetzt', 0.95);
  await new Promise((res) => setTimeout(res, 0));

  // --- Gitter: erst r40 bilinear (Kulisse), dann r10 darüber mit weichem Übergang
  const W = breite, H = hoehe;
  const ground = new Float32Array(W * H), water = new Float32Array(W * H), cover = new Uint8Array(W * H);
  const C4 = KACHEL.r40, mw = ntx * C4, mh = ntz * C4;
  const mx0 = tb.tx0 * K, mz0 = tb.tz0 * K;
  const H40 = new Float32Array(mw * mh), C40 = new Uint8Array(mw * mh), W40 = new Uint16Array(mw * mh);
  for (const [key, t] of r40Kacheln) {
    const tx = key % 1000 - tb.tx0, tz = Math.floor(key / 1000) - tb.tz0;
    for (let j = 0; j < C4; j++) {
      const o = (tz * C4 + j) * mw + tx * C4, s = j * C4;
      for (let i = 0; i < C4; i++) { H40[o + i] = t.height[s + i] / 10; C40[o + i] = t.cover[s + i]; W40[o + i] = t.water[s + i]; }
    }
  }
  const i0in = a0 + UEBERGANG, i1in = a1 - UEBERGANG, j0in = b0 + UEBERGANG, j1in = b1 - UEBERGANG;
  const cl = (v: number, hi: number) => (v < 0 ? 0 : v > hi ? hi : v);
  for (let j = 0; j < H; j++) {
    const wz = originZ + j * ZELLE + ZELLE / 2;
    const fz = (wz - mz0) / 40 - 0.5;
    const jf = Math.floor(fz);
    const tz = fz - jf;
    const jm0 = cl(jf, mh - 1), jm1 = cl(jf + 1, mh - 1), jn = cl(Math.round(fz), mh - 1);
    const innenZeile = j >= j0in && j < j1in;
    for (let i = 0; i < W; i++) {
      if (innenZeile && i >= i0in && i < i1in) { i = i1in - 1; continue; }
      const wx = originX + i * ZELLE + ZELLE / 2;
      const fx = (wx - mx0) / 40 - 0.5;
      const imf = Math.floor(fx), tx = fx - imf;
      const im0 = cl(imf, mw - 1), im1 = cl(imf + 1, mw - 1);
      const k = j * W + i;
      ground[k] = (H40[jm0 * mw + im0] * (1 - tx) + H40[jm0 * mw + im1] * tx) * (1 - tz)
        + (H40[jm1 * mw + im0] * (1 - tx) + H40[jm1 * mw + im1] * tx) * tz;
      const nn = jn * mw + cl(Math.round(fx), mw - 1);
      cover[k] = C40[nn];
      water[k] = W40[nn] / 10;
    }
  }
  const R10 = KACHEL.r10;
  for (const [key, t] of r10Kacheln) {
    const tx = key % 1000, tz = Math.floor(key / 1000);
    const oi = tx * R10 - originX / ZELLE, oj = tz * R10 - originZ / ZELLE;
    for (let jj = 0; jj < R10; jj++) {
      const j = oj + jj;
      if (j < b0 || j >= b1) continue;
      for (let ii = 0; ii < R10; ii++) {
        const i = oi + ii;
        if (i < a0 || i >= a1) continue;
        const k = j * W + i, s = jj * R10 + ii;
        const d = Math.min(i - a0, a1 - 1 - i, j - b0, b1 - 1 - j) + 0.5;
        const w = d >= UEBERGANG ? 1 : smooth(d / UEBERGANG);
        const h10 = t.height[s] / 10;
        ground[k] = w >= 1 ? h10 : ground[k] * (1 - w) + h10 * w;
        if (w > 0.5) { cover[k] = t.cover[s]; water[k] = t.water[s] / 10; }
      }
    }
  }
  let heightMin = Infinity, heightMax = -Infinity;
  for (let k = 0; k < ground.length; k++) { const v = ground[k]; if (v < heightMin) heightMin = v; if (v > heightMax) heightMax = v; }

  // --- Hex-Felder des Spielfelds
  const hex = new HexFeld(q, r, n);
  let hi = 0;
  for (const h of hexesInRadius(q, r, n)) {
    const t = hexTileIndex(h.q, h.r)!;
    const kt = hexKacheln.get(t.hz * 1000 + t.hx);
    if (!kt) throw new Error(`Hex-Kachel ${t.hx}_${t.hz} fehlt`);
    hex.terrain[hi] = kt.terrain[t.i]; hex.height[hi] = kt.height[t.i]; hex.slope[hi] = kt.slope[t.i];
    hex.build[hi] = kt.build[t.i]; hex.flags[hi] = kt.flags[t.i]; hex.country[hi] = kt.country[t.i]; hex.place[hi] = kt.place[t.i];
    hi++;
  }
  const summe = pruefsumme(welt.version, q, r, n, hex.werte());

  // --- Vektoren
  const wm = W * ZELLE, hm = H * ZELLE;
  const lokal = (p: number[], stride: number) => p.map((v, i) => (i % stride === 0 ? v - originX : i % stride === 1 ? v - originZ : v));
  const flussStuecke: Linie[] = [], bahnStuecke: Linie[] = [], seen: See[] = [];
  for (const v of vecKacheln) {
    for (const f of v.rivers ?? []) flussStuecke.push(f);
    for (const f of v.rails ?? []) bahnStuecke.push(f);
    for (const l of v.lakes ?? []) {
      const o = schneideRing(lokal(l.o, 2), wm, hm);
      if (o.length < 6) continue;
      seen.push({ n: l.n, l: l.l, o, h: l.h.map((h) => schneideRing(lokal(h, 2), wm, hm)).filter((h) => h.length >= 6) });
    }
  }
  const rivers: Fluss[] = [];
  for (const f of fuegeLinien(flussStuecke)) {
    for (const p of schneideLinie(lokal(f.p, 3), 3, wm, hm)) rivers.push({ n: f.n, k: f.k ?? 0, w: f.w ?? 4, p });
  }
  const rails: Bahn[] = [];
  for (const f of fuegeLinien(bahnStuecke)) {
    for (const p of schneideLinie(lokal(f.p, 3), 3, wm, hm)) rails.push({ n: f.n, p });
  }
  const grenze: number[][] = [];
  for (const l of await grenzenJob) for (const p of schneideLinie(lokal(l, 2), 2, wm, hm)) grenze.push(p);

  // --- Orte
  const kinds = welt.orte.kinds as ('stadt' | 'dorf' | 'weiler')[];
  const orte: AusschnittOrt[] = [];
  for (const o of welt.orte.orte as OrtEintrag[]) {
    const [name, kind, x, z, land, oq, or, bei] = o;
    if (x < originX || z < originZ || x >= originX + wm || z >= originZ + hm) continue;
    orte.push({ name, kind: kinds[kind] ?? 'dorf', x: x - originX, z: z - originZ, q: oq, r: or, land, bei,
      imSpielfeld: hexDistance({ q: oq, r: or }, { q, r }) <= n });
  }
  for (const [name, x, z] of welt.orte.gewaesser) {
    if (x < originX || z < originZ || x >= originX + wm || z >= originZ + hm) continue;
    orte.push({ name, kind: 'gewaesser', x: x - originX, z: z - originZ, q: 0, r: 0, land: 0, bei: '', imSpielfeld: true });
  }

  // Ortskerne des Spielfelds (Hex-Flag Ortskern); Name und Art über den Index place-1 im Ortsverzeichnis
  const kerne: Ortskern[] = [];
  hi = 0;
  for (const h of hexesInRadius(q, r, n)) {
    if (hex.flags[hi] & 1) {
      const pl = hex.place[hi];
      const e = pl ? (welt.orte.orte[pl - 1] as OrtEintrag | undefined) : undefined;
      const w = hexToWorld(h.q, h.r);
      kerne.push({ q: h.q, r: h.r, x: w.x - originX, z: w.z - originZ, name: e?.[0] ?? '', kind: e ? (kinds[e[1]] ?? 'dorf') : 'weiler' });
    }
    hi++;
  }

  fortschritt?.('Fertig', 1);
  return {
    kerne,
    param, angefragt, geklemmt, radius: n, originX, originZ, breite, hoehe, cell: ZELLE,
    ground, water, cover, hex, pruefsumme: summe, rivers, lakes: seen, rails, grenze, orte, heightMin, heightMax,
    spielfeld: { x0: sp.x0 - originX, z0: sp.z0 - originZ, x1: sp.x1 - originX, z1: sp.z1 - originZ },
  };
}
