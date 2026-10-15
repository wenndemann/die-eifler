// Fließgewässer (aus OSM-Linien): Band-Mesh entlang der Flusslinie auf Spiegelhöhe.
// Das Flussbett ist im Konverter eingegraben, die Ufer schneiden das Band -> keine Raster-Treppen.
// Shader: Strömung entlang der Linie, Stromschnellen bei Gefälle, weiche Ränder.
import * as THREE from 'three';
import type { MapData } from '../map/mapdata';

const MIN_VISUAL_WIDTH = [8, 3.5, 4]; // Fluss, Bach, Kanal (m)

export class Rivers {
  readonly mesh: THREE.Mesh;
  readonly uniforms = { uTime: { value: 0 } };

  constructor(map: MapData, base: number) {
    const pos: number[] = [], flow: number[] = [], side: number[] = [], info: number[] = [], idx: number[] = [];
    for (const r of map.rivers) {
      const p = r.p, n = p.length / 3;
      if (n < 2) continue;
      // Sichtbare Halbbreite: etwas breiter als das Wasser, Rand wird im Shader ausgeblendet
      const half = Math.max(r.w, MIN_VISUAL_WIDTH[r.k] ?? 4) * 0.5 + 1.5;
      let s = 0;
      const v0 = pos.length / 3;
      for (let i = 0; i < n; i++) {
        const a = Math.max(0, i - 1), b = Math.min(n - 1, i + 1);
        let tx = p[b * 3] - p[a * 3], tz = p[b * 3 + 1] - p[a * 3 + 1];
        const tl = Math.hypot(tx, tz) || 1;
        tx /= tl; tz /= tl;
        // Gehrung: Abstand an Knicken ausgleichen (begrenzt)
        let miter = 1;
        if (i > 0 && i < n - 1) {
          let ux = p[i * 3] - p[a * 3], uz = p[i * 3 + 1] - p[a * 3 + 1];
          const ul = Math.hypot(ux, uz) || 1;
          ux /= ul; uz /= ul;
          miter = 1 / Math.max(0.5, ux * tx + uz * tz);
        }
        if (i > 0) s += Math.hypot(p[i * 3] - p[(i - 1) * 3], p[i * 3 + 1] - p[(i - 1) * 3 + 1]);
        const nx = -tz * half * miter, nz = tx * half * miter;
        const y = p[i * 3 + 2] - base + 0.25;
        // Gefälle (m/m) -> Stromschnellen
        const drop = Math.max(0, (p[a * 3 + 2] - p[b * 3 + 2]) / Math.max(tl, 1));
        pos.push(p[i * 3] + nx, y, p[i * 3 + 1] + nz, p[i * 3] - nx, y, p[i * 3 + 1] - nz);
        flow.push(s, s);
        side.push(-1, 1);
        info.push(half, drop, r.k, half, drop, r.k);
        if (i > 0) {
          const q = v0 + (i - 1) * 2;
          idx.push(q, q + 1, q + 2, q + 1, q + 3, q + 2);
        }
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(new Float32Array(pos.length).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
    geo.setAttribute('aFlow', new THREE.Float32BufferAttribute(flow, 1));
    geo.setAttribute('aSide', new THREE.Float32BufferAttribute(side, 1));
    geo.setAttribute('aInfo', new THREE.Float32BufferAttribute(info, 3));
    geo.setIndex(pos.length / 3 > 65535 ? new THREE.Uint32BufferAttribute(idx, 1) : new THREE.Uint16BufferAttribute(idx, 1));
    geo.computeBoundingSphere();

    const mat = new THREE.MeshStandardMaterial({
      color: '#2f6f8f', roughness: 0.15, metalness: 0, transparent: true, depthWrite: false,
      side: THREE.DoubleSide, envMapIntensity: 1.2,
    });
    mat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, this.uniforms);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>
attribute float aFlow; attribute float aSide; attribute vec3 aInfo;
varying float vFlow; varying float vSide; varying vec3 vInfo; varying float vDist;`)
        .replace('#include <begin_vertex>', `#include <begin_vertex>
vFlow = aFlow; vSide = aSide; vInfo = aInfo;
vDist = length((modelMatrix * vec4(transformed, 1.0)).xyz - cameraPosition);
// Grobe Gelände-LODs füllen das eingegrabene Bett teils auf: Band in der Ferne leicht anheben
transformed.y += clamp((vDist - 1800.0) * 0.004, 0.0, 30.0) / modelMatrix[1][1];`);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>
varying float vFlow; varying float vSide; varying vec3 vInfo; varying float vDist;
uniform float uTime;
float rh(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float rn(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
  return mix(mix(rh(i),rh(i+vec2(1,0)),f.x), mix(rh(i+vec2(0,1)),rh(i+vec2(1,1)),f.x), f.y); }
float flowN(float s, float t, float w, float sp){
  // Strömungsmuster: längs gestreckt, wandert mit der Fließgeschwindigkeit
  vec2 q = vec2(t * w * 0.35, (s - uTime * sp) * 0.09);
  return rn(q) * 0.6 + rn(q * 2.7 + 13.1) * 0.4;
}`)
        .replace('#include <color_fragment>', `#include <color_fragment>
{
  float hw = vInfo.x, drop = vInfo.y, kind = vInfo.z;
  float at = abs(vSide);
  float sp = 1.6 + drop * 120.0;            // Fließgeschwindigkeit (m/s, optisch)
  float n = flowN(vFlow, vSide, hw, sp);
  vec3 shallow = vec3(0.20, 0.40, 0.38), deep = vec3(0.07, 0.22, 0.28);
  float core = 1.0 - smoothstep(0.0, 0.9, at);
  diffuseColor.rgb = mix(shallow, deep, core * (kind < 0.5 ? 1.0 : 0.45));
  diffuseColor.rgb *= 0.9 + n * 0.25;
  // Schaum: Stromschnellen und Uferkante
  float rapid = smoothstep(0.004, 0.03, drop) * smoothstep(0.55, 0.85, n);
  float edgeFoam = smoothstep(0.62, 0.8, at) * (1.0 - smoothstep(0.8, 0.95, at)) * (0.35 + 0.5 * n);
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.86, 0.91, 0.9), clamp(rapid * 0.7 + edgeFoam * 0.5, 0.0, 1.0));
  // Weicher Rand + Bäche in der Ferne ausblenden (sonst Flimmern)
  float fade = kind > 0.5 ? 1.0 - smoothstep(2500.0, 6000.0, vDist) : 1.0 - smoothstep(14000.0, 22000.0, vDist);
  diffuseColor.a = (1.0 - smoothstep(0.82, 1.0, at)) * mix(0.75, 0.93, core) * fade;
}`)
        .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
{
  float sp = 1.6 + vInfo.y * 120.0;
  float e = 0.6;
  float n0 = flowN(vFlow, vSide, vInfo.x, sp);
  float ns = flowN(vFlow + e * 4.0, vSide, vInfo.x, sp);
  float nt = flowN(vFlow, vSide + e / max(vInfo.x, 1.0), vInfo.x, sp);
  vec3 g = vec3(nt - n0, 0.0, ns - n0) * 0.9;
  normal = normalize(normal + (viewMatrix * vec4(g.x, 0.0, g.z, 0.0)).xyz);
}`);
    };
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.receiveShadow = true;
    this.mesh.renderOrder = 1;
  }
}
