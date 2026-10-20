// Gleichschritt (Lockstep) für den Mehrspieler (Drehbuch 8.3, ROADMAP M6). Reine Logik ohne Browser: Nachrichten gehen über
// `senden(an, nachricht)` hinaus und kommen über `empfangen(von, nachricht)` herein, die Zeit über `takt(dtMs)`. So läuft dasselbe
// im Browser (WebRTC) und im Test (simuliertes schlechtes Netz).
//
// Ablauf: Ein Spieler ist Taktgeber (anfangs der Gastgeber). Er sammelt die Befehle aller und verteilt alle ZUG_MS einen Zug:
// „rechnet bis Tick `bis` (ausschließlich), dabei gelten diese Befehle“. Jeder Befehl bekommt einen Tick, den noch niemand gerechnet
// hat (das `bis` des vorigen Zugs), so rechnen alle exakt dasselbe. Pause, Tempo, Warten auf Fehlende und den Verwalter entscheidet
// nur der Taktgeber. Alle PRUEF_TICKS schicken alle ihre Prüfsumme; weicht einer ab, bekommt er den Stand des Taktgebers neu.
// Wer neu dazukommt (Start, Neuladen), sagt „hallo“ und bekommt den ganzen Stand.
import { Simulation } from '../sim/sim';
import type { SimStand } from '../sim/stand';
import { TICK_HZ } from '../sim/typen';
import type { Befehl, KarteDaten } from '../sim/typen';
import mp from '../../data/mehrspieler.json';

export const ZUG_MS = mp.zug_ms;
export const VERZOEGERUNG_MS = mp.befehl_verzoegerung_ms;
export const VORSPRUNG_TICKS = Math.round(mp.vorsprung_max_s * TICK_HZ);
export const AUFHOLEN_JE_FRAME = mp.aufholen_ticks_je_frame;
export const PRUEF_TICKS = Math.round(mp.pruef_alle_s * TICK_HZ);
export const PAUSEN_JE_SPIELER = mp.pausen.je_spieler;
export const PAUSE_MAX_MS = mp.pausen.max_s * 1000;
export const VERWALTER_NACH_MS = mp.verwalter_nach_s * 1000;
export const SPIELER_MAX = mp.spieler_max;
export const TEMPO_MIN = 1, TEMPO_MAX = 3;
/** Wie lange ein neuer Taktgeber auf die Nachträge der anderen wartet. */
const UEBERNAHME_MS = 3000;
/** So viele Züge hebt jeder auf (für eine Taktgeber-Übernahme). */
const ZUEGE_MERKEN = 600;

/** Verzögerung eines Befehls in Ticks beim Tempo `tempo`. */
export function verzoegerungTicks(tempo: number): number {
  return Math.max(1, Math.ceil((VERZOEGERUNG_MS * tempo * TICK_HZ) / 1000));
}

export interface ZugBefehl { tick: number; spieler: number; id: string; befehl: Befehl }
export interface PauseInfo { spieler: number; restMs: number }
export interface Zug {
  nr: number;
  /** Alle dürfen rechnen, solange sim.tick < bis. */
  bis: number;
  befehle: ZugBefehl[];
  tempo: number;
  pause: PauseInfo | null;
  /** Übrige Pausen je Spieler. */
  pausen: number[];
  /** Fehlende Spieler und wie lange noch bis zum Verwalter (ms). */
  warten: { spieler: number; restMs: number }[];
}

export type Nachricht =
  | { t: 'hallo' }
  | { t: 'befehl'; id: string; befehl: Befehl }
  | { t: 'zug'; zug: Zug }
  | { t: 'quittung'; tick: number; pruef: { tick: number; wert: string }[] }
  | { t: 'stand'; stand: SimStand; karte: string; zug: Zug; grund: 'start' | 'wiederbeitritt' | 'abgleich' }
  | { t: 'pause'; an: boolean }
  | { t: 'tempo'; tempo: number }
  | { t: 'meldung'; art: 'auseinander'; spieler: number; tick: number }
  | { t: 'uebernahme'; nr: number }
  | { t: 'nachtrag'; nr: number; zuege: Zug[]; offen: { id: string; befehl: Befehl }[] };

