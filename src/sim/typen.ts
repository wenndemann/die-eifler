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
  /**
   * Arbeitsmittelpunkt eines Holzfällers, Försters oder Steinbruchs (auch als Baustelle) setzen: Der Arbeiter sucht im Radius um (q, r)
   * und läuft vom Gebäude dorthin. Hex-Abstand zum Gebäude höchstens ARBEIT_MITTE_MAX, im Spielfeld, begehbar; das Gebäude-Hex selbst
   * setzt zurück. Ungültig → wirkungslos.
   */
  | { art: 'arbeitsbereich'; id: Id; q: number; r: number }
  /**
   * Warenverteilung (ROADMAP M7): Rangfolge der Abnehmer-Arten für Warenart `ware` im eigenen Dorf (ABNEHMER in src/sim/daten.ts,
   * z. B. [1, 0, 2, 3] = Kirmesplatz vor Baustellen). Muss jede Art genau einmal nennen, sonst wirkungslos.
   */
  | { art: 'verteilung'; ware: number; reihe: number[] }
  /** Gebäude ruhen lassen (an) oder weiterarbeiten (aus); nur eigene Gebäude mit Arbeiter oder Wohnhäuser (GEBAEUDE_PAUSIERBAR). */
  | { art: 'ruhen'; id: Id; an: boolean }
  /**
   * Lagerregel (ROADMAP M8, wie Siedler 2): Ware `ware` im eigenen Lager oder Lagerhaus `id` normal einlagern (0), nicht einlagern (1:
   * neue Waren gehen in ein anderes Lager) oder auslagern (2: der Bestand wird in Lager mit „normal“ getragen). Sonst wirkungslos.
   */
  | { art: 'lagerregel'; id: Id; ware: number; regel: number }
  /** Wunschzahl Bauarbeiter und Planierer im eigenen Dorf (Drehbuch 4.5): fehlen welche, entstehen neue aus Werkzeug und Bewohner. */
  | { art: 'bauleute'; bauarbeiter: number; planierer: number }
  | { art: 'abriss_fahne'; id: Id }
  | { art: 'abriss_weg'; id: Id }
  | { art: 'abriss_gebaeude'; id: Id }
  /**
   * Mehrspieler (Drehbuch 8.3): Der Verwalter übernimmt das Dorf von `spieler` (an) oder gibt es zurück. Solange er verwaltet, läuft die
   * Wirtschaft weiter, aber Bau- und Abrissbefehle für dieses Dorf werden verworfen. Schickt nur der Taktgeber.
   */
  | { art: 'verwalter'; spieler: number; an: boolean }
  /**
   * Einstand (Drehbuch 6.2): Die Wunschliste des Orts `ort` (Index in SimSicht.orte) geht aus den eigenen Lagern auf den Weg. Nur, wenn
   * der Ort noch niemandem gehört, eine eigene, mit einem Lager verbundene Fahne höchstens 2 Hexe vom Ortskern steht und alles im Lager
   * ist. Wer zuerst ankommt, gewinnt den Ort; die anderen haben umsonst geliefert.
   */
  | { art: 'einstand'; ort: number }
  /**
   * Handel mit Flachländern (Drehbuch 6.2): Tausch `tausch` (Index in HANDEL, data/nachbarn.json) `mal`-mal am Marktposten `posten`
   * (Index in SimSicht.posten). Wie beim Einstand braucht es eine verbundene eigene Fahne am Posten und die Waren im Lager.
   */
  | { art: 'handel'; posten: number; tausch: number; mal: number };

/** Start eines Dorfs: Lager-Hex und (optional, sonst data/dorf.json) die Zahl der Bewohner. Spieler i startet mit Eintrag i. */
/** Start eines Dorfs: Lager-Hex, (optional) Bewohner und (ab M11) das Völkchen (Id aus data/voelkchen.json; fehlt = ohne Völkchen). */
export interface StartDaten { q: number; r: number; bewohner?: number; voelkchen?: string }

export interface ProtokollEintrag { tick: number; spieler: number; befehl: Befehl }

