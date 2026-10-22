// Wildtiere am Waldrand (Lebendige Eifel): Rehe, Hirsche, Wildschweine mit Frischlingen, Füchse und Hasen, selten Wildkatze und ein
// Wolfsrudel – die Eifel hat wieder Wölfe, und die Wildkatze lebt hier. Gruppen stehen auf Wiese, Heide oder Moor nahe am Wald (oder
// im lichten Wald), fern von Gebäuden und Wegen; Lage fest aus einem Raster (Hash je Zelle) um den Blickpunkt, neu gelegt, wenn er
// weiterwandert. Die Tiere ziehen langsam umher, äsen, sichern (Kopf hoch), Wildschweine wühlen, Füchse und Wölfe traben. Reiner
// Schmuck, kein Spielzustand. Werte in data/leben.json (wild).
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import leben from '../../data/leben.json';
import type { MapData } from '../map/mapdata';
import type { HexGrid } from '../map/hex';
import type { SimSicht } from '../sim/typen';
import { Instanzen } from './instanzen';
import { Kontaktschatten } from './kontakt';
import { kulisseUniforms } from './kulisse';
import { paint, weicheKiste } from './mockup';

const W = leben.wild;
export type WildArt = 'reh' | 'hirsch' | 'wildschwein' | 'frischling' | 'fuchs' | 'hase' | 'wildkatze' | 'wolf';
export const WILD_ARTEN: readonly WildArt[] = ['reh', 'hirsch', 'wildschwein', 'frischling', 'fuchs', 'hase', 'wildkatze', 'wolf'];

// ---------------------------------------------------------------- Modelle (Blick +x, Nullpunkt am Boden, Modell-Meter)

const k = (w: number, h: number, d: number, x: number, y: number, z: number, f: string, rz = 0, ry = 0) =>
  paint(weicheKiste(w, h, d).rotateZ(rz).rotateY(ry).translate(x, y, z), f);
const kugel = (r: number, x: number, y: number, z: number, f: string, sx = 1, sy = 1, sz = 1) =>
  paint(new THREE.SphereGeometry(r, 10, 7).scale(sx, sy, sz).translate(x, y, z), f);
const kegel = (r: number, h: number, x: number, y: number, z: number, f: string, rz = 0, rx = 0) =>
  paint(new THREE.ConeGeometry(r, h, 6).rotateX(rx).rotateZ(rz).translate(x, y, z), f);
/** Runde, kräftige Beine (oben dicker, unten Huf bzw. Pfote) wie bei den Figuren: keine Brettbeine. */
const beine = (out: THREE.BufferGeometry[], dx: number, dz: number, h: number, dicke: number, f: string, huf = '#2e2218') => {
  for (const [lx, lz] of [[dx, dz], [-dx, dz], [dx, -dz], [-dx, -dz]]) {
    out.push(paint(new THREE.CylinderGeometry(dicke * 0.45, dicke * 0.75, h, 8).translate(lx, h / 2 + 0.08, lz), f));
    out.push(kugel(dicke * 0.55, lx + 0.03, 0.1, lz, huf, 1.3, 0.7, 1));
  }
};
/** Comic-Augen: weißer Augapfel mit großer Pupille und Lichtpunkt, je Seite (Blick +x). */
const augen = (out: THREE.BufferGeometry[], x: number, y: number, z: number, r: number) => {
  for (const s of [1, -1]) {
    out.push(kugel(r, x, y, s * z, '#ffffff'), kugel(r * 0.6, x + r * 0.55, y, s * (z + r * 0.15), '#1b1b1b'), kugel(r * 0.2, x + r * 0.85, y + r * 0.3, s * (z + r * 0.2), '#ffffff'));
  }
};

