// Gedränge auflösen (Gutachter: „Figuren stecken ineinander“): reine Darstellung. Stehende Figuren werden auseinandergeschoben, laufende
// kaum; Meister vor den Gebäuden und Träger melden ihre Plätze, damit Boten und Träger ihnen ausweichen (Werte vom letzten Bild).
// Die Simulation merkt davon nichts.

export interface Platz { x: number; z: number; r: number; fest: boolean }

/** Plätze der Meister (leben.ts) und der Träger (traeger.ts) aus dem letzten Bild. */
export const meisterPlaetze: Platz[] = [];
export const traegerPlaetze: Platz[] = [];

/**
 * Schiebt die beweglichen Plätze so lange auseinander, bis sich keine zwei näher als die Summe ihrer Radien kommen (zwei Durchgänge
 * reichen fürs Bild). Feste Plätze (Meister, Figuren anderer Darsteller) bewegen sich nicht; laufende Figuren weichen nur halb aus.
 * Rasterzelle = größter Durchmesser, damit nur Nachbarn verglichen werden.
 */
export function entzerren(beweglich: Platz[], fest: readonly Platz[], lauf: readonly boolean[] = []): void {
  let rmax = 1;
  for (const p of beweglich) rmax = Math.max(rmax, p.r);
  for (const p of fest) rmax = Math.max(rmax, p.r);
  const zelle = 2 * rmax;
  const key = (x: number, z: number) => `${Math.floor(x / zelle)},${Math.floor(z / zelle)}`;
  for (let runde = 0; runde < 2; runde++) {
    const raster = new Map<string, number[]>();
    const alle = [...beweglich, ...fest];
    alle.forEach((p, i) => { const k = key(p.x, p.z); (raster.get(k) ?? raster.set(k, []).get(k)!).push(i); });
    for (let i = 0; i < beweglich.length; i++) {
      const a = beweglich[i];
      const cx = Math.floor(a.x / zelle), cz = Math.floor(a.z / zelle);
      for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
        for (const j of raster.get(`${cx + dx},${cz + dz}`) ?? []) {
          if (j === i) continue;
          const b = alle[j];
          let ex = a.x - b.x, ez = a.z - b.z;
          let d = Math.hypot(ex, ez);
          const soll = a.r + b.r;
          if (d >= soll) continue;
          if (d < 1e-3) { ex = Math.cos(i * 2.4); ez = Math.sin(i * 2.4); d = 1; } else { ex /= d; ez /= d; }
          // beide beweglich: jeder die Hälfte; gegen Feste allein; laufende nur halb so viel
          const anteil = (j < beweglich.length ? 0.5 : 1) * (lauf[i] ? 0.5 : 1);
          const schub = (soll - Math.min(d, soll)) * anteil;
          a.x += ex * schub; a.z += ez * schub;
        }
      }
    }
  }
}
