// Spielkarte im Client: ein Ausschnitt aus den Weltdaten (src/welt/ausschnitt.ts) mit Abfragen
// auf dem 10-m-Höhenraster und über das globale Hex-Raster.
import { wunschKern, type Ausschnitt, type Bahn, type Fluss, type See } from '../welt/ausschnitt';
import { FLAG, LAND, TERRAIN, COVER } from '../welt/format';

export interface Place { name: string; kind: 'stadt' | 'dorf' | 'weiler' | 'gewaesser'; x: number; z: number; imSpielfeld: boolean }

export type { Fluss as River, See as Lake, Bahn };

export interface MapInfo {
  id: string;
  name: string;
  cell: number;
  width: number;
  height: number;
  heightMin: number;
  heightMax: number;
  exaggeration: number;
  start?: string;
  cover: string[];
  hex: { size: number; radius: number; terrain: string[] };
  places: Place[];
  credits: string[];
}

export interface HexInfo {
  q: number; r: number;
  imSpielfeld: boolean;
  terrain?: string;
  hoehe?: number;
  bauplatz?: 'klein' | 'mittel' | 'groß' | '–';
  ort?: string;
  land?: string;
  bahn?: boolean;
}

const BAUPLATZ = ['–', 'klein', 'mittel', 'groß'] as const;

export class MapData {
  /** Geländehöhe in Metern ü. NN, Zeile 0 = Norden. */
  readonly ground: Float32Array;
  readonly water: Float32Array;
  readonly cover: Uint8Array;
  /** Hex-Gelände des Spielfelds (Index nach HexGrid.index). */
  readonly hexTerrain: Uint8Array;
  readonly rivers: Fluss[];
  readonly lakes: See[];
  readonly rails: Bahn[];
  readonly grenze: number[][];
  readonly sizeX: number;
  readonly sizeZ: number;
  readonly originX: number;
  readonly originZ: number;
  /** Zellen in Bahnnähe (für Bäume u. Ä.). */
  readonly railMask: Uint8Array;
  /** Zählt Änderungen an `ground` (planierte Bauplätze): Linien und Figuren, die am Gelände kleben, bauen sich neu. */
  groundRev = 0;

