// Arbeiter-Figuren (M4, M5): Holzfäller, Förster, Steinbruch-Arbeiter, Bauarbeiter (Hammer) und Planierer (Schaufel). Gleiche knubbelige Figur wie die Träger
// (traeger.ts: eine Geometrie, Gliedmaßen im Vertex-Shader), dazu ein Werkzeug je Beruf (Axt, Spaten, Spitzhacke) als
// eigene Instanzen. Beim Gehen trägt die Figur das Werkzeug aufrecht in der Hand; beim Arbeiten ('arbeitet') schwingt
// es mit den Armen (Schlag- bzw. Grabbewegung am Zielhex); beim Heimtragen ('traegt') liegt die Ware sichtbar über
// dem Kopf (waren.ts) und das Werkzeug ist abgelegt. Reiner Leser der SimSicht: Position aus von/nach + fortschritt.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { MapData } from '../map/mapdata';
import type { HexGrid } from '../map/hex';
import { PROMILLE, type Id, type SichtArbeiter, type SimSicht } from '../sim/typen';
import { paint } from './mockup';
import { Instanzen } from './instanzen';
import { TRAEGER_H, fernFaktor } from './massstab';
import { WAREN_ANZAHL, warenGeometrie } from './waren';
import { figur, material } from './traeger';

type Beruf = 'holzfaeller' | 'foerster' | 'steinbruch' | 'bauarbeiter' | 'planierer';
const BERUFE: Beruf[] = ['holzfaeller', 'foerster', 'steinbruch'];

/** Hemdfarbe je Beruf (färbt Rumpf und Ärmel der Trägerfigur ein). */
const HEMD: Record<Beruf, THREE.Color> = {
  holzfaeller: new THREE.Color('#c0443a'), foerster: new THREE.Color('#3f8f4c'), steinbruch: new THREE.Color('#8f949c'),
  bauarbeiter: new THREE.Color('#e0a830'), planierer: new THREE.Color('#8a6a48'),
};

// ---- Werkzeuge in Figur-Einheiten (Figur ist 1 hoch). Ursprung = Griffstelle der Hand; Stiel hängt nach -y, Kopf unten.
const STAHL = '#c4c8cc', STAHL_DUNKEL = '#5a5d63', STIEL = '#8a6340';
const stiel = (len: number, y0 = 0.12) => paint(new THREE.BoxGeometry(0.042, len, 0.042).translate(0, y0 - len / 2, 0), STIEL);

function axt(): THREE.BufferGeometry {
  return mergeGeometries([
    stiel(0.72),
    paint(new THREE.BoxGeometry(0.07, 0.15, 0.1).translate(0, -0.52, 0.02), STAHL_DUNKEL),
    paint(new THREE.BoxGeometry(0.03, 0.22, 0.2).translate(0, -0.52, 0.14), STAHL),
  ])!;
}
function spitzhacke(): THREE.BufferGeometry {
  return mergeGeometries([
    stiel(0.72),
    paint(new THREE.BoxGeometry(0.06, 0.07, 0.2).translate(0, -0.6, 0), STAHL_DUNKEL),
    paint(new THREE.ConeGeometry(0.035, 0.22, 4).rotateX(Math.PI / 2).translate(0, -0.6, 0.2), STAHL),
    paint(new THREE.ConeGeometry(0.035, 0.22, 4).rotateX(-Math.PI / 2).translate(0, -0.6, -0.2), STAHL),
  ])!;
}
function spaten(): THREE.BufferGeometry {
  return mergeGeometries([
    stiel(0.62),
    paint(new THREE.BoxGeometry(0.14, 0.04, 0.04).translate(0, 0.12, 0), STIEL),               // Quergriff
    paint(new THREE.BoxGeometry(0.17, 0.25, 0.025).translate(0, -0.6, 0), STAHL),               // Blatt
    paint(new THREE.BoxGeometry(0.19, 0.04, 0.035).translate(0, -0.49, 0), STAHL_DUNKEL),
  ])!;
}
function hammer(): THREE.BufferGeometry {
  return mergeGeometries([
    stiel(0.55),
    paint(new THREE.BoxGeometry(0.09, 0.11, 0.24).translate(0, -0.42, 0.02), STAHL_DUNKEL),
    paint(new THREE.BoxGeometry(0.1, 0.12, 0.06).translate(0, -0.42, 0.16), STAHL),
  ])!;
}
const WERKZEUG: Record<Beruf, () => THREE.BufferGeometry> = { holzfaeller: axt, foerster: spaten, steinbruch: spitzhacke, bauarbeiter: hammer, planierer: spaten };

/** Schulter und Hand-Griffstelle (rechter Arm der Trägerfigur, traeger.ts). */
const SCHULTER: [number, number, number] = [0.25, 0.54, 0];
const GRIFF: [number, number, number] = [0.32, 0.27, 0.03];

