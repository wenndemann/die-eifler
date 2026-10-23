// Lebendige Eifel (ROADMAP M15, aus M9): Anker der bewegten Teile kommen aus den Gebäudemodellen (Rauch, Fenster, Hühner, Wäsche,
// Wasserrad, Säge, Schmiede, Tiere, Leute, Feuer), Nacht aus der Tageszeit, Werte in data/leben.json; reine Darstellung (keine Prüfsumme).
import { describe, expect, it } from 'vitest';
import leben from '../data/leben.json';
import { lebenAnker } from '../src/render/gebaeude';
import { LebenDarstellung } from '../src/render/leben';
import { WILD_ARTEN, wildModelle } from '../src/render/wild';
import { entzerren, type Platz } from '../src/render/gedraenge';
import { fachwerk, ohneSchindeln } from '../src/render/mockup';
import { FIGUR_ATTRIBUTE, figur, TRAEGER_TRACHT, variante, VARIANTE, type Tracht } from '../src/render/traeger';
import { Instanzen } from '../src/render/instanzen';
import { botenFigur } from '../src/render/boten';
import * as THREE from 'three';
import { GEBAEUDE, GEBAEUDE_IDS } from '../src/sim/daten';
import { Simulation } from '../src/sim/sim';
import { baueTestKarte } from './sim-szenario';

const arten = (typ: string) => new Set(lebenAnker(typ).map((a) => a.art));

