// Bäume und Felsen aus der Simulation (M4; nur lesen aus SimSicht.natur, nie die Sim ändern).
// - Kartenwald (trees.ts) bleibt die Grundlage. Je Wald-Hex vergleicht diese Datei natur.baum mit dem Startwert (3):
//   bei weniger Bäumen blendet sie anteilig Kartenbäume dieses Hex aus (Trees.setzeHexAnteil, feste Auswahl je Hex).
// - Gepflanzte und nachgewachsene Bäume sind eigene Instanzen an festen Plätzen im Hex (Hash aus q, r), Größe nach
//   Wachstumsstufe (Setzling klein … ausgewachsen wie ein Kartenbaum). Gefällte Bäume lassen einen Baumstumpf zurück.
// - Felsbrocken (grau, kantig) auf Hexen mit natur.fels > 0: Zahl und Größe nach Restmenge, bei 0 verschwinden sie.
// Es wird nur neu gerechnet, wenn natur.rev steigt, und nur für Hexe, die sich gegenüber der vorigen Kopie geändert haben.
import * as THREE from 'three';
import type { MapData } from '../map/mapdata';
import type { HexGrid } from '../map/hex';
import { HEX } from '../welt/format';
import type { SimSicht } from '../sim/typen';
import { TREE_MAX } from '../sim/daten';
import { Instanzen } from './instanzen';
import { BAUM_SKALE } from './massstab';
import { paint } from './mockup';
import { hash } from './terrain';
import type { Trees } from './trees';

/** Startbäume je Wald-Hex in der Simulation (TREE_MAX). */
const START_WALD = TREE_MAX;
/** Größe eines Jungbaums nach Alter (Stufe 0 = ausgewachsen = 1). */
const WUCHS = [1, 0.2, 0.42, 0.72];
/** Platz im Hex, in dem Bäume und Stümpfe stehen (Anteil des Hex-Radius). */
const PLATZ = 0.58;

/** Kantiger Felsbrocken: Ikosaeder mit Rauschen (gleiche Ecke bekommt gleiches Rauschen), oben heller. */
function felsGeometrie(variante: number): THREE.BufferGeometry {
  const g = (variante === 0 ? new THREE.IcosahedronGeometry(1, 0) : new THREE.DodecahedronGeometry(1, 0)).toNonIndexed();
  const pos = g.attributes.position;
  const jit = new Map<string, [number, number, number]>();
  for (let i = 0; i < pos.count; i++) {
    const k = `${pos.getX(i).toFixed(3)},${pos.getY(i).toFixed(3)},${pos.getZ(i).toFixed(3)}`;
    let j = jit.get(k);
    if (!j) { const s = (i + 1) * 7 + variante * 131; j = [0.78 + hash(s, 1) * 0.42, 0.78 + hash(s, 2) * 0.42, 0.78 + hash(s, 3) * 0.42]; jit.set(k, j); }
    pos.setXYZ(i, pos.getX(i) * j[0], pos.getY(i) * j[1] * 0.72, pos.getZ(i) * j[2]);
  }
  g.translate(0, 0.32, 0);
  // Farbe je Fläche: Oberseite heller, Kanten dunkler
  const col = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  for (let f = 0; f < pos.count; f += 3) {
    const a = new THREE.Vector3(pos.getX(f), pos.getY(f), pos.getZ(f)), b = new THREE.Vector3(pos.getX(f + 1), pos.getY(f + 1), pos.getZ(f + 1));
    const d = new THREE.Vector3(pos.getX(f + 2), pos.getY(f + 2), pos.getZ(f + 2));
    const n = b.clone().sub(a).cross(d.clone().sub(a)).normalize();
    const hell = 0.5 + 0.5 * n.y;
    c.set('#7d776e').lerp(new THREE.Color('#b4aea2'), hell * 0.9);
    c.multiplyScalar(0.92 + hash(f, 9 + variante) * 0.16);
    for (let k = 0; k < 3; k++) { col[(f + k) * 3] = c.r; col[(f + k) * 3 + 1] = c.g; col[(f + k) * 3 + 2] = c.b; }
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.deleteAttribute('uv');
  g.computeVertexNormals();
  return g;
}

function stumpfGeometrie(): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(1.2, 1.55, 1.7, 7).translate(0, 0.85, 0);
  const oben = new THREE.CylinderGeometry(1.1, 1.1, 0.12, 7).translate(0, 1.72, 0);
  const merged = [paint(g, '#5e4430'), paint(oben, '#dcc08a')];
  const a = merged[0], b = merged[1];
  const out = new THREE.BufferGeometry();
  for (const name of ['position', 'color']) {
    const x = a.attributes[name].array as Float32Array, y = b.attributes[name].array as Float32Array;
    const m = new Float32Array(x.length + y.length);
    m.set(x); m.set(y, x.length);
    out.setAttribute(name, new THREE.BufferAttribute(m, 3));
  }
  out.computeVertexNormals();
  return out;
}

