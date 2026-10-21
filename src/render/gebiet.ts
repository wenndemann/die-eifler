// Gebiet, Orte und Marktposten in der Welt (Drehbuch 6, ROADMAP M10): Grenzsteine mit Kappe in der Spielerfarbe an jeder Gebietskante
// (wie die Grenzpfähle in Siedler), Ortsschilder an den Eifel-Orten (gelb = noch zu gewinnen, Band in der Farbe des Besitzers) und
// Wegweiser mit Marktstand an den Marktposten der Flachländer. Reiner Leser der Sicht; neu gebaut nur bei Änderung.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import mp from '../../data/mehrspieler.json';
import type { MapData } from '../map/mapdata';
import type { HexGrid } from '../map/hex';
import type { SimSicht } from '../sim/typen';
import { Instanzen } from './instanzen';
import { HAUS_SKALE } from './massstab';
import { paint } from './mockup';
import { mitSchnee } from './kulisse';

const SPIELER_FARBEN = mp.farben.liste.map((c) => new THREE.Color(c));
const RICHTUNGEN: readonly [number, number][] = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
/** Größe der Steine und Schilder (Meter im Spiel; wie die Gebäude übertrieben). */
const S = HAUS_SKALE * 0.9;

function stein(): THREE.BufferGeometry {
  return mergeGeometries([
    paint(new THREE.CylinderGeometry(0.42, 0.55, 1.5, 7).translate(0, 0.75, 0), '#b8ad98'),
    paint(new THREE.CylinderGeometry(0.62, 0.7, 0.18, 7).translate(0, 0.06, 0), '#8f8574'),
  ])!;
}
function kappe(): THREE.BufferGeometry {
  return paint(new THREE.SphereGeometry(0.45, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.8, 1).translate(0, 1.48, 0), '#ffffff');
}
function ortsschild(): THREE.BufferGeometry {
  return mergeGeometries([
    paint(new THREE.CylinderGeometry(0.12, 0.14, 3.2, 6).translate(-1.1, 1.6, 0), '#6a4a2e'),
    paint(new THREE.CylinderGeometry(0.12, 0.14, 3.2, 6).translate(1.1, 1.6, 0), '#6a4a2e'),
    paint(new THREE.BoxGeometry(2.8, 1.3, 0.14).translate(0, 2.6, 0), '#f2c230'),
    paint(new THREE.BoxGeometry(2.5, 0.12, 0.16).translate(0, 2.25, 0.01), '#3a2a1a'),
  ])!;
}
function schildBand(): THREE.BufferGeometry {
  return paint(new THREE.BoxGeometry(2.9, 0.32, 0.18).translate(0, 3.4, 0), '#ffffff');
}
function wegweiser(): THREE.BufferGeometry {
  const pfeil = new THREE.Shape([new THREE.Vector2(0, -0.35), new THREE.Vector2(2.1, -0.35), new THREE.Vector2(2.6, 0), new THREE.Vector2(2.1, 0.35), new THREE.Vector2(0, 0.35)]);
  const brett = new THREE.ExtrudeGeometry(pfeil, { depth: 0.12, bevelEnabled: false });
  brett.deleteAttribute('uv');
  return mergeGeometries([
    paint(new THREE.CylinderGeometry(0.13, 0.16, 3.6, 6).translate(0, 1.8, 0), '#6a4a2e'),
    paint(brett.translate(0, 2.9, -0.06), '#f4ead8'),
    paint(brett.clone().rotateY(Math.PI * 0.85).translate(0, 2.2, 0), '#e8d8b8'),
    // Marktstand daneben: Tisch, Stangen, gestreiftes Dach
    paint(new THREE.BoxGeometry(2.4, 0.15, 1.2).translate(2.6, 1.0, 1.4), '#9a6a40'),
    ...[[1.5, 0.9], [3.7, 0.9], [1.5, 1.9], [3.7, 1.9]].map(([x, z]) => paint(new THREE.CylinderGeometry(0.07, 0.07, 2.2, 5).translate(x, 1.1, z), '#6a4a2e')),
    paint(new THREE.BoxGeometry(2.7, 0.12, 1.5).rotateX(-0.25).translate(2.6, 2.3, 1.4), '#c8402e'),
    paint(new THREE.BoxGeometry(0.5, 0.13, 1.52).rotateX(-0.25).translate(2.0, 2.31, 1.4), '#f4ead8'),
    paint(new THREE.BoxGeometry(0.5, 0.13, 1.52).rotateX(-0.25).translate(3.1, 2.31, 1.4), '#f4ead8'),
    paint(new THREE.SphereGeometry(0.3, 7, 5).translate(2.2, 1.3, 1.3), '#f2c230'),
    paint(new THREE.CylinderGeometry(0.25, 0.25, 0.5, 8).translate(3.0, 1.33, 1.4), '#9a6a3a'),
  ])!;
}

export class GebietDarstellung {
  readonly group = new THREE.Group();
  private steine: Instanzen;
  private kappen: Instanzen;
  private baenderBoden: Instanzen;
  private schilder: Instanzen;
  private baender: Instanzen;
  private weiser: Instanzen;
  private sig = '';
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private p = new THREE.Vector3();
  private sk = new THREE.Vector3();
  private y = new THREE.Vector3(0, 1, 0);
  private weiss = new THREE.Color('#ffffff');

