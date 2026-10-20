// Entwicklungs-Demo ohne Simulation (#…&simdemo=1): eine zeitlich veränderliche Fake-SimSicht (src/sim/typen.ts)
// um den Startort, an der Wege, Fahnen, Träger, Waren, Stapel und Gebäude in allen Bauphasen gezeigt werden.
// Hängt die Render-Klassen in eine Gruppe und treibt sie im Frame (update). Aus Playwright über
// window.eifeler.simdemo ansteuerbar (info, setzeBau, stress, vorschau, anhalten).
import * as THREE from 'three';
import type { MapData } from '../map/mapdata';
import type { HexGrid } from '../map/hex';
import { FLAG } from '../welt/format';
import { KEIN_DORF, KEINE_NATUR, PROMILLE, TICK_HZ, type SichtFahne, type SichtGebaeude, type SichtSegment, type SichtTraeger, type SimSicht } from '../sim/typen';
import { Wege } from './wege';
import { Fahnen } from './fahnen';
import { Traeger } from './traeger';
import { Gebaeude, type GebaeudeHaken } from './gebaeude';
import { hash } from './terrain';

type H = { q: number; r: number };
const RICHTUNG: H[] = [{ q: 1, r: 0 }, { q: 0, r: 1 }, { q: -1, r: 1 }, { q: -1, r: 0 }, { q: 0, r: -1 }, { q: 1, r: -1 }];
const key = (h: H) => `${h.q},${h.r}`;
const abstand = (a: H, b: H) => (Math.abs(a.q - b.q) + Math.abs(a.r - b.r) + Math.abs(a.q + a.r - b.q - b.r)) / 2;

interface Lauf { seg: SichtSegment; i: number; dir: 1 | -1; fortschritt: number; pause: number; ware: number; tr: SichtTraeger }

export interface SimDemoKontext {
  map: MapData; grid: HexGrid; base: number; ex: number;
  haken?: GebaeudeHaken;
}

export class SimDemo {
  readonly group = new THREE.Group();
  readonly wege: Wege;
  readonly fahnen: Fahnen;
  readonly traeger: Traeger;
  readonly gebaeude: Gebaeude;
  sicht: SimSicht = { tick: 0, ich: 0, spieler: [], fahnen: [], segmente: [], traeger: [], gebaeude: [], freieTraeger: 0, natur: KEINE_NATUR, bauleute: [], dorf: KEIN_DORF, ereignisse: [] };
  private laeufe: Lauf[] = [];
  private acc = 0;
  private pausiert = false;
  private nextId = 1;
  private zeit = 0;
  private stapelAuto = true;
  private lagerHex: H;

  constructor(private ctx: SimDemoKontext) {
    const { map, grid, base, ex } = ctx;
    this.wege = new Wege(map, grid, base, ex);
    this.fahnen = new Fahnen(map, grid, base, ex);
    this.traeger = new Traeger(map, grid, base, ex);
    this.gebaeude = new Gebaeude(map, grid, base, ex, ctx.haken);
    this.wege.wald = ctx.haken?.trees ?? null;
    this.group.add(this.wege.group, this.fahnen.group, this.traeger.group, this.gebaeude.group);
    const start = map.info.places.find((p) => p.name === map.info.start) ?? { x: map.sizeX / 2, z: map.sizeZ / 2 };
    this.lagerHex = this.naechstesBegehbares(grid.fromWorld(start.x, start.z));
    this.aufbauen();
  }

  setKamera(c: THREE.Camera | null) {
    this.fahnen.kamera = c; this.traeger.kamera = c; this.gebaeude.kamera = c;
  }

  setExaggeration(ex: number) {
    this.ctx.ex = ex;
    this.wege.setExaggeration(ex); this.fahnen.setExaggeration(ex); this.traeger.setExaggeration(ex); this.gebaeude.setExaggeration(ex);
  }

  // ------------------------------------------------------------ Karte lesen

  private begehbar(h: H): boolean {
    const f = this.ctx.map.ausschnitt.hex;
    const i = f.index(h.q, h.r);
    if (i < 0) return false;
    return f.terrain[i] !== 0 && !(f.flags[i] & (FLAG.fluss | FLAG.bahn));
  }

