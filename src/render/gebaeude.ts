// Spielgebäude (Drehbuch 3, 7.3; M3, M4): lager, holzfaeller, foerster, steinbruch, saegewerk, huette, wohnhaus als prozedurale
// Fachwerk-Modelle (fachwerk() aus mockup.ts) in HAUS_SKALE-facher Größe auf dem Gebäude-Hex. Der Eingang schaut nach
// Süden (+z), die Fahne steht davor in der Hex-Mitte (fahnen.ts). Drei Bauphasen aus `bau` (Phasenformel in
// src/sim/typen.ts): 1 abgesteckter Grund mit Fundament und Pflöcken, 2 Fachwerkgerüst, 3 fertig mit Dach.
// Beim ersten Erscheinen wird das Gelände unter dem Grundriss planiert (map.ground, wie houses.ts), weich
// übergeblendet, erdig gefärbt und neu aufgebaut; Kulissenhäuser auf dem Hex verschwinden.
// ⚠ über Gebäuden ohne Wegverbindung (getrennt), kleine Symbole bei Stillstand (kein Baum/Fels/Platz/Arbeiter, Lager voll).
// An Baustellen liegt der offene Bedarf als kleiner Waren-Stapel samt Bauschild. Reiner Leser der SimSicht, ohne Simulation nutzbar.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { MapData } from '../map/mapdata';
import type { HexGrid } from '../map/hex';
import { PROMILLE, type GebaeudeZustand, type Id, type SimSicht } from '../sim/typen';
import { box, roof, fachwerk, logPile, paint, C } from './mockup';
import { Instanzen } from './instanzen';
import { WAREN_ANZAHL, WARE_HOEHE, warenGeometrie } from './waren';
import { WARE_M } from './massstab';
import { HAUS_SKALE } from './massstab';
import { hash } from './terrain';
import type { Trees } from './trees';

/** Boden liegt im Modell bei y = G (wie bei den Kulissenhäusern: Sockel ragt 0,5 m heraus). */
const G = 0.5;
/** Übergang ins Umland (m, Spiel) und Platz um den Grundriss. */
const BLEND = 26;
const RAND = 2.5;

/** Haken in die übrige Darstellung (alle optional): Gelände neu aufbauen, Kulissenhäuser ausblenden. */
export interface GebaeudeHaken {
  terrain?: { erneuere(x0: number, z0: number, x1: number, z1: number): void; setzeErde(i: number, j: number, anteil: number): void };
  houses?: { verstecke(x: number, z: number, radius: number): number };
  trees?: Trees;
}

// ---------------------------------------------------------------- Bausteine

const boxR = (w: number, h: number, d: number, x: number, y: number, z: number, farbe: string, rx = 0, ry = 0, rz = 0) =>
  paint(new THREE.BoxGeometry(w, h, d).rotateX(rx).rotateZ(rz).rotateY(ry).translate(x, y, z), farbe);
const walze = (r: number, h: number, x: number, y: number, z: number, farbe: string, rx = 0, rz = 0, seg = 7) =>
  paint(new THREE.CylinderGeometry(r, r, h, seg).rotateX(rx).rotateZ(rz).translate(x, y, z), farbe);

const HOLZ = '#8a6340', HELL = '#d9b57a', DUNKEL = '#4a3220';

function kiste(x: number, z: number, s: number, ry = 0, y = G): THREE.BufferGeometry[] {
  return [boxR(s, s, s, x, y + s / 2, z, '#b98b55', 0, ry),
    boxR(s * 1.04, s * 0.14, s * 1.04, x, y + s * 0.22, z, DUNKEL, 0, ry), boxR(s * 1.04, s * 0.14, s * 1.04, x, y + s * 0.78, z, DUNKEL, 0, ry)];
}
function fass(x: number, z: number, y = G): THREE.BufferGeometry[] {
  return [walze(0.65, 1.3, x, y + 0.65, z, '#8a5a30', 0, 0, 8), walze(0.68, 0.14, x, y + 0.35, z, DUNKEL, 0, 0, 8), walze(0.68, 0.14, x, y + 0.95, z, DUNKEL, 0, 0, 8)];
}
function stapelBretter(x: number, z: number, b: number, t: number, hoehe: number): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = [];
  const n = Math.round(hoehe / 0.28);
  for (let i = 0; i < n; i++) out.push(boxR(b, 0.26, t, x + (i % 3 - 1) * 0.06, G + 0.4 + i * 0.28, z, i % 2 ? '#e4c690' : HELL));
  out.push(boxR(0.4, 0.4, t + 0.1, x - b * 0.35, G + 0.2, z, HOLZ), boxR(0.4, 0.4, t + 0.1, x + b * 0.35, G + 0.2, z, HOLZ));
  return out;
}
function steinHaufen(x: number, z: number, n: number, rad: number, hmax: number): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = [];
  for (let i = 0; i < n; i++) {
    const a = hash(i * 13 + 5, n) * 6.28, r = rad * Math.sqrt(hash(i * 7 + 1, n + 3));
    const s = 0.9 + hash(i, n + 11) * 1.1;
    const hohe = Math.max(0, 1 - r / rad);
    out.push(boxR(s, s * 0.8, s * 0.95, x + Math.cos(a) * r, G + s * 0.4 + hohe * hmax, z + Math.sin(a) * r, i % 3 ? '#a7a49c' : '#8f8c85', 0.2 * hash(i, 2), hash(i, 3) * 3, 0.15));
  }
  return out;
}
function laeden(w: number, d: number, floors: number, farbe: string): THREE.BufferGeometry[] {
  // Fensterläden neben den Fenstern der Vorderseite (gleiche Aufteilung wie fachwerk())
  const out: THREE.BufferGeometry[] = [];
  const n = Math.max(2, Math.round(w / 2.2));
  for (let f = 0; f < floors; f++) for (let i = 1; i < n - 1; i += 2) {
    const cx = -w / 2 + (w * (i + 0.5)) / n, y = 1 + f * 3 + 1.6;
    for (const sx of [-1, 1]) out.push(box(0.5, 1.4, 0.1, cx + sx * Math.min(0.85, w / n * 0.55), y, d / 2 + 0.16, farbe));
  }
  return out;
}
function blumenkasten(w: number, d: number, floors: number): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = [];
  const n = Math.max(2, Math.round(w / 2.2));
  for (let f = 0; f < floors; f++) for (let i = 1; i < n - 1; i += 2) {
    const cx = -w / 2 + (w * (i + 0.5)) / n, y = 1 + f * 3 + 0.95;
    out.push(box(1.3, 0.35, 0.5, cx, y, d / 2 + 0.38, '#6b4a2e'));
    for (let k = -1; k <= 1; k++) out.push(paint(new THREE.SphereGeometry(0.22, 4, 3).translate(cx + k * 0.4, y + 0.32, d / 2 + 0.38), (k + f) % 2 ? '#e0392b' : '#f0b429'));
  }
  return out;
}
function baum(x: number, z: number, s: number): THREE.BufferGeometry[] {
  return [walze(0.25 * s, 2 * s, x, G + s, z, HOLZ, 0, 0, 5), paint(new THREE.ConeGeometry(1.6 * s, 4.5 * s, 6).translate(x, G + 3.6 * s, z), '#3f7a3a')];
}