/** Was die Oberfläche erfahren soll. */
export type PartieEreignis =
  | { art: 'auseinander'; spieler: number; tick: number }
  | { art: 'neuer_stand'; grund: 'start' | 'wiederbeitritt' | 'abgleich' }
  | { art: 'taktgeber'; spieler: number }
  | { art: 'fehler'; text: string };

export interface PartieOptionen {
  /** Eigener Platz (Spieler-Index) und Zahl der Plätze. */
  ich: number;
  spielerZahl: number;
  /** Gastgeber (stellt das Tempo, darf jede Pause beenden) und Taktgeber (verteilt die Züge). */
  gastgeber: number;
  taktgeber: number;
  karte: KarteDaten;
  /** Prüfsumme der Kartendaten (M2): ein Stand wird nur auf derselben Karte angenommen. */
  kartePruef: string;
  senden: (an: number, n: Nachricht) => void;
  /** Nur beim Taktgeber zum Start: die Simulation, mit der alle beginnen (neu oder geladen). */
  sim?: Simulation;
  /** Übrige Pausen je Spieler (aus einem Spielstand), sonst PAUSEN_JE_SPIELER. */
  pausen?: number[];
  tempo?: number;
  /** Eindeutige Kennung dieser Sitzung (für Befehls-Ids); Standard: zufällig. */
  sitzung?: string;
}

/** Rolle des Taktgebers (läuft beim Taktgeber zusätzlich zur eigenen Teilnahme). */
class Takt {
  /** Uhr des Taktgebers in ms (Summe der dt), Tick-Zeiger (Bruch) und Zug-Zeitgeber. */
  uhr = 0;
  t: number;
  zugAcc = 0;
  nr: number;
  bis: number;
  tempo: number;
  pause: PauseInfo | null;
  pausen: number[];
  warteschlange: { spieler: number; id: string; befehl: Befehl }[] = [];
  gesehen = new Set<string>();
  /** Zuletzt gemeldeter Tick je Spieler, ob er seinen Stand hat (bereit) und seit wann er fehlt (-1 = da). */
  quittung: number[];
  bereit: boolean[];
  fehltSeit: (number | null)[];
  /** Hat schon einmal einen Stand bekommen (sonst ist sein „hallo“ der Start). */
  gestartet: boolean[];
  verwalter: boolean[];
  /** Prüfsummen je Tick und Spieler; neu verteilt an Spieler ab Tick (Prüfsummen davor zählen nicht). */
  pruef = new Map<number, Map<number, string>>();
  neuAb: number[];
  /** Übernahme: wartet auf Nachträge dieser Spieler bis `uebernahmeBis` (Uhr). */
  uebernahme: Set<number> | null = null;
  uebernahmeBis = 0;
  nachtragNr = new Map<number, number>();

  constructor(n: number, nr: number, bis: number, tempo: number, pause: PauseInfo | null, pausen: number[], verwalter: boolean[]) {
    this.nr = nr; this.bis = bis; this.t = bis; this.tempo = tempo; this.pause = pause; this.pausen = pausen.slice();
    this.quittung = new Array<number>(n).fill(0);
    this.bereit = new Array<boolean>(n).fill(false);
    this.fehltSeit = new Array<number | null>(n).fill(null);
    this.gestartet = new Array<boolean>(n).fill(false);
    this.verwalter = verwalter.slice();
    this.neuAb = new Array<number>(n).fill(0);
  }
}

export class Partie {
  readonly ich: number;
  readonly spielerZahl: number;
  readonly gastgeber: number;
  private _taktgeber: number;
  private readonly karte: KarteDaten;
  private readonly kartePruef: string;
  private readonly senden: (an: number, n: Nachricht) => void;
  private readonly sitzung: string;
  private _sim: Simulation | null;
  private letzter: Zug | null = null;
  private zuege: Zug[] = [];
  private acc = 0;
  private befehlNr = 0;
  /** Eigene Befehle, die noch in keinem Zug standen. */
  private offen = new Map<string, Befehl>();
  private pruefOffen: { tick: number; wert: string }[] = [];
  private quittiert = -1;
  /** Verbindung zu jedem Spieler (eigene immer). */
  private da: boolean[];
  private takt: Takt | null = null;
  private lokal: { von: number; n: Nachricht }[] = [];
  readonly ereignisse: PartieEreignis[] = [];
  /** Wird gerufen, wenn die Simulation ersetzt wurde (Start, Wiederbeitritt, Abgleich). */
  onNeueSim: ((sim: Simulation) => void) | null = null;

