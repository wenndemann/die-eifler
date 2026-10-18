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

  zeige(map: MapData, grid: HexGrid, base: number, h: { q: number; r: number }, art: RingArt, breite: number, rev: number) {
    const sig = `${h.q},${h.r},${Math.round(breite * 4)},${rev},${map.groundRev}`;
    this.mat.color.set(RING_FARBE[art]);
    this.mesh.visible = true;
    if (sig === this.sig) return;
    this.sig = sig;
    const c = grid.toWorld(h);
    const R = HEX.R * 0.94;
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

export class Markierung {
  readonly group = new THREE.Group();
  private ringe = [new Ring(), new Ring(), new Ring()];
  private rev = 0;

  constructor(private map: MapData, private grid: HexGrid, private base: number, ex: number) {
    for (const r of this.ringe) this.group.add(r.mesh);
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

  alleAus() {
    for (const r of this.ringe) r.verstecke();
  }
}
