// Lebendige Eifel (ROADMAP M15, aus M9): Überall bewegt sich etwas, und man sieht, was ein Gebäude tut. Rauch und Dampf aus Schornsteinen
// (Herdfeuer immer ein wenig, Werkstätten nur bei der Arbeit, im Winter mehr), Wasserräder und Säge laufen nur, wenn gearbeitet wird,
// der Schmied hämmert mit Funken, Schafe und Kühe grasen und ziehen umher, Hühner picken, Bienen schwärmen, Vogelschwärme kreisen über
// den Feldern, Wäsche flattert im Wind, Kinder toben über den Kirmesplatz, vor der Schänke wird geschwätzt, nachts leuchten die Fenster,
// beim Tusch regnet es Konfetti, beim Martinsfeuer fliegen Funken. Reiner Leser der Sicht; alle Teile als Instanzen bzw. Punktwolken,
// nur bis LEBEN.fern_m von der Kamera. Werte in data/leben.json, Anker aus den Gebäudemodellen (lebenAnker in gebaeude.ts).
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import leben from '../../data/leben.json';
import { GEBAEUDE, KLEINE_FESTE } from '../sim/daten';
import type { SichtGebaeude, SimSicht } from '../sim/typen';
import { PROMILLE } from '../sim/typen';
import { lebenAnker, radGeometrie } from './gebaeude';
import { Instanzen } from './instanzen';
import { Kontaktschatten } from './kontakt';
import { fernFaktor, TRAEGER_H, WARE_M } from './massstab';
import { paint, weicheKiste, type Anker } from './mockup';
import { FIGUR_ATTRIBUTE, GESTE, figur, material, type Tracht } from './traeger';
import { warenGeometrie } from './waren';

/** Lage eines Gebäudemodells (Modell-Nullpunkt und Skala), siehe Gebaeude.modellLage. */
export type ModellLage = (id: number, typ: string) => { x: number; y: number; z: number; sk: number } | null;

/** Was die Darstellung außer der Sicht braucht: Tageszeit (0 Mitternacht … 0.5 Mittag), Wind und Regen (0..1), Jahreszeit. */
export interface LebenLage { tag: number; wind: number; regen: number; jahreszeit: number }

// ---------------------------------------------------------------- Teilchen (Rauch, Dampf, Funken, Glühen, Bienen)

