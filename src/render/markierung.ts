// Hex-Ringe fürs Bauen: farbiger Rand um einen Hex (grün = geht, rot = geht nicht, gold = gewählt), ans Gelände geschmiegt.
// Die Breite wächst mit dem Kameraabstand, damit der Ring auch aus der Ferne und auf dem Handy zu sehen ist.
import * as THREE from 'three';
import type { MapData } from '../map/mapdata';
import type { HexGrid } from '../map/hex';
import { HEX } from '../welt/format';

export const RING_FARBE = { gut: '#6fe06a', schlecht: '#f0463a', gewaehlt: '#ffd36a', neutral: '#efe7d2' } as const;
export type RingArt = keyof typeof RING_FARBE;

const TEIL = 4;      // Teilstücke je Hex-Kante

class Ring {
  readonly mesh: THREE.Mesh;
  private sig = '';
  private mat = new THREE.MeshBasicMaterial({ color: RING_FARBE.neutral, transparent: true, opacity: 1, toneMapped: false, depthTest: false, depthWrite: false, side: THREE.DoubleSide });

  constructor() {
    this.mesh = new THREE.Mesh(new THREE.BufferGeometry(), this.mat);
    this.mesh.renderOrder = 6;
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
  }

  verstecke() {
    this.mesh.visible = false;
  }

  zeige(map: MapData, grid: HexGrid, base: number, h: { q: number; r: number }, art: RingArt, breite: number, rev: number, skala = 1, opak = 1) {
    const sig = `${h.q},${h.r},${Math.round(breite * 4)},${rev},${map.groundRev},${skala}`;
    this.mat.color.set(RING_FARBE[art]);
    this.mat.opacity = opak;
    this.mesh.visible = true;
    if (sig === this.sig) return;
    this.sig = sig;
    const c = grid.toWorld(h);
    const R = HEX.R * 0.94 * skala;
    const ecke = (k: number) => {
      const a = Math.PI / 6 + (Math.PI / 3) * k;
      return { x: Math.cos(a), z: Math.sin(a) };
    };
    const pos: number[] = [];
    const idx: number[] = [];
    const punkte: { x: number; z: number }[] = [];
    for (let k = 0; k < 6; k++) {
      const a = ecke(k), b = ecke(k + 1);
      for (let i = 0; i < TEIL; i++) {
        const t = i / TEIL;
        punkte.push({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t });
      }
    }
    const y = (x: number, z: number) => map.heightAt(x, z) - base + 1.2;
    const n = punkte.length;
    for (const p of punkte) {
      const xa = c.x + p.x * (R - breite), za = c.z + p.z * (R - breite);
      const xb = c.x + p.x * R, zb = c.z + p.z * R;
      pos.push(xa, y(xa, za), za, xb, y(xb, zb), zb);
    }
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      idx.push(2 * i, 2 * i + 1, 2 * j, 2 * i + 1, 2 * j + 1, 2 * j);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    this.mesh.geometry.dispose();
    this.mesh.geometry = g;
  }
}

/** Deckender Streifen am Boden (Umriss, Linie): ungelit, ohne Tiefentest wie die Ringe. */
function streifenMaterial(farbe: string, opak: number) {
  return new THREE.MeshBasicMaterial({ color: farbe, transparent: true, opacity: opak, toneMapped: false, depthTest: false, depthWrite: false, side: THREE.DoubleSide });
}

/** Außenkante einer Hex-Menge (z. B. alle Hexe im Arbeitsradius) als durchgehender Streifen, ans Gelände geschmiegt. */
class Umriss {
  readonly mesh: THREE.Mesh;
  private sig = '';
  constructor(farbe: string, opak: number) {
    this.mesh = new THREE.Mesh(new THREE.BufferGeometry(), streifenMaterial(farbe, opak));
    this.mesh.renderOrder = 5;
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
  }

