// Höfe und Felder (wie Siedler 2): Felder sind Natur je Hex wie die Bäume. Der Bauer sät im Umkreis (wie der Förster pflanzt) und
// erntet reife Felder (wie der Holzfäller fällt); ein Weg zertrampelt ein Feld, Bauen räumt es; im Winter Ruhe, im Frühjahr Saat.
import { describe, expect, it } from 'vitest';
import { Simulation } from '../src/sim/sim';
import { FELD_ALT, FELD_ARTEN, GEBAEUDE, JAHR_TICKS, JAHRESZEIT_TICKS, SAAT_TICKS, WARE } from '../src/sim/daten';
import { STAND_ZAHLEN, type SimStand } from '../src/sim/stand';
import type { Befehl } from '../src/sim/typen';
import { baueTestKarte, gerade } from './sim-szenario';

const lauf = (sim: Simulation, n: number) => { for (let i = 0; i < n; i++) sim.schritt(); };
const tu = (sim: Simulation, b: Befehl) => { sim.befehl(sim.tick, 0, b); lauf(sim, 1); };
type Intern = { karte: { index(q: number, r: number): number }; gebaeudeErzeugen(t: string, h: number, sofort: boolean, sp: number): { id: number } };
const intern = (sim: Simulation) => sim as unknown as Intern;
const fertig = (sim: Simulation, typ: string, q: number, r: number) => intern(sim).gebaeudeErzeugen(typ, intern(sim).karte.index(q, r), true, 0).id;
const geb = (sim: Simulation, id: number) => sim.sicht().gebaeude.find((g) => g.id === id)!;
const KARTOFFEL = FELD_ARTEN.indexOf('kartoffelfeld') + 1;
/** Feld-Hexe einer Art: Index → Stadium. */
function felder(sim: Simulation, art = KARTOFFEL): Map<number, number> {
  const n = sim.sicht().natur, aus = new Map<number, number>();
  n.feld!.forEach((v, i) => { if (v === art) aus.set(i, n.feldStufe![i]); });
  return aus;
}
/** Ein Kartoffelhof bei (-3, 0) mit Weg zum Lager. */
function mitHof(saat = 1): { sim: Simulation; hof: number } {
  const sim = new Simulation(baueTestKarte(), saat, { q: 0, r: 0, bewohner: 20 });
  const hof = fertig(sim, 'kartoffelfeld', -3, 0);
  tu(sim, { art: 'weg', pfad: gerade(0, 0, 3, 3) });
  return { sim, hof };
}

