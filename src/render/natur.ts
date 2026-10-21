// Bäume und Felsen aus der Simulation (M4; nur lesen aus SimSicht.natur, nie die Sim ändern).
// - „Was man sieht, gibt es“: Im Spielfeld zeigt der Kartenwald (trees.ts) nur noch Bäume auf Wald-Hexen. Je Wald-Hex
//   vergleicht diese Datei natur.baum mit dem Startwert (natur.start, sonst 3): bei weniger Bäumen blendet sie anteilig
//   Kartenbäume dieses Hex aus (Trees.setzeHexAnteil, feste Auswahl je Hex). Raster-Bäume auf Nicht-Wald-Hexen im Spielfeld
//   (Streubäume, Waldränder) sind weg; stattdessen steht dort, wo die Simulation einen Baum hat (Wiese, Heide, Moor), ein
//   ausgewachsener Baum an festem Platz. Die Kulisse außerhalb des Spielfelds bleibt unberührt.
// - Gepflanzte und nachgewachsene Bäume sind eigene Instanzen an festen Plätzen im Hex (Hash aus q, r), Größe nach
//   Wachstumsstufe (Setzling klein … ausgewachsen wie ein Kartenbaum). Gefällte Bäume lassen einen Baumstumpf zurück.
// - Steine nach natur.felsArt: Fels = große Felsgruppe aus mehreren kantigen Blöcken, Klippe = mittlere Brocken,
//   Lesesteine = kleiner flacher Steinhaufen. Zahl und Größe schrumpfen stufenweise mit der Restmenge, bei 0 ist alles weg.
// Es wird nur neu gerechnet, wenn natur.rev steigt, und nur für Hexe, die sich gegenüber der vorigen Kopie geändert haben.
import * as THREE from 'three';
import { mitSchnee } from './kulisse';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { MapData } from '../map/mapdata';
import type { HexGrid } from '../map/hex';
import { HEX } from '../welt/format';
import type { SimSicht } from '../sim/typen';
import { TREE_MAX } from '../sim/daten';
import { Instanzen } from './instanzen';
import { BAUM_SKALE } from './massstab';
import { paint } from './mockup';
import { hash } from './terrain';
import type { Trees } from './trees';

/** Startbäume je Wald-Hex in der Simulation (TREE_MAX). */
const START_WALD = TREE_MAX;
/** Größe eines Jungbaums nach Alter (Stufe 0 = ausgewachsen = 1). */
const WUCHS = [1, 0.2, 0.42, 0.72];
/** Platz im Hex, in dem Bäume und Stümpfe stehen (Anteil des Hex-Radius). */
const PLATZ = 0.58;

/**
 * Felsbrocken im Wimmelbuch-Stil (STIL.md): rundlicher Findling – unterteiltes Ikosaeder mit Rauschen (gleiche Ecke, gleiches
 * Rauschen), weich schattiert, warmer Sandstein-Ton mit gemaltem Verlauf (unten dunkler, oben heller), nie kaltes Grau.
 */
function felsGeometrie(variante: number): THREE.BufferGeometry {
  const roh = new THREE.IcosahedronGeometry(1, variante ? 0 : 1);   // zweite Form gröber (Dreiecksbudget)
  roh.deleteAttribute('normal'); roh.deleteAttribute('uv');
  const g = mergeVertices(roh);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const s = Math.round((pos.getX(i) * 13 + pos.getY(i) * 7 + pos.getZ(i) * 3) * 100) + variante * 131;
    const j = 0.82 + hash(s, 1) * 0.3;
    pos.setXYZ(i, pos.getX(i) * j * (variante ? 1.15 : 1), pos.getY(i) * j * 0.68, pos.getZ(i) * j);
  }
  g.translate(0, 0.3, 0);
  g.computeVertexNormals();
  const nor = g.attributes.normal;
  const col = new Float32Array(pos.count * 3);
  // Eifeler Bruchstein: warmes Grau (STIL.md #a39a8c), oben Moos
  const c = new THREE.Color(), unten = new THREE.Color('#7e6c58'), oben = new THREE.Color('#b8a688'), moos = new THREE.Color('#6d8a3e');
  for (let i = 0; i < pos.count; i++) {
    const hell = 0.5 + 0.5 * nor.getY(i);
    c.copy(unten).lerp(oben, hell).multiplyScalar(0.92 + hash(i, 9 + variante) * 0.16);
    if (nor.getY(i) > 0.72 && hash(i, 3 + variante) < 0.55) c.lerp(moos, 0.65);
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

function stumpfGeometrie(): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(1.2, 1.55, 1.7, 7).translate(0, 0.85, 0);
  const oben = new THREE.CylinderGeometry(1.1, 1.1, 0.12, 7).translate(0, 1.72, 0);
  const merged = [paint(g, '#5e4430'), paint(oben, '#dcc08a')];
  const a = merged[0], b = merged[1];
  const out = new THREE.BufferGeometry();
  for (const name of ['position', 'color']) {
    const x = a.attributes[name].array as Float32Array, y = b.attributes[name].array as Float32Array;
    const m = new Float32Array(x.length + y.length);
    m.set(x); m.set(y, x.length);
    out.setAttribute(name, new THREE.BufferAttribute(m, 3));
  }
  out.computeVertexNormals();
  return out;
}

