// M11: Die 10 Völkchen (Drehbuch 5.3) – Daten, Spezialkette nur fürs eigene Völkchen, Spezialität in der Marktflecken-Kirmes,
// Bonus und Schwäche, Startwaren, Spielstand und Replay.
import { describe, expect, it } from 'vitest';
import regionen from '../data/regions.json';
import { GEBAEUDE, GEBAEUDE_IDS, MISCHKORB, NAHRUNG, WARE, WAREN } from '../src/sim/daten';
import { spieleAb } from '../src/sim/replay';
import { Simulation } from '../src/sim/sim';
import type { SimStand } from '../src/sim/stand';
import type { Befehl, KarteDaten } from '../src/sim/typen';
import { VOELKCHEN } from '../src/sim/voelkchen';
import { baueTestKarte, gerade, KARTE_INFO } from './sim-szenario';

function tu(sim: Simulation, sp: number, b: Befehl) { sim.befehl(sim.tick, sp, b); }
function lauf(sim: Simulation, n: number) { for (let i = 0; i < n; i++) sim.schritt(); }
function aendere(sim: Simulation, k: KarteDaten, f: (st: SimStand) => void) { const st = sim.stand(); f(st); return Simulation.ausStand(k, st); }

describe('M11 Völkchen: Daten', () => {
  it('zehn Völkchen wie in regions.json, jedes mit Spezialkette (2–3 Gebäude, ab Stufe 2) und edler Spezialität aus der eigenen Kette', () => {
    const ids = (regionen as { voelkchen: { id: string }[] }).voelkchen.map((v) => v.id);
    expect(VOELKCHEN.map((v) => v.id)).toEqual(ids);
    expect(VOELKCHEN.length).toBe(10);
    for (const v of VOELKCHEN) {
      const kette = GEBAEUDE_IDS.filter((id) => GEBAEUDE[id].voelkchen.includes(v.id));
      const produktion = kette.filter((id) => GEBAEUDE[id].funktion !== 'zier');
      expect(produktion.length, v.id).toBeGreaterThanOrEqual(2);
      expect(produktion.length, v.id).toBeLessThanOrEqual(3);
      for (const id of produktion) expect(GEBAEUDE[id].abStufe, id).toBe(2);
      // die Spezialität kommt aus der eigenen Kette und zählt als veredelt oder edel
      expect(kette.some((id) => GEBAEUDE[id].ausgangWare === v.spezialitaet), v.id).toBe(true);
      expect(NAHRUNG[v.spezialitaet] === 3 || MISCHKORB[v.spezialitaet], WAREN[v.spezialitaet]).toBe(true);
      // Faustregel fürs Gleichgewicht: kein Bonus über +25 %, keine Schwäche unter −20 %
      for (const p of Object.values(v.tempo)) { expect(p).toBeLessThanOrEqual(25); expect(p).toBeGreaterThanOrEqual(-20); }
      expect(v.bauzeit).toBeGreaterThanOrEqual(90); expect(v.bauzeit).toBeLessThanOrEqual(115);
    }
    // jede Zutat einer Kette hat einen Erzeuger (eigene Kette oder Grundwirtschaft)
    for (const id of GEBAEUDE_IDS) {
      const t = GEBAEUDE[id];
      for (const z of t.wandelt?.ein ?? []) {
        const quelle = GEBAEUDE_IDS.some((q) => GEBAEUDE[q].ausgangWare === z.a && (!GEBAEUDE[q].voelkchen.length || t.voelkchen.every((v) => GEBAEUDE[q].voelkchen.includes(v))));
        expect(quelle, `${id}: ${WAREN[z.a]}`).toBe(true);
      }
    }
  });
});

