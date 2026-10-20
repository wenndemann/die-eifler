// Spieltest-Bot über eine ganze Partie (ROADMAP M8: Balancing über einen 2-Stunden-Lauf): spielt wie der M5-Bot ruhig ein Gebäude
// nach dem anderen, baut nach jeder Kirmes die Ketten der neuen Stufe (Bier, Schnaps, Bergkäse, dann Eisen und Werkzeug), stellt
// Wohnhäuser, wenn der Wohnraum knapp wird, und legt bei Stau zweite Wege. Er gibt nur Befehle (wie die Oberfläche), das Protokoll
// ist danach abspielbar. Darf nur src/sim und reine TS-Logik verwenden.
import { Simulation } from '../src/sim/sim';
import { GEBAEUDE, WARE } from '../src/sim/daten';
import { TICK_HZ } from '../src/sim/typen';
import type { Befehl, KarteDaten, Protokoll, SimSicht } from '../src/sim/typen';
import { KARTE_INFO } from './sim-szenario';
import { baueM5Karte, M5_PLAN, suchePlatz, zweiterWeg, type BotLauf } from './m5-szenario';

const MIN = 60 * TICK_HZ;
type Hx = { q: number; r: number };

/** Bauaufträge je Dorfstufe (nach der Kirmes, die die Stufe bringt). `nahe` wie im M5-Plan; ohne nahe: möglichst nah am Lager. */
export const M8_PLAN: { typ: string; nahe?: Hx }[][] = [
  M5_PLAN,
  [
    { typ: 'reifekeller' }, { typ: 'gerstenfeld' }, { typ: 'brauerei' }, { typ: 'wacholderheide' }, { typ: 'brennerei' },
    { typ: 'schafstall', nahe: { q: -6, r: 8 } }, { typ: 'kaeserei' }, { typ: 'bienenstock', nahe: { q: 7, r: 4 } },
    { typ: 'gerstenfeld' }, { typ: 'foerster', nahe: { q: -7, r: -4 } }, { typ: 'holzfaeller', nahe: { q: 10, r: 0 } },
    { typ: 'reifekeller' }, { typ: 'bienenstock', nahe: { q: -8, r: 0 } }, { typ: 'kartoffelfeld' }, { typ: 'schaenke' },
  ],
  [
    { typ: 'koehlerei' }, { typ: 'erzgrube', nahe: { q: 8, r: -8 } }, { typ: 'eisenhuette' }, { typ: 'schmiede' },
    { typ: 'holzfaeller', nahe: { q: 4, r: -6 } }, { typ: 'foerster', nahe: { q: 6, r: -6 } }, { typ: 'obstwiese' }, { typ: 'mostkeller' },
    { typ: 'erzgrube', nahe: { q: -8, r: 6 } }, { typ: 'schafstall' }, { typ: 'kaeserei' }, { typ: 'holzfaeller', nahe: { q: -5, r: -6 } },
  ],
];

export interface M8Lauf extends BotLauf {
  /** Tick, an dem das Dorf jede Stufe erreicht (Index = Stufe; -1 = nie). */
  stufeTick: number[];
  festPunkte: number;
  /** Spielminuten, in denen das Dorf fror. */
  frierMinuten: number;
  /** Bewohner beim ersten Wintereinbruch und an dessen Ende. */
  winterBewohner: [number, number];
}

/** Bauplatz möglichst nah am Lager (Ringe nach außen), mit Weg zur nächsten Fahne. */
function platzNahLager(sim: Simulation, s: SimSicht, typ: string): { h: Hx; weg: Hx[] } | null {
  for (let d = 2; d <= 18; d++) {
    const p = suchePlatz(sim, s, typ, { q: d, r: -Math.floor(d / 2) });
    if (p) return p;
  }
  return null;
}

