// M6: Startplätze in verschiedenen Ortskernen und Spielstand-Datei (reine Logik).
import { describe, expect, it } from 'vitest';
import { orteAus, pruefeStartplaetze, START_ABSTAND_MIN, verteileStartplaetze } from '../src/netz/startplaetze';
import { ausschnittVon, baueSpielstand, dateiname, leseSpielstand } from '../src/spiel/spielstand';
import { Simulation } from '../src/sim/sim';
import { baueTestKarte, KARTE_INFO } from './sim-szenario';

const KERNE = [
  { q: 0, r: 0, name: 'Nideggen' }, { q: 1, r: 0, name: 'Nideggen' }, { q: 3, r: 1, name: 'Brück' },
  { q: -20, r: 4, name: 'Heimbach' }, { q: 18, r: -18, name: 'Abenden' }, { q: 6, r: 6, name: '' },
];

describe('Startplätze', () => {
  it('ein Ort je Name, ohne namenlose Kerne, nach Name sortiert', () => {
    expect(orteAus(KERNE).map((o) => o.name)).toEqual(['Abenden', 'Brück', 'Heimbach', 'Nideggen']);
    expect(orteAus(KERNE).find((o) => o.name === 'Nideggen')).toEqual({ name: 'Nideggen', q: 0, r: 0 });
  });
  it('möglichst weit auseinander, der Startort des Gastgebers zuerst', () => {
    const o = orteAus(KERNE);
    expect(verteileStartplaetze(o, 2, { q: 0, r: 0 })).toEqual(['Nideggen', 'Heimbach']);
    expect(verteileStartplaetze(o, 3, { q: 0, r: 0 }, 'Brück')).toEqual(['Brück', 'Heimbach', 'Abenden']);
    expect(verteileStartplaetze(o.slice(0, 1), 3, { q: 0, r: 0 })).toEqual(['Abenden', '', '']);
  });
  it('doppelte oder fehlende Orte verhindern den Start, nahe Lager geben einen Hinweis', () => {
    expect(pruefeStartplaetze([{ q: 0, r: 0 }, { q: 0, r: 0 }], ['A', 'A']).fehler.length).toBe(1);
    expect(pruefeStartplaetze([{ q: 0, r: 0 }, null], ['A', '']).fehler.length).toBe(1);
    const nah = pruefeStartplaetze([{ q: 0, r: 0 }, { q: START_ABSTAND_MIN - 1, r: 0 }], ['A', 'B']);
    expect(nah).toEqual({ fehler: [], hinweise: ['A und B liegen sehr nah beieinander.'] });
    expect(pruefeStartplaetze([{ q: 0, r: 0 }, { q: START_ABSTAND_MIN, r: 0 }], ['A', 'B'])).toEqual({ fehler: [], hinweise: [] });
  });
});

describe('Spielstand-Datei', () => {
  it('speichern und lesen: Karte, Spieler, Pausen und Stand kommen heil zurück', () => {
    const sim = new Simulation(baueTestKarte(), 4, [{ q: 0, r: 0 }, { q: -6, r: 0 }]);
    for (let i = 0; i < 300; i++) sim.schritt();
    const st = baueSpielstand(KARTE_INFO, ['Mechthild', 'Pitter'], sim.stand(), [3, 1]);
    const zurueck = leseSpielstand(JSON.stringify(st));
    expect(zurueck.spieler).toEqual(['Mechthild', 'Pitter']);
    expect(zurueck.pausen).toEqual([3, 1]);
    expect(ausschnittVon(zurueck)).toEqual({ version: 'test', q: 0, r: 0, size: 'klein' });
    expect(Simulation.ausStand(baueTestKarte(), zurueck.stand).pruefsumme()).toBe(sim.pruefsumme());
  });
  it('fremde Dateien werden mit verständlicher Meldung abgelehnt', () => {
    expect(() => leseSpielstand('kein json')).toThrow(/kein JSON/);
    expect(() => leseSpielstand('{"a":1}')).toThrow(/keine Spielstand-Datei/);
    expect(() => leseSpielstand(JSON.stringify({ art: 'die-eifeler-spielstand', format: 2 }))).toThrow(/neueren Version/);
    expect(() => leseSpielstand(JSON.stringify({ art: 'die-eifeler-spielstand', format: 1, karte: KARTE_INFO, spieler: ['x'], stand: { starts: [] } }))).toThrow(/unvollständig/);
  });
  it('Dateiname aus Ort und Zeit', () => {
    expect(dateiname('Höfen/Monschau', new Date(2026, 9, 20, 9, 5))).toBe('eifeler-hoefen-monschau-20261020-0905.json');
  });
});
