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
import { spieleAb } from '../sim/replay';
import { FLAG_CAP, GEBAEUDE, GEBAEUDE_IDS, WAREN, WAREN_NAMEN } from '../sim/daten';
import { PROMILLE, TICK_HZ } from '../sim/typen';
import type { Befehl, Id, Protokoll, SichtFahne, SichtGebaeude, SichtSegment, SimSicht } from '../sim/typen';
import { Wege } from '../render/wege';
import { Fahnen } from '../render/fahnen';
import { Traeger } from '../render/traeger';
import { Gebaeude, type GebaeudeHaken } from '../render/gebaeude';
import { Markierung, type RingArt } from '../render/markierung';
import { Bauplaetze } from '../render/bauplaetze';
import { Geist } from '../render/geist';
import { Spielleiste, type KartenDaten, type MenueGruppeDaten, type Werkzeug } from '../ui/spielleiste';
import {
  BAUPLATZ_NAMEN, bedarfNamen, fehlmengen, hexeImUmkreis, kostenText as kostenAlsText, menueGruppen, naechstePrioritaet, PRIO_NAMEN,
  reichweiteText, wareTexte, zustandsText,
} from './baumenue';
import {
  KlickErkenner, OffenerWeg, TEMPI, TickTakt, hexLinie, naechsteSchritte, saatAusPruefsumme, waehleLagerHex, type Hx,
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
}

/** Anzeigenamen der Gebäude aus data/buildings.json. */
const NAMEN: Record<string, string> = Object.fromEntries(Object.values(GEBAEUDE).map((t) => [t.id, t.name]));
/** Kurznamen der Waren (letztes Wort des Anzeigenamens, z. B. „Baumstamm“). */
const WARE_NAME: string[] = WAREN_NAMEN.map((n) => n.split(' ').slice(1).join(' ') || n);
/** Texte der Waren für Kosten und Bedarf. */
const WARE_TEXT = wareTexte(WAREN, WAREN_NAMEN);
/** Alle Gebäudetypen, die man bauen kann (datengetrieben, ohne das Lager), in der Reihenfolge der Daten. */
const GEBAEUDE_WERKZEUGE = GEBAEUDE_IDS.filter((id) => id !== 'lager');

/** Baumenü aus den Daten: Gruppen und Gebäude wie in data/buildings.json (ohne Lager). */
function menueDaten(): MenueGruppeDaten[] {
  return menueGruppen(GEBAEUDE_IDS.map((id) => GEBAEUDE[id])).map((g) => ({
    gruppe: g.gruppe,
    eintraege: g.typen.map((t) => ({
      id: t.id, symbol: t.symbol, name: t.name, spruch: t.spruch,
      kostenText: kostenAlsText(t.kosten, WARE_TEXT, true), kosten: t.kosten,
      groesse: t.groesse, groesseText: `Bauplatz ${BAUPLATZ_NAMEN[t.groesse]}`, radius: t.radius,
    })),
  }));
}

const key = (h: Hx) => `${h.q},${h.r}`;
const gleich = (a: Hx | null, b: Hx | null) => !!a && !!b && a.q === b.q && a.r === b.r;

export class Spiel {
  readonly group = new THREE.Group();
  readonly lagerHex: Hx;
  readonly karteInfo: Protokoll['karte'];
  private readonly _sim: Simulation;
  private readonly wege: Wege;
  private readonly fahnen: Fahnen;
  private readonly traeger: Traeger;
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
  private vorschauDaten: { radius: Hx[]; arbeit: Hx[]; text: string; warn: boolean; ok: boolean } | null = null;
  /** Text der Bauvorschau, der gerade in der Hinweiszeile steht ('' = keiner). */
  private vorschauGesetzt = '';

