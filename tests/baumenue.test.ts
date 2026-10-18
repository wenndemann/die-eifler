// Baumenü-Logik ohne Browser: Umkreis, Kostentexte, Gruppierung nach Daten, Zustände.
import { describe, expect, it } from 'vitest';
import {
  bedarfNamen, fehlmengen, hexeImUmkreis, kostenText, menueGruppen, naechstePrioritaet, reichweiteText, wareTexte, zustandsText,
} from '../src/spiel/baumenue';
import { hexAbstand } from '../src/spiel/logik';
import { GEBAEUDE, GEBAEUDE_IDS, WAREN, WAREN_NAMEN } from '../src/sim/daten';

const W = wareTexte(WAREN, WAREN_NAMEN);
const kosten = (typ: string) => GEBAEUDE[typ].kosten;

describe('Umkreis', () => {
  it('hat 3r(r+1) Hexe ohne die Mitte und alle im Abstand', () => {
    for (const r of [0, 1, 2, 9]) {
      const l = hexeImUmkreis({ q: 5, r: -3 }, r);
      expect(l.length).toBe(3 * r * (r + 1));
      for (const h of l) { expect(hexAbstand(h, { q: 5, r: -3 })).toBeLessThanOrEqual(r); expect(hexAbstand(h, { q: 5, r: -3 })).toBeGreaterThan(0); }
      expect(new Set(l.map((h) => `${h.q},${h.r}`)).size).toBe(l.length);
    }
    expect(hexeImUmkreis({ q: 0, r: 0 }, 2, true).length).toBe(19);
  });
});

describe('Kostentexte', () => {
  it('Beispiele aus den Daten', () => {
    expect(kostenText(kosten('saegewerk'), W, true)).toBe('2 🪵 Bretter · 1 🪨 Stein');
    expect(kostenText(kosten('saegewerk'), W)).toBe('2 Bretter, 1 Stein');
    expect(kostenText(kosten('foerster'), W)).toBe('1 Brett');
    expect(kostenText(new Array(WAREN.length).fill(0), W)).toBe('nichts');
  });
  it('Fehlmengen und Bedarf', () => {
    const vorrat = new Array(WAREN.length).fill(0);
    vorrat[1] = 1;
    const f = fehlmengen(kosten('huette'), vorrat);
    expect(kostenText(f, W)).toBe('2 Bretter, 2 Steine');
    expect(fehlmengen(kosten('foerster'), vorrat).every((n) => n === 0)).toBe(true);
    expect(bedarfNamen(f, W)).toBe('Bretter, Steine');
  });
  it('unbekannte Ware nimmt das letzte Wort des Namens', () => {
    expect(wareTexte(['x'], ['Eifeler Zeug'])[0]).toEqual({ icon: '', eins: 'Zeug', mehr: 'Zeug' });
  });
});

describe('Menü-Gruppierung', () => {
  const gr = menueGruppen(GEBAEUDE_IDS.map((id) => GEBAEUDE[id]));
  it('enthält jedes Gebäude außer dem Lager genau einmal', () => {
    const ids = gr.flatMap((g) => g.typen.map((t) => t.id));
    expect(ids).not.toContain('lager');
    expect([...ids].sort()).toEqual(GEBAEUDE_IDS.filter((i) => i !== 'lager').sort());
    for (const g of gr) for (const t of g.typen) expect(t.gruppe).toBe(g.gruppe);
  });
  it('Gruppen in der Reihenfolge der Daten, Einträge ebenso', () => {
    const t = (id: string, gruppe: string) => ({ id, gruppe });
    const r = menueGruppen([t('a', 'X'), t('lager', 'Y'), t('b', 'Z'), t('c', 'X')]);
    expect(r.map((g) => g.gruppe)).toEqual(['X', 'Z']);
    expect(r[0].typen.map((x) => x.id)).toEqual(['a', 'c']);
  });
});

describe('Reichweite und Zustände', () => {
  it('Texte', () => {
    expect(reichweiteText('baum', 11)?.text).toBe('11 Bäume in Reichweite');
    expect(reichweiteText('baum', 1)?.text).toBe('1 Baum in Reichweite');
    expect(reichweiteText('fels', 0)).toEqual({ text: 'Kein Fels in Reichweite – der Steinbruch hätte nichts zu tun.', warn: true });
    expect(reichweiteText('keine', 0)).toBeNull();
  });
  it('Baustelle und fertige Gebäude', () => {
    expect(zustandsText('wartet_material', true, 'Bretter').titel).toBe('Wartet auf Bretter');
    expect(zustandsText('kein_baum', false, '').titel).toBe('Kein Baum mehr in Reichweite');
    expect(zustandsText('kein_arbeiter', false, '').titel).toBe('Kein freier Bewohner');
    expect(zustandsText('voll', false, '').titel).toBe('Lager voll – keiner holt ab');
    expect(zustandsText('arbeitet', false, '').warn).toBe(false);
  });
  it('Priorität schaltet reihum', () => {
    expect([1, 2, 3].map(naechstePrioritaet)).toEqual([2, 3, 1]);
  });
});
