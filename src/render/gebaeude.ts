// Spielgebäude (Drehbuch 3, 7.3; M3–M5): Lager, Wohnhaus, Holz und Stein, die Essens-Ketten und der Kirmesplatz als prozedurale
// Fachwerk-Modelle (fachwerk() aus mockup.ts) in HAUS_SKALE-facher Größe auf dem Gebäude-Hex. Der Eingang schaut nach
// Süden (+z), die Fahne steht davor in der Hex-Mitte (fahnen.ts). Drei Bauphasen aus `bau` (Phasenformel in
// src/sim/typen.ts): 1 abgesteckter Grund mit Fundament und Pflöcken, 2 Fachwerkgerüst, 3 fertig mit Dach.
// Das Gelände unter dem Grundriss wird eingeebnet (map.ground, wie houses.ts), weich übergeblendet und erdig gefärbt: auf
// ebenen Plätzen sofort, am Hang in Vierteln, so weit der Planierer ist (Drehbuch 4.5); Kulissenhäuser auf dem Hex verschwinden.
// ⚠ über Gebäuden ohne Wegverbindung (getrennt), kleine Symbole bei Stillstand (kein Baum/Fels/Platz/Arbeiter, Lager voll, Hunger,
// kein Bauarbeiter/Planierer), darunter der Zustand in Klartext (Schild, Text von der Spiel-Schicht). An Baustellen liegt der
// angelieferte Stapel samt Bauschild, am Kirmesplatz die gelieferte Warenliste; beim Fest dreht sich das Karussell, es gibt
// Feuerwerk. Reiner Leser der SimSicht, ohne Simulation nutzbar.
import * as THREE from 'three';
import { mitSchnee } from './kulisse';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { MapData } from '../map/mapdata';
import type { HexGrid } from '../map/hex';
import { PROMILLE, type GebaeudeZustand, type Id, type SimSicht } from '../sim/typen';
import { box, roof, fachwerk, logPile, mitDach, paint, weicheKiste, C } from './mockup';
import { Instanzen } from './instanzen';
import { WAREN_ANZAHL, WARE_HOEHE, warenGeometrie } from './waren';
import { WARE_M } from './massstab';
import { GEBAEUDE } from '../sim/daten';
import { VOELKCHEN } from '../sim/voelkchen';

