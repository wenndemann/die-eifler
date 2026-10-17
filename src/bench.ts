// Leistungsmessung (ROADMAP M1: „60 fps bei Mittel nachweisen“): mit #…&bench=1 startet nach dem Laden ein
// fester Kameraflug von rund 30 s (Übersicht, Schwenk, Tiefflug durchs Tal, Nahansicht Ortskern).
// Danach zeigt ein Feld die Ergebnisse zum Abschreiben/Kopieren; dasselbe liegt in window.eifeler.bench.
import type { RtsCamera } from './render/camera';
import type { Stage } from './render/scene';
import type { MapData } from './map/mapdata';
import { QUALITAET_NAME, type Qualitaet } from './render/qualitaet';

/** Dauer der vier Abschnitte in Sekunden. */
const ABSCHNITTE = [
  { name: 'Übersicht', s: 6 },
  { name: 'Schwenk', s: 6 },
  { name: 'Tiefflug Tal', s: 10 },
  { name: 'Nahansicht Ortskern', s: 8 },
] as const;
export const BENCH_DAUER = ABSCHNITTE.reduce((s, a) => s + a.s, 0);

export interface BenchErgebnis {
  fertig: true;
  qualitaet: string;
  aufloesung: string;
  fpsMittel: number;
  fps1Tief: number;
  frameMsMittel: number;
  frameMsP99: number;
  drawCallsMax: number;
  dreieckeMax: number;
  frames: number;
  dauerS: number;
  abschnitte: { name: string; fps: number; callsMax: number; dreieckeMax: number }[];
  gpu: string;
  daten: string;
  text: string;
}

export interface BenchHost {
  cam: RtsCamera;
  stage: Stage;
  map: MapData;
  /** Spielfeld-Mitte und Start-Ort (Ausschnitt-Meter). */
  mitte: { x: number; z: number };
  start: { x: number; z: number };
  hochDist: number;
  qualitaet: () => Qualitaet;
  daten: string;
  /** Gelände und Wald sofort fertig bauen (vor dem Flug). */
  settle: () => void;
  onFertig: (e: BenchErgebnis) => void;
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const glatt = (t: number) => t * t * (3 - 2 * t);

/** Längster Flusslauf (sonst Bahn) im Spielfeld als Linienzug [x, z, ...]: Strecke für den Tiefflug. */
function talLinie(map: MapData, mitte: { x: number; z: number }): number[] | null {
  const rad = map.ausschnitt.radius * map.info.hex.size * 1.7;
  const innen = (x: number, z: number) => Math.hypot(x - mitte.x, z - mitte.z) < rad * 0.85;
  let best: number[] | null = null, bestLen = 0;
  const quellen: { p: number[]; stride: number }[] = [
    ...map.rivers.map((r) => ({ p: r.p, stride: 3 })),
    ...map.rails.map((r) => ({ p: r.p, stride: 3 })),
  ];
  for (const { p, stride } of quellen) {
    const pts: number[] = [];
    let len = 0;
    for (let i = 0; i < p.length; i += stride) {
      if (!innen(p[i], p[i + 1])) { if (pts.length > 2) break; else { pts.length = 0; len = 0; continue; } }
      if (pts.length) len += Math.hypot(p[i] - pts[pts.length - 2], p[i + 1] - pts[pts.length - 1]);
      pts.push(p[i], p[i + 1]);
    }
    if (len > bestLen) { bestLen = len; best = pts; }
  }
  return bestLen > 1500 ? best : null;
}

export class Bench {
  aktiv = false;
  private t0 = 0;
  private letzte = 0;
  private dts: number[] = [];
  private abschnitt: number[] = [];
  private calls: number[] = [];
  private tris: number[] = [];
  private pfad: { x: number; z: number; s: number }[] = [];
  private pfadLen = 0;
  private yawLauf = 0;

  constructor(private h: BenchHost) {}

