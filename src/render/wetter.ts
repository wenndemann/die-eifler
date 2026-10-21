// Wetter-Optik (Drehbuch 7.4, ROADMAP M12): Regen und Schneefall um den Blickpunkt, ziehende Wolkenschatten, Talnebel in den Tälern,
// Hochwasser in der Aue. Nur Darstellung; liest die Sicht (Wetter, Jahreszeit), Zahlen aus data/optik.json.
// Regen und Schnee sind ein einziger Zeichenaufruf je Art: die Tropfen hängen fest in der Welt und laufen im Shader durch eine Kiste
// um den Blickpunkt (kein Springen beim Schwenken). Wolken werfen nur Schatten (Ebene WOLKEN_EBENE, die die Kamera nicht zeichnet).
import * as THREE from 'three';
import optik from '../../data/optik.json';
import { FLAG } from '../welt/format';
import type { MapData } from '../map/mapdata';
import type { HexGrid } from '../map/hex';

/** Ebene der Wolkenschatten: nur die Schattenkamera der Sonne sieht sie. */
export const WOLKEN_EBENE = 3;

/** Wetterlage für die Optik, jede Stärke 0..1 (weich ein- und ausgeblendet). */
export interface WetterLage {
  regen: number;
  schnee: number;
  nebel: number;
  wind: number;
  hochwasser: number;
  wolken: number;
}

