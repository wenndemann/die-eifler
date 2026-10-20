import { describe, expect, it } from 'vitest';
import { erzaehlerFuer, MeldungsFilter, mitTick, textFuer } from '../src/spiel/meldungen';
import { KEIN_DORF, type SichtEreignis } from '../src/sim/typen';

const dorf = (bewohner: number, wohnraum: number) => ({ ...KEIN_DORF, bewohner, wohnraum });
const ev = (nr: number, art: SichtEreignis['art'], gebaeude = 0, wert = 0): SichtEreignis => ({ nr, tick: nr * 10, art, gebaeude, wert });

describe('Meldungen der Erzählfigur', () => {
  it('Völkchen aus dem Startort, sonst aus den Ortskernen, sonst Rursee-Leute', () => {
    expect(erzaehlerFuer('Monschau').name).toMatch(/Herr Leck/);
    expect(erzaehlerFuer('Einruhr').name).toBe('Kapitän Kalle');
    expect(erzaehlerFuer('Nirgendwo', ['Xdorf', 'Gerolstein']).name).toBe('Maar-Mattes');
    expect(erzaehlerFuer(undefined).name).toBe('Kapitän Kalle');
  });

  it('Platzhalter und Sprachtick', () => {
    const e = erzaehlerFuer('Monschau');
    expect(textFuer('zuzug', 0, { ort: 'Monschau', n: 5 }, e)).toContain('5 Neue');
    expect(mitTick('Das Haus steht.', e)).toBe('Das Haus steht, sag ich mal.');
    expect(mitTick('Das Haus steht.', erzaehlerFuer('Gerolstein'))).toBe('Das Haus steht. Et blubbert!');
  });

  it('nicht jeder Bewohner und jedes Gebäude: nur das erste je Typ, runde Bewohnerzahlen, Kirmes und Stufe groß', () => {
    const f = new MeldungsFilter(erzaehlerFuer('Einruhr'), 'Einruhr');
    const geb = (id: number) => ({ typ: id === 9 ? 'kirmesplatz' : 'wohnhaus', name: id === 9 ? 'Kirmesplatz' : 'Wohnhaus' });
    const neu = (e: SichtEreignis[], b = 12, w = 30) => f.neue(e, dorf(b, w), geb, () => 'Kartoffeln', () => 'Dorf', 'Reifekeller', '10 Most');
    expect(f.begruessung('10 Most').text).toContain('Einruhr');
    expect(neu([ev(1, 'fertig', 3), ev(2, 'fertig', 4), ev(3, 'bewohner', 3, 6), ev(4, 'bewohner', 3, 6)]).length).toBe(2);
    expect(neu([ev(1, 'fertig', 3), ev(5, 'fertig', 5)]).length).toBe(0);           // schon gesehen bzw. Typ schon gemeldet
    expect(neu([], 21).map((m) => m.text).join()).toContain('20');
    const k = neu([ev(6, 'fertig', 9), ev(7, 'kirmes', 9), ev(8, 'stufe', 0, 1), ev(9, 'zuzug', 0, 5)], 21);
    expect(k.length).toBe(4);
    expect(k[0].text).toContain('10 Most');
    expect(k[1].gross).toBe(true);
    expect(k[2].text).toContain('Dorf');
    expect(k[2].text).toContain('Reifekeller');
    expect(neu([], 14, 18).length).toBe(0);
    expect(neu([], 18, 18).map((m) => m.text).join()).toContain('voll');
  });
});
