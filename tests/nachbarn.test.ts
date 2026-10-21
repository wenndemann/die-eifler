// M10: Gebiet, Orte mit Einstand, Flachländer, Finden, Schützenfest, Eifel-Punkte und Ende (Drehbuch 6, ROADMAP M10).
import { describe, expect, it } from 'vitest';
import { WARE, WAREN } from '../src/sim/daten';
import { ORT_LAUFZEIT_JE_HEX, type Regeln } from '../src/sim/nachbarn';
import { spieleAb } from '../src/sim/replay';
import { Simulation } from '../src/sim/sim';
import type { SimStand } from '../src/sim/stand';
import type { Befehl, KarteDaten, SimSicht } from '../src/sim/typen';
import { baueTestKarte, gerade, KARTE_INFO } from './sim-szenario';
import { SimKarte } from '../src/sim/karte';

const MIT_GEBIET: Regeln = { gebiet: 1, ziel: '' };

function tu(sim: Simulation, sp: number, b: Befehl) { sim.befehl(sim.tick, sp, b); }
function lauf(sim: Simulation, n: number) { for (let i = 0; i < n; i++) sim.schritt(); }
const besitzBei = (sim: Simulation, s: SimSicht, q: number, r: number) => s.gebiet.besitz[sim.karte.index(q, r)];

/** Ortskern-Hexe mit Ort-Nummer `nr` setzen (wie die Weltdaten: Flag Bit 0 und place). */
function setzeOrt(k: KarteDaten, hexe: { q: number; r: number }[], nr: number) {
  const sk = new SimKarte(k);
  for (const h of hexe) { const i = sk.index(h.q, h.r); k.flags[i] |= 1; k.place[i] = nr; }
}

/** Zustand ändern über einen Spielstand (wie Laden). */
function aendere(sim: Simulation, karte: KarteDaten, f: (st: SimStand) => void): Simulation {
  const st = sim.stand();
  f(st);
  return Simulation.ausStand(karte, st);
}

/** Allen Lagern von `sp` je Ware `n` dazugeben. */
function fuelleLager(st: SimStand, sp: number, n = 30) {
  for (const g of st.gebaeude) if (g.sp === sp && g.typ === 'lager') g.vorrat = (g.vorrat as number[]).map((v) => v + n);
}

describe('M10 Gebiet (Einfluss)', () => {
  it('ein Dorf: Gebiet um das Lager, bauen nur auf eigenem Gebiet, ohne Regel wie bisher', () => {
    const k = baueTestKarte(false);
    const sim = new Simulation(k, 1, { q: 0, r: 0 }, MIT_GEBIET);
    const s = sim.sicht();
    expect(besitzBei(sim, s, 0, 0)).toBe(0);
    // Lager 9 + gut versorgt 1 = 10 Hexe
    expect(besitzBei(sim, s, 10, -5)).toBe(0);
    expect(besitzBei(sim, s, 11, -5)).toBe(-1);
    expect(sim.kannBauen('wohnhaus', 3, 0)).toBe(true);
    expect(sim.kannBauen('wohnhaus', 0, -14)).toBe(false);
    expect(sim.kannFahne(0, -14)).toBe(false);
    expect(s.spieler[0].hexe).toBe(3 * 10 * 11 + 1);
    expect(s.regeln).toEqual({ gebiet: true, ziel: '', zielPunkte: 0 });
    const alt = new Simulation(baueTestKarte(false), 1, { q: 0, r: 0 });
    expect(alt.kannBauen('wohnhaus', 0, -14)).toBe(true);
    expect(alt.sicht().regeln.gebiet).toBe(false);
  });

  it('zwei Dörfer: Grenze dazwischen, fremdes Gebiet ist tabu für Gebäude, Fahnen und Wege', () => {
    const k = baueTestKarte(false);
    const sim = new Simulation(k, 1, [{ q: 0, r: 0 }, { q: -14, r: 0 }], MIT_GEBIET);
    const s = sim.sicht();
    expect(besitzBei(sim, s, -3, 0)).toBe(0);
    expect(besitzBei(sim, s, -11, 0)).toBe(1);
    // gleich weit: das ältere Lager (Spieler 0) gewinnt
    expect(besitzBei(sim, s, -7, 0)).toBe(0);
    expect(sim.kannBauen('wohnhaus', -3, 0, 1)).toBe(false);
    expect(sim.kannFahne(-3, 0, 1)).toBe(false);
    tu(sim, 1, { art: 'weg', pfad: gerade(-14, 0, 0, 12) });
    lauf(sim, 1);
    expect(sim.sicht(1).segmente.length).toBe(0);
    expect(sim.wegVorschau({ q: -14, r: 0 }, { q: -2, r: 0 }, 1)).toBeNull();
    expect(sim.pruefeInnenzustand()).toEqual([]);
  });
});

