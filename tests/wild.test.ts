// Wald und Wild: Rehe und Wildschweine leben je Hex im Wald und wachsen nach, der Jäger erlegt sie (Wildbret → Wildgulasch),
// ohne Jäger wühlen Wildschweine Felder um; Wolf und Wildkatze sind geschützt: der Wolf reißt Schafe (Herdenschutzhund hilft),
// die Wildkatze bringt Ansehen, solange ihr Wald steht.
import { describe, expect, it } from 'vitest';
import { Simulation } from '../src/sim/sim';
import { GEBAEUDE, NAHRUNG, WARE } from '../src/sim/daten';
import { KATZE_PUNKTE, WILD_MAX, WILD_TAKT } from '../src/sim/wild';
import type { SimStand } from '../src/sim/stand';
import type { Befehl } from '../src/sim/typen';
import { baueTestKarte, gerade } from './sim-szenario';

const lauf = (sim: Simulation, n: number) => { for (let i = 0; i < n; i++) sim.schritt(); };
const tu = (sim: Simulation, b: Befehl) => { sim.befehl(sim.tick, 0, b); lauf(sim, 1); };
type Intern = {
  gebaeudeErzeugen(t: string, h: number, sofort: boolean, sp: number): { id: number };
  reh: Uint8Array; sau: Uint8Array; wolf: Uint8Array; katze: Uint8Array; baum: Uint8Array; feld: Uint8Array; feldStufe: Uint8Array; feldReif: Int32Array;
  besitz: Int8Array; natRev: number;
};
const I = (sim: Simulation) => sim as unknown as Intern;
const ix = (sim: Simulation, q: number, r: number) => sim.karte.index(q, r);
const fertig = (sim: Simulation, typ: string, q: number, r: number) => I(sim).gebaeudeErzeugen(typ, ix(sim, q, r), true, 0).id;
const geb = (sim: Simulation, id: number) => sim.sicht().gebaeude.find((g) => g.id === id)!;
const summe = (a: Uint8Array) => a.reduce((s, v) => s + v, 0);
/** Wald-Hexe um (3, -3) aus der Testkarte (Radius 2, ohne Mitte). */
const waldUm = (sim: Simulation) => sim.karte.qs.map((_, i) => i).filter((i) => I(sim).baum[i] >= 2 && sim.karte.abstand(i, ix(sim, 3, -3)) <= 2);
function leer(sim: Simulation) { for (const a of [I(sim).reh, I(sim).sau, I(sim).wolf, I(sim).katze]) a.fill(0); I(sim).natRev++; }

