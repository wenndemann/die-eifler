// Spiel-Logik ohne Browser: Lager-Hex, Klick oder Ziehen, Tick-Akkumulator, Saat, Hex-Linie.
import { describe, expect, it } from 'vitest';
import {
  KLICK_MS, KLICK_PIXEL, KlickErkenner, MAX_TICKS_JE_FRAME, TickTakt, hexAbstand, hexLinie, saatAusPruefsumme, waehleLagerHex,
  type LagerKarte,
} from '../src/spiel/logik';
import { TICK_HZ } from '../src/sim/typen';

/** Kleine Karte um (10, 10) mit Radius n; Hexe in `wasser` sind Terrain 0, alle anderen Wiese. */
function karte(n: number, wasser: [number, number][] = []): LagerKarte {
  const q0 = 10, r0 = 10;
  const count = 3 * n * (n + 1) + 1;
  const terrain = new Uint8Array(count).fill(1);
  const start: number[] = [];
  let s = 0;
  for (let dr = -n; dr <= n; dr++) { start.push(s); s += Math.min(n, -dr + n) - Math.max(-n, -dr - n) + 1; }
  const index = (q: number, r: number) => {
    const dr = r - r0;
    if (dr < -n || dr > n) return -1;
    const a = Math.max(-n, -dr - n), b = Math.min(n, -dr + n);
    const dq = q - q0;
    return dq < a || dq > b ? -1 : start[dr + n] + dq - a;
  };
  for (const [q, r] of wasser) terrain[index(q, r)] = 0;
  return { q: q0, r: r0, n, terrain, index };
}

describe('Lager-Hex', () => {
  const kerne = [
    { q: 14, r: 10, name: 'Einruhr' },
    { q: 8, r: 11, name: 'Nideggen' },
    { q: 10, r: 5, name: 'Abenden' },
  ];

  it('nimmt den Kern des Startorts', () => {
    expect(waehleLagerHex(karte(8), kerne, 'Einruhr')).toEqual({ q: 14, r: 10 });
  });

  it('nimmt sonst den Kern, der der Mitte am nächsten liegt', () => {
    // Nideggen: Abstand 2; Einruhr 4; Abenden 5
    expect(waehleLagerHex(karte(8), kerne, 'Unbekannt')).toEqual({ q: 8, r: 11 });
    expect(waehleLagerHex(karte(8), kerne)).toEqual({ q: 8, r: 11 });
  });

  it('nimmt ohne Kerne die Mitte', () => {
    expect(waehleLagerHex(karte(8), [])).toEqual({ q: 10, r: 10 });
  });

  it('bei Gleichstand gewinnt der Kern mit kleinerem r, dann q', () => {
    const gleich = [{ q: 12, r: 10, name: 'A' }, { q: 10, r: 8, name: 'B' }, { q: 8, r: 10, name: 'C' }];
    expect(waehleLagerHex(karte(8), gleich)).toEqual({ q: 10, r: 8 });
  });

  it('weicht von Wasser auf den nächsten begehbaren Nachbarn aus (Ring, r aufsteigend, dann q)', () => {
    const w = karte(8, [[14, 10]]);
    const h = waehleLagerHex(w, kerne, 'Einruhr');
    expect(hexAbstand(h, { q: 14, r: 10 })).toBe(1);
    expect(w.terrain[w.index(h.q, h.r)]).not.toBe(0);
    // erster Nachbar im Ring 1 in der Reihenfolge r aufsteigend: (15, 9) liegt in Zeile r = 9
    expect(h).toEqual({ q: 14, r: 9 });
  });

  it('geht auch über mehrere Ringe, wenn alle Nachbarn Wasser sind', () => {
    const ring1: [number, number][] = [[14, 10], [15, 10], [13, 10], [14, 9], [15, 9], [13, 11], [14, 11]];
    const w = karte(8, ring1);
    const h = waehleLagerHex(w, kerne, 'Einruhr');
    expect(hexAbstand(h, { q: 14, r: 10 })).toBe(2);
    expect(w.terrain[w.index(h.q, h.r)]).not.toBe(0);
  });
});

