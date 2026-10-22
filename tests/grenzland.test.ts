// M15 Grenzland: Nacht, Grenzsteine versetzen (Finder als Figur, Hecken, Maijungen), Abwerben, Zollhaus und Kaffeeschmuggel,
// Fundbüro (Kaffeekränzchen, große Funde, Teile des Großen Funds, Siegbedingung), Jahresfest je gewonnenem Ort, Spuk;
// Spielstand und Replay mitten im Grenzstein-Gang, alter Spielstand ohne Grenzland.
import { describe, expect, it } from 'vitest';
import { JAHR_TICKS, WARE } from '../src/sim/daten';
import {
  bisNacht, FUNDE, HELFER_TEMPO, istNacht, JFEST_PUNKTE, KAFFEE_PUNKTE, KAFFEE_TAKT, SCHATZ_PUNKTE, SCHATZ_TEILE, TAG_TICKS, ZOLL_RABATT,
  ZOLL_WACHSAMKEIT,
} from '../src/sim/grenzland';
import { FIND_TICKS_JE_HEX, type Regeln } from '../src/sim/nachbarn';
import { spieleAb } from '../src/sim/replay';
import { Simulation } from '../src/sim/sim';
import { SimKarte } from '../src/sim/karte';
import { STAND_ZAHLEN, type SimStand } from '../src/sim/stand';
import type { Befehl, KarteDaten, SimSicht } from '../src/sim/typen';
import { baueTestKarte, gerade, KARTE_INFO } from './sim-szenario';

const MIT_GEBIET: Regeln = { gebiet: 1, ziel: '' };
const A = { q: 0, r: 0 }, B = { q: -14, r: 0 };

const lauf = (sim: Simulation, n: number) => { for (let i = 0; i < n; i++) sim.schritt(); };
const tu = (sim: Simulation, sp: number, b: Befehl) => sim.befehl(sim.tick, sp, b);
type Intern = {
  karte: SimKarte; gebaeudeErzeugen(t: string, h: number, sofort: boolean, sp: number): { id: number; zeit: number };
  zollWachsamkeit(sp: number): number; reiz(sp: number): number;
};
const intern = (sim: Simulation) => sim as unknown as Intern;
function fertig(sim: Simulation, typ: string, q: number, r: number, sp: number): number {
  const s = intern(sim);
  return s.gebaeudeErzeugen(typ, s.karte.index(q, r), true, sp).id;
}
function aendere(sim: Simulation, karte: KarteDaten, f: (st: SimStand) => void): Simulation {
  const st = sim.stand(); f(st); return Simulation.ausStand(karte, st);
}
const tickSetzen = (st: SimStand, t: number) => { st.zahlen[STAND_ZAHLEN.indexOf('tick')] = t; };
const dorf = (st: SimStand, sp: number) => st.doerfer[sp] as Record<string, unknown>;
const grenz = (s: SimSicht) => s.dorf.grenz!;
const finder = (s: SimSicht) => s.gebaeude.find((g) => g.typ === 'finderhuette' && g.sp === s.ich)!;
/** Ereignisse (art) eines Spielers seit Beginn, über alle Ticks gesammelt. */
function sammle(sim: Simulation, sp: number, n: number, bis?: (s: SimSicht) => boolean): Set<string> {
  const arten = new Set<string>(), gesehen = new Set<number>();
  for (let i = 0; i < n; i++) {
    sim.schritt();
    if (i % 10 && i !== n - 1) continue;
    const s = sim.sicht(sp);
    for (const e of s.ereignisse) if (!gesehen.has(e.nr)) { gesehen.add(e.nr); arten.add(`${e.art}:${e.wert}`); arten.add(e.art); }
    if (bis?.(s)) break;
  }
  return arten;
}

/**
 * Zwei Dörfer mit Gebiet; Spieler 0 hat eine fertige Finderhütte mit Weg und gleich den Auftrag, einen Grenzstein zu Spieler 1 zu tragen
 * (sonst geht der Finder erst normal finden); volle Lager; Tick kurz vor der Nacht.
 */