  setze(map: MapData, grid: HexGrid, base: number, hexe: { q: number; r: number }[], breite: number, rev: number) {
    if (!hexe.length) { this.mesh.visible = false; return; }
    this.mesh.visible = true;
    let sq = 0, sr = 0;
    for (const h of hexe) { sq += h.q * 7 + h.r; sr += h.r * 5 - h.q; }
    const sig = `${hexe.length},${sq},${sr},${Math.round(breite * 4)},${rev},${map.groundRev}`;
    if (sig === this.sig) return;
    this.sig = sig;
    const menge = new Set(hexe.map((h) => `${h.q},${h.r}`));
    // Nachbar-Richtungen (axial) zu den Kanten k = Winkel π/3·(k+1) der Hex-Mitte: aus den Weltpositionen bestimmt
    const o = grid.toWorld({ q: 0, r: 0 });
    const R = HEX.R;
    const nachbar: { dq: number; dr: number; kante: number }[] = [];
    for (const [dq, dr] of [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]]) {
      const w = grid.toWorld({ q: dq, r: dr });
      const a = Math.atan2(w.z - o.z, w.x - o.x);
      const k = ((Math.round(a / (Math.PI / 3)) - 1) % 6 + 6) % 6;   // Kante k liegt bei Winkel π/3·(k+1)
      nachbar.push({ dq, dr, kante: k });
    }
    const pos: number[] = [], idx: number[] = [];
    const y = (x: number, z: number) => map.heightAt(x, z) - base + 1.0;
    const ecke = (c: { x: number; z: number }, k: number, f: number) => {
      const a = Math.PI / 6 + (Math.PI / 3) * k;
      return { x: c.x + Math.cos(a) * R * f, z: c.z + Math.sin(a) * R * f };
    };
    const innen = 1 - breite / R;
    const T = 3;
    for (const h of hexe) {
      const c = grid.toWorld(h);
      for (const nb of nachbar) {
        if (menge.has(`${h.q + nb.dq},${h.r + nb.dr}`)) continue;
        const k = nb.kante;
        for (let t = 0; t < T; t++) {
          const f0 = t / T, f1 = (t + 1) / T;
          const a = ecke(c, k, 1), b = ecke(c, k + 1, 1);
          const ai = ecke(c, k, innen), bi = ecke(c, k + 1, innen);
          const lerp = (u: { x: number; z: number }, v: { x: number; z: number }, f: number) => ({ x: u.x + (v.x - u.x) * f, z: u.z + (v.z - u.z) * f });
          const q0 = lerp(a, b, f0), q1 = lerp(a, b, f1), r0 = lerp(ai, bi, f0), r1 = lerp(ai, bi, f1);
          const n = pos.length / 3;
          for (const v of [q0, q1, r0, r1]) pos.push(v.x, y(v.x, v.z), v.z);
          idx.push(n, n + 1, n + 2, n + 1, n + 3, n + 2);
        }
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    this.mesh.geometry.dispose();
    this.mesh.geometry = g;
  }
}

/** Dünne Linie zwischen zwei Punkten am Boden (Gebäude → Arbeitsmittelpunkt). */
class Linie {
  readonly mesh: THREE.Mesh;
  private sig = '';
  constructor(farbe: string, opak: number) {
    this.mesh = new THREE.Mesh(new THREE.BufferGeometry(), streifenMaterial(farbe, opak));
    this.mesh.renderOrder = 5;
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
  }

  setze(map: MapData, grid: HexGrid, base: number, von: { q: number; r: number } | null, nach: { q: number; r: number } | null, breite: number) {
    if (!von || !nach) { this.mesh.visible = false; return; }
    this.mesh.visible = true;
    const sig = `${von.q},${von.r},${nach.q},${nach.r},${Math.round(breite * 4)},${map.groundRev}`;
    if (sig === this.sig) return;
    this.sig = sig;
    const a = grid.toWorld(von), b = grid.toWorld(nach);
    const len = Math.hypot(b.x - a.x, b.z - a.z) || 1;
    const nx = -(b.z - a.z) / len * breite / 2, nz = (b.x - a.x) / len * breite / 2;
    const n = Math.max(2, Math.ceil(len / 12));
    const pos: number[] = [], idx: number[] = [];
    const y = (x: number, z: number) => map.heightAt(x, z) - base + 1.1;
    for (let i = 0; i <= n; i++) {
      const x = a.x + (b.x - a.x) * i / n, z = a.z + (b.z - a.z) * i / n;
      pos.push(x - nx, y(x, z), z - nz, x + nx, y(x, z), z + nz);
      if (i < n) idx.push(2 * i, 2 * i + 1, 2 * i + 2, 2 * i + 1, 2 * i + 3, 2 * i + 2);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    this.mesh.geometry.dispose();
    this.mesh.geometry = g;
  }
}

/** Kleine Fahne auf einem Hex (Arbeitsmittelpunkt): Stange und Wimpel, ungelit. */
class Mittelfahne {
  readonly mesh: THREE.Mesh;
  constructor() {
    const stange = new THREE.BoxGeometry(1.6, 24, 1.6).translate(0, 12, 0);
    const wimpel = new THREE.BufferGeometry();
    wimpel.setAttribute('position', new THREE.Float32BufferAttribute([0.8, 23, 0, 16, 18.5, 0, 0.8, 14, 0], 3));
    const teile = [stange.toNonIndexed(), wimpel];
    const pos: number[] = [], farbe: number[] = [];
    const c1 = new THREE.Color('#f4ead2'), c2 = new THREE.Color('#ffd36a');
    teile.forEach((g, i) => {
      const a = g.attributes.position;
      for (let k = 0; k < a.count; k++) { pos.push(a.getX(k), a.getY(k), a.getZ(k)); const c = i === 0 ? c1 : c2; farbe.push(c.r, c.g, c.b); }
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(farbe, 3));
    this.mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false, depthTest: false, depthWrite: false, side: THREE.DoubleSide }));
    this.mesh.renderOrder = 7;
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
  }
}