const VOLK_DACH = new Map(VOELKCHEN.map((v) => [v.id, v.dach] as [string, string]));
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
  paint(weicheKiste(w, h, d).rotateX(rx).rotateZ(rz).rotateY(ry).translate(x, y, z), farbe);
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
    w: 18, d: 10, floors: 2, wand: '#f0e8d6', dach: '#b0563e', laden: '#2f7a55', skala: 1, hoehe: 15,
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
  kartoffelfeld: {
    w: 5.5, d: 4.5, floors: 1, wand: '#efe2c6', dach: '#7a5a3a', laden: '#4f8a3a', skala: 1, hoehe: 7,
    grund: [-5, 23, -4, 14],
    fertig() {
      const t = TYPEN.kartoffelfeld;
      const out: THREE.BufferGeometry[] = [...fachwerk(t.w, t.d, t.floors, t.wand, t.dach), ...laeden(t.w, t.d, t.floors, t.laden)];
      // großer Acker rechts: braune Furchen, grüne Stauden in Reihen, Zaun
      const ax = 13, az = 4.5;
      out.push(boxR(17, 0.4, 16, ax, G + 0.15, az, '#6a4a2c'));
      for (let r = 0; r < 6; r++) {
        out.push(boxR(16, 0.5, 1.0, ax, G + 0.45, az - 6.5 + r * 2.6, '#7d5634'));
        for (let k = 0; k < 7; k++) out.push(paint(new THREE.SphereGeometry(0.85, 5, 4).scale(1, 0.7, 1).translate(ax - 7 + k * 2.3, G + 1.1, az - 6.5 + r * 2.6), (k + r) % 3 ? '#4f9a3a' : '#5eaa44'));
      }
      for (const [fx, fz] of [[-8.8, -8.3], [8.8, -8.3], [8.8, 8.3], [-8.8, 8.3], [0, -8.3], [0, 8.3], [8.8, 0], [-8.8, 0]]) out.push(boxR(0.3, 1.6, 0.3, ax + fx, G + 0.8, az + fz, HOLZ));
      out.push(boxR(17.6, 0.2, 0.18, ax, G + 1.3, az + 8.3, HOLZ), boxR(17.6, 0.2, 0.18, ax, G + 1.3, az - 8.3, HOLZ));
      // Hacke und Kartoffelsäcke vor der Hütte
      out.push(boxR(0.14, 2.6, 0.14, -2.5, G + 1.3, 3.6, HOLZ, 0, 0, 0.3), boxR(0.9, 0.25, 0.1, -2.1, G + 0.3, 3.6, '#9aa0a6'));
      out.push(paint(new THREE.SphereGeometry(0.8, 6, 5).scale(1, 0.9, 1).translate(1.6, G + 0.7, 3.6), '#d8c08a'), paint(new THREE.SphereGeometry(0.7, 6, 5).translate(2.8, G + 0.6, 4.2), '#cfb57c'));
      return out;
    },
  },
  kueche: {
    w: 7, d: 6, floors: 1, wand: '#f3e4c4', dach: '#8f3b2b', laden: '#c8642f', skala: 1, hoehe: 10,
    grund: [-6, 7, -4.5, 8],
    fertig() {
      const t = TYPEN.kueche;
      return [...fachwerk(t.w, t.d, t.floors, t.wand, t.dach), ...laeden(t.w, t.d, t.floors, t.laden), ...blumenkasten(t.w, t.d, t.floors),
        // Schornstein mit Rauchwölkchen
        boxR(1.1, 4.5, 1.1, 2, G + 6.5, -0.8, '#8a6a5a'), paint(new THREE.SphereGeometry(0.8, 5, 4).translate(2.2, G + 9.4, -0.8), '#d9d9d9'), paint(new THREE.SphereGeometry(0.6, 5, 4).translate(2.7, G + 10.4, -1.1), '#e6e6e6'),
        // Aushängeschild mit Pfanne, Tisch mit Bank, Feuerholz
        boxR(0.2, 3, 0.2, -4.2, G + 1.5, 4.4, HOLZ), boxR(2, 0.18, 0.18, -3.3, G + 2.9, 4.4, HOLZ),
        walze(0.75, 0.15, -2.6, G + 2.2, 4.4, '#2a2a2a', Math.PI / 2, 0, 10), boxR(0.9, 0.1, 0.1, -1.6, G + 2.2, 4.4, '#2a2a2a'),
        boxR(2.6, 0.2, 1.2, 2, G + 1.1, 5.2, HOLZ), boxR(0.2, 1.1, 1.0, 1, G + 0.55, 5.2, HOLZ), boxR(0.2, 1.1, 1.0, 3, G + 0.55, 5.2, HOLZ),
        ...logPile(-5.5, -0.5, 4).map((g) => g.translate(0, G, 0))];
    },
  },
  obstwiese: {
    w: 4.5, d: 4, floors: 1, wand: '#e9dcbc', dach: '#6d4a2f', laden: '#b53a2c', skala: 1, hoehe: 7,
    grund: [-5, 22, -6, 14],
    fertig() {
      const t = TYPEN.obstwiese;
      const out: THREE.BufferGeometry[] = [...fachwerk(t.w, t.d, t.floors, t.wand, t.dach)];
      // sechs Apfelbäume mit roten Äpfeln, Leiter, Körbe
      const baeume = [[7, -3], [13, -3.5], [19, -2.5], [8, 5], [14, 5.5], [19.5, 6]];
      baeume.forEach(([bx, bz], i) => {
        out.push(walze(0.45, 3.2, bx, G + 1.6, bz, HOLZ, 0, 0, 6), paint(new THREE.SphereGeometry(2.6, 7, 5).scale(1, 0.85, 1).translate(bx, G + 4.6, bz), i % 2 ? '#4f8f3a' : '#5a9a42'));
        for (let k = 0; k < 5; k++) out.push(paint(new THREE.SphereGeometry(0.38, 4, 3).translate(bx + Math.cos(k * 1.3 + i) * 2.2, G + 4.2 + (k % 2) * 1.1, bz + Math.sin(k * 1.3 + i) * 2.2), '#d0312d'));
      });
      out.push(boxR(0.2, 5, 0.2, 10.6, G + 2.4, 1.1, HOLZ, 0, 0, 0.3), boxR(0.2, 5, 0.2, 11.4, G + 2.4, 1.1, HOLZ, 0, 0, 0.3));
      out.push(walze(0.9, 0.8, -2.5, G + 0.4, 4.4, '#b0844e', 0, 0, 9), walze(0.9, 0.8, -0.3, G + 0.4, 4.6, '#b0844e', 0, 0, 9));
      for (let k = 0; k < 4; k++) out.push(paint(new THREE.SphereGeometry(0.35, 4, 3).translate(-2.5 + (k % 2) * 0.4, G + 1.0, 4.2 + Math.floor(k / 2) * 0.4), '#d0312d'));
      return out;
    },
  },
  mostkeller: {
    w: 8, d: 6, floors: 1, wand: '#c9bca4', dach: '#5a4a3c', laden: '#6b8f3a', skala: 1, hoehe: 8,
    grund: [-7, 9, -4.5, 8],
    fertig() {
      const t = TYPEN.mostkeller;
      // halb in den Hang gebaut: Bruchsteinmauern, Tonnengewölbe-Eingang, Fässer, Kelter
      const out: THREE.BufferGeometry[] = [boxR(t.w, 4.5, t.d, 0, G + 2.25, 0, '#a39d92'), ...roof(t.w, t.d, 2.5, G + 4.5, t.dach, '#a39d92')];
      for (let i = 0; i < 6; i++) out.push(boxR(1.4, 0.6, 0.2, -3 + i * 1.2, G + 0.6 + (i % 2) * 1.4, t.d / 2 + 0.05, '#8f897f'));
      out.push(walze(1.4, 0.4, 0, G + 2, t.d / 2 + 0.1, '#5a3b26', Math.PI / 2, 0, 10), boxR(2.8, 2, 0.4, 0, G + 1, t.d / 2 + 0.1, '#5a3b26'));
      out.push(...fass(-5.2, 4.2), ...fass(-5.6, 5.8), ...fass(5.2, 4.6), ...fass(4.5, 6.0, G), ...fass(5.0, 5.3, G + 1.3));
      // Kelter: Holzrahmen mit Spindel
      out.push(boxR(0.4, 3, 0.4, 7.4, G + 1.5, -1.2, HOLZ), boxR(0.4, 3, 0.4, 7.4, G + 1.5, 1.2, HOLZ), boxR(0.5, 0.5, 3, 7.4, G + 3, 0, DUNKEL),
        walze(1.2, 1.1, 7.4, G + 0.55, 0, '#8a5a30', 0, 0, 9), boxR(0.18, 2, 0.18, 7.4, G + 2, 0, '#9aa0a6'));
      return out;
    },
  },
  schafstall: {
    w: 12, d: 6, floors: 1, wand: '#e6d6b4', dach: '#6b5d52', laden: '#8a6340', skala: 0.9, hoehe: 8,
    grund: [-8, 9, -16, 7],
    fertig() {
      const t = TYPEN.schafstall;
      const out: THREE.BufferGeometry[] = [...fachwerk(t.w, t.d, t.floors, t.wand, t.dach)];
      // Stalltor, Heuballen
      out.push(box(3.2, 2.6, 0.3, 2, G + 1.6, t.d / 2 + 0.2, '#6a4426'), boxR(0.2, 3, 0.25, 2, G + 1.6, t.d / 2 + 0.38, DUNKEL, 0, 0, 0.7));
      out.push(walze(1.0, 1.6, -6.8, G + 1, 4.2, '#d9c070', Math.PI / 2, 0, 9), walze(1.0, 1.6, -5, G + 1, 4.6, '#cfb562', Math.PI / 2, 0, 9));
      // Weide hinter dem Stall mit Zaun und Schafen
      const wz = -11;
      out.push(boxR(15, 0.2, 9, 0, G + 0.05, wz, '#7fae55'));
      for (const fx of [-7.4, -2.5, 2.5, 7.4]) for (const fz of [-4.4, 4.4]) out.push(boxR(0.3, 1.5, 0.3, fx, G + 0.75, wz + fz, HOLZ));
      out.push(boxR(15, 0.18, 0.18, 0, G + 1.2, wz - 4.4, HOLZ), boxR(0.18, 0.18, 9, -7.4, G + 1.2, wz, HOLZ), boxR(0.18, 0.18, 9, 7.4, G + 1.2, wz, HOLZ));
      const schafe = [[-4.5, -2], [-1, 1.5], [2.5, -1.8], [5, 2], [-5.5, 2.2], [1, -3.2]];
      schafe.forEach(([sx, sz], i) => {
        const r = i * 0.9;
        out.push(paint(new THREE.SphereGeometry(1.05, 7, 5).scale(1.3, 0.85, 0.9).rotateY(r).translate(sx, G + 1.2, wz + sz), '#f4f1e8'));
        out.push(paint(new THREE.SphereGeometry(0.45, 5, 4).translate(sx + Math.cos(r) * 1.3, G + 1.45, wz + sz - Math.sin(r) * 1.3), '#2c2620'));
        for (const [lx, lz] of [[0.6, 0.4], [-0.6, 0.4], [0.6, -0.4], [-0.6, -0.4]]) out.push(boxR(0.18, 0.7, 0.18, sx + lx * Math.cos(r) + lz * Math.sin(r), G + 0.35, wz + sz - lx * Math.sin(r) + lz * Math.cos(r), '#2c2620'));
      });
      return out;
    },
  },
  kaeserei: {
    w: 7.5, d: 6, floors: 1, wand: '#fbf2d6', dach: '#5f7090', laden: '#e0a830', skala: 1, hoehe: 9,
    grund: [-6, 9, -4.5, 8],
    fertig() {
      const t = TYPEN.kaeserei;
      const out: THREE.BufferGeometry[] = [...fachwerk(t.w, t.d, t.floors, t.wand, t.dach), ...laeden(t.w, t.d, t.floors, t.laden)];
      // Regal mit Käserädern neben dem Haus, Milchkannen an der Tür
      out.push(boxR(0.3, 3.2, 0.3, 5, G + 1.6, -1.5, HOLZ), boxR(0.3, 3.2, 0.3, 5, G + 1.6, 2.5, HOLZ), boxR(0.3, 3.2, 0.3, 7.4, G + 1.6, -1.5, HOLZ), boxR(0.3, 3.2, 0.3, 7.4, G + 1.6, 2.5, HOLZ));
      for (let e = 0; e < 3; e++) {
        out.push(boxR(2.8, 0.15, 4.4, 6.2, G + 0.5 + e * 1.1, 0.5, HOLZ));
        for (let k = 0; k < 3; k++) out.push(walze(0.6, 0.45, 6.2, G + 0.85 + e * 1.1, -0.8 + k * 1.3, e === 1 ? '#e8b528' : '#f2c230', 0, 0, 10));
      }
      for (let k = 0; k < 3; k++) out.push(walze(0.42, 1.1, -1.2 + k * 0.9, G + 0.55, t.d / 2 + 1.0, '#eef0ea', 0, 0, 8), walze(0.44, 0.12, -1.2 + k * 0.9, G + 0.5, t.d / 2 + 1.0, '#2f6db5', 0, 0, 8));
      // großes Käserad als Aushängeschild
      out.push(walze(0.95, 0.35, -4.2, G + 3.3, t.d / 2 + 0.5, '#f2c230', Math.PI / 2, 0, 12), boxR(0.2, 3, 0.2, -4.2, G + 1.5, t.d / 2 + 0.5, HOLZ));
      return out;
    },
  },
  bienenstock: {
    w: 3.6, d: 3.2, floors: 1, wand: '#efe2c6', dach: '#8a5a30', laden: '#e0a830', skala: 1, hoehe: 6,
    grund: [-4, 13, -4, 8],
    fertig() {
      const t = TYPEN.bienenstock;
      const out: THREE.BufferGeometry[] = [...fachwerk(t.w, t.d, t.floors, t.wand, t.dach)];
      // Bienenstand: bunte Kästen auf einer Bank unter einem Pultdach, Blumen davor
      const farben = ['#e0a830', '#2f7a55', '#c8402e', '#3a6ea5', '#e9e2cf', '#e0a830'];
      out.push(boxR(9, 0.3, 2.2, 7.5, G + 1.2, 0.5, HOLZ), boxR(0.3, 1.2, 0.3, 3.4, G + 0.6, 0.5, HOLZ), boxR(0.3, 1.2, 0.3, 11.6, G + 0.6, 0.5, HOLZ));
      farben.forEach((f, i) => {
        out.push(boxR(1.25, 1.5, 1.6, 4.1 + i * 1.4, G + 2.1, 0.5, f), boxR(1.35, 0.15, 1.7, 4.1 + i * 1.4, G + 2.9, 0.5, '#6b4a2e'));
        out.push(boxR(0.5, 0.12, 0.05, 4.1 + i * 1.4, G + 1.6, 1.32, DUNKEL));
      });
      out.push(boxR(10, 0.2, 3.2, 7.5, G + 4.2, 0.3, '#8a5a30', 0.25));
      for (const px of [3, 12]) out.push(boxR(0.3, 3.8, 0.3, px, G + 2.1, -0.9, HOLZ));
      for (let k = 0; k < 12; k++) out.push(paint(new THREE.SphereGeometry(0.32, 4, 3).translate(3.5 + (k % 6) * 1.6, G + 0.45, 3.2 + Math.floor(k / 6) * 1.1), ['#e05a9a', '#f0d040', '#9a6ad0'][k % 3]));
      return out;
    },
  },
  reifekeller: {
    w: 7, d: 6, floors: 1, wand: '#b8b0a2', dach: '#4f5964', laden: '#5a3b26', skala: 1, hoehe: 8,
    grund: [-6, 7, -4.5, 7],
    fertig() {
      const t = TYPEN.reifekeller;
      // gemauertes Kellerhaus mit Bogentür, Erdhügel obendrauf
      return [boxR(t.w, 4, t.d, 0, G + 2, 0, '#a8a092'), paint(new THREE.SphereGeometry(4.6, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.55, 0.85).translate(0, G + 4, 0), '#6f9a4a'),
        walze(1.2, 0.4, 0, G + 2.2, t.d / 2 + 0.1, '#4a3220', Math.PI / 2, 0, 10), boxR(2.4, 2.2, 0.4, 0, G + 1.1, t.d / 2 + 0.1, '#4a3220'),
        walze(0.55, 0.4, 3, G + 0.25, t.d / 2 + 1.2, '#d98a1e', 0, 0, 10), walze(0.55, 0.4, 3, G + 0.65, t.d / 2 + 1.2, '#c97a14', 0, 0, 10)];
    },
  },
  // ---- M8: Bier, Schnaps, Schänke, Eisen, Lagerhaus
  gerstenfeld: {
    w: 4.5, d: 4, floors: 1, wand: '#efe2c6', dach: '#7a5a3a', laden: '#c9a227', skala: 1, hoehe: 7,
    grund: [-5, 23, -5, 14],
    fertig() {
      const t = TYPEN.gerstenfeld;
      const out: THREE.BufferGeometry[] = [...fachwerk(t.w, t.d, t.floors, t.wand, t.dach), ...laeden(t.w, t.d, t.floors, t.laden)];
      // goldenes Gerstenfeld mit Ähren in Reihen, ein paar Garben am Rand, Sense an der Hütte
      const ax = 13, az = 4.5;
      out.push(boxR(17, 0.4, 16, ax, G + 0.15, az, '#8a6a3c'));
      for (let r = 0; r < 8; r++) for (let k = 0; k < 9; k++) {
        out.push(paint(new THREE.ConeGeometry(0.55, 1.9, 4).translate(ax - 7.6 + k * 1.9, G + 1.25, az - 7 + r * 2), (k + r) % 3 ? '#d8b45a' : '#e6c46a'));
      }
      for (const [gx, gz] of [[4.6, -4], [4.6, -1.8]]) out.push(walze(0.5, 1.8, gx, G + 0.9, gz, '#c9a24a', 0, 0, 7), walze(0.55, 0.15, gx, G + 1.1, gz, '#8a6038', 0, 0, 7));
      out.push(boxR(0.14, 2.8, 0.14, -2.6, G + 1.4, 3.4, HOLZ, 0, 0, 0.25), boxR(1.4, 0.1, 0.3, -2.1, G + 2.7, 3.4, '#b0b8c0', 0, 0, -0.4));
      return out;
    },
  },
  brauerei: {
    w: 10, d: 7, floors: 2, wand: '#f2e2c0', dach: '#7a3a2a', laden: '#2f6db5', skala: 0.95, hoehe: 14,
    grund: [-7.5, 9, -5, 8],
    fertig() {
      const t = TYPEN.brauerei;
      return [...fachwerk(t.w, t.d, t.floors, t.wand, t.dach), ...laeden(t.w, t.d, t.floors, t.laden),
        // Schornstein mit Dampf, Bierfässer gestapelt, Aushängeschild mit Krug
        boxR(1.2, 5, 1.2, 3, G + 10, -1.5, '#8a5a4a'), paint(new THREE.SphereGeometry(0.9, 5, 4).translate(3.2, G + 13.2, -1.5), '#eeeeee'),
        ...fass(-6.2, 4.8), ...fass(-7.6, 4.2), ...fass(-6.9, 5.6, G + 1.3), ...fass(6.5, 4.6),
        boxR(0.2, 3.2, 0.2, -3.6, G + 1.6, t.d / 2 + 0.8, HOLZ), boxR(1.8, 0.18, 0.18, -2.8, G + 3.1, t.d / 2 + 0.8, HOLZ),
        walze(0.45, 0.8, -2.2, G + 2.4, t.d / 2 + 0.8, '#9a6a3a', 0, 0, 8), walze(0.5, 0.18, -2.2, G + 2.85, t.d / 2 + 0.8, '#f4f1e8', 0, 0, 8)];
    },
  },
  wacholderheide: {
    w: 4, d: 3.6, floors: 1, wand: '#e3d6b6', dach: '#5a4a3c', laden: '#3f4f8a', skala: 1, hoehe: 6,
    grund: [-4.5, 21, -6, 12],
    fertig() {
      const t = TYPEN.wacholderheide;
      const out: THREE.BufferGeometry[] = [...fachwerk(t.w, t.d, t.floors, t.wand, t.dach)];
      // Heide mit Wacholdersäulen (schmale dunkelgrüne Kegel), Erika in Lila, Körbe mit Beeren
      out.push(boxR(17, 0.25, 16, 12, G + 0.08, 3, '#8a7a52'));
      const busch = [[6, -3], [9, 1], [12.5, -4], [15, 0.5], [18, -3], [7.5, 5.5], [11, 7], [14.5, 5], [18.5, 7.5], [16.5, -6]];
      busch.forEach(([bx, bz], i) => {
        out.push(paint(new THREE.ConeGeometry(0.9 + (i % 3) * 0.2, 4 + (i % 4) * 0.8, 6).translate(bx, G + 2 + (i % 4) * 0.4, bz), i % 2 ? '#2f5a3a' : '#3b6a44'));
        out.push(paint(new THREE.SphereGeometry(0.7, 5, 4).scale(1.4, 0.4, 1.2).translate(bx + 1.4, G + 0.3, bz + 1.2), '#9a5aa8'));
      });
      out.push(walze(0.8, 0.7, -2.4, G + 0.35, 3.4, '#b0844e', 0, 0, 9));
      for (let k = 0; k < 5; k++) out.push(paint(new THREE.SphereGeometry(0.25, 4, 3).translate(-2.6 + (k % 3) * 0.3, G + 0.8, 3.2 + (k % 2) * 0.3), '#3f4f8a'));
      return out;
    },
  },
  brennerei: {
    w: 7, d: 6, floors: 1, wand: '#c9bca4', dach: '#5f7090', laden: '#7a2a2a', skala: 1, hoehe: 10,
    grund: [-6, 8, -4.5, 8],
    fertig() {
      const t = TYPEN.brennerei;
      return [...fachwerk(t.w, t.d, t.floors, t.wand, t.dach), ...laeden(t.w, t.d, t.floors, t.laden),
        // kupferne Brennblase mit Helm und Rohr vor dem Haus, Schornstein
        walze(1.2, 1.8, 5, G + 0.9, 3, '#b8733a', 0, 0, 12), paint(new THREE.SphereGeometry(1.2, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2).translate(5, G + 1.8, 3), '#c8834a'),
        walze(0.25, 1.4, 5, G + 3.2, 3, '#c8834a', 0, 0, 8), boxR(2.4, 0.22, 0.22, 6.1, G + 3.8, 3, '#c8834a', 0, 0, -0.35),
        walze(0.6, 1.6, 7.2, G + 0.8, 3, '#8a6340', 0, 0, 9),
        boxR(1, 4, 1, -2, G + 7, -1, '#8a6a5a'), paint(new THREE.SphereGeometry(0.7, 5, 4).translate(-2, G + 9.4, -1), '#e6e6e6'),
        ...fass(-5, 4.5)];
    },
  },
  schaenke: {
    w: 9, d: 7, floors: 2, wand: '#f4e2c2', dach: '#2f3a4a', laden: '#c8402e', skala: 0.95, hoehe: 13,
    grund: [-7, 9, -5, 9],
    fertig() {
      const t = TYPEN.schaenke;
      return [...fachwerk(t.w, t.d, t.floors, t.wand, t.dach), ...laeden(t.w, t.d, t.floors, t.laden), ...blumenkasten(t.w, t.d, t.floors),
        // Wirtshausschild mit Flasche, Biertische vor der Tür, Fässer
        boxR(0.2, 0.2, 2, -3.5, G + 4.6, t.d / 2 + 1, '#2a2a2a'), boxR(1.5, 1.2, 0.12, -3.5, G + 3.8, t.d / 2 + 1.9, '#e0a830'),
        walze(0.2, 0.9, -3.5, G + 3.8, t.d / 2 + 2, '#cfe6dc', 0, 0, 7),
        boxR(3, 0.2, 1.3, 1.5, G + 1.1, t.d / 2 + 2.3, HOLZ), boxR(3, 0.15, 0.4, 1.5, G + 0.6, t.d / 2 + 1.4, HOLZ), boxR(3, 0.15, 0.4, 1.5, G + 0.6, t.d / 2 + 3.2, HOLZ),
        ...fass(5.8, 4.4), ...fass(6.6, 5.6)];
    },
  },
  erzgrube: {
    w: 5, d: 4, floors: 1, wand: '#b0a08a', dach: '#5a4a3c', laden: '#8a4a32', skala: 1, hoehe: 9,
    grund: [-6, 9, -6, 8],
    fertig() {
      const t = TYPEN.erzgrube;
      // Stolleneingang im Hügel mit Holzrahmen, Förderturm, Lore auf Schienen, Erzhaufen
      return [paint(new THREE.SphereGeometry(5, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2).scale(1.2, 0.8, 1).translate(0, G, -2), '#7a6a52'),
        boxR(2.8, 3, 0.5, 0, G + 1.5, 2.6, '#1a1410'), boxR(0.4, 3.4, 0.4, -1.5, G + 1.7, 2.9, HOLZ), boxR(0.4, 3.4, 0.4, 1.5, G + 1.7, 2.9, HOLZ), boxR(3.6, 0.4, 0.5, 0, G + 3.4, 2.9, HOLZ),
        boxR(0.3, 7, 0.3, -4, G + 3.5, 2, HOLZ), boxR(0.3, 7, 0.3, -2.6, G + 3.5, 2, HOLZ), walze(0.8, 0.3, -3.3, G + 7, 2, DUNKEL, Math.PI / 2, 0, 10),
        boxR(0.15, 0.15, 6, -0.6, G + 0.1, 5.5, '#6a6a6a'), boxR(0.15, 0.15, 6, 0.6, G + 0.1, 5.5, '#6a6a6a'),
        boxR(1.6, 0.9, 1.2, 0, G + 0.7, 6, '#5a4a3a'), ...steinHaufen(4, 5, 7, 1.6, 0.6).map((g) => paint(g, '#8a4a32')),
        ...fachwerk(t.w, t.d, t.floors, t.wand, t.dach).map((g) => g.translate(5.5, 0, -1))];
    },
  },
  koehlerei: {
    w: 4.5, d: 4, floors: 1, wand: '#d8c8a8', dach: '#4a3a2a', laden: '#2b2b2b', skala: 1, hoehe: 7,
    grund: [-5, 13, -6, 8],
    fertig() {
      const t = TYPEN.koehlerei;
      // Kohlenmeiler: rauchender Erdkegel, Holzstapel, kleine Köhlerhütte
      return [...fachwerk(t.w, t.d, t.floors, t.wand, t.dach),
        paint(new THREE.SphereGeometry(3.4, 9, 6, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.9, 1).translate(8, G, 0), '#3a3028'),
        paint(new THREE.SphereGeometry(0.9, 5, 4).translate(8, G + 3.6, 0), '#9a9a9a'), paint(new THREE.SphereGeometry(1.2, 5, 4).translate(8.6, G + 5, -0.3), '#b8b8b8'),
        ...logPile(8, 5.5, 6).map((g) => g.translate(0, G, 0)), ...kiste(-3.5, 3.8, 1.2).map((g) => paint(g, '#2b2b2b'))];
    },
  },
  eisenhuette: {
    w: 10, d: 7, floors: 1, wand: '#a8a092', dach: '#3a3a3a', laden: '#8a4a32', skala: 1, hoehe: 15,
    grund: [-8, 10, -5, 8],
    fertig() {
      const t = TYPEN.eisenhuette;
      // Hochofen aus Bruchstein mit Glut, Blasebalg-Rad am Bach, Eisenbarren davor (Schleidener Tal)
      return [boxR(t.w, 5, t.d, 0, G + 2.5, 0, '#8f897f'), ...roof(t.w, t.d, 2.4, G + 5, t.dach, '#8f897f'),
        walze(1.9, 9, 3, G + 4.5, -0.5, '#7a7268', 0, 0, 8), walze(1.4, 0.6, 3, G + 9.3, -0.5, '#5a524a', 0, 0, 8),
        boxR(1.4, 1.4, 0.3, 3, G + 1.2, 1.5, '#ff7a1a'), paint(new THREE.SphereGeometry(1, 5, 4).translate(3.3, G + 10.6, -0.5), '#8a8a8a'),
        walze(2.2, 0.5, -t.w / 2 - 0.6, G + 2.4, 0, HOLZ, 0, Math.PI / 2, 12), walze(0.3, 1.2, -t.w / 2 - 0.4, G + 2.4, 0, DUNKEL, 0, Math.PI / 2, 6),
        boxR(1.4, 0.3, 0.5, -2, G + 0.35, t.d / 2 + 1.2, '#7d8a96'), boxR(1.4, 0.3, 0.5, -2, G + 0.65, t.d / 2 + 1.2, '#6d7a86')];
    },
  },
  schmiede: {
    w: 7, d: 6, floors: 1, wand: '#d8c8a8', dach: '#4a3a2a', laden: '#5a5a5a', skala: 1, hoehe: 10,
    grund: [-6, 8, -4.5, 8],
    fertig() {
      const t = TYPEN.schmiede;
      return [...fachwerk(t.w, t.d, t.floors, t.wand, t.dach), ...laeden(t.w, t.d, t.floors, t.laden),
        // offene Esse mit Glut unter Vordach, Amboss auf Holzklotz, Hufeisen über der Tür
        boxR(4, 0.25, 3, 5, G + 3.2, 2.5, t.dach), boxR(0.25, 3.2, 0.25, 6.8, G + 1.6, 3.8, HOLZ),
        boxR(1.6, 1.1, 1.4, 4.4, G + 0.55, 2, '#7a7268'), boxR(1.0, 0.25, 0.8, 4.4, G + 1.2, 2, '#ff7a1a'),
        walze(0.5, 0.9, 5.8, G + 0.45, 4.6, HOLZ, 0, 0, 8), boxR(1.1, 0.4, 0.45, 5.8, G + 1.1, 4.6, '#3a3a3a'),
        boxR(1, 4, 1, -2, G + 7, -1, '#7a6a5a'), paint(new THREE.TorusGeometry(0.45, 0.1, 4, 8, Math.PI * 1.4).rotateZ(-0.5).translate(0, G + 3.2, t.d / 2 + 0.2), '#9aa0a6')];
    },
  },
  finderhuette: {
    w: 4.5, d: 4, floors: 1, wand: '#d9c9a8', dach: '#4a4a3a', laden: '#2f3a4a', skala: 0.95, hoehe: 8,
    grund: [-6, 8, -5, 8],
    fertig() {
      const t = TYPEN.finderhuette;
      // dunkle Hütte mit Laterne, Sack an der Wand, Spaten und Leiter (zum „Finden“)
      return [...fachwerk(t.w, t.d, t.floors, t.wand, t.dach), ...laeden(t.w, t.d, t.floors, t.laden),
        boxR(0.18, 0.18, 1.3, 2.6, G + 3.2, t.d / 2 + 0.6, DUNKEL), boxR(0.55, 0.7, 0.55, 2.6, G + 2.7, t.d / 2 + 1.2, '#2a2a2a'),
        paint(new THREE.SphereGeometry(0.22, 6, 5).translate(2.6, G + 2.7, t.d / 2 + 1.2), '#ffd27a'),
        paint(new THREE.SphereGeometry(0.75, 7, 5).scale(1, 1.2, 0.8).translate(-2.9, G + 0.8, t.d / 2 + 0.5), '#b08850'),
        boxR(0.12, 2.4, 0.12, 4.2, G + 1.2, 1, HOLZ, 0, 0, 0.25), boxR(0.5, 0.6, 0.08, 4.5, G + 0.2, 1, '#7d8a96', 0, 0, 0.25),
        boxR(0.12, 4.2, 0.12, -3.2, G + 2.1, -0.6, HOLZ, 0, 0, -0.3), boxR(0.12, 4.2, 0.12, -3.2, G + 2.1, 0.4, HOLZ, 0, 0, -0.3)];
    },
  },
  fundbuero: {
    w: 6, d: 5, floors: 1, wand: '#e8dcc0', dach: '#6a4a7a', laden: '#6a4a7a', skala: 1, hoehe: 10,
    grund: [-7, 8.5, -5, 8.5],
    fertig() {
      const t = TYPEN.fundbuero;
      // M15: lila Fundbüro mit Schild, davor die Funde: Kiste, Kaffeesack, goldener Helm auf dem Fass, Gewehr an der Wand, ein Schirm
      return [...fachwerk(t.w, t.d, t.floors, t.wand, t.dach), ...laeden(t.w, t.d, t.floors, t.laden),
        boxR(3.2, 0.8, 0.12, 0, G + 3.7, t.d / 2 + 0.15, '#6a4a7a'), boxR(2.8, 0.45, 0.14, 0, G + 3.7, t.d / 2 + 0.2, '#f4ead8'),
        ...kiste(4.2, 3.6, 1.4, 0.3), ...fass(-4.2, 3.4),
        paint(new THREE.SphereGeometry(0.62, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2).translate(-4.2, G + 1.3, 3.4), '#e0b030'),
        boxR(0.18, 0.5, 0.9, -4.2, G + 1.55, 3.4, '#e0b030'),
        paint(new THREE.SphereGeometry(0.8, 7, 5).scale(1, 1.15, 0.85).translate(2.6, G + 0.8, 4.5), '#5b3a22'),
        boxR(0.6, 0.1, 0.62, 2.6, G + 1.75, 4.5, '#3a2414'),
        boxR(0.12, 2.6, 0.16, -2.6, G + 1.4, t.d / 2 + 0.3, '#3a3a3a', 0, 0, 0.18), boxR(0.22, 0.7, 0.2, -2.35, G + 0.35, t.d / 2 + 0.3, HOLZ, 0, 0, 0.18),
        paint(new THREE.ConeGeometry(0.9, 0.7, 8).translate(5.2, G + 1.9, 1.2), '#2f6db5'), walze(0.05, 1.8, 5.2, G + 0.9, 1.2, '#3a3a3a')];
    },
  },
  zollhaus: {
    w: 6, d: 4.5, floors: 1, wand: '#f2ecdc', dach: '#3a5a3a', laden: '#2a4a2a', skala: 1, hoehe: 9,
    grund: [-7, 14, -5, 9],
    fertig() {
      const t = TYPEN.zollhaus;
      // M15: Zollhaus der Gegenseite mit rot-weißem Schlagbaum, Schild „ZOLL · DOUANE“, Schilderhäuschen und Laterne
      const out = [...fachwerk(t.w, t.d, t.floors, t.wand, t.dach), ...laeden(t.w, t.d, t.floors, t.laden),
        boxR(3.4, 0.8, 0.12, 0, G + 3.7, t.d / 2 + 0.15, '#2a4a2a'), boxR(3.0, 0.45, 0.14, 0, G + 3.7, t.d / 2 + 0.2, '#f2c230'),
        boxR(1.6, 2.8, 1.6, -5.2, G + 1.4, 2.4, '#2a4a2a'), boxR(1.9, 0.25, 1.9, -5.2, G + 2.95, 2.4, '#3a5a3a'),
        boxR(0.5, 2.2, 0.5, 4.4, G + 1.1, 5.5, '#4a4a4a'), boxR(0.9, 0.5, 0.9, 4.4, G + 0.25, 5.5, '#4a4a4a'),
        boxR(0.18, 0.18, 1.2, 2.4, G + 3.2, t.d / 2 + 0.6, DUNKEL), boxR(0.5, 0.65, 0.5, 2.4, G + 2.7, t.d / 2 + 1.1, '#2a2a2a'),
        paint(new THREE.SphereGeometry(0.2, 6, 5).translate(2.4, G + 2.7, t.d / 2 + 1.1), '#ffd27a')];
      // Schlagbaum, rot-weiß gestreift, quer über den Weg
      for (let i = 0; i < 8; i++) out.push(boxR(1.05, 0.32, 0.32, 5.1 + i * 1.05, G + 2.15, 5.5, i % 2 ? '#f4f0e6' : '#c8402e'));
      out.push(boxR(0.4, 1.8, 0.4, 13.6, G + 0.9, 5.5, '#4a4a4a'));
      return out;
    },
  },
  hundehuette: {
    w: 3, d: 3, floors: 1, wand: '#c89a5a', dach: '#b0563e', laden: '#4a3220', skala: 0.8, hoehe: 5,
    grund: [-4, 5, -4, 5],
    fertig() {
      // Hundehütte mit rundem Eingang, Napf, Knochen und Hund (sitzend)
      return [boxR(3, 2.2, 3, 0, G + 1.1, 0, '#c89a5a'), boxR(3.6, 0.2, 2.2, 0, G + 2.6, 0.8, '#b0563e', 0.6), boxR(3.6, 0.2, 2.2, 0, G + 2.6, -0.8, '#b0563e', -0.6),
        paint(new THREE.CircleGeometry(0.75, 10).translate(0, G + 0.8, 1.52), '#2a1f14'),
        walze(0.45, 0.2, 1.8, G + 0.1, 2.2, '#c8402e', 0, 0, 9),
        paint(new THREE.SphereGeometry(0.7, 8, 6).scale(0.9, 1.1, 1.2).translate(-1.6, G + 0.8, 2.2), '#8a5a30'),
        paint(new THREE.SphereGeometry(0.5, 8, 6).translate(-1.6, G + 1.8, 2.7), '#8a5a30'),
        paint(new THREE.SphereGeometry(0.2, 6, 5).translate(-1.6, G + 1.7, 3.2), '#2a1f14'),
        boxR(0.2, 0.5, 0.35, -2.0, G + 2.2, 2.6, '#6a4020'), boxR(0.2, 0.5, 0.35, -1.2, G + 2.2, 2.6, '#6a4020')];
    },
  },
  polizeiwache: {
    w: 5, d: 4.5, floors: 1, wand: '#f2ecdc', dach: '#2f4a6a', laden: '#2f4a6a', skala: 1, hoehe: 9,
    grund: [-6, 8, -5, 8],
    fertig() {
      const t = TYPEN.polizeiwache;
      // Wache mit blauem Dach, Schild „Polizei“, Fahrrad und Laterne
      return [...fachwerk(t.w, t.d, t.floors, t.wand, t.dach), ...laeden(t.w, t.d, t.floors, t.laden),
        boxR(2.4, 0.7, 0.12, 0, G + 3.6, t.d / 2 + 0.15, '#2f4a6a'), boxR(2.0, 0.3, 0.14, 0, G + 3.6, t.d / 2 + 0.2, '#f2ecdc'),
        paint(new THREE.TorusGeometry(0.5, 0.07, 4, 10).translate(3.6, G + 0.55, t.d / 2 + 0.8), '#2a2a2a'),
        paint(new THREE.TorusGeometry(0.5, 0.07, 4, 10).translate(5.0, G + 0.55, t.d / 2 + 0.8), '#2a2a2a'),
        boxR(1.5, 0.08, 0.08, 4.3, G + 1.0, t.d / 2 + 0.8, '#2f4a6a'), boxR(0.08, 0.6, 0.08, 4.8, G + 1.2, t.d / 2 + 0.8, '#2f4a6a')];
    },
  },
  schuetzenhaus: {
    w: 10, d: 7, floors: 1, wand: '#f4e2c2', dach: '#2f6a3a', laden: '#2f7a55', skala: 1, hoehe: 15,
    grund: [-10, 12, -8, 11],
    fertig() {
      const t = TYPEN.schuetzenhaus;
      // grünes Schützenhaus mit Vogelstange (Holzvogel oben), Fahne, Wimpeln, Biertisch
      const out = [...fachwerk(t.w, t.d, t.floors, t.wand, t.dach), ...laeden(t.w, t.d, t.floors, t.laden), ...blumenkasten(t.w, t.d, t.floors),
        walze(0.3, 18, 9, G + 9, -4, '#e9dcbc', 0, 0, 7),
        boxR(1.4, 0.9, 0.5, 9, G + 18.4, -4, '#c8402e'), paint(new THREE.ConeGeometry(0.35, 0.8, 5).rotateZ(-Math.PI / 2).translate(9.9, G + 18.5, -4), '#e0a830'),
        boxR(0.3, 1.4, 1.6, 8.6, G + 18.9, -4, '#c8402e'),
        boxR(0.15, 6, 0.15, -6, G + 3, t.d / 2 + 2, HOLZ), boxR(2.2, 1.3, 0.08, -4.9, G + 5.2, t.d / 2 + 2, '#2f6a3a'), boxR(0.8, 0.8, 0.1, -4.9, G + 5.2, t.d / 2 + 2.05, '#f2c230'),
        boxR(3, 0.2, 1.3, 2, G + 1.1, t.d / 2 + 2.3, HOLZ), ...fass(5.6, t.d / 2 + 1.5)];
      for (let k = 0; k < 8; k++) out.push(paint(new THREE.ConeGeometry(0.35, 0.8, 3).rotateX(Math.PI).translate(-4 + k * 1.6, G + 6.2 - Math.sin((k / 7) * Math.PI) * 0.8, t.d / 2 + 0.6), ['#2f6a3a', '#f4f1e8', '#c8402e'][k % 3]));
      return out;
    },
  },
  schiessstand: {
    w: 4, d: 3, floors: 1, wand: '#d9c9a8', dach: '#5a4a3c', laden: '#4a3220', skala: 1, hoehe: 7,
    grund: [-8, 8, -6, 6],
    fertig() {
      // offener Unterstand mit Brüstung, dahinter Erdwall mit Zielscheiben
      const out = [boxR(5, 0.3, 3.5, -4, G + 0.15, 0, HOLZ), boxR(0.25, 3, 0.25, -6.3, G + 1.5, -1.5, HOLZ), boxR(0.25, 3, 0.25, -1.7, G + 1.5, -1.5, HOLZ),
        boxR(0.25, 3, 0.25, -6.3, G + 1.5, 1.5, HOLZ), boxR(0.25, 3, 0.25, -1.7, G + 1.5, 1.5, HOLZ), boxR(5.4, 0.25, 4, -4, G + 3.1, 0, '#5a4a3c', 0, 0, 0.12),
        boxR(0.2, 1, 3.2, -1.8, G + 0.9, 0, HOLZ),
        paint(new THREE.SphereGeometry(3, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2).scale(0.8, 0.9, 1.6).translate(6, G, 0), '#7a6a40')];
      for (const z of [-2.5, 0, 2.5]) {
        out.push(walze(1.0, 0.2, 4.2, G + 2.2, z, '#f4f1e8', 0, Math.PI / 2, 12), walze(0.65, 0.22, 4.15, G + 2.2, z, '#c8402e', 0, Math.PI / 2, 12),
          walze(0.3, 0.24, 4.1, G + 2.2, z, '#2a2a2a', 0, Math.PI / 2, 10), boxR(0.15, 1.6, 0.15, 4.3, G + 0.9, z, HOLZ));
      }
      return out;
    },
  },
  hecke: {
    w: 6, d: 1.5, floors: 1, wand: '#4f7a3a', dach: '#4f7a3a', laden: '#4f7a3a', skala: 1, hoehe: 4,
    grund: [-6, 6, -2, 2],
    fertig() {
      // hohe Buchenhecke (Monschauer Heckenland): eine Reihe dichter, runder Büsche
      const out: THREE.BufferGeometry[] = [];
      for (let k = 0; k < 6; k++) out.push(paint(new THREE.SphereGeometry(1.5, 8, 6).scale(1, 1.5, 0.8).translate(-5 + k * 2, G + 2.0 + (k % 2) * 0.3, 0), k % 2 ? '#4f7a3a' : '#5f8a44'));
      out.push(boxR(11, 0.4, 1.4, 0, G + 0.2, 0, '#6a4a2e'));
      return out;
    },
  },
  lagerhaus: {
    w: 13, d: 8, floors: 1, wand: '#ece0c8', dach: '#5a4a3c', laden: '#2f7a55', skala: 1, hoehe: 10,
    grund: [-8, 8.5, -5, 8],
    fertig() {
      const t = TYPEN.lagerhaus;
      // Scheune mit großem Tor, Rampe und Kisten (Lager ohne Dorf drumherum)
      return [...fachwerk(t.w, t.d, t.floors, t.wand, t.dach), ...laeden(t.w, t.d, t.floors, t.laden),
        box(4.4, 3.4, 0.35, 0, G + 1.7 + 0.3, t.d / 2 + 0.22, '#6a4426'), boxR(0.3, 4.2, 0.4, 0, G + 2, t.d / 2 + 0.42, DUNKEL, 0, 0, 0.7), boxR(0.3, 4.2, 0.4, 0, G + 2, t.d / 2 + 0.42, DUNKEL, 0, 0, -0.7),
        boxR(5, 0.4, 2.2, 0, G + 0.2, t.d / 2 + 1.4, '#9a7a52'),
        ...kiste(5.6, 5.4, 1.5, 0.2), ...kiste(-5.4, 5.6, 1.3, -0.3), ...fass(-6.8, 4.4), ...stapelBretter(6.5, -2, 3.4, 1.2, 0.9)];
    },
  },
  kirmesplatz: {
    w: 6, d: 4, floors: 1, wand: '#f4e2c2', dach: '#c8402e', laden: '#2f7a55', skala: 1, hoehe: 14,
    grund: [-14, 14, -12, 9],
    fertig() {
      // Festplatz: festgetretener Boden, zwei Buden mit gestreiften Markisen, Kirmesbaum mit Kranz, Wimpelketten.
      // Das Karussell selbst ist eigens (dreht sich beim Fest, siehe karussell()).
      const out: THREE.BufferGeometry[] = [boxR(28, 0.25, 20, 0, G + 0.1, -1.5, '#c8ad80')];
      for (const [bx, f] of [[-10, '#c8402e'], [10, '#2f6db5']] as const) {
        out.push(boxR(5, 2.6, 3.4, bx, G + 1.3, 4.5, '#e9dcbc'), boxR(5.4, 0.2, 3.4, bx, G + 2.7, 4.5, HOLZ));
        for (let k = 0; k < 5; k++) out.push(boxR(1.08, 0.12, 3.2, bx - 2.16 + k * 1.08, G + 3.4, 6.0, k % 2 ? '#f4f1e8' : f, -0.35));
        out.push(boxR(0.25, 3.6, 0.25, bx - 2.5, G + 1.8, 7.4, HOLZ), boxR(0.25, 3.6, 0.25, bx + 2.5, G + 1.8, 7.4, HOLZ));
      }
      // Kirmesbaum mit Kranz und bunten Bändern
      out.push(walze(0.35, 16, -11, G + 8, -9, '#e9dcbc', 0, 0, 7), paint(new THREE.TorusGeometry(1.6, 0.4, 5, 10).rotateX(Math.PI / 2).translate(-11, G + 13, -9), '#3f7a3a'),
        paint(new THREE.ConeGeometry(1.2, 3, 6).translate(-11, G + 17.2, -9), '#2f7a3c'));
      ['#c8402e', '#e0a830', '#2f6db5', '#2f7a55'].forEach((f, i) => out.push(boxR(0.12, 5, 0.3, -11 + Math.cos(i * 1.57) * 1.6, G + 10.4, -9 + Math.sin(i * 1.57) * 1.6, f)));
      // Wimpelketten zwischen Baum und Buden
      const kette = (x0: number, z0: number, x1: number, z1: number, y0: number, y1: number) => {
        for (let k = 1; k < 10; k++) {
          const u = k / 10, x = x0 + (x1 - x0) * u, z = z0 + (z1 - z0) * u, y = y0 + (y1 - y0) * u - Math.sin(u * Math.PI) * 1.4;
          out.push(paint(new THREE.ConeGeometry(0.45, 1.0, 3).rotateX(Math.PI).translate(x, y - 0.4, z), ['#c8402e', '#e0a830', '#2f6db5', '#f4f1e8'][k % 4]));
        }
      };
      kette(-11, -9, -10, 7.4, G + 12, G + 3.6); kette(-11, -9, 10, 7.4, G + 12, G + 3.6);
      return out;
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

// ---------------------------------------------------------------- Wimmel-Kleinkram (STIL.md)

function huhn(x: number, z: number, ry: number, farbe = '#f4efe4'): THREE.BufferGeometry[] {
  const k = (geo: THREE.BufferGeometry, f: string) => paint(geo.rotateY(ry).translate(x, 0, z), f);
  return [
    k(new THREE.SphereGeometry(0.55, 7, 5).scale(1.25, 1, 0.9).translate(0, G + 0.7, 0), farbe),
    k(new THREE.SphereGeometry(0.3, 6, 5).translate(0.55, G + 1.25, 0), farbe),
    k(new THREE.ConeGeometry(0.1, 0.25, 5).rotateZ(-Math.PI / 2).translate(0.88, G + 1.22, 0), '#e8a020'),
    k(new THREE.SphereGeometry(0.11, 5, 4).scale(1, 1.4, 0.6).translate(0.55, G + 1.52, 0), '#d6262a'),
    k(new THREE.ConeGeometry(0.3, 0.55, 5).rotateZ(0.9).translate(-0.65, G + 1.0, 0), farbe),
  ];
}
function blumen(x: number, z: number, n: number): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = [paint(new THREE.SphereGeometry(0.9, 6, 4).scale(1.4, 0.55, 1).translate(x, G + 0.3, z), '#5f9a3a')];
  for (let i = 0; i < n; i++) {
    const a = i * 2.4, r = 0.4 + (i % 3) * 0.35;
    out.push(paint(new THREE.SphereGeometry(0.28, 5, 4).translate(x + Math.cos(a) * r, G + 0.75, z + Math.sin(a) * r * 0.7), ['#e0392b', '#f2b829', '#c86ad0', '#f4f1e8'][i % 4]));
  }
  return out;
}
function waesche(x: number, z: number): THREE.BufferGeometry[] {
  const out = [walze(0.14, 3.6, x, G + 1.8, z, HOLZ), walze(0.14, 3.6, x + 6, G + 1.8, z, HOLZ), boxR(6, 0.06, 0.06, x + 3, G + 3.4, z, '#e8e2d0')];
  ['#e05a5a', '#f4f1e8', '#5a8ad0', '#f0c040'].forEach((f, i) => out.push(boxR(1.0, 1.3 - (i % 2) * 0.35, 0.08, x + 0.9 + i * 1.4, G + 2.7 + (i % 2) * 0.17, z, f)));
  return out;
}
function brunnen(x: number, z: number): THREE.BufferGeometry[] {
  return [walze(1.3, 1.2, x, G + 0.6, z, '#b9ad9c', 0, 0, 12), walze(1.1, 0.1, x, G + 1.22, z, '#5a8ab0', 0, 0, 12),
    boxR(0.25, 2.6, 0.25, x - 1.15, G + 1.9, z, HOLZ), boxR(0.25, 2.6, 0.25, x + 1.15, G + 1.9, z, HOLZ),
    paint(new THREE.ConeGeometry(2.0, 1.2, 4).rotateY(Math.PI / 4).translate(x, G + 3.7, z), '#c96a52')];
}
function vogelscheuche(x: number, z: number): THREE.BufferGeometry[] {
  return [boxR(0.2, 4, 0.2, x, G + 2, z, HOLZ), boxR(2.6, 0.18, 0.18, x, G + 3.0, z, HOLZ), boxR(1.1, 1.4, 0.5, x, G + 2.6, z, '#5a8ad0'),
    paint(new THREE.SphereGeometry(0.45, 6, 5).translate(x, G + 3.7, z), '#e2c06a'), paint(new THREE.ConeGeometry(0.8, 0.6, 7).translate(x, G + 4.2, z), '#7a5236')];
}

function kuerbisse(x: number, z: number): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = [];
  for (let k = 0; k < 4; k++) out.push(paint(new THREE.SphereGeometry(0.75, 9, 7).scale(1.15, 0.8, 1.15).translate(x + (k % 2) * 1.5, G + 0.55, z + Math.floor(k / 2) * 1.4), '#e8822a'));
  return out;
}
function bienenkorb(x: number, z: number): THREE.BufferGeometry[] {
  return [paint(new THREE.SphereGeometry(1.0, 10, 8, 0, Math.PI * 2, 0, Math.PI / 1.6).scale(1, 1.25, 1).translate(x, G + 0.9, z), '#d9a540'),
    boxR(1.6, 0.7, 1.6, x, G + 0.35, z, HOLZ)];
}
/** Gemüsebeet: Erdbett mit Kohlköpfen in Reihen (Wimmelbuch, STIL.md §6). */
function beet(x: number, z: number): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = [boxR(4.2, 0.35, 2.8, x, G + 0.17, z, '#7a5434')];
  for (let i = 0; i < 6; i++) {
    out.push(paint(new THREE.SphereGeometry(0.42, 7, 5).scale(1, 0.75, 1).translate(x - 1.4 + (i % 3) * 1.4, G + 0.6, z - 0.6 + Math.floor(i / 3) * 1.2), i % 2 ? '#7fb24e' : '#5f9a3a'));
  }
  return out;
}
function zaunStueck(x: number, z: number, lang: number): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = [];
  const n = Math.max(2, Math.round(lang / 1.8));
  for (let i = 0; i <= n; i++) out.push(boxR(0.3, 1.6, 0.3, x + (lang * i) / n, G + 0.8, z, '#9a7450'));
  for (const y of [0.6, 1.2]) out.push(boxR(lang, 0.16, 0.14, x + lang / 2, G + y, z, '#b08a62'));
  return out;
}

