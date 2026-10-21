// Kerngebiete der 10 Völkchen (data/regions.json: kerngebiet.mitte, radius_km) in Weltmetern, für die Kartenwahl und die Kampagne.
// Die gleichen Kreise nimmt tools/map/welt.py für die Weltdaten-Gebiete der Völkchen.
import regionen from '../../data/regions.json';
import { WELT } from './format';

/** WGS84 (lon, lat) → EPSG:25832 (Ost, Nord), auf Meter genau genug für Kreise auf der Karte. */
export function utm32(lon: number, lat: number): { ost: number; nord: number } {
  const a = 6378137, f = 1 / 298.257223563, k0 = 0.9996, e2 = f * (2 - f), ep2 = e2 / (1 - e2);
  const phi = (lat * Math.PI) / 180, lam = (lon * Math.PI) / 180;
  const n = a / Math.sqrt(1 - e2 * Math.sin(phi) ** 2), t = Math.tan(phi) ** 2, c = ep2 * Math.cos(phi) ** 2;
  const aa = Math.cos(phi) * (lam - (9 * Math.PI) / 180);
  const m = a * ((1 - e2 / 4 - (3 * e2 ** 2) / 64 - (5 * e2 ** 3) / 256) * phi - ((3 * e2) / 8 + (3 * e2 ** 2) / 32 + (45 * e2 ** 3) / 1024) * Math.sin(2 * phi)
    + ((15 * e2 ** 2) / 256 + (45 * e2 ** 3) / 1024) * Math.sin(4 * phi) - ((35 * e2 ** 3) / 3072) * Math.sin(6 * phi));
  const ost = k0 * n * (aa + ((1 - t + c) * aa ** 3) / 6 + ((5 - 18 * t + t * t + 72 * c - 58 * ep2) * aa ** 5) / 120) + 500000;
  const nord = k0 * (m + n * Math.tan(phi) * ((aa * aa) / 2 + ((5 - t + 9 * c + 4 * c * c) * aa ** 4) / 24 + ((61 - 58 * t + t * t + 600 * c - 330 * ep2) * aa ** 6) / 720));
  return { ost, nord };
}

export interface VoelkchenGebiet { id: string; name: string; erzaehler: string; farbe: string; x: number; z: number; r: number }

interface RegionJson { id: string; name: string; farbe?: string; erzaehler: { name: string }; kerngebiet: { mitte?: [number, number]; radius_km?: number } }

/** Kerngebiete in Weltmetern (x Osten ab WELT.E0, z Süden ab WELT.N0), Radius in Metern. */
export const VOELKCHEN_GEBIETE: readonly VoelkchenGebiet[] = (regionen.voelkchen as unknown as RegionJson[])
  .filter((v) => v.kerngebiet.mitte && v.kerngebiet.radius_km)
  .map((v) => {
    const p = utm32(v.kerngebiet.mitte![0], v.kerngebiet.mitte![1]);
    return { id: v.id, name: v.name, erzaehler: v.erzaehler.name, farbe: v.farbe ?? '#e7c27a', x: p.ost - WELT.E0, z: WELT.N0 - p.nord, r: v.kerngebiet.radius_km! * 1000 };
  });

/** Kerngebiet, in dem ein Weltpunkt liegt (bei Überlappung das, dessen Mitte am nächsten ist), sonst null. */
export function gebietBei(x: number, z: number): VoelkchenGebiet | null {
  let best: VoelkchenGebiet | null = null, bd = Infinity;
  for (const g of VOELKCHEN_GEBIETE) {
    const d = Math.hypot(x - g.x, z - g.z) / g.r;
    if (d <= 1 && d < bd) { bd = d; best = g; }
  }
  return best;
}
