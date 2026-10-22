// Kontaktschatten (Gutachter: „nichts schwebt“): weicher dunkler Fleck am Boden unter Kleinkram, Tieren und Figuren. Eine flache
// Instanz-Scheibe mit radialem Verlauf, durchsichtig, ohne Tiefenschreiben; ergänzt die Schattenkarte, die kleine Dinge aus der
// Spielhöhe kaum zeigt. Jeder Darsteller (Leben, Träger, Arbeiter) hat seinen eigenen Satz.
import * as THREE from 'three';
import { Instanzen } from './instanzen';

let textur: THREE.Texture | null = null;
function fleck(): THREE.Texture {
  if (textur) return textur;
  const n = 64, c = document.createElement('canvas');
  c.width = c.height = n;
  const g = c.getContext('2d')!;
  const v = g.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 2);
  v.addColorStop(0, 'rgba(0,0,0,1)'); v.addColorStop(0.45, 'rgba(0,0,0,0.75)'); v.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = v; g.fillRect(0, 0, n, n);
  textur = new THREE.CanvasTexture(c);
  return textur;
}

/** Stärke der Kontaktschatten (Deckkraft in der Mitte). */
export const KONTAKT_STAERKE = 0.55;

export class Kontaktschatten {
  private satz: Instanzen;
  private m = new THREE.Matrix4(); private q = new THREE.Quaternion();
  private p = new THREE.Vector3(); private s = new THREE.Vector3();

  constructor(group: THREE.Object3D, kap = 64) {
    const mat = new THREE.MeshBasicMaterial({
      color: '#1e1608', alphaMap: typeof document === 'undefined' ? null : fleck(), transparent: true, opacity: KONTAKT_STAERKE, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, fog: true,
    });
    this.satz = new Instanzen(group, new THREE.PlaneGeometry(1, 1), mat, false, false, [], kap);
    this.satz.mesh.renderOrder = 1;
  }

  beginne(): void { this.satz.beginne(); }
  fertig(): void { this.satz.fertig(); }
  get anzahl(): number { return this.satz.n; }

  /** Fleck bei (x, y, z) am Boden mit Radius r (m), gestreckt um `lang` entlang der Blickrichtung yaw. */
  setze(x: number, y: number, z: number, r: number, yaw = 0, lang = 1): void {
    this.q.setFromAxisAngle(Y, yaw).multiply(FLACH);
    this.m.compose(this.p.set(x, y + 0.25, z), this.q, this.s.set(2 * r, 2 * r * lang, 1));
    this.satz.fuege(this.m);
  }
}
const Y = new THREE.Vector3(0, 1, 0);
const FLACH = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
