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
  /** Lebendige Eifel: Stärke des Leuchtens und der Vignette. */
  leuchten: 0.9,
  vignette: 0.22,
};

const VERT = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

const FRAG = /* glsl */ `
#include <common>
uniform sampler2D tFarbe; uniform sampler2D tTiefe;
uniform vec2 uPixel; uniform float uNah; uniform float uFern;
uniform vec3 uLinie; uniform vec3 uTon; uniform float uAO; uniform float uGlanz; uniform sampler2D tLeuchten; uniform float uLeuchten; uniform float uVignette; uniform float uDicke; uniform float uSchwelle; uniform float uDeck; uniform float uSatt; uniform float uWarm;
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
  // M12 Qualität: weiche Verdeckung aus der Tiefe (Ecken, Fugen, unter Dächern dunkler) und dezentes Leuchten heller Stellen
  if (uAO > 0.0) {
    float r = clamp(9.0 * 400.0 / max(d, 1.0), 2.0, 12.0);
    float occ = 0.0;
    for (int i = 0; i < 8; i++) {
      float a = float(i) * 0.78539816 + 0.39;
      float rr = r * (0.5 + 0.5 * fract(float(i) * 0.618));
      float dn = tiefe(vUv + vec2(cos(a), sin(a)) * uPixel * rr);
      float dz = d - dn;
      occ += smoothstep(0.004 * d, 0.03 * d, dz) * (1.0 - smoothstep(0.06 * d, 0.15 * d, dz));
    }
    f *= 1.0 - uAO * 0.42 * (occ / 8.0);
  }
  if (uGlanz > 0.0) {
    vec3 g = vec3(0.0);
    for (int i = 0; i < 8; i++) {
      float a = float(i) * 0.78539816;
      vec3 s = texture2D(tFarbe, vUv + vec2(cos(a), sin(a)) * uPixel * 6.0).rgb;
      g += max(s - vec3(0.9), vec3(0.0));
    }
    f += uGlanz * 0.18 * g;
  }
  // Lebendige Eifel: weiches Leuchten heller Stellen (Fensterlicht, Feuer, Glitzern) und eine leichte Vignette wie im Bilderbuch
  if (uLeuchten > 0.0) f += texture2D(tLeuchten, vUv).rgb * uLeuchten;
  // Kraft und Wärme
  float l = dot(f, vec3(0.2126, 0.7152, 0.0722));
  f = mix(vec3(l), f, uSatt);
  f *= vec3(1.0 + uWarm, 1.0, 1.0 - uWarm);
  f *= uTon;
  f = mix(f, uLinie * (0.75 + 0.5 * l), kante * uDeck);
  vec2 vv = (vUv - 0.5) * vec2(1.15, 1.0);
  f *= 1.0 - uVignette * smoothstep(0.35, 0.85, length(vv));
  gl_FragColor = vec4(max(f, vec3(0.0)), 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

/** Leuchten: helle Stellen (über der Schwelle) herausziehen und in kleiner Auflösung weichzeichnen (zwei Richtungen). */
const HELL_FRAG = /* glsl */ `
uniform sampler2D tFarbe; uniform float uSchwelle; varying vec2 vUv;
void main() {
  vec3 c = texture2D(tFarbe, vUv).rgb;
  float l = max(c.r, max(c.g, c.b));
  gl_FragColor = vec4(c * smoothstep(uSchwelle, uSchwelle + 0.6, l), 1.0);
}`;
const WEICH_FRAG = /* glsl */ `
uniform sampler2D tBild; uniform vec2 uRichtung; varying vec2 vUv;
void main() {
  vec3 s = texture2D(tBild, vUv).rgb * 0.227;
  s += (texture2D(tBild, vUv + uRichtung * 1.385).rgb + texture2D(tBild, vUv - uRichtung * 1.385).rgb) * 0.316;
  s += (texture2D(tBild, vUv + uRichtung * 3.23).rgb + texture2D(tBild, vUv - uRichtung * 3.23).rgb) * 0.070;
  gl_FragColor = vec4(s, 1.0);
}`;

export class Buchpass {
  private hellA = new THREE.WebGLRenderTarget(2, 2, { type: THREE.HalfFloatType });
  private hellB = new THREE.WebGLRenderTarget(2, 2, { type: THREE.HalfFloatType });
  private hellMat = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: HELL_FRAG, depthTest: false, depthWrite: false, uniforms: { tFarbe: { value: null }, uSchwelle: { value: 1.35 } } });
  private weichMat = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: WEICH_FRAG, depthTest: false, depthWrite: false, uniforms: { tBild: { value: null }, uRichtung: { value: new THREE.Vector2() } } });
  private hilfsSzene = new THREE.Scene();
  private hilfsQuad: THREE.Mesh;
  private leuchten = 0;
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
        uDeck: { value: BUCH.deckkraft }, uSatt: { value: BUCH.saettigung }, uWarm: { value: BUCH.waerme }, uTon: { value: new THREE.Color(1, 1, 1) }, uAO: { value: 0 }, uGlanz: { value: 0 },
        tLeuchten: { value: this.hellA.texture }, uLeuchten: { value: 0 }, uVignette: { value: BUCH.vignette },
      },
    }));
    this.quad.frustumCulled = false;
    this.quadSzene.add(this.quad);
    this.hilfsQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.hellMat);
    this.hilfsQuad.frustumCulled = false;
    this.hilfsSzene.add(this.hilfsQuad);
  }

  /** Größe in Bildschirm-Pixeln (mit Pixelverhältnis). */
  groesse(w: number, h: number): void {
    const p = this.renderer.getPixelRatio();
    const bw = Math.max(2, Math.floor(w * p)), bh = Math.max(2, Math.floor(h * p));
    if (this.ziel.width === bw && this.ziel.height === bh) return;
    this.ziel.setSize(bw, bh);
    this.quad.material.uniforms.uPixel.value.set(1 / bw, 1 / bh);
    // Leuchten in Viertel-Auflösung
    this.hellA.setSize(Math.max(2, bw >> 2), Math.max(2, bh >> 2));
    this.hellB.setSize(Math.max(2, bw >> 2), Math.max(2, bh >> 2));
  }

  /** Qualitätsstufe (M12): Verdeckung (0..1) und Leuchten (0..1). */
  qualitaet(ao: number, glanz: number, leuchten = 0): void {
    this.quad.material.uniforms.uAO.value = ao;
    this.quad.material.uniforms.uGlanz.value = glanz;
    this.leuchten = leuchten;
    this.quad.material.uniforms.uLeuchten.value = leuchten * BUCH.leuchten;
  }

  /** Stimmung (M12): Farbton (Multiplikator), Faktor auf die Sättigung, zusätzliche Wärme. */
  stimmung(ton: THREE.Color, satt: number, warm: number): void {
    const u = this.quad.material.uniforms;
    (u.uTon.value as THREE.Color).copy(ton);
    u.uSatt.value = BUCH.saettigung * satt;
    u.uWarm.value = BUCH.waerme + warm;
  }

  zeichne(szene: THREE.Scene, kamera: THREE.Camera): void {
    if (!this.an) { this.renderer.render(szene, kamera); return; }
    const pk = kamera as THREE.PerspectiveCamera;
    const u = this.quad.material.uniforms;
    u.uNah.value = pk.near ?? 1; u.uFern.value = pk.far ?? 1000;
    this.renderer.setRenderTarget(this.ziel);
    this.renderer.render(szene, kamera);
    if (this.leuchten > 0) {
      // helle Stellen herausziehen, dann waagerecht und senkrecht weichzeichnen (zweimal, für einen weiten Schein)
      this.hilfsQuad.material = this.hellMat;
      this.hellMat.uniforms.tFarbe.value = this.ziel.texture;
      this.renderer.setRenderTarget(this.hellA); this.renderer.render(this.hilfsSzene, this.quadKamera);
      this.hilfsQuad.material = this.weichMat;
      const r = this.weichMat.uniforms.uRichtung.value as THREE.Vector2, w = this.hellA.width, h = this.hellA.height;
      for (const k of [1, 2]) {
        this.weichMat.uniforms.tBild.value = this.hellA.texture; r.set(k / w, 0);
        this.renderer.setRenderTarget(this.hellB); this.renderer.render(this.hilfsSzene, this.quadKamera);
        this.weichMat.uniforms.tBild.value = this.hellB.texture; r.set(0, k / h);
        this.renderer.setRenderTarget(this.hellA); this.renderer.render(this.hilfsSzene, this.quadKamera);
      }
    }
    this.renderer.setRenderTarget(null);
    this.renderer.render(this.quadSzene, this.quadKamera);
  }
}
