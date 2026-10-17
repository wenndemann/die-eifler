// Bahnstrecken (Drehbuch 3: Bahn ja, Straßen nein) und Staatsgrenze als Streifen-Meshes im Gelände.
// Gleisbett: Schotter (~5 m) mit zwei dunklen Schienen und Schwellen, folgt dem Gelände (y aus den Daten).
// Grenze: gestrichelte Linie, auf das Gelände gelegt.
import * as THREE from 'three';
import type { MapData } from '../map/mapdata';
import { KULISSE_GLSL, KULISSE_FOG, kulisseUniforms } from './kulisse';

interface Streifen {
  pos: number[]; side: number[]; flow: number[]; nrm: number[]; idx: number[];
}

/** Linienzug mit Schrittweite max. step Meter verdichten; liefert [x, z, wert, ...]. */
function verdichte(p: number[], stride: number, step: number): number[] {
  const out: number[] = [];
  for (let i = 0; i + stride - 1 < p.length; i += stride) {
    for (let k = 0; k < stride; k++) out.push(p[i + k]);
    if (i + 2 * stride - 1 < p.length) {
      const len = Math.hypot(p[i + stride] - p[i], p[i + stride + 1] - p[i + 1]);
      const m = Math.floor(len / step);
      for (let s = 1; s <= m; s++) {
        const t = s / (m + 1);
        for (let k = 0; k < stride; k++) out.push(p[i + k] + (p[i + stride + k] - p[i + k]) * t);
      }
    }
  }
  return out;
}

/** Streifen entlang einer Linie; yOf liefert die Höhe (m ü. NN, unskaliert) je Punkt. */
function streifen(s: Streifen, p: number[], stride: number, half: number, yOf: (i: number, x: number, z: number) => number) {
  const n = p.length / stride;
  if (n < 2) return;
  const v0 = s.pos.length / 3;
  let len = 0;
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - 1), b = Math.min(n - 1, i + 1);
    let tx = p[b * stride] - p[a * stride], tz = p[b * stride + 1] - p[a * stride + 1];
    const tl = Math.hypot(tx, tz) || 1;
    tx /= tl; tz /= tl;
    let miter = 1;
    if (i > 0 && i < n - 1) {
      let ux = p[i * stride] - p[a * stride], uz = p[i * stride + 1] - p[a * stride + 1];
      const ul = Math.hypot(ux, uz) || 1;
      ux /= ul; uz /= ul;
      miter = 1 / Math.max(0.6, ux * tx + uz * tz);
    }
    if (i > 0) len += Math.hypot(p[i * stride] - p[(i - 1) * stride], p[i * stride + 1] - p[(i - 1) * stride + 1]);
    const x = p[i * stride], z = p[i * stride + 1];
    const y = yOf(i, x, z);
    const nx = -tz * miter, nz = tx * miter;
    s.pos.push(x + nx * half, y, z + nz * half, x - nx * half, y, z - nz * half);
    s.nrm.push(nx, nz, nx, nz);
    s.side.push(-1, 1);
    s.flow.push(len, len);
    if (i > 0) {
      const q = v0 + (i - 1) * 2;
      s.idx.push(q, q + 1, q + 2, q + 1, q + 3, q + 2);
    }
  }
}

