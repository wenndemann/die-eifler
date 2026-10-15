// Wasserflächen (Talsperren, Seen, breite Flüsse): Gitter auf Spiegelhöhe, leicht über das
// Ufer hinaus, damit das ansteigende Gelände die Uferlinie schneidet.
import * as THREE from 'three';
import type { MapData } from '../map/mapdata';

export class Water {
  readonly mesh: THREE.Mesh;
  readonly uniforms = { uTime: { value: 0 } };

  constructor(map: MapData, base: number) {
    const { width, height, cell } = map.info;
    const wl = map.water;
    // Spiegel je Zelle: Wasserzelle -> eigener Spiegel, Uferzelle -> höchster Nachbar-Spiegel
    const level = new Float32Array(width * height);
    for (let j = 0; j < height; j++) {
      for (let i = 0; i < width; i++) {
        const k = j * width + i;
        if (wl[k] > 0) { level[k] = wl[k]; continue; }
        let m = 0;
        for (let dj = -2; dj <= 2; dj++) for (let di = -2; di <= 2; di++) m = Math.max(m, wl[map.idx(i + di, j + dj)]);
        level[k] = m;
      }
    }
    const vid = new Int32Array(width * height).fill(-1);
    const pos: number[] = [], depth: number[] = [], idx: number[] = [];
    const vert = (i: number, j: number, lv: number) => {
      const k = j * width + i;
      if (vid[k] >= 0) return vid[k];
      vid[k] = pos.length / 3;
      pos.push((i + 0.5) * cell, lv - base + 0.4, (j + 0.5) * cell);
      depth.push(lv - map.ground[k]);
      return vid[k];
    };
    for (let j = 0; j < height - 1; j++) {
      for (let i = 0; i < width - 1; i++) {
        const ks = [j * width + i, j * width + i + 1, (j + 1) * width + i, (j + 1) * width + i + 1];
        let lv = 0;
        for (const k of ks) lv = Math.max(lv, level[k]);
        if (lv <= 0 || !ks.some((k) => wl[k] > 0 || level[k] > 0)) continue;
        // Alle vier Ecken auf denselben Spiegel (eben), sonst Treppen an Flüssen
        const a = vert(i, j, level[ks[0]] || lv), b = vert(i + 1, j, level[ks[1]] || lv);
        const c = vert(i, j + 1, level[ks[2]] || lv), d = vert(i + 1, j + 1, level[ks[3]] || lv);
        idx.push(a, c, b, b, c, d);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('aDepth', new THREE.Float32BufferAttribute(depth, 1));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    geo.computeBoundingSphere();

    const mat = new THREE.MeshStandardMaterial({
      color: '#2f6f8f', roughness: 0.12, metalness: 0.0, transparent: true, depthWrite: false, envMapIntensity: 1.2,
    });
    mat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, this.uniforms);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float aDepth; varying float vDepth; varying vec3 vWPos;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvDepth = aDepth; vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying float vDepth; varying vec3 vWPos; uniform float uTime;')
        .replace('#include <color_fragment>', `#include <color_fragment>
{
  float dpt = max(vDepth, 0.0);
  vec3 shallow = vec3(0.16, 0.42, 0.42), deep = vec3(0.04, 0.16, 0.26);
  diffuseColor.rgb = mix(shallow, deep, smoothstep(0.0, 14.0, dpt));
  float foam = 1.0 - smoothstep(0.2, 1.6, dpt);
  float ripple = 0.5 + 0.5 * sin(vWPos.x * 0.21 + vWPos.z * 0.17 + uTime * 1.6);
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.85, 0.9, 0.88), foam * (0.35 + 0.4 * ripple));
  diffuseColor.a = mix(0.55, 0.92, smoothstep(0.0, 6.0, dpt));
}`)
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
