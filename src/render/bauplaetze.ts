// Bauplatz-Anzeige wie in Siedler: um den Zeiger (bzw. die Bildschirmmitte) zeigt jeder Hex ein Plättchen mit einem
// Häuschen in der Größe des möglichen Bauplatzes (klein, mittel, groß). Hexe ohne Bauplatz bleiben leer. Passt der Platz
// zum gewählten Gebäude, leuchtet er grün, sonst gedämpft rot. Instanziert: ein Draw-Call je Größe; neu gerechnet wird
// nur, wenn sich Zentrum, Netz (Gebäude, Fahnen, Wege), Gebäudegröße oder Überhöhung ändern.
import * as THREE from 'three';
import type { MapData } from '../map/mapdata';
import type { HexGrid } from '../map/hex';
import { HEX } from '../welt/format';
import { hexeImUmkreis } from '../spiel/baumenue';
import { hexAbstand } from '../spiel/logik';
import { Instanzen } from './instanzen';

/** Umkreis in Hexen um das Zentrum. */
export const BAUPLATZ_RADIUS = 9;

const gruen = new THREE.Color('#7df06e'), rot = new THREE.Color('#d9604f'), neutral = new THREE.Color('#f3e2b0');

/** Farbe je Eckpunkt setzen (Plättchen dunkel, Wände hell, Dach kräftig). */
function farbig(g: THREE.BufferGeometry, hex: string): THREE.BufferGeometry {
  const c = new THREE.Color(hex);
  const n = g.getAttribute('position').count;
  const a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[3 * i] = c.r; a[3 * i + 1] = c.g; a[3 * i + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g.index ? g.toNonIndexed() : g;
}

/** Plättchen und Häuschen der Größe 1 (klein), 2 (mittel: breiter, höher), 3 (groß: zwei Flügel und Turm). */
function pictogramm(groesse: 1 | 2 | 3): THREE.BufferGeometry {
  const R = HEX.R;
  const teile: THREE.BufferGeometry[] = [];
  const plaettchen = new THREE.CylinderGeometry(R * 0.8, R * 0.8, 1.2, 6).translate(0, 0.6, 0);
  teile.push(farbig(plaettchen, '#555555'));
  const haus = (b: number, h: number, t: number, x: number, z: number, dach: number) => {
    teile.push(farbig(new THREE.BoxGeometry(b, h, t).translate(x, 1.2 + h / 2, z), '#ffffff'));
    teile.push(farbig(new THREE.ConeGeometry(1, dach, 4).rotateY(Math.PI / 4).scale(b * 0.78, 1, t * 0.78).translate(x, 1.2 + h + dach / 2, z), '#9a9a9a'));
  };
  if (groesse === 1) haus(R * 0.4, R * 0.26, R * 0.34, 0, 0, R * 0.22);
  else if (groesse === 2) haus(R * 0.62, R * 0.36, R * 0.44, 0, 0, R * 0.3);
  else {
    haus(R * 0.5, R * 0.34, R * 0.42, -R * 0.2, R * 0.08, R * 0.26);
    haus(R * 0.34, R * 0.3, R * 0.34, R * 0.26, -R * 0.12, R * 0.22);
    teile.push(farbig(new THREE.BoxGeometry(R * 0.16, R * 0.62, R * 0.16).translate(R * 0.04, 1.2 + R * 0.31, -R * 0.2), '#eeeeee'));
    teile.push(farbig(new THREE.ConeGeometry(R * 0.14, R * 0.24, 4).rotateY(Math.PI / 4).translate(R * 0.04, 1.2 + R * 0.62 + R * 0.12, -R * 0.2), '#9a9a9a'));
  }
  // alle Teile nicht-indiziert angleichen und verschmelzen
  const gesamt = teile.map((g) => (g.index ? g.toNonIndexed() : g));
  let n = 0;
  for (const g of gesamt) n += g.getAttribute('position').count;
  const pos = new Float32Array(n * 3), col = new Float32Array(n * 3);
  let o = 0;
  for (const g of gesamt) {
    pos.set(g.getAttribute('position').array as Float32Array, o * 3);
    col.set(g.getAttribute('color').array as Float32Array, o * 3);
    o += g.getAttribute('position').count;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.computeVertexNormals();
  return geo;
}

export class Bauplaetze {
  readonly group = new THREE.Group();
  private saetze: Instanzen[];
  private sig = '';
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private p = new THREE.Vector3();
  private s = new THREE.Vector3();
  /** Anzahl sichtbarer Plättchen je Größe (klein, mittel, groß) – für Tests und Anzeige. */
  anzahl: [number, number, number] = [0, 0, 0];

  constructor(private map: MapData, private grid: HexGrid, private base: number, private ex: number) {
    const mat = new THREE.MeshBasicMaterial({ vertexColors: true, depthTest: false, depthWrite: false, transparent: true, opacity: 0.92, toneMapped: false });
    this.saetze = ([1, 2, 3] as const).map((g) => {
      const s = new Instanzen(this.group, pictogramm(g), mat, true, false, [], 128);
      s.mesh.renderOrder = 3;
      s.mesh.receiveShadow = false;
      return s;
    });
    this.group.visible = false;
  }

  setExaggeration(ex: number) {
    this.ex = ex;
    this.sig = '';
  }

  /**
   * Plättchen um `zentrum` setzen. `noetig` = Größe des gewählten Gebäudes (0 = keins gewählt: alle neutral).
   * `groesseAt` liefert den möglichen Bauplatz (sim.bauplatzGroesse), `netzSig` ändert sich mit Gebäuden, Fahnen und Wegen.
   * `ausser` = Hex, der frei bleibt (dort steht das Geistermodell). zentrum null blendet aus.
   */
  setze(zentrum: { q: number; r: number } | null, noetig: 0 | 1 | 2 | 3, groesseAt: (q: number, r: number) => number, netzSig: string, ausser: { q: number; r: number } | null = null) {
    if (!zentrum) { this.group.visible = false; this.sig = ''; return; }
    this.group.visible = true;
    const sig = `${zentrum.q},${zentrum.r}|${ausser ? ausser.q + ',' + ausser.r : ''}|${noetig}|${netzSig}|${this.ex}|${this.map.groundRev}`;
    if (sig === this.sig) return;
    this.sig = sig;
    const { m, q, p, s } = this;
    const farbe = new THREE.Color();
    for (const x of this.saetze) x.beginne();
    this.anzahl = [0, 0, 0];
    for (const h of hexeImUmkreis(zentrum, BAUPLATZ_RADIUS, true)) {
      const g = groesseAt(h.q, h.r);
      if (g < 1 || (ausser && h.q === ausser.q && h.r === ausser.r)) continue;
      const w = this.grid.toWorld(h);
      const d = hexAbstand(h, zentrum);
      // zum Rand hin kleiner, damit der Umkreis weich ausläuft
      const sk = 0.62 * (1 - 0.4 * (d / BAUPLATZ_RADIUS) ** 2);
      p.set(w.x, (this.map.heightAt(w.x, w.z) - this.base) * this.ex + 3, w.z);
      m.compose(p, q.identity(), s.set(sk, sk, sk));
      farbe.copy(noetig === 0 ? neutral : g >= noetig ? gruen : rot);
      this.saetze[g - 1].fuege(m, farbe);
      this.anzahl[g - 1]++;
    }
    for (const x of this.saetze) x.fertig();
  }
}
