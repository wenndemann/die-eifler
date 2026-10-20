// M8 in der Simulation: Bier, Schnaps, Eisen und Werkzeug, Lagerhaus mit Lagerregeln, neue Bauleute, Kirmes bis zum Marktflecken,
// kleine Feste, Jahreszeiten mit Winter, Wetter aus der Saat, beschwipste Boten, Spielstände (Drehbuch 4.5, 5.1, 5.2, 6 „Feste“, 7.4).
import { describe, expect, it } from 'vitest';
import { spieleAb } from '../src/sim/replay';
import { Simulation } from '../src/sim/sim';
import {
  AUFSAMMELN_TICKS, BOTE_TICKS, FEST_OBERGRENZE, GEBAEUDE, JAHR_TICKS, JAHRESZEIT_TICKS, KIRMES, KLEINE_FESTE, KLEINES_FEST_TICKS, SAAT_TICKS, WARE, WAREN, WETTER,
  WETTER_ANKUENDIGUNG, WINTER_ESSEN_TICKS,
} from '../src/sim/daten';
import { wetterPlan } from '../src/sim/jahr';
import { TICK_HZ } from '../src/sim/typen';
import type { Befehl } from '../src/sim/typen';
import { kopie } from '../src/sim/stand';
import { baueTestKarte, gerade, KARTE_INFO } from './sim-szenario';

const MIN = 60 * TICK_HZ;
const tu = (sim: Simulation, b: Befehl, sp = 0) => sim.befehl(sim.tick, sp, b);
const lauf = (sim: Simulation, n: number) => { for (let i = 0; i < n; i++) sim.schritt(); };
const geb = (sim: Simulation, typ: string, sp = 0) => sim.sicht(sp).gebaeude.find((g) => g.typ === typ && g.sp === sp)!;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const innen = (sim: Simulation) => sim as any;
/** Fertiges Gebäude sofort hinstellen (Test-Abkürzung über die innere Fabrik). */
const fertig = (sim: Simulation, typ: string, q: number, r: number, sp = 0): number => innen(sim).gebaeudeErzeugen(typ, innen(sim).karte.index(q, r), true, sp).id;
/** Vorrat des Dorfkerns (Lager-Id 1 im Einzelspiel). */
const vorrat = (sim: Simulation, id = 1): number[] => innen(sim).gebaeude.get(id).vorrat;
/** Zeit vorspulen: Tick setzen (nur in Tests, Befehle gibt es dann keine mehr dazwischen). */
const springe = (sim: Simulation, tick: number) => { innen(sim)._tick = tick; };
/** Alle Waren einer Art im Dorf: Lager, Puffer, an Fahnen und bei Trägern. */
const alleWaren = (sim: Simulation, a: number) => {
  const s = sim.sicht();
  return s.gebaeude.reduce((n, g) => n + (g.vorrat?.[a] ?? 0) + (g.puffer?.[a] ?? 0), 0) + s.fahnen.reduce((n, f) => n + f.waren.filter((w) => w === a).length, 0)
    + s.traeger.filter((t) => t.ware === a).length;
};
const ohneFehler = (sim: Simulation) => expect(sim.pruefeInnenzustand()).toEqual([]);