/** Spielt `minuten` Spielminuten (Standard: zwei Stunden) bis zum Marktflecken. */
export function spieleM8(minuten = 120, saat = 2026, abstandS = 60, offenMax = 3): M8Lauf {
  const karte = baueM5Karte();
  const sim = new Simulation(karte, saat, { q: 0, r: 0 });
  const lauf: M8Lauf = {
    sim, protokoll: null as unknown as Protokoll, kirmesTick: -1, dorfTick: -1, auftraege: [], bewohner: [], zweiteWege: 0,
    stufeTick: [0, -1, -1, -1], festPunkte: 0, frierMinuten: 0, winterBewohner: [0, 0],
  };
  const tu = (b: Befehl) => sim.befehl(sim.tick, 0, b);
  const naechster = [0, 0, 0];
  let letzter = -abstandS * TICK_HZ, wohnhaeuser = 0;
  const ende = minuten * MIN;
  while (sim.tick < ende) {
    if (sim.tick % TICK_HZ === 0) {
      const s = sim.sicht();
      const stufe = s.dorf.stufe;
      const offen = s.gebaeude.filter((g) => g.bau < 1000).length;
      const wohnhausOffen = s.gebaeude.some((g) => g.typ === 'wohnhaus' && g.bau < 1000);
      const knapp = s.dorf.frei < 4 && s.dorf.wohnraum - s.dorf.bewohner < 3 && !wohnhausOffen && naechster[0] >= 6;
      // nächster Auftrag: erst die Liste der eigenen Stufe, dann die der Stufen davor (falls etwas nicht ging)
      let liste = -1;
      for (let st = Math.min(stufe, M8_PLAN.length - 1); st >= 0; st--) if (naechster[st] < M8_PLAN[st].length) { liste = st; break; }
      if (sim.tick - letzter >= abstandS * TICK_HZ && offen < offenMax && (liste >= 0 || knapp)) {
        const auftrag = knapp ? { typ: 'wohnhaus' } as { typ: string; nahe?: Hx } : M8_PLAN[liste][naechster[liste]];
        const lager = s.gebaeude.find((g) => g.typ === 'lager')!.vorrat!;
        const genug = GEBAEUDE[auftrag.typ].kosten.every((n, a) => n <= lager[a] + (a === WARE.bretter ? 2 : 0));
        const p = genug ? (auftrag.nahe ? suchePlatz(sim, s, auftrag.typ, auftrag.nahe) : platzNahLager(sim, s, auftrag.typ)) : null;
        if (p) {
          tu({ art: 'gebaeude', typ: auftrag.typ, q: p.h.q, r: p.h.r });
          tu({ art: 'weg', pfad: p.weg });
          for (let i = 3; i < p.weg.length - 1; i += 3) tu({ art: 'fahne', ...p.weg[i] });
          lauf.auftraege.push({ tick: sim.tick, typ: auftrag.typ, ...p.h });
          letzter = sim.tick;
          if (knapp) wohnhaeuser++; else naechster[liste]++;
        } else if (genug && !knapp) naechster[liste]++; // kein Platz: weiter mit dem nächsten
      }
    }
    if (sim.tick % (90 * TICK_HZ) === 45 * TICK_HZ) zweiterWeg(sim, tu, lauf);
    sim.schritt();
    if (sim.tick % MIN === 0) {
      const s = sim.sicht();
      lauf.bewohner.push(s.dorf.bewohner);
      if (s.dorf.friert) lauf.frierMinuten++;
      if (s.jahr.jahr === 0 && s.jahr.jahreszeit === 3 && !lauf.winterBewohner[0]) lauf.winterBewohner[0] = s.dorf.bewohner;
      if (s.jahr.jahr === 1 && s.jahr.jahreszeit === 0 && !lauf.winterBewohner[1]) lauf.winterBewohner[1] = s.dorf.bewohner;
    }
    if (sim.tick % TICK_HZ === 0) {
      const d = sim.sicht().dorf;
      for (let st = 1; st <= d.stufe; st++) if (lauf.stufeTick[st] < 0) lauf.stufeTick[st] = sim.tick;
      if (lauf.dorfTick < 0 && d.stufe >= 1) lauf.dorfTick = sim.tick;
    }
  }
  void wohnhaeuser;
  lauf.festPunkte = sim.sicht().dorf.festPunkte;
  lauf.protokoll = sim.protokoll(KARTE_INFO);
  return lauf;
}

/** Für den Determinismus-Test Node = Browser: 55 Spielminuten mit dem Bot (Dorf, Bier, Schnaps, kleine Feste, Wetter, erster Winter). */
export function baueSzenarioM8(): { karte: KarteDaten; protokoll: Protokoll } {
  const l = spieleM8(55);
  return { karte: baueM5Karte(), protokoll: l.protokoll };
}
