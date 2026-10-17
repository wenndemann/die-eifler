// Prüfsumme über die Simulationsdaten eines Ausschnitts (FORMAT.md): FNV-1a 32 Bit zweimal, nur Ganzzahlen.

const PRIME = 0x01000193;

export class Fnv2 {
  private a = 0x811c9dc5;
  private b = 0x050c5d1f;

  byte(v: number) {
    v &= 255;
    this.a = Math.imul(this.a ^ v, PRIME) >>> 0;
    this.b = Math.imul(this.b ^ v, PRIME) >>> 0;
  }

  text(s: string) {
    for (const v of new TextEncoder().encode(s)) this.byte(v);
  }

  hex(): string {
    return (this.a >>> 0).toString(16).padStart(8, '0') + (this.b >>> 0).toString(16).padStart(8, '0');
  }
}

/** Ein Hex in Feldreihenfolge von FORMAT.md. */
export interface HexWerte { terrain: number; height: number; slope: number; build: number; flags: number; country: number; place: number }

export function pruefsumme(version: string, q: number, r: number, radius: number, hexe: Iterable<HexWerte>): string {
  const f = new Fnv2();
  f.text(`${version}|${q}|${r}|${radius}`);
  for (const h of hexe) {
    f.byte(h.terrain);
    f.byte(h.height & 255); f.byte(h.height >> 8);
    f.byte(h.slope); f.byte(h.build); f.byte(h.flags); f.byte(h.country);
    f.byte(h.place & 255); f.byte(h.place >> 8);
  }
  return f.hex();
}
