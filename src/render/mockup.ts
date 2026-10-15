// Maßstabs-Probe: ein Musterdorf aus prozeduralen Eifel-Gebäuden auf freien Wiesen-Hexen,
// um den Spiel-Maßstab der Gebäude festzulegen (ROADMAP M1 „Maßstab“). Reines Entwicklungswerkzeug:
// window.eifeler.mockup(scale, ort) im Browser bzw. im Screenshot-Skript.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { MapData } from '../map/mapdata';
import type { HexGrid } from '../map/hex';

const C = {
  wand: '#efe9dc', balken: '#3a2c22', sockel: '#8a8378', dach: '#3a3f47', fenster: '#2e3a44',
  tuer: '#5a3b26', holz: '#7a5636', stamm: '#8a6a48', stein: '#a39d92', blatt: '#2f5d32', fahne: '#c8402e',
};

function paint(g: THREE.BufferGeometry, color: string) {
  const geo = g.index ? g.toNonIndexed() : g;
  const c = new THREE.Color(color);
  const a = new Float32Array(geo.attributes.position.count * 3);
  for (let i = 0; i < a.length; i += 3) a.set([c.r, c.g, c.b], i);
  geo.setAttribute('color', new THREE.BufferAttribute(a, 3));
  geo.deleteAttribute('uv');
  geo.deleteAttribute('normal');
  return geo;
}
const box = (w: number, h: number, d: number, x: number, y: number, z: number, color: string, ry = 0, rz = 0) =>
  paint(new THREE.BoxGeometry(w, h, d).rotateZ(rz).rotateY(ry).translate(x, y, z), color);

/** Satteldach (Prisma), First entlang x, Traufe auf Höhe y. */
function roof(w: number, d: number, h: number, y: number, color = C.dach) {
  const x = w / 2 + 0.6, z = d / 2 + 0.7;
  const p = [-x, y, z, x, y, z, x, y + h, 0, -x, y, z, x, y + h, 0, -x, y + h, 0,
    x, y, -z, -x, y, -z, -x, y + h, 0, x, y, -z, -x, y + h, 0, x, y + h, 0];
  const r = new THREE.BufferGeometry();
  r.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
  const gx = w / 2;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([gx, y, d / 2, gx, y, -d / 2, gx, y + h, 0,
    -gx, y, -d / 2, -gx, y, d / 2, -gx, y + h, 0], 3));
  return [paint(r, color), paint(g, C.wand)];
}

/** Fachwerkhaus: Bruchsteinsockel, weiße Gefache, dunkle Balken, Fenster, Schieferdach. Front = +z. */
function fachwerk(w: number, d: number, floors: number, wall = C.wand): THREE.BufferGeometry[] {
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
  parts.push(...roof(w, d, d * 0.75, y0 + H));
  parts.push(box(1.2, 3, 1.2, w * 0.28, y0 + H + d * 0.45, 0, '#6d625a'));
  return parts;
}

function logPile(x: number, z: number, n = 6): THREE.BufferGeometry[] {
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
