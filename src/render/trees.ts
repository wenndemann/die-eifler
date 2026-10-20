// Wald: Fichten und Buchen als Instanzen. Je Gelände-Chunk eine nahe Stufe (Low-Poly mit Schatten) und eine ferne
// Silhouette; mehrere Chunks sind zu einem Fern-Verbund gebündelt (ein Draw-Call je Art, solange alle Chunks
// darin fern sind). Instanzen sind gemischt, damit die Qualitätsstufe die Dichte per Anzahl regeln kann.
// Leichter Wind im Vertex-Shader.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { MapData } from '../map/mapdata';
import { hash } from './terrain';
import { HexGrid } from '../map/hex';
import { BAUM_SKALE, BAUM_DICHTE } from './massstab';
import { QUALI, type Qualitaet } from './qualitaet';
import { KULISSE_GLSL, KULISSE_FOG, kulisseUniforms } from './kulisse';

const TCHUNK = 192; // Zellen (1920 m) je Baum-Chunk
const VERBUND = 3;  // Chunks je Kante eines Fern-Verbunds
// Dichte je 100-m²-Zelle. Früher (echte Baumgröße) 0,88 je 900-m²-Zelle; mit BAUM_SKALE sinkt sie (massstab.ts).
const P_WALD = 0.88 * 100 / 900 * BAUM_DICHTE;
const P_STREU = 0.012 * 100 / 900 * BAUM_DICHTE;
const STEIL = 42; // Grad: steiler ist Fels (im 10-m-Raster sehr selten), keine Bäume

type Species = 'fichte' | 'buche';
const ARTEN: Species[] = ['fichte', 'buche'];

interface TreeChunk {
  center: THREE.Vector3;
  near: Map<Species, THREE.InstancedMesh>;
  far: Map<Species, THREE.InstancedMesh>;
  data: Map<Species, Float32Array>; // x, Höhe rel. Basis, z, Maßstab, Drehung
  /** Ursprünglicher Maßstab je Baum (für Aus- und Einblenden durch die Simulation), und die Baum-Id je Platz. */
  orig: Map<Species, Float32Array>;
  ids: Map<Species, Int32Array>;
  verbund: Verbund | null;
  istNah: boolean;
}
interface Verbund {
  far: Map<Species, THREE.InstancedMesh>; data: Map<Species, Float32Array>; chunks: TreeChunk[];
  orig: Map<Species, Float32Array>; ids: Map<Species, Int32Array>;
}

/** Reihenfolge der Instanzen deterministisch mischen: ein Anfangsstück ist dann eine gleichmäßige Stichprobe. */
function mische(a: Float32Array, seed: number, ids?: Int32Array) {
  const n = a.length / 5, t = new Float32Array(5);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(hash(i, seed) * (i + 1));
    if (j === i) continue;
    t.set(a.subarray(i * 5, i * 5 + 5));
    a.copyWithin(i * 5, j * 5, j * 5 + 5);
    a.set(t, j * 5);
    if (ids) { const x = ids[i]; ids[i] = ids[j]; ids[j] = x; }
  }
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

function tint(mesh: THREE.InstancedMesh, n: number, seed: number) {
  const col = new THREE.Color();
  for (let t = 0; t < n; t++) {
    const v = 0.82 + hash(t, seed) * 0.3;
    col.setRGB(v, v * (0.95 + hash(t + 3, seed + 1) * 0.1), v * 0.92);
    mesh.setColorAt(t, col);
  }
}

/** Geometrie in echten Metern (Fichte rund 31 m); BAUM_SKALE kommt je Instanz dazu. */
function buildGeometries() {
  const trunk = '#5a4030';
  const fichteNear = mergeGeometries([
    colored(new THREE.CylinderGeometry(0.9, 1.3, 7, 5, 1, true).translate(0, 3.5, 0), trunk),
    cone(9, 15, 4, 7, '#2f5a3a'),
    cone(7, 13, 12, 7, '#356240'),
    cone(4.8, 11, 20, 7, '#3b6a46'),
  ])!;
  const buchenKrone = new THREE.IcosahedronGeometry(10.5, 1).scale(1, 0.85, 1).translate(0, 17, 0);
  const buchenKrone2 = new THREE.IcosahedronGeometry(7, 1).translate(3.5, 22, 2);
  const bucheNear = mergeGeometries([
    colored(new THREE.CylinderGeometry(0.9, 1.4, 11, 5, 1, true).translate(0, 5.5, 0), trunk),
    colored(buchenKrone, '#6f9a48'),
    colored(buchenKrone2, '#7aa652'),
  ])!;
  const fichteFar = cone(8.5, 30, 1, 5, '#325e3d');
  const bucheFar = colored(new THREE.IcosahedronGeometry(11, 1).scale(1, 0.9, 1).translate(0, 17, 0), '#6f9a48');
  // Kronen weich (STIL.md): Normalen nach der Kugel, nicht je Facette
  for (const g of [fichteNear, bucheNear, fichteFar, bucheFar]) if (!g.attributes.normal) g.computeVertexNormals();
  return { fichte: [fichteNear, fichteFar], buche: [bucheNear, bucheFar] } as Record<Species, THREE.BufferGeometry[]>;
}