  constructor(o: PartieOptionen) {
    if (o.spielerZahl < 1 || o.spielerZahl > SPIELER_MAX) throw new Error(`1 bis ${SPIELER_MAX} Spieler`);
    this.ich = o.ich; this.spielerZahl = o.spielerZahl; this.gastgeber = o.gastgeber; this._taktgeber = o.taktgeber;
    this.karte = o.karte; this.kartePruef = o.kartePruef; this.senden = o.senden;
    this.sitzung = o.sitzung ?? Math.random().toString(36).slice(2, 10);
    this.da = new Array<boolean>(o.spielerZahl).fill(false);
    this.da[this.ich] = true;
    this._sim = null;
    if (this.ich === this._taktgeber) {
      if (!o.sim) throw new Error('Der Taktgeber braucht die Start-Simulation');
      this._sim = o.sim;
      const pausen = o.pausen ?? new Array<number>(o.spielerZahl).fill(PAUSEN_JE_SPIELER);
      const verwalter = new Array<boolean>(o.spielerZahl).fill(false);
      for (let sp = 0; sp < o.spielerZahl; sp++) verwalter[sp] = o.sim.sicht(sp).spieler[sp].verwalter;
      this.takt = new Takt(o.spielerZahl, 0, o.sim.tick, o.tempo ?? 1, null, pausen, verwalter);
      this.takt.bereit[this.ich] = true;
      this.letzter = this.zugJetzt(this.takt, []);
    }
  }

  // ------------------------------------------------------------------ Abfragen

  get sim(): Simulation | null { return this._sim; }
  get taktgeber(): number { return this._taktgeber; }
  get istTaktgeber(): boolean { return this.takt !== null; }
  /** Stand des letzten Zugs (Tempo, Pause, übrige Pausen, Warten) oder null vor dem ersten. */
  get zug(): Zug | null { return this.letzter; }
  get tempo(): number { return this.letzter?.tempo ?? 1; }
  /** Läuft die Zeit gerade nicht (Pause, Warten, Übernahme, noch kein Stand)? */
  get angehalten(): boolean {
    const z = this.letzter;
    return !this._sim || !z || z.pause !== null || z.warten.length > 0 || (!!this.takt && this.takt.uebernahme !== null);
  }
  /** Vorsprung des Zugs vor der eigenen Simulation in Ticks (für die Anzeige). */
  get puffer(): number { return this._sim && this.letzter ? this.letzter.bis - this._sim.tick : 0; }
  istDa(sp: number): boolean { return this.da[sp]; }

  // ------------------------------------------------------------------ Eingaben der Oberfläche

  /** Ein eigener Befehl: geht an den Taktgeber, wirkt erst, wenn er in einem Zug zurückkommt. */
  befehl(b: Befehl): void {
    const id = `${this.sitzung}.${++this.befehlNr}`;
    this.offen.set(id, b);
    this.an(this._taktgeber, { t: 'befehl', id, befehl: b });
    this.abarbeiten();
  }

  /** Pause anfordern (an) oder beenden. Der Taktgeber prüft, ob man darf. */
  pause(an: boolean): void { this.an(this._taktgeber, { t: 'pause', an }); this.abarbeiten(); }

  /** Tempo 1–3 (nur der Gastgeber). */
  setzeTempo(tempo: number): void {
    if (this.ich !== this.gastgeber) return;
    this.an(this._taktgeber, { t: 'tempo', tempo }); this.abarbeiten();
  }

  /** Verbindung zu `sp` steht (da) oder ist weg. */
  verbindung(sp: number, da: boolean): void {
    if (sp === this.ich || sp < 0 || sp >= this.spielerZahl || this.da[sp] === da) return;
    this.da[sp] = da;
    const tg = this.takt;
    if (tg && !da) { tg.bereit[sp] = false; tg.fehltSeit[sp] = tg.uhr; }
    // zum Taktgeber verbunden: hallo (holt den Stand: Start oder Wiederbeitritt) und offene Befehle neu
    if (da && sp === this._taktgeber) this.halloSagen();
    this.abarbeiten();
  }

