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
import { FLAG_CAP, GEBAEUDE } from '../sim/daten';
import { PROMILLE, TICK_HZ } from '../sim/typen';
import type { Befehl, Protokoll, SichtFahne, SichtGebaeude, SichtSegment, SimSicht } from '../sim/typen';
import { Wege } from '../render/wege';
import { Fahnen } from '../render/fahnen';
import { Traeger } from '../render/traeger';
import { Gebaeude, type GebaeudeHaken } from '../render/gebaeude';
import { Markierung, type RingArt } from '../render/markierung';
import { Spielleiste, WERKZEUGE, type Werkzeug } from '../ui/spielleiste';
import {
  KlickErkenner, TEMPI, TickTakt, hexLinie, saatAusPruefsumme, waehleLagerHex, type Hx,
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

const NAMEN: Record<string, string> = {
  lager: 'Lager', holzfaeller: 'Holzfäller', steinbruch: 'Steinbruch', saegewerk: 'Sägewerk', wohnhaus: 'Wohnhaus',
};
const WARE_NAME = ['Stamm', 'Brett', 'Stein', 'Essen'];
const BAUPLATZ_NAME = ['kein', 'klein', 'mittel', 'groß'];
const AUF_PUMP = 'Material kommt in M4 – bis dahin baut der Eifeler auf Pump.';
const GEBAEUDE_WERKZEUGE = ['holzfaeller', 'steinbruch', 'saegewerk', 'wohnhaus'];

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
  private wegStart: Hx | null = null;
  /** Touch: angetippter Hex, der noch bestätigt werden muss. */
  private offen: Hx | null = null;
  private zeiger: 'mouse' | 'touch';
  private maus: { x: number; y: number } | null = null;
  private mausTimer = 0;
  private statusTimer = 0;
  private meldung: { text: string; warn: boolean; bis: number } | null = null;
  private vorschauSig = '';
  private vorschauPfad: Hx[] | null = null;

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
    this.wege.wald = ctx.haken.trees ?? null;
    this.fahnen.kamera = ctx.camera; this.traeger.kamera = ctx.camera; this.gebaeude.kamera = ctx.camera;
    this.group.add(this.wege.group, this.fahnen.group, this.traeger.group, this.gebaeude.group, this.markierung.group);
    ctx.scene.add(this.group);

    this.zeiger = matchMedia('(pointer: coarse)').matches ? 'touch' : 'mouse';
    this.leiste = new Spielleiste(ctx.root, {
      onWerkzeug: (w) => this.waehleWerkzeug(w === this.werkzeug ? 'keins' : w),
      onBestaetigen: () => this.bestaetigen(),
      onAbbrechen: () => this.abbrechen(),
      onTempo: (t) => (t === 0 ? this.pause(!this.pausiert) : this.setzeTempo(t)),
    });
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
    this.vorschauUndRinge();

    this.statusTimer -= dt;
    if (this.statusTimer <= 0) { this.statusTimer = 0.25; this.statusSetzen(); }
    if (this.meldung && performance.now() > this.meldung.bis) { this.meldung = null; this.hinweisSetzen(); }
  }

  private neueSicht(): void {
    this._sicht = this._sim.sicht();
    this.indizes();
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
      if (knopf === 2) this.abbrechen();
      else if (knopf === 0) this.klick(e.clientX, e.clientY);
    });
    c.addEventListener('pointercancel', (e) => this.erkenner.abbruch(e.pointerId));
    addEventListener('keydown', (e) => this.taste(e));
  }

  private taste(e: KeyboardEvent): void {
    const t = e.target;
    if (t instanceof HTMLInputElement || t instanceof HTMLSelectElement || t instanceof HTMLTextAreaElement) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const ziffer = /^(?:Digit|Numpad)([1-6])$/.exec(e.code);
    if (ziffer) { this.waehleWerkzeug(WERKZEUGE[Number(ziffer[1]) - 1].id); return; }
    switch (e.code) {
      case 'Delete': case 'KeyX': this.waehleWerkzeug('abriss'); return;
      case 'Escape': this.abbrechen(); return;
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
    if (w === 'keins') return;
    if (w === 'fahne') { this.aktion(h); return; }
    if (w === 'weg' && !this.wegStart) {
      if (this.fahneAt.has(key(h))) { this.wegStart = h; this.offen = null; this.hinweisSetzen(); }
      else this.melde('Ein Weg beginnt an einer Fahne – erst eine Fahne wählen.', true);
      return;
    }
    if (w === 'weg' && gleich(h, this.wegStart)) { this.wegStart = null; this.offen = null; this.hinweisSetzen(); return; }
    if (!touch) { this.aktion(h); return; }
    // Touch: erster Tipp zeigt, zweiter Tipp auf dasselbe Ziel (oder „Bauen“) führt aus
    if (gleich(this.offen, h)) { this.offen = null; this.aktion(h); return; }
    this.offen = h;
    this.hinweisSetzen();
  }

  private bestaetigen(): void {
    const h = this.offen ?? (this.zeiger === 'mouse' ? this.fokus : null);
    if (!h || this.werkzeug === 'keins') return;
    if (this.werkzeug === 'weg' && !this.wegStart) return;
    this.offen = null;
    this.aktion(h);
  }

  /** Esc, Rechtsklick, „Abbrechen“: erst das offene Ziel, dann den Wegstart, dann das Werkzeug. */
  abbrechen(): void {
    if (this.offen) this.offen = null;
    else if (this.wegStart) this.wegStart = null;
    else if (this.werkzeug !== 'keins') this.waehleWerkzeug('keins');
    this.meldung = null;
    this.hinweisSetzen();
  }

  waehleWerkzeug(w: Werkzeug): void {
    this.werkzeug = w;
    this.wegStart = null;
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
        this.melde(`${NAMEN[w]} wird gebaut. ${AUF_PUMP}`, false);
      } else this.melde(`${NAMEN[w]} geht hier nicht: ${this.grundBauen(w, h)}.`, true);
    } else if (w === 'abriss') {
      const b = this.abrissBefehl(h);
      if (b === 'lager') this.melde('Das Lager bleibt stehen – ohne Lager geht es nicht.', true);
      else if (b) { this.befehl(b); this.melde('Abgerissen.', false); }
      else this.melde('Hier ist nichts zum Abreißen.', true);
    } else if (w === 'weg' && this.wegStart) {
      const pfad = this._sim.wegVorschau(this.wegStart, h);
      if (!pfad) { this.melde('Dorthin führt kein Weg (Hindernis, zu weit oder Fahne voll).', true); return; }
      const hatFahne = this.fahneAt.has(key(h));
      this.befehl({ art: 'weg', pfad });
      this.offen = null;
      // Wege verketten: bei freiem Ziel wird dort eine Fahne gesetzt und ist der neue Start
      this.wegStart = hatFahne ? null : { q: h.q, r: h.r };
      this.hinweisSetzen();
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
    if (k.bebaubar[hi] < need) return `Bauplatz ${BAUPLATZ_NAME[k.bebaubar[hi]]}, nötig: ${BAUPLATZ_NAME[need]}`;
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
    let pfadOk = false;
    if (ziel) {
      if (w === 'weg') {
        if (this.wegStart) {
          if (!gleich(ziel, this.wegStart)) {
            const sig = `${key(this.wegStart)}>${key(ziel)}|${this.netzSig}`;
            if (sig !== this.vorschauSig) {
              this.vorschauSig = sig;
              this.vorschauPfad = this._sim.wegVorschau(this.wegStart, ziel);
            }
            pfadOk = !!this.vorschauPfad;
            pfad = this.vorschauPfad ?? hexLinie(this.wegStart, ziel);
            art = pfadOk ? 'gut' : 'schlecht';
          }
        } else art = this.fahneAt.has(key(ziel)) ? 'gut' : 'neutral';
      } else if (w === 'fahne') art = this._sim.kannFahne(ziel.q, ziel.r) ? 'gut' : 'schlecht';
      else if (GEBAEUDE_WERKZEUGE.includes(w)) art = this._sim.kannBauen(w, ziel.q, ziel.r) ? 'gut' : 'schlecht';
      else if (w === 'abriss') art = this.abrissBefehl(ziel) ? 'schlecht' : 'neutral';
      else if (this.zeiger === 'touch') art = 'neutral';
    }
    if (w !== 'weg' || !this.wegStart) this.vorschauSig = '';
    this.wege.zeigeVorschau(pfad, pfadOk);
    this.markierung.setze(0, ziel && art ? ziel : null, art ?? 'neutral', abst);
    this.markierung.setze(1, this.wegStart, 'gewaehlt', abst);
    // Knöpfe: „Bauen“ nur, wenn ein Tipp aussteht
    if (this.offen && w !== 'keins') {
      const ok = w === 'weg' ? pfadOk : art === 'gut' || (w === 'abriss' && art === 'schlecht');
      this.leiste.setAktionen(w === 'abriss' ? 'Abreißen' : w === 'weg' ? 'Weg bauen' : 'Bauen', true, !ok);
    } else {
      this.leiste.setAktionen(null, w !== 'keins');
    }
  }

  // ------------------------------------------------------------------ Hinweise, Info, Status

  private melde(text: string, warn: boolean): void {
    this.meldung = { text, warn, bis: performance.now() + 4500 };
    this.leiste.setHinweis(text, warn);
  }

  private hinweisSetzen(): void {
    if (this.meldung) { this.leiste.setHinweis(this.meldung.text, this.meldung.warn); return; }
    const w = this.werkzeug;
    const touch = this.zeiger === 'touch';
    const tippe = touch ? 'antippen' : 'anklicken';
    let t: string | null = null;
    if (w === 'weg') {
      t = !this.wegStart ? `Weg: eine Fahne als Start ${tippe}.`
        : touch ? 'Ziel antippen, dann nochmal tippen oder „Weg bauen“.' : 'Ziel anklicken – baut den Weg. Esc beendet.';
    } else if (w === 'fahne') t = `Fahne: Hex ${tippe}. Auf einem Weg teilt sie ihn.`;
    else if (GEBAEUDE_WERKZEUGE.includes(w)) {
      t = `${NAMEN[w]} (Bauplatz ${BAUPLATZ_NAME[GEBAEUDE[w].groesse]}): Platz ${tippe}. ${AUF_PUMP}`;
    } else if (w === 'abriss') t = `Abriss: Gebäude, Fahne oder Weg ${tippe}.`;
    this.leiste.setHinweis(t);
  }

  private statusSetzen(): void {
    const s = this._sicht;
    const vorrat = [0, 0, 0, 0];
    for (const g of s.gebaeude) if (g.vorrat) for (let i = 0; i < 4; i++) vorrat[i] += g.vorrat[i] ?? 0;
    this.leiste.setStatus({ tick: s.tick, freieTraeger: s.freieTraeger, vorrat, pruefsumme: this._sim.pruefsumme() });
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
      const phase = g.bau >= PROMILLE ? 'fertig' : `Baustelle ${Math.floor(g.bau / 10)} % (Phase ${1 + Math.floor((3 * g.bau) / 1001)} von 3)`;
      z.push(`<b class="sim">${name}</b><span>${phase}</span>`);
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
        z.push(`<span class="${ok ? 'gut' : 'warn'}">${NAMEN[w]}: ${ok ? `passt hier (Bauplatz ${BAUPLATZ_NAME[platz]}, nötig ${BAUPLATZ_NAME[GEBAEUDE[w].groesse]})` : 'geht hier nicht – ' + this.grundBauen(w, h)}</span>`);
      }
    } else if (w === 'fahne' && this.ctx.ausschnitt.hex.index(h.q, h.r) >= 0) {
      const ok = this._sim.kannFahne(h.q, h.r);
      z.push(`<span class="${ok ? 'gut' : 'warn'}">Fahne: ${ok ? 'passt hier' : 'geht hier nicht – ' + this.grundFahne(h)}</span>`);
    }
    return z;
  }

  private warenText(f: SichtFahne): string {
    const n = [0, 0, 0, 0];
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