/** Armwinkel-Kurve 0..1 (Anteil „Arm hoch“ im Shader) beim Arbeiten: langsam ausholen, schnell zuschlagen. */
function schlag(u: number, tief: number, hoch: number, ausholen = 0.68): number {
  const a = u < ausholen ? (1 - Math.cos((u / ausholen) * Math.PI)) / 2 : 1 - Math.pow((u - ausholen) / (1 - ausholen), 0.55);
  return tief + (hoch - tief) * a;
}
const ARBEIT: Record<Beruf, { dauer: number; tief: number; hoch: number; aus: number }> = {
  holzfaeller: { dauer: 1.1, tief: 0.5, hoch: 0.98, aus: 0.7 },
  steinbruch: { dauer: 1.35, tief: 0.5, hoch: 1.0, aus: 0.72 },
  foerster: { dauer: 1.5, tief: 0.27, hoch: 0.52, aus: 0.55 },
  bauarbeiter: { dauer: 0.55, tief: 0.45, hoch: 0.85, aus: 0.6 },
  planierer: { dauer: 1.2, tief: 0.27, hoch: 0.55, aus: 0.55 },
};

interface Zustand { phase: number; yaw: number; x: number; z: number; benutzt: number; zeit: number }

export class Arbeiter {
  readonly group = new THREE.Group();
  /** Wenn gesetzt: Figuren wachsen mit dem Kameraabstand (wie die Träger). */
  kamera: THREE.Camera | null = null;
  private figuren: Instanzen;
  private werkzeuge: Record<Beruf, Instanzen>;
  private waren: Instanzen[] = [];
  private zustand = new Map<Id, Zustand>();
  private runde = 0;
  private ex: number;
  private m = new THREE.Matrix4();
  private mw = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private p = new THREE.Vector3();
  private s = new THREE.Vector3();
  private yAchse = new THREE.Vector3(0, 1, 0);
  private xAchse = new THREE.Vector3(1, 0, 0);
  private farbe = new THREE.Color();

