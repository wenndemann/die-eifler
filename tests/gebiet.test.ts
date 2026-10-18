import { describe, expect, it } from 'vitest';
import { packeBuendel, parseBuendel } from '../src/welt/buendel';
import { GEBIETE, gebietsKacheln, hexKachelnZuRasterKachel, parseGebiet } from '../src/welt/gebiet';

// Manifest-Ausschnitt: ganze Welt 21 x 23 Raster-Kacheln, Hex-Kacheln 19 x 24
const alleR: [number, number][] = [];
for (let tz = 0; tz < 23; tz++) for (let tx = 0; tx < 21; tx++) alleR.push([tx, tz]);
const alleH: [number, number][] = [];
for (let hz = 0; hz < 24; hz++) for (let hx = 0; hx < 19; hx++) alleH.push([hx, hz]);
const manifest = { kacheln: alleR, hex: { kacheln: alleH } };

describe('Gebiete', () => {
  it('Namen wie in setup.py', () => {
    expect(parseGebiet('nordeifel')).toEqual({ tx0: 5, tx1: 10, tz0: 0, tz1: 7 });
    expect(parseGebiet('nideggen')).toEqual({ tx0: 8, tx1: 10, tz0: 3, tz1: 5 });
    expect(Object.keys(GEBIETE)).toEqual(['nordeifel', 'nideggen']);
  });
  it('alle und Bereichsangabe', () => {
    expect(parseGebiet('alle')).toBeNull();
    expect(parseGebiet('2-4,1-3')).toEqual({ tx0: 2, tx1: 4, tz0: 1, tz1: 3 });
  });
  it('Fehler auf Deutsch', () => {
    expect(() => parseGebiet('mars')).toThrow(/Unbekanntes Gebiet/);
    expect(() => parseGebiet('5-2,0-1')).toThrow(/Anfang muss vor dem Ende/);
  });
  it('nordeifel: 48 Raster-Kacheln, nideggen: 9', () => {
    expect(gebietsKacheln(manifest, parseGebiet('nordeifel')).raster.size).toBe(48);
    const n = gebietsKacheln(manifest, parseGebiet('nideggen'));
    expect(n.raster.size).toBe(9);
    expect(n.raster.has('9_4')).toBe(true);
    expect(n.raster.has('7_4')).toBe(false);
  });
  it('nur Kacheln aus dem Manifest', () => {
    const klein = { kacheln: [[8, 3], [9, 3], [3, 3]] as [number, number][], hex: { kacheln: [[4, 3]] as [number, number][] } };
    const k = gebietsKacheln(klein, parseGebiet('nideggen'));
    expect([...k.raster].sort()).toEqual(['8_3', '9_3']);
    for (const h of k.hex) expect(h).toBe('4_3');
  });
  it('alle = alles aus dem Manifest', () => {
    const k = gebietsKacheln(manifest, null);
    expect(k.raster.size).toBe(21 * 23);
    expect(k.hex.size).toBe(19 * 24);
  });
  it('Hex-Kacheln decken die Raster-Kacheln ab', () => {
    // Mitte von Raster 9_4: x = 57000, z = 27000 -> Hex-Zeile 300, Spalte ≈ 57000 / 103,9 ≈ 548
    const h = hexKachelnZuRasterKachel(9, 4).map(([x, z]) => `${x}_${z}`);
    expect(h).toContain(`${Math.floor(548 / 64)}_${Math.floor(300 / 64)}`);
    const n = gebietsKacheln(manifest, parseGebiet('nideggen')).hex.size;
    expect(n).toBeGreaterThan(0);
    expect(n).toBeLessThan(40);
  });
});

describe('Bündel der Teilen-Version', () => {
  it('packt je Art, teilt bei Größe, Hin- und Rückweg', () => {
    const dateien: [string, string][] = [
      ['r10/1_1.bin.gz', 'AAAA'], ['r10/2_1.bin.gz', 'BBBB'], ['r10/3_1.bin.gz', 'CCCC'],
      ['vec/1_1.json.gz', 'DDDD'], ['hex/0_0.bin.gz', 'EEEE'],
    ];
    const { buendel, index } = packeBuendel(dateien, 50);
    expect(index['vec/1_1.json.gz']).toBe('buendel/vec-0.txt');
    expect(index['hex/0_0.bin.gz']).toBe('buendel/hex-0.txt');
    expect(index['r10/1_1.bin.gz']).toBe('buendel/r10-0.txt');
    expect(index['r10/3_1.bin.gz']).toBe('buendel/r10-1.txt'); // 50 Zeichen reichen für zwei Zeilen
    for (const [pfad, b64] of dateien) expect(parseBuendel(buendel.get(index[pfad])!).get(pfad)).toBe(b64);
  });
  it('jede Datei in genau einem Bündel, keines über der Grenze', () => {
    const dateien: [string, string][] = Array.from({ length: 100 }, (_, i) => [`r10/${i}_0.bin.gz`, 'x'.repeat(1000)]);
    const { buendel, index } = packeBuendel(dateien, 10000);
    expect(Object.keys(index)).toHaveLength(100);
    for (const t of buendel.values()) expect(t.length).toBeLessThanOrEqual(10000);
    expect(buendel.size).toBeGreaterThan(5);
  });
});
