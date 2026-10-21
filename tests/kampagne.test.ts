// M13: Kampagne „Der Eifelsteig“ – Daten der Wege und Etappen, Kampagnenstand, Rucksack (Startwaren in der Simulation), Ziele.
import { describe, expect, it } from 'vitest';
import { GEBAEUDE, START_VORRAT, WARE } from '../src/sim/daten';
import { Simulation } from '../src/sim/sim';
import { spieleAb } from '../src/sim/replay';
import {
  RUCKSACK_MAX, WEGE, etappeAbschliessen, etappeOffen, etappenVon, kampagnenPunkte, leseKampagne, naechsteEtappe, neueKampagne,
  rucksackPruefen, rucksackVorschlag, wegVon, zieleStand, type Ziel,
} from '../src/spiel/kampagne';
import { VOELKCHEN } from '../src/sim/voelkchen';
import { GROESSEN } from '../src/welt/format';
import { hexDistance } from '../src/welt/hexwelt';
import { baueTestKarte, gerade, KARTE_INFO } from './sim-szenario';

const lauf = (sim: Simulation, n: number) => { for (let i = 0; i < n; i++) sim.schritt(); };

describe('M13 Kampagnendaten', () => {
  it('Eifelsteig: 15 Etappen in 4 Abschnitten von Kornelimünster nach Trier; Rur-Weg als Zusatzweg', () => {
    const es = wegVon('eifelsteig')!;
    expect(es.abschnitte.map((a) => a.name)).toEqual(['Nordeifel', 'Kalkeifel', 'Vulkaneifel', 'Südeifel']);
    const et = etappenVon(es);
    expect(et.length).toBe(15);
    expect(et.map((e) => e.nr)).toEqual(Array.from({ length: 15 }, (_, i) => i + 1));
    expect(et[0].von).toBe('Kornelimünster');
    expect(et[14].nach).toBe('Trier');
    expect(wegVon('rurweg')).toBeDefined();
  });

  it('jede Etappe: Start im Spielfeld, Wege schließen lückenlos an, Ziele gültig, Texte da', () => {
    for (const w of WEGE) {
      const et = etappenVon(w);
      et.forEach((e, i) => {
        const n = GROESSEN[e.groesse];
        expect(hexDistance(e.start, e), `${w.id} ${e.name}: Start im Spielfeld`).toBeLessThanOrEqual(n - 5);
        if (i > 0) expect(e.von, `${w.id} ${e.name}`).toBe(et[i - 1].nach);
        expect(e.einleitung.length).toBeGreaterThan(20);
        expect(e.geschafft.length).toBeGreaterThan(10);
        expect(e.ziele.length).toBeGreaterThan(0);
        for (const z of e.ziele) {
          if (z.art === 'lager') expect(WARE[z.ware], `${e.name}: ${z.ware}`).toBeDefined();
          if (z.art === 'gebaeude') expect(GEBAEUDE[z.typ], `${e.name}: ${z.typ}`).toBeDefined();
          if (z.art === 'stufe') expect([1, 2, 3]).toContain(z.n);
          // ein Ort-Ziel, das außerhalb des Spielfelds liegt, zählt als erfüllt – aber es sollte selten sein
          if (z.art === 'ort' && z.name === e.nach && hexDistance(e.ziel, e) > n) expect(e.name).toBe('Bruch – Kordel');
        }
      });
    }
  });
});

