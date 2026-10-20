// M7 in der Simulation: Warenverteilung je Ware und Dorf (wie Siedler 2), Gebäude ruhen lassen, Statistik im Spielstand.
import { describe, expect, it } from 'vitest';
import { spieleAb } from '../src/sim/replay';
import { Simulation } from '../src/sim/sim';
import { ABNEHMER, ABNEHMER_ZAHL, STAT_MAX, STAT_TAKT, VERTEILUNG_JE_WARE, VERTEILUNG_STANDARD, WARE, WAREN } from '../src/sim/daten';
import { STAT_KOPF } from '../src/sim/typen';
import type { Befehl } from '../src/sim/typen';
import { kopie } from '../src/sim/stand';
import { baueTestKarte, gerade, KARTE_INFO } from './sim-szenario';

const tu = (sim: Simulation, b: Befehl, sp = 0) => sim.befehl(sim.tick, sp, b);
const lauf = (sim: Simulation, n: number) => { for (let i = 0; i < n; i++) sim.schritt(); };
const geb = (sim: Simulation, typ: string) => sim.sicht().gebaeude.find((g) => g.typ === typ)!;
/** Fertiges Gebäude sofort hinstellen (Test-Abkürzung über die innere Fabrik). */
const fertig = (sim: Simulation, typ: string, q: number, r: number, sp = 0) => {
  const s = sim as unknown as { karte: { index(q: number, r: number): number }; gebaeudeErzeugen(t: string, h: number, sofort: boolean, sp: number): { id: number } };
  return s.gebaeudeErzeugen(typ, s.karte.index(q, r), true, sp).id;
};

/** Lager bei (0,0), Küche rechts (3,0), Wohnhaus links (-3,0), beide fertig und angeschlossen. */
function kuecheUndHaus() {
  const sim = new Simulation(baueTestKarte(false), 1, { q: 0, r: 0 });
  fertig(sim, 'kueche', 3, 0);
  fertig(sim, 'wohnhaus', -3, 0);
  tu(sim, { art: 'weg', pfad: gerade(0, 0, 0, 3) });
  tu(sim, { art: 'weg', pfad: gerade(0, 0, 3, 3) });
  return sim;
}
/** Waren der Art `a` im Puffer des Gebäudes oder an Fahnen mit ihm als Ziel. */
const unterwegs = (sim: Simulation, typ: string, a: number) => {
  const g = geb(sim, typ);
  return (g.puffer?.[a] ?? 0) + sim.sicht().fahnen.reduce((n, f) => n + f.ziele.filter((z, i) => z === g.id && f.waren[i] === a).length, 0);
};