describe('M10 Orte mit Einstand', () => {
  /** Weiler aus zwei Ortskern-Hexen bei (0,-14), außerhalb des Startgebiets. */
  function karteMitOrt(q = 0, r = -14) {
    const k = baueTestKarte(false);
    setzeOrt(k, [{ q, r }, { q: q + 1, r }], 7);
    return k;
  }

  it('Weg hin, Wunsch liefern, Einstand: Ort, Bewohner, Lager mit Fundkiste, Gebiet und Punkte', () => {
    const k = karteMitOrt();
    let sim = new Simulation(k, 3, { q: 0, r: 0 }, MIT_GEBIET);
    const o0 = sim.sicht().orte;
    expect(o0.length).toBe(1);
    expect(o0[0]).toMatchObject({ nr: 7, q: 0, r: -14, groesse: 0, besitzer: -1, erreicht: false });
    expect(o0[0].wunsch.filter((n) => n > 0).length).toBe(2);
    // ohne Verbindung geht nichts
    sim = aendere(sim, k, (st) => fuelleLager(st, 0));
    tu(sim, 0, { art: 'einstand', ort: 0 });
    lauf(sim, 1);
    expect(sim.sicht().orte[0].unterwegs).toBe(0);
    // Weg über freies Land bis neben den Ortskern (Anschluss)
    tu(sim, 0, { art: 'weg', pfad: gerade(0, 0, 2, 13) });
    lauf(sim, 1);
    expect(sim.sicht().segmente.length).toBe(1);
    expect(sim.sicht().orte[0].erreicht).toBe(true);
    const vorher = sim.sicht();
    const p0 = vorher.spieler[0].punkte, bew0 = vorher.dorf.bewohner;
    const lager0 = vorher.gebaeude.find((g) => g.typ === 'lager')!.vorrat!.slice();
    tu(sim, 0, { art: 'einstand', ort: 0 });
    lauf(sim, 1);
    const unterwegs = sim.sicht();
    expect(unterwegs.orte[0].unterwegs).toBe(sim.tick - 1 + 14 * ORT_LAUFZEIT_JE_HEX);
    const lager1 = unterwegs.gebaeude.find((g) => g.typ === 'lager')!.vorrat!;
    for (let a = 0; a < WAREN.length; a++) expect(lager1[a]).toBe(lager0[a] - o0[0].wunsch[a]);
    lauf(sim, 14 * ORT_LAUFZEIT_JE_HEX + 2);
    const s = sim.sicht();
    expect(s.orte[0].besitzer).toBe(0);
    expect(s.spieler[0].orte).toBe(1);
    expect(s.dorf.bewohner).toBe(bew0 + 3);
    const neu = s.gebaeude.find((g) => g.typ === 'lager' && g.q === 0 && g.r === -14)!;
    expect(neu.sp).toBe(0);
    expect(neu.vorrat![WARE.bretter]).toBe(4);
    expect(besitzBei(sim, s, 0, -17)).toBe(0);
    expect(s.spieler[0].punkte).toBeGreaterThanOrEqual(p0 + 10);
    expect(s.ereignisse.some((e) => e.art === 'einstand')).toBe(true);
    expect(sim.pruefeInnenzustand()).toEqual([]);
  });

  it('Mehrspieler: Wettlauf um den Ort – wer zuerst ankommt, gewinnt; der andere hat umsonst geliefert', () => {
    const k = baueTestKarte(false);
    setzeOrt(k, [{ q: 0, r: -15 }, { q: 1, r: -15 }], 9);
    let sim = new Simulation(k, 5, [{ q: 0, r: 0 }, { q: 0, r: -28 }], MIT_GEBIET);
    sim = aendere(sim, k, (st) => { fuelleLager(st, 0); fuelleLager(st, 1); });
    tu(sim, 0, { art: 'weg', pfad: gerade(0, 0, 2, 14) });
    tu(sim, 1, { art: 'weg', pfad: gerade(0, -28, 5, 12) });
    lauf(sim, 1);
    expect(sim.sicht(0).orte[0].erreicht).toBe(true);
    expect(sim.sicht(1).orte[0].erreicht).toBe(true);
    tu(sim, 0, { art: 'einstand', ort: 0 });
    tu(sim, 1, { art: 'einstand', ort: 0 });
    lauf(sim, 16 * ORT_LAUFZEIT_JE_HEX);
    expect(sim.sicht(0).orte[0].besitzer).toBe(1);
    expect(sim.sicht(0).ereignisse.some((e) => e.art === 'zu_spaet')).toBe(true);
    expect(sim.sicht(1).spieler[1].orte).toBe(1);
    expect(sim.pruefeInnenzustand()).toEqual([]);
  });

  it('die Sicht zwischen den Ticks ändert nichts an der Prüfsumme (Mehrspieler: wer zeichnet, darf nicht auseinanderlaufen)', () => {
    const k = karteMitOrt();
    const baue = () => {
      const sim = aendere(new Simulation(k, 3, { q: 0, r: 0 }, MIT_GEBIET), k, (st) => fuelleLager(st, 0));
      tu(sim, 0, { art: 'weg', pfad: gerade(0, 0, 2, 13) });
      tu(sim, 0, { art: 'gebaeude', typ: 'wohnhaus', q: 3, r: 0 });
      tu(sim, 0, { art: 'weg', pfad: gerade(0, 0, 0, 3) });
      return sim;
    };
    const a = baue(), b = baue();
    lauf(a, 1); lauf(b, 1);
    tu(a, 0, { art: 'einstand', ort: 0 }); tu(b, 0, { art: 'einstand', ort: 0 });
    for (let i = 0; i < 800; i++) {
      a.sicht(0);
      lauf(a, 1); lauf(b, 1);
      a.sicht(0);
      expect(a.pruefsumme(), `Tick ${a.tick}`).toBe(b.pruefsumme());
    }
    expect(a.sicht().orte[0].besitzer).toBe(0);
  });

  it('Spielstand mit Lieferung unterwegs: gleiche Prüfsumme und gleicher Fortgang; alte Spielstände laden ohne Gebiet', () => {
    const k = karteMitOrt();
    let sim = new Simulation(k, 3, { q: 0, r: 0 }, MIT_GEBIET);
    sim = aendere(sim, k, (st) => fuelleLager(st, 0));
    tu(sim, 0, { art: 'weg', pfad: gerade(0, 0, 2, 13) });
    lauf(sim, 1);
    tu(sim, 0, { art: 'einstand', ort: 0 });
    lauf(sim, 50);
    const st = sim.stand();
    const b = Simulation.ausStand(k, st);
    expect(b.pruefsumme()).toBe(sim.pruefsumme());
    lauf(sim, 700); lauf(b, 700);
    expect(b.pruefsumme()).toBe(sim.pruefsumme());
    expect(b.sicht().orte[0].besitzer).toBe(0);
    // Spielstand von vor M10
    const alt = sim.stand() as unknown as Record<string, unknown>;
    delete alt.gebiet; delete alt.regeln;
    for (const d of alt.doerfer as Record<string, unknown>[]) { delete d.einstandP; delete d.koenig; }
    const c = Simulation.ausStand(k, alt as unknown as SimStand);
    expect(c.sicht().regeln.gebiet).toBe(false);
    expect(c.sicht().spieler[0].koenig).toBe(false);
    lauf(c, 100);
  });
});