const TEIL_VERT = /* glsl */ `
attribute float aGroesse; attribute float aAlpha; attribute vec3 aFarbe;
varying float vAlpha; varying vec3 vFarbe;
uniform float uSkala;
#include <fog_pars_vertex>
void main() {
  vAlpha = aAlpha; vFarbe = aFarbe;
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = aGroesse * uSkala / max(1.0, -mvPosition.z);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;
const TEIL_FRAG = /* glsl */ `
varying float vAlpha; varying vec3 vFarbe;
uniform float uWeich;
#include <fog_pars_fragment>
void main() {
  vec2 p = gl_PointCoord * 2.0 - 1.0;
  float r = dot(p, p);
  if (r > 1.0) discard;
  if (uWeich < 0.5) {
    gl_FragColor = vec4(vFarbe, vAlpha * (1.0 - r));
  } else {
    // Comic-Wölkchen (STIL.md §6b): deckend, oben hell, unten schattig, mit warmbraunem Rand wie die Linie
    float d = sqrt(r);
    float licht = 1.0 + 0.14 * (-p.y) + 0.05 * (-p.x);
    vec3 c = mix(vFarbe * licht, vFarbe * vec3(0.66, 0.58, 0.5), smoothstep(0.86, 0.95, d));
    gl_FragColor = vec4(c, vAlpha * smoothstep(1.0, 0.94, d));
  }
  #include <fog_fragment>
}`;

interface Teil { x: number; y: number; z: number; vx: number; vy: number; vz: number; t: number; dauer: number; g0: number; g1: number; a: number; r: number; g: number; b: number }

/** Punktwolke mit weichen runden Teilchen (normal oder leuchtend addiert). */
class Teilchen {
  readonly punkte: THREE.Points;
  private teile: Teil[] = [];
  private pos: Float32Array; private gr: Float32Array; private al: Float32Array; private fa: Float32Array;
  constructor(group: THREE.Group, private max: number, additiv: boolean) {
    const geo = new THREE.BufferGeometry();
    this.pos = new Float32Array(max * 3); this.gr = new Float32Array(max); this.al = new Float32Array(max); this.fa = new Float32Array(max * 3);
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aGroesse', new THREE.BufferAttribute(this.gr, 1).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aAlpha', new THREE.BufferAttribute(this.al, 1).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aFarbe', new THREE.BufferAttribute(this.fa, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setDrawRange(0, 0);
    const mat = new THREE.ShaderMaterial({
      vertexShader: TEIL_VERT, fragmentShader: TEIL_FRAG, transparent: true, depthWrite: false, fog: true,
      blending: additiv ? THREE.AdditiveBlending : THREE.NormalBlending,
      uniforms: { ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog), uSkala: { value: 800 }, uWeich: { value: additiv ? 0 : 1 } },
    });
    this.punkte = new THREE.Points(geo, mat);
    this.punkte.frustumCulled = false;
    this.punkte.renderOrder = 5;
    group.add(this.punkte);
  }
  get anzahl(): number { return this.teile.length; }
  /** Pixelhöhe des Bildes (Teilchengröße in Metern → Pixel). */
  skala(px: number): void { (this.punkte.material as THREE.ShaderMaterial).uniforms.uSkala.value = px; }
  neu(t: Omit<Teil, 't'>): void { if (this.teile.length < this.max) this.teile.push({ ...t, t: 0 }); }
  /** Bewegen, altern, schreiben; `wind` schiebt (m/s in x und z), `auftrieb` bremst den Fall (Rauch). */
  schritt(dt: number, wx: number, wz: number, schwer: number): void {
    let n = 0;
    for (const p of this.teile) {
      p.t += dt;
      if (p.t >= p.dauer) continue;
      p.vy -= schwer * dt;
      p.x += (p.vx + wx) * dt; p.y += p.vy * dt; p.z += (p.vz + wz) * dt;
      const u = p.t / p.dauer;
      this.pos[n * 3] = p.x; this.pos[n * 3 + 1] = p.y; this.pos[n * 3 + 2] = p.z;
      this.gr[n] = p.g0 + (p.g1 - p.g0) * u;
      this.al[n] = p.a * Math.min(1, u * 6) * (1 - u * u * u);
      this.fa[n * 3] = p.r; this.fa[n * 3 + 1] = p.g; this.fa[n * 3 + 2] = p.b;
      this.teile[n++] = p;
    }
    this.teile.length = n;
    const geo = this.punkte.geometry;
    for (const k of ['position', 'aGroesse', 'aAlpha', 'aFarbe']) (geo.attributes[k] as THREE.BufferAttribute).needsUpdate = true;
    geo.setDrawRange(0, n);
  }
}

// ---------------------------------------------------------------- Geometrien (Modell-Meter, Stil STIL.md: rund, warm, übertrieben)

const k = (w: number, h: number, d: number, x: number, y: number, z: number, f: string, rx = 0, ry = 0, rz = 0) =>
  paint(weicheKiste(w, h, d).rotateX(rx).rotateZ(rz).rotateY(ry).translate(x, y, z), f);
const kugel = (r: number, x: number, y: number, z: number, f: string, sx = 1, sy = 1, sz = 1) =>
  paint(new THREE.SphereGeometry(r, 8, 6).scale(sx, sy, sz).translate(x, y, z), f);

/** Schaf (Blick +x): Wollkörper, dunkler Kopf, Beine. */
function schafGeo(): THREE.BufferGeometry {
  const out = [kugel(1.05, 0, 1.2, 0, '#f4f1e8', 1.3, 0.85, 0.9), kugel(0.5, 0.35, 1.75, 0, '#fbf8f0', 1.4, 0.6, 1), kugel(0.45, 1.35, 1.45, 0, '#2c2620'),
    kugel(0.14, 1.45, 1.75, 0.32, '#2c2620', 1, 0.5, 1.6), kugel(0.14, 1.45, 1.75, -0.32, '#2c2620', 1, 0.5, 1.6)];
  for (const [lx, lz] of [[0.6, 0.4], [-0.6, 0.4], [0.6, -0.4], [-0.6, -0.4]]) out.push(k(0.18, 0.75, 0.18, lx, 0.37, lz, '#2c2620'));
  return mergeGeometries(out)!;
}
/** Kuh (Blick +x): weiß mit Flecken, rosa Maul, Hörnchen. */
function kuhGeo(): THREE.BufferGeometry {
  const out = [k(2.6, 1.3, 1.25, 0, 1.6, 0, '#f4f1e8'), k(1.0, 0.9, 1.28, -0.4, 1.75, 0, '#3a302a'), k(0.7, 0.7, 1.27, 0.7, 1.5, 0.1, '#3a302a'),
    k(0.9, 0.8, 0.75, 1.65, 2.0, 0, '#f4f1e8'), k(0.4, 0.45, 0.65, 2.15, 1.85, 0, '#e8a8a0'),
    paint(new THREE.ConeGeometry(0.1, 0.4, 5).rotateZ(-0.6).translate(1.65, 2.55, 0.3), '#efe6cf'), paint(new THREE.ConeGeometry(0.1, 0.4, 5).rotateZ(-0.6).translate(1.65, 2.55, -0.3), '#efe6cf'),
    k(0.08, 0.9, 0.08, -1.35, 1.4, 0, '#3a302a', 0, 0, 0.3)];
  for (const [lx, lz] of [[0.95, 0.42], [-0.95, 0.42], [0.95, -0.42], [-0.95, -0.42]]) out.push(k(0.25, 1.0, 0.25, lx, 0.5, lz, '#e9e2d4'));
  return mergeGeometries(out)!;
}
/** Huhn (Blick +x, Nullpunkt am Boden), wie der frühere Kleinkram, nur einzeln drehbar. */
function huhnGeo(): THREE.BufferGeometry {
  return mergeGeometries([
    kugel(0.55, 0, 0.7, 0, '#f4efe4', 1.25, 1, 0.9), kugel(0.3, 0.55, 1.25, 0, '#f4efe4'),
    paint(new THREE.ConeGeometry(0.1, 0.25, 5).rotateZ(-Math.PI / 2).translate(0.88, 1.22, 0), '#e8a020'),
    kugel(0.11, 0.55, 1.52, 0, '#d6262a', 1, 1.4, 0.6), paint(new THREE.ConeGeometry(0.3, 0.55, 5).rotateZ(0.9).translate(-0.65, 1.0, 0), '#f4efe4'),
    k(0.08, 0.4, 0.08, 0.1, 0.2, 0.18, '#e8a020'), k(0.08, 0.4, 0.08, 0.1, 0.2, -0.18, '#e8a020'),
  ])!;
}
/** Vogelflügel (vom Körper nach +z), Körper extra. */
const fluegelGeo = () => paint(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-0.5, 0, 0), new THREE.Vector3(0.5, 0, 0), new THREE.Vector3(0, 0, 1.6)]).toNonIndexed(), '#2c2a30');
const vogelKoerper = () => kugel(0.35, 0, 0, 0, '#2c2a30', 1.8, 0.8, 0.8);
/** Wäschestück (hängt an der Leine, Nullpunkt oben in der Mitte). */
const waescheGeo = () => paint(new THREE.PlaneGeometry(1, 1.25).translate(0, -0.62, 0), '#ffffff');
/** Sägeblatt, Schmiedehammer (Drehpunkt am Griffende, Kopf bei −x), Funkenglut. */
const saegeGeo = () => mergeGeometries([k(0.12, 2.6, 2.2, 0, 0, 0, '#cfd3d6'), k(0.16, 2.8, 0.2, 0, 0, 1.15, '#8a6340')])!;
const hammerGeo = () => mergeGeometries([k(1.8, 0.16, 0.16, -0.9, 0, 0, '#8a6340'), k(0.45, 0.7, 0.5, -1.8, 0, 0, '#3a3a3a')])!;
/** Zunftschild: geschmiedeter Arm aus der Wand (nach +z) mit Schnörkel, Drehpunkt der Ware an der Armspitze (0, 0, 2.2). */
const schildArmGeo = () => mergeGeometries([
  k(0.5, 0.9, 0.2, 0, 0, 0.05, '#2b2826'), k(0.12, 0.12, 2.4, 0, 0, 1.15, '#2b2826'), k(0.1, 0.1, 1.6, 0, -0.5, 0.75, '#2b2826', 0.65, 0, 0),
  paint(new THREE.TorusGeometry(0.3, 0.05, 4, 10, 4.5).rotateY(Math.PI / 2).translate(0, 0.3, 1.5), '#2b2826'),
  k(0.06, 0.3, 0.06, 0, -0.15, 2.2, '#2b2826'),
])!;
/** Feuerstoß fürs Martinsfeuer: Holzstoß und Flammen (Flammen als eigene Instanzen, sie flackern). */
const holzstossGeo = () => mergeGeometries(Array.from({ length: 8 }, (_, i) => k(0.4, 4.2, 0.4, Math.cos(i * 0.8) * 0.8, 1.6, Math.sin(i * 0.8) * 0.8, '#6a4426', Math.sin(i * 0.8) * 0.45, 0, -Math.cos(i * 0.8) * 0.45)))!;
const flammeGeo = () => mergeGeometries([
  paint(new THREE.ConeGeometry(1.4, 4.5, 8).translate(0, 2.25, 0), '#ff8a20'), paint(new THREE.ConeGeometry(0.8, 3.2, 7).translate(0.2, 1.9, 0.2), '#ffd040'),
])!;

/** Bockwindmühle: Bock, Mühlenhaus mit Satteldach (Flügel eigens, sie drehen sich um die z-Achse vorn am Haus). */
function muehleGeo(): THREE.BufferGeometry {
  return mergeGeometries([
    k(0.6, 4, 0.6, 0, 2, 0, '#6a4426'), k(3.2, 0.4, 0.4, 0, 0.3, 0, '#6a4426', 0, 0, 0.6), k(3.2, 0.4, 0.4, 0, 0.3, 0, '#6a4426', 0, 0, -0.6),
    k(4.2, 4.4, 3.6, 0, 6.2, 0, '#c9a46a'), k(4.6, 0.3, 4.0, 0, 4.0, 0, '#6a4426'),
    paint(new THREE.ConeGeometry(3.4, 2.6, 4).rotateY(Math.PI / 4).scale(1, 1, 0.85).translate(0, 9.7, 0), '#8f3b2b'),
    k(1.0, 1.6, 0.2, 0, 5.4, 1.85, '#5a3b26'), k(0.5, 0.5, 1.2, 0, 7.6, 2.2, '#4a3220'),
  ])!;
}
/** Vier Flügel mit Gitter (Mitte im Ursprung, drehen um z). */
function fluegelMuehleGeo(): THREE.BufferGeometry {
  const teile: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2;
    const arm = [k(0.25, 7.5, 0.18, 0, 3.75, 0, '#6a4426'), k(1.5, 6, 0.08, 0.85, 4.4, 0, '#efe6d0')];
    for (let j = 0; j < 5; j++) arm.push(k(1.7, 0.1, 0.12, 0.8, 1.8 + j * 1.25, 0.06, '#6a4426'));
    for (const g of arm) teile.push(g.rotateZ(a));
  }
  teile.push(kugel(0.45, 0, 0, 0, '#4a3220'));
  return mergeGeometries(teile)!;
}
/** Hofhund (Blick +x): braun, Schlappohren, Schwanz. */
function hundGeo(): THREE.BufferGeometry {
  const out = [kugel(0.55, 0, 0.95, 0, '#8a5a30', 1.5, 0.85, 0.8), kugel(0.42, 0.95, 1.35, 0, '#8a5a30'), kugel(0.2, 1.35, 1.25, 0, '#6a4020', 1.2, 0.8, 0.8),
    kugel(0.09, 1.55, 1.3, 0, '#1a1410'), kugel(0.2, 0.9, 1.3, 0.38, '#6a4020', 0.6, 1.4, 0.5), kugel(0.2, 0.9, 1.3, -0.38, '#6a4020', 0.6, 1.4, 0.5),
    k(0.12, 0.8, 0.12, -0.85, 1.25, 0, '#8a5a30', 0, 0, 0.9)];
  for (const [lx, lz] of [[0.45, 0.25], [-0.45, 0.25], [0.45, -0.25], [-0.45, -0.25]]) out.push(k(0.16, 0.65, 0.16, lx, 0.32, lz, '#7a4a28'));
  return mergeGeometries(out)!;
}

const FARBE_RAUCH = new THREE.Color('#f4f1ea'), FARBE_RAUCH_DUNKEL = new THREE.Color('#8c8478'), FARBE_DAMPF = new THREE.Color('#f8f8f6');
const FARBE_FUNKE = new THREE.Color('#ffb040'), FARBE_GLUT = new THREE.Color('#ff7a1a'), FARBE_BIENE = new THREE.Color('#f2c230');
const KONFETTI = ['#c8402e', '#f2c230', '#2f6db5', '#3c9a46', '#f4ead8', '#d860a8'].map((c) => new THREE.Color(c));
const WAESCHE = ['#e05a5a', '#f4f1e8', '#5a8ad0', '#f0c040', '#7ab06a'].map((c) => new THREE.Color(c));
const KIND = ['#e05a5a', '#5a8ad0', '#f0c040', '#7ab06a'].map((c) => new THREE.Color(c));
const SCHWAETZER = ['#3f6fb5', '#8a4a32', '#4f8a4a'].map((c) => new THREE.Color(c));
const HUHN_BRAUN = new THREE.Color('#d0905a');
const WEISS = new THREE.Color(1, 1, 1);

/** Weicher runder Lichtschein (Mitte hell, außen durchsichtig) für Fenster in der Nacht. */
function scheinTextur(): THREE.Texture {
  const n = 64, c = document.createElement('canvas');
  c.width = c.height = n;
  const g = c.getContext('2d')!;
  const v = g.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 2);
  v.addColorStop(0, 'rgba(255,255,255,0.8)'); v.addColorStop(0.3, 'rgba(255,255,255,0.3)'); v.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = v; g.fillRect(0, 0, n, n);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Kleiner Hash 0..1 aus zwei Zahlen (fest je Gebäude und Anker). */
const h01 = (a: number, b: number) => { const x = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return x - Math.floor(x); };
/** Werkstätten, deren Rauch nur bei der Arbeit steigt (Herdfeuer in Häusern brennt immer ein wenig). */
/** Zustände ohne Meister vor der Tür (nicht besetzt, im Bau, abgeschnitten). */
const OHNE_MEISTER = new Set(['baustelle', 'wartet_material', 'kein_arbeiter', 'getrennt', 'kein_planierer', 'planieren', 'kein_bauarbeiter']);
const HERD = new Set(['wohnhaus', 'lager', 'schaenke', 'huette', 'kueche', 'junggesellen', 'eifelfonds', 'abtei', 'polizeiwache']);

export class LebenDarstellung {
  readonly group = new THREE.Group();
  kamera: THREE.Camera | null = null;
  /** Wie viele Teile zuletzt gezeichnet wurden (für die Leistungsanzeige und die Bildstrecke). */
  zahlen = { rauch: 0, funken: 0, tiere: 0, figuren: 0, fenster: 0, konfetti: 0, voegel: 0 };
  private rauch: Teilchen;
  private glut: Teilchen;
  private schafe: Instanzen; private kuehe: Instanzen; private huehner: Instanzen;
  private fluegelL: Instanzen; private fluegelR: Instanzen; private voegel: Instanzen;
  private waesche: Instanzen; private raeder: Instanzen; private saegen: Instanzen; private haemmer: Instanzen;
  private figuren: Instanzen; private fenster: Instanzen; private schein: Instanzen; private konfetti: Instanzen; private holz: Instanzen; private flammen: Instanzen;
  private muehlen: Instanzen; private muehlenFluegel: Instanzen; private hunde: Instanzen; private lampen: Instanzen;
  private schildArme: Instanzen;
  private kontakt: Kontaktschatten;
  /** Meister vor arbeitenden Gebäuden, je Tracht ein Satz (erst angelegt, wenn gebraucht). */
  private meisterSaetze = new Map<string, Instanzen>();
  private figurMat = material();
  /** Zunftschild-Waren je Warenart (erst angelegt, wenn ein Gebäude sie zeigt). */
  private schildWaren = new Map<number, Instanzen>();
  private mat: THREE.MeshStandardMaterial;
  private zeit = 0;
  /** Teilchen-Takt je Anker (Schlüssel Gebäude-Id und Anker-Index). */
  private takt = new Map<string, number>();
  private konfettiTeile: { x: number; y: number; z: number; vx: number; vy: number; vz: number; t: number; dauer: number; rot: number; c: number }[] = [];
  private gemeldet = 0;
  private m = new THREE.Matrix4(); private q = new THREE.Quaternion(); private q2 = new THREE.Quaternion();
  private p = new THREE.Vector3(); private s = new THREE.Vector3(); private s2 = new THREE.Vector3(); private c = new THREE.Color();
  private X = new THREE.Vector3(1, 0, 0); private Y = new THREE.Vector3(0, 1, 0); private Z = new THREE.Vector3(0, 0, 1);

  constructor(private map: { heightAt(x: number, z: number): number }, private base: number, private ex: number, private lage: ModellLage) {
    const mat = this.mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 });
    const doppelt = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, side: THREE.DoubleSide });
    this.rauch = new Teilchen(this.group, leben.rauch.max, false);
    this.glut = new Teilchen(this.group, 900, true);
    this.schafe = new Instanzen(this.group, schafGeo(), mat, false, true, [], 32);
    this.kuehe = new Instanzen(this.group, kuhGeo(), mat, false, true, [], 16);
    this.huehner = new Instanzen(this.group, huhnGeo(), mat, true, true, [], 64);
    this.fluegelL = new Instanzen(this.group, fluegelGeo(), doppelt, false, false, [], 32);
    this.fluegelR = new Instanzen(this.group, fluegelGeo(), doppelt, false, false, [], 32);
    this.voegel = new Instanzen(this.group, vogelKoerper(), mat, false, false, [], 32);
    this.waesche = new Instanzen(this.group, waescheGeo(), doppelt, true, true, [], 64);
    this.raeder = new Instanzen(this.group, mergeGeometries(radGeometrie(1, 0.6).map((g) => g))!, mat, false, true, [], 16);
    this.saegen = new Instanzen(this.group, saegeGeo(), mat, false, true, [], 8);
    this.haemmer = new Instanzen(this.group, hammerGeo(), mat, false, true, [], 8);
    this.figuren = new Instanzen(this.group, figur(), material(), true, true, FIGUR_ATTRIBUTE, 32);
    this.fenster = new Instanzen(this.group, new THREE.PlaneGeometry(1, 1.15), new THREE.MeshBasicMaterial({ color: '#ffffff', fog: true, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }), true, false, [], 256);
    this.schein = new Instanzen(this.group, new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({
      map: scheinTextur(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: true,
    }), true, false, [], 256);
    this.schein.mesh.renderOrder = 6;
    this.konfetti = new Instanzen(this.group, new THREE.PlaneGeometry(0.7, 0.45), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, toneMapped: false }), true, false, [], 256);
    this.holz = new Instanzen(this.group, holzstossGeo(), mat, false, true, [], 2);
    this.muehlen = new Instanzen(this.group, muehleGeo(), mat, false, true, [], 8);
    this.muehlenFluegel = new Instanzen(this.group, fluegelMuehleGeo(), doppelt, false, true, [], 8);
    this.hunde = new Instanzen(this.group, hundGeo(), mat, false, true, [], 8);
    this.kontakt = new Kontaktschatten(this.group, 512);
    this.schildArme = new Instanzen(this.group, schildArmGeo(), mat, false, true, [], 64);
    this.lampen = new Instanzen(this.group, new THREE.SphereGeometry(0.4, 8, 6), new THREE.MeshBasicMaterial({ color: '#ffffff' }), true, false, [], 16);
    // Flammen leuchten (Farbe über 1: bleibt auch nachts hell und speist das Leuchten der Nachbearbeitung)
    this.flammen = new Instanzen(this.group, flammeGeo(), new THREE.MeshBasicMaterial({ vertexColors: true, color: new THREE.Color(4, 1.9, 0.9), transparent: true, opacity: 0.92 }), false, false, [], 4);
  }

  setExaggeration(ex: number) { this.ex = ex; }
  private hoehe(x: number, z: number) { return (this.map.heightAt(x, z) - this.base) * this.ex; }

  /** Nacht 0..1 aus der Tageszeit (Dämmerung weich). */
  static nacht(tag: number): number {
    const e = Math.sin(2 * Math.PI * (tag - 0.25));
    return 1 - THREE.MathUtils.smoothstep(e, -0.18, 0.12);
  }

  update(s: SimSicht, dt: number, lg: LebenLage): void {
    this.zeit += dt;
    const t = this.zeit, nacht = LebenDarstellung.nacht(lg.tag);
    const wind = Math.max(leben.wind.grund, lg.wind * leben.wind.sturm);
    const winter = lg.jahreszeit === 3;
    const kam = this.kamera?.position;
    if (this.kamera && 'fov' in this.kamera) {
      const cam = this.kamera as THREE.PerspectiveCamera;
      const px = innerHeight / (2 * Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2));
      this.rauch.skala(px); this.glut.skala(px);
    }
    for (const x of this.alle()) x.beginne();
    this.kontakt.beginne();
    // Windrichtung (fest von Westen, leicht pendelnd) in m/s für Rauch und Wäsche
    const wx = (1.5 + 6 * wind) * Math.cos(0.3 + 0.2 * Math.sin(t * 0.05)), wz = (1.5 + 6 * wind) * Math.sin(0.3 + 0.2 * Math.sin(t * 0.05)) * 0.5;
    const fest = s.dorf.fest && s.dorf.fest.laeuft > 0 ? KLEINE_FESTE[s.dorf.fest.nr]?.id ?? '' : '';
    const kirmesFest = (s.dorf.kirmes?.fest ?? 0) > 0;
    const zahl = { ...this.zahlen, fenster: 0, figuren: 0, tiere: 0, voegel: 0 };
    for (const g of s.gebaeude) {
      if (g.bau < PROMILLE) continue;
      const l = this.lage(g.id, g.typ);
      if (!l) continue;
      if (kam && kam.distanceTo(this.p.set(l.x, l.y, l.z)) > leben.fern_m) continue;
      const arbeitet = g.zustand === 'arbeitet' || g.zustand === 'fest';
      const anker = lebenAnker(g.typ);
      this.schild(g, anker, l, t, wind);
      // der Meister ist da, solange das Gebäude besetzt ist (nicht nur im Augenblick der Arbeit)
      if (!OHNE_MEISTER.has(g.zustand)) this.meister(g, anker, l, t, zahl);
      for (let i = 0; i < anker.length; i++) this.anker(g, anker[i], i, l, { t, dt, nacht, wind, winter, arbeitet, fest, kirmesFest, eigen: g.sp === s.ich, zahl, regen: lg.regen });
      // Vogelschwarm über großen Feldern (Felder mit weitem Grundriss), im Winter Raben
      if (/feld|garten|weinberg|wiese/.test(g.typ)) this.schwarm(g.id, l.x, l.y, l.z, l.sk, t, winter, zahl);
    }
    this.konfettiAusEreignissen(s);
    this.konfettiBewegen(dt);
    this.rauch.schritt(dt, wx, wz, -0.02);
    this.glut.schritt(dt, wx * 0.3, wz * 0.3, 2);
    for (const x of this.alle()) x.fertig();
    this.kontakt.fertig();
    zahl.rauch = this.rauch.anzahl; zahl.funken = this.glut.anzahl; zahl.konfetti = this.konfettiTeile.length;
    this.zahlen = zahl;
  }

  private alle(): Instanzen[] {
    return [this.schafe, this.kuehe, this.huehner, this.fluegelL, this.fluegelR, this.voegel, this.waesche, this.raeder, this.saegen, this.haemmer, this.figuren,
      this.fenster, this.schein, this.konfetti, this.holz, this.flammen, this.muehlen, this.muehlenFluegel, this.hunde, this.lampen, this.schildArme,
      ...this.schildWaren.values(), ...this.meisterSaetze.values()];
  }

  /** Zunftschild am ersten Schild-Anker: die Ware, die das Gebäude macht, hängt am Arm und schwingt im Wind (so erkennt man auch
   *  Gebäude, die sich ein Modell teilen, z. B. Spinnerei und Käserei). */
  private schild(g: SichtGebaeude, anker: readonly Anker[], l: { x: number; y: number; z: number; sk: number }, t: number, wind: number): void {
    const ware = GEBAEUDE[g.typ]?.ausgangWare ?? -1;
    const a = ware >= 0 ? anker.find((x) => x.art === 'schild') : undefined;
    if (!a) return;
    const { m, q, p, s: sc } = this, sk = l.sk;
    const x = l.x + a.x * sk, y = l.y + a.y * sk, z = l.z + a.z * sk;
    m.compose(p.set(x, y, z), q.identity(), sc.setScalar(sk));
    this.schildArme.fuege(m);
    let satz = this.schildWaren.get(ware);
    if (!satz) {
      satz = new Instanzen(this.group, warenGeometrie(ware), this.mat, false, true, [], 16);
      satz.beginne();
      this.schildWaren.set(ware, satz);
    }
    // hängt unter der Armspitze, pendelt um die Aufhängung
    const sw = Math.sin(t * (1.3 + wind) + g.id) * (0.06 + 0.22 * wind);
    const gr = leben.schild.groesse * sk / 4.4;
    q.setFromAxisAngle(this.X, sw).multiply(this.q2.setFromAxisAngle(this.Y, 0.5));
    p.set(0, -WARE_M * gr, 0).applyQuaternion(q).add(this.s2.set(x, y - 0.3 * sk, z + 2.2 * sk));
    m.compose(p, q, sc.setScalar(gr));
    satz.fuege(m);
  }

  /** Meister vor dem arbeitenden Gebäude in der Tracht seines Berufs (data/leben.json: meister): Schmied mit Lederschürze, Koch mit
   *  Kochmütze, Käserin mit Haube, Bauer mit Strohhut … steht neben der Tür, schaut umher, winkt oder kratzt sich ab und zu. */
  private meister(g: SichtGebaeude, anker: readonly Anker[], l: { x: number; y: number; z: number; sk: number }, t: number, zahl: LebenDarsZahl): void {
    const tracht = (leben.meister as Record<string, Tracht>)[g.typ];
    if (!tracht) return;
    let satz = this.meisterSaetze.get(g.typ);
    if (!satz) {
      satz = new Instanzen(this.group, figur(tracht), this.figurMat, true, true, FIGUR_ATTRIBUTE, 8);
      satz.beginne();
      this.meisterSaetze.set(g.typ, satz);
    }
    const a = anker.find((x) => x.art === 'schild');
    // an der vorderen linken Hausecke (vor der Tür steht die Fahne, rechts hängt das Zunftschild), Blick nach vorn
    const mx = a ? -a.x - 2.6 : 4, mz = a ? a.z + 1.6 : 7;
    const x = l.x + mx * l.sk, z = l.z + mz * l.sk;
    const takt = (t * 0.12 + h01(g.id, 9)) % 1;
    const geste = takt < 0.12 ? GESTE.winken : takt > 0.55 && takt < 0.65 ? GESTE.kratzen : GESTE.keine;
    const yaw = 0.4 * Math.sin(t * 0.3 + g.id);
    this.figur(x, z, yaw, t * 2 + g.id, tracht.hemd ? this.c.set(tracht.hemd) : SCHWAETZER[g.id % SCHWAETZER.length], 0, geste, 0.7, 0, 1, zahl, satz);
  }

  /** Ein Anker eines Gebäudes. */
  private anker(g: SichtGebaeude, a: Anker, i: number, l: { x: number; y: number; z: number; sk: number },
    o: { t: number; dt: number; nacht: number; wind: number; winter: boolean; arbeitet: boolean; fest: string; kirmesFest: boolean; eigen: boolean; zahl: LebenDarsZahl; regen: number }): void {
    const sk = l.sk, x = l.x + a.x * sk, y = l.y + a.y * sk, z = l.z + a.z * sk;
    const id = g.id, ph = h01(id, i) * 6.283;
    const { m, q, p, s: sc } = this;
    switch (a.art) {
      case 'kamin': case 'dampf': {
        // Herdfeuer brennt in Häusern immer ein wenig, Werkstätten rauchen nur bei der Arbeit
        const herd = a.art === 'kamin' && HERD.has(g.typ);
        let rate = (a.staerke ?? 1) * (o.arbeitet ? leben.rauch.arbeitet_faktor : herd ? leben.rauch.ruhig_faktor : 0);
        if (a.art === 'kamin') rate *= (o.winter ? leben.rauch.winter_faktor : 1) * (1 + (leben.rauch.nacht_faktor - 1) * o.nacht);
        if (rate <= 0) break;
        const d = a.art === 'dampf' ? leben.dampf : leben.rauch;
        const key = `${id}:${i}`;
        let acc = (this.takt.get(key) ?? h01(id, i)) + o.dt * d.rate * rate;
        while (acc >= 1) {
          acc -= 1;
          const dunkel = a.art === 'kamin' && (a.staerke ?? 1) >= 2;
          const f = a.art === 'dampf' ? FARBE_DAMPF : dunkel ? FARBE_RAUCH_DUNKEL : FARBE_RAUCH;
          const g0 = leben.rauch.groesse * sk * 0.22 * Math.sqrt(a.staerke ?? 1);
          this.rauch.neu({
            x: x + (Math.random() - 0.5) * sk * 0.4, y, z: z + (Math.random() - 0.5) * sk * 0.4,
            vx: (Math.random() - 0.5) * 1.2, vy: d.steigen * (0.7 + Math.random() * 0.5) * (0.6 + 0.4 * sk / 4.4), vz: (Math.random() - 0.5) * 1.2,
            // wächst beim Steigen, aber höchstens auf das 2,4-Fache (keine Nebelblasen, Gutachter)
            dauer: d.dauer_s * (0.8 + Math.random() * 0.4), g0, g1: Math.min(g0 * 2.4, g0 + d.wachsen * d.dauer_s * sk * 0.22),
            a: a.art === 'dampf' ? 0.9 : 1, r: f.r, g: f.g, b: f.b,
          });
        }
        this.takt.set(key, acc);
        break;
      }
      case 'fenster': {
        // nachts leuchten die Fenster (nicht alle, und nicht die ganze Nacht)
        if (o.nacht < 0.05) break;
        const an = h01(id * 3 + i, 7) < 0.78 && Math.sin(o.t * 0.013 + ph) > -0.7;
        if (!an) break;
        const flacker = 0.9 + 0.1 * Math.sin(o.t * 5 + ph * 3);
        const hell = o.nacht * leben.fenster.hell * (0.75 + 0.25 * h01(id, i * 5)) * flacker;
        this.c.set(leben.fenster.farbe).multiplyScalar(hell);
        const seite = a.seite ?? 1;
        q.setFromAxisAngle(this.Y, seite > 0 ? 0 : Math.PI);
        const fz = z + seite * leben.fenster.abstand * sk;
        m.compose(p.set(x, y, fz), q, sc.set((a.w ?? 1) * sk, sk, sk));
        this.fenster.fuege(m, this.c);
        // warmer Schein ums Fenster (leuchtet in die Nacht)
        this.c.set(leben.fenster.farbe).multiplyScalar(o.nacht * leben.fenster.glanz * flacker);
        m.compose(p.set(x, y, fz + seite * 0.3 * sk), q, sc.set(4.2 * sk, 4.2 * sk, sk));
        this.schein.fuege(m, this.c);
        // Lichtfleck auf dem Boden vor den unteren Fenstern: das Haus wärmt den Weg
        if (a.y < 4) {
          const bz = z + seite * 2.2 * sk;
          this.c.set(leben.fenster.farbe).multiplyScalar(o.nacht * leben.fenster.boden * flacker);
          m.compose(p.set(x, this.hoehe(x, bz) + 0.4, bz), this.q2.setFromAxisAngle(this.X, -Math.PI / 2), sc.set(5 * sk, 4 * sk, sk));
          this.schein.fuege(m, this.c);
        }
        o.zahl.fenster++;
        break;
      }
      case 'schatten':
        this.kontakt.setze(x, this.hoehe(x, z), z, (a.r ?? 1) * sk);
        break;
      case 'huhn': {
        // picken (Kopf nach unten) und ein paar Schritte im Kreis
        const tt = o.t * leben.tiere.huhn + ph;
        const r = 0.6 * Math.sin(tt * 0.4);
        const px = x + Math.cos(tt * 0.3) * r * sk, pz = z + Math.sin(tt * 0.3) * r * sk;
        const pick = Math.pow(Math.max(0, Math.sin(tt * 3.1)), 6) * 0.6;
        q.setFromAxisAngle(this.Y, (a.r ?? 0) + Math.sin(tt * 0.5) * 1.2).multiply(this.q2.setFromAxisAngle(this.Z, -pick));
        m.compose(p.set(px, this.hoehe(px, pz) + 0.02, pz), q, sc.setScalar(sk * 1.05));
        this.huehner.fuege(m, a.farbe && a.farbe !== '#f4efe4' ? HUHN_BRAUN : WEISS);
        this.kontakt.setze(px, this.hoehe(px, pz), pz, 0.7 * sk);
        o.zahl.tiere++;
        break;
      }
      case 'waesche': {
        // vier Stücke an der Leine, schwingen mit dem Wind
        const n = 4, L = a.w ?? 6;
        for (let j = 0; j < n; j++) {
          const wx = x + (-L / 2 + (L * (j + 0.6)) / n) * sk;
          const sw = 0.15 + o.wind * 0.7 * (0.55 + 0.45 * Math.sin(o.t * (2.2 + o.wind * 3) + j * 1.3 + ph));
          q.setFromAxisAngle(this.X, -sw);
          m.compose(p.set(wx, y - 0.05 * sk, z), q, sc.set(sk * (0.85 + 0.15 * (j % 2)), sk * (1 - 0.25 * (j % 2)), sk));
          this.waesche.fuege(m, WAESCHE[(id + j) % WAESCHE.length]);
        }
        break;
      }
      case 'rad': {
        // Wasserrad: dreht sich bei der Arbeit, sonst steht es (leicht schaukelnd)
        const w = o.arbeitet ? o.t * 0.9 : Math.sin(o.t * 0.4 + ph) * 0.05;
        q.setFromAxisAngle(this.X, w + ph);
        if (a.achse === 'z') q.premultiply(this.q2.setFromAxisAngle(this.Y, Math.PI / 2));
        const r = (a.r ?? 2) * sk;
        m.compose(p.set(x, y, z), q, sc.set((a.w ?? 0.6) / 0.6 * sk, r, r));
        this.raeder.fuege(m);
        if (o.arbeitet && Math.random() < o.dt * 3) {
          // spritzendes Wasser unten am Rad
          this.rauch.neu({ x: x + (Math.random() - 0.5) * sk, y: y - r * 0.8, z: z + (Math.random() - 0.5) * r, vx: 0, vy: 2, vz: 3, dauer: 0.9, g0: sk * 0.6, g1: sk * 1.4, a: 0.5, r: 0.85, g: 0.93, b: 1 });
        }
        break;
      }
      case 'saege': {
        const hub = o.arbeitet ? Math.sin(o.t * 9) * 0.55 : 0;
        m.compose(p.set(x, y + hub * sk, z), q.identity(), sc.setScalar(sk));
        this.saegen.fuege(m);
        if (o.arbeitet && Math.random() < o.dt * 8) {
          // Sägemehl
          this.rauch.neu({ x, y: y - 1.2 * sk, z: z + (Math.random() - 0.5) * sk, vx: (Math.random() - 0.5) * 2, vy: 1.5, vz: (Math.random() - 0.5) * 2, dauer: 1.2, g0: sk * 0.35, g1: sk * 0.6, a: 0.7, r: 0.88, g: 0.75, b: 0.52 });
        }
        break;
      }
      case 'hammer': {
        // Schmiedehammer: hoch, zuschlagen (Funken), hoch …
        const zyk = o.arbeitet ? (o.t * 1.4 + h01(id, 3)) % 1 : 0.5;
        const hoch = zyk < 0.75 ? Math.sin((zyk / 0.75) * Math.PI * 0.5) : 1 - (zyk - 0.75) / 0.25;
        // Stiel zeigt nach vorn (Drehpunkt hinter dem Amboss), der Kopf hebt sich und trifft auf (x, y, z)
        q.setFromAxisAngle(this.Y, Math.PI / 2).multiply(this.q2.setFromAxisAngle(this.Z, -0.05 + hoch * 1.1));
        m.compose(p.set(x, y + 0.25 * sk, z - 2.3 * sk), q, sc.setScalar(sk * 1.3));
        this.haemmer.fuege(m);
        const key = `${id}:h`;
        const vorher = this.takt.get(key) ?? 0;
        if (o.arbeitet && zyk >= 0.97 && vorher < 0.97) {
          for (let j = 0; j < leben.feuer.esse_funken; j++) {
            const wv = Math.random() * 6.283, v = 4 + Math.random() * 6;
            this.glut.neu({ x, y: y + 0.4 * sk, z, vx: Math.cos(wv) * v, vy: 6 + Math.random() * 8, vz: Math.sin(wv) * v, dauer: 0.7, g0: sk * 0.5, g1: sk * 0.25, a: 1, r: FARBE_FUNKE.r, g: FARBE_FUNKE.g, b: FARBE_FUNKE.b });
          }
        }
        this.takt.set(key, zyk);
        break;
      }
      case 'esse': {
        // Glut flackert (leuchtet nachts kräftig), ab und zu ein Funke
        const hell = (o.arbeitet ? 1 : 0.3) * (0.6 + 0.4 * Math.sin(o.t * 7 + ph)) * (0.5 + 0.8 * o.nacht);
        if (Math.random() < o.dt * 10) this.glut.neu({ x, y, z, vx: 0, vy: 0, vz: 0, dauer: 0.25, g0: 3 * sk, g1: 3.5 * sk, a: 0.35 * hell, r: FARBE_GLUT.r, g: FARBE_GLUT.g, b: FARBE_GLUT.b });
        if (o.arbeitet && Math.random() < o.dt * 3) this.glut.neu({ x, y: y + 0.5 * sk, z, vx: (Math.random() - 0.5) * 2, vy: 5 + Math.random() * 4, vz: (Math.random() - 0.5) * 2, dauer: 1.1, g0: sk * 0.4, g1: sk * 0.15, a: 1, r: FARBE_FUNKE.r, g: FARBE_FUNKE.g, b: FARBE_FUNKE.b });
        break;
      }
      case 'schafe': case 'kuehe': {
        // grasen: ziehen auf Lissajous-Bahnen über die Weide, bleiben mal stehen (Kopf unten)
        const n = a.n ?? 4, ws = (a.w ?? 8) / 2, ds = (a.d ?? 5) / 2;
        const tempo = a.art === 'schafe' ? leben.tiere.schaf : leben.tiere.kuh;
        for (let j = 0; j < n; j++) {
          const pj = h01(id + j * 13, i) * 6.283, f1 = 0.05 + 0.04 * h01(j, id), f2 = 0.07 + 0.05 * h01(id, j);
          const lauf = 0.5 + 0.5 * Math.sin(o.t * 0.11 + pj * 3);
          const tt = o.t * tempo * lauf * 0.25 + pj * 10;
          const lx = Math.sin(tt * f1 * 6 + pj) * ws * 0.85, lz = Math.sin(tt * f2 * 6 + pj * 2) * ds * 0.85;
          const dx = Math.cos(tt * f1 * 6 + pj) * f1 * ws, dz = Math.cos(tt * f2 * 6 + pj * 2) * f2 * ds * 2;
          const px = x + lx * sk, pz = z + lz * sk;
          const nick = lauf < 0.35 ? 0.25 : 0;
          q.setFromAxisAngle(this.Y, Math.atan2(-dz, dx)).multiply(this.q2.setFromAxisAngle(this.Z, -nick + Math.sin(o.t * 6 + pj) * 0.03 * lauf));
          const gr = a.art === 'schafe' ? 1.25 : 1.4;
          m.compose(p.set(px, this.hoehe(px, pz) + Math.abs(Math.sin(o.t * 5 + pj)) * 0.12 * lauf * sk, pz), q, sc.setScalar(sk * gr));
          (a.art === 'schafe' ? this.schafe : this.kuehe).fuege(m);
          this.kontakt.setze(px, this.hoehe(px, pz), pz, (a.art === 'schafe' ? 1.3 : 1.7) * sk, Math.atan2(-dz, dx) + Math.PI / 2, 1.5);
          o.zahl.tiere++;
        }
        break;
      }
      case 'bienen': {
        // Bienen schwirren als kleine leuchtend gelbe Punkte um die Kästen (nur bei Tag, nicht im Winter, nicht im Regen)
        if (o.nacht > 0.5 || o.winter || o.regen > 0.5) break;
        if (Math.random() < o.dt * 14) {
          const wv = Math.random() * 6.283, v = leben.bienen.tempo * sk * 0.5;
          this.glut.neu({
            x: x + (Math.random() - 0.5) * (a.w ?? 6) * sk, y: y + Math.random() * 2 * sk, z: z + (Math.random() - 0.5) * 3 * sk,
            vx: Math.cos(wv) * v, vy: (Math.random() - 0.4) * v, vz: Math.sin(wv) * v, dauer: 2.2, g0: sk * 0.45, g1: sk * 0.45, a: 0.9,
            r: FARBE_BIENE.r * 0.6, g: FARBE_BIENE.g * 0.5, b: 0.05,
          });
        }
        break;
      }
      case 'kinder': {
        // Kinder toben im Kreis über den Kirmesplatz (beim Fest schneller), nachts schlafen sie
        if (o.nacht > 0.6) break;
        const n = a.n ?? 4, r = (a.r ?? 4) * sk;
        for (let j = 0; j < n; j++) {
          const w = o.t * (o.kirmesFest || o.fest ? 0.9 : 0.5) * (j % 2 ? 1 : -1) + (j / n) * 6.283;
          const px = x + Math.cos(w) * r * (0.7 + 0.3 * Math.sin(o.t + j)), pz = z + Math.sin(w) * r * 0.7;
          const yaw = w + (j % 2 ? 0 : Math.PI) + Math.PI / 2;
          this.figur(px, pz, yaw + Math.PI / 2 * (j % 2 ? -1 : 1), o.t * 11 + j, KIND[j % KIND.length], 1, j === 0 ? GESTE.jubeln : GESTE.keine, 1, 0, 0.7, o.zahl);
        }
        break;
      }
      case 'schwaetzer': {
        // vor der Schänke wird geschwätzt (abends mehr Leute), mit Gesten
        const n = Math.round((a.n ?? 3) * (0.6 + 0.6 * Math.min(1, o.nacht * 2))) ;
        for (let j = 0; j < n; j++) {
          const w = (j / n) * 6.283 + ph;
          const px = x + Math.cos(w) * 2.2 * sk, pz = z + Math.sin(w) * 1.6 * sk;
          const geste = [GESTE.winken, GESTE.schimpfen, GESTE.kratzen, GESTE.keine][Math.floor(o.t * 0.4 + j * 1.7) % 4];
          this.figur(px, pz, Math.atan2(x - px, z - pz), o.t * 2 + j, SCHWAETZER[(id + j) % SCHWAETZER.length], 0, geste, 0.7, 0, 1, o.zahl);
        }
        break;
      }
      case 'feuer': {
        // Martinsfeuer: Holzstoß mit Flammen und Funken, solange das Fest läuft
        if (!o.eigen || o.fest !== 'martinsfeuer') break;
        m.compose(p.set(x, this.hoehe(x, z), z), q.identity(), sc.setScalar(sk));
        this.holz.fuege(m);
        const fl = 0.85 + 0.25 * Math.sin(o.t * 11) + 0.1 * Math.sin(o.t * 23);
        q.setFromAxisAngle(this.Y, o.t * 0.7);
        m.compose(p.set(x, this.hoehe(x, z) + 1.2 * sk, z), q, sc.set(sk * fl, sk * (0.9 + 0.35 * Math.sin(o.t * 9)), sk * fl));
        this.flammen.fuege(m);
        if (Math.random() < o.dt * leben.feuer.funken) {
          this.glut.neu({ x, y: this.hoehe(x, z) + 5 * sk, z, vx: (Math.random() - 0.5) * 4, vy: 8 + Math.random() * 8, vz: (Math.random() - 0.5) * 4, dauer: 2, g0: sk * 0.5, g1: sk * 0.2, a: 1, r: FARBE_FUNKE.r, g: FARBE_FUNKE.g, b: FARBE_FUNKE.b });
        }
        if (Math.random() < o.dt * 6) this.glut.neu({ x, y: this.hoehe(x, z) + 3 * sk, z, vx: 0, vy: 0, vz: 0, dauer: 0.4, g0: 14 * sk, g1: 16 * sk, a: 0.25, r: 1, g: 0.5, b: 0.15 });
        break;
      }
      case 'muehle': {
        // Bockwindmühle: Flügel drehen mit dem Wind (bei der Arbeit kräftiger)
        m.compose(p.set(x, this.hoehe(x, z) - 0.2 * sk, z), q.identity(), sc.setScalar(sk));
        this.muehlen.fuege(m);
        const w = o.t * (0.25 + o.wind * 0.9) * (o.arbeitet ? 1.4 : 0.8) + ph;
        q.setFromAxisAngle(this.Z, -w);
        m.compose(p.set(x, this.hoehe(x, z) + 7.6 * sk, z + 2.85 * sk), q, sc.setScalar(sk));
        this.muehlenFluegel.fuege(m);
        break;
      }
      case 'hund': {
        // Hofhund trabt um den Hof, schnuppert, bleibt stehen
        const r = (a.r ?? 3) * sk, tt = o.t * 0.18 + ph;
        const lauf = 0.5 + 0.5 * Math.sin(o.t * 0.3 + ph);
        const w = tt + Math.sin(o.t * 0.07) * 2;
        const px = x + Math.cos(w) * r, pz = z + Math.sin(w) * r * 0.6;
        q.setFromAxisAngle(this.Y, -w - Math.PI / 2).multiply(this.q2.setFromAxisAngle(this.Z, lauf < 0.3 ? -0.2 : Math.sin(o.t * 9) * 0.04));
        m.compose(p.set(px, this.hoehe(px, pz) + Math.abs(Math.sin(o.t * 8)) * 0.15 * sk * lauf, pz), q, sc.setScalar(sk * 1.5));
        this.hunde.fuege(m);
        this.kontakt.setze(px, this.hoehe(px, pz), pz, 1.1 * sk);
        o.zahl.tiere++;
        break;
      }
      case 'laterne': {
        // Laterne am Haus: nachts warmes Licht mit Schein
        if (o.nacht < 0.05) break;
        const hell = o.nacht * (0.9 + 0.1 * Math.sin(o.t * 6 + ph));
        this.c.set(leben.fenster.farbe).multiplyScalar(hell * leben.fenster.hell * 1.4);
        m.compose(p.set(x, y, z), q.identity(), sc.setScalar(sk));
        this.lampen.fuege(m, this.c);
        this.c.set(leben.fenster.farbe).multiplyScalar(hell * leben.fenster.glanz * 1.2);
        if (this.kamera) q.copy(this.kamera.quaternion);
        m.compose(p.set(x, y, z), q, sc.set(7 * sk, 7 * sk, sk));
        this.schein.fuege(m, this.c);
        break;
      }
      default: break;
    }
  }

  private figur(x: number, z: number, yaw: number, phase: number, farbe: THREE.Color, lauf: number, geste: number, laune: number, kipp: number, groesse: number, zahl: LebenDarsZahl, satz = this.figuren): void {
    const y = this.hoehe(x, z);
    const f = this.kamera ? fernFaktor(this.kamera.position.distanceTo(this.p.set(x, y, z))) : 1;
    const sk = TRAEGER_H * f * groesse;
    this.q.setFromAxisAngle(this.Y, yaw).multiply(this.q2.setFromAxisAngle(this.Z, kipp));
    this.m.compose(this.p.set(x, y, z), this.q, this.s.set(sk, sk, sk));
    satz.fuege(this.m, farbe, [phase, 0, lauf, laune, geste]);
    this.kontakt.setze(x, y, z, 0.32 * sk);
    zahl.figuren++;
  }

  /** Vogelschwarm: kreist über dem Feld, Flügelschlag; im Winter Raben (größer, langsamer). */
  private schwarm(id: number, x: number, y: number, z: number, sk: number, t: number, winter: boolean, zahl: LebenDarsZahl): void {
    const v = leben.voegel, n = v.n, R = v.radius_m * (0.8 + 0.4 * h01(id, 1));
    const cx = x + 10 * sk, cz = z, cy = y + v.hoehe_m + 10 * Math.sin(t * 0.2 + id);
    for (let j = 0; j < n; j++) {
      const w = t * v.tempo * (winter ? 0.6 : 1) + (j / n) * 0.9 + id;
      const rr = R * (0.85 + 0.25 * Math.sin(j * 2.3 + t * 0.3));
      const px = cx + Math.cos(w) * rr, pz = cz + Math.sin(w) * rr, py = cy + Math.sin(t * 1.3 + j) * 3;
      const gr = (winter ? 2.6 : 1.9) * Math.max(1, this.kamera ? fernFaktor(this.kamera.position.distanceTo(this.p.set(px, py, pz))) : 1);
      const yaw = -w;
      const schlag = Math.sin(t * (winter ? 6 : 11) + j * 1.7) * 0.7;
      this.q.setFromAxisAngle(this.Y, yaw);
      this.m.compose(this.p.set(px, py, pz), this.q, this.s.setScalar(gr));
      this.voegel.fuege(this.m);
      this.q.setFromAxisAngle(this.Y, yaw).multiply(this.q2.setFromAxisAngle(this.X, schlag));
      this.m.compose(this.p, this.q, this.s.setScalar(gr));
      this.fluegelL.fuege(this.m);
      this.q.setFromAxisAngle(this.Y, yaw + Math.PI).multiply(this.q2.setFromAxisAngle(this.X, schlag));
      this.m.compose(this.p, this.q, this.s.setScalar(gr));
      this.fluegelR.fuege(this.m);
      zahl.voegel++;
    }
  }

  /** Konfetti beim Tusch (Kirmes, Fest, Schützenfest, König, Jahresfest, Maibaum, Einstand, neue Stufe) über dem Ort des Ereignisses. */
  private konfettiAusEreignissen(s: SimSicht): void {
    const anlass = new Set(['kirmes', 'kleines_fest', 'schuetzenfest', 'koenig', 'jahresfest', 'maibaum', 'einstand', 'stufe', 'schatzteil', 'grossfund']);
    for (const e of s.ereignisse) {
      if (e.nr <= this.gemeldet) continue;
      this.gemeldet = e.nr;
      if (!anlass.has(e.art) || s.tick - e.tick > 60) continue;
      const g = s.gebaeude.find((x) => x.id === e.gebaeude) ?? s.gebaeude.find((x) => x.sp === s.ich && x.typ === 'kirmesplatz') ?? s.gebaeude.find((x) => x.sp === s.ich && x.typ === 'lager');
      const l = g ? this.lage(g.id, g.typ) : null;
      if (l) this.konfettiAus(l.x, l.y + 9 * l.sk, l.z, l.sk);
    }
  }

  /** Ein Ausbruch Konfetti bei (x, y, z). */
  konfettiAus(x: number, y: number, z: number, sk = 4.4): void {
    for (let j = 0; j < leben.konfetti.n && this.konfettiTeile.length < 600; j++) {
      const w = Math.random() * 6.283, v = 4 + Math.random() * 10;
      this.konfettiTeile.push({ x, y, z, vx: Math.cos(w) * v, vy: 6 + Math.random() * 10, vz: Math.sin(w) * v, t: 0, dauer: leben.konfetti.dauer_s * (0.7 + Math.random() * 0.5), rot: Math.random() * 6.283, c: j % KONFETTI.length });
    }
    void sk;
  }

  private konfettiBewegen(dt: number): void {
    let n = 0;
    for (const f of this.konfettiTeile) {
      f.t += dt;
      if (f.t >= f.dauer) continue;
      // fällt langsam und flattert
      f.vy = Math.max(f.vy - 14 * dt, -2.5);
      f.vx *= 1 - dt * 0.8; f.vz *= 1 - dt * 0.8;
      f.x += (f.vx + Math.sin(f.t * 3 + f.rot) * 1.2) * dt; f.y += f.vy * dt; f.z += (f.vz + Math.cos(f.t * 2.7 + f.rot) * 1.2) * dt;
      const boden = this.hoehe(f.x, f.z) + 0.3;
      if (f.y < boden) { f.y = boden; f.vy = 0; f.vx = 0; f.vz = 0; }
      this.q.setFromEuler(new THREE.Euler(f.t * 5 + f.rot, f.t * 3, f.rot));
      const fern = this.kamera ? Math.min(3, fernFaktor(this.kamera.position.distanceTo(this.p.set(f.x, f.y, f.z)))) : 1;
      const gr = 4.5 * fern * (1 - Math.max(0, f.t / f.dauer - 0.8) * 5);
      this.m.compose(this.p.set(f.x, f.y, f.z), this.q, this.s.setScalar(gr));
      this.konfetti.fuege(this.m, KONFETTI[f.c]);
      this.konfettiTeile[n++] = f;
    }
    this.konfettiTeile.length = n;
  }
}

type LebenDarsZahl = LebenDarstellung['zahlen'];
