// Holzbrücken: ein Weg über einen Bach bleibt zu, bis ein Träger die Brücke bringt; 2 im Startlager, mehr baut die Zimmerei.
import { describe, expect, it } from 'vitest';
import { Simulation } from '../src/sim/sim';
import { GEBAEUDE, WARE } from '../src/sim/daten';
import { baueTestKarte, mitBach } from './sim-szenario';
import { mitLuecken, wegPunkte } from '../src/render/wege';

type Intern = { karte: { index(q: number, r: number): number }; gebaeudeErzeugen(t: string, h: number, sofort: boolean, sp: number): { id: number; vorrat: number[] } };
const intern = (sim: Simulation) => sim as unknown as Intern;
const lauf = (sim: Simulation, n: number) => { for (let i = 0; i < n; i++) sim.schritt(); };
const lager = (sim: Simulation) => sim.sicht().gebaeude.find((g) => g.typ === 'lager')!;
const weg = (sim: Simulation, von: { q: number; r: number }, nach: { q: number; r: number }) => {
  const p = sim.wegAbschnitt(von, nach, [], 30)!;
  expect(p).not.toBeNull();
  sim.befehl(sim.tick, 0, { art: 'weg', pfad: p });
  lauf(sim, 1);
  return sim.sicht().segmente.find((s) => s.pfad[0].q === von.q && s.pfad[0].r === von.r && s.pfad.at(-1)!.q === nach.q && s.pfad.at(-1)!.r === nach.r)!;
};

