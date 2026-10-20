// Stilprobe (ROADMAP M9): dieselbe kleine Szene – Fachwerk-Wohnhaus, Schuppen, Träger mit Waren, beschwipster Bote, Warenstapel
// an der Fahne, Bäume – in drei Stil-Varianten, damit der Stil vor dem Umbau aller Modelle gewählt werden kann.
//   ?v=a  Siedler-Klassik: warm und satt, weich schattiert, mäßig übertrieben (nah an Siedler 2 Gold / 10th Anniversary)
//   ?v=b  Comic mit Kontur: Toon-Schattierung in drei Stufen, schwarze Umrisse, stark übertrieben und schief (Asterix-Einschlag)
//   ?v=c  Bilderbuch-Diorama: runde Formen, pastellige Malfarben mit Verlauf, weiches Licht und Dunst (Wimmelbuch)
//   &nah=1 Kamera nah an den Figuren
// Eigenständig (nutzt das Spiel nicht), nur zum Anschauen und für Screenshots (tools/stilprobe/aufnahme.mjs).
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

type Variante = 'a' | 'b' | 'c';
const url = new URLSearchParams(location.search);
const V = (['a', 'b', 'c'].includes(url.get('v') ?? '') ? url.get('v') : 'a') as Variante;
const NAH = url.get('nah') === '1';

interface Stil {
  name: string; text: string;
  /** Kopfgröße und Bauch der Figuren, Krummheit der Beine. */
  kopf: number; bauch: number; krumm: number;
  /** Schiefe der Häuser (Radiant), Dachüberstand, Dachneigung. */
  schief: number; ueberstand: number; dachH: number;
  /** runde Kanten, Umriss, Toon. */
  rund: number; umriss: boolean; toon: boolean;
  /** Farben. */
  wand: string; balken: string; dach: string; laden: string; sockel: string; gras: string; gras2: string; erde: string; himmel: string;
  sonne: string; sonneI: number; himmelI: number; nebel: number;
}

const STILE: Record<Variante, Stil> = {
  a: {
    name: 'A – Siedler-Klassik', text: 'warm und satt, weich schattiert, mäßig übertrieben',
    kopf: 1.0, bauch: 1.0, krumm: 0.6, schief: 0.02, ueberstand: 0.6, dachH: 0.8, rund: 0.06, umriss: false, toon: false,
    wand: '#f1e3c4', balken: '#5a3a22', dach: '#a8462f', laden: '#2f7a55', sockel: '#9a948a', gras: '#6f9e3f', gras2: '#8db54e', erde: '#9a7b52',
    himmel: '#a9cde8', sonne: '#fff1d6', sonneI: 2.6, himmelI: 0.9, nebel: 0.0016,
  },
  b: {
    name: 'B – Comic mit Kontur', text: 'Toon-Schattierung, schwarze Umrisse, stark übertrieben und schief',
    kopf: 1.35, bauch: 1.25, krumm: 1.0, schief: 0.07, ueberstand: 0.9, dachH: 1.05, rund: 0.12, umriss: true, toon: true,
    wand: '#fff0cf', balken: '#4a2c1a', dach: '#d9452b', laden: '#1f8fb0', sockel: '#a8a39a', gras: '#79c142', gras2: '#a3d95a', erde: '#c08a4e',
    himmel: '#8fd3ff', sonne: '#ffffff', sonneI: 2.4, himmelI: 1.1, nebel: 0.0008,
  },
  c: {
    name: 'C – Bilderbuch-Diorama', text: 'runde Formen, Malfarben mit Verlauf, weiches Licht und Dunst',
    kopf: 1.2, bauch: 1.15, krumm: 0.8, schief: 0.045, ueberstand: 0.75, dachH: 0.95, rund: 0.22, umriss: false, toon: false,
    wand: '#f6e6cf', balken: '#7a5238', dach: '#c96a52', laden: '#5f9e8f', sockel: '#b9ad9c', gras: '#97b866', gras2: '#c2d48a', erde: '#c7a37a',
    himmel: '#f3dcc0', sonne: '#ffe2b8', sonneI: 2.0, himmelI: 1.3, nebel: 0.0035,
  },
};
const S = STILE[V];
document.getElementById('schild')!.innerHTML = `${S.name}<small>${S.text}</small>`;