describe('Höfe und Felder', () => {
  it('Daten: alle Feld-Erzeuger sind Höfe mit Radius, Feld und Saison; Bienenstock bleibt ein Erzeuger', () => {
    for (const id of ['kartoffelfeld', 'gerstenfeld', 'hopfengarten', 'obstwiese', 'weinberg', 'wacholderheide', 'lohhecke']) {
      const t = GEBAEUDE[id];
      expect(t.funktion, id).toBe('hof');
      expect(t.radius, id).toBeGreaterThan(0);
      expect(t.acker!.wachsenTicks, id).toBeGreaterThan(0);
      expect(t.acker!.ernte, id).toBeGreaterThan(0);
      expect(t.feld, id).toBe(true);
      expect(FELD_ARTEN, id).toContain(id);
    }
    expect(GEBAEUDE.bienenstock.funktion).toBe('erzeuger');
  });

  it('der Bauer sät im Umkreis, die Felder wachsen in Stadien und werden reif, dann erntet er Kartoffeln', () => {
    const { sim, hof } = mitHof();
    const t = GEBAEUDE.kartoffelfeld;
    expect(sim.arbeitsHexe('kartoffelfeld', -3, 0).art).toBe('feld');
    expect(sim.arbeitsHexe('kartoffelfeld', -3, 0).summe).toBeGreaterThan(10);
    lauf(sim, 20 * 30);
    const gesaet = felder(sim);
    expect(gesaet.size).toBeGreaterThan(0);
    expect([...gesaet.values()].every((st) => st >= 1 && st <= 3)).toBe(true);
    // alle Felder liegen im Radius um den Hof und auf freien Hexen
    const k = sim.karte;
    for (const i of gesaet.keys()) expect(k.abstand(i, k.index(-3, 0))).toBeLessThanOrEqual(t.radius);
    expect(geb(sim, hof).erzeugt).toBe(0);
    lauf(sim, t.acker!.wachsenTicks + 20 * 60);
    expect([...felder(sim).values()].some((st) => st === 4) || geb(sim, hof).erzeugt > 0).toBe(true);
    expect(geb(sim, hof).erzeugt).toBeGreaterThan(0);
    expect(sim.sicht().dorf.erzeugt[WARE.kartoffeln]).toBe(geb(sim, hof).erzeugt);
    expect(geb(sim, hof).zustand).not.toBe('kein_feld');
    expect(sim.pruefeInnenzustand()).toEqual([]);
  });

  it('wachsen nur noch Felder und ist kein Platz frei, wartet der Hof (kein „kein Platz“)', () => {
    const { sim, hof } = mitHof();
    lauf(sim, 20 * 40);
    const nat = sim as unknown as { baum: Uint8Array; feld: Uint8Array; natRev: number };
    for (const h of sim.arbeitsHexe('kartoffelfeld', -3, 0).hexe) { const i = sim.karte.index(h.q, h.r); if (!nat.feld[i]) nat.baum[i] = 3; }
    nat.natRev++;
    lauf(sim, 20 * 10);
    expect(felder(sim).size).toBeGreaterThan(0);
    expect(geb(sim, hof).zustand).toBe('arbeitet');
  });

  it('ein neuer Weg über ein Feld zertrampelt es, Bauen räumt es; der Förster pflanzt nicht auf Felder', () => {
    const { sim } = mitHof();
    lauf(sim, 20 * 60);
    const k = sim.karte;
    const f = [...felder(sim).keys()].find((i) => k.abstand(i, k.index(0, 0)) >= 2)!;
    expect(f).toBeDefined();
    // Weg vom Lager zum Feld-Hex
    const ziel = { q: k.qs[f], r: k.rs[f] };
    const pfad = sim.wegAbschnitt({ q: 0, r: 0 }, ziel, [], 10)!;
    expect(pfad).not.toBeNull();
    tu(sim, { art: 'weg', pfad });
    expect(felder(sim).has(f)).toBe(false);
    // Bauen auf einem anderen Feld
    const g = [...felder(sim).keys()].find((i) => sim.kannBauen('wohnhaus', k.qs[i], k.rs[i]));
    if (g !== undefined) {
      tu(sim, { art: 'gebaeude', typ: 'wohnhaus', q: k.qs[g], r: k.rs[g] });
      expect(felder(sim).has(g)).toBe(false);
    }
    // ein Förster im Feldland pflanzt nur auf freie Hexe
    fertig(sim, 'foerster', -4, 2);
    lauf(sim, 20 * 90);
    const n = sim.sicht().natur;
    for (let i = 0; i < n.feld!.length; i++) if (n.feld![i]) expect(n.baum[i] + n.jung[i], `Hex ${i}`).toBe(0);
    expect(sim.pruefeInnenzustand()).toEqual([]);
  });

  it('ohne freies Land: kein Platz für Felder (kein_feld)', () => {
    const { sim, hof } = mitHof();
    // alles im Umkreis ist Wald (die Bäume stehen, wo Felder hin müssten)
    const nat = sim as unknown as { baum: Uint8Array; natRev: number };
    for (const h of sim.arbeitsHexe('kartoffelfeld', -3, 0).hexe) nat.baum[sim.karte.index(h.q, h.r)] = 3;
    nat.natRev++;
    expect(sim.arbeitsHexe('kartoffelfeld', -3, 0).summe).toBe(0);
    lauf(sim, 20 * 30);
    expect(geb(sim, hof).zustand).toBe('kein_feld');
    expect(sim.pruefeInnenzustand()).toEqual([]);
  });

  it('Winter: der Bauer ruht und die Felder wachsen nicht; Saatzeit im Frühjahr: nur säen, nicht ernten', () => {
    const { sim, hof } = mitHof();
    lauf(sim, 20 * 60);
    // in den Winter springen (über den Spielstand)
    const st = sim.stand();
    st.zahlen[STAND_ZAHLEN.indexOf('tick')] = JAHRESZEIT_TICKS * 3 + 20;
    const w = Simulation.ausStand(baueTestKarte(), st);
    lauf(w, 20 * 20); // was er angefangen hat, bringt er noch zu Ende
    const vorher = felder(w), erzeugt = geb(w, hof).erzeugt;
    lauf(w, 20 * 120);
    expect(geb(w, hof).zustand).toBe('winter');
    expect(geb(w, hof).erzeugt).toBe(erzeugt);
    expect(felder(w)).toEqual(vorher);
    // Frühjahr des zweiten Jahres: erst Saat (keine Ernte), danach wird geerntet
    const st2 = w.stand();
    st2.zahlen[STAND_ZAHLEN.indexOf('tick')] = JAHR_TICKS;
    const f = Simulation.ausStand(baueTestKarte(), st2);
    // alle Felder reif machen
    const intern2 = f as unknown as { feldReif: Int32Array; feldStufe: Uint8Array; feld: Uint8Array };
    for (let i = 0; i < intern2.feld.length; i++) if (intern2.feld[i]) { intern2.feldReif[i] = 0; intern2.feldStufe[i] = 4; }
    const e0 = geb(f, hof).erzeugt;
    lauf(f, SAAT_TICKS - 40);
    expect(geb(f, hof).zustand).toBe('saat');
    expect(geb(f, hof).erzeugt).toBe(e0);
    lauf(f, 20 * 90);
    expect(geb(f, hof).erzeugt).toBeGreaterThan(e0);
    expect(f.pruefeInnenzustand()).toEqual([]);
  });

  it('Spielstand: Felder in Stand und Prüfsumme; ein älterer Spielstand ohne Felder lädt, alte Höfe bekommen reife Felder', () => {
    const { sim, hof } = mitHof();
    lauf(sim, 20 * 70);
    const st = sim.stand();
    const neu = Simulation.ausStand(baueTestKarte(), st);
    expect(neu.pruefsumme()).toBe(sim.pruefsumme());
    lauf(sim, 20 * 60); lauf(neu, 20 * 60);
    expect(neu.pruefsumme()).toBe(sim.pruefsumme());
    // Prüfsumme hängt an den Feldern
    const a = Simulation.ausStand(baueTestKarte(), sim.stand());
    (a as unknown as { feld: Uint8Array }).feld[intern(a).karte.index(-5, 3)] = KARTOFFEL;
    (a as unknown as { natRev: number }).natRev++;
    expect(a.pruefsumme()).not.toBe(sim.pruefsumme());
    // alter Spielstand: ohne Feld-Daten
    const alt = JSON.parse(JSON.stringify(sim.stand())) as SimStand;
    for (const k of ['feld', 'feldStufe', 'feldRes', 'feldReif', 'feldListe'] as const) delete alt.natur[k];
    // der Bauer steht am Hof (keine Reservierung offen)
    const g = alt.gebaeude.find((x) => x.id === hof)! as Record<string, unknown>;
    g.ph = 0; g.zh = -1; g.weg = []; g.traegt = -1; g.pt = 0;
    const geladen = Simulation.ausStand(baueTestKarte(), alt);
    const reif = [...felder(geladen).values()].filter((x) => x === 4).length;
    expect(reif).toBe(FELD_ALT);
    expect(geladen.pruefeInnenzustand()).toEqual([]);
    const e = geb(geladen, hof).erzeugt;
    lauf(geladen, 20 * 40);
    expect(geb(geladen, hof).erzeugt).toBeGreaterThan(e);
    expect(geladen.pruefeInnenzustand()).toEqual([]);
  });

  it('Replay: gleiche Befehle, gleiche Felder und Prüfsumme', () => {
    const a = mitHof(7), b = mitHof(7);
    lauf(a.sim, 20 * 200); lauf(b.sim, 20 * 200);
    expect(b.sim.pruefsumme()).toBe(a.sim.pruefsumme());
    expect(felder(b.sim)).toEqual(felder(a.sim));
  });
});
