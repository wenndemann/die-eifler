// Spielstand der Simulation als JSON (Speichern, Laden, Wiederbeitritt und Neuverteilung im Mehrspieler, Drehbuch 8.3).
// Enthält alles, was die Prüfsumme abdeckt, dazu Protokoll und ausstehende Befehle. Abgeleitetes (Distanzen, Verbindungen,
// Hex-Belegung) wird beim Laden neu berechnet. Läuft in Node und im Browser gleich (btoa/atob, keine Buffer).
import type { ProtokollEintrag, StartDaten } from './typen';
import type { Regeln } from './nachbarn';

/** Zahlenfelder in fester Reihenfolge. */
export const STAND_ZAHLEN = ['tick', 'rng', 'naechsteId', 'ereignisNr', 'befehlZahl', 'natRev'] as const;

export interface SimStand {
  format: 1;
  saat: number;
  starts: StartDaten[];
  /** Werte zu STAND_ZAHLEN. */
  zahlen: number[];
  /** Dörfer, Fahnen, Segmente, Träger, Gebäude, Bauleute als einfache Objekte in Id-Reihenfolge. */
  doerfer: Record<string, unknown>[];
  fahnen: Record<string, unknown>[];
  segmente: Record<string, unknown>[];
  traeger: Record<string, unknown>[];
  gebaeude: Record<string, unknown>[];
  bauleute: Record<string, unknown>[];
  /** Natur je Hex (Base64) und die belegten Jungbaum-Plätze als Paare [Platz, Reifetick]. */
  natur: {
    baum: string; jung: string; stufe: string; fels: string; felsArt: string; baumRes: string; felsRes: string; jungReif: number[]; jungListe: number[];
    /** Höfe und Felder: Feldart, Stadium und Reservierung je Hex (Base64), Reifeticks als Paare [Hex, Tick], wachsende Felder (fehlt in älteren Spielständen). */
    feld?: string; feldStufe?: string; feldRes?: string; feldReif?: number[]; feldListe?: number[];
    /** Wald und Wild: Rehe, Wildschweine, Wolf, Wildkatze und Reservierung des Jägers je Hex (Base64; fehlt in älteren Spielständen). */
    reh?: string; sau?: string; wolf?: string; katze?: string; wildRes?: string;
  };
  /** Beschwipste Boten und liegengebliebene Waren (ab M8; fehlt in älteren Spielständen). */
  boten?: Record<string, unknown>[];
  liegend?: Record<string, unknown>[];
  /** M10: Regeln der Partie, Besitz je Hex (Base64, Wert + 1), Besitzer je Ort, Lieferungen, Ende (fehlt in älteren Spielständen). */
  regeln?: Regeln;
  gebiet?: { besitz: string; rev: number; orte: number[]; lieferungen: Record<string, unknown>[]; ende: { sieger: number; tick: number } | null };
  /** M14: Maijungen und Burschen unterwegs (fehlt in älteren Spielständen). */
  mai?: { trupps: Record<string, unknown>[] };
  /** M15: versetzte Grenzsteine und Jahr des letzten Jahresfests je Ort (fehlt in älteren Spielständen). */
  grenzland?: { steine: Record<string, unknown>[]; ortFest: number[] };
  /** Gebaute Holzbrücken (Hex-Indizes, sortiert; fehlt in älteren Spielständen: dann hat jeder Weg über einen Bach seine Brücke). */
  bruecken?: number[];
  log: ProtokollEintrag[];
  ausstehend: ProtokollEintrag[];
  stat: { angekommen: number; verbraucht: number; erzeugt: number; maxWarte: number; verbaut: number };
  erzeugtJe: number[];
}

export function inBase64(a: Uint8Array): string {
  let s = '';
  for (let i = 0; i < a.length; i += 0x8000) s += String.fromCharCode(...a.subarray(i, i + 0x8000));
  return btoa(s);
}

export function ausBase64(s: string, laenge: number): Uint8Array {
  const b = atob(s);
  if (b.length !== laenge) throw new Error(`Spielstand passt nicht zur Karte (${b.length} statt ${laenge} Hexe)`);
  const a = new Uint8Array(laenge);
  for (let i = 0; i < laenge; i++) a[i] = b.charCodeAt(i);
  return a;
}

/** Tiefe Kopie über JSON (Spielstände bestehen nur aus Zahlen, Texten, Listen und Objekten). */
export function kopie<T>(x: T): T {
  return JSON.parse(JSON.stringify(x)) as T;
}
