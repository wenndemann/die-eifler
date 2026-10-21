// M12: Klang und Wetter-Optik – die reinen Teile (Noten, was zu hören ist, Stimmung aus Wetter und Tageszeit).
// WebAudio und WebGL selbst prüft der Smoke-Test nur auf Fehlerfreiheit.
import { describe, expect, it } from 'vitest';
import klang from '../data/klang.json';
import optik from '../data/optik.json';
import { GEBAEUDE, JAHRESZEIT_TICKS, WETTER } from '../src/sim/daten';
import { frequenz, laengeAchtel, leseBass, leseMelodie, vokaleVon } from '../src/klang/noten';
import { klangLage, KLANG_QUELLEN } from '../src/spiel/klanglage';
import { stunde, TAG_TICKS, tageszeit, wetterStimmung } from '../src/spiel/stimmung';
import { Simulation } from '../src/sim/sim';
import { KEIN_JAHR, type SimSicht } from '../src/sim/typen';
import { baueTestKarte } from './sim-szenario';

const art = (id: string) => WETTER.findIndex((w) => w.id === id);
const OHNE = { regen: 0, schnee: 0, nebel: 0, wind: 0, hochwasser: 0, wolken: 0 };

describe('M12 Noten', () => {
  it('Frequenzen, Melodien und Bass aus data/klang.json', () => {
    expect(frequenz('A4')).toBeCloseTo(440, 6);
    expect(frequenz('C4')).toBeCloseTo(261.63, 1);
    expect(frequenz('Bb4')).toBeCloseTo(466.16, 1);
    expect(frequenz('F#4')).toBeCloseTo(369.99, 1);
    expect(frequenz('quatsch')).toBeNull();
    expect(leseMelodie('G4:2 -:1 C5')).toEqual([{ hz: frequenz('G4'), achtel: 2 }, { hz: null, achtel: 1 }, { hz: frequenz('C5'), achtel: 1 }]);
    for (const s of klang.musik.stuecke) {
      const m = leseMelodie(s.melodie);
      expect(m.every((t) => t.hz === null || (t.hz > 100 && t.hz < 2000)), s.name).toBe(true);
      expect(m.filter((t) => t.hz).length, s.name).toBeGreaterThan(8);
      expect(leseBass(s.bass).every((h) => h !== null && h > 50 && h < 300), s.name).toBe(true);
      // ein Stück dauert ein paar Sekunden, nicht Minuten
      const sek = laengeAchtel(m) * 30 / s.takt;
      expect(sek, s.name).toBeGreaterThan(4); expect(sek, s.name).toBeLessThan(30);
    }
    expect(vokaleVon('joot', ['a', 'o', 'u'])).toEqual(['o', 'o']);
    expect(vokaleVon('hm', ['a', 'o'])).toEqual(['a']);
  });

  it('Arbeitsgeräusche nur für Gebäude, die es gibt', () => {
    for (const typ of Object.keys(klang.arbeit.geraeusche)) expect(GEBAEUDE[typ], typ).toBeDefined();
  });
});

describe('M12 Stimmung aus Wetter und Tageszeit', () => {
  it('Tag läuft mit dem Spieltick, das Spiel beginnt am Vormittag', () => {
    expect(tageszeit(0)).toBeCloseTo(optik.tag.start, 6);
    expect(stunde(tageszeit(0))).toBeGreaterThanOrEqual(7);
    expect(stunde(tageszeit(0))).toBeLessThanOrEqual(10);
    expect(tageszeit(TAG_TICKS)).toBeCloseTo(optik.tag.start, 6);
    expect(stunde(0.5)).toBe(12);
  });

  it('Regen, Talnebel, Wind, Hochwasser, Dürre; im Winter Schnee statt Regen', () => {
    const j = (jz: number, arten: string[], rest = JAHRESZEIT_TICKS) => ({ ...KEIN_JAHR, jahreszeit: jz, rest, wetter: arten.map((a) => ({ art: art(a), bis: 1e9, feld: '' })) });
    expect(wetterStimmung(0, j(0, [])).lage).toMatchObject({ regen: 0, schnee: 0, nebel: 0, hochwasser: 0 });
    const r = wetterStimmung(0, j(0, ['regen']));
    expect(r.lage.regen).toBe(1); expect(r.stimmung.wolken).toBe(1);
    expect(wetterStimmung(0, j(0, ['talnebel'])).lage.nebel).toBe(1);
    expect(wetterStimmung(0, j(1, ['wind'])).lage.wind).toBe(1);
    expect(wetterStimmung(0, j(0, ['hochwasser'])).lage).toMatchObject({ hochwasser: 1, regen: 0.6 });
    expect(wetterStimmung(0, j(1, ['duerre'])).stimmung.duerre).toBe(1);
    // Winter: am Anfang kräftiger Schneefall, später leicht; kein Regen
    expect(wetterStimmung(0, j(3, [], JAHRESZEIT_TICKS)).lage).toMatchObject({ schnee: 1, regen: 0 });
    expect(wetterStimmung(0, j(3, [], 1)).lage.schnee).toBe(optik.schnee.winter_anteil);
    // Morgennebel im Herbst, nicht im Sommer
    const morgen = Math.round(((0.28 - optik.tag.start + 1) % 1) * TAG_TICKS);
    expect(wetterStimmung(morgen, j(2, [])).lage.nebel).toBeGreaterThan(0.3);
    expect(wetterStimmung(morgen, j(1, [])).lage.nebel).toBe(0);
  });
});

describe('M12 was zu hören ist', () => {
  it('arbeitende Gebäude nah am Blickpunkt, links und rechts, die nächsten zuerst; Fest', () => {
    const sim = new Simulation(baueTestKarte(false), 1, { q: 0, r: 0 });
    const s0 = sim.sicht(0);
    const wo = (h: { q: number; r: number }) => ({ x: h.q * 100, z: h.r * 100 });
    const g = (id: number, typ: string, q: number, zustand = 'arbeitet') => ({ ...s0.gebaeude[0], id, typ, q, r: 0, sp: 0, zustand });
    const s = { ...s0, gebaeude: [g(10, 'schmiede', -2), g(11, 'saegewerk', 3), g(12, 'saegewerk', 1, 'kein_arbeiter'), g(13, 'kueche', 0), g(14, 'steinbruch', 40)] } as unknown as SimSicht;
    const l = klangLage(s, 0, wo, { x: 0, z: 0 }, { x: 1, z: 0 }, 600, 0.5, OHNE);
    expect(l.arbeit.map((a) => a.typ)).toEqual(['schmiede', 'saegewerk']);
    expect(l.arbeit[0].pan).toBeLessThan(0);
    expect(l.arbeit[1].pan).toBeGreaterThan(0);
    expect(l.arbeit[0].naehe).toBeGreaterThan(l.arbeit[1].naehe);
    expect(l.fest).toBe(false);
    const viele = { ...s, gebaeude: Array.from({ length: 20 }, (_, i) => g(100 + i, 'schmiede', i % 5)) } as unknown as SimSicht;
    expect(klangLage(viele, 0, wo, { x: 0, z: 0 }, { x: 1, z: 0 }, 600, 0.5, OHNE).arbeit.length).toBe(KLANG_QUELLEN);
    const fest = { ...s, gebaeude: [g(20, 'kirmesplatz', 0, 'fest')] } as unknown as SimSicht;
    expect(klangLage(fest, 0, wo, { x: 0, z: 0 }, { x: 1, z: 0 }, 600, 0.5, OHNE).fest).toBe(true);
  });
});
