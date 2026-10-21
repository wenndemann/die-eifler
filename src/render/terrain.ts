// Gelände: 10-m-Höhenraster als Quadtree aus Netz-Knoten. Jeder Knoten hat gleich viele Quads (CHUNK x CHUNK)
// und deckt je Stufe doppelt so viel Fläche ab (Stufe 0 = 10 m Raster, Stufe 4 = 160 m). So gibt es wenige,
// gleich große Netze (wenige Draw-Calls), nahe Knoten sind fein, ferne grob. Schürzen gegen Risse.
// Farben und Normalen werden je Knoten beim Bauen berechnet (kein riesiges Vorab-Array).
// Optik: Farben je Bedeckung, Fels nur aus Hangneigung und Bedeckung „fels“ (keine Orts-Sonderfälle),
// Feinrauschen, Hex-Raster nur im Spielfeld, Kulisse ausgegraut.
import * as THREE from 'three';
import type { MapData } from '../map/mapdata';
import { HexGrid } from '../map/hex';
import { KULISSE_GLSL, KULISSE_FOG, kulisseUniforms } from './kulisse';
import { QUALI, type Qualitaet } from './qualitaet';

export const CHUNK = 64;                 // Quads je Knoten-Kante (in jeder Stufe gleich)
const MAX_LEVEL = 4;                     // gröbste Stufe: 16 Zellen (160 m) je Quad, Knoten 10,2 km
/** Ein Knoten der Stufe k >= 1 wird als Blatt gezeichnet, wenn er mindestens LOD_BASIS * 2^k Meter entfernt ist. */
const LOD_BASIS = 700;
const SKIRT = 25;                        // Schürzen-Tiefe (m, unskaliert)
const RIVER_BED = 2.5;                   // Flussbett liegt so tief unter dem Spiegel (wie im Konverter)
const UNUSED_MS = 8000;                  // ungenutzte Netze nach dieser Zeit freigeben

// Farben je Bedeckung (sRGB), Reihenfolge wie MapInfo.cover
const COVER_COLORS = [
  '#5e5a40', // wasser (Grund)
  '#7dab4c', // wiese (STIL.md: sattes Wimmelbuch-Grün)
  '#c9b06a', // acker
  '#4a6a3a', // wald (Waldboden)
  '#a08a78', // heide
  '#9a9468', // moor
  '#9a9284', // fels
  '#7dab4c', // siedlung außerhalb der Kerne: wie Wiese
];
const KERN_COLOR = '#a3ac6a';            // Ortskern-Hex: Gärten, Höfe
/** Einheitliche Felsfarbe: grau mit leichtem Rotstich (Buntsandstein der Rureifel, ohne Geologie-Daten überall gleich). */
const ROCK = new THREE.Color('#867465');

/** Ab dieser Hangneigung (Grad, 10-m-Raster, über zwei Maßstäbe gemittelt) beginnt Fels, ab ROCK_VOLL ist es reiner Fels.
 *  Im 10-m-Raster sind Felswände selten steiler als 45 Grad (nur 1 % der Waldzellen bei Nideggen über 35, 0,2 % über 40).
 *  Böschungen und Wegeinschnitte (20 bis 30 Grad) bleiben grün. */
const ROCK_AB = 27, ROCK_VOLL = 40;
const ROCK_WALD = 0.8;                   // unter Wald etwas weniger Fels (Bäume stehen auch an Felsköpfen)

export interface TerrainUniforms {
  uHexSize: { value: number };
  uHexOrigin: { value: THREE.Vector2 };
  uGrid: { value: number };
  uLine: { value: number };
  uHover: { value: THREE.Vector2 };
  uHoverOn: { value: number };
}

interface Node {
  level: number;
  i0: number; j0: number;
  parent: Node | null;
  children: Node[];
  /** Begrenzungsquader, unskaliert (y relativ zur Basis). */
  min: THREE.Vector3; max: THREE.Vector3;
  mesh: THREE.Mesh | null;
  /** Zeitpunkt, seit dem das Netz nicht mehr gezeichnet wird (0 = in Gebrauch). */
  unused: number;
  shown: boolean;
}

