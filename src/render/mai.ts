// Der Mai (ROADMAP M14): Maibäume an den Kirmesplätzen (Birke mit Kranz und bunten Bändern, wie im Rheinland), geklaute Bäume beim
// Dieb neben dessen eigenem, Maijungen unterwegs (grüne Kappen; mit dem Baum auf den Schultern, oder nach dem Bier torkelnd) und die
// Wache mit der Hand am Stamm. Reiner Leser der Sicht.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { MapData } from '../map/mapdata';
import type { HexGrid } from '../map/hex';
import { PROMILLE, type SimSicht, type SichtTrupp } from '../sim/typen';
import { Instanzen } from './instanzen';
import { HAUS_SKALE, TRAEGER_H, fernFaktor } from './massstab';
import { paint } from './mockup';
import { FIGUR_ATTRIBUTE, GESTE, figur, material } from './traeger';

const BAENDER = ['#d23a3a', '#2f6db5', '#f2c230', '#3c9a46', '#f4ead8', '#c8402e'];

/** Maibaum, Einheitshöhe etwa 1 (Spitze bei y≈1), Stamm unten bei y=0. */
export function maibaumGeometrie(): THREE.BufferGeometry {
  const teile: THREE.BufferGeometry[] = [];
  // Birkenstamm: weiß mit dunklen Flecken
  teile.push(paint(new THREE.CylinderGeometry(0.03, 0.045, 0.86, 9).translate(0, 0.43, 0), '#f1eee6'));
  for (let i = 0; i < 9; i++) {
    const y = 0.08 + i * 0.085, a = i * 2.1;
    teile.push(paint(new THREE.BoxGeometry(0.03, 0.016, 0.006).translate(Math.cos(a) * 0.038, y, Math.sin(a) * 0.038).lookAt(new THREE.Vector3(0, y, 0)), '#2b2b2b'));
  }
  // grüne Krone (Birkenspitze) oben
  for (const [x, y, z, r] of [[0, 0.93, 0, 0.1], [0.06, 0.87, 0.03, 0.08], [-0.06, 0.88, -0.03, 0.075], [0.01, 1.0, -0.04, 0.065]]) {
    teile.push(paint(new THREE.SphereGeometry(r, 7, 5).scale(0.8, 1.2, 0.8).translate(x, y, z), '#5fae4a'));
  }
  // Kranz mit Bändern unter der Krone
  teile.push(paint(new THREE.TorusGeometry(0.14, 0.026, 6, 16).rotateX(Math.PI / 2).translate(0, 0.74, 0), '#3f8a3a'));
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2, x = Math.cos(a) * 0.14, z = Math.sin(a) * 0.14;
    teile.push(paint(new THREE.BoxGeometry(0.022, 0.3, 0.006).rotateY(-a).rotateZ(Math.cos(a) * 0.15).translate(x * 1.12, 0.6, z * 1.12), BAENDER[i % BAENDER.length]));
  }
  // Herz-Schild am Stamm (der Verein ist stolz)
  teile.push(paint(new THREE.BoxGeometry(0.1, 0.07, 0.008).translate(0, 0.3, 0.046), '#c8402e'));
  // Sockel aus Brettern
  teile.push(paint(new THREE.CylinderGeometry(0.09, 0.1, 0.035, 8).translate(0, 0.017, 0), '#8a6038'));
  return mergeGeometries(teile)!;
}

/** Liegender Birkenstamm mit Krone zum Tragen (Länge 1 entlang x). */
function getragenerBaum(): THREE.BufferGeometry {
  return mergeGeometries([
    paint(new THREE.CylinderGeometry(0.035, 0.05, 1, 8).rotateZ(Math.PI / 2), '#f1eee6'),
    paint(new THREE.SphereGeometry(0.12, 7, 5).scale(1.4, 0.8, 0.8).translate(0.56, 0, 0), '#5fae4a'),
    paint(new THREE.TorusGeometry(0.1, 0.02, 5, 12).rotateY(Math.PI / 2).translate(0.38, 0, 0), '#3f8a3a'),
    ...BAENDER.slice(0, 4).map((c, i) => paint(new THREE.BoxGeometry(0.012, 0.16, 0.006).translate(0.38 + (i - 1.5) * 0.02, -0.1, (i % 2 ? 1 : -1) * 0.05), c)),
  ])!;
}

/** Höhe des Maibaums in Metern (deutlich über die Häuser, damit man ihn aus der Übersicht sieht). */
const BAUM_H = HAUS_SKALE * 17;
const MAIGRUEN = new THREE.Color('#3c8a3a');
const BURSCHEN = new THREE.Color('#7a5a3a');

export class MaiDarstellung {
  readonly group = new THREE.Group();
  kamera: THREE.Camera | null = null;
  private baeume: Instanzen;
  private getragen: Instanzen;
  private figuren: Instanzen;
  private zeit = 0;
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private q2 = new THREE.Quaternion();
  private p = new THREE.Vector3();
  private s = new THREE.Vector3();
  private y = new THREE.Vector3(0, 1, 0);
  private z = new THREE.Vector3(0, 0, 1);

