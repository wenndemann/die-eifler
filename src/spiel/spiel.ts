// Das Spiel: verbindet die Simulation (src/sim) mit Darstellung (src/render) und Oberfläche (src/ui).
// Regel (Roadmap M3): Die Oberfläche ändert die Simulation nie direkt. Jede Aktion geht durch `befehl()` und wird als
// Befehl mit Tick-Nummer (aktueller Tick + 1) eingereiht – Vorbereitung auf Lockstep (M6). Lesen ist erlaubt
// (wegVorschau, kannBauen, kannFahne, sicht).
import * as THREE from 'three';
import type { MapData } from '../map/mapdata';
import type { HexGrid } from '../map/hex';
import type { Ausschnitt } from '../welt/ausschnitt';
import { FLAG, HEX } from '../welt/format';
import { Simulation } from '../sim/sim';
import type { SimStand } from '../sim/stand';
import type { Partie } from '../netz/partie';
import { Partieleiste } from '../ui/partieleiste';
import { AUTOSAVE_SPEICHER, baueSpielstand, dateiname, holeAutosave, leseSpielstand, type Spielstand } from './spielstand';
import { spieleAb } from '../sim/replay';
import { ARBEIT_MITTE_MAX, AUTOSAVE_MIN, DORFSTUFEN, FLAG_CAP, GEBAEUDE, GEBAEUDE_IDS, KIRMES, WAREN, WAREN_NAMEN } from '../sim/daten';
import { PROMILLE, TICK_HZ } from '../sim/typen';
import type { Befehl, Id, Protokoll, SichtFahne, SichtGebaeude, SichtSegment, SimSicht } from '../sim/typen';
import { Wege } from '../render/wege';
import { Fahnen } from '../render/fahnen';
import { Traeger } from '../render/traeger';
import { Arbeiter } from '../render/arbeiter';
import { Natur } from '../render/natur';
import { Gebaeude, type GebaeudeHaken } from '../render/gebaeude';
import { Markierung, type RingArt } from '../render/markierung';
import { Bauplaetze } from '../render/bauplaetze';
import { Geist } from '../render/geist';
import { Spielleiste, type MenueGruppeDaten, type StatusDaten, type Werkzeug } from '../ui/spielleiste';
import { Meldungen } from '../ui/meldungen';
import { Meldeleiste } from '../ui/meldeleiste';
import { Fensterflaeche, type Eingabe, type FensterArt, type FensterDaten } from '../ui/fenster';
import { ladeEinstellungen, speichereEinstellungen, wendeAn, type Einstellungen } from '../ui/einstellungen';
import { icons, type Icons } from '../render/icons';
import {
  bauTooltip, fahneFenster, gebaeudeFenster, hilfeFenster, Produktivitaet, protokollFenster, statistikFenster, verteilungFenster,
  verteilungKnopf, warenFenster, warnungen, wegFenster, type FensterKontext, type ProtokollZeile, type StatMass,
} from './fensterdaten';
import { erzaehlerFuer, MeldungsFilter, type Erzaehler, type Meldung } from './meldungen';
import {
  BAUPLATZ_NAMEN, bedarfNamen, fehlmengen, hexeImUmkreis, kostenText as kostenAlsText, menueGruppen, naechstePrioritaet, PRIO_NAMEN,
  reichweiteText, wareTexte, zustandsText,
} from './baumenue';
import {
  KlickErkenner, OffenerWeg, TEMPI, TickTakt, hexAbstand, hexLinie, naechsteSchritte, saatAusPruefsumme, waehleLagerHex, type Hx,
} from './logik';

export interface SpielKontext {
  map: MapData;
  grid: HexGrid;
  ausschnitt: Ausschnitt;
  base: number;
  ex: number;
  haken: GebaeudeHaken;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  /** Kameraabstand zum Zielpunkt (für Ringbreite). */
  abstand: () => number;
  canvas: HTMLElement;
  root: HTMLElement;
  /** Gelände-Treffpunkt (Ausschnitt-Meter) unter einem Bildschirmpunkt oder null. */
  pick: (clientX: number, clientY: number) => { x: number; z: number } | null;
  /** Geländehöhe wie gezeichnet (mit Überhöhung), für die Projektion in der Testschnittstelle. */
  yAt: (x: number, z: number) => number;
  /** Mehrspieler (M6): die Partie im Gleichschritt (hat schon ihren Stand) und die Namen der Spieler. */
  mehrspieler?: { partie: Partie; namen: string[]; anwesend: (sp: number) => boolean };
  /** Einzelspiel aus einem Spielstand fortsetzen. */
  laden?: SimStand;
  /** Spielstand laden (Datei gewählt): die Seite lädt die Karte des Stands und setzt dort fort. */
  onLaden?: (s: Spielstand) => void;
  /** Kamera zu einem Punkt (Ausschnitt-Meter) fahren (Sprung zum Ort aus Fenstern und Meldungen). */
  springe?: (x: number, z: number) => void;
  /** Grafik-Einstellungen (HUD) für das Einstellungsfenster und das Kamera-Tempo (Steuerung). */
  grafik?: { felder: () => Eingabe[]; setze: (id: string, wert: boolean | string | number) => void };
  kameraTempo?: (f: number) => void;
}


/** Anzeigenamen der Gebäude aus data/buildings.json. */
const NAMEN: Record<string, string> = Object.fromEntries(Object.values(GEBAEUDE).map((t) => [t.id, t.name]));
/** Kurznamen der Waren (letztes Wort des Anzeigenamens, z. B. „Baumstamm“). */
const WARE_NAME: string[] = WAREN_NAMEN.map((n) => n.split(' ').slice(1).join(' ') || n);
/** Texte der Waren für Kosten und Bedarf. */
const WARE_TEXT = wareTexte(WAREN, WAREN_NAMEN);
/** Alle Gebäudetypen, die man bauen kann (datengetrieben, ohne das Lager), in der Reihenfolge der Daten. */
const GEBAEUDE_WERKZEUGE = GEBAEUDE_IDS.filter((id) => id !== 'lager');

/** Warenliste als Text: „10 Bratkartoffeln, 10 Most, 6 Käse“. */
const listeText = (liste: readonly number[]) => kostenAlsText(liste, WARE_TEXT);
/** Was die Kirmes Weiler → Dorf freischaltet (Text). */
const FREI_TEXT = KIRMES[0] ? KIRMES[0].schaltetFrei.join(', ') : '';

/** Namen der Waren, auf die ein fertiges Gebäude wartet (Eingang laut Daten), für „Wartet auf Milch“. */
function eingangNamen(g: SichtGebaeude): string {
  const t = GEBAEUDE[g.typ];
  if (!t || g.bau < PROMILLE) return bedarfNamen(g.bedarf ?? [], WARE_TEXT);
  if (t.funktion === 'wohnen') return 'Essen';
  if (t.funktion === 'kirmes') return 'die Warenliste';
  return bedarfNamen(t.puffer.map((n, a) => (n > 0 && (g.puffer?.[a] ?? 0) < (t.wandelt?.menge ?? 1) ? 1 : 0)), WARE_TEXT);
}

/** Baumenü aus den Daten: Gruppen und Gebäude wie in data/buildings.json (ohne Lager), mit Icon, Taste und Tooltip. */
function menueDaten(ic: Icons): MenueGruppeDaten[] {
  return menueGruppen(GEBAEUDE_IDS.map((id) => GEBAEUDE[id])).map((g) => ({
    gruppe: g.gruppe,
    eintraege: g.typen.map((t) => {
      const n = GEBAEUDE_WERKZEUGE.indexOf(t.id) + 3;
      return {
        id: t.id, symbol: t.symbol, name: t.name, spruch: t.spruch, bild: ic.gebaeude[t.id],
        kostenText: kostenAlsText(t.kosten, WARE_TEXT, true), kosten: t.kosten,
        groesse: t.groesse, groesseText: `Bauplatz ${BAUPLATZ_NAMEN[t.groesse]}`, radius: t.radius,
        taste: t.taste || undefined, ziffer: n >= 3 && n <= 9 ? String(n) : undefined, tooltip: bauTooltip(t.id, WARE_TEXT),
      };
    }),
  }));
}

/** Arbeitsbereich zum Zeigen: Mitte, Außenkante der Ringe (innen „gut“, außen „geht noch“), Arbeitshexe und Zählung. */
interface RingDaten {
  mitte: Hx; innen: Hx[]; aussen: Hx[]; gut: Hx[]; fern: Hx[];
  art: string; summe: number; nah: number;
}

const key = (h: Hx) => `${h.q},${h.r}`;
const gleich = (a: Hx | null, b: Hx | null) => !!a && !!b && a.q === b.q && a.r === b.r;

export class Spiel {
  readonly group = new THREE.Group();
  readonly lagerHex: Hx;
  readonly karteInfo: Protokoll['karte'];
  /** Eigener Spieler (0 im Einzelspiel). */
  readonly ich: number;
  private _sim: Simulation;
  private readonly partie: Partie | null;
  private readonly partieleiste: Partieleiste;
  /** Letzte Partie-Ereignisse, schon gemeldet. */
  private partieGemeldet = 0;
  private letzterTakt = performance.now();
  private readonly wege: Wege;
  private readonly fahnen: Fahnen;
  private readonly traeger: Traeger;
  private readonly arbeiter: Arbeiter;
  private readonly natur: Natur;
  private readonly gebaeude: Gebaeude;
  private readonly markierung: Markierung;
  private readonly bauplaetze: Bauplaetze;
  private readonly geist: Geist;
  private readonly leiste: Spielleiste;
  private readonly takt = new TickTakt(TICK_HZ);
  private readonly erkenner = new KlickErkenner();

  private _sicht: SimSicht;
  private fahneAt = new Map<string, SichtFahne>();
  private gebAt = new Map<string, SichtGebaeude>();
  private segAt = new Map<string, SichtSegment>();
  private netzSig = '';
  /** Segmente, unter denen die Kulissenhäuser schon ausgeblendet sind. */
  private freigeraeumt = new Set<number>();