// ---------------------------------------------------------------- Typen

interface Typ {
  /** Grundmaße in echten m (Breite entlang des Firsts, Tiefe) und Stockwerke. */
  w: number; d: number; floors: number;
  wand: string; dach: string; laden: string;
  /** Platzbedarf in echten m relativ zur Modellmitte: [x0, x1, z0, z1] (z+ = vorn/Süden). */
  grund: [number, number, number, number];
  /** Größe relativ zu HAUS_SKALE. */
  skala: number;
  /** Höhe des Firsts (echte m, ab Modell-Null). */
  hoehe: number;
  fertig(): THREE.BufferGeometry[];
}

const TYPEN: Record<string, Typ> = {
  lager: {
    w: 18, d: 10, floors: 2, wand: '#f0e8d6', dach: '#4d5f7a', laden: '#2f7a55', skala: 1, hoehe: 15,
    grund: [-10.5, 10.5, -6, 8.5],
    fertig() {
      const t = TYPEN.lager;
      return [...fachwerk(t.w, t.d, t.floors, t.wand, t.dach), ...laeden(t.w, t.d, t.floors, t.laden),
        // großes Tor mit Kreuzbalken und Dachchen
        box(5.4, 4.2, 0.35, 0, G + 2.1 + 0.3, t.d / 2 + 0.22, '#6a4426'), box(5.8, 0.4, 0.5, 0, G + 4.7, t.d / 2 + 0.3, DUNKEL),
        box(0.35, 4.2, 0.45, 0, G + 2.4, t.d / 2 + 0.4, DUNKEL), boxR(0.3, 5.2, 0.4, 0, G + 2.4, t.d / 2 + 0.45, DUNKEL, 0, 0, 0.7), boxR(0.3, 5.2, 0.4, 0, G + 2.4, t.d / 2 + 0.45, DUNKEL, 0, 0, -0.7),
        // Aufzugsbalken im Giebel
        box(0.35, 0.35, 2.2, 0, 1 + 3 * 2 + 3.2, t.d / 2 + 1.0, DUNKEL), box(1.2, 1.4, 0.15, 0, 1 + 3 * 2 + 1.6, t.d / 2 + 0.2, '#6a4426'),
        // Kisten, Fässer, Säcke
        ...kiste(8.2, 6.6, 1.8, 0.2), ...kiste(6.2, 7.2, 1.5, -0.3), ...kiste(7.4, 6.8, 1.4, 0.5, G + 1.8), ...fass(-7.5, 6.8), ...fass(-9, 6.2), ...fass(-8.1, 7.8),
        paint(new THREE.SphereGeometry(0.8, 6, 5).scale(1, 0.8, 1).translate(-5.2, G + 0.6, 7.2), '#d8c48a'), paint(new THREE.SphereGeometry(0.8, 6, 5).scale(1, 0.8, 1).translate(-4.2, G + 0.6, 7.6), '#d0b878')];
    },
  },
  holzfaeller: {
    w: 9, d: 7, floors: 1, wand: '#d8b88a', dach: '#9b4a35', laden: '#b53a2c', skala: 1, hoehe: 9,
    grund: [-6.5, 12, -4.5, 7],
    fertig() {
      const t = TYPEN.holzfaeller;
      return [...fachwerk(t.w, t.d, t.floors, t.wand, t.dach), ...laeden(t.w, t.d, t.floors, t.laden),
        // Holzstapel (zwei Reihen) an der Seite
        ...logPile(8, -1.5, 6).map((g) => g.translate(0, G, 0)), ...logPile(8, 3.2, 6).map((g) => g.translate(0, G, 0)),
        ...[0, 1, 2].map((i) => walze(0.45, 5, 8, G + 3 * 0.7 + 0.1 + i * 0, -0.3 + i * 0.9, HOLZ, 0, Math.PI / 2, 6)),
        // Hackklotz mit Axt
        walze(0.9, 1, -6, G + 0.5, 5.2, '#8a6a48', 0, 0, 7), boxR(0.14, 1.9, 0.14, -6.2, G + 1.8, 5.2, HOLZ, 0, 0, 0.5), boxR(0.8, 0.5, 0.1, -5.7, G + 2.5, 5.2, '#c0c4c8', 0, 0, 0.5),
        // gefällte Stämme im Hof
        walze(0.45, 5.5, -1, G + 0.45, 7.5, '#8a6340', 0, Math.PI / 2, 6), walze(0.4, 4.8, 2.5, G + 0.4, 8.2, '#7a5636', 0, Math.PI / 2 + 0.2, 6)];
    },
  },
  steinbruch: {
    w: 7, d: 6, floors: 1, wand: '#d3cabb', dach: '#6b5d52', laden: '#2e5d8a', skala: 1, hoehe: 12,
    grund: [-11, 11, -9, 8],
    fertig() {
      const t = TYPEN.steinbruch;
      return [...fachwerk(t.w, t.d, t.floors, t.wand, t.dach), ...laeden(t.w, t.d, t.floors, t.laden),
        // Felswand mit Stufen hinter dem Haus
        boxR(12, 8, 4.2, -4, G + 4, -6.7, '#8d8579', 0, 0.05), boxR(9, 5, 3.6, 5.5, G + 2.5, -6.4, '#9a9285', 0, -0.07),
        boxR(5, 10.5, 3.4, -10, G + 5.2, -5.8, '#7d766b', 0, 0.12), boxR(7, 2.2, 2.4, 3, G + 6, -6, '#a39b8e', 0, 0.1),
        boxR(9.6, 0.4, 4.4, -4, G + 8.1, -6.7, '#6e8a4a', 0, 0.05),
        // Steinhaufen und behauene Blöcke
        ...steinHaufen(7.2, 3.4, 16, 3.8, 2.6), ...steinHaufen(-8, 4.5, 8, 2.4, 1.2),
        boxR(2.6, 1.7, 1.8, 3.4, G + 0.85, 7.2, '#bdb8ac', 0, 0.2), boxR(2.2, 1.3, 1.6, 5.4, G + 0.65, 7.7, '#b0ab9f', 0, -0.15),
        // Kran: Gerüst mit Seil
        boxR(0.4, 7.4, 0.4, -6, G + 3.6, 1.2, HOLZ, 0, 0, 0.2), boxR(0.4, 7.4, 0.4, -6, G + 3.6, 1.2, HOLZ, 0.2, 0, -0.2), boxR(0.4, 7.4, 0.4, -6, G + 3.6, 1.2, HOLZ, -0.2, 0, -0.2),
        boxR(5.2, 0.4, 0.4, -4, G + 7.2, 1.2, DUNKEL), boxR(0.08, 4.5, 0.08, -1.6, G + 4.9, 1.2, '#d9d2c0'), boxR(1.5, 1.1, 1.5, -1.6, G + 2.4, 1.2, '#b3ada1', 0, 0.3)];
    },
  },
  saegewerk: {
    w: 11, d: 7.5, floors: 1, wand: '#ecdcb4', dach: '#a2432f', laden: '#e0a830', skala: 0.88, hoehe: 10,
    grund: [-9, 11.5, -5, 8.5],
    fertig() {
      const t = TYPEN.saegewerk;
      const sx = 9.5;  // Mitte des offenen Schuppens
      return [...fachwerk(t.w, t.d, t.floors, t.wand, t.dach), ...laeden(t.w, t.d, t.floors, t.laden),
        // offener Sägeschuppen: vier Pfosten, Dach
        ...[[-3.2, -3], [3.2, -3], [-3.2, 3.4], [3.2, 3.4]].map(([px, pz]) => boxR(0.5, 4.2, 0.5, sx + px, G + 2.1, pz, DUNKEL)),
        ...roof(7.8, 8.2, 2.4, G + 4.2, '#a2432f', '#d8b88a').map((g) => g.translate(sx, 0, 0.2)),
        // Sägebock mit Stamm und Blatt
        boxR(0.4, 3.2, 0.4, sx - 2, G + 1.5, 0.2, HOLZ, 0, 0, 0.35), boxR(0.4, 3.2, 0.4, sx - 2, G + 1.5, 0.2, HOLZ, 0, 0, -0.35),
        boxR(0.4, 3.2, 0.4, sx + 2, G + 1.5, 0.2, HOLZ, 0, 0, 0.35), boxR(0.4, 3.2, 0.4, sx + 2, G + 1.5, 0.2, HOLZ, 0, 0, -0.35),
        walze(0.75, 6.4, sx, G + 2.5, 0.2, '#8a6340', 0, Math.PI / 2, 7), walze(0.7, 0.1, sx + 3.2, G + 2.5, 0.2, '#e0bf86', 0, Math.PI / 2, 7),
        boxR(0.12, 2.6, 2.2, sx - 0.3, G + 3.9, 0.2, '#cfd3d6'), boxR(0.3, 0.3, 2.4, sx - 0.3, G + 5.3, 0.2, HOLZ),
        // Stämme und Bretter davor
        ...logPile(-2, 8, 6).map((g) => g.translate(0, G, 0)), ...stapelBretter(sx - 1.5, 6.8, 4.5, 1.6, 2.4), ...stapelBretter(sx + 3.5, 6.8, 3.4, 1.6, 1.4)];
    },
  },
  foerster: {
    w: 7, d: 6, floors: 1, wand: '#e6ecd2', dach: '#55793c', laden: '#2f7a55', skala: 1, hoehe: 9,
    grund: [-6, 15, -4.5, 9],
    fertig() {
      const t = TYPEN.foerster;
      const out: THREE.BufferGeometry[] = [...fachwerk(t.w, t.d, t.floors, t.wand, t.dach), ...laeden(t.w, t.d, t.floors, t.laden)];
      // Setzlingsbeet rechts: Erdbeet in Reihen, junge Fichten und Buchen, niedriger Zaun
      const bx = 11, bz = 1.5;
      out.push(boxR(8, 0.5, 6.4, bx, G + 0.2, bz, '#5e402a'));
      for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) {
        const px = bx - 2.7 + i * 1.8, pz = bz - 2 + j * 2, sz = 0.75 + hash(i * 3 + j, 4) * 0.35;
        if ((i + j) % 2) out.push(walze(0.1, 1.1 * sz, px, G + 0.9, pz, HOLZ, 0, 0, 4), paint(new THREE.SphereGeometry(0.62 * sz, 5, 4).translate(px, G + 1.6 * sz + 0.2, pz), '#5aa044'));
        else out.push(walze(0.1, 0.8 * sz, px, G + 0.75, pz, HOLZ, 0, 0, 4), paint(new THREE.ConeGeometry(0.62 * sz, 1.9 * sz, 6).translate(px, G + 1.7 * sz + 0.2, pz), '#2f7a3c'));
      }
      for (const [fx, fz] of [[-4.4, -3.4], [4.4, -3.4], [4.4, 3.4], [-4.4, 3.4], [0, 3.4], [0, -3.4]]) out.push(boxR(0.3, 1.5, 0.3, bx + fx, G + 0.75, bz + fz, HOLZ));
      out.push(boxR(8.8, 0.2, 0.18, bx, G + 1.2, bz + 3.4, HOLZ), boxR(8.8, 0.2, 0.18, bx, G + 1.2, bz - 3.4, HOLZ), boxR(0.18, 0.2, 6.8, bx + 4.4, G + 1.2, bz, HOLZ), boxR(0.18, 0.2, 6.8, bx - 4.4, G + 1.2, bz, HOLZ));
      // Schubkarre mit Setzlingen, Gießkanne, Holzschild mit Fichte
      out.push(boxR(1.8, 0.6, 1.1, -7.5, G + 1.0, 6.4, '#8a6a48', 0, 0.2), walze(0.55, 0.16, -7.5, G + 0.55, 7.3, DUNKEL, Math.PI / 2, 0, 8));
      for (let i = 0; i < 3; i++) out.push(paint(new THREE.ConeGeometry(0.5, 1.5, 6).translate(-8 + i * 0.55, G + 2.0, 6.4), '#2f7a3c'));
      out.push(walze(0.42, 0.7, -3.8, G + 0.35, 7.6, '#5a8fb5', 0, 0, 7), boxR(0.9, 0.12, 0.12, -3.2, G + 0.9, 7.6, '#5a8fb5', 0, 0, 0.5));
      out.push(boxR(0.22, 3.4, 0.22, 3.6, G + 1.7, 7.2, HOLZ), boxR(2.2, 1.6, 0.18, 3.6, G + 3.4, 7.2, '#e0c690'), paint(new THREE.ConeGeometry(0.6, 1.2, 6).translate(3.6, G + 3.4, 7.35), '#2f7a3c'));
      // zwei ältere Bäumchen neben der Hütte
      out.push(...baum(-8.5, -2.5, 1.0), ...baum(-6.5, -5.5, 0.7));
      return out;
    },
  },
  huette: {
    w: 6, d: 5.2, floors: 1, wand: '#f3ead4', dach: '#4f5964', laden: '#3a6ea5', skala: 1, hoehe: 8,
    grund: [-6.5, 7.5, -4, 8],
    fertig() {
      const t = TYPEN.huette;
      const out: THREE.BufferGeometry[] = [...fachwerk(t.w, t.d, t.floors, t.wand, t.dach), ...laeden(t.w, t.d, t.floors, t.laden), ...blumenkasten(t.w, t.d, t.floors)];
      // Brennholz an der Seitenwand, Regentonne an der Ecke, Bank an der Tür
      out.push(...logPile(-4.6, -0.5, 6).map((g) => g.translate(0, G, 0)).map((g) => g.rotateY(0)), ...fass(3.9, 2.9), boxR(1.9, 0.18, 0.6, -1.9, G + 0.8, 3.6, HOLZ), boxR(0.18, 0.8, 0.5, -2.7, G + 0.4, 3.6, HOLZ), boxR(0.18, 0.8, 0.5, -1.1, G + 0.4, 3.6, HOLZ));
      // Gemüsebeet vor der Hütte (Kartoffelreihen), Steinrand
      out.push(boxR(5.6, 0.35, 2.8, 2.4, G + 0.15, 6.2, '#654630'));
      for (let r = 0; r < 3; r++) for (let k = 0; k < 4; k++) out.push(paint(new THREE.SphereGeometry(0.42, 5, 4).scale(1, 0.8, 1).translate(0.2 + k * 1.4, G + 0.75, 5.4 + r * 0.8), (k + r) % 2 ? '#4f9a3a' : '#5eaa44'));
      out.push(...steinHaufen(-5.6, 6.2, 5, 1.2, 0.4));
      // Hühnerstange? – ein Besen und ein Blumentopf neben der Tür
      out.push(boxR(0.1, 2.2, 0.1, 1.8, G + 1.1, t.d / 2 + 0.5, HOLZ, 0, 0, 0.12), walze(0.35, 0.5, 2.6, G + 0.25, t.d / 2 + 0.6, '#b0603a', 0, 0, 7), paint(new THREE.SphereGeometry(0.3, 5, 4).translate(2.6, G + 0.75, t.d / 2 + 0.6), '#e0392b'));
      out.push(...baum(6.2, 2.0, 0.7));
      return out;
    },
  },
  wohnhaus: {
    w: 10, d: 7, floors: 2, wand: '#f4e2c2', dach: '#b8503a', laden: '#2f8f8f', skala: 0.95, hoehe: 12,
    grund: [-7, 8, -4.5, 6],
    fertig() {
      const t = TYPEN.wohnhaus;
      return [...fachwerk(t.w, t.d, t.floors, t.wand, t.dach), ...laeden(t.w, t.d, t.floors, t.laden), ...blumenkasten(t.w, t.d, t.floors),
        // Bank und Büsche
        boxR(2.2, 0.2, 0.7, -4.8, G + 0.9, 5, HOLZ), boxR(0.2, 0.9, 0.6, -5.7, G + 0.45, 5, HOLZ), boxR(0.2, 0.9, 0.6, -3.9, G + 0.45, 5, HOLZ),
        ...baum(6.8, 4.2, 0.8), paint(new THREE.SphereGeometry(1.0, 6, 5).translate(-7, G + 0.7, 1), '#4f8a3a'), paint(new THREE.SphereGeometry(0.8, 6, 5).translate(-6.4, G + 0.6, -1), '#5b9a42')];
    },
  },
};

