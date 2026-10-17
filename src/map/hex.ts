// Hex-Abfragen im Ausschnitt: dünne Hülle um das globale Hex-Raster (src/welt/hexwelt.ts).
// Ausschnitt-Koordinaten = Weltmeter minus Ausschnitt-Ursprung.
import { hexToWorld, worldToHex, type Axial } from '../welt/hexwelt';
import { HEX } from '../welt/format';
import type { HexFeld } from '../welt/ausschnitt';

export type { Axial };

export class HexGrid {
  readonly size = HEX.R;
  /** Ursprung des globalen Hex-Rasters (Hex 0,0) in Ausschnitt-Koordinaten. */
  readonly ox: number;
  readonly oz: number;

  constructor(readonly originX: number, readonly originZ: number, readonly feld: HexFeld) {
    this.ox = -originX;
    this.oz = -originZ;
  }

  toWorld(h: Axial): { x: number; z: number } {
    const w = hexToWorld(h.q, h.r);
    return { x: w.x - this.originX, z: w.z - this.originZ };
  }

  fromWorld(x: number, z: number): Axial {
    return worldToHex(x + this.originX, z + this.originZ);
  }

  /** Index im Spielfeld-Array oder -1 (Kulisse / außerhalb). */
  index(h: Axial): number {
    return this.feld.index(h.q, h.r);
  }
}
