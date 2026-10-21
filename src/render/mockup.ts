// Maßstabs-Probe: ein Musterdorf aus prozeduralen Eifel-Gebäuden auf freien Wiesen-Hexen,
// um den Spiel-Maßstab der Gebäude festzulegen (ROADMAP M1 „Maßstab“). Reines Entwicklungswerkzeug:
// window.eifeler.mockup(scale, ort) im Browser bzw. im Screenshot-Skript.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { MapData } from '../map/mapdata';
import type { HexGrid } from '../map/hex';

export const C = {
  // Stil (STIL.md): warmes Weiß, Eichenbraun, heller Schiefer
  wand: '#f6e6cf', balken: '#5a3a26', sockel: '#a39a8c', dach: '#5f7090', fenster: '#3b5a78',
  tuer: '#5a3b26', holz: '#7a5636', stamm: '#8a6a48', stein: '#a39d92', blatt: '#2f5d32', fahne: '#c8402e',
};

/**
 * Färbt ein Teil ein (Vertexfarben). Stil „Wimmelbuch“ (STIL.md): gemalter Verlauf je Teil – unten dunkler, oben heller, dazu ein
 * leichtes Pinsel-Flimmern –, damit auch einfache Formen wie gemalt wirken.
 */
/** Runde Grundformen behalten ihre weichen Normalen (STIL.md: runde Formen), alles Kantige wird flach schattiert. */
const RUND = new Set(['SphereGeometry', 'CylinderGeometry', 'ConeGeometry', 'IcosahedronGeometry', 'OctahedronGeometry', 'TorusGeometry', 'DodecahedronGeometry', 'CapsuleGeometry']);

export function paint(g: THREE.BufferGeometry, color: string) {
  const rund = RUND.has(g.type) && !!g.attributes.normal;
  const geo = g.index ? g.toNonIndexed() : g;
  if (!rund) { geo.deleteAttribute('normal'); geo.computeVertexNormals(); }
  const c = new THREE.Color(color);
  const pos = geo.attributes.position;
  const a = new Float32Array(pos.count * 3);
  let y0 = Infinity, y1 = -Infinity;
  for (let i = 0; i < pos.count; i++) { const y = pos.getY(i); if (y < y0) y0 = y; if (y > y1) y1 = y; }
  const span = Math.max(0.001, y1 - y0);
  for (let i = 0; i < pos.count; i++) {
    const t = (pos.getY(i) - y0) / span;
    const k = MAL_UNTEN + (MAL_OBEN - MAL_UNTEN) * t + Math.sin(pos.getX(i) * 3.1 + pos.getZ(i) * 2.3) * MAL_PINSEL;
    a[i * 3] = c.r * k; a[i * 3 + 1] = c.g * k; a[i * 3 + 2] = c.b * k;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(a, 3));
  geo.deleteAttribute('uv');
  return geo;
}
/** Gemalter Verlauf (STIL.md): Helligkeit unten, oben und Pinsel-Flimmern. */
export const MAL_UNTEN = 0.8, MAL_OBEN = 1.06, MAL_PINSEL = 0.025;

/**
 * Quader mit weich gebrochenen Kanten (STIL.md: runde Formen, keine harten Kanten). Dünne Teile (Balken, Leisten) bleiben
 * scharf, damit die Dreieckszahl klein bleibt.
 */
export function weicheKiste(w: number, h: number, d: number): THREE.BufferGeometry {
  const m = Math.min(w, h, d);
  if (m < 0.45) return new THREE.BoxGeometry(w, h, d);
  return new RoundedBoxGeometry(w, h, d, 1, Math.min(0.35, m * 0.16));
}
export const box = (w: number, h: number, d: number, x: number, y: number, z: number, color: string, ry = 0, rz = 0) =>
  paint(weicheKiste(w, h, d).rotateZ(rz).rotateY(ry).translate(x, y, z), color);

/** Satteldach (Prisma), First entlang x, Traufe auf Höhe y. */
export function roof(w: number, d: number, h: number, y: number, color = C.dach, giebel = C.wand) {
  // Stil: kräftiger Überstand
  const x = w / 2 + 1.1, z = d / 2 + 1.3;
  const p = [-x, y, z, x, y, z, x, y + h, 0, -x, y, z, x, y + h, 0, -x, y + h, 0,
    x, y, -z, -x, y, -z, -x, y + h, 0, x, y, -z, -x, y + h, 0, x, y + h, 0];
  const r = new THREE.BufferGeometry();
  r.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
  const gx = w / 2;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([gx, y, d / 2, gx, y, -d / 2, gx, y + h, 0,
    -gx, y, -d / 2, -gx, y, d / 2, -gx, y + h, 0], 3));
  // Ziegel- bzw. Schieferreihen: dunklere Leisten quer über beide Dachflächen
  const reihen: THREE.BufferGeometry[] = [];
  const dunkel = `#${new THREE.Color(color).multiplyScalar(0.72).getHexString()}`;
  const neig = Math.atan2(h, z);
  for (const sz of [1, -1]) for (let k = 1; k <= 3; k++) {
    const t = k / 4;
    reihen.push(paint(new THREE.BoxGeometry(2 * x + 0.1, 0.16, 0.3).rotateX(sz * neig).translate(0, y + h * (1 - t) + 0.12, sz * z * t), dunkel));
  }
  return [paint(r, color), paint(g, giebel), ...reihen];
}