export class Trees {
  readonly group = new THREE.Group();
  readonly uniforms = { uTime: { value: 0 } };
  private chunks: TreeChunk[] = [];
  private verbuende: Verbund[] = [];
  private qualitaet: Qualitaet = 'mittel';
  count = 0;
  visibleNear = 0;
  private ex = 1;
  private nahDist: number = QUALI.mittel.baumNah;
  /** Material und Geometrien (Nah, Fern) je Art, auch für die Bäume aus der Simulation (natur.ts). */
  readonly material: THREE.MeshStandardMaterial;
  readonly geos: Record<Species, THREE.BufferGeometry[]>;
  // Zuordnung Kartenbaum → Spielfeld-Hex (einmal berechnet): Baum-Id → Chunk, Art, Platz im Chunk und im Fern-Verbund
  private bChunk: Int32Array = new Int32Array(0);
  private bArt: Uint8Array = new Uint8Array(0);
  private bPos: Int32Array = new Int32Array(0);
  private bVerbPos: Int32Array = new Int32Array(0);
  private bSichtbar: Uint8Array = new Uint8Array(0);
  /** Bäume je Spielfeld-Hex (Baum-Ids in fester, gemischter Reihenfolge) und wie viele davon gerade sichtbar sind. */
  private hexListen = new Map<number, Int32Array>();
  private hexSichtbar = new Map<number, number>();
  private schmutzig = new Set<THREE.InstancedMesh>();