  start(now: number) {
    const h = this.h;
    this.dts = []; this.abschnitt = []; this.calls = []; this.tris = [];
    // Tiefflug-Strecke: höchstens 4,5 km aus der Mitte des längsten Laufs
    const lin = talLinie(h.map, h.mitte) ?? [h.mitte.x - 2200, h.mitte.z + 800, h.mitte.x + 2200, h.mitte.z - 800];
    this.pfad = []; let s = 0;
    for (let i = 0; i < lin.length; i += 2) {
      if (i) s += Math.hypot(lin[i] - lin[i - 2], lin[i + 1] - lin[i - 1]);
      this.pfad.push({ x: lin[i], z: lin[i + 1], s });
    }
    this.pfadLen = s;
    this.aktiv = true;
    this.t0 = now;
    this.letzte = 0;
    this.pose(0);
    this.h.settle();
  }

  private pfadPunkt(u: number) {
    const L = Math.min(this.pfadLen, 4500);
    const s0 = (this.pfadLen - L) / 2, sx = s0 + u * L;
    const P = this.pfad;
    let k = 1;
    while (k < P.length - 1 && P[k].s < sx) k++;
    const a = P[k - 1], b = P[k], f = (sx - a.s) / Math.max(1e-6, b.s - a.s);
    return { x: lerp(a.x, b.x, f), z: lerp(a.z, b.z, f), dx: b.x - a.x, dz: b.z - a.z };
  }

  /** Kamera für die Zeit t (Sekunden seit Start) setzen; liefert den Abschnitt. */
  private pose(t: number): number {
    const { cam, mitte, start, hochDist } = this.h;
    let a = 0, t0 = 0;
    while (a < ABSCHNITTE.length - 1 && t >= t0 + ABSCHNITTE[a].s) { t0 += ABSCHNITTE[a].s; a++; }
    const u = Math.min(1, (t - t0) / ABSCHNITTE[a].s);
    cam.pitchOverride = null;
    if (a === 0) {
      cam.jumpTo(mitte.x, mitte.z, hochDist, lerp(0, 0.35, u));
    } else if (a === 1) {
      const e = glatt(u);
      cam.jumpTo(lerp(mitte.x, start.x, e), lerp(mitte.z, start.z, e), Math.exp(lerp(Math.log(hochDist * 0.6), Math.log(6500), e)), lerp(0.35, 1.5, e));
    } else if (a === 2) {
      const p = this.pfadPunkt(u);
      const ziel = Math.atan2(-p.dx, -p.dz);
      // Blickrichtung weich nachführen (kürzester Drehsinn)
      let d = ziel - this.yawLauf;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      this.yawLauf = u === 0 ? ziel : this.yawLauf + d * 0.06;
      cam.pitchOverride = 15;
      cam.jumpTo(p.x, p.z, 900, this.yawLauf);
    } else {
      cam.jumpTo(start.x, start.z, lerp(900, 380, glatt(u)), lerp(1.5, 1.5 + Math.PI * 0.9, u));
    }
    return a;
  }

  /** Vor dem Rendern eines Frames aufrufen. */
  vorFrame(now: number) {
    if (!this.aktiv) return;
    const t = (now - this.t0) / 1000;
    if (t >= BENCH_DAUER) { this.ende(); return; }
    if (this.letzte) this.dts.push(now - this.letzte);
    this.letzte = now;
    this.abschnitt.push(this.pose(t));
  }

  /** Nach dem Rendern: Draw-Calls und Dreiecke des Frames. */
  nachFrame(calls: number, tris: number) {
    if (!this.aktiv) return;
    this.calls.push(calls); this.tris.push(tris);
  }

