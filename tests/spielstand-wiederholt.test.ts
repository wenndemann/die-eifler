// Spielstand immer wieder speichern und laden (wie Wiederbeitritte im Mehrspieler) mit Gebiet und Völkchen: die geladene Simulation
// rechnet Tick für Tick dasselbe wie die durchgehende, auch wenn beide zwischen den Ticks ihre Sicht abfragen.
import { it, expect } from 'vitest';
import { Simulation } from '../src/sim/sim';
import type { Befehl } from '../src/sim/typen';
import { baueTestKarte, gerade } from './sim-szenario';
it('Spielstand alle 37 Ticks neu geladen: gleiche Prüfsumme in jedem Tick', () => {
  const k = baueTestKarte();
  const starts = [{ q: 0, r: 0, voelkchen: 'rureifel' }, { q: -14, r: 0, voelkchen: 'rureifel' }];
  const a = new Simulation(k, 7, starts, { gebiet: 1, ziel: 'normal' });
  let b = new Simulation(k, 7, starts, { gebiet: 1, ziel: 'normal' });
  const bef: [number, number, Befehl][] = [
    [5, 0, { art: 'gebaeude', typ: 'holzfaeller', q: 9, r: 0 }], [5, 0, { art: 'weg', pfad: gerade(0, 0, 0, 9) }],
    [5, 1, { art: 'gebaeude', typ: 'holzfaeller', q: -14, r: -3 }], [5, 1, { art: 'weg', pfad: gerade(-14, 0, 2, 3) }],
    [300, 0, { art: 'gebaeude', typ: 'wohnhaus', q: 3, r: 3 }], [300, 0, { art: 'weg', pfad: gerade(0, 0, 5, 3) }],
    [400, 1, { art: 'gebaeude', typ: 'wohnhaus', q: -11, r: 3 }], [400, 1, { art: 'weg', pfad: gerade(-14, 0, 5, 3) }],
  ];
  for (let t = 0; t < 3000; t++) {
    for (const [bt, sp, x] of bef) if (bt === t) { a.befehl(t, sp, x); b.befehl(t, sp, x); }
    if (t % 37 === 0) { b = Simulation.ausStand(k, b.stand()); }
    a.sicht(0); b.sicht(1);
    a.schritt(); b.schritt();
    expect(b.pruefsumme(), `Tick ${t}`).toBe(a.pruefsumme());
  }
});
