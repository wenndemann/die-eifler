// Verbindung zum Vermittlungs-Server (server/vermittlung.mjs): Raum anlegen oder per Einladungscode beitreten, Lobby-Zustand,
// Weiterleitung der WebRTC-Verbindungsdaten. Bricht die Verbindung ab, verbindet sie sich selbst neu und meldet sich mit dem Token
// auf demselben Platz zurück.

export interface RaumSpieler { platz: number; name: string; da: boolean; pruefsumme: string; /** steigt bei jedem Verbinden (Neuladen) */ sitzung: number }
export interface RaumSicht {
  code: string; gastgeber: number; taktgeber: number; gestartet: boolean;
  einstellungen: unknown;
  /** Index = Platz; null = frei (nur vor dem Start). */
  spieler: (RaumSpieler | null)[];
}

const TOKEN = (code: string) => `eifeler.raum.${code}`;
export const NAME_SPEICHER = 'eifeler.name';

/** Gespeicherten Wert lesen/schreiben; ohne Speicher (privates Fenster) einfach nichts. */
export function speicher(key: string, wert?: string): string | null {
  try {
    if (wert === undefined) return localStorage.getItem(key);
    localStorage.setItem(key, wert);
  } catch { /* kein Speicher */ }
  return wert ?? null;
}

/** Adresse des Vermittlungs-Servers: ?vm=… / #…&vm=…, VITE_VERMITTLUNG, sonst dieselbe Seite unter /vermittlung. */
export function vermittlungsAdresse(): string {
  const aus = new URLSearchParams(location.hash.slice(1)).get('vm') ?? new URLSearchParams(location.search).get('vm')
    ?? (import.meta.env.VITE_VERMITTLUNG as string | undefined);
  if (aus) return aus;
  return `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/vermittlung`;
}

export class Vermittlung {
  private ws: WebSocket | null = null;
  private code = '';
  private token = '';
  private name = '';
  private zu = false;
  private versuche = 0;
  du = -1;
  raum: RaumSicht | null = null;
  ice: RTCIceServer[] = [];
  onRaum: ((r: RaumSicht) => void) | null = null;
  onStart: ((du: number, r: RaumSicht) => void) | null = null;
  onSignal: ((von: number, daten: unknown) => void) | null = null;
  onFehler: ((text: string) => void) | null = null;
  onVerbindung: ((da: boolean) => void) | null = null;

  constructor(private url = vermittlungsAdresse()) {}

  get raumCode(): string { return this.code; }

  /** Raum anlegen (Gastgeber). */
  anlegen(name: string): Promise<RaumSicht> { this.name = name; return this.verbinden({ typ: 'anlegen', name }); }

  /** Beitreten; mit gespeichertem Token kommt man auf seinen alten Platz zurück. */
  beitreten(code: string, name: string): Promise<RaumSicht> {
    this.code = code.toUpperCase(); this.name = name;
    this.token = speicher(TOKEN(this.code)) ?? '';
    return this.verbinden({ typ: 'beitreten', code: this.code, name, token: this.token || undefined });
  }

  einstellungen(daten: unknown, neueKarte = false): void { this.sende({ typ: 'einstellungen', daten, neueKarte }); }
  pruefsumme(wert: string): void { this.sende({ typ: 'pruefsumme', wert }); }
  umbenennen(name: string): void { this.name = name; this.sende({ typ: 'name', name }); }
  start(): void { this.sende({ typ: 'start' }); }
  signal(an: number, daten: unknown): void { this.sende({ typ: 'signal', an, daten }); }
  schliessen(): void { this.zu = true; this.ws?.close(); }

  private sende(n: object): void { if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(n)); }

  private verbinden(erste: object): Promise<RaumSicht> {
    return new Promise((ok, fehler) => {
      let beantwortet = false;
      const ws = new WebSocket(this.url);
      this.ws = ws;
      ws.onopen = () => { this.versuche = 0; ws.send(JSON.stringify(erste)); this.onVerbindung?.(true); };
      ws.onmessage = (e) => {
        let n: { typ: string; [k: string]: unknown };
        try { n = JSON.parse(String(e.data)); } catch { return; }
        switch (n.typ) {
          case 'raum':
            this.du = n.du as number; this.code = n.code as string; this.token = n.token as string; this.ice = (n.ice as RTCIceServer[]) ?? [];
            speicher(TOKEN(this.code), this.token);
            this.raum = n.raum as RaumSicht;
            if (!beantwortet) { beantwortet = true; ok(this.raum); }
            this.onRaum?.(this.raum);
            return;
          case 'zustand': this.raum = n.raum as RaumSicht; this.onRaum?.(this.raum); return;
          case 'start': this.du = n.du as number; this.raum = n.raum as RaumSicht; this.onStart?.(this.du, this.raum); this.onRaum?.(this.raum); return;
          case 'signal': this.onSignal?.(n.von as number, n.daten); return;
          case 'fehler':
            if (!beantwortet) { beantwortet = true; this.zu = true; fehler(new Error(n.text as string)); } else this.onFehler?.(n.text as string);
            return;
        }
      };
      ws.onerror = () => { if (!beantwortet) { beantwortet = true; fehler(new Error(`Vermittlungs-Server nicht erreichbar (${this.url}).`)); } };
      ws.onclose = () => {
        if (this.ws !== ws) return;
        this.onVerbindung?.(false);
        if (this.zu || !this.code || !this.token) return;
        // neu verbinden, mit Token auf denselben Platz
        const warte = Math.min(5000, 500 * 2 ** this.versuche++);
        setTimeout(() => { if (!this.zu) void this.verbinden({ typ: 'beitreten', code: this.code, name: this.name, token: this.token }).catch(() => undefined); }, warte);
      };
    });
  }
}
