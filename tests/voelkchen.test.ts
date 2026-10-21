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
import { SimKarte } from '../src/sim/karte';

function tu(sim: Simulation, sp: number, b: Befehl) { sim.befehl(sim.tick, sp, b); }
function lauf(sim: Simulation, n: number) { for (let i = 0; i < n; i++) sim.schritt(); }
function aendere(sim: Simulation, k: KarteDaten, f: (st: SimStand) => void) { const st = sim.stand(); f(st); return Simulation.ausStand(k, st); }

describe('M11 Völkchen: Daten', () => {
  it('zehn Völkchen wie in regions.json, jedes mit Spezialkette ab Stufe 2 und edler Spezialität aus der eigenen Kette', () => {
    const ids = (regionen as { voelkchen: { id: string }[] }).voelkchen.map((v) => v.id);
    expect(VOELKCHEN.map((v) => v.id)).toEqual(ids);
    expect(VOELKCHEN.length).toBe(10);
    for (const v of VOELKCHEN) {
      const eigene = GEBAEUDE_IDS.filter((id) => GEBAEUDE[id].voelkchen.includes(v.id));
      // Spezialkette (Drehbuch 5.3): ab Kirchdorf, 2 bis 4 Gebäude (wo die Kette es braucht, ein Vorprodukt mehr)
      const kette = eigene.filter((id) => GEBAEUDE[id].abStufe === 2);
      expect(kette.length, v.id).toBeGreaterThanOrEqual(2);
      expect(kette.length, v.id).toBeLessThanOrEqual(4);
      expect(eigene.some((id) => GEBAEUDE[id].ausgangWare === v.spezialitaet), v.id).toBe(true);
      expect(NAHRUNG[v.spezialitaet] === 3 || MISCHKORB[v.spezialitaet], WAREN[v.spezialitaet]).toBe(true);
      // Faustregel fürs Gleichgewicht: kein Bonus über +25 %, keine Schwäche unter −20 %
      for (const p of Object.values(v.tempo)) { expect(p).toBeLessThanOrEqual(25); expect(p).toBeGreaterThanOrEqual(-20); }
      expect(v.bauzeit).toBeGreaterThanOrEqual(90); expect(v.bauzeit).toBeLessThanOrEqual(115);
    }
    // jede Zutat einer Kette hat einen Erzeuger (eigene Gebäude oder Grundwirtschaft)
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

  it('Bonus und Schwäche wirken: Schneifeler Felder langsamer, Öslinger bauen mit Schiefer günstiger und handeln teurer', () => {
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
    tu(oe, 0, { art: 'gebaeude', typ: 'wohnhaus', q: 3, r: 0 });
    lauf(oe, 1);
    const wh = oe.sicht().gebaeude.find((g) => g.typ === 'wohnhaus')!;
    expect(wh.bedarf![WARE.stein]).toBe(GEBAEUDE.wohnhaus.kosten[WARE.stein] - 1);
    // 3 Käse für 1 Werkzeug – die Öslinger geben 4
    expect(oe.sicht().posten[0].handel[0].gib[WARE.kaese]).toBe(4);
  });

  it('Monschauer: bauen ungern im Moor (teurer), Hecken wachsen erst heran', () => {
    const km = baueTestKarte(false);
    const sk = new SimKarte(km);
    const moor = sk.index(4, 0);
    km.terrain[moor] = 4;
    let m = new Simulation(km, 1, { q: 0, r: 0, voelkchen: 'monschau' });
    tu(m, 0, { art: 'gebaeude', typ: 'wohnhaus', q: 4, r: 0 });
    tu(m, 0, { art: 'gebaeude', typ: 'hecke', q: 0, r: 4 });
    tu(m, 0, { art: 'weg', pfad: gerade(0, 0, 5, 4) });
    lauf(m, 1);
    const wh = m.sicht().gebaeude.find((g) => g.typ === 'wohnhaus')!;
    expect(wh.bedarf![WARE.bretter]).toBe(Math.ceil(GEBAEUDE.wohnhaus.kosten[WARE.bretter] * 1.5));
    m = aendere(m, km, (st) => { for (const g of st.gebaeude) if (g.typ === 'lager') (g.vorrat as number[])[WARE.setzling] = 10; });
    let z = '';
    for (let i = 0; i < 20 && z !== 'waechst'; i++) { lauf(m, 500); z = m.sicht().gebaeude.find((g) => g.typ === 'hecke')!.zustand; }
    expect(z).toBe('waechst');
    lauf(m, 6 * 60 * 20);
    expect(m.sicht().gebaeude.find((g) => g.typ === 'hecke')!.zustand).toBe('bereit');
  });

  it('Rursee-Bootsverleih bringt Punkte, Laacher bauen keinen Lärm an der Abtei, Ostbelgier heizen mit Torf, Ahrtaler feiern statt zu arbeiten', () => {
    // Bootsverleih am Teich der Testkarte (-15, 8)
    let r = new Simulation(k, 1, { q: -10, r: 8, voelkchen: 'rursee' });
    r = aendere(r, k, (st) => { st.doerfer[0].stufe = 2; });
    tu(r, 0, { art: 'gebaeude', typ: 'bootsverleih', q: -12, r: 9 });
    tu(r, 0, { art: 'weg', pfad: gerade(-10, 8, 4, 2) });
    const p0 = r.punkte(0);
    lauf(r, 8000);
    expect(r.punkte(0)).toBeGreaterThan(p0);
    // Laacher: Abtei, dann kein Steinbruch daneben
    let l = new Simulation(k, 1, { q: 0, r: 0, voelkchen: 'laach' });
    expect(l.kannBauen('steinbruch', 3, 0)).toBe(true);
    tu(l, 0, { art: 'gebaeude', typ: 'abtei', q: 0, r: 4 });
    lauf(l, 1);
    expect(l.kannBauen('steinbruch', 3, 0)).toBe(false);
    expect(l.kannBauen('steinbruch', -5, -2)).toBe(true);
    expect(l.kannBauen('kartoffelfeld', 3, 0)).toBe(true);
    // Ostbelgier: Torfstich nur am Moor, die Eisenhütte nimmt Torf statt Holzkohle
    const ko = baueTestKarte(false);
    const sk = new SimKarte(ko);
    ko.terrain[sk.index(6, 0)] = 4;
    let o = new Simulation(ko, 1, { q: 0, r: 0, voelkchen: 'ostbelgien' });
    expect(o.kannBauen('torfstich', 5, 1)).toBe(true);
    expect(o.kannBauen('torfstich', -5, 1)).toBe(false);
    o = aendere(o, ko, (st) => {
      st.doerfer[0].stufe = 2;
      for (const g of st.gebaeude) if (g.typ === 'lager') { const v = g.vorrat as number[]; v[WARE.erz] = 6; v[WARE.torf] = 6; v[WARE.bretter] = 20; v[WARE.stein] = 20; v[WARE.werkzeug] = 4; }
    });
    tu(o, 0, { art: 'gebaeude', typ: 'eisenhuette', q: -4, r: 0 });
    tu(o, 0, { art: 'weg', pfad: gerade(0, 0, 3, 4) });
    for (let i = 0; i < 30 && !o.sicht().dorf.erzeugt[WARE.eisen]; i++) lauf(o, 500);
    expect(o.sicht().dorf.erzeugt[WARE.eisen]).toBeGreaterThan(0);
    // Ahrtaler: während eines Fests ruht die Arbeit
    let a = new Simulation(k, 1, { q: 0, r: 0, voelkchen: 'ahr' });
    tu(a, 0, { art: 'gebaeude', typ: 'holzfaeller', q: 3, r: 0 });
    tu(a, 0, { art: 'weg', pfad: gerade(0, 0, 0, 3) });
    lauf(a, 3000);
    a = aendere(a, k, (st) => { st.doerfer[0].fest = 2000; });
    expect(a.sicht().gebaeude.find((g) => g.typ === 'holzfaeller')!.zustand).toBe('fest');
  });

  it('Römerstraße (Südeifel) macht Wege in der Nähe schneller, und beim Bauen tauchen alte Steine auf', () => {
    let s = new Simulation(k, 8, { q: 0, r: 0, voelkchen: 'suedeifel' });
    s = aendere(s, k, (st) => { st.doerfer[0].stufe = 2; for (const g of st.gebaeude) if (g.typ === 'lager') (g.vorrat as number[])[WARE.stein] = 30; });
    tu(s, 0, { art: 'weg', pfad: gerade(0, 0, 0, 5) });
    lauf(s, 1);
    const seg = () => [...(s as unknown as { segmente: Map<number, { kab: number }> }).segmente.values()][0].kab;
    const vorher = seg();
    tu(s, 0, { art: 'gebaeude', typ: 'roemerstrasse', q: 0, r: 3 });
    tu(s, 0, { art: 'weg', pfad: gerade(0, 0, 5, 3) });
    for (const [q, r] of [[-3, 0], [3, -3], [-3, 3], [0, -3]]) tu(s, 0, { art: 'gebaeude', typ: 'wohnhaus', q, r });
    tu(s, 0, { art: 'weg', pfad: gerade(0, 0, 3, 3) }); tu(s, 0, { art: 'weg', pfad: gerade(0, 0, 1, 3) });
    tu(s, 0, { art: 'weg', pfad: gerade(0, 0, 4, 3) }); tu(s, 0, { art: 'weg', pfad: gerade(0, 0, 2, 3) });
    lauf(s, 1);
    const gesehen = new Set<string>();
    for (let i = 0; i < 30 && s.sicht().gebaeude.some((g) => g.bau < 1000); i++) {
      lauf(s, 500);
      for (const e of s.sicht().ereignisse) gesehen.add(e.art);
    }
    expect(s.sicht().gebaeude.find((g) => g.typ === 'roemerstrasse')!.bau).toBe(1000);
    expect(seg()).toBeLessThan(vorher);
    expect(Math.round((seg() / vorher) * 10)).toBe(7);
    expect(gesehen.has('altstein')).toBe(true);
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

  it('Warnung beim Start: Bootsverleih ohne Wasser, Torfstich ohne Moor', () => {
    expect(new Simulation(k, 1, { q: -10, r: 8, voelkchen: 'rursee' }).fehltAufKarte()).toEqual([]);
    // dieselbe Karte ohne Wasser, Fluss und Moor
    const trocken: KarteDaten = { ...k, terrain: k.terrain.map((t) => (t === 0 || t === 4 ? 1 : t)), flags: k.flags.map(() => 0) };
    expect(new Simulation(trocken, 1, { q: -10, r: 8, voelkchen: 'rursee' }).fehltAufKarte().sort()).toEqual(['bootsverleih', 'fischerhuette']);
    expect(new Simulation(trocken, 1, { q: -10, r: 8, voelkchen: 'ostbelgien' }).fehltAufKarte()).toContain('torfstich');
    expect(new Simulation(trocken, 1, { q: -10, r: 8, voelkchen: 'monschau' }).fehltAufKarte()).toEqual([]);
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