// ---------------------------------------------------------------- Renderer, Licht

const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = V === 'c' ? THREE.ACESFilmicToneMapping : THREE.NeutralToneMapping;
renderer.toneMappingExposure = V === 'c' ? 1.05 : 1.0;
document.body.append(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(S.himmel);
scene.fog = new THREE.FogExp2(S.himmel, S.nebel);
const kamera = new THREE.PerspectiveCamera(NAH ? 30 : 34, innerWidth / innerHeight, 1, 2000);
if (NAH) { kamera.position.set(17, 10, 27); kamera.lookAt(6, 3.2, 7); }
else { kamera.position.set(30, 33, 44); kamera.lookAt(3, 1, 2); }

scene.add(new THREE.HemisphereLight(S.himmel, V === 'c' ? '#a08060' : '#5a6a3a', S.himmelI));
const sonne = new THREE.DirectionalLight(S.sonne, S.sonneI);
sonne.position.set(-40, 70, 35);
sonne.castShadow = true;
sonne.shadow.mapSize.set(2048, 2048);
Object.assign(sonne.shadow.camera, { left: -45, right: 45, top: 45, bottom: -45, near: 1, far: 220 });
sonne.shadow.radius = V === 'c' ? 6 : 3;
sonne.shadow.bias = -0.0005;
scene.add(sonne);
if (V === 'c') { const rand = new THREE.DirectionalLight('#ffd2a0', 0.8); rand.position.set(40, 20, -40); scene.add(rand); }

// ---------------------------------------------------------------- Materialien

const toonVerlauf = (() => {
  const d = new Uint8Array([90, 170, 255]);
  const t = new THREE.DataTexture(d, 3, 1, THREE.RedFormat);
  t.minFilter = THREE.NearestFilter; t.magFilter = THREE.NearestFilter; t.needsUpdate = true;
  return t;
})();
const matCache = new Map<string, THREE.Material>();
function mat(farbe: string): THREE.Material {
  let m = matCache.get(farbe);
  if (m) return m;
  if (S.toon) m = new THREE.MeshToonMaterial({ color: farbe, gradientMap: toonVerlauf });
  else if (V === 'c') m = new THREE.MeshStandardMaterial({ color: farbe, roughness: 0.95, vertexColors: true });
  else m = new THREE.MeshStandardMaterial({ color: farbe, roughness: 0.78 });
  matCache.set(farbe, m);
  return m;
}
const umrissMat = new THREE.MeshBasicMaterial({ color: '#1a120c', side: THREE.BackSide });

/** Bilderbuch: Verlauf von unten dunkler nach oben heller, wie gemalt. */
function malVerlauf(g: THREE.BufferGeometry) {
  if (V !== 'c') return;
  g.computeBoundingBox();
  const b = g.boundingBox!, p = g.attributes.position;
  const c = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const t = (p.getY(i) - b.min.y) / Math.max(0.001, b.max.y - b.min.y);
    const k = 0.78 + 0.28 * t + (Math.sin(p.getX(i) * 3.1 + p.getZ(i) * 2.3) * 0.03);
    c[i * 3] = c[i * 3 + 1] = c[i * 3 + 2] = k;
  }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
}

