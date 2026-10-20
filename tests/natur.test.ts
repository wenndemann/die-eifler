// M4b: Start-Natur aus Koordinaten, Bauen rodet, Arbeitsbereich (Schnittstelle M4b).
import { describe, expect, it } from 'vitest';
import { spieleAb } from '../src/sim/replay';
import { Simulation } from '../src/sim/sim';
import { SimKarte } from '../src/sim/karte';
import {
  ARBEIT_MITTE_MAX, BAUM_HEIDE_PROZENT, BAUM_MOOR_PROZENT, BAUM_WIESE_PROZENT, FELS_LESE, FELS_LESE_START, FELS_STEIL, FELS_STEIN,
  GEBAEUDE, START_STEIN_MIN, START_STEIN_RADIUS, TREE_MAX, WARE,
} from '../src/sim/daten';
import { hashHex, hashHex2 } from '../src/sim/natur';
import type { Befehl, KarteDaten, Protokoll } from '../src/sim/typen';
import { baueTestKarte, fuegeStartStein, gerade, KARTE_INFO, setzeWald } from './sim-szenario';

const START = { q: 0, r: 0, bewohner: 40 };
const neu = (saat = 1, karte: KarteDaten = baueTestKarte()) => new Simulation(karte, saat, START);
const tu = (sim: Simulation, b: Befehl) => sim.befehl(sim.tick, 0, b);
const lauf = (sim: Simulation, n: number) => { for (let i = 0; i < n; i++) sim.schritt(); };
const summe = (a: ArrayLike<number>) => { let n = 0; for (let i = 0; i < a.length; i++) n += a[i]; return n; };
const lagerVorrat = (sim: Simulation) => sim.sicht().gebaeude.find((g) => g.typ === 'lager')!.vorrat!;
const idVon = (sim: Simulation, typ: string, p: { q: number; r: number }) => sim.sicht().gebaeude.find((g) => g.typ === typ && g.q === p.q && g.r === p.r)!.id;

/** Kahle Karte mit Wald (Radius 2, ohne Mitte) um die Zentren. */
function karteMitWald(zentren: { q: number; r: number }[]): KarteDaten {
  const d = baueTestKarte(false), k = new SimKarte(d);
  for (const z of zentren) {
    for (let dq = -2; dq <= 2; dq++) for (let dr = -2; dr <= 2; dr++) {
      if ((dq === 0 && dr === 0) || Math.abs(dq + dr) > 2) continue;
      const i = k.index(z.q + dq, z.r + dr);
      if (i >= 0) setzeWald(d, i);
    }
  }
  return d;
}