function geometrie(s: Streifen): THREE.BufferGeometry {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(s.pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(new Float32Array(s.pos.length).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
  geo.setAttribute('aSide', new THREE.Float32BufferAttribute(s.side, 1));
  geo.setAttribute('aFlow', new THREE.Float32BufferAttribute(s.flow, 1));
  geo.setAttribute('aNrm', new THREE.Float32BufferAttribute(s.nrm, 2));
  geo.setIndex(s.pos.length / 3 > 65535 ? new THREE.Uint32BufferAttribute(s.idx, 1) : new THREE.Uint16BufferAttribute(s.idx, 1));
  geo.computeBoundingSphere();
  return geo;
}

const VERT_COMMON = `#include <common>
attribute float aSide; attribute float aFlow; attribute vec2 aNrm;
varying float vSide; varying float vFlow; varying float vDist; varying vec3 vWPos;`;

export class Rails {
  readonly mesh: THREE.Mesh;
  static readonly HALF = 3.6;  // Schotterbett ~7 m breit (Spiel-Maßstab, breiter als echt: bleibt lesbar)

  constructor(map: MapData, base: number) {
    const s: Streifen = { pos: [], side: [], flow: [], nrm: [], idx: [] };
    for (const b of map.rails) {
      const p = verdichte(b.p, 3, 5);
      // Höhe aus den Daten, nie unter dem Gelände (Einschnitte), leicht angehoben gegen Z-Fighting
      streifen(s, p, 3, Rails.HALF, (i, x, z) => Math.max(p[i * 3 + 2], map.heightAt(x, z)) + 0.28 - base);
    }
    const mat = new THREE.MeshStandardMaterial({
      color: '#8a7f6c', roughness: 0.97, metalness: 0, transparent: true, depthWrite: false, side: THREE.DoubleSide,
      polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3,
    });
    mat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, kulisseUniforms);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', VERT_COMMON)
        .replace('#include <begin_vertex>', `#include <begin_vertex>
vSide = aSide; vFlow = aFlow;
vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
vDist = length(vWPos - cameraPosition);
// in der Ferne etwas breiter (bleibt sichtbar) und gegen grobe Gelände-Stufen angehoben
transformed.xz += aNrm * aSide * clamp(vDist * 0.0018, 0.0, 11.0);
transformed.y += clamp((vDist - 900.0) * 0.003, 0.0, 25.0) / modelMatrix[1][1];`);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>
varying float vSide; varying float vFlow; varying float vDist; varying vec3 vWPos;
float vKFade;
${KULISSE_GLSL}
float rh(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }`)
        .replace('#include <color_fragment>', `#include <color_fragment>
{
  float m = vSide * ${Rails.HALF.toFixed(2)};
  float am = abs(m);
  float near = 1.0 - smoothstep(250.0, 900.0, vDist);
  vec3 gravel = vec3(0.66, 0.59, 0.47) * (0.9 + 0.2 * rh(floor(vec2(m * 3.0, vFlow * 3.0))));
  float sleeper = step(0.55, fract(vFlow / 0.65)) * (1.0 - smoothstep(2.1, 2.6, am));
  gravel = mix(gravel, vec3(0.30, 0.23, 0.17), sleeper * 0.7 * near);
  float rail = (1.0 - smoothstep(0.07, 0.16, abs(am - 0.72))) ;
  vec3 steel = vec3(0.11, 0.11, 0.12);
  float railK = rail * mix(0.45, 1.0, near);
  diffuseColor.rgb = mix(gravel, steel, railK);
  // Aus der Ferne: dunkle Mittellinie (Gleise) zwischen hellem Schotter, damit die Linie lesbar bleibt
  float mid = (1.0 - near) * (1.0 - smoothstep(0.0, 0.32, abs(vSide)));
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.20, 0.18, 0.17), mid * 0.7);
  diffuseColor.a = 1.0 - smoothstep(0.82, 1.0, abs(vSide));
  diffuseColor.rgb = kGrau(diffuseColor.rgb, kOut(vWPos.xz));
  vKFade = kFade(vWPos.xz);
}`)
        .replace('#include <fog_fragment>', KULISSE_FOG);
    };
    this.mesh = new THREE.Mesh(geometrie(s), mat);
    this.mesh.receiveShadow = true;
    this.mesh.renderOrder = 2;
  }
}

/** Staatsgrenze: gestrichelte Linie im Gelände (Drehbuch 3.1). */
export class Grenze {
  readonly mesh: THREE.Mesh;

  constructor(map: MapData, base: number) {
    const s: Streifen = { pos: [], side: [], flow: [], nrm: [], idx: [] };
    for (const l of map.grenze) {
      const p = verdichte(l, 2, 8);
      streifen(s, p, 2, 3.2, (_i, x, z) => map.heightAt(x, z) + 0.5 - base);
    }
    const mat = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: true,
      polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
    mat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, kulisseUniforms);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', VERT_COMMON)
        .replace('#include <begin_vertex>', `#include <begin_vertex>
vSide = aSide; vFlow = aFlow;
vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
vDist = length(vWPos - cameraPosition);
// Breite wächst mit dem Abstand, damit die Linie auch aus der Höhe lesbar bleibt
transformed.xz += aNrm * aSide * clamp(vDist * 0.0018, 0.0, 12.0);
transformed.y += clamp((vDist - 900.0) * 0.003, 0.0, 25.0) / modelMatrix[1][1];`);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>
varying float vSide; varying float vFlow; varying float vDist; varying vec3 vWPos;
float vKFade;
${KULISSE_GLSL}`)
        .replace('#include <color_fragment>', `#include <color_fragment>
{
  // Strich 28 m, Lücke 18 m (Dehnung mit dem Abstand, damit die Striche nicht flimmern)
  float per = 46.0 * (1.0 + floor(vDist / 3000.0) * 0.0);
  float dash = step(fract(vFlow / per), 28.0 / 46.0);
  float a = dash * (1.0 - smoothstep(0.7, 1.0, abs(vSide)));
  diffuseColor.rgb = mix(vec3(0.5, 0.06, 0.05), vec3(0.98, 0.9, 0.72), smoothstep(0.45, 0.0, abs(vSide)) * 0.35);
  diffuseColor.a = a;
  vKFade = kFade(vWPos.xz);
}`)
        .replace('#include <fog_fragment>', KULISSE_FOG);
    };
    this.mesh = new THREE.Mesh(geometrie(s), mat);
    this.mesh.renderOrder = 3;
  }
}