describe('Bier, Schnaps, Eisen und Werkzeug (Drehbuch 5.1)', () => {
  it('Gerstenfeld → Brauerei → Landbier und Wacholderheide → Brennerei → Schnaps', () => {
    const sim = new Simulation(baueTestKarte(false), 1, { q: 0, r: 0, bewohner: 30 });
    fertig(sim, 'gerstenfeld', 4, 0); fertig(sim, 'brauerei', -4, 0);
    fertig(sim, 'wacholderheide', 0, 4); fertig(sim, 'brennerei', 0, -4);
    for (const d of [0, 2, 3, 5]) tu(sim, { art: 'weg', pfad: gerade(0, 0, d, 4) });
    lauf(sim, 4 * MIN);
    const e = sim.sicht().dorf.erzeugt;
    expect(e[WARE.landbier]).toBeGreaterThan(0);
    expect(e[WARE.schnaps]).toBeGreaterThan(0);
    expect(GEBAEUDE.brauerei.abStufe).toBe(1);
    ohneFehler(sim);
  });

  it('Fachkräfte fangen erst mit Werkzeug an; Köhlerei, Eisenhütte (zwei Zutaten) und Schmiede machen Werkzeug', () => {
    const sim = new Simulation(baueTestKarte(false), 1, { q: 0, r: 0, bewohner: 30 });
    vorrat(sim)[WARE.stamm] = 30;
    fertig(sim, 'erzgrube', 4, 0); fertig(sim, 'koehlerei', 4, -4); fertig(sim, 'eisenhuette', 0, -4); fertig(sim, 'schmiede', -4, 0);
    for (const d of [0, 1, 2, 3]) tu(sim, { art: 'weg', pfad: gerade(0, 0, d, 4) });
    lauf(sim, 60);
    expect(geb(sim, 'erzgrube').zustand).toBe('kein_werkzeug');
    expect(geb(sim, 'schmiede').zustand).not.toBe('kein_werkzeug');
    vorrat(sim)[WARE.werkzeug] = 2;
    lauf(sim, 8 * MIN);
    expect(geb(sim, 'erzgrube').zustand).not.toBe('kein_werkzeug');
    const e = sim.sicht().dorf.erzeugt;
    for (const w of ['erz', 'holzkohle', 'eisen', 'werkzeug']) expect(e[WARE[w]], w).toBeGreaterThan(0);
    expect(GEBAEUDE.eisenhuette.wandelt!.ein.map((z) => WAREN[z.a]).sort()).toEqual(['erz', 'holzkohle']);
    ohneFehler(sim);
  });

  it('Abriss: das Werkzeug der Fachkraft kommt an die Fahne', () => {
    const sim = new Simulation(baueTestKarte(false), 1, { q: 0, r: 0, bewohner: 30 });
    const id = fertig(sim, 'erzgrube', 4, 0);
    tu(sim, { art: 'weg', pfad: gerade(0, 0, 0, 4) });
    vorrat(sim)[WARE.werkzeug] = 1;
    lauf(sim, 2 * MIN);
    expect(geb(sim, 'erzgrube').zustand).not.toBe('kein_werkzeug');
    tu(sim, { art: 'abriss_gebaeude', id });
    lauf(sim, 2 * MIN);
    expect(vorrat(sim)[WARE.werkzeug]).toBe(1);
    ohneFehler(sim);
  });
});

