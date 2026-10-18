// Wege als Erdpfade (Drehbuch 4.1, M3): Jedes Segment der Sicht läuft durch die Mittelpunkte seiner Hexe, weich
// gerundet (Catmull-Rom), als Band mit weichen Rändern, das sich ans Gelände schmiegt und knapp darüber liegt
// (Polygon-Offset gegen Z-Fighting, wie die Gleise in rails.ts). Die Breite wächst leicht mit dem Verkehr.
// Dazu die Vorschau-Linie beim Wegbau (hell gestrichelt, rot wenn ungültig).
// Reiner Leser der SimSicht (src/sim/typen.ts), ohne Simulation nutzbar.
import * as THREE from 'three';
import type { MapData } from '../map/mapdata';
import type { HexGrid } from '../map/hex';
import type { SimSicht } from '../sim/typen';
import { KULISSE_GLSL, KULISSE_FOG, kulisseUniforms } from './kulisse';
import { WEG_BREITE } from './massstab';

export interface Pkt { x: number; z: number }

/** Punkt auf der Catmull-Rom-Kurve durch die Stützpunkte: Kante i (zwischen pts[i] und pts[i+1]), t in 0..1. */
export function kurvenPunkt(pts: Pkt[], i: number, t: number, out: Pkt = { x: 0, z: 0 }): Pkt {
  const n = pts.length;
  const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[Math.min(n - 1, i + 1)], p3 = pts[Math.min(n - 1, i + 2)];
  const t2 = t * t, t3 = t2 * t;
  const f = (a: number, b: number, c: number, d: number) =>
    0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
  out.x = f(p0.x, p1.x, p2.x, p3.x);
  out.z = f(p0.z, p1.z, p2.z, p3.z);
  return out;
}

/** Mittellinie dicht abgetastet: Punkte mit Weg-Länge (flow). */
export function mittellinie(pts: Pkt[], je = 9): { x: number; z: number; flow: number }[] {
  const out: { x: number; z: number; flow: number }[] = [];
  let len = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    for (let s = 0; s < je; s++) {
      const p = kurvenPunkt(pts, i, s / je);
      if (out.length) len += Math.hypot(p.x - out[out.length - 1].x, p.z - out[out.length - 1].z);
      out.push({ x: p.x, z: p.z, flow: len });
    }
  }
  const l = pts[pts.length - 1];
  if (out.length) len += Math.hypot(l.x - out[out.length - 1].x, l.z - out[out.length - 1].z);
  out.push({ x: l.x, z: l.z, flow: len });
  return out;
}

interface Puffer { pos: number[]; side: number[]; flow: number[]; nrm: number[]; idx: number[] }
const neuerPuffer = (): Puffer => ({ pos: [], side: [], flow: [], nrm: [], idx: [] });

/** Band entlang einer Linie. Höhe aus dem Gelände + lift (m ü. Gelände, unskaliert). */
function band(b: Puffer, linie: { x: number; z: number; flow: number }[], halb: number, yOf: (x: number, z: number) => number) {
  const n = linie.length;
  if (n < 2) return;
  const v0 = b.pos.length / 3;
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - 1), c = Math.min(n - 1, i + 1);
    let tx = linie[c].x - linie[a].x, tz = linie[c].z - linie[a].z;
    const tl = Math.hypot(tx, tz) || 1;
    tx /= tl; tz /= tl;
    const nx = -tz, nz = tx;
    const y = yOf(linie[i].x, linie[i].z);
    b.pos.push(linie[i].x + nx * halb, y, linie[i].z + nz * halb, linie[i].x - nx * halb, y, linie[i].z - nz * halb);
    b.nrm.push(nx, nz, nx, nz);
    b.side.push(-1, 1);
    b.flow.push(linie[i].flow, linie[i].flow);
    if (i > 0) {
      const q = v0 + (i - 1) * 2;
      b.idx.push(q, q + 1, q + 2, q + 1, q + 3, q + 2);
    }
  }
}

/** Runde Scheibe (Knotenpunkt an Fahnen), Rand weich. */
function scheibe(b: Puffer, x: number, z: number, r: number, yOf: (x: number, z: number) => number) {
  const v0 = b.pos.length / 3, K = 14;
  b.pos.push(x, yOf(x, z), z); b.nrm.push(0, 0); b.side.push(0); b.flow.push(0);
  for (let k = 0; k < K; k++) {
    const a = (k / K) * Math.PI * 2, dx = Math.cos(a), dz = Math.sin(a);
    b.pos.push(x + dx * r, yOf(x + dx * r, z + dz * r), z + dz * r);
    b.nrm.push(dx, dz); b.side.push(1); b.flow.push(0);
    b.idx.push(v0, v0 + 1 + k, v0 + 1 + ((k + 1) % K));
  }
}