/** Fachwerkhaus: Bruchsteinsockel, weiße Gefache, dunkle Balken, Fenster, Schieferdach. Front = +z. */
export function fachwerk(w: number, d: number, floors: number, wall = C.wand, dach = C.dach): THREE.BufferGeometry[] {
  const fh = 3, H = floors * fh, y0 = 1;
  const parts = [box(w + 0.4, 5, d + 0.4, 0, y0 - 2.5, 0, C.sockel), box(w, H, d, 0, y0 + H / 2, 0, wall)];
  for (const side of [1, -1]) {
    const z = side * (d / 2 + 0.06);
    const n = Math.max(2, Math.round(w / 2.2));
    for (let i = 0; i <= n; i++) parts.push(box(0.28, H, 0.14, -w / 2 + (w * i) / n, y0 + H / 2, z, C.balken));
    for (let f = 0; f <= floors; f++) parts.push(box(w, 0.28, 0.14, 0, y0 + f * fh, z, C.balken));
    for (let f = 0; f < floors; f++) {
      // Streben an den Ecken, Fenster in jedem zweiten Feld
      const ang = Math.atan2(fh, w / n);
      parts.push(box(Math.hypot(fh, w / n), 0.24, 0.14, -w / 2 + w / n / 2, y0 + f * fh + fh / 2, z, C.balken, 0, ang));
      parts.push(box(Math.hypot(fh, w / n), 0.24, 0.14, w / 2 - w / n / 2, y0 + f * fh + fh / 2, z, C.balken, 0, -ang));
      for (let i = 1; i < n - 1; i += 2) {
        parts.push(box(Math.min(1.1, (w / n) * 0.6), 1.2, 0.12, -w / 2 + (w * (i + 0.5)) / n, y0 + f * fh + 1.6, z + side * 0.05, C.fenster));
      }
    }
  }
  for (const side of [1, -1]) {
    const x = side * (w / 2 + 0.06);
    const n = Math.max(2, Math.round(d / 2.2));
    for (let i = 0; i <= n; i++) parts.push(box(0.14, H, 0.28, x, y0 + H / 2, -d / 2 + (d * i) / n, C.balken));
    for (let f = 0; f <= floors; f++) parts.push(box(0.14, 0.28, d, x, y0 + f * fh, 0, C.balken));
  }
  parts.push(box(1.4, 2.3, 0.2, 0, y0 + 1.15, d / 2 + 0.12, C.tuer));
  parts.push(...roof(w, d, d * 0.75, y0 + H, dach, wall));
  parts.push(box(1.2, 3, 1.2, w * 0.28, y0 + H + d * 0.45, 0, '#8a5a48'));
  // Rauchwölkchen über dem Schornstein (Stil: Wimmelbuch)
  for (let k = 0; k < 3; k++) parts.push(paint(new THREE.SphereGeometry(0.75 + k * 0.32, 8, 6).translate(w * 0.28 + k * 0.6, y0 + H + d * 0.45 + 2.6 + k * 1.2, -k * 0.3), '#eeeae2'));
  return parts;
}

export function logPile(x: number, z: number, n = 6): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = [];
  for (let i = 0; i < n; i++) {
    const row = i < 3 ? 0 : i < 5 ? 1 : 2, k = i < 3 ? i : i < 5 ? i - 3 : 0;
    const cy = new THREE.CylinderGeometry(0.4, 0.4, 5, 6).rotateZ(Math.PI / 2)
      .translate(x, 0.4 + row * 0.7, z + (k - (row === 0 ? 1 : row === 1 ? 0.5 : 0)) * 0.82);
    out.push(paint(cy, C.stamm));
  }
  return out;
}

function tree(x: number, z: number, s: number) {
  return [paint(new THREE.CylinderGeometry(0.2 * s, 0.3 * s, 2 * s, 5).translate(x, s, z), C.holz),
    paint(new THREE.ConeGeometry(1.6 * s, 5 * s, 6).translate(x, 4 * s, z), C.blatt)];
}

