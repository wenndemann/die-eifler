// Höfe und Felder (Darstellung): Felder sind Natur je Hex wie die Bäume (SimSicht.natur.feld, .feldStufe; nur lesen). Jedes
// Feld-Hex zeigt Furchen in der Bodenfarbe seiner Art und Pflanzen in Reihen, die mit dem Stadium wachsen (1 gesät … 4 reif);
// reif bekommen sie ihre Erntefarbe und Früchte (Äpfel, Trauben, Dolden, Beeren). Die Reihen laufen je Hex in eine von drei
// Richtungen (fester Hash), so entsteht ein Flickenteppich wie in Siedler 2. Werte in data/leben.json (felder).
// Wenige Draw-Calls: ein Satz je Pflanzenform, ein Satz Holz (Stangen, Stämme), ein Satz Früchte, ein Satz Furchen.
// Neu gerechnet wird nur, wenn sich ein Feld ändert (natur.rev und Vergleich mit der vorigen Kopie).
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { MapData } from '../map/mapdata';
import type { HexGrid } from '../map/hex';
import { HEX } from '../welt/format';
import type { SimSicht } from '../sim/typen';
import { FELD_ARTEN } from '../sim/daten';
import { Instanzen } from './instanzen';
import { mitSchnee } from './kulisse';
import { paint, weicheKiste } from './mockup';
import { hash } from './terrain';
import leben from '../../data/leben.json';

type Form = 'staude' | 'aehre' | 'ranke' | 'baeumchen' | 'saeule' | 'busch';
interface FeldOptik { boden: string; form: Form; jung: string; reif: string; frucht?: string; hoehe: number; abstand: number }
const OPTIK = (leben as unknown as { felder: { radius: number; furche: number; reihe: number; wuchs: number[]; arten: Record<string, FeldOptik> } }).felder;
const FORMEN: Form[] = ['staude', 'aehre', 'ranke', 'baeumchen', 'saeule', 'busch'];

const weiss = (g: THREE.BufferGeometry) => paint(g, '#ffffff');
/** Laub je Form, 1 hoch (die Instanzfarbe färbt es jung bzw. reif ein). */
function laubGeometrie(f: Form): THREE.BufferGeometry {
  const kugel = (r: number, x: number, y: number, z: number, sy = 1) => weiss(new THREE.SphereGeometry(r, 7, 5).scale(1, sy, 1).translate(x, y, z));
  switch (f) {
    case 'staude': return mergeGeometries([kugel(0.42, 0, 0.32, 0, 0.75), kugel(0.32, 0.3, 0.26, 0.12, 0.75), kugel(0.3, -0.26, 0.24, -0.14, 0.75)])!;
    case 'aehre': return mergeGeometries([-0.22, 0, 0.22].flatMap((x, i) => [
      weiss(new THREE.ConeGeometry(0.09, 0.95, 4).translate(x, 0.48, (i - 1) * 0.12)),
      weiss(new THREE.ConeGeometry(0.08, 0.8, 4).translate(x + 0.1, 0.4, (i - 1) * -0.16)),
    ]))!;
    case 'ranke': return mergeGeometries([kugel(0.2, 0, 0.45, 0, 1.6), kugel(0.18, 0, 0.75, 0, 1.3)])!;
    case 'baeumchen': return mergeGeometries([kugel(0.4, 0, 0.72, 0, 0.85), kugel(0.26, 0.2, 0.86, 0.1)])!;
    case 'saeule': return weiss(new THREE.ConeGeometry(0.22, 1, 6).translate(0, 0.5, 0));
    case 'busch': return mergeGeometries([kugel(0.36, 0, 0.42, 0), kugel(0.28, 0.28, 0.32, 0.1), kugel(0.26, -0.24, 0.3, -0.12), kugel(0.24, 0.05, 0.66, -0.05)])!;
  }
}
/** Wo an einer Pflanze (1 hoch) die Früchte sitzen und wie groß sie sind. */
function fruchtPlaetze(f: Form): [number, number, number, number][] {
  switch (f) {
    case 'baeumchen': return [[0.36, 0.68, 0.1, 0.07], [-0.3, 0.72, 0.2, 0.07], [0.1, 0.62, -0.36, 0.07], [-0.12, 0.9, -0.28, 0.07], [0.24, 0.9, 0.26, 0.07]];
    case 'ranke': return [[0.18, 0.5, 0.05, 0.08], [-0.17, 0.62, -0.05, 0.08], [0.05, 0.8, 0.16, 0.07]];
    case 'saeule': return [[0.16, 0.3, 0.06, 0.05], [-0.12, 0.45, 0.1, 0.05], [0.05, 0.6, -0.12, 0.05]];
    case 'staude': return [[0.2, 0.62, 0.1, 0.07], [-0.18, 0.56, -0.1, 0.07]];
    default: return [];
  }
}

