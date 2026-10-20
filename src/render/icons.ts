// Icons aus den 3D-Modellen (DESIGN §9.1, ROADMAP M7): Waren und Gebäude einmal beim Start mit demselben Licht und denselben
// Vertexfarben wie in der Welt in kleine Bilder gerendert, damit Welt und Oberfläche aus einem Guss sind. Ohne WebGL bleiben die
// Zeichen aus den Daten (Emoji) als Ersatz.
import * as THREE from 'three';
import { GEBAEUDE_IDS, WAREN } from '../sim/daten';
import { gebaeudeGeometrie } from './gebaeude';
import { warenGeometrie } from './waren';

export interface Icons { ware: (string | undefined)[]; gebaeude: Record<string, string | undefined> }

const GROESSE = 96;
let fertig: Icons | null = null;

/** Alle Icons (beim ersten Aufruf gerendert, dann aus dem Speicher). */
export function icons(): Icons {
  if (fertig) return fertig;
  fertig = { ware: [], gebaeude: {} };
  let renderer: THREE.WebGLRenderer | null = null;
  try {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = GROESSE;
    renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(1);
    renderer.setSize(GROESSE, GROESSE, false);
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    const szene = new THREE.Scene();
    const sonne = new THREE.DirectionalLight('#ffeccc', 3.2);
    sonne.position.set(-0.6, 1, 0.8);
    szene.add(sonne, new THREE.HemisphereLight('#c4d8ea', '#3e4a2a', 0.9));
    const kamera = new THREE.PerspectiveCamera(28, 1, 0.1, 1000);
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, flatShading: true, side: THREE.DoubleSide });
    const bild = (geo: THREE.BufferGeometry): string | undefined => {
      const m = new THREE.Mesh(geo, mat);
      szene.add(m);
      geo.computeBoundingSphere();
      const k = geo.boundingSphere!;
      const d = k.radius / Math.sin(THREE.MathUtils.degToRad(14)) * 1.02;
      // Blick wie die Spielkamera: von Süden schräg oben, leicht gedreht
      const richt = new THREE.Vector3(0.45, 0.62, 1).normalize();
      kamera.position.copy(k.center).addScaledVector(richt, d);
      kamera.lookAt(k.center);
      renderer!.render(szene, kamera);
      szene.remove(m);
      return renderer!.domElement.toDataURL('image/png');
    };
    WAREN.forEach((_, a) => { fertig!.ware[a] = bild(warenGeometrie(a)); });
    for (const id of GEBAEUDE_IDS) fertig.gebaeude[id] = bild(gebaeudeGeometrie(id));
    mat.dispose();
  } catch {
    fertig = { ware: [], gebaeude: {} };
  } finally {
    renderer?.dispose();
    renderer?.forceContextLoss();
  }
  return fertig;
}