/** Alles, was eine Partie reproduziert (Replay). */
export interface Protokoll {
  format: 1;
  /** Ausschnitt wie in FORMAT.md und dessen Karten-Prüfsumme (zur Kontrolle). */
  karte: { version: string; q: number; r: number; size: string; pruefsumme: string };
  saat: number;
  /** Lager-Hex (Ortskern) von Spieler 0; bewohner nur, wenn abweichend von data/dorf.json (Tests). */
  start: StartDaten;
  /** Mehrspieler: Lager-Hexe der Spieler 1, 2, … (fehlt im Einzelspiel). */
  mitspieler?: StartDaten[];
  /** M10: Regeln der Partie (Gebiet, Ziel); fehlt = wie vor M10. */
  regeln?: { gebiet: number; ziel: string };
  befehle: ProtokollEintrag[];
  /** Zahl der gerechneten Ticks. */
  ticks: number;
}

// ---------------------------------------------------------------- Sicht für die Darstellung (nur lesen)

export interface SichtFahne {
  /** sp: Spieler, dem die Fahne gehört (0 im Einzelspiel). Gilt ebenso für Segmente, Träger, Gebäude und Bauleute. */
  id: Id; sp: number; q: number; r: number;
  /** Waren im Stapel (Warenart-Index in WAREN), unterste zuerst; bis 8 + 2 Notplätze. */
  waren: number[];
  /** Ziel-Gebäude je Ware im Stapel (gleiche Reihenfolge wie waren; 0 = noch keins). */
  ziele: Id[];
  gebaeude: Id;
}

export interface SichtSegment {
  id: Id; sp: number; a: Id; b: Id;
  /** Hexe von Fahne a bis Fahne b (beide eingeschlossen), axial. */
  pfad: { q: number; r: number }[];
  traeger: Id;
  /** Verkehr der letzten Zeit (0..255), für breitere Pfade. */
  verkehr: number;
}

export interface SichtTraeger {
  id: Id; sp: number;
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
 * - 'wartet_material' Baustelle ohne Lieferung unterwegs bzw. Verarbeiter ohne Rohstoff im Input-Puffer, Kirmesplatz wartet auf Waren
 * - 'kein_planierer'  Baustelle am Hang, kein Planierer frei (Drehbuch 4.5)
 * - 'planieren'       Baustelle wird planiert bzw. der Planierer ist unterwegs
 * - 'kein_bauarbeiter' Material liegt da, aber kein Bauarbeiter frei
 * - 'hunger'          Wohnhaus ohne Essen
 * - 'wohnraum_voll'   Wohnhaus mit Essen, aber kein Wohnraum frei
 * - 'fest'            Kirmesplatz: es wird gefeiert
 * - 'getrennt'        keine Wegverbindung zu einem Lager (⚠)
 * - 'kein_arbeiter'   fertig, aber kein freier Bewohner im Vorrat
 * - 'kein_baum'       Holzfäller findet im Radius keinen ausgewachsenen Baum
 * - 'kein_fels'       Steinbruch findet im Radius keinen Felsen mehr
 * - 'kein_platz'      Förster findet im Radius keinen freien Pflanzplatz
 * - 'voll'            Output-Puffer voll (Rückstau), die Arbeit ruht
 * - 'ruht'            vom Spieler angehalten (Befehl 'ruhen')
 * - 'winter'          Feld ruht im Winter (Drehbuch 7.4)
 * - 'saat'            Feld wird im Frühjahr erst gesät
 * - 'hochwasser'      Gebäude in der Aue steht beim Hochwasser still
 * - 'kein_werkzeug'   die Fachkraft wartet auf Werkzeug
 * - 'arbeitet'        arbeitet gerade (auch auf dem Weg zur Arbeit)
 * - 'bereit'          fertig und nichts zu tun (Lager, Kirmesplatz ohne weitere Stufe)
 */
export type GebaeudeZustand =
  | 'baustelle' | 'wartet_material' | 'getrennt' | 'kein_arbeiter' | 'kein_baum' | 'kein_fels' | 'kein_platz' | 'voll'
  | 'kein_planierer' | 'planieren' | 'kein_bauarbeiter' | 'hunger' | 'wohnraum_voll' | 'fest'
  | 'ruht' | 'arbeitet' | 'bereit' | 'winter' | 'saat' | 'hochwasser' | 'kein_werkzeug'
  /** M10: steht auf fremdem Gebiet still; Finder sitzt in der Ausredenstube. */
  | 'fremd' | 'ausrede'
  /** M11: ruht bei Regen (Schwäche des Völkchens); Hecke wächst noch heran. */
  | 'regen' | 'waechst';

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
  id: Id; sp: number; typ: string; q: number; r: number; fahne: Id;
  /** 0..PROMILLE Baufortschritt = verbautes Material / Gesamtbedarf; Bauphase = 1 + floor(3·bau/1001) (1, 2, 3), fertig bei PROMILLE. */
  bau: number;
  /** ⚠ keine Wegverbindung zu einem Lager. */
  getrennt: boolean;
  /** Vorrat (nur Lager): Menge je Warenart. */
  vorrat?: number[];
  /** Offener Bedarf je Warenart = Kosten − verbaut (nur Baustelle). */
  bedarf?: number[];
  /** Angelieferte, noch nicht verbaute Waren am Stapel der Baustelle (Drehbuch 4.5). */
  stapel?: number[];
  /** Planieren 0..PROMILLE (nur Baustellen am Hang; PROMILLE = eben). */
  planiert?: number;
  /** Baustellen-Priorität 1..3 (Standard 2; bei fertigen Gebäuden ohne Bedeutung). */
  prioritaet: number;
  /** Vom Spieler angehalten (Befehl 'ruhen'). */
  ruht: boolean;
  /** Bisher hier erzeugte Waren (für die Produktivität im Gebäudefenster). */
  erzeugt: number;
  /** Input-Puffer je Warenart (nur Gebäude mit Eingang, z. B. Sägewerk). */
  puffer?: number[];
  /** Output-Puffer je Warenart (nur Erzeuger/Verarbeiter). */
  ausgang?: number[];
  zustand: GebaeudeZustand;
  /** Arbeiter-Figur (Holzfäller, Förster, Steinbruch), sobald ein Bewohner zugewiesen ist. */
  arbeiter?: SichtArbeiter;
  /** Arbeitsmittelpunkt, nur wenn gesetzt und ungleich dem Gebäude-Hex. */
  mitte?: { q: number; r: number };
  /** Lager und Lagerhaus: Regel je Warenart (0 normal, 1 nicht einlagern, 2 auslagern). */
  regel?: number[];
  /** Schänke: Boten, die gerade unterwegs sind. */
  boten?: number;
  /** Finderhütte (M10): unterwegs bis Tick, in der Ausredenstube bis Tick (mit Ausrede-Index in AUSREDEN), sonst bereit. */
  finder?: { tut: 'bereit' | 'unterwegs' | 'ausrede'; bis: number; ausrede: number; ziel: string };
}

