// M6: Gleichschritt über ein simuliertes (schlechtes) Netz – Befehle, Pause, Tempo, Prüfsummen, Wiederbeitritt, Verwalter.
import { describe, expect, it } from 'vitest';
import { PAUSE_MAX_MS, PAUSEN_JE_SPIELER, VERWALTER_NACH_MS, type Partie } from '../src/netz/partie';
import type { Befehl } from '../src/sim/typen';
import { wetterPlan } from '../src/sim/jahr';
import { baueTestKarte, gerade } from './sim-szenario';
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
});
