import { describe, expect, it } from 'vitest';
import {
  ausschnittMoeglich, dekodiereRaster, dekodiereZeilen, fuegeLinien, HexFeld, klemmeAusschnitt, schneideLinie, schneideRing,
} from '../src/welt/ausschnitt';
import { GROESSEN, type Manifest } from '../src/welt/format';
import { hexDistance, hexesInRadius, hexToWorld } from '../src/welt/hexwelt';

/** Manifest wie test-nordeifel: r10/r40/vec-Kacheln x 5..10, z 0..7; Hex-Kacheln 4..9 × 0..8. */
function fakeManifest(): Manifest {
  const kacheln: [number, number][] = [];
  for (let z = 0; z <= 7; z++) for (let x = 5; x <= 10; x++) kacheln.push([x, z]);
  const hk: [number, number][] = [];
  for (let z = 0; z <= 8; z++) for (let x = 4; x <= 9; x++) hk.push([x, z]);
  return {
    format: 1, version: 'test', gebiet: 'test', erstellt: '', crs: '', origin: [266000, 5643000], size: [126000, 138000],
    tile: 6000, tiles: [21, 23], kacheln,
    hex: { size: 60, tile: 64, tiles: [19, 24], cols: 1213, rows: 1534, terrain: [], fields: [], kacheln: hk },
    cover: [], heightRange: [0, 0], files: {}, credits: [],
  };
}

describe('klemmeAusschnitt', () => {
  const m = fakeManifest();
  it('lässt einen zulässigen Ausschnitt unverändert', () => {
    const p = { version: 'test', q: 247, r: 393, size: 'gross' as const };
    expect(ausschnittMoeglich(m, p.q, p.r, p.size)).toBe(true);
    expect(klemmeAusschnitt(m, p)).toEqual(p);
  });
  it('schiebt einen zu weit östlichen Ausschnitt nach innen', () => {
    const p = { version: 'test', q: 460, r: 230, size: 'gross' as const };
    expect(ausschnittMoeglich(m, p.q, p.r, p.size)).toBe(false);
    const k = klemmeAusschnitt(m, p);
    expect(k.size).toBe('gross');
    expect(ausschnittMoeglich(m, k.q, k.r, k.size)).toBe(true);
    // Verschiebung nur nach Westen, nicht weiter als nötig
    expect(hexToWorld(k.q, k.r).x).toBeLessThan(hexToWorld(p.q, p.r).x);
    expect(hexDistance(k, p)).toBeLessThan(60);
    // ein Hex weiter östlich wäre nicht mehr zulässig
    expect(ausschnittMoeglich(m, k.q + 1, k.r, k.size) && ausschnittMoeglich(m, k.q + 2, k.r, k.size)).toBe(false);
  });
  it('klemmt auch am Weltrand (negativ) und je Größe', () => {
    for (const size of ['klein', 'mittel', 'gross'] as const) {
      const k = klemmeAusschnitt(m, { version: 'test', q: -50, r: -50, size });
      expect(ausschnittMoeglich(m, k.q, k.r, size)).toBe(true);
    }
  });
  it('wirft, wenn die Kacheln für die Größe zu klein sind', () => {
    const klein = fakeManifest();
    klein.kacheln = [[8, 3]];
    klein.hex.kacheln = [[7, 3]];
    expect(() => klemmeAusschnitt(klein, { version: 'test', q: 400, r: 270, size: 'klein' })).toThrow();
  });
});

describe('Höhen-Zeilendifferenzen', () => {
  /** Kodierer nach FORMAT.md: erster Wert je Zeile absolut, dann (h[i] − h[i−1]) mod 65536. */
  function kodiere(h: number[], n: number): Uint16Array {
    const out = new Uint16Array(h.length);
    for (let j = 0; j < h.length / n; j++) {
      for (let i = 0; i < n; i++) out[j * n + i] = i === 0 ? h[j * n] : (h[j * n + i] - h[j * n + i - 1]) & 0xffff;
    }
    return out;
  }
  it('Rundreise inklusive negativer Differenzen (Überlauf mod 65536)', () => {
    const n = 5;
    const h = [100, 90, 3000, 2999, 0, /* */ 65535, 0, 65535, 12, 12, /* */ 0, 0, 1, 65535, 7];
    const d = kodiere(h, n);
    expect(d[1]).toBe(65526);                // 90 − 100 mod 65536
    expect([...dekodiereZeilen(d, n)]).toEqual(h);
  });
  it('dekodiereRaster liest Höhe, Bedeckung und Wasser aus einer Kachel', () => {
    const n = 4, c = n * n;
    const h = Array.from({ length: c }, (_, k) => 1000 + k * 37 - (k % 3) * 90);
    const bytes = new Uint8Array(c * 5);
    new Uint16Array(bytes.buffer, 0, c).set(kodiere(h, n));
    for (let k = 0; k < c; k++) bytes[c * 2 + k] = k % 8;
    new Uint16Array(bytes.buffer, c * 3, c).set(Array.from({ length: c }, (_, k) => (k === 5 ? 2815 : 0)));
    const r = dekodiereRaster(bytes, n);
    expect([...r.height]).toEqual(h);
    expect(r.cover[9]).toBe(1);
    expect(r.water[5]).toBe(2815);
    expect(() => dekodiereRaster(bytes.subarray(0, 10), n)).toThrow();
  });
});

describe('Spielfeld-Hexe', () => {
  it('HexFeld.index folgt der Reihenfolge r, dann q', () => {
    const f = new HexFeld(100, 200, 6);
    let i = 0;
    for (const h of hexesInRadius(100, 200, 6)) expect(f.index(h.q, h.r)).toBe(i++);
    expect(f.index(100 + 7, 200)).toBe(-1);
    expect(f.index(100, 200 + 7)).toBe(-1);
    expect(i).toBe(f.count);
  });
  it('Spielfeld-Radien wie im Drehbuch', () => {
    expect(GROESSEN).toEqual({ klein: 45, mittel: 60, gross: 80 });
  });
});

describe('Vektoren', () => {
  it('fügt an Kachelkanten geschnittene Flussstücke wieder zusammen', () => {
    const a = { n: 'Rur', k: 0, w: 10, p: [0, 0, 100, 10, 0, 99, 20, 0, 98] };
    const b = { n: 'Rur', k: 0, w: 10, p: [20, 0, 98, 30, 5, 97] };
    const c = { n: 'Bach', k: 1, w: 3, p: [20, 0, 98, 25, 0, 90] };
    const m = fuegeLinien([b, c, a]);
    const rur = m.find((x) => x.n === 'Rur')!;
    expect(rur.p).toEqual([0, 0, 100, 10, 0, 99, 20, 0, 98, 30, 5, 97]);
    expect(m.length).toBe(2);
  });
  it('schneidet Linien und Ringe auf das Ausschnitts-Rechteck', () => {
    const l = schneideLinie([-10, 5, 1, 10, 5, 2, 30, 5, 3], 3, 20, 10);
    expect(l.length).toBe(1);
    expect(l[0].slice(0, 3)).toEqual([0, 5, 1.5]);
    expect(l[0].slice(-3)).toEqual([20, 5, 2.5]);
    expect(schneideLinie([-5, -5, 1, -1, -1, 1], 3, 20, 10)).toEqual([]);
    const ring = schneideRing([-5, -5, 5, -5, 5, 5, -5, 5], 20, 10);
    expect(Math.min(...ring.filter((_, i) => i % 2 === 0))).toBe(0);
    expect(ring.length).toBe(8);
  });
});