/** Besitz je Hex (M10), indiziert wie SimKarte; -1 = niemand. Kopie, nur bei Änderung neu (dann steigt rev) – nicht beschreiben. */
export interface SichtGebiet { rev: number; besitz: Int8Array }

/** Eifel-Ort im Spielfeld (Drehbuch 6.2). */
export interface SichtOrt {
  /** Ort-Nummer (Index + 1 in orte.json), Ortskern-Hex, Größe 0 Weiler / 1 Dorf / 2 Städtchen, Besitzer (-1 niemand). */
  nr: number; q: number; r: number; groesse: number; besitzer: number;
  /** Wunschliste je Warenart. */
  wunsch: number[];
  /** Für den Spieler der Sicht: eine verbundene eigene Fahne steht am Ort; eine eigene Lieferung ist unterwegs (Ankunft-Tick, sonst 0). */
  erreicht: boolean; unterwegs: number;
  /** Was es beim Einstand gibt: Bewohner, Punkte, Fundkiste je Warenart. */
  bewohner: number; punkte: number; fundkiste: number[];
}

/** Marktposten der Flachländer am Kartenrand (Drehbuch 6.2). */
export interface SichtPosten {
  stadt: string; q: number; r: number; km: number;
  /** Für den Spieler der Sicht: verbundene Fahne am Posten; eigene Händler unterwegs (Ankunft-Ticks). */
  erreicht: boolean; unterwegs: number[];
  /** Tauschangebote (gib → nimm je Warenart, schon mit dem Marktflecken-Zuschlag für den Spieler der Sicht). */
  handel: { gib: number[]; nimm: number[] }[];
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
  /** Art des Steins (statisch, bleibt auch nach dem Abbau): 0 keiner, 1 Fels, 2 Klippe, 3 Lesesteine. */
  felsArt: Uint8Array;
  /** Baumzahl je Hex beim Spielstart (statisch). */
  start?: Uint8Array;
}

