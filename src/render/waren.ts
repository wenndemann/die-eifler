// Waren als kleine Modelle (Drehbuch 4.1: alle Waren sind sichtbar unterwegs). Gemeinsam für Warenstapel an Fahnen
// (fahnen.ts) und getragene Ware (traeger.ts). Unten bei y = 0, in der Mitte bei x/z = 0, Größe um WARE_M.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { paint } from './mockup';
import { WARE_M } from './massstab';

/** Warenarten in der Reihenfolge der Sicht (Index = Warenart). */
export const WAREN_NAMEN = ['stamm', 'brett', 'stein', 'essen'] as const;
export const WAREN_ANZAHL = WAREN_NAMEN.length;

const W = WARE_M;

function stamm(): THREE.BufferGeometry[] {
  const l = W * 1.5, r = W * 0.2;
  return [
    paint(new THREE.CylinderGeometry(r, r, l, 7).rotateZ(Math.PI / 2).translate(0, r, 0), '#8a6340'),
    // helle Schnittflächen an den Enden
    paint(new THREE.CylinderGeometry(r * 0.86, r * 0.86, l + 0.12, 7).rotateZ(Math.PI / 2).translate(0, r, 0), '#e0bf86'),
    paint(new THREE.CylinderGeometry(r * 1.03, r * 1.03, l - 0.5, 7).rotateZ(Math.PI / 2).translate(0, r, 0), '#8a6340'),
  ];
}

function brett(): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 4; i++) {
    out.push(paint(new THREE.BoxGeometry(W * 1.45, W * 0.12, W * 0.62).translate((i % 2 - 0.5) * 0.18, W * 0.12 + i * W * 0.13, 0), i % 2 ? '#e4c690' : '#d6b27a'));
  }
  // quer liegende Hölzer darunter
  out.push(paint(new THREE.BoxGeometry(W * 0.12, W * 0.1, W * 0.7).translate(-W * 0.45, W * 0.05, 0), '#7a5636'));
  out.push(paint(new THREE.BoxGeometry(W * 0.12, W * 0.1, W * 0.7).translate(W * 0.45, W * 0.05, 0), '#7a5636'));
  return out;
}

function stein(): THREE.BufferGeometry[] {
  const s = W * 0.82;
  return [
    paint(new THREE.BoxGeometry(s, s * 0.8, s * 0.9).rotateY(0.3).translate(0, s * 0.4, 0), '#a7a49c'),
    paint(new THREE.BoxGeometry(s * 0.9, s * 0.1, s * 0.8).rotateY(0.3).translate(0, s * 0.82, 0), '#c8c5bb'),
  ];
}

function essen(): THREE.BufferGeometry[] {
  const r = W * 0.5;
  return [
    paint(new THREE.CylinderGeometry(r, r * 0.78, W * 0.5, 9).translate(0, W * 0.25, 0), '#8b5f33'),
    paint(new THREE.CylinderGeometry(r * 1.02, r * 1.02, W * 0.07, 9).translate(0, W * 0.46, 0), '#6e4826'),
    paint(new THREE.SphereGeometry(r * 0.92, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.6, 1).translate(0, W * 0.5, 0), '#e3b94b'),
    paint(new THREE.SphereGeometry(r * 0.22, 5, 4).translate(r * 0.3, W * 0.78, 0), '#c8402e'),
  ];
}

const BAU = [stamm, brett, stein, essen];

/** Geometrie einer Ware (Farben als Vertexfarben). */
export function warenGeometrie(art: number): THREE.BufferGeometry {
  const g = mergeGeometries((BAU[art] ?? stein)())!;
  g.computeVertexNormals();
  return g;
}

/** Höhe einer Ware in Metern (grob, zum Stapeln). */
export const WARE_HOEHE: readonly number[] = [W * 0.4, W * 0.62, W * 0.82, W * 0.8];