  constructor(private map: MapData, private grid: HexGrid, private base: number, private ex: number) {
    const mat = mitSchnee(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 }));
    this.steine = new Instanzen(this.group, stein(), mat, false, false, [], 256);
    this.kappen = new Instanzen(this.group, kappe(), mat, true, false, [], 256);
    const band = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.55, depthWrite: false });
    this.baenderBoden = new Instanzen(this.group, paint(new THREE.BoxGeometry(1, 0.3, 1), '#ffffff'), band, true, false, [], 512);
    this.schilder = new Instanzen(this.group, ortsschild(), mat, false, true, [], 16);
    this.baender = new Instanzen(this.group, schildBand(), mat, true, false, [], 16);
    this.weiser = new Instanzen(this.group, wegweiser(), mat, false, true, [], 4);
  }

  setExaggeration(ex: number) { this.ex = ex; this.sig = ''; }

  private hoehe(x: number, z: number) { return (this.map.heightAt(x, z) - this.base) * this.ex; }

  update(s: SimSicht) {
    const sig = `${s.gebiet.rev}:${s.orte.map((o) => o.besitzer).join(',')}:${s.posten.length}:${this.map.groundRev}`;
    if (sig === this.sig) return;
    this.sig = sig;
    const f = this.grid.feld, b = s.gebiet.besitz;
    for (const x of [this.steine, this.kappen, this.baenderBoden, this.schilder, this.baender, this.weiser]) x.beginne();
    // Grenzsteine: an jeder Kante eines eigenen Hex zu einem anderen Besitzer, jede zweite Kante (sonst zu dicht)
    if (b.length === f.terrain.length) {
      let i = 0;
      for (let dr = -f.n; dr <= f.n; dr++) {
        for (let dq = Math.max(-f.n, -dr - f.n); dq <= Math.min(f.n, -dr + f.n); dq++, i++) {
          const sp = b[i];
          if (sp < 0) continue;
          const q = f.q + dq, r = f.r + dr;
          const c = this.grid.toWorld({ q, r });
          for (let k = 0; k < 6; k++) {
            const n = f.index(q + RICHTUNGEN[k][0], r + RICHTUNGEN[k][1]);
            if (n >= 0 && b[n] === sp) continue;
            const w = this.grid.toWorld({ q: q + RICHTUNGEN[k][0], r: r + RICHTUNGEN[k][1] });
            // Band in der Spielerfarbe entlang der Kante (aus der Übersicht lesbar), leicht ins eigene Hex gerückt
            const bx = c.x + (w.x - c.x) * 0.45, bz = c.z + (w.z - c.z) * 0.45;
            const quer = Math.atan2(-(w.z - c.z), w.x - c.x) + Math.PI / 2;
            const ex = Math.cos(quer) * 30, ez = -Math.sin(quer) * 30;
            const yb = Math.max(this.hoehe(bx + ex, bz + ez), this.hoehe(bx - ex, bz - ez), this.hoehe(bx, bz)) + 1.2;
            this.q.setFromAxisAngle(this.y, quer);
            this.m.compose(this.p.set(bx, yb, bz), this.q, this.sk.set(62, 1, 5));
            this.baenderBoden.fuege(this.m, SPIELER_FARBEN[sp % SPIELER_FARBEN.length]);
            if ((q + r + k) % 2) continue;
            const x = c.x + (w.x - c.x) * 0.42, z = c.z + (w.z - c.z) * 0.42;
            this.m.compose(this.p.set(x, this.hoehe(x, z), z), this.q.identity(), this.sk.set(S * 2.2, S * 2.2, S * 2.2));
            this.steine.fuege(this.m);
            this.kappen.fuege(this.m, SPIELER_FARBEN[sp % SPIELER_FARBEN.length]);
          }
        }
      }
    }
    // Ortsschilder: neben dem Ortskern, gelb; das Band zeigt den Besitzer (weiß = noch frei)
    for (const o of s.orte) {
      const c = this.grid.toWorld(o);
      const x = c.x + 30, z = c.z + 38;
      this.q.setFromAxisAngle(this.y, 0.4);
      this.m.compose(this.p.set(x, this.hoehe(x, z), z), this.q, this.sk.set(S * 2.6, S * 2.6, S * 2.6));
      this.schilder.fuege(this.m);
      this.baender.fuege(this.m, o.besitzer >= 0 ? SPIELER_FARBEN[o.besitzer % SPIELER_FARBEN.length] : this.weiss);
    }
    // Wegweiser mit Marktstand an den Marktposten, Pfeil zeigt nach außen (zur Stadt)
    const mitte = this.grid.toWorld({ q: f.q, r: f.r });
    for (const pst of s.posten) {
      const c = this.grid.toWorld(pst);
      const winkel = Math.atan2(-(c.z - mitte.z), c.x - mitte.x);
      this.q.setFromAxisAngle(this.y, winkel);
      this.m.compose(this.p.set(c.x, this.hoehe(c.x, c.z), c.z), this.q, this.sk.set(S * 3, S * 3, S * 3));
      this.weiser.fuege(this.m);
    }
    for (const x of [this.steine, this.kappen, this.baenderBoden, this.schilder, this.baender, this.weiser]) x.fertig();
  }
}
