// Spieltest-Bot „Die ersten 30 Minuten“ (Drehbuch 4.4, ROADMAP M5): spielt eine Partie ab 10 Bewohnern, 4 Bauarbeitern und
// 2 Planierern so, wie ein ruhiger Mensch es täte – ein Gebäude nach dem anderen, höchstens drei offene Baustellen, mindestens
// eine Minute zwischen zwei Bauaufträgen, Wohnhäuser, wenn der Wohnraum knapp wird. Er gibt nur Befehle (wie die Oberfläche),
// das Protokoll ist danach abspielbar (Determinismus Node = Browser). Darf nur src/sim und reine TS-Logik verwenden.
import { Simulation } from '../src/sim/sim';
import { SimKarte } from '../src/sim/karte';
import { GEBAEUDE, WARE } from '../src/sim/daten';
import { TICK_HZ } from '../src/sim/typen';
import type { Befehl, KarteDaten, Protokoll, SimSicht } from '../src/sim/typen';
import { baueTestKarte, KARTE_INFO } from './sim-szenario';

const MIN = 60 * TICK_HZ;
type Hx = { q: number; r: number };
const abstand = (a: Hx, b: Hx) => (Math.abs(a.q - b.q) + Math.abs(a.r - b.r) + Math.abs(a.q - b.q + a.r - b.r)) / 2;

/** Testkarte mit Hängen: rund um (-4,-4) und ab q ≥ 10 sind die Hexe steil genug, dass ein Planierer kommen muss. */
export function baueM5Karte(): KarteDaten {
  const k = baueTestKarte(true);
  const s = new SimKarte(k);
  for (let i = 0; i < s.count; i++) {
    const h = { q: s.qs[i], r: s.rs[i] };
    if (h.q >= 10) k.slope[i] = 12;
    else if (abstand(h, { q: -4, r: -4 }) <= 3) k.slope[i] = 8;
  }
  return k;
}

/** Bauaufträge in der Reihenfolge von Drehbuch 4.4: Holz und Stein, Kartoffeln und Wohnhaus, dann die Kirmes-Ketten. */
export const M5_PLAN: { typ: string; nahe: Hx }[] = [
  { typ: 'holzfaeller', nahe: { q: 5, r: -2 } },
  { typ: 'saegewerk', nahe: { q: 2, r: 2 } },
  { typ: 'steinbruch', nahe: { q: -5, r: 2 } },
  { typ: 'foerster', nahe: { q: 6, r: -4 } },
  { typ: 'kartoffelfeld', nahe: { q: -3, r: -2 } },
  { typ: 'wohnhaus', nahe: { q: 1, r: -3 } },
  { typ: 'kueche', nahe: { q: -1, r: -4 } },
  { typ: 'schafstall', nahe: { q: -3, r: 6 } },
  { typ: 'kaeserei', nahe: { q: -1, r: 4 } },
  { typ: 'obstwiese', nahe: { q: 4, r: 5 } },
  { typ: 'mostkeller', nahe: { q: 2, r: 5 } },
  { typ: 'kirmesplatz', nahe: { q: -3, r: 1 } },
  { typ: 'holzfaeller', nahe: { q: -5, r: -6 } },
  { typ: 'bienenstock', nahe: { q: 6, r: 2 } },
];

export interface BotLauf {
  sim: Simulation;
  protokoll: Protokoll;
  /** Tick, an dem die Kirmes beginnt bzw. das Dorf zur Stufe Dorf wird (-1 = nie). */
  kirmesTick: number;
  dorfTick: number;
  /** Bauauftrag → Tick (für das Spieltest-Protokoll). */
  auftraege: { tick: number; typ: string; q: number; r: number }[];
  /** Bewohner je Spielminute. */
  bewohner: number[];
  /** Zahl der zweiten Wege gegen Stau. */
  zweiteWege: number;
}

/** Bauplatz nahe `nahe` (Ringe nach außen) samt Weg zur nächsten erreichbaren Fahne, oder null. */
function suchePlatz(sim: Simulation, s: SimSicht, typ: string, nahe: Hx): { h: Hx; weg: Hx[] } | null {
  for (let d = 0; d <= 7; d++) {
    for (let dr = -d; dr <= d; dr++) {
      for (let dq = Math.max(-d, -dr - d); dq <= Math.min(d, -dr + d); dq++) {
        const h = { q: nahe.q + dq, r: nahe.r + dr };
        if (abstand(h, nahe) !== d || !sim.kannBauen(typ, h.q, h.r)) continue;
        const fahnen = s.fahnen.slice().sort((a, b) => abstand(a, h) - abstand(b, h) || a.id - b.id);
        for (const f of fahnen.slice(0, 4)) {
          if (abstand(f, h) > 8) break;
          const weg = sim.wegAbschnitt(h, f, [], 10);
          if (weg) return { h, weg };
        }
      }
    }
  }
  return null;
}