describe('Lagerhaus und Lagerregeln (Drehbuch 6.2, ROADMAP M8)', () => {
  /** Dorfkern (0,0), Lagerhaus (6,0) mit Weg, Holzfäller am Wald (5,-2). */
  function mitLagerhaus() {
    const sim = new Simulation(baueTestKarte(true), 1, { q: 0, r: 0, bewohner: 30 });
    const lh = fertig(sim, 'lagerhaus', 6, 0);
    tu(sim, { art: 'weg', pfad: gerade(0, 0, 0, 6) });
    tu(sim, { art: 'fahne', q: 3, r: 0 });
    fertig(sim, 'holzfaeller', 3, -2);
    lauf(sim, 1);
    tu(sim, { art: 'weg', pfad: sim.wegVorschau({ q: 3, r: -2 }, { q: 3, r: 0 })! });
    lauf(sim, 2);
    return { sim, lh };
  }

  it('nicht einlagern: neue Stämme gehen ins Lagerhaus statt in den Dorfkern', () => {
    const { sim, lh } = mitLagerhaus();
    tu(sim, { art: 'lagerregel', id: 1, ware: WARE.stamm, regel: 1 });
    lauf(sim, 4 * MIN);
    expect(geb(sim, 'lager').regel![WARE.stamm]).toBe(1);
    expect(vorrat(sim)[WARE.stamm]).toBe(0);
    expect(vorrat(sim, lh)[WARE.stamm]).toBeGreaterThan(0);
    ohneFehler(sim);
  });

  it('auslagern: der Bestand wandert ins Lagerhaus; Abriss bringt ihn zurück', () => {
    const { sim, lh } = mitLagerhaus();
    tu(sim, { art: 'lagerregel', id: 1, ware: WARE.stein, regel: 2 });
    tu(sim, { art: 'lagerregel', id: 1, ware: WARE.stein, regel: 7 }); // ungültig
    tu(sim, { art: 'lagerregel', id: 99, ware: WARE.stein, regel: 0 });
    lauf(sim, 4 * MIN);
    expect(vorrat(sim)[WARE.stein]).toBe(0);
    expect(vorrat(sim, lh)[WARE.stein]).toBe(8);
    ohneFehler(sim);
    tu(sim, { art: 'abriss_gebaeude', id: lh });
    lauf(sim, 20);
    expect(vorrat(sim)[WARE.stein]).toBe(8);
    // was ein Träger gerade zum Lagerhaus trägt, wird an der nächsten Fahne neu geroutet (wie bei jedem Abriss)
    expect(sim.pruefeInnenzustand().filter((x) => !x.includes('ungültigem Ziel'))).toEqual([]);
    lauf(sim, 2 * MIN);
    ohneFehler(sim);
  });

  it('fremde Lager sind tabu, das Lagerhaus gibt es erst ab Dorf', () => {
    const sim = new Simulation(baueTestKarte(false), 1, [{ q: 0, r: 0 }, { q: -9, r: 0 }]);
    tu(sim, { art: 'lagerregel', id: 1, ware: WARE.stein, regel: 2 }, 1);
    lauf(sim, 2);
    expect(geb(sim, 'lager').regel![WARE.stein]).toBe(0);
    expect(sim.sperrGrund('lagerhaus')).toBe('stufe');
  });
});

describe('Neue Bauarbeiter und Planierer aus Werkzeug (Drehbuch 4.5)', () => {
  it('Wunschzahl: aus Werkzeug und freiem Bewohner wird ein Bauarbeiter bzw. Planierer', () => {
    const sim = new Simulation(baueTestKarte(false), 1, { q: 0, r: 0, bewohner: 20 });
    vorrat(sim)[WARE.werkzeug] = 3;
    tu(sim, { art: 'bauleute', bauarbeiter: 6, planierer: 3 });
    tu(sim, { art: 'bauleute', bauarbeiter: -1, planierer: 3 }, 0); // ungültig, ändert nichts
    lauf(sim, 2 * MIN);
    const d = sim.sicht().dorf;
    expect(d.bauSoll).toBe(6); expect(d.planSoll).toBe(3);
    expect(d.bauarbeiter.gesamt).toBe(6);
    expect(d.planierer.gesamt).toBe(3);
    expect(d.bewohner).toBe(17);
    expect(vorrat(sim)[WARE.werkzeug]).toBe(0);
    expect(sim.sicht().ereignisse.filter((e) => e.art === 'bauleute').length).toBe(3);
    ohneFehler(sim);
  });
});

