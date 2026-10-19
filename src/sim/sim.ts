// Deterministischer Simulationskern (Drehbuch 4.1, 8.3; DESIGN §3–4): Fahnen, Wege, Träger, Routing, Warenfluss, Baustellen,
// Bäume und Felsen, Arbeiter, Abriss. Nur Ganzzahlen, fester Tick, Zufall nur aus der Saat. Intern werden Hexe als Karten-Index geführt.
import { FLAG } from '../welt/format';
import { Fnv2 } from '../welt/pruefsumme';
import {
  ARBEIT_MITTE_MAX, BAU_JE_WARE, BAUM_HEIDE_PROZENT, BAUM_MOOR_PROZENT, BAUM_WACHSEN, BAUM_WIESE_PROZENT, FAHNE_MAX_SEGMENTE,
  FELS_LESE, FELS_LESE_START, FELS_STEIL, FELS_STEIN, FLAG_CAP, GEBAEUDE, KIRMES, LESE_PROZENT, NAHRUNG, NAHRUNG_REIHE, NAHRUNG_ZYKLUS,
  NOTNAGEL_FREI_UNTER, NOTNAGEL_TICKS, NOTPLAETZE, planierTicks, PRIO_MAX, PRIO_MIN, PRIO_STANDARD,
  RODUNG_STAMM_MAX, START_BAUARBEITER, START_BEWOHNER, START_PLANIERER, START_STEIN_ABSTAND_MIN, START_STEIN_MIN, START_STEIN_RADIUS,
  START_VORRAT, STEIL_GRAD, SUCHE_WARTE, TREE_MAX, UEBERGABE_TICKS, WARE, WAREN, WEG_MAX_SCHRITTE,
} from './daten';
import type { GebaeudeTyp } from './daten';
import { SimKarte } from './karte';
import { FELS_FELS, FELS_KLIPPE, FELS_LESE as ART_LESE, hashHex, hashHex2, hashHex3 } from './natur';
import { sucheWeg, ZahlenHeap } from './pfad';
import { PROMILLE } from './typen';
import type {
  Befehl, GebaeudeZustand, Id, KarteDaten, Protokoll, ProtokollEintrag, SichtArbeiter, SichtBaumann, SichtEreignis, SichtNatur, SimSicht,
  StartDaten,
} from './typen';

interface Ware { art: number; ziel: Id }

interface Fahne { id: Id; h: number; gebaeude: Id; waren: Ware[]; segmente: Id[] }

interface Segment {
  id: Id; a: Id; b: Id;
  /** Hex-Indizes von Fahne a bis Fahne b. */
  pfad: number[];
  traeger: Id;
  verkehr: number;
  /** Laufzeit a→b und b→a in Ticks. */
  kab: number; kba: number;
}

/** phase 0 = Anmarsch vom Lager, 1 = wartet an einem Ende, 2 = läuft auf dem Segment. */
interface Traeger {
  id: Id; seg: Id; phase: 0 | 1 | 2;
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
  id: Id; typ: string; h: number; fahne: Id;
  /** 1 = fertig gebaut (Lager von Anfang an). */
  fertig: 0 | 1;
  /** Bisher verbautes Material je Warenart und Baustellen-Priorität. */
  verbaut: number[];
  prio: number;
  getrennt: boolean;
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
}

/** Phasen eines Baumanns: geht über die Wege, arbeitet an der Baustelle, wartet dort auf Material. */
const BM_GEHT = 0, BM_ARBEIT = 1, BM_WARTET = 2;

/** Bauarbeiter (beruf 0) oder Planierer (beruf 1), Drehbuch 4.5. */
interface Baumann {
  id: Id; beruf: 0 | 1;
  /** Ziel-Baustelle (0 = Heimweg ins Lager). */
  ziel: Id;
  phase: number;
  /** Gehweg als Hex-Indizes, Position, Ticks im Schritt und dessen Dauer; beim Arbeiten t/dauer der Arbeit. */
  route: number[]; ri: number; t: number; dauer: number;
}

const EREIGNISSE_MAX = 32;

const DIST_K = 1 << 21;
const ALLE_WAREN: readonly number[] = WAREN.map((_, i) => i);

