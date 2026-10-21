// Wiesen-Deko (STIL.md §6, Wimmelbuch): Büsche, Blumenflecken, Feldsteine und Pilze auf freien Wiesen- und Heide-Hexen des
// Spielfelds, damit die Flächen zwischen den Häusern leben. Reiner Schmuck, kein Spielzustand: Lage aus dem Welt-Hex (Hash), auf
// belegten Hexen (Gebäude samt Nachbarn, Fahnen, Wege) wird sie ausgeblendet. Ein Draw-Call je Art.
import * as THREE from 'three';
import { kulisseUniforms, mitSchnee } from './kulisse';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { MapData } from '../map/mapdata';
import type { HexGrid } from '../map/hex';
import type { SimSicht } from '../sim/typen';
import { FLAG } from '../welt/format';
import { Instanzen } from './instanzen';
import { paint } from './mockup';
import { hash } from './terrain';

const kugel = (r: number, x: number, y: number, z: number, f: string, sy = 1) => paint(new THREE.SphereGeometry(r, 8, 6).scale(1, sy, 1).translate(x, y, z), f);

/** Arten: 0 Busch, 1 Blumenfleck, 2 Feldsteine, 3 Pilze, 4 Holzstapel mit Bank. Maße in Metern (Spiel). */
function geometrien(): THREE.BufferGeometry[] {
  const busch = mergeGeometries([kugel(3.2, 0, 2.4, 0, '#5f9a3a', 0.8), kugel(2.4, 2.6, 1.8, 0.8, '#6fa646', 0.8), kugel(2.2, -2.2, 1.7, -0.6, '#548f34', 0.8),
    kugel(0.45, 1.2, 4.2, 1.6, '#e0392b'), kugel(0.45, -1.5, 3.6, 1.8, '#e0392b')])!;
  const blumen: THREE.BufferGeometry[] = [kugel(4, 0, 0.2, 0, '#7fb24e', 0.12)];
  for (let i = 0; i < 12; i++) {
    const a = i * 2.39, r = 0.8 + (i % 4) * 0.8;
    blumen.push(kugel(0.55, Math.cos(a) * r, 0.7, Math.sin(a) * r, ['#e0392b', '#f2b829', '#c86ad0', '#f4f1e8', '#5a8ad0'][i % 5]));
  }
  const steine = mergeGeometries([kugel(1.6, 0, 0.7, 0, '#9a8f7e', 0.6), kugel(1.1, 2.0, 0.5, 0.9, '#a89c88', 0.6), kugel(0.8, -1.3, 0.4, 1.4, '#8e8474', 0.6), kugel(0.9, 0.2, 1.4, 0.2, '#6d8a3e', 0.35)])!;
  const pilze: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 3; i++) {
    const x = (i - 1) * 1.3, z = (i % 2) * 0.9;
    pilze.push(paint(new THREE.CylinderGeometry(0.28, 0.35, 1.2, 7).translate(x, 0.6, z), '#f4ead8'));
    pilze.push(paint(new THREE.SphereGeometry(0.9, 9, 6, 0, Math.PI * 2, 0, Math.PI / 2).translate(x, 1.1, z), '#d6262a'));
    pilze.push(kugel(0.16, x + 0.3, 1.75, z + 0.3, '#ffffff'));
  }
  const holz: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 6; i++) {
    const lage = i < 3 ? 0 : i < 5 ? 1 : 2, x = (i < 3 ? i - 1 : i < 5 ? i - 3.5 : 0) * 1.25;
    holz.push(paint(new THREE.CylinderGeometry(0.6, 0.6, 3.6, 8).rotateX(Math.PI / 2).translate(x, 0.6 + lage * 1.05, 0), '#8a6340'));
    holz.push(paint(new THREE.CylinderGeometry(0.5, 0.5, 3.65, 8).rotateX(Math.PI / 2).translate(x, 0.6 + lage * 1.05, 0).scale(1, 1, 1.0), '#dcb878'));
  }
  holz.push(paint(new THREE.BoxGeometry(4, 0.3, 1.1).translate(0, 1.4, 3.4), '#9a6a40'));
  for (const sx of [-1.6, 1.6]) holz.push(paint(new THREE.BoxGeometry(0.3, 1.3, 0.9).translate(sx, 0.65, 3.4), '#6a4a2e'));
  return [busch, mergeGeometries(blumen)!, steine, mergeGeometries(pilze)!, mergeGeometries(holz)!];
}