/** Zweiter Weg von der vollsten Fahne zu einer Fahne näher am Lager, mit der sie noch nicht direkt verbunden ist. */
function zweiterWeg(sim: Simulation, tu: (b: Befehl) => void, lauf: BotLauf): void {
  const s = sim.sicht();
  const lager = s.gebaeude.find((g) => g.typ === 'lager')!;
  const voll = s.fahnen.filter((f) => f.waren.length >= 7 && f.id !== lager.fahne).sort((a, b) => b.waren.length - a.waren.length || a.id - b.id);
  for (const f of voll) {
    const nachbarn = new Set<number>();
    for (const sg of s.segmente) { if (sg.a === f.id) nachbarn.add(sg.b); if (sg.b === f.id) nachbarn.add(sg.a); }
    const ziele = s.fahnen.filter((t) => t.id !== f.id && !nachbarn.has(t.id) && abstand(t, f) <= 7 && abstand(t, lager) < abstand(f, lager))
      .sort((a, b) => abstand(a, lager) - abstand(b, lager) || abstand(a, f) - abstand(b, f) || a.id - b.id);
    for (const t of ziele) {
      const weg = sim.wegVorschau(f, t);
      if (!weg) continue;
      tu({ art: 'weg', pfad: weg });
      for (let i = 3; i < weg.length - 1; i += 3) tu({ art: 'fahne', ...weg[i] });
      lauf.zweiteWege++;
      return;
    }
  }
}

/**
 * Spielt `minuten` Spielminuten mit dem Bot. `abstandS` ist die Mindestzeit zwischen zwei Bauaufträgen (Denkpause), `offenMax` die
 * Zahl offener Baustellen, ab der er wartet.
 */
export function spieleM5(minuten = 45, abstandS = 60, offenMax = 3, saat = 2026): BotLauf {
  const karte = baueM5Karte();
  const start = { q: 0, r: 0 };
  const sim = new Simulation(karte, saat, start);
  const lauf: BotLauf = { sim, protokoll: null as unknown as Protokoll, kirmesTick: -1, dorfTick: -1, auftraege: [], bewohner: [], zweiteWege: 0 };
  const tu = (b: Befehl) => sim.befehl(sim.tick, 0, b);
  let naechster = 0, letzter = -abstandS * TICK_HZ;
  const ende = minuten * MIN;
  while (sim.tick < ende) {
    if (sim.tick % TICK_HZ === 0) {
      const s = sim.sicht();
      const offen = s.gebaeude.filter((g) => g.bau < 1000).length;
      const wohnhausOffen = s.gebaeude.some((g) => g.typ === 'wohnhaus' && g.bau < 1000);
      // Wohnraum knapp und Essen da → Wohnhaus vorziehen (so spielt man, wenn die Leute ausgehen)
      const knapp = s.dorf.frei < 4 && s.dorf.wohnraum - s.dorf.bewohner < 3 && !wohnhausOffen && naechster >= 6;
      if (sim.tick - letzter >= abstandS * TICK_HZ && offen < offenMax && (naechster < M5_PLAN.length || knapp)) {
        const auftrag = knapp ? { typ: 'wohnhaus', nahe: { q: 2 * (lauf.auftraege.length % 3) - 2, r: -5 - (lauf.auftraege.length % 2) } } : M5_PLAN[naechster];
        const lager = s.gebaeude.find((g) => g.typ === 'lager')!.vorrat!;
        const genug = GEBAEUDE[auftrag.typ].kosten.every((n, a) => n <= lager[a] + (a === WARE.bretter ? 2 : 0));
        const p = genug ? suchePlatz(sim, s, auftrag.typ, auftrag.nahe) : null;
        if (p) {
          tu({ art: 'gebaeude', typ: auftrag.typ, q: p.h.q, r: p.h.r });
          tu({ art: 'weg', pfad: p.weg });
          // lange Wege mit Fahnen teilen (je Abschnitt ein Träger)
          for (let i = 3; i < p.weg.length - 1; i += 3) tu({ art: 'fahne', ...p.weg[i] });
          lauf.auftraege.push({ tick: sim.tick, typ: auftrag.typ, ...p.h });
          letzter = sim.tick;
          if (!knapp) naechster++;
        }
      }
    }
    // Alle 90 s: Staut es sich an einer Fahne (7 und mehr Waren), bekommt sie einen zweiten Weg Richtung Lager (Drehbuch 4.4, Schritt 4)
    if (sim.tick % (90 * TICK_HZ) === 45 * TICK_HZ) zweiterWeg(sim, tu, lauf);
    sim.schritt();
    if (sim.tick % MIN === 0) lauf.bewohner.push(sim.sicht().dorf.bewohner);
    if (lauf.kirmesTick < 0 || lauf.dorfTick < 0) {
      const e = sim.sicht().ereignisse;
      for (const x of e) {
        if (x.art === 'kirmes' && lauf.kirmesTick < 0) lauf.kirmesTick = x.tick;
        if (x.art === 'stufe' && lauf.dorfTick < 0) lauf.dorfTick = x.tick;
      }
    }
  }
  lauf.protokoll = sim.protokoll(KARTE_INFO);
  return lauf;
}

/** Für den Determinismus-Test Node = Browser: Karte und Protokoll einer kürzeren Bot-Partie (12 Spielminuten). */
export function baueSzenarioM5(): { karte: KarteDaten; protokoll: Protokoll } {
  const l = spieleM5(12);
  return { karte: baueM5Karte(), protokoll: l.protokoll };
}
