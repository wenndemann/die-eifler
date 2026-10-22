// Lebendige Eifel (ROADMAP M15, aus M9): Anker der bewegten Teile kommen aus den Gebäudemodellen (Rauch, Fenster, Hühner, Wäsche,
// Wasserrad, Säge, Schmiede, Tiere, Leute, Feuer), Nacht aus der Tageszeit, Werte in data/leben.json; reine Darstellung (keine Prüfsumme).
import { describe, expect, it } from 'vitest';
import leben from '../data/leben.json';
import { lebenAnker } from '../src/render/gebaeude';
import { LebenDarstellung } from '../src/render/leben';
import { GEBAEUDE_IDS } from '../src/sim/daten';
import { Simulation } from '../src/sim/sim';
import { baueTestKarte } from './sim-szenario';

const arten = (typ: string) => new Set(lebenAnker(typ).map((a) => a.art));

describe('Lebendige Eifel', () => {
  it('Anker aus den Modellen: was ein Gebäude tut, sieht man', () => {
    expect([...arten('wohnhaus')]).toEqual(expect.arrayContaining(['fenster', 'kamin', 'huhn', 'waesche']));
    expect([...arten('saegewerk')]).toEqual(expect.arrayContaining(['rad', 'saege']));
    expect([...arten('schmiede')]).toEqual(expect.arrayContaining(['esse', 'hammer', 'kamin']));
    expect(arten('schafstall').has('schafe')).toBe(true);
    expect(arten('kaeserei').has('kuehe')).toBe(true);
    expect(arten('bienenstock').has('bienen')).toBe(true);
    expect([...arten('kirmesplatz')]).toEqual(expect.arrayContaining(['kinder', 'feuer']));
    expect(arten('schaenke').has('schwaetzer')).toBe(true);
    expect([...arten('brauerei')]).toEqual(expect.arrayContaining(['dampf']));
    expect(arten('eisenhuette').has('rad')).toBe(true);
    // Spezialgebäude mit fremdem Modell bekommen eigene Anker (Mühlrad an der Senf- und Papiermühle)
    expect(arten('senfmuehle').has('rad')).toBe(true);
    expect(arten('papiermuehle').has('rad')).toBe(true);
    // jeder Gebäudetyp liefert Anker ohne Fehler, alle Zahlen endlich
    for (const id of GEBAEUDE_IDS) for (const a of lebenAnker(id)) expect([a.x, a.y, a.z].every(Number.isFinite), `${id}:${a.art}`).toBe(true);
  });

  it('Fenster liegen auf der Fassade (vorn und hinten), Hühner am Boden, Rauch über dem Dach', () => {
    const w = lebenAnker('wohnhaus');
    const fenster = w.filter((a) => a.art === 'fenster');
    expect(fenster.length).toBeGreaterThanOrEqual(4);
    expect(new Set(fenster.map((a) => a.seite))).toEqual(new Set([1, -1]));
    for (const f of fenster) expect(Math.abs(f.z)).toBeGreaterThan(3);
    for (const h of w.filter((a) => a.art === 'huhn')) expect(h.y).toBeLessThan(2);
    for (const k of w.filter((a) => a.art === 'kamin')) expect(k.y).toBeGreaterThan(8);
  });

  it('Nacht aus der Tageszeit: Mittag hell, Mitternacht dunkel, weiche Dämmerung', () => {
    expect(LebenDarstellung.nacht(0.5)).toBe(0);
    expect(LebenDarstellung.nacht(0)).toBe(1);
    const d = LebenDarstellung.nacht(0.75);
    expect(d).toBeGreaterThan(0);
    expect(d).toBeLessThan(1);
  });

  it('Werte in data/leben.json sind vollständig; die Darstellung ändert die Simulation nicht', () => {
    for (const k of ['fern_m', 'rauch', 'dampf', 'tiere', 'voegel', 'fenster', 'wind', 'konfetti', 'feuer', 'gras']) expect(leben).toHaveProperty(k);
    expect(leben.gras.max).toBeGreaterThan(0);
    // reine Darstellung: Anker abfragen lässt Prüfsumme und Zustand der Simulation unberührt
    const sim = new Simulation(baueTestKarte(), 3, { q: 0, r: 0 });
    const vorher = sim.pruefsumme();
    lebenAnker('lager'); lebenAnker('wohnhaus');
    expect(sim.pruefsumme()).toBe(vorher);
  });
});