describe('Lebendige Eifel', () => {
  it('Anker aus den Modellen: was ein Gebäude tut, sieht man', () => {
    expect([...arten('wohnhaus')]).toEqual(expect.arrayContaining(['fenster', 'kamin', 'huhn', 'waesche']));
    expect([...arten('saegewerk')]).toEqual(expect.arrayContaining(['rad', 'saege']));
    expect([...arten('schmiede')]).toEqual(expect.arrayContaining(['esse', 'hammer', 'kamin']));
    expect(arten('schafstall').has('schafe')).toBe(true);
    expect(arten('kaeserei').has('kuehe')).toBe(true);
    expect(arten('bienenstock').has('bienen')).toBe(true);
    expect([...arten('kirmesplatz')]).toEqual(expect.arrayContaining(['kinder', 'feuer']));
    expect(arten('schaenke').has('schwaetzer')).toBe(true);
    expect([...arten('brauerei')]).toEqual(expect.arrayContaining(['dampf']));
    expect(arten('eisenhuette').has('rad')).toBe(true);
    // Spezialgebäude mit fremdem Modell bekommen eigene Anker (Mühlrad an der Senf- und Papiermühle)
    expect(arten('senfmuehle').has('rad')).toBe(true);
    expect(arten('papiermuehle').has('rad')).toBe(true);
    // jeder Gebäudetyp liefert Anker ohne Fehler, alle Zahlen endlich
    for (const id of GEBAEUDE_IDS) for (const a of lebenAnker(id)) expect([a.x, a.y, a.z].every(Number.isFinite), `${id}:${a.art}`).toBe(true);
  });

  it('Fenster liegen auf der Fassade (vorn und hinten), Hühner am Boden, Rauch über dem Dach', () => {
    const w = lebenAnker('wohnhaus');
    const fenster = w.filter((a) => a.art === 'fenster');
    expect(fenster.length).toBeGreaterThanOrEqual(4);
    expect(new Set(fenster.map((a) => a.seite))).toEqual(new Set([1, -1]));
    for (const f of fenster) expect(Math.abs(f.z)).toBeGreaterThan(3);
    for (const h of w.filter((a) => a.art === 'huhn')) expect(h.y).toBeLessThan(2);
    for (const k of w.filter((a) => a.art === 'kamin')) expect(k.y).toBeGreaterThan(8);
  });

  it('Zunftschild: Gebäude mit Fachwerk haben einen Schild-Anker, gleiche Modelle zeigen verschiedene Waren', () => {
    for (const typ of ['kaeserei', 'spinnerei', 'brauerei', 'schmiede']) expect(arten(typ).has('schild'), typ).toBe(true);
    // Spinnerei nutzt das Käserei-Modell; am Schild hängt aber Garn statt Käse
    expect(GEBAEUDE.spinnerei.ausgangWare).toBeGreaterThanOrEqual(0);
    expect(GEBAEUDE.spinnerei.ausgangWare).not.toBe(GEBAEUDE.kaeserei.ausgangWare);
    expect(leben.schild.groesse).toBeGreaterThan(0);
  });

  it('Berufe erkennbar: jeder Beruf und jeder Meister hat eine eigene Tracht, die Figur baut sich damit', () => {
    const huete = new Set<string>();
    for (const [b, t] of Object.entries(leben.berufe as Record<string, Tracht>)) { expect(t.hut, b).toBeTruthy(); huete.add(t.hut); }
    // die fünf Berufe (Holzfäller, Förster, Steinbruch, Bauarbeiter, Planierer) unterscheiden sich schon am Hut
    expect(huete.size).toBe(Object.keys(leben.berufe).length);
    expect(huete.has(TRAEGER_TRACHT.hut)).toBe(false);
    for (const [typ, t] of Object.entries(leben.meister as Record<string, Tracht>)) {
      expect(GEBAEUDE[typ], typ).toBeTruthy();
      const g = figur(t);
      expect(g.attributes.position.count, typ).toBeGreaterThan(1000);
      expect(g.attributes.aTeil.count, typ).toBe(g.attributes.position.count);
    }
    expect(figur(leben.meister.schmiede as Tracht).attributes.position.count).toBeGreaterThan(figur(TRAEGER_TRACHT).attributes.position.count);
  });

  it('Schindeldach auf den Spielgebäuden, Leisten in der Kulisse; Kontaktschatten unter dem Kleinkram', () => {
    const zahl = (gs: { attributes: { position: { count: number } } }[]) => gs.reduce((n, g) => n + g.attributes.position.count, 0);
    expect(zahl(fachwerk(12, 8, 2))).toBeGreaterThan(zahl(ohneSchindeln(() => fachwerk(12, 8, 2))) * 1.5);
    const schatten = lebenAnker('wohnhaus').filter((a) => a.art === 'schatten');
    expect(schatten.length).toBeGreaterThanOrEqual(3);
    for (const a of schatten) expect(a.r).toBeGreaterThan(0);
  });

  it('Wildtiere: Reh, Hirsch, Wildschwein mit Frischlingen, Fuchs, Hase, Wildkatze, Wolf – Modelle und Werte vollständig', () => {
    const mo = wildModelle();
    for (const a of WILD_ARTEN) {
      expect(mo[a].attributes.position.count, a).toBeGreaterThan(100);
      const c = (leben.wild.arten as Record<string, { anteil: number; n: number[]; groesse: number }>)[a];
      expect(c, a).toBeTruthy();
      expect(c.groesse, a).toBeGreaterThan(0);
    }
    // Wolf und Wildkatze sind selten, Rehe häufig
    expect(leben.wild.arten.wolf.anteil).toBeLessThan(leben.wild.arten.reh.anteil);
    expect(leben.wild.arten.wildkatze.anteil).toBeLessThan(leben.wild.arten.reh.anteil);
  });

  it('Gedränge: stehende Figuren rücken auseinander, feste Plätze (Meister) bleiben, niemand steckt im anderen', () => {
    const r = 6;
    const leute: Platz[] = [0, 1, 2, 3, 4].map((i) => ({ x: 100 + i * 0.5, z: 100, r, fest: false }));
    const meister: Platz[] = [{ x: 103, z: 103, r, fest: true }];
    entzerren(leute, meister);
    entzerren(leute, meister);
    expect(meister[0]).toEqual({ x: 103, z: 103, r, fest: true });
    for (let i = 0; i < leute.length; i++) {
      for (let j = i + 1; j < leute.length; j++) expect(Math.hypot(leute[i].x - leute[j].x, leute[i].z - leute[j].z)).toBeGreaterThan(r * 1.4);
      expect(Math.hypot(leute[i].x - 103, leute[i].z - 103)).toBeGreaterThan(r * 1.4);
    }
  });

  it('Figur-Attribute: Animation, Mimik und Gesichtsvariante landen je im richtigen Attribut (laufender Versatz)', () => {
    const satz = new Instanzen(new THREE.Group(), figur(), new THREE.MeshBasicMaterial(), true, false, FIGUR_ATTRIBUTE, 4);
    satz.beginne();
    satz.fuege(new THREE.Matrix4(), new THREE.Color(), [1, 2, 3, 4, 5, VARIANTE.brille]);
    const wert = (name: string) => [...(satz.geo.attributes[name].array as Float32Array).slice(0, (satz.geo.attributes[name] as THREE.BufferAttribute).itemSize)];
    expect(wert('aAnim')).toEqual([1, 2, 3]);
    expect(wert('aMimik')).toEqual([4, 5]);
    expect(wert('aVar')).toEqual([VARIANTE.brille]);
    // ohne Variante: 0 (Schnauzer)
    satz.fuege(new THREE.Matrix4(), new THREE.Color(), [1, 2, 3, 4, 5]);
    expect((satz.geo.attributes.aVar.array as Float32Array)[1]).toBe(0);
  });

  it('Bote und Frau mit Zöpfen: die Figur-Geometrien lassen sich zusammenfügen (alle Teile tragen die Figur-Attribute)', () => {
    const b = botenFigur();
    expect(b).toBeTruthy();
    for (const a of ['aTeil', 'aGelenk', 'aTint', 'aVariante']) expect(b.getAttribute(a)).toBeTruthy();
    const frau = figur({ ...TRAEGER_TRACHT, frau: true });
    expect(frau.getAttribute('aVariante').count).toBe(frau.getAttribute('position').count);
  });

  it('Gesichtsvarianten: fest je Id, alle fünf kommen vor, Schnauzer am häufigsten', () => {
    const zahl = [0, 0, 0, 0, 0];
    for (let id = 1; id <= 900; id++) zahl[variante(id)]++;
    expect(variante(42)).toBe(variante(42));
    for (const z of zahl) expect(z).toBeGreaterThan(50);
    expect(zahl[VARIANTE.schnauzer]).toBe(Math.max(...zahl));
  });

  it('Nacht aus der Tageszeit: Mittag hell, Mitternacht dunkel, weiche Dämmerung', () => {
    expect(LebenDarstellung.nacht(0.5)).toBe(0);
    expect(LebenDarstellung.nacht(0)).toBe(1);
    const d = LebenDarstellung.nacht(0.75);
    expect(d).toBeGreaterThan(0);
    expect(d).toBeLessThan(1);
  });

  it('Werte in data/leben.json sind vollständig; die Darstellung ändert die Simulation nicht', () => {
    for (const k of ['fern_m', 'rauch', 'dampf', 'tiere', 'voegel', 'fenster', 'wind', 'konfetti', 'feuer', 'gras', 'schild', 'berufe', 'meister', 'wild', 'laterne', 'fest']) expect(leben).toHaveProperty(k);
    expect(leben.gras.max).toBeGreaterThan(0);
    // reine Darstellung: Anker abfragen lässt Prüfsumme und Zustand der Simulation unberührt
    const sim = new Simulation(baueTestKarte(), 3, { q: 0, r: 0 });
    const vorher = sim.pruefsumme();
    lebenAnker('lager'); lebenAnker('wohnhaus');
    expect(sim.pruefsumme()).toBe(vorher);
  });
});
