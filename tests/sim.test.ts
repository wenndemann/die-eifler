import { describe, expect, it } from 'vitest';
import { spieleAb } from '../src/sim/replay';
import { Simulation } from '../src/sim/sim';
import { SimKarte } from '../src/sim/karte';
import { BAUM_WACHSEN, FLAG_CAP, FELS_STEIL, FELS_STEIN, START_VORRAT, TREE_MAX, WARE } from '../src/sim/daten';
import type { Befehl, Protokoll } from '../src/sim/typen';
import { baueSzenario30, baueTestKarte, gerade, KARTE_INFO, knoten } from './sim-szenario';

const START = { q: 0, r: 0 };

function neu(saat = 1, start = START, karte = baueTestKarte()) { return new Simulation(karte, saat, start); }
function tu(sim: Simulation, b: Befehl) { sim.befehl(sim.tick, 0, b); }
function lauf(sim: Simulation, n: number) { for (let i = 0; i < n; i++) sim.schritt(); }
function segZwischen(sim: Simulation, a: { q: number; r: number }, b: { q: number; r: number }) {
  return sim.sicht().segmente.find((s) => {
    const p = s.pfad[0], l = s.pfad[s.pfad.length - 1];
    return (p.q === a.q && p.r === a.r && l.q === b.q && l.r === b.r) || (p.q === b.q && p.r === b.r && l.q === a.q && l.r === a.r);
  });
}
/** Kahle Testkarte mit Wald (3 Bäume je Hex) im Radius 2 um die Zentren. */
function karteMitWald(zentren: { q: number; r: number }[]) {
  const d = baueTestKarte(false), k = new SimKarte(d);
  for (const z of zentren) {
    for (let dq = -2; dq <= 2; dq++) for (let dr = -2; dr <= 2; dr++) {
      if ((dq === 0 && dr === 0) || Math.abs(dq + dr) > 2) continue;
      const i = k.index(z.q + dq, z.r + dr);
      if (i >= 0) d.terrain[i] = 2;
    }
  }
  return d;
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
  it('Holzfäller liefert Stamm ins Lager, die Hütte wird aus dem Lager gebaut', () => {
    const sim = neu();
    tu(sim, { art: 'gebaeude', typ: 'holzfaeller', q: 9, r: 0 });
    tu(sim, { art: 'gebaeude', typ: 'huette', q: 0, r: 3 });
    tu(sim, { art: 'weg', pfad: gerade(0, 0, 0, 9) });
    tu(sim, { art: 'weg', pfad: gerade(0, 0, 5, 3) });
    lauf(sim, 3000);
    const s = sim.sicht();
    expect(s.gebaeude.every((g) => !g.getrennt)).toBe(true);
    expect(s.gebaeude.every((g) => g.bau === 1000)).toBe(true);
    expect(s.gebaeude.find((g) => g.typ === 'lager')!.vorrat![WARE.stamm]).toBeGreaterThan(0);
    expect(sim.statistik().verbaut).toBe(5 + 2);
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
    const sim = neu(1, START, karteMitWald([{ q: 6, r: 3 }]));
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
    for (let i = 0; i < 4000; i++) {
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
    for (let i = 0; i < 4000; i++) {
      sim.schritt();
      const f = sim.sicht().fahnen.find((x) => x.waren.includes(0));
      if (f && folge[folge.length - 1] !== f.id && !(folge.length && f.id === folge[0])) folge.push(f.id);
      if (sim.sicht().gebaeude.find((g) => g.typ === 'lager')!.vorrat![0] > 0) break;
    }
    // Auf der Fahne des Holzfällers wird der Stamm manchmal im selben Tick abgeholt; die übrige Folge muss stimmen
    expect(folge.filter((id) => id !== kurz[0]).slice(0, 3)).toEqual(kurz.slice(1));
  });
  it('Abriss mitten im Transport: keine Ausnahme, Reservierungen stimmen, Waren werden neu geroutet', () => {
    const sim = neu();
    tu(sim, { art: 'gebaeude', typ: 'holzfaeller', q: 9, r: 0 });
    tu(sim, { art: 'gebaeude', typ: 'steinbruch', q: 9, r: 3 });
    tu(sim, { art: 'gebaeude', typ: 'saegewerk', q: 3, r: 3 });
    tu(sim, { art: 'gebaeude', typ: 'huette', q: 0, r: 6 });
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

const lagerVorrat = (sim: Simulation) => sim.sicht().gebaeude.find((g) => g.typ === 'lager')!.vorrat!;
const summe = (a: ArrayLike<number>) => { let n = 0; for (let i = 0; i < a.length; i++) n += a[i]; return n; };
/** Weg von der Fahne `von` zum Gebäude/Hex `nach` über die Wegsuche der Sim. */
function verbinde(sim: Simulation, von: { q: number; r: number }, nach: { q: number; r: number }) {
  const p = sim.wegVorschau(von, nach);
  if (!p) throw new Error(`kein Weg ${von.q},${von.r} → ${nach.q},${nach.r}`);
  tu(sim, { art: 'weg', pfad: p });
}
function hexeImRadius(sim: Simulation, mitte: { q: number; r: number }, radius: number): number[] {
  const k = sim.karte, aus: number[] = [];
  for (let i = 0; i < k.count; i++) if (k.abstand(i, k.index(mitte.q, mitte.r)) <= radius) aus.push(i);
  return aus;
}

describe('M4: Bauplatz, Kosten, Natur am Start', () => {
  it('Bauplatz-Größe und Kosten', () => {
    const sim = neu();
    expect(sim.bauplatzGroesse(0, 0)).toBe(0);   // Lager
    expect(sim.bauplatzGroesse(1, 0)).toBe(0);   // Nachbarregel
    expect(sim.bauplatzGroesse(2, 0)).toBe(3);
    expect(sim.bauplatzGroesse(12, 0)).toBe(1);  // Hang
    expect(sim.bauplatzGroesse(-15, 8)).toBe(0); // Wasser
    expect(sim.bauplatzGroesse(8, -10)).toBe(0); // Fels
    expect(sim.bauplatzGroesse(100, 0)).toBe(0); // außerhalb
    tu(sim, { art: 'gebaeude', typ: 'huette', q: 2, r: 0 });
    lauf(sim, 1);
    expect(sim.bauplatzGroesse(2, 0)).toBe(0);
    expect(sim.bauplatzGroesse(3, 0)).toBe(0);
    expect(sim.bauplatzGroesse(4, 0)).toBe(3);
    expect(sim.kosten('huette')[WARE.bretter]).toBe(3);
    expect(sim.kosten('huette')[WARE.stein]).toBe(2);
    expect(sim.kosten('saegewerk')).toEqual(sim.kosten('saegewerk').map((_, i) => (i === WARE.bretter ? 2 : i === WARE.stein ? 1 : 0)));
    expect(sim.kosten('nichts')).toEqual([]);
    expect(sim.kannBauen('constructor', 5, 5)).toBe(false);
  });
  it('Wald → 3 Bäume, Steinfeld → 12, steile Hexe → 4; Belegen räumt die Bäume', () => {
    const karte = karteMitWald([{ q: 9, r: 0 }]);
    const k = new SimKarte(karte);
    karte.terrain[k.index(-10, 4)] = 5;
    karte.slope[k.index(-10, -4)] = 25;
    karte.slope[k.index(-10, -5)] = 25; karte.terrain[k.index(-10, -5)] = 0; // Wasser bleibt ohne Fels
    const sim = neu(1, START, karte);
    const n = sim.sicht().natur;
    expect(n.baum[k.index(8, 0)]).toBe(TREE_MAX);
    expect(n.baum[k.index(9, 0)]).toBe(0);
    expect(summe(n.baum)).toBe(18 * TREE_MAX);
    expect(n.fels[k.index(-10, 4)]).toBe(FELS_STEIN);
    expect(n.fels[k.index(-10, -4)]).toBe(FELS_STEIL);
    expect(n.fels[k.index(-10, -5)]).toBe(0);
    expect(n.fels[k.index(0, 0)]).toBe(0);
    const rev = n.rev;
    expect(sim.sicht().natur).toBe(n); // unverändert: dieselbe Kopie
    tu(sim, { art: 'fahne', q: 8, r: 0 });
    lauf(sim, 1);
    const n2 = sim.sicht().natur;
    expect(n2.rev).toBeGreaterThan(rev);
    expect(n2.baum[k.index(8, 0)]).toBe(0);
    expect(n.baum[k.index(8, 0)]).toBe(TREE_MAX); // alte Kopie bleibt unverändert
    expect(sim.pruefeInnenzustand()).toEqual([]);
  });
  it('arbeitsHexe zählt Bäume, Felsen und Pflanzplätze im Radius', () => {
    const sim = neu();
    const b = sim.arbeitsHexe('holzfaeller', 9, 0);
    expect(b.art).toBe('baum');
    expect(b.summe).toBe(b.hexe.length * TREE_MAX);
    expect(b.hexe.length).toBeGreaterThanOrEqual(18);
    const f = sim.arbeitsHexe('steinbruch', 9, 3);
    expect(f.art).toBe('fels');
    expect(f.summe).toBe(f.hexe.length * FELS_STEIN);
    expect(f.hexe.length).toBeGreaterThanOrEqual(3);
    const p = sim.arbeitsHexe('foerster', -3, 0);
    expect(p.art).toBe('platz');
    expect(p.summe).toBe(p.hexe.length * TREE_MAX);
    expect(sim.arbeitsHexe('foerster', 9, 0).summe).toBeLessThan(p.summe); // im Wald nur noch die Ränder frei (Radius 4 reicht hinaus)
    expect(sim.arbeitsHexe('huette', 3, 0)).toEqual({ art: 'keine', hexe: [], summe: 0 });
    expect(sim.arbeitsHexe('holzfaeller', -3, 0).summe).toBeLessThan(b.summe);
  });
});

describe('M4: Baustellen', () => {
  it('Material kommt einzeln über das Netz, der Träger verbaut es, dann ist das Gebäude fertig', () => {
    const sim = neu();
    tu(sim, { art: 'gebaeude', typ: 'huette', q: 3, r: 0 });
    tu(sim, { art: 'weg', pfad: gerade(0, 0, 0, 3) });
    lauf(sim, 1);
    const vor = START_VORRAT;
    expect(sim.statistik().verbaut).toBe(0);
    expect(sim.sicht().gebaeude.find((g) => g.typ === 'huette')!.zustand).toMatch(/baustelle|wartet_material/);
    const stufen = new Set<number>();
    let letzte = 0, maxSprung = 0, fertigTick = -1;
    for (let i = 0; i < 3000 && fertigTick < 0; i++) {
      sim.schritt();
      const g = sim.sicht().gebaeude.find((x) => x.typ === 'huette')!;
      stufen.add(g.bau);
      maxSprung = Math.max(maxSprung, g.bau - letzte);
      letzte = g.bau;
      // Bedarf + verbaut = Kosten, solange Baustelle
      if (g.bau < 1000) {
        expect(g.bedarf![WARE.bretter]).toBeLessThanOrEqual(3);
        expect(g.bedarf!.reduce((a, b) => a + b, 0)).toBe(5 - Math.round((g.bau * 5) / 1000));
      }
      if (g.bau === 1000) fertigTick = i;
    }
    expect(fertigTick).toBeGreaterThan(0);
    expect(stufen.size).toBe(6);            // 0, 200, 400, 600, 800, 1000: fünf einzelne Lieferungen
    expect(maxSprung).toBe(200);
    expect(sim.statistik().verbaut).toBe(5);
    const g = sim.sicht().gebaeude.find((x) => x.typ === 'huette')!;
    expect(g.bedarf).toBeUndefined();
    expect(g.zustand).toBe('bereit');
    const nach = lagerVorrat(sim);
    expect(nach[WARE.bretter]).toBe(vor[WARE.bretter] - 3);
    expect(nach[WARE.stein]).toBe(vor[WARE.stein] - 2);
    expect(sim.pruefeInnenzustand()).toEqual([]);
  });
  it('Priorität bestimmt die Reihenfolge; ungültige Prioritäten sind wirkungslos', () => {
    const sim = neu();
    const lager = (sim as any).gebaeude.get(1);
    const vorrat = lager.vorrat.slice();
    lager.vorrat.fill(0); // erst nach den Prioritäten gibt es Material – und zwar nur für eine Hütte
    tu(sim, { art: 'gebaeude', typ: 'huette', q: 3, r: 0 });
    tu(sim, { art: 'gebaeude', typ: 'huette', q: -3, r: 0 });
    tu(sim, { art: 'weg', pfad: gerade(0, 0, 0, 3) });
    tu(sim, { art: 'weg', pfad: gerade(0, 0, 3, 3) });
    lauf(sim, 1);
    const ost = sim.sicht().gebaeude.find((g) => g.q === 3)!, west = sim.sicht().gebaeude.find((g) => g.q === -3)!;
    expect(ost.prioritaet).toBe(2);
    for (const stufe of [0, 4, 2.5, NaN]) tu(sim, { art: 'prioritaet', id: west.id, stufe });
    tu(sim, { art: 'prioritaet', id: 99999, stufe: 3 });
    tu(sim, { art: 'prioritaet', id: 1, stufe: 3 }); // Lager ist keine Baustelle
    lauf(sim, 1);
    expect(sim.sicht().gebaeude.find((g) => g.q === -3)!.prioritaet).toBe(2);
    expect(sim.sicht().gebaeude.find((g) => g.typ === 'lager')!.prioritaet).toBe(2);
    tu(sim, { art: 'prioritaet', id: west.id, stufe: 3 });
    tu(sim, { art: 'prioritaet', id: ost.id, stufe: 1 });
    lauf(sim, 1);
    expect(vorrat[WARE.bretter]).toBe(12);
    lager.vorrat[WARE.bretter] = 3; lager.vorrat[WARE.stein] = 2;
    lauf(sim, 3000);
    const s = sim.sicht();
    expect(s.gebaeude.find((g) => g.q === -3)!.bau).toBe(1000);
    expect(s.gebaeude.find((g) => g.q === 3)!.bau).toBe(0);
    expect(s.gebaeude.find((g) => g.q === 3)!.zustand).toBe('wartet_material');
    expect(sim.pruefeInnenzustand()).toEqual([]);
  });
  it('bei gleicher Priorität wird die ältere Baustelle (kleinere Id) zuerst beliefert', () => {
    const sim = neu();
    const lager = (sim as any).gebaeude.get(1);
    lager.vorrat.fill(0);
    tu(sim, { art: 'gebaeude', typ: 'huette', q: 6, r: 0 });
    tu(sim, { art: 'gebaeude', typ: 'huette', q: -3, r: 0 });
    tu(sim, { art: 'weg', pfad: gerade(0, 0, 0, 6) });
    tu(sim, { art: 'weg', pfad: gerade(0, 0, 3, 3) });
    lauf(sim, 1);
    lager.vorrat[WARE.bretter] = 3; lager.vorrat[WARE.stein] = 2;
    lauf(sim, 3000);
    const s = sim.sicht();
    expect(s.gebaeude.find((g) => g.q === 6)!.bau).toBe(1000);
    expect(s.gebaeude.find((g) => g.q === -3)!.bau).toBe(0);
  });
  it('getrennte Baustellen bekommen nichts', () => {
    const sim = neu();
    tu(sim, { art: 'gebaeude', typ: 'huette', q: 6, r: 0 });
    lauf(sim, 1200);
    const g = sim.sicht().gebaeude.find((x) => x.typ === 'huette')!;
    expect(g.zustand).toBe('getrennt');
    expect(g.bau).toBe(0);
    expect(lagerVorrat(sim).slice(0, 3)).toEqual(START_VORRAT.slice(0, 3));
    expect(sim.statistik().verbaut).toBe(0);
  });
  it('Abriss einer Baustelle: Hälfte (abgerundet) des verbauten Materials liegt an der Fahne, Rest verloren, Fahne bleibt', () => {
    const sim = neu();
    tu(sim, { art: 'gebaeude', typ: 'huette', q: 3, r: 0 });
    tu(sim, { art: 'weg', pfad: gerade(0, 0, 0, 3) });
    lauf(sim, 1);
    let g = sim.sicht().gebaeude.find((x) => x.typ === 'huette')!;
    while (g.bau < 600 || sim.tick % 10 === 0) { sim.schritt(); g = sim.sicht().gebaeude.find((x) => x.typ === 'huette')!; }
    const kosten = sim.kosten('huette');
    const verbaut = kosten.map((k, a) => k - g.bedarf![a]);
    expect(summe(verbaut)).toBeGreaterThanOrEqual(3);
    const fahneId = g.fahne;
    tu(sim, { art: 'abriss_gebaeude', id: g.id });
    sim.schritt();
    const s = sim.sicht();
    expect(s.gebaeude.find((x) => x.typ === 'huette')).toBeUndefined();
    const f = s.fahnen.find((x) => x.id === fahneId)!;
    expect(f).toBeDefined();
    expect(f.gebaeude).toBe(0);
    for (const a of [WARE.bretter, WARE.stein]) expect(f.waren.filter((w) => w === a).length).toBe(Math.floor(verbaut[a] / 2));
    expect(sim.pruefeInnenzustand().filter((x) => !x.includes('ungültigem Ziel'))).toEqual([]);
    // Es bleiben keine Reservierungen: das Material läuft ins Lager zurück, nichts hängt fest
    lauf(sim, 1500);
    expect(sim.pruefeInnenzustand()).toEqual([]);
    const l = lagerVorrat(sim);
    for (const a of [WARE.bretter, WARE.stein]) expect(l[a]).toBe(START_VORRAT[a] - verbaut[a] + Math.floor(verbaut[a] / 2));
  });
  it('Abriss eines fertigen Gebäudes: Puffer und Output an die Fahne, Arbeiter zurück in den Vorrat', () => {
    const sim = neu();
    tu(sim, { art: 'gebaeude', typ: 'saegewerk', q: 3, r: 0 });
    tu(sim, { art: 'weg', pfad: gerade(0, 0, 0, 3) });
    lauf(sim, 1);
    (sim as any).gebaeude.get(1).vorrat[WARE.stamm] = 4;
    let g = sim.sicht().gebaeude.find((x) => x.typ === 'saegewerk')!;
    while (!(g.bau === 1000 && (g.puffer![WARE.stamm] > 0 || g.ausgang![WARE.bretter] > 0)) || sim.tick % 10 === 0) {
      sim.schritt(); g = sim.sicht().gebaeude.find((x) => x.typ === 'saegewerk')!;
      if (sim.tick > 4000) throw new Error('Sägewerk wurde nicht fertig');
    }
    const frei = sim.sicht().freieTraeger;
    tu(sim, { art: 'abriss_gebaeude', id: g.id });
    sim.schritt();
    expect(sim.sicht().freieTraeger).toBe(frei + 1);
    expect(sim.pruefeInnenzustand().filter((x) => !x.includes('ungültigem Ziel'))).toEqual([]);
  });
});

describe('M4: Holz', () => {
  it('Holzfäller fällt nur vorhandene Bäume, genau einmal und nur im Radius; danach „kein Baum“', () => {
    const sim = neu(1, START, karteMitWald([{ q: 9, r: 0 }, { q: -9, r: 5 }]));
    const mitte = { q: 9, r: 0 };
    tu(sim, { art: 'gebaeude', typ: 'holzfaeller', ...mitte });
    tu(sim, { art: 'weg', pfad: gerade(0, 0, 0, 9) });
    lauf(sim, 1);
    const vorher = sim.sicht().natur.baum.slice();
    const imRadius = new Set(hexeImRadius(sim, mitte, 4));
    let anfang = 0;
    for (const h of imRadius) anfang += vorher[h];
    expect(anfang).toBeLessThan(18 * TREE_MAX);   // der Weg hat ein paar Bäume vertrieben
    expect(anfang).toBeGreaterThan(40);
    let letzte = summe(vorher), verstoesse = 0;
    for (let i = 0; i < 25000; i++) {
      sim.schritt();
      if (i % 20 === 0) {
        const n = sim.sicht().natur;
        const jetzt = summe(n.baum);
        if (jetzt > letzte) verstoesse++; // ohne Förster nimmt es nur ab
        letzte = jetzt;
        for (let h = 0; h < n.baum.length; h++) if (n.baum[h] > vorher[h]) verstoesse++;
      }
    }
    expect(verstoesse).toBe(0);
    const n = sim.sicht().natur;
    for (let h = 0; h < n.baum.length; h++) {
      if (!imRadius.has(h)) { if (n.baum[h] !== vorher[h]) verstoesse++; } else if (n.baum[h] !== 0) verstoesse++;
    }
    expect(verstoesse).toBe(0);
    expect(sim.statistik().erzeugtJe[WARE.stamm]).toBe(anfang);
    expect(sim.sicht().gebaeude.find((g) => g.typ === 'holzfaeller')!.zustand).toBe('kein_baum');
    expect(lagerVorrat(sim)[WARE.stamm]).toBe(anfang);
    expect(sim.pruefeInnenzustand()).toEqual([]);
  });
  it('zwei Holzfäller nehmen nie denselben Baum', () => {
    const karte = karteMitWald([{ q: 6, r: 0 }]);
    const sim = neu(1, START, karte);
    tu(sim, { art: 'gebaeude', typ: 'holzfaeller', q: 6, r: -3 });
    tu(sim, { art: 'gebaeude', typ: 'holzfaeller', q: 6, r: 3 });
    lauf(sim, 1);
    verbinde(sim, { q: 0, r: 0 }, { q: 6, r: -3 });
    lauf(sim, 1);
    verbinde(sim, { q: 0, r: 0 }, { q: 6, r: 3 });
    lauf(sim, 1);
    let gefaellt = 0, verstoesse = 0;
    const start = summe(sim.sicht().natur.baum);
    for (let i = 0; i < 9000; i++) {
      sim.schritt();
      if (i % 25 === 0) {
        // prüft u. a.: Baum-Reservierung je Hex = Zahl der Arbeiter mit diesem Ziel
        const f = sim.pruefeInnenzustand().filter((x) => !x.includes('ungültigem Ziel'));
        if (f.length) expect(f).toEqual([]);
        const n = sim.sicht().natur;
        for (let h = 0; h < n.baum.length; h++) if (n.baum[h] > TREE_MAX) verstoesse++;
        gefaellt = start - summe(n.baum);
        if (sim.statistik().erzeugtJe[WARE.stamm] > gefaellt) verstoesse++;
      }
    }
    expect(verstoesse).toBe(0);
    expect(gefaellt).toBeGreaterThan(10);
    expect(sim.statistik().erzeugtJe[WARE.stamm]).toBeGreaterThanOrEqual(gefaellt - 2); // höchstens 2 Stämme sind noch unterwegs zum Puffer
  });
  it('Förster pflanzt, Jungbäume reifen in drei Stadien zu Bäumen, nie mehr als 3 je Hex und nie auf belegten Hexen', () => {
    const sim = neu(1, START, baueTestKarte(false));
    const mitte = { q: 3, r: 0 };
    tu(sim, { art: 'gebaeude', typ: 'foerster', ...mitte });
    tu(sim, { art: 'weg', pfad: gerade(0, 0, 0, 3) });
    lauf(sim, 1);
    const imRadius = new Set(hexeImRadius(sim, mitte, 4));
    const stadien = new Set<number>();
    let ersterBaum = -1, erstesJung = -1;
    let verstoesse = 0;
    for (let i = 0; i < BAUM_WACHSEN * 3; i++) {
      sim.schritt();
      if (i % 10 !== 0) continue;
      const n = sim.sicht().natur;
      if (erstesJung < 0 && summe(n.jung) > 0) erstesJung = i;
      if (ersterBaum < 0 && summe(n.baum) > 0) ersterBaum = i;
      for (let h = 0; h < n.baum.length; h++) {
        if (n.baum[h] + n.jung[h] > TREE_MAX) verstoesse++;
        if (n.jung[h] > 0) { if (n.stufe[h] === 0) verstoesse++; stadien.add(n.stufe[h]); } else if (n.stufe[h] !== 0) verstoesse++;
        if (!imRadius.has(h) && (n.baum[h] || n.jung[h])) verstoesse++;
      }
      if (i % 500 === 0) expect(sim.pruefeInnenzustand()).toEqual([]);
    }
    expect(verstoesse).toBe(0);
    expect(erstesJung).toBeGreaterThan(0);
    expect(ersterBaum).toBeGreaterThanOrEqual(erstesJung + BAUM_WACHSEN - 20);
    expect(ersterBaum).toBeLessThanOrEqual(erstesJung + BAUM_WACHSEN + 400);
    expect([...stadien].sort()).toEqual([1, 2, 3]);
    const n = sim.sicht().natur;
    const sicht = sim.sicht();
    const belegt = new Set<number>();
    for (const g of sicht.gebaeude) belegt.add(sim.karte.index(g.q, g.r));
    for (const f of sicht.fahnen) belegt.add(sim.karte.index(f.q, f.r));
    for (const sg of sicht.segmente) for (const p of sg.pfad) belegt.add(sim.karte.index(p.q, p.r));
    expect([...belegt].filter((h) => n.baum[h] || n.jung[h])).toEqual([]);
    expect(summe(n.baum) + summe(n.jung)).toBeGreaterThan(5);
  });
  it('Sägewerk macht aus Stämmen Bretter; Pull aus dem Lager beliefert den Input-Puffer (höchstens 2)', () => {
    const sim = neu();
    tu(sim, { art: 'gebaeude', typ: 'saegewerk', q: 3, r: 0 });
    tu(sim, { art: 'weg', pfad: gerade(0, 0, 0, 3) });
    lauf(sim, 1);
    const lager = (sim as any).gebaeude.get(1);
    lager.vorrat[WARE.stamm] = 5;
    let maxPuffer = 0, maxAusgang = 0;
    for (let i = 0; i < 3500; i++) {
      sim.schritt();
      const g = sim.sicht().gebaeude.find((x) => x.typ === 'saegewerk')!;
      if (g.puffer) maxPuffer = Math.max(maxPuffer, g.puffer[WARE.stamm]);
      if (g.ausgang) maxAusgang = Math.max(maxAusgang, g.ausgang[WARE.bretter]);
    }
    expect(maxPuffer).toBeLessThanOrEqual(2);
    expect(maxAusgang).toBeGreaterThan(0);
    expect(maxAusgang).toBeLessThanOrEqual(6);
    const v = lagerVorrat(sim);
    expect(v[WARE.stamm]).toBe(0);
    expect(v[WARE.bretter]).toBe(START_VORRAT[WARE.bretter] - 2 + 5);
    expect(sim.statistik().erzeugtJe[WARE.bretter]).toBe(5);
    expect(sim.sicht().gebaeude.find((x) => x.typ === 'saegewerk')!.zustand).toBe('wartet_material');
    expect(sim.pruefeInnenzustand()).toEqual([]);
  });
  it('ohne freien Bewohner wartet der Holzfäller („kein Arbeiter“), mit ihm arbeitet er', () => {
    const sim = neu();
    tu(sim, { art: 'gebaeude', typ: 'holzfaeller', q: 9, r: 0 });
    tu(sim, { art: 'weg', pfad: gerade(0, 0, 0, 9) });
    lauf(sim, 2);
    (sim as any).freieTraeger = 0;
    lauf(sim, 3000);
    const g = sim.sicht().gebaeude.find((x) => x.typ === 'holzfaeller')!;
    expect(g.bau).toBe(1000);
    expect(g.zustand).toBe('kein_arbeiter');
    expect(g.arbeiter).toBeUndefined();
    expect(sim.statistik().erzeugt).toBe(0);
    (sim as any).freieTraeger = 1;
    lauf(sim, 400);
    const g2 = sim.sicht().gebaeude.find((x) => x.typ === 'holzfaeller')!;
    expect(g2.arbeiter).toBeDefined();
    expect(['arbeitet', 'voll']).toContain(g2.zustand);
    expect(sim.sicht().freieTraeger).toBe(0);
  });
  it('Arbeiter-Sicht: geht, arbeitet, trägt, ruht – mit Zielhex im Radius', () => {
    const sim = neu();
    tu(sim, { art: 'gebaeude', typ: 'holzfaeller', q: 9, r: 0 });
    tu(sim, { art: 'weg', pfad: gerade(0, 0, 0, 9) });
    lauf(sim, 1);
    const tuts = new Set<string>();
    for (let i = 0; i < 3500; i++) {
      sim.schritt();
      const a = sim.sicht().gebaeude.find((x) => x.typ === 'holzfaeller')!.arbeiter;
      if (!a) continue;
      tuts.add(a.tut);
      expect(a.fortschritt).toBeGreaterThanOrEqual(0);
      expect(a.fortschritt).toBeLessThan(1000);
      if (a.tut === 'arbeitet') { expect(a.ziel).not.toBeNull(); expect(a.von).toEqual(a.nach); }
      if (a.tut === 'traegt') expect(a.ware).toBe(WARE.stamm);
      if (a.ziel) expect(Math.max(Math.abs(a.ziel.q - 9), Math.abs(a.ziel.r), Math.abs(a.ziel.q - 9 + a.ziel.r))).toBeLessThanOrEqual(2);
    }
    expect([...tuts].sort()).toEqual(['arbeitet', 'geht', 'ruht', 'traegt']);
  });
});

describe('M4: Stein', () => {
  it('Steinbruch erschöpft den Fels (36 Einheiten), liefert genau so viel Stein und ruht dann („kein Fels“)', () => {
    const karte = baueTestKarte(false);
    const k = new SimKarte(karte);
    for (const [q, r] of [[7, 0], [8, 0], [7, -1]]) { karte.terrain[k.index(q, r)] = 5; karte.build[k.index(q, r)] = 0; }
    const sim = neu(1, START, karte);
    tu(sim, { art: 'gebaeude', typ: 'steinbruch', q: 6, r: 0 });
    tu(sim, { art: 'fahne', q: 3, r: 0 });
    tu(sim, { art: 'weg', pfad: gerade(0, 0, 0, 3) });
    tu(sim, { art: 'weg', pfad: gerade(3, 0, 0, 3) });
    lauf(sim, 1);
    expect(sim.arbeitsHexe('steinbruch', 6, 0).summe).toBe(3 * FELS_STEIN);
    const felsAnfang = summe(sim.sicht().natur.fels);
    lauf(sim, 15000);
    const n = sim.sicht().natur;
    expect(felsAnfang - summe(n.fels)).toBe(3 * FELS_STEIN);
    for (const [q, r] of [[7, 0], [8, 0], [7, -1]]) expect(n.fels[sim.karte.index(q, r)]).toBe(0);
    expect(sim.statistik().erzeugtJe[WARE.stein]).toBe(3 * FELS_STEIN);
    expect(sim.sicht().gebaeude.find((g) => g.typ === 'steinbruch')!.zustand).toBe('kein_fels');
    expect(lagerVorrat(sim)[WARE.stein]).toBe(START_VORRAT[WARE.stein] + 3 * FELS_STEIN);
    expect(sim.pruefeInnenzustand()).toEqual([]);
  }, 30000);
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
