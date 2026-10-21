// Mehrspieler im Browser zusammenstecken: nach dem Start (oder beim Wiederkommen) WebRTC-Netz und Partie aufbauen, den
// Vermittlungs-Server mit beiden verbinden und warten, bis die Partie ihren Stand hat (Drehbuch 8.3).
import type { Regeln } from '../sim/nachbarn';
import { Simulation } from '../sim/sim';
import type { KarteDaten, StartDaten } from '../sim/typen';
import type { Spielstand } from '../spiel/spielstand';
import { Partie } from './partie';
import { Netz, type SchlechtesNetz } from './webrtc';
import type { RaumSicht, Vermittlung } from './vermittlung';
import mp from '../../data/mehrspieler.json';

export interface Laufend {
  partie: Partie;
  netz: Netz;
  namen: string[];
}

/** Schlechtes Netz für den Testaufbau (#…&netz=schlecht). */
export function schlechtesNetz(): SchlechtesNetz | null {
  return new URLSearchParams(location.hash.slice(1)).get('netz') === 'schlecht' ? mp.netz.schlecht : null;
}

export interface PartieStart {
  v: Vermittlung;
  du: number;
  raum: RaumSicht;
  karte: KarteDaten;
  kartePruef: string;
  /** Nur der Taktgeber beim ersten Start: Startplätze (Lager-Hexe) oder ein geladener Spielstand, Saat und Tempo. */
  neu?: { starts: StartDaten[]; saat: number; tempo: number; spielstand: Spielstand | null; regeln?: Regeln };
}

/** Baut Netz und Partie auf und wartet, bis die Simulation da ist (Start: vom Gastgeber; Wiederkommen: vom Taktgeber). */
export function startePartie(s: PartieStart): Promise<Laufend> {
  const { v, du, raum } = s;
  const n = raum.spieler.length;
  let sim: Simulation | undefined;
  let pausen: number[] | undefined;
  let tempo = 1;
  if (s.neu && du === raum.taktgeber) {
    const st = s.neu.spielstand;
    sim = st ? Simulation.ausStand(s.karte, st.stand) : new Simulation(s.karte, s.neu.saat, s.neu.starts, s.neu.regeln);
    if (sim.spielerZahl !== n) throw new Error(`Der Stand hat ${sim.spielerZahl} Dörfer, im Raum sind ${n} Spieler.`);
    pausen = st?.pausen;
    tempo = s.neu.tempo;
  }
  const netz = new Netz(du, v.ice, (an, daten) => v.signal(an, daten), schlechtesNetz());
  const partie = new Partie({
    ich: du, spielerZahl: n, gastgeber: raum.gastgeber, taktgeber: raum.taktgeber, karte: s.karte, kartePruef: s.kartePruef,
    senden: (an, nachricht) => netz.senden(an, nachricht), sim, pausen, tempo,
  });
  netz.onNachricht = (von, nachricht) => partie.empfangen(von, nachricht);
  netz.onVerbindung = (von, da) => partie.verbindung(von, da);
  v.onSignal = (von, daten) => void netz.signalEmpfangen(von, daten as { art: string });
  const namen = raum.spieler.map((x, i) => x?.name ?? `Spieler ${i + 1}`);
  const roster = (r: RaumSicht) => {
    r.spieler.forEach((x, i) => { if (x) { netz.anwesend(i, x.da, x.sitzung); namen[i] = x.name; } });
    if (r.taktgeber !== partie.taktgeber) partie.taktgeberWechsel(r.taktgeber);
  };
  v.onRaum = roster;
  roster(v.raum ?? raum);
  const laufend: Laufend = { partie, netz, namen };
  if (partie.sim) return Promise.resolve(laufend);
  // bis der Stand kommt, die Partie ohne Spiel weiterlaufen lassen (Nachrichten verarbeiten)
  return new Promise((ok, fehler) => {
    let letzt = performance.now();
    const t0 = letzt;
    const schritt = () => {
      const jetzt = performance.now();
      partie.vor(jetzt - letzt);
      letzt = jetzt;
      const f = partie.ereignisse.find((e) => e.art === 'fehler');
      if (f && f.art === 'fehler') { fehler(new Error(f.text)); return; }
      if (partie.sim) { ok(laufend); return; }
      if (jetzt - t0 > 120_000) { fehler(new Error('Keine Verbindung zu den Mitspielern (auch nicht über das Relais).')); return; }
      setTimeout(schritt, 30);
    };
    schritt();
  });
}