describe('M10 Flachländer: Marktposten und Handel', () => {
  it('Posten am Kartenrand in Richtung der echten Stadt, Handel nach der Laufzeit, ab Marktflecken besser', () => {
    const k = baueTestKarte(false);
    let sim = new Simulation(k, 1, { q: 0, r: 0 }, MIT_GEBIET);
    const posten = sim.sicht().posten;
    expect(posten.map((p) => p.stadt)).toEqual(['Lüttich', 'Aachen']);
    for (const p of posten) expect(sim.karte.abstand(sim.karte.index(p.q, p.r), sim.karte.index(0, 0))).toBe(29);
    // Lüttich liegt im Südwesten (q kleiner, r größer)
    expect(posten[0].q).toBeLessThan(0);
    expect(posten[0].r).toBeGreaterThan(0);
    sim = aendere(sim, k, (st) => fuelleLager(st, 0));
    // Weg in zwei Stücken: bis an den Rand des Gebiets, dann über freies Land bis neben den Posten
    const p = posten[0];
    const ziel = [...Array(6).keys()].map((d) => ({ q: p.q + [1, 1, 0, -1, -1, 0][d], r: p.r + [0, -1, -1, 0, 1, 1][d] }))
      .find((h) => sim.karte.abstand(sim.karte.index(h.q, h.r), sim.karte.index(0, 0)) === 28)!;
    const weg = sim.wegVorschau({ q: 0, r: 0 }, ziel, 0)!;
    expect(weg).not.toBeNull();
    tu(sim, 0, { art: 'weg', pfad: weg });
    lauf(sim, 1);
    const s0 = sim.sicht();
    expect(s0.posten[0].erreicht).toBe(true);
    const kaese0 = s0.gebaeude.find((g) => g.typ === 'lager')!.vorrat!;
    tu(sim, 0, { art: 'handel', posten: 0, tausch: 0, mal: 2 });
    lauf(sim, 1);
    const s1 = sim.sicht();
    expect(s1.posten[0].unterwegs.length).toBe(1);
    expect(s1.gebaeude.find((g) => g.typ === 'lager')!.vorrat![WARE.kaese]).toBe(kaese0[WARE.kaese] - 6);
    const werkzeug0 = kaese0[WARE.werkzeug];
    lauf(sim, s1.posten[0].unterwegs[0] - sim.tick + 1);
    const s2 = sim.sicht();
    expect(s2.gebaeude.find((g) => g.typ === 'lager')!.vorrat![WARE.werkzeug]).toBe(werkzeug0 + 2);
    expect(s2.ereignisse.some((e) => e.art === 'handel')).toBe(true);
    // Marktflecken: ein Stück mehr je Tausch
    const mf = aendere(sim, k, (st) => { st.doerfer[0].stufe = 3; });
    expect(mf.sicht().posten[0].handel[0].nimm[WARE.werkzeug]).toBe(2);
  });
});

