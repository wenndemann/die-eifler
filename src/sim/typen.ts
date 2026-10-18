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
   * Gebäude bauen (DESIGN §4.1, §4.6): Platzieren kostet nichts, die Baustelle meldet Bedarf. Die Gebäude-Fahne steht auf dem Gebäude-Hex selbst (optisch vor dem Eingang,
   * Richtung Süden). Auf einem Hex mit freier Fahne oder Weg kann nicht gebaut werden.
   */
  | { art: 'gebaeude'; typ: string; q: number; r: number }
  /** Baustellen-Priorität 1..3 (3 wird zuerst beliefert). Ungültig (keine Baustelle, Stufe außerhalb) → wirkungslos. */
  | { art: 'prioritaet'; id: Id; stufe: number }
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

/**
 * Zustand eines Gebäudes als Code (für „Wartet auf Stämme“ o. Ä. in der Oberfläche):
 * - 'baustelle'       Baustelle, Material ist unterwegs oder wird verbaut
 * - 'wartet_material' Baustelle ohne Lieferung unterwegs bzw. Verarbeiter ohne Rohstoff im Input-Puffer
 * - 'getrennt'        keine Wegverbindung zu einem Lager (⚠)
 * - 'kein_arbeiter'   fertig, aber kein freier Bewohner im Vorrat
 * - 'kein_baum'       Holzfäller findet im Radius keinen ausgewachsenen Baum
 * - 'kein_fels'       Steinbruch findet im Radius keinen Felsen mehr
 * - 'kein_platz'      Förster findet im Radius keinen freien Pflanzplatz
 * - 'voll'            Output-Puffer voll (Rückstau), die Arbeit ruht
 * - 'arbeitet'        arbeitet gerade (auch auf dem Weg zur Arbeit)
 * - 'bereit'          fertig und nichts zu tun (Lager, Hütte; M5: Wohnhaus)
 */
export type GebaeudeZustand =
  | 'baustelle' | 'wartet_material' | 'getrennt' | 'kein_arbeiter' | 'kein_baum' | 'kein_fels' | 'kein_platz' | 'voll'
  | 'arbeitet' | 'bereit';

/** Der Arbeiter eines Holzfällers, Försters oder Steinbruchs (Figur in der Welt). */
export interface SichtArbeiter {
  /** Er läuft gerade von Hex von nach Hex nach; fortschritt 0..PROMILLE, je Tick um schritt weiter (wie SichtTraeger). */
  von: { q: number; r: number };
  nach: { q: number; r: number };
  fortschritt: number;
  schritt: number;
  /** geht (leer) | arbeitet (fällt, pflanzt, haut; von = nach = Zielhex) | traegt (Stamm/Stein zurück) | ruht (an der Hütte). */
  tut: 'geht' | 'arbeitet' | 'traegt' | 'ruht';
  /** Zielhex (Baum, Fels, Pflanzplatz) oder null. */
  ziel: { q: number; r: number } | null;
  /** Getragene Warenart oder -1. */
  ware: number;
}

export interface SichtGebaeude {
  id: Id; typ: string; q: number; r: number; fahne: Id;
  /** 0..PROMILLE Baufortschritt = verbautes Material / Gesamtbedarf; Bauphase = 1 + floor(3·bau/1001) (1, 2, 3), fertig bei PROMILLE. */
  bau: number;
  /** ⚠ keine Wegverbindung zu einem Lager. */
  getrennt: boolean;
  /** Vorrat (nur Lager): Menge je Warenart. */
  vorrat?: number[];
  /** Offener Bedarf je Warenart = Kosten − verbaut (nur Baustelle). */
  bedarf?: number[];
  /** Baustellen-Priorität 1..3 (Standard 2; bei fertigen Gebäuden ohne Bedeutung). */
  prioritaet: number;
  /** Input-Puffer je Warenart (nur Gebäude mit Eingang, z. B. Sägewerk). */
  puffer?: number[];
  /** Output-Puffer je Warenart (nur Erzeuger/Verarbeiter). */
  ausgang?: number[];
  zustand: GebaeudeZustand;
  /** Arbeiter-Figur (Holzfäller, Förster, Steinbruch), sobald ein Bewohner zugewiesen ist. */
  arbeiter?: SichtArbeiter;
}

/**
 * Bäume und Felsen als Zustand, je Hex indiziert wie SimKarte (Index = karte.index(q, r)). Die Arrays sind Kopien, werden nur bei
 * Änderung neu erzeugt (dann steigt `rev`) und sonst unverändert wiederverwendet – nicht beschreiben.
 */
export interface SichtNatur {
  rev: number;
  /** Ausgewachsene Bäume je Hex (0..TREE_MAX). */
  baum: Uint8Array;
  /** Jungbäume je Hex (baum + jung ≤ TREE_MAX). */
  jung: Uint8Array;
  /** Alter des ältesten Jungbaums: 0 keiner, 1 Setzling, 2 Schössling, 3 fast ausgewachsen. */
  stufe: Uint8Array;
  /** Restmenge Fels (Stein) je Hex. */
  fels: Uint8Array;
}

export interface SimSicht {
  tick: number;
  fahnen: SichtFahne[];
  segmente: SichtSegment[];
  traeger: SichtTraeger[];
  gebaeude: SichtGebaeude[];
  /** Freie Träger im Vorrat. */
  freieTraeger: number;
  natur: SichtNatur;
}

/** Leere Natur (ohne Hexe) für Darstellungen ohne Simulation, z. B. die Demo. */
export const KEINE_NATUR: SichtNatur = { rev: 0, baum: new Uint8Array(0), jung: new Uint8Array(0), stufe: new Uint8Array(0), fels: new Uint8Array(0) };
