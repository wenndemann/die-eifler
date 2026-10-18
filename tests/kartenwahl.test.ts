import { describe, expect, it } from 'vitest';
import { dubletteUeberschrift, gruppiereOrte, klemmGrund, klemmMeldung, klemme, normalisiere, passtInKacheln, sucheOrte, zahlWort } from '../src/ui/kartenwahl';
import { KACHEL, WELT, type OrtEintrag } from '../src/welt/format';
import { worldToHex } from '../src/welt/hexwelt';

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

describe('Weltrand oder Ende der Kacheln', () => {
  const nideggen: [number, number][] = [];
  for (let tx = 8; tx <= 10; tx++) for (let tz = 3; tz <= 5; tz++) nideggen.push([tx, tz]);
  const nideggenSet = new Set(nideggen.map(([a, b]) => a * 1000 + b));
  const ganz: [number, number][] = [];
  for (let tx = 0; tx < Math.ceil(WELT.SX / KACHEL.m); tx++) for (let tz = 0; tz < Math.ceil(WELT.SZ / KACHEL.m); tz++) ganz.push([tx, tz]);
  const ganzSet = new Set(ganz.map(([a, b]) => a * 1000 + b));
  const mitteVon = (tx: number, tz: number) => worldToHex((tx + 0.5) * KACHEL.m, (tz + 0.5) * KACHEL.m);

  it('passt: kein Grund', () => {
    const m = mitteVon(9, 4);
    expect(klemmGrund(nideggenSet, m.q, m.r, 'klein')).toBeNull();
  });
  it('Teilgebiet: Ort knapp außerhalb der Kacheln = Ende der Kacheln', () => {
    const o = mitteVon(7, 4); // links neben den vorhandenen Kacheln, mitten in der Welt
    expect(klemmGrund(nideggenSet, o.q, o.r, 'klein')).toBe('kachelende');
    expect(klemme(nideggen, o.q, o.r, 'klein')).toMatchObject({ geklemmt: true, grund: 'kachelende' });
  });
  it('ganze Welt: am Rand = Weltrand', () => {
    const o = worldToHex(1000, 60000);
    expect(klemmGrund(ganzSet, o.q, o.r, 'mittel')).toBe('weltrand');
    expect(klemme(ganz, o.q, o.r, 'mittel')).toMatchObject({ geklemmt: true, grund: 'weltrand' });
  });
  it('ganze Welt, innen: nicht geklemmt, kein Grund', () => {
    const o = worldToHex(60000, 70000);
    expect(klemmGrund(ganzSet, o.q, o.r, 'gross')).toBeNull();
    expect(klemme(ganz, o.q, o.r, 'gross').grund).toBeUndefined();
  });
  it('Meldungen nennen den Ort und den Grund', () => {
    expect(klemmMeldung('kachelende', 'Gemünd')).toBe('Hier enden die Kacheln dieser Version – Gemünd liegt deshalb nicht in der Mitte.');
    expect(klemmMeldung('kachelende')).toMatch(/Hier enden die Kacheln dieser Version/);
    expect(klemmMeldung('weltrand', 'Aachen')).toMatch(/Aachen liegt zu nah am Weltrand/);
    expect(klemmMeldung('weltrand')).toMatch(/Weltrand/);
    expect(klemmMeldung('weltrand')).not.toMatch(/Kacheln/);
  });
});