export class Natur {
  readonly group = new THREE.Group();
  private ex: number;
  private felsSaetze: Instanzen[] = [];
  private baumSaetze: Instanzen[] = [];
  private stumpf: Instanzen;
  private qs: Int32Array;
  private rs: Int32Array;
  private terrain: Uint8Array;
  private hoehe: Uint16Array;
  private rev = -1;
  private groundRev = -1;
  // Kopie der vorigen Sicht: nur geänderte Hexe neu bewerten
  private pBaum: Uint8Array | null = null;
  private pJung: Uint8Array | null = null;
  private pStufe: Uint8Array | null = null;
  private pFels: Uint8Array | null = null;
  /** Hat der Kartenwald auf diesem Hex Bäume (nur dann zeichnet er die Wald-Bäume)? Einmal berechnet. */
  private kartenWald: Uint8Array;
  /** Hexe mit eigenen Bäumen/Stümpfen bzw. mit Fels. */
  private baumHexe = new Set<number>();
  private felsHexe = new Set<number>();
  private baumNeu = true;
  private felsNeu = true;
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private p = new THREE.Vector3();
  private s = new THREE.Vector3();
  private farbe = new THREE.Color();
  private yAchse = new THREE.Vector3(0, 1, 0);

  constructor(private map: MapData, private grid: HexGrid, private base: number, ex: number, private trees?: Trees) {
    this.ex = ex;
    const feld = grid.feld;
    this.terrain = feld.terrain; this.hoehe = feld.height;
    const n = feld.count;
    this.kartenWald = new Uint8Array(n);
    for (let i = 0; i < n; i++) this.kartenWald[i] = feld.terrain[i] === 2 && trees && trees.hexBaeume(i) > 0 ? 1 : 0;
    this.qs = new Int32Array(n); this.rs = new Int32Array(n);
    let i = 0;
    for (let dr = -feld.n; dr <= feld.n; dr++) {
      for (let dq = Math.max(-feld.n, -dr - feld.n); dq <= Math.min(feld.n, -dr + feld.n); dq++) { this.qs[i] = feld.q + dq; this.rs[i] = feld.r + dr; i++; }
    }
    const fels = mitSchnee(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 }));
    for (let v = 0; v < 2; v++) this.felsSaetze.push(new Instanzen(this.group, felsGeometrie(v), fels, false, true, [], 256));
    if (trees) {
      for (const sp of ['fichte', 'buche'] as const) this.baumSaetze.push(new Instanzen(this.group, trees.geos[sp][0], trees.material, true, true, [], 64));
    }
    this.stumpf = new Instanzen(this.group, stumpfGeometrie(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, flatShading: true }), false, true, [], 64);
  }

  setExaggeration(ex: number) {
    if (ex === this.ex) return;
    this.ex = ex;
    this.baumNeu = this.felsNeu = true;
    this.rev = -1;   // beim nächsten update neu setzen
  }

  /** Platz Nr. k im Hex i (Ausschnitt-Meter). */
  private platz(i: number, k: number, mitte: { x: number; z: number }) {
    const a = hash(this.qs[i] * 7 + k * 3 + 1, this.rs[i] * 13 + 5) * Math.PI * 2;
    const r = HEX.R * PLATZ * Math.sqrt(0.15 + 0.85 * hash(this.qs[i] * 11 + k, this.rs[i] * 5 + k * 17 + 2));
    return { x: mitte.x + Math.cos(a) * r, z: mitte.z + Math.sin(a) * r, dreh: hash(i, k + 40) * Math.PI * 2, v: hash(i * 3 + k, 77) };
  }

  /** Start-Baumzahl des Hex: aus der Sicht, sonst Wald = 3 und sonst 0. */
  private startBaeume(nat: SimSicht['natur'], i: number): number {
    return nat.start ? nat.start[i] : this.terrain[i] === 2 ? START_WALD : 0;
  }

  /** Zahl der Bäume, Jungbäume und Stümpfe, die diese Datei selbst zeichnen muss (der Kartenwald zeichnet den Rest). */
  private eigeneBaeume(i: number, b: number, j: number, start: number): number {
    const wald = this.kartenWald[i] === 1;
    return (wald ? Math.max(0, b - start) : b) + j + Math.max(0, start - b - j);
  }

  update(sicht: SimSicht) {
    const nat = sicht.natur;
    if (!nat.baum.length) return;
    const gr = this.map.groundRev !== this.groundRev;
    if (nat.rev === this.rev && !gr) return;
    const n = nat.baum.length;
    const pb = this.pBaum, pj = this.pJung, ps = this.pStufe, pf = this.pFels;
    for (let i = 0; i < n; i++) {
      const b = nat.baum[i], j = nat.jung[i], st = nat.stufe[i], f = nat.fels[i];
      const start = this.startBaeume(nat, i);
      const wald = this.kartenWald[i] === 1;
      if (!pb) {
        // erster Durchlauf: Raster-Bäume auf Nicht-Wald-Hexen im Spielfeld ausblenden (Simulation hat dort keine)
        if (!wald && this.trees && this.trees.hexBaeume(i) > 0) this.trees.setzeHexAnteil(i, 0);
      }
      const bAlt = pb ? pb[i] : wald ? start : -1, jAlt = pj ? pj[i] : 0, sAlt = ps ? ps[i] : 0;
      if (b !== bAlt || j !== jAlt || st !== sAlt) {
        if (wald) this.trees!.setzeHexAnteil(i, start > 0 ? Math.min(1, b / start) : 0);
        if (this.eigeneBaeume(i, b, j, start) > 0) this.baumHexe.add(i); else this.baumHexe.delete(i);
        this.baumNeu = true;
      }
      if (pf ? f !== pf[i] : f > 0) {
        if (f > 0) this.felsHexe.add(i); else this.felsHexe.delete(i);
        this.felsNeu = true;
      }
    }
    this.trees?.uebernehme();
    this.pBaum = nat.baum; this.pJung = nat.jung; this.pStufe = nat.stufe; this.pFels = nat.fels;
    if (gr) this.baumNeu = this.felsNeu = true;
    this.rev = nat.rev;
    this.groundRev = this.map.groundRev;
    if (this.baumNeu) this.baueBaeume(nat);
    if (this.felsNeu) this.baueFelsen(nat);
    this.baumNeu = this.felsNeu = false;
  }

  private y(x: number, z: number) {
    return (this.map.heightAt(x, z) - this.base) * this.ex;
  }

  private baueBaeume(nat: SimSicht['natur']) {
    for (const s of this.baumSaetze) s.beginne();
    this.stumpf.beginne();
    const { m, q, p, s, farbe, yAchse } = this;
    for (const i of this.baumHexe) {
      const start = this.startBaeume(nat, i);
      const b = nat.baum[i], j = nat.jung[i], st = nat.stufe[i];
      const extra = this.kartenWald[i] === 1 ? Math.max(0, b - start) : b;
      const stumpfe = Math.max(0, start - b - j);
      const mitte = this.grid.toWorld({ q: this.qs[i], r: this.rs[i] });
      // Plätze: erst die Neupflanzungen (ausgewachsene, dann junge, älteste zuerst), Stümpfe von hinten
      let k = 0;
      const setze = (platz: number, wuchs: number, art: 'baum' | 'stumpf') => {
        const pl = this.platz(i, platz, mitte);
        q.setFromAxisAngle(yAchse, pl.dreh);
        if (art === 'stumpf') {
          s.setScalar(BAUM_SKALE * (0.9 + pl.v * 0.3));
          m.compose(p.set(pl.x, this.y(pl.x, pl.z), pl.z), q, s);
          this.stumpf.fuege(m);
          return;
        }
        const fichte = pl.v < Math.min(0.85, Math.max(0.15, (this.hoehe[i] / 10 - 380) / 250));
        s.setScalar(BAUM_SKALE * (0.8 + pl.v * 0.45) * wuchs);
        m.compose(p.set(pl.x, this.y(pl.x, pl.z), pl.z), q, s);
        this.baumSaetze[fichte ? 0 : 1].fuege(m, farbe.setScalar(0.88 + pl.v * 0.2));
      };
      if (this.baumSaetze.length) {
        for (let e = 0; e < extra; e++) setze(k++, 1, 'baum');
        for (let e = 0; e < j; e++) setze(k++, WUCHS[Math.max(1, e === 0 ? st : st - 1)] ?? WUCHS[1], 'baum');
      }
      for (let e = 0; e < stumpfe; e++) setze(TREE_MAX * 2 - 1 - e, 1, 'stumpf');
    }
    for (const sa of this.baumSaetze) sa.fertig();
    this.stumpf.fertig();
  }

  /** Art des Steins auf dem Hex: aus der Sicht, sonst nach Restmenge geschätzt (Fels > Klippe > Lesesteine). */
  private felsArt(nat: SimSicht['natur'], i: number): number {
    if (nat.felsArt) return nat.felsArt[i] || 1;
    const f = nat.fels[i];
    return this.terrain[i] === 5 || f >= 40 ? 1 : f >= 12 ? 2 : 3;
  }

  private baueFelsen(nat: SimSicht['natur']) {
    for (const s of this.felsSaetze) s.beginne();
    const { m, q, p, s, farbe, yAchse } = this;
    for (const i of this.felsHexe) {
      const f = nat.fels[i];
      if (f <= 0) continue;
      const art = this.felsArt(nat, i);
      const qi = this.qs[i], ri = this.rs[i];
      const mitte = this.grid.toWorld({ q: qi, r: ri });
      const h = (k: number, z: number) => hash(qi * 31 + k * 7 + z, ri * 17 + z * 3 + 7);
      // Stein k: Abstand vom Hex-Mittelpunkt, Winkel, Größe (Radius in Metern), Höhenfaktor, Helligkeit (Tönung)
      const stein = (k: number, ab: number, winkel: number, gr: number, hoch: number, ton: number, warm: number) => {
        const x = mitte.x + Math.cos(winkel) * ab, z = mitte.z + Math.sin(winkel) * ab;
        q.setFromAxisAngle(yAchse, h(k, 90) * Math.PI * 2);
        s.set(gr * (0.9 + 0.3 * h(k, 3)), gr * hoch * (0.85 + 0.3 * h(k, 4)), gr * (0.9 + 0.3 * h(k, 5)));
        m.compose(p.set(x, this.y(x, z) - gr * 0.14, z), q, s);
        // Lesesteine etwas wärmer (gelblich) als der blaugraue Fels
        this.felsSaetze[(k + i) % 2].fuege(m, farbe.setRGB(ton * (1 + warm * 0.1), ton, ton * (1 - warm * 0.12)));
      };
      const w0 = h(0, 1) * Math.PI * 2;
      if (art === 1) {
        // Felsgruppe: ein großer Block in der Mitte, drumherum kleinere; bei weniger Rest erst weniger Blöcke, dann kleinere
        const t = Math.sqrt(Math.min(f, 80) / 80);
        const n = Math.max(2, Math.min(6, Math.round(2 + 4 * t)));
        const gross = 8 + 16 * t;
        stein(0, HEX.R * 0.05 * h(0, 2), w0, gross, 1.05, 0.74 + 0.16 * h(0, 6), 0);
        for (let k = 1; k < n; k++) {
          const gr = gross * (0.38 + 0.3 * h(k, 8));
          stein(k, gross * (0.6 + 0.4 * h(k, 9)) + gr * 0.4, w0 + (k / (n - 1)) * Math.PI * 2 + h(k, 10) * 0.7, gr, 0.9, 0.7 + 0.2 * h(k, 6), 0);
        }
      } else if (art === 2) {
        // Klippe: mittlere Brocken, kantig und etwas höher
        const t = Math.sqrt(Math.min(f, 25) / 25);
        const n = Math.max(1, Math.min(4, Math.round(1 + 3 * t)));
        const gross = 5 + 6 * t;
        stein(0, HEX.R * 0.06 * h(0, 2), w0, gross, 1.2, 0.8 + 0.16 * h(0, 6), 0);
        for (let k = 1; k < n; k++) {
          const gr = gross * (0.5 + 0.25 * h(k, 8));
          stein(k, gross * (1.0 + 0.4 * h(k, 9)) + gr * 0.4, w0 + k * 2.1 + h(k, 10) * 0.8, gr, 1.1, 0.76 + 0.2 * h(k, 6), 0);
        }
      } else {
        // Lesesteinhaufen: viele kleine, flache Steine, aufgehäuft; jeder Stein weniger = ein Stein weniger im Haufen
        const n = Math.max(1, Math.min(8, f));
        for (let k = 0; k < n; k++) {
          const innen = k < 2;
          const gr = (innen ? 6 : 4.2) * (0.85 + 0.35 * h(k, 8));
          const ab = innen ? 2.2 * k : 7 + 3 * Math.sqrt(k) + 2.5 * h(k, 9);
          stein(k, ab, w0 + k * 2.4, gr, innen ? 0.7 : 0.55, 0.95 + 0.18 * h(k, 6), 1);
        }
      }
    }
    for (const sa of this.felsSaetze) sa.fertig();
  }
}