describe('Kirmes bis zum Marktflecken (Drehbuch 5.2)', () => {
  it('Dorf → Kirchdorf (Geschenk 2 Werkzeug, Eisen frei) → Marktflecken mit Mischkorb', () => {
    const sim = new Simulation(baueTestKarte(false), 1, { q: 0, r: 0 });
    innen(sim).doerfer[0].stufe = 1;
    fertig(sim, 'kirmesplatz', -4, 0);
    tu(sim, { art: 'weg', pfad: gerade(0, 0, 3, 4) });
    const v = vorrat(sim);
    KIRMES[1].liste.forEach((n, a) => { v[a] += n; });
    expect(sim.sperrGrund('erzgrube')).toBe('stufe');
    let s = sim.sicht();
    for (let i = 0; i < 15 * MIN && s.dorf.stufe < 2; i++) { sim.schritt(); if (i % 20 === 0) s = sim.sicht(); }
    lauf(sim, KIRMES[1].festTicks + 5);
    s = sim.sicht();
    expect(s.dorf.stufe).toBe(2);
    expect(alleWaren(sim, WARE.werkzeug)).toBe(2); // Geschenk; der Kirmesplatz holt es schon für den Marktflecken
    expect(sim.sperrGrund('erzgrube')).toBe('');
    // Marktflecken: Bergkäse (Platzhalter für die Spezialität), Werkzeug, Mischkorb aus 20 veredelten Waren. Werkzeug holt der Platz
    // erst, wenn das Dorf selbst welches geschmiedet hat
    expect(s.dorf.kirmes!.mischkorb.soll).toBe(20);
    KIRMES[2].liste.forEach((n, a) => { vorrat(sim)[a] += n; });
    Object.assign(vorrat(sim), { [WARE.most]: 12, [WARE.schnaps]: 6, [WARE.kartoffeln]: 30 });
    lauf(sim, 3 * MIN);
    expect(alleWaren(sim, WARE.werkzeug) - vorrat(sim)[WARE.werkzeug]).toBe(0);
    innen(sim).doerfer[0].erzeugt[WARE.werkzeug] = 1;
    let gesehen = 0;
    for (let i = 0; i < 12 * MIN && sim.sicht().dorf.stufe < 3; i++) {
      sim.schritt();
      if (i % 50 === 0) gesehen = Math.max(gesehen, sim.sicht().dorf.kirmes?.mischkorb.da ?? 0);
    }
    expect(sim.sicht().dorf.stufe).toBe(2); // Most und Schnaps reichen nicht: 18 von 20, Kartoffeln zählen nicht
    expect(gesehen).toBe(18);
    vorrat(sim)[WARE.honig] += 2;
    for (let i = 0; i < 6 * MIN && sim.sicht().dorf.stufe < 3; i++) sim.schritt();
    lauf(sim, KIRMES[2].festTicks + 5);
    expect(sim.sicht().dorf.stufe).toBe(3);
    expect(sim.sicht().dorf.kirmes).toBeNull();
    ohneFehler(sim);
  });
});

describe('Kleine Feste (Drehbuch 6 „Feste“)', () => {
  it('nur in ihrer Jahreszeit, einmal je Spieljahr, Punkte bis zur Obergrenze', () => {
    const sim = new Simulation(baueTestKarte(false), 1, { q: 0, r: 0 });
    innen(sim).doerfer[0].stufe = 3; // ohne Kirmes, damit nur das Fest Waren zieht
    fertig(sim, 'kirmesplatz', -4, 0);
    tu(sim, { art: 'weg', pfad: gerade(0, 0, 3, 4) });
    const mai = KLEINE_FESTE.findIndex((f) => f.id === 'maifest');
    expect(sim.sicht().dorf.fest!.nr).toBe(mai);
    Object.assign(vorrat(sim), { [WARE.landbier]: 20, [WARE.bratkartoffeln]: 20 });
    for (let i = 0; i < 4 * MIN && sim.sicht().dorf.festPunkte === 0; i++) sim.schritt();
    let s = sim.sicht();
    expect(s.dorf.festPunkte).toBe(KLEINE_FESTE[mai].punkte);
    expect(s.ereignisse.some((e) => e.art === 'kleines_fest' && e.wert === mai)).toBe(true);
    lauf(sim, 4 * MIN);
    expect(sim.sicht().dorf.festPunkte).toBe(KLEINE_FESTE[mai].punkte); // nicht zweimal im Jahr
    expect(sim.sicht().dorf.fest).toBeNull();
    // Sommer: Viehmarkt; nahe an der Obergrenze gibt es nur den Rest
    springe(sim, JAHRESZEIT_TICKS);
    innen(sim).doerfer[0].festPunkte = FEST_OBERGRENZE - 5;
    Object.assign(vorrat(sim), { [WARE.kaese]: 6, [WARE.milch]: 6, [WARE.honig]: 4 });
    for (let i = 0; i < 4 * MIN && sim.sicht().dorf.festPunkte < FEST_OBERGRENZE; i++) sim.schritt();
    expect(sim.sicht().dorf.festPunkte).toBe(FEST_OBERGRENZE);
    // nächstes Jahr wieder Maifest
    springe(sim, JAHR_TICKS + 10);
    lauf(sim, KLEINES_FEST_TICKS + 2);
    s = sim.sicht();
    expect(s.dorf.fest!.nr).toBe(mai);
    ohneFehler(sim);
  });
});