export class Terrain {
  readonly group = new THREE.Group();
  readonly material: THREE.MeshStandardMaterial;
  readonly uniforms: TerrainUniforms;
  private nodes: Node[] = [];
  private roots: Node[] = [];
  private shown = new Set<Node>();
  private index: THREE.BufferAttribute;
  private grid: HexGrid;
  private pal = COVER_COLORS.map((h) => new THREE.Color(h));
  private kern = new THREE.Color(KERN_COLOR);
  private lastSweep = 0;
  private lodFaktor = 1;
  /** Betretener Boden (0..255) je Rasterzelle: planierte Bauplätze färben sich erdig (siehe setzeErde). */
  private erde: Uint8Array;
  private erdeFarbe = new THREE.Color('#9a8460');

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
    this.erde = new Uint8Array(map.info.width * map.info.height);
    this.material = this.createMaterial();
    this.index = this.buildIndex(CHUNK);

    const { width, height } = map.info;
    const top = CHUNK << MAX_LEVEL;
    for (let j0 = 0; j0 < height - 1; j0 += top) {
      for (let i0 = 0; i0 < width - 1; i0 += top) this.roots.push(this.makeNode(MAX_LEVEL, i0, j0, null));
    }
  }

  private makeNode(level: number, i0: number, j0: number, parent: Node | null): Node {
    const { width, height, cell } = this.map.info;
    const size = CHUNK << level;
    const i1 = Math.min(i0 + size, width - 1), j1 = Math.min(j0 + size, height - 1);
    // Höhenbereich aus Stichproben (Abstand ca. 1/32 der Kante)
    const st = Math.max(1, size >> 5);
    let lo = Infinity, hi = -Infinity;
    for (let j = j0; j <= j1; j += st) for (let i = i0; i <= i1; i += st) {
      const h = this.map.ground[j * width + i];
      if (h < lo) lo = h;
      if (h > hi) hi = h;
    }
    const n: Node = {
      level, i0, j0, parent, children: [], mesh: null, unused: 0, shown: false,
      min: new THREE.Vector3(i0 * cell, lo - this.base - SKIRT, j0 * cell),
      max: new THREE.Vector3(i1 * cell + cell, hi - this.base + 10, j1 * cell + cell),
    };
    this.nodes.push(n);
    if (level > 0) {
      const h = size >> 1;
      for (const [di, dj] of [[0, 0], [h, 0], [0, h], [h, h]]) {
        if (i0 + di < width - 1 && j0 + dj < height - 1) n.children.push(this.makeNode(level - 1, i0 + di, j0 + dj, n));
      }
    }
    return n;
  }

  setExaggeration(ex: number) {
    this.group.scale.y = ex;
  }

  /** Rasterzelle (i, j) zu `anteil` (0..1) als festgetretene Erde färben (nur Darstellung, nimmt nie ab). */
  setzeErde(i: number, j: number, anteil: number) {
    const { width, height } = this.map.info;
    if (i < 0 || j < 0 || i >= width || j >= height) return;
    const k = j * width + i, v = Math.round(Math.min(1, Math.max(0, anteil)) * 255);
    if (v > this.erde[k]) this.erde[k] = v;
  }

  /** Gelände im Rechteck (Ausschnitt-Meter) neu aufbauen, nachdem map.ground / setzeErde dort geändert wurden.
   *  Vorhandene Netze werden an Ort und Stelle ersetzt (keine Löcher), fehlende baut update() später ohnehin frisch. */
  erneuere(x0: number, z0: number, x1: number, z1: number) {
    const cell = this.map.info.cell;
    for (const n of this.nodes) {
      if (!n.mesh) continue;
      const size = (CHUNK << n.level) * cell;
      if (n.i0 * cell > x1 + cell || n.j0 * cell > z1 + cell || n.i0 * cell + size < x0 - cell || n.j0 * cell + size < z0 - cell) continue;
      const alt = n.mesh.geometry;
      n.mesh.geometry = this.buildGeometry(n);
      alt.dispose();
    }
  }

  setQuality(q: Qualitaet) {
    this.lodFaktor = QUALI[q].lod;
  }

  /** Abstand Kamera – Begrenzungsquader (y mit Überhöhung). */
  private dist(n: Node, p: THREE.Vector3, ex: number): number {
    const dx = Math.max(n.min.x - p.x, 0, p.x - n.max.x);
    const dy = Math.max(n.min.y * ex - p.y, 0, p.y - n.max.y * ex);
    const dz = Math.max(n.min.z - p.z, 0, p.z - n.max.z);
    return Math.hypot(dx, dy, dz);
  }

  /** Knoten nach Kameraabstand wählen (Quadtree); fehlende Netze höchstens budgetMs lang bauen.
   *  Solange ein Netz fehlt, bleibt das nächste gröbere (fertige) sichtbar – keine Löcher. */
  update(camPos: THREE.Vector3, budgetMs = 6) {
    const ex = this.group.scale.y;
    const leaves: { n: Node; d: number }[] = [];
    const rec = (n: Node) => {
      const d = this.dist(n, camPos, ex);
      if (n.level === 0 || d >= LOD_BASIS * (1 << n.level) * this.lodFaktor) leaves.push({ n, d });
      else for (const c of n.children) rec(c);
    };
    for (const r of this.roots) rec(r);

    const pending = leaves.filter((l) => !l.n.mesh).sort((a, b) => a.d - b.d);
    const t0 = performance.now();
    for (const { n } of pending) {
      if (performance.now() - t0 > budgetMs) break;
      const m = new THREE.Mesh(this.buildGeometry(n), this.material);
      m.receiveShadow = true;
      m.castShadow = false;   // M9: keine großen Hang-Schattenflecken (Relief kommt aus der Schattierung)
      m.visible = false;
      n.mesh = m;
      this.group.add(m);
    }
    // Fehlt noch ein Netz: nächsten fertigen Vorfahren zeigen (und alles darunter weglassen)
    const forced = new Set<Node>();
    for (const { n } of leaves) {
      if (n.mesh) continue;
      let a = n.parent;
      while (a && !a.mesh) a = a.parent;
      if (a) forced.add(a);
    }
    const next = new Set<Node>(forced);
    for (const { n } of leaves) {
      if (!n.mesh) continue;
      let a = n.parent, hidden = false;
      while (a) { if (forced.has(a)) { hidden = true; break; } a = a.parent; }
      if (!hidden) next.add(n);
    }
    const now = performance.now();
    for (const n of this.shown) if (!next.has(n)) { n.mesh!.visible = false; n.unused = now; n.shown = false; }
    for (const n of next) if (!n.shown) { n.mesh!.visible = true; n.unused = 0; n.shown = true; }
    this.shown = next;

    if (now - this.lastSweep > 2000) {
      this.lastSweep = now;
      for (const n of this.nodes) {
        if (!n.mesh || n.shown || n.level >= MAX_LEVEL || !n.unused || now - n.unused < UNUSED_MS) continue;
        this.group.remove(n.mesh);
        n.mesh.geometry.dispose();
        n.mesh = null;
        n.unused = 0;
      }
    }
  }

  stats() {
    const counts: number[] = Array.from({ length: MAX_LEVEL + 1 }, () => 0);
    for (const n of this.shown) counts[n.level]++;
    return { chunks: this.shown.size, lod: counts };
  }

  /** Farbe einer Rasterzelle (linear RGB) in out. */
  private cellColor(i: number, j: number, out: THREE.Color) {
    const map = this.map;
    const { cell, heightMin, heightMax } = map.info;
    const g = map.ground;
    const k = map.idx(i, j);
    const cv = map.cover[k];
    if (cv === 7) {
      // Siedlung nur im Ortskern-Hex als Garten/Hofland, sonst Wiese
      const h = this.grid.fromWorld((i + 0.5) * cell, (j + 0.5) * cell);
      const hi = this.grid.index(h);
      out.copy(hi >= 0 && map.hexTerrain[hi] === 6 ? this.kern : this.pal[1]);
    } else out.copy(this.pal[cv] ?? this.pal[1]);
    // Festgetretene Erde (Bauplätze)
    const er = this.erde[k];
    if (er > 0) out.lerp(this.erdeFarbe, (er / 255) * 0.8);
    // Äcker: Streifen-Muster je Feldblock
    if (cv === 2) {
      const stripe = hash(Math.floor(i / 15), Math.floor(j / 21));
      out.offsetHSL((stripe - 0.5) * 0.05, 0, (stripe - 0.5) * 0.12);
    }
    // Höhenstufe: oben kühler/gelblicher, unten satter
    const t = (g[k] - heightMin) / Math.max(1, heightMax - heightMin);
    out.offsetHSL(-0.015 * t, -0.08 * t, 0.03 * t);
    // Fels nur aus Hangneigung (nicht unter Wasser) und Bedeckung „fels“
    if (cv !== 0) {
      const slope = this.slopeDeg(i, j);
      let a = smooth(ROCK_AB, ROCK_VOLL, slope) * (cv === 3 ? ROCK_WALD : 1);
      if (cv === 6) a = Math.max(a, 0.7);
      if (a > 0.01) {
        // waagerechte Schichtung: leichte Helligkeitsbänder über die Höhe
        const schicht = 0.95 + 0.1 * Math.sin(g[k] * 0.85 + hash(i >> 3, j >> 3) * 2);
        out.lerp(tmpRock.copy(ROCK).multiplyScalar(schicht), a);
      }
    }
    // Umgebungsverdeckung: Mulden/Täler dunkler, Kuppen heller (Krümmung über ~150 m)
    const r = 15;
    const lap = (g[map.idx(i + r, j)] + g[map.idx(i - r, j)] + g[map.idx(i, j + r)] + g[map.idx(i, j - r)]) / 4 - g[k];
    out.multiplyScalar(Math.min(1.1, Math.max(0.72, 1 - lap * 0.018)));
    // Feinvariation
    out.multiplyScalar(1 + (hash(i, j) - 0.5) * 0.07);
  }

  /** Hangneigung in Grad, Mittel aus 10-m- und 20-m-Maßstab (glättet Rasterrauschen, hält steile Wände). */
  slopeDeg(i: number, j: number): number {
    const map = this.map, g = map.ground, c = map.info.cell;
    const s1 = Math.hypot(g[map.idx(i + 1, j)] - g[map.idx(i - 1, j)], g[map.idx(i, j + 1)] - g[map.idx(i, j - 1)]) / (2 * c);
    const s2 = Math.hypot(g[map.idx(i + 2, j)] - g[map.idx(i - 2, j)], g[map.idx(i, j + 2)] - g[map.idx(i, j - 2)]) / (4 * c);
    return Math.atan((s1 + s2) / 2) * 57.2958;
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

  private buildGeometry(node: Node): THREE.BufferGeometry {
    const step = 1 << node.level;
    const { i0, j0 } = node;
    const { width, height, cell } = this.map.info;
    const n = CHUNK;
    const side = n + 1;
    const ring = 4 * n;
    const vcount = side * side + ring;
    const pos = new Float32Array(vcount * 3);
    const nor = new Float32Array(vcount * 3);
    const colr = new Float32Array(vcount * 3);
    const g = this.map.ground;
    const map = this.map;
    // Grobe Stufen: liegt ein Flussbett im ausgelassenen Bereich, Punkt auf dessen Höhe absenken,
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
    // Farbe: Mittel über einen Block (bei großen Stufen nur wenige Stichproben je Block, spart Zeit)
    const sub = step >= 8 ? 3 : step >= 4 ? 2 : step;
    const sstep = step / sub;
    const put = (v: number, i: number, j: number, drop: number) => {
      i = Math.min(i, width - 1); j = Math.min(j, height - 1);
      const k = j * width + i;
      pos[v * 3] = (i + 0.5) * cell;
      pos[v * 3 + 1] = heightOf(i, j, k) - this.base - drop;
      pos[v * 3 + 2] = (j + 0.5) * cell;
      // M9: breiter Stencil – weich gerundete Hänge statt sichtbarer Dreiecksfacetten (Bilderbuch statt Low-Poly)
      const s = Math.max(2, step * 2);
      const dx = (g[map.idx(i + s, j)] - g[map.idx(i - s, j)]) / (2 * s * cell);
      const dz = (g[map.idx(i, j + s)] - g[map.idx(i, j - s)]) / (2 * s * cell);
      const inv = 1 / Math.hypot(dx, 1, dz);
      nor[v * 3] = -dx * inv; nor[v * 3 + 1] = inv; nor[v * 3 + 2] = -dz * inv;
      if (step === 1) this.cellColor(i, j, acc);
      else {
        acc.setRGB(0, 0, 0);
        const o0 = -step / 2 + sstep / 2;
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
    geo.setIndex(this.index);
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
  diffuseColor.rgb = kSchnee(diffuseColor.rgb, 0.72 + 0.28 * n);
  diffuseColor.rgb = kGrau(diffuseColor.rgb, kul);
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.0, 0.96, 0.82), line * uGrid * 0.55 * (1.0 - kul));
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.95, 0.74, 0.3), rand * 0.8);
  float hov = uHoverOn * play * (1.0 - step(0.1, distance(ax, uHover)));
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.0, 0.86, 0.45), hov * (0.18 + 0.7 * line));
  vKFade = kFade(vWPos.xz);
}`)
        // Alpha 0: der Bilderbuch-Pass zieht am Gelände keine Linie (buchpass.ts); nach opaque_fragment, das sonst 1 setzt
        .replace('#include <opaque_fragment>', '#include <opaque_fragment>\ngl_FragColor.a = 0.0;')
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

const tmpRock = new THREE.Color();
function smooth(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}