  /** Gut bebaubar: Wiese oder Siedlung, kein Wald. */
  private frei(h: H): boolean {
    if (!this.begehbar(h)) return false;
    const t = this.ctx.map.ausschnitt.hex.terrain[this.ctx.map.ausschnitt.hex.index(h.q, h.r)];
    return t === 1 || t === 6;
  }

  private naechstesBegehbares(h: H): H {
    for (let d = 0; d < 8; d++) {
      for (let dq = -d; dq <= d; dq++) for (let dr = -d; dr <= d; dr++) {
        const c = { q: h.q + dq, r: h.r + dr };
        if (abstand(c, h) === d && this.frei(c)) return c;
      }
    }
    return h;
  }

  /** Kürzester begehbarer Weg (Breitensuche) zwischen zwei Hexen, ohne gesperrte Hexe. */
  private weg(a: H, b: H, gesperrt: Set<string>): H[] | null {
    const von = new Map<string, H | null>([[key(a), null]]);
    const queue: H[] = [a];
    for (let qi = 0; qi < queue.length; qi++) {
      const c = queue[qi];
      if (key(c) === key(b)) {
        const out: H[] = [];
        for (let x: H | null = c; x; x = von.get(key(x)) ?? null) out.unshift(x);
        return out;
      }
      for (const d of RICHTUNG) {
        const n = { q: c.q + d.q, r: c.r + d.r };
        if (von.has(key(n)) || !this.begehbar(n) || (gesperrt.has(key(n)) && key(n) !== key(b)) || abstand(n, a) > 8) continue;
        von.set(key(n), c);
        queue.push(n);
      }
    }
    return null;
  }

  // ------------------------------------------------------------ Fake-Welt

  private neueFahne(h: H, gebaeude = 0): SichtFahne {
    const f: SichtFahne = { id: this.nextId++, sp: 0, q: h.q, r: h.r, waren: [], gebaeude };
    this.sicht.fahnen.push(f);
    return f;
  }

  private verbinde(a: SichtFahne, b: SichtFahne, gesperrt: Set<string>, ware: number, pfad?: H[]) {
    const p = pfad ?? this.weg(a, b, gesperrt);
    if (!p || p.length < 2) return null;
    for (const h of p.slice(1, -1)) gesperrt.add(key(h));
    const seg: SichtSegment = { id: this.nextId++, sp: 0, a: a.id, b: b.id, pfad: p, traeger: 0, verkehr: 40 + Math.floor(hash(a.id, b.id) * 200) };
    const tr: SichtTraeger = { id: this.nextId++, sp: 0, von: p[0], nach: p[1], fortschritt: 0, schritt: 25, ware, tut: 'laeuft' };
    seg.traeger = tr.id;
    this.sicht.segmente.push(seg);
    this.sicht.traeger.push(tr);
    this.laeufe.push({ seg, i: 0, dir: 1, fortschritt: Math.floor(hash(seg.id, 3) * 900), pause: 0, ware, tr });
    return seg;
  }