describe('Jahreszeiten (Drehbuch 7.4)', () => {
  it('Felder ruhen im Winter, werden im Frühjahr gesät, die Jahreszeit wird gemeldet', () => {
    const sim = new Simulation(baueTestKarte(false), 1, { q: 0, r: 0, bewohner: 20 });
    fertig(sim, 'kartoffelfeld', 4, 0);
    tu(sim, { art: 'weg', pfad: gerade(0, 0, 0, 4) });
    lauf(sim, 30);
    expect(sim.sicht().jahr).toMatchObject({ jahr: 0, jahreszeit: 0 });
    springe(sim, 3 * JAHRESZEIT_TICKS - 5);
    lauf(sim, 10);
    expect(sim.sicht().jahr.jahreszeit).toBe(3);
    expect(sim.sicht().ereignisse.some((e) => e.art === 'jahreszeit' && e.wert === 3)).toBe(true);
    const vorher = geb(sim, 'kartoffelfeld').erzeugt;
    lauf(sim, 2 * MIN);
    expect(geb(sim, 'kartoffelfeld').zustand).toBe('winter');
    expect(geb(sim, 'kartoffelfeld').erzeugt).toBe(vorher);
    springe(sim, JAHR_TICKS);
    lauf(sim, 10);
    expect(geb(sim, 'kartoffelfeld').zustand).toBe('saat');
    lauf(sim, SAAT_TICKS);
    expect(geb(sim, 'kartoffelfeld').zustand).not.toBe('saat');
    ohneFehler(sim);
  });

  it('Winter: das Dorf isst aus dem Lager; fehlt Essen, frieren die Leute (kein Nachwuchs), mit Vorrat geht es wieder', () => {
    const sim = new Simulation(baueTestKarte(false), 1, { q: 0, r: 0, bewohner: 30 });
    springe(sim, 3 * JAHRESZEIT_TICKS);
    expect(vorrat(sim)[WARE.kartoffeln]).toBe(8);
    lauf(sim, WINTER_ESSEN_TICKS + 1);
    expect(vorrat(sim)[WARE.kartoffeln]).toBe(5); // 30 Bewohner: 3 je Mahlzeit
    expect(sim.sicht().dorf.friert).toBe(false);
    lauf(sim, 2 * WINTER_ESSEN_TICKS);
    expect(sim.sicht().dorf.friert).toBe(true);
    expect(sim.sicht().ereignisse.some((e) => e.art === 'friert')).toBe(true);
    expect(innen(sim).tempoProzent(innen(sim).gebaeude.get(1), GEBAEUDE.kueche)).toBeLessThan(0);
    vorrat(sim)[WARE.honig] = 10;
    lauf(sim, WINTER_ESSEN_TICKS);
    expect(sim.sicht().dorf.friert).toBe(false);
    expect(vorrat(sim)[WARE.honig]).toBe(7);
    expect(sim.sicht().dorf.bewohner).toBe(30); // niemand geht verloren
    ohneFehler(sim);
  });
});

