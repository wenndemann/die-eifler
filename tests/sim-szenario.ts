// Gemeinsame Hilfen für die Simulationstests: synthetische Karte und das 30-Segment-Szenario.
// Darf nur src/sim und reine TS-Logik verwenden (wird später auch im Browser abgespielt).
import { Simulation } from '../src/sim/sim';
import { SimKarte } from '../src/sim/karte';
import type { Befehl, KarteDaten, Protokoll, ProtokollEintrag } from '../src/sim/typen';

export const KARTE_INFO = { version: 'test', q: 0, r: 0, size: 'klein', pruefsumme: 'synthetisch' };

const abstandHex = (q: number, r: number, q2: number, r2: number) => (Math.abs(q - q2) + Math.abs(r - r2) + Math.abs(q - q2 + r - r2)) / 2;

/** Orte für Wald (Radius 2 um diese Hexe, ohne die Mitte) und Felsen in der Testkarte (mit `natur`). */
const WALD_UM = [[-6, -6], [3, -6], [3, -3], [9, 0]];
const FELS_BEI = [[-7, 3], [-8, 3], [-7, 4], [4, 3], [5, 3], [4, 4], [10, 3], [11, 3], [10, 4]];

/**
 * Radius 30 um (0,0): Wiese mit sanften Höhen, Teich bei (-15,8) und (6,14), Fels bei (8,-10), Bahn in Zeile 18, Hang ab q ≥ 10.
 * Mit `natur` (Standard) kommen Wald um die Holzfäller-Plätze des 30-Segment-Gitters und um (9,0) und Fels an den Steinbruch-Plätzen
 * dazu; ohne bleibt die Karte kahl (Abnahmetest M4 legt sein eigenes Waldstück an).
 */
export function baueTestKarte(natur = true): KarteDaten {
  const n = 30;
  const count = 3 * n * (n + 1) + 1;
  const k: KarteDaten = {
    q: 0, r: 0, n,
    terrain: new Uint8Array(count), height: new Uint16Array(count), slope: new Uint8Array(count),
    build: new Uint8Array(count), flags: new Uint8Array(count), place: new Uint16Array(count),
  };
  let i = 0;
  const abstand = abstandHex;
  for (let r = -n; r <= n; r++) {
    for (let q = Math.max(-n, -r - n); q <= Math.min(n, -r + n); q++, i++) {
      let h = 3000 + ((((q * 7 + r * 13) % 8) + 8) % 8) * 4;
      if (q >= 10) h += (q - 9) * 70;
      k.height[i] = h;
      k.terrain[i] = 1;
      k.build[i] = q >= 10 ? 1 : 3;
      if (abstand(q, r, -15, 8) <= 2 || abstand(q, r, 6, 14) <= 1) { k.terrain[i] = 0; k.build[i] = 0; }
      if ((q === 8 && r === -10) || (q === 9 && r === -10) || (q === 8 && r === -9)) { k.terrain[i] = 5; k.build[i] = 0; }
      if (r === 18) { k.flags[i] |= 32; k.build[i] = 0; }
      // Kahle Karte: Wiesen-Hexe als Ortskern-Hexe (Bit 0) markiert – die tragen keine Streubäume und keine Lesesteine (Schnittstelle M4b).
      // Wald, den ein Test hinzufügt, setzt setzeWald (löscht die Markierung wieder).
      if (!natur && k.terrain[i] === 1) k.flags[i] |= 1;
      if (natur) {
        for (const [wq, wr] of WALD_UM) { const d = abstandHex(q, r, wq, wr); if (d >= 1 && d <= 2) k.terrain[i] = 2; }
        for (const [fq, fr] of FELS_BEI) if (q === fq && r === fr) { k.terrain[i] = 5; k.build[i] = 0; }
      }
    }
  }
  return k;
}

/** Hex i der Testkarte zu Wald machen (3 Bäume; nimmt die Kahl-Markierung von baueTestKarte(false) weg). */
export function setzeWald(k: KarteDaten, i: number): void { k.terrain[i] = 2; k.flags[i] &= ~1; }

/** Zwei Fels-Hexe (2 × 80 Stein) nördlich des Lagers: erfüllt den fairen Start, es kommen keine Lesesteinhaufen dazu. */
export function fuegeStartStein(k: KarteDaten): void {
  const sim = new SimKarte(k);
  for (const [q, r] of [[0, -6], [1, -6]]) { const i = sim.index(q, r); k.terrain[i] = 5; k.build[i] = 0; }
}

export const RICHT: readonly [number, number][] = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];

/** Gerader Pfad von (q,r) in Richtung d über `laenge` Schritte (beide Enden eingeschlossen). */
export function gerade(q: number, r: number, d: number, laenge: number): { q: number; r: number }[] {
  const p = [];
  for (let i = 0; i <= laenge; i++) p.push({ q: q + RICHT[d][0] * i, r: r + RICHT[d][1] * i });
  return p;
}

export function eintrag(tick: number, befehl: Befehl): ProtokollEintrag { return { tick, spieler: 0, befehl }; }