  private aufbauen() {
    this.sicht = { tick: 0, ich: 0, spieler: [], fahnen: [], segmente: [], traeger: [], gebaeude: [], freieTraeger: 0, natur: KEINE_NATUR, bauleute: [], dorf: KEIN_DORF, ereignisse: [] };
    this.laeufe = [];
    this.nextId = 1;
    const L = this.lagerHex;
    // Kandidaten rund ums Lager: bebaubar, gestreut (mind. 2 Hexe Abstand), nach Richtung sortiert
    const cand: H[] = [];
    for (let dq = -5; dq <= 5; dq++) for (let dr = -5; dr <= 5; dr++) {
      const h = { q: L.q + dq, r: L.r + dr };
      const d = abstand(h, L);
      if (d >= 2 && d <= 4 && this.frei(h) && this.ctx.map.ausschnitt.hex.build[this.ctx.map.ausschnitt.hex.index(h.q, h.r)] >= 1) cand.push(h);
    }
    cand.sort((a, b) => hash(a.q, a.r) - hash(b.q, b.r));
    const gewaehlt: H[] = [];
    for (const h of cand) {
      if (gewaehlt.length >= 6) break;
      if ([L, ...gewaehlt].every((o) => abstand(o, h) >= 2)) gewaehlt.push(h);
    }
    const typen: [string, number, boolean][] = [['holzfaeller', PROMILLE, false], ['steinbruch', 500, false], ['saegewerk', 150, false], ['wohnhaus', PROMILLE, true]];
    const lagerF = this.neueFahne(L, 1);
    const gb = (typ: string, h: H, f: SichtFahne, bau: number, getrennt: boolean): SichtGebaeude => {
      const g: SichtGebaeude = { id: this.nextId++, sp: 0, typ, q: h.q, r: h.r, fahne: f.id, bau, getrennt, prioritaet: 2, zustand: 'bereit' };
      f.gebaeude = g.id;
      this.sicht.gebaeude.push(g);
      return g;
    };
    const lg = gb('lager', L, lagerF, PROMILLE, false);
    lg.vorrat = [20, 20, 20, 20];
    const gesperrt = new Set<string>([key(L)]);
    for (const h of gewaehlt) gesperrt.add(key(h));
    const fahnen: SichtFahne[] = [lagerF];
    gewaehlt.forEach((h, i) => {
      const t = typen[i];
      const f = this.neueFahne(h);
      if (t) gb(t[0], h, f, t[1], t[2]);
      fahnen.push(f);
    });
    // Wege: vom Lager sternförmig, dazu ein Querweg
    const ziele = fahnen.slice(1).filter((f) => !this.sicht.gebaeude.some((g) => g.fahne === f.id && g.getrennt));
    ziele.forEach((f, i) => this.verbinde(lagerF, f, gesperrt, i % 4));
    if (ziele.length >= 3) this.verbinde(ziele[1], ziele[2], gesperrt, 2);
    this.sicht.freieTraeger = 3;
  }

  /** Viele Träger und Fahnen für die Leistungsprobe: Gitter aus Fahnen auf geraden Hex-Koordinaten. */
  stress(nTraeger = 200, nFahnen = 100) {
    const L = this.lagerHex;
    this.sicht = { tick: 0, ich: 0, spieler: [], fahnen: [], segmente: [], traeger: [], gebaeude: [], freieTraeger: 0, natur: KEINE_NATUR, bauleute: [], dorf: KEIN_DORF, ereignisse: [] };
    this.laeufe = [];
    const mapF = new Map<string, SichtFahne>();
    const kand: H[] = [];
    for (let dq = -12; dq <= 12; dq++) for (let dr = -12; dr <= 12; dr++) {
      const h = { q: L.q + dq - ((L.q + dq) & 1), r: L.r + dr - ((L.r + dr) & 1) };
      if (abstand(h, L) <= 12 && this.begehbar(h) && !mapF.has(key(h))) { mapF.set(key(h), null as unknown as SichtFahne); kand.push(h); }
    }
    kand.sort((a, b) => abstand(a, L) - abstand(b, L));
    mapF.clear();
    for (const h of kand.slice(0, nFahnen)) {
      const f = this.neueFahne(h);
      const n = Math.floor(hash(h.q, h.r) * 11);
      for (let k = 0; k < n; k++) f.waren.push(Math.floor(hash(h.q + k, h.r) * 4));
      mapF.set(key(h), f);
    }
    const dups = new Set<string>();
    const gesperrt = new Set<string>();
    outer: for (const f of this.sicht.fahnen) {
      for (const d of [{ q: 2, r: 0 }, { q: 0, r: 2 }, { q: -2, r: 2 }]) {
        const g = mapF.get(key({ q: f.q + d.q, r: f.r + d.r }));
        const mid = { q: f.q + d.q / 2, r: f.r + d.r / 2 };
        if (!g || !this.begehbar(mid) || dups.has(key(mid))) continue;
        dups.add(key(mid));
        for (let k = 0; k < 2; k++) {
          if (this.sicht.traeger.length >= nTraeger) break outer;
          this.verbinde(f, g, gesperrt, k === 0 ? Math.floor(hash(f.q, f.r) * 4) : -1, [f, mid, g]);
        }
      }
    }
    this.stapelAuto = false;
  }