describe('Wetter aus der Saat (Drehbuch 7.4)', () => {
  it('Plan: im ersten Frühjahr nichts, sonst 1–2 Ereignisse der Jahreszeit, innerhalb der Jahreszeit, gleiche Saat gleiches Wetter', () => {
    expect(wetterPlan(5, 0, 0)).toEqual([]);
    let ereignisse = 0;
    for (let jahr = 0; jahr < 3; jahr++) {
      for (let jz = 0; jz < 4; jz++) {
        const p = wetterPlan(5, jahr, jz);
        expect(p).toEqual(wetterPlan(5, jahr, jz));
        if (jahr === 0 && jz === 0) continue;
        expect(p.length).toBeGreaterThanOrEqual(1);
        ereignisse += p.length;
        const beginn = jahr * JAHR_TICKS + jz * JAHRESZEIT_TICKS;
        for (const e of p) {
          expect(e.start).toBeGreaterThanOrEqual(beginn);
          expect(e.ende).toBeLessThanOrEqual(beginn + JAHRESZEIT_TICKS);
          expect(new Set(p.map((x) => x.art)).size).toBe(p.length);
        }
      }
    }
    expect(ereignisse).toBeGreaterThan(11);
    expect(JSON.stringify(wetterPlan(6, 1, 1))).not.toBe(JSON.stringify(wetterPlan(5, 1, 1)) + 'x');
  });

  it('Im Mehrspieler trifft das Wetter alle gleich und wird bei allen angekündigt', () => {
    const sim = new Simulation(baueTestKarte(false), 77, [{ q: 0, r: 0 }, { q: -9, r: 0 }]);
    const e = wetterPlan(77, 0, 1)[0];
    springe(sim, e.start - WETTER_ANKUENDIGUNG - 2);
    lauf(sim, 4);
    for (const sp of [0, 1]) expect(sim.sicht(sp).ereignisse.some((x) => x.art === 'wetter' && x.wert === e.art), `Spieler ${sp}`).toBe(true);
    expect(sim.sicht(0).jahr.kommt.map((x) => x.art)).toContain(e.art);
    springe(sim, e.start + 5);
    lauf(sim, 2);
    expect(sim.sicht(0).jahr).toEqual(sim.sicht(1).jahr);
    expect(sim.sicht(0).jahr.wetter.map((x) => x.art)).toContain(e.art);
  });

  it('Hochwasser: an Fahnen in der Aue schwimmen Waren davon, Gebäude bleiben; Dürre bremst Felder, Regen treibt sie an', () => {
    let saat = 1;
    while (!wetterPlan(saat, 1, 0).some((e) => WETTER[e.art].hochwasser)) saat++;
    const sim = new Simulation(baueTestKarte(false), saat, { q: 0, r: 0 });
    const k = innen(sim).karte;
    const ufer = k.index(-15, 11);
    expect(innen(sim).lageAue[ufer]).toBe(1);
    expect(innen(sim).lageAue[k.index(0, 0)]).toBe(0);
    const f = innen(sim).fahneSetzen(ufer, 0);
    for (let i = 0; i < 5; i++) f.waren.push({ art: WARE.stein, ziel: 0 });
    const hw = wetterPlan(saat, 1, 0).find((e) => WETTER[e.art].hochwasser)!;
    springe(sim, hw.start - 1);
    lauf(sim, 3);
    expect(f.waren.length).toBe(5 - WETTER[hw.art].wegschwimmen);
    ohneFehler(sim);
    // Wirkung auf Felder (Prozent: − langsamer, + schneller)
    const feld = { h: 0, sp: 0, typ: 'kartoffelfeld' };
    const t = GEBAEUDE.kartoffelfeld;
    innen(sim).felderP = WETTER.find((w) => w.id === 'duerre')!.felder; innen(sim).arbeitP = [0, 0, 0, 0];
    expect(innen(sim).tempoProzent(feld, t)).toBeLessThan(0);
    innen(sim).felderP = WETTER.find((w) => w.id === 'regen')!.felder;
    expect(innen(sim).tempoProzent(feld, t)).toBeGreaterThan(0);
  });
});

