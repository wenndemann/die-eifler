// Ortskerne (Drehbuch 3: die heutigen Häuser fallen weg): je Ortskern-Hex ein Hauptbau, oft ein Nebenbau,
// dazu mit etwas Wahrscheinlichkeit ein Haus auf Nachbar-Hexen (Stadt dichter als Dorf). Reine Kulisse – die Spiel-
// Dörfer kommen später. Gebäude in HAUS_SKALE-facher Größe (massstab.ts), Fachwerk wie in der Maßstabs-Probe.
// Jedes Haus steht auf einem planierten Sockel: das Gelände (map.ground, nur Darstellung) wird unter dem Grundriss
// eingeebnet und weich ins Hang-Gelände übergeblendet. Keine Häuser auf Wasser-, Fluss- und Bahn-Hexen.
import * as THREE from 'three';
import { mitSchnee } from './kulisse';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { MapData } from '../map/mapdata';
import { HexGrid } from '../map/hex';
import { FLAG } from '../welt/format';
import { hash } from './terrain';
import { fachwerk, mitAnkern, ohneSchindeln, C } from './mockup';
import { HAUS_SKALE, NEBENBAU_P, NACHBAR_P } from './massstab';

/** Bautypen (echte Maße in m: Breite entlang des Firsts, Tiefe, Stockwerke). */
const TYPEN = [
  { w: 14, d: 9, floors: 2, wall: C.wand, dach: '#b0563e' },   // Hofhaus (Ziegel)
  { w: 11, d: 8, floors: 2, wall: C.wand, dach: C.dach },      // Wohnhaus (Schiefer)
  { w: 10, d: 8, floors: 1, wall: '#efd9b8', dach: '#8a5a3a' }, // Nebenbau (Stall, Scheune)
] as const;
const HAUPT = [0, 1], NEBEN = 2;
/** Platz um den Grundriss (echte m): Dachüberstand + Sockel. */
const RAND_M = 1.4;
/** Das Gelände unter dem Haus wird über diese Strecke (m, Spiel) ins Umland übergeblendet. */
const BLEND = 22;
/** Größter Höhenunterschied (m) unter dem Grundriss, bis zu dem noch planiert wird; steiler: kein Haus. */
const MAX_HANG = 9;
const MIN_ABSTAND = 34;               // m zwischen Hausmitten

interface Haus { x: number; z: number; rot: number; typ: number; s: number; a: number; b: number; h0: number }

