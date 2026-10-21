// M7: Fensterinhalte als Daten – jedes Gebäude hat ein Fenster aus seinen Daten, ohne Code für einzelne Gebäude.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { Simulation } from '../src/sim/sim';
import { ABNEHMER, GEBAEUDE, GEBAEUDE_IDS, STAT_TAKT, VERTEILUNG_STANDARD, WARE, WAREN, WAREN_NAMEN } from '../src/sim/daten';
import type { Abschnitt, FensterDaten } from '../src/ui/fenster';
import {
  bauTooltip, betroffen, fahneFenster, gebaeudeFenster, hilfeFenster, Produktivitaet, protokollFenster, statistikFenster, verteilungFenster,
  verteilungKnopf, warenFenster, warnungen, wegFenster, type FensterKontext,
} from '../src/spiel/fensterdaten';
import { wareTexte } from '../src/spiel/baumenue';
import { leseEinstellungen, STANDARD } from '../src/ui/einstellungen';
import { baueSpielstand, leseAutosaveText } from '../src/spiel/spielstand';
import { baueTestKarte, gerade, KARTE_INFO } from './sim-szenario';

const WT = wareTexte(WAREN, WAREN_NAMEN);
const tu = (sim: Simulation, b: Parameters<Simulation['befehl']>[2], sp = 0) => sim.befehl(sim.tick, sp, b);
const lauf = (sim: Simulation, n: number) => { for (let i = 0; i < n; i++) sim.schritt(); };
const fertig = (sim: Simulation, typ: string, q: number, r: number, sofort = true) => {
  const s = sim as unknown as { karte: { index(q: number, r: number): number }; gebaeudeErzeugen(t: string, h: number, sofort: boolean, sp: number): { id: number } };
  return s.gebaeudeErzeugen(typ, s.karte.index(q, r), sofort, 0).id;
};
const kontext = (sim: Simulation, ich = 0): FensterKontext => ({ sicht: sim.sicht(ich), ich, ware: WT, namen: ['Du', 'Nachbar'] });
const titel = (d: FensterDaten) => d.abschnitte.map((a) => ('titel' in a ? a.titel : undefined)).filter(Boolean);
const knoepfe = (d: FensterDaten) => d.abschnitte.flatMap((a) => (a.art === 'knoepfe' ? a.knoepfe.map((k) => k.id) : []));
const art = <T extends Abschnitt['art']>(d: FensterDaten, a: T) => d.abschnitte.filter((x): x is Extract<Abschnitt, { art: T }> => x.art === a);

