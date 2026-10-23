// Wege selbst führen: offener Weg (reine Logik) und die Teilstück-Abfrage der Simulation (wegAbschnitt).
import { describe, expect, it } from 'vitest';
import { OffenerWeg, WEG_MAX, naechsteSchritte, nachbarn, type Hx } from '../src/spiel/logik';
import { Simulation } from '../src/sim/sim';
import { FLAG } from '../src/welt/format';
import { baueTestKarte, gerade } from './sim-szenario';

const neuSim = () => new Simulation(baueTestKarte(), 1, { q: 0, r: 0, bewohner: 40 });
const lauf = (sim: Simulation, n: number) => { for (let i = 0; i < n; i++) sim.schritt(); };

describe('OffenerWeg', () => {
  it('beginnt am Start, hängt Teilstücke an und nimmt Zwischenpunkte zurück', () => {
    const w = new OffenerWeg();
    expect(w.aktiv).toBe(false);
    w.beginne({ q: 0, r: 0 });
    expect(w.schritte).toBe(0);
    expect(w.haengeAn(gerade(0, 0, 0, 2))).toBe(true);
    expect(w.haengeAn([{ q: 2, r: 0 }, { q: 2, r: 1 }])).toBe(true);
    expect(w.schritte).toBe(3);
    expect(w.zwischenpunkte).toEqual([{ q: 2, r: 0 }, { q: 2, r: 1 }]);
    expect(w.letzter).toEqual({ q: 2, r: 1 });
    expect(w.zurueck()).toBe(true);
    expect(w.letzter).toEqual({ q: 2, r: 0 });
    expect(w.schritte).toBe(2);
    expect(w.zurueck()).toBe(true);
    expect(w.zurueck()).toBe(false);
    expect(w.pfad).toEqual([{ q: 0, r: 0 }]);
  });

  it('lehnt falsche Teilstücke ab', () => {
    const w = new OffenerWeg();
    w.beginne({ q: 0, r: 0 });
    w.haengeAn(gerade(0, 0, 0, 2));
    expect(w.haengeAn([{ q: 5, r: 5 }, { q: 6, r: 5 }])).toBe(false);          // beginnt nicht am letzten Punkt
    expect(w.haengeAn([{ q: 2, r: 0 }, { q: 4, r: 0 }])).toBe(false);          // Lücke
    expect(w.haengeAn([{ q: 2, r: 0 }, { q: 1, r: 0 }])).toBe(false);          // schon benutzt
    expect(w.haengeAn([{ q: 2, r: 0 }])).toBe(false);                           // zu kurz
    expect(w.schritte).toBe(2);
  });

  it('begrenzt die Gesamtlänge auf WEG_MAX Schritte', () => {
    const w = new OffenerWeg();
    w.beginne({ q: 0, r: 0 });
    expect(w.haengeAn(gerade(0, 0, 0, WEG_MAX - 1))).toBe(true);
    expect(w.rest).toBe(1);
    expect(w.haengeAn([{ q: WEG_MAX - 1, r: 0 }, { q: WEG_MAX - 1, r: 1 }, { q: WEG_MAX - 2, r: 2 }])).toBe(false);
    expect(w.haengeAn([{ q: WEG_MAX - 1, r: 0 }, { q: WEG_MAX - 1, r: 1 }])).toBe(true);
    expect(w.rest).toBe(0);
    expect(naechsteSchritte(w, () => [])).toEqual([]);
  });

  it('leeren beendet den Weg', () => {
    const w = new OffenerWeg();
    w.beginne({ q: 1, r: 1 });
    w.leeren();
    expect(w.aktiv).toBe(false);
    expect(w.letzter).toBeNull();
  });

  it('nachbarn liefert sechs verschiedene Nachbarn', () => {
    const n = nachbarn({ q: 3, r: 4 });
    expect(new Set(n.map((h) => `${h.q},${h.r}`)).size).toBe(6);
  });
});