  constructor(private map: MapData, private grid: HexGrid, private base: number, private ex: number) {
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 });
    this.baeume = new Instanzen(this.group, maibaumGeometrie(), mat, false, true, [], 8);
    this.getragen = new Instanzen(this.group, getragenerBaum(), mat, false, true, [], 8);
    this.figuren = new Instanzen(this.group, figur(), material(), true, true, FIGUR_ATTRIBUTE, 32);
  }

  setExaggeration(ex: number) { this.ex = ex; }
  private hoehe(x: number, z: number) { return (this.map.heightAt(x, z) - this.base) * this.ex; }

  /** Platz des Maibaums eines Dorfs: am Kirmesplatz, sonst am Lager (wie die Simulation), etwas daneben. */
  private platz(s: SimSicht, sp: number): { x: number; z: number } | null {
    const g = s.gebaeude.find((x) => x.sp === sp && x.typ === 'kirmesplatz' && x.bau >= PROMILLE) ?? s.gebaeude.find((x) => x.sp === sp && x.typ === 'lager');
    if (!g) return null;
    const w = this.grid.toWorld(g);
    // frei neben dem Platz, nicht im Karussell
    return { x: w.x + 46, z: w.z - 34 };
  }

  update(s: SimSicht, alpha = 0, dt = 0): void {
    this.zeit += dt;
    for (const x of [this.baeume, this.getragen, this.figuren]) x.beginne();
    const { m, q, p, sk } = { m: this.m, q: this.q, p: this.p, sk: this.s };
    // Bäume: eigener, wenn er steht; geklaute stehen beim Dieb daneben (schief, mit Schild)
    s.spieler.forEach((sp, i) => {
      let ort: { x: number; z: number } | null = null, schief = 0;
      if (sp.maibaum === 1) ort = this.platz(s, i);
      else if (sp.maibaum === 2 && (sp.maiDieb ?? -1) >= 0) {
        const d = this.platz(s, sp.maiDieb!);
        if (d) { ort = { x: d.x + 22 + i * 6, z: d.z + 14 }; schief = 0.12; }
      }
      if (!ort) return;
      q.setFromAxisAngle(this.y, 0.3 + i).multiply(this.q2.setFromAxisAngle(this.z, schief));
      m.compose(p.set(ort.x, this.hoehe(ort.x, ort.z), ort.z), q, sk.set(BAUM_H, BAUM_H, BAUM_H));
      this.baeume.fuege(m);
    });
    // Wache am eigenen Baum: Hand am Stamm
    const mai = s.dorf.mai, eigen = this.platz(s, s.ich);
    if (mai && mai.baum === 1 && mai.wache > 0 && eigen) {
      for (let i = 0; i < Math.min(4, mai.wache); i++) {
        const a = (i / Math.max(1, Math.min(4, mai.wache))) * Math.PI * 2 + 0.4;
        const x = eigen.x + Math.cos(a) * 7, z = eigen.z + Math.sin(a) * 7;
        this.figur(x, z, Math.atan2(eigen.x - x, eigen.z - z), 3 + i, MAIGRUEN, 0, GESTE.hand, 0.5, 0);
      }
    }
    // Trupps unterwegs
    for (const t of s.trupps ?? []) this.trupp(t, alpha);
    for (const x of [this.baeume, this.getragen, this.figuren]) x.fertig();
  }

  private figur(x: number, z: number, yaw: number, phase: number, farbe: THREE.Color, lauf: number, geste: number, laune: number, kipp: number): void {
    const y = this.hoehe(x, z);
    const k = this.kamera ? fernFaktor(this.kamera.position.distanceTo(this.p.set(x, y, z))) : 1;
    const sk = TRAEGER_H * k;
    this.q.setFromAxisAngle(this.y, yaw).multiply(this.q2.setFromAxisAngle(this.z, kipp));
    this.m.compose(this.p.set(x, y, z), this.q, this.s.set(sk, sk, sk));
    this.figuren.fuege(this.m, farbe, [phase, 0, lauf, laune, geste]);
  }

  private trupp(t: SichtTrupp, alpha: number): void {
    const a = this.grid.toWorld(t.von), b = this.grid.toWorld(t.nach);
    const f = Math.min(1, (t.fortschritt + alpha * t.schritt) / PROMILLE);
    const cx = a.x + (b.x - a.x) * f, cz = a.z + (b.z - a.z) * f;
    const yaw = Math.atan2(b.x - a.x, b.z - a.z) || 0;
    const torkelt = t.phase === 3, mitBaum = t.phase === 1;
    const farbe = t.sp < 0 ? BURSCHEN : MAIGRUEN;
    const n = Math.min(6, t.n);
    const vor = { x: Math.sin(yaw), z: Math.cos(yaw) }, quer = { x: Math.cos(yaw), z: -Math.sin(yaw) };
    for (let i = 0; i < n; i++) {
      // mit Baum hintereinander unter dem Stamm, sonst als Haufen
      const along = mitBaum ? (i - (n - 1) / 2) * 9 : ((i % 3) - 1) * 6, side = mitBaum ? (i % 2 ? 3 : -3) : (Math.floor(i / 3) - 0.5) * 7;
      const wack = torkelt ? Math.sin(this.zeit * 3 + i * 1.7) * 5 : 0;
      const x = cx + vor.x * along + quer.x * (side + wack), z = cz + vor.z * along + quer.z * (side + wack);
      const phase = this.zeit * 7 + i * 1.3;
      this.figur(x, z, yaw + (torkelt ? Math.sin(this.zeit * 2 + i) * 0.5 : 0), phase, farbe, 1, mitBaum ? GESTE.jubeln : GESTE.keine,
        torkelt ? 1 : t.phase === 2 ? -0.6 : 0.8, torkelt ? 0.25 * Math.sin(this.zeit * 1.6 + i) : 0);
    }
    if (mitBaum) {
      const y = this.hoehe(cx, cz) + TRAEGER_H * 1.25;
      this.q.setFromAxisAngle(this.y, yaw - Math.PI / 2);
      const l = Math.max(40, n * 11);
      this.m.compose(this.p.set(cx, y, cz), this.q, this.s.set(l, l * 0.9, l * 0.9));
      this.getragen.fuege(this.m);
    }
  }
}
