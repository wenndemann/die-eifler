import { describe, expect, it } from 'vitest';
import { spieleAb } from '../src/sim/replay';
import { Simulation } from '../src/sim/sim';
import { SimKarte } from '../src/sim/karte';
import { FLAG_CAP } from '../src/sim/daten';
import type { Befehl, Protokoll } from '../src/sim/typen';
import { baueSzenario30, baueTestKarte, gerade, KARTE_INFO, knoten } from './sim-szenario';

const START = { q: 0, r: 0 };

function neu(saat = 1, start = START) { return new Simulation(baueTestKarte(), saat, start); }
function tu(sim: Simulation, b: Befehl) { sim.befehl(sim.tick, 0, b); }
function lauf(sim: Simulation, n: number) { for (let i = 0; i < n; i++) sim.schritt(); }
function segZwischen(sim: Simulation, a: { q: number; r: number }, b: { q: number; r: number }) {
  return sim.sicht().segmente.find((s) => {
    const p = s.pfad[0], l = s.pfad[s.pfad.length - 1];
    return (p.q === a.q && p.r === a.r && l.q === b.q && l.r === b.r) || (p.q === b.q && p.r === b.r && l.q === a.q && l.r === a.r);
  });
}
const fahneBei = (sim: Simulation, p: { q: number; r: number }) => sim.sicht().fahnen.find((f) => f.q === p.q && f.r === p.r)!;

describe('Karte', () => {
  it('Begehbarkeit und Bauplatz', () => {
    const d = baueTestKarte();
    const k = new SimKarte(d);
    expect(k.begehbar[k.index(-15, 8)]).toBe(0);
    expect(k.begehbar[k.index(8, -10)]).toBe(1);
    expect(k.bebaubar[k.index(8, -10)]).toBe(0);
    expect(k.bebaubar[k.index(0, 18)]).toBe(0);
    expect(k.bebaubar[k.index(0, 0)]).toBe(3);
    expect(k.index(100, 0)).toBe(-1);
  });
  it('Steigung: bergauf teurer als bergab', () => {
    const k = new SimKarte(baueTestKarte());
    const a = k.index(8, 0), b = k.index(12, 0);
    const hin = k.pfadKosten([a, k.index(9, 0), k.index(10, 0), k.index(11, 0), b]);
    const zurueck = k.pfadKosten([b, k.index(11, 0), k.index(10, 0), k.index(9, 0), a]);
    expect(hin).toBeGreaterThan(zurueck);
    expect(zurueck).toBeGreaterThanOrEqual(4 * 24);
  });
  it('Wegsuche meidet den Hang, wenn ein Umweg billiger ist', () => {
    const sim = neu();
    // gleich weit, aber der Weg bergauf kostet mehr: Suche liefert nur begehbare, freie Hexe
    tu(sim, { art: 'gebaeude', typ: 'holzfaeller', q: 3, r: 0 });
    lauf(sim, 1);
    const p = sim.wegVorschau({ q: 0, r: 0 }, { q: 6, r: 0 })!;
    expect(p).not.toBeNull();
    expect(p[0]).toEqual({ q: 0, r: 0 });
    expect(p[p.length - 1]).toEqual({ q: 6, r: 0 });
    expect(p.some((h) => h.q === 3 && h.r === 0)).toBe(false);
    expect(sim.wegVorschau({ q: 0, r: 0 }, { q: -15, r: 8 })).toBeNull();
  });
});