/** Teil in die Gruppe: Mesh mit Stil-Material, Schatten, bei B mit Umriss (umgedrehte, etwas größere Hülle). */
function teil(g: THREE.Object3D, geo: THREE.BufferGeometry, farbe: string, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0): THREE.Mesh {
  malVerlauf(geo);
  const m = new THREE.Mesh(geo, mat(farbe));
  m.position.set(x, y, z); m.rotation.set(rx, ry, rz);
  m.castShadow = true; m.receiveShadow = true;
  if (S.umriss) {
    const u = new THREE.Mesh(geo, umrissMat);
    geo.computeBoundingSphere();
    const r = geo.boundingSphere!.radius;
    u.scale.setScalar(1 + Math.min(0.12, 0.09 / Math.max(0.3, r)));
    m.add(u);
  }
  g.add(m);
  return m;
}
const kiste = (w: number, h: number, d: number) => (S.rund > 0.01 ? new RoundedBoxGeometry(w, h, d, 2, Math.min(0.3, Math.min(w, h, d) * S.rund)) : new THREE.BoxGeometry(w, h, d));
const seg = V === 'c' ? 16 : V === 'b' ? 10 : 12;

// ---------------------------------------------------------------- Boden, Weg, Bäume

const boden = new THREE.CircleGeometry(400, 96).rotateX(-Math.PI / 2);
{
  const p = boden.attributes.position, c = new Float32Array(p.count * 3);
  const a = new THREE.Color(S.gras), b = new THREE.Color(S.gras2), x = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    const n = 0.5 + 0.5 * Math.sin(p.getX(i) * 0.21) * Math.cos(p.getZ(i) * 0.17);
    x.copy(a).lerp(b, n * (V === 'b' ? 0.5 : 0.8));
    c.set([x.r, x.g, x.b], i * 3);
  }
  boden.setAttribute('color', new THREE.BufferAttribute(c, 3));
  const m = new THREE.Mesh(boden, S.toon ? new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toonVerlauf }) : new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }));
  m.receiveShadow = true;
  scene.add(m);
}
// Erdpfad vom Haus zur Fahne und weiter
const weg = new THREE.Group(); scene.add(weg);
for (let i = 0; i < 14; i++) {
  const t = i / 13;
  const x = -2 + t * 26, z = 7 + Math.sin(t * 3) * 3;
  const g = new THREE.CylinderGeometry(2.1, 2.3, 0.12, seg).scale(1.4, 1, 1);
  const m = teil(weg, g, S.erde, x, 0.06, z, 0, t * 0.6, 0);
  m.castShadow = false;
  if (S.umriss) m.children.length = 0;
}

function baum(x: number, z: number, s: number, art: number) {
  const g = new THREE.Group(); g.position.set(x, 0, z); g.scale.setScalar(s); scene.add(g);
  teil(g, new THREE.CylinderGeometry(0.35, 0.5, 3, seg), '#7a5236', 0, 1.5, 0);
  if (art === 0) {
    // Buche: Kugelkrone in Tupfen
    const krone = V === 'b' ? '#4caa3a' : V === 'c' ? '#7fa65a' : '#4f8f3a';
    teil(g, new THREE.SphereGeometry(2.4, seg, seg - 2), krone, 0, 4.4, 0);
    teil(g, new THREE.SphereGeometry(1.7, seg, seg - 2), krone, 1.5, 3.8, 0.6);
    teil(g, new THREE.SphereGeometry(1.6, seg, seg - 2), krone, -1.3, 4.1, -0.7);
  } else {
    // Fichte: Kegel-Etagen
    const f = V === 'b' ? '#2f8a4a' : V === 'c' ? '#5f8a62' : '#2f6a3c';
    for (let k = 0; k < 3; k++) teil(g, new THREE.ConeGeometry(2.4 - k * 0.6, 2.8, seg), f, 0, 3 + k * 1.6, 0);
  }
}
baum(-16, -8, 1.3, 0); baum(-21, 4, 1.0, 1); baum(16, -14, 1.2, 1); baum(25, -4, 1.0, 0); baum(-12, 18, 0.9, 1); baum(30, 14, 1.1, 0);

// ---------------------------------------------------------------- Fachwerk-Wohnhaus