describe('Beschwipste Boten (DESIGN §10.3, Drehbuch 7.1)', () => {
  it('Schänke macht aus Schnaps Boten, die querfeldein zu weiten Baustellen tragen; nach dem Rausch zurück in den Vorrat', () => {
    const sim = new Simulation(baueTestKarte(false), 3, { q: 0, r: 0, bewohner: 30 });
    vorrat(sim)[WARE.schnaps] = 4;
    fertig(sim, 'schaenke', -3, 0);
    tu(sim, { art: 'weg', pfad: gerade(0, 0, 3, 3) });
    tu(sim, { art: 'gebaeude', typ: 'wohnhaus', q: 0, r: -12 });
    tu(sim, { art: 'weg', pfad: gerade(0, 0, 2, 12) });
    for (let i = 3; i < 12; i += 3) tu(sim, { art: 'fahne', q: 0, r: -i });
    let botenMax = 0, botenTragen = false;
    for (let i = 0; i < 6 * MIN; i++) {
      sim.schritt();
      if (i % 10) continue;
      const s = sim.sicht();
      botenMax = Math.max(botenMax, s.boten.length);
      if (s.boten.some((b) => b.ware >= 0 && b.tut === 'geht')) botenTragen = true;
      if (i % 200 === 0) ohneFehler(sim);
    }
    expect(botenMax).toBeGreaterThan(0);
    expect(botenMax).toBeLessThanOrEqual(GEBAEUDE.schaenke.boten);
    expect(botenTragen).toBe(true);
    expect(geb(sim, 'wohnhaus').bau).toBe(1000);
    lauf(sim, BOTE_TICKS + MIN);
    expect(sim.sicht().boten.length).toBe(0);
    const d = sim.sicht().dorf;
    expect(d.frei + d.traeger + d.arbeiter).toBe(d.bewohner);
    ohneFehler(sim);
  });

  it('torkeln: Umwege, aber jeder Schritt zum Nachbarn und am Ende das Ziel; Verlorenes liest ein Bewohner auf', () => {
    const sim = new Simulation(baueTestKarte(false), 9, { q: 0, r: 0 });
    const k = innen(sim).karte;
    const a = k.index(0, 0), b = k.index(10, -3);
    let umweg = 0;
    for (let i = 0; i < 20; i++) {
      const p: number[] = innen(sim).torkelPfad(a, b);
      expect(p[0]).toBe(a); expect(p[p.length - 1]).toBe(b);
      for (let j = 1; j < p.length; j++) expect(k.abstand(p[j - 1], p[j])).toBe(1);
      if (p.length - 1 > k.abstand(a, b)) umweg++;
    }
    expect(umweg).toBeGreaterThan(5);
    innen(sim).liegend.push({ h: k.index(5, 0), art: WARE.stein, sp: 0, bis: sim.tick + AUFSAMMELN_TICKS, bote: 0 });
    expect(sim.sicht().liegend).toEqual([{ q: 5, r: 0, ware: WARE.stein, sp: 0 }]);
    lauf(sim, AUFSAMMELN_TICKS + 40);
    expect(sim.sicht().liegend).toEqual([]);
    expect(vorrat(sim)[WARE.stein]).toBe(9);
  });
});