describe('Gebäudefenster aus den Daten (Abnahme M7: jedes Gebäude hat ein Fenster ohne Sondercode)', () => {
  it('jedes Gebäude, fertig und als Baustelle: Zustand, Abschnitte nach seinen Datenfeldern, Knöpfe', () => {
    for (const id of GEBAEUDE_IDS) {
      const t = GEBAEUDE[id];
      const sim = new Simulation(baueTestKarte(false), 1, { q: 0, r: 0 });
      const gid = id === 'lager' ? 1 : fertig(sim, id, 4, 0);
      const bid = id === 'lager' ? 0 : fertig(sim, id, -4, 0, false);
      tu(sim, { art: 'weg', pfad: gerade(0, 0, 0, 4) });
      lauf(sim, 30);
      const d = gebaeudeFenster(gid, kontext(sim))!;
      expect(d, id).not.toBeNull();
      expect(d.titel).toBe(t.name);
      expect(d.abschnitte[0].art, id).toBe('status');
      const ti = titel(d), kn = knoepfe(d);
      expect(kn).toContain('kamera');
      if (t.pufferSumme > 0) expect(ti, id).toContain('Eingang');
      if (t.ausgangMax > 0) expect(ti, id).toContain('Ausgang (wartet auf Abholung)');
      if (t.radius > 0) { expect(ti, id).toContain('Arbeitsbereich'); expect(kn, id).toContain('bereich'); }
      if (t.arbeiter) expect(ti, id).toContain('Produktivität');
      if (t.vorrat.some((n) => n > 0)) expect(ti, id).toContain('Dorf');
      expect(kn.includes('ruhen'), id).toBe(t.pausierbar);
      expect(kn.includes('abriss'), id).toBe(id !== 'lager');
      if (bid) {
        const b = gebaeudeFenster(bid, kontext(sim))!;
        expect(b.titel, id).toBe(`${t.name} (Baustelle)`);
        expect(knoepfe(b), id).toEqual(expect.arrayContaining(['prio:1', 'prio:2', 'prio:3', 'abriss']));
        expect(art(b, 'balken').length, id).toBe(1);
        if (t.radius > 0) expect(knoepfe(b), id).toContain('bereich');
      }
      expect(gebaeudeFenster(9999, kontext(sim))).toBeNull();
    }
  });

  it('der Code der Fenster nennt kein einzelnes Gebäude (außer dem Lager, das nicht abgerissen wird)', () => {
    const src = readFileSync(new URL('../src/spiel/fensterdaten.ts', import.meta.url), 'utf8');
    for (const id of GEBAEUDE_IDS) if (id !== 'lager') expect(src.includes(`'${id}'`), id).toBe(false);
  });

  it('Lagerfenster: Bestand nach Kategorie der Ware', () => {
    const sim = new Simulation(baueTestKarte(false), 1, { q: 0, r: 0 });
    const d = gebaeudeFenster(1, kontext(sim))!;
    const w = art(d, 'waren');
    expect(w.map((x) => x.titel)).toEqual(expect.arrayContaining(['Grundstoff', 'Nahrung (einfach)']));
    expect(w.find((x) => x.titel === 'Grundstoff')!.waren).toContainEqual({ ware: WARE.bretter, n: 12 });
  });

  it('fremde Gebäude: nur wem es gehört und Hinsehen', () => {
    const sim = new Simulation(baueTestKarte(false), 1, [{ q: 0, r: 0 }, { q: -9, r: 0 }]);
    const fremd = sim.sicht(0).gebaeude.find((g) => g.sp === 1)!;
    const d = gebaeudeFenster(fremd.id, kontext(sim))!;
    expect((d.abschnitte[0] as { text: string }).text).toContain('Nachbar');
    expect(knoepfe(d)).toEqual(['kamera']);
  });

  it('Ruhen und Abrissfrage spiegeln sich in den Knöpfen', () => {
    const sim = new Simulation(baueTestKarte(false), 1, { q: 0, r: 0 });
    const id = fertig(sim, 'kartoffelfeld', 4, 0);
    tu(sim, { art: 'weg', pfad: gerade(0, 0, 0, 4) });
    tu(sim, { art: 'ruhen', id, an: true });
    lauf(sim, 2);
    const d = gebaeudeFenster(id, { ...kontext(sim), abrissFrage: `geb:${id}` })!;
    const kn = art(d, 'knoepfe').flatMap((a) => a.knoepfe);
    expect(kn.find((k) => k.id === 'ruhen')).toMatchObject({ an: true, text: '▶ Weiterarbeiten' });
    expect(kn.find((k) => k.id === 'abriss')!.text).toBe('Wirklich abreißen?');
    expect((d.abschnitte[0] as { text: string }).text).toBe('Angehalten');
  });
});

describe('Fahne, Weg, Waren', () => {
  it('Fahnenfenster mit Stapel und Zielen, Wegfenster mit Träger', () => {
    const sim = new Simulation(baueTestKarte(false), 1, { q: 0, r: 0 });
    fertig(sim, 'wohnhaus', 5, 0, false);
    tu(sim, { art: 'weg', pfad: gerade(0, 0, 0, 5) });
    lauf(sim, 12);
    const s = sim.sicht();
    const lagerFahne = s.fahnen.find((f) => f.gebaeude === 1)!;
    const d = fahneFenster(lagerFahne.id, kontext(sim))!;
    const [stapel, wege] = art(d, 'tabelle');
    expect(stapel.zeilen.length).toBe(lagerFahne.waren.length);
    if (stapel.zeilen.length) expect(stapel.zeilen[0].zellen[1].text).toBe('Wohnhaus');
    expect(wege.zeilen.length).toBe(1);
    const seg = s.segmente[0];
    expect(wege.zeilen[0].knopf).toBe(`weg:${seg.id}`);
    const w = wegFenster(seg.id, kontext(sim))!;
    expect(w.titel).toBe('Weg und Träger');
    expect(knoepfe(w)).toEqual(expect.arrayContaining(['kamera', 'abriss', `fahne:${seg.a}`]));
    expect(fahneFenster(999, kontext(sim))).toBeNull();
    expect(wegFenster(999, kontext(sim))).toBeNull();
  });

  it('Warenübersicht: Lager, unterwegs, in Häusern, gemacht je Ware', () => {
    const sim = new Simulation(baueTestKarte(false), 1, { q: 0, r: 0 });
    const d = warenFenster(kontext(sim));
    const zeilen = art(d, 'tabelle').flatMap((t) => t.zeilen);
    expect(zeilen.length).toBe(WAREN.length);
    const bretter = zeilen.find((z) => z.zellen[0].ware === WARE.bretter)!;
    expect(bretter.zellen.map((z) => z.text)).toEqual(['Bretter', '12', '0', '0', '0']);
  });
});

