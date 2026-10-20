// Replay: rechnet ein Protokoll nach (Grundlage des Determinismus-Tests in Node und Browser).
import { Simulation } from './sim';
import type { KarteDaten, Protokoll } from './typen';

export function spieleAb(karte: KarteDaten, p: Protokoll): Simulation {
  const sim = new Simulation(karte, p.saat, p.mitspieler?.length ? [p.start, ...p.mitspieler] : p.start);
  for (const e of p.befehle) sim.befehl(e.tick, e.spieler, e.befehl);
  while (sim.tick < p.ticks) sim.schritt();
  return sim;
}
