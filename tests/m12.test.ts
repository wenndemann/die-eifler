// M12: Eifelfonds (Running Gag „Preußisch Sibirien“), Einführung durch die Erzählfigur, Running Gags in den Texten.
import { describe, expect, it } from 'vitest';
import meldungen from '../data/meldungen.json';
import { GEBAEUDE, NAHRUNG, WARE } from '../src/sim/daten';
import { Simulation } from '../src/sim/sim';
import { geschafft, SCHRITTE } from '../src/spiel/einfuehrung';
import { creditsZeilen } from '../src/ui/startmenue';
import { baueTestKarte, gerade } from './sim-szenario';

const lauf = (sim: Simulation, n: number) => { for (let i = 0; i < n; i++) sim.schritt(); };
const fertig = (sim: Simulation, typ: string, q: number, r: number, sp = 0) => {
  const s = sim as unknown as { karte: { index(q: number, r: number): number }; gebaeudeErzeugen(t: string, h: number, sofort: boolean, sp: number): { id: number } };
  return s.gebaeudeErzeugen(typ, s.karte.index(q, r), true, sp).id;
};
/** Alles Essen aus den Lagern nehmen (Stand ändern und neu laden). */
function ohneEssen(sim: Simulation, k = baueTestKarte(false)): Simulation {
  const st = sim.stand();
  for (const g of st.gebaeude) {
    const v = g.vorrat as number[] | undefined;
    if (v) for (let a = 0; a < v.length; a++) if (NAHRUNG[a] > 0) v[a] = 0;
  }
  return Simulation.ausStand(k, st);
}

describe('M12 Eifelfonds', () => {
  const k = baueTestKarte(false);

  it('zahlt nur, wenn das Dorf arm dran ist; Stand und Replay bleiben gleich', () => {
    const t = GEBAEUDE.eifelfonds;
    expect(t.funktion).toBe('fonds');
    expect(t.fondsMenge).toBeGreaterThan(0);
    // reich: volles Lager → keine Auszahlung
    const reich = new Simulation(k, 3, { q: 0, r: 0 });
    fertig(reich, 'eifelfonds', 3, 0);
    reich.befehl(reich.tick, 0, { art: 'weg', pfad: gerade(0, 0, 0, 3) });
    lauf(reich, t.arbeitTicks + 50);
    expect(reich.sicht(0).ereignisse.some((e) => e.art === 'fonds')).toBe(false);
    expect(reich.sicht(0).gebaeude.find((g) => g.typ === 'eifelfonds')!.zustand).toBe('bereit');
    // arm: kein Essen im Lager → nach der Arbeitszeit liegen Kartoffeln bereit
    let arm = ohneEssen(new Simulation(k, 3, { q: 0, r: 0 }), k);
    fertig(arm, 'eifelfonds', 3, 0);
    arm.befehl(arm.tick, 0, { art: 'weg', pfad: gerade(0, 0, 0, 3) });
    lauf(arm, 10);
    expect(arm.sicht(0).gebaeude.find((g) => g.typ === 'eifelfonds')!.zustand).toBe('arbeitet');
    // mittendrin speichern und laden: gleiche Prüfsumme danach
    const st = arm.stand();
    lauf(arm, t.arbeitTicks);
    const nochmal = Simulation.ausStand(k, st);
    lauf(nochmal, t.arbeitTicks);
    expect(nochmal.pruefsumme()).toBe(arm.pruefsumme());
    expect(arm.sicht(0).ereignisse.filter((e) => e.art === 'fonds').map((e) => e.wert)).toEqual([WARE.kartoffeln]);
    expect(arm.statistik().erzeugt).toBeGreaterThanOrEqual(t.fondsMenge);
    arm = nochmal;
    expect(arm.pruefeInnenzustand()).toEqual([]);
  });

  it('Meldung mit Running Gag', () => {
    expect((meldungen as Record<string, unknown>).fonds).toBeDefined();
    expect(JSON.stringify(meldungen.fonds)).toContain('Preußisch Sibirien');
    expect(JSON.stringify(meldungen.friert)).toContain('Preußisch Sibirien');
    expect(JSON.stringify(meldungen.kirmes)).toContain('Annakirmes');
    expect(JSON.stringify(meldungen.handel)).toContain('von bei Aachen');
    expect(JSON.stringify(meldungen.tempo_hoch)).toContain('Mer renne nit');
    expect(JSON.stringify(meldungen.nachbar)).toContain('Noch keine Eifel');
  });
});

describe('M12 Einführung', () => {
  it('Schritte werden der Reihe nach geschafft', () => {
    const k = baueTestKarte(false);
    const sim = new Simulation(k, 1, { q: 0, r: 0 });
    expect(geschafft(sim.sicht(0), 0)).toEqual(SCHRITTE.map(() => false));
    sim.befehl(sim.tick, 0, { art: 'gebaeude', typ: 'holzfaeller', q: 6, r: 0 });
    lauf(sim, 2);
    let g = geschafft(sim.sicht(0), 0);
    expect(g[0]).toBe(true);
    expect(g[1]).toBe(false);     // noch kein Weg
    sim.befehl(sim.tick, 0, { art: 'weg', pfad: gerade(0, 0, 0, 6) });
    lauf(sim, 2);
    g = geschafft(sim.sicht(0), 0);
    expect(g.slice(0, 2)).toEqual([true, true]);
    for (const [typ, q] of [['saegewerk', -4], ['steinbruch', 2], ['wohnhaus', -2], ['kartoffelfeld', 4], ['kueche', -6], ['kirmesplatz', 0]] as const) fertig(sim, typ, q, 4);
    lauf(sim, 2);
    g = geschafft(sim.sicht(0), 0);
    expect(g.slice(0, -1).every(Boolean)).toBe(true);
    expect(g[g.length - 1]).toBe(false);   // die erste Kirmes steht noch aus
  });

  it('Mitwirkende: Weltdaten aus dem Manifest, alle Erzählfiguren', () => {
    const c = creditsZeilen(['Kartendaten © OpenStreetMap-Mitwirkende (ODbL)']);
    expect(c.find((a) => a.titel === 'Weltdaten')!.zeilen).toContain('Kartendaten © OpenStreetMap-Mitwirkende (ODbL)');
    expect(c.find((a) => a.titel === 'Erzählfiguren')!.zeilen.length).toBe(11);
  });
});
