// Gelände: Höhenraster in Chunks mit LOD-Stufen + Schürzen gegen Risse.
// Optik: Vertex-Farben je Bedeckung, Hang -> Fels, Feinrauschen + Hex-Raster im Shader.
import * as THREE from 'three';
import type { MapData } from '../map/mapdata';

export const CHUNK = 64;                 // Rasterzellen pro Chunk-Kante
const LOD_STEPS = [1, 2, 4, 8];
const SKIRT = 25;                        // Schürzen-Tiefe (m, unskaliert)
const RIVER_BED = 2.5;                   // Flussbett liegt so tief unter dem Spiegel (wie im Konverter)

// Farben je Bedeckung (sRGB), Reihenfolge wie MapInfo.cover
const COVER_COLORS = [
  '#5e5a40', // wasser (Grund)
  '#7c9c46', // wiese
  '#b3a25a', // acker
  '#2e4826', // wald (Waldboden)
  '#866676', // heide
  '#8e8456', // moor
  '#8b877e', // fels
  '#8f9a5e', // siedlung (Gärten, Wiesen zwischen den Häusern)
];
const ROCK = new THREE.Color('#857f74');

export interface TerrainUniforms {
  uHexSize: { value: number };
  uHexOrigin: { value: THREE.Vector2 };
  uGrid: { value: number };
  uLine: { value: number };
  uHover: { value: THREE.Vector2 };
  uHoverOn: { value: number };
}

interface Chunk {
  i0: number; j0: number;
  center: THREE.Vector3;   // unskaliert (y = mittlere Höhe relativ zur Basis)
  meshes: (THREE.Mesh | null)[];
  lod: number;
}

export class Terrain {
  readonly group = new THREE.Group();
  readonly material: THREE.MeshStandardMaterial;
  readonly uniforms: TerrainUniforms;
  private chunks: Chunk[] = [];
  private colors: Float32Array;   // linear RGB je Rasterzelle
  private nx: Float32Array;       // Normalen je Rasterzelle (unskaliert)
  private ny: Float32Array;
  private nz: Float32Array;

  constructor(private map: MapData, readonly base: number, hexOrigin: THREE.Vector2) {
    this.uniforms = {
      uHexSize: { value: map.info.hex.size },
      uHexOrigin: { value: hexOrigin },
      uGrid: { value: 0 },
      uLine: { value: 4 },
      uHover: { value: new THREE.Vector2() },
      uHoverOn: { value: 0 },
    };
    this.material = this.createMaterial();
    const n = map.info.width * map.info.height;
    this.colors = new Float32Array(n * 3);
    this.nx = new Float32Array(n);
    this.ny = new Float32Array(n);
    this.nz = new Float32Array(n);
    this.precompute();

    const { width, height } = map.info;
    for (let j0 = 0; j0 < height - 1; j0 += CHUNK) {
      for (let i0 = 0; i0 < width - 1; i0 += CHUNK) {
        const c = map.info.cell;
        const ci = Math.min(i0 + CHUNK / 2, width - 1), cj = Math.min(j0 + CHUNK / 2, height - 1);
        const center = new THREE.Vector3((ci + 0.5) * c, map.ground[cj * width + ci] - base, (cj + 0.5) * c);
        this.chunks.push({ i0, j0, center, meshes: LOD_STEPS.map(() => null), lod: -1 });
      }
    }
  }

  setExaggeration(ex: number) {
    this.group.scale.y = ex;
  }

  /** LOD je Chunk nach Kameraabstand wählen. */
  update(camPos: THREE.Vector3) {
    const ex = this.group.scale.y;
    const p = new THREE.Vector3();
    for (const ch of this.chunks) {
      p.set(ch.center.x, ch.center.y * ex, ch.center.z);
      const d = p.distanceTo(camPos);
      const lod = d < 2200 ? 0 : d < 5000 ? 1 : d < 10000 ? 2 : 3;
      if (lod === ch.lod) continue;
      if (ch.lod >= 0) ch.meshes[ch.lod]!.visible = false;
      let m = ch.meshes[lod];
      if (!m) {
        m = new THREE.Mesh(this.buildGeometry(ch.i0, ch.j0, LOD_STEPS[lod]), this.material);
        m.receiveShadow = true;
        m.castShadow = true;
        ch.meshes[lod] = m;
        this.group.add(m);
      }
      m.visible = true;
      ch.lod = lod;
    }
  }