export class Markierung {
  readonly group = new THREE.Group();
  private ringe = [new Ring(), new Ring(), new Ring()];
  /** Kleine Ringe in Gruppen (z. B. Zwischenpunkte, mögliche nächste Schritte); wächst nach Bedarf. */
  private gruppen = new Map<string, Ring[]>();
  private rev = 0;
  /** Außenkanten der Arbeitsbereiche: innen = „gut“, außen = „geht noch“. */
  private umrisse = new Map<string, Umriss>();
  private linie = new Linie('#ffe9b8', 0.55);
  private fahne = new Mittelfahne();

  constructor(private map: MapData, private grid: HexGrid, private base: number, ex: number) {
    for (const r of this.ringe) this.group.add(r.mesh);
    this.group.add(this.linie.mesh, this.fahne.mesh);
    this.setExaggeration(ex);
  }

  setExaggeration(ex: number) {
    this.group.scale.y = ex;
  }

  /** Platz 0..2 belegen (0 = Hover/Ziel, 1 = Wegstart, 2 = Reserve); null blendet aus. */
  setze(platz: number, h: { q: number; r: number } | null, art: RingArt, kameraAbstand: number) {
    const ring = this.ringe[platz];
    if (!h) { ring.verstecke(); return; }
    const breite = Math.min(HEX.R * 0.3, Math.max(4, kameraAbstand * 0.008));
    ring.zeige(this.map, this.grid, this.base, h, art, breite, this.rev);
  }

  /** Mehrere kleine Ringe einer Gruppe setzen (überzählige werden ausgeblendet); leere Liste blendet die Gruppe aus. */
  setzeListe(gruppe: string, hexe: { q: number; r: number }[], art: RingArt, kameraAbstand: number, skala = 0.5, opak = 1) {
    let ringe = this.gruppen.get(gruppe);
    if (!ringe) { ringe = []; this.gruppen.set(gruppe, ringe); }
    while (ringe.length < hexe.length) { const r = new Ring(); ringe.push(r); this.group.add(r.mesh); }
    const breite = Math.min(HEX.R * 0.18, Math.max(3, kameraAbstand * 0.005));
    ringe.forEach((ring, i) => {
      if (i < hexe.length) ring.zeige(this.map, this.grid, this.base, hexe[i], art, breite, this.rev, skala, opak);
      else ring.verstecke();
    });
  }

  /** Außenkante einer Hex-Menge als Streifen (leere Liste blendet aus); `dick` skaliert die Breite mit dem Kameraabstand. */
  setzeUmriss(name: string, hexe: { q: number; r: number }[], farbe: string, opak: number, kameraAbstand: number, dick = 1) {
    let u = this.umrisse.get(name);
    if (!u) { u = new Umriss(farbe, opak); this.umrisse.set(name, u); this.group.add(u.mesh); }
    const m = u.mesh.material as THREE.MeshBasicMaterial;
    m.color.set(farbe); m.opacity = opak;
    u.setze(this.map, this.grid, this.base, hexe, Math.min(HEX.R * 0.25, Math.max(3.4, kameraAbstand * 0.0068)) * dick, this.rev);
  }

  /** Dünne Linie Gebäude → Arbeitsmittelpunkt (null blendet aus). */
  setzeLinie(von: { q: number; r: number } | null, nach: { q: number; r: number } | null, kameraAbstand: number) {
    this.linie.setze(this.map, this.grid, this.base, von, nach, Math.min(6, Math.max(1.6, kameraAbstand * 0.0026)));
  }

  /** Fähnchen auf dem Arbeitsmittelpunkt (null blendet aus). */
  setzeFahne(h: { q: number; r: number } | null, kameraAbstand: number) {
    if (!h) { this.fahne.mesh.visible = false; return; }
    const c = this.grid.toWorld(h);
    this.fahne.mesh.visible = true;
    this.fahne.mesh.position.set(c.x, this.map.heightAt(c.x, c.z) - this.base, c.z);
    this.fahne.mesh.scale.setScalar(Math.min(2.2, Math.max(0.8, kameraAbstand / 700)));
  }

  alleAus() {
    for (const u of this.umrisse.values()) u.mesh.visible = false;
    this.linie.mesh.visible = false; this.fahne.mesh.visible = false;
    for (const r of this.ringe) r.verstecke();
    for (const g of this.gruppen.values()) for (const r of g) r.verstecke();
  }
}
