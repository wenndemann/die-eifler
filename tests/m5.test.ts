// M5: Bewohner, Nahrung, Planierer und Bauarbeiter, Ketten der Stufe Weiler, Kirmes (Drehbuch 4.3–4.5, 5.2; DESIGN §5).
import { describe, expect, it } from 'vitest';
import { spieleAb } from '../src/sim/replay';
import { Simulation } from '../src/sim/sim';
import { SimKarte } from '../src/sim/karte';
import {
  BAU_JE_WARE, GEBAEUDE, KIRMES, NAHRUNG_ZYKLUS, NOTNAGEL_TICKS, START_BAUARBEITER, START_BEWOHNER, START_PLANIERER, WARE,
} from '../src/sim/daten';
import { TICK_HZ } from '../src/sim/typen';
import type { Befehl, KarteDaten, Protokoll } from '../src/sim/typen';
import { baueTestKarte, gerade, KARTE_INFO } from './sim-szenario';
import { baueM5Karte, spieleM5 } from './m5-szenario';

const MIN = 60 * TICK_HZ;
const tu = (sim: Simulation, b: Befehl) => sim.befehl(sim.tick, 0, b);
const lauf = (sim: Simulation, n: number) => { for (let i = 0; i < n; i++) sim.schritt(); };
const lager = (sim: Simulation) => (sim as any).gebaeude.get(1) as { vorrat: number[] };
const geb = (sim: Simulation, typ: string) => sim.sicht().gebaeude.find((g) => g.typ === typ)!;

/** Testkarte, auf der die Hexe mit q ≥ 3 und r === 0 steil sind (Planierer nötig). */
function karteMitHang(): KarteDaten {
  const k = baueTestKarte(false);
  const s = new SimKarte(k);
  for (let q = 3; q <= 6; q++) k.slope[s.index(q, 0)] = 10;
  return k;
}

describe('Start (Drehbuch 4.2, 4.5)', () => {
  it('10 Bewohner, 4 Bauarbeiter, 2 Planierer, Wohnraum 10 im Dorfkern', () => {
    const sim = new Simulation(baueTestKarte(), 1, { q: 0, r: 0 });
    const d = sim.sicht().dorf;
    expect(START_BEWOHNER).toBe(10);
    expect(d).toMatchObject({ stufe: 0, bewohner: 10, frei: 10, wohnraum: 10, bauarbeiter: { gesamt: 4, frei: 4 }, planierer: { gesamt: 2, frei: 2 } });
    expect(START_BAUARBEITER).toBe(4);
    expect(START_PLANIERER).toBe(2);
    expect(d.kirmes!.liste[WARE.bratkartoffeln]).toBe(10);
    expect(d.kirmes!.liste[WARE.most]).toBe(10);
    expect(d.kirmes!.liste[WARE.kaese]).toBe(6);
  });
});