function geometrie(b: Puffer): THREE.BufferGeometry {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(b.pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(new Float32Array(b.pos.length).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
  geo.setAttribute('aSide', new THREE.Float32BufferAttribute(b.side, 1));
  geo.setAttribute('aFlow', new THREE.Float32BufferAttribute(b.flow, 1));
  geo.setAttribute('aNrm', new THREE.Float32BufferAttribute(b.nrm, 2));
  geo.setIndex(b.pos.length / 3 > 65535 ? new THREE.Uint32BufferAttribute(b.idx, 1) : new THREE.Uint16BufferAttribute(b.idx, 1));
  geo.computeBoundingSphere();
  return geo;
}

const VERT_COMMON = `#include <common>
attribute float aSide; attribute float aFlow; attribute vec2 aNrm;
varying float vSide; varying float vFlow; varying float vDist; varying vec3 vWPos;`;

const VERT_KOPF = `#include <begin_vertex>
vSide = aSide; vFlow = aFlow;
vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
vDist = length(vWPos - cameraPosition);
// aus der Ferne etwas breiter (bleibt lesbar) und gegen grobe Gelände-Stufen angehoben
transformed.xz += aNrm * aSide * clamp(vDist * 0.0014, 0.0, 7.0);
transformed.y += clamp((vDist - 700.0) * 0.003, 0.0, 20.0) / modelMatrix[1][1];`;

const FRAG_KOPF = `#include <common>
varying float vSide; varying float vFlow; varying float vDist; varying vec3 vWPos;
float vKFade;
${KULISSE_GLSL}
float wh(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float wn(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
  return mix(mix(wh(i),wh(i+vec2(1,0)),f.x), mix(wh(i+vec2(0,1)),wh(i+vec2(1,1)),f.x), f.y); }`;

/** Material für Erdpfade. */
function erdMaterial(): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({
    color: '#a98b62', roughness: 1, metalness: 0, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4,
  });
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, kulisseUniforms);
    shader.vertexShader = shader.vertexShader.replace('#include <common>', VERT_COMMON).replace('#include <begin_vertex>', VERT_KOPF);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', FRAG_KOPF)
      .replace('#include <color_fragment>', `#include <color_fragment>
{
  float s = abs(vSide);
  // ausgefranster Rand: Rauschen verschiebt die Kante
  float rauh = wn(vWPos.xz * 0.35) - 0.5;
  float kante = s + rauh * 0.35;
  // Mitte heller (festgetreten), Ränder dunkler und grasig
  vec3 erde = vec3(1.0) * (0.86 + 0.2 * wn(vWPos.xz * 0.9));
  erde = mix(erde, erde * vec3(1.12, 1.1, 1.0), 1.0 - smoothstep(0.0, 0.55, s));
  erde = mix(erde, erde * vec3(0.62, 0.66, 0.5), smoothstep(0.55, 1.0, kante));
  // zwei Wagenspuren
  float spur = 1.0 - smoothstep(0.0, 0.09, abs(s - 0.42));
  erde *= 1.0 - 0.14 * spur;
  diffuseColor.rgb *= erde;
  diffuseColor.a = 1.0 - smoothstep(0.62, 0.98, kante);
  diffuseColor.rgb = kGrau(diffuseColor.rgb, kOut(vWPos.xz));
  vKFade = kFade(vWPos.xz);
}`)
      .replace('#include <fog_fragment>', KULISSE_FOG);
  };
  return mat;
}

/** Material der Vorschau-Linie: gestrichelt, hell oder rot. */
function vorschauMaterial(): { mat: THREE.MeshBasicMaterial; farbe: { value: THREE.Color }; zeit: { value: number } } {
  const farbe = { value: new THREE.Color('#fff2c4') };
  const zeit = { value: 0 };
  const mat = new THREE.MeshBasicMaterial({
    color: '#ffffff', transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: true,
    polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -6,
  });
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, kulisseUniforms, { uVFarbe: farbe, uVZeit: zeit });
    shader.vertexShader = shader.vertexShader.replace('#include <common>', VERT_COMMON).replace('#include <begin_vertex>', VERT_KOPF);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
