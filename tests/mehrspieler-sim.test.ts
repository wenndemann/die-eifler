// M6: Simulation mit mehreren Dörfern (Drehbuch 2.3, 8.3) und Spielstand (Speichern, Laden, Wiederbeitritt).
import { describe, expect, it } from 'vitest';
import { spieleAb } from '../src/sim/replay';
import { Simulation } from '../src/sim/sim';
import type { Befehl } from '../src/sim/typen';
import { baueSzenario30, baueTestKarte, gerade, KARTE_INFO } from './sim-szenario';

const A = { q: 0, r: 0 }, B = { q: -6, r: 0 };

function zwei(saat = 7) { return new Simulation(baueTestKarte(), saat, [A, B]); }
function tu(sim: Simulation, sp: number, b: Befehl) { sim.befehl(sim.tick, sp, b); }
function lauf(sim: Simulation, n: number) { for (let i = 0; i < n; i++) sim.schritt(); }

/** Beide bauen einen Holzfäller mit Weg; Spieler 0 nach Osten, Spieler 1 nach Norden. */
function aufbau(sim: Simulation) {
  tu(sim, 0, { art: 'gebaeude', typ: 'holzfaeller', q: 9, r: 0 });
  tu(sim, 0, { art: 'weg', pfad: gerade(0, 0, 0, 9) });
  tu(sim, 1, { art: 'gebaeude', typ: 'holzfaeller', q: -6, r: -3 });
  tu(sim, 1, { art: 'weg', pfad: gerade(-6, 0, 2, 3) });
}

