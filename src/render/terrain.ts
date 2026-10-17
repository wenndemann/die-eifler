// Gelände: 10-m-Höhenraster in Chunks mit LOD-Stufen + Schürzen gegen Risse.
// Farben und Normalen werden je Chunk beim Bauen berechnet (kein riesiges Vorab-Array).
// Optik: Farben je Bedeckung, Hang -> Fels (um Nideggen rötlicher Buntsandstein), Feinrauschen,
// Hex-Raster nur im Spielfeld, Kulisse ausgegraut.
import * as THREE from 'three';
import type { MapData } from '../map/mapdata';
import { HexGrid } from '../map/hex';
import { KULISSE_GLSL, KULISSE_FOG, kulisseUniforms } from './kulisse';

export const CHUNK = 128;                // Rasterzellen pro Chunk-Kante (1280 m)
const LOD_STEPS = [1, 2, 4, 8, 16];
const LOD_DIST = [1700, 3400, 6500, 12000]; // Chunk-Mitte-Kamera-Abstand je Stufe (m)
const SKIRT = 25;                        // Schürzen-Tiefe (m, unskaliert)
const RIVER_BED = 2.5;                   // Flussbett liegt so tief unter dem Spiegel (wie im Konverter)
const UNUSED_MS = 8000;                  // ungenutzte LOD-Netze nach dieser Zeit freigeben

// Farben je Bedeckung (sRGB), Reihenfolge wie MapInfo.cover
const COVER_COLORS = [
  '#5e5a40', // wasser (Grund)
  '#7c9c46', // wiese
  '#b3a25a', // acker
  '#2e4826', // wald (Waldboden)
  '#8a7468', // heide
  '#8e8456', // moor
  '#8b877e', // fels
  '#7c9c46', // siedlung außerhalb der Kerne: wie Wiese
];
const KERN_COLOR = '#8f9a5e';            // Ortskern-Hex: Gärten, Höfe
const ROCK_GRAY = new THREE.Color('#857f74');
const ROCK_RED = new THREE.Color('#9a7967');   // Buntsandstein: rötlich-grau

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
  freed: number[];         // Zeitpunkt, seit dem die Stufe ungenutzt ist (0 = in Gebrauch)
  lod: number;
}

export class Terrain {
  readonly group = new THREE.Group();
  readonly material: THREE.MeshStandardMaterial;
  readonly uniforms: TerrainUniforms;
  private chunks: Chunk[] = [];
  private indices: THREE.BufferAttribute[] = [];
  private grid: HexGrid;
  private pal = COVER_COLORS.map((h) => new THREE.Color(h));
  private kern = new THREE.Color(KERN_COLOR);
  private rotAnker: { x: number; z: number; r: number }[] = [];
  private lastSweep = 0;

  constructor(private map: MapData, readonly base: number, hexOrigin: THREE.Vector2) {
    this.uniforms = {
      uHexSize: { value: map.info.hex.size },
      uHexOrigin: { value: hexOrigin },
      uGrid: { value: 0 },
      uLine: { value: 4 },
      uHover: { value: new THREE.Vector2() },
      uHoverOn: { value: 0 },
    };
    this.grid = new HexGrid(map.originX, map.originZ, map.ausschnitt.hex);
    // Buntsandstein-Gebiete (Nideggen, Rurtal bis Gemünd): Anker mit Radius
    const radien: Record<string, number> = { Nideggen: 6500, Heimbach: 5000, Gemünd: 4500, Schleiden: 3500, Abenden: 3000, Zerkall: 3000, Hürtgenwald: 2500 };
    for (const p of map.info.places) if (radien[p.name] && p.kind !== 'gewaesser') this.rotAnker.push({ x: p.x, z: p.z, r: radien[p.name] });
    this.material = this.createMaterial();
    for (const st of LOD_STEPS) this.indices.push(this.buildIndex(CHUNK / st));

    const { width, height } = map.info;
    for (let j0 = 0; j0 < height - 1; j0 += CHUNK) {
      for (let i0 = 0; i0 < width - 1; i0 += CHUNK) {
        const c = map.info.cell;
        const ci = Math.min(i0 + CHUNK / 2, width - 1), cj = Math.min(j0 + CHUNK / 2, height - 1);
        const center = new THREE.Vector3((ci + 0.5) * c, map.ground[cj * width + ci] - base, (cj + 0.5) * c);
        this.chunks.push({ i0, j0, center, meshes: LOD_STEPS.map(() => null), freed: LOD_STEPS.map(() => 0), lod: -1 });
      }
    }
  }