/** Phase 1: abgesteckter Grund mit Fundament, Pflöcken und Schnur. */
function phase1(t: Typ): THREE.BufferGeometry[] {
  const hw = t.w / 2 + 0.8, hd = t.d / 2 + 0.8;
  const out: THREE.BufferGeometry[] = [
    // festgestampfte Fläche
    boxR(t.w + 3, 0.3, t.d + 3, 0, G + 0.05, 0, '#a58c64'),
  ];
  // Fundamentstreifen aus Bruchstein (Teile noch offen)
  const sk = C.sockel;
  out.push(boxR(t.w + 0.8, 0.9, 0.9, 0, G + 0.5, hd - 0.4, sk), boxR(t.w + 0.8, 0.9, 0.9, 0, G + 0.5, -hd + 0.4, sk));
  out.push(boxR(0.9, 0.9, t.d * 0.6, hw - 0.4, G + 0.5, -t.d * 0.18, sk), boxR(0.9, 0.9, t.d * 0.45, -hw + 0.4, G + 0.5, t.d * 0.2, sk));
  // Pflöcke an den Ecken und Seitenmitten, rot-weiße Fähnchen, Schnur
  const pf: [number, number][] = [[-hw - 1, -hd - 1], [hw + 1, -hd - 1], [hw + 1, hd + 1], [-hw - 1, hd + 1], [0, -hd - 1], [0, hd + 1], [-hw - 1, 0], [hw + 1, 0]];
  pf.forEach(([x, z], i) => {
    out.push(boxR(0.35, 2.6, 0.35, x, G + 1.2, z, HOLZ));
    out.push(boxR(0.1, 0.75, 1.1, x + 0.1, G + 2.45, z, i % 2 ? '#e8e2d0' : '#c8402e'));
  });
  const schnur = (x0: number, z0: number, x1: number, z1: number) => {
    const L = Math.hypot(x1 - x0, z1 - z0);
    out.push(boxR(L, 0.1, 0.1, (x0 + x1) / 2, G + 1.5, (z0 + z1) / 2, '#eee6cf', 0, -Math.atan2(z1 - z0, x1 - x0)));
  };
  schnur(-hw - 1, -hd - 1, hw + 1, -hd - 1); schnur(hw + 1, -hd - 1, hw + 1, hd + 1); schnur(hw + 1, hd + 1, -hw - 1, hd + 1); schnur(-hw - 1, hd + 1, -hw - 1, -hd - 1);
  // Baumaterial: Steine, ein Brettstapel, Schubkarre
  out.push(...steinHaufen(-hw - 2.5, hd + 0.5, 6, 1.8, 0.8), ...stapelBretter(hw + 3, hd - 1, 3.4, 1.2, 1));
  out.push(boxR(1.6, 0.6, 1, hw + 1.5, G + 0.9, hd + 3, '#8a6a48'), walze(0.5, 0.15, hw + 1.5, G + 0.5, hd + 3.8, DUNKEL, Math.PI / 2, 0, 8));
  return out;
}