/**
 * Kleinkram je Gebäudetyp, im Grundriss vorn (Stil Wimmelbuch, STIL.md §6): Hühner, Blumen, Wäsche, Brunnen, Vogelscheuche, Fässer,
 * Kürbisse, Bienenkörbe, Zaun. Etwas größer als echt, damit er aus der Spielhöhe zu sehen ist.
 */
function kleinkram(typ: string, t: Typ): THREE.BufferGeometry[] {
  const [x0, x1, , z1] = t.grund;
  const vx = x1 - 2.5, vz = z1 - 1.5;
  const out: THREE.BufferGeometry[] = [];
  if (typ === 'wohnhaus') {
    out.push(...huhn(vx, vz, 0.6), ...huhn(vx - 1.8, vz - 0.6, 2.4, '#b8743a'), ...huhn(vx - 0.6, vz + 1.0, -1.0), ...huhn(vx + 1.2, vz - 1.8, 1.7));
    out.push(...beet(x1 + 3, -1), ...bienenkorb(x1 + 2.5, -t.d / 2 - 1), ...blumen(x0 + 1.5, z1 - 1.2, 7), ...waesche(x0 - 1, -t.d / 2 - 3), ...zaunStueck(x0 - 1, z1 + 0.5, 6), ...kuerbisse(x0 + 0.5, z1 - 4));
  } else if (typ === 'lager') {
    out.push(...beet(x0 - 3, 0), ...brunnen(x0 + 2, z1 + 1), ...huhn(vx, vz + 1, 0.3), ...huhn(vx - 2, vz + 0.4, 2.8), ...huhn(vx - 1, vz + 2.2, -0.6, '#b8743a'));
    out.push(...blumen(x1 - 1, -1, 6), ...fass(x1 - 4, z1 + 0.5), ...fass(x1 - 5.4, z1 + 0.8), ...kuerbisse(x0 + 5, z1 + 1.5));
  } else if (t.grund[1] - t.grund[0] > 18) {
    out.push(...vogelscheuche(x1 - 3, z1 - 3), ...blumen(x0 + 1, z1 - 1, 5), ...huhn(x0 + 3, z1 - 0.5, 1.2), ...kuerbisse(x0 + 4, z1 - 2.5));
  } else {
    out.push(...blumen(vx, vz, 6), ...fass(x0 + 1, z1 - 0.8), ...fass(x0 + 2.3, z1 - 0.3), ...huhn(x0 + 3, z1 - 0.2, 2.0), ...huhn(x0 + 4.4, z1 + 0.9, -0.8, '#b8743a'));
    out.push(...beet(x1 + 3.2, -t.d / 4), ...zaunStueck(x1 + 0.8, -t.d / 4 + 2.2, 5));
    if (typ.length % 3 === 0) out.push(...bienenkorb(x0 + 0.5, z1 - 3));
    else if (typ.length % 3 === 1) out.push(...kuerbisse(x0 - 2.5, z1 - 2));
  }
  // etwas größer als echt (aus der Spielhöhe lesbar): um den Grundriss-Mittelpunkt vorn skalieren
  return out.map((g) => g.translate(-vx, 0, -vz).scale(KLEINKRAM, KLEINKRAM, KLEINKRAM).translate(vx, 0, vz));
}
/** Kleinkram-Vergrößerung (STIL.md §6). */
const KLEINKRAM = 1.6;

