// Icons aus den 3D-Modellen (DESIGN §9.1, ROADMAP M7): Waren und Gebäude mit demselben Licht und denselben Vertexfarben wie in der
// Welt in kleine Bilder gerendert, damit Welt und Oberfläche aus einem Guss sind. Das Rendern blockiert das Laden nicht: Es läuft
// kurz nach dem Start Stück für Stück und landet im Browser-Speicher (Schlüssel aus den Daten), beim nächsten Laden – auch beim
// Wiederbeitritt im Mehrspieler – sind die Icons sofort da. Bis dahin und ohne WebGL zeigen die Fenster die Zeichen aus den Daten.
import * as THREE from 'three';
import { GEBAEUDE_IDS, WAREN, WAREN_FARBE, WAREN_FORM } from '../sim/daten';
import { Fnv2 } from '../welt/pruefsumme';
import { gebaeudeGeometrie } from './gebaeude';
import { warenGeometrie } from './waren';

export interface Icons { ware: (string | undefined)[]; gebaeude: Record<string, string | undefined> }

const GROESSE = 96;
/** Gerendert wird größer und dann auf das Motiv zugeschnitten: Kleinkram am Rand macht das Gebäude sonst winzig (Gutachter). */
const ROH = 256;

/** Auf die sichtbaren Pixel zuschneiden (mit etwas Rand) und quadratisch auf GROESSE bringen. */
function zuschneiden(quelle: HTMLCanvasElement): string {
  const roh = document.createElement('canvas');
  roh.width = roh.height = ROH;
  const r = roh.getContext('2d')!;
  r.drawImage(quelle, 0, 0);
  const px = r.getImageData(0, 0, ROH, ROH).data;
  let x0 = ROH, y0 = ROH, x1 = -1, y1 = -1;
  for (let y = 0; y < ROH; y++) for (let x = 0; x < ROH; x++) {
    if (px[(y * ROH + x) * 4 + 3] < 24) continue;
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  const aus = document.createElement('canvas');
  aus.width = aus.height = GROESSE;
  if (x1 >= 0) {
    const seite = Math.max(x1 - x0, y1 - y0) + 1, rand = 3;
    const sx = (x0 + x1 + 1) / 2 - seite / 2, sy = (y0 + y1 + 1) / 2 - seite / 2;
    const a = aus.getContext('2d')!;
    a.imageSmoothingQuality = 'high';
    a.drawImage(roh, sx, sy, seite, seite, rand, rand, GROESSE - 2 * rand, GROESSE - 2 * rand);
  }
  return aus.toDataURL('image/png');
}
const SPEICHER = 'eifeler.icons';
/** Schlüssel: ändert sich mit Waren (Form, Farbe), Gebäuden und Größe. */
const SCHLUESSEL = (() => {
  const f = new Fnv2();
  f.text(`${GROESSE}|${ROH}|zu|${WAREN.join(',')}|${WAREN_FORM.join(',')}|${WAREN_FARBE.join(',')}|${GEBAEUDE_IDS.join(',')}`);
  return f.hex();
})();

const aktuell: Icons = { ware: [], gebaeude: {} };
let gestartet = false;
const warten: (() => void)[] = [];

/** Die Icons, soweit schon da (sonst leer: dann gelten die Zeichen). Startet beim ersten Aufruf das Laden bzw. Rendern. */
export function icons(): Icons {
  if (!gestartet) starte();
  return aktuell;
}

/** Ruft `f` auf, sobald alle Icons da sind (sofort, wenn sie es schon sind). */
export function wennIconsDa(f: () => void): void {
  if (gestartet && fertig) f(); else warten.push(f);
}

let fertig = false;

function melde(): void {
  fertig = true;
  for (const f of warten.splice(0)) f();
}

function starte(): void {
  gestartet = true;
  try {
    const d = JSON.parse(localStorage.getItem(SPEICHER) ?? 'null') as { schluessel: string; icons: Icons } | null;
    if (d && d.schluessel === SCHLUESSEL && Array.isArray(d.icons?.ware)) {
      aktuell.ware = d.icons.ware; aktuell.gebaeude = d.icons.gebaeude ?? {};
      fertig = true;
      return;
    }
  } catch { /* neu rendern */ }
  // erst rendern, wenn das Spiel läuft (nicht beim Laden der Karte oder beim Wiederbeitritt)
  setTimeout(() => void rendere(), 1500);
}

async function rendere(): Promise<void> {
  let renderer: THREE.WebGLRenderer | null = null;
  const pause = () => new Promise<void>((ok) => setTimeout(ok, 0));
  try {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = ROH;
    renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(1);
    renderer.setSize(ROH, ROH, false);
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    const szene = new THREE.Scene();
    const sonne = new THREE.DirectionalLight('#ffeccc', 3.2);
    sonne.position.set(-0.6, 1, 0.8);
    szene.add(sonne, new THREE.HemisphereLight('#c4d8ea', '#3e4a2a', 0.9));
    const kamera = new THREE.PerspectiveCamera(28, 1, 0.1, 1000);
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide });
    const richt = new THREE.Vector3(0.45, 0.62, 1).normalize();
    const bild = (geo: THREE.BufferGeometry): string => {
      const m = new THREE.Mesh(geo, mat);
      szene.add(m);
      geo.computeBoundingSphere();
      const k = geo.boundingSphere!;
      // Blick wie die Spielkamera: von Süden schräg oben, leicht gedreht
      kamera.position.copy(k.center).addScaledVector(richt, (k.radius / Math.sin(THREE.MathUtils.degToRad(14))) * 1.02);
      kamera.lookAt(k.center);
      renderer!.render(szene, kamera);
      szene.remove(m);
      return zuschneiden(renderer!.domElement);
    };
    const neu: Icons = { ware: [], gebaeude: {} };
    for (let a = 0; a < WAREN.length; a++) { neu.ware[a] = bild(warenGeometrie(a)); await pause(); }
    for (const id of GEBAEUDE_IDS) { neu.gebaeude[id] = bild(gebaeudeGeometrie(id)); await pause(); }
    mat.dispose();
    aktuell.ware = neu.ware; aktuell.gebaeude = neu.gebaeude;
    try { localStorage.setItem(SPEICHER, JSON.stringify({ schluessel: SCHLUESSEL, icons: neu })); } catch { /* Speicher voll: nächstes Mal neu */ }
  } catch { /* ohne WebGL: Zeichen */ } finally {
    renderer?.dispose();
    renderer?.forceContextLoss();
  }
  melde();
}
