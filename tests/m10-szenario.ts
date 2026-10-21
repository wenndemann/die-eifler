// M10/M11: Szenario für den Determinismus Node = Browser (tests/smoke.mjs) – zwei Dörfer mit Völkchen und Gebiet, Wege zu einem Ort
// und zum Marktposten, Einstand-Wettlauf, Bauen an der Grenze, abgelehnte fremde Spezialkette.
import { Simulation } from '../src/sim/sim';
import { SimKarte } from '../src/sim/karte';
import type { Befehl, KarteDaten, Protokoll } from '../src/sim/typen';
import { baueTestKarte, gerade, KARTE_INFO } from './sim-szenario';

export function baueM10Karte(): KarteDaten {
  const k = baueTestKarte();
  const sk = new SimKarte(k);
  for (const h of [{ q: 0, r: -15 }, { q: 1, r: -15 }]) { const i = sk.index(h.q, h.r); k.flags[i] |= 1; k.place[i] = 4; }
  return k;
}

export function baueSzenarioM10(): { karte: KarteDaten; protokoll: Protokoll } {
  const karte = baueM10Karte();
  const sim = new Simulation(karte, 2027, [{ q: 0, r: 0, voelkchen: 'monschau', bewohner: 16 }, { q: 0, r: -28, voelkchen: 'ostbelgien', bewohner: 16 }], { gebiet: 1, ziel: 'kurz' });
  const plan: [number, number, Befehl][] = [
    [0, 0, { art: 'gebaeude', typ: 'holzfaeller', q: 6, r: 0 }], [0, 0, { art: 'weg', pfad: gerade(0, 0, 0, 6) }],
    [0, 1, { art: 'gebaeude', typ: 'holzfaeller', q: 6, r: -28 }], [0, 1, { art: 'weg', pfad: gerade(0, -28, 0, 6) }],
    [40, 0, { art: 'weg', pfad: gerade(0, 0, 2, 14) }], [40, 1, { art: 'weg', pfad: gerade(0, -28, 5, 12) }],
    [60, 0, { art: 'gebaeude', typ: 'wohnhaus', q: -3, r: 3 }], [60, 0, { art: 'weg', pfad: gerade(0, 0, 4, 3) }],
    [60, 1, { art: 'gebaeude', typ: 'molkerei', q: 3, r: -28 }], [60, 0, { art: 'gebaeude', typ: 'hecke', q: 3, r: 3 }],
    [80, 1, { art: 'gebaeude', typ: 'wohnhaus', q: 0, r: -3 }],
    [200, 0, { art: 'einstand', ort: 0 }], [200, 1, { art: 'einstand', ort: 0 }],
    [400, 0, { art: 'handel', posten: 0, tausch: 2, mal: 1 }],
  ];
  for (const [t, sp, b] of plan) sim.befehl(t, sp, b);
  while (sim.tick < 6000) sim.schritt();
  return { karte, protokoll: sim.protokoll(KARTE_INFO) };
}