  /** Der Vermittlungs-Server hat einen neuen Taktgeber bestimmt (der alte fehlt zu lange). */
  taktgeberWechsel(neu: number): void {
    if (neu === this._taktgeber || neu < 0 || neu >= this.spielerZahl) return;
    const alt = this._taktgeber;
    this._taktgeber = neu;
    this.ereignisse.push({ art: 'taktgeber', spieler: neu });
    if (neu === this.ich && this._sim && this.letzter) {
      const z = this.letzter;
      const verwalter = this._sim.sicht(0).spieler.map((s) => s.verwalter);
      const tg = new Takt(this.spielerZahl, z.nr, z.bis, z.tempo, z.pause, z.pausen, verwalter);
      tg.bereit[this.ich] = true;
      for (const x of this.zuege) for (const b of x.befehle) tg.gesehen.add(b.id);
      for (let sp = 0; sp < this.spielerZahl; sp++) {
        if (sp === this.ich) continue;
        tg.gestartet[sp] = true;
        // der alte Taktgeber fehlt schon VERWALTER_NACH_MS (deshalb der Wechsel): sein Verwalter kommt sofort; andere Fehlende
        // bekommen ihre Frist neu
        if (this.da[sp]) tg.bereit[sp] = true; else tg.fehltSeit[sp] = sp === alt ? -VERWALTER_NACH_MS : 0;
        tg.quittung[sp] = this._sim.tick;
      }
      tg.uebernahme = new Set([...Array(this.spielerZahl).keys()].filter((sp) => sp !== this.ich && this.da[sp]));
      tg.uebernahmeBis = UEBERNAHME_MS;
      this.takt = tg;
      for (const sp of tg.uebernahme) this.an(sp, { t: 'uebernahme', nr: z.nr });
      // eigene offene Befehle gehen jetzt an mich selbst
      for (const [id, befehl] of this.offen) this.an(this.ich, { t: 'befehl', id, befehl });
    } else this.takt = null; // der neue Taktgeber meldet sich mit „uebernahme“; offene Befehle gehen mit dem Nachtrag
    this.abarbeiten();
  }

  /** Eine Nachricht von Spieler `von`. Unbekannte oder kaputte Nachrichten werden verworfen. */
  empfangen(von: number, n: Nachricht): void {
    if (!n || typeof n !== 'object' || !Number.isInteger(von) || von < 0 || von >= this.spielerZahl) return;
    this.lokal.push({ von, n });
    this.abarbeiten();
  }

  /** Zeit vergeht (ms). Rechnet die erlaubten Ticks; liefert deren Zahl. */
  vor(dtMs: number): number {
    const dt = Math.max(0, Math.min(1000, dtMs));
    if (this.takt) this.taktgeberVor(this.takt, dt);
    this.abarbeiten();
    const n = this.rechnen(dt);
    this.abarbeiten();
    return n;
  }

  // ------------------------------------------------------------------ Teilnehmer

  private halloSagen(): void {
    if (this._taktgeber === this.ich) return;
    this.an(this._taktgeber, { t: 'hallo' });
    for (const [id, befehl] of this.offen) this.an(this._taktgeber, { t: 'befehl', id, befehl });
  }

  private an(sp: number, n: Nachricht): void {
    if (sp === this.ich) { this.lokal.push({ von: this.ich, n }); return; }
    if (this.da[sp]) this.senden(sp, n);
  }

  private abarbeiten(): void {
    for (let i = 0; i < 10000 && this.lokal.length; i++) {
      const { von, n } = this.lokal.shift()!;
      this.verarbeite(von, n);
    }
  }

  private verarbeite(von: number, n: Nachricht): void {
    const tg = this.takt;
    switch (n.t) {
      // an den Taktgeber
      case 'hallo': if (tg) this.taktHallo(tg, von); return;
      case 'befehl': if (tg) this.taktBefehl(tg, von, n.id, n.befehl); return;
      case 'quittung': if (tg) this.taktQuittung(tg, von, n.tick, n.pruef); return;
      case 'pause': if (tg) this.taktPause(tg, von, n.an); return;
      case 'tempo': if (tg && von === this.gastgeber && Number.isInteger(n.tempo)) tg.tempo = Math.min(TEMPO_MAX, Math.max(TEMPO_MIN, n.tempo)); return;
      case 'nachtrag': if (tg) this.taktNachtrag(tg, von, n); return;
      // vom Taktgeber
      case 'zug': if (von === this._taktgeber) this.zugAnnehmen(n.zug); return;
      case 'stand': if (von === this._taktgeber) this.standAnnehmen(n); return;
      case 'meldung': if (von === this._taktgeber) this.ereignisse.push({ art: 'auseinander', spieler: n.spieler, tick: n.tick }); return;
      case 'uebernahme':
        if (von !== this._taktgeber) this.taktgeberWechsel(von);
        this.an(von, { t: 'nachtrag', nr: this.letzter?.nr ?? 0, zuege: this.zuege.filter((z) => z.nr > n.nr), offen: [...this.offen].map(([id, befehl]) => ({ id, befehl })) });
        return;
    }
  }