export class Deko {
  readonly group = new THREE.Group();
  private saetze: Instanzen[];
  /** je Deko: Hex-Index, Art, Lage. */
  private stuecke: { h: number; art: number; x: number; z: number; ry: number; s: number }[] = [];
  private sig = '';
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private p = new THREE.Vector3();
  private sk = new THREE.Vector3();
  private yAchse = new THREE.Vector3(0, 1, 0);

  constructor(private map: MapData, private grid: HexGrid, private base: number, private ex: number) {
    const mat = mitSchnee(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }));
    this.saetze = geometrien().map((g) => new Instanzen(this.group, g, mat, false, true, [], 256));
    const f = grid.feld;
    let i = 0;
    for (let dr = -f.n; dr <= f.n; dr++) {
      for (let dq = Math.max(-f.n, -dr - f.n); dq <= Math.min(f.n, -dr + f.n); dq++, i++) {
        const t = f.terrain[i];
        if ((t !== 1 && t !== 3) || (f.flags[i] & (FLAG.ortskern | FLAG.bahn))) continue;
        const q = f.q + dq, r = f.r + dr;
        const w = hash(q * 17 + 3, r * 31 + 7);
        if (w > 0.34) continue;
        const art = w < 0.1 ? 0 : w < 0.22 ? 1 : w < 0.26 ? 2 : w < 0.29 ? 3 : 4;
        const c = grid.toWorld({ q, r });
        const j = (k: number) => (hash(q + k * 101, r - k * 57) - 0.5) * 50;
        this.stuecke.push({ h: i, art, x: c.x + j(1), z: c.z + j(2), ry: hash(q, r + 5) * 6.28, s: 0.8 + hash(r, q + 9) * 0.5 });
      }
    }
  }

  setExaggeration(ex: number) { this.ex = ex; this.sig = ''; }

  /** Neu setzen, wenn sich Gebäude, Fahnen oder Wege ändern (Deko auf belegten Hexen weg). */
  update(sicht: SimSicht) {
    // Blumen und Pilze unter dem Schnee weg
    const winter = kulisseUniforms.uSchnee.value > 0.4;
    this.saetze[1].mesh.visible = this.saetze[3].mesh.visible = !winter;
    const sig = `${sicht.gebaeude.length}:${sicht.fahnen.length}:${sicht.segmente.length}:${this.map.groundRev}`;
    if (sig === this.sig) return;
    this.sig = sig;
    const belegt = new Set<number>();
    const idx = (h: { q: number; r: number }) => this.grid.feld.index(h.q, h.r);
    const nb = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
    for (const g of sicht.gebaeude) { belegt.add(idx(g)); for (const [dq, dr] of nb) belegt.add(idx({ q: g.q + dq, r: g.r + dr })); }
    for (const f of sicht.fahnen) belegt.add(idx(f));
    for (const s of sicht.segmente) for (const h of s.pfad) belegt.add(idx(h));
    for (const s of this.saetze) s.beginne();
    for (const d of this.stuecke) {
      if (belegt.has(d.h)) continue;
      const y = (this.map.heightAt(d.x, d.z) - this.base) * this.ex;
      this.q.setFromAxisAngle(this.yAchse, d.ry);
      this.sk.set(d.s, d.s, d.s);
      this.m.compose(this.p.set(d.x, y, d.z), this.q, this.sk);
      this.saetze[d.art].fuege(this.m);
    }
    for (const s of this.saetze) s.fertig();
  }
}
