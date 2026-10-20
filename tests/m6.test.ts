// Abnahme M6 (ROADMAP): Zwei Spieler an verschiedenen Orten bauen jeder ein Dorf bis zur ersten Kirmes, ohne Auseinanderlaufen.
// Einer lädt die Seite neu und ist in unter 30 Sekunden wieder drin. Hier ohne Browser über das simulierte schlechte Netz; der
// Browser-Test mit zwei Fenstern steht in tests/mehrspieler.mjs.
import { describe, expect, it } from 'vitest';
import { Simulation } from '../src/sim/sim';
import { spieleAb } from '../src/sim/replay';
import { TICK_HZ } from '../src/sim/typen';
import type { Partie } from '../src/netz/partie';
import { Runde, SCHLECHT } from './netz-sim';
import { baueM6Karte, Bot, KERNE } from './m6-szenario';

const MIN = 60 * TICK_HZ;

describe('Abnahme M6', () => {
  it('zwei Dörfer bis zur ersten Kirmes über schlechtes Netz, Neuladen mittendrin, keine Abweichung', { timeout: 300_000 }, () => {
    const karte = baueM6Karte();
    const r = new Runde(karte, KERNE, SCHLECHT, 6);
    r.starte(0, { sim: new Simulation(karte, 2026, KERNE) });
    r.starte(1);
    r.verbindeAlle();
    const p = (i: number) => r.partien[i] as Partie;
    const bots = [0, 1].map((sp) => new Bot(sp, KERNE[sp], (b) => r.partien[sp]?.befehl(b)));
    const schauen = () => { for (const b of bots) { const s = r.partien[b.sp]?.sim; if (s) b.schau(s); } };
    // der Gastgeber stellt Tempo 3 (sonst dauert der Test so lange wie das Spiel)
    r.lauf(1000);
    p(0).setzeTempo(3);
    let neuGeladen = -1;
    const ende = 45 * MIN;
    while (p(0).sim!.tick < ende && bots.some((b) => b.kirmesTick < 0)) {
      r.lauf(1000, schauen);
      // nach 12 Spielminuten lädt Spieler 1 die Seite neu
      if (neuGeladen < 0 && p(0).sim!.tick >= 12 * MIN) {
        r.trenne(1);
        r.lauf(2000, schauen);
        const t0 = r.uhr;
        const neu = r.starte(1);
        r.verbindeAlle();
        bots[1].tu = (b) => r.partien[1]?.befehl(b);
        while (!neu.sim || neu.angehalten) r.lauf(16);
        neuGeladen = r.uhr - t0;
      }
    }
    const min = (t: number) => (t / MIN).toFixed(1);
    console.log(`M6: Kirmes bei Minute ${min(bots[0].kirmesTick)} und ${min(bots[1].kirmesTick)}, wieder drin nach ${neuGeladen} ms, ` +
      `${r.gesendet} Nachrichten, ${(r.bytes / 1e6).toFixed(1)} MB`);
    expect(neuGeladen).toBeGreaterThan(0);
    expect(neuGeladen).toBeLessThan(30_000);
    for (const b of bots) {
      expect(b.kirmesTick).toBeGreaterThan(0);
      expect(b.kirmesTick).toBeLessThan(45 * MIN);
    }
    for (const i of [0, 1]) expect(p(i).ereignisse.filter((e) => e.art === 'auseinander' || e.art === 'fehler')).toEqual([]);
    r.lauf(30_000, schauen); // das Fest (45 Spielsekunden) zu Ende feiern
    // anhalten, gleichziehen, vergleichen; das Protokoll spielt sich auch allein (Replay) gleich ab
    p(1).pause(true);
    r.lauf(3000);
    r.gleichziehen();
    const a = p(0).sim!, b = p(1).sim!;
    expect(b.tick).toBe(a.tick);
    expect(b.pruefsumme()).toBe(a.pruefsumme());
    expect(a.pruefeInnenzustand()).toEqual([]);
    const proto = a.protokoll({ version: 'test', q: 0, r: 0, size: 'm6', pruefsumme: 'synthetisch' });
    expect(spieleAb(karte, proto).pruefsumme()).toBe(a.pruefsumme());
    expect(a.sicht(0).spieler.map((s) => s.stufe)).toEqual([1, 1]);
  });
});

describe('Szenario für Node = Browser', () => {
  it('zwei Dörfer in einem Protokoll spielen sich gleich ab', { timeout: 120_000 }, async () => {
    const { baueSzenarioM6 } = await import('./m6-szenario');
    const { karte, protokoll } = baueSzenarioM6(6);
    expect(protokoll.mitspieler?.length).toBe(1);
    expect(new Set(protokoll.befehle.map((e) => e.spieler))).toEqual(new Set([0, 1]));
    const a = spieleAb(karte, protokoll), b = spieleAb(karte, JSON.parse(JSON.stringify(protokoll)));
    expect(a.pruefsumme()).toBe(b.pruefsumme());
    expect(a.pruefeInnenzustand()).toEqual([]);
  });
});