/** Unbekannte Typen zeigen das Wohnhaus. */
function modellTyp(typ: string): string {
  if (typ in TYPEN) return typ;
  // M11: Gebäude der Spezialketten sehen aus wie ein verwandtes Grundgebäude (data/buildings.json: modell)
  const m = GEBAEUDE[typ]?.modell;
  return m && m in TYPEN ? m : 'wohnhaus';
}

const modellCache = new Map<string, THREE.BufferGeometry>();
function modell(typ: string, phase: number, dach: string | null = null): THREE.BufferGeometry {
  if (dach) {
    const key = `${typ}:${phase}:${dach}`;
    let g = modellCache.get(key);
    if (!g) { g = mitDach(dach, () => modellRoh(typ, phase, key)); modellCache.set(key, g); }
    return g;
  }
  return modellRoh(typ, phase, `${typ}:${phase}`);
}

function modellRoh(typ: string, phase: number, key: string): THREE.BufferGeometry {
  let g = modellCache.get(key);
  if (!g) {
    const t = TYPEN[modellTyp(typ)];
    g = mergeGeometries(phase <= 1 ? phase1(t) : phase === 2 ? phase2(t) : t.fertig())!;
    // Stil (STIL.md): Häuser stehen leicht schief, jedes Gebäude anders; fertige bekommen Wimmel-Kleinkram dazu
    if (phase >= 2) {
      const lean = (hash(typ.length * 7 + typ.charCodeAt(0), typ.charCodeAt(typ.length - 1)) - 0.5) * 0.06;
      g.applyMatrix4(new THREE.Matrix4().set(1, lean, 0, 0, 0, 1, 0, 0, 0, lean * 0.5, 1, 0, 0, 0, 0, 1));
    }
    if (phase >= 3) {
      const extra = kleinkram(typ, t);
      if (extra.length) g = mergeGeometries([g, ...extra])!;
    }
    if (!g.attributes.normal) g.computeVertexNormals();
    modellCache.set(key, g);
  }
  return g;
}

