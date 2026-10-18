// Deterministischer Simulationskern (Drehbuch 4.1, 8.3; DESIGN §3–4): Fahnen, Wege, Träger, Routing, Warenfluss, Abriss.
// Nur Ganzzahlen, fester Tick, Zufall nur aus der Saat. Intern werden Hexe als Karten-Index geführt.
import { Fnv2 } from '../welt/pruefsumme';
import {
  BAU_TICKS, FAHNE_MAX_SEGMENTE, FLAG_CAP, GEBAEUDE, NOTPLAETZE, START_VORRAT, TRAEGER_START, UEBERGABE_TICKS, WAREN, WEG_MAX_SCHRITTE,
} from './daten';
import { SimKarte } from './karte';
import { sucheWeg, ZahlenHeap } from './pfad';
import { PROMILLE } from './typen';
import type { Befehl, Id, KarteDaten, Protokoll, ProtokollEintrag, SimSicht } from './typen';

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

interface Gebaeude {
  id: Id; typ: string; h: number; fahne: Id;
  /** Gebaute Ticks (fertig bei BAU_TICKS). */
  bt: number;
  getrennt: boolean;
  puffer: number[]; incoming: number[];
  zeit: number; arbeit: number;
  vorrat: number[];
}

const DIST_K = 1 << 21;

export class Simulation {
  readonly karte: SimKarte;
  private readonly saat: number;
  private _tick = 0;
  private rng: number;
  private naechsteId = 1;
  private freieTraeger = TRAEGER_START;
  private befehlZahl = 0;
  private fahnen = new Map<Id, Fahne>();
  private segmente = new Map<Id, Segment>();
  private traeger = new Map<Id, Traeger>();
  private gebaeude = new Map<Id, Gebaeude>();
  private hexFahne: Int32Array;
  private hexGeb: Int32Array;
  private hexWeg: Int32Array;
  private log: ProtokollEintrag[] = [];
  private ausstehend: ProtokollEintrag[] = [];
  private stat = { angekommen: 0, verbraucht: 0, erzeugt: 0, maxWarte: 0 };
  // abgeleitete Zwischenspeicher (nicht Teil der Prüfsumme)
  private distCache = new Map<Id, Map<Id, number>>();
  private verbunden = new Set<Id>();
  private verbundenNeu = true;
  private inb = new Map<Id, number>();

  constructor(karteDaten: KarteDaten, saat: number, start: { q: number; r: number }) {
    this.karte = new SimKarte(karteDaten);
    this.saat = saat | 0;
    this.rng = (Math.imul(this.saat, 0x9e3779b1) ^ 0x85ebca6b) | 0;
    const n = this.karte.count;
    this.hexFahne = new Int32Array(n);
    this.hexGeb = new Int32Array(n);
    this.hexWeg = new Int32Array(n);
    const h = this.karte.index(start.q, start.r);
    if (h < 0 || !this.karte.begehbar[h]) throw new Error('Startlager liegt nicht auf begehbarem Boden');
    const lager = this.gebaeudeErzeugen('lager', h, true);
    lager.vorrat = START_VORRAT.slice();
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
    for (const g of this.gebaeude.values()) this.gebaeudeTick(g);
    if (t % 10 === 0) this.zielePruefen();
    if (t % 4 === 0) this.lagerPull();
    this.traegerPhase();
    if (t % 40 === 0) for (const s of this.segmente.values()) if (s.verkehr > 0) s.verkehr--;
    this._tick++;
  }

