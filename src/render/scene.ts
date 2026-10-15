// Renderer, Licht, Dunst und Umgebung.
import * as THREE from 'three';
import { Sky } from 'three/examples/jsm/objects/Sky.js';

export class Stage {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly sun: THREE.DirectionalLight;
  readonly sunDir = new THREE.Vector3();
  private fogColor = new THREE.Color('#b9c8cf');

  constructor(container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(this.renderer.domElement);

    this.scene.background = this.fogColor;
    this.scene.fog = new THREE.Fog(this.fogColor, 4000, 30000);

    // Sonne aus Nordwesten-Westen, mittlere Höhe: plastisches Relief
    const elev = THREE.MathUtils.degToRad(32), azim = THREE.MathUtils.degToRad(-125);
    this.sunDir.set(Math.cos(elev) * Math.sin(azim), Math.sin(elev), -Math.cos(elev) * Math.cos(azim)).normalize();
    this.sun = new THREE.DirectionalLight('#ffeccc', 3.2);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(4096, 4096);
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 1.5;
    this.scene.add(this.sun, this.sun.target);
    this.scene.add(new THREE.HemisphereLight('#c4d8ea', '#3e4a2a', 0.55));

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
    const span = Math.min(distance * 1.4, 9000);
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

  resize(w: number, h: number) {
    this.renderer.setSize(w, h);
  }
}