describe('Netz und Bau', () => {
  it('Gebäude, Weg, Teilung', () => {
    const sim = neu();
    tu(sim, { art: 'gebaeude', typ: 'holzfaeller', q: 4, r: 0 });
    tu(sim, { art: 'weg', pfad: gerade(0, 0, 0, 4) });
    lauf(sim, 1);
    let s = sim.sicht();
    expect(s.segmente.length).toBe(1);
    expect(s.gebaeude.length).toBe(2);
    lauf(sim, 200);
    expect(sim.sicht().segmente[0].traeger).toBeGreaterThan(0);
    expect(sim.kannFahne(2, 0)).toBe(true);
    expect(sim.kannFahne(0, 0)).toBe(false);
    const traegerAlt = s.segmente[0].traeger;
    tu(sim, { art: 'fahne', q: 2, r: 0 });
    lauf(sim, 1);
    s = sim.sicht();
    expect(s.segmente.length).toBe(2);
    expect(s.segmente.map((x) => x.pfad.length).sort()).toEqual([3, 3]);
    expect(s.segmente.filter((x) => x.traeger === traegerAlt).length).toBe(1);
    lauf(sim, 300);
    expect(sim.sicht().segmente.every((x) => x.traeger > 0)).toBe(true);
    expect(sim.pruefeInnenzustand()).toEqual([]);
  });
  it('Bauregeln: Abstand, Größe, Wasser, Fahne', () => {
    const sim = neu();
    expect(sim.kannBauen('holzfaeller', 1, 0)).toBe(false); // neben dem Lager
    expect(sim.kannBauen('holzfaeller', 2, 0)).toBe(true);
    expect(sim.kannBauen('holzfaeller', -15, 8)).toBe(false);
    expect(sim.kannBauen('holzfaeller', 12, 0)).toBe(true); // klein am Hang
    expect(sim.kannBauen('saegewerk', 12, 0)).toBe(false); // mittel nicht
    expect(sim.kannBauen('lager', 4, 4)).toBe(false);
    expect(sim.kannBauen('holzfaeller', 0, 0)).toBe(false);
  });
  it('höchstens 6 Segmente je Fahne, ungültige Wege wirkungslos', () => {
    const sim = neu();
    for (let d = 0; d < 6; d++) tu(sim, { art: 'weg', pfad: gerade(0, 0, d, 2) });
    tu(sim, { art: 'weg', pfad: gerade(0, 0, 0, 3) });
    lauf(sim, 1);
    expect(sim.sicht().segmente.length).toBe(6);
    expect(sim.sicht().fahnen.find((f) => f.q === 0 && f.r === 0)).toBeDefined();
  });
  it('Befehl für vergangenen Tick wirft', () => {
    const sim = neu();
    lauf(sim, 3);
    expect(() => sim.befehl(2, 0, { art: 'fahne', q: 1, r: 1 })).toThrow();
  });
});