function haus(x: number, z: number, ry: number, w: number, d: number, stock: number, mitBlumen: boolean) {
  const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = ry; scene.add(g);
  const h = stock * 3.2;
  teil(g, kiste(w + 0.6, 1.2, d + 0.6), S.sockel, 0, 0.6, 0);
  // Wände leicht schief (Comic: deutlich)
  const korpus = new THREE.Group(); korpus.position.y = 1.2; korpus.rotation.z = S.schief * 0.5; g.add(korpus);
  teil(korpus, kiste(w, h, d), S.wand, 0, h / 2, 0);
  // Balken: Eckpfosten, Schwellen, Riegel, Streben (vorne und an der Seite)
  const b = 0.32;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) teil(korpus, kiste(b, h, b), S.balken, sx * w / 2, h / 2, sz * d / 2);
  for (let f = 0; f <= stock; f++) {
    for (const sz of [-1, 1]) teil(korpus, kiste(w + 0.2, b, b), S.balken, 0, f * 3.2, sz * (d / 2 + 0.02));
    for (const sx of [-1, 1]) teil(korpus, kiste(b, b, d + 0.2), S.balken, sx * (w / 2 + 0.02), f * 3.2, 0);
  }
  const n = Math.round(w / 2.2);
  for (let f = 0; f < stock; f++) {
    for (let i = 1; i < n; i++) teil(korpus, kiste(b * 0.8, 3.2, b * 0.8), S.balken, -w / 2 + (w * i) / n, f * 3.2 + 1.6, d / 2 + 0.03, 0, 0, (i % 2 ? 1 : -1) * S.schief);
    const lang = Math.hypot(w / n, 3.2);
    teil(korpus, kiste(b * 0.7, lang, b * 0.7), S.balken, -w / 2 + w / n / 2, f * 3.2 + 1.6, d / 2 + 0.05, 0, 0, Math.atan2(w / n, 3.2));
    teil(korpus, kiste(b * 0.7, lang, b * 0.7), S.balken, w / 2 - w / n / 2, f * 3.2 + 1.6, d / 2 + 0.05, 0, 0, -Math.atan2(w / n, 3.2));
    // Fenster mit Läden und Blumenkasten
    for (let i = 1; i < n - 1; i += 2) {
      const cx = -w / 2 + (w * (i + 0.5)) / n, cy = f * 3.2 + 1.7;
      teil(korpus, kiste(1.1, 1.3, 0.12), '#3b5a78', cx, cy, d / 2 + 0.05);
      teil(korpus, kiste(1.2, 0.12, 0.14), S.balken, cx, cy, d / 2 + 0.1);
      for (const sx of [-1, 1]) teil(korpus, kiste(0.5, 1.4, 0.1), S.laden, cx + sx * 0.85, cy, d / 2 + 0.12, 0, sx * (V === 'b' ? 0.5 : 0.25), 0);
      if (mitBlumen) {
        teil(korpus, kiste(1.3, 0.35, 0.45), '#7a4f30', cx, cy - 0.85, d / 2 + 0.3);
        for (let k = -1; k <= 1; k++) teil(korpus, new THREE.SphereGeometry(0.24, 8, 6), (k + f) % 2 ? '#e0392b' : '#f2b829', cx + k * 0.4, cy - 0.55, d / 2 + 0.32);
      }
    }
  }
  // Tür mit Vordach
  teil(korpus, kiste(1.3, 2.3, 0.15), '#6a3f22', w * 0.28, 1.15, d / 2 + 0.06);
  teil(korpus, kiste(1.9, 0.12, 0.9), S.dach, w * 0.28, 2.6, d / 2 + 0.45, 0.25, 0, 0);
  // Dach: zwei Flächen mit Überstand, First leicht durchhängend (schief)
  const dh = d * S.dachH * 0.62, ue = S.ueberstand;
  const flaeche = Math.hypot(d / 2 + ue, dh);
  const neig = Math.atan2(dh, d / 2 + ue);
  const dach = new THREE.Group(); dach.position.y = 1.2 + h; dach.rotation.z = S.schief; g.add(dach);
  for (const sz of [-1, 1]) {
    teil(dach, kiste(w + ue * 2.4, 0.35, flaeche + 0.2), S.dach, 0, dh / 2, sz * (d / 2 + ue) / 2, sz * neig, 0, 0);
    // Ziegelreihen
    for (let k = 1; k < 4; k++) {
      const t = k / 4;
      teil(dach, kiste(w + ue * 2.4, 0.12, 0.12), new THREE.Color(S.dach).multiplyScalar(0.8).getStyle(), 0, dh * (1 - t) + 0.25, sz * (d / 2 + ue) * t, 0, 0, 0);
    }
  }
  teil(dach, kiste(w + ue * 2.6, 0.4, 0.5), new THREE.Color(S.dach).multiplyScalar(0.75).getStyle(), 0, dh + 0.1, 0);
  // Giebel ausgefüllt
  const giebel = new THREE.Shape([new THREE.Vector2(-d / 2, 0), new THREE.Vector2(d / 2, 0), new THREE.Vector2(0, dh)]);
  for (const sx of [-1, 1]) teil(dach, new THREE.ShapeGeometry(giebel).rotateY(Math.PI / 2), S.wand, sx * (w / 2 - 0.01), 0, 0, 0, sx > 0 ? 0 : Math.PI, 0);
  // Schornstein mit Rauch
  teil(dach, kiste(0.9, 2.6, 0.9), '#8a5a48', w * 0.25, dh * 0.85, -d * 0.12, 0, 0, -S.schief);
  for (let k = 0; k < 3; k++) {
    const r = teil(dach, new THREE.SphereGeometry(0.55 + k * 0.25, 10, 8), '#e8e8e8', w * 0.25 + k * 0.5, dh * 0.85 + 2 + k * 0.9, -d * 0.12 - k * 0.2);
    r.castShadow = false;
  }
  return g;
}
haus(-4, -2, 0.15, 10, 7, 2, true);
// kleiner Schuppen mit Holzstapel
{
  const g = haus(12, -8, -0.35, 6, 5, 1, false);
  for (let k = 0; k < 9; k++) {
    const l = teil(g, new THREE.CylinderGeometry(0.35, 0.35, 2.6, seg), '#9a6a40', -4.6, 0.4 + Math.floor(k / 3) * 0.66, -1 + (k % 3) * 0.72 + (Math.floor(k / 3) % 2) * 0.35, Math.PI / 2, 0, 0);
    teil(l, new THREE.CylinderGeometry(0.3, 0.3, 2.62, seg), '#e2c08a', 0, 0, 0);
  }
}

