// Fahnen (Stange + wehendes Tuch) und Warenstapel an den Fahnen (Drehbuch 4.1). Reiner Leser der SimSicht.
// Alles per Instancing: eine Stange, ein Tuch, ein Satz je Warenart – unabhängig von der Zahl der Fahnen.
// Stapel: bis 8 Waren in einer kleinen Pyramide neben der Fahne, 2 Notplätze (Rückstau) als Sondersitze.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { MapData } from '../map/mapdata';
import type { HexGrid } from '../map/hex';
import type { SimSicht } from '../sim/typen';
import { paint } from './mockup';
import { Instanzen } from './instanzen';
import { FAHNE_H, WARE_M, fernFaktor } from './massstab';
import { WAREN_ANZAHL, warenGeometrie } from './waren';
import { hash } from './terrain';
import mp from '../../data/mehrspieler.json';

/** Tuchmaße (m): Breite, Höhe. */
const TUCH_B = 10.5, TUCH_H = 6.6;
/** Farben: Wegefahne rot, Gebäudefahne gelb. */
const FARBE_WEG = new THREE.Color('#d6402c');
const FARBE_GEB = new THREE.Color('#f0b429');
const WEISS = new THREE.Color('#ffffff');
/** Fahnentuch der Mitspieler in ihrer Farbe (data/mehrspieler.json); die eigenen bleiben rot und gold. */
const SPIELER_FARBEN = mp.farben.liste.map((c) => new THREE.Color(c));

/** Sitze im Stapel: [Spalte, Zeile, Lage]. Platz 0–7 Pyramide, 8–9 Notplätze daneben. */
const SITZE: readonly (readonly [number, number, number])[] = [
  [0, -1, 0], [0, 0, 0], [0, 1, 0], [1, -1, 0], [1, 0, 0], [1, 1, 0], [0.5, -0.5, 1], [0.5, 0.5, 1],
  [0.5, -2, 0], [0.5, 2, 0],
];
const SPALTE = WARE_M * 1.6, ZEILE = WARE_M * 1.05, LAGE = WARE_M * 0.62;
/** Stapel liegt südöstlich der Fahnenstange. */
const VERSATZ_X = 7, VERSATZ_Z = 6;

function stangeGeo(): THREE.BufferGeometry {
  const teile = [
    paint(new THREE.CylinderGeometry(0.28, 0.42, FAHNE_H, 6).translate(0, FAHNE_H / 2, 0), '#6b4a2e'),
    paint(new THREE.SphereGeometry(0.85, 7, 5).translate(0, FAHNE_H + 0.3, 0), '#e8c14a'),
    // kleiner Erdhügel mit Steinen am Fuß
    paint(new THREE.CylinderGeometry(2.6, 3.8, 0.8, 8).translate(0, 0.15, 0), '#8b7456'),
    paint(new THREE.BoxGeometry(1.3, 0.9, 1.1).rotateY(0.5).translate(2.2, 0.5, 1.4), '#9b978d'),
    paint(new THREE.BoxGeometry(1.0, 0.7, 1.2).rotateY(1.1).translate(-2.0, 0.4, 1.8), '#8c887f'),
  ];
  const g = mergeGeometries(teile)!;
  if (!g.attributes.normal) g.computeVertexNormals();
  return g;
}

function tuchGeo(): THREE.BufferGeometry {
  const g = new THREE.PlaneGeometry(TUCH_B, TUCH_H, 8, 2).translate(TUCH_B / 2 + 0.35, FAHNE_H - TUCH_H / 2 - 0.3, 0);
  g.deleteAttribute('uv');
  const a = new Float32Array(g.attributes.position.count * 3).fill(1);
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
}

export class Fahnen {
  readonly group = new THREE.Group();
  /** Wenn gesetzt: Figuren-/Fahnengröße wächst mit dem Kameraabstand (Lesbarkeit von weit weg). */
  kamera: THREE.Camera | null = null;
  private stangen: Instanzen;
  private tuecher: Instanzen;
  private waren: Instanzen[] = [];
  private zeit = { value: 0 };
  private ex: number;
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private p = new THREE.Vector3();
  private s = new THREE.Vector3();
  private yAchse = new THREE.Vector3(0, 1, 0);