describe('Warenfluss', () => {
  it('Holzfäller liefert Stamm ins Lager, Wohnhaus wird aus dem Lager versorgt', () => {
    const sim = neu();
    tu(sim, { art: 'gebaeude', typ: 'holzfaeller', q: 6, r: 0 });
    tu(sim, { art: 'gebaeude', typ: 'wohnhaus', q: 0, r: 3 });
    tu(sim, { art: 'weg', pfad: gerade(0, 0, 0, 6) });
    tu(sim, { art: 'weg', pfad: gerade(0, 0, 5, 3) });
    lauf(sim, 1500);
    const s = sim.sicht();
    expect(s.gebaeude.every((g) => !g.getrennt)).toBe(true);
    expect(s.gebaeude.find((g) => g.typ === 'lager')!.vorrat![0]).toBeGreaterThan(0);
    expect(sim.statistik().verbraucht).toBeGreaterThan(0);
    expect(sim.pruefeInnenzustand()).toEqual([]);
  });
  it('Gebäude ohne Verbindung ist getrennt und liefert nichts', () => {
    const sim = neu();
    tu(sim, { art: 'gebaeude', typ: 'holzfaeller', q: 6, r: 0 });
    lauf(sim, 1500);
    const g = sim.sicht().gebaeude.find((x) => x.typ === 'holzfaeller')!;
    expect(g.getrennt).toBe(true);
    expect(sim.statistik().erzeugt).toBe(0);
  });
  it('Verklemmung: zwei volle Fahnen füreinander lösen sich durch Tausch', () => {
    const sim = neu(1, { q: -6, r: 0 });
    const a = { q: -6, r: 0 }, b = { q: 0, r: 0 };
    // zweites Lager an B (nur über die Innenfunktion, kein Spieler-Befehl)
    const intern = sim as any;
    const lb = intern.gebaeudeErzeugen('lager', intern.karte.index(b.q, b.r), true);
    tu(sim, { art: 'weg', pfad: gerade(a.q, a.r, 0, 6) });
    lauf(sim, 400);
    const la = [...intern.gebaeude.values()].find((g: any) => g.typ === 'lager' && g.id !== lb.id);
    const fa = intern.fahnen.get(la.fahne), fb = intern.fahnen.get(lb.fahne);
    for (let i = 0; i < FLAG_CAP; i++) {
      fa.waren.push({ art: 1, ziel: lb.id }); lb.incoming[1]++;
      fb.waren.push({ art: 2, ziel: la.id }); la.incoming[2]++;
    }
    const vor = [la.vorrat[2], lb.vorrat[1]];
    lauf(sim, 3000);
    expect(fa.waren.length).toBe(0);
    expect(fb.waren.length).toBe(0);
    expect(la.vorrat[2]).toBe(vor[0] + FLAG_CAP);
    expect(lb.vorrat[1]).toBe(vor[1] + FLAG_CAP);
    expect(sim.pruefeInnenzustand()).toEqual([]);
  });
  it('Ringnetz: Waren nehmen den kürzesten Weg, ohne Kreisfahrt', () => {
    const sim = neu();
    // Ring um (0,0): Lager L=(0,0); R1=(3,0) R2=(3,3)... Ring mit 6 Knoten, Holzfäller gegenüber, Abkürzung ist die kurze Seite.
    const L = { q: 0, r: 0 }, A = { q: 3, r: 0 }, B = { q: 6, r: 0 }, C = { q: 6, r: 3 }, D = { q: 3, r: 3 }, E = { q: 0, r: 3 };
    tu(sim, { art: 'gebaeude', typ: 'holzfaeller', ...C });
    for (const p of [A, B, D, E]) tu(sim, { art: 'fahne', ...p });
    const w = (p: { q: number; r: number }, d: number) => tu(sim, { art: 'weg', pfad: gerade(p.q, p.r, d, 3) });
    w(L, 0); w(A, 0); w(B, 5); // L-A-B-C (lang: 9 Schritte)
    w(L, 5); w(E, 0); w(D, 0); // L-E-D-C (lang: 9 Schritte)
    w(A, 5);                   // Abkürzung A-D
    lauf(sim, 1);
    expect(sim.sicht().segmente.length).toBe(7);
    // kürzester Weg C→L: C-D-A-L oder C-B-A-L (je 9 Schritte) bzw. C-D-E-L (9); alle gleich lang -> Abkürzung zählt nicht. Prüfe: keine Fahne zweimal.
    const besucht: number[] = [];
    let ankunft = 0;
    for (let i = 0; i < 1500; i++) {
      sim.schritt();
      const s = sim.sicht();
      if (s.fahnen.some((f) => f.waren.includes(0)) || s.traeger.some((t) => t.ware === 0)) {
        const f = s.fahnen.find((x) => x.waren.includes(0));
        if (f && besucht[besucht.length - 1] !== f.id && !(besucht.length && f.id === besucht[0])) besucht.push(f.id);
      }
      if (s.gebaeude.find((g) => g.typ === 'lager')!.vorrat![0] > 0 && !ankunft) ankunft = i;
    }
    expect(ankunft).toBeGreaterThan(0);
    // keine Kreisfahrt: jede Fahne höchstens einmal je Ware – erste Ware: Folge bis zur Ankunft
    const erste = besucht.slice(0, besucht.indexOf(fahneBei(sim, L).id) + 1 || besucht.length);
    expect(new Set(erste).size).toBe(erste.length);
    expect(erste.length).toBeLessThanOrEqual(4);
    expect(sim.pruefeInnenzustand()).toEqual([]);
  });
  it('Ring mit echter Abkürzung: Ware nimmt den kurzen Weg', () => {
    const sim = neu();
    const L = { q: 0, r: 0 }, A = { q: 3, r: 0 }, B = { q: 6, r: 0 }, C = { q: 9, r: 0 };
    const U1 = { q: 0, r: 3 }, U2 = { q: 3, r: 6 }, U3 = { q: 6, r: 6 };
    tu(sim, { art: 'gebaeude', typ: 'holzfaeller', ...C });
    for (const p of [A, B, U1, U2, U3]) tu(sim, { art: 'fahne', ...p });
    const w = (p: { q: number; r: number }, d: number, n = 3) => tu(sim, { art: 'weg', pfad: gerade(p.q, p.r, d, n) });
    w(L, 0); w(A, 0); w(B, 0);        // kurze Seite L-A-B-C
    w(L, 5); w(U1, 5); w(U1, 0);      // lange Seite beginnt: L-U1 ...
    w(U2, 0); w(B, 5);                // U2-U3, B-U3? (B=(6,0) +3*(0,1)=(6,3), kein Knoten)
    lauf(sim, 1);
    const s0 = sim.sicht();
    expect(s0.segmente.length).toBeGreaterThanOrEqual(5);
    const kurz = [fahneBei(sim, C).id, fahneBei(sim, B).id, fahneBei(sim, A).id, fahneBei(sim, L).id];
    const folge: number[] = [];
    for (let i = 0; i < 1500; i++) {
      sim.schritt();
      const f = sim.sicht().fahnen.find((x) => x.waren.includes(0));
      if (f && folge[folge.length - 1] !== f.id && !(folge.length && f.id === folge[0])) folge.push(f.id);
      if (sim.sicht().gebaeude.find((g) => g.typ === 'lager')!.vorrat![0] > 0) break;
    }
    expect(folge.slice(0, 4)).toEqual(kurz);
  });
  it('Abriss mitten im Transport: keine Ausnahme, Reservierungen stimmen, Waren werden neu geroutet', () => {
    const sim = neu();
    tu(sim, { art: 'gebaeude', typ: 'holzfaeller', q: 9, r: 0 });
    tu(sim, { art: 'gebaeude', typ: 'steinbruch', q: 9, r: 3 });
    tu(sim, { art: 'gebaeude', typ: 'saegewerk', q: 3, r: 3 });
    tu(sim, { art: 'gebaeude', typ: 'wohnhaus', q: 0, r: 6 });
    for (const p of [{ q: 3, r: 0 }, { q: 6, r: 0 }, { q: 6, r: 3 }, { q: 0, r: 3 }]) tu(sim, { art: 'fahne', ...p });
    const w = (p: { q: number; r: number }, d: number) => tu(sim, { art: 'weg', pfad: gerade(p.q, p.r, d, 3) });
    w({ q: 0, r: 0 }, 0); w({ q: 3, r: 0 }, 0); w({ q: 6, r: 0 }, 0);
    w({ q: 6, r: 3 }, 0); w({ q: 6, r: 0 }, 5); w({ q: 3, r: 0 }, 5); w({ q: 0, r: 0 }, 5); w({ q: 0, r: 3 }, 5);
    w({ q: 0, r: 3 }, 0); w({ q: 9, r: 0 }, 5);
    lauf(sim, 1);
    expect(sim.pruefeInnenzustand()).toEqual([]);
    let abrisse = 0;
    for (let i = 0; i < 6000; i++) {
      sim.schritt();
      if (i % 150 === 149) {
        const s = sim.sicht();
        const tragend = s.traeger.filter((t) => t.ware >= 0);
        if (tragend.length && abrisse < 6) {
          const t = tragend[0];
          const seg = s.segmente.find((x) => x.traeger === t.id)!;
          if (abrisse % 2 === 0) sim.befehl(sim.tick, 0, { art: 'abriss_weg', id: seg.id });
          else sim.befehl(sim.tick, 0, { art: 'abriss_fahne', id: s.fahnen.find((f) => f.gebaeude === 0 && f.q === seg.pfad[0].q && f.r === seg.pfad[0].r)?.id ?? 999999 });
          abrisse++;
          sim.befehl(sim.tick + 1, 0, { art: 'weg', pfad: seg.pfad });
        }
        if (i % 600 === 599) {
          const g = s.gebaeude.find((x) => x.typ === 'saegewerk');
          if (g) sim.befehl(sim.tick, 0, { art: 'abriss_gebaeude', id: g.id });
          else sim.befehl(sim.tick, 0, { art: 'gebaeude', typ: 'saegewerk', q: 3, r: 3 });
        }
      }
      const f = sim.pruefeInnenzustand().filter((x) => !x.includes('ungültigem Ziel'));
      expect(f).toEqual([]);
    }
    expect(abrisse).toBeGreaterThan(0);
  });
});

