// Geistermodell beim Bauen: das fertige Gebäude halbdurchsichtig am Zielhex, grünlich wenn gebaut werden kann, rötlich sonst.
// Nutzt die Modelle aus gebaeude.ts (geistModell), planiert nichts und ändert die Karte nie.
import * as THREE from 'three';
import type { MapData } from '../map/mapdata';
import type { HexGrid } from '../map/hex';
import { geistModell } from './gebaeude';

const FARBE_GUT = '#9dffa0', FARBE_SCHLECHT = '#ff8f80';

export class Geist {
  readonly group = new THREE.Group();
  private meshes = new Map<string, THREE.Mesh>();
  private mats = {
    gut: this.material(FARBE_GUT),
    schlecht: this.material(FARBE_SCHLECHT),
  };
  private sig = '';

  constructor(private map: MapData, private grid: HexGrid, private base: number, private ex: number) {
    this.group.visible = false;
  }

  private material(farbe: string): THREE.MeshStandardMaterial {
    return new THREE.MeshStandardMaterial({
      vertexColors: true, color: farbe, roughness: 0.8, flatShading: true, side: THREE.DoubleSide,
      transparent: true, opacity: 0.8, depthWrite: false, emissive: farbe, emissiveIntensity: 0.3,
    });
  }

  setExaggeration(ex: number) {
    this.ex = ex;
    this.sig = '';
  }

  /** Geist für `typ` auf Hex `h` zeigen (ok = kann gebaut werden); typ oder h null blendet aus. */
  setze(typ: string | null, h: { q: number; r: number } | null, ok: boolean) {
    if (!typ || !h) { this.group.visible = false; return; }
    const sig = `${typ}|${h.q},${h.r}|${ok}|${this.map.groundRev}|${this.ex}`;
    this.group.visible = true;
    if (sig === this.sig) return;
    this.sig = sig;
    const g = geistModell(typ, this.grid, h.q, h.r);
    let mesh = this.meshes.get(typ);
    if (!mesh) {
      mesh = new THREE.Mesh(g.geo, this.mats.gut);
      mesh.frustumCulled = false;
      mesh.renderOrder = 4;
      this.meshes.set(typ, mesh);
      this.group.add(mesh);
    }
    for (const m of this.meshes.values()) m.visible = m === mesh;
    mesh.material = ok ? this.mats.gut : this.mats.schlecht;
    mesh.scale.setScalar(g.sk);
    mesh.position.set(g.x, (this.map.heightAt(g.x, g.z) - this.base) * this.ex - g.boden, g.z);
  }
}
