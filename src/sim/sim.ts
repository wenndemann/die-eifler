// Deterministischer Simulationskern (Drehbuch 4.1, 8.3; DESIGN §3–4): Fahnen, Wege, Träger, Routing, Warenfluss, Baustellen,
// Bäume und Felsen, Arbeiter, Abriss. Nur Ganzzahlen, fester Tick, Zufall nur aus der Saat. Intern werden Hexe als Karten-Index geführt.
// Mehrspieler (Drehbuch 2.3, 8.3): Jeder Spieler hat sein Dorf (Bewohner, Bauleute, Stufe, Kirmes) und sein eigenes Wegenetz. Fahnen,
// Wege, Träger, Gebäude und Bauleute gehören einem Spieler (sp); Netze verschiedener Spieler berühren sich nie. Natur ist gemeinsam.
import { FLAG } from '../welt/format';
import { Fnv2 } from '../welt/pruefsumme';
import {
  ARBEIT_MITTE_MAX, BAU_JE_WARE, BAUM_HEIDE_PROZENT, BAUM_MOOR_PROZENT, BAUM_WACHSEN, BAUM_WIESE_PROZENT, FAHNE_MAX_SEGMENTE,
  FELS_LESE, FELS_LESE_START, FELS_STEIL, FELS_STEIN, FLAG_CAP, GEBAEUDE, KIRMES, LESE_PROZENT, NAHRUNG, NAHRUNG_REIHE, NAHRUNG_ZYKLUS,
  NOTNAGEL_FREI_UNTER, NOTNAGEL_TICKS, NOTPLAETZE, planierTicks, PRIO_MAX, PRIO_MIN, PRIO_STANDARD,
  RODUNG_STAMM_MAX, START_BAUARBEITER, START_BEWOHNER, START_PLANIERER, START_STEIN_ABSTAND_MIN, START_STEIN_MIN, START_STEIN_RADIUS,
  START_VORRAT, STAT_MAX, STAT_TAKT, STEIL_GRAD, ABNEHMER_ZAHL, VERTEILUNG_JE_WARE, SUCHE_WARTE, TREE_MAX, UEBERGABE_TICKS, WARE, WAREN, WEG_MAX_SCHRITTE,
  AUE_DM, AUFSAMMELN_TICKS, BAULEUTE_MAX, BAULEUTE_TAKT, BOTE_AB_HEX, BOTE_TICKS, BOTE_TORKELN_PROZENT, BOTE_VERLIERT_JEDE, ERNTE_PROZENT,
  FEST_OBERGRENZE, FRIEREN_PROZENT, HOEHE_PROZENT, JAHRESZEIT_TICKS, KLEINE_FESTE, KLEINES_FEST_TICKS, MISCHKORB, SAAT_TICKS, SCHNEE_PROZENT,
  TAL_DM, WETTER, WETTER_ANKUENDIGUNG, WINTER, WINTER_ESSEN_TICKS, WINTER_JE_BEWOHNER,
} from './daten';
import { inJahreszeit, jahreszeitVon, jahrVon, Wetterkalender } from './jahr';
import {
  ANSCHLUSS, AUSREDE_TICKS, FIND_BASIS, FIND_BEUTE, FIND_HOECHSTENS, FIND_PAUSE, FIND_POLIZIST, FIND_PUNKTE, FIND_TICKS_JE_HEX, FIND_UMKREIS,
  FIND_WACHHUND, FLACH_WACHSAMKEIT, GEBIET_RADIUS, GEBIET_TAKT, HANDEL, HANDEL_BESSER, HEXE_JE_PUNKT, KOENIG_AB, KOENIG_BONUS, KOENIG_RUNDE,
  marktpostenAusKarte, ORT_GROESSEN, ORT_LAUFZEIT_JE_HEX, orteAusKarte, POSTEN_LAUFZEIT_JE_KM, PUNKTE_BEWOHNER, PUNKTE_KIRMES, PUNKTE_KOENIG,
  PUNKTE_SCHUETZENFEST, PUNKTE_STUFE, REGELN_ALT, SCHUETZEN_FEST, SCHUETZEN_LISTE, SCHUSS_GLUECK, SCHUSS_GRUND, SCHUSS_STAND, STAEDTE,
  VERSORGT_BONUS, zielPunkte, AUSREDEN,
} from './nachbarn';
import type { OrtDaten, PostenDaten, Regeln } from './nachbarn';
import { BOOTE_PUNKTE, BOOTE_TAKT, HECKE_WACHSEN, KIRMES_JE_VOELKCHEN, VOELKCHEN, voelkchenIndex, type VoelkchenRegeln } from './voelkchen';
import type { GebaeudeTyp } from './daten';
import { SimKarte } from './karte';
import { FELS_FELS, FELS_KLIPPE, FELS_LESE as ART_LESE, hashHex, hashHex2, hashHex3 } from './natur';
import { sucheWeg, ZahlenHeap } from './pfad';
import { PROMILLE, STAT_KOPF } from './typen';
import type {
  Befehl, GebaeudeZustand, Id, KarteDaten, Protokoll, ProtokollEintrag, SichtArbeiter, SichtBaumann, SichtBote, SichtEreignis, SichtJahr, SichtNatur,
  SichtStatistik, SimSicht, StartDaten, SichtGebiet, SichtDorf,
} from './typen';
import { ausBase64, inBase64, kopie, STAND_ZAHLEN } from './stand';
import type { SimStand } from './stand';

interface Ware { art: number; ziel: Id }

interface Fahne { id: Id; sp: number; h: number; gebaeude: Id; waren: Ware[]; segmente: Id[] }

interface Segment {
  id: Id; sp: number; a: Id; b: Id;
  /** Hex-Indizes von Fahne a bis Fahne b. */
  pfad: number[];
  traeger: Id;
  verkehr: number;
  /** Laufzeit a→b und b→a in Ticks. */
  kab: number; kba: number;
}

/** phase 0 = Anmarsch vom Lager, 1 = wartet an einem Ende, 2 = läuft auf dem Segment. */
interface Traeger {
  id: Id; sp: number; seg: Id; phase: 0 | 1 | 2;
  /** Ende (0 = a, 1 = b), an dem er wartet bzw. zuletzt war. */
  ende: 0 | 1;
  /** Position im Segment-Pfad (Index) und Richtung, Ticks im aktuellen Schritt und dessen Dauer. */
  pos: number; dir: 1 | -1; t: number; dauer: number;
  pause: number;
  art: number; ziel: Id;
  /** Ticks, die er mit Ware vor einer vollen Fahne steht. */
  warte: number;
  route: number[]; ri: number; routeSegs: Id[];
}

/** Phasen des Arbeiters (Holzfäller, Förster, Steinbruch). */
const PH_SUCHE = 0, PH_HIN = 1, PH_ARBEIT = 2, PH_ZURUECK = 3, PH_RUHE = 4;

interface Gebaeude {
  id: Id; sp: number; typ: string; h: number; fahne: Id;
  /** 1 = fertig gebaut (Lager von Anfang an). */
  fertig: 0 | 1;
  /** Bisher verbautes Material je Warenart und Baustellen-Priorität. */
  verbaut: number[];
  prio: number;
  getrennt: boolean;
  /** 1 = vom Spieler angehalten (Befehl 'ruhen'); erzeugt = bisher hier erzeugte Waren. */
  ruht: number; erzeugt: number;
  puffer: number[]; incoming: number[]; ausgang: number[];
  zeit: number; arbeit: number;
  vorrat: number[];
  // Arbeiter: ar = 1, wenn ein Bewohner zugewiesen ist; Phase, Ticks in der Phase und deren Dauer, Schritt auf dem Gehweg,
  // Zielhex (-1 keiner), Gehweg Hütte → Ziel, getragene Ware (-1 keine), leer = 1: letzte Suche ohne Ergebnis.
  ar: number; ph: number; pt: number; pd: number; wi: number; zh: number; weg: number[]; traegt: number; leer: number;
  /** Arbeitsmittelpunkt (Hex-Index) oder -1 = das Gebäude selbst. */
  mitte: number;
  // Baustelle (Drehbuch 4.5): angelieferter Stapel je Warenart, Ware in der Hand des Bauarbeiters (-1 keine), Planieren nötig/erledigt
  // (Ticks), zugewiesener Bauarbeiter und Planierer (Id des Baumanns, 0 keiner).
  stapel: number[]; haende: number; planSoll: number; planIst: number; bauer: Id; planierer: Id;
  /** Lager und Lagerhaus: Regel je Warenart (0 normal, 1 nicht einlagern, 2 auslagern); sonst leer. */
  regel: number[];
  /** M11: eigene Baukosten, wenn sie vom Typ abweichen (Moor bei den Monschauern, Schiefer bei den Öslingern). */
  kost?: number[];
}

/** Phasen eines Boten: wartet, holt die Ware im Lager, bringt sie zum Ziel, geht zu einer liegenden Ware, bringt Ware ins Lager. */
const BO_WARTET = 0, BO_HOLT = 1, BO_BRINGT = 2, BO_SAMMELT = 3, BO_HEIM = 4;

/** Beschwipster Bote (DESIGN §10.3): ein Bewohner auf Schnaps, querfeldein unterwegs bis Tick `bis`. */
interface Bote {
  id: Id; sp: number; schaenke: Id; bis: number; phase: number;
  /** Gehweg (Hex-Indizes, torkelnd), Position, Ticks im Schritt und dessen Dauer. */
  route: number[]; ri: number; t: number; dauer: number;
  /** Ware (-1 keine), Ziel-Gebäude der Lieferung, Lager, aus dem sie kommt bzw. in das sie geht; faellt: Routen-Index, an dem sie herunterfällt (-1 nie). */
  art: number; ziel: Id; lager: Id; faellt: number;
}

/** Ware, die ein Bote verloren hat: liegt auf Hex h, bis ein Bote sie holt (bote) oder ab Tick `bis` ein Bewohner sie aufliest. */
interface Liegend { h: number; art: number; sp: number; bis: number; bote: Id }

/**
 * Lieferung an einen Ort (Einstand, art 0) oder Handel mit einem Marktposten (art 1, Drehbuch 6.2): Die Waren haben das Lager verlassen
 * und kommen am Tick `ankunft` an; beim Handel kommt `nimm` dann ins Lager `lager`.
 */
interface Lieferung { id: Id; sp: number; art: 0 | 1; ziel: number; ankunft: number; waren: number[]; nimm: number[]; lager: Id }

/** Finderhütte (Drehbuch 6.3): Phasen in Gebaeude.ph – bereit, unterwegs, in der Ausredenstube. */
const FI_BEREIT = 0, FI_UNTERWEGS = 1, FI_AUSREDE = 2;
/** Ziel eines Finders: Marktposten p oder (ab FI_SPIELER) Mitspieler sp. */
const FI_SPIELER = 1000;

/** Phasen eines Baumanns: geht über die Wege, arbeitet an der Baustelle, wartet dort auf Material. */
const BM_GEHT = 0, BM_ARBEIT = 1, BM_WARTET = 2;

/** Bauarbeiter (beruf 0) oder Planierer (beruf 1), Drehbuch 4.5. */
interface Baumann {
  id: Id; sp: number; beruf: 0 | 1;
  /** Ziel-Baustelle (0 = Heimweg ins Lager). */
  ziel: Id;
  phase: number;
  /** Gehweg als Hex-Indizes, Position, Ticks im Schritt und dessen Dauer; beim Arbeiten t/dauer der Arbeit. */
  route: number[]; ri: number; t: number; dauer: number;
}

/** Dorf eines Spielers (Drehbuch 4.3, 4.5, 5.2; DESIGN §5). */
interface Dorf {
  /** Bewohner gesamt (frei + Träger + Arbeiter) und davon frei im Vorrat. */
  bewohner: number; frei: number;
  /** Bauleute: Gesamtzahl und frei im Lager, je Bauarbeiter und Planierer. */
  bauGesamt: number; bauFrei: number; planGesamt: number; planFrei: number;
  /** Dorfstufe (0 Weiler …), laufendes Fest (Restticks), Notnagel-Uhr. */
  stufe: number; fest: number; notnagelT: number;
  /** 1 = der Verwalter führt das Dorf (Drehbuch 8.3). */
  verwalter: number;
  /** Warenverteilung (ROADMAP M7): je Warenart ABNEHMER_ZAHL Abnehmer-Arten in Rangfolge, hintereinander (Ware a ab a·ABNEHMER_ZAHL). */
  vert: number[];
  /** Erzeugte Waren je Warenart in diesem Dorf. */
  erzeugt: number[];
  /** Statistik: Messpunkte (SichtStatistik), aktueller Takt in Ticks und Tick des nächsten Punkts. */
  statPunkte: number[][]; statTakt: number; statNaechst: number;
  ereignisse: SichtEreignis[];
  /** Freier Wohnraum zu Beginn des Ticks (abgeleitet, nicht Teil der Prüfsumme). */
  wohnFrei: number;
  /** Wunschzahl Bauarbeiter und Planierer (Drehbuch 4.5). */
  bauSoll: number; planSoll: number;
  /** Kleine Feste: Spieljahr, in dem jedes zuletzt gefeiert wurde (-1 nie), laufendes Fest (Restticks, Index), Punkte daraus. */
  festJahr: number[]; kfest: number; kfestNr: number; festPunkte: number;
  /** Winter: 1 = es fehlt Essen, die Leute frieren; Uhr bis zur nächsten Wintermahlzeit. */
  friert: number; winterT: number;
  /** Tick, an dem zuletzt eine Lieferung für einen Boten weit genug war (die Schänke schickt nur dann Boten los). */
  botenWunsch: number;
  /**
   * M10: Punkte aus Einständen und Funden, Schützenfeste (Zahl, Jahr des letzten, Restticks des laufenden, letzter Treffer-Wert),
   * Schützenkönig (1 = trägt gerade den Titel) und wie oft.
   */
  einstandP: number; fundP: number; schuetzenN: number; schuetzenJahr: number; sfest: number; schuss: number; koenig: number; koenigN: number;
  /** M11: Völkchen (Index in VOELKCHEN, -1 keins); Punkte aus dem Bootsverleih. */
  vk: number; bootP: number;
}

function neuesDorf(bewohner: number): Dorf {
  return {
    bewohner, frei: bewohner, bauGesamt: START_BAUARBEITER, bauFrei: START_BAUARBEITER, planGesamt: START_PLANIERER, planFrei: START_PLANIERER,
    stufe: 0, fest: 0, notnagelT: 0, verwalter: 0, ereignisse: [], wohnFrei: 0,
    vert: standardVerteilung(), erzeugt: new Array<number>(WAREN.length).fill(0), statPunkte: [], statTakt: STAT_TAKT, statNaechst: 0,
    ...dorfM8(), ...dorfM10(), vk: -1, bootP: 0,
  };
}

/** Felder, die mit M10 ins Dorf kamen (auch für ältere Spielstände). */
function dorfM10(): Pick<Dorf, 'einstandP' | 'fundP' | 'schuetzenN' | 'schuetzenJahr' | 'sfest' | 'schuss' | 'koenig' | 'koenigN'> {
  return { einstandP: 0, fundP: 0, schuetzenN: 0, schuetzenJahr: -1, sfest: 0, schuss: 0, koenig: 0, koenigN: 0 };
}

/** Kein Völkchen: neutrale Regeln (Tests, alte Spielstände). */
const KEIN_VOELKCHEN: VoelkchenRegeln = {
  id: '', spezialitaet: -1, tempo: {}, bauzeit: 100, fest: 100, handel: 100, amWasserVerboten: false, moorKosten: 100, moorBauzeit: 100, regenRuht: [],
  heckeWinter: 0, heckeWachstum: 100, start: [], festPause: false, laermRadius: 0, altsteinProzent: 0, altsteinTicks: 0, ersatzFuer: [], kostenRabatt: false,
  tracht: '', dach: '',
};

/** Felder, die mit M8 ins Dorf kamen (auch für ältere Spielstände). */
function dorfM8(): Pick<Dorf, 'bauSoll' | 'planSoll' | 'festJahr' | 'kfest' | 'kfestNr' | 'festPunkte' | 'friert' | 'winterT' | 'botenWunsch'> {
  return {
    bauSoll: START_BAUARBEITER, planSoll: START_PLANIERER, festJahr: KLEINE_FESTE.map(() => -1), kfest: 0, kfestNr: -1, festPunkte: 0,
    friert: 0, winterT: 0, botenWunsch: -1_000_000,
  };
}

/** Liste auf `n` Einträge mit Nullen verlängern (Spielstände mit weniger Waren). */
function aufLaenge(a: number[] | undefined, n: number): number[] {
  const x = Array.isArray(a) ? a.slice(0, n) : [];
  while (x.length < n) x.push(0);
  return x;
}

/** Ist das Gebäude ein fertiges Lager (Dorfkern oder Lagerhaus)? */
/** Kampagne: höchstens so viele Stück je Warenart im Rucksack (Startdaten). */
export const RUCKSACK_JE_WARE = 99;

function istLager(g: { typ: string; fertig: number }): boolean {
  return g.fertig === 1 && GEBAEUDE[g.typ].funktion === 'lager';
}

/** Nahrung, einfache zuerst (für den Wintervorrat). */
const EINFACH_ZUERST: readonly number[] = NAHRUNG_REIHE.slice().sort((a, b) => NAHRUNG[a] - NAHRUNG[b] || a - b);
/** Abstand zwischen zwei Boten derselben Schänke und wie lange ein Wunsch nach Boten anhält (Ticks). */
const BOTE_TAKT = 10 * 20;
const BOTE_WUNSCH_HAELT = 30 * 20;

/** Standard-Verteilung für alle Waren (data/dorf.json). */
function standardVerteilung(): number[] {
  const v: number[] = [];
  for (let a = 0; a < WAREN.length; a++) v.push(...VERTEILUNG_JE_WARE[a]);
  return v;
}

/** Abnehmer-Art eines Gebäudes (ABNEHMER): 0 Baustelle, 1 Kirmesplatz, 2 Verarbeiter, 3 Wohnhaus; -1 Lager. */
function abnehmerArt(g: { typ: string; fertig: number }): number {
  if (!g.fertig) return 0;
  if (istLager(g)) return -1;
  const f = GEBAEUDE[g.typ].funktion;
  return f === 'kirmes' || f === 'schuetzen' ? 1 : f === 'wohnen' ? 3 : 2;
}

/** Höchstzahl Spieler einer Partie. */
export const SPIELER_MAX = 8;

const EREIGNISSE_MAX = 32;

const DIST_K = 1 << 21;
const ALLE_WAREN: readonly number[] = WAREN.map((_, i) => i);

function summe(a: readonly number[]): number {
  let n = 0;
  for (const v of a) n += v;
  return n;
}

/** Gebäudetyp nach Id; unbekannte Ids (auch Namen wie „constructor“) liefern undefined. */
function typVon(typ: string): GebaeudeTyp | undefined {
  return Object.prototype.hasOwnProperty.call(GEBAEUDE, typ) ? GEBAEUDE[typ] : undefined;
}

export class Simulation {
  readonly karte: SimKarte;
  private readonly saat: number;
  /** Startdaten je Spieler, wie übergeben (fürs Protokoll). */
  private readonly starts: StartDaten[];
  private _tick = 0;
  private rng: number;
  private naechsteId = 1;
  /** Dorf je Spieler (Index = Spieler). */
  private doerfer: Dorf[];
  private bauleute = new Map<Id, Baumann>();
  private ereignisNr = 0;
  private befehlZahl = 0;
  private fahnen = new Map<Id, Fahne>();
  private segmente = new Map<Id, Segment>();
  private traeger = new Map<Id, Traeger>();
  private gebaeude = new Map<Id, Gebaeude>();
  private hexFahne: Int32Array;
  private hexGeb: Int32Array;
  private hexWeg: Int32Array;
  // Natur: ausgewachsene Bäume, Jungbäume (mit Reifetick je Platz), Fels-Restmenge, Reservierungen der Arbeiter
  private baum: Uint8Array;
  private jung: Uint8Array;
  private jungReif: Int32Array;
  private stufe: Uint8Array;
  private fels: Uint8Array;
  /** Art des Steins je Hex (statisch) und Baumzahl beim Start (statisch). */
  private felsArt: Uint8Array;
  private baumStart!: Uint8Array;
  private felsArtKopie!: Uint8Array;
  private baumStartKopie!: Uint8Array;
  private baumRes: Uint8Array;
  private felsRes: Uint8Array;
  /** Hexe mit Jungbäumen (Einfüge-Reihenfolge). */
  private jungListe: number[] = [];
  private natRev = 0;
  private log: ProtokollEintrag[] = [];
  private ausstehend: ProtokollEintrag[] = [];
  private stat = { angekommen: 0, verbraucht: 0, erzeugt: 0, maxWarte: 0, verbaut: 0 };
  private erzeugtJe: number[] = new Array<number>(WAREN.length).fill(0);
  // abgeleitete Zwischenspeicher (nicht Teil der Prüfsumme)
  private distCache = new Map<Id, Map<Id, number>>();
  private verbunden = new Set<Id>();
  /** Zähler für Netzänderungen und die nur lesend gerechneten Verbindungen (abgeleitet, nicht Teil der Prüfsumme). */
  private netzStand = 0;
  private verbundenLesend: { stand: number; fahnen: Set<Id> } | null = null;
  private verbundenNeu = true;
  private inb = new Map<Id, number>();
  private natCache: SichtNatur | null = null;
  private natHash: { rev: number; hex: string } | null = null;
  /** Beschwipste Boten und verlorene Waren (M8). */
  private boten = new Map<Id, Bote>();
  private liegend: Liegend[] = [];
  /** Jahreszeit und Wetter aus Tick und Saat (abgeleitet); Hex-Lagen für das Wetter: Tal, Höhe, Aue (aus der Karte, statisch). */
  private kalender: Wetterkalender;
  private lageTal: Uint8Array;
  private lageHoehe: Uint8Array;
  private lageAue: Uint8Array;
  /** Wirkung von Jahreszeit und Wetter im laufenden Tick (abgeleitet, zu Beginn jedes Ticks neu): Prozent je Lage (0 alle, 1 Tal, 2 Höhe, 3 Aue). */
  private wegeP = [0, 0, 0, 0];
  private arbeitP = [0, 0, 0, 0];
  private felderP = 0;
  private missernte = '';
  private missernteP = 0;
  private hochwasser = false;
  /** Es regnet gerade (abgeleitet, je Tick). */
  private regen = false;
  private jz = 0;
  /**
   * M10 (Drehbuch 6): Regeln der Partie; Besitz je Hex (-1 frei) mit Änderungszähler; Orte und Marktposten (statisch aus der Karte),
   * Besitzer je Ort (-1 niemand), Ort-Index je Ortskern-Hex (-1); laufende Lieferungen; Ende der Partie (Sieger, Tick) oder null.
   */
  private regeln: Regeln;
  private besitz: Int8Array;
  private besitzRev = 0;
  private besitzHash: { rev: number; hex: string } | null = null;
  private gebietCache: SichtGebiet | null = null;
  private orte: OrtDaten[];
  private ortVonHex: Int16Array;
  private ortBesitz: number[];
  private posten: PostenDaten[];
  private lieferungen: Lieferung[] = [];
  private ende: { sieger: number; tick: number } | null = null;

  /** `start`: ein Dorf (Einzelspiel) oder eins je Spieler; Spieler i startet am Lager-Hex start[i]. */
  constructor(karteDaten: KarteDaten, saat: number, start: StartDaten | readonly StartDaten[], regeln?: Regeln) {
    this.karte = new SimKarte(karteDaten);
    this.saat = saat | 0;
    const starts = Array.isArray(start) ? start : [start as StartDaten];
    if (!starts.length || starts.length > SPIELER_MAX) throw new Error(`1 bis ${SPIELER_MAX} Spieler, nicht ${starts.length}`);
    this.starts = starts.map((x) => {
      const s: StartDaten = x.bewohner === undefined ? { q: x.q, r: x.r } : { q: x.q, r: x.r, bewohner: x.bewohner };
      if (x.voelkchen && voelkchenIndex(x.voelkchen) >= 0) s.voelkchen = x.voelkchen;
      // Rucksack: nur bekannte Waren, ganze Stück, höchstens RUCKSACK_JE_WARE je Art
      if (x.waren) {
        const w: Record<string, number> = {};
        for (const [id, n] of Object.entries(x.waren)) {
          const k = Math.min(RUCKSACK_JE_WARE, Math.floor(Number(n) || 0));
          if (WARE[id] !== undefined && k > 0) w[id] = k;
        }
        if (Object.keys(w).length) s.waren = w;
      }
      return s;
    });
    this.doerfer = this.starts.map((x) => ({ ...neuesDorf(Math.max(0, Math.floor(x.bewohner ?? START_BEWOHNER))), vk: voelkchenIndex(x.voelkchen) }));
    this.rng = (Math.imul(this.saat, 0x9e3779b1) ^ 0x85ebca6b) | 0;
    const n = this.karte.count;
    this.hexFahne = new Int32Array(n);
    this.hexGeb = new Int32Array(n);
    this.hexWeg = new Int32Array(n);
    this.baum = new Uint8Array(n);
    this.jung = new Uint8Array(n);
    this.jungReif = new Int32Array(n * TREE_MAX);
    this.stufe = new Uint8Array(n);
    this.fels = new Uint8Array(n);
    this.felsArt = new Uint8Array(n);
    this.baumRes = new Uint8Array(n);
    this.felsRes = new Uint8Array(n);
    this.natureStart();
    this.starts.forEach((st, sp) => {
      const h = this.karte.index(st.q, st.r);
      if (h < 0 || !this.karte.begehbar[h]) throw new Error(`Startlager von Spieler ${sp} liegt nicht auf begehbarem Boden`);
      if (this.hexGeb[h] || this.hexFahne[h]) throw new Error(`Startlager von Spieler ${sp} liegt auf einem anderen Lager`);
      const lager = this.gebaeudeErzeugen('lager', h, true, sp);
      lager.vorrat = START_VORRAT.map((n, a) => n + (this.vkVon(sp).start[a] ?? 0) + (st.waren?.[WAREN[a]] ?? 0));
    });
    // fairer Start erst, wenn alle Lager stehen (keine Lesesteine auf ein anderes Lager)
    this.starts.forEach((st) => this.fairerStart(this.karte.index(st.q, st.r)));
    this.felsArtKopie = this.felsArt.slice();
    this.baumStartKopie = this.baumStart.slice();
    this.kalender = new Wetterkalender(this.saat);
    this.lageTal = new Uint8Array(n); this.lageHoehe = new Uint8Array(n); this.lageAue = new Uint8Array(n);
    this.lagenBerechnen();
    this.jahrTick();
    // M10: Orte, Marktposten, Startorte und das erste Gebiet
    this.regeln = regeln ? { gebiet: regeln.gebiet ? 1 : 0, ziel: String(regeln.ziel ?? '') } : { ...REGELN_ALT };
    this.orte = orteAusKarte(this.karte, karteDaten.place, this.saat);
    this.ortVonHex = new Int16Array(n).fill(-1);
    if (karteDaten.place) {
      const nrIndex = new Map(this.orte.map((o, i) => [o.nr, i] as [number, number]));
      for (let i = 0; i < n; i++) {
        const oi = nrIndex.get(karteDaten.place[i] | 0);
        if (oi !== undefined && (this.karte.flags[i] & FLAG.ortskern)) this.ortVonHex[i] = oi;
      }
    }
    this.ortBesitz = this.orte.map(() => -1);
    this.starts.forEach((st, sp) => {
      const oi = this.ortVonHex[this.karte.index(st.q, st.r)];
      if (oi >= 0 && this.ortBesitz[oi] < 0) this.ortBesitz[oi] = sp;
    });
    this.posten = marktpostenAusKarte(this.karte).filter((p) => !this.hexGeb[p.h]);
    this.besitz = new Int8Array(n).fill(-1);
    this.gebietNeu();
  }