  constructor(private map: MapData, private grid: HexGrid, private base: number, ex: number) {
    this.ex = ex;
    const matte = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, flatShading: false });
    const tuch = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, flatShading: false, side: THREE.DoubleSide });
    tuch.onBeforeCompile = (shader) => {
      shader.uniforms.uZeit = this.zeit;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uZeit;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
float fx = clamp((position.x - 0.35) / ${TUCH_B.toFixed(1)}, 0.0, 1.0);
float ph = uZeit * 5.0 - position.x * 0.9 + instanceMatrix[3].x * 0.07 + instanceMatrix[3].z * 0.05;
transformed.z += sin(ph) * 1.1 * fx;
transformed.y += sin(ph * 0.7 + 1.0) * 0.3 * fx - fx * fx * 0.5;`);
    };
    this.stangen = new Instanzen(this.group, stangeGeo(), matte);
    this.tuecher = new Instanzen(this.group, tuchGeo(), tuch, true, true);
    for (let a = 0; a < WAREN_ANZAHL; a++) this.waren.push(new Instanzen(this.group, warenGeometrie(a), matte, false, true, [], 256));
  }

  setExaggeration(ex: number) {
    this.ex = ex;
  }

  /** Größenfaktor aus dem Kameraabstand (1, wenn keine Kamera gesetzt ist). */
  private faktor(x: number, y: number, z: number): number {
    if (!this.kamera) return 1;
    return fernFaktor(this.kamera.position.distanceTo(this.p.set(x, y, z)));
  }

  update(sicht: SimSicht, _alpha = 0, dt = 0) {
    this.zeit.value += dt;
    this.stangen.beginne(); this.tuecher.beginne();
    for (const w of this.waren) w.beginne();
    const { map, base, ex } = this;
    const m = this.m, q = this.q, p = this.p, s = this.s;
    for (const f of sicht.fahnen) {
      const w = this.grid.toWorld(f);
      const y = (map.heightAt(w.x, w.z) - base) * ex;
      const k = this.faktor(w.x, y, w.z);
      s.set(k, k, k);
      m.compose(p.set(w.x, y, w.z), q.identity(), s);
      this.stangen.fuege(m);
      const fremd = f.sp !== sicht.ich ? SPIELER_FARBEN[f.sp % SPIELER_FARBEN.length] : null;
      this.tuecher.fuege(m, fremd ?? (f.gebaeude ? FARBE_GEB : (hash(f.q * 31 + 7, f.r) < 0.15 ? WEISS : FARBE_WEG)));
      // Warenstapel
      const n = Math.min(f.waren.length, SITZE.length);
      for (let i = 0; i < n; i++) {
        const [a, b, lage] = SITZE[i];
        const x = w.x + (VERSATZ_X + (a - 0.5) * SPALTE) * k;
        const z = w.z + (VERSATZ_Z + b * ZEILE) * k;
        const yy = (map.heightAt(x, z) - base) * ex + lage * LAGE * k;
        const art = f.waren[i];
        if (art < 0 || art >= WAREN_ANZAHL) continue;
        const h = hash(f.q * 131 + i * 17, f.r * 71 + art);
        // gestapelte Hölzer/Bretter liegen schräg gegeneinander, nicht wie mit dem Lineal gelegt
        q.setFromAxisAngle(this.yAchse, (h - 0.5) * 0.35 + (art === 2 || art === 3 ? h * 3 : 0));
        s.set(k, k, k);
        m.compose(p.set(x, yy, z), q, s);
        this.waren[art].fuege(m);
        q.identity();
      }
    }
    this.stangen.fertig(); this.tuecher.fertig();
    for (const w of this.waren) w.fertig();
  }

  /** Zahl der gezeichneten Waren im Stapel (zum Prüfen). */
  get warenSichtbar(): number {
    return this.waren.reduce((a, w) => a + w.n, 0);
  }
}