  private zugAnnehmen(z: Zug): void {
    if (!this._sim) return; // erst der Stand, dann Züge
    if (this.letzter && z.nr <= this.letzter.nr) return;
    for (const b of z.befehle) {
      // Befehle für schon gerechnete Ticks kann es nicht geben (sonst wäre der Gleichschritt kaputt)
      if (b.tick < this._sim.tick) { this.ereignisse.push({ art: 'fehler', text: `Befehl für vergangenen Tick ${b.tick}` }); continue; }
      this._sim.befehl(b.tick, b.spieler, b.befehl);
      this.offen.delete(b.id);
    }
    this.letzter = z;
    this.zuege.push(z);
    if (this.zuege.length > ZUEGE_MERKEN) this.zuege.splice(0, this.zuege.length - ZUEGE_MERKEN);
  }

  private standAnnehmen(n: Extract<Nachricht, { t: 'stand' }>): void {
    if (n.karte !== this.kartePruef) {
      this.ereignisse.push({ art: 'fehler', text: 'Der Stand des Taktgebers gehört zu einer anderen Karte (Prüfsumme der Kartendaten weicht ab).' });
      return;
    }
    let sim: Simulation;
    try { sim = Simulation.ausStand(this.karte, n.stand); } catch (e) {
      this.ereignisse.push({ art: 'fehler', text: `Stand nicht lesbar: ${(e as Error).message}` });
      return;
    }
    this._sim = sim;
    this.letzter = n.zug;
    this.zuege = [n.zug];
    this.acc = 0;
    this.quittiert = -1;
    this.pruefOffen = [];
    this.ereignisse.push({ art: 'neuer_stand', grund: n.grund });
    this.onNeueSim?.(sim);
    this.an(this._taktgeber, { t: 'quittung', tick: sim.tick, pruef: [] });
  }

  /** Rechnet im Tempo des letzten Zugs, höchstens bis `bis`; liegt man zurück, wird aufgeholt. */
  private rechnen(dt: number): number {
    const sim = this._sim, z = this.letzter;
    if (!sim || !z) return 0;
    const v = verzoegerungTicks(z.tempo);
    this.acc += (dt * z.tempo * TICK_HZ) / 1000;
    let n = Math.floor(this.acc);
    this.acc -= n;
    // ruhig hinter dem Zug her: Ziel ist bis − v; wer weiter zurückliegt, holt auf
    const ziel = z.bis - v;
    if (sim.tick < ziel - v) n = Math.max(n, Math.min(AUFHOLEN_JE_FRAME, ziel - sim.tick));
    n = Math.min(n, z.bis - sim.tick);
    if (n <= 0) { if (sim.tick >= z.bis) this.acc = Math.min(this.acc, 1); return 0; }
    for (let i = 0; i < n; i++) {
      sim.schritt();
      if (sim.tick % PRUEF_TICKS === 0) this.pruefOffen.push({ tick: sim.tick, wert: sim.pruefsumme() });
    }
    if (sim.tick - this.quittiert >= 5 || this.pruefOffen.length) {
      this.quittiert = sim.tick;
      this.an(this._taktgeber, { t: 'quittung', tick: sim.tick, pruef: this.pruefOffen });
      this.pruefOffen = [];
    }
    return n;
  }

  // ------------------------------------------------------------------ Taktgeber

  private zugJetzt(tg: Takt, befehle: ZugBefehl[]): Zug {
    const warten: Zug['warten'] = [];
    for (let sp = 0; sp < this.spielerZahl; sp++) {
      if (this.fehlt(tg, sp)) warten.push({ spieler: sp, restMs: Math.max(0, VERWALTER_NACH_MS - (tg.uhr - (tg.fehltSeit[sp] ?? tg.uhr))) });
    }
    return { nr: tg.nr, bis: tg.bis, befehle, tempo: tg.tempo, pause: tg.pause ? { ...tg.pause } : null, pausen: tg.pausen.slice(), warten };
  }

