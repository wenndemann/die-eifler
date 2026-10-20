// Einstellungen (ROADMAP M7, DESIGN §9.1): Oberfläche, Steuerung und Spiel; die Grafik liegt weiter bei den Ansichts-Einstellungen
// des HUD (eifeler.view). Alles nur im Browser des Spielers, nie in der Simulation.

export interface Einstellungen {
  /** UI-Größe in Prozent (80–150). */
  uiGroesse: number;
  /** Farbenblind-Modus für die Warenfarben (wirkt nach dem Neuladen auf die Modelle). */
  farbenblind: boolean;
  /** Kamera-Tempo in Prozent (Verschieben und Drehen mit Tasten). */
  kameraTempo: number;
  /** Autosave an (data/dorf.json: autosave.takt_min). */
  autosave: boolean;
  /** Tipps der Erzählfigur in den ersten Minuten. */
  tipps: boolean;
}

export const EINSTELLUNGEN_SPEICHER = 'eifeler.einstellungen';
export const STANDARD: Einstellungen = { uiGroesse: 100, farbenblind: false, kameraTempo: 100, autosave: true, tipps: true };

const zahl = (v: unknown, min: number, max: number, def: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, Math.round(v))) : def);

/** Gelesene Einstellungen (fehlende oder kaputte Werte → Standard). */
export function leseEinstellungen(text: string | null): Einstellungen {
  let d: Partial<Einstellungen> = {};
  try { d = (JSON.parse(text ?? '{}') ?? {}) as Partial<Einstellungen>; } catch { d = {}; }
  return {
    uiGroesse: zahl(d.uiGroesse, 80, 150, STANDARD.uiGroesse),
    farbenblind: typeof d.farbenblind === 'boolean' ? d.farbenblind : STANDARD.farbenblind,
    kameraTempo: zahl(d.kameraTempo, 25, 300, STANDARD.kameraTempo),
    autosave: typeof d.autosave === 'boolean' ? d.autosave : STANDARD.autosave,
    tipps: typeof d.tipps === 'boolean' ? d.tipps : STANDARD.tipps,
  };
}

export function ladeEinstellungen(): Einstellungen {
  try { return leseEinstellungen(localStorage.getItem(EINSTELLUNGEN_SPEICHER)); } catch { return { ...STANDARD }; }
}

export function speichereEinstellungen(e: Einstellungen): void {
  try { localStorage.setItem(EINSTELLUNGEN_SPEICHER, JSON.stringify(e)); } catch { /* egal */ }
}

/** UI-Größe auf die Seite anwenden (CSS-Variable --ui-zoom, die die Oberflächen-Teile als zoom nutzen). */
export function wendeAn(e: Einstellungen): void {
  document.documentElement.style.setProperty('--ui-zoom', String(e.uiGroesse / 100));
}
