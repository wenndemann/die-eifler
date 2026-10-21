// Renderer, Licht, Dunst und Umgebung.
import * as THREE from 'three';
import { Sky } from 'three/examples/jsm/objects/Sky.js';
import { QUALI, type Qualitaet } from './qualitaet';
import { Buchpass } from './buchpass';
import { WOLKEN_EBENE } from './wetter';

/** Stimmung aus Tageszeit und Wetter (M12, nur Darstellung): Sonne, Licht, Dunst und Farbton. */
export interface Stimmung {
  /** Tageszeit 0..1 (0 Mitternacht, 0.25 Sonnenaufgang, 0.5 Mittag, 0.75 Sonnenuntergang). */
  tag: number;
  /** So viel Licht bleibt nachts (0..1). */
  nachtLicht: number;
  /** Bewölkung 0..1 (Regen, Schnee, Nebel). */
  wolken: number;
  /** Dürre 0..1: wärmer, blasser. */
  duerre: number;
}

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
  private hemi: THREE.HemisphereLight;
  private gegen: THREE.DirectionalLight;
  private grundDunst = new THREE.Color('#d3dccf');
  private tmp = new THREE.Color();
  private ton1 = new THREE.Color();
  private stimmungSig = '';
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
    // M12: Wolken werfen Schatten, ohne gezeichnet zu werden
    this.sun.shadow.camera.layers.enable(WOLKEN_EBENE);
    this.scene.add(this.sun, this.sun.target);
    // Himmel kühl, Boden warm: weiche, farbige Schatten wie gemalt; Gegenlicht für runde Formen
    this.hemi = new THREE.HemisphereLight('#d6e6f0', '#9a8058', 1.3);
    this.scene.add(this.hemi);
    const gegen = new THREE.DirectionalLight('#ffd2a0', 0.55);
    gegen.position.set(-this.sunDir.x, 0.35, -this.sunDir.z).multiplyScalar(1000);
    this.gegen = gegen;
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
    // weit genug weg, dass auch die Wolken (rund 1 km über dem Gelände) im Schattenfenster liegen, auch bei flacher Sonne
    const weg = Math.max(span * 2 + 2000, 3200 / Math.max(0.2, this.sunDir.y));
    cam.near = 10; cam.far = weg + span * 2 + 2000;
    cam.updateProjectionMatrix();
    this.sun.position.copy(target).addScaledVector(this.sunDir, weg);
    this.sun.target.position.copy(target);
    const fog = this.scene.fog as THREE.Fog;
    fog.near = distance * 1.3;
    fog.far = distance * 6 + 6000;
  }

  /**
   * Tageszeit und Wetter: Sonne wandert von Ost über Süd nach West, morgens und abends warm und flach, nachts kühles Mondlicht
   * (nie ganz dunkel). Wolken dämpfen die Sonne und machen den Dunst grauer, Dürre färbt warm und blass.
   */
  setzeStimmung(st: Stimmung) {
    const sig = `${st.tag.toFixed(4)}|${st.wolken.toFixed(3)}|${st.duerre.toFixed(3)}`;
    if (sig === this.stimmungSig) return;
    this.stimmungSig = sig;
    const e = Math.sin(2 * Math.PI * (st.tag - 0.25));           // −1 Mitternacht … 1 Mittag
    const tag = THREE.MathUtils.smoothstep(e, -0.12, 0.3);       // 0 Nacht … 1 Tag
    const flach = 1 - THREE.MathUtils.smoothstep(e, 0.05, 0.55); // Morgen- und Abendlicht
    // Sonne (nachts der Mond auf der Gegenseite): Höhe 14° bis 48°, Richtung Ost (Morgen) über Süd nach West (Abend)
    const elev = THREE.MathUtils.degToRad(14 + 34 * Math.max(0, Math.abs(e)));
    const phase = e >= -0.12 ? st.tag : (st.tag + 0.5) % 1;
    const azim = THREE.MathUtils.degToRad(-125 + (phase - 0.5) * 150);
    this.sunDir.set(Math.cos(elev) * Math.sin(azim), Math.sin(elev), -Math.cos(elev) * Math.cos(azim)).normalize();
    const licht = st.nachtLicht + (1 - st.nachtLicht) * tag;
    const wolke = 1 - 0.45 * st.wolken;
    this.sun.intensity = 2.75 * (0.25 + 0.75 * tag) * licht * wolke;
    this.sun.color.set('#ffe4bc').lerp(this.tmp.set('#ffa560'), flach * tag * 0.75).lerp(this.tmp.set('#9fb6e8'), 1 - tag);
    this.hemi.intensity = 1.3 * licht * (1 + 0.15 * st.wolken);
    this.hemi.color.set('#d6e6f0').lerp(this.tmp.set('#7d8fbf'), (1 - tag) * 0.7);
    this.gegen.intensity = 0.55 * licht * wolke;
    this.gegen.position.set(-this.sunDir.x, 0.35, -this.sunDir.z).multiplyScalar(1000);
    // Dunst: grau bei Wolken, rosig in der Dämmerung, blau in der Nacht
    const dunst = this.fogColor;
    dunst.copy(this.grundDunst).lerp(this.tmp.set('#b8bfc4'), st.wolken * 0.8).lerp(this.tmp.set('#f0c8a8'), flach * tag * 0.35)
      .lerp(this.tmp.set('#3a4766'), (1 - tag) * 0.75).lerp(this.tmp.set('#e2d2a6'), st.duerre * 0.4);
    // Farbton im Bilderbuch-Pass
    // Farbton im Bilderbuch-Pass: goldenes Morgen- und Abendlicht, blaue Nacht (gedämpft, aber spielbar), graue Regentage
    const gold = flach * tag, nacht = 1 - tag;
    this.buch.stimmung(
      this.tmp.setRGB(1, 1, 1).lerp(this.ton1.setRGB(1.16, 0.93, 0.74), gold).lerp(this.ton1.setRGB(0.5, 0.6, 0.92), nacht * 0.9)
        .multiplyScalar(1 - 0.12 * st.wolken),
      (1 - 0.3 * st.wolken - 0.15 * st.duerre) * (1 - 0.45 * nacht) * (1 + 0.1 * gold), st.duerre * 0.06 + gold * 0.03);
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