describe('M8 im Fenster: Lagerregeln, Bauleute, Feste, Boten', () => {
  it('Lager und Lagerhaus: Regel je Ware als Tabelle (Knopf regel:<ware>), Bauleute-Wunschzahl mit Knöpfen', () => {
    const sim = new Simulation(baueTestKarte(false), 1, { q: 0, r: 0 });
    const lh = fertig(sim, 'lagerhaus', 6, 0);
    tu(sim, { art: 'lagerregel', id: 1, ware: WARE.stein, regel: 2 });
    lauf(sim, 2);
    for (const id of [1, lh]) {
      const d = gebaeudeFenster(id, kontext(sim))!;
      const tab = art(d, 'tabelle').find((x) => x.titel?.startsWith('Lagerregeln'))!;
      expect(tab.zeilen.length).toBe(WAREN.length);
      expect(tab.zeilen[WARE.stein].knopf).toBe(`regel:${WARE.stein}`);
      expect(tab.zeilen[WARE.stein].zellen[2].text).toContain(id === 1 ? 'auslagern' : 'normal');
      expect(knoepfe(d)).toEqual(expect.arrayContaining(['bau:-', 'bau:+', 'plan:-', 'plan:+']));
    }
  });

  it('Kirmesplatz zeigt Mischkorb, kleines Fest und Festpunkte; Schänke ihre Boten; Felder und Fachkräfte ihre Regeln', () => {
    const sim = new Simulation(baueTestKarte(false), 1, { q: 0, r: 0 });
    (sim as unknown as { doerfer: { stufe: number }[] }).doerfer[0].stufe = 2;
    const kp = fertig(sim, 'kirmesplatz', 4, 0);
    const sch = fertig(sim, 'schaenke', -4, 0);
    lauf(sim, 2);
    const d = gebaeudeFenster(kp, kontext(sim))!;
    const z = art(d, 'zeilen').flatMap((x) => x.zeilen).join(' ');
    expect(z).toContain('Mischkorb');
    expect(z).toContain('Punkte aus kleinen Festen');
    expect(titel(d).some((x) => String(x).includes('Maifest'))).toBe(true);
    expect(art(gebaeudeFenster(sch, kontext(sim))!, 'zeilen').some((x) => x.titel === 'Boten')).toBe(true);
    expect(bauTooltip('gerstenfeld', WT).join(' ')).toContain('Winter');
    expect(bauTooltip('erzgrube', WT).join(' ')).toContain('Werkzeug');
  });
});

describe('Warenverteilung im Fenster', () => {
  it('nur Waren mit mindestens zwei Abnehmern, je Ware nur die Abnehmer, die sie nehmen', () => {
    const sim = new Simulation(baueTestKarte(false), 1, { q: 0, r: 0 });
    const d = verteilungFenster(kontext(sim));
    const r = art(d, 'rangliste')[0].zeilen;
    expect(r.some((z) => z.ware === WARE.kartoffeln)).toBe(true);
    expect(r.some((z) => z.ware === WARE.setzling)).toBe(false); // nur Baustellen (Stein nehmen seit M11 auch Steinmetz und Mühlsteinhauerei)
    const kart = r.find((z) => z.ware === WARE.kartoffeln)!;
    expect(kart.plaetze.map((p) => p.name)).toEqual(['Kirmesplatz', 'Verarbeiter', 'Wohnhäuser']); // Kirmesplatz: Erntedank
    expect(kart.standard).toBe(true);
    expect(betroffen(WARE.kaese)).toEqual(ABNEHMER.map((a) => a.id !== 'baustelle'));
  });

  it('Knopf rückt eins vor (über Abnehmer hinweg, die die Ware nicht nehmen), ↺ setzt zurück', () => {
    const v = WAREN.map(() => [...VERTEILUNG_STANDARD]);
    // Kartoffeln: Wohnhäuser (Rang 3) vor Verarbeiter (Rang 2)
    expect(verteilungKnopf(`v:${WARE.kartoffeln}:3`, v)).toEqual({ ware: WARE.kartoffeln, reihe: [0, 1, 3, 2] });
    // Käse: Verarbeiter (Rang 2) vor Kirmesplatz (Rang 1)
    expect(verteilungKnopf(`v:${WARE.kaese}:2`, v)).toEqual({ ware: WARE.kaese, reihe: [0, 2, 1, 3] });
    // Kartoffeln: Verarbeiter vor Kirmesplatz (Erntedank); der Kirmesplatz ist schon der erste, der sie nimmt
    expect(verteilungKnopf(`v:${WARE.kartoffeln}:2`, v)).toEqual({ ware: WARE.kartoffeln, reihe: [0, 2, 1, 3] });
    expect(verteilungKnopf(`v:${WARE.kartoffeln}:1`, v)).toBeNull();
    expect(verteilungKnopf(`v:${WARE.most}:std`, v)).toEqual({ ware: WARE.most, reihe: [...VERTEILUNG_STANDARD] });
    expect(verteilungKnopf('v:99:1', v)).toBeNull();
    expect(verteilungKnopf('quatsch', v)).toBeNull();
  });
});