  stats() {
    const counts = [0, 0, 0, 0];
    for (const ch of this.chunks) if (ch.lod >= 0) counts[ch.lod]++;
    return { chunks: this.chunks.length, lod: counts };
  }

  private precompute() {
    const { width, height, cell } = this.map.info;
    const g = this.map.ground;
    const pal = COVER_COLORS.map((h) => new THREE.Color(h));
    const col = new THREE.Color();
    const span = this.map.info.heightMax - this.map.info.heightMin;
    for (let j = 0; j < height; j++) {
      for (let i = 0; i < width; i++) {
        const k = j * width + i;
        const dx = (g[this.map.idx(i + 1, j)] - g[this.map.idx(i - 1, j)]) / (2 * cell);
        const dz = (g[this.map.idx(i, j + 1)] - g[this.map.idx(i, j - 1)]) / (2 * cell);
        const inv = 1 / Math.hypot(dx, 1, dz);
        this.nx[k] = -dx * inv; this.ny[k] = inv; this.nz[k] = -dz * inv;

        const cv = this.map.cover[k];
        col.copy(pal[cv] ?? pal[1]);
        // Äcker: Streifen-Muster je Feldblock
        if (cv === 2) {
          const stripe = hash(Math.floor(i / 5), Math.floor(j / 7));
          col.offsetHSL((stripe - 0.5) * 0.05, 0, (stripe - 0.5) * 0.12);
        }
        // Höhenstufe: oben kühler/gelblicher, unten satter
        const t = (g[k] - this.map.info.heightMin) / span;
        col.offsetHSL(-0.015 * t, -0.08 * t, 0.03 * t);
        // Hang -> Fels (nicht unter Wasser)
        const slope = Math.atan(Math.hypot(dx, dz)) * 57.3;
        if (cv !== 0 && slope > 18) col.lerp(ROCK, Math.min(1, (slope - 18) / 20) * (cv === 3 ? 0.35 : 0.8));
        // Umgebungsverdeckung: Mulden/Täler dunkler, Kuppen heller (Krümmung über ~150 m)
        const r = 5;
        const lap = (g[this.map.idx(i + r, j)] + g[this.map.idx(i - r, j)] + g[this.map.idx(i, j + r)] + g[this.map.idx(i, j - r)]) / 4 - g[k];
        col.multiplyScalar(Math.min(1.1, Math.max(0.72, 1 - lap * 0.018)));
        // Feinvariation
        const n = hash(i, j) - 0.5;
        col.multiplyScalar(1 + n * 0.08);
        this.colors[k * 3] = col.r; this.colors[k * 3 + 1] = col.g; this.colors[k * 3 + 2] = col.b;
      }
    }
  }

  private buildGeometry(i0: number, j0: number, step: number): THREE.BufferGeometry {
    const { width, height, cell } = this.map.info;
    const n = CHUNK / step;
    const side = n + 1;
    const ring = 4 * n;
    const vcount = side * side + ring;
    const pos = new Float32Array(vcount * 3);
    const nor = new Float32Array(vcount * 3);
    const colr = new Float32Array(vcount * 3);
    const g = this.map.ground;
    // Grobe LODs: liegt ein Flussbett im ausgelassenen Bereich, Punkt auf dessen Höhe absenken,
    // sonst verschwindet das schmale eingegrabene Tal zwischen den Gitterpunkten
    const r = step >> 1;
    const heightOf = (i: number, j: number, k: number) => {
      let h = g[k];
      if (step === 1) return h;
      for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
        const kk = this.map.idx(i + di, j + dj);
        if (this.map.cover[kk] === 0 && this.map.water[kk] <= 0) h = Math.min(h, g[kk] + RIVER_BED);
      }
      return h;
    };
    const put = (v: number, i: number, j: number, drop: number) => {
      i = Math.min(i, width - 1); j = Math.min(j, height - 1);
      const k = j * width + i;
      pos[v * 3] = (i + 0.5) * cell;
      pos[v * 3 + 1] = heightOf(i, j, k) - this.base - drop;
      pos[v * 3 + 2] = (j + 0.5) * cell;
      nor[v * 3] = this.nx[k]; nor[v * 3 + 1] = this.ny[k]; nor[v * 3 + 2] = this.nz[k];
      colr[v * 3] = this.colors[k * 3]; colr[v * 3 + 1] = this.colors[k * 3 + 1]; colr[v * 3 + 2] = this.colors[k * 3 + 2];
    };
    for (let b = 0; b <= n; b++) for (let a = 0; a <= n; a++) put(b * side + a, i0 + a * step, j0 + b * step, 0);