/** Gitterknoten (i, j) des Szenarios. */
export const knoten = (i: number, j: number) => ({ q: -6 + 3 * i, r: -6 + 3 * j });

/** Id des Gebäudes vom Typ `typ` auf Hex `h` in einer laufenden Simulation. */
export function gebaeudeId(sim: Simulation, typ: string, h: { q: number; r: number }): number {
  const g = sim.sicht().gebaeude.find((x) => x.typ === typ && x.q === h.q && x.r === h.r);
  if (!g) throw new Error(`Gebäude ${typ} bei ${h.q},${h.r} nicht gefunden`);
  return g.id;
}

/**
 * 4×4-Gitter, 33 Segmente (12 waagrecht, 12 senkrecht, 9 diagonal), Lager bei (1,1), Teilung und Abriss mittendrin. Seit M4 mit Material:
 * 3 Holzfäller, 1 Förster, 1 Sägewerk, 1 Steinbruch (zusammen 6 Arbeiter bei 34 Trägern = die 40 Bewohner) und 5 Hütten, die erst
 * mit selbst gesägten Brettern entstehen. Die lebenswichtigen Baustellen haben Priorität 3, die Hütten 1.
 */
export function baueSzenario30(): { karte: KarteDaten; protokoll: Protokoll } {
  const karte = baueTestKarte();
  const start = { ...knoten(1, 1), bewohner: 40 };
  const be: ProtokollEintrag[] = [];
  const bau = (typ: string, i: number, j: number) => be.push(eintrag(0, { art: 'gebaeude', typ, ...knoten(i, j) }));
  const wichtig: [string, number, number][] = [['holzfaeller', 0, 0], ['holzfaeller', 3, 0], ['holzfaeller', 3, 1], ['steinbruch', 0, 3], ['saegewerk', 2, 2]];
  const huetten: [number, number][] = [[2, 1], [0, 1], [3, 2], [1, 2], [3, 3]];
  for (const [typ, i, j] of wichtig) bau(typ, i, j);
  bau('foerster', 2, 0);
  for (const [i, j] of huetten) bau('wohnhaus', i, j);
  for (const [i, j] of [[1, 0], [0, 2], [1, 3], [2, 3]]) be.push(eintrag(0, { art: 'fahne', ...knoten(i, j) }));
  const weg = (a: { q: number; r: number }, d: number) => be.push(eintrag(0, { art: 'weg', pfad: gerade(a.q, a.r, d, 3) }));
  for (let j = 0; j < 4; j++) for (let i = 0; i < 3; i++) weg(knoten(i, j), 0);
  for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) weg(knoten(i, j), 5);
  for (let i = 0; i < 3; i++) for (let j = 1; j < 4; j++) weg(knoten(i, j), 1);
  const ticks = 12000;
  const protokoll: Protokoll = { format: 1, karte: { ...KARTE_INFO }, saat: 4711, start, befehle: be, ticks };
  // Prioritäten: die Ids der Baustellen kommen aus einem Probelauf (Befehle von Tick 0 sind nach einem Tick ausgeführt).
  const probe0 = new Simulation(karte, protokoll.saat, start);
  for (const e of be) probe0.befehl(e.tick, e.spieler, e.befehl);
  probe0.schritt(); probe0.schritt();
  for (const [typ, i, j] of wichtig) be.push(eintrag(2, { art: 'prioritaet', id: gebaeudeId(probe0, typ, knoten(i, j)), stufe: 3 }));
  for (const [i, j] of huetten) be.push(eintrag(2, { art: 'prioritaet', id: gebaeudeId(probe0, 'wohnhaus', knoten(i, j)), stufe: 1 }));
  // Teilung eines Weges bei Tick 2500 (Fahne mitten auf Segment (0,0)-(1,0)).
  be.push(eintrag(2500, { art: 'fahne', q: knoten(0, 0).q + 1, r: knoten(0, 0).r }));
  // Abriss eines senkrechten Segments bei 4000, Wiederaufbau bei 4300. Die Segment-Id kommt aus einem Probelauf.
  const probe = new Simulation(karte, protokoll.saat, start);
  for (const e of be) probe.befehl(e.tick, e.spieler, e.befehl);
  while (probe.tick < 4000) probe.schritt();
  const a = knoten(2, 1), b = knoten(2, 2);
  const seg = probe.sicht().segmente.find((s) => s.pfad[0].q === a.q && s.pfad[0].r === a.r && s.pfad[s.pfad.length - 1].q === b.q && s.pfad[s.pfad.length - 1].r === b.r);
  if (!seg) throw new Error('Segment für Abriss nicht gefunden');
  be.push(eintrag(4000, { art: 'abriss_weg', id: seg.id }));
  be.push(eintrag(4300, { art: 'weg', pfad: gerade(a.q, a.r, 5, 3) }));
  return { karte, protokoll };
}

// ------------------------------------------------------------------ M4: kleine Holzwirtschaft