/** Phase 2: Fachwerkgerüst – Sockel, Pfosten, Riegel, Dachstuhl, unten teils ausgefacht. */
function phase2(t: Typ): THREE.BufferGeometry[] {
  const { w, d, floors } = t;
  const fh = 3, H = floors * fh, y0 = 1;
  const out: THREE.BufferGeometry[] = [box(w + 0.4, 5, d + 0.4, 0, y0 - 2.5, 0, C.sockel)];
  const n = Math.max(2, Math.round(w / 2.2)), m = Math.max(2, Math.round(d / 2.2));
  const balken = C.balken;
  for (let i = 0; i <= n; i++) for (const sz of [1, -1]) out.push(box(0.34, H, 0.34, -w / 2 + (w * i) / n, y0 + H / 2, sz * d / 2, balken));
  for (let i = 1; i < m; i++) for (const sx of [1, -1]) out.push(box(0.34, H, 0.34, sx * w / 2, y0 + H / 2, -d / 2 + (d * i) / m, balken));
  for (let f = 0; f <= floors; f++) {
    for (const sz of [1, -1]) out.push(box(w + 0.3, 0.34, 0.34, 0, y0 + f * fh, sz * d / 2, balken));
    for (const sx of [1, -1]) out.push(box(0.34, 0.34, d, sx * w / 2, y0 + f * fh, 0, balken));
  }
  // Deckenbalken des ersten Obergeschosses
  if (floors > 1) for (let i = 0; i <= m; i++) out.push(box(w, 0.3, 0.3, 0, y0 + fh, -d / 2 + (d * i) / m, balken));
  // Streben
  for (const sz of [1, -1]) for (let f = 0; f < floors; f++) {
    const ang = Math.atan2(fh, w / n);
    out.push(box(Math.hypot(fh, w / n), 0.26, 0.2, -w / 2 + w / n / 2, y0 + f * fh + fh / 2, sz * d / 2, balken, 0, ang));
    out.push(box(Math.hypot(fh, w / n), 0.26, 0.2, w / 2 - w / n / 2, y0 + f * fh + fh / 2, sz * d / 2, balken, 0, -ang));
  }
  // untere Gefache teils ausgefacht (Lehm, hell), vorn links und hinten
  const feld = w / n;
  for (let i = 0; i < n; i++) {
    if (i % 3 === 2) continue;
    out.push(box(feld - 0.4, fh - 0.5, 0.18, -w / 2 + feld * (i + 0.5), y0 + fh / 2, -d / 2, t.wand), box(feld - 0.4, fh - 0.5, 0.18, -w / 2 + feld * (i + 0.5), y0 + fh / 2, d / 2 - 0.02, i < n / 2 ? t.wand : '#c9a77a'));
  }
  // Dachstuhl: Sparren paarweise, Firstbalken, Latten
  const hh = d * 0.75, yT = y0 + H;
  const L = Math.hypot(d / 2 + 0.6, hh);
  const ang = Math.atan2(hh, d / 2 + 0.6);
  const sp = Math.max(3, Math.round(w / 2.4));
  for (let i = 0; i <= sp; i++) {
    const x = -w / 2 + (w * i) / sp;
    out.push(boxR(0.3, 0.3, L, x, yT + hh / 2, (d / 2 + 0.6) / 2 - 0.3, '#b98b55', -ang, 0, 0), boxR(0.3, 0.3, L, x, yT + hh / 2, -(d / 2 + 0.6) / 2 + 0.3, '#b98b55', ang, 0, 0));
    out.push(box(0.26, 0.26, d * 0.9, x, yT + 0.1, 0, balken));
  }
  out.push(box(w + 1.2, 0.34, 0.34, 0, yT + hh, 0, balken));
  // einige Dachlatten und die ersten Schindeln auf einer Seite
  for (let k = 1; k <= 3; k++) out.push(box(w + 0.8, 0.14, 0.16, 0, yT + (hh * k) / 4 + 0.15, (d / 2 + 0.6) * (1 - k / 4) - 0.1, '#a07c4e'));
  out.push(boxR(w * 0.35, 0.12, L * 0.3, -w / 2 + w * 0.2, yT + hh * 0.2, (d / 2 + 0.6) * 0.82, t.dach, -ang));
  // Baumaterial: Leiter, Brettstapel, Balken, Fass
  out.push(boxR(0.2, H + 2, 0.2, w / 2 + 1.1, y0 + (H + 2) / 2 - 1, d / 2 + 0.6, HOLZ, 0, 0, -0.14), boxR(0.2, H + 2, 0.2, w / 2 + 2.0, y0 + (H + 2) / 2 - 1, d / 2 + 0.6, HOLZ, 0, 0, -0.14));
  for (let k = 0; k < H; k++) out.push(boxR(0.9, 0.12, 0.12, w / 2 + 1.5 + 0.05 * k, y0 + 0.6 + k * 1.0, d / 2 + 0.6, HOLZ));
  out.push(...stapelBretter(-w / 2 - 3, d / 2 + 1.5, 4, 1.5, 1.6), ...stapelBretter(w / 2 + 3.5, -1, 1.5, 4, 1.1), ...fass(-w / 2 - 2, -d / 2 - 1));
  for (let i = 0; i < 4; i++) out.push(walze(0.3, 5.5, -2 + i * 0.7, G + 0.3 + (i > 1 ? 0.55 : 0), d / 2 + 2.5, '#9a7a52', 0, Math.PI / 2, 5));
  return out;
}