describe('Klick oder Ziehen', () => {
  it('kurzes Antippen ohne Bewegung ist ein Klick', () => {
    const k = new KlickErkenner();
    k.runter(1, 100, 100, 0);
    expect(k.hoch(1, 102, 101, 120)).toBe(0);
  });

  it('Ziehen über die Schwelle ist kein Klick, auch wenn der Finger zurückkehrt', () => {
    const k = new KlickErkenner();
    k.runter(1, 100, 100, 0);
    k.bewegt(1, 100 + KLICK_PIXEL + 5, 100);
    expect(k.hoch(1, 100, 100, 100)).toBe(-1);
  });

  it('zu langes Halten ist kein Klick', () => {
    const k = new KlickErkenner();
    k.runter(1, 5, 5, 0);
    expect(k.hoch(1, 5, 5, KLICK_MS + 1)).toBe(-1);
  });

  it('der Rechtsklick wird als Knopf 2 gemeldet', () => {
    const k = new KlickErkenner();
    k.runter(7, 5, 5, 0, 2);
    expect(k.hoch(7, 5, 5, 50)).toBe(2);
  });

  it('ein zweiter Finger (Zoomen) macht beide Berührungen ungültig', () => {
    const k = new KlickErkenner();
    k.runter(1, 10, 10, 0);
    k.runter(2, 50, 50, 20);
    expect(k.hoch(2, 50, 50, 60)).toBe(-1);
    expect(k.hoch(1, 10, 10, 70)).toBe(-1);
    // danach geht ein neuer Tipp wieder
    k.runter(3, 10, 10, 200);
    expect(k.hoch(3, 10, 10, 250)).toBe(0);
  });

  it('unbekannter Zeiger und Abbruch liefern keinen Klick', () => {
    const k = new KlickErkenner();
    expect(k.hoch(9, 0, 0, 0)).toBe(-1);
    k.runter(1, 0, 0, 0);
    k.abbruch(1);
    expect(k.hoch(1, 0, 0, 10)).toBe(-1);
  });
});

describe('Tick-Akkumulator', () => {
  const td = 1 / TICK_HZ;

  it('rechnet bei 1× je echter Sekunde 20 Ticks und behält den Rest', () => {
    const t = new TickTakt();
    let n = 0;
    for (let i = 0; i < 60; i++) n += t.vor(1 / 60, 1, false).ticks;
    expect(n).toBe(20);
  });

  it('Tempo 2× und 3× rechnet entsprechend mehr', () => {
    const a = new TickTakt(), b = new TickTakt();
    let n2 = 0, n3 = 0;
    for (let i = 0; i < 60; i++) { n2 += a.vor(1 / 60, 2, false).ticks; n3 += b.vor(1 / 60, 3, false).ticks; }
    expect(n2).toBe(40);
    expect(n3).toBe(60);
  });

  it('Pause rechnet nichts und sammelt nichts', () => {
    const t = new TickTakt();
    expect(t.vor(5, 3, true)).toEqual({ ticks: 0, alpha: 0 });
    expect(t.vor(td * 0.5, 1, false).ticks).toBe(0);
  });

  it('holt höchstens MAX_TICKS_JE_FRAME nach und verwirft den Rest', () => {
    const t = new TickTakt();
    const r = t.vor(10, 1, false);
    expect(r.ticks).toBe(MAX_TICKS_JE_FRAME);
    expect(r.alpha).toBe(0);
    expect(t.vor(0, 1, false).ticks).toBe(0);
  });

  it('alpha ist der Rest des Ticks, immer unter 1', () => {
    const t = new TickTakt();
    const r = t.vor(td * 2.5, 1, false);
    expect(r.ticks).toBe(2);
    expect(r.alpha).toBeCloseTo(0.5, 5);
    expect(t.vor(td * 0.4999, 1, false).alpha).toBeLessThan(1);
  });
});

describe('Saat und Hex-Linie', () => {
  it('die Saat ist eine Ganzzahl aus der Karten-Prüfsumme und nie 0', () => {
    expect(saatAusPruefsumme('41a0892e0123abcd')).toBe(0x41a0892e | 0);
    expect(saatAusPruefsumme('ffffffff00000000')).toBe(-1);
    expect(saatAusPruefsumme('00000000ffff')).toBe(1);
    expect(saatAusPruefsumme('')).toBe(1);
    expect(Number.isInteger(saatAusPruefsumme('abcdef0123456789'))).toBe(true);
  });

  it('die Hex-Linie verbindet benachbarte Hexe', () => {
    const l = hexLinie({ q: 0, r: 0 }, { q: 5, r: -3 });
    expect(l[0]).toEqual({ q: 0, r: 0 });
    expect(l[l.length - 1]).toEqual({ q: 5, r: -3 });
    expect(l.length).toBe(hexAbstand({ q: 0, r: 0 }, { q: 5, r: -3 }) + 1);
    for (let i = 1; i < l.length; i++) expect(hexAbstand(l[i - 1], l[i])).toBe(1);
    expect(hexLinie({ q: 2, r: 2 }, { q: 2, r: 2 })).toEqual([{ q: 2, r: 2 }]);
    expect(hexLinie({ q: 0, r: 0 }, { q: 100, r: 0 }, 60).length).toBe(61);
  });
});