describe('M4b: Start-Natur', () => {
  it('Bäume und Steine hängen nur an Karte und Hex-Koordinaten, nicht an der Saat', () => {
    const a = neu(1).sicht().natur, b = neu(99999).sicht().natur;
    expect(b.baum).toEqual(a.baum);
    expect(b.fels).toEqual(a.fels);
    expect(b.felsArt).toEqual(a.felsArt);
    expect(a.start).toEqual(a.baum);
    expect(summe(a.baum)).toBeGreaterThan(0);
  });

  it('hashHex hängt nur von (q, r) ab und streut gleichmäßig genug', () => {
    expect(hashHex(5, -3)).toBe(hashHex(5, -3));
    expect(hashHex(5, -3)).not.toBe(hashHex(-3, 5));
    expect(hashHex(5, -3)).not.toBe(hashHex2(5, -3));
    let treffer = 0;
    for (let q = -50; q < 50; q++) for (let r = -50; r < 50; r++) if (hashHex(q, r) % 100 < 12) treffer++;
    expect(treffer).toBeGreaterThan(1000); // ≈ 1200 von 10000
    expect(treffer).toBeLessThan(1400);
  });

  it('Wiese, Heide, Moor tragen nach hashHex einen Streubaum, Wald drei, Lesesteine nach hashHex2; Wasser, Ortskern, Bahn nichts', () => {
    const karte = baueTestKarte(false);
    const k = new SimKarte(karte);
    for (let i = 0; i < k.count; i++) {
      karte.flags[i] &= ~1; // Kahl-Markierung weg
      if (karte.terrain[i] === 1) karte.terrain[i] = [1, 3, 4][((k.qs[i] % 3) + 3) % 3]; // gemischtes Gelände
    }
    karte.terrain[k.index(5, 5)] = 2;
    karte.terrain[k.index(6, 5)] = 2; karte.flags[k.index(6, 5)] |= 1; // Wald im Ortskern
    const n = neu(3, karte).sicht().natur;
    expect(n.baum[k.index(5, 5)]).toBe(TREE_MAX);
    expect(n.baum[k.index(6, 5)]).toBe(0);
    const proz: Record<number, number> = { 1: BAUM_WIESE_PROZENT, 3: BAUM_HEIDE_PROZENT, 4: BAUM_MOOR_PROZENT };
    let baeume = 0, lese = 0, falsch = 0;
    for (let i = 0; i < k.count; i++) {
      const t = karte.terrain[i];
      if (t === 0 || (karte.flags[i] & 33)) { if (n.baum[i] || n.felsArt[i] === 3) falsch++; continue; }
      if (t !== 2) {
        if (n.baum[i] !== (hashHex(k.qs[i], k.rs[i]) % 100 < proz[t] ? 1 : 0)) falsch++;
        baeume += n.baum[i];
      }
      // Lesesteine nur nach hashHex2 (Moor/Heide nie); der faire Start ergänzt Haufen mit FELS_LESE_START
      if (n.felsArt[i] === 3 && n.fels[i] === FELS_LESE && (t === 3 || t === 4 || hashHex2(k.qs[i], k.rs[i]) % 100 >= 4)) falsch++;
      if (n.felsArt[i] === 3 && n.fels[i] === FELS_LESE) lese++;
    }
    expect(falsch).toBe(0);
    expect(baeume).toBeGreaterThan(150);
    expect(lese).toBeGreaterThan(20);
    expect(n.baum[k.index(0, 0)]).toBe(0);
  });

  it('Fels-Hex 80, Klippe 25 (nur begehbar, nicht Fels), Lesesteine 6; felsArt unterscheidet sie', () => {
    const karte = baueTestKarte(false);
    const k = new SimKarte(karte);
    karte.terrain[k.index(-10, 4)] = 5;
    karte.slope[k.index(-10, 4)] = 30;   // Fels bleibt Fels
    karte.slope[k.index(-10, -4)] = 25;
    karte.slope[k.index(-10, -5)] = 25; karte.terrain[k.index(-10, -5)] = 0; // Wasser bleibt ohne Stein
    const n = neu(1, karte).sicht().natur;
    expect([n.fels[k.index(-10, 4)], n.felsArt[k.index(-10, 4)]]).toEqual([FELS_STEIN, 1]);
    expect([n.fels[k.index(-10, -4)], n.felsArt[k.index(-10, -4)]]).toEqual([FELS_STEIL, 2]);
    expect([n.fels[k.index(-10, -5)], n.felsArt[k.index(-10, -5)]]).toEqual([0, 0]);
    expect([FELS_STEIN, FELS_STEIL, FELS_LESE]).toEqual([80, 25, 6]);
  });

  it('Wiesen-Streubäume sind fällbar: ein Holzfäller ohne Wald im Radius bekommt Stämme', () => {
    const sim = neu(1);
    const k = sim.karte;
    let ort: { q: number; r: number } | null = null;
    for (let q = -9; q <= -3 && !ort; q++) for (let r = -3; r <= 3 && !ort; r++) {
      const b = sim.arbeitsHexe('holzfaeller', q, r);
      const wald = b.hexe.some((h) => k.terrain[k.index(h.q, h.r)] === 2);
      if (!wald && b.summe >= 3 && sim.kannBauen('holzfaeller', q, r) && sim.wegVorschau(START, { q, r })) ort = { q, r };
    }
    expect(ort).not.toBeNull();
    const o = ort!;
    const anfang = sim.arbeitsHexe('holzfaeller', o.q, o.r).summe;
    tu(sim, { art: 'gebaeude', typ: 'holzfaeller', ...o });
    tu(sim, { art: 'weg', pfad: sim.wegVorschau(START, o)! });
    lauf(sim, 8000);
    // der Weg kann einzelne Bäume vertreiben, der Rest wird gefällt
    expect(sim.statistik().erzeugtJe[WARE.stamm]).toBeGreaterThanOrEqual(Math.min(anfang, 3) - 3);
    expect(sim.statistik().erzeugtJe[WARE.stamm]).toBeGreaterThan(0);
    expect(sim.sicht().natur.baum.reduce((x, v) => x + v, 0)).toBeLessThan(summe(sim.sicht().natur.start!));
    expect(sim.sicht().gebaeude.find((g) => g.typ === 'holzfaeller')!.zustand).not.toBe('getrennt');
    expect(sim.pruefeInnenzustand()).toEqual([]);
  });

  it('Fairer Start: mindestens 150 Stein im Umkreis 8 ums Lager, Haufen im Abstand 3..8, deterministisch', () => {
    const a = neu(1, baueTestKarte(false)), b = neu(7, baueTestKarte(false));
    const k = a.karte, n = a.sicht().natur, lager = k.index(0, 0);
    let s = 0, haufen = 0, falsch = 0;
    for (let i = 0; i < k.count; i++) {
      const d = k.abstand(lager, i);
      if (d <= START_STEIN_RADIUS) s += n.fels[i];
      if (n.fels[i] === FELS_LESE_START) { haufen++; if (d < 3 || d > START_STEIN_RADIUS || n.felsArt[i] !== 3) falsch++; }
    }
    expect(s).toBeGreaterThanOrEqual(START_STEIN_MIN);
    expect(s).toBeLessThan(START_STEIN_MIN + FELS_LESE_START);
    expect(haufen).toBe(Math.ceil(START_STEIN_MIN / FELS_LESE_START));
    expect(falsch).toBe(0);
    expect(b.sicht().natur.fels).toEqual(n.fels);
    // genug Fels in der Nähe: nichts kommt dazu
    const reich = baueTestKarte(false);
    fuegeStartStein(reich);
    const felsHexe = reich.terrain.reduce((x, t) => x + (t === 5 ? 1 : 0), 0);
    expect(summe(neu(1, reich).sicht().natur.fels)).toBe(felsHexe * FELS_STEIN);
  });
});