  /**
   * Lagen fürs Wetter (data/jahr.json): Tal = mindestens TAL_DM tiefer als der Schnitt im Umkreis 4; Höhe = oberstes Drittel (HOEHE_PROZENT)
   * der Höhen im Ausschnitt; Aue = begehbarer Hex an Wasser, Fluss oder Ufer, höchstens AUE_DM über dem Wasser.
   */
  private lagenBerechnen(): void {
    const k = this.karte, n = k.count;
    let lo = Infinity, hi = -Infinity;
    for (let i = 0; i < n; i++) if (k.begehbar[i]) { lo = Math.min(lo, k.hoehe[i]); hi = Math.max(hi, k.hoehe[i]); }
    const grenze = lo + Math.floor(((hi - lo) * HOEHE_PROZENT) / 100);
    const nass = (i: number) => k.terrain[i] === 0 || (k.flags[i] & (FLAG.fluss | FLAG.ufer)) !== 0;
    for (let i = 0; i < n; i++) {
      if (!k.begehbar[i]) continue;
      if (hi > lo && k.hoehe[i] >= grenze) this.lageHoehe[i] = 1;
      let sum = 0, z = 0;
      const q = k.qs[i], r = k.rs[i];
      for (let dr = -4; dr <= 4; dr++) {
        for (let dq = Math.max(-4, -dr - 4); dq <= Math.min(4, -dr + 4); dq++) {
          const x = k.index(q + dq, r + dr);
          if (x >= 0 && k.begehbar[x]) { sum += k.hoehe[x]; z++; }
        }
      }
      if (z > 0 && Math.floor(sum / z) - k.hoehe[i] >= TAL_DM) this.lageTal[i] = 1;
      if (nass(i)) { this.lageAue[i] = 1; continue; }
      for (let d = 0; d < 6; d++) {
        const x = k.nachbarn[i * 6 + d];
        if (x >= 0 && nass(x) && k.hoehe[i] <= k.hoehe[x] + AUE_DM) { this.lageAue[i] = 1; break; }
      }
    }
  }

  /** Lage eines Hex fürs Wetter: Index 1 Tal, 2 Höhe, 3 Aue (0 = keine besondere). */
  private lageP(p: readonly number[], h: number): number {
    return p[0] + (this.lageTal[h] ? p[1] : 0) + (this.lageHoehe[h] ? p[2] : 0) + (this.lageAue[h] ? p[3] : 0);
  }

  /** Jahreszeit und Wetter für den laufenden Tick (abgeleitet aus Tick und Saat, bei allen gleich). */
  private jahrTick(): void {
    const t = this._tick;
    this.jz = jahreszeitVon(t);
    this.wegeP = [this.jz === WINTER ? SCHNEE_PROZENT : 0, 0, 0, 0];
    this.arbeitP = [0, 0, 0, 0];
    this.felderP = this.jz === 2 ? ERNTE_PROZENT : 0;
    this.missernte = ''; this.missernteP = 0; this.hochwasser = false; this.regen = false;
    for (const e of this.kalender.aktiv(t)) {
      const w = WETTER[e.art];
      this.wegeP[w.wo] += w.wege;
      this.arbeitP[w.wo] += w.arbeit;
      this.felderP += w.felder;
      if (w.missernte) { this.missernte = e.feld; this.missernteP = w.missernte; }
      if (w.hochwasser) this.hochwasser = true;
      if (w.id === 'regen') this.regen = true;
    }
  }

  /** Wege-Verlangsamung (Prozent) auf Hex h: Schnee, Regen, Talnebel. */
  private wegeProzent(h: number): number { return this.lageP(this.wegeP, h); }

  /**
   * Bleibt eine Einheit mit `p` Prozent Verlangsamung in diesem Tick stehen? Ihre Zeiten dauern so (100 + p) / 100-mal so lang,
   * gleichmäßig über die Ticks verteilt; `salz` (Id) verschiebt den Takt, damit nicht alle gleichzeitig stocken.
   */
  private bremst(p: number, salz: number): boolean {
    if (p <= 0) return false;
    const t = this._tick + salz * 7;
    return Math.floor(((t + 1) * p) / (100 + p)) > Math.floor((t * p) / (100 + p));
  }

  /** Bekommt eine Einheit mit `p` Prozent Beschleunigung in diesem Tick einen Extraschritt? */
  private schub(p: number, salz: number): boolean {
    if (p <= 0) return false;
    const t = this._tick + salz * 7;
    return Math.floor(((t + 1) * p) / 100) > Math.floor((t * p) / 100);
  }

  /** Steht ein fertiges Gebäude wegen Jahreszeit oder Wetter still? Zustand oder ''. */
  private stillstand(g: Gebaeude, t: GebaeudeTyp): '' | 'winter' | 'saat' | 'hochwasser' | 'regen' {
    if (this.regen && this.vkVon(g.sp).regenRuht.includes(g.typ)) return 'regen';
    if (t.feld) {
      if (this.jz === WINTER) return 'winter';
      if (this.jz === 0 && jahrVon(this._tick) > 0 && inJahreszeit(this._tick) < SAAT_TICKS) return 'saat';
    }
    if (this.hochwasser && this.lageAue[g.h] && t.arbeiter) return 'hochwasser';
    return '';
  }

  /** Tempo eines arbeitenden Gebäudes in Prozent: + schneller (Ernte, Regen auf Feldern), − langsamer (Dürre, Missernte, Wind, Frieren). */
  private tempoProzent(g: Gebaeude, t: GebaeudeTyp): number {
    let p = -this.lageP(this.arbeitP, g.h);
    if (this.doerfer[g.sp].friert) p -= FRIEREN_PROZENT;
    // M11: Bonus und Schwäche des Völkchens, Windschutz der Hecken im Winter
    const vk = this.vkVon(g.sp);
    p += vk.tempo[g.typ] ?? 0;
    if (vk.heckeWinter && this.jz === WINTER && this.heckeNah(g)) p += vk.heckeWinter;
    if (t.feld) {
      p += this.felderP;
      if (this.missernte === g.typ) p -= this.missernteP;
    }
    return p;
  }

  /**
   * Start-Natur nur aus Kartendaten und Welt-Hex-Koordinaten (hashHex, nicht die Saat): Wald 3 Bäume; Wiese, Heide, Moor je 1 Streubaum
   * auf BAUM_*_PROZENT der Hexe; Steinfeld = Fels (FELS_STEIN), steile begehbare Hexe = Klippe (FELS_STEIL), Wiese/Wald mit
   * LESE_PROZENT = Lesesteinhaufen (FELS_LESE). Ortskern-, Siedlungs-, Bahn- und Wasser-Hexe tragen keine Bäume.
   */
  private natureStart(): void {
    const k = this.karte, n = k.count;
    for (let i = 0; i < n; i++) {
      const t = k.terrain[i], q = k.qs[i], r = k.rs[i];
      const frei = t !== 0 && t !== 6 && !(k.flags[i] & (FLAG.ortskern | FLAG.bahn));
      if (frei) {
        if (t === 2) this.baum[i] = TREE_MAX;
        else if (t === 1 && hashHex(q, r) % 100 < BAUM_WIESE_PROZENT) this.baum[i] = 1;
        else if (t === 3 && hashHex(q, r) % 100 < BAUM_HEIDE_PROZENT) this.baum[i] = 1;
        else if (t === 4 && hashHex(q, r) % 100 < BAUM_MOOR_PROZENT) this.baum[i] = 1;
      }
      if (t === 5) { this.fels[i] = FELS_STEIN; this.felsArt[i] = FELS_FELS; }
      else if (t !== 0 && k.neigung[i] >= STEIL_GRAD) { this.fels[i] = FELS_STEIL; this.felsArt[i] = FELS_KLIPPE; }
      else if (frei && (t === 1 || t === 2) && hashHex2(q, r) % 100 < LESE_PROZENT) { this.fels[i] = FELS_LESE; this.felsArt[i] = ART_LESE; }
    }
    this.baumStart = this.baum.slice();
  }

  /**
   * Fairer Start: Liegen im Umkreis START_STEIN_RADIUS ums Lager weniger als START_STEIN_MIN Steine, kommen Lesesteinhaufen
   * (je FELS_LESE_START) auf freie Wiesen-, Heide- und Wald-Hexe im Abstand START_STEIN_ABSTAND_MIN..START_STEIN_RADIUS dazu – in der
   * festen Reihenfolge hashHex3, dann Index – bis es reicht.
   */
  private fairerStart(lager: number): void {
    const k = this.karte;
    let summe = 0;
    const kand: number[] = [];
    for (let i = 0; i < k.count; i++) {
      const d = k.abstand(lager, i);
      if (d > START_STEIN_RADIUS) continue;
      summe += this.fels[i];
      const t = k.terrain[i];
      if (d >= START_STEIN_ABSTAND_MIN && (t === 1 || t === 2 || t === 3) && !this.fels[i] && !(k.flags[i] & FLAG.bahn) && !this.hexGeb[i]) kand.push(i);
    }
    if (summe >= START_STEIN_MIN) return;
    kand.sort((a, b) => hashHex3(k.qs[a], k.rs[a]) - hashHex3(k.qs[b], k.rs[b]) || a - b);
    for (const i of kand) {
      if (summe >= START_STEIN_MIN) break;
      this.fels[i] = FELS_LESE_START; this.felsArt[i] = ART_LESE;
      summe += FELS_LESE_START;
    }
    this.natRev++;
  }

  get tick(): number { return this._tick; }

  /** Zahl der Spieler (Dörfer). */
  get spielerZahl(): number { return this.doerfer.length; }

  // ------------------------------------------------------------------ Zufall (mulberry32)

