// Pfadsuche (A* mit Ganzzahl-Kosten) und Min-Heap über Ganzzahlen.
import { SCHRITT_EBENE } from './daten';
import type { SimKarte } from './karte';

/** Min-Heap über Ganzzahlen (Schlüssel kodieren Kosten und Index, damit Gleichstände deterministisch sind). */
export class ZahlenHeap {
  private a: number[] = [];
  get size() { return this.a.length; }

  push(v: number) {
    const a = this.a;
    let i = a.length;
    a.push(v);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (a[p] <= v) break;
      a[i] = a[p]; i = p;
    }
    a[i] = v;
  }

  pop(): number {
    const a = this.a;
    const top = a[0];
    const last = a.pop()!;
    const n = a.length;
    if (n > 0) {
      let i = 0;
      for (;;) {
        let c = 2 * i + 1;
        if (c >= n) break;
        if (c + 1 < n && a[c + 1] < a[c]) c++;
        if (a[c] >= last) break;
        a[i] = a[c]; i = c;
      }
      a[i] = last;
    }
    return top;
  }
}

const K = 1 << 20;

/**
 * Kürzeste Laufzeit von `von` nach `nach` über Hexe, die `frei(hex, istZiel)` zulässt; höchstens `maxSchritte` Schritte.
 * Gleichstand: kleinerer Index zuerst, bei gleichen Kosten der Vorgänger mit kleinerem Index. Ergebnis: Hex-Indizes.
 */
export function sucheWeg(karte: SimKarte, von: number, nach: number, frei: (hex: number, istZiel: boolean) => boolean, maxSchritte: number): number[] | null {
  if (von === nach) return null;
  const g = new Int32Array(karte.count).fill(-1);
  const elter = new Int32Array(karte.count).fill(-1);
  const tiefe = new Int32Array(karte.count);
  const zu = new Uint8Array(karte.count);
  const heap = new ZahlenHeap();
  g[von] = 0;
  heap.push(karte.abstand(von, nach) * SCHRITT_EBENE * K + von);
  while (heap.size > 0) {
    const key = heap.pop();
    const u = key % K;
    if (zu[u]) continue;
    zu[u] = 1;
    if (u === nach) {
      const weg: number[] = [];
      for (let h = nach; h !== -1; h = elter[h]) weg.push(h);
      return weg.reverse();
    }
    for (let k = 0; k < 6; k++) {
      const v = karte.nachbarn[u * 6 + k];
      if (v < 0 || zu[v] || !karte.begehbar[v] || !frei(v, v === nach)) continue;
      const t = tiefe[u] + 1;
      if (t + karte.abstand(v, nach) > maxSchritte) continue;
      const ng = g[u] + karte.schritt(u, v);
      if (g[v] === -1 || ng < g[v] || (ng === g[v] && u < elter[v])) {
        g[v] = ng; elter[v] = u; tiefe[v] = t;
        heap.push((ng + karte.abstand(v, nach) * SCHRITT_EBENE) * K + v);
      }
    }
  }
  return null;
}
