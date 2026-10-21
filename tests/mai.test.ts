// M14 Der Mai: Junggesellenverein, Mainacht, Maibaum stellen, Maibaumklau mit Abwehr (Wache, Bier) und Auslöse, Nachbarorte,
// Burschen aus dem Nachbarort, Mailehen; Spielstand und Replay mitten im Klau.
import { describe, expect, it } from 'vitest';
import { WARE } from '../src/sim/daten';
import {
  MAI_AB, MAI_AUSLOESE, MAI_DAUER, MAI_LEHEN_ZUZUG, MAI_MAX, MAI_PUNKTE_ABWEHR, MAI_PUNKTE_KLAU, MAI_PUNKTE_STEHT, MAI_TAKT, MAIBAUM_WAREN,
} from '../src/sim/mai';
import { spieleAb } from '../src/sim/replay';
import { Simulation } from '../src/sim/sim';
import { SimKarte } from '../src/sim/karte';
import { STAND_ZAHLEN, type SimStand } from '../src/sim/stand';
import type { Befehl, KarteDaten, SimSicht } from '../src/sim/typen';
import { baueTestKarte, gerade, KARTE_INFO } from './sim-szenario';

/** Testkarte mit einem Nachbarort (Ortskern wie in den Weltdaten: Flag Bit 0 und place). */
const k = baueTestKarte(false);
{
  const sk = new SimKarte(k);
  for (const h of [{ q: 4, r: -14 }, { q: 5, r: -14 }]) { const i = sk.index(h.q, h.r); k.flags[i] |= 1; k.place[i] = 7; }
}
const lauf = (sim: Simulation, n: number) => { for (let i = 0; i < n; i++) sim.schritt(); };
const tu = (sim: Simulation, sp: number, b: Befehl) => sim.befehl(sim.tick, sp, b);
function fertig(sim: Simulation, typ: string, q: number, r: number, sp: number) {
  const s = sim as unknown as { karte: { index(q: number, r: number): number }; gebaeudeErzeugen(t: string, h: number, sofort: boolean, sp: number): { id: number } };
  return s.gebaeudeErzeugen(typ, s.karte.index(q, r), true, sp).id;
}
function aendere(sim: Simulation, f: (st: SimStand) => void, karte: KarteDaten = k): Simulation {
  const st = sim.stand(); f(st); return Simulation.ausStand(karte, st);
}
const dorf = (st: SimStand, sp: number) => st.doerfer[sp] as Record<string, unknown>;
const mai = (s: SimSicht) => s.dorf.mai!;

/** Zwei Dörfer mit Kirmesplatz, Maijungen und vollem Lager, kurz vor der Mainacht. */
function zweiDoerfer(jungen = [4, 4], bisMainacht = 5): Simulation {
  let sim = new Simulation(k, 21, [{ q: 0, r: 0 }, { q: -14, r: 0 }]);
  fertig(sim, 'kirmesplatz', 3, 0, 0);
  fertig(sim, 'kirmesplatz', -11, 0, 1);
  sim = aendere(sim, (st) => {
    st.zahlen[STAND_ZAHLEN.indexOf('tick')] = MAI_AB - bisMainacht;
    st.doerfer.forEach((d, sp) => { const x = d as Record<string, number>; x.maiJungen = jungen[sp]; x.frei -= jungen[sp]; });
    for (const g of st.gebaeude) { const v = g.vorrat as number[] | undefined; if (v) { v[WARE.stamm] += 5; v[WARE.landbier] += 20; v[WARE.bratkartoffeln] += 10; } }
  });
  lauf(sim, bisMainacht + 1);
  expect(sim.inMainacht()).toBe(true);
  return sim;
}
/** Laufen lassen, bis keine Trupps mehr unterwegs sind (höchstens n Ticks). */
function bisDaheim(sim: Simulation, n = 4000) {
  for (let i = 0; i < n && (sim.sicht(0).trupps?.length ?? 0) > 0; i++) sim.schritt();
}