describe('M4b: Bauen rodet', () => {
  it('Gebäude auf Wald-Hex: Bäume weg, höchstens 2 Stämme an der Gebäudefahne, die ins Lager laufen', () => {
    const sim = neu(1, karteMitWald([{ q: 6, r: 0 }]));
    const h = sim.karte.index(6, 1);
    expect(sim.sicht().natur.baum[h]).toBe(TREE_MAX);
    expect(sim.bauplatzGroesse(6, 1)).toBe(3);
    tu(sim, { art: 'gebaeude', typ: 'wohnhaus', q: 6, r: 1 });
    lauf(sim, 1);
    expect(sim.sicht().natur.baum[h]).toBe(0);
    expect(sim.statistik().erzeugtJe[WARE.stamm]).toBe(2);
    expect(sim.sicht().fahnen.find((f) => f.q === 6 && f.r === 1)!.waren.filter((w) => w === WARE.stamm).length).toBe(2);
    expect(sim.pruefeInnenzustand()).toEqual([]);
    tu(sim, { art: 'weg', pfad: sim.wegVorschau(START, { q: 6, r: 1 })! });
    lauf(sim, 3000);
    expect(lagerVorrat(sim)[WARE.stamm]).toBe(2);
    expect(sim.pruefeInnenzustand()).toEqual([]);
  });

  it('Ein Wald-Hex gibt höchstens 2 Stämme, ein Hex ohne Baum keinen', () => {
    const karte = baueTestKarte(false);
    const k = new SimKarte(karte);
    karte.terrain[k.index(4, 0)] = 2; karte.flags[k.index(4, 0)] &= ~1; // Wald
    const sim = neu(1, karte);
    tu(sim, { art: 'gebaeude', typ: 'wohnhaus', q: 4, r: 0 });
    tu(sim, { art: 'gebaeude', typ: 'wohnhaus', q: 8, r: 0 });
    lauf(sim, 1);
    expect(sim.statistik().erzeugtJe[WARE.stamm]).toBe(2);
    expect(sim.statistik().erzeugt).toBe(2);
  });

  it('Fahne und Weg über Bäume räumen sie ohne Stämme', () => {
    const sim = neu(1, karteMitWald([{ q: 6, r: 0 }]));
    const k = sim.karte;
    tu(sim, { art: 'fahne', q: 4, r: 0 });
    lauf(sim, 1);
    tu(sim, { art: 'weg', pfad: gerade(4, 0, 0, 2) });
    lauf(sim, 1);
    expect(sim.sicht().natur.baum[k.index(5, 0)]).toBe(0);
    expect(sim.sicht().natur.baum[k.index(6, 0)]).toBe(0);
    expect(sim.statistik().erzeugtJe[WARE.stamm]).toBe(0);
    expect(sim.pruefeInnenzustand()).toEqual([]);
  });

  it('Klippe und Lesesteine gehen beim Bauen verloren, ein Fels-Hex bleibt unbebaubar', () => {
    const karte = baueTestKarte(false), kk = new SimKarte(karte);
    karte.slope[kk.index(5, 5)] = 25;
    karte.terrain[kk.index(7, 5)] = 5; karte.build[kk.index(7, 5)] = 0;
    const sim = neu(1, karte);
    const k = sim.karte;
    expect(sim.sicht().natur.fels[k.index(5, 5)]).toBe(FELS_STEIL);
    expect(sim.kannBauen('wohnhaus', 5, 5)).toBe(true);
    expect(sim.kannBauen('wohnhaus', 7, 5)).toBe(false);
    tu(sim, { art: 'gebaeude', typ: 'wohnhaus', q: 5, r: 5 });
    lauf(sim, 1);
    const n = sim.sicht().natur;
    expect(n.fels[k.index(5, 5)]).toBe(0);
    expect(n.felsArt[k.index(5, 5)]).toBe(2);   // die Art bleibt (statisch)
    expect(n.fels[k.index(7, 5)]).toBe(FELS_STEIN);
  });
});