describe('Determinismus', () => {
  it('gleiches Protokoll gibt nach jedem Tick dieselbe Prüfsumme; Replay stimmt; Saat und Befehl ändern sie', () => {
    const { karte, protokoll } = baueSzenario30();
    const a = new Simulation(karte, protokoll.saat, protokoll.start);
    const b = new Simulation(karte, protokoll.saat, protokoll.start);
    for (const e of protokoll.befehle) { a.befehl(e.tick, e.spieler, e.befehl); b.befehl(e.tick, e.spieler, e.befehl); }
    const sums: string[] = [];
    for (let i = 0; i < 2000; i++) {
      a.schritt(); b.schritt();
      expect(a.pruefsumme()).toBe(b.pruefsumme());
      sums.push(a.pruefsumme());
    }
    const p = JSON.parse(JSON.stringify(a.protokoll(KARTE_INFO))) as Protokoll;
    expect(p.ticks).toBe(2000);
    expect(spieleAb(karte, p).pruefsumme()).toBe(sums[1999]);

    const c = new Simulation(karte, protokoll.saat + 1, protokoll.start);
    for (const e of protokoll.befehle) c.befehl(e.tick, e.spieler, e.befehl);
    lauf(c, 2000);
    expect(c.pruefsumme()).not.toBe(sums[1999]);

    const d = new Simulation(karte, protokoll.saat, protokoll.start);
    for (const e of protokoll.befehle) d.befehl(e.tick, e.spieler, e.befehl);
    d.befehl(1500, 0, { art: 'fahne', q: knoten(0, 0).q + 2, r: knoten(0, 0).r });
    lauf(d, 2000);
    expect(d.pruefsumme()).not.toBe(sums[1999]);
  });
  it('Sicht ist eine Kopie', () => {
    const sim = neu();
    const s = sim.sicht();
    s.gebaeude[0].vorrat![1] = 999;
    s.fahnen.push({ id: 5, q: 0, r: 0, waren: [], gebaeude: 0 });
    expect(sim.sicht().gebaeude[0].vorrat![1]).toBe(12);
    expect(sim.sicht().fahnen.length).toBe(1);
  });
});