function zweiDoerfer(saat = 3, karte = baueTestKarte(false), extra?: (sim: Simulation) => void): Simulation {
  let sim = new Simulation(karte, saat, [A, B], MIT_GEBIET);
  const id = fertig(sim, 'finderhuette', 3, 0, 0);
  extra?.(sim);
  tu(sim, 0, { art: 'weg', pfad: gerade(0, 0, 0, 3) });
  tu(sim, 0, { art: 'grenzstein', id, ziel: 1 });
  lauf(sim, 2);
  sim = aendere(sim, karte, (st) => {
    tickSetzen(st, sim.tick + bisNacht(sim.tick) - 20);
    for (const g of st.gebaeude) if (g.typ === 'lager') g.vorrat = (g.vorrat as number[]).map((v) => v + 20);
  });
  lauf(sim, 2);
  return sim;
}

describe('M15 Nacht', () => {
  it('Nacht ab 21 bis 5 Uhr, ganzzahlig aus dem Tick; bisNacht zeigt auf den Beginn', () => {
    let nachts = 0;
    for (let t = 0; t < TAG_TICKS; t++) if (istNacht(t)) nachts++;
    expect(nachts).toBeGreaterThan(TAG_TICKS / 4);
    expect(nachts).toBeLessThan(TAG_TICKS / 2);
    for (const t of [0, 1234, 9999, 20000]) {
      const b = bisNacht(t);
      expect(istNacht(t + b)).toBe(true);
      if (b > 0) expect(istNacht(t + b - 1)).toBe(false);
    }
    const sim = new Simulation(baueTestKarte(false), 1, A);
    expect(sim.sicht(0).grenzland!.nacht).toBe(istNacht(0));
  });
});

describe('M15 Grenzsteine versetzen', () => {
  it('Finder wartet auf die Nacht, trägt den Stein als Figur zur Grenze; gelingt es, wandert die Grenze', () => {
    let gelungen = 0, erwischt = 0;
    for (let saat = 1; saat <= 8; saat++) {
      const sim = zweiDoerfer(saat);
      const h0 = sim.sicht(0).spieler.map((x) => x.hexe);
      expect(finder(sim.sicht(0)).finder!.grenzstein).toBe(1);
      expect(finder(sim.sicht(0)).finder!.tut).toBe('bereit');
      let stein = false;
      for (let i = 0; i < 60 && !stein; i++) { lauf(sim, 1); stein = finder(sim.sicht(0)).finder!.tut === 'stein'; }
      expect(stein).toBe(true);
      expect(sim.sicht(0).grenzland!.nacht).toBe(true);
      expect(sim.sicht(1).grenzland!.finder.some((f) => f.sp === 0 && f.traegt === 'stein')).toBe(true);
      const arten = sammle(sim, 0, 3000, (s) => finder(s).finder!.tut === 'bereit' || finder(s).finder!.tut === 'ausrede');
      const s = sim.sicht(0);
      if (arten.has('grenzstein:1')) {
        gelungen++;
        expect(s.grenzland!.steine.length).toBe(1);
        expect(s.grenzland!.steine[0]).toMatchObject({ sp: 0, opfer: 1, art: 0 });
        expect(s.spieler[0].hexe).toBeGreaterThan(h0[0]);
        expect(s.spieler[1].hexe).toBeLessThan(h0[1]);
        expect(sim.sicht(1).ereignisse.some((e) => e.art === 'grenzstein_weg' && e.wert === 0)).toBe(true);
      } else {
        erwischt++;
        expect(arten.has('erwischt')).toBe(true);
        expect(sim.sicht(1).ereignisse.some((e) => e.art === 'ertappt')).toBe(true);
        expect(s.grenzland!.steine).toEqual([]);
      }
      expect(finder(s).finder!.grenzstein).toBe(-1);
      expect(sim.pruefeInnenzustand()).toEqual([]);
    }
    expect(gelungen).toBeGreaterThan(0);
    expect(erwischt).toBeGreaterThan(0);
  });

  it('hinter einer ausgewachsenen Hecke ist der Grenzstein fast unversetzbar; ohne Gebiets-Regel kein Auftrag', () => {
    let erwischt = 0;
    for (let saat = 1; saat <= 6; saat++) {
      const k = baueTestKarte(false);
      const sim = zweiDoerfer(saat, k, (s) => {
        // Hecken des Nachbarn an seinem ganzen Rand zu uns
        for (let r = -4; r <= 4; r++) intern(s).gebaeudeErzeugen('hecke', intern(s).karte.index(-8, r), true, 1).zeit = 1e9;
      });
      const arten = sammle(sim, 0, 3000, (s) => finder(s).finder!.tut === 'ausrede' || (finder(s).finder!.tut === 'bereit' && s.tick > 0 && finder(s).finder!.grenzstein === -1));
      if (arten.has('grenzstein:201')) erwischt++;
    }
    expect(erwischt).toBeGreaterThanOrEqual(5);
    // ohne Regel: Befehl wirkungslos
    const ohne = new Simulation(baueTestKarte(false), 1, [A, B]);
    const id = fertig(ohne, 'finderhuette', 3, 0, 0);
    tu(ohne, 0, { art: 'grenzstein', id, ziel: 1 }); lauf(ohne, 2);
    expect(finder(ohne.sicht(0)).finder!.grenzstein).toBe(-1);
  });

  it('Maijungen tragen den Stein schneller; Spuk in der Nacht, wenn Steine versetzt sind', () => {
    const dauer = (jungen: number) => {
      let sim = zweiDoerfer(2);
      sim = aendere(sim, baueTestKarte(false), (st) => { const d = dorf(st, 0) as Record<string, number>; d.maiJungen = jungen; d.frei -= jungen; });
      for (let i = 0; i < 60 && finder(sim.sicht(0)).finder!.tut !== 'stein'; i++) lauf(sim, 1);
      const f = finder(sim.sicht(0)).finder!;
      return f.bis - sim.tick;
    };
    const ohne = dauer(0), mit = dauer(3);
    expect(ohne).toBeGreaterThan(5 * FIND_TICKS_JE_HEX);
    expect(mit).toBeLessThanOrEqual(Math.ceil((ohne * (100 - HELFER_TEMPO)) / 100) + 2);
    // Spuk: ein Stein liegt, die nächste Nacht beginnt
    const k = baueTestKarte(false);
    let sim = new Simulation(k, 1, [A, B], MIT_GEBIET);
    sim = aendere(sim, k, (st) => {
      st.grenzland = { steine: [{ id: 999, sp: 0, opfer: 1, h: intern(sim).karte.index(-7, 0), art: 0 }], ortFest: [] };
      tickSetzen(st, 100 + bisNacht(100) - 5);
    });
    const arten = sammle(sim, 1, 20);
    expect(arten.has('spuk')).toBe(true);
    expect(sim.sicht(0).grenzland!.steine.length).toBe(1);
  });
});