export class Natur {
  readonly group = new THREE.Group();
  private ex: number;
  private felsSaetze: Instanzen[] = [];
  private baumSaetze: Instanzen[] = [];
  private stumpf: Instanzen;
  private qs: Int32Array;
  private rs: Int32Array;
  private terrain: Uint8Array;
  private hoehe: Uint16Array;
  private rev = -1;
  private groundRev = -1;
  // Kopie der vorigen Sicht: nur geänderte Hexe neu bewerten
  private pBaum: Uint8Array | null = null;
  private pJung: Uint8Array | null = null;
  private pStufe: Uint8Array | null = null;
  private pFels: Uint8Array | null = null;
  /** Hexe mit eigenen Bäumen/Stümpfen bzw. mit Fels. */
  private baumHexe = new Set<number>();
  private felsHexe = new Set<number>();
  private baumNeu = true;
  private felsNeu = true;
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private p = new THREE.Vector3();
  private s = new THREE.Vector3();
  private farbe = new THREE.Color();
  private yAchse = new THREE.Vector3(0, 1, 0);

  constructor(private map: MapData, private grid: HexGrid, private base: number, ex: number, private trees?: Trees) {
    this.ex = ex;
    const feld = grid.feld;
    this.terrain = feld.terrain; this.hoehe = feld.height;
    const n = feld.count;
    this.qs = new Int32Array(n); this.rs = new Int32Array(n);
    let i = 0;
    for (let dr = -feld.n; dr <= feld.n; dr++) {
      for (let dq = Math.max(-feld.n, -dr - feld.n); dq <= Math.min(feld.n, -dr + feld.n); dq++) { this.qs[i] = feld.q + dq; this.rs[i] = feld.r + dr; i++; }
    }
    const fels = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, flatShading: true });
    for (let v = 0; v < 2; v++) this.felsSaetze.push(new Instanzen(this.group, felsGeometrie(v), fels, true, true, [], 256));
    if (trees) {
      for (const sp of ['fichte', 'buche'] as const) this.baumSaetze.push(new Instanzen(this.group, trees.geos[sp][0], trees.material, true, true, [], 64));
    }
    this.stumpf = new Instanzen(this.group, stumpfGeometrie(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, flatShading: true }), false, true, [], 64);
  }

  setExaggeration(ex: number) {
    if (ex === this.ex) return;
    this.ex = ex;
    this.baumNeu = this.felsNeu = true;
    this.rev = -1;   // beim nächsten update neu setzen
  }

  /** Platz Nr. k im Hex i (Ausschnitt-Meter). */
  private platz(i: number, k: number, mitte: { x: number; z: number }) {
    const a = hash(this.qs[i] * 7 + k * 3 + 1, this.rs[i] * 13 + 5) * Math.PI * 2;
    const r = HEX.R * PLATZ * Math.sqrt(0.15 + 0.85 * hash(this.qs[i] * 11 + k, this.rs[i] * 5 + k * 17 + 2));
    return { x: mitte.x + Math.cos(a) * r, z: mitte.z + Math.sin(a) * r, dreh: hash(i, k + 40) * Math.PI * 2, v: hash(i * 3 + k, 77) };
  }

  update(sicht: SimSicht) {
    const nat = sicht.natur;
    if (!nat.baum.length) return;
    const gr = this.map.groundRev !== this.groundRev;
    if (nat.rev === this.rev && !gr) return;
    const n = nat.baum.length;
    const pb = this.pBaum, pj = this.pJung, ps = this.pStufe, pf = this.pFels;
    for (let i = 0; i < n; i++) {
      const b = nat.baum[i], j = nat.jung[i], st = nat.stufe[i], f = nat.fels[i];
      const start = this.terrain[i] === 2 ? START_WALD : 0;
      const bAlt = pb ? pb[i] : start, jAlt = pj ? pj[i] : 0, sAlt = ps ? ps[i] : 0;
      if (b !== bAlt || j !== jAlt || st !== sAlt) {
        if (start && this.trees && this.trees.hexBaeume(i) > 0) this.trees.setzeHexAnteil(i, Math.min(1, b / start));
        const extra = Math.max(0, b - start) + j + (start ? Math.max(0, start - b - j) : 0);
        if (extra > 0) this.baumHexe.add(i); else this.baumHexe.delete(i);
        this.baumNeu = true;
      }
      if (pf ? f !== pf[i] : f > 0) {
        if (f > 0) this.felsHexe.add(i); else this.felsHexe.delete(i);
        this.felsNeu = true;
      }
    }
    this.trees?.uebernehme();
    this.pBaum = nat.baum; this.pJung = nat.jung; this.pStufe = nat.stufe; this.pFels = nat.fels;
    if (gr) this.baumNeu = this.felsNeu = true;
    this.rev = nat.rev;
    this.groundRev = this.map.groundRev;
    if (this.baumNeu) this.baueBaeume(nat);
    if (this.felsNeu) this.baueFelsen(nat);
    this.baumNeu = this.felsNeu = false;
  }

  private y(x: number, z: number) {
    return (this.map.heightAt(x, z) - this.base) * this.ex;
  }

  private baueBaeume(nat: SimSicht['natur']) {
    for (const s of this.baumSaetze) s.beginne();
    this.stumpf.beginne();
    const { m, q, p, s, farbe, yAchse } = this;
    for (const i of this.baumHexe) {
      const start = this.terrain[i] === 2 ? START_WALD : 0;
      const b = nat.baum[i], j = nat.jung[i], st = nat.stufe[i];
      const extra = Math.max(0, b - start);
      const stumpfe = start ? Math.max(0, start - b - j) : 0;
      const mitte = this.grid.toWorld({ q: this.qs[i], r: this.rs[i] });
      // Plätze: erst die Neupflanzungen (ausgewachsene, dann junge, älteste zuerst), Stümpfe von hinten
      let k = 0;
      const setze = (platz: number, wuchs: number, art: 'baum' | 'stumpf') => {
        const pl = this.platz(i, platz, mitte);
        q.setFromAxisAngle(yAchse, pl.dreh);
        if (art === 'stumpf') {
          s.setScalar(BAUM_SKALE * (0.9 + pl.v * 0.3));
          m.compose(p.set(pl.x, this.y(pl.x, pl.z), pl.z), q, s);
          this.stumpf.fuege(m);
          return;
        }
        const fichte = pl.v < Math.min(0.85, Math.max(0.15, (this.hoehe[i] / 10 - 380) / 250));
        s.setScalar(BAUM_SKALE * (0.8 + pl.v * 0.45) * wuchs);
        m.compose(p.set(pl.x, this.y(pl.x, pl.z), pl.z), q, s);
        this.baumSaetze[fichte ? 0 : 1].fuege(m, farbe.setScalar(0.88 + pl.v * 0.2));
      };
      if (this.baumSaetze.length) {
        for (let e = 0; e < extra; e++) setze(k++, 1, 'baum');
        for (let e = 0; e < j; e++) setze(k++, WUCHS[Math.max(1, e === 0 ? st : st - 1)] ?? WUCHS[1], 'baum');
      }
      for (let e = 0; e < stumpfe; e++) setze(TREE_MAX * 2 - 1 - e, 1, 'stumpf');
    }
    for (const sa of this.baumSaetze) sa.fertig();
    this.stumpf.fertig();
  }

  private baueFelsen(nat: SimSicht['natur']) {
    for (const s of this.felsSaetze) s.beginne();
    const { m, q, p, s, farbe, yAchse } = this;
    for (const i of this.felsHexe) {
      const f = nat.fels[i];
      if (f <= 0) continue;
      const mitte = this.grid.toWorld({ q: this.qs[i], r: this.rs[i] });
      const stuecke = Math.min(5, 1 + Math.floor(f / 3));
      const gross = 1.8 + 7 * Math.sqrt(Math.min(f, 12) / 12);
      for (let k = 0; k < stuecke; k++) {
        const a = hash(this.qs[i] * 31 + k, this.rs[i] * 17 + 7) * Math.PI * 2;
        const r = k === 0 ? HEX.R * 0.08 * hash(i, 5) : HEX.R * (0.2 + 0.34 * hash(this.qs[i] + k * 5, this.rs[i] * 3 + 11));
        const x = mitte.x + Math.cos(a) * r, z = mitte.z + Math.sin(a) * r;
        const sz = gross * (k === 0 ? 1 : 0.5 + 0.35 * hash(i + k, 21));
        q.setFromAxisAngle(yAchse, hash(i, k + 90) * Math.PI * 2);
        s.set(sz * (0.9 + 0.3 * hash(i, k + 3)), sz * (0.8 + 0.35 * hash(i, k + 4)), sz * (0.9 + 0.3 * hash(i + 1, k + 5)));
        m.compose(p.set(x, this.y(x, z) - sz * 0.12, z), q, s);
        this.felsSaetze[(i + k) % 2].fuege(m, farbe.setScalar(0.86 + 0.24 * hash(i, k + 60)));
      }
    }
    for (const sa of this.felsSaetze) sa.fertig();
  }
}
