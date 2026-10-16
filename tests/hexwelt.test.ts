import { describe, expect, it } from 'vitest';
import { hexToWorld, worldToHex, toOffset, fromOffset, hexDistance, hexesInRadius, hexCount, hexTileIndex } from '../src/welt/hexwelt';
import { pruefsumme, Fnv2 } from '../src/welt/pruefsumme';

describe('Hex-Welt', () => {
  it('Hin- und Rückweg Welt ↔ Hex', () => {
    for (const [q, r] of [[0, 0], [5, 7], [-3, 11], [600, 700], [-700, 1533]]) {
      const w = hexToWorld(q, r);
      expect(worldToHex(w.x + 10, w.z - 20)).toEqual({ q, r });
      const o = toOffset(q, r);
      expect(fromOffset(o.col, o.row)).toEqual({ q, r });
    }
  });
  it('Radius-Reihenfolge und Anzahl', () => {
    for (const n of [0, 1, 45, 60, 80]) {
      const hs = [...hexesInRadius(10, 20, n)];
      expect(hs.length).toBe(hexCount(n));
      for (const h of hs) expect(hexDistance(h, { q: 10, r: 20 })).toBeLessThanOrEqual(n);
      for (let i = 1; i < hs.length; i++) {
        const a = hs[i - 1], b = hs[i];
        expect(a.r < b.r || (a.r === b.r && a.q < b.q)).toBe(true);
      }
    }
    // Drehbuch 3.1: klein ca. 6.200, mittel ca. 11.000, groß ca. 19.400 Hexe
    expect(hexCount(45)).toBe(6211);
    expect(hexCount(60)).toBe(10981);
    expect(hexCount(80)).toBe(19441);
  });
  it('Kachel-Index', () => {
    expect(hexTileIndex(0, 0)).toEqual({ hx: 0, hz: 0, i: 0 });
    const t = hexTileIndex(fromOffset(70, 130).q, 130)!;
    expect(t).toEqual({ hx: 1, hz: 2, i: 2 * 64 + 6 });
    expect(hexTileIndex(-1, 0)).toBeNull();
  });
});

describe('Prüfsumme', () => {
  it('FNV-1a Referenzwert', () => {
    const f = new Fnv2();
    f.text('a');
    expect(f.hex().slice(0, 8)).toBe('e40c292c'); // FNV-1a 32 von "a"
  });
  it('stabil und empfindlich', () => {
    const hs = [{ terrain: 1, height: 3456, slope: 4, build: 3, flags: 0, country: 1, place: 0 }];
    const a = pruefsumme('v', 1, 2, 0, hs);
    expect(a).toMatch(/^[0-9a-f]{16}$/);
    expect(pruefsumme('v', 1, 2, 0, hs)).toBe(a);
    expect(pruefsumme('v', 1, 2, 0, [{ ...hs[0], height: 3457 }])).not.toBe(a);
  });
});
