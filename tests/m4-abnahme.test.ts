// Abnahme M4 (ROADMAP): Aus 12 Brettern und 8 Steinen entsteht ohne Eingriff eine laufende Holzwirtschaft.
// Holzfäller und Förster nebeneinander liefern nach 2 Minuten weiter Stämme.
import { describe, expect, it } from 'vitest';
import { spieleAb } from '../src/sim/replay';
import { Simulation } from '../src/sim/sim';
import { START_VORRAT, TREE_MAX, WARE } from '../src/sim/daten';
import { TICK_HZ } from '../src/sim/typen';
import type { Protokoll } from '../src/sim/typen';
import { baueM4Befehle, baueM4Karte, KARTE_INFO, M4_ORTE, M4_WALD } from './sim-szenario';

const MIN = 60 * TICK_HZ;

interface Lauf {
  sim: Simulation;
  /** Stämme (erzeugt) und Bretter (erzeugt) am Ende jeder Spielminute 1..12. */
  stamm: number[];
  bretter: number[];
  /** Tick, ab dem alle Baustellen fertig sind (-1 = nie). */
  fertigTick: number;
}

function spiele(ohneFoerster: boolean, minuten = 12): Lauf {
  const karte = baueM4Karte();
  const sim = new Simulation(karte, 777, M4_ORTE.lager);
  // Die Befehle gibt es nur bei Tick 0 – danach greift niemand mehr ein.
  for (const e of baueM4Befehle(ohneFoerster)) sim.befehl(e.tick, e.spieler, e.befehl);
  const l: Lauf = { sim, stamm: [], bretter: [], fertigTick: -1 };
  for (let m = 1; m <= minuten; m++) {
    for (let i = 0; i < MIN; i++) {
      sim.schritt();
      if (l.fertigTick < 0 && sim.tick % 20 === 0) {
        const g = sim.sicht().gebaeude;
        if (g.length > 1 && g.every((x) => x.bau === 1000)) l.fertigTick = sim.tick;
      }
    }
    const st = sim.statistik().erzeugtJe;
    l.stamm.push(st[WARE.stamm]);
    l.bretter.push(st[WARE.bretter]);
  }
  return l;
}

describe('Abnahme M4: Bauen mit Holz und Stein', () => {
  const mit = spiele(false);
  const ohne = spiele(true);

  it('Start nur mit 12 Brettern und 8 Steinen; alle Baustellen werden fertig, Bretter entstehen aus Stämmen und landen im Lager', () => {
    const { sim } = mit;
    expect(START_VORRAT[WARE.bretter]).toBe(12);
    expect(START_VORRAT[WARE.stein]).toBe(8);
    const s = sim.sicht();
    expect(s.gebaeude.map((g) => g.typ).sort()).toEqual(['foerster', 'holzfaeller', 'huette', 'lager', 'saegewerk', 'steinbruch']);
    expect(s.gebaeude.every((g) => g.bau === 1000 && !g.getrennt)).toBe(true);
    expect(mit.fertigTick).toBeGreaterThan(0);
    expect(mit.fertigTick).toBeLessThan(5 * MIN);
    // 12 B − (2+1+2+2+3) = 2 B und 8 S − (1+2) = 5 S bleiben ohne eigene Erzeugung übrig
    const lager = s.gebaeude.find((g) => g.typ === 'lager')!.vorrat!;
    const st = sim.statistik();
    expect(st.erzeugtJe[WARE.bretter]).toBeGreaterThan(5);
    expect(st.erzeugtJe[WARE.bretter]).toBeLessThanOrEqual(st.erzeugtJe[WARE.stamm]);
    expect(lager[WARE.bretter]).toBeGreaterThanOrEqual(2 + st.erzeugtJe[WARE.bretter] - 3);
    expect(lager[WARE.bretter]).toBeLessThanOrEqual(2 + st.erzeugtJe[WARE.bretter]);
    expect(lager[WARE.stein]).toBeGreaterThanOrEqual(5);
    expect(st.verbaut).toBe(10 + 3);
    expect(sim.pruefeInnenzustand()).toEqual([]);
  });

  it('Holzfäller und Förster liefern nach 2 Minuten und noch zwischen Minute 8 und 12 weiter Stämme', () => {
    const j = (a: number[], von: number, bis: number) => a[bis - 1] - (von > 0 ? a[von - 1] : 0);
    console.log(`M4 mit Förster – Stämme je Minute: ${mit.stamm.map((v, i) => v - (i ? mit.stamm[i - 1] : 0)).join(',')}; ` +
      `Bretter je Minute: ${mit.bretter.map((v, i) => v - (i ? mit.bretter[i - 1] : 0)).join(',')}; alle Baustellen fertig nach ${(mit.fertigTick / TICK_HZ).toFixed(0)} s`);
    expect(j(mit.stamm, 2, 3)).toBeGreaterThan(0);
    expect(j(mit.stamm, 2, 4)).toBeGreaterThan(2);
    expect(j(mit.stamm, 8, 12)).toBeGreaterThan(10);
    expect(j(mit.bretter, 8, 12)).toBeGreaterThan(5);
  });

  it('Gegenprobe ohne Förster: Das Waldstück ist endlich, die Stamm-Lieferung versiegt', () => {
    console.log(`M4 ohne Förster – Stämme je Minute: ${ohne.stamm.map((v, i) => v - (i ? ohne.stamm[i - 1] : 0)).join(',')}`);
    const wald = M4_WALD.length * TREE_MAX;
    expect(ohne.fertigTick).toBeGreaterThan(0);
    expect(ohne.stamm[11]).toBeLessThanOrEqual(wald);
    expect(ohne.stamm[11]).toBeGreaterThan(wald - 4); // fast der ganze Wald wurde gefällt …
    expect(ohne.stamm[11] - ohne.stamm[7]).toBe(0);   // … und danach kommt nichts mehr
    expect(ohne.sim.sicht().gebaeude.find((g) => g.typ === 'holzfaeller')!.zustand).toBe('kein_baum');
    expect(mit.stamm[11]).toBeGreaterThan(2 * ohne.stamm[11]);
  });

  it('Replay ergibt dieselbe Prüfsumme', () => {
    const p = JSON.parse(JSON.stringify(mit.sim.protokoll(KARTE_INFO))) as Protokoll;
    expect(p.befehle.length).toBe(baueM4Befehle().length);
    expect(p.befehle.every((e) => e.tick === 0)).toBe(true);
    expect(p.ticks).toBe(12 * MIN);
    expect(spieleAb(baueM4Karte(), p).pruefsumme()).toBe(mit.sim.pruefsumme());
  });
});