  constructor(readonly info: MapInfo, readonly ausschnitt: Ausschnitt) {
    this.ground = ausschnitt.ground;
    this.water = ausschnitt.water;
    this.cover = ausschnitt.cover;
    this.hexTerrain = ausschnitt.hex.terrain;
    this.rivers = ausschnitt.rivers;
    this.lakes = ausschnitt.lakes;
    this.rails = ausschnitt.rails;
    this.grenze = ausschnitt.grenze;
    this.sizeX = info.width * info.cell;
    this.sizeZ = info.height * info.cell;
    this.originX = ausschnitt.originX;
    this.originZ = ausschnitt.originZ;
    this.railMask = new Uint8Array(info.width * info.height);
    const c = info.cell;
    for (const b of this.rails) {
      for (let i = 0; i + 4 < b.p.length; i += 3) {
        const len = Math.hypot(b.p[i + 3] - b.p[i], b.p[i + 4] - b.p[i + 1]);
        const steps = Math.max(1, Math.ceil(len / 4));
        for (let s = 0; s <= steps; s++) {
          const x = b.p[i] + ((b.p[i + 3] - b.p[i]) * s) / steps, z = b.p[i + 1] + ((b.p[i + 4] - b.p[i + 1]) * s) / steps;
          const ci = Math.floor(x / c), cj = Math.floor(z / c);
          for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
            const a = ci + di, b2 = cj + dj;
            if (a >= 0 && b2 >= 0 && a < info.width && b2 < info.height) this.railMask[b2 * info.width + a] = 1;
          }
        }
      }
    }
  }

  static fromAusschnitt(a: Ausschnitt, name: string, id: string, credits: string[]): MapData {
    const places: Place[] = a.orte.map((o) => ({ name: o.name, kind: o.kind, x: o.x, z: o.z, imSpielfeld: o.imSpielfeld }));
    const rang = { stadt: 0, dorf: 1, weiler: 2, gewaesser: 9 } as const;
    const cx = (a.spielfeld.x0 + a.spielfeld.x1) / 2, cz = (a.spielfeld.z0 + a.spielfeld.z1) / 2;
    const d = (p: Place) => Math.hypot(p.x - cx, p.z - cz);
    const kandidaten = places.filter((p) => p.imSpielfeld && p.kind !== 'gewaesser');
    // Startort: der Wunsch-Ort aus der Kartenwahl, wenn er im Spielfeld liegt; sonst der größte Ortskern nahe der Mitte
    // (Stadt vor Dorf vor Weiler im inneren Drittel), sonst der nächste Ort
    const nah = kandidaten.filter((p) => d(p) < (a.spielfeld.x1 - a.spielfeld.x0) / 3)
      .sort((p, q) => rang[p.kind] - rang[q.kind] || d(p) - d(q));
    const start = wunschKern(a.kerne, a.param.wunsch, a.param.q, a.param.r, a.radius)
      ?? (nah[0] ?? kandidaten.sort((p, q) => d(p) - d(q))[0])?.name;
    const info: MapInfo = {
      id, name, cell: a.cell, width: a.breite, height: a.hoehe, heightMin: a.heightMin, heightMax: a.heightMax,
      exaggeration: 2, start, cover: COVER.slice(), hex: { size: 60, radius: a.radius, terrain: TERRAIN.slice() }, places, credits,
    };
    return new MapData(info, a);
  }

  /** Rasterindex, geklemmt. */
  idx(i: number, j: number): number {
    const { width, height } = this.info;
    i = i < 0 ? 0 : i >= width ? width - 1 : i;
    j = j < 0 ? 0 : j >= height ? height - 1 : j;
    return j * width + i;
  }

  /** Bilineare Geländehöhe (m ü. NN) an Position x/z (Ausschnitt-Meter). */
  heightAt(x: number, z: number): number {
    const c = this.info.cell;
    const fx = x / c - 0.5, fz = z / c - 0.5;
    const i = Math.floor(fx), j = Math.floor(fz);
    const tx = fx - i, tz = fz - j;
    const g = this.ground;
    const a = g[this.idx(i, j)], b = g[this.idx(i + 1, j)];
    const d = g[this.idx(i, j + 1)], e = g[this.idx(i + 1, j + 1)];
    return (a * (1 - tx) + b * tx) * (1 - tz) + (d * (1 - tx) + e * tx) * tz;
  }

  /** Oberfläche inkl. Wasserspiegel. */
  surfaceAt(x: number, z: number): number {
    const c = this.info.cell;
    const w = this.water[this.idx(Math.floor(x / c), Math.floor(z / c))];
    return Math.max(this.heightAt(x, z), w);
  }

  coverAt(x: number, z: number): number {
    const c = this.info.cell;
    return this.cover[this.idx(Math.floor(x / c), Math.floor(z / c))];
  }

  inside(x: number, z: number): boolean {
    return x >= 0 && z >= 0 && x < this.sizeX && z < this.sizeZ;
  }

  /** Hex-Info für das Überfahren; außerhalb des Spielfelds nur imSpielfeld = false (Kulisse). */
  hexInfo(q: number, r: number): HexInfo {
    const f = this.ausschnitt.hex;
    const i = f.index(q, r);
    if (i < 0) return { q, r, imSpielfeld: false };
    const kern = f.flags[i] & FLAG.ortskern ? this.ausschnitt.kerne.find((k) => k.q === q && k.r === r) : undefined;
    return {
      q, r, imSpielfeld: true, terrain: TERRAIN[f.terrain[i]], hoehe: f.height[i] / 10, bauplatz: BAUPLATZ[f.build[i]],
      ort: kern?.name || undefined, land: LAND[f.country[i]] || undefined, bahn: !!(f.flags[i] & FLAG.bahn),
    };
  }
}