describe('Mehrspieler-Simulation', () => {
  it('zwei Dörfer mit eigenem Lager, eigenen Bewohnern und Bauleuten', () => {
    const sim = zwei();
    expect(sim.spielerZahl).toBe(2);
    const s0 = sim.sicht(0), s1 = sim.sicht(1);
    const lager = s0.gebaeude.filter((g) => g.typ === 'lager');
    expect(lager.map((g) => [g.sp, g.q, g.r])).toEqual([[0, 0, 0], [1, -6, 0]]);
    expect(s0.dorf.bewohner).toBe(10);
    expect(s1.dorf.bewohner).toBe(10);
    expect(s1.ich).toBe(1);
    expect(s0.spieler.map(({ stufe, bewohner, festPunkte, verwalter }) => ({ stufe, bewohner, festPunkte, verwalter }))).toEqual([{ stufe: 0, bewohner: 10, festPunkte: 0, verwalter: false }, { stufe: 0, bewohner: 10, festPunkte: 0, verwalter: false }]);
    // M10: beide haben eigenes Gebiet, niemand hat Orte oder den Königstitel
    expect(s0.spieler.every((p) => p.hexe > 0 && p.orte === 0 && !p.koenig && p.punkte > 0)).toBe(true);
    expect(() => sim.sicht(2)).toThrow();
    expect(sim.pruefeInnenzustand()).toEqual([]);
  });

  it('beide Wirtschaften laufen getrennt: Träger und Waren bleiben im eigenen Netz', () => {
    const sim = zwei();
    aufbau(sim);
    lauf(sim, 4000);
    const s = sim.sicht(0);
    for (const sp of [0, 1]) {
      const h = s.gebaeude.find((g) => g.sp === sp && g.typ === 'holzfaeller')!;
      expect(h.bau).toBe(1000);
      expect(h.getrennt).toBe(false);
      const l = s.gebaeude.find((g) => g.sp === sp && g.typ === 'lager')!;
      expect(l.vorrat![1] + l.vorrat![0]).toBeGreaterThan(0);
    }
    // jeder Träger läuft auf einem Segment seines Spielers
    const segSp = new Map(s.segmente.map((x) => [x.id, x.sp]));
    for (const t of s.traeger) expect(s.segmente.find((x) => x.traeger === t.id)?.sp).toBe(t.sp);
    expect(segSp.size).toBe(2);
    expect(sim.sicht(0).dorf.traeger).toBe(1);
    expect(sim.sicht(1).dorf.traeger).toBe(1);
    expect(sim.pruefeInnenzustand()).toEqual([]);
  });

  it('fremde Fahnen, Wege und Gebäude sind tabu', () => {
    const sim = zwei();
    aufbau(sim);
    lauf(sim, 2);
    const s = sim.sicht(0);
    const fremdeFahne = s.fahnen.find((f) => f.sp === 0 && f.q === 9)!;
    const fremdesGeb = s.gebaeude.find((g) => g.sp === 0 && g.typ === 'holzfaeller')!;
    const fremderWeg = s.segmente.find((x) => x.sp === 0)!;
    // Abfragen für Spieler 1
    expect(sim.kannFahne(4, 0, 1)).toBe(false); // auf dem Weg von Spieler 0
    expect(sim.kannFahne(4, 0, 0)).toBe(true);
    expect(sim.wegVorschau({ q: 9, r: 0 }, { q: 9, r: 3 }, 1)).toBeNull(); // von fremder Fahne
    expect(sim.wegVorschau({ q: -6, r: 0 }, { q: 0, r: 0 }, 1)).toBeNull(); // in fremdes Lager
    expect(sim.wegVorschau({ q: -6, r: 0 }, { q: -6, r: 4 }, 1)).not.toBeNull();
    const vor = sim.pruefsumme();
    tu(sim, 1, { art: 'fahne', q: 4, r: 0 });
    tu(sim, 1, { art: 'weg', pfad: gerade(-6, 0, 0, 6) });
    tu(sim, 1, { art: 'weg', pfad: gerade(9, 0, 5, 3) });
    tu(sim, 1, { art: 'abriss_gebaeude', id: fremdesGeb.id });
    tu(sim, 1, { art: 'abriss_fahne', id: fremdeFahne.id });
    tu(sim, 1, { art: 'abriss_weg', id: fremderWeg.id });
    tu(sim, 1, { art: 'prioritaet', id: fremdesGeb.id, stufe: 3 });
    tu(sim, 5, { art: 'fahne', q: -6, r: 5 }); // unbekannter Spieler
    lauf(sim, 1);
    const n = sim.sicht(0);
    expect(n.fahnen.length).toBe(s.fahnen.length);
    expect(n.segmente.length).toBe(s.segmente.length);
    expect(n.gebaeude.find((g) => g.id === fremdesGeb.id)!.prioritaet).toBe(2);
    expect(vor).not.toBe(sim.pruefsumme()); // die Zeit lief weiter
    expect(sim.pruefeInnenzustand()).toEqual([]);
  });

  it('Dorfstufe, einmalige Gebäude und Ereignisse gelten je Dorf', () => {
    const sim = zwei();
    tu(sim, 0, { art: 'gebaeude', typ: 'kirmesplatz', q: 3, r: 3 });
    lauf(sim, 1);
    expect(sim.sperrGrund('kirmesplatz', 0)).toBe('einmalig');
    expect(sim.sperrGrund('kirmesplatz', 1)).toBe('');
    expect(sim.kannBauen('kirmesplatz', -9, 3, 1)).toBe(true);
    tu(sim, 0, { art: 'gebaeude', typ: 'holzfaeller', q: 9, r: 0 });
    tu(sim, 0, { art: 'weg', pfad: gerade(0, 0, 0, 9) });
    lauf(sim, 3000);
    expect(sim.sicht(0).ereignisse.some((e) => e.art === 'fertig')).toBe(true);
    expect(sim.sicht(1).ereignisse).toEqual([]);
  });

  it('Verwalter: Dorf läuft weiter, neue Bau- und Abrissbefehle werden verworfen', () => {
    const sim = zwei();
    aufbau(sim);
    tu(sim, 0, { art: 'verwalter', spieler: 1, an: true });
    lauf(sim, 1);
    expect(sim.sicht(0).spieler[1].verwalter).toBe(true);
    tu(sim, 1, { art: 'gebaeude', typ: 'wohnhaus', q: -9, r: 3 });
    lauf(sim, 3000);
    const s = sim.sicht(1);
    expect(s.gebaeude.some((g) => g.typ === 'wohnhaus')).toBe(false);
    expect(s.gebaeude.find((g) => g.sp === 1 && g.typ === 'holzfaeller')!.bau).toBe(1000);
    tu(sim, 0, { art: 'verwalter', spieler: 1, an: false });
    tu(sim, 1, { art: 'gebaeude', typ: 'wohnhaus', q: -9, r: 3 });
    lauf(sim, 1);
    expect(sim.sicht(1).spieler[1].verwalter).toBe(false);
    expect(sim.sicht(1).gebaeude.some((g) => g.sp === 1 && g.typ === 'wohnhaus')).toBe(true);
  });

  it('Protokoll mit Mitspielern spielt sich gleich ab', () => {
    const sim = zwei(11);
    aufbau(sim);
    lauf(sim, 1500);
    const p = JSON.parse(JSON.stringify(sim.protokoll(KARTE_INFO)));
    expect(p.mitspieler).toEqual([B]);
    expect(spieleAb(baueTestKarte(), p).pruefsumme()).toBe(sim.pruefsumme());
  });

  it('Einzelspiel: ein Start als Objekt oder als Liste ist dasselbe, das Protokoll bleibt ohne Mitspieler', () => {
    const a = new Simulation(baueTestKarte(), 3, A), b = new Simulation(baueTestKarte(), 3, [A]);
    lauf(a, 200); lauf(b, 200);
    expect(a.pruefsumme()).toBe(b.pruefsumme());
    expect(a.protokoll(KARTE_INFO).mitspieler).toBeUndefined();
  });

  it('ungültige Starts werden abgelehnt', () => {
    expect(() => new Simulation(baueTestKarte(), 1, [A, A])).toThrow();
    expect(() => new Simulation(baueTestKarte(), 1, [A, { q: -15, r: 8 }])).toThrow(); // Teich
    expect(() => new Simulation(baueTestKarte(), 1, [])).toThrow();
  });
});