  /** Spieler fehlt und hält das Spiel an: nicht bereit (weg oder noch ohne Stand) und kein Verwalter. */
  private fehlt(tg: Takt, sp: number): boolean {
    return sp !== this.ich && !tg.bereit[sp] && !tg.verwalter[sp];
  }

  private taktgeberVor(tg: Takt, dt: number): void {
    const sim = this._sim!;
    tg.uhr += dt;
    if (tg.uebernahme && (tg.uebernahme.size === 0 || tg.uhr >= tg.uebernahmeBis)) this.uebernahmeFertig(tg);
    // Fehlende: nach VERWALTER_NACH_MS übernimmt der Verwalter (Drehbuch 8.3)
    for (let sp = 0; sp < this.spielerZahl; sp++) {
      if (sp === this.ich || tg.bereit[sp] || tg.verwalter[sp]) continue;
      const seit = tg.fehltSeit[sp] ?? (tg.fehltSeit[sp] = tg.uhr);
      if (tg.uhr - seit >= VERWALTER_NACH_MS && !tg.uebernahme) {
        tg.verwalter[sp] = true;
        tg.warteschlange.push({ spieler: this.ich, id: `v.${this.sitzung}.${++this.befehlNr}`, befehl: { art: 'verwalter', spieler: sp, an: true } });
      }
    }
    let laeuft = !tg.uebernahme;
    for (let sp = 0; sp < this.spielerZahl; sp++) if (this.fehlt(tg, sp)) laeuft = false;
    if (tg.pause) {
      tg.pause.restMs -= dt;
      if (tg.pause.restMs <= 0) tg.pause = null;
      else laeuft = false;
    }
    if (laeuft) {
      tg.t += (dt * tg.tempo * TICK_HZ) / 1000;
      // keiner darf zu weit zurückfallen: der Langsamste bremst
      let min = Infinity;
      for (let sp = 0; sp < this.spielerZahl; sp++) if (tg.bereit[sp] && sp !== this.ich) min = Math.min(min, tg.quittung[sp]);
      min = Math.min(min, sim.tick);
      if (tg.t > min + VORSPRUNG_TICKS) tg.t = Math.max(tg.bis - verzoegerungTicks(tg.tempo), min + VORSPRUNG_TICKS);
    }
    tg.zugAcc += dt;
    if (tg.zugAcc >= ZUG_MS || (tg.warteschlange.length && tg.zugAcc >= ZUG_MS / 2)) {
      tg.zugAcc = 0;
      this.zugSchicken(tg, laeuft);
    }
  }

  private zugSchicken(tg: Takt, laeuft: boolean): void {
    const befehle: ZugBefehl[] = tg.warteschlange.map((w) => ({ tick: tg.bis, spieler: w.spieler, id: w.id, befehl: w.befehl }));
    tg.warteschlange = [];
    if (laeuft) tg.bis = Math.max(tg.bis, Math.floor(tg.t) + verzoegerungTicks(tg.tempo));
    tg.nr++;
    const z = this.zugJetzt(tg, befehle);
    for (let sp = 0; sp < this.spielerZahl; sp++) if (sp === this.ich || tg.bereit[sp]) this.an(sp, { t: 'zug', zug: z });
  }

  private taktHallo(tg: Takt, von: number): void {
    if (von === this.ich || !this._sim) return;
    tg.bereit[von] = true;
    tg.fehltSeit[von] = null;
    tg.quittung[von] = this._sim.tick;
    const start = !tg.gestartet[von];
    tg.gestartet[von] = true;
    if (tg.verwalter[von]) {
      tg.verwalter[von] = false;
      tg.warteschlange.push({ spieler: this.ich, id: `v.${this.sitzung}.${++this.befehlNr}`, befehl: { art: 'verwalter', spieler: von, an: false } });
    }
    this.standSenden(tg, von, start ? 'start' : 'wiederbeitritt');
  }

  private standSenden(tg: Takt, an: number, grund: 'start' | 'wiederbeitritt' | 'abgleich'): void {
    const sim = this._sim!;
    tg.neuAb[an] = sim.tick;
    this.an(an, { t: 'stand', stand: sim.stand(), karte: this.kartePruef, zug: { ...this.zugJetzt(tg, []), nr: tg.nr }, grund });
  }