describe('M15 Abwerben', () => {
  it('besseres Dorf lockt freie Bewohner vom Nachbarn herüber; satt und bei Laune schützt', () => {
    const k = baueTestKarte(false);
    let sim = new Simulation(k, 5, [A, B], MIT_GEBIET);
    sim = aendere(sim, k, (st) => {
      dorf(st, 0).stufe = 2;
      for (const g of st.gebaeude) if (g.typ === 'lager') {
        const v = g.vorrat as number[];
        for (const a of [WARE.kartoffeln, WARE.milch, WARE.aepfel, WARE.kaese]) v[a] = g.sp === 0 ? 40 : 0;
      }
      const d1 = dorf(st, 1) as Record<string, number>; d1.bewohner += 8; d1.frei += 8;
    });
    expect(intern(sim).reiz(0)).toBeGreaterThan(intern(sim).reiz(1));
    const b0 = sim.sicht(0).spieler.map((x) => x.bewohner);
    lauf(sim, 20 * 90 * 6);
    const s = sim.sicht(0), s1 = sim.sicht(1);
    expect(grenz(s).abgeworben).toBeGreaterThan(0);
    expect(grenz(s1).verloren).toBe(grenz(s).abgeworben);
    expect(s.spieler[1].bewohner).toBeLessThan(b0[1]);
    expect(s1.ereignisse.some((e) => e.art === 'abgeworben')).toBe(true);
    expect(sim.pruefeInnenzustand()).toEqual([]);
    // gleich gut: keiner wirbt ab
    let gleich = new Simulation(k, 5, [A, B], MIT_GEBIET);
    gleich = aendere(gleich, k, (st) => { for (const sp of [0, 1]) { const d = dorf(st, sp) as Record<string, number>; d.bewohner += 8; d.frei += 8; } });
    lauf(gleich, 20 * 90 * 3);
    expect(grenz(gleich.sicht(0)).abgeworben + grenz(gleich.sicht(1)).abgeworben).toBe(0);
  });
});