describe('Planierer und Bauarbeiter (Drehbuch 4.5)', () => {
  it('Träger legen nur ab, der Bauarbeiter verbaut Stück für Stück (je Ware BAU_JE_WARE)', () => {
    const sim = new Simulation(baueTestKarte(false), 1, { q: 0, r: 0, bewohner: 20 });
    tu(sim, { art: 'gebaeude', typ: 'wohnhaus', q: 3, r: 0 });
    tu(sim, { art: 'weg', pfad: gerade(0, 0, 0, 3) });
    let stapelGesehen = false, bauarbeiterGesehen = false, letzterBau = 0, letzterSprung = -1, minAbstand = Infinity;
    for (let i = 0; i < 3000; i++) {
      sim.schritt();
      const s = sim.sicht();
      const g = s.gebaeude.find((x) => x.typ === 'wohnhaus')!;
      if (g.stapel && g.stapel.some((n) => n > 0)) stapelGesehen = true;
      if (s.bauleute.some((b) => b.beruf === 'bauarbeiter' && b.tut === 'arbeitet')) bauarbeiterGesehen = true;
      if (g.bau !== letzterBau) {
        if (letzterSprung >= 0) minAbstand = Math.min(minAbstand, sim.tick - letzterSprung);
        letzterSprung = sim.tick; letzterBau = g.bau;
      }
      if (g.bau === 1000) break;
    }
    expect(stapelGesehen).toBe(true);
    expect(bauarbeiterGesehen).toBe(true);
    expect(letzterBau).toBe(1000);
    expect(minAbstand).toBeGreaterThanOrEqual(BAU_JE_WARE);
    // fertig: der Bauarbeiter geht heim, keine Planierer nötig (eben)
    lauf(sim, 600);
    const s = sim.sicht();
    expect(s.bauleute.length).toBe(0);
    expect(s.dorf.bauarbeiter.frei).toBe(4);
    expect(s.dorf.planierer.frei).toBe(2);
    expect(sim.pruefeInnenzustand()).toEqual([]);
  });

  it('am Hang kommt erst der Planierer, dann der Bauarbeiter', () => {
    const sim = new Simulation(karteMitHang(), 1, { q: 0, r: 0, bewohner: 20 });
    tu(sim, { art: 'gebaeude', typ: 'wohnhaus', q: 3, r: 0 });
    tu(sim, { art: 'weg', pfad: gerade(0, 0, 0, 3) });
    lauf(sim, 2);
    expect(geb(sim, 'wohnhaus').planiert).toBe(0);
    let planierFertig = -1, ersterBau = -1, planierer = false;
    const zustaende = new Set<string>();
    for (let i = 0; i < 4000 && geb(sim, 'wohnhaus').bau < 1000; i++) {
      sim.schritt();
      const s = sim.sicht();
      const g = s.gebaeude.find((x) => x.typ === 'wohnhaus')!;
      zustaende.add(g.zustand);
      if (s.bauleute.some((b) => b.beruf === 'planierer' && b.tut === 'arbeitet')) planierer = true;
      if (planierFertig < 0 && g.planiert === 1000) planierFertig = sim.tick;
      if (ersterBau < 0 && g.bau > 0) ersterBau = sim.tick;
      if (g.planiert !== undefined && g.planiert < 1000) expect(g.bau).toBe(0);
    }
    expect(planierer).toBe(true);
    expect(zustaende.has('planieren')).toBe(true);
    expect(planierFertig).toBeGreaterThan(0);
    expect(ersterBau).toBeGreaterThan(planierFertig);
    expect(geb(sim, 'wohnhaus').bau).toBe(1000);
    expect(sim.pruefeInnenzustand()).toEqual([]);
  });

  it('höchstens 4 Bauarbeiter gleichzeitig; Priorität entscheidet, wer zuerst drankommt', () => {
    const sim = new Simulation(baueTestKarte(false), 1, { q: 0, r: 0, bewohner: 40 });
    lager(sim).vorrat.fill(0);
    const plaetze = [[3, 0], [6, 0], [-3, 0], [-6, 0], [0, 3], [0, 6]];
    for (const [q, r] of plaetze) tu(sim, { art: 'gebaeude', typ: 'wohnhaus', q, r });
    tu(sim, { art: 'weg', pfad: gerade(0, 0, 0, 3) }); tu(sim, { art: 'weg', pfad: gerade(3, 0, 0, 3) });
    tu(sim, { art: 'weg', pfad: gerade(0, 0, 3, 3) }); tu(sim, { art: 'weg', pfad: gerade(-3, 0, 3, 3) });
    tu(sim, { art: 'weg', pfad: gerade(0, 0, 5, 3) }); tu(sim, { art: 'weg', pfad: gerade(0, 3, 5, 3) });
    lauf(sim, 1);
    // Material liegt schon an allen sechs Baustellen (wie nach einer langen Lieferung); die letzte bekommt Priorität 3
    const ids = sim.sicht().gebaeude.filter((g) => g.typ === 'wohnhaus').map((g) => g.id);
    for (const id of ids) (sim as any).gebaeude.get(id).stapel = GEBAEUDE.wohnhaus.kosten.slice();
    tu(sim, { art: 'prioritaet', id: ids[5], stufe: 3 });
    lauf(sim, 4);
    expect(sim.sicht().bauleute.filter((b) => b.ziel === ids[5]).length).toBe(1);
    let max = 0;
    for (let i = 0; i < 6000; i++) {
      sim.schritt();
      const s = sim.sicht();
      const n = s.bauleute.filter((b) => b.beruf === 'bauarbeiter').length;
      max = Math.max(max, n);
      expect(n + s.dorf.bauarbeiter.frei).toBe(4);
      if (s.gebaeude.every((g) => g.bau === 1000)) break;
    }
    expect(max).toBe(4);
    expect(sim.sicht().gebaeude.every((g) => g.bau === 1000)).toBe(true);
    expect(sim.pruefeInnenzustand()).toEqual([]);
  });

  it('Abriss einer Baustelle schickt die Bauleute heim, der Stapel landet an der Fahne', () => {
    const sim = new Simulation(karteMitHang(), 1, { q: 0, r: 0, bewohner: 20 });
    tu(sim, { art: 'gebaeude', typ: 'wohnhaus', q: 3, r: 0 });
    tu(sim, { art: 'weg', pfad: gerade(0, 0, 0, 3) });
    while (!sim.sicht().bauleute.some((b) => b.tut === 'arbeitet')) sim.schritt();
    tu(sim, { art: 'abriss_gebaeude', id: geb(sim, 'wohnhaus').id });
    lauf(sim, 1);
    expect(sim.pruefeInnenzustand().filter((x) => !x.includes('ungültigem Ziel'))).toEqual([]);
    expect(sim.sicht().bauleute.every((b) => b.ziel === 0)).toBe(true);
    lauf(sim, 1500);
    const s = sim.sicht();
    expect(s.bauleute.length).toBe(0);
    expect(s.dorf.planierer.frei).toBe(2);
    expect(s.dorf.bauarbeiter.frei).toBe(4);
    expect(sim.pruefeInnenzustand()).toEqual([]);
  });
});