/** Fertiges Modell eines Gebäudetyps (Vertexfarben, Meter wie im Modell), z. B. für die Icons (src/render/icons.ts). */
export function gebaeudeGeometrie(typ: string): THREE.BufferGeometry {
  return modell(typ, 3);
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
type Symbol = 'kein_baum' | 'kein_fels' | 'kein_platz' | 'kein_arbeiter' | 'voll' | 'hunger' | 'kein_bauarbeiter' | 'kein_planierer'
  | 'kein_werkzeug' | 'hochwasser' | 'winter';
const SYMBOL_ZUSTAENDE: Partial<Record<GebaeudeZustand, Symbol>> = {
  kein_baum: 'kein_baum', kein_fels: 'kein_fels', kein_platz: 'kein_platz', kein_arbeiter: 'kein_arbeiter', voll: 'voll',
  hunger: 'hunger', kein_bauarbeiter: 'kein_bauarbeiter', kein_planierer: 'kein_planierer',
  kein_werkzeug: 'kein_werkzeug', hochwasser: 'hochwasser', winter: 'winter',
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
  } else if (art === 'hunger') {
    // leerer Teller mit Gabel
    g.fillStyle = '#ffffff'; g.lineWidth = 5; g.beginPath(); g.ellipse(64, 70, 34, 26, 0, 0, Math.PI * 2); g.fill(); g.stroke();
    g.beginPath(); g.ellipse(64, 70, 20, 14, 0, 0, Math.PI * 2); g.stroke();
    g.fillStyle = '#8f949c'; g.fillRect(96, 30, 6, 52); g.fillRect(92, 26, 3, 16); g.fillRect(99, 26, 3, 16);
  } else if (art === 'hochwasser') {
    // Wellen
    g.fillStyle = '#d8ecff'; g.beginPath(); g.arc(64, 64, 52, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#2f6db5'; g.lineWidth = 9;
    for (const y of [48, 70, 92]) { g.beginPath(); g.moveTo(24, y); for (let x = 24; x <= 104; x += 4) g.lineTo(x, y + Math.sin((x - 24) / 10) * 7); g.stroke(); }
  } else if (art === 'winter') {
    // Schneeflocke
    g.strokeStyle = '#4a8ac8'; g.lineWidth = 8;
    for (let k = 0; k < 3; k++) { g.save(); g.translate(64, 64); g.rotate((k * Math.PI) / 3); g.beginPath(); g.moveTo(0, -38); g.lineTo(0, 38); g.stroke();
      for (const sy of [-1, 1]) { g.beginPath(); g.moveTo(-12, sy * 26); g.lineTo(0, sy * 16); g.lineTo(12, sy * 26); g.stroke(); } g.restore(); }
  } else if (art === 'kein_bauarbeiter' || art === 'kein_werkzeug') {
    // Hammer
    g.save(); g.translate(64, 64); g.rotate(-0.6);
    g.fillStyle = '#8a6340'; g.fillRect(-5, -10, 10, 50);
    g.fillStyle = '#8f949c'; g.fillRect(-22, -26, 44, 18); g.restore();
  } else if (art === 'kein_planierer') {
    // Schaufel
    g.save(); g.translate(64, 64); g.rotate(0.5);
    g.fillStyle = '#8a6340'; g.fillRect(-4, -44, 8, 50);
    g.fillStyle = '#8f949c'; g.beginPath(); g.moveTo(-16, 6); g.lineTo(16, 6); g.lineTo(12, 36); g.lineTo(0, 44); g.lineTo(-12, 36); g.closePath(); g.fill(); g.restore();
  } else {
    // Lager voll: Kiste
    g.fillStyle = '#b98b55'; g.fillRect(30, 44, 68, 50); g.lineWidth = 5; g.strokeRect(30, 44, 68, 50);
    g.fillStyle = '#3a2a10'; g.fillRect(30, 62, 68, 6); g.fillRect(61, 44, 6, 50);
  }
  if (art !== 'voll' && art !== 'hochwasser' && art !== 'winter') {
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

/** Karussell des Kirmesplatzes (Mitte bei 0, Boden bei y = G): dreht sich beim Fest. */
function karussell(): THREE.BufferGeometry {
  const out: THREE.BufferGeometry[] = [
    walze(5.2, 0.5, 0, G + 0.25, 0, '#8a6340', 0, 0, 16), walze(0.4, 7.5, 0, G + 3.75, 0, '#e0a830', 0, 0, 8),
  ];
  // gestreiftes Kegeldach
  for (let k = 0; k < 12; k++) {
    out.push(paint(new THREE.ConeGeometry(6, 2.6, 12, 1, true, (k * Math.PI) / 6, Math.PI / 6).translate(0, G + 8.6, 0), k % 2 ? '#f4f1e8' : '#c8402e'));
  }
  out.push(paint(new THREE.SphereGeometry(0.6, 6, 5).translate(0, G + 10.1, 0), '#e0a830'));
  // sechs Pferdchen an Stangen
  for (let k = 0; k < 6; k++) {
    const a = (k * Math.PI) / 3, x = Math.cos(a) * 4, z = Math.sin(a) * 4;
    out.push(boxR(0.15, 7, 0.15, x, G + 4, z, '#e0a830'));
    out.push(boxR(2.2, 1.0, 0.7, x, G + 2.2 + (k % 2) * 0.6, z, ['#f4f1e8', '#6b4a2e', '#2f6db5'][k % 3], 0, -a + Math.PI / 2));
    out.push(boxR(0.7, 1.1, 0.6, x + Math.cos(a + Math.PI / 2) * 1.0, G + 2.9 + (k % 2) * 0.6, z + Math.sin(a + Math.PI / 2) * 1.0, ['#f4f1e8', '#6b4a2e', '#2f6db5'][k % 3], 0, -a + Math.PI / 2));
  }
  const g = mergeGeometries(out)!;
  if (!g.attributes.normal) g.computeVertexNormals();
  return g;
}

/** Textschild (Zustand in Klartext) als Canvas-Textur, Breite passend zum Text. */
function schildTextur(text: string, warn: boolean): { tex: THREE.CanvasTexture; seite: number } {
  const c = document.createElement('canvas');
  const g = c.getContext('2d')!;
  const font = '600 30px system-ui, sans-serif';
  g.font = font;
  const w = Math.ceil(g.measureText(text).width) + 28;
  c.width = w; c.height = 46;
  g.font = font;
  g.fillStyle = warn ? 'rgba(120, 30, 20, 0.88)' : 'rgba(40, 30, 20, 0.78)';
  g.beginPath(); g.roundRect(0, 0, w, 46, 12); g.fill();
  g.fillStyle = warn ? '#ffe2b0' : '#f4ecd8';
  g.textBaseline = 'middle';
  g.fillText(text, 14, 24);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return { tex, seite: w / 46 };
}

/** Zustand in Klartext über einem Gebäude (von der Spiel-Schicht gesetzt); null = kein Schild. */
export type ZustandsSchild = (g: SimSicht['gebaeude'][number]) => { text: string; warn: boolean } | null;

/** Planieren nach und nach (Drehbuch 4.5): Gelände-Zellen unter dem Grundriss, alte und Zielhöhe, Gewicht der Erdfarbe. */
interface Planung { idx: Int32Array; alt: Float32Array; ziel: Float32Array; erde: Float32Array; box: [number, number, number, number]; stufe: number }

interface Platz { x: number; z: number; y: number; hex: string; plan: Planung }

/** Runder, weicher Funke für das Feuerwerk (ohne Textur zeichnet WebGL eckige Punkte). */
function funkeTextur(): THREE.Texture {
  const c = document.createElement('canvas'); c.width = c.height = 32;
  const g = c.getContext('2d')!;
  const v = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  v.addColorStop(0, 'rgba(255,255,255,1)'); v.addColorStop(0.45, 'rgba(255,255,255,0.85)'); v.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = v; g.fillRect(0, 0, 32, 32);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class Gebaeude {
  readonly group = new THREE.Group();
  /** Wenn gesetzt: Warnzeichen wachsen mit dem Kameraabstand. */
  kamera: THREE.Camera | null = null;
  /** Zustand in Klartext über Gebäuden („Wartet auf Stämme“), von der Spiel-Schicht gesetzt (Texte aus baumenue.ts). */
  schild: ZustandsSchild | null = null;
  /** Zeichen und Zustandsschilder über den Gebäuden zeigen (die Bildstrecke blendet sie aus). */
  hinweise = true;
  private saetze = new Map<string, Instanzen>();
  private mat = mitSchnee(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, flatShading: false, side: THREE.DoubleSide }));
  private plaetze = new Map<Id, Platz>();
  private warn = new Map<Id, { sp: THREE.Sprite; art: string }>();
  private symbolMat = new Map<string, THREE.SpriteMaterial>();
  private schilder = new Map<Id, { sp: THREE.Sprite; text: string }>();
  private schildMat = new Map<string, { mat: THREE.SpriteMaterial; seite: number }>();
  private bauWaren: Instanzen[] = [];
  private bauSchild: Instanzen | null = null;
  private karussell: Instanzen;
  private karussellWinkel = 0;
  private feuerwerk: THREE.Points;
  private funken: { x: number; y: number; z: number; vx: number; vy: number; vz: number; t: number; r: number; g: number; b: number }[] = [];
  private funkenTakt = 0;
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
    const matte = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, flatShading: false });
    for (let a = 0; a < WAREN_ANZAHL; a++) this.bauWaren.push(new Instanzen(this.group, warenGeometrie(a), matte, false, true, [], 32));
    this.bauSchild = new Instanzen(this.group, bauschild(), this.mat, false, true, [], 8);
    this.karussell = new Instanzen(this.group, karussell(), this.mat, true, true, [], 2);
    const fw = new THREE.BufferGeometry();
    fw.setAttribute('position', new THREE.BufferAttribute(new Float32Array(FUNKEN_MAX * 3), 3));
    fw.setAttribute('color', new THREE.BufferAttribute(new Float32Array(FUNKEN_MAX * 3), 3));
    fw.setDrawRange(0, 0);
    this.feuerwerk = new THREE.Points(fw, new THREE.PointsMaterial({ size: 9, map: funkeTextur(), alphaTest: 0.05, vertexColors: true, transparent: true, depthWrite: false, fog: false }));
    this.feuerwerk.frustumCulled = false;
    this.group.add(this.feuerwerk);
  }

  private symbol(art: string): THREE.SpriteMaterial {
    let m = this.symbolMat.get(art);
    if (!m) { m = new THREE.SpriteMaterial({ map: symbolTextur(art as Symbol), transparent: true, depthWrite: false, fog: false }); this.symbolMat.set(art, m); }
    return m;
  }

  private schildMaterial(text: string, warn: boolean) {
    const key = `${warn ? 1 : 0}${text}`;
    let m = this.schildMat.get(key);
    if (!m) {
      const t = schildTextur(text, warn);
      m = { mat: new THREE.SpriteMaterial({ map: t.tex, transparent: true, depthWrite: false, depthTest: false, fog: false }), seite: t.seite };
      this.schildMat.set(key, m);
    }
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

  /**
   * Platz unter dem Grundriss vorbereiten (wie houses.ts): Sockelhöhe bestimmen, Kulissenhäuser und Bäume entfernen. Eingeebnet wird
   * nach und nach mit `planiert` (0..1): auf ebenen Plätzen sofort, am Hang so weit, wie der Planierer ist (Drehbuch 4.5).
   */
  private platzAnlegen(typ: string, q: number, r: number): Platz {
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
    const idx: number[] = [], alt: number[] = [], ziel: number[] = [], erde: number[] = [];
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const cx = (i + 0.5) * cell, cz = (j + 0.5) * cell;
      // Abstand zum Rechteck (0 = innen)
      const dx = Math.max(x0 - cx, 0, cx - x1), dz = Math.max(z0 - cz, 0, cz - z1);
      const aus = Math.hypot(dx, dz) - cell * 0.5;
      const k = j * width + i;
      if (aus >= BLEND) continue;
      const wgt = aus <= 0 ? 1 : 1 - (aus / BLEND) * (aus / BLEND) * (3 - 2 * (aus / BLEND));
      idx.push(k); alt.push(map.ground[k]); ziel.push(map.ground[k] + (h0 - map.ground[k]) * wgt); erde.push(aus <= 0 ? 1 : wgt * 0.55);
    }
    this.haken.houses?.verstecke(hx, hz, map.info.hex.size * 0.95);
    // Bäume auf dem Platz (Grundriss samt Rand) entfernen
    this.haken.trees?.lichte(x + (gx0 + gx1) / 2 * s, z + (gz0 + gz1) / 2 * s, Math.hypot((gx1 - gx0) / 2 * s, (gz1 - gz0) / 2 * s) + 8);
    const plan: Planung = {
      idx: Int32Array.from(idx), alt: Float32Array.from(alt), ziel: Float32Array.from(ziel), erde: Float32Array.from(erde),
      box: [i0, j0, i1, j1], stufe: -1,
    };
    return { x, z, y: h0, hex: `${q},${r}`, plan };
  }

  /** Gelände des Platzes auf Stufe 0..4 (Viertel des Planierens) bringen; nur bei Änderung neu aufbauen. */
  private planieren(pl: Platz, anteil: number) {
    const st = Math.max(0, Math.min(4, Math.floor(anteil * 4 + 1e-6)));
    const pn = pl.plan;
    if (st === pn.stufe) return;
    pn.stufe = st;
    const f = st / 4, { map } = this, { width, cell } = map.info;
    for (let n = 0; n < pn.idx.length; n++) {
      const k = pn.idx[n];
      map.ground[k] = pn.alt[n] + (pn.ziel[n] - pn.alt[n]) * f;
      this.haken.terrain?.setzeErde(k % width, Math.floor(k / width), pn.erde[n] * Math.max(0.35, f));
    }
    map.groundRev++;
    const [i0, j0, i1, j1] = pn.box;
    this.haken.terrain?.erneuere(i0 * cell, j0 * cell, (i1 + 1) * cell, (j1 + 1) * cell);
  }

  update(sicht: SimSicht, _alpha = 0, dt = 0) {
    this.zeit += dt;
    for (const g of sicht.gebaeude) {
      let pl = this.plaetze.get(g.id);
      if (!pl) { pl = this.platzAnlegen(g.typ, g.q, g.r); this.plaetze.set(g.id, pl); }
      this.planieren(pl, g.planiert === undefined ? 1 : g.planiert / PROMILLE);
    }
    for (const s of this.saetze.values()) s.beginne();
    for (const w of this.bauWaren) w.beginne();
    this.bauSchild!.beginne();
    this.karussell.beginne();
    const { base, ex, m, q, p, s, farbe } = this;
    const sichtbar = new Set<Id>(), mitSchild = new Set<Id>();
    const fest = sicht.dorf.kirmes ? sicht.dorf.kirmes.fest > 0 : false;
    if (fest) this.karussellWinkel += dt * 1.4;
    for (const g of sicht.gebaeude) {
      const pl = this.plaetze.get(g.id)!;
      const t = TYPEN[modellTyp(g.typ)];
      // am Hang zeigt die Baustelle bis zum Ende des Planierens nur den abgesteckten Grund
      const phase = g.planiert !== undefined && g.planiert < PROMILLE ? 1 : bauPhase(g.bau);
      // M11: Dach in der Farbe der regionalen Baustoffe des Völkchens
      const dach = VOLK_DACH.get(sicht.spieler[g.sp]?.voelkchen ?? '') ?? null;
      const key = `${modellTyp(g.typ)}:${phase}:${dach ?? ''}`;
      let satz = this.saetze.get(key);
      if (!satz) {
        satz = new Instanzen(this.group, modell(modellTyp(g.typ), phase, dach), this.mat, true, true);
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
      const dist = this.kamera ? this.kamera.position.distanceTo(p.set(pl.x, y, pl.z)) : 800;
      // Zeichen über dem Gebäude: ⚠ bei getrennt, sonst ein Symbol bei Stillstand
      const art = g.getrennt ? 'warn' : SYMBOL_ZUSTAENDE[g.zustand] ?? null;
      const gr = Math.min(120, Math.max(26, dist * 0.045)) * (art === 'warn' ? 1 : 0.8);
      const oben = y + t.hoehe * sk;
      if (art && this.hinweise) {
        sichtbar.add(g.id);
        let w = this.warn.get(g.id);
        if (!w) { w = { sp: new THREE.Sprite(this.symbol(art)), art }; w.sp.renderOrder = 10; this.group.add(w.sp); this.warn.set(g.id, w); }
        else if (w.art !== art) { w.sp.material = this.symbol(art); w.art = art; }
        w.sp.scale.set(gr, gr, 1);
        w.sp.position.set(pl.x, oben + gr * 0.7 + Math.sin(this.zeit * 3 + g.id) * gr * 0.1, pl.z);
      }
      // Zustand in Klartext darunter (nur aus der Nähe lesbar)
      const sch = this.schild && this.hinweise && dist < SCHILD_FERN ? this.schild(g) : null;
      if (sch) {
        mitSchild.add(g.id);
        const mt = this.schildMaterial(sch.text, sch.warn);
        let e = this.schilder.get(g.id);
        if (!e) { e = { sp: new THREE.Sprite(mt.mat), text: '' }; e.sp.renderOrder = 11; this.group.add(e.sp); this.schilder.set(g.id, e); }
        if (e.text !== sch.text + sch.warn) { e.sp.material = mt.mat; e.text = sch.text + sch.warn; }
        const h = Math.min(48, Math.max(12, dist * 0.018));
        e.sp.scale.set(h * mt.seite, h, 1);
        e.sp.position.set(pl.x, oben + (art ? gr * 0.1 - h * 0.2 : h * 0.9), pl.z + 4);
      }
      // Baustelle: angelieferter Stapel vor dem Grundstück, dazu ein Bauschild
      if (g.bau < PROMILLE) this.stapel(g.q, g.r, g.stapel ?? [], true);
      // Kirmesplatz: gelieferte Waren auf den Tischen, beim Fest dreht sich das Karussell
      if (g.typ === 'kirmesplatz' && g.bau >= PROMILLE) {
        if (!fest && g.puffer) this.stapel(g.q, g.r, g.puffer, false);
        q.setFromAxisAngle(Y_ACHSE, this.karussellWinkel);
        m.compose(p.set(pl.x, y, pl.z - 3 * sk), q, s.set(sk, sk, sk));
        this.karussell.fuege(m, farbe.setRGB(1, 1, 1));
        if (fest) this.feuerwerkZuenden(pl.x, y + 40 * sk, pl.z - 3 * sk, dt);
      }
    }
    for (const [id, w] of this.warn) if (!sichtbar.has(id)) { this.group.remove(w.sp); this.warn.delete(id); }
    for (const [id, e] of this.schilder) if (!mitSchild.has(id)) { this.group.remove(e.sp); this.schilder.delete(id); }
    for (const w of this.bauWaren) w.fertig();
    this.bauSchild!.fertig();
    this.karussell.fertig();
    for (const sa of this.saetze.values()) sa.fertig();
    this.funkenBewegen(dt);
  }

  /** Waren als kleine Stapel links vor dem Hex-Mittelpunkt (an der Fahne); `schild`: Bauschild dazu (Baustelle). */
  private stapel(hq: number, hr: number, waren: readonly number[], schild: boolean) {
    const { m, q, p, s, ex, base } = this;
    const w = this.grid.toWorld({ q: hq, r: hr });
    const k = this.kamera ? Math.max(1, Math.min(1.6, this.kamera.position.distanceTo(p.set(w.x, 0, w.z)) / 900)) : 1;
    let slot = 0;
    q.identity();
    for (let a = 0; a < WAREN_ANZAHL; a++) {
      const n = Math.min(10, waren[a] ?? 0);
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
    if (schild) {
      const x = w.x - 17 - slot * 11 * k - 1, z = w.z + 8;
      s.setScalar(1.4 * k);
      m.compose(p.set(x, (this.map.heightAt(x, z) - base) * ex - G * 1.4 * k, z), q, s);
      this.bauSchild!.fuege(m);
    }
  }

  /** Feuerwerk über dem Kirmesplatz: alle ~0,5 s ein bunter Funkenball. */
  private feuerwerkZuenden(x: number, y: number, z: number, dt: number) {
    this.funkenTakt -= dt;
    if (this.funkenTakt > 0) return;
    this.funkenTakt = 0.45 + Math.random() * 0.3;
    const farben = [[1, 0.35, 0.25], [1, 0.85, 0.3], [0.4, 0.7, 1], [0.5, 1, 0.5], [1, 0.5, 0.9]];
    const [r, g, b] = farben[Math.floor(Math.random() * farben.length)];
    const cx = x + (Math.random() - 0.5) * 120, cy = y + Math.random() * 60, cz = z + (Math.random() - 0.5) * 120;
    for (let i = 0; i < 28 && this.funken.length < FUNKEN_MAX; i++) {
      const th = Math.random() * Math.PI * 2, ph = Math.acos(2 * Math.random() - 1), v = 35 + Math.random() * 25;
      this.funken.push({ x: cx, y: cy, z: cz, vx: Math.sin(ph) * Math.cos(th) * v, vy: Math.cos(ph) * v, vz: Math.sin(ph) * Math.sin(th) * v, t: 1.3, r, g, b });
    }
  }

  private funkenBewegen(dt: number) {
    const pos = this.feuerwerk.geometry.attributes.position as THREE.BufferAttribute;
    const col = this.feuerwerk.geometry.attributes.color as THREE.BufferAttribute;
    let n = 0;
    for (const f of this.funken) {
      f.t -= dt;
      if (f.t <= 0) continue;
      f.vy -= 30 * dt; f.x += f.vx * dt; f.y += f.vy * dt; f.z += f.vz * dt;
      const h = Math.min(1, f.t);
      pos.setXYZ(n, f.x, f.y, f.z); col.setXYZ(n, f.r * h, f.g * h, f.b * h);
      this.funken[n++] = f;
    }
    this.funken.length = n;
    pos.needsUpdate = true; col.needsUpdate = true;
    this.feuerwerk.geometry.setDrawRange(0, n);
  }

  /** Mitte (Ausschnitt-Meter) eines Gebäudes, sobald es einmal in der Sicht war. */
  mitte(id: Id): { x: number; z: number } | null {
    const pl = this.plaetze.get(id);
    return pl ? { x: pl.x, z: pl.z } : null;
  }
}

const Y_ACHSE = new THREE.Vector3(0, 1, 0);
const FUNKEN_MAX = 400;
/** Ab diesem Kameraabstand (m) gibt es keine Klartext-Schilder mehr (nur noch Symbole). */
const SCHILD_FERN = 2600;
