// Beschwipste Boten (DESIGN §10.3, Drehbuch 7.1): Betrunkene erkennt man sofort – rote Nase und Wangen, schiefe Mütze, Flasche unterm
// Arm, Schlagseite, Torkeln im Zickzack und Hicksen mit Bläschen über dem Kopf. Je höher der Pegel (1 angeheitert … 3 sternhagelvoll),
// desto deutlicher. Dazu die Waren, die Boten verloren haben (liegen im Gras, bis einer sie aufliest).
// Reiner Leser der SimSicht wie traeger.ts; die Figur ist die Trägerfigur mit Zusatzteilen, gleiche Gelenk-Animation im Shader.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { MapData } from '../map/mapdata';
import type { HexGrid } from '../map/hex';
import { PROMILLE, type Id, type SimSicht } from '../sim/typen';
import { paint } from './mockup';
import { Instanzen } from './instanzen';
import { TRAEGER_H, WARE_TRAGEN, fernFaktor } from './massstab';
import { entzerren, meisterPlaetze, traegerPlaetze, type Platz } from './gedraenge';
import { FIGUR_ATTRIBUTE, figur, GESTE, material } from './traeger';
import { WAREN_ANZAHL, warenGeometrie } from './waren';

/** Teil ohne Gelenk (Rumpf) für die Zusatzteile der Figur. */
function rumpfTeil(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const n = g.attributes.position.count;
  g.setAttribute('aTeil', new THREE.BufferAttribute(new Float32Array(n), 1));
  g.setAttribute('aGelenk', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  g.setAttribute('aTint', new THREE.BufferAttribute(new Float32Array(n), 1));
  return g;
}

/** Trägerfigur mit roter Säufernase, glühenden Wangen, schief sitzender grüner Mütze und Schnapsflasche unterm Arm. */
function botenFigur(): THREE.BufferGeometry {
  const extra = [
    paint(new THREE.SphereGeometry(0.11, 6, 5).scale(1, 0.95, 1.1).translate(0, 0.71, 0.25), '#d6262a'),
    paint(new THREE.SphereGeometry(0.065, 5, 4).translate(-0.165, 0.69, 0.15), '#e8483a'),
    paint(new THREE.SphereGeometry(0.065, 5, 4).translate(0.165, 0.69, 0.15), '#e8483a'),
    // schiefe Mütze (über der Kappe, verrutscht)
    paint(new THREE.ConeGeometry(0.2, 0.32, 7).rotateZ(0.5).translate(0.12, 1.02, 0), '#2f7a3c'),
    paint(new THREE.SphereGeometry(0.05, 5, 4).translate(0.3, 1.13, 0), '#f3e9d2'),
    // Flasche unterm linken Arm
    paint(new THREE.CylinderGeometry(0.055, 0.055, 0.2, 7).rotateZ(-0.9).translate(-0.27, 0.43, 0.08), '#cfe6dc'),
    paint(new THREE.CylinderGeometry(0.022, 0.03, 0.08, 6).rotateZ(-0.9).translate(-0.36, 0.5, 0.08), '#cfe6dc'),
    paint(new THREE.CylinderGeometry(0.025, 0.025, 0.04, 6).rotateZ(-0.9).translate(-0.39, 0.53, 0.08), '#b03a2e'),
  ].map(rumpfTeil);
  return mergeGeometries([figur(), ...extra])!;
}

interface Zustand { phase: number; yaw: number; x: number; z: number; benutzt: number }

export class Boten {
  readonly group = new THREE.Group();
  kamera: THREE.Camera | null = null;
  private figuren: Instanzen;
  private blasen: Instanzen;
  private waren: Instanzen[] = [];
  private liegend: Instanzen[] = [];
  private zustand = new Map<Id, Zustand>();
  private runde = 0;
  private zeit = 0;
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private q2 = new THREE.Quaternion();
  private p = new THREE.Vector3();
  private s = new THREE.Vector3();
  private yAchse = new THREE.Vector3(0, 1, 0);
  private zAchse = new THREE.Vector3(0, 0, 1);
  private farbe = new THREE.Color('#8a5a9a');

  constructor(private map: MapData, private grid: HexGrid, private base: number, private ex: number) {
    this.figuren = new Instanzen(this.group, botenFigur(), material(), true, true, FIGUR_ATTRIBUTE, 16);
    const glas = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.2, transparent: true, opacity: 0.75 });
    this.blasen = new Instanzen(this.group, new THREE.SphereGeometry(0.5, 8, 6), glas, false, false, [], 32);
    const matte = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, flatShading: false });
    for (let a = 0; a < WAREN_ANZAHL; a++) {
      this.waren.push(new Instanzen(this.group, warenGeometrie(a), matte, false, true, [], 8));
      this.liegend.push(new Instanzen(this.group, warenGeometrie(a), matte, false, true, [], 8));
    }
  }

  setExaggeration(ex: number) { this.ex = ex; }

  private hoehe(x: number, z: number): number { return (this.map.heightAt(x, z) - this.base) * this.ex; }

  update(sicht: SimSicht, alpha = 0, dt = 0) {
    this.runde++;
    this.zeit += dt;
    this.figuren.beginne(); this.blasen.beginne();
    for (const w of this.waren) w.beginne();
    for (const w of this.liegend) w.beginne();
    const { m, q, q2, p, s } = this;
    // Plätze zuerst, dann auseinanderrücken: Boten stehen nicht in Trägern oder Meistern (gedraenge.ts)
    const plaetze: Platz[] = [], laeuft: boolean[] = [];
    for (const b of sicht.boten) {
      const geht = b.tut === 'geht';
      const f = Math.min(1, Math.max(0, (b.fortschritt + (geht ? alpha * b.schritt : 0)) / PROMILLE));
      const va = this.grid.toWorld(b.von), vb = this.grid.toWorld(b.nach);
      const dx = vb.x - va.x, dz = vb.z - va.z, len = Math.hypot(dx, dz) || 1;
      // Zickzack quer zur Laufrichtung, stärker mit dem Pegel
      const quer = Math.sin(f * Math.PI * 2 + b.id) * 4 * b.pegel;
      plaetze.push({ x: va.x + dx * f + (-dz / len) * quer, z: va.z + dz * f + (dx / len) * quer, r: TRAEGER_H * 0.38, fest: false });
      laeuft.push(geht);
    }
    entzerren(plaetze, [...traegerPlaetze, ...meisterPlaetze], laeuft);
    for (let bi = 0; bi < sicht.boten.length; bi++) {
      const b = sicht.boten[bi];
      const geht = b.tut === 'geht';
      const va = this.grid.toWorld(b.von), vb = this.grid.toWorld(b.nach);
      const dx = vb.x - va.x, dz = vb.z - va.z, len = Math.hypot(dx, dz) || 1;
      const x = plaetze[bi].x, z = plaetze[bi].z;
      let st = this.zustand.get(b.id);
      if (!st) { st = { phase: b.id * 1.3, yaw: Math.atan2(dx, dz), x, z, benutzt: 0 }; this.zustand.set(b.id, st); }
      st.benutzt = this.runde;
      if (geht && len > 1e-3) {
        let d = Math.atan2(dx, dz) + Math.sin(this.zeit * 2 + b.id) * 0.35 * b.pegel - st.yaw;
        d = Math.atan2(Math.sin(d), Math.cos(d));
        st.yaw += d * Math.min(1, dt * 6 + (dt === 0 ? 1 : 0));
      }
      const weg = Math.hypot(x - st.x, z - st.z);
      st.x = x; st.z = z;
      st.phase += geht ? (Math.min(weg, 30) / 13) * Math.PI : dt * 1.2;
      const y = this.hoehe(x, z);
      const k = this.kamera ? fernFaktor(this.kamera.position.distanceTo(p.set(x, y, z))) : 1;
      // etwas größer als Träger, damit man die Säufernase und die Flasche sofort sieht
      const sk = TRAEGER_H * k * 1.2;
      // Schlagseite: zur Seite gekippt, schwankt nach
      const kipp = (0.12 + 0.08 * b.pegel) * (1 + 0.5 * Math.sin(this.zeit * 1.7 + b.id));
      q.setFromAxisAngle(this.yAchse, st.yaw).multiply(q2.setFromAxisAngle(this.zAchse, kipp));
      s.set(sk, sk, sk);
      m.compose(p.set(x, y, z), q, s);
      // beschwipst: breites Grinsen; wer steht und sternhagelvoll ist, jubelt (singt)
      this.figuren.fuege(m, this.farbe, [st.phase, b.ware >= 0 ? 1 : 0, geht ? 1.2 : 0.2, 1, !geht && b.pegel >= 3 ? GESTE.jubeln : GESTE.keine]);
      if (b.ware >= 0 && b.ware < WAREN_ANZAHL) {
        s.set(k * WARE_TRAGEN, k * WARE_TRAGEN, k * WARE_TRAGEN);
        m.compose(p.set(x, y + 1.24 * sk, z), q, s);
        this.waren[b.ware].fuege(m);
      }
      // Hicks-Bläschen steigen über dem Kopf auf
      for (let i = 0; i < b.pegel; i++) {
        const t = (this.zeit * 0.6 + i / b.pegel + b.id * 0.37) % 1;
        const r = (0.07 + 0.04 * i) * sk * (1 - t * 0.4);
        s.set(r, r, r);
        m.compose(p.set(x + Math.sin(t * 6 + i) * 0.15 * sk, y + (1.3 + t * 0.7) * sk, z), q.identity(), s);
        this.blasen.fuege(m);
      }
    }
    // verlorene Waren liegen schräg im Gras
    for (const l of sicht.liegend) {
      if (l.ware < 0 || l.ware >= WAREN_ANZAHL) continue;
      const w = this.grid.toWorld(l);
      const y = this.hoehe(w.x, w.z);
      const k = this.kamera ? fernFaktor(this.kamera.position.distanceTo(p.set(w.x, y, w.z))) : 1;
      q.setFromAxisAngle(this.zAchse, 0.5);
      s.set(k, k, k);
      m.compose(p.set(w.x + 6, y, w.z + 4), q, s);
      this.liegend[l.ware].fuege(m);
    }
    this.figuren.fertig(); this.blasen.fertig();
    for (const w of this.waren) w.fertig();
    for (const w of this.liegend) w.fertig();
    if (this.zustand.size > sicht.boten.length + 16) for (const [id, z] of this.zustand) if (z.benutzt !== this.runde) this.zustand.delete(id);
  }

  get anzahl(): number { return this.figuren.n; }
}
