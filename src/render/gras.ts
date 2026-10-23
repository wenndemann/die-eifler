// Lebendige Eifel: Grasbüschel auf Wiesen, Heide und Moor rund um den Blickpunkt (auch in der Kulisse), die im Wind wiegen. Lage fest
// aus einem Raster (Hash je Zelle), auf belegten Hexen (Gebäude samt Nachbarn, Fahnen, Wege) keine. Ein Draw-Call; neu gelegt, wenn
// der Blickpunkt weiterwandert. Reiner Schmuck, kein Spielzustand. Werte in data/leben.json (gras).
import * as THREE from 'three';
import leben from '../../data/leben.json';
import type { MapData } from '../map/mapdata';
import type { HexGrid } from '../map/hex';
import type { SimSicht } from '../sim/typen';
import { GEBAEUDE } from '../sim/daten';
import { Instanzen } from './instanzen';
import { kulisseUniforms } from './kulisse';

const G = leben.gras;

/** Ein Büschel aus schmalen, leicht gebogenen Halmen (Spitze hell, Fuß dunkel), Höhe 1. */
function buescheGeo(): THREE.BufferGeometry {
  const pos: number[] = [], col: number[] = [];
  // dichtes, weiches Büschel (Stil: gemalt, nicht stachelig): viele breite, kurze Halme, außen niedriger und stärker geneigt
  const n = 11;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + i * 0.7, r = 0.08 + (i % 3) * 0.1, h = 0.55 + ((i * 37) % 10) / 22 - r * 0.6;
    const bx = Math.cos(a) * r, bz = Math.sin(a) * r, nx = Math.cos(a) * (0.25 + r), nz = Math.sin(a) * (0.25 + r);
    const w = 0.13, px = -Math.sin(a) * w, pz = Math.cos(a) * w;
    // zwei Dreiecke je Halm: breit unten, spitz oben, nach außen geneigt
    const mx = bx + nx * 0.5, mz = bz + nz * 0.5, my = h * 0.55;
    pos.push(bx - px, 0, bz - pz, bx + px, 0, bz + pz, mx + px * 0.6, my, mz + pz * 0.6);
    pos.push(bx - px, 0, bz - pz, mx + px * 0.6, my, mz + pz * 0.6, mx - px * 0.6, my, mz - pz * 0.6);
    pos.push(mx - px * 0.6, my, mz - pz * 0.6, mx + px * 0.6, my, mz + pz * 0.6, bx + nx, h, bz + nz);
    for (let k = 0; k < 9; k++) {
      const y = [0, 0, my, 0, my, my, my, my, h][k] / h;
      col.push(0.7 + 0.32 * y, 0.72 + 0.3 * y, 0.62 + 0.2 * y);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  // Normalen nach oben biegen: Gras wird von oben beleuchtet wie der Boden (kein dunkles Flackern der Rückseiten)
  const nrm = g.attributes.normal as THREE.BufferAttribute;
  for (let i = 0; i < nrm.count; i++) nrm.setXYZ(i, nrm.getX(i) * 0.3, 1, nrm.getZ(i) * 0.3);
  return g;
}

const hash = (a: number, b: number) => { const x = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return x - Math.floor(x); };
/** Farben je Bewuchs (COVER in src/welt/format.ts): Wiese, Heide, Moor, Siedlung (die heutigen Häuser fehlen, dort ist Wiese). */
const FARBE: Record<number, THREE.Color> = { 1: new THREE.Color('#86b552'), 4: new THREE.Color('#9c9258'), 5: new THREE.Color('#b0a660'), 7: new THREE.Color('#8cb856'), 2: new THREE.Color('#c2b26a') };
/** Dichte je Bewuchs (Anteil von gras.dichte): auf dem Acker nur Stoppeln am Rand, im Ort weniger. */
const DICHTE: Record<number, number> = { 1: 1, 4: 0.8, 5: 0.9, 7: 0.6, 2: 0.15 };

export class Gras {
  readonly group = new THREE.Group();
  readonly uniforms = { uTime: { value: 0 }, uWind: { value: 0.2 }, uHerbst: { value: 0 } };
  private satz: Instanzen;
  private mitte = { x: NaN, z: NaN };
  private sig = '';
  private belegt = new Set<number>();
  private m = new THREE.Matrix4(); private q = new THREE.Quaternion(); private p = new THREE.Vector3(); private s = new THREE.Vector3();
  private Y = new THREE.Vector3(0, 1, 0); private c = new THREE.Color();
  anzahl = 0;

  constructor(private map: MapData, private grid: HexGrid, private base: number, private ex: number) {
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, side: THREE.DoubleSide });
    mat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, this.uniforms, { uSchnee: kulisseUniforms.uSchnee });
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uTime; uniform float uWind;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
#ifdef USE_INSTANCING
{
  vec3 ip = instanceMatrix[3].xyz;
  float boe = 0.5 + 0.5 * sin(uTime * 0.9 - ip.x * 0.01 - ip.z * 0.008);
  float w = (0.12 + uWind * (0.25 + 0.35 * boe)) * position.y * position.y;
  transformed.x += (sin(uTime * (1.8 + uWind * 2.0) + ip.x * 0.11 + ip.z * 0.07) * 0.6 + 0.6 * uWind * boe) * w;
  transformed.z += sin(uTime * 1.3 + ip.z * 0.13) * 0.4 * w;
}
#endif`);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform float uSchnee; uniform float uHerbst;')
        .replace('#include <color_fragment>', `#include <color_fragment>
diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(1.25, 1.05, 0.55), uHerbst * 0.6);
diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.93, 0.94, 0.95), clamp(uSchnee * 0.8, 0.0, 0.9));`);
    };
    this.satz = new Instanzen(this.group, buescheGeo(), mat, true, false, [], G.max);
    this.satz.mesh.receiveShadow = true;
  }

  setExaggeration(ex: number) { this.ex = ex; this.sig = ''; }

  /** Belegte Hexe aus der Sicht (wie die Wiesen-Deko) und Blickpunkt; legt neu, wenn er weit genug gewandert ist. */
  update(sicht: SimSicht, ziel: { x: number; z: number }, abstand: number, dt: number, wind: number, herbst: number): void {
    this.uniforms.uTime.value += dt;
    this.uniforms.uWind.value += (Math.max(0.15, wind) - this.uniforms.uWind.value) * Math.min(1, dt * 0.5);
    this.uniforms.uHerbst.value = herbst;
    // aus großer Höhe sieht man kein einzelnes Gras
    this.group.visible = abstand < G.bis_abstand_m && kulisseUniforms.uSchnee.value < 0.9;
    if (!this.group.visible) return;
    const sig = `${sicht.gebaeude.length}:${sicht.fahnen.length}:${sicht.segmente.length}:${this.map.groundRev}:${this.ex}`;
    const weg = Math.hypot(ziel.x - this.mitte.x, ziel.z - this.mitte.z);
    if (sig === this.sig && !(weg > G.neu_ab_m)) return;
    if (sig !== this.sig) {
      this.sig = sig;
      const b = this.belegt; b.clear();
      const idx = (h: { q: number; r: number }) => this.grid.feld.index(h.q, h.r);
      // nur das eigene Hex (große Gebäude samt Nachbarn): ums Haus herum wächst Gras, das macht die Nahansicht lebendig
      const nb = [[0, 0], [1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
      for (const g of sicht.gebaeude) for (const [dq, dr] of (GEBAEUDE[g.typ]?.groesse ?? 1) > 1 ? nb : nb.slice(0, 1)) b.add(idx({ q: g.q + dq, r: g.r + dr }));
      for (const f of sicht.fahnen) b.add(idx(f));
      for (const s of sicht.segmente) for (const h of s.pfad) b.add(idx(h));
      for (const o of sicht.orte) b.add(idx(o));
    }
    this.mitte = { x: ziel.x, z: ziel.z };
    this.legen();
  }

  private legen(): void {
    const { x: cx, z: cz } = this.mitte, R = G.radius_m, zelle = G.zelle_m;
    this.satz.beginne();
    let n = 0;
    const i0 = Math.floor((cx - R) / zelle), i1 = Math.floor((cx + R) / zelle), j0 = Math.floor((cz - R) / zelle), j1 = Math.floor((cz + R) / zelle);
    for (let j = j0; j <= j1 && n < G.max; j++) {
      for (let i = i0; i <= i1 && n < G.max; i++) {
        const h = hash(i, j);
        if (h > G.dichte) continue;
        const x = (i + hash(j, i)) * zelle, z = (j + hash(i + 7, j - 3)) * zelle;
        const d = Math.hypot(x - cx, z - cz);
        if (d > R) continue;
        if (x < 0 || z < 0 || x >= this.map.sizeX || z >= this.map.sizeZ) continue;
        const cov = this.map.coverAt(x, z), f = FARBE[cov];
        if (!f || h > G.dichte * (DICHTE[cov] ?? 0)) continue;
        const hx = this.grid.fromWorld(x, z), k = this.grid.feld.index(hx.q, hx.r);
        if (k >= 0 && this.belegt.has(k)) continue;
        // zum Rand hin kleiner (weicher Übergang statt harter Kante)
        const rand = 1 - Math.max(0, (d / R - 0.75) / 0.25);
        const gr = G.hoehe_m * (0.6 + 0.8 * hash(i * 3, j * 5)) * rand;
        const y = (this.map.heightAt(x, z) - this.base) * this.ex;
        this.q.setFromAxisAngle(this.Y, h * 40);
        this.m.compose(this.p.set(x, y - 0.2, z), this.q, this.s.set(gr * 1.4, gr, gr * 1.4));
        const v = 0.82 + 0.3 * hash(j * 7, i * 11);
        this.satz.fuege(this.m, this.c.copy(f).multiplyScalar(v));
        n++;
      }
    }
    this.satz.fertig();
    this.anzahl = n;
  }
}
