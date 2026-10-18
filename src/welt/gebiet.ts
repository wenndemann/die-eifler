// Gebiete als Kachelbereiche (für die Teilen-Version, tools/build_share.mjs): welche Raster- und Hex-Kacheln
// gehören zu einem Gebiet? Reine Logik, ohne Browser, deshalb getestet (tests/gebiet.test.ts).
import { HEX, KACHEL, type Manifest } from './format';

/** Kachelbereich, beide Grenzen eingeschlossen (tx = Spalte, tz = Zeile der 6-km-Raster-Kacheln). */
export interface KachelBereich { tx0: number; tx1: number; tz0: number; tz1: number }

/**
 * Benannte Gebiete. ACHTUNG: gleiche Bereiche wie GEBIETE in tools/map/welt.py (von tools/map/setup.py benutzt):
 * nordeifel = tx 5..10 / tz 0..7, nideggen = tx 8..10 / tz 3..5. Ändert sich dort etwas, hier nachziehen.
 */
export const GEBIETE: Record<string, KachelBereich> = {
  nordeifel: { tx0: 5, tx1: 10, tz0: 0, tz1: 7 },
  nideggen: { tx0: 8, tx1: 10, tz0: 3, tz1: 5 },
};

/**
 * `nordeifel`, `nideggen`, `alle` (= null: alles aus dem Manifest) oder `tx0-tx1,tz0-tz1` (z. B. `5-10,0-7`).
 * Wirft bei unbekannten Namen oder kaputten Zahlen eine Fehlermeldung auf Deutsch.
 */
export function parseGebiet(text: string): KachelBereich | null {
  const t = text.trim().toLowerCase();
  if (t === 'alle') return null;
  if (GEBIETE[t]) return { ...GEBIETE[t] };
  const m = /^(\d+)-(\d+),(\d+)-(\d+)$/.exec(t);
  if (!m) throw new Error(`Unbekanntes Gebiet „${text}“ (erlaubt: ${Object.keys(GEBIETE).join(', ')}, alle oder tx0-tx1,tz0-tz1)`);
  const [tx0, tx1, tz0, tz1] = m.slice(1).map(Number);
  if (tx0 > tx1 || tz0 > tz1) throw new Error(`Gebiet „${text}“: Anfang muss vor dem Ende liegen`);
  return { tx0, tx1, tz0, tz1 };
}

/** Hex-Kacheln (hx, hz), die die Raster-Kachel (tx, tz) abdecken – mit einem Hex Rand, damit nichts fehlt. */
export function hexKachelnZuRasterKachel(tx: number, tz: number): [number, number][] {
  const K = KACHEL.m, W = Math.sqrt(3) * HEX.R, Z = 1.5 * HEX.R;
  const r0 = Math.max(0, Math.floor((tz * K) / Z) - 1), r1 = Math.min(HEX.rows - 1, Math.ceil(((tz + 1) * K) / Z) + 1);
  const c0 = Math.max(0, Math.floor((tx * K) / W) - 1), c1 = Math.min(HEX.cols - 1, Math.ceil(((tx + 1) * K) / W) + 1);
  const out: [number, number][] = [];
  for (let hz = Math.floor(r0 / HEX.tile); hz <= Math.floor(r1 / HEX.tile); hz++) {
    for (let hx = Math.floor(c0 / HEX.tile); hx <= Math.floor(c1 / HEX.tile); hx++) out.push([hx, hz]);
  }
  return out;
}

type ManifestKacheln = Pick<Manifest, 'kacheln'> & { hex: Pick<Manifest['hex'], 'kacheln'> };

/**
 * Alle Kacheln eines Gebiets, die im Manifest stehen: Raster-Kacheln (r10, r40, vec) und die Hex-Kacheln,
 * die diese Raster-Kacheln abdecken. bereich = null: alles aus dem Manifest.
 * Schlüssel wie in build_share: „tx_tz“ bzw. „hx_hz“.
 */
export function gebietsKacheln(manifest: ManifestKacheln, bereich: KachelBereich | null): { raster: Set<string>; hex: Set<string> } {
  const raster = new Set<string>(), hex = new Set<string>();
  const imManifestH = new Set(manifest.hex.kacheln.map(([x, z]) => `${x}_${z}`));
  if (!bereich) {
    for (const [x, z] of manifest.kacheln) raster.add(`${x}_${z}`);
    for (const [x, z] of manifest.hex.kacheln) hex.add(`${x}_${z}`);
    return { raster, hex };
  }
  for (const [tx, tz] of manifest.kacheln) {
    if (tx < bereich.tx0 || tx > bereich.tx1 || tz < bereich.tz0 || tz > bereich.tz1) continue;
    raster.add(`${tx}_${tz}`);
    for (const [hx, hz] of hexKachelnZuRasterKachel(tx, tz)) if (imManifestH.has(`${hx}_${hz}`)) hex.add(`${hx}_${hz}`);
  }
  return { raster, hex };
}
