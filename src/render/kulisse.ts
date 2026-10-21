// Kulisse (Drehbuch 3.1): Land außerhalb des Spielfeld-Hex ist leicht ausgegraut und verschwindet am Rand im Dunst.
// Gemeinsame Uniforms und GLSL für Gelände, Wald, Wasser, Flüsse und Bahn.
import * as THREE from 'three';

export const kulisseUniforms = {
  /** Hex (0,0) des globalen Rasters in Ausschnitt-Koordinaten. */
  uKOrigin: { value: new THREE.Vector2() },
  /** Mittel-Hex des Spielfelds (q, r) und Radius in Hexen. */
  uKPlay: { value: new THREE.Vector3() },
  uKOn: { value: 1 },
  /** Schnee im Winter (Drehbuch 7.4): 0 kein, 1 ganz weiß; die Spiel-Schicht blendet ihn mit der Jahreszeit ein und aus. */
  uSchnee: { value: 0 },
};

/** Schneedecke setzen (0..1), wirkt auf Gelände und Wald. */
export function setzeSchnee(anteil: number) {
  kulisseUniforms.uSchnee.value = Math.max(0, Math.min(1, anteil));
  if (typeof document !== 'undefined') document.body.classList.toggle('schnee', anteil > 0.5);   // Minikarte im Winter weiß
}

export function setzeKulisse(originX: number, originZ: number, q: number, r: number, radius: number) {
  kulisseUniforms.uKOrigin.value.set(-originX, -originZ);
  kulisseUniforms.uKPlay.value.set(q, r, radius);
}

/** Hex-Abstand ab dem die Kulisse zugunsten des Dunstes verschwindet (Anfang, Ende). */
export const FADE_HEX = [8, 17] as const;

export const KULISSE_GLSL = /* glsl */ `
uniform vec2 uKOrigin; uniform vec3 uKPlay; uniform float uKOn; uniform float uSchnee;
// Schnee: weiß-bläulich, k 0..1 wie stark er liegen bleibt
vec3 kSchnee(vec3 c, float k){ return mix(c, vec3(0.93, 0.95, 0.99), clamp(uSchnee * k, 0.0, 1.0)); }
vec2 kHexRound(vec2 a){ vec3 c=vec3(a.x, a.y, -a.x-a.y); vec3 r=floor(c+0.5); vec3 d=abs(r-c);
  if(d.x>d.y && d.x>d.z) r.x=-r.y-r.z; else if(d.y>d.z) r.y=-r.x-r.z; return r.xy; }
vec2 kFrac(vec2 xz){ vec2 p = xz - uKOrigin; return vec2((0.57735027 * p.x - p.y / 3.0) / 60.0, p.y / 90.0); }
float kDist(vec2 a){ vec2 d = a - uKPlay.xy; return (abs(d.x) + abs(d.y) + abs(d.x + d.y)) * 0.5; }
// 0 im Spielfeld, 1 in der Kulisse (hex-genau)
float kOut(vec2 xz){ return uKOn * step(uKPlay.z + 0.5, kDist(kHexRound(kFrac(xz)))); }
// 0 .. 1: Kulisse löst sich im Dunst auf
float kFade(vec2 xz){ return uKOn * smoothstep(uKPlay.z + ${FADE_HEX[0].toFixed(1)}, uKPlay.z + ${FADE_HEX[1].toFixed(1)}, kDist(kFrac(xz))); }
vec3 kGrau(vec3 c, float k){ float l = dot(c, vec3(0.299, 0.587, 0.114)); return mix(c, vec3(l) * 1.1 + 0.025, 0.58 * k); }
`;

/** Ersetzt fog_fragment: normaler Nebel, danach die Kulisse zur Nebelfarbe hin ausblenden. */
export const KULISSE_FOG = /* glsl */ `
#include <fog_fragment>
#ifdef USE_FOG
gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, vKFade);
#endif
`;

/**
 * Schnee auf Dächern, Felsen und Kleinkram (Drehbuch 7.4, STIL.md): nach oben zeigende Flächen werden mit uSchnee weiß.
 * Hängt sich an ein vorhandenes onBeforeCompile an.
 */
export function mitSchnee<M extends THREE.Material>(mat: M, staerke = 0.85): M {
  const vorher = mat.onBeforeCompile;
  mat.onBeforeCompile = (shader, renderer) => {
    vorher.call(mat, shader, renderer);
    shader.uniforms.uSchnee = kulisseUniforms.uSchnee;
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uSchnee;')
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
{
  vec3 obenV = normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz);
  float auf = smoothstep(0.5, 0.9, dot(normal, obenV));
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.97, 0.96, 0.93), clamp(uSchnee * auf * ${staerke.toFixed(2)}, 0.0, 1.0));
}`);
  };
  return mat;
}
