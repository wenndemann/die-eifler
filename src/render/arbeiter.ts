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
import { Kontaktschatten } from './kontakt';
import { TRAEGER_H, WARE_TRAGEN, fernFaktor } from './massstab';
import { WAREN_ANZAHL, warenGeometrie } from './waren';
import leben from '../../data/leben.json';
import { GEBAEUDE } from '../sim/daten';
import { dorfLaune, FIGUR_ATTRIBUTE, figur, GESTE, material, variante, type Tracht } from './traeger';

type Beruf = 'holzfaeller' | 'foerster' | 'steinbruch' | 'bauer' | 'jaeger' | 'bauarbeiter' | 'planierer';
/** Beruf des Arbeiters nach der Funktion des Gebäudes (auch Spezialgebäude wie der Basaltbruch). */
const BERUF_VON: Partial<Record<string, Beruf>> = { holzfaeller: 'holzfaeller', foerster: 'foerster', steinbruch: 'steinbruch', hof: 'bauer', jaeger: 'jaeger' };

/** Hemdfarbe je Beruf (färbt Rumpf und Ärmel der Trägerfigur ein). */
const HEMD: Record<Beruf, THREE.Color> = {
  holzfaeller: new THREE.Color('#c0443a'), foerster: new THREE.Color('#3f8f4c'), steinbruch: new THREE.Color('#8f949c'), bauer: new THREE.Color('#5a7fb0'), jaeger: new THREE.Color('#4f6a3a'),
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
function hacke(): THREE.BufferGeometry {
  return mergeGeometries([
    stiel(0.74),
    paint(new THREE.BoxGeometry(0.05, 0.05, 0.1).translate(0, -0.6, 0.04), STAHL_DUNKEL),
    paint(new THREE.BoxGeometry(0.16, 0.03, 0.13).translate(0, -0.63, 0.13), STAHL),            // breites Blatt quer zum Stiel
  ])!;
}
function flinte(): THREE.BufferGeometry {
  return mergeGeometries([
    paint(new THREE.BoxGeometry(0.05, 0.3, 0.07).translate(0, -0.05, 0), STIEL),                // Schaft
    paint(new THREE.CylinderGeometry(0.018, 0.018, 0.62, 6).translate(0, -0.5, 0.01), STAHL_DUNKEL), // Lauf
    paint(new THREE.BoxGeometry(0.06, 0.08, 0.05).translate(0, -0.2, 0.0), STAHL),
  ])!;
}
const WERKZEUG: Record<Beruf, () => THREE.BufferGeometry> = { holzfaeller: axt, foerster: spaten, steinbruch: spitzhacke, bauer: hacke, jaeger: flinte, bauarbeiter: hammer, planierer: spaten };

/** Werkzeuge etwas größer als echt (um die Griffstelle): aus der Spielkamera als Axt, Spaten, Hacke erkennbar. */
const WERKZEUG_GROSS = new THREE.Matrix4().makeScale(1.7, 1.7, 1.7);

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
  bauer: { dauer: 1.0, tief: 0.3, hoch: 0.62, aus: 0.6 },
  // Jäger: legt langsam an, hält still (Ansitz), setzt ab
  jaeger: { dauer: 4.0, tief: 0.35, hoch: 0.7, aus: 0.85 },
  bauarbeiter: { dauer: 0.55, tief: 0.45, hoch: 0.85, aus: 0.6 },
  planierer: { dauer: 1.2, tief: 0.27, hoch: 0.55, aus: 0.55 },
};

interface Zustand { phase: number; yaw: number; x: number; z: number; benutzt: number; zeit: number }

