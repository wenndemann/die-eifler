// Grenzland (ROADMAP M15): versetzte Grenzsteine (mit der Farbe dessen, der sie versetzt hat), nachts spukende Grenzsteinversetzer als
// fahle Geister, Zollhäuser der Gegenseite an der Staatsgrenze mit Zöllner (a. D. Gerd kratzt sich am Kopf) und die Finder als Figuren:
// im dunklen Mantel, auf dem Rückweg mit dem Sack über dem Kopf, mit dem Grenzstein auf den Schultern. Reiner Leser der Sicht.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { MapData } from '../map/mapdata';
import type { HexGrid } from '../map/hex';
import { PROMILLE, type SichtFinder, type SimSicht } from '../sim/typen';
import { geistModell } from './gebaeude';
import { Instanzen } from './instanzen';
import { TRAEGER_H, fernFaktor } from './massstab';
import { paint } from './mockup';
import { FIGUR_ATTRIBUTE, GESTE, figur, material } from './traeger';

/** Grenzstein: Basaltsäule mit Kreuz, oben die Farbe des Dorfs (Einheitshöhe 1). */
function grenzsteinGeometrie(): THREE.BufferGeometry {
  return mergeGeometries([
    paint(new THREE.BoxGeometry(0.42, 0.9, 0.3).translate(0, 0.45, 0), '#9a968c'),
    paint(new THREE.CylinderGeometry(0.21, 0.21, 0.3, 10).rotateX(Math.PI / 2).translate(0, 0.9, 0), '#9a968c'),
    paint(new THREE.BoxGeometry(0.06, 0.34, 0.02).translate(0, 0.62, 0.155), '#4a4a44'),
    paint(new THREE.BoxGeometry(0.22, 0.06, 0.02).translate(0, 0.68, 0.155), '#4a4a44'),
    paint(new THREE.BoxGeometry(0.5, 0.08, 0.38).translate(0, 0.04, 0), '#6a675f'),
  ])!;
}
/** Kappe in Dorffarbe (eigene Instanzen, damit sie sich färben lässt). */
function kappeGeometrie(): THREE.BufferGeometry {
  return new THREE.CylinderGeometry(0.2, 0.22, 0.08, 8).translate(0, 1.02, 0);
}
/** Spukender Grenzsteinversetzer: fahler Umhang mit Kopf und hängenden Ärmeln (Einheitshöhe 1). */
function geistGeometrie(): THREE.BufferGeometry {
  return mergeGeometries([
    new THREE.ConeGeometry(0.32, 0.8, 10, 1, true).translate(0, 0.42, 0),
    new THREE.SphereGeometry(0.17, 10, 8).translate(0, 0.86, 0),
    new THREE.ConeGeometry(0.07, 0.35, 6).rotateZ(1.1).translate(0.3, 0.6, 0),
    new THREE.ConeGeometry(0.07, 0.35, 6).rotateZ(-1.1).translate(-0.3, 0.6, 0),
  ])!;
}
/** Getragener Grenzstein und Fundsack über dem Kopf. */
const steinLast = () => paint(new THREE.BoxGeometry(0.5, 0.26, 0.26), '#9a968c');
const sackLast = () => paint(new THREE.SphereGeometry(0.22, 8, 6).scale(1, 1.2, 0.9), '#7a5a30');

const STEIN_H = 26;
const MANTEL = new THREE.Color('#3a3530');
const ZOELLNER = new THREE.Color('#3f5f3a');
const DORF_FARBE = ['#3f6fb5', '#b5463f', '#4f8a4a', '#d0a030', '#7a4fa0', '#3a8a8a', '#c06a2a', '#6a6a6a'].map((c) => new THREE.Color(c));