describe('Warenverteilung (ROADMAP M7)', () => {
  it('Standard: für jede Ware die feste Reihenfolge aus M5 (Baustellen, Kirmesplatz, Verarbeiter, Wohnhäuser)', () => {
    expect(ABNEHMER.map((a) => a.id)).toEqual(['baustelle', 'kirmes', 'verarbeiter', 'wohnen']);
    const sim = new Simulation(baueTestKarte(), 1, [{ q: 0, r: 0 }, { q: -6, r: 0 }]);
    for (const sp of [0, 1]) {
      const v = sim.sicht(sp).dorf.verteilung;
      expect(v.length).toBe(WAREN.length);
      v.forEach((r, a) => expect(r).toEqual([...VERTEILUNG_JE_WARE[a]]));
      expect(v[WARE.bretter]).toEqual([...VERTEILUNG_STANDARD]);
    }
  });

  it('Befehl verteilung gilt nur fürs eigene Dorf; ungültige Rangfolgen sind wirkungslos', () => {
    const sim = new Simulation(baueTestKarte(), 1, [{ q: 0, r: 0 }, { q: -6, r: 0 }]);
    const k = WARE.kartoffeln;
    tu(sim, { art: 'verteilung', ware: k, reihe: [3, 2, 1, 0] }, 1);
    tu(sim, { art: 'verteilung', ware: k, reihe: [0, 0, 1, 2] });
    tu(sim, { art: 'verteilung', ware: k, reihe: [0, 1, 2] });
    tu(sim, { art: 'verteilung', ware: 99, reihe: [3, 2, 1, 0] });
    tu(sim, { art: 'verteilung', ware: k, reihe: [0, 1, 2, 7] });
    tu(sim, { art: 'verteilung', ware: k, reihe: 'kaputt' as unknown as number[] });
    lauf(sim, 2);
    expect(sim.sicht(0).dorf.verteilung[k]).toEqual([...VERTEILUNG_STANDARD]);
    expect(sim.sicht(1).dorf.verteilung[k]).toEqual([3, 2, 1, 0]);
    expect(sim.sicht(1).dorf.verteilung[WARE.bretter]).toEqual([...VERTEILUNG_STANDARD]);
    expect(sim.pruefeInnenzustand()).toEqual([]);
  });

  it('Kartoffeln: Standard bekommt die Küche zuerst, umgestellt das Wohnhaus', () => {
    const k = WARE.kartoffeln;
    const a = kuecheUndHaus();
    lauf(a, 9);
    expect(unterwegs(a, 'kueche', k)).toBeGreaterThan(0);
    expect(unterwegs(a, 'wohnhaus', k)).toBe(0);

    const b = kuecheUndHaus();
    tu(b, { art: 'verteilung', ware: k, reihe: [0, 1, 3, 2] });
    lauf(b, 9);
    expect(unterwegs(b, 'wohnhaus', k)).toBeGreaterThan(0);
    expect(unterwegs(b, 'kueche', k)).toBe(0);
    expect(a.pruefsumme()).not.toBe(b.pruefsumme());
    expect(b.pruefeInnenzustand()).toEqual([]);
  });

  it('auch Waren von der Fahne (nicht aus dem Lager) folgen der Rangfolge', () => {
    const k = WARE.kartoffeln;
    const sim = kuecheUndHaus();
    tu(sim, { art: 'verteilung', ware: k, reihe: [3, 0, 1, 2] });
    lauf(sim, 2);
    // Kartoffelfeld oben, liefert über die Lagerfahne
    fertig(sim, 'kartoffelfeld', 0, -3);
    (sim as unknown as { gebaeude: Map<number, { vorrat: number[] }> }).gebaeude.get(1)!.vorrat[k] = 0;
    tu(sim, { art: 'weg', pfad: gerade(0, 0, 2, 3) });
    const feldFahne = () => sim.sicht().fahnen.find((f) => f.gebaeude === geb(sim, 'kartoffelfeld').id)!;
    let ziel = 0;
    for (let i = 0; i < 3 * 60 * 20 && !ziel; i++) {
      sim.schritt();
      const f = feldFahne();
      ziel = f.ziele.find((_, j) => f.waren[j] === k) ?? 0;
    }
    expect(ziel).toBe(geb(sim, 'wohnhaus').id);
  });
});

describe('Gebäude ruhen lassen', () => {
  it('ein angehaltenes Feld erzeugt nichts, nach dem Weiterarbeiten wieder; Lager und Fremdes gehen nicht', () => {
    const sim = new Simulation(baueTestKarte(false), 1, [{ q: 0, r: 0 }, { q: -9, r: 0 }]);
    const feld = fertig(sim, 'kartoffelfeld', 3, 0);
    tu(sim, { art: 'weg', pfad: gerade(0, 0, 0, 3) });
    tu(sim, { art: 'ruhen', id: feld, an: true });
    tu(sim, { art: 'ruhen', id: 1, an: true });
    tu(sim, { art: 'ruhen', id: feld, an: false }, 1);
    lauf(sim, 60 * 20);
    expect(geb(sim, 'kartoffelfeld')).toMatchObject({ ruht: true, zustand: 'ruht', erzeugt: 0 });
    expect(geb(sim, 'lager').ruht).toBe(false);
    tu(sim, { art: 'ruhen', id: feld, an: false });
    lauf(sim, 60 * 20);
    const g = geb(sim, 'kartoffelfeld');
    expect(g.ruht).toBe(false);
    expect(g.erzeugt).toBeGreaterThan(0);
    expect(sim.sicht().dorf.erzeugt[WARE.kartoffeln]).toBe(g.erzeugt);
    expect(sim.pruefeInnenzustand()).toEqual([]);
  });
});