describe('Wohnhaus, Nahrung, Notnagel (Drehbuch 4.3; DESIGN §5)', () => {
  function mitWohnhaus(bewohner = 10) {
    const sim = new Simulation(baueTestKarte(false), 1, { q: 0, r: 0, bewohner });
    tu(sim, { art: 'gebaeude', typ: 'wohnhaus', q: 3, r: 0 });
    tu(sim, { art: 'weg', pfad: gerade(0, 0, 0, 3) });
    lauf(sim, 1);
    while (geb(sim, 'wohnhaus').bau < 1000) sim.schritt();
    return sim;
  }

  it('Essen im Lager bringt neue Bewohner bis zum Wohnraum (Dorfkern 10 + Wohnhaus 8)', () => {
    const sim = mitWohnhaus();
    expect(sim.sicht().dorf.wohnraum).toBe(18);
    lager(sim).vorrat[WARE.kartoffeln] = 20;
    lauf(sim, 5 * MIN);
    const d = sim.sicht().dorf;
    expect(d.bewohner).toBe(18);
    expect(geb(sim, 'wohnhaus').zustand).toBe('wohnraum_voll');
    expect(sim.sicht().ereignisse.filter((e) => e.art === 'bewohner').length).toBe(8);
    expect(sim.pruefeInnenzustand()).toEqual([]);
  });

  it('besseres Essen geht schneller: Honig 9 s, Kartoffeln 14 s je Bewohner', () => {
    const takt = (ware: number) => {
      const sim = mitWohnhaus();
      lager(sim).vorrat.fill(0);
      lager(sim).vorrat[ware] = 8;
      lauf(sim, 3 * MIN);
      const t = sim.sicht().ereignisse.filter((e) => e.art === 'bewohner').map((e) => e.tick);
      return t[3] - t[2];
    };
    expect(takt(WARE.honig)).toBe(NAHRUNG_ZYKLUS[2]);
    expect(takt(WARE.kartoffeln)).toBe(NAHRUNG_ZYKLUS[1]);
    expect(NAHRUNG_ZYKLUS[2]).toBeLessThan(NAHRUNG_ZYKLUS[1]);
  });

  it('Notnagel: ohne Essen und mit weniger als 4 freien Bewohnern kommt alle 30 s ein Zugezogener', () => {
    const sim = new Simulation(baueTestKarte(false), 1, { q: 0, r: 0, bewohner: 2 });
    lager(sim).vorrat.fill(0);
    lauf(sim, 1);
    expect(sim.sicht().dorf.notnagel).toBeGreaterThan(0);
    lauf(sim, NOTNAGEL_TICKS * 2 + 2);
    expect(sim.sicht().dorf.bewohner).toBe(4);
    lauf(sim, NOTNAGEL_TICKS * 3);
    // ab 4 freien Bewohnern ist Schluss
    expect(sim.sicht().dorf.bewohner).toBe(4);
    expect(sim.sicht().dorf.notnagel).toBe(-1);
    expect(sim.sicht().ereignisse.filter((e) => e.art === 'notnagel').length).toBe(2);
  });

  it('Notnagel auch bei Essen im Lager, wenn es kein Wohnhaus gibt: man fährt sich nicht fest', () => {
    const sim = new Simulation(baueTestKarte(false), 1, { q: 0, r: 0, bewohner: 1 });
    expect(lager(sim).vorrat[WARE.kartoffeln]).toBe(8);
    lauf(sim, NOTNAGEL_TICKS + 2);
    expect(sim.sicht().dorf.bewohner).toBe(2);
  });
});