export class GrenzlandDarstellung {
  readonly group = new THREE.Group();
  kamera: THREE.Camera | null = null;
  private steine: Instanzen;
  private kappen: Instanzen;
  private geister: Instanzen;
  private figuren: Instanzen;
  private lastStein: Instanzen;
  private lastSack: Instanzen;
  private zoll = new Map<string, THREE.Mesh>();
  private zeit = 0;
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private q2 = new THREE.Quaternion();
  private p = new THREE.Vector3();
  private s = new THREE.Vector3();
  private y = new THREE.Vector3(0, 1, 0);
  private z = new THREE.Vector3(0, 0, 1);
  private geistMat: THREE.MeshStandardMaterial;
  private hausMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 });

  constructor(private map: MapData, private grid: HexGrid, private base: number, private ex: number) {
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 });
    this.steine = new Instanzen(this.group, grenzsteinGeometrie(), mat, false, true, [], 16);
    this.kappen = new Instanzen(this.group, kappeGeometrie(), new THREE.MeshStandardMaterial({ roughness: 0.6 }), true, true, [], 16);
    this.geistMat = new THREE.MeshStandardMaterial({ color: '#e8f0ff', emissive: '#9ab0d8', emissiveIntensity: 0.6, transparent: true, opacity: 0.45, depthWrite: false, side: THREE.DoubleSide });
    this.geister = new Instanzen(this.group, geistGeometrie(), this.geistMat, false, false, [], 8);
    this.figuren = new Instanzen(this.group, figur(), material(), true, true, FIGUR_ATTRIBUTE, 16);
    this.lastStein = new Instanzen(this.group, steinLast(), mat, false, true, [], 8);
    this.lastSack = new Instanzen(this.group, sackLast(), mat, false, true, [], 8);
  }

  setExaggeration(ex: number) { this.ex = ex; for (const m of this.zoll.values()) m.userData.sig = ''; }
  private hoehe(x: number, z: number) { return (this.map.heightAt(x, z) - this.base) * this.ex; }
  private fern(x: number, y: number, z: number) { return this.kamera ? fernFaktor(this.kamera.position.distanceTo(this.p.set(x, y, z))) : 1; }

  update(s: SimSicht, alpha = 0, dt = 0): void {
    this.zeit += dt;
    const gl = s.grenzland;
    for (const x of [this.steine, this.kappen, this.geister, this.figuren, this.lastStein, this.lastSack]) x.beginne();
    if (gl) {
      // Grenzsteine (und umgezogene Höfe) mit Kappe in der Farbe dessen, der sie gesetzt hat; nachts spukt es daneben
      for (const st of gl.steine) {
        const w = this.grid.toWorld(st);
        const x = w.x + 14, z = w.z + 10, y = this.hoehe(x, z);
        const h = STEIN_H * Math.min(1.6, this.fern(x, y, z)) * (st.art === 1 ? 0.75 : 1);
        this.q.setFromAxisAngle(this.y, 0.4 + st.id * 0.7);
        this.m.compose(this.p.set(x, y, z), this.q, this.s.set(h, h, h));
        this.steine.fuege(this.m);
        this.kappen.fuege(this.m, DORF_FARBE[st.sp % DORF_FARBE.length]);
        if (gl.nacht && st.art === 0) {
          const t = this.zeit * 0.7 + st.id;
          const gx = x + Math.cos(t) * 18, gz = z + Math.sin(t * 0.8) * 14, gy = this.hoehe(gx, gz) + 6 + Math.sin(t * 2.3) * 3;
          const gh = TRAEGER_H * 1.6 * this.fern(gx, gy, gz);
          this.q.setFromAxisAngle(this.y, t + Math.PI / 2).multiply(this.q2.setFromAxisAngle(this.z, Math.sin(t * 1.7) * 0.15));
          this.m.compose(this.p.set(gx, gy, gz), this.q, this.s.set(gh, gh, gh));
          this.geister.fuege(this.m);
        }
      }
      this.geistMat.opacity = 0.35 + 0.15 * Math.sin(this.zeit * 1.3);
      // Zollhäuser mit Zöllner am Schlagbaum
      const da = new Set<string>();
      for (const zh of gl.zoll) {
        const k = `${zh.q},${zh.r}`;
        da.add(k);
        let mesh = this.zoll.get(k);
        const g = geistModell('zollhaus', this.grid, zh.q, zh.r);
        if (!mesh) {
          mesh = new THREE.Mesh(g.geo, this.hausMat);
          mesh.castShadow = true; mesh.receiveShadow = true;
          this.zoll.set(k, mesh); this.group.add(mesh);
        }
        const sig = `${this.ex}|${this.map.groundRev}`;
        if (mesh.userData.sig !== sig) {
          mesh.userData.sig = sig;
          mesh.scale.setScalar(g.sk);
          mesh.position.set(g.x, this.hoehe(g.x, g.z) - g.boden, g.z);
        }
        const fx = g.x + 4 * g.sk, fz = g.z + 7.5 * g.sk;
        this.figur(fx, fz, -0.5, 0, ZOELLNER, 0, Math.sin(this.zeit * 0.3) > 0.6 ? GESTE.kratzen : GESTE.keine, -0.2, 0);
      }
      for (const [k, m] of this.zoll) if (!da.has(k)) { this.group.remove(m); this.zoll.delete(k); }
      // Finder unterwegs
      for (const f of gl.finder) this.finder(f, alpha);
    }
    for (const x of [this.steine, this.kappen, this.geister, this.figuren, this.lastStein, this.lastSack]) x.fertig();
  }

  private figur(x: number, z: number, yaw: number, phase: number, farbe: THREE.Color, lauf: number, geste: number, laune: number, kipp: number): number {
    const y = this.hoehe(x, z);
    const sk = TRAEGER_H * this.fern(x, y, z);
    this.q.setFromAxisAngle(this.y, yaw).multiply(this.q2.setFromAxisAngle(this.z, kipp));
    this.m.compose(this.p.set(x, y, z), this.q, this.s.set(sk, sk, sk));
    this.figuren.fuege(this.m, farbe, [phase, 0, lauf, laune, geste]);
    return sk;
  }

  private finder(f: SichtFinder, alpha: number): void {
    const a = this.grid.toWorld(f.von), b = this.grid.toWorld(f.nach);
    const t = Math.min(1, (f.fortschritt + alpha * f.schritt) / PROMILLE);
    const x = a.x + (b.x - a.x) * t, z = a.z + (b.z - a.z) * t;
    const yaw = Math.atan2(b.x - a.x, b.z - a.z) || 0;
    // geduckt schleichen, mit Last über dem Kopf
    const sk = this.figur(x, z, yaw, this.zeit * 8 + f.id, MANTEL, 1, f.traegt ? GESTE.jubeln : GESTE.keine, 0.6, 0.12);
    if (!f.traegt) return;
    const y = this.hoehe(x, z) + sk * 1.18;
    this.q.setFromAxisAngle(this.y, yaw);
    this.m.compose(this.p.set(x, y, z), this.q, this.s.set(sk, sk, sk));
    (f.traegt === 'stein' ? this.lastStein : this.lastSack).fuege(this.m);
  }
}