/** Reihenfolge der fertigen Abnehmer: 0 Kirmesplatz, 1 Verarbeiter, 2 Wohnhaus. */
function abnehmerRang(t: GebaeudeTyp): number {
  return t.funktion === 'kirmes' ? 0 : t.funktion === 'wohnen' ? 2 : 1;
}

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
  /** Abweichende Startbewohner (nur fürs Protokoll). */
  private readonly startBewohner: number | undefined;
  private _tick = 0;
  private rng: number;
  private naechsteId = 1;
  /** Bewohner gesamt (frei + Träger + Arbeiter) und davon frei im Vorrat (DESIGN §5). */
  private bewohner: number;
  private frei: number;
  /** Bauleute (Drehbuch 4.5): Gesamtzahl und frei im Lager, je Bauarbeiter und Planierer. */
  private bauGesamt = START_BAUARBEITER;
  private bauFrei = START_BAUARBEITER;
  private planGesamt = START_PLANIERER;
  private planFrei = START_PLANIERER;
  private bauleute = new Map<Id, Baumann>();
  /** Dorfstufe (0 Weiler …), laufendes Fest (Restticks), Notnagel-Uhr. */
  private dorfStufe = 0;
  private fest = 0;
  private notnagelT = 0;
  private ereignisse: SichtEreignis[] = [];
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
  private verbundenNeu = true;
  private inb = new Map<Id, number>();
  private natCache: SichtNatur | null = null;
  private natHash: { rev: number; hex: string } | null = null;
  /** Freier Wohnraum zu Beginn des Ticks (abgeleitet). */
  private wohnFrei = 0;

  constructor(karteDaten: KarteDaten, saat: number, start: StartDaten) {
    this.karte = new SimKarte(karteDaten);
    this.saat = saat | 0;
    this.startBewohner = start.bewohner;
    this.bewohner = this.frei = Math.max(0, Math.floor(start.bewohner ?? START_BEWOHNER));
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
    const h = this.karte.index(start.q, start.r);
    if (h < 0 || !this.karte.begehbar[h]) throw new Error('Startlager liegt nicht auf begehbarem Boden');
    const lager = this.gebaeudeErzeugen('lager', h, true);
    lager.vorrat = START_VORRAT.slice();
    this.fairerStart(h);
    this.felsArtKopie = this.felsArt.slice();
    this.baumStartKopie = this.baumStart.slice();
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
        for (const e of jetzt) { this.fuehreAus(e.befehl); this.befehlZahl++; }
      }
    }
    if (this.verbundenNeu) this.verbindungenNeu();
    this.inbNeu();
    this.wohnFrei = this.wohnraumFrei();
    for (const g of this.gebaeude.values()) this.gebaeudeTick(g);
    this.dorfTick();
    if (t % 10 === 0) { this.baeumeWachsen(); this.zielePruefen(); }
    if (t % 4 === 0) { this.lagerPull(); this.bauleuteSchicken(); }
    for (const b of [...this.bauleute.values()]) this.baumannSchritt(b);
    this.traegerPhase();
    if (t % 40 === 0) for (const s of this.segmente.values()) if (s.verkehr > 0) s.verkehr--;
    this._tick++;
  }

  protokoll(karteInfo: Protokoll['karte']): Protokoll {
    const l = this.lagerGebaeude();
    return {
      format: 1, karte: { ...karteInfo }, saat: this.saat,
      start: this.startBewohner === undefined ? { q: this.karte.qs[l.h], r: this.karte.rs[l.h] }
        : { q: this.karte.qs[l.h], r: this.karte.rs[l.h], bewohner: this.startBewohner },
      befehle: this.log.map((e) => ({ tick: e.tick, spieler: e.spieler, befehl: JSON.parse(JSON.stringify(e.befehl)) as Befehl })),
      ticks: this._tick,
    };
  }

  private lagerGebaeude(): Gebaeude {
    for (const g of this.gebaeude.values()) if (g.typ === 'lager') return g;
    throw new Error('kein Lager');
  }

  private fuehreAus(b: Befehl): void {
    const k = this.karte;
    switch (b.art) {
      case 'fahne': { const h = k.index(b.q, b.r); if (h >= 0 && this.hexKannFahne(h)) this.fahneSetzen(h); break; }
      case 'weg': {
        if (!Array.isArray(b.pfad)) break;
        this.wegBauen(b.pfad.map((p) => k.index(p.q, p.r)));
        break;
      }
      case 'gebaeude': {
        const h = k.index(b.q, b.r);
        if (h >= 0 && this.hexKannBauen(b.typ, h)) this.gebaeudeErzeugen(b.typ, h, false);
        break;
      }
      case 'abriss_fahne': this.fahneAbreissen(b.id); break;
      case 'abriss_weg': if (this.segmente.has(b.id)) this.segmentEntfernen(b.id, 0); break;
      case 'abriss_gebaeude': this.gebaeudeAbreissen(b.id); break;
      case 'arbeitsbereich': {
        const g = this.gebaeude.get(b.id);
        if (!g || !(GEBAEUDE[g.typ].radius > 0) || !Number.isInteger(b.q) || !Number.isInteger(b.r)) break;
        const m = k.index(b.q, b.r);
        if (m < 0 || !k.begehbar[m] || k.abstand(g.h, m) > ARBEIT_MITTE_MAX) break;
        g.mitte = m === g.h ? -1 : m;
        break;
      }
      case 'prioritaet': {
        const g = this.gebaeude.get(b.id);
        if (g && !g.fertig && Number.isInteger(b.stufe) && b.stufe >= PRIO_MIN && b.stufe <= PRIO_MAX) g.prio = b.stufe;
        break;
      }
    }
  }

  // ------------------------------------------------------------------ Abfragen für die Oberfläche

  kannFahne(q: number, r: number): boolean {
    const h = this.karte.index(q, r);
    return h >= 0 && this.hexKannFahne(h);
  }

  kannBauen(typ: string, q: number, r: number): boolean {
    const h = this.karte.index(q, r);
    return h >= 0 && this.hexKannBauen(typ, h);
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
  wegVorschau(von: { q: number; r: number }, nach: { q: number; r: number }): { q: number; r: number }[] | null {
    const k = this.karte;
    const a = k.index(von.q, von.r), z = k.index(nach.q, nach.r);
    if (a < 0 || z < 0 || a === z || !k.begehbar[a] || !k.begehbar[z]) return null;
    const fa = this.fahnen.get(this.hexFahne[a]);
    if (!fa || fa.segmente.length >= FAHNE_MAX_SEGMENTE) return null;
    if (this.hexFahne[z]) { if (this.fahnen.get(this.hexFahne[z])!.segmente.length >= FAHNE_MAX_SEGMENTE) return null; }
    else if (!this.hexKannFahne(z)) return null;
    const p = sucheWeg(k, a, z, (h, istZiel) => {
      if (istZiel) return true;
      return !this.hexFahne[h] && !this.hexGeb[h] && !this.hexWeg[h];
    }, WEG_MAX_SCHRITTE);
    return p ? p.map((h) => ({ q: k.qs[h], r: k.rs[h] })) : null;
  }

  /**
   * Teilstück eines selbst geführten Wegs: Pfad von `von` (muss keine Fahne tragen) nach `nach` (Fahne, Weg-Hex oder freier Hex,
   * der eine Fahne tragen kann). Zwischen den Enden nur freie Hexe, Hexe aus `belegt` (schon benutzte Hexe des offenen Wegs)
   * sind gesperrt, das Ziel darf nicht darunter sein. Höchstens `maxSchritte` Schritte; null, wenn es keinen gibt.
   */
  wegAbschnitt(von: { q: number; r: number }, nach: { q: number; r: number }, belegt: { q: number; r: number }[], maxSchritte: number): { q: number; r: number }[] | null {
    const k = this.karte;
    const a = k.index(von.q, von.r), z = k.index(nach.q, nach.r);
    if (a < 0 || z < 0 || a === z || !k.begehbar[a] || !k.begehbar[z] || maxSchritte < 1) return null;
    const gesperrt = new Set<number>();
    for (const b of belegt) { const i = k.index(b.q, b.r); if (i >= 0) gesperrt.add(i); }
    gesperrt.delete(a);
    if (gesperrt.has(z)) return null;
    const fa = this.fahnen.get(this.hexFahne[a]);
    if (fa && fa.segmente.length >= FAHNE_MAX_SEGMENTE) return null;
    if (this.hexFahne[z]) { if (this.fahnen.get(this.hexFahne[z])!.segmente.length >= FAHNE_MAX_SEGMENTE) return null; }
    else if (!this.hexKannFahne(z)) return null;
    const p = sucheWeg(k, a, z, (h, istZiel) => {
      if (istZiel) return true;
      return !this.hexFahne[h] && !this.hexGeb[h] && !this.hexWeg[h] && !gesperrt.has(h);
    }, Math.min(maxSchritte, WEG_MAX_SCHRITTE));
    return p ? p.map((h) => ({ q: k.qs[h], r: k.rs[h] })) : null;
  }

  sicht(): SimSicht {
    const k = this.karte;
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
        id: t.id, von: hx(von), nach: hx(nach),
        fortschritt: bewegt ? Math.floor((PROMILLE * t.t) / t.dauer) : 0,
        schritt: bewegt ? Math.max(1, Math.floor(PROMILLE / t.dauer)) : 0,
        ware: t.art, tut,
      };
    });
    return {
      tick: this._tick,
      fahnen: [...this.fahnen.values()].map((f) => ({ id: f.id, ...hx(f.h), waren: f.waren.map((w) => w.art), gebaeude: f.gebaeude })),
      segmente: [...this.segmente.values()].map((s) => ({ id: s.id, a: s.a, b: s.b, pfad: s.pfad.map(hx), traeger: s.traeger, verkehr: s.verkehr })),
      traeger: tr,
      gebaeude: [...this.gebaeude.values()].map((g) => {
        const t = GEBAEUDE[g.typ];
        const o: SimSicht['gebaeude'][number] = {
          id: g.id, typ: g.typ, ...hx(g.h), fahne: g.fahne,
          bau: this.bauStand(g, t),
          getrennt: g.getrennt, prioritaet: g.prio, zustand: this.zustandVon(g, t),
        };
        if (g.typ === 'lager') o.vorrat = g.vorrat.slice();
        if (!g.fertig) {
          o.bedarf = t.kosten.map((n, a) => Math.max(0, n - g.verbaut[a]));
          o.stapel = g.stapel.map((n, a) => n + (g.haende === a ? 1 : 0));
          if (g.planSoll > 0) o.planiert = Math.min(PROMILLE, Math.floor((PROMILLE * g.planIst) / g.planSoll));
        }
        if (this.hatEingang(t)) o.puffer = g.puffer.slice();
        if (t.ausgangMax > 0) o.ausgang = g.ausgang.slice();
        const ar = this.arbeiterSicht(g, t);
        if (ar) o.arbeiter = ar;
        if (g.mitte >= 0) o.mitte = hx(g.mitte);
        return o;
      }),
      freieTraeger: this.frei,
      natur: this.naturSicht(),
      bauleute: [...this.bauleute.values()].map((b) => this.baumannSicht(b)),
      dorf: this.dorfSicht(),
      ereignisse: this.ereignisse.map((e) => ({ ...e })),
    };
  }

  private baumannSicht(b: Baumann): SichtBaumann {
    const k = this.karte;
    const hx = (h: number) => ({ q: k.qs[h], r: k.rs[h] });
    const beruf = b.beruf === 0 ? 'bauarbeiter' : 'planierer';
    if (b.phase === BM_GEHT && b.ri + 1 < b.route.length) {
      return {
        id: b.id, beruf, von: hx(b.route[b.ri]), nach: hx(b.route[b.ri + 1]), ziel: b.ziel, tut: 'geht',
        fortschritt: b.dauer > 0 ? Math.min(PROMILLE - 1, Math.floor((PROMILLE * b.t) / b.dauer)) : 0,
        schritt: b.dauer > 0 ? Math.max(1, Math.floor(PROMILLE / b.dauer)) : 0,
      };
    }
    const h = hx(b.route[b.route.length - 1]);
    return { id: b.id, beruf, von: h, nach: h, ziel: b.ziel, tut: b.phase === BM_ARBEIT ? 'arbeitet' : 'wartet', fortschritt: 0, schritt: 0 };
  }

  private dorfSicht(): SimSicht['dorf'] {
    let arbeiter = 0, wohnraum = 0;
    for (const g of this.gebaeude.values()) { arbeiter += g.ar; if (g.fertig) wohnraum += GEBAEUDE[g.typ].wohnraum; }
    const ks = KIRMES[this.dorfStufe];
    const platz = this.kirmesPlatz();
    return {
      stufe: this.dorfStufe, bewohner: this.bewohner, frei: this.frei, traeger: this.traeger.size, arbeiter, wohnraum,
      bauarbeiter: { gesamt: this.bauGesamt, frei: this.bauFrei }, planierer: { gesamt: this.planGesamt, frei: this.planFrei },
      kirmes: ks ? {
        liste: ks.liste.slice(), geliefert: platz && platz.fertig ? platz.puffer.slice() : ks.liste.map(() => 0),
        platz: platz ? platz.id : 0, fest: this.fest, festDauer: ks.festTicks,
      } : null,
      notnagel: this.notnagelGreift() ? NOTNAGEL_TICKS - this.notnagelT : -1,
    };
  }

  /** Bäume und Felsen als Kopie; wird nur bei Änderung (rev) neu angelegt. */
  private naturSicht(): SichtNatur {
    if (!this.natCache || this.natCache.rev !== this.natRev) {
      this.natCache = { rev: this.natRev, baum: this.baum.slice(), jung: this.jung.slice(), stufe: this.stufe.slice(), fels: this.fels.slice(), felsArt: this.felsArtKopie, start: this.baumStartKopie };
    }
    return this.natCache;
  }

  private bauStand(g: Gebaeude, t: GebaeudeTyp): number {
    if (g.fertig || t.kostenSumme === 0) return PROMILLE;
    let v = 0;
    for (let a = 0; a < g.verbaut.length; a++) v += Math.min(g.verbaut[a], t.kosten[a]);
    return Math.min(PROMILLE - 1, Math.floor((PROMILLE * v) / t.kostenSumme));
  }

  private zustandVon(g: Gebaeude, t: GebaeudeTyp): GebaeudeZustand {
    if (g.typ === 'lager') return 'bereit';
    if (g.getrennt) return 'getrennt';
    if (!g.fertig) {
      if (g.planIst < g.planSoll) return g.planierer ? 'planieren' : 'kein_planierer';
      if (g.bauer) return 'baustelle';
      if (summe(g.stapel) > 0) return 'kein_bauarbeiter';
      return summe(g.incoming) > 0 ? 'baustelle' : 'wartet_material';
    }
    if (t.funktion === 'wohnen') {
      if (g.arbeit) return 'arbeitet';
      if (!this.nahrungIn(g)) return 'hunger';
      return 'wohnraum_voll';
    }
    if (t.funktion === 'kirmes') {
      if (this.fest > 0) return 'fest';
      return KIRMES[this.dorfStufe] ? 'wartet_material' : 'bereit';
    }
    if (t.arbeiter && !g.ar) return 'kein_arbeiter';
    if (t.funktion === 'verarbeiter') {
      if (g.arbeit) return 'arbeitet';
      if (g.ausgang[t.ausgangWare] >= t.ausgangMax) return 'voll';
      return g.puffer[t.wandelt!.ein] >= t.wandelt!.menge ? 'arbeitet' : 'wartet_material';
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
    for (const t of this.traeger.values()) {
      if (t.art >= 0) zaehle({ art: t.art, ziel: t.ziel });
      const s = this.segmente.get(t.seg);
      if (!s || s.traeger !== t.id) fehler.push(`Träger ${t.id}: Segment ${t.seg}`);
    }
    let arbeiter = 0;
    const bRes = new Map<number, number>(), fRes = new Map<number, number>();
    for (const g of this.gebaeude.values()) {
      const t = GEBAEUDE[g.typ];
      for (let a = 0; a < WAREN.length; a++) {
        const soll = inc.get(`${g.id}:${a}`) ?? 0;
        if (g.incoming[a] !== soll) fehler.push(`Gebäude ${g.id} incoming[${a}] ${g.incoming[a]} statt ${soll}`);
        if (g.verbaut[a] + g.stapel[a] + (g.haende === a ? 1 : 0) > t.kosten[a]) fehler.push(`Gebäude ${g.id}: mehr verbaut/angeliefert als nötig (Ware ${a})`);
        if (g.fertig && g.verbaut[a] < t.kosten[a]) fehler.push(`Gebäude ${g.id}: fertig ohne volles Material (Ware ${a})`);
        if (g.typ !== 'lager' && g.puffer[a] > this.pufferMax(g, t, a)) fehler.push(`Gebäude ${g.id}: Input-Puffer ${a} über Maximum`);
        if (g.ausgang[a] > (a === t.ausgangWare ? t.ausgangMax : 0)) fehler.push(`Gebäude ${g.id}: Output-Puffer ${a} über Maximum`);
      }
      arbeiter += g.ar;
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
    if (this.frei < 0 || this.frei + this.traeger.size + arbeiter !== this.bewohner) {
      fehler.push(`Bewohner: ${this.frei} frei + ${this.traeger.size} Träger + ${arbeiter} Arbeiter statt ${this.bewohner}`);
    }
    let bau = 0, plan = 0;
    for (const b of this.bauleute.values()) {
      if (b.beruf === 0) bau++; else plan++;
      const g = b.ziel ? this.gebaeude.get(b.ziel) : undefined;
      if (b.ziel && (!g || (b.beruf === 0 ? g.bauer : g.planierer) !== b.id)) fehler.push(`Baumann ${b.id}: Ziel ${b.ziel}`);
    }
    if (this.bauFrei < 0 || this.bauFrei + bau !== this.bauGesamt) fehler.push(`Bauarbeiter: ${this.bauFrei} frei + ${bau} unterwegs statt ${this.bauGesamt}`);
    if (this.planFrei < 0 || this.planFrei + plan !== this.planGesamt) fehler.push(`Planierer: ${this.planFrei} frei + ${plan} unterwegs statt ${this.planGesamt}`);
    for (const key of inc.keys()) {
      const id = Number(key.split(':')[0]);
      if (!this.gebaeude.has(id)) fehler.push(`Ware mit ungültigem Ziel ${id} (wird neu geroutet)`);
    }
    for (const s of this.segmente.values()) {
      if (!this.fahnen.has(s.a) || !this.fahnen.has(s.b)) fehler.push(`Segment ${s.id}: Fahne fehlt`);
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
    w(this._tick); w(this.rng); w(this.saat); w(this.naechsteId); w(this.frei); w(this.befehlZahl);
    w(this.bewohner); w(this.bauGesamt); w(this.bauFrei); w(this.planGesamt); w(this.planFrei);
    w(this.dorfStufe); w(this.fest); w(this.notnagelT); w(this.ereignisNr);
    w(this.stat.angekommen); w(this.stat.verbraucht); w(this.stat.erzeugt); w(this.stat.verbaut);
    liste(this.erzeugtJe);
    w(this.fahnen.size);
    for (const x of this.fahnen.values()) {
      w(x.id); w(x.h); w(x.gebaeude); liste(x.segmente);
      w(x.waren.length); for (const v of x.waren) { w(v.art); w(v.ziel); }
    }
    w(this.segmente.size);
    for (const s of this.segmente.values()) { w(s.id); w(s.a); w(s.b); w(s.traeger); w(s.verkehr); w(s.kab); w(s.kba); liste(s.pfad); }
    w(this.traeger.size);
    for (const t of this.traeger.values()) {
      w(t.id); w(t.seg); w(t.phase); w(t.ende); w(t.pos); w(t.dir); w(t.t); w(t.dauer); w(t.pause); w(t.art); w(t.ziel); w(t.warte);
      liste(t.route); w(t.ri); liste(t.routeSegs);
    }
    w(this.gebaeude.size);
    for (const g of this.gebaeude.values()) {
      w(g.id); f.text(g.typ); w(g.h); w(g.fahne); w(g.fertig); liste(g.verbaut); w(g.prio); w(g.getrennt ? 1 : 0);
      liste(g.puffer); liste(g.incoming); liste(g.ausgang); w(g.zeit); w(g.arbeit); liste(g.vorrat);
      w(g.ar); w(g.ph); w(g.pt); w(g.pd); w(g.wi); w(g.zh); liste(g.weg); w(g.traegt); w(g.leer); w(g.mitte);
      liste(g.stapel); w(g.haende); w(g.planSoll); w(g.planIst); w(g.bauer); w(g.planierer);
    }
    w(this.bauleute.size);
    for (const b of this.bauleute.values()) { w(b.id); w(b.beruf); w(b.ziel); w(b.phase); liste(b.route); w(b.ri); w(b.t); w(b.dauer); }
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
    return f.hex();
  }

  // ------------------------------------------------------------------ Hex-Prüfungen

  private hexKannFahne(h: number): boolean {
    if (!this.karte.begehbar[h] || this.hexFahne[h] || this.hexGeb[h]) return false;
    if (this.hexWeg[h]) {
      const s = this.segmente.get(this.hexWeg[h]);
      return !!s && s.pfad.indexOf(h) > 0;
    }
    return true;
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

  private hexKannBauen(typ: string, h: number): boolean {
    const t = typVon(typ);
    if (!t || typ === 'lager' || !this.typFrei(t)) return false;
    return this.karte.bebaubar[h] >= t.groesse && this.hexFrei(h);
  }

  /** Typ ist schon freigeschaltet (Dorfstufe) und, wenn einmalig, noch nicht gebaut (auch nicht als Baustelle). */
  private typFrei(t: GebaeudeTyp): boolean {
    if (t.abStufe > this.dorfStufe) return false;
    if (t.einmalig) for (const g of this.gebaeude.values()) if (g.typ === t.id) return false;
    return true;
  }

  /** Dorfstufe und einmalige Gebäude: Darf man den Typ jetzt bauen (unabhängig vom Platz)? Grund in Klartext oder ''. */
  sperrGrund(typ: string): '' | 'stufe' | 'einmalig' | 'unbekannt' {
    const t = typVon(typ);
    if (!t || typ === 'lager') return 'unbekannt';
    if (t.abStufe > this.dorfStufe) return 'stufe';
    if (!this.typFrei(t)) return 'einmalig';
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
    this.distCache.clear();
    this.verbundenNeu = true;
  }

  private fahneErzeugen(h: number, gebaeude: Id): Fahne {
    const f: Fahne = { id: this.naechsteId++, h, gebaeude, waren: [], segmente: [] };
    this.fahnen.set(f.id, f);
    this.hexFahne[h] = f.id;
    this.hexRaeumen(h);
    this.netzGeaendert();
    return f;
  }

  private gebaeudeErzeugen(typ: string, h: number, sofort: boolean): Gebaeude {
    const t = GEBAEUDE[typ];
    const nul = () => new Array<number>(WAREN.length).fill(0);
    const g: Gebaeude = {
      id: this.naechsteId++, typ, h, fahne: 0, fertig: sofort || t.kostenSumme === 0 ? 1 : 0,
      verbaut: sofort ? t.kosten.slice() : nul(), prio: PRIO_STANDARD, getrennt: typ !== 'lager',
      puffer: nul(), incoming: nul(), ausgang: nul(), zeit: 0, arbeit: 0, vorrat: nul(),
      ar: 0, ph: PH_SUCHE, pt: 0, pd: 0, wi: 0, zh: -1, weg: [], traegt: -1, leer: 0, mitte: -1,
      stapel: nul(), haende: -1, planSoll: 0, planIst: 0, bauer: 0, planierer: 0,
    };
    // Bauplätze am Hang muss erst ein Planierer ebnen (Drehbuch 4.5)
    if (!g.fertig) g.planSoll = planierTicks(this.karte.neigung[h]);
    // gerodete ausgewachsene Bäume (höchstens RODUNG_STAMM_MAX) werden zu Stämmen an der Gebäudefahne
    const staemme = sofort ? 0 : Math.min(RODUNG_STAMM_MAX, this.baum[h]);
    const f = this.fahneErzeugen(h, g.id);
    g.fahne = f.id;

    this.hexGeb[h] = g.id;
    this.gebaeude.set(g.id, g);
    for (let i = 0; i < staemme && f.waren.length < FLAG_CAP; i++) {
      this.wareAufFahne(f, WARE.stamm);
      this.stat.erzeugt++; this.erzeugtJe[WARE.stamm]++;
    }
    return g;
  }

  private segKosten(s: Segment): void {
    let ab = 0, ba = 0;
    for (let i = 0; i + 1 < s.pfad.length; i++) {
      ab += this.karte.schritt(s.pfad[i], s.pfad[i + 1]);
      ba += this.karte.schritt(s.pfad[i + 1], s.pfad[i]);
    }
    s.kab = ab; s.kba = ba;
  }

  /** Setzt eine freie Fahne; liegt der Hex auf einem Weg, wird das Segment geteilt. */
  private fahneSetzen(h: number): Fahne {
    const sid = this.hexWeg[h];
    if (!sid) return this.fahneErzeugen(h, 0);
    const s = this.segmente.get(sid)!;
    const k = s.pfad.indexOf(h);
    const f = this.fahneErzeugen(h, 0);
    this.hexWeg[h] = 0;
    const links = s.pfad.slice(0, k + 1), rechts = s.pfad.slice(k);
    const tr = s.traeger ? this.traeger.get(s.traeger)! : null;
    // Der Träger bleibt auf dem Teil, auf dem er steht.
    let traegerLinks = true;
    if (tr && tr.phase !== 0) {
      traegerLinks = tr.phase === 1 ? tr.ende === 0 : Math.max(tr.pos, tr.pos + tr.dir) <= k;
    }
    const neu: Segment = { id: this.naechsteId++, a: 0, b: 0, pfad: [], traeger: 0, verkehr: s.verkehr, kab: 0, kba: 0 };
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
        this.frei++;
      }
    }
  }

  private wegBauen(hs: number[]): void {
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
    if (!fa || fa.segmente.length >= FAHNE_MAX_SEGMENTE) return;
    for (let i = 1; i < n - 1; i++) {
      const h = hs[i];
      if (this.hexFahne[h] || this.hexGeb[h] || this.hexWeg[h]) return;
    }
    const letzter = hs[n - 1];
    if (this.hexFahne[letzter]) {
      if (this.fahnen.get(this.hexFahne[letzter])!.segmente.length >= FAHNE_MAX_SEGMENTE) return;
    } else if (!this.hexKannFahne(letzter)) return;
    const fz = this.hexFahne[letzter] ? this.fahnen.get(this.hexFahne[letzter])! : this.fahneSetzen(letzter);
    const s: Segment = { id: this.naechsteId++, a: fa.id, b: fz.id, pfad: hs.slice(), traeger: 0, verkehr: 0, kab: 0, kba: 0 };
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
      this.frei++;
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
        this.frei++;
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
    for (let a = 0; a < WAREN.length; a++) {
      const n = g.puffer[a] + g.ausgang[a] + g.stapel[a] + (g.haende === a ? 1 : 0) + (g.traegt === a ? 1 : 0) + Math.floor(g.verbaut[a] / 2);
      for (let i = 0; i < n; i++) if (f.waren.length < FLAG_CAP) f.waren.push({ art: a, ziel: 0 });
    }
    if (g.ar) { this.frei++; this.reservierungFreigeben(g, t); }
    // Bauarbeiter und Planierer der Baustelle machen sich auf den Heimweg
    for (const bid of [g.bauer, g.planierer]) {
      const b = bid ? this.bauleute.get(bid) : undefined;
      if (b) this.baumannFertig(b);
    }
    g.bauer = 0; g.planierer = 0;
    f.gebaeude = 0;
    this.hexGeb[g.h] = 0;
    this.gebaeude.delete(id);
    this.netzGeaendert();
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
    for (const g of this.gebaeude.values()) if (g.typ === 'lager') { this.verbunden.add(g.fahne); stapel.push(g.fahne); }
    while (stapel.length) {
      const f = this.fahnen.get(stapel.pop()!)!;
      for (const sid of f.segmente) {
        const s = this.segmente.get(sid)!;
        const o = s.a === f.id ? s.b : s.a;
        if (!this.verbunden.has(o)) { this.verbunden.add(o); stapel.push(o); }
      }
    }
    for (const g of this.gebaeude.values()) g.getrennt = g.typ !== 'lager' && !this.verbunden.has(g.fahne);
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
    return !!g && (g.typ === 'lager' || !g.getrennt) && this.distZu(g.fahne).has(z.id);
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
  private offen(g: Gebaeude, art: number): number {
    return GEBAEUDE[g.typ].kosten[art] - g.verbaut[art] - g.stapel[art] - (g.haende === art ? 1 : 0) - g.incoming[art];
  }

  /**
   * Größe des Input-Puffers für Ware `art`: Verarbeiter laut Daten; Wohnhaus alle Nahrungsplätze (zusammen begrenzt, siehe pufferPlatz);
   * Kirmesplatz die Warenliste der aktuellen Stufe (während des Fests nichts).
   */
  private pufferMax(_g: Gebaeude, t: GebaeudeTyp, art: number): number {
    if (t.funktion === 'wohnen') return NAHRUNG[art] > 0 ? t.nahrungPlaetze : 0;
    if (t.funktion === 'kirmes') { const k = KIRMES[this.dorfStufe]; return k ? k.liste[art] : 0; }
    return t.puffer[art];
  }

  /** Freier Platz im Input-Puffer eines fertigen Gebäudes für Ware `art` (Puffer − vorhanden − unterwegs). */
  private pufferPlatz(g: Gebaeude, art: number): number {
    const t = GEBAEUDE[g.typ];
    if (t.funktion === 'kirmes' && this.fest > 0) return 0;
    const p = this.pufferMax(g, t, art) - g.puffer[art] - g.incoming[art];
    if (t.funktion !== 'wohnen' || p <= 0) return p;
    // was die Kirmes noch braucht, isst keiner weg (nur der Überschuss im Lager)
    if (this.kirmesBraucht(art) > 0) return 0;
    let belegt = 0;
    for (const a of NAHRUNG_REIHE) belegt += g.puffer[a] + g.incoming[a];
    // ohne freien Wohnraum hält das Wohnhaus nur einen Bissen vor, der Rest bleibt für Küche, Käserei und Kirmes
    if (this.wohnFrei <= 0 && belegt >= 1) return 0;
    return t.nahrungPlaetze - belegt;
  }

  /** Gebäude nimmt Waren in den Input-Puffer (Verarbeiter, Wohnhaus, Kirmesplatz). */
  private hatEingang(t: GebaeudeTyp): boolean {
    return t.pufferSumme > 0 || t.funktion === 'wohnen' || t.funktion === 'kirmes';
  }

  /**
   * DESIGN §4.5: 1. Baustelle mit offenem Bedarf (höchste Priorität, dann nächste), 2. Verarbeiter mit Platz im Input-Puffer
   * (nächster), 3. nächstes Lager; 0 = kein Ziel erreichbar. Getrennte Baustellen und Gebäude bekommen nichts.
   */
  private zielWaehlen(art: number, z: Fahne): Id {
    let best = 0, bp = 0, bd = Infinity;
    for (const g of this.gebaeude.values()) {
      if (g.fertig || g.getrennt || this.offen(g, art) <= 0) continue;
      const d = this.distZu(g.fahne).get(z.id);
      if (d === undefined) continue;
      if (g.prio > bp || (g.prio === bp && d < bd)) { bp = g.prio; bd = d; best = g.id; }
    }
    if (best) return best;
    // 2. der Kirmesplatz (die Warenliste geht vor), dann Verarbeiter, dann Wohnhäuser mit Platz
    for (const rang of [0, 1, 2]) {
      bd = Infinity;
      for (const g of this.gebaeude.values()) {
        if (g.typ === 'lager' || !g.fertig || g.getrennt || abnehmerRang(GEBAEUDE[g.typ]) !== rang || this.pufferPlatz(g, art) <= 0) continue;
        const d = this.distZu(g.fahne).get(z.id);
        if (d !== undefined && d < bd) { bd = d; best = g.id; }
      }
      if (best) return best;
    }
    for (const g of this.gebaeude.values()) {
      if (g.typ !== 'lager') continue;
      const d = this.distZu(g.fahne).get(z.id);
      if (d !== undefined && d < bd) { bd = d; best = g.id; }
    }
    return best;
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
    this.stat.erzeugt++;
    this.erzeugtJe[art]++;
  }

  /** Ein Stück Material ist verbaut (vom Bauarbeiter). */
  private verbauen(g: Gebaeude, art: number): void {
    g.verbaut[art]++;
    this.stat.verbaut++;
    const t = GEBAEUDE[g.typ];
    for (let a = 0; a < t.kosten.length; a++) if (g.verbaut[a] < t.kosten[a]) return;
    g.fertig = 1;
    g.ph = PH_SUCHE; g.pt = 0; g.leer = 0;
    this.ereignis('fertig', g.id, 0);
  }

  private gebaeudeTick(g: Gebaeude): void {
    const f = this.fahnen.get(g.fahne)!;
    // Ware mit Ziel dieses Gebäudes aus der Fahne nehmen (eine je Tick)
    for (let i = 0; i < f.waren.length; i++) {
      const w = f.waren[i];
      if (w.ziel !== g.id) continue;
      f.waren.splice(i, 1);
      if (g.incoming[w.art] > 0) g.incoming[w.art]--;
      if (g.typ === 'lager') g.vorrat[w.art]++;
      else if (!g.fertig) g.stapel[w.art]++;
      else g.puffer[w.art]++;
      this.stat.angekommen++;
      break;
    }
    if (g.typ === 'lager' || !g.fertig || g.getrennt) return;
    const t = GEBAEUDE[g.typ];
    // Output-Puffer → Fahne, solange diese Platz hat (Rückstau)
    if (t.ausgangMax > 0 && g.ausgang[t.ausgangWare] > 0 && this.platz(f)) {
      g.ausgang[t.ausgangWare]--;
      this.wareAufFahne(f, t.ausgangWare);
    }
    if (t.arbeiter && !g.ar) {
      if (this.frei <= 0) return;
      this.frei--;
      g.ar = 1; g.ph = PH_SUCHE; g.pt = 0; g.leer = 0;
    }
    switch (t.funktion) {
      case 'holzfaeller': case 'steinbruch': case 'foerster': this.laeuferTick(g, t); break;
      case 'verarbeiter': {
        const wd = t.wandelt!;
        if (!g.arbeit) {
          if (g.puffer[wd.ein] >= wd.menge && g.ausgang[wd.aus] < t.ausgangMax) {
            g.puffer[wd.ein] -= wd.menge; g.arbeit = 1; g.zeit = 0; this.stat.verbraucht += wd.menge;
          }
        } else {
          g.zeit++;
          if (g.zeit >= wd.ticks) { this.produziert(g, wd.aus); g.arbeit = 0; g.zeit = 0; }
        }
        break;
      }
      case 'erzeuger': {
        // Feld, Wiese, Stall, Bienenstock: alle arbeitTicks eine Ware, solange der Output-Puffer Platz hat
        if (g.ausgang[t.ausgangWare] >= t.ausgangMax) { g.arbeit = 0; break; }
        g.arbeit = 1;
        g.zeit++;
        if (g.zeit >= t.arbeitTicks) { this.produziert(g, t.ausgangWare); g.zeit = 0; }
        break;
      }
      case 'wohnen': this.wohnenTick(g, t); break;
      case 'kirmes': this.kirmesTick(g); break;
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
    const baustellen: Gebaeude[] = [], verarbeiter: Gebaeude[] = [];
    for (const g of this.gebaeude.values()) {
      if (g.typ === 'lager' || g.getrennt) continue;
      if (!g.fertig) baustellen.push(g);
      else if (this.hatEingang(GEBAEUDE[g.typ])) verarbeiter.push(g);
    }
    if (!baustellen.length && !verarbeiter.length) return;
    baustellen.sort((x, y) => y.prio - x.prio || x.id - y.id);
    // der Kirmesplatz vor den Verarbeitern, die vor den Wohnhäusern (sonst nach Id)
    verarbeiter.sort((x, y) => abnehmerRang(GEBAEUDE[x.typ]) - abnehmerRang(GEBAEUDE[y.typ]) || x.id - y.id);
    for (const g of baustellen.concat(verarbeiter)) {
      // Wohnhäuser holen das beste Essen zuerst
      const reihe = g.fertig && GEBAEUDE[g.typ].funktion === 'wohnen' ? NAHRUNG_REIHE : ALLE_WAREN;
      for (const a of reihe) {
        if ((g.fertig ? this.pufferPlatz(g, a) : this.offen(g, a)) <= 0) continue;
        const dm = this.distZu(g.fahne);
        let best: Gebaeude | null = null, bd = Infinity;
        for (const l of this.gebaeude.values()) {
          if (l.typ !== 'lager' || gezogen.has(l.id) || l.vorrat[a] <= 0) continue;
          // Nur ausgehende Waren an der Lagerfahne bremsen; was zum Lager unterwegs ist, nimmt das Lager selbst ab
          if (this.ausgehend(l) >= FLAG_CAP / 2) continue;
          const d = dm.get(l.fahne);
          if (d !== undefined && d < bd) { bd = d; best = l; }
        }
        if (!best) continue;
        best.vorrat[a]--;
        g.incoming[a]++;
        this.fahnen.get(best.fahne)!.waren.push({ art: a, ziel: g.id });
        gezogen.add(best.id);
      }
    }
  }

  // ------------------------------------------------------------------ Bewohner, Wohnhaus, Notnagel, Kirmes (Drehbuch 4.3, 5.2; DESIGN §5)

  private ereignis(art: SichtEreignis['art'], gebaeude: Id, wert: number): void {
    this.ereignisNr++;
    this.ereignisse.push({ nr: this.ereignisNr, tick: this._tick, art, gebaeude, wert });
    if (this.ereignisse.length > EREIGNISSE_MAX) this.ereignisse.shift();
  }

  /** Ein Bewohner kommt dazu (frei im Vorrat). */
  private neuerBewohner(n = 1): void { this.bewohner += n; this.frei += n; }

  private nahrungIn(g: Gebaeude): boolean {
    for (const a of NAHRUNG_REIHE) if (g.puffer[a] > 0) return true;
    return false;
  }

  /** Freier Wohnraum: Wohnraum fertiger Gebäude − Bewohner − laufende Wohnhaus-Zyklen. */
  private wohnraumFrei(): number {
    let n = -this.bewohner;
    for (const g of this.gebaeude.values()) {
      if (!g.fertig) continue;
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
      this.neuerBewohner();
      this.ereignis('bewohner', g.id, ware);
      // gleich weiter mit dem nächsten Bissen
    }
    if (!this.nahrungIn(g) || this.wohnraumFrei() <= 0) return;
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
  private kirmesBraucht(art: number): number {
    const k = KIRMES[this.dorfStufe];
    if (!k || !k.liste[art] || this.fest > 0) return 0;
    let n = k.liste[art];
    const p = this.kirmesPlatz();
    if (p && p.fertig) n -= p.puffer[art] + p.incoming[art];
    if (n <= 0) return 0;
    for (const l of this.gebaeude.values()) if (l.typ === 'lager') n -= l.vorrat[art];
    // 0 = es liegt mehr im Lager, als noch fehlt
    return Math.max(0, n + 1);
  }

  private kirmesPlatz(): Gebaeude | undefined {
    for (const g of this.gebaeude.values()) if (GEBAEUDE[g.typ].funktion === 'kirmes') return g;
    return undefined;
  }

  /** Kirmesplatz: Ist die Warenliste geliefert, wird sie verbraucht und das Fest beginnt. */
  private kirmesTick(g: Gebaeude): void {
    const k = KIRMES[this.dorfStufe];
    if (!k || this.fest > 0) return;
    for (let a = 0; a < k.liste.length; a++) if (g.puffer[a] < k.liste[a]) return;
    for (let a = 0; a < k.liste.length; a++) { g.puffer[a] -= k.liste[a]; this.stat.verbraucht += k.liste[a]; }
    this.fest = Math.max(1, k.festTicks);
    this.ereignis('kirmes', g.id, this.dorfStufe);
  }

  /** Bringt gerade ein Wohnhaus Nachwuchs (Zyklus läuft)? */
  private nachwuchs(): boolean {
    for (const g of this.gebaeude.values()) if (g.arbeit && g.fertig && GEBAEUDE[g.typ].funktion === 'wohnen') return true;
    return false;
  }

  /**
   * Notnagel (Drehbuch 4.3): kaum freie Bewohner und kein Nachwuchs in Sicht – weil kein Wohnhaus Essen hat oder weil kein Wohnraum frei
   * ist. Essen nur im Lager zählt nicht, solange kein Wohnhaus es bekommt (keins gebaut, kein Träger frei): sonst könnte man sich festfahren.
   */
  private notnagelGreift(): boolean {
    return this.frei < NOTNAGEL_FREI_UNTER && !this.nachwuchs();
  }

  /** Fest und Dorfstufe, Notnagel (Drehbuch 4.3: man kann sich nicht festfahren). */
  private dorfTick(): void {
    if (this.fest > 0) {
      this.fest--;
      if (this.fest === 0) {
        const k = KIRMES[this.dorfStufe];
        this.dorfStufe++;
        this.ereignis('stufe', 0, this.dorfStufe);
        if (k && k.zuzug > 0) { this.neuerBewohner(k.zuzug); this.ereignis('zuzug', 0, k.zuzug); }
      }
    }
    if (this.notnagelGreift()) {
      this.notnagelT++;
      if (this.notnagelT >= NOTNAGEL_TICKS) { this.notnagelT = 0; this.neuerBewohner(); this.ereignis('notnagel', 0, 1); }
    } else this.notnagelT = 0;
  }

  // ------------------------------------------------------------------ Bauarbeiter und Planierer (Drehbuch 4.5)

  /** Nächstes verbundenes Lager zur Fahne `f` (Laufzeit), oder undefined. */
  private naechstesLager(f: Id): Gebaeude | undefined {
    let best: Gebaeude | undefined, bd = Infinity;
    for (const l of this.gebaeude.values()) {
      if (l.typ !== 'lager') continue;
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

  /** Freie Bauleute aus dem Lager zu Baustellen schicken (Priorität absteigend, dann Id). */
  private bauleuteSchicken(): void {
    if (this.bauFrei <= 0 && this.planFrei <= 0) return;
    const baustellen: Gebaeude[] = [];
    for (const g of this.gebaeude.values()) if (!g.fertig && !g.getrennt) baustellen.push(g);
    if (!baustellen.length) return;
    baustellen.sort((x, y) => y.prio - x.prio || x.id - y.id);
    for (const g of baustellen) {
      for (const beruf of [1, 0] as const) {
        if ((beruf === 0 ? this.bauFrei : this.planFrei) <= 0 || !this.brauchtBaumann(g, beruf)) continue;
        const l = this.naechstesLager(g.fahne);
        const r = l ? this.fahnenRoute(l.fahne, g.fahne) : null;
        if (!r || r.hexe.length < 2) continue;
        const b: Baumann = { id: this.naechsteId++, beruf, ziel: g.id, phase: BM_GEHT, route: r.hexe, ri: 0, t: 0, dauer: this.karte.schritt(r.hexe[0], r.hexe[1]) };
        this.bauleute.set(b.id, b);
        if (beruf === 0) { this.bauFrei--; g.bauer = b.id; } else { this.planFrei--; g.planierer = b.id; }
      }
    }
  }

  /** Baumann ist zurück im Lager (Vorrat). */
  private baumannHeim(b: Baumann): void {
    this.bauleute.delete(b.id);
    if (b.beruf === 0) this.bauFrei++; else this.planFrei++;
  }

  /**
   * An Fahne `f` angekommen ohne Auftrag: nächste Baustelle, die diesen Beruf braucht (Priorität, dann kürzester Weg), sonst Heimweg
   * zum nächsten Lager. Ohne Verbindung geht er querfeldein nach Hause (sofort im Vorrat).
   */
  private baumannWeiter(b: Baumann, f: Id): void {
    let ziel: Gebaeude | undefined, bp = 0, bd = Infinity;
    for (const g of this.gebaeude.values()) {
      if (!this.brauchtBaumann(g, b.beruf)) continue;
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
    if (!f || (g && g.typ === 'lager')) { this.baumannHeim(b); return; }
    b.phase = BM_WARTET;
    this.baumannWeiter(b, f);
  }

  private baumannSchritt(b: Baumann): void {
    if (b.phase === BM_GEHT) {
      if (b.ziel && !this.gebaeude.has(b.ziel)) { this.baumannFertig(b); return; }
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
      b.phase = BM_ARBEIT; b.t = 0; b.dauer = BAU_JE_WARE;
      return;
    }
    if (summe(g.incoming) === 0) this.baumannFertig(b);
  }

  // ------------------------------------------------------------------ Träger

  private traegerPhase(): void {
    if (this.frei > 0) {
      for (const s of this.segmente.values()) {
        if (this.frei <= 0) break;
        if (s.traeger === 0 && this.verbunden.has(s.a)) this.traegerAnfordern(s);
      }
    }
    for (const t of this.traeger.values()) this.traegerSchritt(t);
  }

  private traegerAnfordern(s: Segment): void {
    let best: { l: Gebaeude; e: Id; d: number } | null = null;
    for (const e of [s.a, s.b]) {
      const dm = this.distZu(e);
      for (const l of this.gebaeude.values()) {
        if (l.typ !== 'lager') continue;
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
      id: this.naechsteId++, seg: s.id, phase: route.length > 1 ? 0 : 1, ende,
      pos: ende === 0 ? 0 : s.pfad.length - 1, dir: 1, t: 0, dauer: route.length > 1 ? this.karte.schritt(route[0], route[1]) : 0,
      pause: 0, art: -1, ziel: 0, warte: 0, route: route.length > 1 ? route : [], ri: 0, routeSegs: segs,
    };
    if (route.length <= 1) t.routeSegs = [];
    this.traeger.set(t.id, t);
    s.traeger = t.id;
    this.frei--;
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
