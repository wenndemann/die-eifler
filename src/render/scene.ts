// Renderer, Licht, Dunst und Umgebung.
import * as THREE from 'three';
import { Sky } from 'three/examples/jsm/objects/Sky.js';
import { QUALI, type Qualitaet } from './qualitaet';
import { Buchpass } from './buchpass';

export class Stage {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly sun: THREE.DirectionalLight;
  readonly sunDir = new THREE.Vector3();
  // Stil (STIL.md): warmer, heller Dunst wie im Bilderbuch
  private fogColor = new THREE.Color('#d3dccf');
  /** Bilderbuch-Pass: Linie und Farbkraft (aus auf „Niedrig“). */
  readonly buch: Buchpass;

  private quali = QUALI.mittel;
  private breite = 0;
  private hoehe = 0;

  constructor(container: HTMLElement, q: Qualitaet = 'mittel') {
    // Kantenglättung lässt sich nach dem Start nicht mehr ändern: auf „Niedrig“ gleich aus
    this.renderer = new THREE.WebGLRenderer({ antialias: q !== 'niedrig', powerPreference: 'high-performance' });
    this.quali = QUALI[q];
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, this.quali.pixel));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(this.renderer.domElement);
    this.buch = new Buchpass(this.renderer);
    this.buch.an = q !== 'niedrig';

    this.scene.background = this.fogColor;
    this.scene.fog = new THREE.Fog(this.fogColor, 4000, 30000);

    // Sonne aus Nordwesten-Westen, mittlere Höhe: plastisches Relief
    const elev = THREE.MathUtils.degToRad(32), azim = THREE.MathUtils.degToRad(-125);
    this.sunDir.set(Math.cos(elev) * Math.sin(azim), Math.sin(elev), -Math.cos(elev) * Math.cos(azim)).normalize();
    this.sun = new THREE.DirectionalLight('#ffe4bc', 2.75);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(this.quali.schattenKarte, this.quali.schattenKarte);
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 1.5;
    // Stil: Schatten hell und farbig, nie schwarz
    this.sun.shadow.intensity = 0.45;
    this.scene.add(this.sun, this.sun.target);
    // Himmel kühl, Boden warm: weiche, farbige Schatten wie gemalt; Gegenlicht für runde Formen
    this.scene.add(new THREE.HemisphereLight('#d6e6f0', '#9a8058', 1.3));
    const gegen = new THREE.DirectionalLight('#ffd2a0', 0.55);
    gegen.position.set(-this.sunDir.x, 0.35, -this.sunDir.z).multiplyScalar(1000);
    this.scene.add(gegen);

    // Himmel nur als Umgebungs-Reflexion (Wasser, Glanzlichter)
    const sky = new Sky();
    sky.scale.setScalar(1000);
    const u = sky.material.uniforms;
    u.turbidity.value = 6; u.rayleigh.value = 1.6; u.mieCoefficient.value = 0.004; u.mieDirectionalG.value = 0.8;
    u.sunPosition.value.copy(this.sunDir);
    const pm = new THREE.PMREMGenerator(this.renderer);
    const skyScene = new THREE.Scene();
    skyScene.add(sky);
    this.scene.environment = pm.fromScene(skyScene).texture;
    this.scene.environmentIntensity = 0.45;
    pm.dispose();
  }

  /** Schatten-Ausschnitt und Dunst folgen der Kamera. */
  follow(target: THREE.Vector3, distance: number) {
    const span = Math.min(distance * 1.4, this.quali.schattenReichweite);
    const cam = this.sun.shadow.camera;
    cam.left = -span; cam.right = span; cam.top = span; cam.bottom = -span;
    cam.near = 10; cam.far = span * 4 + 4000;
    cam.updateProjectionMatrix();
    this.sun.position.copy(target).addScaledVector(this.sunDir, span * 2 + 2000);
    this.sun.target.position.copy(target);
    const fog = this.scene.fog as THREE.Fog;
    fog.near = distance * 1.3;
    fog.far = distance * 6 + 6000;
  }

  setShadows(on: boolean) {
    this.sun.castShadow = on;
  }

  /** Qualitätsstufe: Pixelverhältnis, Schattenkarte und -reichweite. */
  setQuality(q: Qualitaet) {
    const p = QUALI[q];
    const neueKarte = p.schattenKarte !== this.sun.shadow.mapSize.x;
    this.quali = p;
    if (neueKarte) {
      this.sun.shadow.mapSize.set(p.schattenKarte, p.schattenKarte);
      this.sun.shadow.map?.dispose();
      this.sun.shadow.map = null;
    }
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, p.pixel));
    if (this.breite) { this.renderer.setSize(this.breite, this.hoehe); this.buch.groesse(this.breite, this.hoehe); }
    this.buch.an = q !== 'niedrig';
  }

  /** Ein Bild: mit Bilderbuch-Pass (Linie, Farbkraft) oder direkt. */
  zeichne(kamera: THREE.Camera) {
    this.buch.zeichne(this.scene, kamera);
  }

  resize(w: number, h: number) {
    this.breite = w; this.hoehe = h;
    this.renderer.setSize(w, h);
    this.buch.groesse(w, h);
  }
}