varying float vSide; varying float vFlow; varying float vDist; varying vec3 vWPos;
uniform vec3 uVFarbe; uniform float uVZeit;
float vKFade;
${KULISSE_GLSL}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
{
  // Strich 16 m, Lücke 10 m, wandert langsam in Wegrichtung
  float dash = step(fract((vFlow - uVZeit * 12.0) / 26.0), 16.0 / 26.0);
  float a = dash * (1.0 - smoothstep(0.55, 1.0, abs(vSide)));
  float kern = 1.0 - smoothstep(0.0, 0.5, abs(vSide));
  diffuseColor.rgb = uVFarbe * (0.82 + 0.35 * kern);
  diffuseColor.a = a * 0.95;
  vKFade = kFade(vWPos.xz);
}`)
      .replace('#include <fog_fragment>', KULISSE_FOG);
  };
  return { mat, farbe, zeit };
}

export class Wege {
  readonly group = new THREE.Group();
  /** Optional: Bäume entlang neuer Wege entfernen (Trees.lichtePunkte). */
  wald: { lichtePunkte(p: { x: number; z: number }[], radius: number): number } | null = null;
  private gelichtet = new Set<string>();
  private wege: THREE.Mesh;
  private vorschau: THREE.Mesh;
  private vor = vorschauMaterial();
  private sig = '';
  private vorSig = '';

  constructor(private map: MapData, private grid: HexGrid, private base: number, ex: number) {
    this.wege = new THREE.Mesh(new THREE.BufferGeometry(), erdMaterial());
    this.wege.receiveShadow = true;
    this.wege.renderOrder = 2;
    this.wege.frustumCulled = false;
    this.vorschau = new THREE.Mesh(new THREE.BufferGeometry(), this.vor.mat);
    this.vorschau.renderOrder = 4;
    this.vorschau.visible = false;
    this.vorschau.frustumCulled = false;
    this.group.add(this.wege, this.vorschau);
    this.setExaggeration(ex);
  }

  setExaggeration(ex: number) {
    this.group.scale.y = ex;
  }

  private punkte(pfad: { q: number; r: number }[]): Pkt[] {
    return pfad.map((h) => this.grid.toWorld(h));
  }

  private yOf = (x: number, z: number) => this.map.heightAt(x, z) - this.base + 0.35;

  /** Sicht lesen; baut die Bänder nur neu, wenn sich Segmente, Verkehr oder das Gelände geändert haben. */
  update(sicht: SimSicht, _alpha = 0, dt = 0) {
    this.vor.zeit.value += dt;
    let sig = this.map.groundRev + '#';
    for (const s of sicht.segmente) {
      const p = s.pfad;
      sig += `${s.id}:${p.length}:${p[0]?.q},${p[0]?.r},${p[p.length - 1]?.q},${p[p.length - 1]?.r}:${s.verkehr >> 5};`;
    }
    if (sig === this.sig) return;
    this.sig = sig;
    const b = neuerPuffer();
    const enden = new Set<string>();
    for (const s of sicht.segmente) {
      if (s.pfad.length < 2) continue;
      const halb = (WEG_BREITE[0] + (WEG_BREITE[1] - WEG_BREITE[0]) * Math.min(1, s.verkehr / 255)) / 2;
      const linie = mittellinie(this.punkte(s.pfad));
      band(b, linie, halb, this.yOf);
      const gk = `${s.id}:${s.pfad.length}`;
      if (this.wald && !this.gelichtet.has(gk)) {
        this.gelichtet.add(gk);
        this.wald.lichtePunkte(linie.filter((_, i) => i % 2 === 0), halb + 5);
      }
      for (const h of [s.pfad[0], s.pfad[s.pfad.length - 1]]) {
        const key = `${h.q},${h.r}`;
        if (enden.has(key)) continue;
        enden.add(key);
        const w = this.grid.toWorld(h);
        scheibe(b, w.x, w.z, halb * 1.35, this.yOf);
      }
    }
    this.wege.geometry.dispose();
    this.wege.geometry = geometrie(b);
    this.wege.visible = b.idx.length > 0;
  }

  /** Vorschau beim Wegbau: Pfad (benachbarte Hexe) oder null zum Ausblenden. Rot, wenn ungültig. */
  zeigeVorschau(pfad: { q: number; r: number }[] | null, gueltig: boolean) {
    if (!pfad || pfad.length < 2) {
      this.vorschau.visible = false;
      this.vorSig = '';
      return;
    }
    this.vor.farbe.value.set(gueltig ? '#fff2c4' : '#e0392b');
    const sig = pfad.map((h) => `${h.q},${h.r}`).join(';') + (gueltig ? '+' : '-') + this.map.groundRev;
    this.vorschau.visible = true;
    if (sig === this.vorSig) return;
    this.vorSig = sig;
    const b = neuerPuffer();
    band(b, mittellinie(this.punkte(pfad)), 4.2, (x, z) => this.map.heightAt(x, z) - this.base + 0.9);
    this.vorschau.geometry.dispose();
    this.vorschau.geometry = geometrie(b);
  }
}