describe('Spielstand', () => {
  it('Speichern und Laden mitten im Spiel: gleiche Prüfsumme, gleicher Fortgang (auch über JSON)', () => {
    const sim = zwei(5);
    aufbau(sim);
    tu(sim, 1, { art: 'gebaeude', typ: 'foerster', q: -9, r: -2 });
    lauf(sim, 2500);
    // noch ausstehende Befehle gehören mit in den Stand
    sim.befehl(sim.tick + 30, 0, { art: 'gebaeude', typ: 'wohnhaus', q: 3, r: 3 });
    const st = JSON.parse(JSON.stringify(sim.stand()));
    const b = Simulation.ausStand(baueTestKarte(), st);
    expect(b.tick).toBe(sim.tick);
    expect(b.pruefsumme()).toBe(sim.pruefsumme());
    expect(b.pruefeInnenzustand()).toEqual([]);
    for (let i = 0; i < 3000; i++) {
      sim.schritt(); b.schritt();
      if (i % 500 === 0) expect(b.pruefsumme()).toBe(sim.pruefsumme());
    }
    expect(b.pruefsumme()).toBe(sim.pruefsumme());
    expect(b.sicht(1)).toEqual(sim.sicht(1));
    expect(b.protokoll(KARTE_INFO)).toEqual(sim.protokoll(KARTE_INFO));
  });

  it('Spielstand des 30-Segment-Szenarios (Einzelspiel)', () => {
    const { karte, protokoll } = baueSzenario30();
    // spieleAb reiht alle Befehle ein; die nach der Hälfte stehen im Stand als ausstehend
    const halb = spieleAb(karte, { ...protokoll, ticks: Math.floor(protokoll.ticks / 2) });
    const d = Simulation.ausStand(karte, halb.stand());
    while (d.tick < protokoll.ticks) d.schritt();
    const c = spieleAb(karte, protokoll);
    expect(d.pruefsumme()).toBe(c.pruefsumme());
  });

  it('der Stand verändert die laufende Simulation nicht und passt nur zur eigenen Karte', () => {
    const sim = zwei();
    aufbau(sim);
    lauf(sim, 100);
    const st = sim.stand();
    const vor = sim.pruefsumme();
    (st.fahnen[0] as { h: number }).h = -1;
    expect(sim.pruefsumme()).toBe(vor);
    const klein = { ...baueTestKarte(), n: 10 };
    expect(() => Simulation.ausStand({ ...klein, terrain: klein.terrain.slice(0, 331), height: klein.height.slice(0, 331), slope: klein.slope.slice(0, 331), build: klein.build.slice(0, 331), flags: klein.flags.slice(0, 331), place: klein.place.slice(0, 331) }, sim.stand())).toThrow();
  });
});
