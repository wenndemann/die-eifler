// Abnahme M8 (ROADMAP): Ein Dorf erreicht in einer Partie allein den Marktflecken. Der erste Winter ist spürbar, aber wer vorsorgt,
// kommt gut durch. Balancing über einen 2-Stunden-Lauf des Spieltest-Bots (tests/m8-szenario.ts).
import { describe, expect, it } from 'vitest';
import { spieleAb } from '../src/sim/replay';
import { Simulation } from '../src/sim/sim';
import { FEST_OBERGRENZE, JAHRESZEIT_TICKS, NAHRUNG, WARE } from '../src/sim/daten';
import { TICK_HZ } from '../src/sim/typen';
import { baueM5Karte } from './m5-szenario';
import { spieleM8 } from './m8-szenario';

const MIN = 60 * TICK_HZ;

describe('Abnahme M8: zwei Stunden allein bis zum Marktflecken', () => {
  it('Dorf, Kirchdorf, Marktflecken in den Zeitfenstern des Bots; Feste, Winter mit Vorrat; Replay gleich', () => {
    const l = spieleM8(120);
    const min = l.stufeTick.map((t) => Math.round((10 * t) / MIN) / 10);
    console.log(`M8: Dorf ${min[1]} min, Kirchdorf ${min[2]} min, Marktflecken ${min[3]} min, Festpunkte ${l.festPunkte}, `
      + `gefroren ${l.frierMinuten} min, Bewohner im ersten Winter ${l.winterBewohner[0]} → ${l.winterBewohner[1]}, ${l.auftraege.length} Bauaufträge`);
    // Der Bot ist schneller als ein Mensch (M5: Bot 22 min bei Ziel 30–45 min); Ziele für Menschen ~30–45, ~75, ~110 min (Drehbuch 5.2)
    expect(min[1]).toBeGreaterThanOrEqual(20); expect(min[1]).toBeLessThanOrEqual(45);
    expect(min[2]).toBeGreaterThanOrEqual(40); expect(min[2]).toBeLessThanOrEqual(80);
    expect(min[3]).toBeGreaterThanOrEqual(60); expect(min[3]).toBeLessThanOrEqual(115);
    const s = l.sim.sicht();
    expect(s.dorf.stufe).toBe(3);
    // kleine Feste bringen Punkte, aber nicht unbegrenzt
    expect(l.festPunkte).toBeGreaterThanOrEqual(40);
    expect(l.festPunkte).toBeLessThanOrEqual(FEST_OBERGRENZE);
    // erster Winter: wer vorsorgt, friert kaum und wächst weiter; die Felder ruhen (keine Gerste im Winter)
    expect(l.frierMinuten).toBeLessThanOrEqual(10);
    expect(l.winterBewohner[1]).toBeGreaterThan(l.winterBewohner[0]);
    const st = l.sim.statistikVon(0);
    const erzeugtBei = (tick: number, a: number) => {
      const p = st.punkte.filter((x) => x[0] <= tick).pop()!;
      return p[4 + s.dorf.erzeugt.length + a];
    };
    const w0 = 3 * JAHRESZEIT_TICKS + 2 * MIN, w1 = 4 * JAHRESZEIT_TICKS;
    expect(erzeugtBei(w1, WARE.gerste) - erzeugtBei(w0, WARE.gerste)).toBe(0);
    expect(l.sim.pruefeInnenzustand()).toEqual([]);
    // Replay (Determinismus) über die ganze Partie
    expect(spieleAb(baueM5Karte(), l.protokoll).pruefsumme()).toBe(l.sim.pruefsumme());
  }, 300_000);

  it('ohne Vorrat friert dasselbe Dorf im ersten Winter und schafft deutlich weniger als mit Vorrat', () => {
    const l = spieleM8(46);
    expect(l.sim.sicht().jahr.jahreszeit).toBe(3);
    const mit = Simulation.ausStand(baueM5Karte(), l.sim.stand());
    const ohne = Simulation.ausStand(baueM5Karte(), l.sim.stand());
    // alles Essen aus den Lagern nehmen (wie ein Dorf, das nicht vorgesorgt hat)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const g of (ohne as any).gebaeude.values()) if (g.typ === 'lager') g.vorrat = g.vorrat.map((n: number, a: number) => (NAHRUNG[a] ? 0 : n));
    const summe = (x: Simulation) => x.sicht().dorf.erzeugt.reduce((a, b) => a + b, 0);
    const e0 = summe(l.sim);
    let gefroren = [0, 0];
    for (let i = 0; i < 8 * MIN; i++) {
      mit.schritt(); ohne.schritt();
      if (i % MIN === MIN - 1) gefroren = [gefroren[0] + (mit.sicht().dorf.friert ? 1 : 0), gefroren[1] + (ohne.sicht().dorf.friert ? 1 : 0)];
    }
    const waren = [summe(mit) - e0, summe(ohne) - e0];
    console.log(`M8 Winter: mit Vorrat ${gefroren[0]} min gefroren, ${waren[0]} Waren gemacht; ohne Vorrat ${gefroren[1]} min gefroren, ${waren[1]} Waren gemacht`);
    expect(gefroren[1]).toBeGreaterThan(gefroren[0]);
    expect(waren[1]).toBeLessThan(waren[0] * 0.85);
    expect(ohne.pruefeInnenzustand()).toEqual([]);
  }, 300_000);
});