export class Houses {
  readonly group = new THREE.Group();
  private items: { mesh: THREE.InstancedMesh; data: Float32Array; weg: Uint8Array; licht?: THREE.InstancedMesh }[] = [];
  /** Lebendige Eifel: Fensterlicht der Kulissenhäuser in der Nacht (Farbe über 1, speist das Leuchten). */
  private lichtMat = new THREE.MeshBasicMaterial({ color: '#000000', polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
  private ex = 1;
  count = 0;
  /** Rasterzellen unter und neben den Häusern (für Wald: dort keine Bäume). */
  readonly maske: Uint8Array;

  constructor(private map: MapData, base: number, ex: number) {
    const { width, height, cell } = map.info;
    this.maske = new Uint8Array(width * height);
    const grid = new HexGrid(map.originX, map.originZ, map.ausschnitt.hex);
    const feld = map.ausschnitt.hex;
    const R = map.info.hex.size;
    const kernHexe = new Set(map.ausschnitt.kerne.map((k) => `${k.q},${k.r}`));
    const haeuser: Haus[] = [];

    // Grundriss-Abtastung: 3 x 3 Punkte plus Ecken
    const proben = (x: number, z: number, rot: number, a: number, b: number) => {
      const c = Math.cos(rot), s = Math.sin(rot);
      const out: [number, number][] = [];
      for (const u of [-1, 0, 1]) for (const v of [-1, 0, 1]) out.push([x + (u * a) * c + (v * b) * s, z - (u * a) * s + (v * b) * c]);
      return out;
    };
    const frei = (x: number, z: number, rot: number, a: number, b: number): number | null => {
      let lo = Infinity, hi = -Infinity, sum = 0;
      const pts = proben(x, z, rot, a, b);
      for (const [px, pz] of pts) {
        if (!map.inside(px, pz)) return null;
        const k = map.idx(Math.floor(px / cell), Math.floor(pz / cell));
        if (map.cover[k] === 0 || map.water[k] > 0 || map.railMask[k]) return null;
        const h = map.heightAt(px, pz);
        if (map.surfaceAt(px, pz) > h + 0.05) return null;
        lo = Math.min(lo, h); hi = Math.max(hi, h); sum += h;
      }
      if (hi - lo > MAX_HANG) return null;
      return sum / pts.length;
    };
    const platz = (x: number, z: number, a: number, b: number, minAbst: number) => {
      return haeuser.every((o) => Math.hypot(o.x - x, o.z - z) >= Math.max(minAbst, 0.55 * (a + b + o.a + o.b) / 2 + 6));
    };

    // Hex-Liste: Kern-Hexe und ihre Nachbarn (je Hex höchstens ein Hauptbau + ein Nebenbau)
    const nachbarn = [[1, 0], [0, 1], [-1, 1], [-1, 0], [0, -1], [1, -1]];
    interface Ziel { q: number; r: number; kind: string; kern: boolean; ort: string }
    const ziele: Ziel[] = [];
    const gesehen = new Set<string>();
    for (const kern of map.ausschnitt.kerne) {
      const key = `${kern.q},${kern.r}`;
      if (!gesehen.has(key)) { gesehen.add(key); ziele.push({ q: kern.q, r: kern.r, kind: kern.kind, kern: true, ort: kern.name }); }
    }
    for (const kern of map.ausschnitt.kerne) {
      for (const [dq, dr] of nachbarn) {
        const q = kern.q + dq, r = kern.r + dr, key = `${q},${r}`;
        if (gesehen.has(key) || kernHexe.has(key)) continue;
        gesehen.add(key);
        if (hash(q * 7919 + 13, r * 104729 + 7) >= (NACHBAR_P[kern.kind] ?? 0)) continue;
        ziele.push({ q, r, kind: kern.kind, kern: false, ort: kern.name });
      }
    }

    for (const z of ziele) {
      const hi = feld.index(z.q, z.r);
      if (hi < 0) continue;
      const t = feld.terrain[hi];
      if (t === 0 || (feld.flags[hi] & (FLAG.bahn | FLAG.fluss))) continue;       // Wasser, Bahn, Fluss
      if (!z.kern && ((t !== 1 && t !== 6) || feld.build[hi] === 0)) continue;     // Nachbarn nur auf Wiese/Siedlung mit Bauplatz
      const seed = z.q * 7919 + z.r * 104729;
      const w = grid.toWorld({ q: z.q, r: z.r });
      // Ausrichtung je Ort einheitlich (gleiche Ortsnamen-Hexe nebeneinander), leicht variiert
      let ortHash = 0;
      for (const ch of z.ort) ortHash = (ortHash * 31 + ch.charCodeAt(0)) >>> 0;
      const rot0 = z.ort ? (ortHash % 628) / 100 : hash(seed, 5) * Math.PI;
      const rot = rot0 + (hash(seed, 17) - 0.5) * 0.5 + (hash(seed, 18) < 0.25 ? Math.PI / 2 : 0);
      // Hauptbau: Hex-Mitte, sonst leicht versetzt
      const typ = HAUPT[Math.floor(hash(seed, 19) * HAUPT.length)];
      const s = HAUS_SKALE * (0.93 + hash(seed, 23) * 0.14);
      const ty = TYPEN[typ];
      const a = (ty.w / 2 + RAND_M) * s, b = (ty.d / 2 + RAND_M) * s;
      let haupt: Haus | null = null;
      const versuche: [number, number][] = [[0, 0]];
      for (let k = 0; k < 12; k++) versuche.push([Math.cos(k * 0.5236 + hash(seed, 29)) * R * (k < 6 ? 0.28 : 0.45), Math.sin(k * 0.5236 + hash(seed, 29)) * R * (k < 6 ? 0.28 : 0.45)]);
      for (const [ox, oz] of versuche) {
        const x = w.x + ox, zz = w.z + oz;
        const h0 = frei(x, zz, rot, a, b);
        if (h0 === null || !platz(x, zz, a, b, MIN_ABSTAND)) continue;
        haupt = { x, z: zz, rot, typ, s, a, b, h0 };
        break;
      }
      if (!haupt) continue;
      haeuser.push(haupt);
      // Nebenbau neben dem Hauptbau
      if (hash(seed, 31) < (NEBENBAU_P[z.kind] ?? 0.3)) {
        const ny = TYPEN[NEBEN];
        const s2 = HAUS_SKALE * (0.9 + hash(seed, 37) * 0.15);
        const a2 = (ny.w / 2 + RAND_M) * s2, b2 = (ny.d / 2 + RAND_M) * s2;
        const rot2 = rot + (hash(seed, 41) < 0.5 ? Math.PI / 2 : 0) + (hash(seed, 43) - 0.5) * 0.3;
        const start = hash(seed, 47) * Math.PI * 2;
        for (let k = 0; k < 8; k++) {
          const ang = start + k * (Math.PI / 4);
          const d = (haupt.a + haupt.b) * 0.5 + (a2 + b2) * 0.5 + 6;
          const x = haupt.x + Math.cos(ang) * d, zz = haupt.z + Math.sin(ang) * d;
          // innerhalb des eigenen Hex bleiben (ein Nebenbau soll nicht ins Nachbar-Hex rutschen)
          const hh = grid.fromWorld(x, zz);
          if (hh.q !== z.q || hh.r !== z.r) continue;
          const h0 = frei(x, zz, rot2, a2, b2);
          if (h0 === null || !platz(x, zz, a2, b2, 0)) continue;
          haeuser.push({ x, z: zz, rot: rot2, typ: NEBEN, s: s2, a: a2, b: b2, h0 });
          break;
        }
      }
    }

    // Gelände planieren, Zellen für den Wald sperren
    for (const h of haeuser) this.planiere(h);

    // Instanzen je Bautyp
    const mat = mitSchnee(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, flatShading: true, side: THREE.DoubleSide }));
    TYPEN.forEach((ty, n) => {
      const liste = haeuser.filter((h) => h.typ === n);
      if (!liste.length) return;
      const geo = mergeGeometries(ohneSchindeln(() => fachwerk(ty.w, ty.d, ty.floors, ty.wall, ty.dach)))!;
      // Fenster als Leuchtflächen (gleiche Lage wie die Fenster des Modells, leicht davor)
      const fenster = mitAnkern(() => fachwerk(ty.w, ty.d, ty.floors, ty.wall, ty.dach)).anker.filter((a) => a.art === 'fenster');
      const lichtGeo = fenster.length ? mergeGeometries(fenster.map((a) => new THREE.PlaneGeometry(a.w ?? 1, 1.15)
        .rotateY((a.seite ?? 1) > 0 ? 0 : Math.PI).translate(a.x, a.y, a.z + (a.seite ?? 1) * 0.15)))! : null;
      const data = new Float32Array(liste.length * 5);
      liste.forEach((h, t) => data.set([h.x, h.h0 - base, h.z, h.rot, h.s], t * 5));
      const mesh = new THREE.InstancedMesh(geo, mat, liste.length);
      const col = new THREE.Color();
      liste.forEach((h, t) => {
        const v = 0.9 + hash(Math.floor(h.x), Math.floor(h.z)) * 0.2;
        mesh.setColorAt(t, col.setRGB(v, v * (0.96 + hash(Math.floor(h.z), 7) * 0.06), v * (0.92 + hash(Math.floor(h.x), 9) * 0.1)));
      });
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      let licht: THREE.InstancedMesh | undefined;
      if (lichtGeo) {
        // nicht in jedem Haus brennt Licht
        licht = new THREE.InstancedMesh(lichtGeo, this.lichtMat, liste.length);
        liste.forEach((h, t) => licht!.setColorAt(t, col.setScalar(hash(Math.floor(h.x) + 3, Math.floor(h.z) - 5) < 0.7 ? 0.7 + hash(Math.floor(h.z), Math.floor(h.x)) * 0.5 : 0)));
        licht.visible = false;
        this.group.add(licht);
      }
      this.items.push({ mesh, data, weg: new Uint8Array(liste.length), licht });
      this.group.add(mesh);
      this.count += liste.length;
    });
    this.setExaggeration(ex);
  }