/** Karte mit Natur und einem Hex Staatsgrenze bei (0, 8). */
function grenzKarte(): KarteDaten {
  const k = baueTestKarte(true);
  const i = new SimKarte(k).index(0, 8);
  k.flags[i] |= 8; k.flags[i] &= ~1;
  return k;
}

describe('M15 Zoll, Kaffeeschmuggel und Fundbüro', () => {
  it('Zollhaus an der Staatsgrenze; Finder schmuggeln Kaffee vorbei; Schmuggler-Völkchen mit Rabatt', () => {
    const k = grenzKarte();
    let sim = new Simulation(k, 4, A, MIT_GEBIET);
    expect(sim.sicht(0).grenzland!.zoll).toEqual([{ q: 0, r: 8, erreicht: false }]);
    expect(new Simulation(baueTestKarte(false), 4, A).sicht(0).grenzland!.zoll).toEqual([]);
    expect(intern(sim).zollWachsamkeit(0)).toBe(ZOLL_WACHSAMKEIT);
    expect(intern(new Simulation(k, 4, { ...A, voelkchen: 'monschau' })).zollWachsamkeit(0)).toBe(ZOLL_WACHSAMKEIT - ZOLL_RABATT);
    fertig(sim, 'finderhuette', 3, 0, 0);
    tu(sim, 0, { art: 'weg', pfad: gerade(0, 0, 0, 3) });
    tu(sim, 0, { art: 'weg', pfad: gerade(0, 0, 5, 7) });
    lauf(sim, 5);
    sim = aendere(sim, k, (st) => { dorf(st, 0).stufe = 1; });
    expect(sim.sicht(0).grenzland!.zoll[0].erreicht).toBe(true);
    const arten = sammle(sim, 0, 20 * 60 * 12);
    expect(arten.has(`schmuggel:${WARE.kaffee}`)).toBe(true);
    expect(sim.sicht(0).dorf.erzeugt[WARE.kaffee]).toBeGreaterThan(0);
    expect(sim.pruefeInnenzustand()).toEqual([]);
  });

  it('Fundbüro: Kaffeekränzchen, große Funde, Teile des Großen Funds; mit allen Teilen gewinnt man „Der Große Fund“', () => {
    const k = grenzKarte();
    let sim = new Simulation(k, 6, A, { gebiet: 1, ziel: 'grosser_fund' });
    const buero = fertig(sim, 'fundbuero', -3, 0, 0);
    fertig(sim, 'finderhuette', 3, 0, 0);
    tu(sim, 0, { art: 'weg', pfad: gerade(0, 0, 0, 3) });
    tu(sim, 0, { art: 'weg', pfad: gerade(0, 0, 3, 3) });
    tu(sim, 0, { art: 'weg', pfad: gerade(0, 0, 5, 7) });
    lauf(sim, 5);
    sim = aendere(sim, k, (st) => { dorf(st, 0).stufe = 1; const g = st.gebaeude.find((x) => x.id === buero)!; (g.puffer as number[])[WARE.kaffee] = 4; });
    expect(grenz(sim.sicht(0)).fundbuero).toBe(true);
    const p0 = sim.punkte(0);
    lauf(sim, KAFFEE_TAKT + 2);
    expect(grenz(sim.sicht(0)).kaffeeP).toBe(KAFFEE_PUNKTE);
    expect(sim.punkte(0)).toBeGreaterThanOrEqual(p0 + KAFFEE_PUNKTE);
    // viele Gänge: großer Fund und ein Teil vom Zollhaus (je Nachbar nur eins)
    let gross = false, teil = false;
    for (let i = 0; i < 40 && !(gross && teil); i++) {
      const a = sammle(sim, 0, 2000);
      gross ||= a.has('grossfund'); teil ||= a.has('schatzteil');
    }
    expect(gross).toBe(true);
    expect(teil).toBe(true);
    const g = grenz(sim.sicht(0));
    expect(g.teile).toEqual([2000]);
    expect(g.funde.every((i) => i >= 0 && i < FUNDE.length)).toBe(true);
    expect(g.fundP).toBe(g.funde.reduce((n, i) => n + FUNDE[i].punkte, 0));
    expect(g.teilP).toBe(SCHATZ_PUNKTE);
    // alle Teile → Sieg
    const fast = aendere(sim, k, (st) => { dorf(st, 0).teile = Array.from({ length: SCHATZ_TEILE }, (_, i) => 3000 + i); });
    lauf(fast, 25);
    expect(fast.sicht(0).ende?.sieger).toBe(0);
    expect(fast.sicht(0).spieler[0].teile).toBe(SCHATZ_TEILE);
    expect(sim.pruefeInnenzustand()).toEqual([]);
  });
});