    const idx: number[] = [];
    for (let b = 0; b < n; b++) {
      for (let a = 0; a < n; a++) {
        const v0 = b * side + a, v1 = v0 + 1, v2 = v0 + side, v3 = v2 + 1;
        // Diagonale abwechseln -> weniger Artefakte
        if ((a + b) & 1) idx.push(v0, v2, v1, v1, v2, v3);
        else idx.push(v0, v2, v3, v0, v3, v1);
      }
    }
    // Schürze: Randring im Uhrzeigersinn, jeweils nach unten gezogen
    const border: number[] = [];
    for (let a = 0; a < n; a++) border.push(a);                         // Norden
    for (let b = 0; b < n; b++) border.push(b * side + n);              // Osten
    for (let a = n; a > 0; a--) border.push(n * side + a);              // Süden
    for (let b = n; b > 0; b--) border.push(b * side);                  // Westen
    const s0 = side * side;
    border.forEach((v, k) => {
      const a = v % side, b = Math.floor(v / side);
      put(s0 + k, i0 + a * step, j0 + b * step, SKIRT);
    });
    for (let k = 0; k < ring; k++) {
      const t0 = border[k], t1 = border[(k + 1) % ring];
      const s1 = s0 + k, s2 = s0 + ((k + 1) % ring);
      idx.push(t0, t1, s1, t1, s2, s1);
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colr, 3));
    geo.setIndex(vcount > 65535 ? new THREE.Uint32BufferAttribute(idx, 1) : new THREE.Uint16BufferAttribute(idx, 1));
    geo.computeBoundingSphere();
    geo.computeBoundingBox();
    return geo;
  }

  private createMaterial(): THREE.MeshStandardMaterial {
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0, side: THREE.DoubleSide });
    mat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, this.uniforms);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>
varying vec3 vWPos;
uniform float uHexSize; uniform vec2 uHexOrigin; uniform float uGrid; uniform float uLine;
uniform vec2 uHover; uniform float uHoverOn;
float h21(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
  return mix(mix(h21(i),h21(i+vec2(1,0)),f.x), mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x), f.y); }
vec2 hexRound(vec2 a){ vec3 c=vec3(a.x, a.y, -a.x-a.y); vec3 r=floor(c+0.5); vec3 d=abs(r-c);
  if(d.x>d.y && d.x>d.z) r.x=-r.y-r.z; else if(d.y>d.z) r.y=-r.x-r.z; return r.xy; }`)
        .replace('#include <color_fragment>', `#include <color_fragment>
{
  // Feinstruktur (Gras/Boden), zwei Oktaven
  float n = vnoise(vWPos.xz * 0.11) * 0.6 + vnoise(vWPos.xz * 0.5) * 0.4;
  diffuseColor.rgb *= 0.92 + n * 0.16;
  // Hex-Raster + Hover
  vec2 p = vWPos.xz - uHexOrigin;
  vec2 ax = hexRound(vec2((0.57735027 * p.x - p.y / 3.0) / uHexSize, (0.6666667 * p.y) / uHexSize));
  vec2 c = vec2(uHexSize * 1.7320508 * (ax.x + ax.y * 0.5), uHexSize * 1.5 * ax.y);
  vec2 d = p - c;
  float hd = max(abs(d.x), max(abs(0.5 * d.x + 0.8660254 * d.y), abs(-0.5 * d.x + 0.8660254 * d.y)));
  float edge = uHexSize * 0.8660254;
  float line = smoothstep(edge - uLine, edge - uLine * 0.35, hd);
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.0, 0.96, 0.82), line * uGrid * 0.55);
  float hov = uHoverOn * (1.0 - step(0.1, distance(ax, uHover)));
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.0, 0.86, 0.45), hov * (0.18 + 0.7 * line));
}`);
    };
    return mat;
  }
}

export function hash(i: number, j: number): number {
  let h = (i * 374761393 + j * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