describe('wegAbschnitt (Simulation)', () => {
  const von: Hx = { q: 0, r: 0 };

  it('findet ein Teilstück zu einem freien Hex, auch ohne Fahne am Start', () => {
    const sim = neuSim();
    const a = sim.wegAbschnitt({ q: 3, r: 0 }, { q: 6, r: 0 }, [], 60)!;
    expect(a[0]).toEqual({ q: 3, r: 0 });
    expect(a[a.length - 1]).toEqual({ q: 6, r: 0 });
    expect(a.length).toBe(4);
  });

  it('ein Nachbar ergibt genau einen Schritt', () => {
    const sim = neuSim();
    expect(sim.wegAbschnitt({ q: 3, r: 0 }, { q: 4, r: 0 }, [], 1)).toEqual([{ q: 3, r: 0 }, { q: 4, r: 0 }]);
  });

  it('sperrt belegte Hexe und weicht aus', () => {
    const sim = neuSim();
    const belegt = gerade(0, 0, 0, 3).slice(1, 3); // (1,0), (2,0)
    const a = sim.wegAbschnitt(von, { q: 4, r: 0 }, belegt, 60)!;
    expect(a).not.toBeNull();
    expect(a.some((h) => belegt.some((b) => b.q === h.q && b.r === h.r))).toBe(false);
    expect(a.length).toBeGreaterThan(5);
  });

  it('Ziel unter den belegten Hexen oder Start gleich Ziel: null', () => {
    const sim = neuSim();
    expect(sim.wegAbschnitt(von, { q: 3, r: 0 }, [{ q: 3, r: 0 }], 60)).toBeNull();
    expect(sim.wegAbschnitt(von, von, [], 60)).toBeNull();
  });

  it('achtet auf Schrittgrenze, Wasser und Gebäude', () => {
    const sim = neuSim();
    expect(sim.wegAbschnitt({ q: 0, r: 0 }, { q: 10, r: 0 }, [], 5)).toBeNull();
    expect(sim.wegAbschnitt({ q: 0, r: 0 }, { q: 10, r: 0 }, [], 10)).not.toBeNull();
    expect(sim.wegAbschnitt({ q: -10, r: 8 }, { q: -15, r: 8 }, [], 60)).toBeNull(); // Wasser
    sim.befehl(sim.tick, 0, { art: 'gebaeude', typ: 'holzfaeller', q: 4, r: 0 });
    lauf(sim, 1);
    expect(sim.wegAbschnitt(von, { q: 4, r: 0 }, [], 60)).not.toBeNull(); // Ziel: die Fahne des Gebäudes
    const a = sim.wegAbschnitt(von, { q: 8, r: 0 }, [], 60)!;
    expect(a.some((h) => h.q === 4 && h.r === 0)).toBe(false);
  });

  it('kein Weg von der Fahne nach hinten durchs Haus', () => {
    const sim = neuSim();
    sim.befehl(sim.tick, 0, { art: 'gebaeude', typ: 'holzfaeller', q: 4, r: 0 });
    lauf(sim, 1);
    // hinter dem Haus (Richtung −r) liegen (4, −1) und (5, −1): vom Gebäude aus kein direkter Schritt dorthin
    const nachHinten = sim.wegAbschnitt({ q: 4, r: 0 }, { q: 4, r: -3 }, [], 60)!;
    expect(nachHinten).not.toBeNull();
    const erster = nachHinten[1];
    expect(erster.r === -1 && (erster.q === 4 || erster.q === 5)).toBe(false);
    // neues Haus am Start (Bot, Vorschau): auch dort nicht nach hinten
    const neu = sim.wegAbschnitt({ q: 0, r: 4 }, { q: 0, r: 1 }, [], 60, 0, true)!;
    expect(neu[1].r === 3 && (neu[1].q === 0 || neu[1].q === 1)).toBe(false);
  });

  it('Wege kreuzen Bäche quer und laufen nicht an ihnen entlang', () => {
    const karte = baueTestKarte();
    // ein Bach entlang q = −5 (eine zusammenhängende Hex-Linie in r-Richtung)
    let i = 0;
    for (let r = -karte.n; r <= karte.n; r++) for (let q = Math.max(-karte.n, -r - karte.n); q <= Math.min(karte.n, -r + karte.n); q++, i++) if (q === -5 && r >= -12 && r <= 12) karte.flags[i] |= FLAG.fluss;
    const sim = new Simulation(karte, 1, { q: 0, r: 0, bewohner: 40 });
    const bach = (h: Hx) => h.q === -5 && h.r >= -12 && h.r <= 12;
    const pruefe = (p: Hx[]) => {
      for (let j = 1; j < p.length - 1; j++) { // der letzte Schritt ans Ziel ist frei
        expect(bach(p[j - 1]) && bach(p[j])).toBe(false);                          // nie von Bach-Hex zu Bach-Hex
        if (bach(p[j])) expect(bach({ q: 2 * p[j].q - p[j - 1].q, r: 2 * p[j].r - p[j - 1].r })).toBe(false); // geradeaus dahinter kein Bach
      }
    };
    const quer = sim.wegAbschnitt({ q: -8, r: 0 }, { q: -2, r: 0 }, [], 60)!;
    expect(quer).not.toBeNull();
    expect(quer.filter(bach).length).toBe(1);
    pruefe(quer);
    // entlang: von einem Bach-Hex zum anderen geht es nur neben dem Bach her
    const lang = sim.wegAbschnitt({ q: -5, r: -6 }, { q: -5, r: 6 }, [], 60)!;
    expect(lang).not.toBeNull();
    expect(lang.filter(bach).length).toBeLessThanOrEqual(3);
    pruefe(lang);
    // Ziel im Bach (Lager am Wasser): von überall erreichbar, auch längs des Bachs
    const karte2 = baueTestKarte();
    let k2 = 0;
    for (let r = -karte2.n; r <= karte2.n; r++) for (let q = Math.max(-karte2.n, -r - karte2.n); q <= Math.min(karte2.n, -r + karte2.n); q++, k2++) if (q === 0 && r >= -12 && r <= 12) karte2.flags[k2] |= FLAG.fluss;
    const sim2 = new Simulation(karte2, 1, { q: 0, r: 0, bewohner: 40 });
    for (const von of [{ q: 3, r: 0 }, { q: -3, r: 0 }, { q: 2, r: 3 }, { q: -1, r: -3 }]) expect(sim2.wegAbschnitt(von, { q: 0, r: 0 }, [], 12)).not.toBeNull();
  });

  it('Teilstücke zusammen ergeben einen baubaren Weg; ein Weg-Hex ist ein gültiges Ende', () => {
    const sim = neuSim();
    const w = new OffenerWeg();
    w.beginne(von);
    for (const ziel of [{ q: 1, r: 0 }, { q: 2, r: 1 }, { q: 4, r: 1 }]) {
      const s = sim.wegAbschnitt(w.letzter!, ziel, w.pfad, w.rest)!;
      expect(s).not.toBeNull();
      expect(w.haengeAn(s)).toBe(true);
    }
    expect(w.zwischenpunkte.length).toBe(3);
    sim.befehl(sim.tick, 0, { art: 'weg', pfad: w.pfad });
    lauf(sim, 1);
    const sg = sim.sicht().segmente;
    expect(sg.length).toBe(1);
    expect(sg[0].pfad).toEqual(w.pfad);
    expect(sim.sicht().fahnen.some((f) => f.q === 4 && f.r === 1)).toBe(true);
    const innen = sg[0].pfad[2];
    const z = sim.wegAbschnitt({ q: 4, r: 1 }, innen, [], 60);
    expect(z).not.toBeNull();
    expect(z![z!.length - 1]).toEqual(innen);
  });

  it('naechsteSchritte meldet nur gültige Nachbarn', () => {
    const sim = neuSim();
    sim.befehl(sim.tick, 0, { art: 'weg', pfad: gerade(0, 0, 0, 3) });
    lauf(sim, 1);
    const w = new OffenerWeg();
    w.beginne({ q: 3, r: 0 });
    const belegt = w.pfad;
    const frage = (a: Hx, b: Hx) => sim.wegAbschnitt(a, b, belegt, 1);
    const n = naechsteSchritte(w, frage);
    expect(n.some((h) => h.q === 4 && h.r === 0)).toBe(true);
    sim.befehl(sim.tick, 0, { art: 'gebaeude', typ: 'holzfaeller', q: 4, r: 0 });
    lauf(sim, 1);
    const n2 = naechsteSchritte(w, frage);
    expect(n2.some((h) => h.q === 4 && h.r === 0)).toBe(true); // Gebäudefahne ist als Ende gültig
    // ein Wegstück darüber hinaus darf nicht durch sie laufen
    expect(sim.wegAbschnitt({ q: 3, r: 0 }, { q: 5, r: 0 }, [], 60)!.some((h) => h.q === 4 && h.r === 0)).toBe(false);
  });
});