describe('M10 Finden mit Gegenwehr', () => {
  it('Finder holt Waren beim Nachbarn oder wird erwischt; Wachhunde machen wachsamer', () => {
    const k = baueTestKarte(false);
    let sim = new Simulation(k, 11, [{ q: 0, r: 0 }, { q: -14, r: 0 }], MIT_GEBIET);
    sim = aendere(sim, k, (st) => { st.doerfer[0].stufe = 1; st.doerfer[1].stufe = 1; fuelleLager(st, 1, 20); });
    expect(sim.wachsamkeitVon(1)).toBe(20);
    tu(sim, 0, { art: 'gebaeude', typ: 'finderhuette', q: 3, r: 0 });
    tu(sim, 0, { art: 'weg', pfad: gerade(0, 0, 0, 3) });
    tu(sim, 1, { art: 'gebaeude', typ: 'hundehuette', q: -14, r: 3 });
    tu(sim, 1, { art: 'weg', pfad: gerade(-14, 0, 5, 3) });
    const arten = new Set<string>();
    const gesehen = new Set<string>();
    for (let i = 0; i < 60; i++) {
      lauf(sim, 500);
      for (const sp of [0, 1]) for (const e of sim.sicht(sp).ereignisse) if (!gesehen.has(`${sp}:${e.nr}`)) { gesehen.add(`${sp}:${e.nr}`); arten.add(`${sp}:${e.art}`); }
    }
    expect(sim.wachsamkeitVon(1)).toBe(45);
    // in 30000 Ticks mehrere Gänge: mindestens ein Fund oder ein Erwischter
    expect(arten.has('0:fund') || arten.has('0:erwischt')).toBe(true);
    const f = sim.sicht(0).gebaeude.find((g) => g.typ === 'finderhuette')!;
    expect(f.finder).toBeDefined();
    expect(sim.pruefeInnenzustand()).toEqual([]);
  });
});