/** Reh: schlank, rotbraun, weißer Spiegel, große Ohren. */
function reh(f = '#b0733c', geweih = false): THREE.BufferGeometry {
  const out: THREE.BufferGeometry[] = [kugel(0.55, 0, 1.45, 0, f, 1.55, 0.85, 0.75), k(0.32, 0.9, 0.3, 0.75, 1.95, 0, f, -0.45),
    kugel(0.4, 1.05, 2.4, 0, f, 1.2, 0.95, 0.9), kugel(0.17, 1.45, 2.28, 0, '#3a2a20'), kugel(0.3, -0.78, 1.5, 0, '#f6f0e4', 0.5, 0.85, 0.8),
    kegel(0.15, 0.48, 0.95, 2.82, 0.26, f, 0, 0.6), kegel(0.15, 0.48, 0.95, 2.82, -0.26, f, 0, -0.6)];
  augen(out, 1.22, 2.52, 0.24, 0.1);
  beine(out, 0.55, 0.22, 1.0, 0.26, '#7a4e2a');
  if (geweih) for (const s of [1, -1]) {
    // Geweih: Stange mit drei Enden je Seite
    out.push(k(0.08, 0.95, 0.08, 0.95, 3.05, s * 0.2, '#e2d4b0', -0.25, 0), k(0.07, 0.5, 0.07, 1.1, 3.2, s * 0.32, '#e2d4b0', -0.9),
      k(0.07, 0.45, 0.07, 0.82, 3.42, s * 0.28, '#e2d4b0', 0.5), k(0.07, 0.4, 0.07, 1.02, 3.55, s * 0.24, '#e2d4b0', -0.6));
  }
  return mergeGeometries(out)!;
}
/** Wildschwein: dunkel, keilförmig, Rüssel, Hauer, Borstenkamm. */
function wildschwein(): THREE.BufferGeometry {
  const f = '#5a4636';
  const out = [kugel(0.75, 0, 1.0, 0, f, 1.5, 0.95, 0.85), kegel(0.55, 1.0, 1.2, 0.95, 0, '#3e322a', -Math.PI / 2), k(0.14, 0.3, 0.3, 1.72, 0.92, 0, '#2a201a'),
    kugel(0.2, -0.05, 1.62, 0, '#2e2620', 4.2, 0.6, 0.6), kegel(0.04, 0.22, 1.55, 0.8, 0.14, '#f2ead8', -1.2), kegel(0.04, 0.22, 1.55, 0.8, -0.14, '#f2ead8', -1.2),
    kegel(0.12, 0.3, 0.95, 1.55, 0.22, f, 0.3), kegel(0.12, 0.3, 0.95, 1.55, -0.22, f, 0.3), 
    k(0.05, 0.35, 0.05, -1.15, 1.0, 0, '#2a201a', 0.6)];
  augen(out, 1.22, 1.22, 0.2, 0.08);
  beine(out, 0.55, 0.28, 0.5, 0.28, '#3a2e26');
  return mergeGeometries(out)!;
}
/** Frischling: klein, hellbraun mit Längsstreifen. */
function frischling(): THREE.BufferGeometry {
  const out = [kugel(0.4, 0, 0.55, 0, '#a07a4e', 1.5, 0.9, 0.85), kegel(0.28, 0.5, 0.62, 0.52, 0, '#a07a4e', -Math.PI / 2), k(0.08, 0.16, 0.16, 0.9, 0.5, 0, '#5a4030')];
  for (const s of [-0.14, 0.14]) out.push(k(1.0, 0.05, 0.06, -0.05, 0.75, s, '#e8d4a8'));
  augen(out, 0.62, 0.66, 0.13, 0.06);
  beine(out, 0.3, 0.16, 0.28, 0.16, '#5a4030');
  return mergeGeometries(out)!;
}
/** Fuchs: orange, weiße Brust, spitze Schnauze, große Ohren, buschiger Schwanz mit weißer Spitze. */
function fuchs(): THREE.BufferGeometry {
  const f = '#d9742a';
  const out = [kugel(0.4, 0, 0.85, 0, f, 1.7, 0.8, 0.75), kugel(0.3, 0.75, 1.15, 0, f), kegel(0.16, 0.5, 1.12, 1.08, 0, '#f2e8d8', -Math.PI / 2),
    kugel(0.05, 1.37, 1.08, 0, '#111'), kugel(0.22, 0.45, 0.8, 0, '#f6efe2', 0.8, 0.9, 0.8), kegel(0.12, 0.34, 0.68, 1.48, 0.15, f), kegel(0.12, 0.34, 0.68, 1.48, -0.15, f),
    kugel(0.24, -0.95, 0.75, 0, f, 2.0, 0.75, 0.75), kugel(0.15, -1.38, 0.66, 0, '#f6efe2')];
  augen(out, 0.95, 1.25, 0.13, 0.08);
  beine(out, 0.45, 0.15, 0.55, 0.18, '#3a2a20');
  return mergeGeometries(out)!;
}
/** Feldhase: graubraun, lange Ohren, Blume. */
function hase(): THREE.BufferGeometry {
  const f = '#9a8160';
  const out = [kugel(0.42, 0, 0.55, 0, f, 1.35, 0.95, 0.85), kugel(0.24, 0.5, 0.92, 0, f), k(0.1, 0.62, 0.16, 0.42, 1.38, 0.1, f, 0.25), k(0.1, 0.62, 0.16, 0.42, 1.38, -0.1, f, 0.25),
    kugel(0.12, -0.55, 0.62, 0, '#f6efe2'), k(0.5, 0.18, 0.14, 0.2, 0.1, 0.22, f), k(0.5, 0.18, 0.14, 0.2, 0.1, -0.22, f)];
  augen(out, 0.62, 1.0, 0.12, 0.07);
  return mergeGeometries(out)!;
}
/** Wildkatze: graubraun getigert, dicker Schwanz mit dunklen Ringen und stumpfer schwarzer Spitze. */
function wildkatze(): THREE.BufferGeometry {
  const f = '#8e7d62', d = '#4a3e30';
  const out = [kugel(0.42, 0, 0.8, 0, f, 1.55, 0.8, 0.8), kugel(0.3, 0.68, 1.08, 0, f), kugel(0.12, 0.92, 1.0, 0, '#d8ccb4', 1, 0.8, 1.2),
    kegel(0.11, 0.24, 0.62, 1.4, 0.15, f), kegel(0.11, 0.24, 0.62, 1.4, -0.15, f), 
    kugel(0.1, -0.05, 1.13, 0, d, 5, 0.5, 0.9)];
  // Tigerung: dunkle Querstreifen nur auf dem Rücken
  for (let i = 0; i < 4; i++) out.push(kugel(0.08, -0.42 + i * 0.27, 1.08, 0, d, 0.6, 0.45, 3.4));
  // dicker, waagrecht getragener Schwanz mit Ringen
  for (let i = 0; i < 5; i++) out.push(paint(new THREE.CylinderGeometry(0.15, 0.15, 0.17, 8).rotateZ(Math.PI / 2 - 0.25).translate(-0.72 - i * 0.17, 0.82 - i * 0.04, 0), i === 4 ? '#1e1a16' : i % 2 ? d : f));
  augen(out, 0.88, 1.16, 0.13, 0.075);
  beine(out, 0.4, 0.16, 0.5, 0.2, f, '#5a4e40');
  return mergeGeometries(out)!;
}
/** Wolf: grau mit heller Brust, lange Beine, buschiger, hängender Schwanz. */
function wolf(): THREE.BufferGeometry {
  const f = '#8a8378', h = '#d4cbbb';
  const out = [kugel(0.55, 0, 1.25, 0, f, 1.6, 0.8, 0.72), kugel(0.36, 0.9, 1.6, 0, f), kegel(0.2, 0.55, 1.35, 1.5, 0, h, -Math.PI / 2), kugel(0.06, 1.62, 1.5, 0, '#111'),
    kugel(0.3, 0.55, 1.15, 0, h, 0.8, 1, 0.8), kegel(0.13, 0.36, 0.82, 1.98, 0.17, f), kegel(0.13, 0.36, 0.82, 1.98, -0.17, f), 
    paint(new THREE.SphereGeometry(0.24, 10, 7).scale(2.2, 0.85, 0.85).rotateZ(0.75).translate(-1.05, 0.95, 0), f), kugel(0.18, -0.15, 1.62, 0, '#5a5852', 4, 0.6, 0.8)];
  augen(out, 1.12, 1.74, 0.16, 0.09);
  beine(out, 0.55, 0.2, 0.9, 0.24, '#6e685e');
  return mergeGeometries(out)!;
}
const MODELL: Record<WildArt, () => THREE.BufferGeometry> = {
  reh: () => reh(), hirsch: () => reh('#8a5630', true), wildschwein, frischling, fuchs, hase, wildkatze, wolf,
};

