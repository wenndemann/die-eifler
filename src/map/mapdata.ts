// Geladene Spielkarte (aus tools/map/build_map.py) + Abfragen auf dem Höhenraster.

export interface Place { name: string; kind: 'stadt' | 'dorf' | 'weiler' | 'gewaesser'; x: number; z: number }

export interface MapInfo {
  id: string;
  name: string;
  bbox: [number, number, number, number];
  cell: number;
  width: number;
  height: number;
  heightMin: number;
  heightMax: number;
  exaggeration: number;
  cover: string[];
  hex: { size: number; cols: number; rows: number; layout: string; terrain: string[] };
  places: Place[];
  credits: string[];
}

export class MapData {
  /** Geländehöhe in Metern ü. NN, Zeile 0 = Norden. */
  readonly ground: Float32Array;
  /** Wasserspiegel in Metern ü. NN (0 = kein Wasser). */
  readonly water: Float32Array;
  readonly cover: Uint8Array;
  readonly hexTerrain: Uint8Array;
  readonly sizeX: number;
  readonly sizeZ: number;

  constructor(readonly info: MapInfo, height: Uint16Array, water: Uint16Array, cover: Uint8Array, hex: Uint8Array) {
    this.ground = Float32Array.from(height, (v) => v / 10);
    this.water = Float32Array.from(water, (v) => v / 10);
    this.cover = cover;
    this.hexTerrain = hex;
    this.sizeX = info.width * info.cell;
    this.sizeZ = info.height * info.cell;
  }

  static async load(base: string): Promise<MapData> {
    const get = async (f: string) => {
      const res = await fetch(`${base}/${f}`);
      if (!res.ok) throw new Error(`${f}: ${res.status}`);
      return res.arrayBuffer();
    };
    const info = (await (await fetch(`${base}/map.json`)).json()) as MapInfo;
    const [h, w, c, x] = await Promise.all([get('height.bin'), get('water.bin'), get('cover.bin'), get('hex.bin')]);
    return new MapData(info, new Uint16Array(h), new Uint16Array(w), new Uint8Array(c), new Uint8Array(x));
  }

  /** Rasterindex, geklemmt. */
  idx(i: number, j: number): number {
    const { width, height } = this.info;
    i = i < 0 ? 0 : i >= width ? width - 1 : i;
    j = j < 0 ? 0 : j >= height ? height - 1 : j;
    return j * width + i;
  }

  /** Bilineare Geländehöhe (m ü. NN) an Weltposition x/z (Meter). */
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
}
