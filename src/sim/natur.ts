// Start-Natur der Simulation (Schnittstelle M4b): Bäume und Steine entstehen allein aus den Kartendaten und den Welt-Hex-Koordinaten,
// nicht aus der Saat – gleiche Karte, gleiche Natur. Nur Ganzzahlen.

/**
 * Feste Ganzzahl-Hashfunktion über die Welt-Hex-Koordinaten (q, r) – nicht über den Index, damit ein Hex bei jedem Ausschnitt
 * dasselbe bekommt. `salz` trennt unabhängige Würfe (Bäume, Lesesteine, Reihenfolge beim fairen Start). Ergebnis 0 .. 2^32 − 1.
 */
export function hashMit(q: number, r: number, salz: number): number {
  let h = Math.imul(q | 0, 0x9e3779b1) ^ Math.imul(r | 0, 0x85ebca6b) ^ Math.imul(salz | 0, 0xc2b2ae35);
  h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12; h = Math.imul(h, 0x297a2d39);
  h ^= h >>> 15;
  return h >>> 0;
}

/** Streubäume (Wiese, Heide, Moor). */
export const hashHex = (q: number, r: number): number => hashMit(q, r, 1);
/** Lesesteinhaufen. */
export const hashHex2 = (q: number, r: number): number => hashMit(q, r, 2);
/** Reihenfolge der zusätzlichen Lesesteinhaufen beim fairen Start. */
export const hashHex3 = (q: number, r: number): number => hashMit(q, r, 3);

/** Art des Steins je Hex (SichtNatur.felsArt). */
export const FELS_KEIN = 0, FELS_FELS = 1, FELS_KLIPPE = 2, FELS_LESE = 3;