export class Arbeiter {
  readonly group = new THREE.Group();
  private laune = { laune: 0.35, fest: false };
  /** Wenn gesetzt: Figuren wachsen mit dem Kameraabstand (wie die Träger). */
  kamera: THREE.Camera | null = null;
  /** Je Beruf eine Figur mit eigener Tracht (Mütze, Hut, Schürze, Bart: Berufe erkennbar). */
  private figuren: Record<Beruf, Instanzen>;
  private kontakt: Kontaktschatten;
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
    this.kontakt = new Kontaktschatten(this.group, 64);
    const mat = material(), tracht = leben.berufe as Record<Beruf, Tracht>;
    const satz = (b: Beruf, kap: number) => new Instanzen(this.group, figur(tracht[b]), mat, true, true, FIGUR_ATTRIBUTE, kap);
    this.figuren = { holzfaeller: satz('holzfaeller', 32), foerster: satz('foerster', 32), steinbruch: satz('steinbruch', 32), bauer: satz('bauer', 32), jaeger: satz('jaeger', 16), bauarbeiter: satz('bauarbeiter', 8), planierer: satz('planierer', 8) };
    const matte = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, flatShading: false });
    this.werkzeuge = {
      holzfaeller: new Instanzen(this.group, WERKZEUG.holzfaeller(), matte, false, true, [], 32),
      foerster: new Instanzen(this.group, WERKZEUG.foerster(), matte, false, true, [], 32),
      steinbruch: new Instanzen(this.group, WERKZEUG.steinbruch(), matte, false, true, [], 32),
      bauer: new Instanzen(this.group, WERKZEUG.bauer(), matte, false, true, [], 32),
      jaeger: new Instanzen(this.group, WERKZEUG.jaeger(), matte, false, true, [], 16),
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
    this.laune = dorfLaune(sicht);
    for (const f of Object.values(this.figuren)) f.beginne();
    this.kontakt.beginne();
    for (const w of Object.values(this.werkzeuge)) w.beginne();
    for (const w of this.waren) w.beginne();
    const { map, base, ex, m, mw, q, p, s, farbe } = this;
    let n = 0;
    for (const g of sicht.gebaeude) {
      const a = g.arbeiter;
      const beruf = a ? BERUF_VON[GEBAEUDE[g.typ]?.funktion ?? ''] : undefined;
      if (!a || !beruf) continue;
      n++;
      this.figurSetzen(g.id, beruf, a, alpha, dt, map, base, ex, m, mw, q, p, s, farbe);
    }
    // Bauarbeiter und Planierer (Drehbuch 4.5): laufen über die Wege, arbeiten auf dem Bauplatz, warten neben der Fahne
    for (const b of sicht.bauleute) {
      n++;
      const tut = b.tut === 'wartet' ? 'ruht' : b.tut;
      const a: SichtArbeiter = { von: b.von, nach: b.nach, fortschritt: b.fortschritt, schritt: b.schritt, tut, ziel: null, ware: -1 };
      this.figurSetzen(b.id, b.beruf, a, alpha, dt, map, base, ex, m, mw, q, p, s, farbe, b.tut === 'arbeitet');
    }
    for (const f of Object.values(this.figuren)) f.fertig();
    this.kontakt.fertig();
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
    // Mimik: Laune des Dorfs im Gesicht; die Arme bleiben beim Werkzeug (keine Gesten, sonst schwebt es)
    this.figuren[beruf].fuege(m, farbe.copy(HEMD[beruf]), [st.phase, arm, geht ? 1 : arbeitet ? 0.12 : 0.1, this.laune.laune, GESTE.keine, variante(id)]);
    this.kontakt.setze(x, y, z, 0.32 * sk);
    // Werkzeug
    if (!traegt) {
      const wz = this.werkzeuge[beruf];
      if (arbeitet) {
        // am rechten Arm: gleiche Drehung um die Schulter wie im Vertex-Shader (Winkel -2,75 · arm)
        const ang = -2.75 * arm;
        const t = new THREE.Matrix4().makeTranslation(SCHULTER[0], SCHULTER[1], SCHULTER[2])
          .multiply(new THREE.Matrix4().makeRotationAxis(this.xAchse, ang))
          .multiply(new THREE.Matrix4().makeTranslation(-SCHULTER[0] + GRIFF[0], -SCHULTER[1] + GRIFF[1], -SCHULTER[2] + GRIFF[2]))
          .multiply(WERKZEUG_GROSS);
        wz.fuege(mw.copy(m).multiply(t));
      } else {
        // aufrecht in der Hand, Kopf oben, leicht nach vorn geneigt; schwingt mit dem Gang
        const sw = Math.sin(st.phase) * (geht ? 0.12 : 0.02);
        const t = new THREE.Matrix4().makeTranslation(GRIFF[0] + 0.04, GRIFF[1], GRIFF[2] + 0.02)
          .multiply(new THREE.Matrix4().makeRotationX(0.25 + sw))
          .multiply(new THREE.Matrix4().makeRotationZ(Math.PI))
          .multiply(WERKZEUG_GROSS);
        wz.fuege(mw.copy(m).multiply(t));
      }
    }
    if (traegt && a.ware >= 0 && a.ware < WAREN_ANZAHL) {
      const wip = Math.abs(Math.sin(st.phase)) * 0.05 * sk;
      s.set(k * WARE_TRAGEN, k * WARE_TRAGEN, k * WARE_TRAGEN);
      mw.compose(p.set(x, y + 1.12 * sk + wip, z), q, s);
      this.waren[a.ware].fuege(mw);
    }
  }

  /** Zahl der gezeichneten Arbeiter. */
  get anzahl(): number {
    return Object.values(this.figuren).reduce((n, f) => n + f.n, 0);
  }
}