  // ------------------------------------------------------------ Ansteuern

  /** Positionen (Ausschnitt-Meter) zum Ausrichten der Kamera. */
  info() {
    const w = (h: H) => this.ctx.grid.toWorld(h);
    return {
      lager: w(this.lagerHex),
      gebaeude: this.sicht.gebaeude.map((g) => ({ id: g.id, typ: g.typ, bau: g.bau, getrennt: g.getrennt, ...w(g), mitte: this.gebaeude.mitte(g.id) })),
      fahnen: this.sicht.fahnen.map((f) => ({ id: f.id, ...w(f), waren: f.waren.length })),
      segmente: this.sicht.segmente.length, traeger: this.sicht.traeger.length,
    };
  }

  /** Baufortschritt eines Gebäudetyps setzen (0..1000), die Automatik des Stapels bleibt. */
  setzeBau(typ: string, bau: number) {
    for (const g of this.sicht.gebaeude) if (g.typ === typ) g.bau = bau;
  }

  setzeGetrennt(typ: string, getrennt: boolean) {
    for (const g of this.sicht.gebaeude) if (g.typ === typ) g.getrennt = getrennt;
  }

  /** Stapel an allen Fahnen auf n Waren festsetzen (Automatik aus); n = -1 schaltet die Automatik wieder ein. */
  setzeStapel(n: number) {
    this.stapelAuto = n < 0;
    if (n >= 0) for (const f of this.sicht.fahnen) f.waren = Array.from({ length: n }, (_, k) => (k + f.id) % 4);
  }

  anhalten(an: boolean) {
    this.pausiert = an;
  }

  /** Wegbau-Vorschau: von der Lagerfahne in Richtung der ersten freien Fahne (oder null). */
  vorschau(pfad: H[] | null, gueltig = true) {
    this.wege.zeigeVorschau(pfad, gueltig);
  }

  // ------------------------------------------------------------ Frame

  private tick() {
    this.sicht.tick++;
    for (const l of this.laeufe) {
      const { tr, seg } = l;
      if (l.pause > 0) {
        l.pause--;
        tr.tut = 'uebergibt';
        if (l.pause === 0) { l.dir = (l.dir === 1 ? -1 : 1); l.i = l.dir === 1 ? 0 : seg.pfad.length - 1; l.fortschritt = 0; tr.ware = l.dir === 1 ? l.ware : -1; }
        continue;
      }
      tr.tut = 'laeuft';
      const a = seg.pfad[l.i], b = seg.pfad[l.i + l.dir];
      tr.von = a; tr.nach = b; tr.schritt = 25;
      l.fortschritt += 25;
      if (l.fortschritt >= PROMILLE) {
        l.fortschritt = 0;
        l.i += l.dir;
        if (l.i + l.dir < 0 || l.i + l.dir >= seg.pfad.length) {
          l.pause = 12;
          tr.von = seg.pfad[l.i - l.dir]; tr.nach = seg.pfad[l.i];
          tr.fortschritt = PROMILLE; tr.schritt = 0;
          continue;
        }
        tr.von = seg.pfad[l.i]; tr.nach = seg.pfad[l.i + l.dir];
      }
      tr.fortschritt = l.fortschritt;
    }
    if (this.stapelAuto) {
      for (const f of this.sicht.fahnen) {
        const n = Math.floor(5 + 5 * Math.sin(this.zeit * 0.4 + f.id));
        if (f.waren.length !== n) f.waren = Array.from({ length: n }, (_, k) => (k + f.id) % 4);
      }
    }
  }

  update(dt: number) {
    if (!this.pausiert) {
      this.zeit += dt;
      this.acc += dt;
      const td = 1 / TICK_HZ;
      while (this.acc >= td) { this.acc -= td; this.tick(); }
    }
    const alpha = Math.min(0.999, this.acc * TICK_HZ);
    this.gebaeude.update(this.sicht, alpha, dt);
    this.wege.update(this.sicht, alpha, dt);
    this.fahnen.update(this.sicht, alpha, dt);
    this.traeger.update(this.sicht, this.pausiert ? 0 : alpha, dt);
  }
}