describe('Ketten der Stufe Weiler (Drehbuch 5.1)', () => {
  it('Kartoffelfeld → Küche → Bratkartoffeln, Obstwiese → Mostkeller → Most, Schafstall → Käserei → Käse, Bienenstock → Honig', () => {
    const sim = new Simulation(baueTestKarte(false), 1, { q: 0, r: 0, bewohner: 40 });
    lager(sim).vorrat[WARE.bretter] = 60; lager(sim).vorrat[WARE.stein] = 40;
    const bau: [string, number, number][] = [['kartoffelfeld', 3, 0], ['kueche', 6, 0], ['obstwiese', -3, 0], ['mostkeller', -6, 0],
      ['schafstall', 0, 3], ['kaeserei', 0, 6], ['bienenstock', 3, -3]];
    for (const [typ, q, r] of bau) tu(sim, { art: 'gebaeude', typ, q, r });
    tu(sim, { art: 'weg', pfad: gerade(0, 0, 0, 3) }); tu(sim, { art: 'weg', pfad: gerade(3, 0, 0, 3) });
    tu(sim, { art: 'weg', pfad: gerade(0, 0, 3, 3) }); tu(sim, { art: 'weg', pfad: gerade(-3, 0, 3, 3) });
    tu(sim, { art: 'weg', pfad: gerade(0, 0, 5, 3) }); tu(sim, { art: 'weg', pfad: gerade(0, 3, 5, 3) });
    tu(sim, { art: 'weg', pfad: gerade(0, 0, 1, 3) });
    lauf(sim, 15 * MIN);
    const e = sim.statistik().erzeugtJe;
    for (const w of ['kartoffeln', 'bratkartoffeln', 'aepfel', 'most', 'milch', 'kaese', 'honig']) expect(e[WARE[w]], w).toBeGreaterThan(2);
    expect(e[WARE.bratkartoffeln] * 2).toBeLessThanOrEqual(e[WARE.kartoffeln] + 8); // 8 Kartoffeln lagen schon im Lager
    expect(e[WARE.most] * 2).toBeLessThanOrEqual(e[WARE.aepfel]);
    expect(sim.pruefeInnenzustand()).toEqual([]);
  });
});