// ---------------------------------------------------------------- Waren (lesbar)

function ware(g: THREE.Object3D, art: 'kaese' | 'krug' | 'bretter' | 'sack' | 'flasche', x: number, y: number, z: number) {
  const w = new THREE.Group(); w.position.set(x, y, z); g.add(w);
  if (art === 'kaese') {
    teil(w, new THREE.CylinderGeometry(0.8, 0.8, 0.55, seg + 4, 1, false, 0.6, Math.PI * 2 - 0.6), '#f2c230', 0, 0.28, 0);
    teil(w, new THREE.BoxGeometry(0.78, 0.53, 0.02), '#fbe28a', Math.sin(0.6) * 0.38, 0.28, Math.cos(0.6) * 0.38, 0, 0.6 + Math.PI / 2, 0);
  } else if (art === 'krug') {
    teil(w, new THREE.SphereGeometry(0.55, seg, seg - 2), '#a9b0b8', 0, 0.55, 0);
    teil(w, new THREE.CylinderGeometry(0.22, 0.36, 0.4, seg), '#a9b0b8', 0, 1.05, 0);
    teil(w, new THREE.CylinderGeometry(0.57, 0.57, 0.12, seg), '#2f4f9a', 0, 0.55, 0);
  } else if (art === 'bretter') {
    for (let i = 0; i < 4; i++) teil(w, kiste(2.1, 0.18, 0.9), i % 2 ? '#e8c890' : '#d8b47a', (i % 2 - 0.5) * 0.15, 0.1 + i * 0.19, 0);
  } else if (art === 'sack') {
    teil(w, new THREE.SphereGeometry(0.6, seg, seg - 2).scale(1, 0.95, 0.9), '#d8c08a', 0, 0.55, 0);
    teil(w, new THREE.ConeGeometry(0.3, 0.45, seg), '#cfb57c', 0, 1.15, 0);
  } else {
    teil(w, new THREE.CylinderGeometry(0.22, 0.22, 0.8, seg), '#cfe6dc', 0, 0.4, 0);
    teil(w, new THREE.CylinderGeometry(0.09, 0.22, 0.25, seg), '#cfe6dc', 0, 0.92, 0);
    teil(w, new THREE.CylinderGeometry(0.1, 0.1, 0.18, seg), '#b03a2e', 0, 1.12, 0);
  }
  return w;
}