const BUILDINGS: Record<string, () => THREE.BufferGeometry[]> = {
  lager: () => [...fachwerk(22, 11, 2), ...fachwerk(8, 7, 1).map((g) => g.translate(13, 0, 2)), ...logPile(-7, 9)],
  wohnhaus: () => fachwerk(12, 8, 2),
  holzfaeller: () => [...fachwerk(9, 7, 1, C.holz), ...logPile(7.5, 3, 6), box(1.2, 0.8, 1.2, -6, 0.4, 4, C.stamm)],
  saegewerk: () => [...fachwerk(14, 9, 1),
    ...[-3, 3].flatMap((px) => [box(0.4, 4, 0.4, 11 + px, 2, 3, C.balken), box(0.4, 4, 0.4, 11 + px, 2, -3, C.balken)]),
    ...roof(8, 7, 2.5, 4), ...logPile(11, 0, 6)],
  foerster: () => [...fachwerk(10, 7, 1), ...tree(-9, 6, 1), ...tree(-11, 1, 1.3), ...tree(-8, -4, 0.8)],
  steinmetz: () => [...fachwerk(10, 8, 1, C.stein),
    box(2, 1.4, 1.6, 8, 0.7, 4, C.stein), box(1.6, 1.2, 1.6, 9.5, 0.6, 1.5, C.stein), box(1.4, 1, 1.2, 7.5, 1.9, 4, C.stein)],
};
const FLAG = () => [paint(new THREE.CylinderGeometry(0.12, 0.15, 6, 5).translate(0, 3, 0), C.balken),
  box(0.06, 1.3, 2, 0, 5.2, -1.05, C.fahne)];

export interface MockupContext { map: MapData; grid: HexGrid; base: number; ex: () => number }

/** Musterdorf bei einem Ort aufbauen. scale = Gebäudegröße relativ zur echten Größe. */
export function buildMockup(ctx: MockupContext, scale: number, place = 'Einruhr') {
  const { map, grid, base } = ctx;
  const p = map.info.places.find((q) => q.name === place);
  if (!p) throw new Error(`Ort ${place} fehlt`);
  const R = map.info.hex.size;
  const center = grid.fromWorld(p.x, p.z);
  // Freie, flache Wiesen-Hexe nahe dem Ort (Hex-Gelände 1 = wiese), nächste zuerst
  const cand: { q: number; r: number; x: number; z: number; d: number }[] = [];
  for (let dq = -9; dq <= 9; dq++) for (let dr = -9; dr <= 9; dr++) {
    const h = { q: center.q + dq, r: center.r + dr };
    const i = grid.index(h);
    if (i < 0 || map.hexTerrain[i] !== 1) continue;
    const w = grid.toWorld(h);
    const hs = [0, 1, 2, 3, 4, 5].map((k) => map.heightAt(w.x + Math.cos(k) * R * 0.6, w.z + Math.sin(k) * R * 0.6));
    if (Math.max(...hs) - Math.min(...hs) > 30) continue;
    cand.push({ ...h, ...w, d: Math.hypot(w.x - p.x, w.z - p.z) });
  }
  cand.sort((a, b) => a.d - b.d);
  const kinds = Object.keys(BUILDINGS);
  // Zusammenhängende Gruppe: vom nächsten freien Hex aus immer das Hex, das der Gruppe am nächsten liegt
  const chosen = cand.slice(0, 1);
  const rest = cand.slice(1);
  while (chosen.length < kinds.length && rest.length) {
    let bi = 0, bd = Infinity;
    rest.forEach((h, i) => {
      const d = Math.min(...chosen.map((c) => Math.hypot(c.x - h.x, c.z - h.z)));
      if (d < bd) { bd = d; bi = i; }
    });
    if (bd > R * 4.5) break;
    chosen.push(rest.splice(bi, 1)[0]);
  }

  const group = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, flatShading: true, side: THREE.DoubleSide });
  const ex = ctx.ex();
  chosen.forEach((h, n) => {
    // Gebäude blickt nach Südosten zur Fahne (Siedler-Art), Fahne am Hex-Rand
    const front = new THREE.Vector2(Math.cos(Math.PI / 6), Math.sin(Math.PI / 6));
    const yaw = Math.atan2(front.x, front.y);
    const bx = h.x - front.x * R * 0.12, bz = h.z - front.y * R * 0.12;
    const foot = 12 * scale;
    const gy = Math.min(...[[-1, -1], [1, -1], [-1, 1], [1, 1], [0, 0]].map(([a, b]) => map.heightAt(bx + a * foot, bz + b * foot)));
    const geo = mergeGeometries(BUILDINGS[kinds[n]]())!;
    geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, mat);
    m.position.set(bx, (gy - base) * ex, bz);
    m.rotation.y = yaw;
    m.scale.setScalar(scale);
    m.castShadow = m.receiveShadow = true;
    const fx = h.x + front.x * R * 0.55, fz = h.z + front.y * R * 0.55;
    const flag = new THREE.Mesh(mergeGeometries(FLAG())!, mat);
    flag.geometry.computeVertexNormals();
    flag.position.set(fx, (map.heightAt(fx, fz) - base) * ex, fz);
    flag.scale.setScalar(Math.max(1, scale * 0.8));
    flag.castShadow = true;
    group.add(m, flag);
  });
  const cx = chosen.reduce((s, h) => s + h.x, 0) / Math.max(1, chosen.length);
  const cz = chosen.reduce((s, h) => s + h.z, 0) / Math.max(1, chosen.length);
  return { group, center: { x: cx, z: cz }, count: chosen.length };
}