  tempo = 1;
  pausiert = false;
  werkzeug: Werkzeug = 'keins';
  /** Hex unter Maus bzw. zuletzt angetippt (für Info und Markierung). */
  fokus: Hx | null = null;
  /** Offener Weg beim Wegbau von Hand: Start (Fahne) und feste Zwischenpunkte. */
  private weg = new OffenerWeg();
  /** Touch: angetippter Hex, der noch bestätigt werden muss. */
  private offen: Hx | null = null;
  private zeiger: 'mouse' | 'touch';
  private maus: { x: number; y: number } | null = null;
  private mausTimer = 0;
  private statusTimer = 0;
  private meldung: { text: string; warn: boolean; bis: number } | null = null;
  private vorschauSig = '';
  private vorschauPfad: Hx[] | null = null;
  private schrittSig = '';
  private schrittHexe: Hx[] = [];
  /** Gewähltes Gebäude (Gebäudekarte mit Zustand, Bedarf und Priorität). */
  private gewaehlt: Id | null = null;
  /** Bauplatz-Anzeige auch ohne Gebäude-Werkzeug (Taste P). */
  private zeigeBauplaetze = false;
  /** Hex in der Bildschirmmitte (Zentrum der Bauplatz-Anzeige, solange kein Zeiger da ist). */
  private mitteHex: Hx | null = null;
  private mitteTimer = 0;
  private menueWarOffen = false;
  private vorschauDatenSig = '';
  private vorschauDaten: { ringe: RingDaten | null; text: string; warn: boolean; ok: boolean } | null = null;
  /** Arbeitsbereich-Modus: Gebäude, dessen Mittelpunkt gerade gewählt wird (Ringe folgen dem Zeiger). */
  private bereichId: Id | null = null;
  private ringSig = '';
  private ringDaten: RingDaten | null = null;
  /** Text der Bauvorschau, der gerade in der Hinweiszeile steht ('' = keiner). */
  private vorschauGesetzt = '';
  /** Erzählfigur des Völkchens und ihre Meldungen (Drehbuch 1.4, 4.4). */
  readonly erzaehler: Erzaehler;
  private readonly meldungen: Meldungen;
  private readonly filter: MeldungsFilter;
  private tipps = new Set<number>();
  private begruesst = false;
  private gesperrtSig = '';
  /** Fenster (M7): Fensterfläche, Meldungen am Rand, Produktivität, Protokoll, Statistik-Auswahl, Abrissfrage, Einstellungen. */
  readonly fenster: Fensterflaeche;
  private readonly meldeleiste: Meldeleiste;
  private readonly produktiv = new Produktivitaet();
  readonly protokollZeilen: ProtokollZeile[] = [];
  private gemeldetBis = 0;
  private statMass: StatMass = 'bewohner';
  private abrissFrage: { id: string; bis: number } | null = null;
  private warnTimer = 0;
  einst: Einstellungen;
  private readonly ic: Icons;
  /** Nächster Autosave (Tick) und wann zuletzt gespeichert wurde. */
  private autosaveTick: number;
  autosaveZuletzt: string | null = null;

  constructor(private ctx: SpielKontext) {
    const { ausschnitt, map, grid, base, ex } = ctx;
    const p = ausschnitt.param;
    this.karteInfo = { version: p.version, q: p.q, r: p.r, size: p.size, pruefsumme: ausschnitt.pruefsumme };
    this.partie = ctx.mehrspieler?.partie ?? null;
    if (this.partie) {
      if (!this.partie.sim) throw new Error('Die Partie hat noch keinen Stand');
      this._sim = this.partie.sim;
      this.ich = this.partie.ich;
      this.partie.onNeueSim = (sim) => this.simErsetzt(sim);
      setInterval(() => { if (performance.now() - this.letzterTakt > 200) this.netzTakt(); }, 100);
    } else {
      this._sim = ctx.laden ? Simulation.ausStand(ausschnitt.hex, ctx.laden)
        : new Simulation(ausschnitt.hex, saatAusPruefsumme(ausschnitt.pruefsumme), waehleLagerHex(ausschnitt.hex, ausschnitt.kerne, map.info.start));
      this.ich = 0;
    }
    this.lagerHex = this._sim.startDaten()[this.ich];

    this.wege = new Wege(map, grid, base, ex);
    this.fahnen = new Fahnen(map, grid, base, ex);
    this.traeger = new Traeger(map, grid, base, ex);
    this.gebaeude = new Gebaeude(map, grid, base, ex, ctx.haken);
    this.arbeiter = new Arbeiter(map, grid, base, ex);
    this.natur = new Natur(map, grid, base, ex, ctx.haken.trees);
    this.markierung = new Markierung(map, grid, base, ex);
    this.bauplaetze = new Bauplaetze(map, grid, base, ex);
    this.geist = new Geist(map, grid, base, ex);
    this.wege.wald = ctx.haken.trees ?? null;
    this.fahnen.kamera = ctx.camera; this.traeger.kamera = ctx.camera; this.gebaeude.kamera = ctx.camera; this.arbeiter.kamera = ctx.camera;
    this.group.add(this.wege.group, this.fahnen.group, this.traeger.group, this.gebaeude.group, this.arbeiter.group, this.natur.group,
      this.bauplaetze.group, this.geist.group, this.markierung.group);
    ctx.scene.add(this.group);

    this.zeiger = matchMedia('(pointer: coarse)').matches ? 'touch' : 'mouse';
    this.einst = ladeEinstellungen();
    wendeAn(this.einst);
    ctx.kameraTempo?.(this.einst.kameraTempo / 100);
    this.ic = icons();
    this.autosaveTick = this._sim.tick + AUTOSAVE_MIN * 60 * TICK_HZ;
    this.leiste = new Spielleiste(ctx.root, {
      onWerkzeug: (w) => this.waehleWerkzeug(w === this.werkzeug ? 'keins' : w),
      onBestaetigen: () => this.bestaetigen(),
      onAbbrechen: () => this.abbrechen(),
      onZurueck: () => this.zurueck(),
      onTempo: (t) => (t === 0 ? this.pauseUmschalten() : this.setzeTempo(t)),
      onFenster: (id) => this.fensterUmschalten(id),
    }, menueDaten(this.ic));
    this._sicht = this._sim.sicht(this.ich);
    this.indizes();
    this.partieleiste = new Partieleiste(ctx.root, {
      onSpeichern: () => this.speichern(),
      onLaden: this.partie || !ctx.onLaden ? undefined : (datei) => void this.ladeDatei(datei),
      onWeiter: () => this.partie?.pause(false),
    }, !!this.partie);
    // Zustand in Klartext über den Gebäuden (nur, wenn etwas fehlt oder wartet)
    this.gebaeude.schild = (g) => {
      const z = g.getrennt ? 'getrennt' : g.zustand;
      // fremde Dörfer: nur der Name am Lager
      if (g.sp !== this.ich) return g.typ === 'lager' ? { text: this.namen[g.sp] ?? `Spieler ${g.sp + 1}`, warn: false } : null;
      if (z === 'arbeitet' || z === 'bereit' || z === 'baustelle' || z === 'wohnraum_voll' || g.typ === 'lager') return null;
      const zt = zustandsText(z, g.bau < PROMILLE, eingangNamen(g), GEBAEUDE[g.typ]?.funktion);
      return { text: zt.titel, warn: zt.warn };
    };
    // Erzählfigur des Völkchens zum Startort, Begrüßung
    const ort = map.info.start ?? ausschnitt.kerne[0]?.name ?? 'der Eifel';
    this.erzaehler = erzaehlerFuer(map.info.start, ausschnitt.kerne.map((k) => k.name));
    this.meldungen = new Meldungen(ctx.root);
    this.fenster = new Fensterflaeche(ctx.root, {
      name: (a) => WARE_TEXT[a]?.mehr ?? WAREN[a], bild: (a) => this.ic.ware[a], zeichen: (a) => WARE_TEXT[a]?.icon || '•',
    });
    this.meldeleiste = new Meldeleiste(ctx.root, (h) => this.springeZu(h));
    this.filter = new MeldungsFilter(this.erzaehler, ort);
    this.leiste.setTempo(this.tempo, this.pausiert);
    this.leiste.setWerkzeug(this.werkzeug);
    this.hinweisSetzen();
    this.statusSetzen();
    this.eingabe();
  }

  // ------------------------------------------------------------------ Testschnittstelle und Befehle

  /** Nur zum Lesen (Abfragen wie wegVorschau, kannBauen, sicht, statistik). Geändert wird nur über befehl(). */
  get sim(): Simulation { return this._sim; }

  get sicht(): SimSicht { return this._sicht; }

  /**
   * Jede Aktion der Oberfläche: Befehl mit Tick-Nummer. Bei Pause laufen 2 Ticks, damit die Welt reagiert. Im Mehrspieler geht er an
   * den Taktgeber und wirkt, sobald er in einem Zug zurückkommt (bei allen am selben Tick).
   */
  befehl(b: Befehl): void {
    if (this.partie) { this.partie.befehl(b); return; }
    this._sim.befehl(this._sim.tick + 1, 0, b);
    if (this.pausiert) this.schritte(2);
  }

  /** Namen der Spieler (Einzelspiel: „Du“). */
  get namen(): string[] { return this.ctx.mehrspieler?.namen ?? ['Du']; }

  /** Die Partie (Mehrspieler) oder null. */
  get netz(): Partie | null { return this.partie; }

  /** Neuer Stand vom Taktgeber (Start, Wiederbeitritt, Abgleich): Simulation tauschen, Sicht neu. */
  private simErsetzt(sim: Simulation): void {
    this._sim = sim;
    this.neueSicht();
  }

