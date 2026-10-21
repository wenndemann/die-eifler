// Bilderbuch-Pass (Drehbuch 7, Stil „Wimmelbuch kräftig mit Linie“, STIL.md): Die Szene wird in ein Zwischenbild gerechnet, dann
// zieht ein Vollbild-Pass eine feine braune Linie an Tiefensprüngen (Umrisse von Häusern, Figuren, Bäumen – nicht am Gelände, das
// Alpha 0 schreibt) und gibt
// den Farben mehr Kraft und Wärme. Tonwertkurve und Farbraum kommen erst hier dazu (die Szene selbst rechnet linear).
// Auf „Niedrig“ aus: dann zeichnet die Bühne direkt.
import * as THREE from 'three';

/** Stilwerte (STIL.md): Linienfarbe, Linienstärke in Pixeln, Empfindlichkeit, Sättigung, Wärme. */
export const BUCH = {
  linie: new THREE.Color('#5a3622'),
  dicke: 1.1,
  schwelle: 0.014,
  deckkraft: 0.85,
  saettigung: 1.28,
  waerme: 0.035,
};

const VERT = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

const FRAG = /* glsl */ `
#include <common>
uniform sampler2D tFarbe; uniform sampler2D tTiefe;
uniform vec2 uPixel; uniform float uNah; uniform float uFern;
uniform vec3 uLinie; uniform float uDicke; uniform float uSchwelle; uniform float uDeck; uniform float uSatt; uniform float uWarm;
varying vec2 vUv;
float tiefe(vec2 uv) {
  float z = texture2D(tTiefe, uv).x * 2.0 - 1.0;
  return (2.0 * uNah * uFern) / (uFern + uNah - z * (uFern - uNah));
}
void main() {
  vec4 c = texture2D(tFarbe, vUv);
  // Linie: relativer Tiefensprung zu den vier Nachbarn (Abstand uDicke Pixel)
  float d = tiefe(vUv);
  vec2 o = uPixel * uDicke;
  // acht Nachbarn, je weich gewertet und gemittelt: glatte, feine Linie ohne Treppen
  float kante = 0.0;
  for (int i = 0; i < 8; i++) {
    float a = float(i) * 0.78539816;
    vec2 v = vec2(cos(a), sin(a)) * o;
    kante += smoothstep(uSchwelle, uSchwelle * 3.0, abs(tiefe(vUv + v) - d) / max(d, 1.0));
  }
  kante = min(1.0, kante * 0.34);
  // nur an Objekten (Alpha 1), nicht an Geländefalten (das Gelände schreibt Alpha 0)
  float obj = max(max(max(c.a, texture2D(tFarbe, vUv + vec2(o.x, 0.0)).a), max(texture2D(tFarbe, vUv - vec2(o.x, 0.0)).a, texture2D(tFarbe, vUv + vec2(0.0, o.y)).a)), texture2D(tFarbe, vUv - vec2(0.0, o.y)).a);
  kante *= step(0.5, obj);
  // zur Ferne hin zarter (Übersicht wie gemalt, nicht wie ein Ausmalbild)
  kante *= 1.0 - 0.6 * smoothstep(900.0, 3200.0, d);
  vec3 f = c.rgb;
  // Kraft und Wärme
  float l = dot(f, vec3(0.2126, 0.7152, 0.0722));
  f = mix(vec3(l), f, uSatt);
  f *= vec3(1.0 + uWarm, 1.0, 1.0 - uWarm);
  f = mix(f, uLinie * (0.75 + 0.5 * l), kante * uDeck);
  gl_FragColor = vec4(max(f, vec3(0.0)), 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export class Buchpass {
  private ziel: THREE.WebGLRenderTarget;
  private quad: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  private quadSzene = new THREE.Scene();
  private quadKamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  an = true;

  constructor(private renderer: THREE.WebGLRenderer) {
    this.ziel = new THREE.WebGLRenderTarget(2, 2, { type: THREE.HalfFloatType, samples: 4, depthTexture: new THREE.DepthTexture(2, 2) });
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG, depthTest: false, depthWrite: false, toneMapped: true,
      uniforms: {
        tFarbe: { value: this.ziel.texture }, tTiefe: { value: this.ziel.depthTexture }, uPixel: { value: new THREE.Vector2() },
        uNah: { value: 1 }, uFern: { value: 1000 }, uLinie: { value: BUCH.linie }, uDicke: { value: BUCH.dicke }, uSchwelle: { value: BUCH.schwelle },
        uDeck: { value: BUCH.deckkraft }, uSatt: { value: BUCH.saettigung }, uWarm: { value: BUCH.waerme },
      },
    }));
    this.quad.frustumCulled = false;
    this.quadSzene.add(this.quad);
  }

  /** Größe in Bildschirm-Pixeln (mit Pixelverhältnis). */
  groesse(w: number, h: number): void {
    const p = this.renderer.getPixelRatio();
    const bw = Math.max(2, Math.floor(w * p)), bh = Math.max(2, Math.floor(h * p));
    if (this.ziel.width === bw && this.ziel.height === bh) return;
    this.ziel.setSize(bw, bh);
    this.quad.material.uniforms.uPixel.value.set(1 / bw, 1 / bh);
  }

  zeichne(szene: THREE.Scene, kamera: THREE.Camera): void {
    if (!this.an) { this.renderer.render(szene, kamera); return; }
    const pk = kamera as THREE.PerspectiveCamera;
    const u = this.quad.material.uniforms;
    u.uNah.value = pk.near ?? 1; u.uFern.value = pk.far ?? 1000;
    this.renderer.setRenderTarget(this.ziel);
    this.renderer.render(szene, kamera);
    this.renderer.setRenderTarget(null);
    this.renderer.render(this.quadSzene, this.quadKamera);
  }
}