  constructor(private map: MapData, private grid: HexGrid, private base: number, ex: number) {
    this.ex = ex;
    this.figuren = new Instanzen(this.group, figur(), material(), true, true, [{ name: 'aAnim', size: 3 }], 32);
    const matte = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, flatShading: false });
    this.werkzeuge = {
      holzfaeller: new Instanzen(this.group, WERKZEUG.holzfaeller(), matte, false, true, [], 32),
      foerster: new Instanzen(this.group, WERKZEUG.foerster(), matte, false, true, [], 32),
      steinbruch: new Instanzen(this.group, WERKZEUG.steinbruch(), matte, false, true, [], 32),
      bauarbeiter: new Instanzen(this.group, WERKZEUG.bauarbeiter(), matte, false, true, [], 8),
      planierer: new Instanzen(this.group, WERKZEUG.planierer(), matte, false, true, [], 8),
    };
    const waren = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, flatShading: false });
    for (let a = 0; a < WAREN_ANZAHL; a++) this.waren.push(new Instanzen(this.group, warenGeometrie(a), waren, false, true, [], 32));
  }

  setExaggeration(ex: number) {
    this.ex = ex;
  }

  update(sicht: SimSicht, alpha = 0, dt = 0) {
    this.runde++;
    this.figuren.beginne();
    for (const w of Object.values(this.werkzeuge)) w.beginne();
    for (const w of this.waren) w.beginne();
    const { map, base, ex, m, mw, q, p, s, farbe } = this;
    let n = 0;
    for (const g of sicht.gebaeude) {
      const a = g.arbeiter;
      if (!a || !(BERUFE as string[]).includes(g.typ)) continue;
      n++;
      this.figurSetzen(g.id, g.typ as Beruf, a, alpha, dt, map, base, ex, m, mw, q, p, s, farbe);
    }
    // Bauarbeiter und Planierer (Drehbuch 4.5): laufen über die Wege, arbeiten auf dem Bauplatz, warten neben der Fahne
    for (const b of sicht.bauleute) {
      n++;
      const tut = b.tut === 'wartet' ? 'ruht' : b.tut;
      const a: SichtArbeiter = { von: b.von, nach: b.nach, fortschritt: b.fortschritt, schritt: b.schritt, tut, ziel: null, ware: -1 };
      this.figurSetzen(b.id, b.beruf, a, alpha, dt, map, base, ex, m, mw, q, p, s, farbe, b.tut === 'arbeitet');
    }
    this.figuren.fertig();
    for (const w of Object.values(this.werkzeuge)) w.fertig();
    for (const w of this.waren) w.fertig();
    if (this.zustand.size > n + 8) for (const [id, z] of this.zustand) if (z.benutzt !== this.runde) this.zustand.delete(id);
  }

  private figurSetzen(id: Id, beruf: Beruf, a: SichtArbeiter, alpha: number, dt: number, map: MapData, base: number, ex: number,
    m: THREE.Matrix4, mw: THREE.Matrix4, q: THREE.Quaternion, p: THREE.Vector3, s: THREE.Vector3, farbe: THREE.Color, aufBauplatz = false) {
    const geht = a.tut === 'geht' || a.tut === 'traegt';
    const f = Math.min(1, Math.max(0, (a.fortschritt + (geht ? alpha * a.schritt : 0)) / PROMILLE));
    const w0 = this.grid.toWorld(a.von), w1 = this.grid.toWorld(a.nach);
    let x = w0.x + (w1.x - w0.x) * f, z = w0.z + (w1.z - w0.z) * f;
    if (a.tut === 'ruht') { x += 11; z += 8; }   // neben der Fahne, nicht in ihr
    // Bauleute arbeiten hinter der Fahne auf dem Grundstück, je nach Id etwas versetzt
    if (aufBauplatz) { x += Math.sin(id * 1.7) * 9; z -= 14 + Math.cos(id * 1.3) * 5; }
    let st = this.zustand.get(id);
    if (!st) {
      st = { phase: (id * 2.3) % 6.28, yaw: Math.atan2(w1.x - w0.x, w1.z - w0.z) || 0, x, z, benutzt: 0, zeit: (id * 0.37) % 1 };
      this.zustand.set(id, st);
    }
    st.benutzt = this.runde;
    const dx = x - st.x, dz = z - st.z, weg = Math.hypot(dx, dz);
    // Blick: in Laufrichtung; beim Arbeiten dem Ziel zu (Richtung der letzten Bewegung bleibt)
    if (weg > 0.05 && geht) {
      const ziel = Math.atan2(dx, dz);
      let d = ziel - st.yaw;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      st.yaw += d * Math.min(1, dt * 12 + (dt === 0 ? 1 : 0));
    }
    st.x = x; st.z = z;
    const arbeitet = a.tut === 'arbeitet', traegt = a.tut === 'traegt';
    if (geht) st.phase += Math.min(weg, 30) / 13 * Math.PI * 2 * 0.5;
    else st.phase += dt * 1.6;
    if (arbeitet) st.zeit += dt / ARBEIT[beruf].dauer;
    const u = st.zeit - Math.floor(st.zeit);
    const y = (map.heightAt(x, z) - base) * ex;
    const k = this.kamera ? fernFaktor(this.kamera.position.distanceTo(p.set(x, y, z))) : 1;
    const sk = TRAEGER_H * k;
    q.setFromAxisAngle(this.yAchse, st.yaw);
    s.set(sk, sk, sk);
    m.compose(p.set(x, y, z), q, s);
    // Arme: beim Tragen hoch (Ware über dem Kopf), beim Arbeiten im Takt von Schlag bzw. Grabstich, sonst locker
    const cfg = ARBEIT[beruf];
    const arm = traegt ? 1 : arbeitet ? schlag(u, cfg.tief, cfg.hoch, cfg.aus) : 0;
    this.figuren.fuege(m, farbe.copy(HEMD[beruf]), [st.phase, arm, geht ? 1 : arbeitet ? 0.12 : 0.1]);
    // Werkzeug
    if (!traegt) {
      const wz = this.werkzeuge[beruf];
      if (arbeitet) {
        // am rechten Arm: gleiche Drehung um die Schulter wie im Vertex-Shader (Winkel -2,75 · arm)
        const ang = -2.75 * arm;
        const t = new THREE.Matrix4().makeTranslation(SCHULTER[0], SCHULTER[1], SCHULTER[2])
          .multiply(new THREE.Matrix4().makeRotationAxis(this.xAchse, ang))
          .multiply(new THREE.Matrix4().makeTranslation(-SCHULTER[0] + GRIFF[0], -SCHULTER[1] + GRIFF[1], -SCHULTER[2] + GRIFF[2]));
        wz.fuege(mw.copy(m).multiply(t));
      } else {
        // aufrecht in der Hand, Kopf oben, leicht nach vorn geneigt; schwingt mit dem Gang
        const sw = Math.sin(st.phase) * (geht ? 0.12 : 0.02);
        const t = new THREE.Matrix4().makeTranslation(GRIFF[0] + 0.04, GRIFF[1], GRIFF[2] + 0.02)
          .multiply(new THREE.Matrix4().makeRotationX(0.25 + sw))
          .multiply(new THREE.Matrix4().makeRotationZ(Math.PI));
        wz.fuege(mw.copy(m).multiply(t));
      }
    }
    if (traegt && a.ware >= 0 && a.ware < WAREN_ANZAHL) {
      const wip = Math.abs(Math.sin(st.phase)) * 0.05 * sk;
      s.set(k, k, k);
      mw.compose(p.set(x, y + 1.18 * sk + wip, z), q, s);
      this.waren[a.ware].fuege(mw);
    }
  }

  /** Zahl der gezeichneten Arbeiter. */
  get anzahl(): number {
    return this.figuren.n;
  }
}
