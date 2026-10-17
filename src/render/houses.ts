// Ortskerne (Drehbuch 3: die heutigen Häuser fallen weg): ein paar kleine Eifel-Häuser dicht um jeden
// Ortskern-Hex (Stadt 12-20, Dorf 4-8, Weiler 2-3). Reine Kulisse – die Spiel-Dörfer kommen später.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { MapData } from '../map/mapdata';
import { hash } from './terrain';

function paint(g: THREE.BufferGeometry, color: string) {
  const geo = g.index ? g.toNonIndexed() : g;
  const c = new THREE.Color(color);
  const n = geo.attributes.position.count;
  const a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) a.set([c.r, c.g, c.b], i * 3);
  geo.setAttribute('color', new THREE.BufferAttribute(a, 3));
  geo.deleteAttribute('uv');
  geo.deleteAttribute('normal');
  return geo;
}

/** Satteldach als Prisma über einer Grundfläche w×d, First entlang x. */
function roof(w: number, d: number, h: number, y: number) {
  const x = w / 2 + 0.8, z = d / 2 + 0.9;
  const p = [
    // Dachflächen
    -x, y, z, x, y, z, x, y + h, 0, -x, y, z, x, y + h, 0, -x, y + h, 0,
    x, y, -z, -x, y, -z, -x, y + h, 0, x, y, -z, -x, y + h, 0, x, y + h, 0,
  ];
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
  const gable = new THREE.BufferGeometry();
  const gx = w / 2;
  gable.setAttribute('position', new THREE.Float32BufferAttribute([
    gx, y, d / 2, gx, y, -d / 2, gx, y + h, 0, -gx, y, -d / 2, -gx, y, d / 2, -gx, y + h, 0,
  ], 3));
  return { roof: geo, gable };
}

function houseGeometry(wall: string) {
  const w = 15, d = 9.5, h = 6.5;
  const r = roof(w, d, 6.5, h);
  const g = mergeGeometries([
    paint(new THREE.BoxGeometry(w, h + 2, d).translate(0, h / 2 - 1, 0), wall),
    paint(r.gable, wall),
    paint(r.roof, '#3a3f47'),
    paint(new THREE.BoxGeometry(1.4, 3, 1.4).translate(w * 0.25, h + 5, 0), '#6d625a'),
  ])!;
  g.computeVertexNormals();
  return g;
}

const ANZAHL: Record<string, [number, number]> = { stadt: [12, 20], dorf: [4, 8], weiler: [2, 3] };

export class Houses {
  readonly group = new THREE.Group();
  private items: { mesh: THREE.InstancedMesh; data: Float32Array }[] = [];
  count = 0;

  constructor(map: MapData, base: number, ex: number) {
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, flatShading: true, side: THREE.DoubleSide });
    const kinds = [houseGeometry('#ece4d2'), houseGeometry('#d9cdb4'), houseGeometry('#c9c0b2')];
    const lists: number[][] = kinds.map(() => []);
    const R = map.info.hex.size;
    for (const kern of map.ausschnitt.kerne) {
      const [lo, hi] = ANZAHL[kern.kind] ?? ANZAHL.dorf;
      const seed = kern.q * 7919 + kern.r * 104729;
      const want = lo + Math.floor(hash(seed, 3) * (hi - lo + 1));
      // Straßenzug-Richtung je Kern, Häuser dicht um die Mitte, mit Mindestabstand
      const base0 = hash(seed, 5) * Math.PI;
      const placed: { x: number; z: number }[] = [];
      for (let t = 0; t < want * 40 && placed.length < want; t++) {
        const a = hash(seed + t, 11) * Math.PI * 2;
        const rad = Math.sqrt(hash(seed + t, 13)) * R * (kern.kind === 'stadt' ? 0.95 : 0.8);
        const x = kern.x + Math.cos(a) * rad, z = kern.z + Math.sin(a) * rad;
        if (placed.some((p) => Math.hypot(p.x - x, p.z - z) < 19)) continue;
        if (map.surfaceAt(x, z) > map.heightAt(x, z) + 0.05 || map.cover[map.idx(Math.floor(x / 10), Math.floor(z / 10))] === 0) continue;
        const hs = [map.heightAt(x - 7, z - 5), map.heightAt(x + 7, z + 5), map.heightAt(x - 7, z + 5), map.heightAt(x + 7, z - 5)];
        if (Math.max(...hs) - Math.min(...hs) > 5) continue;
        placed.push({ x, z });
        const rot = base0 + (placed.length % 3 === 0 ? Math.PI / 2 : 0) + (hash(seed + t, 17) - 0.5) * 0.3;
        const kind = Math.floor(hash(seed + t, 19) * kinds.length);
        lists[kind].push(x, Math.min(...hs) - base, z, rot, 0.9 + hash(seed + t, 23) * 0.35);
      }
    }
    kinds.forEach((geo, n) => {
      if (!lists[n].length) return;
      const data = new Float32Array(lists[n]);
      const mesh = new THREE.InstancedMesh(geo, mat, data.length / 5);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.items.push({ mesh, data });
      this.group.add(mesh);
      this.count += data.length / 5;
    });
    this.setExaggeration(ex);
  }

  setExaggeration(ex: number) {
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);
    for (const { mesh, data } of this.items) {
      for (let t = 0; t < data.length / 5; t++) {
        p.set(data[t * 5], data[t * 5 + 1] * ex - 1, data[t * 5 + 2]);
        q.setFromAxisAngle(up, data[t * 5 + 3]);
        const sc = data[t * 5 + 4];
        s.set(sc, sc, sc);
        mesh.setMatrixAt(t, m.compose(p, q, s));
      }
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
    }
  }
}