describe('Spielstand und Determinismus mit M8', () => {
  function szenario() {
    const sim = new Simulation(baueTestKarte(false), 4, { q: 0, r: 0, bewohner: 30 });
    vorrat(sim)[WARE.schnaps] = 4;
    vorrat(sim)[WARE.werkzeug] = 2;
    tu(sim, { art: 'gebaeude', typ: 'schaenke', q: -3, r: 0 });
    tu(sim, { art: 'weg', pfad: gerade(0, 0, 3, 3) });
    tu(sim, { art: 'gebaeude', typ: 'wohnhaus', q: 0, r: -12 });
    tu(sim, { art: 'weg', pfad: gerade(0, 0, 2, 12) });
    tu(sim, { art: 'bauleute', bauarbeiter: 5, planierer: 3 });
    tu(sim, { art: 'lagerregel', id: 1, ware: WARE.stein, regel: 1 });
    innen(sim).doerfer[0].stufe = 1;
    return sim;
  }

  it('Boten, Feste, Winter und Regeln überstehen Speichern und Laden; Replay gibt dieselbe Prüfsumme', () => {
    const sim = szenario();
    lauf(sim, 3 * MIN);
    const st = JSON.parse(JSON.stringify(sim.stand()));
    const neu = Simulation.ausStand(baueTestKarte(false), st);
    expect(neu.pruefsumme()).toBe(sim.pruefsumme());
    lauf(sim, 2 * MIN); lauf(neu, 2 * MIN);
    expect(neu.pruefsumme()).toBe(sim.pruefsumme());
    expect(neu.sicht()).toEqual(sim.sicht());
    // Wintersprung über den Spielstand: Jahreszeit kommt allein aus dem Tick
    const w = kopie(sim.stand());
    w.zahlen[0] = 3 * JAHRESZEIT_TICKS + 10;
    expect(Simulation.ausStand(baueTestKarte(false), w).sicht().jahr.jahreszeit).toBe(3);
  });

  it('Replay einer Partie mit Befehlen lagerregel und bauleute', () => {
    const sim = new Simulation(baueTestKarte(false), 4, { q: 0, r: 0, bewohner: 30 });
    tu(sim, { art: 'bauleute', bauarbeiter: 5, planierer: 3 });
    tu(sim, { art: 'lagerregel', id: 1, ware: WARE.stein, regel: 1 });
    tu(sim, { art: 'gebaeude', typ: 'wohnhaus', q: 0, r: -4 });
    tu(sim, { art: 'weg', pfad: gerade(0, 0, 2, 4) });
    lauf(sim, 3 * MIN);
    const r = spieleAb(baueTestKarte(false), sim.protokoll(KARTE_INFO));
    expect(r.pruefsumme()).toBe(sim.pruefsumme());
  });

  it('Spielstände von vor M8 (12 Waren, ohne Feste, Regeln, Boten) laden mit Standardwerten', () => {
    const sim = new Simulation(baueTestKarte(false), 1, { q: 0, r: 0 });
    tu(sim, { art: 'verteilung', ware: WARE.kaese, reihe: [3, 2, 1, 0] });
    lauf(sim, 2 * MIN);
    const st = kopie(sim.stand());
    const n = 12;
    const kurz = (a: unknown) => (a as number[]).slice(0, n);
    for (const d of st.doerfer) {
      for (const k of ['bauSoll', 'planSoll', 'festJahr', 'kfest', 'kfestNr', 'festPunkte', 'friert', 'winterT', 'botenWunsch']) delete d[k];
      d.vert = (d.vert as number[]).slice(0, n * 4); d.erzeugt = kurz(d.erzeugt);
      d.statPunkte = (d.statPunkte as number[][]).map((p) => [...p.slice(0, 4), ...p.slice(4, 4 + n), ...p.slice(4 + WAREN.length, 4 + WAREN.length + n)]);
    }
    for (const g of st.gebaeude) {
      delete g.regel;
      for (const k of ['verbaut', 'puffer', 'incoming', 'ausgang', 'vorrat', 'stapel']) g[k] = kurz(g[k]);
    }
    st.erzeugtJe = kurz(st.erzeugtJe);
    delete st.boten; delete st.liegend;
    const alt = Simulation.ausStand(baueTestKarte(false), st);
    const s = alt.sicht();
    expect(s.dorf.verteilung[WARE.kaese]).toEqual([3, 2, 1, 0]);
    expect(s.dorf.verteilung.length).toBe(WAREN.length);
    expect(s.dorf).toMatchObject({ bauSoll: 4, planSoll: 2, festPunkte: 0, friert: false });
    expect(geb(alt, 'lager').regel).toEqual(WAREN.map(() => 0));
    expect(geb(alt, 'lager').vorrat![WARE.bretter]).toBe(vorrat(sim)[WARE.bretter]);
    expect(alt.statistikVon(0).punkte[0].length).toBe(4 + 2 * WAREN.length);
    ohneFehler(alt);
    lauf(alt, 100);
    ohneFehler(alt);
  });
});