/** Unbekannte Typen zeigen das Wohnhaus. */
function modellTyp(typ: string): string {
  return typ in TYPEN ? typ : 'wohnhaus';
}

const modellCache = new Map<string, THREE.BufferGeometry>();
function modell(typ: string, phase: number): THREE.BufferGeometry {
  const key = `${typ}:${phase}`;
  let g = modellCache.get(key);
  if (!g) {
    const t = TYPEN[modellTyp(typ)];
    g = mergeGeometries(phase <= 1 ? phase1(t) : phase === 2 ? phase2(t) : t.fertig())!;
    g.computeVertexNormals();
    modellCache.set(key, g);
  }
  return g;
}

/** Bauphase 1..3 aus bau (Formel wie in src/sim/typen.ts). */
export function bauPhase(bau: number): 1 | 2 | 3 {
  return (1 + Math.min(2, Math.floor((3 * bau) / (PROMILLE + 1)))) as 1 | 2 | 3;
}

/** Für das Geistermodell (geist.ts): fertiges Modell, Skala, Lage (Ausschnitt-Meter) und Bodenversatz auf Hex (q, r), ohne Planieren. */
export function geistModell(typ: string, grid: HexGrid, q: number, r: number) {
  const t = TYPEN[modellTyp(typ)];
  const sk = HAUS_SKALE * t.skala;
  const w = grid.toWorld({ q, r });
  return { geo: modell(typ, 3), sk, x: w.x, z: w.z - 4 - t.grund[3] * sk, boden: G * sk };
}

