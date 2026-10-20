// Spielstand als Datei (ROADMAP M6: Speichern und Laden, auch für Mehrspieler). Merkt sich die Datenversion und Prüfsumme der Karte
// (Drehbuch 8.1), die Spielernamen und die übrigen Pausen; geladen wird nur auf genau derselben Karte. Reine Logik, ohne Browser.
import type { SimStand } from '../sim/stand';
import type { Protokoll } from '../sim/typen';
import type { AusschnittParam, Groesse } from '../welt/format';

export const SPIELSTAND_ART = 'die-eifeler-spielstand';

export interface Spielstand {
  art: typeof SPIELSTAND_ART;
  format: 1;
  /** Ausschnitt (Datenversion, Mittel-Hex, Größe) und Prüfsumme seiner Simulationsdaten. */
  karte: Protokoll['karte'];
  /** Namen der Spieler (Index = Spieler); im Einzelspiel einer. */
  spieler: string[];
  /** Übrige Pausen je Spieler (Mehrspieler). */
  pausen?: number[];
  /** Wann gespeichert (nur zur Anzeige). */
  gespeichert: string;
  stand: SimStand;
}

export function baueSpielstand(karte: Protokoll['karte'], spieler: string[], stand: SimStand, pausen?: number[]): Spielstand {
  const s: Spielstand = { art: SPIELSTAND_ART, format: 1, karte: { ...karte }, spieler: spieler.slice(), gespeichert: new Date().toISOString(), stand };
  if (pausen) s.pausen = pausen.slice();
  return s;
}

/** Liest einen Spielstand aus Text; wirft mit verständlicher Meldung, wenn es keiner ist. */
export function leseSpielstand(text: string): Spielstand {
  let d: unknown;
  try { d = JSON.parse(text); } catch { throw new Error('Das ist keine Spielstand-Datei (kein JSON).'); }
  const s = d as Partial<Spielstand>;
  if (!s || s.art !== SPIELSTAND_ART) throw new Error('Das ist keine Spielstand-Datei der Eifeler.');
  if (s.format !== 1) throw new Error('Dieser Spielstand ist aus einer neueren Version des Spiels.');
  const k = s.karte;
  if (!k || typeof k.version !== 'string' || !Number.isInteger(k.q) || !Number.isInteger(k.r) || typeof k.size !== 'string' || typeof k.pruefsumme !== 'string') {
    throw new Error('Im Spielstand fehlt die Karte.');
  }
  if (!Array.isArray(s.spieler) || !s.spieler.length || !s.stand || !Array.isArray(s.stand.starts) || s.stand.starts.length !== s.spieler.length) {
    throw new Error('Der Spielstand ist unvollständig.');
  }
  return s as Spielstand;
}

/** Ausschnitt zum Laden der Karte. */
export function ausschnittVon(s: Spielstand): AusschnittParam {
  return { version: s.karte.version, q: s.karte.q, r: s.karte.r, size: s.karte.size as Groesse };
}

/** Dateiname: eifeler-<ort>-<datum>.json. */
export function dateiname(ort: string, jetzt = new Date()): string {
  const o = ort.toLowerCase().replace(/[äöüß]/g, (c) => ({ ä: 'ae', ö: 'oe', ü: 'ue', ß: 'ss' })[c] ?? c).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'spiel';
  const p = (n: number) => String(n).padStart(2, '0');
  return `eifeler-${o}-${jetzt.getFullYear()}${p(jetzt.getMonth() + 1)}${p(jetzt.getDate())}-${p(jetzt.getHours())}${p(jetzt.getMinutes())}.json`;
}

/** Autosave im Browser-Speicher (ROADMAP M7; ein Platz, data/dorf.json: autosave): Ort und Spielstand. */
export const AUTOSAVE_SPEICHER = 'eifeler.autosave';
export interface Autosave { ort: string; stand: Spielstand }

/** Liest den Autosave-Text (aus dem Browser-Speicher); null, wenn keiner da oder er kaputt ist. */
export function leseAutosaveText(text: string | null): Autosave | null {
  if (!text) return null;
  try {
    const d = JSON.parse(text) as Partial<Autosave>;
    return { ort: typeof d.ort === 'string' ? d.ort : '', stand: leseSpielstand(JSON.stringify(d.stand)) };
  } catch { return null; }
}

/** Autosave aus dem Browser-Speicher (oder null). */
export function holeAutosave(): Autosave | null {
  try { return leseAutosaveText(localStorage.getItem(AUTOSAVE_SPEICHER)); } catch { return null; }
}