/** Bauarbeiter oder Planierer (Drehbuch 4.5), als Figur in der Welt. */
export interface SichtBaumann {
  id: Id; sp: number;
  beruf: 'bauarbeiter' | 'planierer';
  von: { q: number; r: number };
  nach: { q: number; r: number };
  fortschritt: number;
  schritt: number;
  /** geht (über die Wege) | arbeitet (hämmert, schaufelt; von = nach) | wartet (an der Baustelle auf Material). */
  tut: 'geht' | 'arbeitet' | 'wartet';
  /** Ziel-Baustelle (0 = auf dem Heimweg). */
  ziel: Id;
}

/** Ereignis für Meldungen (Drehbuch 1.1: mit Spruch in der Oberfläche). nr steigt fortlaufend. */
export interface SichtEreignis {
  nr: number; tick: number;
  art: 'bewohner' | 'notnagel' | 'fertig' | 'kirmes' | 'stufe' | 'zuzug'
    | 'jahreszeit' | 'wetter' | 'friert' | 'satt' | 'kleines_fest' | 'bauleute' | 'verloren'
    | 'einstand' | 'zu_spaet' | 'handel' | 'fund' | 'erwischt' | 'ertappt' | 'schuetzenfest' | 'koenig' | 'ende' | 'altstein';
  /** Gebäude (bewohner, fertig, kirmes, kleines_fest) oder 0. */
  gebaeude: Id;
  /**
   * Zahl (zuzug: Bewohner; stufe: neue Stufe; jahreszeit: 0 Frühjahr … 3 Winter; wetter: Wetterart, angekündigt; kleines_fest: Fest-Index;
   * bauleute: 0 Bauarbeiter, 1 Planierer) oder Warenart (bewohner: gegessene Ware; verloren: fallen gelassene Ware).
   */
  wert: number;
  /** Ort (Hex) für verloren, sonst nicht gesetzt. */
  q?: number; r?: number;
}

/** Dorf: Bewohner, Wohnraum, Bauleute, Dorfstufe und Kirmes (Drehbuch 4.3, 4.5, 5.2). */
export interface SichtDorf {
  /** 0 Weiler, 1 Dorf, 2 Kirchdorf, 3 Marktflecken. */
  stufe: number;
  /** Bewohner gesamt (frei + Träger + Arbeiter), ohne Bauleute. */
  bewohner: number;
  frei: number; traeger: number; arbeiter: number;
  wohnraum: number;
  bauarbeiter: { gesamt: number; frei: number };
  planierer: { gesamt: number; frei: number };
  /** Kirmes der aktuellen Stufe (null, wenn es keine weitere gibt): Warenliste, am Platz geliefert, Fest-Restticks (0 = kein Fest). */
  kirmes: { liste: number[]; geliefert: number[]; platz: Id; fest: number; festDauer: number; mischkorb: { soll: number; da: number } } | null;
  /** Kleines Fest dieser Jahreszeit (Drehbuch 6 „Feste“): Index in KLEINE_FESTE, Warenliste, am Platz dafür bereit, laufendes Fest. */
  fest: { nr: number; liste: number[]; geliefert: number[]; laeuft: number } | null;
  /** Punkte aus kleinen Festen (bis FEST_OBERGRENZE). */
  festPunkte: number;
  /** Im Winter fehlt Essen: die Leute frieren (Gebäude langsamer, kein Nachwuchs). */
  friert: boolean;
  /** Wunschzahl Bauarbeiter und Planierer (Befehl bauleute). */
  bauSoll: number; planSoll: number;
  /** Ticks bis zum nächsten Zugezogenen (Notnagel) oder -1, wenn der Notnagel nicht greift. */
  notnagel: number;
  /** Warenverteilung: je Warenart die Rangfolge der Abnehmer-Arten (ABNEHMER in src/sim/daten.ts). */
  verteilung: number[][];
  /** Erzeugte Waren je Warenart in diesem Dorf seit Spielbeginn. */
  erzeugt: number[];
  /** M10: Schützenfest dieses Jahres (null ohne Schützenhaus): Liste, geliefert, schon gefeiert, laufendes Fest; Schützenkönig. */
  schuetzen?: { liste: number[]; geliefert: number[]; gefeiert: boolean; fest: number; schuss: number } | null;
  koenig?: boolean;
  /** M11: Völkchen (Id) oder ''. */
  voelkchen?: string;
}

/**
 * Statistik eines Dorfs (ROADMAP M7): Messpunkte in festem Takt. Ein Punkt ist [tick, bewohner, stufe, gebäude, …vorrat je Ware,
 * …erzeugt je Ware (seit Spielbeginn)]; STAT_KOPF Kopfwerte, dann zweimal WAREN.length.
 */
