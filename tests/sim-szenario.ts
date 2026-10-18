// Gemeinsame Hilfen für die Simulationstests: synthetische Karte und das 30-Segment-Szenario.
// Darf nur src/sim und reine TS-Logik verwenden (wird später auch im Browser abgespielt).
import { Simulation } from '../src/sim/sim';
import type { Befehl, KarteDaten, Protokoll, ProtokollEintrag } from '../src/sim/typen';

export const KARTE_INFO = { version: 'test', q: 0, r: 0, size: 'klein', pruefsumme: 'synthetisch' };

/** Radius 30 um (0,0): Wiese mit sanften Höhen, Teich bei (-15,8) und (6,14), Fels bei (8,-10), Bahn in Zeile 18, Hang ab q ≥ 10. */
export function baueTestKarte(): KarteDaten {
  const n = 30;
  const count = 3 * n * (n + 1) + 1;
  const k: KarteDaten = {
    q: 0, r: 0, n,
    terrain: new Uint8Array(count), height: new Uint16Array(count), slope: new Uint8Array(count),
    build: new Uint8Array(count), flags: new Uint8Array(count), place: new Uint16Array(count),
  };
  let i = 0;
  const abstand = (q: number, r: number, q2: number, r2: number) => (Math.abs(q - q2) + Math.abs(r - r2) + Math.abs(q - q2 + r - r2)) / 2;
  for (let r = -n; r <= n; r++) {
    for (let q = Math.max(-n, -r - n); q <= Math.min(n, -r + n); q++, i++) {
      let h = 3000 + ((((q * 7 + r * 13) % 8) + 8) % 8) * 4;
      if (q >= 10) h += (q - 9) * 70;
      k.height[i] = h;
      k.terrain[i] = 1;
      k.build[i] = q >= 10 ? 1 : 3;
      if (abstand(q, r, -15, 8) <= 2 || abstand(q, r, 6, 14) <= 1) { k.terrain[i] = 0; k.build[i] = 0; }
      if ((q === 8 && r === -10) || (q === 9 && r === -10) || (q === 8 && r === -9)) { k.terrain[i] = 5; k.build[i] = 0; }
      if (r === 18) { k.flags[i] |= 32; k.build[i] = 0; }
    }
  }
  return k;
}

export const RICHT: readonly [number, number][] = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];

/** Gerader Pfad von (q,r) in Richtung d über `laenge` Schritte (beide Enden eingeschlossen). */
export function gerade(q: number, r: number, d: number, laenge: number): { q: number; r: number }[] {
  const p = [];
  for (let i = 0; i <= laenge; i++) p.push({ q: q + RICHT[d][0] * i, r: r + RICHT[d][1] * i });
  return p;
}

export function eintrag(tick: number, befehl: Befehl): ProtokollEintrag { return { tick, spieler: 0, befehl }; }

/** Gitterknoten (i, j) des Szenarios. */
export const knoten = (i: number, j: number) => ({ q: -6 + 3 * i, r: -6 + 3 * j });

/** 4×4-Gitter, 33 Segmente (12 waagrecht, 12 senkrecht, 9 diagonal), Lager bei (1,1), Teilung und Abriss mittendrin. */
export function baueSzenario30(): { karte: KarteDaten; protokoll: Protokoll } {
  const karte = baueTestKarte();
  const start = knoten(1, 1);
  const be: ProtokollEintrag[] = [];
  const bau = (typ: string, i: number, j: number) => be.push(eintrag(0, { art: 'gebaeude', typ, ...knoten(i, j) }));
  bau('holzfaeller', 0, 0); bau('holzfaeller', 3, 0); bau('holzfaeller', 3, 1);
  bau('steinbruch', 0, 3); bau('steinbruch', 3, 3);
  bau('saegewerk', 2, 2); bau('saegewerk', 1, 2);
  bau('wohnhaus', 2, 1); bau('wohnhaus', 0, 1); bau('wohnhaus', 3, 2);
  for (const [i, j] of [[1, 0], [2, 0], [0, 2], [1, 3], [2, 3]]) be.push(eintrag(0, { art: 'fahne', ...knoten(i, j) }));
  const weg = (a: { q: number; r: number }, d: number) => be.push(eintrag(0, { art: 'weg', pfad: gerade(a.q, a.r, d, 3) }));
  for (let j = 0; j < 4; j++) for (let i = 0; i < 3; i++) weg(knoten(i, j), 0);
  for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) weg(knoten(i, j), 5);
  for (let i = 0; i < 3; i++) for (let j = 1; j < 4; j++) weg(knoten(i, j), 1);
  const ticks = 12000;
  const protokoll: Protokoll = { format: 1, karte: { ...KARTE_INFO }, saat: 4711, start, befehle: be, ticks };
  // Teilung eines Weges bei Tick 2500 (Fahne mitten auf Segment (0,0)-(1,0)).
  be.push(eintrag(2500, { art: 'fahne', q: knoten(0, 0).q + 1, r: knoten(0, 0).r }));
  // Abriss eines senkrechten Segments bei 4000, Wiederaufbau bei 4300. Die Segment-Id kommt aus einem Probelauf.
  const probe = new Simulation(karte, protokoll.saat, start);
  for (const e of be) probe.befehl(e.tick, e.spieler, e.befehl);
  while (probe.tick < 4000) probe.schritt();
  const a = knoten(2, 1), b = knoten(2, 2);
  const seg = probe.sicht().segmente.find((s) => s.pfad[0].q === a.q && s.pfad[0].r === a.r && s.pfad[s.pfad.length - 1].q === b.q && s.pfad[s.pfad.length - 1].r === b.r);
  if (!seg) throw new Error('Segment für Abriss nicht gefunden');
  be.push(eintrag(4000, { art: 'abriss_weg', id: seg.id }));
  be.push(eintrag(4300, { art: 'weg', pfad: gerade(a.q, a.r, 5, 3) }));
  return { karte, protokoll };
}