describe('Kirmes und Dorfstufe (Drehbuch 5.2)', () => {
  function mitKirmesplatz() {
    const sim = new Simulation(baueTestKarte(false), 1, { q: 0, r: 0, bewohner: 20 });
    expect(sim.kannBauen('reifekeller', 3, 0)).toBe(false);
    expect(sim.sperrGrund('reifekeller')).toBe('stufe');
    tu(sim, { art: 'gebaeude', typ: 'kirmesplatz', q: 3, r: 0 });
    tu(sim, { art: 'weg', pfad: gerade(0, 0, 0, 3) });
    lauf(sim, 1);
    expect(sim.kannBauen('kirmesplatz', -3, 0)).toBe(false);
    expect(sim.sperrGrund('kirmesplatz')).toBe('einmalig');
    while (geb(sim, 'kirmesplatz').bau < 1000) sim.schritt();
    return sim;
  }

  it('Warenliste liefern → Fest → Dorf, Freischaltung Reifekeller, Zuzug', () => {
    const sim = mitKirmesplatz();
    expect(geb(sim, 'kirmesplatz').zustand).toBe('wartet_material');
    const k = KIRMES[0];
    for (let a = 0; a < k.liste.length; a++) lager(sim).vorrat[a] += k.liste[a];
    let fest = -1;
    for (let i = 0; i < 6 * MIN && fest < 0; i++) {
      sim.schritt();
      if (sim.sicht().dorf.kirmes!.fest > 0) fest = sim.tick;
    }
    expect(fest).toBeGreaterThan(0);
    expect(geb(sim, 'kirmesplatz').zustand).toBe('fest');
    const vorher = sim.sicht().dorf.bewohner;
    lauf(sim, k.festTicks + 2);
    const d = sim.sicht().dorf;
    expect(d.stufe).toBe(1);
    expect(d.kirmes!.liste[WARE.landbier]).toBe(KIRMES[1].liste[WARE.landbier]); // nächste Stufe: Dorf → Kirchdorf
    expect(d.bewohner).toBe(vorher + k.zuzug);
    expect(sim.sperrGrund('reifekeller')).toBe('');
    expect(sim.kannBauen('reifekeller', -3, 0)).toBe(true);
    expect(sim.sicht().ereignisse.map((e) => e.art)).toEqual(expect.arrayContaining(['kirmes', 'stufe', 'zuzug']));
    expect(GEBAEUDE.reifekeller.abStufe).toBe(1);
    expect(sim.pruefeInnenzustand()).toEqual([]);
  });

  it('Wohnhäuser essen nicht weg, was die Kirmes noch braucht', () => {
    const sim = new Simulation(baueTestKarte(false), 1, { q: 0, r: 0, bewohner: 10 });
    lager(sim).vorrat.fill(0);
    lager(sim).vorrat[WARE.bretter] = 20; lager(sim).vorrat[WARE.stein] = 10;
    lager(sim).vorrat[WARE.kaese] = 6; lager(sim).vorrat[WARE.kartoffeln] = 3;
    tu(sim, { art: 'gebaeude', typ: 'wohnhaus', q: 3, r: 0 });
    tu(sim, { art: 'weg', pfad: gerade(0, 0, 0, 3) });
    lauf(sim, 4 * MIN);
    // die 6 Käse sind genau die Kirmes-Liste: gegessen werden nur die Kartoffeln
    expect(lager(sim).vorrat[WARE.kaese]).toBe(6);
    expect(sim.sicht().dorf.bewohner).toBe(13);
    lager(sim).vorrat[WARE.kaese] = 8;
    lauf(sim, 2 * MIN);
    expect(lager(sim).vorrat[WARE.kaese]).toBe(6);
  });
});

describe('Abnahme M5: Die ersten 30 Minuten (Spieltest-Bot)', () => {
  const l = spieleM5(45);

  it('Kirmes nach 15–40 Spielminuten, danach ist das Dorf eine Stufe weiter', () => {
    const min = (t: number) => (t / MIN).toFixed(1);
    console.log(`M5-Bot: Kirmes ab Minute ${min(l.kirmesTick)}, Dorf ab Minute ${min(l.dorfTick)}; Bewohner je Minute ${l.bewohner.join(',')}; ` +
      `Aufträge ${l.auftraege.map((a) => `${min(a.tick)} ${a.typ}`).join(', ')}; zweite Wege ${l.zweiteWege}`);
    expect(l.kirmesTick).toBeGreaterThan(15 * MIN);
    expect(l.kirmesTick).toBeLessThan(40 * MIN);
    expect(l.dorfTick).toBeGreaterThan(l.kirmesTick);
    const s = l.sim.sicht();
    expect(s.dorf.stufe).toBe(1);
    expect(s.dorf.bauarbeiter).toEqual({ gesamt: 4, frei: s.dorf.bauarbeiter.frei });
    expect(l.sim.pruefeInnenzustand()).toEqual([]);
    // Planierer waren am Hang im Einsatz (die Karte hat Hänge um (-4,-4))
    expect(l.auftraege.length).toBeGreaterThan(12);
  });

  it('Replay ergibt dieselbe Prüfsumme', () => {
    const p = JSON.parse(JSON.stringify(l.protokoll)) as Protokoll;
    expect(p.karte).toEqual(KARTE_INFO);
    expect(spieleAb(baueM5Karte(), p).pruefsumme()).toBe(l.sim.pruefsumme());
  });
});
