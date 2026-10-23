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
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { box } from './mockup';

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
    color: '#c4a472', roughness: 1, metalness: 0, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4,
    // Alpha des Geländes (0) bleibt stehen: der Bilderbuch-Pass zieht an Wegen keine Linie (buchpass.ts)
    blending: THREE.CustomBlending, blendSrc: THREE.SrcAlphaFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
    blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor,
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
function vorschauMaterial(massiv = false): { mat: THREE.MeshBasicMaterial; farbe: { value: THREE.Color }; zeit: { value: number } } {
  const farbe = { value: new THREE.Color(massiv ? '#ffcf5a' : '#fff2c4') };
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
  // Strich 16 m, Lücke 10 m, wandert langsam in Wegrichtung (das feste Stück ist durchgezogen)
  float dash = ${massiv ? '1.0' : 'step(fract((vFlow - uVZeit * 12.0) / 26.0), 16.0 / 26.0)'};
  float a = dash * (1.0 - smoothstep(0.55, 1.0, abs(vSide)));
  float kern = 1.0 - smoothstep(0.0, 0.5, abs(vSide));
  diffuseColor.rgb = uVFarbe * (0.82 + 0.35 * kern);
  diffuseColor.a = a * ${massiv ? '1.0' : '0.95'};
  vKFade = kFade(vWPos.xz);
}`)
      .replace('#include <fog_fragment>', KULISSE_FOG);
  };
  return { mat, farbe, zeit };
}

/** Sichtbare Mindestbreite je Gewässerart (Fluss, Bach, Kanal), wie rivers.ts. */
const GEWAESSER_BREITE = [8, 3.5, 4];

/**
 * Kleine Holzbrücke (Länge entlang x, Mitte im Ursprung, Deck auf y = 0): leicht gewölbte Bohlen, Pfosten und Geländer, steinerne
 * Widerlager an den Enden. Reine Darstellung (Wege über Bäche und Flüsse).
 */
export function brueckeGeometrie(laenge: number, breite: number, fertig = true): THREE.BufferGeometry {
  const teile: THREE.BufferGeometry[] = [];
  // noch keine Brücke geliefert: nur die Widerlager und zwei Pfähle mit rot-weißem Band (Baustelle)
  if (!fertig) {
    for (const sx of [1, -1]) {
      teile.push(box(3, 2.5, breite + 2, sx * (laenge / 2 + 0.8), -1.2, 0, '#9a948a'));
      for (const sz of [1, -1]) teile.push(box(0.5, 3.2, 0.5, sx * (laenge / 2 - 0.4), 1.4, sz * (breite / 2), '#5a3c26'));
      teile.push(box(0.2, 0.5, breite, sx * (laenge / 2 - 0.4), 2.4, 0, '#d6262a'));
      teile.push(box(0.22, 0.25, breite * 0.5, sx * (laenge / 2 - 0.4), 2.4, 0, '#f4f4ee'));
    }
    const g = mergeGeometries(teile)!;
    g.computeVertexNormals();
    return g;
  }
  const n = Math.max(4, Math.round(laenge / 1.6)), bogen = Math.min(3, laenge * 0.09);
  const hoehe = (x: number) => bogen * Math.cos((x / laenge) * Math.PI);
  for (let i = 0; i < n; i++) {
    const x = -laenge / 2 + (i + 0.5) * (laenge / n);
    teile.push(box(laenge / n - 0.15, 0.55, breite, x, hoehe(x), 0, i % 2 ? '#8a6340' : '#7a5636', 0, -Math.sin((x / laenge) * Math.PI) * 0.25));
  }
  const pf = Math.max(2, Math.round(laenge / 4));
  for (const sz of [1, -1]) {
    for (let i = 0; i <= pf; i++) {
      const x = -laenge / 2 + (i * laenge) / pf;
      teile.push(box(0.5, 2.6, 0.5, x, hoehe(x) + 1.3, sz * (breite / 2 - 0.2), '#5a3c26'));
    }
    for (let i = 0; i < pf; i++) {
      const x0 = -laenge / 2 + (i * laenge) / pf, x1 = x0 + laenge / pf, xm = (x0 + x1) / 2;
      teile.push(box(laenge / pf + 0.3, 0.35, 0.35, xm, (hoehe(x0) + hoehe(x1)) / 2 + 2.5, sz * (breite / 2 - 0.2), '#6b4a2e', 0, -Math.atan2(hoehe(x1) - hoehe(x0), x1 - x0)));
    }
  }
  for (const sx of [1, -1]) teile.push(box(3, 2.5, breite + 2, sx * (laenge / 2 + 0.8), -1.2, 0, '#9a948a'));
  const g = mergeGeometries(teile)!;
  g.computeVertexNormals();
  return g;
}

export class Wege {
  readonly group = new THREE.Group();
  /** Wege und Vorschau liegen in diesem Teil (in y überhöht wie das Gelände); Brücken stehen unskaliert daneben. */
  private flach = new THREE.Group();
  private bruecken = new THREE.Group();
  private brueckenMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 });
  /** Fluss- und Bachstücke im Raster (Zelle 64 m) zum schnellen Schneiden mit den Wegen. */
  private flussRaster = new Map<string, { ax: number; az: number; bx: number; bz: number; breite: number }[]>();
  private ex = 1;
  /** Optional: Bäume entlang neuer Wege entfernen (Trees.lichtePunkte). */
  wald: { lichtePunkte(p: { x: number; z: number }[], radius: number): number } | null = null;
  private gelichtet = new Set<string>();
  private wege: THREE.Mesh;
  private vorschau: THREE.Mesh;
  private vor = vorschauMaterial();
  private fest: THREE.Mesh;
  private festMat = vorschauMaterial(true);
  private sig = '';
  private vorSig = '';
  private festSig = '';

  constructor(private map: MapData, private grid: HexGrid, private base: number, ex: number) {
    this.wege = new THREE.Mesh(new THREE.BufferGeometry(), erdMaterial());
    this.wege.receiveShadow = true;
    this.wege.renderOrder = 2;
    this.wege.frustumCulled = false;
    this.vorschau = new THREE.Mesh(new THREE.BufferGeometry(), this.vor.mat);
    this.vorschau.renderOrder = 4;
    this.vorschau.visible = false;
    this.vorschau.frustumCulled = false;
    this.fest = new THREE.Mesh(new THREE.BufferGeometry(), this.festMat.mat);
    this.fest.renderOrder = 5;
    this.fest.visible = false;
    this.fest.frustumCulled = false;
    this.flach.add(this.wege, this.vorschau, this.fest);
    this.group.add(this.flach, this.bruecken);
    for (const r of map.rivers) {
      const breite = Math.max(r.w, GEWAESSER_BREITE[r.k] ?? 4);
      for (let i = 0; i + 5 < r.p.length; i += 3) {
        const st = { ax: r.p[i], az: r.p[i + 1], bx: r.p[i + 3], bz: r.p[i + 4], breite };
        const zellen = new Set<string>();
        for (const [x, z] of [[st.ax, st.az], [st.bx, st.bz], [(st.ax + st.bx) / 2, (st.az + st.bz) / 2]]) zellen.add(`${Math.floor(x / 64)},${Math.floor(z / 64)}`);
        for (const k of zellen) (this.flussRaster.get(k) ?? this.flussRaster.set(k, []).get(k)!).push(st);
      }
    }
    this.setExaggeration(ex);
  }

  setExaggeration(ex: number) {
    this.flach.scale.y = ex;
    if (ex !== this.ex) { this.ex = ex; this.sig = ''; }
  }

  /** Wo schneidet die Weglinie einen Fluss oder Bach? Je Kreuzung Mitte, Richtung des Wegs und Breite des Gewässers. */
  private kreuzungen(linie: { x: number; z: number }[]): { x: number; z: number; yaw: number; breite: number }[] {
    const aus: { x: number; z: number; yaw: number; breite: number }[] = [];
    for (let i = 0; i + 1 < linie.length; i++) {
      const p = linie[i], q = linie[i + 1];
      const k = `${Math.floor((p.x + q.x) / 2 / 64)},${Math.floor((p.z + q.z) / 2 / 64)}`;
      for (const f of this.flussRaster.get(k) ?? []) {
        // Schnitt zweier Strecken p–q und a–b
        const rx = q.x - p.x, rz = q.z - p.z, sx = f.bx - f.ax, sz = f.bz - f.az;
        const d = rx * sz - rz * sx;
        if (Math.abs(d) < 1e-6) continue;
        const t = ((f.ax - p.x) * sz - (f.az - p.z) * sx) / d, u = ((f.ax - p.x) * rz - (f.az - p.z) * rx) / d;
        if (t < 0 || t > 1 || u < 0 || u > 1) continue;
        const x = p.x + rx * t, z = p.z + rz * t;
        if (aus.some((a) => Math.hypot(a.x - x, a.z - z) < 20)) continue;
        aus.push({ x, z, yaw: Math.atan2(-rz, rx), breite: f.breite });
      }
    }
    return aus;
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
      sig += `${s.id}:${p.length}:${p[0]?.q},${p[0]?.r},${p[p.length - 1]?.q},${p[p.length - 1]?.r}:${s.verkehr >> 5}:${s.bruecken ?? 0};`;
    }
    if (sig === this.sig) return;
    this.sig = sig;
    const b = neuerPuffer();
    const enden = new Set<string>();
    const bruecken: THREE.BufferGeometry[] = [];
    for (const s of sicht.segmente) {
      if (s.pfad.length < 2) continue;
      const halb = (WEG_BREITE[0] + (WEG_BREITE[1] - WEG_BREITE[0]) * Math.min(1, s.verkehr / 255)) / 2;
      const linie = mittellinie(this.punkte(s.pfad));
      band(b, linie, halb, this.yOf);
      // Brücke, wo der Weg einen Fluss oder Bach kreuzt: Deck über dem höheren Ufer; fehlt sie noch (Simulation), nur die Baustelle
      for (const k of this.kreuzungen(linie)) {
        const laenge = k.breite + 16, cx = Math.cos(k.yaw), cz = -Math.sin(k.yaw);
        const ufer = Math.max(this.map.heightAt(k.x + cx * laenge / 2, k.z + cz * laenge / 2), this.map.heightAt(k.x - cx * laenge / 2, k.z - cz * laenge / 2));
        const g = brueckeGeometrie(laenge, halb * 2 + 1.5, !s.bruecken).rotateY(k.yaw).translate(k.x, (ufer - this.base) * this.ex + 0.8, k.z);
        bruecken.push(g);
      }
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
    for (const m of this.bruecken.children as THREE.Mesh[]) m.geometry.dispose();
    this.bruecken.clear();
    if (bruecken.length) {
      const m = new THREE.Mesh(mergeGeometries(bruecken)!, this.brueckenMat);
      m.castShadow = m.receiveShadow = true;
      this.bruecken.add(m);
    }
    this.anzahlBruecken = bruecken.length;
    this.anzahlBaustellen = sicht.segmente.reduce((n, s) => n + (s.bruecken ?? 0), 0);
  }

  /** Zahl der Brücken (Prüfskripte, Tests). */
  anzahlBruecken = 0;
  /** Fehlende Brücken laut Simulation (Prüfskripte). */
  anzahlBaustellen = 0;

  /**
   * Vorschau beim Wegbau: `pfad` ist das vorläufige Stück (gestrichelt, rot wenn ungültig), `fest` das schon gelegte Stück
   * des offenen Wegs (durchgezogen, kräftiger). Je null (oder unter 2 Hexen) blendet aus.
   */
  zeigeVorschau(pfad: { q: number; r: number }[] | null, gueltig: boolean, fest: { q: number; r: number }[] | null = null) {
    this.zeichne(this.fest, this.festMat, fest, true, 'festSig', 4.6, 1.1);
    this.zeichne(this.vorschau, this.vor, pfad, gueltig, 'vorSig', 4.2, 0.9);
  }

  private zeichne(mesh: THREE.Mesh, m: { farbe: { value: THREE.Color } }, pfad: { q: number; r: number }[] | null, gueltig: boolean,
    sigName: 'vorSig' | 'festSig', halb: number, lift: number) {
    if (!pfad || pfad.length < 2) {
      mesh.visible = false;
      this[sigName] = '';
      return;
    }
    if (!gueltig) m.farbe.value.set('#e0392b');
    else m.farbe.value.set(mesh === this.fest ? '#ffcf5a' : '#fff2c4');
    const sig = pfad.map((h) => `${h.q},${h.r}`).join(';') + (gueltig ? '+' : '-') + this.map.groundRev;
    mesh.visible = true;
    if (sig === this[sigName]) return;
    this[sigName] = sig;
    const b = neuerPuffer();
    band(b, mittellinie(this.punkte(pfad)), halb, (x, z) => this.map.heightAt(x, z) - this.base + lift);
    mesh.geometry.dispose();
    mesh.geometry = geometrie(b);
  }
}