describe('Statistik, Protokoll, Meldungen am Rand, Hilfe', () => {
  it('Statistik: eine Kurve je Dorf, Bestand und Erzeugtes je Minute', () => {
    const sim = new Simulation(baueTestKarte(false), 1, [{ q: 0, r: 0 }, { q: -9, r: 0 }]);
    lauf(sim, STAT_TAKT * 2 + 1);
    const stat = [0, 1].map((sp) => sim.statistikVon(sp));
    const d = statistikFenster(kontext(sim), stat, 'bewohner');
    const k = art(d, 'kurve')[0];
    expect(k.reihen.length).toBe(2);
    expect(k.reihen[0].punkte).toEqual([[0, 10], [1, 10], [2, 10]]);
    expect(k.reihen[0].name).toBe('Du (du)');
    const b = art(statistikFenster(kontext(sim), stat, `lager:${WARE.bretter}`), 'kurve')[0];
    expect(b.reihen[0].punkte[0]).toEqual([0, 12]);
    const rate = art(statistikFenster(kontext(sim), stat, `rate:${WARE.bretter}`), 'kurve')[0];
    expect(rate.reihen[0].punkte).toEqual([[1, 0], [2, 0]]);
  });

  it('Protokoll: neueste zuerst, Orte als Knopf', () => {
    const d = protokollFenster([{ tick: 20, text: 'a', warn: false }, { tick: 1200, text: 'b', warn: true, ort: { q: 1, r: 2 } }]);
    const t = art(d, 'tabelle')[0];
    expect(t.zeilen.map((z) => z.zellen[0].text)).toEqual(['1:00', '0:01']);
    expect(t.zeilen[0].knopf).toBe('ort:1');
    expect(t.zeilen[1].knopf).toBeUndefined();
  });

  it('Meldungen am Rand: getrennte Gebäude und volle Fahnen zusammengefasst', () => {
    const sim = new Simulation(baueTestKarte(false), 1, { q: 0, r: 0 });
    fertig(sim, 'kartoffelfeld', 5, 0);
    fertig(sim, 'kartoffelfeld', -5, 0);
    lauf(sim, 2);
    const w = warnungen(sim.sicht(), 0);
    expect(w.find((x) => x.art === 'getrennt')).toMatchObject({ text: '2× Gebäude ohne Weg zum Lager' });
    expect(w.find((x) => x.art === 'getrennt')!.orte.length).toBe(2);
  });

  it('Hilfe: Schritte und Tasten (Maus) bzw. Gesten (Touch)', () => {
    expect(art(hilfeFenster(false), 'tabelle')[0].zeilen.some((z) => z.zellen[0].text === 'I')).toBe(true);
    expect(art(hilfeFenster(true), 'tabelle')[0].zeilen.length).toBe(3);
  });

  it('Produktivität: Anteil der Sekunden mit Arbeit, erst nach 20 Messungen', () => {
    const sim = new Simulation(baueTestKarte(false), 1, { q: 0, r: 0 });
    const id = fertig(sim, 'kartoffelfeld', 4, 0);
    tu(sim, { art: 'weg', pfad: gerade(0, 0, 0, 4) });
    const p = new Produktivitaet();
    for (let i = 0; i < 40 * 20; i++) { sim.schritt(); p.messe(sim.sicht(), 0); }
    expect(p.wert(id)).toBeGreaterThan(50);
    expect(new Produktivitaet().wert(id)).toBeNull();
  });
});

describe('Einstellungen und Autosave', () => {
  it('Einstellungen: Standard, Grenzen, kaputte Werte', () => {
    expect(leseEinstellungen(null)).toEqual(STANDARD);
    expect(leseEinstellungen('{"uiGroesse": 400, "kameraTempo": 10, "autosave": false}')).toMatchObject({ uiGroesse: 150, kameraTempo: 25, autosave: false });
    expect(leseEinstellungen('kaputt')).toEqual(STANDARD);
  });

  it('Autosave im Spielstand-Format: lesbar, kaputt → null', () => {
    const sim = new Simulation(baueTestKarte(false), 1, { q: 0, r: 0 });
    lauf(sim, 50);
    const st = baueSpielstand(KARTE_INFO, ['Du'], sim.stand());
    const a = leseAutosaveText(JSON.stringify({ ort: 'Einruhr', stand: st }))!;
    expect(a.ort).toBe('Einruhr');
    expect(Simulation.ausStand(baueTestKarte(false), a.stand.stand).pruefsumme()).toBe(sim.pruefsumme());
    expect(leseAutosaveText(null)).toBeNull();
    expect(leseAutosaveText('{"ort": "x", "stand": {}}')).toBeNull();
  });
});