describe('Holzbrücken', () => {
  it('Daten: Ware, Zimmerei (Bretter → Brücke) und 2 Brücken im Startlager', () => {
    expect(WARE.bruecke).toBeGreaterThan(0);
    const z = GEBAEUDE.zimmerei;
    expect(z.funktion).toBe('verarbeiter');
    expect(z.wandelt!.aus).toBe(WARE.bruecke);
    expect(z.wandelt!.ein.some((e) => e.a === WARE.bretter)).toBe(true);
    const sim = new Simulation(baueTestKarte(), 1, { q: 0, r: 0, bewohner: 20 });
    expect(lager(sim).vorrat![WARE.bruecke]).toBe(2);
  });

  it('der Weg über den Bach ist zu, bis der Träger die Brücke aus dem Lager bringt; dann trägt er Waren', () => {
    const sim = new Simulation(mitBach(baueTestKarte(), 3), 1, { q: 0, r: 0, bewohner: 20 });
    const s = weg(sim, { q: 0, r: 0 }, { q: 6, r: 0 });
    expect(s.bruecken).toBe(1);
    expect(sim.sicht().ereignisse.some((e) => e.art === 'bruecke_fehlt')).toBe(true);
    lauf(sim, 40);
    // die Brücke ist gleich an der Lagerfahne (dem angeschlossenen Ende) und wird eingebaut
    const offen = sim.sicht().segmente.find((x) => x.id === s.id)!;
    expect(offen.bruecken).toBe(0);
    expect(lager(sim).vorrat![WARE.bruecke]).toBe(1);
    expect(sim.sicht().ereignisse.some((e) => e.art === 'bruecke')).toBe(true);
    lauf(sim, 400);
    expect(sim.sicht().segmente.find((x) => x.id === s.id)!.traeger).toBeGreaterThan(0);
    expect(sim.pruefeInnenzustand()).toEqual([]);
  });

  it('ohne Brücke im Lager bleibt der Weg zu (kein Träger); die Zimmerei baut eine aus Brettern, dann geht er auf', () => {
    const sim = new Simulation(mitBach(baueTestKarte(), 3), 1, { q: 0, r: 0, bewohner: 20 });
    const l = intern(sim).gebaeudeErzeugen('zimmerei', intern(sim).karte.index(-3, 2), true, 0);
    const lg = [...(sim as unknown as { gebaeude: Map<number, { typ: string; vorrat: number[] }> }).gebaeude.values()].find((g) => g.typ === 'lager')!;
    lg.vorrat[WARE.bruecke] = 0;
    void l;
    weg(sim, { q: -3, r: 2 }, { q: 0, r: 0 });
    const s = weg(sim, { q: 0, r: 0 }, { q: 6, r: 0 });
    lauf(sim, 600);
    expect(sim.sicht().segmente.find((x) => x.id === s.id)!.bruecken).toBe(1);
    expect(sim.sicht().segmente.find((x) => x.id === s.id)!.traeger).toBe(0);
    let t = 0;
    while (sim.sicht().segmente.find((x) => x.id === s.id)!.bruecken > 0 && t < 30000) { lauf(sim, 100); t += 100; }
    expect(sim.sicht().segmente.find((x) => x.id === s.id)!.bruecken).toBe(0);
    expect(sim.pruefeInnenzustand()).toEqual([]);
  });

  it('keine Fahne mitten im Bach auf dem Weg; zwei Bäche brauchen zwei Brücken', () => {
    const sim = new Simulation(mitBach(baueTestKarte(), 3, 6), 1, { q: 0, r: 0, bewohner: 20 });
    const s = weg(sim, { q: 0, r: 0 }, { q: 9, r: 0 });
    expect(s.bruecken).toBe(2);
    const bach = s.pfad.find((h) => h.q === 3)!;
    expect(sim.kannFahne(bach.q, bach.r)).toBe(false);
    lauf(sim, 200);
    expect(sim.sicht().segmente.find((x) => x.id === s.id)!.bruecken).toBe(0);
    expect(lager(sim).vorrat![WARE.bruecke]).toBe(0);
  });

  it('Spielstand: gebaute Brücken und Prüfsumme bleiben; ältere Spielstände schenken die Brücken unter bestehenden Wegen', () => {
    const karte = mitBach(baueTestKarte(), 3);
    const sim = new Simulation(karte, 1, { q: 0, r: 0, bewohner: 20 });
    const s = weg(sim, { q: 0, r: 0 }, { q: 6, r: 0 });
    lauf(sim, 100);
    const st = sim.stand();
    expect(st.bruecken!.length).toBe(1);
    const neu = Simulation.ausStand(karte, st);
    expect(neu.pruefsumme()).toBe(sim.pruefsumme());
    lauf(sim, 300); lauf(neu, 300);
    expect(neu.pruefsumme()).toBe(sim.pruefsumme());
    // alter Spielstand: ein gesperrter Weg ohne Brückenliste ist offen
    const sim2 = new Simulation(karte, 1, { q: 0, r: 0, bewohner: 20 });
    const s2 = weg(sim2, { q: 0, r: 0 }, { q: 6, r: 0 });
    expect(s2.bruecken).toBe(1);
    const alt = sim2.stand();
    delete alt.bruecken;
    const geladen = Simulation.ausStand(karte, alt);
    expect(geladen.sicht().segmente.find((x) => x.id === s2.id)!.bruecken).toBe(0);
    void s;
  });

  it('Darstellung: unter der Brücke und an der Baustelle kein Wegband – die Linie endet am Rand der Lücke', () => {
    const linie = Array.from({ length: 41 }, (_, i) => ({ x: i, z: 0, flow: i }));
    const teile = mitLuecken(linie, [{ x: 20, z: 0, r: 5 }]);
    expect(teile.length).toBe(2);
    expect(teile[0].at(-1)!.x).toBeCloseTo(15, 3);
    expect(teile[1][0].x).toBeCloseTo(25, 3);
    for (const t of teile) for (const p of t) expect(Math.abs(p.x - 20)).toBeGreaterThanOrEqual(5 - 1e-3);
    expect(mitLuecken(linie, [])).toEqual([linie]);
  });

  it('Darstellung: Wege werden geglättet (Zickzack übers Hex-Gitter wird gerade), die Enden bleiben an den Fahnen', () => {
    const zick = [{ q: 0, r: 0 }, { q: 1, r: 0 }, { q: 1, r: 1 }, { q: 2, r: 1 }, { q: 2, r: 2 }, { q: 3, r: 2 }, { q: 3, r: 3 }];
    const welt = (h: { q: number; r: number }) => ({ x: Math.sqrt(3) * 10 * (h.q + h.r / 2), z: 15 * h.r });
    const roh = zick.map(welt), glatt = wegPunkte(zick, welt);
    expect(glatt[0]).toEqual(roh[0]);
    expect(glatt.at(-1)).toEqual(roh.at(-1));
    // die Knicke (Summe der Richtungswechsel) werden viel kleiner
    const knicke = (ps: { x: number; z: number }[]) => {
      let n = 0;
      for (let i = 1; i < ps.length - 1; i++) {
        const w1 = Math.atan2(ps[i].z - ps[i - 1].z, ps[i].x - ps[i - 1].x), w2 = Math.atan2(ps[i + 1].z - ps[i].z, ps[i + 1].x - ps[i].x);
        n += Math.abs(Math.atan2(Math.sin(w2 - w1), Math.cos(w2 - w1)));
      }
      return n;
    };
    expect(knicke(glatt)).toBeLessThan(knicke(roh) * 0.5);
  });
});
