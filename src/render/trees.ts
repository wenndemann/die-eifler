// Wald: Fichten und Buchen als Instanzen je Gelände-Chunk, zwei Detailstufen
// (nah: Low-Poly mit Schatten, fern: einfache Silhouette). Leichter Wind im Vertex-Shader.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { MapData } from '../map/mapdata';
import { hash } from './terrain';
import { HexGrid } from '../map/hex';
import { KULISSE_GLSL, KULISSE_FOG, kulisseUniforms } from './kulisse';

const NEAR = 2800; // m: bis hier detaillierte Bäume
const TCHUNK = 192; // Zellen (1920 m) je Baum-Chunk
// Dichte wie bisher je m²: früher 0,88 je 900-m²-Zelle, jetzt je 100-m²-Zelle
const P_WALD = 0.88 * 100 / 900;
const P_STREU = 0.012 * 100 / 900;

type Species = 'fichte' | 'buche';

interface TreeChunk {
  center: THREE.Vector3;
  near: THREE.InstancedMesh[];
  far: THREE.InstancedMesh[];
  base: Map<Species, Float32Array>; // x, groundRel, z, scale, rot
}

function colored(geo: THREE.BufferGeometry, color: string): THREE.BufferGeometry {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const c = new THREE.Color(color);
  const n = g.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  g.deleteAttribute('uv');
  return g;
}

function cone(r: number, h: number, y: number, seg: number, color: string) {
  return colored(new THREE.ConeGeometry(r, h, seg, 1, true).translate(0, y + h / 2, 0), color);
}

function buildGeometries() {
  const trunk = '#5a4030';
  const fichteNear = mergeGeometries([
    colored(new THREE.CylinderGeometry(0.9, 1.3, 7, 5, 1, true).translate(0, 3.5, 0), trunk),
    cone(9, 15, 4, 7, '#21452a'),
    cone(7, 13, 12, 7, '#244b2d'),
    cone(4.8, 11, 20, 7, '#285231'),
  ])!;
  const buchenKrone = new THREE.IcosahedronGeometry(10.5, 0).scale(1, 0.85, 1).translate(0, 17, 0);
  const buchenKrone2 = new THREE.IcosahedronGeometry(7, 0).translate(3.5, 22, 2);
  const bucheNear = mergeGeometries([
    colored(new THREE.CylinderGeometry(0.9, 1.4, 11, 5, 1, true).translate(0, 5.5, 0), trunk),
    colored(buchenKrone, '#46742c'),
    colored(buchenKrone2, '#517f33'),
  ])!;
  const fichteFar = cone(8.5, 30, 1, 5, '#23472b');
  const bucheFar = colored(new THREE.OctahedronGeometry(11, 0).scale(1, 0.9, 1).translate(0, 17, 0), '#46742c');
  for (const g of [fichteNear, bucheNear, fichteFar, bucheFar]) g.computeVertexNormals();
  return { fichte: [fichteNear, fichteFar], buche: [bucheNear, bucheFar] } as Record<Species, THREE.BufferGeometry[]>;
}

export class Trees {
  readonly group = new THREE.Group();
  readonly uniforms = { uTime: { value: 0 } };
  private chunks: TreeChunk[] = [];
  private material: THREE.MeshStandardMaterial;
  count = 0;
  visibleNear = 0;

  constructor(map: MapData, base: number, ex: number) {
    this.material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, flatShading: true });
    this.material.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, this.uniforms, kulisseUniforms);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>
uniform float uTime; varying float vKFade; varying float vKOut;
${KULISSE_GLSL}`)
        .replace('#include <begin_vertex>', `#include <begin_vertex>
#ifdef USE_INSTANCING
{
  vec3 ip = instanceMatrix[3].xyz;
  float sway = sin(uTime * 1.6 + ip.x * 0.043 + ip.z * 0.061) * 0.018 * max(position.y - 6.0, 0.0);
  transformed.x += sway; transformed.z += sway * 0.6;
  vec2 wxz = (modelMatrix * vec4(ip, 1.0)).xz;
  vKFade = kFade(wxz); vKOut = kOut(wxz);
}
#endif`);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>
varying float vKFade; varying float vKOut;
${KULISSE_GLSL}`)
        .replace('#include <color_fragment>', `#include <color_fragment>