export class Felder {
  readonly group = new THREE.Group();
  private laub = new Map<Form, Instanzen>();
  private holz: Instanzen;
  private frucht: Instanzen;
  private furchen: Instanzen;
  private rev = -1;
  private groundRev = -1;
  private pFeld: Uint8Array | null = null;
  private pStufe: Uint8Array | null = null;
  private qs: Int32Array;
  private rs: Int32Array;
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private q2 = new THREE.Quaternion();
  private p = new THREE.Vector3();
  private s = new THREE.Vector3();
  private c = new THREE.Color();
  private c2 = new THREE.Color();
  private yAchse = new THREE.Vector3(0, 1, 0);
  private zAchse = new THREE.Vector3(0, 0, 1);
  private optik: (FeldOptik | null)[];

  constructor(private map: MapData, private grid: HexGrid, private base: number, private ex: number) {
    const feld = grid.feld, n = feld.count;
    this.qs = new Int32Array(n); this.rs = new Int32Array(n);
    let i = 0;
    for (let dr = -feld.n; dr <= feld.n; dr++) {
      for (let dq = Math.max(-feld.n, -dr - feld.n); dq <= Math.min(feld.n, -dr + feld.n); dq++) { this.qs[i] = feld.q + dq; this.rs[i] = feld.r + dr; i++; }
    }
    this.optik = FELD_ARTEN.map((id) => OPTIK.arten[id] ?? null);
    const mat = mitSchnee(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }));
    for (const f of FORMEN) this.laub.set(f, new Instanzen(this.group, laubGeometrie(f), mat, true, true, [], 256));
    this.holz = new Instanzen(this.group, paint(new THREE.CylinderGeometry(0.5, 0.6, 1, 5).translate(0, 0.5, 0), '#6b4a2e'), mat, false, true, [], 128);
    this.frucht = new Instanzen(this.group, weiss(new THREE.SphereGeometry(1, 6, 5)), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6 }), true, false, [], 256);
    this.furchen = new Instanzen(this.group, weiss(weicheKiste(1, 1, 1)), mitSchnee(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }), 0.95), true, false, [], 512);
  }

  setExaggeration(ex: number) {
    if (ex === this.ex) return;
    this.ex = ex;
    this.rev = -1; this.pFeld = null;
  }

  private y(x: number, z: number) { return (this.map.heightAt(x, z) - this.base) * this.ex; }

  /** Zahl der Feld-Hexe, die gerade gezeichnet werden. */
  anzahl = 0;

  update(sicht: SimSicht) {
    const nat = sicht.natur, feld = nat.feld, stufe = nat.feldStufe;
    if (!feld || !stufe) return;
    const gr = this.map.groundRev !== this.groundRev;
    if (nat.rev === this.rev && !gr) return;
    this.rev = nat.rev; this.groundRev = this.map.groundRev;
    let neu = gr || !this.pFeld || !this.pStufe;
    if (!neu) for (let i = 0; i < feld.length; i++) if (feld[i] !== this.pFeld![i] || stufe[i] !== this.pStufe![i]) { neu = true; break; }
    this.pFeld = feld; this.pStufe = stufe;
    if (neu) this.baue(feld, stufe);
  }

  private baue(feld: Uint8Array, stufe: Uint8Array) {
    for (const l of this.laub.values()) l.beginne();
    this.holz.beginne(); this.frucht.beginne(); this.furchen.beginne();
    const { m, q, q2, p, s, c, c2, yAchse, zAchse } = this;
    const R = HEX.R * OPTIK.radius, furche = OPTIK.furche, reihe = OPTIK.reihe;
    let zahl = 0;
    for (let i = 0; i < feld.length; i++) {
      const o = feld[i] ? this.optik[feld[i] - 1] : null;
      if (!o) continue;
      zahl++;
      const st = Math.max(1, Math.min(4, stufe[i]));
      const qi = this.qs[i], ri = this.rs[i];
      const mitte = this.grid.toWorld({ q: qi, r: ri });
      // Reihen in eine von drei Richtungen (je Hex fest)
      const a = (Math.floor(hash(qi * 5 + 3, ri * 7 + 1) * 3) * Math.PI) / 3 + 0.1;
      const ux = Math.cos(a), uz = Math.sin(a), vx = -uz, vz = ux;
      // Furchen: Erdstreifen quer über das Hex, in Stücken, die dem Gelände folgen
      c.set(o.boden);
      for (let k = -Math.floor(R / reihe); k <= Math.floor(R / reihe); k++) {
        const v = k * reihe, halb = Math.sqrt(Math.max(0, R * R - v * v));
        if (halb < furche) continue;
        const stuecke = Math.max(1, Math.round((2 * halb) / 14)), len = (2 * halb) / stuecke;
        for (let j = 0; j < stuecke; j++) {
          const u0 = -halb + j * len, u1 = u0 + len;
          const x0 = mitte.x + ux * u0 + vx * v, z0 = mitte.z + uz * u0 + vz * v;
          const x1 = mitte.x + ux * u1 + vx * v, z1 = mitte.z + uz * u1 + vz * v;
          const y0 = this.y(x0, z0), y1 = this.y(x1, z1);
          q.setFromAxisAngle(yAchse, -a).multiply(q2.setFromAxisAngle(zAchse, Math.atan2(y1 - y0, len)));
          // Furche und Zwischenreihe abwechselnd heller und dunkler (gezogene Reihen wie im Bilderbuch)
          s.set(Math.hypot(len, y1 - y0) + 0.8, k & 1 ? 0.7 : 1.0, furche);
          m.compose(p.set((x0 + x1) / 2, (y0 + y1) / 2 + 0.15, (z0 + z1) / 2), q, s);
          this.furchen.fuege(m, c2.copy(c).multiplyScalar((k & 1 ? 0.84 : 1.02) + hash(i * 13 + k, j) * 0.08));
        }
      }
      // Pflanzen auf den Furchen
      const w = OPTIK.wuchs[st] ?? 1, hoch = o.hoehe * w;
      if (hoch <= 0.05) continue;
      const satz = this.laub.get(o.form)!;
      c.set(o.jung).lerp(c2.set(o.reif), st >= 4 ? 1 : (st - 1) / 3);
      const fr = st >= 4 && o.frucht ? fruchtPlaetze(o.form) : [];
      for (let k = -Math.floor(R / o.abstand); k <= Math.floor(R / o.abstand); k++) {
        const v = Math.round((k * o.abstand) / reihe) * reihe, halb = Math.sqrt(Math.max(0, R * R - v * v)) - o.abstand * 0.4;
        for (let u = -halb + ((k & 1) * o.abstand) / 2; u <= halb; u += o.abstand) {
          const z0 = hash(qi * 31 + k * 7 + Math.round(u), ri * 17 + 3);
          const x = mitte.x + ux * u + vx * v + (z0 - 0.5) * 1.5, z = mitte.z + uz * u + vz * v + (hash(i, Math.round(u) + 9) - 0.5) * 1.5;
          const y = this.y(x, z) + 0.6;
          const gr = hoch * (0.85 + z0 * 0.3);
          q.setFromAxisAngle(yAchse, z0 * Math.PI * 2);
          if (o.form === 'ranke') {
            // Stange bzw. Pfahl, die Ranke daran
            s.set(0.5, o.hoehe * (st >= 2 ? 1 : 0.6), 0.5);
            m.compose(p.set(x, y, z), q, s);
            this.holz.fuege(m);
          } else if (o.form === 'baeumchen') {
            s.set(gr * 0.12, gr * 0.5, gr * 0.12);
            m.compose(p.set(x, y, z), q, s);
            this.holz.fuege(m);
          }
          s.set(gr, gr, gr);
          m.compose(p.set(x, y, z), q, s);
          satz.fuege(m, c2.copy(c).multiplyScalar(0.92 + z0 * 0.16));
          if (fr.length) {
            const fc = c2.set(o.frucht!);
            for (const [fx, fy, fz, fs] of fr) {
              const ax = fx * Math.cos(z0 * 6.28) - fz * Math.sin(z0 * 6.28), az = fx * Math.sin(z0 * 6.28) + fz * Math.cos(z0 * 6.28);
              s.setScalar(gr * fs);
              m.compose(p.set(x + ax * gr, y + fy * gr, z - az * gr), q, s);
              this.frucht.fuege(m, fc);
            }
          }
        }
      }
    }
    for (const l of this.laub.values()) l.fertig();
    this.holz.fertig(); this.frucht.fertig(); this.furchen.fertig();
    this.anzahl = zahl;
  }
}