  setExaggeration(ex: number) {
    this.group.scale.y = ex;
  }

  /** LOD je Chunk nach Kameraabstand wählen; neue Netze höchstens budgetMs lang bauen. */
  update(camPos: THREE.Vector3, budgetMs = 6) {
    const ex = this.group.scale.y;
    const p = new THREE.Vector3();
    const pending: { ch: Chunk; lod: number; d: number }[] = [];
    for (const ch of this.chunks) {
      p.set(ch.center.x, ch.center.y * ex, ch.center.z);
      const d = p.distanceTo(camPos);
      let lod = LOD_STEPS.length - 1;
      for (let k = 0; k < LOD_DIST.length; k++) if (d < LOD_DIST[k]) { lod = k; break; }
      if (lod === ch.lod) continue;
      if (ch.meshes[lod]) this.show(ch, lod);
      else pending.push({ ch, lod, d });
    }
    if (pending.length) {
      pending.sort((a, b) => a.d - b.d);
      const t0 = performance.now();
      for (const { ch, lod } of pending) {
        if (performance.now() - t0 > budgetMs) break;
        const m = new THREE.Mesh(this.buildGeometry(ch.i0, ch.j0, lod), this.material);
        m.receiveShadow = true;
        m.castShadow = true;
        m.visible = false;
        ch.meshes[lod] = m;
        this.group.add(m);
        this.show(ch, lod);
      }
    }
    const now = performance.now();
    if (now - this.lastSweep > 2000) {
      this.lastSweep = now;
      for (const ch of this.chunks) {
        ch.meshes.forEach((m, k) => {
          if (!m || k === ch.lod || !ch.freed[k] || now - ch.freed[k] < UNUSED_MS) return;
          this.group.remove(m);
          m.geometry.dispose();
          ch.meshes[k] = null;
          ch.freed[k] = 0;
        });
      }
    }
  }

  private show(ch: Chunk, lod: number) {
    if (ch.lod >= 0) { ch.meshes[ch.lod]!.visible = false; ch.freed[ch.lod] = performance.now(); }
    ch.meshes[lod]!.visible = true;
    ch.freed[lod] = 0;
    ch.lod = lod;
  }

  stats() {
    const counts = LOD_STEPS.map(() => 0);
    for (const ch of this.chunks) if (ch.lod >= 0) counts[ch.lod]++;
    return { chunks: this.chunks.length, lod: counts };
  }

  /** Rötlicher Buntsandstein: 0 .. 1 je Ort. */
  private rot(x: number, z: number): number {
    let m = 0;
    for (const a of this.rotAnker) {
      const t = 1 - Math.hypot(x - a.x, z - a.z) / a.r;
      if (t > m) m = t;
    }
    return Math.min(1, m * 1.6);
  }

  /** Farbe einer Rasterzelle (linear RGB) in out. */
  private cellColor(i: number, j: number, out: THREE.Color) {
    const map = this.map;
    const { cell, heightMin, heightMax } = map.info;
    const g = map.ground;
    const k = map.idx(i, j);
    const dx = (g[map.idx(i + 1, j)] - g[map.idx(i - 1, j)]) / (2 * cell);
    const dz = (g[map.idx(i, j + 1)] - g[map.idx(i, j - 1)]) / (2 * cell);
    const cv = map.cover[k];
    if (cv === 7) {
      // Siedlung nur im Ortskern-Hex als Garten/Hofland, sonst Wiese
      const h = this.grid.fromWorld((i + 0.5) * cell, (j + 0.5) * cell);
      const hi = this.grid.index(h);
      out.copy(hi >= 0 && map.hexTerrain[hi] === 6 ? this.kern : this.pal[1]);
    } else out.copy(this.pal[cv] ?? this.pal[1]);
    // Äcker: Streifen-Muster je Feldblock
    if (cv === 2) {
      const stripe = hash(Math.floor(i / 15), Math.floor(j / 21));
      out.offsetHSL((stripe - 0.5) * 0.05, 0, (stripe - 0.5) * 0.12);
    }
    // Höhenstufe: oben kühler/gelblicher, unten satter
    const t = (g[k] - heightMin) / Math.max(1, heightMax - heightMin);
    out.offsetHSL(-0.015 * t, -0.08 * t, 0.03 * t);
    // Hang -> Fels (nicht unter Wasser); um Nideggen rötlicher Buntsandstein
    const slope = Math.atan(Math.hypot(dx, dz)) * 57.3;
    if (cv !== 0) {
      let a = Math.min(1, Math.max(0, (slope - 22) / 16)) * (cv === 3 ? 0.5 : 0.85);
      if (cv === 6) a = Math.max(a, 0.7);
      if (a > 0) {
        const red = this.rotAnker.length ? this.rot((i + 0.5) * cell, (j + 0.5) * cell) : 0;
        const rock = ROCK_GRAY.clone().lerp(ROCK_RED, red * Math.min(1, 0.55 + slope / 60));
        out.lerp(rock, a);
      }
    }
    // Umgebungsverdeckung: Mulden/Täler dunkler, Kuppen heller (Krümmung über ~150 m)
    const r = 15;
    const lap = (g[map.idx(i + r, j)] + g[map.idx(i - r, j)] + g[map.idx(i, j + r)] + g[map.idx(i, j - r)]) / 4 - g[k];
    out.multiplyScalar(Math.min(1.1, Math.max(0.72, 1 - lap * 0.018)));
    // Feinvariation
    out.multiplyScalar(1 + (hash(i, j) - 0.5) * 0.07);
  }