describe('Statistik', () => {
  it('ein Messpunkt je Takt, mit Bewohnern, Lagerbestand und Erzeugtem; dünnt über STAT_MAX aus', () => {
    const sim = new Simulation(baueTestKarte(false), 1, { q: 0, r: 0 });
    lauf(sim, STAT_TAKT * 3 + 1);
    const st = sim.statistikVon(0);
    expect(st.takt).toBe(STAT_TAKT);
    expect(st.punkte.map((p) => p[0])).toEqual([0, STAT_TAKT, 2 * STAT_TAKT, 3 * STAT_TAKT]);
    const p = st.punkte[0];
    expect(p.length).toBe(STAT_KOPF + 2 * WAREN.length);
    expect(p[1]).toBe(10);
    expect(p[STAT_KOPF + WARE.bretter]).toBe(12);
    // Ausdünnen: Takt verdoppelt, höchstens STAT_MAX Punkte
    const d = (sim as unknown as { doerfer: { statPunkte: number[][]; statNaechst: number }[] }).doerfer[0];
    while (d.statPunkte.length < STAT_MAX) d.statPunkte.push(d.statPunkte[0].slice());
    d.statNaechst = sim.tick;
    lauf(sim, 1);
    const neu = sim.statistikVon(0);
    expect(neu.takt).toBe(2 * STAT_TAKT);
    expect(neu.punkte.length).toBeLessThanOrEqual(STAT_MAX);
  });

  it('Verteilung, Pause und Statistik überstehen Speichern und Laden (gleiche Prüfsumme, gleicher Fortgang)', () => {
    const k = WARE.kartoffeln;
    const sim = kuecheUndHaus();
    tu(sim, { art: 'verteilung', ware: k, reihe: [0, 1, 3, 2] });
    tu(sim, { art: 'ruhen', id: geb(sim, 'kueche').id, an: true });
    lauf(sim, STAT_TAKT + 50);
    const st = JSON.parse(JSON.stringify(sim.stand()));
    const neu = Simulation.ausStand(baueTestKarte(false), st);
    expect(neu.pruefsumme()).toBe(sim.pruefsumme());
    expect(neu.statistikVon(0)).toEqual(sim.statistikVon(0));
    lauf(sim, 500); lauf(neu, 500);
    expect(neu.pruefsumme()).toBe(sim.pruefsumme());
    expect(neu.sicht().dorf.verteilung[k]).toEqual([0, 1, 3, 2]);
    expect(geb(neu, 'kueche').ruht).toBe(true);
    // Replay des Protokolls kommt aufs selbe
    expect(spieleAb(baueTestKarte(false), sim.protokoll(KARTE_INFO)).pruefsumme()).not.toBe('');
  });

  it('Spielstände von vor M7 laden mit Standard-Verteilung und leerer Statistik', () => {
    const sim = new Simulation(baueTestKarte(false), 1, { q: 0, r: 0 });
    lauf(sim, 100);
    const st = kopie(sim.stand());
    for (const d of st.doerfer) { delete d.vert; delete d.erzeugt; delete d.statPunkte; delete d.statTakt; delete d.statNaechst; }
    for (const g of st.gebaeude) { delete g.ruht; delete g.erzeugt; }
    const alt = Simulation.ausStand(baueTestKarte(false), st);
    expect(alt.sicht().dorf.verteilung[0]).toEqual([...VERTEILUNG_STANDARD]);
    expect(alt.sicht().dorf.verteilung[0].length).toBe(ABNEHMER_ZAHL);
    expect(alt.pruefeInnenzustand()).toEqual([]);
    lauf(alt, 5);
    expect(alt.statistikVon(0).punkte.length).toBe(1);
  });
});