const ZUFALL = (i: number) => { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

const NIEDER_VERT = /* glsl */ `
attribute vec3 aOff;
attribute float aEnde;
uniform vec3 uMitte; uniform vec3 uKiste; uniform float uZeit; uniform float uFall; uniform float uLaenge; uniform vec2 uWind;
uniform float uPunkt; uniform float uSchwanken;
varying float vSicht;
void main() {
  vec3 k = uKiste;
  vec3 ecke = uMitte - vec3(k.x * 0.5, k.y * 0.35, k.z * 0.5);
  // fest in der Welt, Wind treibt seitwärts, Fall nach unten; die Kiste wandert mit dem Blickpunkt (mod)
  float y = mod(aOff.y * k.y - uZeit * uFall, k.y);
  float sx = uSchwanken * sin(uZeit * 0.9 + aOff.y * 40.0);
  float x = mod(aOff.x * 4000.0 + uWind.x * uZeit + sx - ecke.x, k.x);
  float z = mod(aOff.z * 4000.0 + uWind.y * uZeit - ecke.z, k.z);
  vec3 p = ecke + vec3(x, y, z);
  // Strich: das obere Ende liegt gegen die Fallrichtung
  p -= aEnde * vec3(uWind.x, -uFall, uWind.y) * uLaenge;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = uPunkt * 900.0 / max(-mv.z, 1.0);
  // am Rand der Kiste ausblenden
  vec3 r = abs(vec3(x / k.x, y / k.y, z / k.z) * 2.0 - 1.0);
  vSicht = 1.0 - smoothstep(0.7, 1.0, max(max(r.x, r.z), r.y));
}`;
const REGEN_FRAG = /* glsl */ `
uniform float uStaerke; varying float vSicht;
void main() { gl_FragColor = vec4(0.78, 0.84, 0.92, 0.38 * uStaerke * vSicht); }`;
const SCHNEE_FRAG = /* glsl */ `
uniform float uStaerke; varying float vSicht;
void main() {
  vec2 d = gl_PointCoord - 0.5;
  float a = 1.0 - smoothstep(0.25, 0.5, length(d));
  gl_FragColor = vec4(1.0, 1.0, 1.0, a * 0.8 * uStaerke * vSicht);
}`;

const NEBEL_VERT = /* glsl */ `
varying vec2 vUv; varying vec3 vWelt;
void main() {
  vUv = uv;
  vec4 w = modelMatrix * instanceMatrix * vec4(position, 1.0);
  vWelt = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;
const NEBEL_FRAG = /* glsl */ `
uniform float uStaerke; uniform float uZeit; uniform vec3 uFarbe; uniform float uDeck;
varying vec2 vUv; varying vec3 vWelt;
float h(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float rauschen(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y);
}
void main() {
  float r = length(vUv - 0.5) * 2.0;
  float rand = 1.0 - smoothstep(0.35, 1.0, r);
  vec2 p = vWelt.xz / 160.0 + vec2(uZeit * 0.03, uZeit * 0.017);
  float n = 0.55 * rauschen(p) + 0.3 * rauschen(p * 2.3 + 7.0) + 0.15 * rauschen(p * 5.1 - 3.0);
  float a = rand * smoothstep(0.25, 0.75, n) * uStaerke * uDeck;
  if (a < 0.003) discard;
  gl_FragColor = vec4(uFarbe, a);
}`;

/** Weich auf `ziel` zugehen (Sekunden bis fast ganz). */
function naehere(ist: number, ziel: number, dt: number, sek: number): number {
  const f = 1 - Math.exp(-dt * 3 / sek);
  return ist + (ziel - ist) * f;
}

export class WetterOptik {
  readonly group = new THREE.Group();
  private regen: THREE.LineSegments<THREE.BufferGeometry, THREE.ShaderMaterial>;
  private schnee: THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>;
  private wolken: THREE.InstancedMesh;
  private nebel: THREE.InstancedMesh<THREE.PlaneGeometry, THREE.ShaderMaterial> | null = null;
  private flut: THREE.InstancedMesh<THREE.PlaneGeometry, THREE.ShaderMaterial> | null = null;
  private zeit = 0;
  private ist: WetterLage = { regen: 0, schnee: 0, nebel: 0, wind: 0, hochwasser: 0, wolken: 0 };
  private wolkenPos: { x: number; z: number; s: number; d: number }[] = [];
  private wolkenY = 0;
  private wolkenFeld = { x: 0, z: 0, b: 1 };
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private v = new THREE.Vector3();
  private sk = new THREE.Vector3();
  private grob = false;

  constructor(private map: MapData, private grid: HexGrid, private base: number, private ex: number) {
    this.regen = this.niederschlag(optik.regen.tropfen, true) as THREE.LineSegments<THREE.BufferGeometry, THREE.ShaderMaterial>;
    this.schnee = this.niederschlag(optik.schnee.flocken, false) as THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>;
    this.group.add(this.regen, this.schnee);

    // Wolkenschatten: abgeflachte Klumpen aus ein paar Kugeln, nur in der Schattenebene
    const teile: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 5; i++) {
      const g = new THREE.SphereGeometry(0.35 + ZUFALL(i) * 0.25, 10, 6);
      g.translate((ZUFALL(i + 9) - 0.5) * 0.9, 0, (ZUFALL(i + 21) - 0.5) * 0.6);
      teile.push(g);
    }
    const wg = mergeKugeln(teile);
    wg.scale(1, 0.18, 1);
    this.wolken = new THREE.InstancedMesh(wg, new THREE.MeshBasicMaterial({ color: '#ffffff' }), optik.wolken.regen);
    this.wolken.castShadow = true;
    this.wolken.receiveShadow = false;
    this.wolken.frustumCulled = false;
    this.wolken.layers.set(WOLKEN_EBENE);
    this.wolken.count = 0;
    this.group.add(this.wolken);
    this.wolkenAnlegen();
    this.taeler();
  }

  setExaggeration(ex: number) { this.ex = ex; this.taeler(); this.wolkenAnlegen(); }
  /** Auf „Niedrig“ ein Drittel der Tropfen und Flocken. */
  setGrob(grob: boolean) { this.grob = grob; }

  private niederschlag(n: number, striche: boolean): THREE.Object3D {
    const geo = new THREE.BufferGeometry();
    const je = striche ? 2 : 1;
    const off = new Float32Array(n * je * 3), ende = new Float32Array(n * je);
    for (let i = 0; i < n; i++) {
      const a = ZUFALL(i * 3 + 1), b = ZUFALL(i * 3 + 2), c = ZUFALL(i * 3 + 3);
      for (let e = 0; e < je; e++) { off.set([a, b, c], (i * je + e) * 3); ende[i * je + e] = e; }
    }
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * je * 3), 3));
    geo.setAttribute('aOff', new THREE.BufferAttribute(off, 3));
    geo.setAttribute('aEnde', new THREE.BufferAttribute(ende, 1));
    const mat = new THREE.ShaderMaterial({
      vertexShader: NIEDER_VERT, fragmentShader: striche ? REGEN_FRAG : SCHNEE_FRAG, transparent: true, depthWrite: false, fog: false,
      uniforms: {
        uMitte: { value: new THREE.Vector3() }, uKiste: { value: new THREE.Vector3(1000, 600, 1000) }, uZeit: { value: 0 },
        uFall: { value: striche ? optik.regen.fall_ms : optik.schnee.fall_ms }, uLaenge: { value: 0 }, uWind: { value: new THREE.Vector2() },
        uPunkt: { value: striche ? 0 : 1 }, uSchwanken: { value: striche ? 0 : 6 }, uStaerke: { value: 0 },
      },
    });
    const o = striche ? new THREE.LineSegments(geo, mat) : new THREE.Points(geo, mat);
    o.frustumCulled = false;
    o.visible = false;
    o.renderOrder = 5;
    return o;
  }

  /** Wolken liegen in einem Feld etwas größer als das Spielfeld, über dem höchsten Punkt. */
  private wolkenAnlegen(): void {
    const f = this.grid.feld, mitte = this.grid.toWorld({ q: f.q, r: f.r });
    let top = -Infinity;
    for (let i = 0; i < f.height.length; i++) top = Math.max(top, f.height[i] / 10);
    this.wolkenY = (top - this.base) * this.ex + optik.wolken.hoehe_m;
    const b = (f.n * 2 + 8) * this.grid.size * 1.8;
    this.wolkenFeld = { x: mitte.x - b / 2, z: mitte.z - b / 2, b };
    const [g0, g1] = optik.wolken.groesse_m;
    this.wolkenPos = [];
    for (let i = 0; i < optik.wolken.regen; i++) {
      this.wolkenPos.push({ x: ZUFALL(i * 7 + 2) * b, z: ZUFALL(i * 7 + 5) * b, s: g0 + (g1 - g0) * ZUFALL(i * 7 + 3), d: ZUFALL(i * 7 + 4) * Math.PI });
    }
  }

  /** Talnebel- und Aue-Scheiben aus dem Spielfeld (Tal wie die Simulation: tal_dm tiefer als der Schnitt im Umkreis 4). */
  private taeler(): void {
    for (const x of [this.nebel, this.flut]) if (x) { this.group.remove(x); x.geometry.dispose(); x.material.dispose(); }
    const f = this.grid.feld, n = f.terrain.length;
    const qs = new Int32Array(n), rs = new Int32Array(n);
    let i = 0;
    for (let dr = -f.n; dr <= f.n; dr++) for (let dq = Math.max(-f.n, -dr - f.n); dq <= Math.min(f.n, -dr + f.n); dq++, i++) { qs[i] = f.q + dq; rs[i] = f.r + dr; }
    const tal: number[] = [], aue: number[] = [];
    const nass = (x: number) => f.terrain[x] === 0 || (f.flags[x] & (FLAG.fluss | FLAG.ufer)) !== 0;
    for (let h = 0; h < n; h++) {
      if (f.terrain[h] === 0) continue;
      let sum = 0, z = 0;
      for (let dr = -4; dr <= 4; dr++) for (let dq = Math.max(-4, -dr - 4); dq <= Math.min(4, -dr + 4); dq++) {
        const x = f.index(qs[h] + dq, rs[h] + dr);
        if (x >= 0 && f.terrain[x] !== 0) { sum += f.height[x]; z++; }
      }
      if (z > 0 && sum / z - f.height[h] >= optik.talnebel.tal_dm) tal.push(h);
      if (nass(h)) { aue.push(h); continue; }
      for (const [a, b] of [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]]) {
        const x = f.index(qs[h] + a, rs[h] + b);
        if (x >= 0 && nass(x) && f.height[h] <= f.height[x] + 30) { aue.push(h); break; }
      }
    }
    // Hochwasser: der Wasserspiegel steht 3,5 m über dem tiefsten Nachbarn (Bach oder Fluss), nicht über der Hex-Mitte
    const pegel = (h: number) => {
      let lo = f.height[h];
      for (const [a, b] of [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]]) {
        const x = f.index(qs[h] + a, rs[h] + b);
        if (x >= 0) lo = Math.min(lo, f.height[x]);
      }
      return lo / 10 + 3.5;
    };
    const scheiben = (liste: number[], farbe: string, gross: number, ueber: number, deck: number, hoehe?: (h: number) => number) => {
      const geo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
      const mat = new THREE.ShaderMaterial({
        vertexShader: NEBEL_VERT, fragmentShader: NEBEL_FRAG, transparent: true, depthWrite: false, fog: false,
        uniforms: { uStaerke: { value: 0 }, uZeit: { value: 0 }, uFarbe: { value: new THREE.Color(farbe) }, uDeck: { value: deck } },
      });
      const im = new THREE.InstancedMesh(geo, mat, Math.max(1, liste.length));
      im.count = liste.length;
      liste.forEach((h, k) => {
        const w = this.grid.toWorld({ q: qs[h], r: rs[h] });
        const y = hoehe ? (hoehe(h) - this.base) * this.ex : (this.map.heightAt(w.x, w.z) - this.base) * this.ex + ueber * this.ex * (0.7 + 0.6 * ZUFALL(k));
        const s = this.grid.size * gross * (0.85 + 0.4 * ZUFALL(k + 50));
        this.m.compose(this.v.set(w.x, y, w.z), this.q.setFromAxisAngle(this.v.clone().set(0, 1, 0), ZUFALL(k + 99) * 6.28), this.sk.set(s, 1, s));
        im.setMatrixAt(k, this.m);
      });
      im.frustumCulled = false;
      im.visible = false;
      im.renderOrder = 4;
      this.group.add(im);
      return im;
    };
    this.nebel = scheiben(tal, '#e4e9ec', 3.4, 14, optik.talnebel.dichte);
    this.flut = scheiben(aue, '#8c7d58', 2.4, 0, 0.9, pegel);
  }

  /** Ein Bild: Wetterlage weich annähern, Kiste um den Blickpunkt, Wolken ziehen lassen. */
  update(ziel: WetterLage, mitte: THREE.Vector3, abstand: number, dt: number, sofort = false): void {
    this.zeit += dt;
    const ist = this.ist;
    if (sofort) Object.assign(ist, ziel);
    ist.regen = naehere(ist.regen, ziel.regen, dt, 6);
    ist.schnee = naehere(ist.schnee, ziel.schnee, dt, 8);
    ist.nebel = naehere(ist.nebel, ziel.nebel, dt, 12);
    ist.wind = naehere(ist.wind, ziel.wind, dt, 5);
    ist.hochwasser = naehere(ist.hochwasser, ziel.hochwasser, dt, 15);
    ist.wolken = naehere(ist.wolken, ziel.wolken, dt, 10);

    // Niederschlag: Kiste wächst mit dem Kameraabstand, Strichlänge und Flockengröße mit
    const k = Math.min(Math.max(abstand, 250), 5000);
    const wind = new THREE.Vector2(0.7, 0.3).multiplyScalar(2 + ist.wind * 14);
    const gy = (this.map.heightAt(mitte.x, mitte.z) - this.base) * this.ex;
    for (const [o, staerke, lang] of [[this.regen, ist.regen, optik.regen.laenge * k / 26], [this.schnee, ist.schnee, 0]] as const) {
      o.visible = staerke > 0.01;
      if (!o.visible) continue;
      const u = o.material.uniforms;
      u.uMitte.value.set(mitte.x, gy + k * 0.25, mitte.z);
      u.uKiste.value.set(k * 1.6, k * 0.9, k * 1.6);
      u.uZeit.value = this.zeit;
      u.uWind.value.copy(wind).multiplyScalar(o === this.schnee ? 0.5 : 1);
      u.uLaenge.value = lang;
      u.uFall.value = (o === this.regen ? optik.regen.fall_ms : optik.schnee.fall_ms) * Math.max(1, k / 600);
      u.uPunkt.value = o === this.schnee ? k / 160 : 0;
      u.uStaerke.value = Math.min(1, staerke * 1.2);
      const n = o === this.regen ? optik.regen.tropfen : optik.schnee.flocken;
      o.geometry.setDrawRange(0, Math.ceil(n * staerke * (this.grob ? 0.34 : 1)) * (o === this.regen ? 2 : 1));
    }

    // Wolkenschatten ziehen mit dem Wind
    const zahl = Math.round(optik.wolken.sonne + (optik.wolken.regen - optik.wolken.sonne) * ist.wolken);
    this.wolken.count = zahl;
    const fw = this.wolkenFeld, zug = optik.wolken.zug_ms * (1 + ist.wind * 2) * this.zeit;
    for (let i = 0; i < zahl; i++) {
      const w = this.wolkenPos[i];
      const x = fw.x + mod(w.x + zug * 0.9, fw.b), z = fw.z + mod(w.z + zug * 0.4, fw.b);
      this.q.setFromAxisAngle(this.v.set(0, 1, 0), w.d);
      this.m.compose(this.v.set(x, this.wolkenY, z), this.q, this.sk.set(w.s, w.s, w.s * 0.7));
      this.wolken.setMatrixAt(i, this.m);
    }
    this.wolken.instanceMatrix.needsUpdate = true;

    for (const [im, s] of [[this.nebel, ist.nebel], [this.flut, ist.hochwasser]] as const) {
      if (!im) continue;
      im.visible = s > 0.01 && im.count > 0;
      im.material.uniforms.uStaerke.value = Math.min(1, s);
      im.material.uniforms.uZeit.value = this.zeit;
    }
  }

  /** Für Tests und den Smoke: Zahl der Talnebel- und Aue-Scheiben. */
  zahlen(): { tal: number; aue: number } { return { tal: this.nebel?.count ?? 0, aue: this.flut?.count ?? 0 }; }

  /** Für Tests und den Smoke: die aktuelle (weich angenäherte) Lage. */
  lage(): Readonly<WetterLage> { return this.ist; }
}

function mod(a: number, b: number) { return ((a % b) + b) % b; }

function mergeKugeln(g: THREE.BufferGeometry[]): THREE.BufferGeometry {
  // nur Positionen und Normalen nötig (Schattenwurf)
  const pos: number[] = [], idx: number[] = [];
  let basis = 0;
  for (const x of g) {
    const p = x.getAttribute('position'), ix = x.getIndex()!;
    for (let i = 0; i < p.count; i++) pos.push(p.getX(i), p.getY(i), p.getZ(i));
    for (let i = 0; i < ix.count; i++) idx.push(ix.getX(i) + basis);
    basis += p.count;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}