  /** maske: Rasterzellen, die frei bleiben (Häuser). */
  constructor(map: MapData, base: number, ex: number, maske?: Uint8Array) {
    this.material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, flatShading: false });
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
diffuseColor.rgb = kSchnee(diffuseColor.rgb, 0.45);
diffuseColor.rgb = kGrau(diffuseColor.rgb, vKOut * 0.85);`)
        .replace('#include <fog_fragment>', KULISSE_FOG);
    };
    const geos = buildGeometries();
    this.geos = geos;
    const { width, height, cell } = map.info;
    const grid = new HexGrid(map.originX, map.originZ, map.ausschnitt.hex);
    const g = map.ground;
    const CHUNK = TCHUNK;
    const neigung = (i: number, j: number) => Math.atan(Math.hypot(
      g[map.idx(i + 1, j)] - g[map.idx(i - 1, j)], g[map.idx(i, j + 1)] - g[map.idx(i, j - 1)]) / (2 * cell)) * 57.2958;
    const chunkAt = new Map<string, TreeChunk>();
    // Baum-Ids (laufend) und ihre Daten für die Zuordnung zu den Spielfeld-Hexen
    const tHex: number[] = [], tChunk: number[] = [], tArt: number[] = [], tPos: number[] = [];
    for (let j0 = 0; j0 < height - 1; j0 += CHUNK) {
      for (let i0 = 0; i0 < width - 1; i0 += CHUNK) {
        const lists: Record<Species, number[]> = { fichte: [], buche: [] };
        const listIds: Record<Species, number[]> = { fichte: [], buche: [] };
        for (let j = j0; j < Math.min(j0 + CHUNK, height); j++) {
          for (let i = i0; i < Math.min(i0 + CHUNK, width); i++) {
            const k = j * width + i;
            const cv = map.cover[k];
            const r = hash(i * 3 + 11, j * 7 + 5);
            const forest = cv === 3;
            // Wald dicht, auf Wiesen/Mooren vereinzelte Bäume (Hecken-Landschaft)
            if (!(forest ? r < P_WALD : (cv === 1 || cv === 5) && r < P_STREU)) continue;
            if (map.railMask[k] || (maske && maske[k])) continue;
            const x = (i + 0.5 + (hash(i, j + 99) - 0.5) * 0.98) * cell;
            const z = (j + 0.5 + (hash(i + 77, j) - 0.5) * 0.98) * cell;
            // Ortskern-Hexe bleiben frei (dort stehen die Häuser)
            const hi = grid.index(grid.fromWorld(x, z));
            if (hi >= 0 && map.hexTerrain[hi] === 6) continue;
            if (map.water[k] > 0 || neigung(i, j) > STEIL) continue;
            const gy = map.heightAt(x, z);
            const pFichte = Math.min(0.85, Math.max(0.15, (gy - 380) / 250));
            const sp: Species = hash(i + 5, j + 3) < pFichte ? 'fichte' : 'buche';
            lists[sp].push(x, gy - base, z, (0.8 + hash(i + 1, j + 9) * 0.45) * BAUM_SKALE, hash(i + 4, j + 2) * Math.PI * 2);
            listIds[sp].push(tHex.length);
            tHex.push(hi);
          }
        }
        const ch: TreeChunk = {
          center: new THREE.Vector3((i0 + CHUNK / 2) * cell, 0, (j0 + CHUNK / 2) * cell),
          near: new Map(), far: new Map(), data: new Map(), orig: new Map(), ids: new Map(), verbund: null, istNah: false,
        };
        for (const sp of ARTEN) {
          const data = new Float32Array(lists[sp]);
          const n = data.length / 5;
          if (!n) continue;
          const ids = Int32Array.from(listIds[sp]);
          mische(data, i0 * 31 + j0 * 17 + (sp === 'fichte' ? 1 : 2), ids);
          ch.data.set(sp, data);
          ch.ids.set(sp, ids);
          const orig = new Float32Array(n);
          for (let t = 0; t < n; t++) { orig[t] = data[t * 5 + 3]; tChunk[ids[t]] = this.chunks.length; tArt[ids[t]] = ARTEN.indexOf(sp); tPos[ids[t]] = t; }
          ch.orig.set(sp, orig);
          const near = new THREE.InstancedMesh(geos[sp][0], this.material, n);
          const far = new THREE.InstancedMesh(geos[sp][1], this.material, n);
          far.instanceMatrix = near.instanceMatrix;
          tint(near, n, i0 + j0 * 7);
          far.instanceColor = near.instanceColor;
          near.castShadow = true;
          near.receiveShadow = true;
          near.visible = far.visible = false;
          ch.near.set(sp, near); ch.far.set(sp, far);
          this.group.add(near, far);
        }
        this.chunks.push(ch);
        chunkAt.set(`${Math.floor(i0 / CHUNK)},${Math.floor(j0 / CHUNK)}`, ch);
      }
    }
    // Fern-Verbünde: VERBUND x VERBUND Chunks, ein Netz je Art
    const vPos: number[] = [];
    for (let vj = 0; vj * VERBUND * CHUNK < height - 1; vj++) {
      for (let vi = 0; vi * VERBUND * CHUNK < width - 1; vi++) {
        const members: TreeChunk[] = [];
        for (let b = 0; b < VERBUND; b++) for (let a = 0; a < VERBUND; a++) {
          const c = chunkAt.get(`${vi * VERBUND + a},${vj * VERBUND + b}`);
          if (c) members.push(c);
        }
        if (!members.length) continue;
        const v: Verbund = { far: new Map(), data: new Map(), chunks: members, orig: new Map(), ids: new Map() };
        for (const sp of ARTEN) {
          const parts = members.map((c) => c.data.get(sp)).filter((d): d is Float32Array => !!d);
          const total = parts.reduce((s, d) => s + d.length, 0);
          if (!total) continue;
          const all = new Float32Array(total);
          const allIds = new Int32Array(total / 5);
          let o = 0;
          for (const c of members) {
            const d = c.data.get(sp);
            if (!d) continue;
            all.set(d, o); allIds.set(c.ids.get(sp)!, o / 5); o += d.length;
          }
          mische(all, vi * 131 + vj * 71 + 5, allIds);
          v.data.set(sp, all);
          v.ids.set(sp, allIds);
          const vOrig = new Float32Array(total / 5);
          for (let t = 0; t < vOrig.length; t++) { vOrig[t] = all[t * 5 + 3]; vPos[allIds[t]] = t; }
          v.orig.set(sp, vOrig);
          const far = new THREE.InstancedMesh(geos[sp][1], this.material, total / 5);
          tint(far, total / 5, vi * 5 + vj * 3 + 1);
          far.visible = false;
          v.far.set(sp, far);
          this.group.add(far);
        }
        for (const c of members) c.verbund = v;
        this.verbuende.push(v);
      }
    }
    // Bäume je Spielfeld-Hex sammeln, je Hex in fester gemischter Reihenfolge (bestimmt, welche zuerst verschwinden)
    this.bChunk = Int32Array.from(tChunk); this.bArt = Uint8Array.from(tArt); this.bPos = Int32Array.from(tPos);
    this.bVerbPos = Int32Array.from(vPos);
    this.bSichtbar = new Uint8Array(tHex.length).fill(1);
    const je = new Map<number, number[]>();
    for (let id = 0; id < tHex.length; id++) {
      if (tHex[id] < 0) continue;
      const l = je.get(tHex[id]);
      if (l) l.push(id); else je.set(tHex[id], [id]);
    }
    for (const [h, l] of je) {
      l.sort((a, b) => hash(a, 17) - hash(b, 17));
      this.hexListen.set(h, Int32Array.from(l));
      this.hexSichtbar.set(h, l.length);
    }
    this.setExaggeration(ex);
  }

  /** Zahl der Kartenbäume auf dem Spielfeld-Hex (Index wie HexFeld.index). */
  hexBaeume(hexIndex: number): number {
    return this.hexListen.get(hexIndex)?.length ?? 0;
  }

  /** Nur der Anteil (0..1) der Kartenbäume des Hex bleibt sichtbar; welche, steht fest (gemischte Reihenfolge je Hex). Danach uebernehmen() aufrufen. */
  setzeHexAnteil(hexIndex: number, anteil: number): void {
    const l = this.hexListen.get(hexIndex);
    if (!l) return;
    const soll = Math.max(0, Math.min(l.length, Math.round(l.length * anteil)));
    const ist = this.hexSichtbar.get(hexIndex)!;
    if (soll === ist) return;
    const a = Math.min(soll, ist), b = Math.max(soll, ist);
    for (let k = a; k < b; k++) this.zeigeBaum(l[k], k < soll);
    this.hexSichtbar.set(hexIndex, soll);
  }

  private zeigeBaum(id: number, an: boolean) {
    this.bSichtbar[id] = an ? 1 : 0;
    const ch = this.chunks[this.bChunk[id]];
    const sp = ARTEN[this.bArt[id]];
    const t = this.bPos[id];
    const data = ch.data.get(sp)!;
    const o = ch.orig.get(sp)![t];
    data[t * 5 + 3] = an ? o : 0;
    this.schreibe(ch.near.get(sp)!, data, t);
    this.schmutzig.add(ch.near.get(sp)!);
    const v = ch.verbund;
    if (v) {
      const vt = this.bVerbPos[id], vd = v.data.get(sp)!;
      vd[vt * 5 + 3] = an ? v.orig.get(sp)![vt] : 0;
      this.schreibe(v.far.get(sp)!, vd, vt);
      this.schmutzig.add(v.far.get(sp)!);
    }
  }

  private schreibe(mesh: THREE.InstancedMesh, data: Float32Array, t: number) {
    const m = new THREE.Matrix4(), q = new THREE.Quaternion();
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), data[t * 5 + 4]);
    mesh.setMatrixAt(t, m.compose(new THREE.Vector3(data[t * 5], data[t * 5 + 1] * this.ex, data[t * 5 + 2]), q, new THREE.Vector3().setScalar(data[t * 5 + 3])));
  }

  /** Geänderte Netze zur Grafikkarte schicken (nach setzeHexAnteil). */
  uebernehme(): void {
    for (const m of this.schmutzig) m.instanceMatrix.needsUpdate = true;
    this.schmutzig.clear();
  }

  private fill(mesh: THREE.InstancedMesh, data: Float32Array, ex: number) {
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);
    const n = data.length / 5;
    mesh.count = n;
    for (let t = 0; t < n; t++) {
      p.set(data[t * 5], data[t * 5 + 1] * ex, data[t * 5 + 2]);
      q.setFromAxisAngle(up, data[t * 5 + 4]);
      s.setScalar(data[t * 5 + 3]);
      mesh.setMatrixAt(t, m.compose(p, q, s));
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }

  /** Bäume im Umkreis (Ausschnitt-Meter) entfernen, z. B. wo ein Spielgebäude entsteht. Liefert die Zahl betroffener Netze. */
  lichte(x: number, z: number, radius: number): number {
    return this.lichtePunkte([{ x, z }], radius);
  }

  /** Bäume im Umkreis mehrerer Punkte entfernen (z. B. entlang eines Wegs); Gitter-Suche, daher auch für viele Punkte schnell. */
  lichtePunkte(punkte: { x: number; z: number }[], radius: number): number {
    if (!punkte.length) return 0;
    const r2 = radius * radius, zelle = radius * 2;
    const gitter = new Map<string, { x: number; z: number }[]>();
    for (const p of punkte) {
      const k = `${Math.floor(p.x / zelle)},${Math.floor(p.z / zelle)}`;
      const l = gitter.get(k);
      if (l) l.push(p); else gitter.set(k, [p]);
    }
    const raus = (data: Float32Array, orig: Float32Array) => {
      let n = 0;
      for (let t = 0; t < data.length / 5; t++) {
        if (orig[t] <= 0) continue;
        const x = data[t * 5], z = data[t * 5 + 2];
        const ci = Math.floor(x / zelle), cj = Math.floor(z / zelle);
        let treffer = false;
        for (let dj = -1; dj <= 1 && !treffer; dj++) for (let di = -1; di <= 1 && !treffer; di++) {
          const l = gitter.get(`${ci + di},${cj + dj}`);
          if (l) for (const p of l) if ((p.x - x) * (p.x - x) + (p.z - z) * (p.z - z) < r2) { treffer = true; break; }
        }
        if (treffer) { data[t * 5 + 3] = 0; orig[t] = 0; n++; }
      }
      return n;
    };
    let gesamt = 0;
    for (const ch of this.chunks) for (const [sp, data] of ch.data) {
      if (!raus(data, ch.orig.get(sp)!)) continue;
      gesamt++;
      this.fill(ch.near.get(sp)!, data, this.ex);
      ch.far.get(sp)!.boundingSphere = ch.near.get(sp)!.boundingSphere;
    }
    for (const v of this.verbuende) for (const [sp, data] of v.data) if (raus(data, v.orig.get(sp)!)) this.fill(v.far.get(sp)!, data, this.ex);
    return gesamt;
  }

  setExaggeration(ex: number) {
    this.ex = ex;
    for (const ch of this.chunks) {
      let sum = 0, cnt = 0;
      for (const [sp, data] of ch.data) {
        this.fill(ch.near.get(sp)!, data, ex);
        ch.far.get(sp)!.boundingSphere = ch.near.get(sp)!.boundingSphere;
        for (let t = 0; t < data.length / 5; t++) { sum += data[t * 5 + 1] * ex; cnt++; }
      }
      ch.center.y = cnt ? sum / cnt : 0;
    }
    for (const v of this.verbuende) for (const [sp, data] of v.data) this.fill(v.far.get(sp)!, data, ex);
    this.setQuality(this.qualitaet);
  }

  /** Nah-Abstand und Baumdichte nach Qualitätsstufe (Anteil der gemischten Instanzen). */
  setQuality(q: Qualitaet) {
    this.qualitaet = q;
    const p = QUALI[q];
    this.nahDist = p.baumNah;
    this.count = 0;
    for (const ch of this.chunks) for (const [sp, data] of ch.data) {
      const n = data.length / 5;
      ch.near.get(sp)!.count = Math.ceil(n * p.baumDichteNah);
      ch.far.get(sp)!.count = Math.ceil(n * p.baumDichteFern);
      this.count += n;
    }
    for (const v of this.verbuende) for (const [sp, data] of v.data) v.far.get(sp)!.count = Math.ceil((data.length / 5) * p.baumDichteFern);
  }

  setVisible(v: boolean) { this.group.visible = v; }

  update(camPos: THREE.Vector3) {
    this.visibleNear = 0;
    for (const ch of this.chunks) {
      ch.istNah = ch.center.distanceTo(camPos) < this.nahDist;
      for (const m of ch.near.values()) { m.visible = ch.istNah; if (ch.istNah) this.visibleNear += m.count; }
    }
    for (const v of this.verbuende) {
      const alleFern = v.chunks.every((c) => !c.istNah);
      for (const m of v.far.values()) m.visible = alleFern;
      for (const c of v.chunks) for (const m of c.far.values()) m.visible = !c.istNah && !alleFern;
    }
  }
}