  private buildIndex(n: number): THREE.BufferAttribute {
    const side = n + 1;
    const ring = 4 * n;
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
    const border = this.borderRing(n);
    const s0 = side * side;
    for (let k = 0; k < ring; k++) {
      const t0 = border[k], t1 = border[(k + 1) % ring];
      const s1 = s0 + k, s2 = s0 + ((k + 1) % ring);
      idx.push(t0, t1, s1, t1, s2, s1);
    }
    return new THREE.Uint16BufferAttribute(idx, 1);
  }

  private borderRing(n: number): number[] {
    const side = n + 1;
    const border: number[] = [];
    for (let a = 0; a < n; a++) border.push(a);                         // Norden
    for (let b = 0; b < n; b++) border.push(b * side + n);              // Osten
    for (let a = n; a > 0; a--) border.push(n * side + a);              // Süden
    for (let b = n; b > 0; b--) border.push(b * side);                  // Westen
    return border;
  }

  private buildGeometry(i0: number, j0: number, lod: number): THREE.BufferGeometry {
    const step = LOD_STEPS[lod];
    const { width, height, cell } = this.map.info;
    const n = CHUNK / step;
    const side = n + 1;
    const ring = 4 * n;
    const vcount = side * side + ring;
    const pos = new Float32Array(vcount * 3);
    const nor = new Float32Array(vcount * 3);
    const colr = new Float32Array(vcount * 3);
    const g = this.map.ground;
    const map = this.map;
    // Grobe LODs: liegt ein Flussbett im ausgelassenen Bereich, Punkt auf dessen Höhe absenken,
    // sonst verschwindet das schmale eingegrabene Tal zwischen den Gitterpunkten
    const rr = step >> 1;
    const heightOf = (i: number, j: number, k: number) => {
      let h = g[k];
      if (step === 1) return h;
      for (let dj = -rr; dj <= rr; dj++) for (let di = -rr; di <= rr; di++) {
        const kk = map.idx(i + di, j + dj);
        if (map.cover[kk] === 0 && map.water[kk] <= 0) h = Math.min(h, g[kk] + RIVER_BED);
      }
      return h;
    };
    const col = new THREE.Color(), acc = new THREE.Color();
    // Farbe: Mittel über einen Block (bei großen Stufen 2×2 Stichproben je Block, spart Zeit)
    const sub = step >= 4 ? 2 : step;
    const sstep = step / sub;
    const put = (v: number, i: number, j: number, drop: number) => {
      i = Math.min(i, width - 1); j = Math.min(j, height - 1);
      const k = j * width + i;
      pos[v * 3] = (i + 0.5) * cell;
      pos[v * 3 + 1] = heightOf(i, j, k) - this.base - drop;
      pos[v * 3 + 2] = (j + 0.5) * cell;
      const s = Math.max(1, step);
      const dx = (g[map.idx(i + s, j)] - g[map.idx(i - s, j)]) / (2 * s * cell);
      const dz = (g[map.idx(i, j + s)] - g[map.idx(i, j - s)]) / (2 * s * cell);
      const inv = 1 / Math.hypot(dx, 1, dz);
      nor[v * 3] = -dx * inv; nor[v * 3 + 1] = inv; nor[v * 3 + 2] = -dz * inv;
      if (step === 1) this.cellColor(i, j, acc);
      else {
        acc.setRGB(0, 0, 0);
        const o0 = -step / 2;
        for (let b = 0; b < sub; b++) for (let a = 0; a < sub; a++) {
          this.cellColor(i + Math.round(o0 + a * sstep), j + Math.round(o0 + b * sstep), col);
          acc.r += col.r; acc.g += col.g; acc.b += col.b;
        }
        acc.multiplyScalar(1 / (sub * sub));
      }
      colr[v * 3] = acc.r; colr[v * 3 + 1] = acc.g; colr[v * 3 + 2] = acc.b;
    };
    for (let b = 0; b <= n; b++) for (let a = 0; a <= n; a++) put(b * side + a, i0 + a * step, j0 + b * step, 0);
    const border = this.borderRing(n);
    const s0 = side * side;
    border.forEach((v, k) => {
      const a = v % side, b = Math.floor(v / side);
      put(s0 + k, i0 + a * step, j0 + b * step, SKIRT);
    });

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colr, 3));
    geo.setIndex(this.indices[lod]);
    geo.computeBoundingSphere();
    geo.computeBoundingBox();
    return geo;
  }

  private createMaterial(): THREE.MeshStandardMaterial {
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0, side: THREE.DoubleSide });
    mat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, this.uniforms, kulisseUniforms);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>