diffuseColor.rgb = kGrau(diffuseColor.rgb, vKOut * 0.85);`)
        .replace('#include <fog_fragment>', KULISSE_FOG);
    };
    const geos = buildGeometries();
    const { width, height, cell } = map.info;
    const grid = new HexGrid(map.originX, map.originZ, map.ausschnitt.hex);
    const CHUNK = TCHUNK;
    for (let j0 = 0; j0 < height - 1; j0 += CHUNK) {
      for (let i0 = 0; i0 < width - 1; i0 += CHUNK) {
        const lists: Record<Species, number[]> = { fichte: [], buche: [] };
        for (let j = j0; j < Math.min(j0 + CHUNK, height); j++) {
          for (let i = i0; i < Math.min(i0 + CHUNK, width); i++) {
            const k = j * width + i;
            const cv = map.cover[k];
            const r = hash(i * 3 + 11, j * 7 + 5);
            const forest = cv === 3;
            // Wald dicht, auf Wiesen/Mooren vereinzelte Bäume (Hecken-Landschaft)
            if (!(forest ? r < P_WALD : (cv === 1 || cv === 5) && r < P_STREU)) continue;
            if (map.railMask[k]) continue;
            const x = (i + 0.5 + (hash(i, j + 99) - 0.5) * 0.98) * cell;
            const z = (j + 0.5 + (hash(i + 77, j) - 0.5) * 0.98) * cell;
            // Ortskern-Hexe bleiben frei (dort stehen die Häuser)
            const hi = grid.index(grid.fromWorld(x, z));
            if (hi >= 0 && map.hexTerrain[hi] === 6) continue;
            const gy = map.heightAt(x, z);
            if (map.water[k] > 0) continue;
            const pFichte = Math.min(0.85, Math.max(0.15, (gy - 380) / 250));
            const sp: Species = hash(i + 5, j + 3) < pFichte ? 'fichte' : 'buche';
            lists[sp].push(x, gy - base, z, 0.8 + hash(i + 1, j + 9) * 0.45, hash(i + 4, j + 2) * Math.PI * 2);
          }
        }
        const ch: TreeChunk = {
          center: new THREE.Vector3((i0 + CHUNK / 2) * cell, 0, (j0 + CHUNK / 2) * cell),
          near: [], far: [], base: new Map(),
        };
        for (const sp of ['fichte', 'buche'] as Species[]) {
          const data = new Float32Array(lists[sp]);
          const n = data.length / 5;
          if (!n) continue;
          ch.base.set(sp, data);
          const near = new THREE.InstancedMesh(geos[sp][0], this.material, n);
          const far = new THREE.InstancedMesh(geos[sp][1], this.material, n);
          far.instanceMatrix = near.instanceMatrix;
          const col = new THREE.Color();
          for (let t = 0; t < n; t++) {
            const v = 0.82 + hash(t, i0 + j0 * 7) * 0.3;
            col.setRGB(v, v * (0.95 + hash(t + 3, j0) * 0.1), v * 0.92);
            near.setColorAt(t, col);
          }
          far.instanceColor = near.instanceColor;
          near.castShadow = true;
          near.receiveShadow = true;
          ch.near.push(near); ch.far.push(far);
          this.group.add(near, far);
          this.count += n;
        }
        this.chunks.push(ch);
      }
    }
    this.setExaggeration(ex);
  }

  setExaggeration(ex: number) {
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);
    for (const ch of this.chunks) {
      let sum = 0, cnt = 0, mi = 0;
      for (const [, data] of ch.base) {
        const mesh = ch.near[mi++];
        for (let t = 0; t < data.length / 5; t++) {
          const y = data[t * 5 + 1] * ex;
          p.set(data[t * 5], y, data[t * 5 + 2]);
          q.setFromAxisAngle(up, data[t * 5 + 4]);
          s.setScalar(data[t * 5 + 3]);
          mesh.setMatrixAt(t, m.compose(p, q, s));
          sum += y; cnt++;
        }
        mesh.instanceMatrix.needsUpdate = true;
        mesh.computeBoundingSphere();
      }
      ch.far.forEach((f, k) => { f.boundingSphere = ch.near[k].boundingSphere; });
      ch.center.y = cnt ? sum / cnt : 0;
    }
  }

  setVisible(v: boolean) { this.group.visible = v; }

  update(camPos: THREE.Vector3) {
    this.visibleNear = 0;
    for (const ch of this.chunks) {
      const near = ch.center.distanceTo(camPos) < NEAR;
      ch.near.forEach((m) => { m.visible = near; if (near) this.visibleNear += m.count; });
      ch.far.forEach((m) => { m.visible = !near; });
    }
  }
}
