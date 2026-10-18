// Träger (Drehbuch 4.1, 7.1): die erste knubbelige Figur – großer Kopf, Knollennase, rote Kappe, krumme Beine,
// Siedler-2-Körper mit Comic-Einschlag. Eine Geometrie, Gliedmaßen werden im Vertex-Shader geschwenkt (Laufen,
// Wippen, Arme hoch beim Tragen), damit viele Träger in einem Draw-Call stehen. Die getragene Ware sitzt sichtbar
// über dem Kopf (eigene Instanz-Sätze je Warenart, Modelle aus waren.ts).
// Reiner Leser der SimSicht: Position zwischen den Ticks aus fortschritt + alpha·schritt, entlang der Wegkurve
// des Segments (gleiche Kurve wie wege.ts), Höhe vom Gelände, Blick in Laufrichtung.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { MapData } from '../map/mapdata';
import type { HexGrid } from '../map/hex';
import { PROMILLE, type Id, type SimSicht } from '../sim/typen';
import { paint } from './mockup';
import { Instanzen } from './instanzen';
import { TRAEGER_H, fernFaktor } from './massstab';
import { WAREN_ANZAHL, warenGeometrie } from './waren';
import { kurvenPunkt, type Pkt } from './wege';

// ---- Modell (Einheitshöhe 1, vorn = +z). Teile: 0 Rumpf, 1/2 Bein links/rechts, 3/4 Arm links/rechts.
interface Teil { geo: THREE.BufferGeometry; teil: number; gelenk: [number, number, number]; tint: number }
const teile: Teil[] = [];
const add = (geo: THREE.BufferGeometry, teil = 0, gelenk: [number, number, number] = [0, 0, 0], tint = 0) =>
  teile.push({ geo, teil, gelenk, tint });

/** Walze zwischen zwei Punkten. */
function rohr(a: [number, number, number], b: [number, number, number], r1: number, r2: number, farbe: string, seg = 6) {
  const va = new THREE.Vector3(...a), vb = new THREE.Vector3(...b);
  const d = vb.clone().sub(va), len = d.length();
  const g = new THREE.CylinderGeometry(r2, r1, len, seg);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()));
  g.translate((va.x + vb.x) / 2, (va.y + vb.y) / 2, (va.z + vb.z) / 2);
  return paint(g, farbe);
}

export function figur(): THREE.BufferGeometry {
  teile.length = 0;
  const HOSE = '#6b4a2e', STIEFEL = '#2c2118', HAUT = '#f1bf96', NASE = '#e98a73', KAPPE = '#c0392b';
  for (const [i, sx] of [[1, -1], [2, 1]] as const) {
    const hip: [number, number, number] = [sx * 0.1, 0.28, 0];
    // krumme Beine: Knie nach außen, Fuß wieder nach innen
    add(rohr(hip, [sx * 0.19, 0.15, 0.02], 0.085, 0.075, HOSE), i, hip);
    add(rohr([sx * 0.19, 0.15, 0.02], [sx * 0.13, 0.05, 0.03], 0.075, 0.065, HOSE), i, hip);
    add(paint(new THREE.BoxGeometry(0.15, 0.08, 0.24).translate(sx * 0.13, 0.04, 0.07), STIEFEL), i, hip);
  }
  // Rumpf: dicker Bauch, Gürtel
  add(paint(new THREE.SphereGeometry(0.23, 8, 6).scale(1, 1.05, 0.95).translate(0, 0.42, 0), '#ffffff'), 0, [0, 0, 0], 1);
  add(paint(new THREE.CylinderGeometry(0.235, 0.235, 0.05, 8).translate(0, 0.33, 0), '#4a3220'));
  add(paint(new THREE.BoxGeometry(0.07, 0.06, 0.02).translate(0, 0.33, 0.235), '#e8c14a'));
  // Kopf: groß, Knollennase, Augen
  add(paint(new THREE.SphereGeometry(0.235, 9, 7).translate(0, 0.74, 0), HAUT));
  add(paint(new THREE.SphereGeometry(0.085, 6, 5).scale(1, 0.95, 1.05).translate(0, 0.71, 0.235), NASE));
  for (const sx of [-1, 1]) {
    add(paint(new THREE.SphereGeometry(0.048, 5, 4).translate(sx * 0.085, 0.79, 0.2), '#ffffff'));
    add(paint(new THREE.SphereGeometry(0.024, 4, 3).translate(sx * 0.085, 0.79, 0.243), '#1b1b1b'));
    add(paint(new THREE.SphereGeometry(0.05, 5, 4).translate(sx * 0.16, 0.69, 0.14), '#f08f7a'));   // Wangen
    add(paint(new THREE.BoxGeometry(0.11, 0.02, 0.02).rotateZ(sx * 0.2).translate(sx * 0.085, 0.845, 0.215), '#5a3b26'));   // Brauen
  }
  add(paint(new THREE.BoxGeometry(0.2, 0.05, 0.03).translate(0, 0.64, 0.215), '#b5835a'));  // Schnauzer
  // Kappe mit Schirm und Bommel
  add(paint(new THREE.SphereGeometry(0.255, 9, 5, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, 0.79, 0), KAPPE));
  add(paint(new THREE.BoxGeometry(0.3, 0.035, 0.16).translate(0, 0.8, 0.22), '#8f2a20'));
  add(paint(new THREE.SphereGeometry(0.06, 5, 4).translate(0, 1.05, 0), '#f3e9d2'));
  // Arme: Gelenk an der Schulter, Hand als Kugel
  for (const [i, sx] of [[3, -1], [4, 1]] as const) {
    const sch: [number, number, number] = [sx * 0.25, 0.54, 0];
    add(rohr(sch, [sx * 0.32, 0.3, 0.03], 0.065, 0.06, '#ffffff'), i, sch, 1);
    add(paint(new THREE.SphereGeometry(0.07, 5, 4).translate(sx * 0.32, 0.27, 0.03), HAUT), i, sch);
  }
  const geos = teile.map((t) => {
    const g = t.geo;
    const n = g.attributes.position.count;
    g.setAttribute('aTeil', new THREE.BufferAttribute(new Float32Array(n).fill(t.teil), 1));
    g.setAttribute('aGelenk', new THREE.BufferAttribute(new Float32Array(n * 3).map((_, k) => t.gelenk[k % 3]), 3));
    g.setAttribute('aTint', new THREE.BufferAttribute(new Float32Array(n).fill(t.tint), 1));
    return g;
  });
  return mergeGeometries(geos)!;
}