describe('Wald und Wild', () => {
  it('Daten: Jagdhütte, Wildküche (Wildgulasch veredelt), Herdenschutzhund, Schafställe und wühlbare Felder', () => {
    expect(GEBAEUDE.jagdhuette.funktion).toBe('jaeger');
    expect(GEBAEUDE.jagdhuette.ausgangWare).toBe(WARE.wildbret);
    expect(GEBAEUDE.wildkueche.wandelt!.aus).toBe(WARE.wildgulasch);
    expect(NAHRUNG[WARE.wildgulasch]).toBe(2);
    expect(GEBAEUDE.herdenschutzhund.funktion).toBe('herdenschutz');
    expect(GEBAEUDE.schafstall.schafe).toBe(true);
    expect(GEBAEUDE.kartoffelfeld.acker!.wuehlbar).toBe(true);
  });

  it('Start: Wild nur im Wald, fest aus der Karte; wächst nach, aber nicht über das Höchstmaß, leer gejagter Wald bleibt leer', () => {
    const a = new Simulation(baueTestKarte(), 1, { q: 0, r: 0 }), b = new Simulation(baueTestKarte(), 99, { q: 0, r: 0 });
    for (const x of [I(a).reh, I(a).sau]) expect([...x]).toEqual([...(x === I(a).reh ? I(b).reh : I(b).sau)]);
    expect(summe(I(a).reh) + summe(I(a).sau)).toBeGreaterThan(0);
    for (let i = 0; i < a.karte.count; i++) if (I(a).reh[i] || I(a).sau[i]) expect(I(a).baum[i]).toBeGreaterThanOrEqual(2);
    const vorher = summe(I(a).reh) + summe(I(a).sau);
    lauf(a, WILD_TAKT * 30);
    expect(summe(I(a).reh) + summe(I(a).sau)).toBeGreaterThan(vorher);
    for (let i = 0; i < a.karte.count; i++) expect(Math.max(I(a).reh[i], I(a).sau[i])).toBeLessThanOrEqual(WILD_MAX);
    expect(a.pruefeInnenzustand()).toEqual([]);
    leer(b);
    lauf(b, WILD_TAKT * 20);
    expect(summe(I(b).reh) + summe(I(b).sau)).toBe(0);
  });

  it('der Jäger erlegt zuerst Wildschweine, dann Rehe, und bringt Wildbret; Wolf und Wildkatze bleiben', () => {
    const sim = new Simulation(baueTestKarte(), 1, { q: 0, r: 0, bewohner: 20 });
    leer(sim);
    const w = waldUm(sim);
    I(sim).sau[w[0]] = 1; I(sim).reh[w[1]] = 2; I(sim).wolf[w[2]] = 1; I(sim).katze[w[3]] = 1; I(sim).natRev++;
    const j = fertig(sim, 'jagdhuette', 1, -1);
    tu(sim, { art: 'weg', pfad: gerade(0, 0, 1, 1) });
    lauf(sim, 20 * 25);
    // der erste Schuss galt dem Wildschwein, die Rehe stehen noch
    expect(geb(sim, j).erzeugt).toBeGreaterThanOrEqual(1);
    expect(I(sim).reh[w[1]]).toBe(2);
    lauf(sim, 20 * 60);
    expect(geb(sim, j).erzeugt).toBeGreaterThanOrEqual(3);
    expect(sim.sicht().dorf.wild!.erlegt).toBe(geb(sim, j).erzeugt);
    expect(summe(I(sim).wolf) + summe(I(sim).katze)).toBe(2);
    expect(sim.arbeitsHexe('jagdhuette', 1, -1).art).toBe('wild');
    expect(sim.pruefeInnenzustand()).toEqual([]);
  });

  it('wird der Wald gerodet, zieht das Wild ins Nachbar-Hex', () => {
    const sim = new Simulation(baueTestKarte(), 1, { q: 0, r: 0, bewohner: 20 });
    leer(sim);
    const w = waldUm(sim).find((i) => sim.kannBauen('wohnhaus', sim.karte.qs[i], sim.karte.rs[i]))!;
    I(sim).reh[w] = 1; I(sim).katze[w] = 1; I(sim).natRev++;
    tu(sim, { art: 'gebaeude', typ: 'wohnhaus', q: sim.karte.qs[w], r: sim.karte.rs[w] });
    expect(I(sim).reh[w] + I(sim).katze[w]).toBe(0);
    expect(summe(I(sim).reh)).toBe(1);
    expect(summe(I(sim).katze)).toBe(1);
    expect(sim.pruefeInnenzustand()).toEqual([]);
  });

  it('Wildschaden: Wildschweine wühlen Kartoffelfelder um; im Revier einer Jagdhütte nicht', () => {
    const mit = (jaeger: boolean) => {
      const sim = new Simulation(baueTestKarte(), 3, { q: 0, r: 0, bewohner: 20 });
      leer(sim);
      // Felder und Wildschweine nebeneinander am Wald um (3,-3)
      // nur Felder, die im Revier einer Jagdhütte bei (2, 0) lägen
      const f = sim.karte.qs.map((_, i) => i).filter((i) => !I(sim).baum[i] && sim.karte.abstand(i, ix(sim, 3, -3)) === 3 && sim.karte.terrain[i] === 1
        && sim.karte.abstand(i, ix(sim, 2, 0)) <= GEBAEUDE.jagdhuette.radius);
      for (const i of f) { I(sim).feld[i] = 1; I(sim).feldStufe[i] = 4; I(sim).feldReif[i] = 0; }
      for (const i of waldUm(sim)) I(sim).sau[i] = 2;
      I(sim).natRev++;
      if (jaeger) { fertig(sim, 'jagdhuette', 2, 0); tu(sim, { art: 'weg', pfad: gerade(0, 0, 0, 2) }); }
      const belegt = sim as unknown as { hexFahne: Int32Array; hexWeg: Int32Array; hexGeb: Int32Array };
      for (const i of f) if (belegt.hexFahne[i] || belegt.hexWeg[i] || belegt.hexGeb[i]) { I(sim).feld[i] = 0; I(sim).feldStufe[i] = 0; }
      lauf(sim, WILD_TAKT * 6);
      return { sim, umgewuehlt: f.filter((i) => I(sim).feldStufe[i] < 4 && I(sim).feld[i]).length };
    };
    const ohne = mit(false), mitJ = mit(true);
    expect(ohne.umgewuehlt).toBeGreaterThan(0);
    expect(mitJ.umgewuehlt).toBe(0);
    expect(ohne.sim.pruefeInnenzustand()).toEqual([]);
  });

  it('Wolf reißt Schafe am Schafstall, der Herdenschutzhund hilft; die Wildkatze bringt Ansehen', () => {
    const mit = (hund: boolean) => {
      const sim = new Simulation(baueTestKarte(), 5, { q: 0, r: 0, bewohner: 20 });
      leer(sim);
      I(sim).wolf[waldUm(sim)[0]] = 1; I(sim).natRev++;
      fertig(sim, 'schafstall', 1, -1);
      tu(sim, { art: 'weg', pfad: gerade(0, 0, 1, 1) });
      if (hund) fertig(sim, 'herdenschutzhund', 0, -2);
      lauf(sim, WILD_TAKT * 40);
      return sim;
    };
    const ohne = mit(false);
    expect(ohne.sicht().dorf.wild!.risse).toBeGreaterThan(0);
    expect(ohne.sicht().ereignisse.some((e) => e.art === 'wolf')).toBe(true);
    expect(mit(true).sicht().dorf.wild!.risse).toBe(0);
    // Wildkatze im eigenen Wald (Land des Dorfs)
    const sim = new Simulation(baueTestKarte(), 1, { q: 0, r: 0 });
    leer(sim);
    lauf(sim, 25);
    const k = waldUm(sim).find((i) => I(sim).besitz[i] === 0)!;
    expect(k).toBeDefined();
    I(sim).katze[k] = 1; I(sim).natRev++;
    const p0 = sim.sicht().spieler[0].punkte;
    lauf(sim, 20 * 130);
    expect(sim.sicht().dorf.wild!.katzeP).toBeGreaterThanOrEqual(KATZE_PUNKTE);
    expect(sim.sicht().spieler[0].punkte).toBeGreaterThan(p0);
  });

  it('Spielstand: Wild in Stand und Prüfsumme; ältere Spielstände bekommen das Start-Wild auf den heutigen Wald', () => {
    const sim = new Simulation(baueTestKarte(), 1, { q: 0, r: 0 });
    lauf(sim, WILD_TAKT * 5);
    const neu = Simulation.ausStand(baueTestKarte(), sim.stand());
    expect(neu.pruefsumme()).toBe(sim.pruefsumme());
    lauf(sim, WILD_TAKT * 5); lauf(neu, WILD_TAKT * 5);
    expect(neu.pruefsumme()).toBe(sim.pruefsumme());
    const alt = JSON.parse(JSON.stringify(sim.stand())) as SimStand;
    for (const k of ['reh', 'sau', 'wolf', 'katze', 'wildRes'] as const) delete alt.natur[k];
    for (const d of alt.doerfer) for (const k of ['katzeP', 'risse', 'umgewuehlt', 'erlegt']) delete d[k];
    const geladen = Simulation.ausStand(baueTestKarte(), alt);
    expect(summe(I(geladen).reh) + summe(I(geladen).sau)).toBeGreaterThan(0);
    expect(geladen.sicht().dorf.wild!.katzeP).toBe(0);
    expect(geladen.pruefeInnenzustand()).toEqual([]);
    lauf(geladen, WILD_TAKT * 3);
    expect(geladen.pruefeInnenzustand()).toEqual([]);
  });
});