/** Waldstück der M4-Abnahme: wenige Hexe (je 3 Bäume) neben dem Holzfäller bei (6,0). */
export const M4_WALD = [{ q: 7, r: -1 }, { q: 7, r: 0 }, { q: 7, r: 1 }, { q: 8, r: -1 }, { q: 8, r: 0 }];
/** Felsen der M4-Abnahme am Steinbruch bei (-6,0). */
export const M4_FELS = [{ q: -7, r: 0 }, { q: -8, r: 0 }, { q: -7, r: 1 }];
export const M4_ORTE = {
  lager: { q: 0, r: 0, bewohner: 40 }, holzfaeller: { q: 6, r: 0 }, foerster: { q: 6, r: 2 }, saegewerk: { q: 3, r: 3 }, steinbruch: { q: -6, r: 0 },
  huette: { q: 0, r: 3 },
};

/** Kahle Testkarte mit kleinem Waldstück und Felsen für die M4-Abnahme. */
export function baueM4Karte(): KarteDaten {
  const k = baueTestKarte(false);
  const sim = new SimKarte(k);
  for (const h of M4_WALD) setzeWald(k, sim.index(h.q, h.r));
  for (const h of M4_FELS) { const i = sim.index(h.q, h.r); k.terrain[i] = 5; k.build[i] = 0; }
  return k;
}

/**
 * Alle Befehle für die M4-Abnahme bei Tick 0: Holzfäller (6,0) und Förster (6,2) nebeneinander am Waldstück, Sägewerk (3,3),
 * Steinbruch (-6,0) am Fels, Hütte (0,3), Wege (Fahnen in der Mitte). `ohneFoerster` lässt Förster und seinen Weg weg (Gegenprobe).
 */
export function baueM4Befehle(ohneFoerster = false): ProtokollEintrag[] {
  const o = M4_ORTE, be: ProtokollEintrag[] = [];
  const bau = (typ: string, h: { q: number; r: number }) => be.push(eintrag(0, { art: 'gebaeude', typ, ...h }));
  bau('holzfaeller', o.holzfaeller);
  if (!ohneFoerster) bau('foerster', o.foerster);
  bau('saegewerk', o.saegewerk);
  bau('steinbruch', o.steinbruch);
  bau('wohnhaus', o.huette);
  for (const h of [{ q: 3, r: 0 }, { q: -3, r: 0 }]) be.push(eintrag(0, { art: 'fahne', ...h }));
  const weg = (a: { q: number; r: number }, d: number, n: number) => be.push(eintrag(0, { art: 'weg', pfad: gerade(a.q, a.r, d, n) }));
  weg({ q: 0, r: 0 }, 0, 3); weg({ q: 3, r: 0 }, 0, 3);   // Lager – (3,0) – Holzfäller
  weg({ q: 3, r: 0 }, 5, 3);                               // (3,0) – Sägewerk
  weg({ q: 0, r: 0 }, 3, 3); weg({ q: -3, r: 0 }, 3, 3);   // Lager – (-3,0) – Steinbruch
  weg({ q: 0, r: 0 }, 5, 3);                               // Lager – Hütte
  if (!ohneFoerster) weg(o.holzfaeller, 5, 2);             // Holzfäller – Förster
  return be;
}

/** Holzwirtschaft über 10 Spielminuten (12000 Ticks) auf der M4-Karte, mit Prioritätswechsel, Abriss und Neubau mittendrin. */
export function baueSzenarioM4(): { karte: KarteDaten; protokoll: Protokoll } {
  const karte = baueM4Karte();
  const o = M4_ORTE;
  const be = baueM4Befehle();
  const protokoll: Protokoll = { format: 1, karte: { ...KARTE_INFO }, saat: 20260, start: o.lager, befehle: be, ticks: 12000 };
  const probe = new Simulation(karte, protokoll.saat, o.lager);
  for (const e of be) probe.befehl(e.tick, e.spieler, e.befehl);
  probe.schritt(); probe.schritt();
  be.push(eintrag(2, { art: 'prioritaet', id: gebaeudeId(probe, 'wohnhaus', o.huette), stufe: 1 }));
  be.push(eintrag(2, { art: 'prioritaet', id: gebaeudeId(probe, 'saegewerk', o.saegewerk), stufe: 3 }));
  // Bei 5000 wird der Steinbruch abgerissen (die Fahne bleibt), bei 5400 entsteht eine zweite Hütte samt Weg, bei 7000 fällt der Förster
  while (probe.tick < 5000) probe.schritt();
  be.push(eintrag(5000, { art: 'abriss_gebaeude', id: gebaeudeId(probe, 'steinbruch', o.steinbruch) }));
  be.push(eintrag(5400, { art: 'gebaeude', typ: 'wohnhaus', q: 0, r: -3 }));
  be.push(eintrag(5400, { art: 'weg', pfad: gerade(0, 0, 2, 3) }));
  while (probe.tick < 7000) probe.schritt();
  be.push(eintrag(7000, { art: 'abriss_gebaeude', id: gebaeudeId(probe, 'foerster', o.foerster) }));
  return { karte, protokoll };
}
