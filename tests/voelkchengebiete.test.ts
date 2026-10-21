// Kerngebiete der Völkchen: jedes Völkchen hat eins, die Orte des Völkchens liegen im Kreis (soweit die Weltdaten sie kennen),
// und die Umrechnung trifft bekannte Orte.
import { describe, expect, it } from 'vitest';
import { VOELKCHEN } from '../src/sim/voelkchen';
import { gebietBei, utm32, VOELKCHEN_GEBIETE } from '../src/welt/voelkchengebiete';
import { hexToWorld } from '../src/welt/hexwelt';
import { WELT } from '../src/welt/format';

describe('Kerngebiete der Völkchen', () => {
  it('zehn Gebiete in der Welt, eins je Völkchen', () => {
    expect(VOELKCHEN_GEBIETE.map((g) => g.id).sort()).toEqual(VOELKCHEN.map((v) => v.id).sort());
    for (const g of VOELKCHEN_GEBIETE) {
      expect(g.x, g.id).toBeGreaterThan(0); expect(g.x, g.id).toBeLessThan(WELT.SX + 5000);
      expect(g.z, g.id).toBeGreaterThan(0); expect(g.z, g.id).toBeLessThan(WELT.SZ);
    }
  });
  it('Umrechnung: Nideggen liegt bei Hex (405, 272), im Gebiet der Rureifeler', () => {
    const p = utm32(6.4836, 50.6907), x = p.ost - WELT.E0, z = WELT.N0 - p.nord;
    const h = hexToWorld(405, 272);
    expect(Math.hypot(x - h.x, z - h.z)).toBeLessThan(200);
    expect(gebietBei(x, z)?.id).toBe('rureifel');
    const mon = utm32(6.244, 50.5547);
    expect(gebietBei(mon.ost - WELT.E0, WELT.N0 - mon.nord)?.id).toBe('monschau');
  });
});