describe('M11 Völkchen in der Simulation', () => {
  const k = baueTestKarte(false);

  it('Monschauer gegen Ostbelgier: jeder baut nur die eigene Kette, die Marktflecken-Kirmes verlangt die eigene Spezialität', () => {
    let sim = new Simulation(k, 1, [{ q: 0, r: 0, voelkchen: 'monschau' }, { q: -14, r: 0, voelkchen: 'ostbelgien' }]);
    expect(sim.sicht(0).spieler.map((p) => p.voelkchen)).toEqual(['monschau', 'ostbelgien']);
    expect(sim.sperrGrund('tuchmacherei', 0)).toBe('stufe');
    expect(sim.sperrGrund('tuchmacherei', 1)).toBe('voelkchen');
    expect(sim.sperrGrund('molkerei', 0)).toBe('voelkchen');
    expect(sim.sperrGrund('hecke', 0)).toBe('');
    sim = aendere(sim, k, (st) => { st.doerfer[0].stufe = 2; st.doerfer[1].stufe = 2; });
    expect(sim.kannBauen('tuchmacherei', 3, 0, 0)).toBe(true);
    expect(sim.kannBauen('molkerei', 3, 0, 0)).toBe(false);
    expect(sim.kannBauen('molkerei', -14, 3, 1)).toBe(true);
    const k0 = sim.sicht(0).dorf.kirmes!, k1 = sim.sicht(1).dorf.kirmes!;
    expect(k0.liste[WARE.tuch]).toBe(10);
    expect(k0.liste[WARE.bergkaese]).toBe(0);
    expect(k1.liste[WARE.butter]).toBe(10);
    // ohne Völkchen bleibt der Platzhalter
    const neutral = aendere(new Simulation(k, 1, { q: 0, r: 0 }), k, (st) => { st.doerfer[0].stufe = 2; });
    expect(neutral.sicht().dorf.kirmes!.liste[WARE.bergkaese]).toBe(10);
  });

  it('Bonus und Schwäche wirken: Schneifeler Felder langsamer, Öslinger mit mehr Brettern und teurerem Handel', () => {
    const felder = (vk?: string) => {
      const sim = new Simulation(k, 1, vk ? { q: 0, r: 0, voelkchen: vk } : { q: 0, r: 0 });
      tu(sim, 0, { art: 'gebaeude', typ: 'kartoffelfeld', q: 4, r: 0 });
      tu(sim, 0, { art: 'weg', pfad: gerade(0, 0, 0, 4) });
      lauf(sim, 9000);
      return sim.sicht().dorf.erzeugt[WARE.kartoffeln];
    };
    const normal = felder(), schneifel = felder('schneifel');
    expect(normal).toBeGreaterThan(0);
    expect(schneifel).toBeLessThan(normal);
    const oe = new Simulation(k, 1, { q: 0, r: 0, voelkchen: 'oesling' }, { gebiet: 1, ziel: '' });
    expect(oe.sicht().gebaeude.find((g) => g.typ === 'lager')!.vorrat![WARE.bretter]).toBe(new Simulation(k, 1, { q: 0, r: 0 }).sicht().gebaeude[0].vorrat![WARE.bretter] + 4);
    // 3 Käse für 1 Werkzeug – die Öslinger geben 4
    expect(oe.sicht().posten[0].handel[0].gib[WARE.kaese]).toBe(4);
  });

  it('Fischer brauchen Wasser in der Nähe; die Vulkaneifeler bauen nicht direkt am Wasser', () => {
    // Teich der Testkarte bei (-15, 8), Radius 2
    let r = new Simulation(k, 1, { q: -10, r: 8, voelkchen: 'rursee' });
    r = aendere(r, k, (st) => { st.doerfer[0].stufe = 2; });
    expect(r.kannBauen('fischerhuette', -12, 8)).toBe(true);
    expect(r.kannBauen('fischerhuette', -8, 6)).toBe(false);
    const v = new Simulation(k, 1, { q: -10, r: 8, voelkchen: 'vulkaneifel' });
    expect(v.kannBauen('wohnhaus', -12, 8)).toBe(false);
    expect(v.kannBauen('wohnhaus', -8, 6)).toBe(true);
    expect(new Simulation(k, 1, { q: -10, r: 8 }).kannBauen('wohnhaus', -12, 8)).toBe(true);
  });

  it('Spielstand und Replay behalten das Völkchen', () => {
    const sim = new Simulation(k, 3, [{ q: 0, r: 0, voelkchen: 'ahr' }, { q: -14, r: 0, voelkchen: 'laach' }]);
    tu(sim, 0, { art: 'gebaeude', typ: 'wohnhaus', q: 3, r: 0 });
    tu(sim, 0, { art: 'weg', pfad: gerade(0, 0, 0, 3) });
    lauf(sim, 800);
    const b = Simulation.ausStand(k, sim.stand());
    expect(b.pruefsumme()).toBe(sim.pruefsumme());
    expect(b.sicht(1).dorf.voelkchen).toBe('laach');
    const p = sim.protokoll(KARTE_INFO);
    expect(p.start.voelkchen).toBe('ahr');
    expect(spieleAb(k, p).pruefsumme()).toBe(sim.pruefsumme());
    // alter Spielstand ohne Völkchen
    const st = sim.stand();
    for (const d of st.doerfer) delete (d as Record<string, unknown>).vk;
    expect(Simulation.ausStand(k, st).sicht().dorf.voelkchen).toBe('ahr');
  });
});