describe('M4b: Arbeitsbereich', () => {
  /** Wald um (12,0) (Radius 2), Holzfäller bei (3,0) mit Weg: ohne Mittelpunkt außer Reichweite (Radius 4). */
  function aufbau() {
    const sim = neu(1, karteMitWald([{ q: 12, r: 0 }]));
    tu(sim, { art: 'gebaeude', typ: 'holzfaeller', q: 3, r: 0 });
    tu(sim, { art: 'weg', pfad: gerade(0, 0, 0, 3) });
    lauf(sim, 1);
    return { sim, id: idVon(sim, 'holzfaeller', { q: 3, r: 0 }) };
  }
  const mitteVon = (sim: Simulation, id: number) => sim.sicht().gebaeude.find((g) => g.id === id)!.mitte;

  it('Radius 4, innen 2; ARBEIT_MITTE_MAX 6', () => {
    for (const t of ['holzfaeller', 'foerster', 'steinbruch']) { expect(GEBAEUDE[t].radius).toBe(4); expect(GEBAEUDE[t].radiusGut).toBe(2); }
    expect(ARBEIT_MITTE_MAX).toBe(6);
  });

  it('Ohne Mittelpunkt findet der Holzfäller nichts, mit verschobenem arbeitet er dort (nur im Radius um den Mittelpunkt)', () => {
    const { sim, id } = aufbau();
    lauf(sim, 3000);
    expect(sim.sicht().gebaeude.find((g) => g.id === id)!.zustand).toBe('kein_baum');
    expect(sim.statistik().erzeugtJe[WARE.stamm]).toBe(0);
    expect(mitteVon(sim, id)).toBeUndefined();
    tu(sim, { art: 'arbeitsbereich', id, q: 9, r: 0 });
    lauf(sim, 1);
    expect(mitteVon(sim, id)).toEqual({ q: 9, r: 0 });
    const vorher = sim.sicht().natur.baum.slice();
    lauf(sim, 8000);
    const n = sim.sicht().natur;
    let gefaellt = 0, draussen = 0;
    for (let h = 0; h < n.baum.length; h++) {
      if (n.baum[h] < vorher[h]) { gefaellt += vorher[h] - n.baum[h]; if (sim.karte.abstand(h, sim.karte.index(9, 0)) > 4) draussen++; }
    }
    expect(gefaellt).toBeGreaterThan(5);
    expect(draussen).toBe(0);
    expect(sim.statistik().erzeugtJe[WARE.stamm]).toBeGreaterThan(5);
    expect(sim.pruefeInnenzustand()).toEqual([]);
  });

  it('Der Arbeiter läuft vom Gebäude zum Mittelpunkt: Das Ziel liegt im Radius um den Mittelpunkt, der erste Stamm braucht die Laufzeit', () => {
    const { sim, id } = aufbau();
    lauf(sim, 3000);
    tu(sim, { art: 'arbeitsbereich', id, q: 9, r: 0 });
    const k = sim.karte, mitte = k.index(9, 0), haus = k.index(3, 0);
    let ersterStamm = -1, zielAusserhalb = 0;
    const t0 = sim.tick;
    for (let i = 0; i < 2500; i++) {
      sim.schritt();
      const a = sim.sicht().gebaeude.find((g) => g.id === id)!.arbeiter;
      if (a?.ziel && k.abstand(mitte, k.index(a.ziel.q, a.ziel.r)) > 4) zielAusserhalb++;
      if (ersterStamm < 0 && sim.statistik().erzeugtJe[WARE.stamm] > 0) ersterStamm = sim.tick - t0;
    }
    expect(zielAusserhalb).toBe(0);
    // mindestens hin und zurück über die Entfernung zum nächsten Baum (7 Hexe) plus Fällen
    expect(k.abstand(haus, k.index(10, 0))).toBe(7);
    expect(ersterStamm).toBeGreaterThan(2 * 7 * 24);
  });

  it('Zurücksetzen mit dem Gebäude-Hex; Abriss und Neubau setzen zurück', () => {
    const { sim, id } = aufbau();
    tu(sim, { art: 'arbeitsbereich', id, q: 8, r: 0 });
    lauf(sim, 1);
    expect(mitteVon(sim, id)).toEqual({ q: 8, r: 0 });
    tu(sim, { art: 'arbeitsbereich', id, q: 3, r: 0 });
    lauf(sim, 1);
    expect(mitteVon(sim, id)).toBeUndefined();
    tu(sim, { art: 'arbeitsbereich', id, q: 8, r: 0 });
    tu(sim, { art: 'abriss_gebaeude', id });
    lauf(sim, 1);
    tu(sim, { art: 'gebaeude', typ: 'holzfaeller', q: 2, r: 3 });   // auf dem alten Hex bliebe die freie Fahne stehen
    lauf(sim, 1);
    expect(sim.sicht().gebaeude.find((g) => g.typ === 'holzfaeller')!.mitte).toBeUndefined();
  });

  it('Ungültige Befehle sind wirkungslos; höchstens ARBEIT_MITTE_MAX Hexe Abstand; auch Baustellen nehmen den Mittelpunkt an', () => {
    const { sim, id } = aufbau();
    tu(sim, { art: 'gebaeude', typ: 'wohnhaus', q: 0, r: 3 });
    lauf(sim, 1);
    const huette = idVon(sim, 'wohnhaus', { q: 0, r: 3 });
    const lager = sim.sicht().gebaeude.find((g) => g.typ === 'lager')!.id;
    const falsche: Befehl[] = [
      { art: 'arbeitsbereich', id, q: 3 + ARBEIT_MITTE_MAX + 1, r: 0 },   // zu weit
      { art: 'arbeitsbereich', id: 9999, q: 4, r: 0 },                    // kein Gebäude
      { art: 'arbeitsbereich', id: huette, q: 0, r: 4 },                  // Gebäude ohne Arbeitsradius
      { art: 'arbeitsbereich', id: lager, q: 1, r: 0 },
      { art: 'arbeitsbereich', id, q: 1000, r: 0 },                       // außerhalb des Spielfelds
      { art: 'arbeitsbereich', id, q: 3.5, r: 0 },
      { art: 'arbeitsbereich', id, q: Number.NaN, r: 0 },
    ];
    const vorher = sim.sicht().gebaeude.map((g) => g.mitte);
    for (const b of falsche) tu(sim, b);
    lauf(sim, 1);
    expect(sim.sicht().gebaeude.map((g) => g.mitte)).toEqual(vorher);
    expect(sim.sicht().gebaeude.every((g) => g.mitte === undefined)).toBe(true);
    // Rand: genau ARBEIT_MITTE_MAX gilt, auch für die Baustelle (noch nicht fertig)
    expect(sim.sicht().gebaeude.find((g) => g.id === id)!.bau).toBeLessThan(1000);
    tu(sim, { art: 'arbeitsbereich', id, q: 3 + ARBEIT_MITTE_MAX, r: 0 });
    lauf(sim, 1);
    expect(mitteVon(sim, id)).toEqual({ q: 9, r: 0 });
  });

  it('Wasser als Mittelpunkt ist ungültig', () => {
    const karte = baueTestKarte(false), k = new SimKarte(karte);
    karte.terrain[k.index(6, 0)] = 0; karte.build[k.index(6, 0)] = 0;
    const sim = neu(1, karte);
    tu(sim, { art: 'gebaeude', typ: 'holzfaeller', q: 3, r: 0 });
    lauf(sim, 1);
    const id = idVon(sim, 'holzfaeller', { q: 3, r: 0 });
    tu(sim, { art: 'arbeitsbereich', id, q: 6, r: 0 });
    lauf(sim, 1);
    expect(mitteVon(sim, id)).toBeUndefined();
  });

  it('Arbeitsbereich ist Teil der Prüfsumme und des Replays', () => {
    const a = aufbau(), b = aufbau();
    expect(a.sim.pruefsumme()).toBe(b.sim.pruefsumme());
    tu(a.sim, { art: 'arbeitsbereich', id: a.id, q: 9, r: 0 });
    lauf(a.sim, 1); lauf(b.sim, 1);
    expect(a.sim.pruefsumme()).not.toBe(b.sim.pruefsumme());
    lauf(a.sim, 3000);
    const p = JSON.parse(JSON.stringify(a.sim.protokoll(KARTE_INFO))) as Protokoll;
    expect(spieleAb(karteMitWald([{ q: 12, r: 0 }]), p).pruefsumme()).toBe(a.sim.pruefsumme());
  });
});