describe('Abnahme: 30 Segmente, 10 Spielminuten', () => {
  it('keine Verklemmung, stabile Prüfsumme, Rechenzeit', () => {
    const { karte, protokoll } = baueSzenario30();
    const lauf1 = () => {
      const sim = new Simulation(karte, protokoll.saat, protokoll.start);
      for (const e of protokoll.befehle) sim.befehl(e.tick, e.spieler, e.befehl);
      const proMinute: number[] = [];
      let letzte = 0;
      const t0 = performance.now();
      for (let i = 0; i < protokoll.ticks; i++) {
        sim.schritt();
        if ((i + 1) % 1200 === 0) { const a = sim.statistik().angekommen; proMinute.push(a - letzte); letzte = a; }
      }
      return { sim, proMinute, ms: performance.now() - t0 };
    };
    const x = lauf1();
    const s = x.sim.sicht();
    expect(s.segmente.length).toBeGreaterThanOrEqual(30);
    console.log(`Rechenzeit: ${x.ms.toFixed(0)} ms für 12000 Ticks = ${(x.ms / 12000).toFixed(3)} ms je Tick; Ankünfte je Minute: ${x.proMinute.join(',')}; längste Wartezeit mit Ware: ${(x.sim.statistik().maxWarte / 20).toFixed(1)} s; Träger ${s.traeger.length}, Waren auf Fahnen ${s.fahnen.reduce((n, f) => n + f.waren.length, 0)}`);
    for (const n of x.proMinute) expect(n).toBeGreaterThan(0);
    expect(x.sim.statistik().maxWarte).toBeLessThanOrEqual(60 * 20);
    expect(s.segmente.every((g) => g.traeger > 0)).toBe(true);
    expect(x.sim.pruefeInnenzustand().filter((f) => !f.includes('ungültigem Ziel'))).toEqual([]);
    expect(Math.max(...s.fahnen.map((f) => f.waren.length))).toBeLessThanOrEqual(FLAG_CAP + 2);
    const y = lauf1();
    expect(y.sim.pruefsumme()).toBe(x.sim.pruefsumme());
    expect(x.ms).toBeLessThan(20000);
  }, 60000);
});
