import { describe, expect, it } from 'vitest';
import { QUALI, QUALITAETEN } from '../src/render/qualitaet';
import { BAUM_DICHTE, BAUM_SKALE, HAUS_SKALE } from '../src/render/massstab';

describe('Qualitätsstufen', () => {
  it('steigen monoton von Niedrig zu Hoch', () => {
    const [n, m, h] = QUALITAETEN.map((q) => QUALI[q]);
    for (const k of Object.keys(n) as (keyof typeof n)[]) {
      expect(m[k]).toBeGreaterThanOrEqual(n[k]);
      expect(h[k]).toBeGreaterThanOrEqual(m[k]);
    }
  });
});

describe('Maßstab', () => {
  it('Gebäude 3-fach, Bäume 1,6 bis 2-fach, Waldkronenfläche ungefähr erhalten', () => {
    expect(HAUS_SKALE).toBe(3);
    expect(BAUM_SKALE).toBeGreaterThanOrEqual(1.6);
    expect(BAUM_SKALE).toBeLessThanOrEqual(2);
    // Kronenfläche je Baum wächst mit BAUM_SKALE², die Dichte sinkt entsprechend
    expect(BAUM_DICHTE * BAUM_SKALE * BAUM_SKALE).toBeGreaterThan(0.9);
    expect(BAUM_DICHTE * BAUM_SKALE * BAUM_SKALE).toBeLessThan(2);
  });
});
