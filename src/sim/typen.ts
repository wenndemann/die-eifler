// Gemeinsame Schnittstelle der Simulation (Drehbuch 4.1, 8.3; DESIGN §3–4). Verbindlich für src/sim/ und die
// Darstellung: Die Oberfläche schickt nur Befehle (Befehl) und liest nur die Sicht (SimSicht), nie den Zustand.
//
// Regeln für alles unter src/sim/:
// - nur Ganzzahlen (Math.floor/Math.trunc/|0, kein Math.sqrt/sin/... im Zustand), kein Date, kein Math.random
// - Zufall nur aus der Saat (eigener Ganzzahl-Generator im Zustand)
// - feste Reihenfolge: Listen nach Id sortiert, Maps nur in Einfüge-Reihenfolge
// - keine Abhängigkeit von three, DOM, fetch oder src/render, src/ui

/** Ticks je Sekunde (fester Tick). */
export const TICK_HZ = 20;
/** Fortschritt innerhalb eines Hex-Schritts läuft von 0 bis PROMILLE. */
export const PROMILLE = 1000;

/** Id > 0; 0 heißt „keiner“. Ids werden nie wiederverwendet. */
export type Id = number;

/** Simulationsdaten der Karte: genau die Ganzzahl-Hex-Felder aus M2 (FORMAT.md, HexFeld in src/welt/ausschnitt.ts). */
export interface KarteDaten {
  /** Mittel-Hex und Radius des Spielfelds; Index-Reihenfolge r aufsteigend, dann q (wie HexFeld.index). */
  q: number; r: number; n: number;
  terrain: Uint8Array;   // 0 wasser, 1 wiese, 2 wald, 3 heide, 4 moor, 5 stein, 6 siedlung
  height: Uint16Array;   // dm ü. NN
  slope: Uint8Array;     // Grad
  build: Uint8Array;     // Bauplatz 0 keiner, 1 klein, 2 mittel, 3 groß
  flags: Uint8Array;     // FLAG in src/welt/format.ts (Bit 0 Ortskern, Bit 5 Bahn, ...)
  place: Uint16Array;    // Ortskern: Index+1 in orte.json
}

/** Gebäudegröße wie Bauplatz. */
export const enum Groesse { klein = 1, mittel = 2, gross = 3 }

/** Spieler-Aktionen. Jede wird mit Tick-Nummer protokolliert und am Anfang dieses Ticks ausgeführt. */
export type Befehl =
  /** Freie Fahne setzen (auch mitten auf einem Weg: teilt das Segment). */
  | { art: 'fahne'; q: number; r: number }
  /**
   * Weg bauen entlang pfad (benachbarte Hexe, axial). Der erste Hex muss eine Fahne tragen; trägt der letzte keine,
   * wird dort eine gesetzt. Ungültige Befehle werden ohne Wirkung verworfen (deterministisch, bei allen gleich).
   */
  | { art: 'weg'; pfad: { q: number; r: number }[] }
  /**
   * Gebäude bauen (DESIGN §4.1): Die Gebäude-Fahne steht auf dem Gebäude-Hex selbst (optisch vor dem Eingang,
   * Richtung Süden). Auf einem Hex mit freier Fahne oder Weg kann nicht gebaut werden.
   */
  | { art: 'gebaeude'; typ: string; q: number; r: number }
  | { art: 'abriss_fahne'; id: Id }
  | { art: 'abriss_weg'; id: Id }
  | { art: 'abriss_gebaeude'; id: Id };

export interface ProtokollEintrag { tick: number; spieler: number; befehl: Befehl }

/** Alles, was eine Partie reproduziert (Replay). */
export interface Protokoll {
  format: 1;
  /** Ausschnitt wie in FORMAT.md und dessen Karten-Prüfsumme (zur Kontrolle). */
  karte: { version: string; q: number; r: number; size: string; pruefsumme: string };
  saat: number;
  /** Lager-Hex (Ortskern) des Startspielers. */
  start: { q: number; r: number };
  befehle: ProtokollEintrag[];
  /** Zahl der gerechneten Ticks. */
  ticks: number;
}

// ---------------------------------------------------------------- Sicht für die Darstellung (nur lesen)

export interface SichtFahne {
  id: Id; q: number; r: number;
  /** Waren im Stapel (Warenart-Index in WAREN), unterste zuerst; bis 8 + 2 Notplätze. */
  waren: number[];
  gebaeude: Id;
}

export interface SichtSegment {
  id: Id; a: Id; b: Id;
  /** Hexe von Fahne a bis Fahne b (beide eingeschlossen), axial. */
  pfad: { q: number; r: number }[];
  traeger: Id;
  /** Verkehr der letzten Zeit (0..255), für breitere Pfade. */
  verkehr: number;
}

export interface SichtTraeger {
  id: Id;
  /** Er läuft gerade von Hex von nach Hex nach; fortschritt 0..PROMILLE, je Tick um schritt weiter. */
  von: { q: number; r: number };
  nach: { q: number; r: number };
  fortschritt: number;
  schritt: number;
  /** Getragene Warenart oder -1. */
  ware: number;
  /** wartet / läuft / übergibt – für die Animation. */
  tut: 'wartet' | 'laeuft' | 'uebergibt';
}

export interface SichtGebaeude {
  id: Id; typ: string; q: number; r: number; fahne: Id;
  /** 0..PROMILLE Baufortschritt; Bauphase = 1 + floor(3·bau/1001) (1, 2, 3), fertig bei PROMILLE. */
  bau: number;
  /** ⚠ keine Wegverbindung zu einem Lager. */
  getrennt: boolean;
  /** Vorrat (nur Lager): Menge je Warenart. */
  vorrat?: number[];
}

export interface SimSicht {
  tick: number;
  fahnen: SichtFahne[];
  segmente: SichtSegment[];
  traeger: SichtTraeger[];
  gebaeude: SichtGebaeude[];
  /** Freie Träger im Vorrat. */
  freieTraeger: number;
}