const TRACHT = ['#3f6fb5', '#b5463f', '#4f8a4a', '#d0a030', '#7a4fa0', '#3a8a8a', '#d9d2c0', '#c8642f'].map((c) => new THREE.Color(c));

export function material(): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, flatShading: true });
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
attribute float aTeil; attribute vec3 aGelenk; attribute float aTint; attribute vec3 aAnim;`)
      .replace('#include <color_vertex>', `#include <color_vertex>
#ifdef USE_INSTANCING_COLOR
vColor.xyz = mix(color.xyz, color.xyz * instanceColor.xyz, aTint);
#endif`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
{
  float sw = sin(aAnim.x) * 0.75 * aAnim.z;
  float ang = 0.0;
  if (aTeil > 0.5 && aTeil < 1.5) ang = sw;
  else if (aTeil > 1.5 && aTeil < 2.5) ang = -sw;
  else if (aTeil > 2.5 && aTeil < 3.5) ang = mix(-sw * 0.9, -2.75 - sw * 0.08, aAnim.y);
  else if (aTeil > 3.5) ang = mix(sw * 0.9, -2.75 + sw * 0.08, aAnim.y);
  if (aTeil > 0.5) {
    vec3 pp = transformed - aGelenk;
    float c = cos(ang), s = sin(ang);
    transformed = vec3(pp.x, pp.y * c - pp.z * s, pp.y * s + pp.z * c) + aGelenk;
  }
  // Wippen und leichtes Hin-und-Her-Schaukeln beim Laufen
  float roll = sin(aAnim.x) * 0.07 * aAnim.z;
  float cr = cos(roll), sr = sin(roll);
  transformed.xy = vec2(transformed.x * cr - transformed.y * sr, transformed.x * sr + transformed.y * cr);
  transformed.y += abs(sin(aAnim.x)) * 0.05 * aAnim.z;
}`);
  };
  return mat;
}

interface Zustand { phase: number; yaw: number; x: number; z: number; benutzt: number }
interface Kante { pts: Pkt[]; i: number; rueck: boolean }

export class Traeger {
  readonly group = new THREE.Group();
  /** Wenn gesetzt: Figuren wachsen mit dem Kameraabstand (Lesbarkeit von weit weg). */
  kamera: THREE.Camera | null = null;
  private figuren: Instanzen;
  private waren: Instanzen[] = [];
  private zustand = new Map<Id, Zustand>();
  private kanten = new Map<string, Kante>();
  private kantenSig = '';
  private ex: number;
  private runde = 0;
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private p = new THREE.Vector3();
  private s = new THREE.Vector3();
  private yAchse = new THREE.Vector3(0, 1, 0);
  private farbe = new THREE.Color();

  constructor(private map: MapData, private grid: HexGrid, private base: number, ex: number) {
    this.ex = ex;
    this.figuren = new Instanzen(this.group, figur(), material(), true, true, [{ name: 'aAnim', size: 3 }], 256);
    const matte = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, flatShading: true });
    for (let a = 0; a < WAREN_ANZAHL; a++) this.waren.push(new Instanzen(this.group, warenGeometrie(a), matte, false, true, [], 256));
  }

  setExaggeration(ex: number) {
    this.ex = ex;
  }

  /** Kanten-Nachschlagetabelle aus den Segmenten (nur bei Änderung neu). */
  private baueKanten(sicht: SimSicht) {
    let sig = sicht.tick + ':' + sicht.segmente.length + ':' + this.map.groundRev;
    if (sig === this.kantenSig) return;
    this.kantenSig = sig;
    this.kanten.clear();
    sig = '';
    for (const s of sicht.segmente) {
      const pts = s.pfad.map((h) => this.grid.toWorld(h));
      for (let i = 0; i < s.pfad.length - 1; i++) {
        const a = s.pfad[i], b = s.pfad[i + 1];
        this.kanten.set(`${a.q},${a.r}>${b.q},${b.r}`, { pts, i, rueck: false });
        this.kanten.set(`${b.q},${b.r}>${a.q},${a.r}`, { pts, i, rueck: true });
      }
    }
  }

  private tmpA: Pkt = { x: 0, z: 0 };
  private tmpB: Pkt = { x: 0, z: 0 };

  /** Punkt auf der Strecke von → nach bei Anteil f (0..1), entlang der Wegkurve, wenn bekannt. */
  private ort(von: { q: number; r: number }, nach: { q: number; r: number }, f: number, out: Pkt): Pkt {
    const k = this.kanten.get(`${von.q},${von.r}>${nach.q},${nach.r}`);
    if (k) return kurvenPunkt(k.pts, k.i, k.rueck ? 1 - f : f, out);
    const a = this.grid.toWorld(von), b = this.grid.toWorld(nach);
    out.x = a.x + (b.x - a.x) * f; out.z = a.z + (b.z - a.z) * f;
    return out;
  }

  update(sicht: SimSicht, alpha = 0, dt = 0) {
    this.baueKanten(sicht);
    this.runde++;
    this.figuren.beginne();
    for (const w of this.waren) w.beginne();
    const { map, base, ex, m, q, p, s, farbe } = this;
    for (const t of sicht.traeger) {
      const f = Math.min(1, Math.max(0, (t.fortschritt + (t.tut === 'laeuft' ? alpha * t.schritt : 0)) / PROMILLE));
      const a = this.ort(t.von, t.nach, f, this.tmpA);
      const x = a.x, z = a.z;
      // Blickrichtung: Tangente der Kurve
      const f0 = Math.max(0, f - 0.04), f1 = Math.min(1, f + 0.04);
      const p0 = this.ort(t.von, t.nach, f0, this.tmpA), p1 = this.ort(t.von, t.nach, f1, this.tmpB);
      let st = this.zustand.get(t.id);
      if (!st) { st = { phase: (t.id * 1.7) % 6.28, yaw: 0, x, z, benutzt: 0 }; st.yaw = Math.atan2(p1.x - p0.x, p1.z - p0.z); this.zustand.set(t.id, st); }
      st.benutzt = this.runde;
      const dx = p1.x - p0.x, dz = p1.z - p0.z;
      if (Math.hypot(dx, dz) > 1e-3) {
        const ziel = Math.atan2(dx, dz);
        let d = ziel - st.yaw;
        d = Math.atan2(Math.sin(d), Math.cos(d));
        st.yaw += d * Math.min(1, dt * 14 + (dt === 0 ? 1 : 0));
      }
      const lauf = t.tut === 'laeuft';
      const weg = Math.hypot(x - st.x, z - st.z);
      st.x = x; st.z = z;
      if (lauf) st.phase += Math.min(weg, 30) / 13 * Math.PI * 2 * 0.5;
      else st.phase += dt * 1.6;
      const y = (map.heightAt(x, z) - base) * ex;
      const k = this.kamera ? fernFaktor(this.kamera.position.distanceTo(p.set(x, y, z))) : 1;
      const sk = TRAEGER_H * k;
      q.setFromAxisAngle(this.yAchse, st.yaw);
      s.set(sk, sk, sk);
      m.compose(p.set(x, y, z), q, s);
      const trage = t.ware >= 0 ? 1 : 0;
      this.figuren.fuege(m, farbe.copy(TRACHT[t.id % TRACHT.length]), [st.phase, trage, lauf ? 1 : t.tut === 'uebergibt' ? 0.35 : 0.1]);
      if (trage && t.ware < WAREN_ANZAHL) {
        // Ware über dem Kopf, wippt mit
        const wip = lauf ? Math.abs(Math.sin(st.phase)) * 0.05 * sk : 0;
        const ws = k;
        s.set(ws, ws, ws);
        m.compose(p.set(x, y + 1.06 * sk + wip, z), q, s);
        this.waren[t.ware].fuege(m);
      }
    }
    this.figuren.fertig();
    for (const w of this.waren) w.fertig();
    if (this.zustand.size > sicht.traeger.length + 16) {
      for (const [id, z] of this.zustand) if (z.benutzt !== this.runde) this.zustand.delete(id);
    }
  }

  /** Zahl der gezeichneten Träger. */
  get anzahl(): number {
    return this.figuren.n;
  }
}