// ---------------------------------------------------------------- Warnzeichen

function warnTextur(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  g.lineJoin = 'round';
  g.beginPath(); g.moveTo(64, 10); g.lineTo(118, 108); g.lineTo(10, 108); g.closePath();
  g.fillStyle = '#ffd21f'; g.fill();
  g.lineWidth = 9; g.strokeStyle = '#3a2a10'; g.stroke();
  g.fillStyle = '#3a2a10';
  g.beginPath(); g.moveTo(55, 44); g.lineTo(73, 44); g.lineTo(69, 78); g.lineTo(59, 78); g.closePath(); g.fill();
  g.beginPath(); g.arc(64, 92, 6.5, 0, Math.PI * 2); g.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Symbole für Stillstand: Abzeichen mit gezeichnetem Bild (ohne Schriftzeichen, damit es überall gleich aussieht). */
type Symbol = 'kein_baum' | 'kein_fels' | 'kein_platz' | 'kein_arbeiter' | 'voll';
const SYMBOL_ZUSTAENDE: Partial<Record<GebaeudeZustand, Symbol>> = {
  kein_baum: 'kein_baum', kein_fels: 'kein_fels', kein_platz: 'kein_platz', kein_arbeiter: 'kein_arbeiter', voll: 'voll',
};
function symbolTextur(art: Symbol): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  g.lineJoin = 'round'; g.lineCap = 'round';
  g.beginPath(); g.arc(64, 64, 56, 0, Math.PI * 2);
  g.fillStyle = art === 'voll' ? '#f0a43a' : '#f4f0e4'; g.fill();
  g.lineWidth = 8; g.strokeStyle = '#3a2a10'; g.stroke();
  g.fillStyle = '#3a2a10'; g.strokeStyle = '#3a2a10';
  if (art === 'kein_baum' || art === 'kein_platz') {
    g.fillStyle = '#2f7a3c';
    g.beginPath(); g.moveTo(64, 20); g.lineTo(90, 62); g.lineTo(38, 62); g.closePath(); g.fill();
    g.beginPath(); g.moveTo(64, 42); g.lineTo(96, 88); g.lineTo(32, 88); g.closePath(); g.fill();
    g.fillStyle = '#6b4a2e'; g.fillRect(58, 88, 12, 16);
  } else if (art === 'kein_fels') {
    g.fillStyle = '#8f8a80'; g.strokeStyle = '#3a2a10'; g.lineWidth = 5;
    g.beginPath(); g.moveTo(26, 90); g.lineTo(40, 50); g.lineTo(64, 36); g.lineTo(92, 52); g.lineTo(104, 90); g.closePath(); g.fill(); g.stroke();
    g.fillStyle = '#c0bbb0'; g.beginPath(); g.moveTo(40, 50); g.lineTo(64, 36); g.lineTo(70, 58); g.lineTo(48, 66); g.closePath(); g.fill();
  } else if (art === 'kein_arbeiter') {
    g.fillStyle = '#e98a73'; g.beginPath(); g.arc(64, 46, 17, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#c0392b'; g.beginPath(); g.arc(64, 42, 18, Math.PI, Math.PI * 2); g.fill();
    g.fillStyle = '#3f6fb5'; g.beginPath(); g.ellipse(64, 96, 28, 24, 0, Math.PI, Math.PI * 2); g.fill();
  } else {
    // Lager voll: Kiste
    g.fillStyle = '#b98b55'; g.fillRect(30, 44, 68, 50); g.lineWidth = 5; g.strokeRect(30, 44, 68, 50);
    g.fillStyle = '#3a2a10'; g.fillRect(30, 62, 68, 6); g.fillRect(61, 44, 6, 50);
  }
  if (art !== 'voll') {
    // roter Querstrich: „kein …“
    g.lineWidth = 12; g.strokeStyle = '#d4291f';
    g.beginPath(); g.moveTo(26, 26); g.lineTo(102, 102); g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Bauschild: Pfosten mit rot-weißem Brett (steht an Baustellen neben dem Material). */
function bauschild(): THREE.BufferGeometry {
  return mergeGeometries([
    boxR(0.35, 4.2, 0.35, 0, G + 2.1, 0, HOLZ),
    boxR(3.4, 1.7, 0.22, 0, G + 4.2, 0, '#f1e9d4'),
    boxR(3.4, 0.4, 0.26, 0, G + 4.7, 0, '#c8402e'), boxR(3.4, 0.4, 0.26, 0, G + 3.7, 0, '#c8402e'),
    boxR(0.5, 0.5, 0.28, 0, G + 4.2, 0, '#3a2a10', 0, 0, 0.78),
  ])!;
}

interface Platz { x: number; z: number; y: number; hex: string }

export class Gebaeude {
  readonly group = new THREE.Group();
  /** Wenn gesetzt: Warnzeichen wachsen mit dem Kameraabstand. */
  kamera: THREE.Camera | null = null;
  private saetze = new Map<string, Instanzen>();
  private mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, flatShading: true, side: THREE.DoubleSide });
  private plaetze = new Map<Id, Platz>();
  private warn = new Map<Id, { sp: THREE.Sprite; art: string }>();
  private symbolMat = new Map<string, THREE.SpriteMaterial>();
  private bauWaren: Instanzen[] = [];
  private bauSchild: Instanzen | null = null;
  private zeit = 0;
  private ex: number;
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private p = new THREE.Vector3();
  private s = new THREE.Vector3();
  private farbe = new THREE.Color();

  constructor(private map: MapData, private grid: HexGrid, private base: number, ex: number, private haken: GebaeudeHaken = {}) {
    this.ex = ex;
    this.symbolMat.set('warn', new THREE.SpriteMaterial({ map: warnTextur(), transparent: true, depthWrite: false, fog: false }));
    const matte = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, flatShading: true });
    for (let a = 0; a < WAREN_ANZAHL; a++) this.bauWaren.push(new Instanzen(this.group, warenGeometrie(a), matte, false, true, [], 16));
    this.bauSchild = new Instanzen(this.group, bauschild(), this.mat, false, true, [], 8);
  }

  private symbol(art: string): THREE.SpriteMaterial {
    let m = this.symbolMat.get(art);
    if (!m) { m = new THREE.SpriteMaterial({ map: symbolTextur(art as Symbol), transparent: true, depthWrite: false, fog: false }); this.symbolMat.set(art, m); }
    return m;
  }

  setExaggeration(ex: number) {
    this.ex = ex;
  }

  /** Mitte des Modells (Ausschnitt-Meter) und Skala für ein Gebäude auf Hex (q, r). */
  private lage(typ: string, q: number, r: number) {
    const t = TYPEN[modellTyp(typ)];
    const s = HAUS_SKALE * t.skala;
    const w = this.grid.toWorld({ q, r });
    // Vorderkante des Platzbedarfs liegt 4 m vor der Fahne (Hex-Mitte)
    const z = w.z - 4 - t.grund[3] * s;
    return { t, s, x: w.x, z, hx: w.x, hz: w.z };
  }

  /** Gelände unter dem Grundriss einebnen (wie houses.ts), erdig färben, Netze neu bauen. */
  private planiere(typ: string, q: number, r: number): Platz {
    const { map } = this;
    const { t, s, x, z, hx, hz } = this.lage(typ, q, r);
    const [gx0, gx1, gz0, gz1] = t.grund;
    const x0 = x + gx0 * s - RAND, x1 = x + gx1 * s + RAND, z0 = z + gz0 * s - RAND, z1 = z + gz1 * s + RAND;
    // Sockelhöhe: Mittel aus einem Raster von Proben über den Grundriss
    let sum = 0, cnt = 0;
    for (let a = 0; a <= 4; a++) for (let b = 0; b <= 4; b++) {
      sum += map.heightAt(x0 + ((x1 - x0) * a) / 4, z0 + ((z1 - z0) * b) / 4);
      cnt++;
    }
    const h0 = sum / cnt;
    const { width, height, cell } = map.info;
    const i0 = Math.max(0, Math.floor((x0 - BLEND) / cell)), i1 = Math.min(width - 1, Math.ceil((x1 + BLEND) / cell));
    const j0 = Math.max(0, Math.floor((z0 - BLEND) / cell)), j1 = Math.min(height - 1, Math.ceil((z1 + BLEND) / cell));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const cx = (i + 0.5) * cell, cz = (j + 0.5) * cell;
      // Abstand zum Rechteck (0 = innen)
      const dx = Math.max(x0 - cx, 0, cx - x1), dz = Math.max(z0 - cz, 0, cz - z1);
      const aus = Math.hypot(dx, dz) - cell * 0.5;
      const k = j * width + i;
      if (aus <= 0) { map.ground[k] = h0; this.haken.terrain?.setzeErde(i, j, 1); continue; }
      if (aus < BLEND) {
        const u = aus / BLEND, wgt = 1 - u * u * (3 - 2 * u);
        map.ground[k] += (h0 - map.ground[k]) * wgt;
        this.haken.terrain?.setzeErde(i, j, wgt * 0.55);
      }
    }
    map.groundRev++;
    this.haken.terrain?.erneuere(i0 * cell, j0 * cell, (i1 + 1) * cell, (j1 + 1) * cell);
    this.haken.houses?.verstecke(hx, hz, map.info.hex.size * 0.95);
    // Bäume auf dem Platz (Grundriss samt Rand) entfernen
    this.haken.trees?.lichte(x + (gx0 + gx1) / 2 * s, z + (gz0 + gz1) / 2 * s, Math.hypot((gx1 - gx0) / 2 * s, (gz1 - gz0) / 2 * s) + 8);
    return { x, z, y: h0, hex: `${q},${r}` };
  }

  update(sicht: SimSicht, _alpha = 0, dt = 0) {
    this.zeit += dt;
    for (const g of sicht.gebaeude) if (!this.plaetze.has(g.id)) this.plaetze.set(g.id, this.planiere(g.typ, g.q, g.r));
    for (const s of this.saetze.values()) s.beginne();
    for (const w of this.bauWaren) w.beginne();
    this.bauSchild!.beginne();
    const { base, ex, m, q, p, s, farbe } = this;
    const sichtbar = new Set<Id>();
    for (const g of sicht.gebaeude) {
      const pl = this.plaetze.get(g.id)!;
      const t = TYPEN[modellTyp(g.typ)];
      const phase = bauPhase(g.bau);
      const key = `${modellTyp(g.typ)}:${phase}`;
      let satz = this.saetze.get(key);
      if (!satz) {
        satz = new Instanzen(this.group, modell(modellTyp(g.typ), phase), this.mat, true, true);
        satz.beginne();
        this.saetze.set(key, satz);
      }
      const sk = HAUS_SKALE * t.skala;
      // Boden des Modells (y = G) liegt auf dem planierten Gelände; Gelände erst nach Planierung neu lesen
      const y = (this.map.heightAt(pl.x, pl.z) - base) * ex - G * sk;
      q.identity();
      m.compose(p.set(pl.x, y, pl.z), q, s.set(sk, sk, sk));
      const v = 0.94 + hash(g.id * 7, 3) * 0.12;
      satz.fuege(m, farbe.setRGB(v, v * (0.97 + hash(g.id, 5) * 0.05), v * (0.94 + hash(g.id, 9) * 0.08)));
      // Zeichen über dem Gebäude: ⚠ bei getrennt, sonst ein Symbol bei Stillstand fertiger Gebäude
      const art = g.getrennt ? 'warn' : g.bau >= PROMILLE ? SYMBOL_ZUSTAENDE[g.zustand] ?? null : null;
      if (art) {
        sichtbar.add(g.id);
        let w = this.warn.get(g.id);
        if (!w) { w = { sp: new THREE.Sprite(this.symbol(art)), art }; w.sp.renderOrder = 10; this.group.add(w.sp); this.warn.set(g.id, w); }
        else if (w.art !== art) { w.sp.material = this.symbol(art); w.art = art; }
        const dist = this.kamera ? this.kamera.position.distanceTo(p.set(pl.x, y, pl.z)) : 800;
        const gr = Math.min(120, Math.max(26, dist * 0.045)) * (art === 'warn' ? 1 : 0.8);
        w.sp.scale.set(gr, gr, 1);
        w.sp.position.set(pl.x, y + (t.hoehe * sk) + gr * 0.7 + Math.sin(this.zeit * 3 + g.id) * gr * 0.1, pl.z);
      }
      // Baustelle: offener Bedarf als kleiner Stapel vor dem Grundstück, dazu ein Bauschild
      if (g.bau < PROMILLE && g.bedarf) this.bauBedarf(g);
    }
    for (const [id, w] of this.warn) if (!sichtbar.has(id)) { this.group.remove(w.sp); this.warn.delete(id); }
    for (const w of this.bauWaren) w.fertig();
    this.bauSchild!.fertig();
    for (const sa of this.saetze.values()) sa.fertig();
  }

  /** Offener Bedarf einer Baustelle als Warenstapel links vor dem Hex-Mittelpunkt (an der Fahne), mit Bauschild. */
  private bauBedarf(g: { id: Id; q: number; r: number; bedarf?: number[] }) {
    const { m, q, p, s, ex, base } = this;
    const w = this.grid.toWorld({ q: g.q, r: g.r });
    const k = this.kamera ? Math.max(1, Math.min(1.6, this.kamera.position.distanceTo(p.set(w.x, 0, w.z)) / 900)) : 1;
    let slot = 0;
    q.identity();
    for (let a = 0; a < WAREN_ANZAHL; a++) {
      const n = Math.min(8, g.bedarf![a] ?? 0);
      if (n <= 0) continue;
      const bx = w.x - 17 - slot * 11 * k, bz = w.z + 8;
      for (let j = 0; j < n; j++) {
        const x = bx + (j % 2) * WARE_M * 1.0, lv = Math.floor(j / 2), z = bz + (lv % 2) * 0.8;
        s.setScalar(k);
        m.compose(p.set(x, (this.map.heightAt(x, z) - base) * ex + lv * WARE_HOEHE[a] * k, z), q, s);
        this.bauWaren[a].fuege(m);
      }
      slot++;
    }
    if (slot) {
      const x = w.x - 17 - slot * 11 * k - 1, z = w.z + 8;
      s.setScalar(1.4 * k);
      m.compose(p.set(x, (this.map.heightAt(x, z) - base) * ex - G * 1.4 * k, z), q, s);
      this.bauSchild!.fuege(m);
    }
  }

  /** Mitte (Ausschnitt-Meter) eines Gebäudes, sobald es einmal in der Sicht war. */
  mitte(id: Id): { x: number; z: number } | null {
    const pl = this.plaetze.get(id);
    return pl ? { x: pl.x, z: pl.z } : null;
  }
}