  protokoll(karteInfo: Protokoll['karte']): Protokoll {
    const l = this.lagerGebaeude();
    return {
      format: 1, karte: { ...karteInfo }, saat: this.saat,
      start: { q: this.karte.qs[l.h], r: this.karte.rs[l.h] },
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
        const o: SimSicht['gebaeude'][number] = {
          id: g.id, typ: g.typ, ...hx(g.h), fahne: g.fahne,
          bau: g.bt >= BAU_TICKS ? PROMILLE : Math.floor((PROMILLE * g.bt) / BAU_TICKS),
          getrennt: g.getrennt,
        };
        if (g.typ === 'lager') o.vorrat = g.vorrat.slice();
        return o;
      }),
      freieTraeger: this.freieTraeger,
    };
  }

  /** Zähler für Tests und Statistik: angekommene Waren, verbrauchte, erzeugte, längste Wartezeit mit Ware (Ticks). */
  statistik(): { angekommen: number; verbraucht: number; erzeugt: number; maxWarte: number } {
    return { ...this.stat };
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
    for (const g of this.gebaeude.values()) {
      for (let a = 0; a < WAREN.length; a++) {
        const soll = inc.get(`${g.id}:${a}`) ?? 0;
        if (g.incoming[a] !== soll) fehler.push(`Gebäude ${g.id} incoming[${a}] ${g.incoming[a]} statt ${soll}`);
      }
    }
    for (const key of inc.keys()) {
      const id = Number(key.split(':')[0]);
      if (!this.gebaeude.has(id)) fehler.push(`Ware mit ungültigem Ziel ${id} (wird neu geroutet)`);
    }
    for (const s of this.segmente.values()) {
      if (!this.fahnen.has(s.a) || !this.fahnen.has(s.b)) fehler.push(`Segment ${s.id}: Fahne fehlt`);
      for (let i = 1; i < s.pfad.length - 1; i++) if (this.hexWeg[s.pfad[i]] !== s.id) fehler.push(`Segment ${s.id}: Hex-Belegung`);
      if (s.traeger && !this.traeger.has(s.traeger)) fehler.push(`Segment ${s.id}: Träger fehlt`);
    }
    return fehler;
  }

  // ------------------------------------------------------------------ Prüfsumme

  pruefsumme(): string {
    const f = new Fnv2();
    const w = (v: number) => { v |= 0; f.byte(v); f.byte(v >>> 8); f.byte(v >>> 16); f.byte(v >>> 24); };
    const liste = (a: readonly number[]) => { w(a.length); for (const v of a) w(v); };
    w(this._tick); w(this.rng); w(this.saat); w(this.naechsteId); w(this.freieTraeger); w(this.befehlZahl);
    w(this.stat.angekommen); w(this.stat.verbraucht); w(this.stat.erzeugt);
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
      w(g.id); f.text(g.typ); w(g.h); w(g.fahne); w(g.bt); w(g.getrennt ? 1 : 0); liste(g.puffer); liste(g.incoming); w(g.zeit); w(g.arbeit); liste(g.vorrat);
    }
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

  private hexKannBauen(typ: string, h: number): boolean {
    const t = GEBAEUDE[typ];
    if (!t || typ === 'lager') return false;
    const k = this.karte;
    if (!k.begehbar[h] || k.bebaubar[h] < t.groesse) return false;
    if (this.hexFahne[h] || this.hexWeg[h] || this.hexGeb[h]) return false;
    for (let i = 0; i < 6; i++) {
      const n = k.nachbarn[h * 6 + i];
      if (n >= 0 && this.hexGeb[n]) return false;
    }
    return true;
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
    this.netzGeaendert();
    return f;
  }

  private gebaeudeErzeugen(typ: string, h: number, sofort: boolean): Gebaeude {
    const g: Gebaeude = {
      id: this.naechsteId++, typ, h, fahne: 0, bt: sofort ? BAU_TICKS : 0, getrennt: typ !== 'lager',
      puffer: [0, 0, 0, 0], incoming: [0, 0, 0, 0], zeit: 0, arbeit: 0, vorrat: [0, 0, 0, 0],
    };
    if (!sofort) g.zeit = this.zufall(40);
    const f = this.fahneErzeugen(h, g.id);
    g.fahne = f.id;
    this.hexGeb[h] = g.id;
    this.gebaeude.set(g.id, g);
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
        this.freieTraeger++;
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
    for (let i = 1; i < n - 1; i++) this.hexWeg[hs[i]] = s.id;
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
      this.freieTraeger++;
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
        this.freieTraeger++;
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

  /** Gebäude: Die Fahne bleibt frei; der Puffer landet an der Fahne, soweit Platz ist. Das Lager bleibt stehen. */
  private gebaeudeAbreissen(id: Id): void {
    const g = this.gebaeude.get(id);
    if (!g || g.typ === 'lager') return;
    const f = this.fahnen.get(g.fahne)!;
    for (let a = 0; a < WAREN.length; a++) {
      for (let i = 0; i < g.puffer[a]; i++) if (f.waren.length < FLAG_CAP) f.waren.push({ art: a, ziel: 0 });
    }
    f.gebaeude = 0;
    this.hexGeb[g.h] = 0;
    this.gebaeude.delete(id);
    this.netzGeaendert();
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

  /** DESIGN §4.5: Verarbeiter/Verbraucher mit Platz im Puffer, sonst nächstes Lager; 0 = kein Ziel erreichbar. */
  private zielWaehlen(art: number, z: Fahne): Id {
    let best = 0, bd = Infinity;
    for (const g of this.gebaeude.values()) {
      if (g.typ === 'lager' || g.getrennt || g.bt < BAU_TICKS) continue;
      const max = GEBAEUDE[g.typ].puffer[art];
      if (!max || g.puffer[art] + g.incoming[art] >= max) continue;
      const d = this.distZu(g.fahne).get(z.id);
      if (d !== undefined && d < bd) { bd = d; best = g.id; }
    }
    if (best) return best;
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

  private wareErzeugen(f: Fahne, art: number): void {
    const w: Ware = { art, ziel: 0 };
    this.wareZielSetzen(w, f);
    f.waren.push(w);
    this.stat.erzeugt++;
  }

  private gebaeudeTick(g: Gebaeude): void {
    const f = this.fahnen.get(g.fahne)!;
    // Ware mit Ziel dieses Gebäudes aus der Fahne nehmen (eine je Tick)
    for (let i = 0; i < f.waren.length; i++) {
      const w = f.waren[i];
      if (w.ziel !== g.id) continue;
      f.waren.splice(i, 1);
      if (g.incoming[w.art] > 0) g.incoming[w.art]--;
      if (g.typ === 'lager') g.vorrat[w.art]++; else g.puffer[w.art]++;
      this.stat.angekommen++;
      break;
    }
    if (g.typ === 'lager') return;
    if (g.bt < BAU_TICKS) { g.bt++; return; }
    if (g.getrennt) return;
    const t = GEBAEUDE[g.typ];
    if (t.erzeugt) {
      if (g.zeit < t.erzeugt.ticks) g.zeit++;
      if (g.zeit >= t.erzeugt.ticks && this.platz(f)) { this.wareErzeugen(f, t.erzeugt.ware); g.zeit = 0; }
    } else if (t.wandelt) {
      if (!g.arbeit) {
        if (g.puffer[t.wandelt.ein] > 0) { g.puffer[t.wandelt.ein]--; g.arbeit = 1; g.zeit = 0; }
      } else {
        g.zeit++;
        if (g.zeit >= t.wandelt.ticks && this.platz(f)) { this.wareErzeugen(f, t.wandelt.aus); g.arbeit = 0; g.zeit = 0; }
      }
    } else if (t.verbraucht) {
      g.zeit++;
      if (g.zeit >= t.verbraucht.ticks) {
        g.zeit = 0;
        for (let a = 0; a < WAREN.length; a++) if (g.puffer[a] > 0) { g.puffer[a]--; this.stat.verbraucht++; }
      }
    }
  }

  /** Lager-Auslieferung als Pull: Bedarf meldet sich, das nächste verbundene Lager mit Vorrat gibt eine Ware an seine Fahne. */
  private lagerPull(): void {
    const gezogen = new Set<Id>();
    for (const g of this.gebaeude.values()) {
      if (g.typ === 'lager' || g.getrennt || g.bt < BAU_TICKS) continue;
      const t = GEBAEUDE[g.typ];
      for (let a = 0; a < WAREN.length; a++) {
        const max = t.puffer[a];
        if (!max || g.puffer[a] + g.incoming[a] >= max) continue;
        const dm = this.distZu(g.fahne);
        let best: Gebaeude | null = null, bd = Infinity;
        for (const l of this.gebaeude.values()) {
          if (l.typ !== 'lager' || gezogen.has(l.id) || l.vorrat[a] <= 0) continue;
          const lf = this.fahnen.get(l.fahne)!;
          if (lf.waren.length + this.inbGet(lf.id) >= FLAG_CAP / 2) continue;
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

  // ------------------------------------------------------------------ Träger

  private traegerPhase(): void {
    if (this.freieTraeger > 0) {
      for (const s of this.segmente.values()) {
        if (this.freieTraeger <= 0) break;
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
    // Route vom Lager entlang des Gradienten der Distanz zur Zielfahne e
    const dm = this.distZu(best.e);
    let cur = this.fahnen.get(best.l.fahne)!;
    const route: number[] = [cur.h];
    const segs: Id[] = [];
    while (cur.id !== best.e) {
      const cd = dm.get(cur.id)!;
      let weiter: Segment | null = null;
      for (const sid of cur.segmente) {
        const x = this.segmente.get(sid)!;
        const o = x.a === cur.id ? x.b : x.a;
        const d = dm.get(o);
        if (d !== undefined && d + this.segmentKostenVon(x, cur.id) === cd) { weiter = x; break; }
      }
      if (!weiter) return;
      const pfad = weiter.a === cur.id ? weiter.pfad : weiter.pfad.slice().reverse();
      for (let i = 1; i < pfad.length; i++) route.push(pfad[i]);
      segs.push(weiter.id);
      cur = this.fahnen.get(weiter.a === cur.id ? weiter.b : weiter.a)!;
    }
    const ende: 0 | 1 = best.e === s.a ? 0 : 1;
    const t: Traeger = {
      id: this.naechsteId++, seg: s.id, phase: route.length > 1 ? 0 : 1, ende,
      pos: ende === 0 ? 0 : s.pfad.length - 1, dir: 1, t: 0, dauer: route.length > 1 ? this.karte.schritt(route[0], route[1]) : 0,
      pause: 0, art: -1, ziel: 0, warte: 0, route: route.length > 1 ? route : [], ri: 0, routeSegs: segs,
    };
    if (route.length <= 1) t.routeSegs = [];
    this.traeger.set(t.id, t);
    s.traeger = t.id;
    this.freieTraeger--;
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
      if (x.waren.length < FLAG_CAP) {
        const w: Ware = { art: t.art, ziel: t.ziel };
        if (w.ziel && !this.zielOk(w, x)) { this.wareZielLoesen(w); this.wareZielSetzen(w, x); }
        x.waren.push(w);
        this.inbAdd(x.id, -1);
        t.art = -1; t.ziel = 0; t.warte = 0; t.pause = UEBERGABE_TICKS;
        return;
      }
      // Tausch an voller Fahne: ablegen (Notplatz) und im selben Schritt die Ware für die Rückrichtung mitnehmen
      const pi = this.findeWare(x, s);
      if (pi >= 0 && this.darfZu(y, s)) {
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
    if (this.darfZu(y, s)) {
      const i = this.findeWare(x, s);
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
    // leer zum anderen Ende, wenn dort etwas für dieses Segment liegt
    if (this.darfZu(x, s) && this.findeWare(y, s) >= 0) this.losgehen(t, s);
  }
}
