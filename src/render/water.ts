// Stehende Gewässer (Talsperren, Seen, Teiche): OSM-Uferlinie als triangulierte Fläche auf
// Spiegelhöhe. Die Kante hängt damit nicht am Höhenraster (keine Treppen, auch nicht in groben LODs).
// Tiefe für Farbe und Uferschaum kommt aus einer kleinen Textur (Spiegel - Grund je Rasterzelle).
import * as THREE from 'three';
import type { MapData } from '../map/mapdata';
import { KULISSE_GLSL, KULISSE_FOG, kulisseUniforms } from './kulisse';

const DEPTH_MAX = 20; // m, Skala der Tiefen-Textur

export class Water {
  readonly mesh: THREE.Mesh;
  readonly uniforms: { uTime: { value: number }; uDepth: { value: THREE.DataTexture }; uSize: { value: THREE.Vector2 } };

  constructor(map: MapData, base: number) {
    const { width, height } = map.info;
    const tex = new Uint8Array(width * height);
    for (let k = 0; k < tex.length; k++) {
      if (map.water[k] > 0) tex[k] = Math.round(Math.min(1, Math.max(0, (map.water[k] - map.ground[k]) / DEPTH_MAX)) * 255);
    }
    const depth = new THREE.DataTexture(tex, width, height, THREE.RedFormat, THREE.UnsignedByteType);
    depth.magFilter = THREE.LinearFilter;
    depth.minFilter = THREE.LinearFilter;
    depth.needsUpdate = true;
    this.uniforms = { uTime: { value: 0 }, uDepth: { value: depth }, uSize: { value: new THREE.Vector2(map.sizeX, map.sizeZ) } };

    const pos: number[] = [], idx: number[] = [];
    const toVec = (r: number[]) => {
      const v: THREE.Vector2[] = [];
      for (let i = 0; i < r.length; i += 2) v.push(new THREE.Vector2(r[i], r[i + 1]));
      return v;
    };
    for (const lake of map.lakes) {
      const outer = toVec(lake.o), holes = lake.h.map(toVec);
      const tris = THREE.ShapeUtils.triangulateShape(outer, holes);
      const v0 = pos.length / 3;
      const y = lake.l - base + 0.2;
      for (const p of [outer, ...holes].flat()) pos.push(p.x, y, p.y);
      for (const t of tris) idx.push(v0 + t[0], v0 + t[2], v0 + t[1]);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(new Float32Array(pos.length).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
    geo.setIndex(idx);
    geo.computeBoundingSphere();

    const mat = new THREE.MeshStandardMaterial({
      color: '#2f6f8f', roughness: 0.12, metalness: 0.0, transparent: true, depthWrite: false, envMapIntensity: 1.2,
      side: THREE.DoubleSide,
    });
    mat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, this.uniforms, kulisseUniforms);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>
varying vec3 vWPos; uniform float uTime; uniform sampler2D uDepth; uniform vec2 uSize;
float vKFade;
float glitzer(vec2 p, float t) {
  vec2 c = floor(p);
  float h = fract(sin(dot(c, vec2(127.1, 311.7))) * 43758.5453);
  float z = fract(t * (0.35 + 0.4 * h) + h * 7.0);
  float an = smoothstep(0.0, 0.06, z) * (1.0 - smoothstep(0.06, 0.18, z));
  vec2 f = fract(p) - 0.5 + (vec2(h, fract(h * 13.0)) - 0.5) * 0.5;
  return an * (1.0 - smoothstep(0.0, 0.1, length(f))) * step(0.55, h);
}
${KULISSE_GLSL}`)
        .replace('#include <color_fragment>', `#include <color_fragment>
{
  float dpt = texture2D(uDepth, vWPos.xz / uSize).r * ${DEPTH_MAX.toFixed(1)};
  vec3 shallow = vec3(0.16, 0.42, 0.42), deep = vec3(0.04, 0.16, 0.26);
  diffuseColor.rgb = mix(shallow, deep, smoothstep(0.0, 14.0, dpt));
  float fdist = length(vWPos - cameraPosition);
  float foam = (1.0 - smoothstep(0.2, 1.6, dpt)) * (1.0 - smoothstep(1200.0, 4000.0, fdist));
  float ripple = 0.5 + 0.5 * sin(vWPos.x * 0.21 + vWPos.z * 0.17 + uTime * 1.6);
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.85, 0.9, 0.88), foam * (0.35 + 0.4 * ripple));
  diffuseColor.a = mix(0.6, 0.92, smoothstep(0.0, 6.0, dpt));
  // Lebendige Eifel: Sonnenglitzern auf dem Wasser (in der Nähe)
  diffuseColor.rgb += vec3(1.0, 0.96, 0.85) * glitzer(vWPos.xz * 0.12, uTime) * 1.6 * (1.0 - smoothstep(400.0, 2200.0, fdist));
  diffuseColor.rgb = kGrau(diffuseColor.rgb, kOut(vWPos.xz));
  vKFade = kFade(vWPos.xz);
}`)
        .replace('#include <fog_fragment>', KULISSE_FOG)
        .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
{
  vec2 w = vWPos.xz;
  vec2 g = vec2(sin(w.x * 0.045 + uTime * 1.1) + 0.6 * sin((w.x + w.y) * 0.083 - uTime * 1.7),
                cos(w.y * 0.051 + uTime * 0.9) + 0.6 * cos((w.x - w.y) * 0.071 + uTime * 1.3)) * 0.06;
  normal = normalize(normal + (viewMatrix * vec4(g.x, 0.0, g.y, 0.0)).xyz);
}`);
    };
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.receiveShadow = true;
    this.mesh.renderOrder = 1;
  }
}
