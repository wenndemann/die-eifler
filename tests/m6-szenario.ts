// Abnahme M6 ohne Browser: Zwei Spieltest-Bots (wie M5, „Die ersten 30 Minuten“) bauen auf einer Karte mit zwei Ortskernen je ein Dorf
// bis zur ersten Kirmes – jeder in seiner eigenen Partie, verbunden über das simulierte schlechte Netz. Jeder Bot liest nur seine
// eigene Simulation und gibt Befehle wie die Oberfläche (Partie.befehl).
import { SimKarte } from '../src/sim/karte';
import { GEBAEUDE, WARE } from '../src/sim/daten';
import { TICK_HZ } from '../src/sim/typen';
import type { Befehl, KarteDaten, SimSicht } from '../src/sim/typen';
import type { Simulation } from '../src/sim/sim';
import { baueM5Karte, M5_PLAN } from './m5-szenario';

type Hx = { q: number; r: number };
const abstand = (a: Hx, b: Hx) => (Math.abs(a.q - b.q) + Math.abs(a.r - b.r) + Math.abs(a.q - b.q + a.r - b.r)) / 2;

/** Zwei Ortskerne, weit genug auseinander (32 Hex-Schritte). */
export const KERNE: Hx[] = [{ q: -16, r: 8 }, { q: 16, r: -8 }];

/**
 * Karte mit Radius 36: Um jeden Kern liegt die M5-Testlandschaft (Wald, Fels, Hänge, Teich), verschoben auf den Kern; jeder Hex gehört
 * zum nächsten Kern (bei Gleichstand dem ersten).
 */
export function baueM6Karte(): KarteDaten {
  const vorlage = baueM5Karte(), vk = new SimKarte(vorlage);
  const n = 36, count = 3 * n * (n + 1) + 1;
  const k: KarteDaten = {
    q: 0, r: 0, n, terrain: new Uint8Array(count), height: new Uint16Array(count), slope: new Uint8Array(count),
    build: new Uint8Array(count), flags: new Uint8Array(count), place: new Uint16Array(count),
  };
  let i = 0;
  for (let r = -n; r <= n; r++) {
    for (let q = Math.max(-n, -r - n); q <= Math.min(n, -r + n); q++, i++) {
      const h = { q, r };
      const c = abstand(h, KERNE[0]) <= abstand(h, KERNE[1]) ? KERNE[0] : KERNE[1];
      const j = vk.index(q - c.q, r - c.r);
      if (j < 0) { k.terrain[i] = 1; k.height[i] = 3000; k.build[i] = 3; continue; }
      k.terrain[i] = vorlage.terrain[j]; k.height[i] = vorlage.height[j]; k.slope[i] = vorlage.slope[j];
      k.build[i] = vorlage.build[j]; k.flags[i] = vorlage.flags[j];
    }
  }
  return k;
}

/** Bauplatz nahe `nahe` samt Weg zur nächsten eigenen Fahne, oder null. */
function suchePlatz(sim: Simulation, s: SimSicht, sp: number, typ: string, nahe: Hx): { h: Hx; weg: Hx[] } | null {
  const eigene = s.fahnen.filter((f) => f.sp === sp);
  for (let d = 0; d <= 7; d++) {
    for (let dr = -d; dr <= d; dr++) {
      for (let dq = Math.max(-d, -dr - d); dq <= Math.min(d, -dr + d); dq++) {
        const h = { q: nahe.q + dq, r: nahe.r + dr };
        if (abstand(h, nahe) !== d || !sim.kannBauen(typ, h.q, h.r, sp)) continue;
        const fahnen = eigene.slice().sort((a, b) => abstand(a, h) - abstand(b, h) || a.id - b.id);
        for (const f of fahnen.slice(0, 4)) {
          if (abstand(f, h) > 8) break;
          const weg = sim.wegAbschnitt(h, f, [], 10, sp);
          if (weg) return { h, weg };
        }
      }
    }
  }
  return null;
}

/** Spieltest-Bot für Spieler `sp` mit Kern `kern` (M5_PLAN, auf den Kern verschoben). */
export class Bot {
  naechster = 0;
  letzter = -60 * TICK_HZ;
  auftraege = 0;
  kirmesTick = -1;
  private geprueft = -1;
  private zweiter = -1;