  private ende() {
    this.aktiv = false;
    const h = this.h;
    const dts = this.dts.length ? this.dts : [1000];
    const sortiert = [...dts].sort((a, b) => a - b);
    const mittel = dts.reduce((s, d) => s + d, 0) / dts.length;
    const p99 = sortiert[Math.min(sortiert.length - 1, Math.floor(sortiert.length * 0.99))];
    const gl = h.stage.renderer.getContext();
    let gpu = 'unbekannt';
    try {
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      gpu = String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
    } catch { /* egal */ }
    const dom = h.stage.renderer.domElement;
    const q = h.qualitaet();
    const abschnitte = ABSCHNITTE.map((ab, k) => {
      const idx: number[] = [];
      this.abschnitt.forEach((a, i) => { if (a === k && i > 0 && i - 1 < dts.length) idx.push(i - 1); });
      const ms = idx.length ? idx.reduce((s, i) => s + dts[i], 0) / idx.length : 0;
      return {
        name: ab.name, fps: ms ? 1000 / ms : 0,
        callsMax: Math.max(0, ...this.abschnitt.map((a, i) => (a === k ? this.calls[i] ?? 0 : 0))),
        dreieckeMax: Math.max(0, ...this.abschnitt.map((a, i) => (a === k ? this.tris[i] ?? 0 : 0))),
      };
    });
    const e: BenchErgebnis = {
      fertig: true,
      qualitaet: QUALITAET_NAME[q],
      aufloesung: `${dom.width}×${dom.height} (Pixelverhältnis ${h.stage.renderer.getPixelRatio().toFixed(2)}, Fenster ${innerWidth}×${innerHeight})`,
      fpsMittel: 1000 / mittel,
      fps1Tief: 1000 / p99,
      frameMsMittel: mittel,
      frameMsP99: p99,
      drawCallsMax: Math.max(...this.calls, 0),
      dreieckeMax: Math.max(...this.tris, 0),
      frames: dts.length,
      dauerS: BENCH_DAUER,
      abschnitte,
      gpu,
      daten: h.daten,
      text: '',
    };
    e.text = [
      `Die Eifeler – Leistungsmessung (${BENCH_DAUER} s Kameraflug)`,
      `Qualität: ${e.qualitaet}`,
      `Auflösung: ${e.aufloesung}`,
      `fps: Mittel ${e.fpsMittel.toFixed(1)} · 1 %-Tief ${e.fps1Tief.toFixed(1)}`,
      `Frame-Zeit: Mittel ${e.frameMsMittel.toFixed(1)} ms · 99. Perzentil ${e.frameMsP99.toFixed(1)} ms (${e.frames} Frames)`,
      `Draw-Calls max ${e.drawCallsMax} · Dreiecke max ${(e.dreieckeMax / 1e6).toFixed(2)} M`,
      ...abschnitte.map((a) => `  ${a.name}: ${a.fps.toFixed(1)} fps · ${a.callsMax} Calls · ${(a.dreieckeMax / 1e6).toFixed(2)} M Dreiecke`),
      `GPU: ${e.gpu}`,
      `Daten: ${e.daten}`,
    ].join('\n');
    h.onFertig(e);
  }
}

/** Ergebnisfeld mit Knöpfen „Kopieren“ und „Schließen“. */
export function zeigeErgebnis(root: HTMLElement, e: BenchErgebnis) {
  const box = document.createElement('div');
  box.className = 'panel benchbox';
  const pre = document.createElement('pre');
  pre.textContent = e.text;
  const zeile = document.createElement('div');
  zeile.className = 'benchbtn';
  const kopieren = document.createElement('button');
  kopieren.type = 'button';
  kopieren.textContent = 'Kopieren';
  kopieren.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(e.text); } catch {
      const ta = document.createElement('textarea');
      ta.value = e.text; document.body.append(ta); ta.select();
      try { document.execCommand('copy'); } catch { /* egal */ }
      ta.remove();
    }
    kopieren.textContent = 'Kopiert';
    setTimeout(() => (kopieren.textContent = 'Kopieren'), 1500);
  });
  const zu = document.createElement('button');
  zu.type = 'button';
  zu.textContent = 'Schließen';
  zu.addEventListener('click', () => box.remove());
  zeile.append(kopieren, zu);
  const h = document.createElement('h3');
  h.textContent = 'Leistungsmessung';
  box.append(h, pre, zeile);
  root.append(box);
  return box;
}

