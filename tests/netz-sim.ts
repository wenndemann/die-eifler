// Testaufbau für den Gleichschritt ohne Browser: mehrere Partien, verbunden über ein simuliertes Netz mit Verzögerung, Schwankung
// und Stau (wie ein zuverlässiger, geordneter WebRTC-Kanal bei schlechtem Netz: nichts geht verloren, aber manches kommt spät).
import { Partie, type Nachricht, type PartieOptionen } from '../src/netz/partie';
import { Simulation } from '../src/sim/sim';
import type { KarteDaten, StartDaten } from '../src/sim/typen';
import mp from '../data/mehrspieler.json';

export interface NetzArt { verzoegerung_ms: number; schwankung_ms: number; stau_prozent: number; stau_ms: number }
export const GUT: NetzArt = { verzoegerung_ms: 5, schwankung_ms: 0, stau_prozent: 0, stau_ms: 0 };
export const SCHLECHT: NetzArt = mp.netz.schlecht;

/** Kleiner Ganzzahl-Zufall für das Netz (unabhängig von der Simulation). */
function zufall(saat: number) {
  let s = saat | 0;
  return () => { s = (Math.imul(s, 1103515245) + 12345) | 0; return ((s >>> 8) & 0xffff) / 0x10000; };
}

interface Paket { an: number; von: number; zeit: number; text: string }

export class Runde {
  uhr = 0;
  readonly partien: (Partie | null)[];
  private pakete: Paket[] = [];
  /** Letzte Ankunftszeit je Richtung (geordnet wie ein Datenkanal). */
  private letzte = new Map<string, number>();
  private verbunden: boolean[][];
  private rnd: () => number;
  /** Mitschnitt: Zahl und Größe der Nachrichten. */
  gesendet = 0;
  bytes = 0;

  constructor(readonly karte: KarteDaten, readonly starts: StartDaten[], public netz: NetzArt = SCHLECHT, saat = 1, readonly kartePruef = 'karte-test') {
    this.rnd = zufall(saat);
    const n = starts.length;
    this.partien = new Array(n).fill(null);
    this.verbunden = [...Array(n)].map(() => new Array<boolean>(n).fill(false));
  }

  /** Startet Spieler `sp` (neu oder nach dem Neuladen). Der Taktgeber bekommt die Start-Simulation. */
  starte(sp: number, o: Partial<PartieOptionen> = {}): Partie {
    const taktgeber = o.taktgeber ?? 0;
    const p = new Partie({
      ich: sp, spielerZahl: this.starts.length, gastgeber: 0, taktgeber, karte: this.karte, kartePruef: this.kartePruef,
      senden: (an, n) => this.senden(sp, an, n),
      sim: sp === taktgeber ? (o.sim ?? new Simulation(this.karte, 99, this.starts)) : undefined,
      ...o,
    });
    this.partien[sp] = p;
    return p;
  }

  /** Verbindet alle laufenden Partien untereinander (wie der Verbindungsaufbau über den Vermittlungs-Server). */
  verbindeAlle(): void {
    for (let a = 0; a < this.partien.length; a++) for (let b = 0; b < this.partien.length; b++) if (a !== b) this.verbinde(a, b);
  }

  verbinde(a: number, b: number): void {
    if (!this.partien[a] || !this.partien[b] || this.verbunden[a][b]) return;
    this.verbunden[a][b] = this.verbunden[b][a] = true;
    this.partien[a]!.verbindung(b, true);
    this.partien[b]!.verbindung(a, true);
  }

  /** Spieler `sp` ist weg (Seite zu, Netz weg): seine Verbindungen brechen, Pakete an ihn gehen verloren. */
  trenne(sp: number): void {
    for (let x = 0; x < this.partien.length; x++) {
      if (x === sp || !this.verbunden[sp][x]) continue;
      this.verbunden[sp][x] = this.verbunden[x][sp] = false;
      this.partien[x]?.verbindung(sp, false);
    }
    this.partien[sp] = null;
    this.pakete = this.pakete.filter((p) => p.an !== sp && p.von !== sp);
  }

  private senden(von: number, an: number, n: Nachricht): void {
    if (!this.verbunden[von][an]) return;
    const text = JSON.stringify(n); // wie über den Draht
    this.gesendet++; this.bytes += text.length;
    const a = this.netz;
    let d = a.verzoegerung_ms + this.rnd() * a.schwankung_ms;
    if (this.rnd() * 100 < a.stau_prozent) d += a.stau_ms;
    const k = `${von}>${an}`;
    const zeit = Math.max(this.uhr + d, this.letzte.get(k) ?? 0);
    this.letzte.set(k, zeit);
    this.pakete.push({ an, von, zeit, text });
  }

  /** `ms` Millisekunden in Frames von `frameMs` laufen lassen; `jeFrame` nach jedem Frame. */
  lauf(ms: number, jeFrame?: () => void, frameMs = 16): void {
    const ende = this.uhr + ms;
    while (this.uhr < ende) {
      this.uhr += frameMs;
      const faellig = this.pakete.filter((p) => p.zeit <= this.uhr).sort((x, y) => x.zeit - y.zeit);
      if (faellig.length) {
        this.pakete = this.pakete.filter((p) => p.zeit > this.uhr);
        for (const p of faellig) this.partien[p.an]?.empfangen(p.von, JSON.parse(p.text) as Nachricht);
      }
      for (const p of this.partien) p?.vor(frameMs);
      jeFrame?.();
    }
  }

  /** Bis alle laufenden Partien denselben Tick haben (z. B. in der Pause) oder `maxMs` vergangen sind. */
  gleichziehen(maxMs = 20000): void {
    const t0 = this.uhr;
    while (this.uhr - t0 < maxMs) {
      const ticks = this.partien.filter((p) => p?.sim).map((p) => p!.sim!.tick);
      if (ticks.length === this.partien.filter((p) => p).length && ticks.every((t) => t === ticks[0])) return;
      this.lauf(16);
    }
  }
}