  private zufall(n: number): number {
    this.rng = (this.rng + 0x6d2b79f5) | 0;
    let t = Math.imul(this.rng ^ (this.rng >>> 15), 1 | this.rng);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) % n;
  }

  // ------------------------------------------------------------------ Befehle und Tick

  /** Legt einen Befehl ins Protokoll; ausgeführt am Anfang des Ticks `tick`. */
  befehl(tick: number, spieler: number, b: Befehl): void {
    if (!Number.isInteger(tick) || tick < this._tick) throw new Error(`Befehl für vergangenen Tick ${tick} (aktuell ${this._tick})`);
    const e: ProtokollEintrag = { tick, spieler, befehl: JSON.parse(JSON.stringify(b)) as Befehl };
    this.log.push(e);
    this.ausstehend.push(e);
  }

  /** Ein Tick: fällige Befehle, dann Gebäude, Fahnen/Waren, Träger. */
  schritt(): void {
    const t = this._tick;
    if (this.ausstehend.length) {
      const jetzt = this.ausstehend.filter((e) => e.tick === t);
      if (jetzt.length) {
        this.ausstehend = this.ausstehend.filter((e) => e.tick !== t);
        for (const e of jetzt) { this.fuehreAus(e.befehl, e.spieler); this.befehlZahl++; }
      }
    }
    this.jahrTick();
    this.jahrEreignisse();
    if (this.verbundenNeu) this.verbindungenNeu();
    this.inbNeu();
    for (let sp = 0; sp < this.doerfer.length; sp++) this.doerfer[sp].wohnFrei = this.wohnraumFrei(sp);
    for (const g of this.gebaeude.values()) this.gebaeudeTick(g);
    for (let sp = 0; sp < this.doerfer.length; sp++) this.dorfTick(sp);
    if (t % 10 === 0) { this.baeumeWachsen(); this.zielePruefen(); }
    if (t % 4 === 0) { this.lagerPull(); for (let sp = 0; sp < this.doerfer.length; sp++) this.bauleuteSchicken(sp); }
    for (const b of [...this.bauleute.values()]) this.baumannSchritt(b);
    for (const b of [...this.boten.values()]) this.boteSchritt(b);
    if (t % 20 === 0) this.aufsammeln();
    this.traegerPhase();
    // M10: Lieferungen an Orte und Marktposten, Gebiet, Ende der Partie
    if (this.lieferungen.length) this.lieferungenTick();
    if (t % GEBIET_TAKT === 0) this.gebietNeu();
    if (t % 20 === 0 && !this.ende) this.endePruefen();
    if (t % 40 === 0) for (const s of this.segmente.values()) if (s.verkehr > 0) s.verkehr--;
    this._tick++;
  }

  protokoll(karteInfo: Protokoll['karte']): Protokoll {
    const p: Protokoll = {
      format: 1, karte: { ...karteInfo }, saat: this.saat, start: { ...this.starts[0] },
      befehle: this.log.map((e) => ({ tick: e.tick, spieler: e.spieler, befehl: JSON.parse(JSON.stringify(e.befehl)) as Befehl })),
      ticks: this._tick,
    };
    if (this.starts.length > 1) p.mitspieler = this.starts.slice(1).map((x) => ({ ...x }));
    if (this.regeln.gebiet || this.regeln.ziel) p.regeln = { ...this.regeln };
    return p;
  }

  /** Startdaten aller Spieler (Kopie). */
  startDaten(): StartDaten[] { return this.starts.map((x) => ({ ...x })); }

  // ------------------------------------------------------------------ Spielstand (Speichern, Laden, Wiederbeitritt)

  /** Der ganze Zustand als JSON-fähiges Objekt (Kopie). Simulation.ausStand(karte, stand) setzt genau hier fort. */
  stand(): SimStand {
    const jr: number[] = [];
    for (let i = 0; i < this.jungReif.length; i++) if (this.jungReif[i]) jr.push(i, this.jungReif[i]);
    const zahl: Record<(typeof STAND_ZAHLEN)[number], number> = {
      tick: this._tick, rng: this.rng, naechsteId: this.naechsteId, ereignisNr: this.ereignisNr, befehlZahl: this.befehlZahl, natRev: this.natRev,
    };
    return kopie({
      format: 1 as const, saat: this.saat, starts: this.starts, zahlen: STAND_ZAHLEN.map((k) => zahl[k]),
      doerfer: this.doerfer as unknown as Record<string, unknown>[],
      fahnen: [...this.fahnen.values()] as unknown as Record<string, unknown>[],
      segmente: [...this.segmente.values()] as unknown as Record<string, unknown>[],
      traeger: [...this.traeger.values()] as unknown as Record<string, unknown>[],
      gebaeude: [...this.gebaeude.values()] as unknown as Record<string, unknown>[],
      bauleute: [...this.bauleute.values()] as unknown as Record<string, unknown>[],
      natur: {
        baum: inBase64(this.baum), jung: inBase64(this.jung), stufe: inBase64(this.stufe), fels: inBase64(this.fels), felsArt: inBase64(this.felsArt),
        baumRes: inBase64(this.baumRes), felsRes: inBase64(this.felsRes), jungReif: jr, jungListe: this.jungListe,
      },
      log: this.log, ausstehend: this.ausstehend, stat: this.stat, erzeugtJe: this.erzeugtJe,
      boten: [...this.boten.values()] as unknown as Record<string, unknown>[],
      liegend: this.liegend as unknown as Record<string, unknown>[],
      regeln: this.regeln,
      gebiet: {
        besitz: inBase64(Uint8Array.from(this.besitz, (v) => v + 1)), rev: this.besitzRev, orte: this.ortBesitz,
        lieferungen: this.lieferungen as unknown as Record<string, unknown>[], ende: this.ende,
      },
    });
  }

  /** Simulation aus einem Spielstand auf derselben Karte (Prüfsumme danach wie beim Speichern). */
  static ausStand(karteDaten: KarteDaten, st: SimStand): Simulation {
    if (!st || st.format !== 1) throw new Error('Unbekanntes Spielstand-Format');
    const sim = new Simulation(karteDaten, st.saat, st.starts, st.regeln);
    sim.setzeStand(kopie(st));
    return sim;
  }

  private setzeStand(st: SimStand): void {
    const z = (k: (typeof STAND_ZAHLEN)[number]) => st.zahlen[STAND_ZAHLEN.indexOf(k)] | 0;
    this._tick = z('tick'); this.rng = z('rng'); this.naechsteId = z('naechsteId'); this.ereignisNr = z('ereignisNr');
    this.befehlZahl = z('befehlZahl'); this.natRev = z('natRev');
    if (st.doerfer.length !== this.doerfer.length) throw new Error('Spielstand: Zahl der Dörfer passt nicht');
    this.doerfer = st.doerfer as unknown as Dorf[];
    const nw = WAREN.length;
    // Spielstände von vor M7: Verteilung, Statistik und Pause mit Standardwerten; von vor M8: weniger Waren (mit Nullen bzw. der
    // Standard-Verteilung auffüllen), Jahreszeit, Feste, Bauleute und Lagerregeln mit Standardwerten
    for (const d of this.doerfer) {
      if (!Array.isArray(d.vert) || d.vert.length % ABNEHMER_ZAHL !== 0 || d.vert.length > nw * ABNEHMER_ZAHL) d.vert = standardVerteilung();
      else if (d.vert.length < nw * ABNEHMER_ZAHL) d.vert = d.vert.concat(standardVerteilung().slice(d.vert.length));
      if (!Array.isArray(d.statPunkte)) { d.statPunkte = []; d.statTakt = STAT_TAKT; d.statNaechst = this._tick; }
      const alt = Array.isArray(d.erzeugt) ? d.erzeugt.length : nw;
      if (alt < nw) {
        const K = STAT_KOPF;
        d.statPunkte = d.statPunkte.map((p) => [...p.slice(0, K), ...aufLaenge(p.slice(K, K + alt), nw), ...aufLaenge(p.slice(K + alt, K + 2 * alt), nw)]);
      }
      d.erzeugt = aufLaenge(d.erzeugt, nw);
      const m8 = dorfM8() as unknown as Record<string, unknown>;
      for (const key of Object.keys(m8)) if ((d as unknown as Record<string, unknown>)[key] === undefined) (d as unknown as Record<string, unknown>)[key] = m8[key];
      d.festJahr = KLEINE_FESTE.map((_, i) => (Array.isArray(d.festJahr) ? d.festJahr[i] ?? -1 : -1));
      if (typeof d.vk !== 'number') d.vk = voelkchenIndex(this.starts[this.doerfer.indexOf(d)]?.voelkchen);
      if (typeof d.bootP !== 'number') d.bootP = 0;
      const m10 = dorfM10() as unknown as Record<string, unknown>;
      for (const key of Object.keys(m10)) if ((d as unknown as Record<string, unknown>)[key] === undefined) (d as unknown as Record<string, unknown>)[key] = m10[key];
    }
    this.erzeugtJe = aufLaenge(st.erzeugtJe, nw);
    const map = <T extends { id: Id }>(a: Record<string, unknown>[]) => new Map((a as unknown as T[]).map((x) => [x.id, x] as [Id, T]));
    this.fahnen = map<Fahne>(st.fahnen);
    this.segmente = map<Segment>(st.segmente);
    this.traeger = map<Traeger>(st.traeger);
    this.gebaeude = map<Gebaeude>(st.gebaeude);
    this.bauleute = map<Baumann>(st.bauleute);
    for (const g of this.gebaeude.values()) {
      g.ruht ??= 0; g.erzeugt ??= 0;
      for (const key of ['verbaut', 'puffer', 'incoming', 'ausgang', 'vorrat', 'stapel'] as const) g[key] = aufLaenge(g[key], nw);
      if (!Array.isArray(g.regel)) g.regel = GEBAEUDE[g.typ].funktion === 'lager' ? new Array<number>(nw).fill(0) : [];
      else if (g.regel.length) g.regel = aufLaenge(g.regel, nw);
    }
    this.boten = new Map(((st.boten ?? []) as unknown as Bote[]).map((b) => [b.id, b] as [Id, Bote]));
    this.liegend = (st.liegend ?? []) as unknown as Liegend[];
    const n = this.karte.count, nat = st.natur;
    this.baum = ausBase64(nat.baum, n); this.jung = ausBase64(nat.jung, n); this.stufe = ausBase64(nat.stufe, n);
    this.fels = ausBase64(nat.fels, n); this.felsArt = ausBase64(nat.felsArt, n);
    this.baumRes = ausBase64(nat.baumRes, n); this.felsRes = ausBase64(nat.felsRes, n);
    this.jungReif.fill(0);
    for (let i = 0; i + 1 < nat.jungReif.length; i += 2) this.jungReif[nat.jungReif[i]] = nat.jungReif[i + 1];
    this.jungListe = nat.jungListe;
    this.felsArtKopie = this.felsArt.slice();
    this.log = st.log; this.ausstehend = st.ausstehend; this.stat = st.stat;
    // Abgeleitetes neu
    this.hexFahne.fill(0); this.hexGeb.fill(0); this.hexWeg.fill(0);
    for (const f of this.fahnen.values()) this.hexFahne[f.h] = f.id;
    for (const g of this.gebaeude.values()) this.hexGeb[g.h] = g.id;
    for (const s of this.segmente.values()) for (let i = 1; i < s.pfad.length - 1; i++) this.hexWeg[s.pfad[i]] = s.id;
    this.natCache = null; this.natHash = null;
    this.netzGeaendert();
    this.jahrTick();
    // M10: Gebiet, Orte, Lieferungen und Ende; Spielstände von vor M10 behalten das Gebiet, das der Konstruktor gerechnet hat
    const ge = st.gebiet;
    if (ge) {
      const b = ausBase64(ge.besitz, n);
      for (let i = 0; i < n; i++) this.besitz[i] = b[i] - 1;
      this.besitzRev = ge.rev | 0; this.besitzHash = null; this.gebietCache = null;
      if (Array.isArray(ge.orte) && ge.orte.length === this.orte.length) this.ortBesitz = ge.orte.slice();
      this.lieferungen = (ge.lieferungen ?? []) as unknown as Lieferung[];
      this.ende = ge.ende ?? null;
    } else this.gebietNeu();
  }

  /**
   * Führt einen Befehl von Spieler `sp` aus. Befehle eines unbekannten Spielers und solche, die fremde Fahnen, Wege oder Gebäude
   * betreffen, sind wirkungslos. Führt der Verwalter das Dorf, gilt nur noch der Verwalter-Befehl.
   */
  private fuehreAus(b: Befehl, sp: number): void {
    const k = this.karte;
    if (!Number.isInteger(sp) || sp < 0 || sp >= this.doerfer.length || !b || typeof b !== 'object') return;
    if (b.art === 'verwalter') {
      const d = Number.isInteger(b.spieler) ? this.doerfer[b.spieler] : undefined;
      if (d) d.verwalter = b.an ? 1 : 0;
      return;
    }
    if (this.doerfer[sp].verwalter) return;
    switch (b.art) {
      case 'fahne': { const h = k.index(b.q, b.r); if (h >= 0 && this.hexKannFahne(h, sp)) this.fahneSetzen(h, sp); break; }
      case 'weg': {
        if (!Array.isArray(b.pfad)) break;
        this.wegBauen(b.pfad.map((p) => k.index(p.q, p.r)), sp);
        break;
      }
      case 'gebaeude': {
        const h = k.index(b.q, b.r);
        if (h >= 0 && this.hexKannBauen(b.typ, h, sp)) this.gebaeudeErzeugen(b.typ, h, false, sp);
        break;
      }
      case 'abriss_fahne': if (this.fahnen.get(b.id)?.sp === sp) this.fahneAbreissen(b.id); break;
      case 'abriss_weg': if (this.segmente.get(b.id)?.sp === sp) this.segmentEntfernen(b.id, 0); break;
      case 'abriss_gebaeude': if (this.gebaeude.get(b.id)?.sp === sp) this.gebaeudeAbreissen(b.id); break;
      case 'arbeitsbereich': {
        const g = this.gebaeude.get(b.id);
        if (!g || g.sp !== sp || !(GEBAEUDE[g.typ].radius > 0) || !Number.isInteger(b.q) || !Number.isInteger(b.r)) break;
        const m = k.index(b.q, b.r);
        if (m < 0 || !k.begehbar[m] || k.abstand(g.h, m) > ARBEIT_MITTE_MAX) break;
        g.mitte = m === g.h ? -1 : m;
        break;
      }
      case 'prioritaet': {
        const g = this.gebaeude.get(b.id);
        if (g && g.sp === sp && !g.fertig && Number.isInteger(b.stufe) && b.stufe >= PRIO_MIN && b.stufe <= PRIO_MAX) g.prio = b.stufe;
        break;
      }
      case 'verteilung': {
        const r = b.reihe;
        if (!Number.isInteger(b.ware) || b.ware < 0 || b.ware >= WAREN.length || !Array.isArray(r) || r.length !== ABNEHMER_ZAHL) break;
        const gesehen = new Set<number>();
        for (const x of r) if (Number.isInteger(x) && x >= 0 && x < ABNEHMER_ZAHL) gesehen.add(x);
        if (gesehen.size !== ABNEHMER_ZAHL) break;
        for (let i = 0; i < ABNEHMER_ZAHL; i++) this.doerfer[sp].vert[b.ware * ABNEHMER_ZAHL + i] = r[i];
        break;
      }
      case 'ruhen': {
        const g = this.gebaeude.get(b.id);
        if (g && g.sp === sp && GEBAEUDE[g.typ].pausierbar && typeof b.an === 'boolean') g.ruht = b.an ? 1 : 0;
        break;
      }
      case 'lagerregel': {
        const g = this.gebaeude.get(b.id);
        if (!g || g.sp !== sp || GEBAEUDE[g.typ].funktion !== 'lager' || !Number.isInteger(b.ware) || b.ware < 0 || b.ware >= WAREN.length) break;
        if (!Number.isInteger(b.regel) || b.regel < 0 || b.regel > 2) break;
        g.regel[b.ware] = b.regel;
        break;
      }
      case 'einstand': this.einstandSchicken(sp, b.ort); break;
      case 'handel': this.handelSchicken(sp, b.posten, b.tausch, b.mal); break;
      case 'bauleute': {
        const ok = (x: unknown) => Number.isInteger(x) && (x as number) >= 0 && (x as number) <= BAULEUTE_MAX;
        if (!ok(b.bauarbeiter) || !ok(b.planierer)) break;
        this.doerfer[sp].bauSoll = b.bauarbeiter; this.doerfer[sp].planSoll = b.planierer;
        break;
      }
    }
  }

  // ------------------------------------------------------------------ Abfragen für die Oberfläche

  kannFahne(q: number, r: number, sp = 0): boolean {
    const h = this.karte.index(q, r);
    return h >= 0 && this.hexKannFahne(h, sp);
  }

  /** Gebäude des eigenen Völkchens, die auf dieser Karte nirgends gehen (kein Wasser, kein Moor). Nur lesen, für eine Warnung beim Start. */
  fehltAufKarte(sp = 0): string[] {
    if (!this.doerfer[sp]) return [];
    const k = this.karte, id = this.vkVon(sp).id;
    let wasser = false, moor = false;
    for (let h = 0; h < k.terrain.length; h++) {
      if (!k.begehbar[h] || (k.flags[h] & (FLAG.fluss | FLAG.ufer))) wasser = true;
      if (k.terrain[h] === 4) moor = true;
    }
    return Object.values(GEBAEUDE).filter((t) => t.voelkchen.includes(id) && ((t.amWasser && !wasser) || (t.amMoor && !moor))).map((t) => t.id);
  }

  kannBauen(typ: string, q: number, r: number, sp = 0): boolean {
    const h = this.karte.index(q, r);
    return h >= 0 && this.hexKannBauen(typ, h, sp);
  }

  /** Größter Bauplatz, der hier jetzt ginge (0 keiner … 3 groß): Gelände, Belegung (Gebäude, Fahne, Weg) und Nachbarregel. */
  bauplatzGroesse(q: number, r: number): 0 | 1 | 2 | 3 {
    const h = this.karte.index(q, r);
    if (h < 0 || !this.hexFrei(h)) return 0;
    return this.karte.bebaubar[h] as 0 | 1 | 2 | 3;
  }

  /** Baukosten eines Gebäudetyps je Warenart (Kopie; leer bei unbekanntem Typ). */
  kosten(typ: string): number[] {
    const t = typVon(typ);
    return t ? t.kosten.slice() : [];
  }

  /**
   * Hexe im Arbeitsradius eines Holzfällers (ausgewachsene Bäume), Steinbruchs (Fels-Einheiten) oder Försters (freie Pflanzplätze)
   * für die Bauvorschau; (q, r) ist das Gebäude, `mitte` der Arbeitsmittelpunkt (ohne: das Gebäude). n = Menge je Hex, gut = im
   * inneren Ring (Abstand zum Mittelpunkt ≤ radiusGut), summe = Gesamtmenge. art 'keine' bei anderen Typen. Rechnet höchstens ~60 Hexe.
   */
  arbeitsHexe(typ: string, q: number, r: number, mitte?: { q: number; r: number }): { art: 'baum' | 'fels' | 'platz' | 'keine'; hexe: { q: number; r: number; n: number; gut: boolean }[]; summe: number } {
    const t = typVon(typ), geb = this.karte.index(q, r);
    const art = t?.funktion === 'holzfaeller' ? 'baum' : t?.funktion === 'steinbruch' ? 'fels' : t?.funktion === 'foerster' ? 'platz' : 'keine';
    const aus: { q: number; r: number; n: number; gut: boolean }[] = [];
    let summe = 0;
    if (!t || art === 'keine' || geb < 0) return { art, hexe: aus, summe };
    const m = mitte ? this.karte.index(mitte.q, mitte.r) : -1;
    const c = m >= 0 ? m : geb;
    for (const x of this.hexeImRadius(c, t.radius, c !== geb)) {
      if (x === geb) continue;
      const n = art === 'baum' ? this.baum[x] : art === 'fels' ? this.fels[x] : this.pflanzbar(x) ? TREE_MAX - this.baum[x] - this.jung[x] : 0;
      if (n > 0) { aus.push({ q: this.karte.qs[x], r: this.karte.rs[x], n, gut: this.karte.abstand(c, x) <= t.radiusGut }); summe += n; }
    }
    return { art, hexe: aus, summe };
  }

  /**
   * Pfad von einer bestehenden Fahne zu einem Ziel-Hex (Fahne, freier Hex oder Weg-Hex). Nicht durch Gebäude, Fahnen oder Wege
   * außer am Ziel. Höchstens WEG_MAX_SCHRITTE Schritte; null, wenn es keinen gibt.
   */
  wegVorschau(von: { q: number; r: number }, nach: { q: number; r: number }, sp = 0): { q: number; r: number }[] | null {
    const k = this.karte;
    const a = k.index(von.q, von.r), z = k.index(nach.q, nach.r);
    if (a < 0 || z < 0 || a === z || !k.begehbar[a] || !k.begehbar[z]) return null;
    const fa = this.fahnen.get(this.hexFahne[a]);
    if (!fa || fa.sp !== sp || fa.segmente.length >= FAHNE_MAX_SEGMENTE) return null;
    if (!this.zielFahneOk(z, sp)) return null;
    const p = sucheWeg(k, a, z, (h, istZiel) => {
      if (istZiel) return true;
      return !this.hexFahne[h] && !this.hexGeb[h] && !this.hexWeg[h] && !this.fremdesLand(h, sp);
    }, WEG_MAX_SCHRITTE);
    return p ? p.map((h) => ({ q: k.qs[h], r: k.rs[h] })) : null;
  }

  /**
   * Teilstück eines selbst geführten Wegs: Pfad von `von` (muss keine Fahne tragen) nach `nach` (Fahne, Weg-Hex oder freier Hex,
   * der eine Fahne tragen kann). Zwischen den Enden nur freie Hexe, Hexe aus `belegt` (schon benutzte Hexe des offenen Wegs)
   * sind gesperrt, das Ziel darf nicht darunter sein. Höchstens `maxSchritte` Schritte; null, wenn es keinen gibt.
   */
  wegAbschnitt(von: { q: number; r: number }, nach: { q: number; r: number }, belegt: { q: number; r: number }[], maxSchritte: number, sp = 0): { q: number; r: number }[] | null {
    const k = this.karte;
    const a = k.index(von.q, von.r), z = k.index(nach.q, nach.r);
    if (a < 0 || z < 0 || a === z || !k.begehbar[a] || !k.begehbar[z] || maxSchritte < 1) return null;
    const gesperrt = new Set<number>();
    for (const b of belegt) { const i = k.index(b.q, b.r); if (i >= 0) gesperrt.add(i); }
    gesperrt.delete(a);
    if (gesperrt.has(z)) return null;
    const fa = this.fahnen.get(this.hexFahne[a]);
    if (fa && (fa.sp !== sp || fa.segmente.length >= FAHNE_MAX_SEGMENTE)) return null;
    if (!this.zielFahneOk(z, sp)) return null;
    const p = sucheWeg(k, a, z, (h, istZiel) => {
      if (istZiel) return true;
      return !this.hexFahne[h] && !this.hexGeb[h] && !this.hexWeg[h] && !gesperrt.has(h) && !this.fremdesLand(h, sp);
    }, Math.min(maxSchritte, WEG_MAX_SCHRITTE));
    return p ? p.map((h) => ({ q: k.qs[h], r: k.rs[h] })) : null;
  }

  /** Sicht für Spieler `ich`: die ganze Welt, dazu Dorf, freie Bewohner und Ereignisse dieses Spielers. */
  sicht(ich = 0): SimSicht {
    const k = this.karte;
    const dorf = this.doerfer[ich];
    if (!dorf) throw new Error(`Spieler ${ich} gibt es nicht`);
    const hx = (h: number) => ({ q: k.qs[h], r: k.rs[h] });
    const tr = [...this.traeger.values()].map((t) => {
      const s = this.segmente.get(t.seg)!;
      let von: number, nach: number, tut: 'wartet' | 'laeuft' | 'uebergibt' = 'laeuft';
      if (t.phase === 0) { von = t.route[t.ri]; nach = t.route[Math.min(t.ri + 1, t.route.length - 1)]; }
      else if (t.phase === 2) { von = s.pfad[t.pos]; nach = s.pfad[t.pos + t.dir]; }
      else { von = nach = t.ende === 0 ? s.pfad[0] : s.pfad[s.pfad.length - 1]; tut = 'wartet'; }
      if (t.pause > 0) tut = 'uebergibt';
      const bewegt = von !== nach && t.dauer > 0;
      return {
        id: t.id, sp: t.sp, von: hx(von), nach: hx(nach),
        fortschritt: bewegt ? Math.floor((PROMILLE * t.t) / t.dauer) : 0,
        schritt: bewegt ? Math.max(1, Math.floor(PROMILLE / t.dauer)) : 0,
        ware: t.art, tut,
      };
    });
    return {
      tick: this._tick,
      ich,
      spieler: this.doerfer.map((d, sp) => ({
        stufe: d.stufe, bewohner: d.bewohner, festPunkte: d.festPunkte, verwalter: d.verwalter === 1,
        punkte: this.punkte(sp), hexe: this.hexeVon(sp), orte: this.ortBesitz.filter((b) => b === sp).length, koenig: d.koenig === 1,
        voelkchen: this.vkVon(sp).id,
      })),
      fahnen: [...this.fahnen.values()].map((f) => ({ id: f.id, sp: f.sp, ...hx(f.h), waren: f.waren.map((w) => w.art), ziele: f.waren.map((w) => w.ziel), gebaeude: f.gebaeude })),
      segmente: [...this.segmente.values()].map((s) => ({ id: s.id, sp: s.sp, a: s.a, b: s.b, pfad: s.pfad.map(hx), traeger: s.traeger, verkehr: s.verkehr })),
      traeger: tr,
      gebaeude: [...this.gebaeude.values()].map((g) => {
        const t = GEBAEUDE[g.typ];
        const o: SimSicht['gebaeude'][number] = {
          id: g.id, sp: g.sp, typ: g.typ, ...hx(g.h), fahne: g.fahne,
          bau: this.bauStand(g, t),
          getrennt: g.getrennt, prioritaet: g.prio, ruht: g.ruht === 1, erzeugt: g.erzeugt, zustand: this.zustandVon(g, t),
        };
        if (istLager(g)) { o.vorrat = g.vorrat.slice(); o.regel = g.regel.slice(); }
        if (t.funktion === 'schaenke') o.boten = this.botenVon(g.id);
        if (!g.fertig) {
          o.bedarf = this.kostenVon(g).map((n, a) => Math.max(0, n - g.verbaut[a]));
          o.stapel = g.stapel.map((n, a) => n + (g.haende === a ? 1 : 0));
          if (g.planSoll > 0) o.planiert = Math.min(PROMILLE, Math.floor((PROMILLE * g.planIst) / g.planSoll));
        }
        if (this.hatEingang(t)) o.puffer = g.puffer.slice();
        if (t.ausgangMax > 0) o.ausgang = g.ausgang.slice();
        const ar = this.arbeiterSicht(g, t);
        if (ar) o.arbeiter = ar;
        if (g.mitte >= 0) o.mitte = hx(g.mitte);
        if (t.funktion === 'finder') {
          const zn = g.zh >= FI_SPIELER ? `Dorf ${g.zh - FI_SPIELER + 1}` : g.zh >= 0 && this.posten[g.zh] ? STAEDTE[this.posten[g.zh].stadt].name : '';
          o.finder = { tut: g.ph === FI_UNTERWEGS ? 'unterwegs' : g.ph === FI_AUSREDE ? 'ausrede' : 'bereit', bis: g.pt, ausrede: g.pd, ziel: zn };
        }
        return o;
      }),
      freieTraeger: dorf.frei,
      natur: this.naturSicht(),
      bauleute: [...this.bauleute.values()].map((b) => this.baumannSicht(b)),
      dorf: this.dorfSicht(ich),
      ereignisse: dorf.ereignisse.map((e) => ({ ...e })),
      jahr: this.jahrSicht(),
      boten: [...this.boten.values()].map((b) => this.boteSicht(b)),
      liegend: this.liegend.map((x) => ({ q: k.qs[x.h], r: k.rs[x.h], ware: x.art, sp: x.sp })),
      gebiet: this.gebietSicht(),
      orte: this.orte.map((o, i) => {
        const g = ORT_GROESSEN[o.groesse];
        const l = this.lieferungen.find((x) => x.art === 0 && x.sp === ich && x.ziel === i);
        return {
          nr: o.nr, ...hx(o.h), groesse: o.groesse, besitzer: this.ortBesitz[i], wunsch: o.wunsch.slice(),
          erreicht: this.erreicht(ich, o.h), unterwegs: l ? l.ankunft : 0, bewohner: g.bewohner, punkte: g.punkte, fundkiste: g.fundkiste.slice(),
        };
      }),
      posten: this.posten.map((p, i) => ({
        stadt: STAEDTE[p.stadt].name, ...hx(p.h), km: p.km, erreicht: this.erreicht(ich, p.h),
        unterwegs: this.lieferungen.filter((x) => x.art === 1 && x.sp === ich && x.ziel === i).map((x) => x.ankunft),
        handel: HANDEL.map((h) => ({ gib: this.handelGib(ich, h.gib), nimm: this.handelNimm(ich, h.nimm) })),
      })),
      regeln: { gebiet: this.regeln.gebiet === 1, ziel: this.regeln.ziel, zielPunkte: zielPunkte(this.regeln) },
      ende: this.ende ? { ...this.ende } : null,
    };
  }

  private gebietSicht(): SichtGebiet {
    if (!this.gebietCache || this.gebietCache.rev !== this.besitzRev) this.gebietCache = { rev: this.besitzRev, besitz: this.besitz.slice() };
    return this.gebietCache;
  }

  private jahrSicht(): SichtJahr {
    const t = this._tick;
    return {
      jahr: jahrVon(t), jahreszeit: jahreszeitVon(t), rest: JAHRESZEIT_TICKS - inJahreszeit(t),
      wetter: this.kalender.aktiv(t).map((e) => ({ art: e.art, bis: e.ende, feld: e.feld })),
      kommt: this.kalender.kommend(t).filter((e) => e.start > t && e.start - WETTER_ANKUENDIGUNG <= t).map((e) => ({ art: e.art, ab: e.start, feld: e.feld })),
    };
  }

  private boteSicht(b: Bote): SichtBote {
    const k = this.karte;
    const hx = (h: number) => ({ q: k.qs[h], r: k.rs[h] });
    const rest = b.bis - this._tick;
    const pegel = rest > (2 * BOTE_TICKS) / 3 ? 3 : rest > BOTE_TICKS / 3 ? 2 : 1;
    const ware = b.phase === BO_BRINGT || b.phase === BO_HEIM ? b.art : -1;
    if (b.ri + 1 < b.route.length) {
      return {
        id: b.id, sp: b.sp, von: hx(b.route[b.ri]), nach: hx(b.route[b.ri + 1]), ware, tut: 'geht', pegel,
        fortschritt: b.dauer > 0 ? Math.min(PROMILLE - 1, Math.floor((PROMILLE * b.t) / b.dauer)) : 0,
        schritt: b.dauer > 0 ? Math.max(1, Math.floor(PROMILLE / b.dauer)) : 0,
      };
    }
    const h = hx(b.route[b.route.length - 1]);
    return { id: b.id, sp: b.sp, von: h, nach: h, ware, tut: 'wartet', pegel, fortschritt: 0, schritt: 0 };
  }

  private baumannSicht(b: Baumann): SichtBaumann {
    const k = this.karte;
    const hx = (h: number) => ({ q: k.qs[h], r: k.rs[h] });
    const beruf = b.beruf === 0 ? 'bauarbeiter' : 'planierer';
    if (b.phase === BM_GEHT && b.ri + 1 < b.route.length) {
      return {
        id: b.id, sp: b.sp, beruf, von: hx(b.route[b.ri]), nach: hx(b.route[b.ri + 1]), ziel: b.ziel, tut: 'geht',
        fortschritt: b.dauer > 0 ? Math.min(PROMILLE - 1, Math.floor((PROMILLE * b.t) / b.dauer)) : 0,
        schritt: b.dauer > 0 ? Math.max(1, Math.floor(PROMILLE / b.dauer)) : 0,
      };
    }
    const h = hx(b.route[b.route.length - 1]);
    return { id: b.id, sp: b.sp, beruf, von: h, nach: h, ziel: b.ziel, tut: b.phase === BM_ARBEIT ? 'arbeitet' : 'wartet', fortschritt: 0, schritt: 0 };
  }

  private dorfSicht(sp: number): SimSicht['dorf'] {
    const d = this.doerfer[sp];
    let arbeiter = 0, wohnraum = 0, traeger = 0;
    for (const g of this.gebaeude.values()) if (g.sp === sp) { arbeiter += g.ar; if (g.fertig) wohnraum += GEBAEUDE[g.typ].wohnraum; }
    for (const t of this.traeger.values()) if (t.sp === sp) traeger++;
    const ks = this.kirmesVon(d)[d.stufe];
    const platz = this.kirmesPlatz(sp);
    const da = platz && platz.fertig ? platz.puffer : new Array<number>(WAREN.length).fill(0);
    let misch = 0;
    if (ks) for (let a = 0; a < WAREN.length; a++) if (MISCHKORB[a]) misch += Math.max(0, da[a] - ks.liste[a]);
    const fnr = d.kfest > 0 ? d.kfestNr : this.festJetzt(d);
    const kv = this.kirmesJetzt(d);
    return {
      stufe: d.stufe, bewohner: d.bewohner, frei: d.frei, traeger, arbeiter, wohnraum,
      bauarbeiter: { gesamt: d.bauGesamt, frei: d.bauFrei }, planierer: { gesamt: d.planGesamt, frei: d.planFrei },
      kirmes: ks ? {
        liste: ks.liste.slice(), geliefert: da.slice(),
        platz: platz ? platz.id : 0, fest: d.fest, festDauer: ks.festTicks, mischkorb: { soll: ks.mischkorb, da: Math.min(ks.mischkorb, misch) },
      } : null,
      fest: fnr >= 0 ? {
        nr: fnr, liste: KLEINE_FESTE[fnr].liste.slice(), laeuft: d.kfest,
        geliefert: KLEINE_FESTE[fnr].liste.map((n, a) => Math.max(0, Math.min(n, da[a] - (kv ? kv.liste[a] : 0)))),
      } : null,
      festPunkte: d.festPunkte, friert: d.friert === 1, bauSoll: d.bauSoll, planSoll: d.planSoll,
      notnagel: this.notnagelGreift(sp) ? NOTNAGEL_TICKS - d.notnagelT : -1,
      verteilung: WAREN.map((_, a) => d.vert.slice(a * ABNEHMER_ZAHL, (a + 1) * ABNEHMER_ZAHL)),
      erzeugt: d.erzeugt.slice(),
      schuetzen: this.schuetzenSicht(sp),
      koenig: d.koenig === 1,
      voelkchen: this.vkVon(sp).id,
    };
  }

  private schuetzenSicht(sp: number): SichtDorf['schuetzen'] {
    const g = this.schuetzenhaus(sp);
    if (!g) return null;
    const d = this.doerfer[sp];
    return {
      liste: SCHUETZEN_LISTE.slice(), geliefert: SCHUETZEN_LISTE.map((n, a) => Math.min(n, g.puffer[a])),
      gefeiert: d.schuetzenJahr === jahrVon(this._tick), fest: d.sfest, schuss: d.schuss,
    };
  }

  /** Bäume und Felsen als Kopie; wird nur bei Änderung (rev) neu angelegt. */
  private naturSicht(): SichtNatur {
    if (!this.natCache || this.natCache.rev !== this.natRev) {
      this.natCache = { rev: this.natRev, baum: this.baum.slice(), jung: this.jung.slice(), stufe: this.stufe.slice(), fels: this.fels.slice(), felsArt: this.felsArtKopie, start: this.baumStartKopie };
    }
    return this.natCache;
  }

  private bauStand(g: Gebaeude, _t: GebaeudeTyp): number {
    const kosten = this.kostenVon(g), summeK = summe(kosten);
    if (g.fertig || summeK === 0) return PROMILLE;
    let v = 0;
    for (let a = 0; a < g.verbaut.length; a++) v += Math.min(g.verbaut[a], kosten[a]);
    return Math.min(PROMILLE - 1, Math.floor((PROMILLE * v) / summeK));
  }

  private zustandVon(g: Gebaeude, t: GebaeudeTyp): GebaeudeZustand {
    if (istLager(g)) return 'bereit';
    if (g.getrennt) return 'getrennt';
    if (!g.fertig) {
      if (g.planIst < g.planSoll) return g.planierer ? 'planieren' : 'kein_planierer';
      if (g.bauer) return 'baustelle';
      if (summe(g.stapel) > 0) return 'kein_bauarbeiter';
      return summe(g.incoming) > 0 ? 'baustelle' : 'wartet_material';
    }
    if (this.fremd(g)) return 'fremd';
    if (t.funktion === 'finder' && g.ph === FI_AUSREDE) return 'ausrede';
    if (g.ruht && !g.arbeit && (t.radius === 0 || g.ph === PH_SUCHE)) return 'ruht';
    if (t.funktion === 'wohnen') {
      if (g.arbeit) return 'arbeitet';
      if (!this.nahrungIn(g)) return 'hunger';
      return 'wohnraum_voll';
    }
    if (t.funktion === 'kirmes') {
      const d = this.doerfer[g.sp];
      if (d.fest > 0 || d.kfest > 0) return 'fest';
      return this.kirmesVon(d)[d.stufe] || this.festJetzt(d) >= 0 ? 'wartet_material' : 'bereit';
    }
    if (t.funktion === 'schuetzen') {
      const d = this.doerfer[g.sp];
      if (d.sfest > 0) return 'fest';
      return d.schuetzenJahr === jahrVon(this._tick) ? 'bereit' : 'wartet_material';
    }
    if (t.funktion === 'hecke') return this.heckeGross(g) ? 'bereit' : 'waechst';
    if (t.funktion === 'fonds') return g.ausgang[t.ausgangWare] + t.fondsMenge > t.ausgangMax ? 'voll' : this.dorfArm(g.sp) ? 'arbeitet' : 'bereit';
    if (t.arbeiter && this.festPause(g.sp)) return 'fest';
    if (t.funktion === 'zier' || (t.funktion === 'wache' && !t.arbeiter) || t.funktion === 'schnellweg') return 'bereit';
    if (t.arbeiter && !g.ar) return t.werkzeug && this.doerfer[g.sp].frei > 0 ? 'kein_werkzeug' : 'kein_arbeiter';
    if (t.funktion === 'wache') return 'arbeitet';
    if (t.funktion === 'finder') return g.ph === FI_UNTERWEGS ? 'arbeitet' : 'bereit';
    const still = this.stillstand(g, t);
    if (still && !g.ruht) return still;
    if (t.funktion === 'schaenke') {
      if (this.botenVon(g.id) > 0) return 'arbeitet';
      return g.puffer[WARE.schnaps] > 0 ? 'bereit' : 'wartet_material';
    }
    if (t.funktion === 'verarbeiter') {
      if (g.arbeit) return 'arbeitet';
      if (g.ausgang[t.ausgangWare] >= t.ausgangMax) return 'voll';
      return this.zutatenDa(g, t) ? 'arbeitet' : 'wartet_material';
    }
    if (t.funktion === 'erzeuger') return g.ausgang[t.ausgangWare] >= t.ausgangMax ? 'voll' : 'arbeitet';
    if (g.ph === PH_SUCHE) {
      if (t.ausgangMax > 0 && g.ausgang[t.ausgangWare] >= t.ausgangMax) return 'voll';
      if (g.leer) return t.funktion === 'holzfaeller' ? 'kein_baum' : t.funktion === 'steinbruch' ? 'kein_fels' : 'kein_platz';
    }
    return 'arbeitet';
  }

  private arbeiterSicht(g: Gebaeude, t: GebaeudeTyp): SichtArbeiter | undefined {
    if (!g.fertig || !g.ar || t.radius === 0) return undefined;
    const k = this.karte;
    const hx = (h: number) => ({ q: k.qs[h], r: k.rs[h] });
    const heim = hx(g.h);
    const ziel = g.zh >= 0 && g.ph !== PH_SUCHE && g.ph !== PH_RUHE ? hx(g.zh) : null;
    const prom = (t0: number, d: number) => (d > 0 ? Math.min(PROMILLE - 1, Math.floor((PROMILLE * t0) / d)) : 0);
    const schr = (d: number) => (d > 0 ? Math.max(1, Math.floor(PROMILLE / d)) : 0);
    switch (g.ph) {
      case PH_HIN:
        return { von: hx(g.weg[g.wi]), nach: hx(g.weg[g.wi + 1]), fortschritt: prom(g.pt, g.pd), schritt: schr(g.pd), tut: 'geht', ziel, ware: -1 };
      case PH_ARBEIT:
        return { von: hx(g.zh), nach: hx(g.zh), fortschritt: prom(g.pt, g.pd), schritt: schr(g.pd), tut: 'arbeitet', ziel, ware: -1 };
      case PH_ZURUECK:
        return {
          von: hx(g.weg[g.wi]), nach: hx(g.weg[g.wi - 1]), fortschritt: prom(g.pt, g.pd), schritt: schr(g.pd),
          tut: g.traegt >= 0 ? 'traegt' : 'geht', ziel, ware: g.traegt,
        };
      default:
        return { von: heim, nach: heim, fortschritt: 0, schritt: 0, tut: 'ruht', ziel: null, ware: -1 };
    }
  }

  /**
   * Zähler für Tests und Statistik: angekommene Waren (im Lager, Puffer oder verbaut), verbrauchte (M5), erzeugte (in einen
   * Output-Puffer gelegt), verbaute, längste Wartezeit mit Ware (Ticks); erzeugtJe = erzeugte Waren je Warenart.
   */
  statistik(): { angekommen: number; verbraucht: number; erzeugt: number; maxWarte: number; verbaut: number; erzeugtJe: number[] } {
    return { ...this.stat, erzeugtJe: this.erzeugtJe.slice() };
  }

  /** Prüft innere Widersprüche (Reservierungen, Hex-Belegung, Verweise); leer = in Ordnung. */
  pruefeInnenzustand(): string[] {
    const fehler: string[] = [];
    const inc = new Map<string, number>();
    const zaehle = (w: Ware) => { if (w.ziel) { const key = `${w.ziel}:${w.art}`; inc.set(key, (inc.get(key) ?? 0) + 1); } };
    for (const f of this.fahnen.values()) {
      for (const w of f.waren) zaehle(w);
      if (f.waren.length > FLAG_CAP + NOTPLAETZE) fehler.push(`Fahne ${f.id} überfüllt`);
      if (this.hexFahne[f.h] !== f.id) fehler.push(`Fahne ${f.id}: Hex-Belegung`);
      for (const s of f.segmente) if (!this.segmente.has(s)) fehler.push(`Fahne ${f.id}: Segment ${s} fehlt`);
    }
    for (const b of this.boten.values()) if (b.art >= 0 && b.ziel && (b.phase === BO_HOLT || b.phase === BO_BRINGT)) zaehle({ art: b.art, ziel: b.ziel });
    for (const t of this.traeger.values()) {
      if (t.art >= 0) zaehle({ art: t.art, ziel: t.ziel });
      const s = this.segmente.get(t.seg);
      if (!s || s.traeger !== t.id) fehler.push(`Träger ${t.id}: Segment ${t.seg}`);
    }
    const arbeiter = this.doerfer.map(() => 0), traegerJe = this.doerfer.map(() => 0);
    for (const t of this.traeger.values()) {
      traegerJe[t.sp]++;
      if (this.segmente.get(t.seg)?.sp !== t.sp) fehler.push(`Träger ${t.id}: Segment eines anderen Spielers`);
    }
    const bRes = new Map<number, number>(), fRes = new Map<number, number>();
    for (const g of this.gebaeude.values()) {
      const t = GEBAEUDE[g.typ];
      for (let a = 0; a < WAREN.length; a++) {
        const soll = inc.get(`${g.id}:${a}`) ?? 0;
        if (g.incoming[a] !== soll) fehler.push(`Gebäude ${g.id} incoming[${a}] ${g.incoming[a]} statt ${soll}`);
        if (g.verbaut[a] + g.stapel[a] + (g.haende === a ? 1 : 0) > this.kostenVon(g)[a]) fehler.push(`Gebäude ${g.id}: mehr verbaut/angeliefert als nötig (Ware ${a})`);
        if (g.fertig && g.verbaut[a] < this.kostenVon(g)[a]) fehler.push(`Gebäude ${g.id}: fertig ohne volles Material (Ware ${a})`);
        if (!istLager(g) && t.funktion !== 'kirmes' && g.puffer[a] > this.pufferMax(g, t, a)) fehler.push(`Gebäude ${g.id}: Input-Puffer ${a} über Maximum`);
        if (g.ausgang[a] > (a === t.ausgangWare ? t.ausgangMax : 0)) fehler.push(`Gebäude ${g.id}: Output-Puffer ${a} über Maximum`);
      }
      arbeiter[g.sp] += g.ar;
      if (this.fahnen.get(g.fahne)?.sp !== g.sp) fehler.push(`Gebäude ${g.id}: Fahne eines anderen Spielers`);
      if (g.ar && !t.arbeiter) fehler.push(`Gebäude ${g.id}: Arbeiter ohne Bedarf`);
      if (g.ar && g.zh >= 0 && (g.ph === PH_HIN || g.ph === PH_ARBEIT)) {
        if (t.funktion === 'holzfaeller') bRes.set(g.zh, (bRes.get(g.zh) ?? 0) + 1);
        if (t.funktion === 'steinbruch') fRes.set(g.zh, (fRes.get(g.zh) ?? 0) + 1);
      }
      if (g.prio < PRIO_MIN || g.prio > PRIO_MAX) fehler.push(`Gebäude ${g.id}: Priorität ${g.prio}`);
      if (t.nahrungPlaetze && summe(g.puffer) > t.nahrungPlaetze) fehler.push(`Gebäude ${g.id}: zu viel Essen`);
      if (g.bauer && this.bauleute.get(g.bauer)?.ziel !== g.id) fehler.push(`Gebäude ${g.id}: Bauarbeiter ${g.bauer}`);
      if (g.planierer && this.bauleute.get(g.planierer)?.ziel !== g.id) fehler.push(`Gebäude ${g.id}: Planierer ${g.planierer}`);
      if (g.fertig && (g.bauer || g.planierer || summe(g.stapel) || g.haende >= 0)) fehler.push(`Gebäude ${g.id}: fertig mit Baustellenresten`);
    }
    const botenJe = this.doerfer.map(() => 0);
    for (const b of this.boten.values()) {
      botenJe[b.sp]++;
      if (b.ziel && (b.phase === BO_HOLT || b.phase === BO_BRINGT) && !this.gebaeude.has(b.ziel)) fehler.push(`Bote ${b.id}: Ziel ${b.ziel} fehlt`);
    }
    const bau = this.doerfer.map(() => 0), plan = this.doerfer.map(() => 0);
    for (const b of this.bauleute.values()) {
      if (b.beruf === 0) bau[b.sp]++; else plan[b.sp]++;
      const g = b.ziel ? this.gebaeude.get(b.ziel) : undefined;
      if (b.ziel && (!g || g.sp !== b.sp || (b.beruf === 0 ? g.bauer : g.planierer) !== b.id)) fehler.push(`Baumann ${b.id}: Ziel ${b.ziel}`);
    }
    this.doerfer.forEach((d, sp) => {
      const v = this.doerfer.length > 1 ? `Spieler ${sp}: ` : '';
      if (d.frei < 0 || d.frei + traegerJe[sp] + arbeiter[sp] + botenJe[sp] !== d.bewohner) {
        fehler.push(`${v}Bewohner: ${d.frei} frei + ${traegerJe[sp]} Träger + ${arbeiter[sp]} Arbeiter + ${botenJe[sp]} Boten statt ${d.bewohner}`);
      }
      if (d.bauFrei < 0 || d.bauFrei + bau[sp] !== d.bauGesamt) fehler.push(`${v}Bauarbeiter: ${d.bauFrei} frei + ${bau[sp]} unterwegs statt ${d.bauGesamt}`);
      for (let a = 0; a < WAREN.length; a++) {
        if (new Set(d.vert.slice(a * ABNEHMER_ZAHL, (a + 1) * ABNEHMER_ZAHL)).size !== ABNEHMER_ZAHL) fehler.push(`${v}Verteilung der Ware ${a} kaputt`);
      }
      if (d.planFrei < 0 || d.planFrei + plan[sp] !== d.planGesamt) fehler.push(`${v}Planierer: ${d.planFrei} frei + ${plan[sp]} unterwegs statt ${d.planGesamt}`);
    });
    for (const key of inc.keys()) {
      const id = Number(key.split(':')[0]);
      if (!this.gebaeude.has(id)) fehler.push(`Ware mit ungültigem Ziel ${id} (wird neu geroutet)`);
    }
    for (const s of this.segmente.values()) {
      if (!this.fahnen.has(s.a) || !this.fahnen.has(s.b)) fehler.push(`Segment ${s.id}: Fahne fehlt`);
      else if (this.fahnen.get(s.a)!.sp !== s.sp || this.fahnen.get(s.b)!.sp !== s.sp) fehler.push(`Segment ${s.id}: verbindet fremde Fahnen`);
      for (let i = 1; i < s.pfad.length - 1; i++) if (this.hexWeg[s.pfad[i]] !== s.id) fehler.push(`Segment ${s.id}: Hex-Belegung`);
      if (s.traeger && !this.traeger.has(s.traeger)) fehler.push(`Segment ${s.id}: Träger fehlt`);
    }
    for (let i = 0; i < this.karte.count; i++) {
      if ((bRes.get(i) ?? 0) !== this.baumRes[i]) fehler.push(`Hex ${i}: Baum-Reservierung ${this.baumRes[i]} statt ${bRes.get(i) ?? 0}`);
      if ((fRes.get(i) ?? 0) !== this.felsRes[i]) fehler.push(`Hex ${i}: Fels-Reservierung ${this.felsRes[i]} statt ${fRes.get(i) ?? 0}`);
      if (this.baum[i] + this.jung[i] > TREE_MAX) fehler.push(`Hex ${i}: zu viele Bäume`);
      if ((this.hexFahne[i] || this.hexGeb[i] || this.hexWeg[i]) && (this.baum[i] || this.jung[i])) fehler.push(`Hex ${i}: Bäume auf belegtem Hex`);
      let slots = 0;
      for (let j = 0; j < TREE_MAX; j++) if (this.jungReif[i * TREE_MAX + j] > 0) slots++;
      if (slots !== this.jung[i]) fehler.push(`Hex ${i}: Jungbaum-Plätze ${slots} statt ${this.jung[i]}`);
    }
    return fehler;
  }

  // ------------------------------------------------------------------ Prüfsumme

  pruefsumme(): string {
    const f = new Fnv2();
    const w = (v: number) => { v |= 0; f.byte(v); f.byte(v >>> 8); f.byte(v >>> 16); f.byte(v >>> 24); };
    const liste = (a: readonly number[]) => { w(a.length); for (const v of a) w(v); };
    w(this._tick); w(this.rng); w(this.saat); w(this.naechsteId); w(this.befehlZahl); w(this.ereignisNr);
    w(this.doerfer.length);
    for (const d of this.doerfer) {
      w(d.bewohner); w(d.frei); w(d.bauGesamt); w(d.bauFrei); w(d.planGesamt); w(d.planFrei); w(d.stufe); w(d.fest); w(d.notnagelT); w(d.verwalter);
      liste(d.vert); liste(d.erzeugt); w(d.statTakt); w(d.statNaechst); w(d.statPunkte.length);
      for (const p of d.statPunkte) liste(p);
      w(d.bauSoll); w(d.planSoll); liste(d.festJahr); w(d.kfest); w(d.kfestNr); w(d.festPunkte); w(d.friert); w(d.winterT); w(d.botenWunsch);
    }
    w(this.boten.size);
    for (const b of this.boten.values()) {
      w(b.id); w(b.sp); w(b.schaenke); w(b.bis); w(b.phase); liste(b.route); w(b.ri); w(b.t); w(b.dauer); w(b.art); w(b.ziel); w(b.lager); w(b.faellt);
    }
    w(this.liegend.length);
    for (const x of this.liegend) { w(x.h); w(x.art); w(x.sp); w(x.bis); w(x.bote); }
    w(this.stat.angekommen); w(this.stat.verbraucht); w(this.stat.erzeugt); w(this.stat.verbaut);
    liste(this.erzeugtJe);
    w(this.fahnen.size);
    for (const x of this.fahnen.values()) {
      w(x.id); w(x.sp); w(x.h); w(x.gebaeude); liste(x.segmente);
      w(x.waren.length); for (const v of x.waren) { w(v.art); w(v.ziel); }
    }
    w(this.segmente.size);
    for (const s of this.segmente.values()) { w(s.id); w(s.sp); w(s.a); w(s.b); w(s.traeger); w(s.verkehr); w(s.kab); w(s.kba); liste(s.pfad); }
    w(this.traeger.size);
    for (const t of this.traeger.values()) {
      w(t.id); w(t.sp); w(t.seg); w(t.phase); w(t.ende); w(t.pos); w(t.dir); w(t.t); w(t.dauer); w(t.pause); w(t.art); w(t.ziel); w(t.warte);
      liste(t.route); w(t.ri); liste(t.routeSegs);
    }
    w(this.gebaeude.size);
    for (const g of this.gebaeude.values()) {
      w(g.id); w(g.sp); f.text(g.typ); w(g.h); w(g.fahne); w(g.fertig); liste(g.verbaut); w(g.prio); w(g.getrennt ? 1 : 0); w(g.ruht); w(g.erzeugt);
      liste(g.puffer); liste(g.incoming); liste(g.ausgang); w(g.zeit); w(g.arbeit); liste(g.vorrat);
      w(g.ar); w(g.ph); w(g.pt); w(g.pd); w(g.wi); w(g.zh); liste(g.weg); w(g.traegt); w(g.leer); w(g.mitte);
      liste(g.stapel); w(g.haende); w(g.planSoll); w(g.planIst); w(g.bauer); w(g.planierer); liste(g.regel); liste(g.kost ?? []);
    }
    w(this.bauleute.size);
    for (const b of this.bauleute.values()) { w(b.id); w(b.sp); w(b.beruf); w(b.ziel); w(b.phase); liste(b.route); w(b.ri); w(b.t); w(b.dauer); }
    // Natur: nur bei Änderung neu gehasht
    w(this.natRev);
    if (!this.natHash || this.natHash.rev !== this.natRev) {
      const n = new Fnv2();
      for (let i = 0; i < this.karte.count; i++) { n.byte(this.baum[i]); n.byte(this.jung[i]); n.byte(this.fels[i]); n.byte(this.felsArt[i]); }
      for (let i = 0; i < this.jungReif.length; i++) {
        const v = this.jungReif[i];
        if (v) { n.byte(i); n.byte(i >>> 8); n.byte(i >>> 16); n.byte(v); n.byte(v >>> 8); n.byte(v >>> 16); }
      }
      this.natHash = { rev: this.natRev, hex: n.hex() };
    }
    f.text(this.natHash.hex);
    liste(this.jungListe);
    // M10: Regeln, Gebiet (nur bei Änderung neu gehasht), Orte, Lieferungen, Ende
    w(this.regeln.gebiet); f.text(this.regeln.ziel);
    w(this.besitzRev);
    if (!this.besitzHash || this.besitzHash.rev !== this.besitzRev) {
      const n = new Fnv2();
      for (let i = 0; i < this.besitz.length; i++) n.byte(this.besitz[i] + 1);
      this.besitzHash = { rev: this.besitzRev, hex: n.hex() };
    }
    f.text(this.besitzHash.hex);
    liste(this.ortBesitz);
    w(this.lieferungen.length);
    for (const l of this.lieferungen) { w(l.id); w(l.sp); w(l.art); w(l.ziel); w(l.ankunft); liste(l.waren); liste(l.nimm); w(l.lager); }
    w(this.ende ? this.ende.sieger : -1); w(this.ende ? this.ende.tick : -1);
    for (const d of this.doerfer) { w(d.vk); w(d.bootP); w(d.einstandP); w(d.fundP); w(d.schuetzenN); w(d.schuetzenJahr); w(d.sfest); w(d.schuss); w(d.koenig); w(d.koenigN); }
    return f.hex();
  }

  // ------------------------------------------------------------------ M11: Völkchen

  /** Regeln des Völkchens von Spieler `sp` (ohne Völkchen neutral). */
  private vkVon(sp: number): VoelkchenRegeln {
    const vk = this.doerfer[sp]?.vk ?? -1;
    return vk >= 0 ? VOELKCHEN[vk] : KEIN_VOELKCHEN;
  }

  /** Kirmes-Stufen dieses Dorfs (Marktflecken-Kirmes mit der Spezialität des Völkchens). */
  private kirmesVon(d: Dorf): typeof KIRMES {
    return KIRMES_JE_VOELKCHEN[(d.vk ?? -1) + 1] ?? KIRMES;
  }

  /** Was der Spieler beim Handel gibt (Öslinger handeln teurer: aufgerundet). */
  private handelGib(sp: number, gib: readonly number[]): number[] {
    const p = this.doerfer[sp] ? this.vkVon(sp).handel : 100;
    return gib.map((n) => (n > 0 ? Math.floor((n * p + 99) / 100) : 0));
  }

  /** Stehendes Wasser (mit `fluss` auch Fluss und Ufer) höchstens `r` Hexe von Hex `h`. */
  private wasserNah(h: number, r: number, fluss = false): boolean {
    for (const x of this.hexeImRadius(h, r)) {
      if (!this.karte.begehbar[x]) return true;
      if (fluss && (this.karte.flags[x] & (FLAG.fluss | FLAG.ufer))) return true;
    }
    return false;
  }

  /** Moor höchstens `r` Hexe von Hex `h` (Torfstich). */
  private moorNah(h: number, r: number): boolean {
    for (const x of this.hexeImRadius(h, r, true)) if (this.karte.terrain[x] === 4) return true;
    return false;
  }

  /** Arm dran (Eifelfonds zahlt): das Dorf friert, oder im Lager liegt weniger als 1 Essen je 4 Bewohner. */
  private dorfArm(sp: number): boolean {
    const d = this.doerfer[sp];
    if (!d) return false;
    if (d.friert > 0) return true;
    let essen = 0;
    for (const l of this.gebaeude.values()) {
      if (l.sp !== sp || !istLager(l) || !l.vorrat) continue;
      for (let a = 0; a < NAHRUNG.length; a++) if (NAHRUNG[a] > 0) essen += l.vorrat[a];
    }
    return essen * 4 < d.bewohner;
  }

  /** Baukosten eines Gebäudes von `sp` auf Hex `h`: Monschauer bauen auf Moor teurer, Öslinger sparen einen Stein (oder ein Brett). */
  private kostenFuer(sp: number, t: GebaeudeTyp, h: number): number[] {
    const vk = this.vkVon(sp), k = t.kosten.slice();
    if (vk.moorKosten !== 100 && this.karte.terrain[h] === 4) for (let a = 0; a < k.length; a++) k[a] = Math.floor((k[a] * vk.moorKosten + 99) / 100);
    if (vk.kostenRabatt) {
      if (k[WARE.stein] >= 2) k[WARE.stein]--;
      else if (k[WARE.bretter] >= 3) k[WARE.bretter]--;
    }
    return k;
  }

  /** Baukosten dieses Gebäudes. */
  private kostenVon(g: Gebaeude): readonly number[] {
    return g.kost ?? GEBAEUDE[g.typ].kosten;
  }

  /** Ahrtaler: Während eines Fests (Kirmes, kleines Fest, Schützenfest) ruht die Arbeit. */
  private festPause(sp: number): boolean {
    const d = this.doerfer[sp];
    return this.vkVon(sp).festPause && (d.fest > 0 || d.kfest > 0 || d.sfest > 0);
  }

  /** Eine Hecke ist herangewachsen (Monschauer schneller). */
  private heckeGross(g: Gebaeude): boolean {
    return g.fertig === 1 && g.zeit >= Math.floor((HECKE_WACHSEN * 100) / this.vkVon(g.sp).heckeWachstum);
  }

  /** Eine fertige eigene Hecke höchstens 2 Hexe vom Gebäude (Windschutz, Monschauer & Venner). */
  private heckeNah(g: Gebaeude): boolean {
    for (const x of this.gebaeude.values()) if (x.sp === g.sp && x.typ === 'hecke' && this.heckeGross(x) && this.karte.abstand(x.h, g.h) <= 2) return true;
    return false;
  }

  // ------------------------------------------------------------------ M10: Gebiet, Orte, Flachländer, Finden, Schützenfest, Punkte

  /** Gebäude steht auf fremdem Gebiet (nur mit Gebiets-Regel): es steht still, bis das Hex zurückkommt (Drehbuch 6.1). */
  private fremd(g: Gebaeude): boolean {
    return this.regeln.gebiet === 1 && this.besitz[g.h] !== g.sp;
  }

  /** Hex gehört einem anderen Spieler (nur mit Gebiets-Regel): kein Weg, keine Fahne. */
  private fremdesLand(h: number, sp: number): boolean {
    return this.regeln.gebiet === 1 && this.besitz[h] >= 0 && this.besitz[h] !== sp;
  }

  /** Erwischt-Chance (Prozent) für Finder bei Spieler `sp` (für Fenster und Tests). */
  wachsamkeitVon(sp: number): number { return this.doerfer[sp] ? this.wachsamkeit(sp) : 0; }

  /** Freies Hex nah an einem Ort oder Marktposten: dort darf eine Fahne stehen, damit ein Weg hinführen kann. */
  private amAnschluss(h: number): boolean {
    const k = this.karte;
    for (const o of this.orte) if (k.abstand(o.h, h) <= ANSCHLUSS) return true;
    for (const p of this.posten) if (k.abstand(p.h, h) <= ANSCHLUSS) return true;
    return false;
  }

  /** Spieler `sp` hat eine mit einem Lager verbundene Fahne höchstens ANSCHLUSS Hexe von Hex `h`. */
  private erreicht(sp: number, h: number): boolean {
    const verbunden = this.verbundeneFahnen();
    const k = this.karte;
    for (const f of this.fahnen.values()) if (f.sp === sp && verbunden.has(f.id) && k.abstand(f.h, h) <= ANSCHLUSS) return true;
    return false;
  }

  /**
   * Fahnen mit Wegverbindung zu einem Lager – nur lesend: Die Sicht fragt das zwischen den Ticks ab, und `getrennt` der Gebäude (Teil
   * der Prüfsumme) darf sich dadurch nicht früher ändern als im Tick selbst (sonst laufen Mehrspieler auseinander).
   */
  private verbundeneFahnen(): Set<Id> {
    if (!this.verbundenNeu) return this.verbunden;
    if (this.verbundenLesend && this.verbundenLesend.stand === this.netzStand) return this.verbundenLesend.fahnen;
    const fahnen = new Set<Id>();
    const stapel: Id[] = [];
    for (const g of this.gebaeude.values()) if (istLager(g)) { fahnen.add(g.fahne); stapel.push(g.fahne); }
    while (stapel.length) {
      const f = this.fahnen.get(stapel.pop()!)!;
      for (const sid of f.segmente) {
        const sg = this.segmente.get(sid)!;
        const o = sg.a === f.id ? sg.b : sg.a;
        if (!fahnen.has(o)) { fahnen.add(o); stapel.push(o); }
      }
    }
    this.verbundenLesend = { stand: this.netzStand, fahnen };
    return fahnen;
  }

  /**
   * Gebiet neu (Drehbuch 6.1, Einfluss): Jede Quelle strahlt mit Stärke Radius − Abstand; ein Hex gehört der stärksten, bei Gleichstand
   * der älteren (kleinere Id; Orte nach den Gebäuden). Quellen: fertige Gebäude mit Radius in GEBIET_RADIUS, die auf eigenem Gebiet
   * stehen (der Dorfkern dazu mit +1 je Dorfstufe), +VERSORGT_BONUS, solange das Dorf nicht friert, +KOENIG_BONUS für den Schützenkönig;
   * gewonnene Orte mit dem Radius ihrer Größe. Das Lager eines gewonnenen Orts strahlt nicht selbst (der Ort tut es).
   */
  private gebietNeu(): void {
    const k = this.karte, n = k.count;
    const staerke = new Int16Array(n).fill(-1), alter = new Int32Array(n).fill(0x7fffffff), neu = new Int8Array(n).fill(-1);
    const quelle = (h: number, r: number, sp: number, alt: number) => {
      for (const x of this.hexeImRadius(h, r, true)) {
        const st = r - k.abstand(h, x);
        if (st > staerke[x] || (st === staerke[x] && alt < alter[x])) { staerke[x] = st; alter[x] = alt; neu[x] = sp; }
      }
    };
    const bonus = (sp: number) => (this.doerfer[sp].friert ? 0 : VERSORGT_BONUS) + (this.doerfer[sp].koenig ? KOENIG_BONUS : 0);
    for (const g of this.gebaeude.values()) {
      const r0 = GEBIET_RADIUS[g.typ] ?? 0;
      if (!r0 || !g.fertig) continue;
      if (this.besitz[g.h] >= 0 && this.besitz[g.h] !== g.sp) continue;
      const oi = this.ortVonHex[g.h];
      if (g.typ === 'lager' && oi >= 0 && !this.istStartLager(g)) continue;
      const r = r0 + bonus(g.sp) + (g.typ === 'lager' ? this.doerfer[g.sp].stufe : 0);
      quelle(g.h, r, g.sp, g.id);
    }
    this.orte.forEach((o, i) => {
      const sp = this.ortBesitz[i];
      if (sp < 0) return;
      // der Startort strahlt über sein Lager; gewonnene Orte selbst
      for (const g of this.gebaeude.values()) if (g.h === o.h && this.istStartLager(g)) return;
      quelle(o.h, ORT_GROESSEN[o.groesse].radius + bonus(sp), sp, 0x40000000 + i);
    });
    let anders = false;
    for (let i = 0; i < n; i++) if (neu[i] !== this.besitz[i]) { anders = true; break; }
    if (anders) { this.besitz = neu; this.besitzRev++; }
  }

  /** Das erste Lager eines Spielers (Startlager auf seinem Startort). */
  private istStartLager(g: Gebaeude): boolean {
    const st = this.starts[g.sp];
    return !!st && g.typ === 'lager' && this.karte.index(st.q, st.r) === g.h;
  }

  /** Gebiet von Spieler `sp` in Hexen. */
  private hexeVon(sp: number): number {
    let n = 0;
    for (let i = 0; i < this.besitz.length; i++) if (this.besitz[i] === sp) n++;
    return n;
  }

  /** Eigene fertige Lager in Id-Reihenfolge. */
  private eigeneLager(sp: number): Gebaeude[] {
    return [...this.gebaeude.values()].filter((g) => g.sp === sp && istLager(g));
  }

  /** Nimmt `waren` (je Warenart) aus den eigenen Lagern, wenn alles da ist; sonst false und nichts passiert. */
  private ausLagern(sp: number, waren: readonly number[]): boolean {
    const lager = this.eigeneLager(sp);
    for (let a = 0; a < waren.length; a++) {
      if (!waren[a]) continue;
      let da = 0;
      for (const l of lager) da += l.vorrat[a];
      if (da < waren[a]) return false;
    }
    for (let a = 0; a < waren.length; a++) {
      let rest = waren[a];
      for (const l of lager) { const x = Math.min(rest, l.vorrat[a]); l.vorrat[a] -= x; rest -= x; if (!rest) break; }
      this.stat.verbraucht += waren[a];
    }
    return true;
  }

  /** Kürzester Hex-Abstand von einem eigenen Lager zu Hex `h` (und dieses Lager). */
  private naechstesEigenesLager(sp: number, h: number): { l: Gebaeude | undefined; d: number } {
    let best: Gebaeude | undefined, bd = Infinity;
    for (const l of this.eigeneLager(sp)) { const d = this.karte.abstand(l.h, h); if (d < bd) { bd = d; best = l; } }
    return { l: best, d: best ? bd : 0 };
  }

  /** Befehl 'einstand': Wunschliste des Orts auf den Weg schicken (Drehbuch 6.2). */
  private einstandSchicken(sp: number, oi: number): void {
    const o = Number.isInteger(oi) ? this.orte[oi] : undefined;
    if (!o || this.ortBesitz[oi] >= 0 || this.ende) return;
    if (this.lieferungen.some((l) => l.art === 0 && l.sp === sp && l.ziel === oi)) return;
    if (!this.erreicht(sp, o.h)) return;
    const { d } = this.naechstesEigenesLager(sp, o.h);
    if (!this.ausLagern(sp, o.wunsch)) return;
    this.lieferungen.push({ id: this.naechsteId++, sp, art: 0, ziel: oi, ankunft: this._tick + Math.max(1, d) * ORT_LAUFZEIT_JE_HEX, waren: o.wunsch.slice(), nimm: [], lager: 0 });
  }

  /** Was der Spieler bei Tausch `nimm` bekommt: ab Marktflecken je Ware HANDEL_BESSER mehr. */
  private handelNimm(sp: number, nimm: readonly number[]): number[] {
    const besser = this.doerfer[sp] && this.doerfer[sp].stufe >= 3 ? HANDEL_BESSER : 0;
    return nimm.map((n) => (n > 0 ? n + besser : 0));
  }

  /** Befehl 'handel': Waren zum Marktposten schicken, die Gegenware kommt nach der Laufzeit (hin und zurück) ins nächste Lager. */
  private handelSchicken(sp: number, pi: number, ti: number, mal: number): void {
    const p = Number.isInteger(pi) ? this.posten[pi] : undefined;
    const h = Number.isInteger(ti) ? HANDEL[ti] : undefined;
    if (!p || !h || !Number.isInteger(mal) || mal < 1 || mal > 10) return;
    if (!this.erreicht(sp, p.h)) return;
    const gib = this.handelGib(sp, h.gib).map((n) => n * mal);
    const { l } = this.naechstesEigenesLager(sp, p.h);
    if (!l || !this.ausLagern(sp, gib)) return;
    const nimm = this.handelNimm(sp, h.nimm).map((n) => n * mal);
    this.lieferungen.push({ id: this.naechsteId++, sp, art: 1, ziel: pi, ankunft: this._tick + 2 * p.km * POSTEN_LAUFZEIT_JE_KM, waren: gib, nimm, lager: l.id });
  }

  /** Fällige Lieferungen (in Einfüge-Reihenfolge): Einstand gewinnt den Ort oder kommt zu spät; Handel bringt die Gegenware. */
  private lieferungenTick(): void {
    const faellig = this.lieferungen.filter((l) => l.ankunft <= this._tick);
    if (!faellig.length) return;
    this.lieferungen = this.lieferungen.filter((l) => l.ankunft > this._tick);
    for (const l of faellig) {
      if (!this.doerfer[l.sp]) continue;
      if (l.art === 0) {
        if (this.ortBesitz[l.ziel] < 0) this.ortGewinnen(l.ziel, l.sp);
        else this.ereignis(l.sp, 'zu_spaet', 0, l.ziel);
      } else {
        let ziel = this.gebaeude.get(l.lager);
        if (!ziel || ziel.sp !== l.sp || !istLager(ziel)) ziel = this.eigeneLager(l.sp)[0];
        if (!ziel) continue;
        for (let a = 0; a < l.nimm.length; a++) ziel.vorrat[a] += l.nimm[a];
        this.ereignis(l.sp, 'handel', ziel.id, l.ziel);
      }
    }
  }

  /** Einstand gefeiert (Drehbuch 6.2): Ort, Bewohner, Punkte, ein Lager auf dem Ortskern mit der Fundkiste (sonst ins nächste Lager). */
  private ortGewinnen(oi: number, sp: number): void {
    const o = this.orte[oi], g = ORT_GROESSEN[o.groesse], d = this.doerfer[sp];
    this.ortBesitz[oi] = sp;
    d.einstandP += g.punkte;
    this.neuerBewohner(sp, g.bewohner);
    let lager: Gebaeude | undefined;
    if (!this.hexGeb[o.h] && !this.hexFahne[o.h] && !this.hexWeg[o.h] && this.karte.begehbar[o.h]) {
      lager = this.gebaeudeErzeugen('lager', o.h, true, sp);
      lager.vorrat = new Array<number>(WAREN.length).fill(0);
    } else lager = this.naechstesEigenesLager(sp, o.h).l;
    if (lager) for (let a = 0; a < g.fundkiste.length; a++) lager.vorrat[a] += g.fundkiste[a];
    this.ereignis(sp, 'einstand', lager?.id ?? 0, oi);
    this.gebietNeu();
  }

  /** Finderhütte (Drehbuch 6.3): Ziel suchen, hin und zurück, mit Beute oder erwischt in die Ausredenstube. */
  private finderTick(g: Gebaeude): void {
    if (!g.ar) return;
    const t = this._tick;
    if (g.ph === FI_AUSREDE) { if (t >= g.pt) { g.ph = FI_BEREIT; g.pt = t + FIND_PAUSE; } return; }
    if (g.ph === FI_BEREIT) {
      if (g.ruht || t < g.pt) return;
      const ziele = this.finderZiele(g);
      if (!ziele.length) { g.pt = t + FIND_PAUSE; g.leer = 1; return; }
      const z = ziele[g.wi % ziele.length];
      g.wi++; g.leer = 0;
      g.zh = z.code; g.ph = FI_UNTERWEGS; g.arbeit = 1;
      g.pt = t + 2 * Math.max(1, this.karte.abstand(g.h, z.h)) * FIND_TICKS_JE_HEX;
      return;
    }
    if (t < g.pt) return;
    // zurück: erwischt oder mit Beute
    g.arbeit = 0;
    const zielSp = g.zh >= FI_SPIELER ? g.zh - FI_SPIELER : -1;
    if (zielSp >= 0 && !this.doerfer[zielSp]) { g.ph = FI_BEREIT; g.pt = t + FIND_PAUSE; return; }
    const chance = zielSp < 0 ? FLACH_WACHSAMKEIT : this.wachsamkeit(zielSp);
    if (this.zufall(100) < chance) {
      g.ph = FI_AUSREDE;
      g.pd = this.zufall(AUSREDEN.length);
      g.pt = t + AUSREDE_TICKS[g.pd % AUSREDE_TICKS.length];
      this.ereignis(g.sp, 'erwischt', g.id, g.pd);
      if (zielSp >= 0) this.ereignis(zielSp, 'ertappt', 0, g.sp);
      return;
    }
    let art = -1, n = 0;
    if (zielSp < 0) {
      // Flachländer: eine Ware aus ihrem Angebot (fest aus dem Zufall)
      const angebot: number[] = [];
      for (const h of HANDEL) for (let a = 0; a < h.nimm.length; a++) if (h.nimm[a] > 0 && !angebot.includes(a)) angebot.push(a);
      if (angebot.length) { art = angebot[this.zufall(angebot.length)]; n = FIND_BEUTE; }
    } else {
      // Mitspieler: von der Ware, die sein Lager am reichlichsten hat, höchstens FIND_BEUTE
      const lager = this.eigeneLager(zielSp);
      let best = 0;
      for (let a = 0; a < WAREN.length; a++) {
        let da = 0;
        for (const l of lager) da += l.vorrat[a];
        if (da > best) { best = da; art = a; }
      }
      if (art >= 0) {
        n = Math.min(FIND_BEUTE, best);
        const weg = new Array<number>(WAREN.length).fill(0); weg[art] = n;
        this.ausLagern(zielSp, weg);
        this.stat.verbraucht -= n;
      }
    }
    if (art >= 0 && n > 0) {
      const f = this.fahnen.get(g.fahne)!;
      let rest = n;
      while (rest > 0 && this.platz(f)) { this.wareAufFahne(f, art); rest--; }
      if (rest > 0) { const l = this.naechstesEigenesLager(g.sp, g.h).l; if (l) l.vorrat[art] += rest; }
      this.stat.erzeugt += n; this.erzeugtJe[art] += n; this.doerfer[g.sp].erzeugt[art] += n;
      this.doerfer[g.sp].fundP += FIND_PUNKTE;
      g.erzeugt += n;
      this.ereignis(g.sp, 'fund', g.id, art);
    }
    g.ph = FI_BEREIT; g.pt = t + FIND_PAUSE;
  }

  /** Mögliche Ziele eines Finders: erreichte Marktposten, dann die Dorfkerne der Mitspieler (Ziel-Hex = deren Startlager). */
  private finderZiele(g: Gebaeude): { code: number; h: number }[] {
    const aus: { code: number; h: number }[] = [];
    this.posten.forEach((p, i) => { if (this.erreicht(g.sp, p.h)) aus.push({ code: i, h: p.h }); });
    for (let sp = 0; sp < this.doerfer.length; sp++) {
      if (sp === g.sp) continue;
      const st = this.starts[sp];
      aus.push({ code: FI_SPIELER + sp, h: this.karte.index(st.q, st.r) });
    }
    return aus;
  }

  /** Erwischt-Chance (Prozent) bei Spieler `sp`: Grundwert plus Wachhunde und Dorfpolizisten im Umkreis seines Startlagers. */
  private wachsamkeit(sp: number): number {
    const st = this.starts[sp], h = this.karte.index(st.q, st.r);
    let p = FIND_BASIS;
    for (const g of this.gebaeude.values()) {
      if (g.sp !== sp || !g.fertig || this.karte.abstand(g.h, h) > FIND_UMKREIS) continue;
      if (g.typ === 'hundehuette') p += FIND_WACHHUND;
      else if (g.typ === 'polizeiwache' && g.ar) p += FIND_POLIZIST;
    }
    return Math.min(FIND_HOECHSTENS, p);
  }

  private schuetzenhaus(sp: number): Gebaeude | undefined {
    for (const g of this.gebaeude.values()) if (g.sp === sp && g.fertig && GEBAEUDE[g.typ].funktion === 'schuetzen') return g;
    return undefined;
  }

  /**
   * Schützenhaus (Drehbuch 6, Feste): Ist die Liste dieses Jahres geliefert, wird gefeiert und auf den Vogel geschossen: Grundwert,
   * Schießstand und etwas Glück. Schützenkönig wird, wer mindestens KOENIG_AB trifft und alle schlägt, die dieses Jahr schon geschossen
   * haben; der alte König verliert den Titel. Der König zahlt die Runde (KOENIG_RUNDE aus dem Lager, sofern da).
   */
  private schuetzenTick(g: Gebaeude): void {
    const d = this.doerfer[g.sp], jahr = jahrVon(this._tick);
    if (d.sfest > 0) { d.sfest--; return; }
    if (d.schuetzenJahr === jahr) return;
    for (let a = 0; a < WAREN.length; a++) if (g.puffer[a] < SCHUETZEN_LISTE[a]) return;
    for (let a = 0; a < WAREN.length; a++) { g.puffer[a] -= SCHUETZEN_LISTE[a]; this.stat.verbraucht += SCHUETZEN_LISTE[a]; }
    d.schuetzenJahr = jahr; d.schuetzenN++; d.sfest = Math.max(1, SCHUETZEN_FEST);
    let stand = false;
    for (const x of this.gebaeude.values()) if (x.sp === g.sp && x.fertig && x.typ === 'schiessstand') stand = true;
    d.schuss = SCHUSS_GRUND + (stand ? SCHUSS_STAND : 0) + this.zufall(SCHUSS_GLUECK + 1);
    this.ereignis(g.sp, 'schuetzenfest', g.id, d.schuss);
    let koenig = d.schuss >= KOENIG_AB;
    this.doerfer.forEach((o, sp) => { if (sp !== g.sp && o.schuetzenJahr === jahr && o.schuss >= d.schuss) koenig = false; });
    if (!koenig) return;
    for (const o of this.doerfer) o.koenig = 0;
    d.koenig = 1; d.koenigN++;
    const runde = KOENIG_RUNDE.slice();
    if (!this.ausLagern(g.sp, runde)) {
      // nicht genug da: was da ist
      for (let a = 0; a < runde.length; a++) {
        if (!runde[a]) continue;
        let da = 0;
        for (const l of this.eigeneLager(g.sp)) da += l.vorrat[a];
        const x = new Array<number>(WAREN.length).fill(0); x[a] = Math.min(da, runde[a]);
        this.ausLagern(g.sp, x);
      }
    }
    this.doerfer.forEach((_, sp) => this.ereignis(sp, 'koenig', g.id, g.sp));
  }

  /** Eifel-Punkte (Drehbuch 6.4, data/nachbarn.json: punkte). */
  punkte(sp: number): number {
    const d = this.doerfer[sp];
    if (!d) return 0;
    return PUNKTE_STUFE[Math.min(d.stufe, PUNKTE_STUFE.length - 1)] + PUNKTE_KIRMES * d.stufe + d.festPunkte + d.einstandP + d.fundP
      + (d.bootP ?? 0) + PUNKTE_SCHUETZENFEST * d.schuetzenN + PUNKTE_KOENIG * d.koenigN + PUNKTE_BEWOHNER * d.bewohner + Math.floor(this.hexeVon(sp) / HEXE_JE_PUNKT);
  }

  /** Ende der Partie: Wettlauf (zuerst Marktflecken) oder Zielpunktzahl erreicht; bei mehreren gewinnt der mit den meisten Punkten. */
  private endePruefen(): void {
    let sieger = -1, beste = -1;
    const ziel = zielPunkte(this.regeln);
    for (let sp = 0; sp < this.doerfer.length; sp++) {
      const p = this.punkte(sp);
      const geschafft = this.regeln.ziel === 'wettlauf' ? this.doerfer[sp].stufe >= 3 : ziel > 0 && p >= ziel;
      if (geschafft && p > beste) { beste = p; sieger = sp; }
    }
    if (sieger < 0) return;
    this.ende = { sieger, tick: this._tick };
    this.doerfer.forEach((_, sp) => this.ereignis(sp, 'ende', 0, sieger));
  }

  // ------------------------------------------------------------------ Hex-Prüfungen

  /** Freie Fahne möglich: begehbar, frei oder auf einem eigenen Weg (teilt ihn). */
  private hexKannFahne(h: number, sp: number): boolean {
    if (!this.karte.begehbar[h] || this.hexFahne[h] || this.hexGeb[h]) return false;
    if (this.regeln.gebiet && this.besitz[h] !== sp && !(this.besitz[h] < 0 && this.amAnschluss(h))) return false;
    if (this.hexWeg[h]) {
      const s = this.segmente.get(this.hexWeg[h]);
      return !!s && s.sp === sp && s.pfad.indexOf(h) > 0;
    }
    return true;
  }

  /** Ende eines Wegs: eigene Fahne mit freiem Anschluss oder ein Hex, auf dem eine eigene Fahne stehen kann. */
  private zielFahneOk(z: number, sp: number): boolean {
    if (!this.hexFahne[z]) return this.hexKannFahne(z, sp);
    const f = this.fahnen.get(this.hexFahne[z])!;
    return f.sp === sp && f.segmente.length < FAHNE_MAX_SEGMENTE;
  }

  /** Hex ohne Gebäude, Fahne, Weg und ohne Nachbar-Gebäude (Nachbarregel). */
  private hexFrei(h: number): boolean {
    const k = this.karte;
    if (!k.begehbar[h] || this.hexFahne[h] || this.hexWeg[h] || this.hexGeb[h]) return false;
    for (let i = 0; i < 6; i++) {
      const n = k.nachbarn[h * 6 + i];
      if (n >= 0 && this.hexGeb[n]) return false;
    }
    return true;
  }

  private hexKannBauen(typ: string, h: number, sp: number): boolean {
    const t = typVon(typ);
    if (!t || typ === 'lager' || !this.doerfer[sp] || !this.typFrei(t, sp)) return false;
    if (this.regeln.gebiet && this.besitz[h] !== sp) return false;
    // M11: Fischer brauchen Wasser in der Nähe; die Vulkaneifeler bauen nicht direkt am Wasser (Maare sind heilig)
    if (t.amWasser && !this.wasserNah(h, 2, true)) return false;
    if (t.amMoor && !this.moorNah(h, 2)) return false;
    const vk = this.vkVon(sp);
    if (vk.amWasserVerboten && this.wasserNah(h, 1)) return false;
    // Laacher: kein Lärm nahe der eigenen Abtei (und keine Abtei neben Lärm)
    if (vk.laermRadius) for (const g of this.gebaeude.values()) {
      if (g.sp !== sp || this.karte.abstand(g.h, h) > vk.laermRadius) continue;
      if ((t.laut && g.typ === 'abtei') || (typ === 'abtei' && GEBAEUDE[g.typ].laut)) return false;
    }
    return this.karte.bebaubar[h] >= t.groesse && this.hexFrei(h);
  }

  /** Typ ist im Dorf von `sp` schon freigeschaltet (Dorfstufe) und, wenn einmalig, dort noch nicht gebaut (auch nicht als Baustelle). */
  private typFrei(t: GebaeudeTyp, sp: number): boolean {
    if (t.abStufe > this.doerfer[sp].stufe) return false;
    if (t.voelkchen.length && !t.voelkchen.includes(this.vkVon(sp).id)) return false;
    if (t.einmalig) for (const g of this.gebaeude.values()) if (g.sp === sp && g.typ === t.id) return false;
    return true;
  }

  /** Dorfstufe und einmalige Gebäude: Darf Spieler `sp` den Typ jetzt bauen (unabhängig vom Platz)? Grund in Klartext oder ''. */
  sperrGrund(typ: string, sp = 0): '' | 'stufe' | 'einmalig' | 'unbekannt' | 'voelkchen' {
    const t = typVon(typ);
    if (!t || typ === 'lager' || !this.doerfer[sp]) return 'unbekannt';
    if (t.voelkchen.length && !t.voelkchen.includes(this.vkVon(sp).id)) return 'voelkchen';
    if (t.abStufe > this.doerfer[sp].stufe) return 'stufe';
    if (!this.typFrei(t, sp)) return 'einmalig';
    return '';
  }

  // ------------------------------------------------------------------ Natur: Bäume und Felsen

  /** Hexe im Radius (ohne die Mitte, mit `mitteDazu` einschließlich), Reihenfolge dr, dq aufsteigend (also nach Index). */
  private hexeImRadius(h: number, radius: number, mitteDazu = false): number[] {
    const k = this.karte, aus: number[] = [];
    const q = k.qs[h], r = k.rs[h];
    for (let dr = -radius; dr <= radius; dr++) {
      for (let dq = Math.max(-radius, -dr - radius); dq <= Math.min(radius, -dr + radius); dq++) {
        if (dq === 0 && dr === 0 && !mitteDazu) continue;
        const x = k.index(q + dq, r + dr);
        if (x >= 0) aus.push(x);
      }
    }
    return aus;
  }

  /** Belegen (Gebäude, Fahne, Weg) vertreibt alle Bäume und Jungbäume des Hex (und Klippen-/Lesesteine). */
  private hexRaeumen(h: number): void {
    // Klippen und Lesesteine gehen beim Belegen verloren; ein Fels-Hex (Steinfeld) bleibt, wie er ist
    if (this.fels[h] && this.felsArt[h] !== FELS_FELS) { this.fels[h] = 0; this.natRev++; }
    if (!this.baum[h] && !this.jung[h]) return;
    this.baum[h] = 0; this.jung[h] = 0; this.stufe[h] = 0;
    for (let j = 0; j < TREE_MAX; j++) this.jungReif[h * TREE_MAX + j] = 0;
    this.natRev++;
  }

  /** Förster-Platz: begehbare Wiese, Wald oder Heide ohne Belegung und Fels, mit Platz für einen weiteren Baum. */
  private pflanzbar(x: number): boolean {
    const k = this.karte, t = k.terrain[x];
    if (t !== 1 && t !== 2 && t !== 3) return false;
    if (k.flags[x] & FLAG.bahn) return false;
    if (this.hexFahne[x] || this.hexGeb[x] || this.hexWeg[x] || this.fels[x]) return false;
    return this.baum[x] + this.jung[x] < TREE_MAX;
  }

  private pflanzen(x: number): void {
    for (let j = 0; j < TREE_MAX; j++) {
      if (this.jungReif[x * TREE_MAX + j] === 0) {
        this.jungReif[x * TREE_MAX + j] = this._tick + BAUM_WACHSEN;
        if (!this.jungListe.includes(x)) this.jungListe.push(x);
        this.jung[x]++;
        this.stufe[x] = 1;
        this.natRev++;
        return;
      }
    }
  }

  /** Jungbäume altern (alle 10 Ticks): reife werden Bäume, das Stadium (1..3) des ältesten wird nachgeführt. */
  private baeumeWachsen(): void {
    if (!this.jungListe.length) return;
    const t = this._tick;
    for (const x of this.jungListe) {
      let aeltester = 0;
      for (let j = 0; j < TREE_MAX; j++) {
        const reif = this.jungReif[x * TREE_MAX + j];
        if (reif === 0) continue;
        if (reif <= t) { this.jungReif[x * TREE_MAX + j] = 0; this.jung[x]--; this.baum[x]++; this.natRev++; }
        else if (aeltester === 0 || reif < aeltester) aeltester = reif;
      }
      const st = aeltester === 0 ? 0 : Math.min(3, 1 + Math.floor((3 * Math.max(0, BAUM_WACHSEN - (aeltester - t))) / BAUM_WACHSEN));
      if (st !== this.stufe[x]) { this.stufe[x] = st; this.natRev++; }
    }
    this.jungListe = this.jungListe.filter((x) => this.jung[x] > 0);
  }

  // ------------------------------------------------------------------ Netz aufbauen

  private netzGeaendert(): void {
    this.netzStand++;
    this.distCache.clear();
    this.verbundenNeu = true;
  }

  private fahneErzeugen(h: number, gebaeude: Id, sp: number): Fahne {
    const f: Fahne = { id: this.naechsteId++, sp, h, gebaeude, waren: [], segmente: [] };
    this.fahnen.set(f.id, f);
    this.hexFahne[h] = f.id;
    this.hexRaeumen(h);
    this.netzGeaendert();
    return f;
  }

  private gebaeudeErzeugen(typ: string, h: number, sofort: boolean, sp: number): Gebaeude {
    const t = GEBAEUDE[typ];
    const nul = () => new Array<number>(WAREN.length).fill(0);
    const g: Gebaeude = {
      id: this.naechsteId++, sp, typ, h, fahne: 0, fertig: sofort || t.kostenSumme === 0 ? 1 : 0,
      verbaut: sofort ? t.kosten.slice() : nul(), prio: PRIO_STANDARD, getrennt: typ !== 'lager', ruht: 0, erzeugt: 0,
      puffer: nul(), incoming: nul(), ausgang: nul(), zeit: 0, arbeit: 0, vorrat: nul(),
      ar: 0, ph: PH_SUCHE, pt: 0, pd: 0, wi: 0, zh: -1, weg: [], traegt: -1, leer: 0, mitte: -1,
      stapel: nul(), haende: -1, planSoll: 0, planIst: 0, bauer: 0, planierer: 0,
      regel: t.funktion === 'lager' ? nul() : [],
    };
    // Bauplätze am Hang muss erst ein Planierer ebnen (Drehbuch 4.5)
    if (!g.fertig) {
      g.planSoll = t.keinPlanieren ? 0 : planierTicks(this.karte.neigung[h]);
      const k = this.kostenFuer(sp, t, h);
      if (k.some((n, a) => n !== t.kosten[a])) g.kost = k;
    }
    // gerodete ausgewachsene Bäume (höchstens RODUNG_STAMM_MAX) werden zu Stämmen an der Gebäudefahne
    const staemme = sofort ? 0 : Math.min(RODUNG_STAMM_MAX, this.baum[h]);
    const f = this.fahneErzeugen(h, g.id, sp);
    g.fahne = f.id;

    this.hexGeb[h] = g.id;
    this.gebaeude.set(g.id, g);
    for (let i = 0; i < staemme && f.waren.length < FLAG_CAP; i++) {
      this.wareAufFahne(f, WARE.stamm);
      this.stat.erzeugt++; this.erzeugtJe[WARE.stamm]++; this.doerfer[sp].erzeugt[WARE.stamm]++;
    }
    return g;
  }

  private segKosten(s: Segment): void {
    let ab = 0, ba = 0;
    // M11: Römerstraße (Wege im Umkreis) und Vennbahn (Wege auf Bahn-Hexen) des eigenen Dorfs machen schneller
    const schnell: { h: number; r: number; p: number; bahn: boolean }[] = [];
    for (const g of this.gebaeude.values()) {
      const sw = GEBAEUDE[g.typ].schnellweg;
      if (sw && g.sp === s.sp && g.fertig) schnell.push({ h: g.h, r: sw.radius, p: sw.prozent, bahn: sw.bahn });
    }
    const k = this.karte;
    for (let i = 0; i + 1 < s.pfad.length; i++) {
      const a = s.pfad[i], b = s.pfad[i + 1];
      let p = 0;
      for (const x of schnell) {
        const ok = x.bahn ? (k.flags[a] & FLAG.bahn) && (k.flags[b] & FLAG.bahn) : k.abstand(x.h, a) <= x.r;
        if (ok && x.p > p) p = x.p;
      }
      ab += Math.max(1, Math.floor((k.schritt(a, b) * (100 - p)) / 100));
      ba += Math.max(1, Math.floor((k.schritt(b, a) * (100 - p)) / 100));
    }
    s.kab = ab; s.kba = ba;
  }

  /** Setzt eine freie Fahne von `sp`; liegt der Hex auf einem (eigenen) Weg, wird das Segment geteilt. */
  private fahneSetzen(h: number, sp: number): Fahne {
    const sid = this.hexWeg[h];
    if (!sid) return this.fahneErzeugen(h, 0, sp);
    const s = this.segmente.get(sid)!;
    const k = s.pfad.indexOf(h);
    const f = this.fahneErzeugen(h, 0, s.sp);
    this.hexWeg[h] = 0;
    const links = s.pfad.slice(0, k + 1), rechts = s.pfad.slice(k);
    const tr = s.traeger ? this.traeger.get(s.traeger)! : null;
    // Der Träger bleibt auf dem Teil, auf dem er steht.
    let traegerLinks = true;
    if (tr && tr.phase !== 0) {
      traegerLinks = tr.phase === 1 ? tr.ende === 0 : Math.max(tr.pos, tr.pos + tr.dir) <= k;
    }
    const neu: Segment = { id: this.naechsteId++, sp: s.sp, a: 0, b: 0, pfad: [], traeger: 0, verkehr: s.verkehr, kab: 0, kba: 0 };
    const altA = s.a, altB = s.b;
    if (traegerLinks) {
      s.b = f.id; s.pfad = links;
      neu.a = f.id; neu.b = altB; neu.pfad = rechts;
      this.listeErsetzen(altB, s.id, neu.id);
    } else {
      s.a = f.id; s.pfad = rechts;
      neu.a = altA; neu.b = f.id; neu.pfad = links;
      if (tr && tr.phase !== 0) tr.pos -= k;
      this.listeErsetzen(altA, s.id, neu.id);
    }
    for (let i = 1; i < neu.pfad.length - 1; i++) this.hexWeg[neu.pfad[i]] = neu.id;
    this.segmente.set(neu.id, neu);
    f.segmente.push(s.id, neu.id);
    f.segmente.sort((x, y) => x - y);
    this.segKosten(s); this.segKosten(neu);
    // Träger im Anmarsch, deren Route oder Ziel dieses Segment betrifft, gehen zurück in den Vorrat.
    this.anmarschLoesen(s.id);
    this.netzGeaendert();
    return f;
  }

  private listeErsetzen(fahne: Id, alt: Id, neu: Id): void {
    const f = this.fahnen.get(fahne)!;
    f.segmente[f.segmente.indexOf(alt)] = neu;
    f.segmente.sort((x, y) => x - y);
  }

  /** Träger im Anmarsch, die Segment `sid` benutzen oder besetzen sollen, werden entlassen. */
  private anmarschLoesen(sid: Id): void {
    for (const t of [...this.traeger.values()]) {
      if (t.phase === 0 && (t.seg === sid || t.routeSegs.includes(sid))) {
        const s = this.segmente.get(t.seg);
        if (s && s.traeger === t.id) s.traeger = 0;
        this.traeger.delete(t.id);
        this.doerfer[t.sp].frei++;
      }
    }
  }

  private wegBauen(hs: number[], sp: number): void {
    const n = hs.length;
    if (n < 2 || n - 1 > WEG_MAX_SCHRITTE) return;
    const k = this.karte;
    const gesehen = new Set<number>();
    for (let i = 0; i < n; i++) {
      const h = hs[i];
      if (h < 0 || !k.begehbar[h] || gesehen.has(h)) return;
      gesehen.add(h);
      if (i > 0) {
        let nachbar = false;
        for (let d = 0; d < 6; d++) if (k.nachbarn[hs[i - 1] * 6 + d] === h) nachbar = true;
        if (!nachbar) return;
      }
    }
    const fa = this.fahnen.get(this.hexFahne[hs[0]]);
    if (!fa || fa.sp !== sp || fa.segmente.length >= FAHNE_MAX_SEGMENTE) return;
    for (let i = 1; i < n - 1; i++) {
      const h = hs[i];
      if (this.hexFahne[h] || this.hexGeb[h] || this.hexWeg[h]) return;
      // M10: Wege über eigenes und freies Land, nie über fremdes Gebiet
      if (this.fremdesLand(h, sp)) return;
    }
    const letzter = hs[n - 1];
    if (!this.zielFahneOk(letzter, sp)) return;
    const fz = this.hexFahne[letzter] ? this.fahnen.get(this.hexFahne[letzter])! : this.fahneSetzen(letzter, sp);
    const s: Segment = { id: this.naechsteId++, sp, a: fa.id, b: fz.id, pfad: hs.slice(), traeger: 0, verkehr: 0, kab: 0, kba: 0 };
    this.segKosten(s);
    this.segmente.set(s.id, s);
    for (let i = 1; i < n - 1; i++) { this.hexWeg[hs[i]] = s.id; this.hexRaeumen(hs[i]); }
    fa.segmente.push(s.id); fa.segmente.sort((x, y) => x - y);
    fz.segmente.push(s.id); fz.segmente.sort((x, y) => x - y);
    this.netzGeaendert();
  }

  // ------------------------------------------------------------------ Abriss (DESIGN §4.7)

  /**
   * Segment: Der Träger verschwindet sofort in den Vorrat (kein Rücklauf). Eine getragene Ware wird an der nächsten verbleibenden
   * Fahne abgelegt (außer `ausser`, einer Fahne, die ebenfalls wegfällt); ist dort kein Platz, geht sie verloren.
   */
  private segmentEntfernen(id: Id, ausser: Id): void {
    const s = this.segmente.get(id)!;
    const t = s.traeger ? this.traeger.get(s.traeger) : undefined;
    if (t) {
      if (t.art >= 0) {
        let nah = t.phase === 1 ? (t.ende === 0 ? s.a : s.b) : (t.pos * 2 <= s.pfad.length - 1 ? s.a : s.b);
        if (nah === ausser) nah = nah === s.a ? s.b : s.a;
        const f = this.fahnen.get(nah);
        const w: Ware = { art: t.art, ziel: t.ziel };
        if (f && nah !== ausser && f.waren.length < FLAG_CAP + NOTPLAETZE) f.waren.push(w);
        else this.wareVerloren(w);
      }
      this.traeger.delete(t.id);
      this.doerfer[t.sp].frei++;
    }
    for (let i = 1; i < s.pfad.length - 1; i++) this.hexWeg[s.pfad[i]] = 0;
    for (const fid of [s.a, s.b]) {
      const f = this.fahnen.get(fid);
      if (f) f.segmente = f.segmente.filter((x) => x !== id);
    }
    this.segmente.delete(id);
    for (const x of [...this.traeger.values()]) {
      if (x.phase === 0 && x.routeSegs.includes(id)) {
        const sx = this.segmente.get(x.seg);
        if (sx && sx.traeger === x.id) sx.traeger = 0;
        this.traeger.delete(x.id);
        this.doerfer[x.sp].frei++;
      }
    }
    this.netzGeaendert();
  }

  /** Freie Fahne: anliegende Segmente fallen weg, der Stapel ist verloren. */
  private fahneAbreissen(id: Id): void {
    const f = this.fahnen.get(id);
    if (!f || f.gebaeude) return;
    for (const sid of f.segmente.slice()) if (this.segmente.has(sid)) this.segmentEntfernen(sid, id);
    for (const w of f.waren) this.wareVerloren(w);
    this.hexFahne[f.h] = 0;
    this.fahnen.delete(id);
    this.netzGeaendert();
  }

  /**
   * Gebäude oder Baustelle (DESIGN §4.7): Die Fahne bleibt frei; Input-/Output-Puffer, eine getragene Ware des Arbeiters und die Hälfte
   * (abgerundet) des verbauten Materials landen an der Fahne, soweit Platz ist (FLAG_CAP); der Rest ist verloren. Der Arbeiter geht
   * zurück in den Vorrat, Reservierungen fallen weg. Das Lager bleibt stehen.
   */
  private gebaeudeAbreissen(id: Id): void {
    const g = this.gebaeude.get(id);
    if (!g || g.typ === 'lager') return;
    const f = this.fahnen.get(g.fahne)!;
    const t = GEBAEUDE[g.typ];
    // Lagerhaus: der Bestand geht ins nächste andere Lager des Dorfs (die Leute tragen ihn hinüber)
    if (istLager(g)) {
      let ziel: Gebaeude | undefined, bd = Infinity;
      for (const l of this.gebaeude.values()) {
        if (l.id === g.id || l.sp !== g.sp || !istLager(l)) continue;
        const d = this.karte.abstand(l.h, g.h);
        if (d < bd) { bd = d; ziel = l; }
      }
      if (ziel) for (let a = 0; a < WAREN.length; a++) ziel.vorrat[a] += g.vorrat[a];
      g.vorrat.fill(0);
    }
    // Werkzeug der Fachkraft kommt mit an die Fahne
    const werkzeug = g.ar && t.werkzeug ? t.werkzeug : 0;
    for (let a = 0; a < WAREN.length; a++) {
      const n = g.puffer[a] + g.ausgang[a] + g.stapel[a] + (g.haende === a ? 1 : 0) + (g.traegt === a ? 1 : 0) + Math.floor(g.verbaut[a] / 2)
        + (a === WARE.werkzeug ? werkzeug : 0);
      for (let i = 0; i < n; i++) if (f.waren.length < FLAG_CAP) f.waren.push({ art: a, ziel: 0 });
    }
    // Boten mit diesem Ziel oder aus diesem Lager bringen ihre Ware stattdessen ins nächste Lager
    for (const b of this.boten.values()) {
      if (b.ziel === g.id && (b.phase === BO_HOLT || b.phase === BO_BRINGT)) b.ziel = 0;
      if (b.lager === g.id) b.lager = 0;
    }
    if (g.ar) { this.doerfer[g.sp].frei++; this.reservierungFreigeben(g, t); }
    f.gebaeude = 0;
    this.hexGeb[g.h] = 0;
    this.gebaeude.delete(id);
    this.netzGeaendert();
    // Bauarbeiter und Planierer der Baustelle suchen sich die nächste oder gehen heim (erst nach dem Löschen, damit sie nicht zurückkommen)
    for (const bid of [g.bauer, g.planierer]) {
      const b = bid ? this.bauleute.get(bid) : undefined;
      if (b) this.baumannFertig(b);
    }
  }

  private reservierungFreigeben(g: Gebaeude, t: GebaeudeTyp): void {
    if (g.zh >= 0 && (g.ph === PH_HIN || g.ph === PH_ARBEIT)) {
      if (t.funktion === 'holzfaeller' && this.baumRes[g.zh] > 0) this.baumRes[g.zh]--;
      if (t.funktion === 'steinbruch' && this.felsRes[g.zh] > 0) this.felsRes[g.zh]--;
    }
  }

  // ------------------------------------------------------------------ Verbindung, Distanzen, Ziele

  private verbindungenNeu(): void {
    this.verbunden.clear();
    const stapel: Id[] = [];
    for (const g of this.gebaeude.values()) if (istLager(g)) { this.verbunden.add(g.fahne); stapel.push(g.fahne); }
    while (stapel.length) {
      const f = this.fahnen.get(stapel.pop()!)!;
      for (const sid of f.segmente) {
        const s = this.segmente.get(sid)!;
        const o = s.a === f.id ? s.b : s.a;
        if (!this.verbunden.has(o)) { this.verbunden.add(o); stapel.push(o); }
      }
    }
    for (const g of this.gebaeude.values()) g.getrennt = !istLager(g) && !this.verbunden.has(g.fahne);
    this.verbundenNeu = false;
  }

  /** Laufzeit von jeder Fahne zur Fahne `t` (Dijkstra, je Ziel gecacht, bei Netzänderung verworfen). */
  private distZu(t: Id): Map<Id, number> {
    let m = this.distCache.get(t);
    if (m) return m;
    m = new Map<Id, number>();
    this.distCache.set(t, m);
    if (!this.fahnen.has(t)) return m;
    m.set(t, 0);
    const heap = new ZahlenHeap();
    heap.push(t);
    while (heap.size > 0) {
      const key = heap.pop();
      const d = Math.floor(key / DIST_K), u = key - d * DIST_K;
      if (d > m.get(u)!) continue;
      for (const sid of this.fahnen.get(u)!.segmente) {
        const s = this.segmente.get(sid)!;
        const v = s.a === u ? s.b : s.a;
        // Kosten für den Weg v → u
        const nd = d + (s.a === v ? s.kab : s.kba);
        const alt = m.get(v);
        if (alt === undefined || nd < alt) { m.set(v, nd); heap.push(nd * DIST_K + v); }
      }
    }
    return m;
  }

  private segmentKostenVon(s: Segment, von: Id): number { return s.a === von ? s.kab : s.kba; }

  private zielOk(w: Ware, z: Fahne): boolean {
    const g = this.gebaeude.get(w.ziel);
    return !!g && (istLager(g) || !g.getrennt) && this.distZu(g.fahne).has(z.id);
  }

  private wareZielSetzen(w: Ware, z: Fahne): void {
    w.ziel = this.zielWaehlen(w.art, z);
    if (w.ziel) this.gebaeude.get(w.ziel)!.incoming[w.art]++;
  }

  private wareZielLoesen(w: Ware): void {
    if (w.ziel) {
      const g = this.gebaeude.get(w.ziel);
      if (g && g.incoming[w.art] > 0) g.incoming[w.art]--;
      w.ziel = 0;
    }
  }

  private wareVerloren(w: Ware): void { this.wareZielLoesen(w); }

  /** Offener Bedarf einer Baustelle an Ware `art`: Kosten − verbaut − am Stapel − in der Hand − unterwegs. */
  /** Steht Abnehmer-Art `x` für Ware `art` im Dorf von `sp` vor Art `y`? */
  private vorDran(sp: number, art: number, x: number, y: number): boolean {
    const v = this.doerfer[sp].vert, o = art * ABNEHMER_ZAHL;
    for (let i = 0; i < ABNEHMER_ZAHL; i++) {
      if (v[o + i] === x) return true;
      if (v[o + i] === y) return false;
    }
    return false;
  }

  private offen(g: Gebaeude, art: number): number {
    return this.kostenVon(g)[art] - g.verbaut[art] - g.stapel[art] - (g.haende === art ? 1 : 0) - g.incoming[art];
  }

  /**
   * Größe des Input-Puffers für Ware `art`: Verarbeiter laut Daten; Wohnhaus alle Nahrungsplätze (zusammen begrenzt, siehe pufferPlatz);
   * Kirmesplatz die Warenliste der aktuellen Stufe (während des Fests nichts).
   */
  private pufferMax(g: Gebaeude, t: GebaeudeTyp, art: number): number {
    if (t.funktion === 'wohnen') return NAHRUNG[art] > 0 ? t.nahrungPlaetze : 0;
    if (t.funktion === 'kirmes') {
      const d = this.doerfer[g.sp], k = this.kirmesJetzt(d);
      return this.platzBedarf(d, art) + (k && MISCHKORB[art] ? k.mischkorb : 0);
    }
    if (t.funktion === 'schuetzen') return SCHUETZEN_LISTE[art];
    // Ersatzware (Torf) nimmt der Verarbeiter wie die Zutat, die sie ersetzt (Holzkohle)
    const ers = this.vkVon(g.sp).ersatzFuer;
    if (ers.length && t.puffer[art] === 0) for (let z = 0; z < ers.length; z++) if (ers[z] === art && t.puffer[z] > 0) return t.puffer[z];
    // die Fachkraft hat ihr Werkzeug schon
    if (art === WARE.werkzeug && t.werkzeug && g.ar) return 0;
    return t.puffer[art];
  }

  /** Kirmes der aktuellen Stufe, solange nicht gerade gefeiert wird (sonst undefined). */
  private kirmesJetzt(d: Dorf): (typeof KIRMES)[number] | undefined {
    return d.fest > 0 ? undefined : this.kirmesVon(d)[d.stufe];
  }

  /** Kleines Fest, das in dieser Jahreszeit noch aussteht (Index in KLEINE_FESTE), oder -1; während eines kleinen Fests -1. */
  private festJetzt(d: Dorf): number {
    if (d.kfest > 0) return -1;
    const jahr = jahrVon(this._tick);
    for (let i = 0; i < KLEINE_FESTE.length; i++) if (KLEINE_FESTE[i].jahreszeit === this.jz && d.festJahr[i] !== jahr) return i;
    return -1;
  }

  /** Was am Kirmesplatz von Ware `art` gebraucht wird: Kirmesliste plus Liste des kleinen Fests (ohne Mischkorb). */
  private platzBedarf(d: Dorf, art: number): number {
    const k = this.kirmesJetzt(d), f = this.festJetzt(d);
    return (k ? k.liste[art] : 0) + (f >= 0 ? KLEINE_FESTE[f].liste[art] : 0);
  }

  /** Freier Platz im Input-Puffer eines fertigen Gebäudes für Ware `art` (Puffer − vorhanden − unterwegs). */
  private pufferPlatz(g: Gebaeude, art: number): number {
    const t = GEBAEUDE[g.typ], d = this.doerfer[g.sp];
    if (t.funktion === 'kirmes') {
      // Kirmesplatz: erst die Listen von Kirmes und kleinem Fest, dann beliebige veredelte Waren für den Mischkorb. Werkzeug erst, wenn
      // das Dorf selbst welches geschmiedet hat: das Geschenk und Funde gehören den Fachkräften der Eisenkette
      if (art === WARE.werkzeug && d.erzeugt[art] === 0) return 0;
      const direkt = Math.max(0, this.platzBedarf(d, art) - g.puffer[art] - g.incoming[art]);
      const k = this.kirmesJetzt(d);
      if (!k || !k.mischkorb || !MISCHKORB[art]) return direkt;
      let belegt = 0;
      for (let a = 0; a < WAREN.length; a++) if (MISCHKORB[a]) belegt += Math.max(0, g.puffer[a] + g.incoming[a] - this.platzBedarf(d, a));
      return direkt + Math.max(0, k.mischkorb - belegt);
    }
    if (t.funktion === 'schuetzen') {
      // Schützenhaus (M10): einmal je Spieljahr die Liste; Waren für die laufende Kirmes gehen vor
      if (d.schuetzenJahr === jahrVon(this._tick) || d.sfest > 0 || this.kirmesBraucht(g.sp, art) > 0) return 0;
      return Math.max(0, SCHUETZEN_LISTE[art] - g.puffer[art] - g.incoming[art]);
    }
    const p = this.pufferMax(g, t, art) - g.puffer[art] - g.incoming[art];
    if (t.funktion !== 'wohnen' || p <= 0) return p;
    // was die Kirmes noch braucht, isst keiner weg (nur der Überschuss im Lager) – solange der Kirmesplatz in der Verteilung vorgeht
    if (this.vorDran(g.sp, art, 1, 3) && this.kirmesBraucht(g.sp, art) > 0) return 0;
    let belegt = 0;
    for (const a of NAHRUNG_REIHE) belegt += g.puffer[a] + g.incoming[a];
    // ohne freien Wohnraum hält das Wohnhaus nur einen Bissen vor, der Rest bleibt für Küche, Käserei und Kirmes
    if (d.wohnFrei <= 0 && belegt >= 1) return 0;
    return t.nahrungPlaetze - belegt;
  }

  /** Gebäude nimmt Waren in den Input-Puffer (Verarbeiter, Wohnhaus, Kirmesplatz). */
  private hatEingang(t: GebaeudeTyp): boolean {
    return t.pufferSumme > 0 || t.funktion === 'wohnen' || t.funktion === 'kirmes' || t.funktion === 'schuetzen';
  }

  /** Liegen alle Zutaten für den nächsten Arbeitsgang eines Verarbeiters im Input-Puffer? */
  private zutatenDa(g: Gebaeude, t: GebaeudeTyp): boolean {
    const ers = this.vkVon(g.sp).ersatzFuer;
    for (const z of t.wandelt!.ein) if (g.puffer[z.a] + ((ers[z.a] ?? -1) >= 0 ? g.puffer[ers[z.a]] : 0) < z.n) return false;
    return true;
  }

  /**
   * DESIGN §4.5 mit der Warenverteilung des Dorfs (ROADMAP M7): die Abnehmer-Arten in der Rangfolge für diese Ware – Baustellen mit
   * offenem Bedarf (höchste Priorität, dann nächste), sonst der nächste Abnehmer der Art mit Platz im Input-Puffer –, zuletzt das
   * nächste Lager; 0 = kein Ziel erreichbar. Getrennte Baustellen und Gebäude bekommen nichts, fremde auch nicht.
   */
  private zielWaehlen(art: number, z: Fahne): Id {
    let best = 0, bd = Infinity;
    const vert = this.doerfer[z.sp].vert;
    for (let i = 0; i < ABNEHMER_ZAHL; i++) {
      const wer = vert[art * ABNEHMER_ZAHL + i];
      let bp = 0;
      bd = Infinity;
      for (const g of this.gebaeude.values()) {
        if (g.sp !== z.sp || g.getrennt || abnehmerArt(g) !== wer) continue;
        if ((wer === 0 ? this.offen(g, art) : this.pufferPlatz(g, art)) <= 0) continue;
        const d = this.distZu(g.fahne).get(z.id);
        if (d === undefined) continue;
        if (wer === 0 ? g.prio > bp || (g.prio === bp && d < bd) : d < bd) { bp = g.prio; bd = d; best = g.id; }
      }
      if (best) return best;
    }
    // zuletzt das nächste Lager, das die Ware einlagert (Lagerregel normal); nimmt keins sie, dann das nächste überhaupt
    bd = Infinity;
    let notfall = 0, nd = Infinity;
    for (const g of this.gebaeude.values()) {
      if (g.sp !== z.sp || !istLager(g)) continue;
      const d = this.distZu(g.fahne).get(z.id);
      if (d === undefined) continue;
      if (g.regel[art] === 0 && d < bd) { bd = d; best = g.id; }
      if (d < nd) { nd = d; notfall = g.id; }
    }
    return best || notfall;
  }

  /** Segment, über das die Ware an Fahne z weiterläuft (kürzester Weg zum Ziel), oder 0. Erneuert ein ungültiges Ziel. */
  private wareHop(z: Fahne, w: Ware): Id {
    if (w.ziel && !this.zielOk(w, z)) { this.wareZielLoesen(w); this.wareZielSetzen(w, z); }
    if (!w.ziel) return 0;
    const t = this.gebaeude.get(w.ziel)!.fahne;
    if (t === z.id) return 0;
    const dm = this.distZu(t);
    const cur = dm.get(z.id)!;
    for (const sid of z.segmente) {
      const s = this.segmente.get(sid)!;
      const o = s.a === z.id ? s.b : s.a;
      const d = dm.get(o);
      if (d !== undefined && d + this.segmentKostenVon(s, z.id) === cur) return sid;
    }
    return 0;
  }

  /** Ziele ohne Gebäude/Verbindung erneuern, Waren ohne Ziel neu versuchen (alle 10 Ticks). */
  private zielePruefen(): void {
    for (const f of this.fahnen.values()) {
      for (const w of f.waren) {
        if (w.ziel && this.zielOk(w, f)) continue;
        this.wareZielLoesen(w);
        this.wareZielSetzen(w, f);
      }
    }
  }

  // ------------------------------------------------------------------ Gebäude

  private inbGet(f: Id): number { return this.inb.get(f) ?? 0; }
  private inbAdd(f: Id, d: number): void { this.inb.set(f, this.inbGet(f) + d); }

  private inbNeu(): void {
    this.inb.clear();
    for (const t of this.traeger.values()) {
      if (t.art < 0) continue;
      const s = this.segmente.get(t.seg)!;
      this.inbAdd(t.phase === 2 ? (t.dir > 0 ? s.b : s.a) : (t.ende === 0 ? s.a : s.b), 1);
    }
  }

  private platz(f: Fahne): boolean { return f.waren.length + this.inbGet(f.id) < FLAG_CAP; }

  /** Ware aus dem Output-Puffer auf die Fahne legen und ein Ziel suchen. */
  private wareAufFahne(f: Fahne, art: number): void {
    const w: Ware = { art, ziel: 0 };
    this.wareZielSetzen(w, f);
    f.waren.push(w);
  }

  /** Eine Ware in den Output-Puffer legen (Erzeugung, zählt in der Statistik). */
  private produziert(g: Gebaeude, art: number): void {
    g.ausgang[art]++;
    g.erzeugt++;
    this.stat.erzeugt++;
    this.erzeugtJe[art]++;
    this.doerfer[g.sp].erzeugt[art]++;
  }

  /** Ein Stück Material ist verbaut (vom Bauarbeiter). */
  private verbauen(g: Gebaeude, art: number): void {
    g.verbaut[art]++;
    this.stat.verbaut++;
    const t = GEBAEUDE[g.typ], kosten = this.kostenVon(g);
    for (let a = 0; a < kosten.length; a++) if (g.verbaut[a] < kosten[a]) return;
    g.fertig = 1;
    g.ph = PH_SUCHE; g.pt = 0; g.leer = 0; g.zeit = 0;
    this.ereignis(g.sp, 'fertig', g.id, 0);
    // Römerstraße, Vennbahn: die eigenen Wege werden schneller (Laufzeiten neu, Verbindungen bleiben)
    if (t.schnellweg) { for (const sg of this.segmente.values()) if (sg.sp === g.sp) this.segKosten(sg); this.distCache.clear(); }
  }

  private gebaeudeTick(g: Gebaeude): void {
    const f = this.fahnen.get(g.fahne)!;
    // Ware mit Ziel dieses Gebäudes aus der Fahne nehmen (eine je Tick)
    for (let i = 0; i < f.waren.length; i++) {
      const w = f.waren[i];
      if (w.ziel !== g.id) continue;
      f.waren.splice(i, 1);
      if (g.incoming[w.art] > 0) g.incoming[w.art]--;
      if (istLager(g)) g.vorrat[w.art]++;
      else if (!g.fertig) g.stapel[w.art]++;
      else g.puffer[w.art]++;
      this.stat.angekommen++;
      break;
    }
    if (istLager(g) || !g.fertig || g.getrennt || this.fremd(g)) return;
    const t = GEBAEUDE[g.typ];
    // Output-Puffer → Fahne, solange diese Platz hat (Rückstau)
    if (t.ausgangMax > 0 && g.ausgang[t.ausgangWare] > 0 && this.platz(f)) {
      g.ausgang[t.ausgangWare]--;
      this.wareAufFahne(f, t.ausgangWare);
    }
    if (t.arbeiter && !g.ar) {
      const d = this.doerfer[g.sp];
      if (d.frei <= 0) return;
      // Fachkräfte fangen erst mit ihrem Werkzeug an (Drehbuch 4.5, 5)
      if (t.werkzeug && g.puffer[WARE.werkzeug] < t.werkzeug) return;
      if (t.werkzeug) { g.puffer[WARE.werkzeug] -= t.werkzeug; this.stat.verbraucht += t.werkzeug; }
      d.frei--;
      g.ar = 1; g.ph = PH_SUCHE; g.pt = 0; g.leer = 0;
    }
    // Jahreszeit und Wetter (Drehbuch 7.4): Felder ruhen im Winter und werden im Frühjahr gesät, Hochwasser legt die Aue still,
    // Wind, Dürre, Missernte und Frieren bremsen, Ernte und Regen auf den Feldern treiben an
    let extra = false;
    if (t.arbeiter && t.funktion !== 'schaenke') {
      if (this.stillstand(g, t)) { if (t.funktion === 'erzeuger') g.arbeit = 0; return; }
      const p = this.tempoProzent(g, t);
      if (p < 0 && this.bremst(-p, g.id)) return;
      extra = this.schub(p, g.id);
    }
    // Ahrtaler: während der Feste ruht die Arbeit
    if (t.arbeiter && this.festPause(g.sp)) return;
    switch (t.funktion) {
      case 'holzfaeller': case 'steinbruch': case 'foerster': this.laeuferTick(g, t); break;
      case 'hecke': if (!this.heckeGross(g)) g.zeit++; break;
      case 'fonds': {
        // Eifelfonds („Preußisch Sibirien“): zahlt nur aus, wenn das Dorf friert oder kaum Essen im Lager hat
        if (!this.dorfArm(g.sp)) { g.arbeit = 0; g.zeit = 0; break; }
        g.arbeit = 1;
        if (++g.zeit >= t.arbeitTicks && g.ausgang[t.ausgangWare] + t.fondsMenge <= t.ausgangMax) {
          g.zeit = 0;
          g.ausgang[t.ausgangWare] += t.fondsMenge;
          this.stat.erzeugt += t.fondsMenge;
          this.erzeugtJe[t.ausgangWare] += t.fondsMenge; this.doerfer[g.sp].erzeugt[t.ausgangWare] += t.fondsMenge;
          this.ereignis(g.sp, 'fonds', g.id, t.ausgangWare);
        }
        break;
      }
      case 'boote': {
        if (!g.ar || g.ruht) break;
        g.arbeit = 1;
        g.zeit += extra ? 2 : 1;
        if (g.zeit >= BOOTE_TAKT) { g.zeit = 0; this.doerfer[g.sp].bootP += BOOTE_PUNKTE; }
        break;
      }
      case 'verarbeiter': {
        const wd = t.wandelt!;
        if (!g.arbeit) {
          if (g.ruht) break;
          if (this.zutatenDa(g, t) && g.ausgang[wd.aus] < t.ausgangMax) {
            const ers = this.vkVon(g.sp).ersatzFuer;
            for (const z of wd.ein) {
              // erst die Zutat selbst, dann ihr Ersatz (Torf statt Holzkohle)
              const eigen = Math.min(z.n, g.puffer[z.a]);
              g.puffer[z.a] -= eigen;
              if (eigen < z.n && (ers[z.a] ?? -1) >= 0) g.puffer[ers[z.a]] -= z.n - eigen;
              this.stat.verbraucht += z.n;
            }
            g.arbeit = 1; g.zeit = 0;
          }
        } else {
          g.zeit += extra ? 2 : 1;
          if (g.zeit >= wd.ticks) { this.produziert(g, wd.aus); g.arbeit = 0; g.zeit = 0; }
        }
        break;
      }
      case 'erzeuger': {
        // Feld, Wiese, Stall, Bienenstock: alle arbeitTicks eine Ware, solange der Output-Puffer Platz hat
        if (g.ausgang[t.ausgangWare] >= t.ausgangMax || g.ruht) { g.arbeit = 0; break; }
        g.arbeit = 1;
        g.zeit += extra ? 2 : 1;
        if (g.zeit >= t.arbeitTicks) { this.produziert(g, t.ausgangWare); g.zeit = 0; }
        break;
      }
      case 'wohnen': this.wohnenTick(g, t); break;
      case 'kirmes': this.kirmesTick(g); break;
      case 'schaenke': this.schaenkeTick(g, t); break;
      case 'finder': this.finderTick(g); break;
      case 'schuetzen': this.schuetzenTick(g); break;
      default: break;
    }
  }

  // ------------------------------------------------------------------ Arbeiter: Holzfäller, Steinbruch, Förster

  /** Gehweg von Hex `von` nach `nach` (Schritt für Schritt näher, bei Gleichstand billigster Schritt, dann kleinster Index) oder null. */
  private gehPfad(von: number, nach: number): number[] | null {
    const k = this.karte, weg = [von];
    let c = von;
    while (c !== nach) {
      const dc = k.abstand(c, nach);
      let best = -1, bk = 0;
      for (let d = 0; d < 6; d++) {
        const n = k.nachbarn[c * 6 + d];
        if (n < 0 || !k.begehbar[n] || k.abstand(n, nach) !== dc - 1) continue;
        const kosten = k.schritt(c, n);
        if (best < 0 || kosten < bk || (kosten === bk && n < best)) { best = n; bk = kosten; }
      }
      if (best < 0) return null;
      weg.push(best);
      c = best;
    }
    return weg;
  }

  /** Mittelpunkt des Arbeitsbereichs (Hex-Index): der gesetzte oder das Gebäude selbst. */
  private arbeitsMitte(g: Gebaeude): number { return g.mitte >= 0 ? g.mitte : g.h; }

  /** Hexe des Arbeitsbereichs: Radius um den Mittelpunkt (dieser selbst nur, wenn er nicht das Gebäude ist), ohne das Gebäude-Hex. */
  private arbeitsHexeVon(g: Gebaeude, t: GebaeudeTyp): number[] {
    return this.hexeImRadius(this.arbeitsMitte(g), t.radius, g.mitte >= 0).filter((x) => x !== g.h);
  }

  /** Hex im Arbeitsbereich mit freiem Baum/Fels, der vom Gebäude aus am schnellsten erreichbar ist (Gleichstand: kleinerer Index), samt Gehweg, oder null. */
  private sucheRessource(g: Gebaeude, t: GebaeudeTyp): number[] | null {
    const baum = t.funktion === 'holzfaeller';
    let best: number[] | null = null, bk = Infinity, bi = 0;
    for (const x of this.arbeitsHexeVon(g, t)) {
      const frei = baum ? this.baum[x] - this.baumRes[x] : this.fels[x] - this.felsRes[x];
      if (frei <= 0) continue;
      const weg = this.gehPfad(g.h, x);
      if (!weg) continue;
      const kosten = this.karte.pfadKosten(weg);
      if (kosten < bk || (kosten === bk && x < bi)) { best = weg; bk = kosten; bi = x; }
    }
    return best;
  }

  /** Förster: zufälliger Pflanzplatz unter allen erreichbaren Kandidaten im Arbeitsbereich, samt Gehweg, oder null. */
  private suchePflanzplatz(g: Gebaeude, t: GebaeudeTyp): number[] | null {
    const wege: number[][] = [];
    for (const x of this.arbeitsHexeVon(g, t)) {
      if (!this.pflanzbar(x)) continue;
      const weg = this.gehPfad(g.h, x);
      if (weg) wege.push(weg);
    }
    return wege.length ? wege[this.zufall(wege.length)] : null;
  }

  private laeuferTick(g: Gebaeude, t: GebaeudeTyp): void {
    const k = this.karte;
    switch (g.ph) {
      case PH_SUCHE: {
        if (t.ausgangMax > 0 && g.ausgang[t.ausgangWare] >= t.ausgangMax) return; // Rückstau: Arbeit ruht
        if (g.ruht) return; // angehalten: der Arbeiter bleibt an der Hütte
        if (g.pt > 0) { g.pt--; return; }
        const weg = t.funktion === 'foerster' ? this.suchePflanzplatz(g, t) : this.sucheRessource(g, t);
        if (!weg) { g.leer = 1; g.pt = SUCHE_WARTE; return; }
        g.leer = 0;
        g.weg = weg; g.zh = weg[weg.length - 1];
        if (t.funktion === 'holzfaeller') this.baumRes[g.zh]++;
        else if (t.funktion === 'steinbruch') this.felsRes[g.zh]++;
        g.wi = 0; g.pt = 0; g.pd = k.schritt(weg[0], weg[1]); g.ph = PH_HIN;
        return;
      }
      case PH_HIN: {
        g.pt++;
        if (g.pt < g.pd) return;
        g.pt = 0; g.wi++;
        if (g.wi >= g.weg.length - 1) { g.ph = PH_ARBEIT; g.pd = t.arbeitTicks; } else g.pd = k.schritt(g.weg[g.wi], g.weg[g.wi + 1]);
        return;
      }
      case PH_ARBEIT: {
        g.pt++;
        if (g.pt < g.pd) return;
        const x = g.zh;
        g.traegt = -1;
        if (t.funktion === 'holzfaeller') {
          if (this.baumRes[x] > 0) this.baumRes[x]--;
          if (this.baum[x] > 0) { this.baum[x]--; this.natRev++; g.traegt = t.ausgangWare; }
        } else if (t.funktion === 'steinbruch') {
          if (this.felsRes[x] > 0) this.felsRes[x]--;
          if (this.fels[x] > 0) { this.fels[x]--; this.natRev++; g.traegt = t.ausgangWare; }
        } else if (this.pflanzbar(x)) this.pflanzen(x);
        g.ph = PH_ZURUECK; g.pt = 0; g.wi = g.weg.length - 1; g.pd = k.schritt(g.weg[g.wi], g.weg[g.wi - 1]);
        return;
      }
      case PH_ZURUECK: {
        g.pt++;
        if (g.pt < g.pd) return;
        g.pt = 0; g.wi--;
        if (g.wi <= 0) {
          if (g.traegt >= 0) { this.produziert(g, g.traegt); g.traegt = -1; }
          g.weg = []; g.zh = -1; g.ph = PH_RUHE; g.pd = t.ruheTicks;
        } else g.pd = k.schritt(g.weg[g.wi], g.weg[g.wi - 1]);
        return;
      }
      default: {
        g.pt++;
        if (g.pt >= g.pd) { g.ph = PH_SUCHE; g.pt = 0; }
      }
    }
  }

  /**
   * Lager-Auslieferung als Pull (DESIGN §4.5): Baustellen (Priorität absteigend, dann Id) und danach Verarbeiter melden Bedarf, das
   * nächste verbundene Lager mit Vorrat gibt je Durchlauf eine Ware an seine Fahne.
   */
  /** Waren an der Lagerfahne, die das Lager verlassen (Ziel nicht das Lager selbst). */
  private ausgehend(l: Gebaeude): number {
    let n = 0;
    for (const w of this.fahnen.get(l.fahne)!.waren) if (w.ziel !== l.id) n++;
    return n;
  }

  private lagerPull(): void {
    const gezogen = new Set<Id>();
    // Wünsche (Gebäude, Ware) in der Reihenfolge der Warenverteilung des Dorfs: Rang der Abnehmer-Art für diese Ware, Baustellen nach
    // Priorität, dann Id; Wohnhäuser wollen das beste Essen zuerst. Mit der Standard-Verteilung genau die feste Reihenfolge aus M5.
    const wunsch: { g: Gebaeude; a: number; rang: number; prio: number; i: number }[] = [];
    for (const g of this.gebaeude.values()) {
      if (istLager(g) || g.getrennt) continue;
      const t = GEBAEUDE[g.typ];
      if (g.fertig && !this.hatEingang(t)) continue;
      const art = abnehmerArt(g), v = this.doerfer[g.sp].vert;
      const reihe = g.fertig && t.funktion === 'wohnen' ? NAHRUNG_REIHE : ALLE_WAREN;
      for (let i = 0; i < reihe.length; i++) {
        const a = reihe[i];
        if ((g.fertig ? this.pufferMax(g, t, a) : this.kostenVon(g)[a]) <= 0) continue;
        let rang = 0;
        while (rang < ABNEHMER_ZAHL && v[a * ABNEHMER_ZAHL + rang] !== art) rang++;
        wunsch.push({ g, a, rang, prio: g.fertig ? 0 : g.prio, i });
      }
    }
    wunsch.sort((x, y) => x.rang - y.rang || y.prio - x.prio || x.g.id - y.g.id || x.i - y.i);
    for (const { g, a } of wunsch) {
      if ((g.fertig ? this.pufferPlatz(g, a) : this.offen(g, a)) <= 0) continue;
      const dm = this.distZu(g.fahne);
      let best: Gebaeude | null = null, bd = Infinity;
      for (const l of this.gebaeude.values()) {
        if (l.sp !== g.sp || !istLager(l) || gezogen.has(l.id) || l.vorrat[a] <= 0) continue;
        // Nur ausgehende Waren an der Lagerfahne bremsen; was zum Lager unterwegs ist, nimmt das Lager selbst ab
        if (this.ausgehend(l) >= FLAG_CAP / 2) continue;
        const d = dm.get(l.fahne);
        if (d !== undefined && d < bd) { bd = d; best = l; }
      }
      if (!best) continue;
      // Weiter Weg: ein freier beschwipster Bote trägt querfeldein (DESIGN §10.3)
      if (this.karte.abstand(best.h, g.h) > BOTE_AB_HEX) {
        this.doerfer[g.sp].botenWunsch = this._tick;
        if (this.boteSchicken(g, a, best)) continue;
      }
      best.vorrat[a]--;
      g.incoming[a]++;
      this.fahnen.get(best.fahne)!.waren.push({ art: a, ziel: g.id });
      gezogen.add(best.id);
    }
    this.auslagern(gezogen);
  }

  /** Lagerregel „auslagern“: je Lager eine Ware dieser Art an seine Fahne, Ziel das nächste Lager des Dorfs mit Regel „normal“. */
  private auslagern(gezogen: Set<Id>): void {
    for (const l of this.gebaeude.values()) {
      if (!istLager(l) || gezogen.has(l.id) || this.ausgehend(l) >= FLAG_CAP / 2) continue;
      for (let a = 0; a < WAREN.length; a++) {
        if (l.regel[a] !== 2 || l.vorrat[a] <= 0) continue;
        let ziel: Gebaeude | null = null, bd = Infinity;
        for (const x of this.gebaeude.values()) {
          if (x.id === l.id || x.sp !== l.sp || !istLager(x) || x.regel[a] !== 0) continue;
          const d = this.distZu(x.fahne).get(l.fahne);
          if (d !== undefined && d < bd) { bd = d; ziel = x; }
        }
        if (!ziel) continue;
        l.vorrat[a]--;
        ziel.incoming[a]++;
        this.fahnen.get(l.fahne)!.waren.push({ art: a, ziel: ziel.id });
        gezogen.add(l.id);
        break;
      }
    }
  }

  // ------------------------------------------------------------------ Bewohner, Wohnhaus, Notnagel, Kirmes (Drehbuch 4.3, 5.2; DESIGN §5)

  private ereignis(sp: number, art: SichtEreignis['art'], gebaeude: Id, wert: number): void {
    this.ereignisNr++;
    const e = this.doerfer[sp].ereignisse;
    e.push({ nr: this.ereignisNr, tick: this._tick, art, gebaeude, wert });
    if (e.length > EREIGNISSE_MAX) e.shift();
  }

  /** Ein Bewohner kommt ins Dorf von `sp` (frei im Vorrat). */
  private neuerBewohner(sp: number, n = 1): void { const d = this.doerfer[sp]; d.bewohner += n; d.frei += n; }

  private nahrungIn(g: Gebaeude): boolean {
    for (const a of NAHRUNG_REIHE) if (g.puffer[a] > 0) return true;
    return false;
  }

  /** Freier Wohnraum im Dorf von `sp`: Wohnraum fertiger Gebäude − Bewohner − laufende Wohnhaus-Zyklen. */
  private wohnraumFrei(sp: number): number {
    let n = -this.doerfer[sp].bewohner;
    for (const g of this.gebaeude.values()) {
      if (!g.fertig || g.sp !== sp) continue;
      const t = GEBAEUDE[g.typ];
      n += t.wohnraum;
      if (t.funktion === 'wohnen' && g.arbeit) n--;
    }
    return n;
  }

  /** Wohnhaus: isst die beste Ware im Puffer und bringt nach dem Zyklus ihrer Stufe einen Bewohner (nur mit freiem Wohnraum). arbeit = Ware + 1. */
  private wohnenTick(g: Gebaeude, _t: GebaeudeTyp): void {
    if (g.arbeit) {
      const ware = g.arbeit - 1;
      g.zeit++;
      if (g.zeit < NAHRUNG_ZYKLUS[NAHRUNG[ware]]) return;
      g.arbeit = 0; g.zeit = 0;
      this.neuerBewohner(g.sp);
      this.ereignis(g.sp, 'bewohner', g.id, ware);
      // gleich weiter mit dem nächsten Bissen
    }
    // wer friert, bekommt keinen Nachwuchs (Wintervorrat, Drehbuch 7.4)
    if (g.ruht || this.doerfer[g.sp].friert || !this.nahrungIn(g) || this.wohnraumFrei(g.sp) <= 0) return;
    for (const a of NAHRUNG_REIHE) {
      if (g.puffer[a] <= 0) continue;
      g.puffer[a]--; g.arbeit = a + 1; g.zeit = 0; this.stat.verbraucht++;
      return;
    }
  }

  /**
   * Wie viel von Ware `art` die Kirmes der aktuellen Stufe noch braucht, über das hinaus, was schon geliefert, unterwegs oder im Lager
   * ist (> 0: die Wohnhäuser lassen die Ware liegen). Ohne Kirmesplatz zählt nur die Liste gegen den Lagervorrat.
   */
  private kirmesBraucht(sp: number, art: number): number {
    const d = this.doerfer[sp];
    const k = this.kirmesVon(d)[d.stufe];
    if (!k || !k.liste[art] || d.fest > 0) return 0;
    let n = k.liste[art];
    const p = this.kirmesPlatz(sp);
    if (p && p.fertig) n -= p.puffer[art] + p.incoming[art];
    if (n <= 0) return 0;
    for (const l of this.gebaeude.values()) if (l.sp === sp && istLager(l)) n -= l.vorrat[art];
    // 0 = es liegt mehr im Lager, als noch fehlt
    return Math.max(0, n + 1);
  }

  private kirmesPlatz(sp: number): Gebaeude | undefined {
    for (const g of this.gebaeude.values()) if (g.sp === sp && GEBAEUDE[g.typ].funktion === 'kirmes') return g;
    return undefined;
  }

  /** Kirmesplatz: Ist die Warenliste geliefert, wird sie verbraucht und das Fest beginnt. */
  private kirmesTick(g: Gebaeude): void {
    const d = this.doerfer[g.sp];
    const k = this.kirmesJetzt(d);
    if (k) {
      let ok = true, misch = 0;
      for (let a = 0; a < k.liste.length; a++) {
        if (g.puffer[a] < k.liste[a]) ok = false;
        else if (MISCHKORB[a]) misch += g.puffer[a] - k.liste[a];
      }
      if (ok && misch >= k.mischkorb) {
        for (let a = 0; a < k.liste.length; a++) { g.puffer[a] -= k.liste[a]; this.stat.verbraucht += k.liste[a]; }
        // Mischkorb aus dem Überschuss, Waren in fester Reihenfolge
        let rest = k.mischkorb;
        for (let a = 0; a < WAREN.length && rest > 0; a++) {
          if (!MISCHKORB[a]) continue;
          const n = Math.min(rest, g.puffer[a]);
          g.puffer[a] -= n; rest -= n; this.stat.verbraucht += n;
        }
        d.fest = Math.max(1, Math.floor((k.festTicks * this.vkVon(g.sp).fest) / 100));
        this.ereignis(g.sp, 'kirmes', g.id, d.stufe);
      }
    }
    // kleines Fest der Jahreszeit (Drehbuch 6 „Feste“): Waren, die die Kirmes noch braucht, bleiben ihr
    const f = this.festJetzt(d);
    if (f < 0) return;
    const fest = KLEINE_FESTE[f], kv = this.kirmesJetzt(d);
    for (let a = 0; a < WAREN.length; a++) if (fest.liste[a] > 0 && g.puffer[a] - (kv ? kv.liste[a] : 0) < fest.liste[a]) return;
    for (let a = 0; a < WAREN.length; a++) { g.puffer[a] -= fest.liste[a]; this.stat.verbraucht += fest.liste[a]; }
    d.kfest = Math.max(1, Math.floor((KLEINES_FEST_TICKS * this.vkVon(g.sp).fest) / 100)); d.kfestNr = f;
    d.festJahr[f] = jahrVon(this._tick);
    d.festPunkte += Math.max(0, Math.min(fest.punkte, FEST_OBERGRENZE - d.festPunkte));
    this.ereignis(g.sp, 'kleines_fest', g.id, f);
  }

  /** Schänke (DESIGN §10.3): macht aus einem Schnaps und einem freien Bewohner einen Boten, wenn weite Lieferungen anstehen. */
  private schaenkeTick(g: Gebaeude, t: GebaeudeTyp): void {
    if (g.zeit < BOTE_TAKT) g.zeit++;
    const d = this.doerfer[g.sp];
    if (g.ruht || g.zeit < BOTE_TAKT || g.puffer[WARE.schnaps] < 1 || d.frei <= 0 || this.botenVon(g.id) >= t.boten) return;
    const gebraucht = this._tick - d.botenWunsch < BOTE_WUNSCH_HAELT || this.liegend.some((x) => x.sp === g.sp && !x.bote);
    if (!gebraucht) return;
    g.puffer[WARE.schnaps]--; this.stat.verbraucht++;
    g.zeit = 0; g.erzeugt++;
    d.frei--;
    const b: Bote = { id: this.naechsteId++, sp: g.sp, schaenke: g.id, bis: this._tick + BOTE_TICKS, phase: BO_WARTET, route: [g.h], ri: 0, t: 0, dauer: 0, art: -1, ziel: 0, lager: 0, faellt: -1 };
    this.boten.set(b.id, b);
  }

  /** Boten einer Schänke, die gerade unterwegs sind. */
  private botenVon(id: Id): number {
    let n = 0;
    for (const b of this.boten.values()) if (b.schaenke === id) n++;
    return n;
  }

  /** Bringt gerade ein Wohnhaus im Dorf von `sp` Nachwuchs (Zyklus läuft)? */
  private nachwuchs(sp: number): boolean {
    for (const g of this.gebaeude.values()) if (g.sp === sp && g.arbeit && g.fertig && GEBAEUDE[g.typ].funktion === 'wohnen') return true;
    return false;
  }

  /**
   * Notnagel (Drehbuch 4.3): kaum freie Bewohner und kein Nachwuchs in Sicht – weil kein Wohnhaus Essen hat oder weil kein Wohnraum frei
   * ist. Essen nur im Lager zählt nicht, solange kein Wohnhaus es bekommt (keins gebaut, kein Träger frei): sonst könnte man sich festfahren.
   */
  private notnagelGreift(sp: number): boolean {
    return this.doerfer[sp].frei < NOTNAGEL_FREI_UNTER && !this.nachwuchs(sp);
  }

  /** Fest und Dorfstufe, Notnagel (Drehbuch 4.3: man kann sich nicht festfahren) im Dorf von `sp`. */
  private dorfTick(sp: number): void {
    const d = this.doerfer[sp];
    if (d.fest > 0) {
      d.fest--;
      if (d.fest === 0) {
        const k = this.kirmesVon(d)[d.stufe];
        d.stufe++;
        this.ereignis(sp, 'stufe', 0, d.stufe);
        if (k && k.zuzug > 0) { this.neuerBewohner(sp, k.zuzug); this.ereignis(sp, 'zuzug', 0, k.zuzug); }
        const kern = this.dorfkern(sp);
        if (k && kern) for (let a = 0; a < WAREN.length; a++) kern.vorrat[a] += k.geschenk[a];
      }
    }
    if (d.kfest > 0) d.kfest--;
    this.winterTick(sp);
    if (this._tick % BAULEUTE_TAKT === 0) this.neueBauleute(sp);
    if (this._tick >= d.statNaechst) this.statPunkt(sp);
    if (this.notnagelGreift(sp)) {
      d.notnagelT++;
      if (d.notnagelT >= NOTNAGEL_TICKS) { d.notnagelT = 0; this.neuerBewohner(sp); this.ereignis(sp, 'notnagel', 0, 1); }
    } else d.notnagelT = 0;
  }

  /** Der Dorfkern (Start-Lager) von `sp`. */
  private dorfkern(sp: number): Gebaeude | undefined {
    for (const g of this.gebaeude.values()) if (g.sp === sp && g.typ === 'lager') return g;
    return undefined;
  }

  /**
   * Wintervorrat (Drehbuch 7.4): Im Winter isst das Dorf alle WINTER_ESSEN_TICKS je angefangene WINTER_JE_BEWOHNER Bewohner ein Essen aus
   * seinen Lagern, einfaches zuerst. Reicht es nicht, frieren die Leute bis zur nächsten vollen Mahlzeit; im Frühjahr ist es vorbei.
   */
  private winterTick(sp: number): void {
    const d = this.doerfer[sp];
    if (this.jz !== WINTER) {
      d.winterT = 0;
      if (d.friert) { d.friert = 0; this.ereignis(sp, 'satt', 0, 0); }
      return;
    }
    d.winterT++;
    if (d.winterT < WINTER_ESSEN_TICKS) return;
    d.winterT = 0;
    let soll = Math.ceil(d.bewohner / WINTER_JE_BEWOHNER);
    for (const a of EINFACH_ZUERST) {
      for (const l of this.gebaeude.values()) {
        if (soll <= 0) break;
        if (l.sp !== sp || !istLager(l) || l.vorrat[a] <= 0) continue;
        const n = Math.min(soll, l.vorrat[a]);
        l.vorrat[a] -= n; soll -= n; this.stat.verbraucht += n;
      }
    }
    if (soll > 0 && !d.friert) { d.friert = 1; this.ereignis(sp, 'friert', 0, soll); }
    else if (soll <= 0 && d.friert) { d.friert = 0; this.ereignis(sp, 'satt', 0, 0); }
  }

  /** Neue Bauarbeiter und Planierer (Drehbuch 4.5): fehlen welche zur Wunschzahl, wird aus Werkzeug und einem freien Bewohner einer. */
  private neueBauleute(sp: number): void {
    const d = this.doerfer[sp];
    for (const beruf of [0, 1] as const) {
      const fehlt = beruf === 0 ? d.bauGesamt < d.bauSoll : d.planGesamt < d.planSoll;
      if (!fehlt || d.frei <= 0) continue;
      let l: Gebaeude | undefined;
      for (const x of this.gebaeude.values()) if (x.sp === sp && istLager(x) && x.vorrat[WARE.werkzeug] > 0) { l = x; break; }
      if (!l) return;
      l.vorrat[WARE.werkzeug]--; this.stat.verbraucht++;
      d.frei--; d.bewohner--;
      if (beruf === 0) { d.bauGesamt++; d.bauFrei++; } else { d.planGesamt++; d.planFrei++; }
      this.ereignis(sp, 'bauleute', 0, beruf);
      return;
    }
  }

  /** Statistik: Messpunkt für das Dorf von `sp` (SichtStatistik); über STAT_MAX jeder zweite alte Punkt weg und doppelter Takt. */
  private statPunkt(sp: number): void {
    const d = this.doerfer[sp];
    const vorrat = new Array<number>(WAREN.length).fill(0);
    let gebaeude = 0;
    for (const g of this.gebaeude.values()) {
      if (g.sp !== sp) continue;
      if (istLager(g)) for (let a = 0; a < WAREN.length; a++) vorrat[a] += g.vorrat[a];
      else if (g.fertig) gebaeude++;
    }
    d.statPunkte.push([this._tick, d.bewohner, d.stufe, gebaeude, ...vorrat, ...d.erzeugt]);
    if (d.statPunkte.length > STAT_MAX) {
      d.statPunkte = d.statPunkte.filter((_, i) => i % 2 === 0);
      d.statTakt *= 2;
    }
    d.statNaechst = this._tick + d.statTakt;
  }

  /** Statistik des Dorfs von `sp` (Kopie). Punkte wie SichtStatistik: Kopf (STAT_KOPF Werte), Vorrat und Erzeugtes je Ware. */
  statistikVon(sp: number): SichtStatistik {
    const d = this.doerfer[sp];
    if (!d) throw new Error(`Spieler ${sp} gibt es nicht`);
    return { takt: d.statTakt, punkte: d.statPunkte.map((p) => p.slice()) };
  }

  // ------------------------------------------------------------------ Bauarbeiter und Planierer (Drehbuch 4.5)

  /** Nächstes verbundenes Lager zur Fahne `f` (Laufzeit), oder undefined. Netze verschiedener Spieler sind getrennt. */
  private naechstesLager(f: Id): Gebaeude | undefined {
    let best: Gebaeude | undefined, bd = Infinity;
    for (const l of this.gebaeude.values()) {
      if (!istLager(l)) continue;
      const d = this.distZu(l.fahne).get(f);
      if (d !== undefined && d < bd) { bd = d; best = l; }
    }
    return best;
  }

  /** Braucht die Baustelle gerade einen Baumann dieses Berufs (0 Bauarbeiter, 1 Planierer)? */
  private brauchtBaumann(g: Gebaeude, beruf: 0 | 1): boolean {
    if (g.fertig || g.getrennt) return false;
    if (beruf === 1) return g.planIst < g.planSoll && !g.planierer;
    return g.planIst >= g.planSoll && !g.bauer && summe(g.stapel) > 0;
  }

  /** Freie Bauleute aus dem Lager von `sp` zu dessen Baustellen schicken (Priorität absteigend, dann Id). */
  private bauleuteSchicken(sp: number): void {
    const d = this.doerfer[sp];
    if (d.bauFrei <= 0 && d.planFrei <= 0) return;
    const baustellen: Gebaeude[] = [];
    for (const g of this.gebaeude.values()) if (g.sp === sp && !g.fertig && !g.getrennt) baustellen.push(g);
    if (!baustellen.length) return;
    baustellen.sort((x, y) => y.prio - x.prio || x.id - y.id);
    for (const g of baustellen) {
      for (const beruf of [1, 0] as const) {
        if ((beruf === 0 ? d.bauFrei : d.planFrei) <= 0 || !this.brauchtBaumann(g, beruf)) continue;
        const l = this.naechstesLager(g.fahne);
        const r = l ? this.fahnenRoute(l.fahne, g.fahne) : null;
        if (!r || r.hexe.length < 2) continue;
        const b: Baumann = { id: this.naechsteId++, sp, beruf, ziel: g.id, phase: BM_GEHT, route: r.hexe, ri: 0, t: 0, dauer: this.karte.schritt(r.hexe[0], r.hexe[1]) };
        this.bauleute.set(b.id, b);
        if (beruf === 0) { d.bauFrei--; g.bauer = b.id; } else { d.planFrei--; g.planierer = b.id; }
      }
    }
  }

  /** Baumann ist zurück im Lager (Vorrat). */
  private baumannHeim(b: Baumann): void {
    this.bauleute.delete(b.id);
    const d = this.doerfer[b.sp];
    if (b.beruf === 0) d.bauFrei++; else d.planFrei++;
  }

  /**
   * An Fahne `f` angekommen ohne Auftrag: nächste Baustelle, die diesen Beruf braucht (Priorität, dann kürzester Weg), sonst Heimweg
   * zum nächsten Lager. Ohne Verbindung geht er querfeldein nach Hause (sofort im Vorrat).
   */
  private baumannWeiter(b: Baumann, f: Id): void {
    let ziel: Gebaeude | undefined, bp = 0, bd = Infinity;
    for (const g of this.gebaeude.values()) {
      if (g.sp !== b.sp || !this.brauchtBaumann(g, b.beruf)) continue;
      const d = this.distZu(g.fahne).get(f);
      if (d === undefined) continue;
      if (g.prio > bp || (g.prio === bp && d < bd)) { bp = g.prio; bd = d; ziel = g; }
    }
    if (ziel) {
      const r = this.fahnenRoute(f, ziel.fahne);
      if (r) {
        b.ziel = ziel.id;
        if (b.beruf === 0) ziel.bauer = b.id; else ziel.planierer = b.id;
        this.baumannLos(b, r.hexe);
        return;
      }
    }
    const l = this.naechstesLager(f);
    if (!l || l.fahne === f) { this.baumannHeim(b); return; }
    const r = this.fahnenRoute(f, l.fahne);
    if (!r) { this.baumannHeim(b); return; }
    b.ziel = 0;
    this.baumannLos(b, r.hexe);
  }

  private baumannLos(b: Baumann, route: number[]): void {
    b.route = route; b.ri = 0; b.t = 0;
    b.phase = BM_GEHT;
    if (route.length < 2) { b.dauer = 0; this.baumannAngekommen(b); return; }
    b.dauer = this.karte.schritt(route[0], route[1]);
  }

  /** Der Baumann gibt seine Baustelle ab (fertig, abgerissen, nichts mehr zu tun) und geht weiter. */
  private baumannFertig(b: Baumann): void {
    const g = b.ziel ? this.gebaeude.get(b.ziel) : undefined;
    if (g) { if (g.bauer === b.id) g.bauer = 0; if (g.planierer === b.id) g.planierer = 0; }
    b.ziel = 0;
    if (b.phase === BM_GEHT && b.ri + 1 < b.route.length) {
      // mitten auf dem Weg: umdrehen und zurück zum Ausgangspunkt (einer Fahne)
      const rueck = b.route.slice(0, b.ri + 2).reverse();
      const dauer = this.karte.schritt(rueck[0], rueck[1]);
      b.route = rueck; b.ri = 0; b.t = Math.max(0, dauer - b.t); b.dauer = dauer;
      return;
    }
    const f = this.hexFahne[b.route[b.route.length - 1]];
    if (!f) { this.baumannHeim(b); return; }
    this.baumannWeiter(b, f);
  }

  private baumannAngekommen(b: Baumann): void {
    b.t = 0; b.dauer = 0;
    if (b.ziel) { b.phase = BM_WARTET; return; }
    const f = this.hexFahne[b.route[b.route.length - 1]];
    const g = f ? this.gebaeude.get(this.fahnen.get(f)!.gebaeude) : undefined;
    if (!f || (g && istLager(g))) { this.baumannHeim(b); return; }
    b.phase = BM_WARTET;
    this.baumannWeiter(b, f);
  }

  private baumannSchritt(b: Baumann): void {
    if (b.phase === BM_GEHT) {
      if (b.ziel && !this.gebaeude.has(b.ziel)) { this.baumannFertig(b); return; }
      if (this.bremst(this.wegeProzent(b.route[b.ri]), b.id)) return;
      b.t++;
      if (b.t < b.dauer) return;
      b.t = 0; b.ri++;
      if (b.ri >= b.route.length - 1) this.baumannAngekommen(b);
      else b.dauer = this.karte.schritt(b.route[b.ri], b.route[b.ri + 1]);
      return;
    }
    const g = this.gebaeude.get(b.ziel);
    if (!g || g.fertig) { this.baumannFertig(b); return; }
    if (b.beruf === 1) {
      // Planierer: ebnet den Platz Tick für Tick
      b.phase = BM_ARBEIT; b.dauer = g.planSoll;
      g.planIst++; b.t = g.planIst;
      if (g.planIst >= g.planSoll) this.baumannFertig(b);
      return;
    }
    if (g.planIst < g.planSoll) { b.phase = BM_WARTET; return; }
    if (b.phase === BM_ARBEIT) {
      b.t++;
      if (b.t < b.dauer) return;
      const a = g.haende;
      g.haende = -1;
      b.phase = BM_WARTET; b.t = 0;
      if (a >= 0) this.verbauen(g, a);
      if (g.fertig) { this.baumannFertig(b); return; }
    }
    // nächste Ware vom Stapel nehmen; ist nichts da und nichts unterwegs, wird er woanders gebraucht
    for (let a = 0; a < g.stapel.length; a++) {
      if (g.stapel[a] <= 0) continue;
      g.stapel[a]--; g.haende = a;
      const vk = this.vkVon(b.sp);
      let pz = vk.bauzeit;
      if (this.karte.terrain[g.h] === 4) pz = Math.floor((pz * vk.moorBauzeit) / 100);
      b.phase = BM_ARBEIT; b.t = 0; b.dauer = Math.max(1, Math.floor((BAU_JE_WARE * pz) / 100));
      // Südeifeler: beim Ausschachten tauchen alte Steine auf – erst mal gucken
      if (vk.altsteinProzent && this.zufall(100) < vk.altsteinProzent) { b.dauer += vk.altsteinTicks; this.ereignis(b.sp, 'altstein', g.id, 0); }
      return;
    }
    if (summe(g.incoming) === 0) this.baumannFertig(b);
  }

  // ------------------------------------------------------------------ Jahreszeiten und Wetter (Drehbuch 7.4)

  /** Ereignisse am Tick: neue Jahreszeit, Wetter angekündigt (Bauernregel), Hochwasser beginnt (Waren schwimmen davon). */
  private jahrEreignisse(): void {
    const t = this._tick;
    if (t > 0 && t % JAHRESZEIT_TICKS === 0) for (let sp = 0; sp < this.doerfer.length; sp++) this.ereignis(sp, 'jahreszeit', 0, this.jz);
    for (const e of this.kalender.kommend(t)) {
      if (e.start - WETTER_ANKUENDIGUNG === t) for (let sp = 0; sp < this.doerfer.length; sp++) this.ereignis(sp, 'wetter', 0, e.art);
      if (e.start === t && WETTER[e.art].hochwasser) this.hochwasserBeginnt(WETTER[e.art].wegschwimmen);
    }
  }

  /** An jeder Fahne in der Aue schwimmen bis zu `n` Waren davon (die obersten). Gebäude und Bewohner bleiben (Drehbuch 7.4). */
  private hochwasserBeginnt(n: number): void {
    for (const f of this.fahnen.values()) {
      if (!this.lageAue[f.h]) continue;
      for (let i = 0; i < n && f.waren.length; i++) this.wareVerloren(f.waren.pop()!);
    }
  }

  // ------------------------------------------------------------------ Beschwipste Boten (DESIGN §10.3)

  /**
   * Torkelnder Gehweg querfeldein von a nach b: meist ein Schritt näher (bei mehreren der Zufall), in BOTE_TORKELN_PROZENT der Fälle
   * zur Seite (gleicher Abstand); nach zu vielen Seitenschritten nur noch geradeaus. Blockiert Wasser den direkten Weg, die Pfadsuche.
   */
  private torkelPfad(a: number, b: number): number[] | null {
    const k = this.karte, weg = [a];
    let c = a, seite = 0;
    const seiteMax = 2 + k.abstand(a, b);
    while (c !== b) {
      const dc = k.abstand(c, b);
      const vor: number[] = [], quer: number[] = [];
      for (let d = 0; d < 6; d++) {
        const n = k.nachbarn[c * 6 + d];
        if (n < 0 || !k.begehbar[n]) continue;
        const dn = k.abstand(n, b);
        if (dn === dc - 1) vor.push(n);
        else if (dn === dc && n !== weg[weg.length - 2]) quer.push(n);
      }
      if (!vor.length) {
        const p = sucheWeg(k, c, b, () => true, 4 * WEG_MAX_SCHRITTE);
        if (!p) return null;
        for (let i = 1; i < p.length; i++) weg.push(p[i]);
        return weg;
      }
      if (quer.length && seite < seiteMax && this.zufall(100) < BOTE_TORKELN_PROZENT) { c = quer[this.zufall(quer.length)]; seite++; }
      else c = vor[vor.length > 1 ? this.zufall(vor.length) : 0];
      weg.push(c);
    }
    return weg;
  }

  private boteLos(b: Bote, phase: number, route: number[]): void {
    b.phase = phase; b.route = route; b.ri = 0; b.t = 0;
    b.dauer = route.length > 1 ? this.karte.schritt(route[0], route[1]) : 0;
  }

  /** Hex, auf dem der Bote gerade steht. */
  private boteHex(b: Bote): number { return b.route[Math.min(b.ri, b.route.length - 1)]; }

  /** Ein freier Bote holt Ware `a` aus Lager `l` und bringt sie querfeldein zu `g`. false, wenn keiner frei ist oder kein Weg geht. */
  private boteSchicken(g: Gebaeude, a: number, l: Gebaeude): boolean {
    let best: Bote | undefined, bd = Infinity;
    for (const b of this.boten.values()) {
      if (b.sp !== g.sp || b.phase !== BO_WARTET || b.bis <= this._tick) continue;
      const d = this.karte.abstand(this.boteHex(b), l.h);
      if (d < bd) { bd = d; best = b; }
    }
    if (!best) return false;
    const hin = this.torkelPfad(this.boteHex(best), l.h);
    if (!hin) return false;
    l.vorrat[a]--;
    g.incoming[a]++;
    best.art = a; best.ziel = g.id; best.lager = l.id; best.faellt = -1;
    this.boteLos(best, BO_HOLT, hin);
    if (hin.length < 2) this.boteAngekommen(best);
    return true;
  }

  /** Bote bringt seine Ware ins nächste Lager seines Dorfs (Ziel weg oder aufgelesene Ware). */
  private boteHeim(b: Bote): void {
    const h = this.boteHex(b);
    let l: Gebaeude | undefined, bd = Infinity;
    for (const x of this.gebaeude.values()) {
      if (x.sp !== b.sp || !istLager(x)) continue;
      const d = this.karte.abstand(x.h, h);
      if (d < bd) { bd = d; l = x; }
    }
    b.ziel = 0;
    const weg = l ? this.torkelPfad(h, l.h) : null;
    if (!l || !weg) {
      // kein Weg: die Ware landet trotzdem im Lager (nichts geht verloren, Drehbuch 7.4)
      if (l && b.art >= 0) l.vorrat[b.art]++;
      b.art = -1; b.lager = 0; this.boteLos(b, BO_WARTET, [h]);
      return;
    }
    b.lager = l.id;
    this.boteLos(b, BO_HEIM, weg);
    if (weg.length < 2) this.boteAngekommen(b);
  }

  private boteAngekommen(b: Bote): void {
    const h = this.boteHex(b);
    b.t = 0; b.dauer = 0;
    switch (b.phase) {
      case BO_HOLT: {
        const ziel = b.ziel ? this.gebaeude.get(b.ziel) : undefined;
        if (!ziel) { this.boteHeim(b); return; }
        const weg = this.torkelPfad(h, ziel.h);
        if (!weg) {
          // nicht hinzukommen: Ware zurück ins Lager, Bestellung löst sich
          const l = this.gebaeude.get(b.lager);
          if (l) l.vorrat[b.art]++;
          if (ziel.incoming[b.art] > 0) ziel.incoming[b.art]--;
          b.art = -1; b.ziel = 0; b.lager = 0; this.boteLos(b, BO_WARTET, [h]);
          return;
        }
        // jede BOTE_VERLIERT_JEDE-te Ware fällt unterwegs herunter
        b.faellt = weg.length > 2 && this.zufall(BOTE_VERLIERT_JEDE) === 0 ? weg.length >> 1 : -1;
        this.boteLos(b, BO_BRINGT, weg);
        if (weg.length < 2) this.boteAngekommen(b);
        return;
      }
      case BO_BRINGT: {
        const g = b.ziel ? this.gebaeude.get(b.ziel) : undefined;
        if (!g || g.sp !== b.sp) { this.boteHeim(b); return; }
        if (g.incoming[b.art] > 0) g.incoming[b.art]--;
        if (istLager(g)) g.vorrat[b.art]++;
        else if (!g.fertig) g.stapel[b.art]++;
        else g.puffer[b.art]++;
        this.stat.angekommen++;
        b.art = -1; b.ziel = 0; b.lager = 0;
        this.boteLos(b, BO_WARTET, [h]);
        return;
      }
      case BO_SAMMELT: {
        const i = this.liegend.findIndex((x) => x.bote === b.id);
        if (i < 0) { this.boteLos(b, BO_WARTET, [h]); return; }
        b.art = this.liegend[i].art;
        this.liegend.splice(i, 1);
        this.boteHeim(b);
        return;
      }
      case BO_HEIM: {
        const l = this.gebaeude.get(b.lager);
        if (!l || !istLager(l)) { this.boteHeim(b); return; }
        if (b.art >= 0) { l.vorrat[b.art]++; this.stat.angekommen++; }
        b.art = -1; b.lager = 0;
        this.boteLos(b, BO_WARTET, [h]);
        return;
      }
      default: this.boteLos(b, BO_WARTET, [h]);
    }
  }

  /** Bote lässt seine Ware fallen: sie bleibt liegen, die Bestellung löst sich (das Ziel bestellt neu). */
  private boteVerliert(b: Bote): void {
    const h = this.boteHex(b);
    const g = this.gebaeude.get(b.ziel);
    if (g && g.incoming[b.art] > 0) g.incoming[b.art]--;
    this.liegend.push({ h, art: b.art, sp: b.sp, bis: this._tick + AUFSAMMELN_TICKS, bote: 0 });
    this.ereignis(b.sp, 'verloren', 0, b.art);
    const e = this.doerfer[b.sp].ereignisse;
    e[e.length - 1].q = this.karte.qs[h]; e[e.length - 1].r = this.karte.rs[h];
    b.art = -1; b.ziel = 0; b.lager = 0; b.faellt = -1;
    this.boteLos(b, BO_WARTET, [h]);
  }

  private boteSchritt(b: Bote): void {
    if (b.ri + 1 < b.route.length) {
      if (this.bremst(this.wegeProzent(b.route[b.ri]), b.id)) return;
      b.t++;
      if (b.t < b.dauer) return;
      b.t = 0; b.ri++;
      if (b.phase === BO_BRINGT && b.ri === b.faellt && b.art >= 0) { this.boteVerliert(b); return; }
      if (b.ri + 1 < b.route.length) { b.dauer = this.karte.schritt(b.route[b.ri], b.route[b.ri + 1]); return; }
      this.boteAngekommen(b);
      return;
    }
    if (b.phase !== BO_WARTET) { this.boteAngekommen(b); return; }
    // Schwips verflogen: zurück in den Vorrat
    if (b.bis <= this._tick) {
      this.boten.delete(b.id);
      this.doerfer[b.sp].frei++;
      return;
    }
    // ab und zu nach liegenden Waren sehen
    if ((this._tick + b.id) % 20 !== 0) return;
    const h = this.boteHex(b);
    let best: Liegend | undefined, bd = Infinity;
    for (const x of this.liegend) {
      if (x.sp !== b.sp || x.bote) continue;
      const d = this.karte.abstand(x.h, h);
      if (d < bd) { bd = d; best = x; }
    }
    if (!best) return;
    const weg = this.torkelPfad(h, best.h);
    if (!weg) return;
    best.bote = b.id;
    this.boteLos(b, BO_SAMMELT, weg);
    if (weg.length < 2) this.boteAngekommen(b);
  }

  /** Liegengebliebenes, das kein Bote holt, liest nach AUFSAMMELN_TICKS ein Bewohner auf und bringt es ins nächste Lager. */
  private aufsammeln(): void {
    if (!this.liegend.length) return;
    this.liegend = this.liegend.filter((x) => {
      if (x.bote && this.boten.get(x.bote)?.phase === BO_SAMMELT) return true;
      x.bote = 0;
      if (x.bis > this._tick) return true;
      let l: Gebaeude | undefined, bd = Infinity;
      for (const g of this.gebaeude.values()) {
        if (g.sp !== x.sp || !istLager(g)) continue;
        const d = this.karte.abstand(g.h, x.h);
        if (d < bd) { bd = d; l = g; }
      }
      if (l) l.vorrat[x.art]++;
      return false;
    });
  }

  // ------------------------------------------------------------------ Träger

  private traegerPhase(): void {
    let frei = 0;
    for (const d of this.doerfer) frei += d.frei;
    if (frei > 0) {
      for (const s of this.segmente.values()) {
        if (s.traeger === 0 && this.doerfer[s.sp].frei > 0 && this.verbunden.has(s.a)) this.traegerAnfordern(s);
      }
    }
    for (const t of this.traeger.values()) this.traegerSchritt(t);
  }

  private traegerAnfordern(s: Segment): void {
    let best: { l: Gebaeude; e: Id; d: number } | null = null;
    for (const e of [s.a, s.b]) {
      const dm = this.distZu(e);
      for (const l of this.gebaeude.values()) {
        if (l.sp !== s.sp || !istLager(l)) continue;
        const d = dm.get(l.fahne);
        if (d !== undefined && (!best || d < best.d)) best = { l, e, d };
      }
    }
    if (!best) return;
    const r = this.fahnenRoute(best.l.fahne, best.e);
    if (!r) return;
    const route = r.hexe, segs = r.segs;
    const ende: 0 | 1 = best.e === s.a ? 0 : 1;
    const t: Traeger = {
      id: this.naechsteId++, sp: s.sp, seg: s.id, phase: route.length > 1 ? 0 : 1, ende,
      pos: ende === 0 ? 0 : s.pfad.length - 1, dir: 1, t: 0, dauer: route.length > 1 ? this.karte.schritt(route[0], route[1]) : 0,
      pause: 0, art: -1, ziel: 0, warte: 0, route: route.length > 1 ? route : [], ri: 0, routeSegs: segs,
    };
    if (route.length <= 1) t.routeSegs = [];
    this.traeger.set(t.id, t);
    s.traeger = t.id;
    this.doerfer[s.sp].frei--;
  }

  /** Weg über das Netz von Fahne `von` zu Fahne `nach` entlang des Gradienten der Distanz: Hex-Indizes (beide Fahnen eingeschlossen) und Segmente; null ohne Verbindung. */
  private fahnenRoute(von: Id, nach: Id): { hexe: number[]; segs: Id[] } | null {
    const dm = this.distZu(nach);
    const start = this.fahnen.get(von);
    if (!start || !dm.has(von)) return null;
    let cur: Fahne = start;
    const hexe: number[] = [cur.h];
    const segs: Id[] = [];
    while (cur.id !== nach) {
      const cd = dm.get(cur.id)!;
      let weiter: Segment | null = null;
      for (const sid of cur.segmente) {
        const x = this.segmente.get(sid)!;
        const o = x.a === cur.id ? x.b : x.a;
        const d = dm.get(o);
        if (d !== undefined && d + this.segmentKostenVon(x, cur.id) === cd) { weiter = x; break; }
      }
      if (!weiter) return null;
      const pfad = weiter.a === cur.id ? weiter.pfad : weiter.pfad.slice().reverse();
      for (let i = 1; i < pfad.length; i++) hexe.push(pfad[i]);
      segs.push(weiter.id);
      cur = this.fahnen.get(weiter.a === cur.id ? weiter.b : weiter.a)!;
    }
    return { hexe, segs };
  }

  private traegerSchritt(t: Traeger): void {
    const s = this.segmente.get(t.seg)!;
    if (t.pause > 0) { t.pause--; return; }
    if (t.phase !== 1 && this.bremst(this.wegeProzent(t.phase === 0 ? t.route[t.ri] : s.pfad[t.pos]), t.id)) return;
    if (t.phase === 0) {
      t.t++;
      if (t.t >= t.dauer) {
        t.t = 0; t.ri++;
        if (t.ri >= t.route.length - 1) {
          const letzter = t.route[t.route.length - 1];
          t.phase = 1; t.ende = letzter === s.pfad[0] ? 0 : 1; t.pos = t.ende === 0 ? 0 : s.pfad.length - 1;
          t.route = []; t.routeSegs = []; t.ri = 0; t.dauer = 0;
          this.bedienen(t, s);
        } else t.dauer = this.karte.schritt(t.route[t.ri], t.route[t.ri + 1]);
      }
    } else if (t.phase === 2) {
      t.t++;
      if (t.t >= t.dauer) {
        t.t = 0; t.pos += t.dir;
        if (t.pos === 0 || t.pos === s.pfad.length - 1) {
          t.phase = 1; t.ende = t.pos === 0 ? 0 : 1; t.dauer = 0;
          this.bedienen(t, s);
        } else t.dauer = this.karte.schritt(s.pfad[t.pos], s.pfad[t.pos + t.dir]);
      }
    } else {
      this.bedienen(t, s);
    }
  }

  /** Index der ersten Ware in z, die über Segment s weiterläuft, oder -1. */
  private findeWare(z: Fahne, s: Segment): number {
    for (let i = 0; i < z.waren.length; i++) if (this.wareHop(z, z.waren[i]) === s.id) return i;
    return -1;
  }

  /** Kann z eine Ware vom Segment s annehmen: freier Platz (inkl. Unterwegs) oder Tauschpartner für s. */
  private darfZu(z: Fahne, s: Segment): boolean {
    return this.platz(z) || this.findeWare(z, s) >= 0;
  }

  /** Noch ein Notplatz frei an z (FLAG_CAP + NOTPLAETZE, inkl. Unterwegs)? */
  private notPlatz(z: Fahne): boolean { return z.waren.length + this.inbGet(z.id) < FLAG_CAP + NOTPLAETZE; }

  /** Ware ist an ihrer Zielfahne (das Gebäude dort nimmt sie gleich ab). */
  private amZiel(w: Ware, z: Fahne): boolean {
    const g = w.ziel ? this.gebaeude.get(w.ziel) : undefined;
    return !!g && g.fahne === z.id;
  }

  /** Index der ersten Ware in z, die über s zu ihrer Zielfahne am anderen Ende o läuft (Direktlieferung), oder -1. */
  private findeDirekt(z: Fahne, s: Segment, o: Fahne): number {
    for (let i = 0; i < z.waren.length; i++) if (this.wareHop(z, z.waren[i]) === s.id && this.amZiel(z.waren[i], o)) return i;
    return -1;
  }

  private losgehen(t: Traeger, s: Segment): void {
    t.phase = 2;
    t.dir = t.ende === 0 ? 1 : -1;
    t.pos = t.ende === 0 ? 0 : s.pfad.length - 1;
    t.t = 0;
    t.dauer = this.karte.schritt(s.pfad[t.pos], s.pfad[t.pos + t.dir]);
  }

  /** Träger steht an einem Ende: ablegen/tauschen, aufnehmen, weitergehen (DESIGN §4.4). */
  private bedienen(t: Traeger, s: Segment): void {
    const x = this.fahnen.get(t.ende === 0 ? s.a : s.b)!;
    const y = this.fahnen.get(t.ende === 0 ? s.b : s.a)!;
    if (t.art >= 0) {
      // Träger liefern nur (Drehbuch 4.5): auch an der Baustelle wird abgelegt, den Stapel holt sie sich von der Fahne
      // Am Ziel darf er auch auf einen Notplatz ablegen: das Gebäude nimmt die Ware gleich ab (gegen Verklemmung)
      if (x.waren.length < FLAG_CAP || (this.amZiel({ art: t.art, ziel: t.ziel }, x) && x.waren.length < FLAG_CAP + NOTPLAETZE)) {
        const w: Ware = { art: t.art, ziel: t.ziel };
        if (w.ziel && !this.zielOk(w, x)) { this.wareZielLoesen(w); this.wareZielSetzen(w, x); }
        x.waren.push(w);
        this.inbAdd(x.id, -1);
        t.art = -1; t.ziel = 0; t.warte = 0; t.pause = UEBERGABE_TICKS;
        return;
      }
      // Tausch an voller Fahne: ablegen (Notplatz) und im selben Schritt die Ware für die Rückrichtung mitnehmen; die andere Seite
      // muss sie annehmen können, notfalls auf einem Notplatz (sonst drehen sich zwei volle Fahnen im Kreis nicht frei)
      const pi = this.findeWare(x, s);
      if (pi >= 0 && (this.darfZu(y, s) || this.notPlatz(y))) {
        const v = x.waren[pi];
        x.waren.splice(pi, 1);
        const w: Ware = { art: t.art, ziel: t.ziel };
        if (w.ziel && !this.zielOk(w, x)) { this.wareZielLoesen(w); this.wareZielSetzen(w, x); }
        x.waren.push(w);
        this.inbAdd(x.id, -1); this.inbAdd(y.id, 1);
        t.art = v.art; t.ziel = v.ziel; t.warte = 0; t.pause = UEBERGABE_TICKS;
        s.verkehr = Math.min(255, s.verkehr + 16);
        this.losgehen(t, s);
        return;
      }
      t.warte++;
      if (t.warte > this.stat.maxWarte) this.stat.maxWarte = t.warte;
      return;
    }
    {
      const i = this.darfZu(y, s) ? this.findeWare(x, s) : this.notPlatz(y) ? this.findeDirekt(x, s, y) : -1;
      if (i >= 0) {
        const v = x.waren[i];
        x.waren.splice(i, 1);
        t.art = v.art; t.ziel = v.ziel; t.pause = UEBERGABE_TICKS;
        this.inbAdd(y.id, 1);
        s.verkehr = Math.min(255, s.verkehr + 16);
        this.losgehen(t, s);
        return;
      }
    }
    // leer zum anderen Ende, wenn dort etwas für dieses Segment liegt (bei voller Fahne hier nur eine Direktlieferung)
    if ((this.darfZu(x, s) && this.findeWare(y, s) >= 0) || (this.notPlatz(x) && this.findeDirekt(y, s, x) >= 0)) this.losgehen(t, s);
  }
}