  private taktBefehl(tg: Takt, von: number, id: string, befehl: Befehl): void {
    if (typeof id !== 'string' || !befehl || typeof befehl !== 'object' || tg.gesehen.has(id)) return;
    // den Verwalter setzt nur der Taktgeber selbst
    if ((befehl as { art?: string }).art === 'verwalter') return;
    tg.gesehen.add(id);
    tg.warteschlange.push({ spieler: von, id, befehl });
  }

  private taktQuittung(tg: Takt, von: number, tick: number, pruef: { tick: number; wert: string }[]): void {
    if (!Number.isInteger(tick)) return;
    if (von !== this.ich) tg.quittung[von] = Math.max(tg.quittung[von], tick);
    if (!Array.isArray(pruef)) return;
    for (const p of pruef) {
      if (!p || !Number.isInteger(p.tick) || typeof p.wert !== 'string' || p.tick < tg.neuAb[von]) continue;
      let m = tg.pruef.get(p.tick);
      if (!m) { m = new Map(); tg.pruef.set(p.tick, m); }
      m.set(von, p.wert);
      this.vergleiche(tg, p.tick, m);
    }
    // alte Prüfsummen vergessen
    if (tg.pruef.size > 40) for (const t of [...tg.pruef.keys()].slice(0, tg.pruef.size - 40)) tg.pruef.delete(t);
  }

  private vergleiche(tg: Takt, tick: number, m: Map<number, string>): void {
    const meins = m.get(this.ich);
    if (meins === undefined) return;
    for (const [sp, wert] of m) {
      if (sp === this.ich || wert === meins || tick < tg.neuAb[sp]) continue;
      // auseinandergelaufen: melden und den eigenen Stand neu verteilen (Drehbuch 8.3)
      m.delete(sp);
      for (let x = 0; x < this.spielerZahl; x++) if (x === this.ich || tg.bereit[x]) this.an(x, { t: 'meldung', art: 'auseinander', spieler: sp, tick });
      if (tg.bereit[sp]) this.standSenden(tg, sp, 'abgleich');
    }
  }

  private taktPause(tg: Takt, von: number, an: boolean): void {
    if (an) {
      if (tg.pause || tg.pausen[von] <= 0) return;
      tg.pausen[von]--;
      tg.pause = { spieler: von, restMs: PAUSE_MAX_MS };
    } else if (tg.pause && (von === tg.pause.spieler || von === this.gastgeber)) tg.pause = null;
    tg.zugAcc = ZUG_MS; // sofort bekanntgeben
  }

  private taktNachtrag(tg: Takt, von: number, n: Extract<Nachricht, { t: 'nachtrag' }>): void {
    if (!tg.uebernahme) return;
    tg.uebernahme.delete(von);
    tg.nachtragNr.set(von, Number.isInteger(n.nr) ? n.nr : 0);
    // Züge, die ich noch nicht kenne, übernehmen (sie gingen vom alten Taktgeber an andere)
    const zuege = (Array.isArray(n.zuege) ? n.zuege : []).slice().sort((a, b) => a.nr - b.nr);
    for (const z of zuege) if (z.nr === (this.letzter?.nr ?? 0) + 1) this.zugAnnehmen(z);
    for (const o of Array.isArray(n.offen) ? n.offen : []) this.taktBefehl(tg, von, o.id, o.befehl);
  }

  private uebernahmeFertig(tg: Takt): void {
    tg.uebernahme = null;
    const z = this.letzter!;
    tg.nr = z.nr; tg.bis = z.bis; tg.t = Math.max(tg.t, this._sim!.tick); tg.tempo = z.tempo; tg.pause = z.pause; tg.pausen = z.pausen.slice();
    for (const x of this.zuege) for (const b of x.befehle) { tg.gesehen.add(b.id); }
    tg.warteschlange = tg.warteschlange.filter((w) => !this.zuege.some((x) => x.befehle.some((b) => b.id === w.id)));
    // wem Züge fehlen, der bekommt sie nach
    for (const [sp, nr] of tg.nachtragNr) for (const x of this.zuege) if (x.nr > nr) this.an(sp, { t: 'zug', zug: x });
    tg.nachtragNr.clear();
    tg.zugAcc = ZUG_MS;
  }
}
