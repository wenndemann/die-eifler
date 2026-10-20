// Startplätze im Mehrspieler (Drehbuch 2.3: „jeder startet in einem anderen Ortskern“). Reine Logik: aus den Ortskernen des
// Ausschnitts die Orte (einmal je Name) und eine Verteilung, bei der die Lager möglichst weit auseinanderliegen.
import { hexAbstand, type Hx, type LagerKern } from '../spiel/logik';
import mp from '../../data/mehrspieler.json';

export const START_ABSTAND_MIN = mp.start.abstand_min_hex;

export interface Ort { name: string; q: number; r: number }

/** Orte des Ausschnitts: je Name der erste Kern (wie waehleLagerHex), sortiert nach Name. Kerne ohne Namen fallen weg. */
export function orteAus(kerne: readonly LagerKern[]): Ort[] {
  const m = new Map<string, Ort>();
  for (const k of kerne) if (k.name && !m.has(k.name)) m.set(k.name, { name: k.name, q: k.q, r: k.r });
  return [...m.values()].sort((a, b) => a.name.localeCompare(b.name, 'de'));
}

/**
 * Verteilt `n` Spieler auf Orte: der erste ist `erster` (sonst der Ort am nächsten zur Mitte), jeder weitere der, dessen kleinster
 * Abstand zu den schon gewählten am größten ist (bei Gleichstand der Name zuerst im Alphabet). Gibt es weniger Orte als Spieler,
 * bleiben die übrigen leer ('').
 */
export function verteileStartplaetze(orte: readonly Ort[], n: number, mitte: Hx, erster?: string): string[] {
  const aus: Ort[] = [];
  const frei = orte.slice();
  const nimm = (o: Ort) => { aus.push(o); frei.splice(frei.indexOf(o), 1); };
  const e = erster ? frei.find((o) => o.name === erster) : undefined;
  if (e) nimm(e);
  else if (frei.length) nimm(frei.reduce((b, o) => (hexAbstand(o, mitte) < hexAbstand(b, mitte) ? o : b)));
  while (aus.length < n && frei.length) {
    let best = frei[0], bd = -1;
    for (const o of frei) {
      const d = Math.min(...aus.map((a) => hexAbstand(a, o)));
      if (d > bd) { bd = d; best = o; }
    }
    nimm(best);
  }
  return [...aus.map((o) => o.name), ...new Array<string>(Math.max(0, n - aus.length)).fill('')].slice(0, n);
}

/** Prüft eine Wahl: fehler (doppelt oder fehlend, Start unmöglich) und hinweise (Lager sehr nah beieinander). */
export function pruefeStartplaetze(lager: (Hx | null)[], namen: string[]): { fehler: string[]; hinweise: string[] } {
  const fehler: string[] = [], hinweise: string[] = [];
  namen.forEach((n, i) => { if (!n || !lager[i]) fehler.push(`Spieler ${i + 1} hat keinen Startort.`); });
  for (let i = 0; i < lager.length; i++) {
    for (let j = i + 1; j < lager.length; j++) {
      const a = lager[i], b = lager[j];
      if (!a || !b) continue;
      if (namen[i] === namen[j] || hexAbstand(a, b) === 0) fehler.push(`${namen[i]} ist doppelt gewählt.`);
      else if (hexAbstand(a, b) < START_ABSTAND_MIN) hinweise.push(`${namen[i]} und ${namen[j]} liegen sehr nah beieinander.`);
    }
  }
  return { fehler, hinweise };
}
