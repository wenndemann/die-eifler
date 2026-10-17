import { describe, expect, it } from 'vitest';
import { dubletteUeberschrift, gruppiereOrte, klemme, normalisiere, passtInKacheln, sucheOrte, zahlWort } from '../src/ui/kartenwahl';
import type { OrtEintrag } from '../src/welt/format';

const o = (n: string, art: number, bei = '', q = 0, r = 0): OrtEintrag => [n, art, 0, 0, 1, q, r, bei];
const ORTE: OrtEintrag[] = [
  o('Gemünd', 1, 'Schleiden'), o('Schleiden', 0, 'Euskirchen'), o('Schleiden', 1, 'Aachen'), o('St. Vith', 0),
  o('Sankt Augustin', 0), o('Heimbach', 0), o('Heimbach', 1, 'Trier'), o('Heimbach', 2, 'Bonn'), o('Straß', 2),
];

describe('Namenssuche', () => {
  it('normalisiert Umlaute, Groß/Klein, St.', () => {
    expect(normalisiere('Gemünd')).toBe(normalisiere('gemund'));
    expect(normalisiere('GEMUEND')).toBe(normalisiere('Gemünd'));
    expect(normalisiere('St. Vith')).toBe('sankt vith');
    expect(normalisiere('Sankt Vith')).toBe('sankt vith');
    expect(normalisiere('Straße')).toBe(normalisiere('strasse'));
  });
  const g = gruppiereOrte(ORTE);
  it('findet ohne Umlaute', () => {
    expect(sucheOrte(g, 'gemund')[0].name).toBe('Gemünd');
  });
  it('St. Vith und Sankt Vith', () => {
    expect(sucheOrte(g, 'st. vith')[0].name).toBe('St. Vith');
    expect(sucheOrte(g, 'sankt vi')[0].name).toBe('St. Vith');
  });
  it('Dubletten bilden eine Gruppe, Stadt zuerst', () => {
    const t = sucheOrte(g, 'schleiden');
    expect(t).toHaveLength(1);
    expect(t[0].eintraege.map((e) => e[7])).toEqual(['Euskirchen', 'Aachen']);
    expect(sucheOrte(g, 'heim')[0].eintraege).toHaveLength(3);
  });
  it('Überschrift im Ton des Spiels', () => {
    expect(zahlWort(2)).toBe('zwei');
    expect(dubletteUeberschrift('Gemünd', 2)).toBe('Welches Gemünd? Et jitt zwei.');
    expect(dubletteUeberschrift('Heimbach', 3)).toBe('Welches Heimbach? Et jitt drei.');
  });
});

describe('klemme', () => {
  // 6x8 Kacheln, Nordeifel-artig: tx 5..10, tz 0..7
  const kacheln: [number, number][] = [];
  for (let tx = 5; tx <= 10; tx++) for (let tz = 0; tz <= 7; tz++) kacheln.push([tx, tz]);
  it('lässt passende Mitte unverändert', () => {
    const k = klemme(kacheln, 450, 230, 'klein');
    expect(k).toMatchObject({ q: 450, r: 230, geklemmt: false, passt: true });
  });
  it('schiebt vom Rand nach innen, dann passt es', () => {
    const k = klemme(kacheln, 300, 20, 'mittel');
    expect(k.geklemmt).toBe(true);
    expect(k.passt).toBe(true);
    const set = new Set(kacheln.map(([a, b]) => a * 1000 + b));
    expect(passtInKacheln(set, k.q, k.r, 'mittel')).toBe(true);
  });
  it('Größe passt nirgends: passt=false', () => {
    const klein: [number, number][] = [[8, 3], [9, 3], [8, 4], [9, 4]];
    expect(klemme(klein, 450, 230, 'gross').passt).toBe(false);
  });
});