// ---------------------------------------------------------------- Lage und Bewegung

interface Gruppe { art: WildArt; x: number; z: number; n: number; seed: number }
const hash = (a: number, b: number) => { const x = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return x - Math.floor(x); };
const ARTEN = W.arten as Record<WildArt, { anteil: number; n: [number, number]; tempo: number; groesse: number; wald: boolean }>;

export class Wild {
  readonly group = new THREE.Group();
  private saetze = {} as Record<WildArt, Instanzen>;
  private kontakt: Kontaktschatten;
  private gruppen: Gruppe[] = [];
  private mitte = { x: NaN, z: NaN };
  private sig = '';
  private belegt = new Set<number>();
  private zeit = 0;
  private m = new THREE.Matrix4(); private q = new THREE.Quaternion(); private q2 = new THREE.Quaternion(); private p = new THREE.Vector3(); private s = new THREE.Vector3();
  private Y = new THREE.Vector3(0, 1, 0); private Z = new THREE.Vector3(0, 0, 1);
  /** Tiere zuletzt gezeichnet, je Art (Prüfskripte, Tests). */
  zahlen: Partial<Record<WildArt, number>> = {};

  constructor(private map: MapData, private grid: HexGrid, private base: number, private ex: number) {
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 });
    for (const a of WILD_ARTEN) this.saetze[a] = new Instanzen(this.group, MODELL[a](), mat, false, true, [], 16);
    this.kontakt = new Kontaktschatten(this.group, 128);
  }

  setExaggeration(ex: number) { this.ex = ex; this.sig = ''; }

  update(sicht: SimSicht, ziel: { x: number; z: number }, abstand: number, dt: number): void {
    this.zeit += dt;
    this.group.visible = abstand < W.bis_abstand_m && kulisseUniforms.uSchnee.value < 0.95;
    if (!this.group.visible) return;
    const sig = `${sicht.gebaeude.length}:${sicht.segmente.length}:${this.map.groundRev}:${this.ex}`;
    if (sig !== this.sig) {
      this.sig = sig;
      const b = this.belegt; b.clear();
      // Wild meidet Gebäude (zwei Hexe Abstand) und Wege
      const idx = (q: number, r: number) => this.grid.feld.index(q, r);
      for (const g of sicht.gebaeude) for (let dq = -2; dq <= 2; dq++) for (let dr = -2; dr <= 2; dr++) if (Math.abs(dq + dr) <= 2) b.add(idx(g.q + dq, g.r + dr));
      for (const s of sicht.segmente) for (const h of s.pfad) b.add(idx(h.q, h.r));
      for (const o of sicht.orte) for (let dq = -2; dq <= 2; dq++) for (let dr = -2; dr <= 2; dr++) b.add(idx(o.q + dq, o.r + dr));
      this.mitte = { x: NaN, z: NaN };
    }
    if (!(Math.hypot(ziel.x - this.mitte.x, ziel.z - this.mitte.z) <= W.neu_ab_m)) { this.mitte = { ...ziel }; this.legen(); }
    this.zeichnen();
  }

  /** Gruppen aus dem Raster um den Blickpunkt: Waldrand (Wiese, Heide, Moor neben Wald) bzw. Wald für Wildschweine. */
  private legen(): void {
    const { x: cx, z: cz } = this.mitte, R = W.radius_m, Z = W.zelle_m;
    this.gruppen = [];
    const arten = WILD_ARTEN.filter((a) => a !== 'frischling');
    const summe = arten.reduce((s, a) => s + ARTEN[a].anteil, 0);
    for (let j = Math.floor((cz - R) / Z); j <= Math.floor((cz + R) / Z); j++) for (let i = Math.floor((cx - R) / Z); i <= Math.floor((cx + R) / Z); i++) {
      if (hash(i * 3 + 1, j * 7 + 2) > W.anteil) continue;
      const x = (i + 0.2 + 0.6 * hash(j, i)) * Z, z = (j + 0.2 + 0.6 * hash(i + 5, j - 9)) * Z;
      if (Math.hypot(x - cx, z - cz) > R || x < 0 || z < 0 || x >= this.map.sizeX || z >= this.map.sizeZ) continue;
      const hx = this.grid.fromWorld(x, z), hk = this.grid.feld.index(hx.q, hx.r);
      if (hk >= 0 && this.belegt.has(hk)) continue;
      const cov = this.map.coverAt(x, z);
      const randWald = [0, 1, 2, 3, 4, 5].some((w) => this.map.coverAt(x + Math.cos(w) * W.rand_m, z + Math.sin(w) * W.rand_m) === 3);
      // Art nach Anteil; Wildschwein und Wildkatze auch im Wald, die anderen am Waldrand im Offenland
      let u = hash(i * 11 + 3, j * 13 + 1) * summe, art: WildArt = arten[0];
      for (const a of arten) { u -= ARTEN[a].anteil; if (u <= 0) { art = a; break; } }
      const offen = cov === 1 || cov === 4 || cov === 5 || cov === 2;
      if (!(offen && randWald) && !(ARTEN[art].wald && cov === 3)) continue;
      const [n0, n1] = ARTEN[art].n;
      this.gruppen.push({ art, x, z, n: n0 + Math.floor(hash(i, j * 3) * (n1 - n0 + 1)), seed: i * 1000 + j });
      if (this.gruppen.length >= W.max_gruppen) return;
    }
  }

  private zeichnen(): void {
    for (const a of WILD_ARTEN) this.saetze[a].beginne();
    this.kontakt.beginne();
    const zahl: Partial<Record<WildArt, number>> = {};
    const t = this.zeit, { m, q, q2, p, s } = this;
    for (const g of this.gruppen) {
      const cfg = ARTEN[g.art];
      for (let j = 0; j < g.n; j++) {
        // Wildschweine: die erste ist die Bache, dahinter Frischlinge
        const art: WildArt = g.art === 'wildschwein' && j > 0 ? 'frischling' : g.art === 'hirsch' && j > 0 ? 'reh' : g.art;
        const c = ARTEN[art];
        const ph = hash(g.seed, j) * 6.283, f1 = 0.05 + 0.04 * hash(j, g.seed), f2 = 0.06 + 0.05 * hash(g.seed + 3, j);
        // ziehen und stehen im Wechsel; Folger laufen der ersten hinterher
        const lauf = 0.5 + 0.5 * Math.sin(t * 0.09 + ph * 3);
        const tt = t * cfg.tempo * lauf * 0.3 + (j > 0 && g.art !== 'hase' ? -j * 1.2 : ph * 10);
        const rr = W.streif_m * (0.6 + 0.4 * hash(g.seed, 7));
        const lx = Math.sin(tt * f1 * 6 + ph) * rr + (j > 0 ? Math.sin(j * 2.1) * 6 : 0), lz = Math.sin(tt * f2 * 6 + ph * 2) * rr + (j > 0 ? Math.cos(j * 1.7) * 6 : 0);
        const dx = Math.cos(tt * f1 * 6 + ph) * f1, dz = Math.cos(tt * f2 * 6 + ph * 2) * f2;
        const x = g.x + lx, z = g.z + lz, y = (this.map.heightAt(x, z) - this.base) * this.ex;
        // äsen bzw. wühlen (Kopf runter), sichern (Kopf hoch) oder ziehen
        const aesen = lauf < 0.35 ? (art === 'wildschwein' || art === 'frischling' ? 0.3 : 0.4) * (0.6 + 0.4 * Math.sin(t * 2 + ph)) : 0;
        const sichern = lauf > 0.35 && lauf < 0.45 ? -0.15 : 0;
        q.setFromAxisAngle(this.Y, Math.atan2(-dz, dx)).multiply(q2.setFromAxisAngle(this.Z, -aesen - sichern + Math.sin(t * 7 * cfg.tempo + ph) * 0.03 * lauf));
        const gr = W.skala * c.groesse;
        m.compose(p.set(x, y + Math.abs(Math.sin(t * 6 * cfg.tempo + ph)) * 0.25 * lauf * gr * 0.3, z), q, s.setScalar(gr));
        this.saetze[art].fuege(m);
        this.kontakt.setze(x, y, z, 1.1 * gr, Math.atan2(-dz, dx) + Math.PI / 2, 1.5);
        zahl[art] = (zahl[art] ?? 0) + 1;
      }
    }
    for (const a of WILD_ARTEN) this.saetze[a].fertig();
    this.kontakt.fertig();
    this.zahlen = zahl;
  }

  /** Gelegte Gruppen (Prüfskripte, Tests). */
  get gruppenListe(): readonly Gruppe[] { return this.gruppen; }
}

/** Nur für Tests: alle Wildmodelle bauen (ohne Szene). */
export function wildModelle(): Record<WildArt, THREE.BufferGeometry> {
  return Object.fromEntries(WILD_ARTEN.map((a) => [a, MODELL[a]()])) as Record<WildArt, THREE.BufferGeometry>;
}