varying vec3 vWPos;
float vKFade;
uniform float uHexSize; uniform vec2 uHexOrigin; uniform float uGrid; uniform float uLine;
uniform vec2 uHover; uniform float uHoverOn;
${KULISSE_GLSL}
float h21(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
  return mix(mix(h21(i),h21(i+vec2(1,0)),f.x), mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x), f.y); }
vec2 nbr(int k){ if(k==0) return vec2(1.,0.); if(k==1) return vec2(0.,1.); if(k==2) return vec2(-1.,1.);
  if(k==3) return vec2(-1.,0.); if(k==4) return vec2(0.,-1.); return vec2(1.,-1.); }
float inPlay(vec2 a){ return 1.0 - step(uKPlay.z + 0.5, kDist(a)); }`)
        .replace('#include <color_fragment>', `#include <color_fragment>
{
  // Feinstruktur (Gras/Boden), zwei Oktaven
  float n = vnoise(vWPos.xz * 0.11) * 0.6 + vnoise(vWPos.xz * 0.5) * 0.4;
  diffuseColor.rgb *= 0.92 + n * 0.16;
  // Hex-Raster, Spielfeld-Rand, Hover
  vec2 p = vWPos.xz - uHexOrigin;
  vec2 ax = hexRound(vec2((0.57735027 * p.x - p.y / 3.0) / uHexSize, (0.6666667 * p.y) / uHexSize));
  vec2 c = vec2(uHexSize * 1.7320508 * (ax.x + ax.y * 0.5), uHexSize * 1.5 * ax.y);
  vec2 d = p - c;
  float hd = max(abs(d.x), max(abs(0.5 * d.x + 0.8660254 * d.y), abs(-0.5 * d.x + 0.8660254 * d.y)));
  float edge = uHexSize * 0.8660254;
  float line = smoothstep(edge - uLine, edge - uLine * 0.35, hd);
  float play = inPlay(ax);
  float ang = atan(d.y, d.x); if (ang < 0.0) ang += 6.2831853;
  vec2 nb = ax + nbr(int(mod(floor(ang / 1.0471976 + 0.5), 6.0)));
  float rand = uKOn * play * (1.0 - inPlay(nb)) * smoothstep(edge - uLine * 1.6, edge - uLine * 0.6, hd);
  float kul = uKOn * (1.0 - play);
  diffuseColor.rgb = kGrau(diffuseColor.rgb, kul);
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.0, 0.96, 0.82), line * uGrid * 0.55 * (1.0 - kul));
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.95, 0.74, 0.3), rand * 0.8);
  float hov = uHoverOn * play * (1.0 - step(0.1, distance(ax, uHover)));
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.0, 0.86, 0.45), hov * (0.18 + 0.7 * line));
  vKFade = kFade(vWPos.xz);
}`)
        .replace('#include <fog_fragment>', KULISSE_FOG);
      // hexRound steht schon in KULISSE_GLSL als kHexRound; für den Shader eine Kurzform bereitstellen
      shader.fragmentShader = shader.fragmentShader.replace('float inPlay', 'vec2 hexRound(vec2 a){ return kHexRound(a); }\nfloat inPlay');
    };
    return mat;
  }
}

export function hash(i: number, j: number): number {
  let h = (i * 374761393 + j * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