  /** Gelände unter dem Haus auf Sockelhöhe ebnen, außen weich überblenden. */
  private planiere(h: Haus) {
    const map = this.map;
    const { width, height, cell } = map.info;
    const reach = Math.hypot(h.a, h.b) + BLEND;
    const c = Math.cos(h.rot), s = Math.sin(h.rot);
    const i0 = Math.max(0, Math.floor((h.x - reach) / cell)), i1 = Math.min(width - 1, Math.ceil((h.x + reach) / cell));
    const j0 = Math.max(0, Math.floor((h.z - reach) / cell)), j1 = Math.min(height - 1, Math.ceil((h.z + reach) / cell));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const dx = (i + 0.5) * cell - h.x, dz = (j + 0.5) * cell - h.z;
      // Zellmitte ins Haus-Koordinatensystem; Zellen, die den Grundriss berühren, werden voll eingeebnet
      const u = Math.abs(dx * c - dz * s), v = Math.abs(dx * s + dz * c);
      const aus = Math.max(u - h.a - cell * 0.75, v - h.b - cell * 0.75);
      const k = j * width + i;
      if (aus <= 0) { map.ground[k] = h.h0; this.maske[k] = 1; continue; }
      if (aus < BLEND) {
        const t = aus / BLEND, w = 1 - t * t * (3 - 2 * t);
        map.ground[k] += (h.h0 - map.ground[k]) * w;
        if (aus < 14) this.maske[k] = 1;
      }
    }
  }

  /** Nacht 0..1 (Lebendige Eifel): Fensterlicht an, warm und hell genug zum Leuchten. */
  nachtLicht(n: number, farbe: THREE.ColorRepresentation = '#ff9a30', hell = 3): void {
    this.lichtMat.color.set(farbe).multiplyScalar(n * hell);
    for (const it of this.items) if (it.licht) it.licht.visible = n > 0.03;
  }

  /** Kulissenhäuser im Umkreis (Ausschnitt-Meter) ausblenden, z. B. wenn dort ein Spielgebäude entsteht. Liefert die Zahl. */
  verstecke(x: number, z: number, radius: number): number {
    let n = 0;
    for (const it of this.items) {
      for (let t = 0; t < it.weg.length; t++) {
        if (!it.weg[t] && Math.hypot(it.data[t * 5] - x, it.data[t * 5 + 2] - z) < radius) { it.weg[t] = 1; n++; }
      }
    }
    if (n) this.setExaggeration(this.ex);
    return n;
  }

  setExaggeration(ex: number) {
    this.ex = ex;
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);
    for (const it of this.items) {
      const { mesh, data, weg } = it;
      for (let t = 0; t < data.length / 5; t++) {
        // Oberkante des Bruchsteinsockels liegt 1 m (echt) über der Hausmitte-Null: Haus sitzt 0,5 m im planierten Boden
        p.set(data[t * 5], data[t * 5 + 1] * ex - 0.5 * data[t * 5 + 4], data[t * 5 + 2]);
        q.setFromAxisAngle(up, data[t * 5 + 3]);
        const sc = weg[t] ? 0 : data[t * 5 + 4];
        s.set(sc, sc, sc);
        mesh.setMatrixAt(t, m.compose(p, q, s));
        it.licht?.setMatrixAt(t, m);
      }
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
      if (it.licht) { it.licht.instanceMatrix.needsUpdate = true; it.licht.computeBoundingSphere(); }
    }
  }
}