  /** Spielstand als Datei herunterladen. */
  speichern(): Spielstand {
    const st = baueSpielstand(this.karteInfo, this.namen, this._sim.stand(), this.partie?.zug?.pausen);
    const blob = new Blob([JSON.stringify(st)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = dateiname(this.ctx.map.info.start ?? this.ctx.map.info.name ?? 'eifel');
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    this.melde('Gespeichert – die Datei liegt bei den Downloads.', false);
    return st;
  }

  private async ladeDatei(datei: File): Promise<void> {
    try { this.ctx.onLaden?.(leseSpielstand(await datei.text())); } catch (e) { this.melde((e as Error).message, true); }
  }

  /** n Ticks sofort rechnen (Tests). */
  schritte(n: number): void {
    for (let i = 0; i < n; i++) this._sim.schritt();
    this.neueSicht();
  }

  pruefsumme(): string { return this._sim.pruefsumme(); }

  /** Replay (Tests): rechnet ein Protokoll auf der eigenen Karte dieses Browsers in einer frischen Simulation nach (die laufende bleibt unberührt). */
  nachspielen(p: Protokoll): string {
    return spieleAb(this.ctx.ausschnitt.hex, p).pruefsumme();
  }

  protokoll(): Protokoll { return this._sim.protokoll(this.karteInfo); }

  /** Pause an/aus (Knopf, Leertaste). Im Mehrspieler zählt nur die echte Pause, nicht das Warten auf andere. */
  pauseUmschalten(): void {
    if (this.partie) this.partie.pause(!this.partie.zug?.pause);
    else this.pause(!this.pausiert);
  }

  pause(an: boolean): void {
    if (this.partie) { this.partie.pause(an); return; }
    this.pausiert = an;
    this.takt.zuruecksetzen();
    this.leiste.setTempo(this.tempo, this.pausiert);
  }

  setzeTempo(t: number): void {
    if (this.partie) {
      if (this.partie.ich !== this.partie.gastgeber) { this.melde('Das Tempo stellt der Gastgeber ein.', true); return; }
      this.partie.setzeTempo(Math.min(TEMPI[TEMPI.length - 1], Math.max(TEMPI[0], Math.round(t))));
      return;
    }
    this.tempo = Math.min(TEMPI[TEMPI.length - 1], Math.max(TEMPI[0], Math.round(t)));
    this.leiste.setTempo(this.tempo, this.pausiert);
  }

  /** Bildschirmposition (CSS-Pixel) der Mitte eines Hex, für Tests mit echten Mausklicks und Tipps. */
  bildschirm(h: Hx): { x: number; y: number } {
    const w = this.ctx.grid.toWorld(h);
    const v = new THREE.Vector3(w.x, this.ctx.yAt(w.x, w.z) + 4, w.z).project(this.ctx.camera);
    return { x: ((v.x + 1) / 2) * innerWidth, y: ((1 - v.y) / 2) * innerHeight };
  }

  setExaggeration(ex: number): void {
    this.ctx.ex = ex;
    this.wege.setExaggeration(ex); this.fahnen.setExaggeration(ex); this.traeger.setExaggeration(ex);
    this.gebaeude.setExaggeration(ex); this.markierung.setExaggeration(ex);
    this.arbeiter.setExaggeration(ex); this.natur.setExaggeration(ex);
    this.bauplaetze.setExaggeration(ex); this.geist.setExaggeration(ex);
  }

  // ------------------------------------------------------------------ Frame

  /**
   * Gleichschritt weiterdrehen mit der echten Zeit seit dem letzten Mal: Auch ein langsamer Rechner muss mit den anderen Schritt halten
   * (er holt Ticks nach, statt in Zeitlupe zu laufen). Läuft aus dem Frame und, wenn keine Bilder kommen (Tab im Hintergrund, sehr
   * langsame Grafik), aus einem Zeitgeber – sonst bremst ein Taktgeber im Hintergrund alle.
   */
  private netzTakt(): void {
    const jetzt = performance.now();
    this.partie!.vor(jetzt - this.letzterTakt);
    this.letzterTakt = jetzt;
  }

  /** Ein Frame: `dt` in Sekunden (für Bewegungen begrenzt). */
  update(dt: number): void {
    let alpha: number;
    if (this.partie) {
      const vorher = this.pausiert || this.tempo;
      this.netzTakt();
      if (this._sicht.tick !== this._sim.tick) this.neueSicht();
      this.pausiert = this.partie.angehalten;
      this.tempo = this.partie.tempo;
      alpha = this.partie.anteil;
      if (vorher !== (this.pausiert || this.tempo)) this.leiste.setTempo(this.tempo, this.pausiert);
      this.partieMeldungen();
    } else {
      const t = this.takt.vor(dt, this.tempo, this.pausiert);
      alpha = t.alpha;
      if (t.ticks > 0) {
        for (let i = 0; i < t.ticks; i++) this._sim.schritt();
        this.neueSicht();
      }
    }
    const a = this.pausiert ? 0 : alpha;
    this.gebaeude.update(this._sicht, a, dt);
    this.wege.update(this._sicht, a, dt);
    this.fahnen.update(this._sicht, a, dt);
    this.traeger.update(this._sicht, a, dt);
    this.natur.update(this._sicht);
    this.arbeiter.update(this._sicht, a, dt);

    // Maus: Hex unter dem Zeiger (gedrosselt, folgt auch der bewegten Kamera)
    this.mausTimer -= dt;
    if (this.maus && this.zeiger === 'mouse' && this.mausTimer <= 0) {
      this.mausTimer = 0.05;
      const h = this.hexUnter(this.maus.x, this.maus.y);
      if (!gleich(h, this.fokus)) { this.fokus = h; }
    }
    // Bildschirmmitte als Zentrum der Bauplatz-Anzeige (Touch oder Maus außerhalb), gedrosselt
    this.mitteTimer -= dt;
    if (this.mitteTimer <= 0 && this.bauplatzAn() && (this.zeiger === 'touch' || !this.fokus)) {
      this.mitteTimer = 0.2;
      this.mitteHex = this.ctx.pick(innerWidth / 2, innerHeight / 2) ? this.hexUnter(innerWidth / 2, innerHeight / 2) : this.mitteHex;
    }
    this.vorschauUndRinge();

    this.statusTimer -= dt;
    if (this.statusTimer <= 0) { this.statusTimer = 0.25; this.statusSetzen(); }
    this.fenster.takt();
    this.warnTimer -= dt;
    if (this.warnTimer <= 0) {
      this.warnTimer = 1;
      for (const w of this.meldeleiste.setze(warnungen(this._sicht, this.ich))) this.insProtokoll(w.text, true, w.orte[0]);
    }
    if (this.abrissFrage && performance.now() > this.abrissFrage.bis) { this.abrissFrage = null; this.fenster.jetzt(); }
    if (this._sim.tick >= this.autosaveTick) { this.autosaveTick = this._sim.tick + AUTOSAVE_MIN * 60 * TICK_HZ; if (this.einst.autosave) this.autosave(); }
    if (this.meldung && performance.now() > this.meldung.bis) { this.meldung = null; this.hinweisSetzen(); }
  }

  private neueSicht(): void {
    this._sicht = this._sim.sicht(this.ich);
    this.indizes();
    this.produktiv.messe(this._sicht, this.ich);
    this.meldungenPruefen();
  }

  private zeigeMeldung(m: Meldung): void {
    const g = m.gebaeude ? this._sicht.gebaeude.find((x) => x.id === m.gebaeude) : undefined;
    const ort = g ? { q: g.q, r: g.r } : undefined;
    this.meldungen.zeige({ wer: this.erzaehler.name, text: m.text, platt: m.platt, gross: m.gross, onKlick: ort ? () => this.springeZu(ort) : undefined });
    this.insProtokoll(`${this.erzaehler.name}: ${m.text}`, false, ort);
  }

  /** Eintrag im Ereignisprotokoll (L). */
  private insProtokoll(text: string, warn: boolean, ort?: Hx): void {
    this.protokollZeilen.push({ tick: this._sicht.tick, text, warn, ort });
    if (this.protokollZeilen.length > 500) this.protokollZeilen.splice(0, this.protokollZeilen.length - 500);
  }

  /** Verlauf der Meldungen (Tests). */
  get meldungsVerlauf(): readonly string[] { return this.meldungen.verlauf; }

  /** Neue Ereignisse als Meldungen der Erzählfigur, dazu Tipps, wenn es in den ersten Minuten hakt (Drehbuch 4.4). */
  private meldungenPruefen(): void {
    const s = this._sicht;
    const k = s.dorf.kirmes;
    const liste = k ? listeText(k.liste.map((n, a) => Math.max(0, n - k.geliefert[a]))) : '';
    const name = (id: number) => { const g = s.gebaeude.find((x) => x.id === id); return g ? { typ: g.typ, name: NAMEN[g.typ] ?? g.typ } : null; };
    // jedes fertige Gebäude, Fest und jede neue Stufe ins Protokoll (die Erzählfigur meldet nur das Erste)
    for (const e of s.ereignisse) {
      if (e.nr <= this.gemeldetBis) continue;
      this.gemeldetBis = e.nr;
      const g = e.gebaeude ? s.gebaeude.find((x) => x.id === e.gebaeude) : undefined;
      const ort = g ? { q: g.q, r: g.r } : undefined;
      if (e.art === 'fertig' && g) this.insProtokoll(`${NAMEN[g.typ] ?? g.typ} ist fertig.`, false, ort);
      else if (e.art === 'kirmes') this.insProtokoll('Die Kirmes beginnt!', false, ort);
      else if (e.art === 'stufe') this.insProtokoll(`Das Dorf ist jetzt ${DORFSTUFEN[e.wert] ?? ''}.`, false);
      else if (e.art === 'zuzug') this.insProtokoll(`${e.wert} Zugezogene kommen zur Kirmes.`, false);
      else if (e.art === 'notnagel') this.insProtokoll('Ein Zugezogener kommt (Notnagel).', false);
    }
    for (const m of this.filter.neue(s.ereignisse, s.dorf, name, (a) => WARE_TEXT[a]?.mehr ?? '', (n) => DORFSTUFEN[n] ?? '', FREI_TEXT, liste)) this.zeigeMeldung(m);
    // Begrüßung erst, wenn das Spiel läuft (beim Laden wäre sie schon wieder weg)
    if (!this.begruesst && s.tick >= 20) {
      this.begruesst = true;
      this.zeigeMeldung(this.filter.begruessung(KIRMES[0] ? listeText(KIRMES[0].liste) : ''));
    }
    const hat = (typ: string) => s.gebaeude.some((g) => g.sp === this.ich && g.typ === typ);
    const min = s.tick / (60 * 20);
    const tipp = (i: number, wann: boolean) => {
      if (!wann || this.tipps.has(i) || !this.einst.tipps) return;
      this.tipps.add(i);
      const m = this.filter.tipp(i, liste);
      if (m) this.zeigeMeldung(m);
    };
    tipp(0, min > 1 && !hat('holzfaeller'));
    tipp(1, min > 4 && hat('holzfaeller') && !hat('saegewerk'));
    tipp(2, min > 8 && (!hat('kartoffelfeld') || !hat('wohnhaus')));
    tipp(3, min > 14 && !hat('kirmesplatz') && s.dorf.stufe === 0);
  }

  private indizes(): void {
    const s = this._sicht;
    this.fahneAt.clear(); this.gebAt.clear(); this.segAt.clear();
    for (const f of s.fahnen) this.fahneAt.set(key(f), f);
    for (const g of s.gebaeude) this.gebAt.set(key(g), g);
    let maxS = 0, maxF = 0;
    for (const sg of s.segmente) {
      maxS = Math.max(maxS, sg.id);
      for (let i = 1; i < sg.pfad.length - 1; i++) this.segAt.set(key(sg.pfad[i]), sg);
      // Wege laufen nicht durch die Kulissenhäuser der echten Ortskerne
      if (!this.freigeraeumt.has(sg.id)) {
        this.freigeraeumt.add(sg.id);
        for (const h of sg.pfad) {
          const w = this.ctx.grid.toWorld(h);
          this.ctx.haken.houses?.verstecke(w.x, w.z, this.ctx.map.info.hex.size * 0.6);
        }
      }
    }
    for (const f of s.fahnen) maxF = Math.max(maxF, f.id);
    this.netzSig = `${s.fahnen.length}/${s.segmente.length}/${s.gebaeude.length}/${maxF}/${maxS}`;
  }

  // ------------------------------------------------------------------ Eingabe

  private eingabe(): void {
    const c = this.ctx.canvas;
    c.addEventListener('pointerdown', (e) => {
      this.zeiger = e.pointerType === 'mouse' ? 'mouse' : 'touch';
      if (e.pointerType === 'mouse' && e.button !== 0 && e.button !== 2) return;
      // Ein offenes Baumenü schließt sich beim Tippen auf die Karte; dieser Tipp zählt dann nicht als Aktion
      this.menueWarOffen = this.leiste.menueOffen;
      this.leiste.menueZu();
      this.erkenner.runter(e.pointerId, e.clientX, e.clientY, performance.now(), e.button);
      if (this.zeiger === 'touch') this.hinweisSetzen();
    });
    c.addEventListener('pointermove', (e) => {
      this.erkenner.bewegt(e.pointerId, e.clientX, e.clientY);
      if (e.pointerType === 'mouse') { this.zeiger = 'mouse'; this.maus = { x: e.clientX, y: e.clientY }; }
    });
    c.addEventListener('pointerleave', (e) => {
      if (e.pointerType === 'mouse') { this.maus = null; this.fokus = null; }
    });
    c.addEventListener('pointerup', (e) => {
      const knopf = this.erkenner.hoch(e.pointerId, e.clientX, e.clientY, performance.now());
      if (this.menueWarOffen) { this.menueWarOffen = false; return; }
      if (knopf === 2) { if (!this.rechtsklickPrioritaet(e.clientX, e.clientY)) this.abbrechen(); }
      else if (knopf === 0) this.klick(e.clientX, e.clientY);
    });
    c.addEventListener('pointercancel', (e) => this.erkenner.abbruch(e.pointerId));
    addEventListener('keydown', (e) => this.taste(e));
  }

  private taste(e: KeyboardEvent): void {
    const t = e.target;
    if (t instanceof HTMLInputElement || t instanceof HTMLSelectElement || t instanceof HTMLTextAreaElement) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    // offenes Baumenü: die Taste des Gebäudes (data/buildings.json) wählt es
    if (this.leiste.menueOffen && e.key.length === 1) {
      const id = this.leiste.menueTaste(e.key);
      if (id) { e.preventDefault(); this.leiste.menueZu(); this.waehleWerkzeug(id); return; }
    }
    // 1 Weg, 2 Fahne, ab 3 die Gebäude in der Reihenfolge des Baumenüs
    const ziffer = /^(?:Digit|Numpad)([1-9])$/.exec(e.code);
    if (ziffer) {
      const n = Number(ziffer[1]);
      const w = n === 1 ? 'weg' : n === 2 ? 'fahne' : GEBAEUDE_WERKZEUGE[n - 3];
      if (w) { this.leiste.menueZu(); this.waehleWerkzeug(w); }
      return;
    }
    switch (e.code) {
      case 'KeyB': this.leiste.menueUmschalten(); return;
      case 'KeyP': this.zeigeBauplaetze = !this.zeigeBauplaetze; return;
      case 'Delete': case 'KeyX': this.leiste.menueZu(); this.waehleWerkzeug('abriss'); return;
      case 'Escape': this.esc(); return;
      case 'KeyI': this.fensterUmschalten('waren'); return;
      case 'KeyV': this.fensterUmschalten('verteilung'); return;
      case 'KeyT': this.fensterUmschalten('statistik'); return;
      case 'KeyL': this.fensterUmschalten('protokoll'); return;
      case 'KeyH': this.fensterUmschalten('hilfe'); return;
      case 'Backspace': if (this.werkzeug === 'weg') { e.preventDefault(); this.zurueck(); } return;
      case 'Space': e.preventDefault(); this.pauseUmschalten(); return;
      case 'Enter': case 'NumpadEnter': this.bestaetigen(); return;
      case 'NumpadAdd': this.setzeTempo(this.tempo + 1); return;
      case 'NumpadSubtract': this.setzeTempo(this.tempo - 1); return;
    }
    if (e.key === '+' || e.key === '=') this.setzeTempo(this.tempo + 1);
    else if (e.key === '-' || e.key === '_') this.setzeTempo(this.tempo - 1);
  }

  /** Hex unter einem Bildschirmpunkt; bei Weg, Info und Abriss rasten Gebäude ein (ihr Modell ragt über den Nachbar-Hex). */
  private hexUnter(x: number, y: number): Hx | null {
    const p = this.ctx.pick(x, y);
    if (!p) return null;
    const h = this.ctx.grid.fromWorld(p.x, p.z);
    if (this.werkzeug === 'fahne' || GEBAEUDE_WERKZEUGE.includes(this.werkzeug) || this.bereichId !== null) return h;
    if (this.gebAt.has(key(h))) return h;
    let best: Hx | null = null, bd = (HEX.R * 0.9) ** 2;
    for (const g of this._sicht.gebaeude) {
      const m = this.gebaeude.mitte(g.id);
      if (!m) continue;
      const d = (m.x - p.x) ** 2 + (m.z - p.z) ** 2;
      if (d < bd) { bd = d; best = { q: g.q, r: g.r }; }
    }
    return best ?? h;
  }

  private klick(x: number, y: number): void {
    const h = this.hexUnter(x, y);
    if (!h) return;
    this.klickAuf(h, this.zeiger === 'touch');
  }

  /** Ein Klick (Maus) oder Tipp (Touch) auf einen Hex – öffentlich für Tests der Bedienung. */
  klickAuf(h: Hx, touch: boolean): void {
    this.zeiger = touch ? 'touch' : 'mouse';
    this.fokus = h;
    const w = this.werkzeug;
    if (this.bereichId !== null) {
      // Arbeitsbereich: Maus setzt sofort, Touch zeigt erst (zweiter Tipp oder „Setzen“ bestätigt)
      if (touch && !gleich(this.offen, h)) { this.offen = h; this.hinweisSetzen(); return; }
      this.offen = null;
      this.bereichSetzen(h);
      return;
    }
    if (w === 'keins') {
      // ohne Werkzeug: Fenster zum Gebäude, zur Fahne oder zum Weg (fremde Gebäude: nur ansehen, wem sie gehören)
      const g = this.gebAt.get(key(h));
      const f = this.fahneAt.get(key(h));
      const sg = this.segAt.get(key(h));
      if (g && g.sp !== this.ich) this.melde(`${NAMEN[g.typ] ?? g.typ} von ${this.namen[g.sp] ?? 'einem Nachbarn'}.`, false);
      if (g) this.oeffneGebaeude(g.id);
      else if (f && f.sp === this.ich) this.oeffneFahne(f.id);
      else if (sg && sg.sp === this.ich) this.oeffneWeg(sg.id);
      return;
    }
    if (w === 'fahne') { this.aktion(h); return; }
    if (w === 'weg' && !this.weg.aktiv) {
      if (this.fahneAt.get(key(h))?.sp === this.ich) { this.weg.beginne(h); this.offen = null; this.hinweisSetzen(); }
      else this.melde('Ein Weg beginnt an einer Fahne – erst eine Fahne wählen.', true);
      return;
    }
    if (w === 'weg') { this.wegKlick(h); return; }
    if (!touch) { this.aktion(h); return; }
    // Touch: erster Tipp zeigt, zweiter Tipp auf dasselbe Ziel (oder „Bauen“) führt aus
    if (gleich(this.offen, h)) { this.offen = null; this.aktion(h); return; }
    this.offen = h;
    this.hinweisSetzen();
  }

  /** Ist der Hex ein Endziel des Wegs (Fahne oder Weg-Hex), das den Weg sofort baut? */
  private istEndziel(h: Hx): boolean {
    return this.fahneAt.get(key(h))?.sp === this.ich || this.segAt.get(key(h))?.sp === this.ich;
  }

  /** Klick auf einen Hex bei laufendem Wegbau. */
  private wegKlick(h: Hx): void {
    const l = this.weg.letzter!;
    if (gleich(h, l)) {
      // nochmal auf den letzten Punkt: bis dorthin bauen; auf dem Start ohne Zwischenpunkte: Start verwerfen
      if (this.weg.zwischenpunkte.length) this.wegBauen();
      else { this.weg.leeren(); this.offen = null; this.hinweisSetzen(); }
      return;
    }
    if (this.istEndziel(h)) {
      // Fahne oder Weg baut sofort, auch am Handy: Wege kosten nichts und lassen sich abreißen
      this.offen = null;
      this.wegZu(h, true);
      return;
    }
    this.offen = null;
    this.wegZu(h, false);
  }

  /** Teilstück vom letzten Punkt nach `h` anhängen; bei `bauen` den ganzen Weg bauen, sonst `h` als Zwischenpunkt behalten. */
  private wegZu(h: Hx, bauen: boolean): void {
    const stueck = this._sim.wegAbschnitt(this.weg.letzter!, h, this.weg.pfad, this.weg.rest, this.ich);
    if (!stueck) { this.melde(this.weg.rest < 1 ? 'Der Weg ist am Limit (60 Schritte) – bauen oder zurück.' : 'Dorthin führt kein Weg (Hindernis, zu weit oder Fahne voll).', true); return; }
    if (!this.weg.haengeAn(stueck)) { this.melde('Dorthin führt kein Weg.', true); return; }
    if (bauen) this.wegBauen();
    else { this.meldung = null; this.hinweisSetzen(); }
  }

  /** Den offenen Weg bis zum letzten Punkt bauen. Bei freiem Ende entsteht dort eine Fahne und der Weg geht von dort weiter. */
  private wegBauen(): void {
    const pfad = this.weg.pfad;
    if (pfad.length < 2) return;
    const ende = pfad[pfad.length - 1];
    const hatFahne = this.fahneAt.has(key(ende));
    this.befehl({ art: 'weg', pfad });
    this.offen = null;
    this.weg.leeren();
    if (!hatFahne) this.weg.beginne(ende);
    this.meldung = null;
    this.hinweisSetzen();
  }

  /** Letzten Zwischenpunkt entfernen (Rücktaste, „Zurück“). */
  zurueck(): void {
    if (this.werkzeug !== 'weg' || !this.weg.zurueck()) return;
    this.offen = null;
    this.meldung = null;
    this.hinweisSetzen();
  }

  private bestaetigen(): void {
    if (this.bereichId !== null) {
      const h = this.offen ?? (this.zeiger === 'mouse' ? this.fokus : null);
      if (h) { this.offen = null; this.bereichSetzen(h); }
      return;
    }
    if (this.werkzeug === 'keins') return;
    if (this.werkzeug === 'weg') {
      if (!this.weg.aktiv) return;
      if (this.offen) { const h = this.offen; this.offen = null; this.wegZu(h, true); return; }
      if (this.weg.zwischenpunkte.length) { this.wegBauen(); return; }
      // ohne Zwischenpunkte: wie ein Klick auf den Hex unter der Maus
      if (this.zeiger === 'mouse' && this.fokus && !gleich(this.fokus, this.weg.start)) this.wegKlick(this.fokus);
      return;
    }
    const h = this.offen ?? (this.zeiger === 'mouse' ? this.fokus : null);
    if (!h) return;
    this.offen = null;
    this.aktion(h);
  }

  /** Esc, Rechtsklick, „Abbrechen“: erst das offene Ziel, dann den offenen Weg, dann das Werkzeug. */
  abbrechen(): void {
    if (this.leiste.menueOffen) { this.leiste.menueZu(); return; }
    if (this.bereichId !== null) { this.bereichId = null; this.offen = null; this.fenster.jetzt(); }
    else if (this.offen) this.offen = null;
    else if (this.weg.aktiv) this.weg.leeren();
    else if (this.werkzeug !== 'keins') this.waehleWerkzeug('keins');
    this.meldung = null;
    this.hinweisSetzen();
  }

  /** Esc: erst abbrechen (Menü, Modus, Werkzeug), dann das oberste Fenster schließen, sonst die Einstellungen öffnen. */
  esc(): void {
    if (this.leiste.menueOffen || this.bereichId !== null || this.offen || this.weg.aktiv || this.werkzeug !== 'keins') { this.abbrechen(); return; }
    if (this.fenster.schliesseOberstes()) return;
    this.fensterUmschalten('einstellungen');
  }

  waehleWerkzeug(w: Werkzeug): void {
    this.werkzeug = w;
    if (w !== 'keins') { this.bereichId = null; this.gewaehlt = null; this.fenster.schliesseGruppe('auswahl'); }
    this.weg.leeren();
    this.offen = null;
    this.meldung = null;
    this.vorschauSig = '';
    this.leiste.setWerkzeug(w);
    this.hinweisSetzen();
  }

  // ------------------------------------------------------------------ Aktionen (alle über befehl)

  /** Führt das gewählte Werkzeug auf dem Hex aus. */
  private aktion(h: Hx): void {
    const w = this.werkzeug;
    if (w === 'fahne') {
      if (this._sim.kannFahne(h.q, h.r, this.ich)) { this.befehl({ art: 'fahne', q: h.q, r: h.r }); this.hinweisSetzen(); }
      else this.melde(`Hier geht keine Fahne: ${this.grundFahne(h)}.`, true);
    } else if (GEBAEUDE_WERKZEUGE.includes(w)) {
      if (this._sim.kannBauen(w, h.q, h.r, this.ich)) {
        this.befehl({ art: 'gebaeude', typ: w, q: h.q, r: h.r });
        this.melde(`${NAMEN[w]} wird gebaut – Material kommt aus dem Lager (${this.kostenText(w)}).`, false);
      } else this.melde(`${NAMEN[w]} geht hier nicht: ${this.grundBauen(w, h)}.`, true);
    } else if (w === 'abriss') {
      const b = this.abrissBefehl(h);
      if (b === 'lager') this.melde('Das Lager bleibt stehen – ohne Lager geht es nicht.', true);
      else if (b === 'fremd') this.melde('Das gehört einem Nachbarn – abreißen kann man nur Eigenes.', true);
      else if (b) { this.befehl(b); this.melde('Abgerissen.', false); }
      else this.melde('Hier ist nichts zum Abreißen.', true);
    }
  }

  private abrissBefehl(h: Hx): Befehl | 'lager' | 'fremd' | null {
    const g = this.gebAt.get(key(h));
    if (g) return g.sp !== this.ich ? 'fremd' : g.typ === 'lager' ? 'lager' : { art: 'abriss_gebaeude', id: g.id };
    const f = this.fahneAt.get(key(h));
    if (f && !f.gebaeude) return f.sp !== this.ich ? 'fremd' : { art: 'abriss_fahne', id: f.id };
    const s = this.segAt.get(key(h));
    if (s) return s.sp !== this.ich ? 'fremd' : { art: 'abriss_weg', id: s.id };
    return null;
  }

  private grundFahne(h: Hx): string {
    const f = this.ctx.ausschnitt.hex, i = f.index(h.q, h.r);
    if (i < 0) return 'außerhalb des Spielfelds';
    if (f.terrain[i] === 0) return 'Wasser';
    if (this.gebAt.has(key(h))) return 'hier steht ein Gebäude';
    if (this.fahneAt.has(key(h))) return 'hier steht schon eine Fahne';
    return 'der Hex ist belegt';
  }

  private grundBauen(typ: string, h: Hx): string {
    const f = this.ctx.ausschnitt.hex, i = f.index(h.q, h.r);
    if (i < 0) return 'außerhalb des Spielfelds';
    const need = GEBAEUDE[typ].groesse;
    const k = this._sim.karte, hi = k.index(h.q, h.r);
    if (f.terrain[i] === 0) return 'Wasser';
    if (f.terrain[i] === 5) return 'Fels';
    if (f.flags[i] & FLAG.bahn) return 'Bahnstrecke';
    if (k.bebaubar[hi] < need) return `Bauplatz ${BAUPLATZ_NAMEN[k.bebaubar[hi]]}, nötig: ${BAUPLATZ_NAMEN[need]}`;
    if (this.gebAt.has(key(h))) return 'hier steht schon ein Gebäude';
    if (this.fahneAt.has(key(h))) return 'hier ist eine Fahne';
    if (this.segAt.has(key(h))) return 'hier läuft ein Weg';
    return 'zu nah an einem anderen Gebäude';
  }

  // ------------------------------------------------------------------ Vorschau und Markierung

  private vorschauUndRinge(): void {
    const w = this.werkzeug;
    const ziel = this.offen ?? this.fokus;
    const abst = this.ctx.abstand();
    let art: RingArt | null = null;
    let pfad: Hx[] | null = null;
    let fest: Hx[] | null = null;
    let pfadOk = false;
    const wegAktiv = w === 'weg' && this.weg.aktiv;
    if (wegAktiv) fest = this.weg.pfad;
    if (ziel) {
      if (w === 'weg') {
        if (wegAktiv) {
          const l = this.weg.letzter!;
          if (!gleich(ziel, l)) {
            const sig = `${this.weg.sig}>${key(ziel)}|${this.netzSig}`;
            if (sig !== this.vorschauSig) {
              this.vorschauSig = sig;
              this.vorschauPfad = this._sim.wegAbschnitt(l, ziel, this.weg.pfad, this.weg.rest, this.ich);
            }
            pfadOk = !!this.vorschauPfad;
            pfad = this.vorschauPfad ?? hexLinie(l, ziel, Math.max(1, this.weg.rest));
            art = pfadOk ? 'gut' : 'schlecht';
          } else art = 'neutral';
        } else art = this.fahneAt.has(key(ziel)) ? 'gut' : 'neutral';
      } else if (w === 'fahne') art = this._sim.kannFahne(ziel.q, ziel.r, this.ich) ? 'gut' : 'schlecht';
      else if (GEBAEUDE_WERKZEUGE.includes(w)) art = this._sim.kannBauen(w, ziel.q, ziel.r, this.ich) ? 'gut' : 'schlecht';
      else if (w === 'abriss') art = this.abrissBefehl(ziel) ? 'schlecht' : 'neutral';
      else if (this.bereichId !== null) { const g = this.bereichGebaeude(); art = g && this.mitteGueltig(g, ziel) ? 'gut' : 'schlecht'; }
      else if (this.zeiger === 'touch') art = 'neutral';
    }
    if (!wegAktiv) this.vorschauSig = '';
    this.wege.zeigeVorschau(pfad, pfadOk, fest);
    this.markierung.setze(0, ziel && art ? ziel : null, art ?? 'neutral', abst);
    this.markierung.setze(1, this.weg.start, 'gewaehlt', abst);
    this.ringeZeigen(this.bauvorschau(w, ziel) ?? this.bereichRinge(ziel), abst);
    // Zwischenpunkte und die möglichen nächsten Schritte (Hex für Hex)
    this.markierung.setzeListe('punkte', wegAktiv ? this.weg.zwischenpunkte : [], 'gewaehlt', abst, 0.6);
    this.markierung.setzeListe('nachbarn', wegAktiv ? this.naechste() : [], 'gut', abst, 0.35);
    // Knöpfe: „Bauen“ nur, wenn ein Tipp aussteht (beim Wegführen auch mit Zwischenpunkten)
    const punkte = wegAktiv ? this.weg.zwischenpunkte.length : 0;
    if (this.bereichId !== null) {
      const g = this.bereichGebaeude();
      this.leiste.setAktionen(this.offen ? 'Setzen' : null, true, !(g && this.offen && this.mitteGueltig(g, this.offen)));
    } else if (this.offen && w !== 'keins') {
      const ok = w === 'weg' ? pfadOk : art === 'gut' || (w === 'abriss' && art === 'schlecht');
      this.leiste.setAktionen(w === 'abriss' ? 'Abreißen' : w === 'weg' ? 'Weg bauen' : 'Bauen', true, !ok, punkte > 0);
    } else if (punkte > 0) {
      this.leiste.setAktionen('Weg bauen', true, false, true);
    } else {
      this.leiste.setAktionen(null, w !== 'keins');
    }
  }

  private bauplatzAn(): boolean {
    return this.zeigeBauplaetze || GEBAEUDE_WERKZEUGE.includes(this.werkzeug);
  }

  /**
   * Bauplatz-Anzeige, Geistermodell, Arbeitsbereich und Hinweistext für das gewählte Gebäude. Nur lesend (kannBauen,
   * bauplatzGroesse, arbeitsHexe, kosten); die Simulation ändert nur befehl(). Liefert die Ringe des Ziels oder null.
   */
  private bauvorschau(w: Werkzeug, ziel: Hx | null): RingDaten | null {
    const bauen = GEBAEUDE_WERKZEUGE.includes(w);
    // Bauplätze: um den Zeiger, den offenen Tipp oder die Bildschirmmitte
    const zentrum = this.bauplatzAn() ? (ziel ?? this.fokus ?? this.mitteHex) : null;
    this.bauplaetze.setze(zentrum, bauen ? GEBAEUDE[w].groesse : 0, (q, r) => this._sim.bauplatzGroesse(q, r), this.netzSig, bauen ? ziel : null);
    if (!bauen || !ziel || this._sim.karte.index(ziel.q, ziel.r) < 0) {
      this.geist.setze(null, null, false);
      if (this.vorschauGesetzt && this.bereichId === null) { this.vorschauGesetzt = ''; this.hinweisSetzen(); }
      return null;
    }
    const v = this.vorschauDatenFuer(w, ziel);
    this.geist.setze(w, ziel, v.ok);
    if (this.meldung) this.vorschauGesetzt = '';
    else if (v.text !== this.vorschauGesetzt) { this.vorschauGesetzt = v.text; this.leiste.setHinweis(v.text, v.warn); }
    return v.ringe;
  }

  /** Arbeitsbereich zeigen: innen „gut“ (grün), außen „geht noch“ (gedämpftes Gold), Hexe mit Arbeit als kleine Marken. */
  private ringeZeigen(r: RingDaten | null, abst: number): void {
    const m = this.markierung;
    m.setzeUmriss('aussen', r ? r.aussen : [], '#f3df9a', 0.75, abst, 0.65);
    m.setzeUmriss('innen', r ? r.innen : [], '#7cf075', 0.95, abst, 1);
    m.setzeListe('arbeitGut', r ? r.gut : [], 'gut', abst, 0.4, 0.9);
    m.setzeListe('arbeitFern', r ? r.fern : [], 'neutral', abst, 0.32, 0.7);
  }

  /** Radien, Arbeitshexe und Zählung für ein Arbeitsgebiet um `mitte` (Typ mit Arbeitsradius), oder null. */
  private ringeFuer(typ: string, mitte: Hx): RingDaten | null {
    const t = GEBAEUDE[typ];
    if (!t || t.radius <= 0) return null;
    const imFeld = (h: Hx) => this._sim.karte.index(h.q, h.r) >= 0;
    // arbeitsHexe(typ, q, r) rechnet um (q, r); `gut` liefert die Simulation (sonst hier aus dem Abstand zur Mitte)
    const ar = this._sim.arbeitsHexe(typ, mitte.q, mitte.r) as { art: string; hexe: { q: number; r: number; n: number; gut?: boolean }[]; summe: number };
    const gut: Hx[] = [], fern: Hx[] = [];
    let nah = 0;
    for (const h of ar.hexe) {
      const istGut = h.gut ?? hexAbstand(h, mitte) <= t.radiusGut;
      (istGut ? gut : fern).push({ q: h.q, r: h.r });
      if (istGut) nah += h.n;
    }
    return {
      mitte, innen: t.radiusGut > 0 ? hexeImUmkreis(mitte, t.radiusGut, true).filter(imFeld) : [], aussen: hexeImUmkreis(mitte, t.radius, true).filter(imFeld),
      gut, fern, art: ar.art, summe: ar.summe, nah,
    };
  }

  /** Ringe, Text und Eignung der Bauvorschau; zwischengespeichert, bis sich Ziel, Natur, Netz oder Lagervorrat ändern. */
  private vorschauDatenFuer(typ: string, ziel: Hx) {
    const vorrat = this.lagerVorrat();
    const sig = `${typ}|${key(ziel)}|${this._sicht.natur.rev}|${this.netzSig}|${vorrat.join(',')}`;
    if (this.vorschauDaten && sig === this.vorschauDatenSig) return this.vorschauDaten;
    const t = GEBAEUDE[typ];
    const ok = this._sim.kannBauen(typ, ziel.q, ziel.r, this.ich);
    const ringe = ok ? this.ringeFuer(typ, ziel) : null;
    let text: string, warn = false;
    if (!ok) {
      text = `${t.name} geht hier nicht: ${this.grundBauen(typ, ziel)}.`;
      warn = true;
    } else {
      const kosten = this._sim.kosten(typ);
      const rw = ringe ? reichweiteText(ringe.art, ringe.summe, ringe.nah) : null;
      const teile = rw?.warn ? [rw.text] : [t.name, kostenAlsText(kosten, WARE_TEXT)];
      if (rw && !rw.warn) teile.push(rw.text);
      warn = !!rw?.warn;
      const fehlt = fehlmengen(kosten, vorrat);
      if (fehlt.some((n) => n > 0)) {
        teile.push(`⚠ Im Lager fehlen ${kostenAlsText(fehlt, WARE_TEXT)} – die Baustelle wartet dann`);
        warn = true;
      }
      text = teile.join(' · ');
    }
    this.vorschauDatenSig = sig;
    this.vorschauDaten = { ringe, text, warn, ok };
    return this.vorschauDaten;
  }

  // ------------------------------------------------------------------ Arbeitsbereich (Mittelpunkt setzen)

  /** Gebäude, dessen Arbeitsbereich gerade gewählt wird. */
  private bereichGebaeude(): SichtGebaeude | undefined {
    return this.bereichId === null ? undefined : this._sicht.gebaeude.find((x) => x.id === this.bereichId);
  }

  /** Darf `h` Mittelpunkt für das Gebäude sein (im Spielfeld, begehbar, höchstens ARBEIT_MITTE_MAX entfernt)? */
  private mitteGueltig(g: SichtGebaeude, h: Hx): boolean {
    const k = this._sim.karte, i = k.index(h.q, h.r);
    return i >= 0 && !!k.begehbar[i] && hexAbstand(g, h) <= ARBEIT_MITTE_MAX;
  }

  /**
   * Ringe fürs gewählte Gebäude (an seinem Mittelpunkt) bzw. im Modus für den Zeiger; dazu Fähnchen und Linie zum gesetzten
   * Mittelpunkt und im Modus der Hinweistext. null, wenn nichts zu zeigen ist.
   */
  private bereichRinge(ziel: Hx | null): RingDaten | null {
    const abst = this.ctx.abstand();
    const g = this.bereichGebaeude() ?? (this.gewaehlt === null ? undefined : this._sicht.gebaeude.find((x) => x.id === this.gewaehlt));
    if (!g || !(GEBAEUDE[g.typ]?.radius > 0)) {
      this.markierung.setzeFahne(null, abst); this.markierung.setzeLinie(null, null, abst);
      return null;
    }
    const modus = this.bereichId !== null;
    const gueltig = !!ziel && this.mitteGueltig(g, ziel);
    const mitte: Hx = modus && ziel && gueltig ? ziel : (g.mitte ?? g);
    const sig = `${g.typ}|${key(mitte)}|${this._sicht.natur.rev}`;
    if (sig !== this.ringSig) { this.ringSig = sig; this.ringDaten = this.ringeFuer(g.typ, mitte); }
    const verlegt = !gleich(mitte, g);
    this.markierung.setzeFahne(verlegt ? mitte : null, abst);
    this.markierung.setzeLinie(verlegt ? g : null, verlegt ? mitte : null, abst);
    // Hinweistext im Modus: was am Zeiger in Reichweite liegt
    if (modus && !this.meldung && this.ringDaten) {
      const rw = reichweiteText(this.ringDaten.art, this.ringDaten.summe, this.ringDaten.nah);
      const text = ziel && !gueltig ? `Zu weit weg oder unbegehbar – der Mittelpunkt darf höchstens ${ARBEIT_MITTE_MAX} Hexe vom Haus liegen.`
        : `Arbeitsbereich hier: ${rw ? rw.text : 'nichts zu tun'}${this.zeiger === 'touch' ? ' – nochmal tippen oder „Setzen“' : ' – anklicken setzt'}`;
      if (text !== this.vorschauGesetzt) { this.vorschauGesetzt = text; this.leiste.setHinweis(text, (!!ziel && !gueltig) || !!rw?.warn); }
    }
    return this.ringDaten;
  }

  private bereichUmschalten(): void {
    const g = this.gewaehlt === null ? undefined : this._sicht.gebaeude.find((x) => x.id === this.gewaehlt);
    if (!g || !(GEBAEUDE[g.typ]?.radius > 0)) return;
    this.bereichId = this.bereichId === null ? g.id : null;
    this.offen = null;
    this.meldung = null;
    this.hinweisSetzen();
    this.fenster.jetzt();
  }

  /** Mittelpunkt auf `h` setzen (Befehl 'arbeitsbereich'); zu weit weg oder unbegehbar → rote Meldung, Modus bleibt. */
  private bereichSetzen(h: Hx): void {
    const g = this.bereichGebaeude();
    if (!g) { this.bereichId = null; return; }
    if (!this.mitteGueltig(g, h)) {
      this.melde(hexAbstand(g, h) > ARBEIT_MITTE_MAX ? `Zu weit weg – höchstens ${ARBEIT_MITTE_MAX} Hexe vom Gebäude.` : 'Dorthin kommt keiner – der Mittelpunkt muss begehbar sein.', true);
      return;
    }
    this.befehl({ art: 'arbeitsbereich', id: g.id, q: h.q, r: h.r });
    this.bereichId = null;
    this.melde(gleich(h, g) ? 'Arbeitsbereich wieder ums Haus.' : 'Arbeitsbereich verlegt – der Weg dorthin kostet Zeit.', false);
    this.fenster.jetzt();
  }

  private bereichZuruecksetzen(): void {
    const g = this.gewaehlt === null ? undefined : this._sicht.gebaeude.find((x) => x.id === this.gewaehlt);
    if (!g || !(GEBAEUDE[g.typ]?.radius > 0)) return;
    this.bereichId = null;
    this.befehl({ art: 'arbeitsbereich', id: g.id, q: g.q, r: g.r });
    this.melde('Arbeitsbereich wieder ums Haus.', false);
    this.fenster.jetzt();
  }

  /** Vorrat aller Lager je Warenart. */
  private lagerVorrat(): number[] {
    const vorrat = new Array<number>(WAREN.length).fill(0);
    for (const g of this._sicht.gebaeude) if (g.vorrat && g.sp === this.ich) for (let i = 0; i < vorrat.length; i++) vorrat[i] += g.vorrat[i] ?? 0;
    return vorrat;
  }

  /** Nachbarn des letzten Punkts, die als nächster Schritt gelten (zwischengespeichert, solange sich Weg und Netz nicht ändern). */
  private naechste(): Hx[] {
    const sig = `${this.weg.sig}|${this.netzSig}`;
    if (sig !== this.schrittSig) {
      this.schrittSig = sig;
      const belegt = this.weg.pfad;
      this.schrittHexe = naechsteSchritte(this.weg, (von, nach) => this._sim.wegAbschnitt(von, nach, belegt, 1, this.ich));
    }
    return this.schrittHexe;
  }

  // ------------------------------------------------------------------ Fenster (M7): Gebäude, Fahne, Weg, Waren, Verteilung, Statistik …

  /** Was die Fensterinhalte brauchen (Sicht, Namen, Reichweite, Produktivität, Abrissfrage, Icons). */
  private fensterKontext(): FensterKontext {
    return {
      sicht: this._sicht, ich: this.ich, ware: WARE_TEXT, namen: this.namen,
      reichweite: (g) => { const ri = this.ringeFuer(g.typ, g.mitte ?? g); return ri ? reichweiteText(ri.art, ri.summe, ri.nah) : null; },
      produktivitaet: (id) => this.produktiv.wert(id), bereichModus: this.bereichId, abrissFrage: this.abrissFrage?.id ?? null,
      gebaeudeBild: (typ) => this.ic.gebaeude[typ],
    };
  }

  /** Gebäudefenster öffnen (das gewählte Gebäude zeigt auch seinen Arbeitsbereich). */
  oeffneGebaeude(id: Id): void {
    this.gewaehlt = id;
    const fid = `geb:${id}`;
    this.fenster.oeffne({
      id: fid, gruppe: 'auswahl', daten: () => gebaeudeFenster(id, this.fensterKontext()),
      onKnopf: (k) => this.gebaeudeKnopf(id, k),
      onZu: () => { if (this.gewaehlt === id) { this.gewaehlt = null; if (this.bereichId === id) this.bereichId = null; } },
    });
  }

  oeffneFahne(id: Id): void {
    const fid = `fahne:${id}`;
    this.fenster.oeffne({ id: fid, gruppe: 'auswahl', daten: () => fahneFenster(id, this.fensterKontext()), onKnopf: (k) => this.auswahlKnopf(fid, k) });
  }

  oeffneWeg(id: Id): void {
    const fid = `weg:${id}`;
    this.fenster.oeffne({ id: fid, gruppe: 'auswahl', daten: () => wegFenster(id, this.fensterKontext()), onKnopf: (k) => this.auswahlKnopf(fid, k) });
  }

  /** Knöpfe im Gebäudefenster. */
  private gebaeudeKnopf(id: Id, k: string): void {
    const g = this._sicht.gebaeude.find((x) => x.id === id);
    if (!g || g.sp !== this.ich) { if (g && k === 'kamera') this.springeZu(g); return; }
    this.gewaehlt = id;
    if (k.startsWith('prio:')) this.setzePrioritaet(Number(k.slice(5)));
    else if (k === 'bereich') this.bereichUmschalten();
    else if (k === 'bereich_zurueck') this.bereichZuruecksetzen();
    else if (k === 'ruhen') { this.befehl({ art: 'ruhen', id, an: !g.ruht }); this.melde(g.ruht ? `${NAMEN[g.typ]} arbeitet wieder.` : `${NAMEN[g.typ]} ruht.`, false); }
    else if (k === 'kamera') this.springeZu(g);
    else if (k === 'abriss') {
      if (this.abrissFrage?.id === `geb:${id}`) { this.abrissFrage = null; this.befehl({ art: 'abriss_gebaeude', id }); this.melde('Abgerissen.', false); }
      else this.abrissFrage = { id: `geb:${id}`, bis: performance.now() + 3000 };
    }
    this.fenster.jetzt();
  }

  /** Knöpfe in Fahnen- und Wegfenstern (fid = „fahne:3“ / „weg:5“). */
  private auswahlKnopf(fid: string, k: string): void {
    const [art, n] = fid.split(':');
    const id = Number(n);
    const m = /^(geb|fahne|weg):(\d+)$/.exec(k);
    if (m) {
      const z = Number(m[2]);
      if (m[1] === 'geb') this.oeffneGebaeude(z); else if (m[1] === 'fahne') this.oeffneFahne(z); else this.oeffneWeg(z);
      return;
    }
    const f = art === 'fahne' ? this._sicht.fahnen.find((x) => x.id === id) : undefined;
    const sg = art === 'weg' ? this._sicht.segmente.find((x) => x.id === id) : undefined;
    if (k === 'kamera') { const h = f ?? (sg ? sg.pfad[sg.pfad.length >> 1] : undefined); if (h) this.springeZu(h); }
    else if (k === 'abriss') {
      if (this.abrissFrage?.id === fid) {
        this.abrissFrage = null;
        this.befehl(art === 'fahne' ? { art: 'abriss_fahne', id } : { art: 'abriss_weg', id });
        this.melde('Abgerissen.', false);
      } else this.abrissFrage = { id: fid, bis: performance.now() + 3000 };
    }
    this.fenster.jetzt();
  }

  /** Kamera zu einem Hex. */
  springeZu(h: Hx): void {
    const w = this.ctx.grid.toWorld(h);
    this.ctx.springe?.(w.x, w.z);
  }

  /** Fenster der Statusleiste (Taste oder Knopf) öffnen oder schließen. */
  fensterUmschalten(id: string): void {
    const art = this.fensterArt(id);
    if (art) this.fenster.umschalten(art);
  }

  private fensterArt(id: string): FensterArt | null {
    switch (id) {
      case 'waren': return { id, gruppe: id, daten: () => warenFenster(this.fensterKontext()), breite: 380 };
      case 'verteilung': return {
        id, gruppe: id, breite: 360, daten: () => verteilungFenster(this.fensterKontext()),
        onKnopf: (k) => { const v = verteilungKnopf(k, this._sicht.dorf.verteilung); if (v) { this.befehl({ art: 'verteilung', ...v }); this.fenster.jetzt(id); } },
      };
      case 'statistik': return {
        id, gruppe: id, breite: 400,
        daten: () => statistikFenster(this.fensterKontext(), this._sicht.spieler.map((_, sp) => this._sim.statistikVon(sp)), this.statMass),
        onKnopf: (k) => { if (k.startsWith('m:')) { this.statMass = k.slice(2) as StatMass; this.fenster.jetzt(id); } },
      };
      case 'protokoll': return {
        id, gruppe: id, breite: 380, daten: () => protokollFenster(this.protokollZeilen),
        onKnopf: (k) => { const z = k.startsWith('ort:') ? this.protokollZeilen[Number(k.slice(4))] : undefined; if (z?.ort) this.springeZu(z.ort); },
      };
      case 'einstellungen': return {
        id, gruppe: id, breite: 340, daten: () => this.einstellungsFenster(),
        onEingabe: (k, v) => this.einstellen(k, v),
        onKnopf: (k) => { if (k === 'autosave_laden') this.autosaveLaden(); },
      };
      case 'hilfe': return { id, gruppe: id, breite: 380, daten: () => hilfeFenster(this.zeiger === 'touch') };
      default: return null;
    }
  }

  private einstellungsFenster(): FensterDaten {
    const e = this.einst;
    const grafik = this.ctx.grafik?.felder() ?? [];
    const ab: FensterDaten['abschnitte'] = [];
    if (grafik.length) ab.push({ art: 'eingaben', titel: 'Grafik', felder: grafik });
    ab.push({
      art: 'eingaben', titel: 'Oberfläche', felder: [
        { id: 'uiGroesse', text: 'Größe der Oberfläche', typ: 'regler', wert: e.uiGroesse, min: 80, max: 150, schritt: 10, einheit: ' %' },
        { id: 'farbenblind', text: 'Farbenblind-Modus für Waren (nach Neuladen)', typ: 'schalter', wert: e.farbenblind, hilfe: 'Andere Warenfarben (Okabe-Ito), gut unterscheidbar auch bei Rot-Grün-Schwäche' },
      ],
    });
    ab.push({ art: 'eingaben', titel: 'Steuerung', felder: [{ id: 'kameraTempo', text: 'Kamera-Tempo (Tasten)', typ: 'regler', wert: e.kameraTempo, min: 25, max: 300, schritt: 25, einheit: ' %' }] });
    ab.push({
      art: 'eingaben', titel: 'Spiel', felder: [
        { id: 'autosave', text: `Autosave alle ${AUTOSAVE_MIN} Spielminuten`, typ: 'schalter', wert: e.autosave },
        { id: 'tipps', text: `Tipps von ${this.erzaehler.name}`, typ: 'schalter', wert: e.tipps },
      ],
    });
    const z = [this.autosaveZuletzt ? `Letzter Autosave: ${this.autosaveZuletzt}` : 'Noch kein Autosave in dieser Partie.'];
    if (this.partie) z.push('Im Mehrspieler speichert jeder für sich; geladen wird über die Kartenwahl (dann geht es in die Lobby).');
    ab.push({ art: 'zeilen', zeilen: z });
    if (!this.partie && this.ctx.onLaden && holeAutosave()) ab.push({ art: 'knoepfe', knoepfe: [{ id: 'autosave_laden', text: '📂 Autosave laden' }] });
    return { titel: 'Einstellungen', symbol: '⚙️', abschnitte: ab };
  }

  private einstellen(k: string, v: boolean | string | number): void {
    const e = this.einst as unknown as Record<string, unknown>;
    if (k in e) {
      e[k] = v;
      speichereEinstellungen(this.einst);
      wendeAn(this.einst);
      if (k === 'kameraTempo') this.ctx.kameraTempo?.(this.einst.kameraTempo / 100);
    } else this.ctx.grafik?.setze(k, v);
    this.fenster.jetzt('einstellungen');
  }

  /** Autosave: der ganze Stand in den Browser-Speicher (ein Platz). */
  autosave(): boolean {
    try {
      const st = baueSpielstand(this.karteInfo, this.namen, this._sim.stand(), this.partie?.zug?.pausen);
      localStorage.setItem(AUTOSAVE_SPEICHER, JSON.stringify({ ort: this.ctx.map.info.start ?? this.ctx.map.info.name ?? '', stand: st }));
      this.autosaveZuletzt = `Spielzeit ${Math.floor(this._sim.tick / (60 * TICK_HZ))} min`;
      this.insProtokoll('Automatisch gespeichert.', false);
      return true;
    } catch {
      this.melde('Autosave ging nicht – der Browser-Speicher ist voll. Bitte von Hand speichern.', true);
      return false;
    }
  }

  private autosaveLaden(): void {
    const st = holeAutosave()?.stand;
    if (st) this.ctx.onLaden?.(st); else this.melde('Kein Autosave gefunden.', true);
  }

  /** Priorität der gewählten Baustelle setzen (Befehl 'prioritaet'). */
  private setzePrioritaet(stufe: number): void {
    const g = this.gewaehlt === null ? undefined : this._sicht.gebaeude.find((x) => x.id === this.gewaehlt);
    if (!g || g.bau >= PROMILLE) return;
    this.befehl({ art: 'prioritaet', id: g.id, stufe });
    this.fenster.jetzt();
  }

  /** Rechtsklick auf eine Baustelle schaltet ihre Priorität durch (ohne Werkzeug); true, wenn dort eine Baustelle war. */
  private rechtsklickPrioritaet(x: number, y: number): boolean {
    if (this.werkzeug !== 'keins' || this.bereichId !== null) return false;
    const h = this.hexUnter(x, y);
    const g = h ? this.gebAt.get(key(h)) : undefined;
    if (!g || g.sp !== this.ich || g.bau >= PROMILLE) return false;
    const stufe = naechstePrioritaet(g.prioritaet);
    this.befehl({ art: 'prioritaet', id: g.id, stufe });
    this.melde(`${NAMEN[g.typ] ?? g.typ}: Priorität ${PRIO_NAMEN[stufe]}.`, false);
    this.oeffneGebaeude(g.id);
    return true;
  }

  // ------------------------------------------------------------------ Hinweise, Info, Status

  private melde(text: string, warn: boolean): void {
    this.meldung = { text, warn, bis: performance.now() + 4500 };
    this.leiste.setHinweis(text, warn);
  }

  private hinweisSetzen(): void {
    this.vorschauGesetzt = '';
    if (this.meldung) { this.leiste.setHinweis(this.meldung.text, this.meldung.warn); return; }
    const w = this.werkzeug;
    const touch = this.zeiger === 'touch';
    const tippe = touch ? 'antippen' : 'anklicken';
    let t: string | null = null;
    if (this.bereichId !== null) {
      t = touch ? `Arbeitsbereich: Mittelpunkt antippen (höchstens ${ARBEIT_MITTE_MAX} Hexe vom Haus), nochmal tippen oder „Setzen“ bestätigt.`
        : `Arbeitsbereich: Mittelpunkt anklicken (höchstens ${ARBEIT_MITTE_MAX} Hexe vom Haus). Esc bricht ab.`;
    } else if (w === 'weg') {
      const n = this.weg.schritte;
      if (!this.weg.aktiv) t = `Weg: eine Fahne als Start ${tippe}.`;
      else if (touch) {
        t = n === 0 ? 'Weg: Hex antippen = Zwischenpunkt, Fahne oder Weg antippen = bauen.'
          : `Weg: ${n} Schritte – Hex = Zwischenpunkt, Fahne/Weg antippen oder „Weg bauen“ baut, „Zurück“ nimmt den letzten Punkt weg.`;
      } else {
        t = n === 0 ? 'Weg: Hex für Hex anklicken (Zwischenpunkte) oder gleich eine Fahne – die baut. Esc bricht ab.'
          : `Weg: ${n} Schritte – Ziel anklicken (Fahne baut, freier Hex = Zwischenpunkt), letzten Punkt nochmal oder Enter baut, Rücktaste zurück.`;
      }
    } else if (w === 'fahne') t = `Fahne: Hex ${tippe}. Auf einem Weg teilt sie ihn.`;
    else if (GEBAEUDE_WERKZEUGE.includes(w)) {
      t = `${NAMEN[w]} (Bauplatz ${BAUPLATZ_NAMEN[GEBAEUDE[w].groesse]}): Platz ${tippe}. Kosten: ${this.kostenText(w)}.`;
    } else if (w === 'abriss') t = `Abriss: Gebäude, Fahne oder Weg ${tippe}.`;
    this.leiste.setHinweis(t);
  }

  /** Was die Partie meldet (Auseinanderlaufen, neuer Stand, neuer Taktgeber) als Meldung der Erzählfigur. */
  private partieMeldungen(): void {
    const p = this.partie;
    if (!p) return;
    const neu = p.ereignisse.slice(this.partieGemeldet);
    this.partieGemeldet = p.ereignisse.length;
    for (const e of neu) {
      const wer = (sp: number) => this.namen[sp] ?? `Spieler ${sp + 1}`;
      let t: [string, boolean] | null = null;
      if (e.art === 'auseinander') t = [`${wer(e.spieler)} ist auseinandergelaufen (Tick ${e.tick}) – der Stand wird neu verteilt.`, true];
      else if (e.art === 'neuer_stand' && e.grund !== 'start') t = [e.grund === 'wiederbeitritt' ? 'Wieder drin – Stand vom Mitspieler geholt.' : 'Stand vom Taktgeber neu bekommen.', false];
      else if (e.art === 'taktgeber') t = [`${wer(e.spieler)} gibt jetzt den Takt.`, false];
      else if (e.art === 'fehler') t = [e.text, true];
      if (t) { this.melde(t[0], t[1]); this.insProtokoll(t[0], t[1]); }
    }
  }

  /** Partieleiste: Spieler, Pause, Warten (Mehrspieler); im Einzelspiel nur die Knöpfe. */
  private partieSetzen(): void {
    const p = this.partie, z = p?.zug;
    if (!p || !z) { this.partieleiste.setze({ spieler: [], status: '', warn: false, weiter: false, pausen: null }); return; }
    const zeit = (ms: number) => { const s = Math.ceil(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
    const wer = (sp: number) => (sp === this.ich ? 'dir' : this.namen[sp] ?? `Spieler ${sp + 1}`);
    let status = '', warn = false;
    if (z.warten.length) {
      status = z.warten.map((w) => `Warten auf ${wer(w.spieler)} – Verwalter übernimmt in ${zeit(w.restMs)}`).join(' · ');
      warn = true;
    } else if (z.pause) status = `Pause von ${wer(z.pause.spieler)} – geht in ${zeit(z.pause.restMs)} von selbst weiter`;
    else if (!this.ctx.mehrspieler!.anwesend(p.taktgeber) && p.taktgeber !== this.ich) { status = 'Verbindung zum Taktgeber weg – warte …'; warn = true; }
    this.partieleiste.setze({
      spieler: this._sicht.spieler.map((d, sp) => ({
        name: this.namen[sp] ?? `Spieler ${sp + 1}`, ich: sp === this.ich, da: sp === this.ich || this.ctx.mehrspieler!.anwesend(sp),
        verwalter: d.verwalter, dorf: `${DORFSTUFEN[d.stufe] ?? ''} · ${d.bewohner} 👥`, taktgeber: sp === p.taktgeber,
      })),
      status, warn, weiter: !!z.pause && (z.pause.spieler === this.ich || this.ich === p.gastgeber), pausen: z.pausen[this.ich] ?? 0,
    });
  }

  private statusSetzen(): void {
    this.partieSetzen();
    const s = this._sicht, d = s.dorf;
    const k = d.kirmes;
    let kirmes: NonNullable<StatusDaten['dorf']>['kirmes'] = null;
    if (k) {
      const soll = k.liste.reduce((a, b) => a + b, 0);
      const ist = k.liste.reduce((a, n, i) => a + Math.min(n, k.geliefert[i]), 0);
      const teile = k.liste.map((n, a) => (n > 0 ? `${WARE_TEXT[a].icon} ${Math.min(n, k.geliefert[a])}/${n}` : '')).filter(Boolean).join(' · ');
      if (k.fest > 0) kirmes = { text: `🎡 Kirmes! Noch ${Math.ceil(k.fest / 20)} s – dann wird aus dem ${DORFSTUFEN[d.stufe]} ein ${DORFSTUFEN[d.stufe + 1]}`, prozent: 100, fest: true };
      else if (!k.platz) kirmes = { text: `🎡 Kirmes ${DORFSTUFEN[d.stufe]} → ${DORFSTUFEN[d.stufe + 1]}: Kirmesplatz bauen, dann ${listeText(k.liste)} liefern`, prozent: 0, fest: false };
      else kirmes = { text: `🎡 Kirmes: ${teile}`, prozent: soll ? (100 * ist) / soll : 0, fest: false };
    } else if (d.stufe > 0) {
      kirmes = { text: `🎡 ${DORFSTUFEN[d.stufe]}! Die nächste Kirmes kommt mit M8.`, prozent: 100, fest: false };
    }
    const zeigen = [0, 1, 2, 6, 5, 4, 9, 8, 7, 10, 11].map((a) => ({ art: a, icon: WARE_TEXT[a]?.icon ?? '', name: WARE_TEXT[a]?.mehr ?? '' }));
    const vorrat = this.lagerVorrat();
    const knappText: Record<string, string> = {};
    for (const id of GEBAEUDE_WERKZEUGE) {
      const f = fehlmengen(GEBAEUDE[id].kosten, vorrat);
      if (f.some((n) => n > 0)) knappText[id] = kostenAlsText(f, WARE_TEXT);
    }
    this.leiste.setStatus({
      tick: s.tick, freieTraeger: s.freieTraeger, vorrat, pruefsumme: this._sim.pruefsumme(), lagerZeigen: zeigen, knappText,
      dorf: {
        stufe: DORFSTUFEN[d.stufe] ?? '', bewohner: d.bewohner, wohnraum: d.wohnraum, frei: d.frei,
        bauarbeiter: [d.bauarbeiter.frei, d.bauarbeiter.gesamt], planierer: [d.planierer.frei, d.planierer.gesamt], kirmes,
      },
    });
    // Baumenü: noch nicht freigeschaltete und schon gebaute einmalige Gebäude sperren
    const gesperrt: Record<string, string> = {};
    for (const id of GEBAEUDE_WERKZEUGE) {
      const g = this._sim.sperrGrund(id, this.ich);
      if (g === 'stufe') gesperrt[id] = `ab ${DORFSTUFEN[GEBAEUDE[id].abStufe] ?? 'später'}`;
      else if (g === 'einmalig') gesperrt[id] = 'steht schon';
    }
    const sig = JSON.stringify(gesperrt);
    if (sig !== this.gesperrtSig) {
      this.gesperrtSig = sig;
      this.leiste.setGesperrt(gesperrt);
      if (gesperrt[this.werkzeug]) this.waehleWerkzeug('keins');
    }
  }

  /** Zeilen fürs Info-Feld (HTML) zu einem Hex: Gebäude, Fahne, Weg, Bauplatz-Prüfung. */
  infoZeilen(h: Hx): string[] {
    const z: string[] = [];
    const g = this.gebAt.get(key(h));
    const f = this.fahneAt.get(key(h));
    const sg = this.segAt.get(key(h));
    const w = this.werkzeug;
    if (g) {
      const name = NAMEN[g.typ] ?? g.typ;
      const baustelle = g.bau < PROMILLE;
      const zt = zustandsText(g.zustand, baustelle, eingangNamen(g), GEBAEUDE[g.typ]?.funktion);
      const phase = baustelle ? `Baustelle ${Math.floor(g.bau / 10)} % (Phase ${1 + Math.floor((3 * g.bau) / 1001)} von 3) – ${zt.titel}` : zt.titel;
      z.push(`<b class="sim">${name}</b><span class="${zt.warn ? 'warn' : ''}">${phase}</span>`);
      if (baustelle) {
        const fehlt = kostenAlsText(g.bedarf ?? [], WARE_TEXT);
        z.push(`<span>${fehlt === 'nichts' ? 'Material komplett' : `fehlt: ${fehlt}`} · Priorität ${PRIO_NAMEN[g.prioritaet] ?? g.prioritaet}</span>`);
      }
      if (g.getrennt) z.push('<span class="warn">⚠ keine Verbindung zum Lager</span>');
      if (g.vorrat) z.push(`<span>Vorrat: ${g.vorrat.map((n, i) => `${WARE_NAME[i]} ${n}`).join(' · ')}</span>`);
      const gf = this._sicht.fahnen.find((x) => x.id === g.fahne);
      if (gf && gf.waren.length) z.push(`<span>Fahne: ${this.warenText(gf)}</span>`);
    } else if (f) {
      z.push(`<b class="sim">Fahne</b><span>${f.waren.length ? `${f.waren.length} von ${FLAG_CAP} Waren: ${this.warenText(f)}` : 'leer'}</span>`);
    } else if (sg) {
      z.push(`<b class="sim">Weg</b><span>${sg.pfad.length - 1} Schritte · ${this.traegerText(sg)}</span>`);
    }
    if (GEBAEUDE_WERKZEUGE.includes(w)) {
      const i = this.ctx.ausschnitt.hex.index(h.q, h.r);
      if (i >= 0) {
        const platz = this._sim.karte.bebaubar[this._sim.karte.index(h.q, h.r)];
        const ok = this._sim.kannBauen(w, h.q, h.r, this.ich);
        z.push(`<span class="${ok ? 'gut' : 'warn'}">${NAMEN[w]}: ${ok ? `passt hier (Bauplatz ${BAUPLATZ_NAMEN[platz]}, nötig ${BAUPLATZ_NAMEN[GEBAEUDE[w].groesse]})` : 'geht hier nicht – ' + this.grundBauen(w, h)}</span>`);
      }
    } else if (w === 'fahne' && this.ctx.ausschnitt.hex.index(h.q, h.r) >= 0) {
      const ok = this._sim.kannFahne(h.q, h.r, this.ich);
      z.push(`<span class="${ok ? 'gut' : 'warn'}">Fahne: ${ok ? 'passt hier' : 'geht hier nicht – ' + this.grundFahne(h)}</span>`);
    }
    return z;
  }

  /** Baukosten als Text, z. B. „2 Bretter, 1 Stein“. */
  private kostenText(typ: string): string {
    return kostenAlsText(this._sim.kosten(typ), WARE_TEXT);
  }

  private warenText(f: SichtFahne): string {
    const n = new Array<number>(WAREN.length).fill(0);
    for (const x of f.waren) n[x]++;
    return n.map((c, i) => (c ? `${WARE_NAME[i]} ×${c}` : '')).filter(Boolean).join(', ') || 'leer';
  }

  private traegerText(s: SichtSegment): string {
    if (!s.traeger) return 'Träger fehlt';
    const t = this._sicht.traeger.find((x) => x.id === s.traeger);
    if (!t) return 'Träger fehlt';
    const auf = new Set(s.pfad.map(key));
    return auf.has(key(t.von)) && auf.has(key(t.nach)) ? 'Träger da' : 'Träger unterwegs';
  }
}
