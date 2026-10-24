// M6: Gleichschritt über ein simuliertes (schlechtes) Netz – Befehle, Pause, Tempo, Prüfsummen, Wiederbeitritt, Verwalter.
import { describe, expect, it } from 'vitest';
import { PAUSE_MAX_MS, PAUSEN_JE_SPIELER, VERWALTER_NACH_MS, type Partie } from '../src/netz/partie';
import type { Befehl } from '../src/sim/typen';
import { wetterPlan } from '../src/sim/jahr';
import { baueTestKarte, gerade, mitBach } from './sim-szenario';
import { Simulation } from '../src/sim/sim';
import { SimKarte } from '../src/sim/karte';
import { NAHRUNG, WARE } from '../src/sim/daten';
import { STAND_ZAHLEN } from '../src/sim/stand';
import { MAI_AB } from '../src/sim/mai';
import { bisNacht } from '../src/sim/grenzland';
import { GUT, Runde, SCHLECHT } from './netz-sim';

const A = { q: 0, r: 0 }, B = { q: -6, r: 0 }, C = { q: 6, r: -12 };

function runde(n = 2, netz = SCHLECHT) {
  const r = new Runde(baueTestKarte(), [A, B, C].slice(0, n), netz);
  for (let i = 0; i < n; i++) r.starte(i);
  r.verbindeAlle();
  return r;
}
const p = (r: Runde, i: number) => r.partien[i] as Partie;
const sim = (r: Runde, i: number) => p(r, i).sim!;

/** Ein paar Bauaufträge beider Spieler. */
function bauen(r: Runde) {
  const b0: Befehl[] = [{ art: 'gebaeude', typ: 'holzfaeller', q: 9, r: 0 }, { art: 'weg', pfad: gerade(0, 0, 0, 9) }];
  const b1: Befehl[] = [{ art: 'gebaeude', typ: 'holzfaeller', q: -6, r: -3 }, { art: 'weg', pfad: gerade(-6, 0, 2, 3) }];
  for (const b of b0) p(r, 0).befehl(b);
  for (const b of b1) p(r, 1).befehl(b);
}