  constructor(private ctx: SpielKontext) {
    const { ausschnitt, map, grid, base, ex } = ctx;
    this.lagerHex = waehleLagerHex(ausschnitt.hex, ausschnitt.kerne, map.info.start);
    const p = ausschnitt.param;
    this.karteInfo = { version: p.version, q: p.q, r: p.r, size: p.size, pruefsumme: ausschnitt.pruefsumme };
    this._sim = new Simulation(ausschnitt.hex, saatAusPruefsumme(ausschnitt.pruefsumme), this.lagerHex);

    this.wege = new Wege(map, grid, base, ex);
    this.fahnen = new Fahnen(map, grid, base, ex);
    this.traeger = new Traeger(map, grid, base, ex);
    this.gebaeude = new Gebaeude(map, grid, base, ex, ctx.haken);
    this.markierung = new Markierung(map, grid, base, ex);
    this.bauplaetze = new Bauplaetze(map, grid, base, ex);
    this.geist = new Geist(map, grid, base, ex);
    this.wege.wald = ctx.haken.trees ?? null;
    this.fahnen.kamera = ctx.camera; this.traeger.kamera = ctx.camera; this.gebaeude.kamera = ctx.camera;
    this.group.add(this.wege.group, this.fahnen.group, this.traeger.group, this.gebaeude.group, this.bauplaetze.group, this.geist.group, this.markierung.group);
    ctx.scene.add(this.group);

    this.zeiger = matchMedia('(pointer: coarse)').matches ? 'touch' : 'mouse';
    this.leiste = new Spielleiste(ctx.root, {
      onWerkzeug: (w) => this.waehleWerkzeug(w === this.werkzeug ? 'keins' : w),
      onBestaetigen: () => this.bestaetigen(),
      onAbbrechen: () => this.abbrechen(),
      onZurueck: () => this.zurueck(),
      onTempo: (t) => (t === 0 ? this.pause(!this.pausiert) : this.setzeTempo(t)),
      onPrioritaet: (stufe) => this.setzePrioritaet(stufe),
      onKarteZu: () => { this.gewaehlt = null; this.karteSetzen(); },
    }, menueDaten());
    this._sicht = this._sim.sicht();
    this.indizes();
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

  /** Jede Aktion der Oberfläche: Befehl mit Tick-Nummer. Bei Pause laufen 2 Ticks, damit die Welt reagiert. */
  befehl(b: Befehl): void {
    this._sim.befehl(this._sim.tick + 1, 0, b);
    if (this.pausiert) this.schritte(2);
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

  pause(an: boolean): void {
    this.pausiert = an;
    this.takt.zuruecksetzen();
    this.leiste.setTempo(this.tempo, this.pausiert);
  }

  setzeTempo(t: number): void {
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
    this.bauplaetze.setExaggeration(ex); this.geist.setExaggeration(ex);
  }

  // ------------------------------------------------------------------ Frame

  update(dt: number): void {
    const { ticks, alpha } = this.takt.vor(dt, this.tempo, this.pausiert);
    if (ticks > 0) {
      for (let i = 0; i < ticks; i++) this._sim.schritt();
      this.neueSicht();
    }
    const a = this.pausiert ? 0 : alpha;
    this.gebaeude.update(this._sicht, a, dt);
    this.wege.update(this._sicht, a, dt);
    this.fahnen.update(this._sicht, a, dt);
    this.traeger.update(this._sicht, a, dt);

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
    if (this.meldung && performance.now() > this.meldung.bis) { this.meldung = null; this.hinweisSetzen(); }
  }

  private neueSicht(): void {
    this._sicht = this._sim.sicht();
    this.indizes();
    if (this.gewaehlt !== null) this.karteSetzen();
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
      case 'Escape': this.abbrechen(); return;
      case 'Backspace': if (this.werkzeug === 'weg') { e.preventDefault(); this.zurueck(); } return;
      case 'Space': e.preventDefault(); this.pause(!this.pausiert); return;
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
    if (this.werkzeug === 'fahne' || GEBAEUDE_WERKZEUGE.includes(this.werkzeug)) return h;
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
    if (w === 'keins') { this.gewaehlt = this.gebAt.get(key(h))?.id ?? null; this.karteSetzen(); return; }
    if (w === 'fahne') { this.aktion(h); return; }
    if (w === 'weg' && !this.weg.aktiv) {
      if (this.fahneAt.has(key(h))) { this.weg.beginne(h); this.offen = null; this.hinweisSetzen(); }
      else this.melde('Ein Weg beginnt an einer Fahne – erst eine Fahne wählen.', true);
      return;
    }
    if (w === 'weg') { this.wegKlick(h, touch); return; }
    if (!touch) { this.aktion(h); return; }
    // Touch: erster Tipp zeigt, zweiter Tipp auf dasselbe Ziel (oder „Bauen“) führt aus
    if (gleich(this.offen, h)) { this.offen = null; this.aktion(h); return; }
    this.offen = h;
    this.hinweisSetzen();
  }

  /** Ist der Hex ein Endziel des Wegs (Fahne oder Weg-Hex), das den Weg sofort baut? */
  private istEndziel(h: Hx): boolean {
    return this.fahneAt.has(key(h)) || this.segAt.has(key(h));
  }

  /** Klick auf einen Hex bei laufendem Wegbau. */
  private wegKlick(h: Hx, touch: boolean): void {
    const l = this.weg.letzter!;
    if (gleich(h, l)) {
      // nochmal auf den letzten Punkt: bis dorthin bauen; auf dem Start ohne Zwischenpunkte: Start verwerfen
      if (this.weg.zwischenpunkte.length) this.wegBauen();
      else { this.weg.leeren(); this.offen = null; this.hinweisSetzen(); }
      return;
    }
    if (this.istEndziel(h)) {
      // Touch: erst zeigen, zweiter Tipp (oder „Weg bauen“) baut
      if (touch && !gleich(this.offen, h)) { this.offen = h; this.hinweisSetzen(); return; }
      this.offen = null;
      this.wegZu(h, true);
      return;
    }
    this.offen = null;
    this.wegZu(h, false);
  }

  /** Teilstück vom letzten Punkt nach `h` anhängen; bei `bauen` den ganzen Weg bauen, sonst `h` als Zwischenpunkt behalten. */
  private wegZu(h: Hx, bauen: boolean): void {
    const stueck = this._sim.wegAbschnitt(this.weg.letzter!, h, this.weg.pfad, this.weg.rest);
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
    if (this.werkzeug === 'keins') return;
    if (this.werkzeug === 'weg') {
      if (!this.weg.aktiv) return;
      if (this.offen) { const h = this.offen; this.offen = null; this.wegZu(h, true); return; }
      if (this.weg.zwischenpunkte.length) { this.wegBauen(); return; }
      // ohne Zwischenpunkte: wie ein Klick auf den Hex unter der Maus
      if (this.zeiger === 'mouse' && this.fokus && !gleich(this.fokus, this.weg.start)) this.wegKlick(this.fokus, false);
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
    if (this.offen) this.offen = null;
    else if (this.weg.aktiv) this.weg.leeren();
    else if (this.werkzeug !== 'keins') this.waehleWerkzeug('keins');
    else if (this.gewaehlt !== null) { this.gewaehlt = null; this.karteSetzen(); }
    this.meldung = null;
    this.hinweisSetzen();
  }

  waehleWerkzeug(w: Werkzeug): void {
    this.werkzeug = w;
    if (w !== 'keins') { this.gewaehlt = null; this.karteSetzen(); }
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
      if (this._sim.kannFahne(h.q, h.r)) { this.befehl({ art: 'fahne', q: h.q, r: h.r }); this.hinweisSetzen(); }
      else this.melde(`Hier geht keine Fahne: ${this.grundFahne(h)}.`, true);
    } else if (GEBAEUDE_WERKZEUGE.includes(w)) {
      if (this._sim.kannBauen(w, h.q, h.r)) {
        this.befehl({ art: 'gebaeude', typ: w, q: h.q, r: h.r });
        this.melde(`${NAMEN[w]} wird gebaut – Material kommt aus dem Lager (${this.kostenText(w)}).`, false);
      } else this.melde(`${NAMEN[w]} geht hier nicht: ${this.grundBauen(w, h)}.`, true);
    } else if (w === 'abriss') {
      const b = this.abrissBefehl(h);
      if (b === 'lager') this.melde('Das Lager bleibt stehen – ohne Lager geht es nicht.', true);
      else if (b) { this.befehl(b); this.melde('Abgerissen.', false); }
      else this.melde('Hier ist nichts zum Abreißen.', true);
    }
  }

  private abrissBefehl(h: Hx): Befehl | 'lager' | null {
    const g = this.gebAt.get(key(h));
    if (g) return g.typ === 'lager' ? 'lager' : { art: 'abriss_gebaeude', id: g.id };
    const f = this.fahneAt.get(key(h));
    if (f && !f.gebaeude) return { art: 'abriss_fahne', id: f.id };
    const s = this.segAt.get(key(h));
    if (s) return { art: 'abriss_weg', id: s.id };
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
              this.vorschauPfad = this._sim.wegAbschnitt(l, ziel, this.weg.pfad, this.weg.rest);
            }
            pfadOk = !!this.vorschauPfad;
            pfad = this.vorschauPfad ?? hexLinie(l, ziel, Math.max(1, this.weg.rest));
            art = pfadOk ? 'gut' : 'schlecht';
          } else art = 'neutral';
        } else art = this.fahneAt.has(key(ziel)) ? 'gut' : 'neutral';
      } else if (w === 'fahne') art = this._sim.kannFahne(ziel.q, ziel.r) ? 'gut' : 'schlecht';
      else if (GEBAEUDE_WERKZEUGE.includes(w)) art = this._sim.kannBauen(w, ziel.q, ziel.r) ? 'gut' : 'schlecht';
      else if (w === 'abriss') art = this.abrissBefehl(ziel) ? 'schlecht' : 'neutral';
      else if (this.zeiger === 'touch') art = 'neutral';
    }
    if (!wegAktiv) this.vorschauSig = '';
    this.wege.zeigeVorschau(pfad, pfadOk, fest);
    this.markierung.setze(0, ziel && art ? ziel : null, art ?? 'neutral', abst);
    this.markierung.setze(1, this.weg.start, 'gewaehlt', abst);
    this.bauvorschau(w, ziel, abst);
    // Zwischenpunkte und die möglichen nächsten Schritte (Hex für Hex)
    this.markierung.setzeListe('punkte', wegAktiv ? this.weg.zwischenpunkte : [], 'gewaehlt', abst, 0.6);
    this.markierung.setzeListe('nachbarn', wegAktiv ? this.naechste() : [], 'gut', abst, 0.35);
    // Knöpfe: „Bauen“ nur, wenn ein Tipp aussteht (beim Wegführen auch mit Zwischenpunkten)
    const punkte = wegAktiv ? this.weg.zwischenpunkte.length : 0;
    if (this.offen && w !== 'keins') {
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
   * Bauplatz-Anzeige, Geistermodell, Arbeitsradius und Hinweistext für das gewählte Gebäude. Nur lesend (kannBauen,
   * bauplatzGroesse, arbeitsHexe, kosten); die Simulation ändert nur befehl().
   */
  private bauvorschau(w: Werkzeug, ziel: Hx | null, abst: number): void {
    const bauen = GEBAEUDE_WERKZEUGE.includes(w);
    // Bauplätze: um den Zeiger, den offenen Tipp oder die Bildschirmmitte
    const zentrum = this.bauplatzAn() ? (ziel ?? this.fokus ?? this.mitteHex) : null;
    this.bauplaetze.setze(zentrum, bauen ? GEBAEUDE[w].groesse : 0, (q, r) => this._sim.bauplatzGroesse(q, r), this.netzSig, bauen ? ziel : null);
    if (!bauen || !ziel || this._sim.karte.index(ziel.q, ziel.r) < 0) {
      this.geist.setze(null, null, false);
      this.markierung.setzeListe('radius', [], 'neutral', abst);
      this.markierung.setzeListe('arbeit', [], 'gut', abst);
      if (this.vorschauGesetzt) { this.vorschauGesetzt = ''; this.hinweisSetzen(); }
      return;
    }
    const v = this.vorschauDatenFuer(w, ziel);
    this.geist.setze(w, ziel, v.ok);
    this.markierung.setzeListe('radius', v.radius, 'neutral', abst, 0.97);
    this.markierung.setzeListe('arbeit', v.arbeit, 'gut', abst, 0.62);
    if (this.meldung) this.vorschauGesetzt = '';
    else if (v.text !== this.vorschauGesetzt) { this.vorschauGesetzt = v.text; this.leiste.setHinweis(v.text, v.warn); }
  }

  /** Radius, Arbeitshexe und Text der Bauvorschau; zwischengespeichert, bis sich Ziel, Natur, Netz oder Lagervorrat ändern. */
  private vorschauDatenFuer(typ: string, ziel: Hx) {
    const vorrat = this.lagerVorrat();
    const sig = `${typ}|${key(ziel)}|${this._sicht.natur.rev}|${this.netzSig}|${vorrat.join(',')}`;
    if (this.vorschauDaten && sig === this.vorschauDatenSig) return this.vorschauDaten;
    const t = GEBAEUDE[typ];
    const ok = this._sim.kannBauen(typ, ziel.q, ziel.r);
    const imFeld = (h: Hx) => this._sim.karte.index(h.q, h.r) >= 0;
    let arbeit: Hx[] = [];
    let text: string, warn = false;
    if (!ok) {
      text = `${t.name} geht hier nicht: ${this.grundBauen(typ, ziel)}.`;
      warn = true;
    } else {
      const ar = this._sim.arbeitsHexe(typ, ziel.q, ziel.r);
      arbeit = ar.hexe;
      const kosten = this._sim.kosten(typ);
      const rw = reichweiteText(ar.art, ar.summe);
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
    this.vorschauDaten = { radius: t.radius > 0 ? hexeImUmkreis(ziel, t.radius).filter(imFeld) : [], arbeit, text, warn, ok };
    return this.vorschauDaten;
  }

  /** Vorrat aller Lager je Warenart. */
  private lagerVorrat(): number[] {
    const vorrat = new Array<number>(WAREN.length).fill(0);
    for (const g of this._sicht.gebaeude) if (g.vorrat) for (let i = 0; i < vorrat.length; i++) vorrat[i] += g.vorrat[i] ?? 0;
    return vorrat;
  }

  /** Nachbarn des letzten Punkts, die als nächster Schritt gelten (zwischengespeichert, solange sich Weg und Netz nicht ändern). */
  private naechste(): Hx[] {
    const sig = `${this.weg.sig}|${this.netzSig}`;
    if (sig !== this.schrittSig) {
      this.schrittSig = sig;
      const belegt = this.weg.pfad;
      this.schrittHexe = naechsteSchritte(this.weg, (von, nach) => this._sim.wegAbschnitt(von, nach, belegt, 1));
    }
    return this.schrittHexe;
  }

  // ------------------------------------------------------------------ Gebäudekarte und Priorität

  /** Gebäudekarte der Oberfläche aus der Sicht füllen (Zustand in Klartext, Bedarf, Fortschritt, Priorität). */
  private karteSetzen(): void {
    const g = this.gewaehlt === null ? undefined : this._sicht.gebaeude.find((x) => x.id === this.gewaehlt);
    if (!g) { this.gewaehlt = null; this.leiste.setKarte(null); return; }
    const t = GEBAEUDE[g.typ];
    const baustelle = g.bau < PROMILLE;
    const bedarf = g.bedarf ?? [];
    const zt = zustandsText(g.getrennt ? 'getrennt' : g.zustand, baustelle, bedarfNamen(bedarf, WARE_TEXT));
    const zeilen: string[] = [];
    if (baustelle) {
      const fehlt = kostenAlsText(bedarf, WARE_TEXT);
      zeilen.push(fehlt === 'nichts' ? 'Material komplett – es wird verbaut.' : `Fehlt noch: ${fehlt}`);
      zeilen.push(`Phase ${1 + Math.floor((3 * g.bau) / 1001)} von 3 · ${Math.floor(g.bau / 10)} % gebaut`);
    } else {
      if (t?.radius) zeilen.push(`Arbeitsradius: ${t.radius} Hexe`);
      if (g.puffer?.some((n) => n > 0)) zeilen.push(`Eingang: ${kostenAlsText(g.puffer, WARE_TEXT)}`);
      if (g.ausgang?.some((n) => n > 0)) zeilen.push(`Wartet auf Abholung: ${kostenAlsText(g.ausgang, WARE_TEXT)}`);
    }
    const d: KartenDaten = {
      symbol: t?.symbol ?? '🏠', titel: t?.name ?? g.typ, status: zt.titel, warn: zt.warn,
      spruch: baustelle || zt.warn || !t ? zt.spruch : t.spruch, zeilen,
      fortschritt: baustelle ? Math.floor(g.bau / 10) : undefined, prio: baustelle ? g.prioritaet : undefined,
    };
    this.leiste.setKarte(d);
  }

  /** Priorität der gewählten Baustelle setzen (Befehl 'prioritaet'). */
  private setzePrioritaet(stufe: number): void {
    const g = this.gewaehlt === null ? undefined : this._sicht.gebaeude.find((x) => x.id === this.gewaehlt);
    if (!g || g.bau >= PROMILLE) return;
    this.befehl({ art: 'prioritaet', id: g.id, stufe });
    this.karteSetzen();
  }

  /** Rechtsklick auf eine Baustelle schaltet ihre Priorität durch (ohne Werkzeug); true, wenn dort eine Baustelle war. */
  private rechtsklickPrioritaet(x: number, y: number): boolean {
    if (this.werkzeug !== 'keins') return false;
    const h = this.hexUnter(x, y);
    const g = h ? this.gebAt.get(key(h)) : undefined;
    if (!g || g.bau >= PROMILLE) return false;
    const stufe = naechstePrioritaet(g.prioritaet);
    this.gewaehlt = g.id;
    this.befehl({ art: 'prioritaet', id: g.id, stufe });
    this.melde(`${NAMEN[g.typ] ?? g.typ}: Priorität ${PRIO_NAMEN[stufe]}.`, false);
    this.karteSetzen();
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
    if (w === 'weg') {
      const n = this.weg.schritte;
      if (!this.weg.aktiv) t = `Weg: eine Fahne als Start ${tippe}.`;
      else if (touch) {
        t = n === 0 ? 'Weg: Hex antippen = Zwischenpunkt, Fahne antippen und nochmal = bauen.'
          : `Weg: ${n} Schritte – Hex = Zwischenpunkt, Fahne zweimal tippen oder „Weg bauen“ baut, „Zurück“ nimmt den letzten Punkt weg.`;
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

  private statusSetzen(): void {
    const s = this._sicht;
    this.leiste.setStatus({ tick: s.tick, freieTraeger: s.freieTraeger, vorrat: this.lagerVorrat(), pruefsumme: this._sim.pruefsumme() });
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
      const zt = zustandsText(g.zustand, baustelle, bedarfNamen(g.bedarf ?? [], WARE_TEXT));
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
        const ok = this._sim.kannBauen(w, h.q, h.r);
        z.push(`<span class="${ok ? 'gut' : 'warn'}">${NAMEN[w]}: ${ok ? `passt hier (Bauplatz ${BAUPLATZ_NAMEN[platz]}, nötig ${BAUPLATZ_NAMEN[GEBAEUDE[w].groesse]})` : 'geht hier nicht – ' + this.grundBauen(w, h)}</span>`);
      }
    } else if (w === 'fahne' && this.ctx.ausschnitt.hex.index(h.q, h.r) >= 0) {
      const ok = this._sim.kannFahne(h.q, h.r);
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