describe('M14 Der Mai', () => {
  it('Junggesellenverein macht Maijungen aus Bewohnern und Landbier, höchstens MAI_MAX', () => {
    let sim = new Simulation(k, 3, { q: 0, r: 0 });
    const id = fertig(sim, 'junggesellen', 3, 0, 0);
    tu(sim, 0, { art: 'weg', pfad: gerade(0, 0, 0, 3) });
    lauf(sim, 1);
    sim = aendere(sim, (st) => { const g = st.gebaeude.find((x) => x.id === id)!; (g.puffer as number[])[WARE.landbier] = 4; });
    const frei0 = sim.sicht(0).dorf.frei;
    lauf(sim, MAI_TAKT * 3 + 2);
    expect(mai(sim.sicht(0)).jungen).toBe(3);
    expect(sim.sicht(0).dorf.frei).toBe(frei0 - 3);
    expect(sim.pruefeInnenzustand()).toEqual([]);
    // fast voll: nur noch einer, dann ist Schluss
    sim = aendere(sim, (st) => {
      const d = st.doerfer[0] as Record<string, number>; d.maiJungen = MAI_MAX - 1; d.frei -= MAI_MAX - 1 - 3;
      const g = st.gebaeude.find((x) => x.id === id)!; (g.puffer as number[])[WARE.landbier] = 4;
    });
    lauf(sim, MAI_TAKT * 4);
    expect(mai(sim.sicht(0)).jungen).toBe(MAI_MAX);
    expect(mai(sim.sicht(0)).verein).toBe(true);
    expect(sim.pruefeInnenzustand()).toEqual([]);
  });

  it('Maibaum stellen nur in der Mainacht, mit Kirmesplatz, Stamm und Maijungen; steht er am Ende, gibt es Punkte', () => {
    const sim = zweiDoerfer([4, 1]);
    const p0 = sim.punkte(0);
    tu(sim, 0, { art: 'mai', was: 'stellen' });
    tu(sim, 1, { art: 'mai', was: 'stellen' });   // nur 1 Maijunge: zu wenig
    lauf(sim, 2);
    expect(mai(sim.sicht(0)).baum).toBe(1);
    expect(mai(sim.sicht(1)).baum).toBe(0);
    expect(sim.sicht(0).ereignisse.some((e) => e.art === 'maibaum')).toBe(true);
    // zweimal geht nicht
    const stamm = sim.sicht(0).gebaeude.find((g) => g.typ === 'lager' && g.sp === 0)!.vorrat![WARE.stamm];
    tu(sim, 0, { art: 'mai', was: 'stellen' }); lauf(sim, 2);
    expect(sim.sicht(0).gebaeude.find((g) => g.typ === 'lager' && g.sp === 0)!.vorrat![WARE.stamm]).toBe(stamm);
    lauf(sim, MAI_DAUER);
    expect(sim.inMainacht()).toBe(false);
    expect(sim.punkte(0)).toBe(p0 + MAI_PUNKTE_STEHT);
    expect(MAIBAUM_WAREN[WARE.stamm]).toBeGreaterThan(0);
    // außerhalb der Mainacht kein Stellen und kein Klau
    tu(sim, 1, { art: 'mai', was: 'stellen' }); tu(sim, 1, { art: 'mai', was: 'klau', ziel: 0 }); lauf(sim, 2);
    expect(mai(sim.sicht(1)).baum).toBe(0);
    expect(sim.sicht(0).trupps).toEqual([]);
  });

  it('Klau gelingt ohne Wache und Bier; Auslöse holt den Baum zurück, die Diebe bekommen sie', () => {
    const sim = zweiDoerfer();
    tu(sim, 0, { art: 'mai', was: 'stellen' }); lauf(sim, 2);
    const pd = sim.punkte(1);
    tu(sim, 1, { art: 'mai', was: 'klau', ziel: 0, n: 3 }); lauf(sim, 2);
    expect(sim.sicht(1).trupps!.length).toBe(1);
    expect(mai(sim.sicht(1)).frei).toBe(1);
    bisDaheim(sim);
    expect(mai(sim.sicht(0)).baum).toBe(2);
    expect(mai(sim.sicht(0)).dieb).toBe(1);
    expect(sim.sicht(1).spieler[0].maibaum).toBe(2);
    expect(sim.punkte(1)).toBe(pd + MAI_PUNKTE_KLAU);
    expect(sim.sicht(0).ereignisse.find((e) => e.art === 'maibesuch')!.wert).toBe(0);
    expect(mai(sim.sicht(1)).frei).toBe(4);
    const lager1 = () => sim.sicht(1).gebaeude.find((g) => g.typ === 'lager' && g.sp === 1)!.vorrat!;
    const bier1 = lager1()[WARE.landbier];
    tu(sim, 0, { art: 'mai', was: 'loese' }); lauf(sim, 2);
    expect(mai(sim.sicht(0)).baum).toBe(1);
    expect(lager1()[WARE.landbier]).toBe(bier1 + MAI_AUSLOESE[WARE.landbier]);
    expect(sim.pruefeInnenzustand()).toEqual([]);
  });

  it('Abwehr: Hand am Stamm (Wache) oder Bier – dann torkeln sie zurück', () => {
    const sim = zweiDoerfer();
    tu(sim, 0, { art: 'mai', was: 'stellen' });
    tu(sim, 0, { art: 'mai', was: 'wache', n: 1 }); lauf(sim, 2);
    expect(mai(sim.sicht(0)).wache).toBe(1);
    const p0 = sim.punkte(0);
    tu(sim, 1, { art: 'mai', was: 'klau', ziel: 0 }); lauf(sim, 2);
    bisDaheim(sim);
    expect(mai(sim.sicht(0)).baum).toBe(1);
    expect(sim.punkte(0)).toBe(p0 + MAI_PUNKTE_ABWEHR);
    expect(sim.sicht(1).ereignisse.find((e) => e.art === 'maiklau')!.wert).toBe(100);
    // jetzt mit Bier statt Wache
    tu(sim, 0, { art: 'mai', was: 'wache', n: 0 }); tu(sim, 0, { art: 'mai', was: 'bier', an: true }); lauf(sim, 2);
    const bier = sim.sicht(0).gebaeude.find((g) => g.typ === 'lager' && g.sp === 0)!.vorrat![WARE.landbier];
    tu(sim, 1, { art: 'mai', was: 'klau', ziel: 0, n: 2 }); lauf(sim, 2);
    let torkelt = false;
    for (let i = 0; i < 4000 && (sim.sicht(0).trupps?.length ?? 0) > 0; i++) { sim.schritt(); if (sim.sicht(0).trupps!.some((x) => x.phase === 3)) torkelt = true; }
    expect(torkelt).toBe(true);
    expect(mai(sim.sicht(0)).baum).toBe(1);
    expect(sim.sicht(0).gebaeude.find((g) => g.typ === 'lager' && g.sp === 0)!.vorrat![WARE.landbier]).toBe(bier - 2);
  });

  it('Klau im Nachbarort einmal im Jahr; Burschen aus dem Nachbarort kommen; Mailehen bringt Zuzug', () => {
    let sim = zweiDoerfer([4, 4]);
    const orte = sim.sicht(0).orte.length;
    expect(orte).toBe(1);
    {
      tu(sim, 0, { art: 'mai', was: 'klau', ziel: -1 }); lauf(sim, 2);
      expect(mai(sim.sicht(0)).orte).toEqual([0]);
      tu(sim, 0, { art: 'mai', was: 'klau', ziel: -1 }); lauf(sim, 2);
      expect(sim.sicht(0).trupps!.filter((x) => x.sp === 0).length).toBe(1);
    }
    // Mailehen: mit Verein am Ende der Mainacht
    sim = aendere(sim, () => undefined);
    fertig(sim, 'junggesellen', 4, -3, 0);
    const b0 = sim.sicht(0).dorf.bewohner;
    lauf(sim, MAI_DAUER + 2);
    expect(sim.sicht(0).dorf.bewohner).toBeGreaterThanOrEqual(b0 + MAI_LEHEN_ZUZUG);
    expect(sim.sicht(0).ereignisse.some((e) => e.art === 'mailehen')).toBe(true);
    expect(sim.pruefeInnenzustand()).toEqual([]);
    // Burschen aus einem Nachbarort: bei einer der Saaten in der Mainacht unterwegs
    let gesehen = false;
    for (let saat = 1; saat < 12 && !gesehen; saat++) {
      let s2 = new Simulation(k, saat, { q: 0, r: 0 });
      fertig(s2, 'kirmesplatz', 3, 0, 0);
      s2 = aendere(s2, (st) => { st.zahlen[STAND_ZAHLEN.indexOf('tick')] = MAI_AB - 2; });
      for (let i = 0; i < MAI_DAUER && !gesehen; i++) { s2.schritt(); if (s2.sicht(0).trupps!.some((x) => x.sp === -1)) gesehen = true; }
    }
    expect(gesehen).toBe(true);
  });

  it('Spielstand und Replay mitten im Klau gleich; alter Spielstand ohne Mai lädt', () => {
    const sim = zweiDoerfer();
    tu(sim, 0, { art: 'mai', was: 'stellen' }); lauf(sim, 2);
    tu(sim, 1, { art: 'mai', was: 'klau', ziel: 0 });
    lauf(sim, 40);
    expect(sim.sicht(0).trupps!.length).toBe(1);
    const st = sim.stand();
    const zurueck = Simulation.ausStand(k, st);
    lauf(sim, 600); lauf(zurueck, 600);
    expect(zurueck.pruefsumme()).toBe(sim.pruefsumme());
    // alter Stand: Mai-Felder fehlen
    const alt = sim.stand();
    delete (alt as Partial<SimStand>).mai;
    for (const d of alt.doerfer) for (const key of ['maiJungen', 'maiWache', 'maiBier', 'maiBaum', 'maiDieb', 'maiJahr', 'maiP', 'maiLehen', 'maiOrte']) delete (d as Record<string, unknown>)[key];
    const geladen = Simulation.ausStand(k, alt);
    expect(mai(geladen.sicht(0)).jungen).toBe(0);
    // Replay von Anfang an (nur Befehle, ohne Standänderungen): ein normales Spiel mit Mai-Befehlen bleibt gleich
    const r = new Simulation(k, 5, { q: 0, r: 0 });
    r.befehl(0, 0, { art: 'mai', was: 'bier', an: true });
    r.befehl(3, 0, { art: 'mai', was: 'wache', n: 2 });
    lauf(r, 300);
    expect(spieleAb(k, r.protokoll(KARTE_INFO), r.tick).pruefsumme()).toBe(r.pruefsumme());
    void dorf;
  });
});