describe('M10 Schützenfest und Eifel-Punkte', () => {
  it('Schützenhaus mit Schießstand: Liste liefern, Fest, Vogelschuss, König zahlt die Runde', () => {
    const k = baueTestKarte(false);
    let sim = new Simulation(k, 4, { q: 0, r: 0 }, MIT_GEBIET);
    sim = aendere(sim, k, (st) => {
      st.doerfer[0].stufe = 2;
      for (const g of st.gebaeude) if (g.typ === 'lager') {
        const v = g.vorrat as number[];
        v[WARE.landbier] = 20; v[WARE.schnaps] = 10; v[WARE.bratkartoffeln] = 16; v[WARE.bretter] = 30; v[WARE.stein] = 30;
      }
    });
    const p0 = sim.punkte(0);
    tu(sim, 0, { art: 'gebaeude', typ: 'schuetzenhaus', q: 3, r: 0 });
    tu(sim, 0, { art: 'weg', pfad: gerade(0, 0, 0, 3) });
    tu(sim, 0, { art: 'gebaeude', typ: 'schiessstand', q: 0, r: 3 });
    tu(sim, 0, { art: 'weg', pfad: gerade(0, 0, 5, 3) });
    let s = sim.sicht();
    for (let i = 0; i < 40 && !s.dorf.koenig; i++) { lauf(sim, 500); s = sim.sicht(); }
    expect(s.dorf.schuetzen?.gefeiert).toBe(true);
    // 30 Grund + 30 Schießstand: allein immer König
    expect(s.dorf.koenig).toBe(true);
    expect(s.spieler[0].koenig).toBe(true);
    expect(sim.punkte(0)).toBeGreaterThanOrEqual(p0 + 50 + 150);
    expect(sim.pruefeInnenzustand()).toEqual([]);
  });

  it('Ziel erreicht oder Wettlauf gewonnen: Ende mit Sieger; „ohne Ende“ läuft weiter', () => {
    const k = baueTestKarte(false);
    for (const [ziel, ende] of [['kurz', true], ['wettlauf', true], ['ohne_ende', false]] as const) {
      let sim = new Simulation(k, 2, [{ q: 0, r: 0 }, { q: -14, r: 0 }], { gebiet: 1, ziel });
      lauf(sim, 25);
      expect(sim.sicht().ende).toBeNull();
      sim = aendere(sim, k, (st) => { st.doerfer[1].stufe = 3; });
      lauf(sim, 25);
      const s = sim.sicht(0);
      if (ende) {
        expect(s.ende?.sieger).toBe(1);
        expect(s.ereignisse.some((e) => e.art === 'ende' && e.wert === 1)).toBe(true);
      } else expect(s.ende).toBeNull();
    }
  });

  it('Replay mit Regeln: Node-Replay trifft die Prüfsumme', () => {
    const k = baueTestKarte(false);
    setzeOrt(k, [{ q: 0, r: -14 }, { q: 1, r: -14 }], 7);
    const sim = new Simulation(k, 3, { q: 0, r: 0, bewohner: 12 }, { gebiet: 1, ziel: 'normal' });
    tu(sim, 0, { art: 'weg', pfad: gerade(0, 0, 2, 13) });
    tu(sim, 0, { art: 'gebaeude', typ: 'wohnhaus', q: 3, r: 0 });
    tu(sim, 0, { art: 'weg', pfad: gerade(0, 0, 0, 3) });
    lauf(sim, 1500);
    const p = sim.protokoll(KARTE_INFO);
    expect(p.regeln).toEqual({ gebiet: 1, ziel: 'normal' });
    expect(spieleAb(k, p).pruefsumme()).toBe(sim.pruefsumme());
  });
});