describe('M13 Kampagnenstand', () => {
  it('neu, Etappe abschließen, nächste Etappe, Punkte, kaputter Speicher', () => {
    let k = neueKampagne('eifelsteig', 'monschau');
    expect(naechsteEtappe(k)).toBe(0);
    expect(etappeOffen(k, 0)).toBe(true);
    expect(etappeOffen(k, 1)).toBe(false);
    k = etappeAbschliessen(k, 0, 120, { werkzeug: 3, bretter: 10, quatsch: 5 });
    expect(k.geschafft).toEqual([0]);
    expect(naechsteEtappe(k)).toBe(1);
    expect(k.rucksack).toEqual({ werkzeug: 3, bretter: 10 });
    // nochmal gespielt: der bessere Wert zählt
    k = etappeAbschliessen(k, 0, 80, {});
    expect(kampagnenPunkte(k)).toBe(120);
    expect(leseKampagne(JSON.stringify(k))).toEqual(k);
    expect(leseKampagne('kaputt')).toBeNull();
    expect(leseKampagne(JSON.stringify({ weg: 'gibtsnicht', voelkchen: 'x' }))).toBeNull();
    expect(leseKampagne(JSON.stringify({ weg: 'rurweg', voelkchen: 'rureifel', geschafft: [9, 1, 1, -2] }))!.geschafft).toEqual([1]);
  });

  it('Rucksack: höchstens RUCKSACK_MAX Stück, Vorschlag aus dem Lager', () => {
    const r = rucksackPruefen({ werkzeug: 10, bretter: 10, stein: 10 });
    expect(Object.values(r).reduce((a, b) => a + b, 0)).toBe(RUCKSACK_MAX);
    const lager = new Array<number>(START_VORRAT.length).fill(0);
    lager[WARE.werkzeug] = 2; lager[WARE.bretter] = 30; lager[WARE.kaese] = 1;
    expect(rucksackVorschlag(lager)).toEqual({ werkzeug: 2, bretter: 5, kaese: 1 });
  });
});

describe('M13 Rucksack in der Simulation und Etappenziele', () => {
  const k = baueTestKarte(false);

  it('mitgebrachte Waren liegen im Startlager; Stand, Replay und unbekannte Waren', () => {
    const start = { q: 0, r: 0, voelkchen: VOELKCHEN[0].id, waren: { werkzeug: 3, bretter: 5, quatsch: 9, stein: -2 } };
    const sim = new Simulation(k, 4, start, { gebiet: 1, ziel: 'ohne_ende' });
    const lager = sim.sicht(0).gebaeude.find((g) => g.typ === 'lager')!;
    expect(lager.vorrat![WARE.werkzeug]).toBe(START_VORRAT[WARE.werkzeug] + (VOELKCHEN[0].start[WARE.werkzeug] ?? 0) + 3);
    expect(lager.vorrat![WARE.bretter]).toBe(START_VORRAT[WARE.bretter] + (VOELKCHEN[0].start[WARE.bretter] ?? 0) + 5);
    expect(sim.startDaten()[0].waren).toEqual({ werkzeug: 3, bretter: 5 });
    sim.befehl(sim.tick, 0, { art: 'gebaeude', typ: 'holzfaeller', q: 6, r: 0 });
    sim.befehl(sim.tick, 0, { art: 'weg', pfad: gerade(0, 0, 0, 6) });
    lauf(sim, 600);
    const zurueck = Simulation.ausStand(k, sim.stand());
    lauf(zurueck, 300); lauf(sim, 300);
    expect(zurueck.pruefsumme()).toBe(sim.pruefsumme());
    expect(spieleAb(k, sim.protokoll(KARTE_INFO), sim.tick).pruefsumme()).toBe(sim.pruefsumme());
  });

  it('Ziele: Bewohner, Lager, Gebäude, Stufe, Punkte, König, Ort (fehlt der Ort, zählt er als erfüllt)', () => {
    const sim = new Simulation(k, 4, { q: 0, r: 0 }, { gebiet: 1, ziel: 'ohne_ende' });
    const s = sim.sicht(0);
    const ziele: Ziel[] = [
      { art: 'bewohner', n: 5 }, { art: 'bewohner', n: 500 }, { art: 'lager', ware: 'bretter', n: 1 }, { art: 'gebaeude', typ: 'saegewerk', n: 1 },
      { art: 'stufe', n: 1 }, { art: 'punkte', n: 1 }, { art: 'koenig' }, { art: 'ort', name: 'Nirgendwo' },
    ];
    const st = zieleStand(ziele, s, 0, () => '');
    expect(st.map((z) => z.erfuellt)).toEqual([true, false, true, false, false, (s.spieler[0]?.punkte ?? 0) >= 1, false, true]);
    expect(st[7].fehlt).toBe(true);
    expect(st[2].text).toContain('Bretter');
    // ein Ort auf der Karte, der noch niemandem gehört
    if (s.orte.length) {
      const o = zieleStand([{ art: 'ort', name: 'Testdorf' }], s, 0, (i) => (i === 0 ? 'Testdorf' : ''));
      expect(o[0].erfuellt).toBe(s.orte[0].besitzer === 0);
      expect(o[0].fehlt).toBeUndefined();
    }
  });
});