export interface SichtStatistik { takt: number; punkte: number[][] }
export const STAT_KOPF = 4;

/** Kurzüberblick über ein Dorf im Mehrspieler (für alle sichtbar). */
export interface SichtSpieler {
  stufe: number; bewohner: number; festPunkte: number;
  /** M10: Eifel-Punkte, Gebiet in Hexen, Orte, Schützenkönig. */
  punkte: number; hexe: number; orte: number; koenig: boolean;
  /** M11: Völkchen (Id) oder ''. */
  voelkchen: string;
  /** Der Verwalter führt das Dorf (Spieler fehlt länger als 5 Minuten). */
  verwalter: boolean;
}

/** Beschwipster Bote (DESIGN §10.3): läuft querfeldein, torkelt; pegel 1 angeheitert … 3 sternhagelvoll. */
export interface SichtBote {
  id: Id; sp: number;
  von: { q: number; r: number }; nach: { q: number; r: number };
  fortschritt: number; schritt: number;
  ware: number;
  tut: 'geht' | 'wartet';
  pegel: 1 | 2 | 3;
}

/** Jahreszeit und Wetter (Drehbuch 7.4): für alle gleich. */
export interface SichtJahr {
  /** Spieljahr (0 = erstes), Jahreszeit (0 Frühjahr … 3 Winter), Ticks bis zur nächsten Jahreszeit. */
  jahr: number; jahreszeit: number; rest: number;
  /** Laufendes Wetter (Art = Index in WETTER) bis Tick; dazu, was angekündigt ist (ab Tick). */
  wetter: { art: number; bis: number; feld: string }[];
  kommt: { art: number; ab: number; feld: string }[];
}

export interface SimSicht {
  tick: number;
  /** Für wen die Sicht gilt: dorf, freieTraeger und ereignisse sind die dieses Spielers. Die Welt (Fahnen, Gebäude …) enthält alle. */
  ich: number;
  /** Alle Dörfer, Index = Spieler. */
  spieler: SichtSpieler[];
  fahnen: SichtFahne[];
  segmente: SichtSegment[];
  traeger: SichtTraeger[];
  gebaeude: SichtGebaeude[];
  /** Freie Bewohner im Vorrat (werden Träger und Arbeiter). */
  freieTraeger: number;
  natur: SichtNatur;
  bauleute: SichtBaumann[];
  dorf: SichtDorf;
  /** Die letzten Ereignisse (höchstens 32), älteste zuerst. */
  ereignisse: SichtEreignis[];
  jahr: SichtJahr;
  boten: SichtBote[];
  /** Waren, die Boten haben fallen lassen (liegen, bis sie einer aufliest). */
  liegend: { q: number; r: number; ware: number; sp: number }[];
  /** M10: Gebiet, Orte, Marktposten, Regeln (Gebiet an/aus, Ziel und Zielpunkte) und Ende der Partie (Sieger, Tick) oder null. */
  gebiet: SichtGebiet;
  orte: SichtOrt[];
  posten: SichtPosten[];
  regeln: { gebiet: boolean; ziel: string; zielPunkte: number };
  ende: { sieger: number; tick: number } | null;
}

/** Leere Natur (ohne Hexe) für Darstellungen ohne Simulation, z. B. die Demo. */
export const KEINE_NATUR: SichtNatur = { rev: 0, baum: new Uint8Array(0), jung: new Uint8Array(0), stufe: new Uint8Array(0), fels: new Uint8Array(0), felsArt: new Uint8Array(0) };

/** Jahr ohne Simulation (Demo): Frühjahr, kein Wetter. */
export const KEIN_JAHR: SichtJahr = { jahr: 0, jahreszeit: 0, rest: 0, wetter: [], kommt: [] };

/** Leeres Dorf für Darstellungen ohne Simulation (Demo). */
export const KEIN_DORF: SichtDorf = {
  stufe: 0, bewohner: 0, frei: 0, traeger: 0, arbeiter: 0, wohnraum: 0,
  bauarbeiter: { gesamt: 0, frei: 0 }, planierer: { gesamt: 0, frei: 0 }, kirmes: null, notnagel: -1, verteilung: [], erzeugt: [],
  fest: null, festPunkte: 0, friert: false, bauSoll: 0, planSoll: 0,
};

/** Kein Gebiet, keine Orte (Demo ohne Simulation). */
export const KEIN_GEBIET: SichtGebiet = { rev: 0, besitz: new Int8Array(0) };