  constructor(readonly sp: number, readonly kern: Hx, readonly tu: (b: Befehl) => void, readonly abstandS = 60, readonly offenMax = 3) {}

  /** Nach jedem Frame: einmal je Spielsekunde entscheiden (auf der eigenen Simulation). */
  schau(sim: Simulation): void {
    const sek = Math.floor(sim.tick / TICK_HZ);
    if (sek === this.geprueft) return;
    this.geprueft = sek;
    const s = sim.sicht(this.sp);
    if (this.kirmesTick < 0) { const e = s.ereignisse.find((x) => x.art === 'kirmes'); if (e) this.kirmesTick = e.tick; }
    const offen = s.gebaeude.filter((g) => g.sp === this.sp && g.bau < 1000).length;
    const wohnhausOffen = s.gebaeude.some((g) => g.sp === this.sp && g.typ === 'wohnhaus' && g.bau < 1000);
    const knapp = s.dorf.frei < 4 && s.dorf.wohnraum - s.dorf.bewohner < 3 && !wohnhausOffen && this.naechster >= 6;
    if (sim.tick - this.letzter >= this.abstandS * TICK_HZ && offen < this.offenMax && (this.naechster < M5_PLAN.length || knapp)) {
      const a = knapp ? { typ: 'wohnhaus', nahe: { q: 2 * (this.auftraege % 3) - 2, r: -5 - (this.auftraege % 2) } } : M5_PLAN[this.naechster];
      const nahe = { q: a.nahe.q + this.kern.q, r: a.nahe.r + this.kern.r };
      const lager = s.gebaeude.find((g) => g.sp === this.sp && g.typ === 'lager')!.vorrat!;
      const genug = GEBAEUDE[a.typ].kosten.every((n, w) => n <= lager[w] + (w === WARE.bretter ? 2 : 0));
      const p = genug ? suchePlatz(sim, s, this.sp, a.typ, nahe) : null;
      if (p) {
        this.tu({ art: 'gebaeude', typ: a.typ, q: p.h.q, r: p.h.r });
        this.tu({ art: 'weg', pfad: p.weg });
        for (let i = 3; i < p.weg.length - 1; i += 3) this.tu({ art: 'fahne', ...p.weg[i] });
        this.auftraege++;
        this.letzter = sim.tick;
        if (!knapp) this.naechster++;
      }
    }
    // alle 90 s: zweiter Weg von der vollsten Fahne Richtung Lager (Drehbuch 4.4)
    const runde = Math.floor(sim.tick / (90 * TICK_HZ));
    if (sim.tick % (90 * TICK_HZ) >= 45 * TICK_HZ && runde !== this.zweiter) { this.zweiter = runde; this.zweiterWeg(sim, s); }
  }

  private zweiterWeg(sim: Simulation, s: SimSicht): void {
    const lager = s.gebaeude.find((g) => g.sp === this.sp && g.typ === 'lager')!;
    const eigene = s.fahnen.filter((f) => f.sp === this.sp);
    const voll = eigene.filter((f) => f.waren.length >= 7 && f.id !== lager.fahne).sort((a, b) => b.waren.length - a.waren.length || a.id - b.id);
    for (const f of voll) {
      const nachbarn = new Set<number>();
      for (const sg of s.segmente) { if (sg.a === f.id) nachbarn.add(sg.b); if (sg.b === f.id) nachbarn.add(sg.a); }
      const ziele = eigene.filter((t) => t.id !== f.id && !nachbarn.has(t.id) && abstand(t, f) <= 7 && abstand(t, lager) < abstand(f, lager))
        .sort((a, b) => abstand(a, lager) - abstand(b, lager) || abstand(a, f) - abstand(b, f) || a.id - b.id);
      for (const t of ziele) {
        const weg = sim.wegVorschau(f, t, this.sp);
        if (!weg) continue;
        this.tu({ art: 'weg', pfad: weg });
        for (let i = 3; i < weg.length - 1; i += 3) this.tu({ art: 'fahne', ...weg[i] });
        return;
      }
    }
  }
}