describe('Gleichschritt', () => {
  it('Start: der Mitspieler bekommt den Stand, beide rechnen dasselbe (schlechtes Netz)', () => {
    const r = runde();
    r.lauf(2000);
    expect(sim(r, 1)).not.toBeNull();
    expect(p(r, 1).ereignisse).toContainEqual({ art: 'neuer_stand', grund: 'start' });
    bauen(r);
    r.lauf(60_000);
    r.gleichziehen();
    for (const i of [0, 1]) expect(p(r, i).ereignisse.filter((e) => e.art === 'auseinander' || e.art === 'fehler')).toEqual([]);
    expect(sim(r, 1).tick).toBeGreaterThan(1000);
    // beide sehen beide Holzfäller
    expect(sim(r, 1).sicht(1).gebaeude.filter((g) => g.typ === 'holzfaeller').map((g) => g.sp)).toEqual([0, 1]);
    p(r, 0).pause(true);
    r.lauf(3000);
    r.gleichziehen();
    expect(sim(r, 0).tick).toBe(sim(r, 1).tick);
    expect(sim(r, 0).pruefsumme()).toBe(sim(r, 1).pruefsumme());
  });

  it('Befehle wirken nach der Verzögerung bei allen am selben Tick, auch bei Tempo 3', () => {
    const r = runde(3);
    r.lauf(1000);
    p(r, 0).setzeTempo(3);
    r.lauf(2000);
    expect(p(r, 2).tempo).toBe(3);
    p(r, 2).setzeTempo(1); // nur der Gastgeber stellt das Tempo
    r.lauf(1000);
    expect(p(r, 0).tempo).toBe(3);
    bauen(r);
    p(r, 2).befehl({ art: 'gebaeude', typ: 'wohnhaus', q: 9, r: -12 });
    r.lauf(30_000);
    const ticks = [0, 1, 2].map((i) => sim(r, i).protokoll({ version: '', q: 0, r: 0, size: '', pruefsumme: '' }).befehle.map((e) => `${e.tick}/${e.spieler}/${e.befehl.art}`));
    expect(ticks[1]).toEqual(ticks[0]);
    expect(ticks[2]).toEqual(ticks[0]);
    expect(ticks[0].length).toBe(5);
    // 30 s bei Tempo 3 sind etwa 90 Spielsekunden
    expect(sim(r, 2).tick).toBeGreaterThan(1500);
  });

  it('Pause: alle halten am selben Tick, je Spieler begrenzt, endet nach der Höchstdauer von selbst', () => {
    const r = runde();
    r.lauf(3000);
    p(r, 1).pause(true);
    r.lauf(2000);
    r.gleichziehen();
    const t = sim(r, 0).tick;
    r.lauf(5000);
    expect(sim(r, 0).tick).toBe(t);
    expect(sim(r, 1).tick).toBe(t);
    expect(p(r, 0).zug!.pause?.spieler).toBe(1);
    expect(p(r, 0).zug!.pausen).toEqual([PAUSEN_JE_SPIELER, PAUSEN_JE_SPIELER - 1]);
    // Spieler 0 (Gastgeber) darf fortsetzen
    p(r, 0).pause(false);
    r.lauf(2000);
    expect(sim(r, 1).tick).toBeGreaterThan(t);
    // die übrigen Pausen von Spieler 1 aufbrauchen; die letzte läuft von selbst aus
    for (let i = 1; i < PAUSEN_JE_SPIELER; i++) { p(r, 1).pause(true); r.lauf(1000); p(r, 1).pause(false); r.lauf(1000); }
    p(r, 1).pause(true);
    r.lauf(1000);
    expect(p(r, 1).zug!.pause).toBeNull();
    expect(p(r, 1).zug!.pausen[1]).toBe(0);
    p(r, 0).pause(true);
    r.lauf(PAUSE_MAX_MS + 3000);
    expect(p(r, 1).zug!.pause).toBeNull();
    expect(p(r, 1).angehalten).toBe(false);
  });

  it('Auseinandergelaufen: wird gemeldet und der Stand vom Taktgeber neu verteilt', () => {
    const r = runde();
    bauen(r);
    r.lauf(20_000);
    // Spieler 1 verrechnet sich (z. B. ein Fehler im Browser)
    (sim(r, 1) as unknown as { doerfer: { frei: number }[] }).doerfer[1].frei += 3;
    r.lauf(15_000);
    expect(p(r, 0).ereignisse.some((e) => e.art === 'auseinander' && e.spieler === 1)).toBe(true);
    expect(p(r, 1).ereignisse).toContainEqual({ art: 'neuer_stand', grund: 'abgleich' });
    p(r, 0).pause(true);
    r.lauf(3000);
    r.gleichziehen();
    expect(sim(r, 1).pruefsumme()).toBe(sim(r, 0).pruefsumme());
    expect(sim(r, 1).pruefeInnenzustand()).toEqual([]);
  });

  it('Neu laden: das Spiel wartet, der Spieler ist mit dem Stand vom Mitspieler schnell wieder drin', () => {
    const r = runde();
    bauen(r);
    r.lauf(20_000);
    r.trenne(1);
    r.lauf(3000);
    const t = sim(r, 0).tick;
    expect(p(r, 0).zug!.warten.map((w) => w.spieler)).toEqual([1]);
    r.lauf(5000);
    expect(sim(r, 0).tick).toBeLessThanOrEqual(t + 20); // pausiert (höchstens bis zum schon verteilten Zug)
    const t0 = r.uhr;
    const neu = r.starte(1);
    expect(neu.sim).toBeNull();
    r.verbindeAlle();
    while (!neu.sim || neu.angehalten) r.lauf(16);
    expect(r.uhr - t0).toBeLessThan(5000);
    p(r, 1).befehl({ art: 'gebaeude', typ: 'wohnhaus', q: -9, r: 3 });
    r.lauf(20_000);
    p(r, 0).pause(true);
    r.lauf(3000);
    r.gleichziehen();
    expect(sim(r, 1).pruefsumme()).toBe(sim(r, 0).pruefsumme());
    expect(sim(r, 1).sicht(1).gebaeude.some((g) => g.sp === 1 && g.typ === 'wohnhaus')).toBe(true);
  });

  it('Verwalter: nach 5 Minuten geht es ohne den Fehlenden weiter, bei Rückkehr bekommt er sein Dorf zurück', () => {
    const r = runde(2, GUT);
    bauen(r);
    r.lauf(10_000);
    r.trenne(1);
    r.lauf(VERWALTER_NACH_MS - 5000);
    const t = sim(r, 0).tick;
    r.lauf(20_000);
    expect(sim(r, 0).tick).toBeGreaterThan(t + 100);
    expect(sim(r, 0).sicht(0).spieler[1].verwalter).toBe(true);
    expect(p(r, 0).zug!.warten).toEqual([]);
    r.starte(1);
    r.verbindeAlle();
    r.lauf(5000);
    expect(sim(r, 1).sicht(1).spieler[1].verwalter).toBe(false);
    expect(sim(r, 0).sicht(0).spieler[1].verwalter).toBe(false);
    p(r, 0).pause(true);
    r.lauf(2000);
    r.gleichziehen();
    expect(sim(r, 1).pruefsumme()).toBe(sim(r, 0).pruefsumme());
  });

  it('Taktgeber fällt aus: ein anderer übernimmt (vom Vermittlungs-Server bestimmt), offene Befehle gehen nicht verloren', () => {
    const r = runde(3);
    bauen(r);
    r.lauf(10_000);
    p(r, 2).befehl({ art: 'gebaeude', typ: 'wohnhaus', q: 9, r: -12 });
    r.trenne(0);
    r.lauf(VERWALTER_NACH_MS);
    // der Server bestimmt Spieler 1 (kleinster Platz, der da ist)
    p(r, 1).taktgeberWechsel(1);
    r.lauf(1000);
    p(r, 2).taktgeberWechsel(1);
    r.lauf(30_000);
    expect(p(r, 1).istTaktgeber).toBe(true);
    expect(sim(r, 1).sicht(1).spieler[0].verwalter).toBe(true);
    expect(sim(r, 2).sicht(2).gebaeude.some((g) => g.sp === 2 && g.typ === 'wohnhaus')).toBe(true);
    p(r, 1).pause(true);
    r.lauf(3000);
    r.gleichziehen();
    expect(sim(r, 2).pruefsumme()).toBe(sim(r, 1).pruefsumme());
    // der alte Taktgeber kommt als normaler Spieler zurück
    r.starte(0, { taktgeber: 1 });
    r.verbindeAlle();
    p(r, 1).pause(false);
    r.lauf(10_000);
    expect(sim(r, 0).sicht(0).spieler[0].verwalter).toBe(false);
    p(r, 2).pause(true);
    r.lauf(3000);
    r.gleichziehen();
    expect(sim(r, 0).pruefsumme()).toBe(sim(r, 1).pruefsumme());
  });

  it('der Taktgeber lädt selbst neu: holt den Stand vom Mitspieler und gibt weiter den Takt', () => {
    const r = runde(3);
    bauen(r);
    r.lauf(15_000);
    p(r, 2).befehl({ art: 'gebaeude', typ: 'wohnhaus', q: 9, r: -12 });
    r.trenne(0);
    r.lauf(4000);
    const t0 = r.uhr;
    const neu = r.starte(0, { sim: undefined });
    r.verbindeAlle();
    while (!neu.sim || neu.angehalten) r.lauf(16);
    expect(r.uhr - t0).toBeLessThan(8000);
    expect(neu.istTaktgeber).toBe(true);
    p(r, 0).befehl({ art: 'gebaeude', typ: 'wohnhaus', q: 3, r: 3 });
    r.lauf(20_000);
    for (const i of [0, 1, 2]) expect(sim(r, i).sicht(i).gebaeude.filter((g) => g.typ === 'wohnhaus').map((g) => g.sp).sort()).toEqual([0, 2]);
    p(r, 1).pause(true);
    r.lauf(3000);
    r.gleichziehen();
    expect(sim(r, 1).pruefsumme()).toBe(sim(r, 0).pruefsumme());
    expect(sim(r, 2).pruefsumme()).toBe(sim(r, 0).pruefsumme());
  });

  it('M7: Warenverteilung und Ruhen wirken je Dorf bei allen gleich, auch nach dem Neuladen (Statistik inklusive)', () => {
    const r = runde();
    bauen(r);
    r.lauf(5000);
    p(r, 0).befehl({ art: 'verteilung', ware: 6, reihe: [3, 2, 1, 0] });
    p(r, 1).befehl({ art: 'verteilung', ware: 1, reihe: [2, 0, 1, 3] });
    r.lauf(3000);
    const hf = sim(r, 1).sicht(1).gebaeude.find((g) => g.sp === 1 && g.typ === 'holzfaeller')!;
    p(r, 1).befehl({ art: 'ruhen', id: hf.id, an: true });
    r.lauf(70_000);
    r.trenne(1);
    r.lauf(2000);
    const neu = r.starte(1);
    r.verbindeAlle();
    while (!neu.sim || neu.angehalten) r.lauf(16);
    r.lauf(5000);
    p(r, 0).pause(true);
    r.lauf(3000);
    r.gleichziehen();
    for (const i of [0, 1]) {
      const s = sim(r, i);
      expect(s.sicht(0).dorf.verteilung[6]).toEqual([3, 2, 1, 0]);
      expect(s.sicht(1).dorf.verteilung[6]).toEqual([0, 1, 2, 3]);
      expect(s.sicht(1).dorf.verteilung[1]).toEqual([2, 0, 1, 3]);
      expect(s.sicht(1).gebaeude.find((g) => g.id === hf.id)!.ruht).toBe(true);
      expect(s.statistikVon(1).punkte.length).toBeGreaterThan(1);
    }
    expect(sim(r, 1).statistikVon(0)).toEqual(sim(r, 0).statistikVon(0));
    expect(sim(r, 1).pruefsumme()).toBe(sim(r, 0).pruefsumme());
  });

  it('M8: Lagerregeln und Bauleute je Dorf, Jahreszeit und Wetter bei allen gleich, auch nach dem Neuladen', () => {
    const r = runde();
    bauen(r);
    r.lauf(3000);
    // Spieler 1 lagert Steine aus (kein zweites Lager: bleibt liegen), Spieler 0 wünscht sich Bauleute
    p(r, 1).befehl({ art: 'lagerregel', id: sim(r, 1).sicht(1).gebaeude.find((g) => g.sp === 1 && g.typ === 'lager')!.id, ware: 2, regel: 1 });
    p(r, 0).befehl({ art: 'bauleute', bauarbeiter: 6, planierer: 3 });
    r.lauf(3000);
    // im Zeitraffer über das erste Frühjahr hinaus in den Sommer (dort kommt das erste Wetter)
    p(r, 0).setzeTempo(3);
    const plan = wetterPlan((sim(r, 0) as unknown as { saat: number }).saat, 0, 1);
    const ziel = plan[0].start + 200;
    while (sim(r, 0).tick < ziel) r.lauf(5000);
    r.trenne(1);
    r.lauf(2000);
    const neu = r.starte(1);
    r.verbindeAlle();
    while (!neu.sim || neu.angehalten) r.lauf(16);
    r.lauf(3000);
    p(r, 0).pause(true);
    r.lauf(3000);
    r.gleichziehen();
    const j0 = sim(r, 0).sicht(0).jahr, j1 = sim(r, 1).sicht(1).jahr;
    expect(j0.jahreszeit).toBe(1);
    expect(j1).toEqual(j0);
    for (const i of [0, 1]) {
      const s = sim(r, i);
      expect(s.sicht(i).ereignisse.some((e) => e.art === 'jahreszeit')).toBe(true);
      expect(s.sicht(0).dorf).toMatchObject({ bauSoll: 6, planSoll: 3 });
      expect(s.sicht(1).dorf).toMatchObject({ bauSoll: 4, planSoll: 2 });
      expect(s.sicht(1).gebaeude.find((g) => g.sp === 1 && g.typ === 'lager')!.regel![2]).toBe(1);
      expect(s.sicht(0).gebaeude.find((g) => g.sp === 0 && g.typ === 'lager')!.regel![2]).toBe(0);
    }
    // die Ankündigung des ersten Wetters kam bei Spieler 0 an (vor dem Neuladen von Spieler 1)
    expect(sim(r, 0).sicht(0).ereignisse.some((e) => e.art === 'wetter' && e.wert === plan[0].art)).toBe(true);
    expect(sim(r, 1).pruefsumme()).toBe(sim(r, 0).pruefsumme());
  });

  it('M10: Gebiet und Wettlauf um einen Ort bei allen gleich, auch mit Neuladen, während die Lieferung unterwegs ist', () => {
    const karte = baueTestKarte(false);
    const ks = new SimKarte(karte);
    for (const h of [{ q: 0, r: -15 }, { q: 1, r: -15 }]) { const i = ks.index(h.q, h.r); karte.flags[i] |= 1; karte.place[i] = 4; }
    const starts = [{ q: 0, r: 0 }, { q: 0, r: -28 }];
    let start = new Simulation(karte, 99, starts, { gebiet: 1, ziel: 'normal' });
    const st = start.stand();
    for (const g of st.gebaeude) if (g.typ === 'lager') g.vorrat = (g.vorrat as number[]).map((v) => v + 30);
    start = Simulation.ausStand(karte, st);
    const r = new Runde(karte, starts, SCHLECHT);
    r.starte(0, { sim: start }); r.starte(1);
    r.verbindeAlle();
    r.lauf(2000);
    // Spieler 1 darf nicht auf Spieler 0s Gebiet bauen; beide bauen ihren Weg zum Ort
    p(r, 1).befehl({ art: 'gebaeude', typ: 'wohnhaus', q: 0, r: -3 });
    p(r, 0).befehl({ art: 'weg', pfad: gerade(0, 0, 2, 14) });
    p(r, 1).befehl({ art: 'weg', pfad: gerade(0, -28, 5, 12) });
    r.lauf(3000);
    p(r, 0).befehl({ art: 'einstand', ort: 0 });
    p(r, 1).befehl({ art: 'einstand', ort: 0 });
    r.lauf(3000);
    // Spieler 1 lädt neu, während die Lieferungen unterwegs sind
    r.trenne(1);
    r.lauf(1000);
    const neu = r.starte(1);
    r.verbindeAlle();
    while (!neu.sim || neu.angehalten) r.lauf(16);
    r.lauf(60_000);
    p(r, 0).pause(true);
    r.lauf(3000);
    r.gleichziehen();
    for (const i of [0, 1]) {
      const s = sim(r, i).sicht(i);
      expect(s.regeln.gebiet).toBe(true);
      expect(s.orte[0].besitzer).toBe(1);
      expect(s.gebaeude.some((g) => g.sp === 1 && g.typ === 'wohnhaus')).toBe(false);
      expect(p(r, i).ereignisse.filter((e) => e.art === 'auseinander' || e.art === 'fehler')).toEqual([]);
    }
    expect(sim(r, 0).sicht(0).ereignisse.some((e) => e.art === 'zu_spaet')).toBe(true);
    expect(sim(r, 1).pruefsumme()).toBe(sim(r, 0).pruefsumme());
  });

  it('M11: Völkchen je Dorf bei allen gleich – eigene Spezialkette, fremde ist gesperrt, auch nach dem Neuladen', () => {
    const karte = baueTestKarte(false);
    const starts = [{ q: 0, r: 0, voelkchen: 'monschau' }, { q: -14, r: 0, voelkchen: 'ostbelgien' }];
    const st = new Simulation(karte, 99, starts).stand();
    for (const d of st.doerfer) d.stufe = 2;
    const r = new Runde(karte, starts, SCHLECHT);
    r.starte(0, { sim: Simulation.ausStand(karte, st) }); r.starte(1);
    r.verbindeAlle();
    r.lauf(2000);
    p(r, 1).befehl({ art: 'gebaeude', typ: 'molkerei', q: -14, r: 3 });
    p(r, 1).befehl({ art: 'gebaeude', typ: 'tuchmacherei', q: -11, r: 0 });
    p(r, 0).befehl({ art: 'gebaeude', typ: 'tuchmacherei', q: 3, r: 0 });
    r.lauf(3000);
    r.trenne(1);
    r.lauf(1000);
    const neu = r.starte(1);
    r.verbindeAlle();
    while (!neu.sim || neu.angehalten) r.lauf(16);
    r.lauf(3000);
    p(r, 0).pause(true);
    r.lauf(3000);
    r.gleichziehen();
    for (const i of [0, 1]) {
      const s = sim(r, i).sicht(i);
      expect(s.spieler.map((x) => x.voelkchen)).toEqual(['monschau', 'ostbelgien']);
      expect(s.gebaeude.filter((g) => g.typ !== 'lager').map((g) => `${g.sp}:${g.typ}`).sort()).toEqual(['0:tuchmacherei', '1:molkerei']);
    }
    expect(sim(r, 1).sicht(1).dorf.kirmes!.liste[WARE.butter]).toBe(10);
    expect(sim(r, 1).pruefsumme()).toBe(sim(r, 0).pruefsumme());
  });

  it('M12: Eifelfonds zahlt dem armen Dorf bei allen gleich aus, auch nach dem Neuladen', () => {
    const karte = baueTestKarte(false);
    const starts = [{ q: 0, r: 0 }, { q: -14, r: 0 }];
    const st = new Simulation(karte, 7, starts).stand();
    // Dorf 1 ist arm dran: kein Essen im Lager
    for (const g of st.gebaeude) {
      const v = g.vorrat as number[] | undefined;
      if (v && g.sp === 1) for (let a = 0; a < v.length; a++) if (NAHRUNG[a] > 0) v[a] = 0;
    }
    const r = new Runde(karte, starts, SCHLECHT);
    r.starte(0, { sim: Simulation.ausStand(karte, st) }); r.starte(1);
    r.verbindeAlle();
    r.lauf(2000);
    p(r, 0).setzeTempo(3);
    p(r, 1).befehl({ art: 'gebaeude', typ: 'eifelfonds', q: -11, r: 0 });
    p(r, 1).befehl({ art: 'weg', pfad: gerade(-14, 0, 0, 3) });
    p(r, 0).befehl({ art: 'gebaeude', typ: 'eifelfonds', q: 3, r: 0 });
    p(r, 0).befehl({ art: 'weg', pfad: gerade(0, 0, 0, 3) });
    r.lauf(60_000);
    r.trenne(1);
    r.lauf(1000);
    const neu = r.starte(1);
    r.verbindeAlle();
    while (!neu.sim || neu.angehalten) r.lauf(16);
    r.lauf(60_000);
    p(r, 0).pause(true);
    r.lauf(3000);
    r.gleichziehen();
    for (const i of [0, 1]) {
      const s = sim(r, i);
      expect(s.sicht(1).gebaeude.filter((g) => g.typ === 'eifelfonds').map((g) => g.sp).sort()).toEqual([0, 1]);
      // nur das arme Dorf bekommt etwas
      expect(s.sicht(1).ereignisse.filter((e) => e.art === 'fonds').length).toBeGreaterThan(0);
      expect(s.sicht(0).ereignisse.filter((e) => e.art === 'fonds').length).toBe(0);
    }
    expect(sim(r, 1).pruefsumme()).toBe(sim(r, 0).pruefsumme());
  });

  it('M13: mitgebrachte Waren (Rucksack) im Startlager bei allen gleich, auch nach dem Neuladen', () => {
    const karte = baueTestKarte(false);
    const starts = [{ q: 0, r: 0, waren: { werkzeug: 4, bretter: 6 } }, { q: -14, r: 0 }];
    const r = new Runde(karte, starts, SCHLECHT);
    r.starte(0, { sim: new Simulation(karte, 11, starts) }); r.starte(1);
    r.verbindeAlle();
    r.lauf(3000);
    p(r, 0).befehl({ art: 'gebaeude', typ: 'holzfaeller', q: 6, r: 0 });
    p(r, 0).befehl({ art: 'weg', pfad: gerade(0, 0, 0, 6) });
    r.lauf(5000);
    r.trenne(1);
    r.lauf(1000);
    const neu = r.starte(1);
    r.verbindeAlle();
    while (!neu.sim || neu.angehalten) r.lauf(16);
    r.lauf(5000);
    p(r, 0).pause(true);
    r.lauf(3000);
    r.gleichziehen();
    for (const i of [0, 1]) expect(sim(r, i).startDaten()[0].waren).toEqual({ werkzeug: 4, bretter: 6 });
    expect(sim(r, 1).pruefsumme()).toBe(sim(r, 0).pruefsumme());
  });

  it('M14: Mainacht im Gleichschritt – Baum stellen, Klau, Wache und Auslöse bei allen gleich, auch nach dem Neuladen', () => {
    const karte = baueTestKarte(false);
    const starts = [{ q: 0, r: 0 }, { q: -14, r: 0 }];
    const s0 = new Simulation(karte, 31, starts);
    const gs = s0 as unknown as { karte: { index(q: number, r: number): number }; gebaeudeErzeugen(t: string, h: number, sofort: boolean, sp: number): unknown };
    gs.gebaeudeErzeugen('kirmesplatz', gs.karte.index(3, 0), true, 0);
    gs.gebaeudeErzeugen('kirmesplatz', gs.karte.index(-11, 0), true, 1);
    const st = s0.stand();
    st.zahlen[STAND_ZAHLEN.indexOf('tick')] = MAI_AB - 200;
    st.doerfer.forEach((d) => { const x = d as Record<string, number>; x.maiJungen = 4; x.frei -= 4; });
    for (const g of st.gebaeude) { const v = g.vorrat as number[] | undefined; if (v) { v[WARE.stamm] += 4; v[WARE.landbier] += 20; v[WARE.bratkartoffeln] += 10; } }
    const r = new Runde(karte, starts, SCHLECHT);
    r.starte(0, { sim: Simulation.ausStand(karte, st) }); r.starte(1);
    r.verbindeAlle();
    r.lauf(2000);
    p(r, 0).setzeTempo(3);
    while (!sim(r, 0).inMainacht()) r.lauf(100);
    p(r, 0).befehl({ art: 'mai', was: 'stellen' });
    p(r, 1).befehl({ art: 'mai', was: 'stellen' });
    p(r, 1).befehl({ art: 'mai', was: 'wache', n: 1 });
    r.lauf(1500);
    p(r, 1).befehl({ art: 'mai', was: 'klau', ziel: 0, n: 3 });
    p(r, 0).befehl({ art: 'mai', was: 'klau', ziel: 1, n: 2 });
    r.lauf(4000);
    r.trenne(1);
    r.lauf(1000);
    const neu = r.starte(1);
    r.verbindeAlle();
    while (!neu.sim || neu.angehalten) r.lauf(16);
    r.lauf(20_000);
    p(r, 1).befehl({ art: 'mai', was: 'loese' });
    p(r, 0).befehl({ art: 'mai', was: 'loese' });
    r.lauf(3000);
    p(r, 0).pause(true);
    r.lauf(3000);
    r.gleichziehen();
    for (const i of [0, 1]) {
      const s = sim(r, i).sicht(i);
      // Dorf 1 hatte eine Wache am Stamm, Dorf 0 nicht: 0 wurde beklaut und hat ausgelöst
      expect(s.spieler.map((x) => x.maibaum)).toEqual([1, 1]);
      expect(s.ereignisse.some((e) => e.art === (i === 0 ? 'maibesuch' : 'maiklau'))).toBe(true);
    }
    expect(sim(r, 0).sicht(0).ereignisse.some((e) => e.art === 'mailoese')).toBe(true);
    expect(sim(r, 1).pruefsumme()).toBe(sim(r, 0).pruefsumme());
    for (const i of [0, 1]) expect(sim(r, i).pruefeInnenzustand()).toEqual([]);
  });

  it('Holzbrücken im Gleichschritt: Weg über den Bach wartet auf die Brücke, bei allen gleich, auch nach dem Neuladen', () => {
    const karte = mitBach(baueTestKarte(), 3);
    const starts = [{ q: 0, r: 0 }, { q: -14, r: 0 }];
    const r = new Runde(karte, starts, SCHLECHT);
    r.starte(0); r.starte(1);
    r.verbindeAlle();
    r.lauf(3000);
    const pfad = sim(r, 0).wegAbschnitt({ q: 0, r: 0 }, { q: 6, r: 0 }, [], 30)!;
    p(r, 0).befehl({ art: 'weg', pfad });
    r.trenne(1);
    r.lauf(1000);
    const neu = r.starte(1);
    r.verbindeAlle();
    while (!neu.sim || neu.angehalten) r.lauf(16);
    r.lauf(8000);
    p(r, 0).pause(true);
    r.lauf(3000);
    r.gleichziehen();
    for (const i of [0, 1]) {
      const sg = sim(r, i).sicht(0).segmente.find((x) => x.sp === 0 && x.pfad.some((h) => h.q === 3))!;
      expect(sg.bruecken).toBe(0);
      expect(sim(r, i).stand().bruecken!.length).toBe(1);
    }
    expect(sim(r, 1).pruefsumme()).toBe(sim(r, 0).pruefsumme());
  });

  it('Höfe und Felder im Gleichschritt: säen, wachsen, ernten, Weg zertrampelt ein Feld – bei allen gleich, auch nach dem Neuladen', () => {
    const r = runde();
    r.lauf(1000);
    p(r, 0).setzeTempo(3);
    p(r, 0).befehl({ art: 'gebaeude', typ: 'kartoffelfeld', q: 0, r: 4 });
    p(r, 0).befehl({ art: 'weg', pfad: gerade(0, 0, 5, 4) });
    p(r, 1).befehl({ art: 'gebaeude', typ: 'kartoffelfeld', q: -6, r: -4 });
    p(r, 1).befehl({ art: 'weg', pfad: gerade(-6, 0, 2, 4) });
    r.lauf(60_000);
    // Spieler 1 lädt neu, während die Felder wachsen
    r.trenne(1);
    r.lauf(1000);
    const neu = r.starte(1);
    r.verbindeAlle();
    while (!neu.sim || neu.angehalten) r.lauf(16);
    r.lauf(30_000);
    // Spieler 1 legt einen Weg über ein Feld (wenn eins am Rand liegt)
    const s0 = sim(r, 1), k = s0.karte, nat = s0.sicht(1).natur;
    const f = [...nat.feld!.keys()].find((i) => nat.feld![i] && k.abstand(i, k.index(-6, 0)) === 2 && s0.wegAbschnitt({ q: -6, r: 0 }, { q: k.qs[i], r: k.rs[i] }, [], 4, 1));
    if (f !== undefined) p(r, 1).befehl({ art: 'weg', pfad: s0.wegAbschnitt({ q: -6, r: 0 }, { q: k.qs[f], r: k.rs[f] }, [], 4, 1)! });
    r.lauf(30_000);
    p(r, 0).pause(true);
    r.lauf(3000);
    r.gleichziehen();
    for (const i of [0, 1]) expect(p(r, i).ereignisse.filter((e) => e.art === 'auseinander' || e.art === 'fehler')).toEqual([]);
    const a = sim(r, 0), b = sim(r, 1);
    expect(b.tick).toBe(a.tick);
    expect(b.pruefsumme()).toBe(a.pruefsumme());
    expect([...b.sicht(1).natur.feld!]).toEqual([...a.sicht(0).natur.feld!]);
    expect(a.sicht(0).natur.feld!.some((v) => v > 0)).toBe(true);
    if (f !== undefined) expect(a.sicht(0).natur.feld![f]).toBe(0);
    for (const sp of [0, 1]) expect(a.sicht(sp).gebaeude.find((g) => g.sp === sp && g.typ === 'kartoffelfeld')!.erzeugt).toBeGreaterThan(0);
    expect(a.pruefeInnenzustand()).toEqual([]);
  });

  it('Wald und Wild im Gleichschritt: Jäger, Nachwuchs, Wildkatze und Herdenschutzhund bei allen gleich, auch nach dem Neuladen', () => {
    const r = runde();
    r.lauf(1000);
    p(r, 0).setzeTempo(3);
    p(r, 0).befehl({ art: 'gebaeude', typ: 'jagdhuette', q: 1, r: -1 });
    p(r, 0).befehl({ art: 'weg', pfad: gerade(0, 0, 1, 1) });
    p(r, 1).befehl({ art: 'gebaeude', typ: 'schafstall', q: -6, r: 2 });
    p(r, 1).befehl({ art: 'weg', pfad: gerade(-6, 0, 5, 2) });
    p(r, 1).befehl({ art: 'gebaeude', typ: 'herdenschutzhund', q: -4, r: 0 });
    p(r, 1).befehl({ art: 'weg', pfad: gerade(-6, 0, 0, 2) });
    r.lauf(40_000);
    r.trenne(1);
    r.lauf(1000);
    const neu = r.starte(1);
    r.verbindeAlle();
    while (!neu.sim || neu.angehalten) r.lauf(16);
    r.lauf(40_000);
    p(r, 0).pause(true);
    r.lauf(3000);
    r.gleichziehen();
    for (const i of [0, 1]) expect(p(r, i).ereignisse.filter((e) => e.art === 'auseinander' || e.art === 'fehler')).toEqual([]);
    const a = sim(r, 0), b = sim(r, 1);
    expect(b.tick).toBe(a.tick);
    expect(b.pruefsumme()).toBe(a.pruefsumme());
    const na = a.sicht(0).natur, nb = b.sicht(1).natur;
    for (const k of ['reh', 'sau', 'wolf', 'katze'] as const) expect([...nb[k]!]).toEqual([...na[k]!]);
    expect(na.reh!.some((v) => v > 0) || na.sau!.some((v) => v > 0)).toBe(true);
    expect(JSON.stringify(b.sicht(0).dorf.wild)).toBe(JSON.stringify(a.sicht(0).dorf.wild));
    expect(a.sicht(1).gebaeude.some((g) => g.sp === 1 && g.typ === 'herdenschutzhund')).toBe(true);
    expect(a.pruefeInnenzustand()).toEqual([]);
  });

  it('kaputte und fremde Nachrichten ändern nichts', () => {
    const r = runde();
    r.lauf(2000);
    const vor = sim(r, 1).tick;
    p(r, 1).empfangen(1, { t: 'zug', zug: { nr: 999, bis: 1e9, befehle: [], tempo: 3, pause: null, pausen: [], warten: [] } });
    p(r, 1).empfangen(5, { t: 'hallo' });
    p(r, 0).empfangen(1, { t: 'befehl', id: 'x', befehl: { art: 'verwalter', spieler: 0, an: true } });
    p(r, 0).empfangen(1, null as never);
    p(r, 0).empfangen(1, { t: 'tempo', tempo: 3 });
    r.lauf(2000);
    expect(p(r, 1).tempo).toBe(1);
    expect(sim(r, 1).tick).toBeLessThan(vor + 100);
    expect(sim(r, 0).sicht(0).spieler[0].verwalter).toBe(false);
  });

  it('M15: Grenzland im Gleichschritt – Grenzstein, Schmuggel am Zollhaus, Fundbüro und Abwerben bei allen gleich, auch nach dem Neuladen', () => {
    // Karte mit Natur und einem Hex Staatsgrenze nördlich von Dorf 1 (dort steht das Zollhaus)
    const karte = baueTestKarte(true);
    const sk = new SimKarte(karte);
    { const i = sk.index(-14, -8); karte.flags[i] |= 8; karte.flags[i] &= ~1; }
    const starts = [{ q: 0, r: 0 }, { q: -14, r: 0 }];
    const s0 = new Simulation(karte, 43, starts, { gebiet: 1, ziel: 'grosser_fund' });
    const gs = s0 as unknown as { karte: { index(q: number, r: number): number }; gebaeudeErzeugen(t: string, h: number, sofort: boolean, sp: number): { id: number } };
    const huette0 = gs.gebaeudeErzeugen('finderhuette', gs.karte.index(3, 0), true, 0).id;
    const huette1 = gs.gebaeudeErzeugen('finderhuette', gs.karte.index(-17, 0), true, 1).id;
    const buero1 = gs.gebaeudeErzeugen('fundbuero', gs.karte.index(-11, 0), true, 1).id;
    s0.befehl(0, 0, { art: 'weg', pfad: gerade(0, 0, 0, 3) });
    s0.befehl(0, 1, { art: 'weg', pfad: gerade(-14, 0, 3, 3) });
    s0.befehl(0, 1, { art: 'weg', pfad: gerade(-14, 0, 0, 3) });
    s0.befehl(0, 1, { art: 'weg', pfad: gerade(-14, 0, 2, 7) });
    for (let i = 0; i < 3; i++) s0.schritt();
    const st = s0.stand();
    st.zahlen[STAND_ZAHLEN.indexOf('tick')] = s0.tick + bisNacht(s0.tick) - 300;
    // Dorf 0 ist weiter (Marktflecken) und lockt die Leute von Dorf 1 herüber
    st.doerfer.forEach((d, i) => { const x = d as Record<string, number>; x.stufe = i === 0 ? 3 : 1; x.bewohner += 6; x.frei += 6; });
    for (const g of st.gebaeude) {
      const v = g.vorrat as number[] | undefined;
      if (v) for (const a of [WARE.kartoffeln, WARE.bretter, WARE.landbier]) v[a] += 20;
      if (g.id === huette0) (g as Record<string, unknown>).gz = 1;
      if (g.id === buero1) (g.puffer as number[])[WARE.kaffee] = 4;
    }
    const r = new Runde(karte, starts, SCHLECHT);
    r.starte(0, { sim: Simulation.ausStand(karte, st) }); r.starte(1);
    r.verbindeAlle();
    r.lauf(2000);
    p(r, 0).setzeTempo(3);
    expect(sim(r, 1).sicht(1).grenzland!.zoll.length).toBe(1);
    r.lauf(12_000);
    r.trenne(1);
    r.lauf(1000);
    const neu = r.starte(1);
    r.verbindeAlle();
    while (!neu.sim || neu.angehalten) r.lauf(16);
    // nach dem Neuladen: Dorf 1 will seinerseits einen Grenzstein zu Dorf 0 tragen
    p(r, 1).befehl({ art: 'grenzstein', id: huette1, ziel: 0 });
    r.lauf(90_000);
    p(r, 0).pause(true);
    r.lauf(3000);
    r.gleichziehen();
    const s = [0, 1].map((i) => sim(r, i).sicht(i));
    for (const i of [0, 1]) {
      const g = s[i].grenzland!;
      expect(JSON.stringify(g.steine)).toBe(JSON.stringify(s[0].grenzland!.steine));
      expect(s[i].spieler.map((x) => `${x.hexe}/${x.bewohner}/${x.teile}`)).toEqual(s[0].spieler.map((x) => `${x.hexe}/${x.bewohner}/${x.teile}`));
    }
    const arten = (i: number) => new Set(s[i].ereignisse.map((e) => e.art));
    // Dorf 0: der Grenzstein ist gewandert oder der Finder wurde erwischt; Dorf 1: Kaffee am Zollhaus vorbei oder erwischt
    expect(arten(0).has('grenzstein') || arten(0).has('erwischt')).toBe(true);
    expect(arten(1).has('schmuggel') || arten(1).has('erwischt')).toBe(true);
    expect(s[1].dorf.grenz!.fundbuero).toBe(true);
    expect(s[1].dorf.grenz!.kaffeeP).toBeGreaterThan(0);
    expect(s[0].dorf.grenz!.abgeworben).toBeGreaterThan(0);
    expect(s[1].dorf.grenz!.verloren).toBe(s[0].dorf.grenz!.abgeworben);
    expect(sim(r, 1).pruefsumme()).toBe(sim(r, 0).pruefsumme());
    for (const i of [0, 1]) expect(sim(r, i).pruefeInnenzustand()).toEqual([]);
  });
});