// Fahne mit Warenstapel
{
  const g = new THREE.Group(); g.position.set(10, 0, 9); scene.add(g);
  teil(g, new THREE.CylinderGeometry(0.15, 0.18, 6, 8), '#6a4a2e', 0, 3, 0);
  const tuch = teil(g, kiste(2.2, 1.4, 0.08), '#c8402e', 1.15, 5.2, 0, 0, 0, V === 'b' ? -0.12 : -0.05);
  teil(tuch, kiste(2.25, 0.3, 0.1), '#e0a830', 0, -0.2, 0);
  ware(g, 'kaese', 1.4, 0, 1.2); ware(g, 'krug', -1.2, 0, 1.0); ware(g, 'bretter', 0.6, 0, -1.4); ware(g, 'sack', -1.5, 0, -0.9);
}

// ---------------------------------------------------------------- Figuren: Träger und beschwipster Bote

function figur(x: number, z: number, ry: number, tracht: string, kappe: string, last: 'kaese' | 'sack' | null, bote: boolean) {
  const s = 2.4;
  const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = ry; g.scale.setScalar(s); scene.add(g);
  const k = S.kopf, bu = S.bauch, kr = S.krumm;
  const koerper = new THREE.Group(); g.add(koerper);
  if (bote) { koerper.rotation.z = 0.28; koerper.position.x = -0.15; }
  // krumme Beine im Schritt, große Stiefel
  for (const sx of [-1, 1]) {
    const bein = new THREE.Group(); bein.position.set(sx * 0.13, 0.42, 0); bein.rotation.x = sx * 0.35; koerper.add(bein);
    teil(bein, new THREE.CylinderGeometry(0.1, 0.09, 0.26, seg), '#6b4a2e', sx * 0.05 * kr, -0.1, 0, 0, 0, sx * 0.35 * kr);
    teil(bein, new THREE.CylinderGeometry(0.09, 0.08, 0.24, seg), '#6b4a2e', sx * 0.06 * kr, -0.3, 0.02, 0, 0, -sx * 0.3 * kr);
    teil(bein, kiste(0.2, 0.12, 0.34), '#2c2118', sx * 0.02, -0.42, 0.08);
  }
  // Bauch mit Gürtel
  teil(koerper, new THREE.SphereGeometry(0.3 * bu, seg, seg - 2).scale(1, 1.05, 0.95), tracht, 0, 0.66, 0);
  teil(koerper, new THREE.CylinderGeometry(0.3 * bu, 0.3 * bu, 0.07, seg), '#4a3220', 0, 0.56, 0);
  teil(koerper, kiste(0.1, 0.08, 0.03), '#e8c14a', 0, 0.56, 0.3 * bu);
  // großer Kopf, Knollennase, Augen, Schnauzer
  const kopf = new THREE.Group(); kopf.position.y = 1.05 + 0.08 * (k - 1); kopf.scale.setScalar(k); koerper.add(kopf);
  teil(kopf, new THREE.SphereGeometry(0.3, seg, seg - 2), '#f1bf96', 0, 0, 0);
  teil(kopf, new THREE.SphereGeometry(bote ? 0.15 : 0.11, seg, seg - 2).scale(1, 0.95, 1.05), bote ? '#d6262a' : '#e98a73', 0, -0.04, 0.3);
  for (const sx of [-1, 1]) {
    teil(kopf, new THREE.SphereGeometry(0.07, 8, 6), '#ffffff', sx * 0.11, 0.07, 0.25);
    teil(kopf, new THREE.SphereGeometry(0.035, 6, 5), '#1b1b1b', sx * 0.11 + (bote ? sx * -0.02 : 0), 0.07, 0.31);
    teil(kopf, kiste(0.15, 0.03, 0.03), '#5a3b26', sx * 0.11, 0.17, 0.27, 0, 0, sx * (bote ? -0.3 : 0.2));
    teil(kopf, new THREE.SphereGeometry(0.07, 8, 6), bote ? '#e8483a' : '#f0a08a', sx * 0.2, -0.07, 0.19);
  }
  teil(kopf, kiste(0.28, 0.07, 0.05), '#b5835a', 0, -0.15, 0.27);
  // Kappe (beim Boten schief)
  const kap = new THREE.Group(); kap.position.y = 0.13; if (bote) kap.rotation.z = 0.45; kopf.add(kap);
  teil(kap, new THREE.SphereGeometry(0.32, seg, 6, 0, Math.PI * 2, 0, Math.PI / 2), kappe, 0, 0, 0);
  teil(kap, kiste(0.4, 0.05, 0.2), new THREE.Color(kappe).multiplyScalar(0.7).getStyle(), 0, 0.06, 0.3, -0.25, 0, 0);
  teil(kap, new THREE.SphereGeometry(0.08, 8, 6), '#f3e9d2', 0, 0.34, 0);
  // Arme: mit Last hoch, sonst schwingend; Bote mit Flasche
  for (const sx of [-1, 1]) {
    const arm = new THREE.Group(); arm.position.set(sx * 0.32 * bu, 0.84, 0); koerper.add(arm);
    if (last) arm.rotation.set(-3.0, 0, sx * 0.35); else arm.rotation.x = sx * 0.5;
    if (bote && sx < 0) arm.rotation.set(-0.6, 0, -0.5);
    teil(arm, new THREE.CylinderGeometry(0.08, 0.07, 0.36, seg), tracht, 0, -0.18, 0);
    teil(arm, new THREE.SphereGeometry(0.09, 8, 6), '#f1bf96', 0, -0.38, 0);
    if (bote && sx < 0) ware(arm, 'flasche', 0, -0.55, 0.1).scale.setScalar(0.45);
  }
  if (last) ware(koerper, last, 0, 1.5 + 0.35 * (k - 1), -0.05).scale.setScalar(0.5);
  // Hicks-Bläschen
  if (bote) for (let i = 0; i < 3; i++) {
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.06 + i * 0.03, 10, 8), new THREE.MeshStandardMaterial({ color: '#ffffff', transparent: true, opacity: 0.8, roughness: 0.2 }));
    b.position.set(0.15 + i * 0.12, 1.6 + i * 0.22, 0.1);
    g.add(b);
  }
}
const zurKamera = (x: number, z: number, seitlich: number) => Math.atan2(kamera.position.x - x, kamera.position.z - z) + seitlich;
figur(3, 9, zurKamera(3, 9, 0.6), '#3f6fb5', '#c0392b', 'kaese', false);
figur(13, 12, zurKamera(13, 12, -0.7), '#4f8a4a', '#c0392b', 'sack', false);
figur(8, 5, zurKamera(8, 5, 0.2), '#8a5a9a', '#2f7a3c', null, true);

// ---------------------------------------------------------------- Bild

renderer.render(scene, kamera);
(window as unknown as { stilFertig: boolean }).stilFertig = true;
addEventListener('resize', () => { renderer.setSize(innerWidth, innerHeight); kamera.aspect = innerWidth / innerHeight; kamera.updateProjectionMatrix(); renderer.render(scene, kamera); });