describe('M15 Jahresfest je gewonnenem Ort', () => {
  it('ein gewonnener Ort feiert einmal im Jahr: Punkte und Laune; der Startort nicht', () => {
    const k = baueTestKarte(false);
    const sk = new SimKarte(k);
    for (const h of [{ q: 4, r: -14 }, { q: 5, r: -14 }]) { const i = sk.index(h.q, h.r); k.place[i] = 7; }
    for (const h of [{ q: 0, r: 0 }]) { const i = sk.index(h.q, h.r); k.place[i] = 3; }
    let sim = new Simulation(k, 2, A, MIT_GEBIET);
    const orte = sim.sicht(0).orte;
    const oi = orte.findIndex((o) => o.nr === 7);
    expect(orte.find((o) => o.nr === 3)!.besitzer).toBe(0);
    const tag = (Math.imul(7, 7919) >>> 0) % JAHR_TICKS;
    sim = aendere(sim, k, (st) => { st.gebiet!.orte[oi] = 0; tickSetzen(st, tag - 3); });
    const arten = sammle(sim, 0, 10);
    expect(arten.has(`jahresfest:${oi}`)).toBe(true);
    expect(grenz(sim.sicht(0)).jfestP).toBe(JFEST_PUNKTE);
    expect(grenz(sim.sicht(0)).jfest).toBeGreaterThan(0);
    // nur einmal im Jahr, der Startort (Nr. 3) feiert nicht
    lauf(sim, 50);
    expect(sim.sicht(0).ereignisse.filter((e) => e.art === 'jahresfest').length).toBe(1);
  });
});

describe('M15 Spielstand', () => {
  it('Spielstand und Replay mitten im Grenzstein-Gang gleich; alter Spielstand ohne Grenzland lädt', () => {
    const k = baueTestKarte(false);
    const sim = zweiDoerfer(4, k);
    lauf(sim, 80);
    expect(finder(sim.sicht(0)).finder!.tut).toBe('stein');
    const zurueck = Simulation.ausStand(k, sim.stand());
    expect(zurueck.pruefsumme()).toBe(sim.pruefsumme());
    lauf(sim, 900); lauf(zurueck, 900);
    expect(zurueck.pruefsumme()).toBe(sim.pruefsumme());
    const alt = sim.stand();
    delete (alt as Partial<SimStand>).grenzland;
    for (const d of alt.doerfer) for (const key of ['funde', 'grossP', 'gewehr', 'kaffeeP', 'teile', 'helferP', 'jfestP', 'jfest', 'jfestOrt', 'abgeworben', 'verloren']) delete (d as Record<string, unknown>)[key];
    for (const g of alt.gebaeude) delete (g as Record<string, unknown>).gz;
    const geladen = Simulation.ausStand(k, alt);
    expect(grenz(geladen.sicht(0)).teile).toEqual([]);
    expect(geladen.sicht(0).grenzland!.steine).toEqual([]);
    lauf(geladen, 100);
    expect(geladen.pruefeInnenzustand()).toEqual([]);
    // Replay von Anfang an mit Grenzstein-Befehlen
    const r = new Simulation(k, 5, [A, B], MIT_GEBIET);
    r.befehl(0, 0, { art: 'gebaeude', typ: 'finderhuette', q: 3, r: 0 });
    r.befehl(2, 0, { art: 'grenzstein', id: 999, ziel: 1 });
    r.befehl(4, 1, { art: 'grenzstein', id: 1, ziel: 0 });
    lauf(r, 400);
    expect(spieleAb(k, r.protokoll(KARTE_INFO), r.tick).pruefsumme()).toBe(r.pruefsumme());
  });
});
