import { describe, expect, it } from 'vitest';
import { wunschKern } from '../src/welt/ausschnitt';
import { wunschMeldung } from '../src/ui/kartenwahl';
import { waehleLagerHex } from '../src/spiel/logik';

const kerne = [
  { q: 0, r: 0, name: 'Simmerath' },
  { q: 10, r: -3, name: 'Einruhr' },
  { q: 12, r: -3, name: 'Einruhr' },
  { q: -20, r: 5, name: 'Hammer' },
  { q: 3, r: 3, name: '' },
];

describe('Wunsch-Ort', () => {
  it('nimmt den Ortskern auf dem Hex des Wunsch-Orts, auch abseits der Mitte', () => {
    expect(wunschKern(kerne, { name: 'Hammer', q: -20, r: 5 }, 0, 0, 45)).toBe('Hammer');
    expect(wunschKern(kerne, { name: 'Einruhr', q: 12, r: -3 }, 0, 0, 45)).toBe('Einruhr');
  });

  it('findet gleichnamige Kerne in der Nähe, sonst den nächsten Kern', () => {
    expect(wunschKern(kerne, { name: 'Einruhr', q: 11, r: -1 }, 0, 0, 45)).toBe('Einruhr');
    expect(wunschKern(kerne, { name: 'Pleushütte', q: -18, r: 6 }, 0, 0, 45)).toBe('Hammer');
  });

  it('gilt nicht, wenn der Ort außerhalb des Spielfelds liegt oder keiner gewünscht ist', () => {
    expect(wunschKern(kerne, { name: 'Hammer', q: -20, r: 5 }, 0, 0, 15)).toBeUndefined();
    expect(wunschKern(kerne, undefined, 0, 0, 45)).toBeUndefined();
  });

  it('das Lager steht dann im Wunsch-Ort', () => {
    const karte = { q: 0, r: 0, n: 45, terrain: new Uint8Array([1]), index: () => 0 };
    const name = wunschKern(kerne, { name: 'Hammer', q: -20, r: 5 }, 0, 0, 45);
    expect(waehleLagerHex(karte, kerne, name)).toEqual({ q: -20, r: 5 });
  });

  it('sagt, warum der Ort nicht ins Spielfeld passt', () => {
    expect(wunschMeldung('Monschau', 'weltrand')).toMatch(/Monschau liegt zu nah am Weltrand/);
    expect(wunschMeldung('Kalterherberg', 'kachelende')).toMatch(/Kartendaten/);
  });
});

describe('Wunsch-Ort im Mehrspieler', () => {
  it('der Gastgeber startet im Wunsch-Ort, die anderen möglichst weit weg', async () => {
    const { orteAus, verteileStartplaetze } = await import('../src/netz/startplaetze');
    const erster = wunschKern(kerne, { name: 'Einruhr', q: 10, r: -3 }, 0, 0, 45);
    const namen = verteileStartplaetze(orteAus(kerne), 2, { q: 0, r: 0 }, erster);
    expect(namen).toEqual(['Einruhr', 'Hammer']);
  });
});
