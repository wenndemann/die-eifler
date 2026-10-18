// Bauleiste unten (Weg, Fahne, fünf Gebäude, Abriss) mit Hinweiszeile und Knöpfen „Bauen“/„Abbrechen“,
// dazu die schmale Statusleiste oben links (Tempo, Spielzeit, Träger, Lagervorrat, Prüfsumme).
// Reine HTML-Oberfläche: kennt weder Simulation noch Szene, meldet nur Bedienung zurück.

import './spielleiste.css';
export type Werkzeug = 'keins' | 'weg' | 'fahne' | 'holzfaeller' | 'foerster' | 'saegewerk' | 'steinbruch' | 'huette' | 'abriss';

export interface WerkzeugInfo { id: Werkzeug; taste: string; label: string; icon: string; titel: string }

export const WERKZEUGE: readonly WerkzeugInfo[] = [
  { id: 'weg', taste: '1', label: 'Weg', icon: '🛤️', titel: 'Weg bauen: Fahne als Start wählen, dann das Ziel. Weitere Wege schließen sich an.' },
  { id: 'fahne', taste: '2', label: 'Fahne', icon: '🚩', titel: 'Freie Fahne setzen (auch mitten auf einen Weg, das teilt ihn)' },
  { id: 'holzfaeller', taste: '3', label: 'Holzfäller', icon: '🪓', titel: 'Holzfäller: fällt Bäume im Umkreis von 2 Hexen (2 Bretter)' },
  { id: 'foerster', taste: '4', label: 'Förster', icon: '🌱', titel: 'Förster: pflanzt Bäume im Umkreis von 2 Hexen (1 Brett)' },
  { id: 'saegewerk', taste: '5', label: 'Sägewerk', icon: '🪚', titel: 'Sägewerk: macht aus Stämmen Bretter, mittlerer Bauplatz (2 Bretter, 1 Stein)' },
  { id: 'steinbruch', taste: '6', label: 'Steinbruch', icon: '⛏️', titel: 'Steinbruch: haut Felsen im Umkreis von 2 Hexen ab (2 Bretter)' },
  { id: 'huette', taste: '7', label: 'Hütte', icon: '🏠', titel: 'Eifeler Hütte: Wohnraum für 8 (3 Bretter, 2 Steine)' },
  { id: 'abriss', taste: 'X', label: 'Abriss', icon: '🔨', titel: 'Abriss: Gebäude, Fahne oder Weg anklicken (Entf oder X). Das Lager bleibt stehen.' },
];

export interface StatusDaten {
  tick: number;
  freieTraeger: number;
  /** Vorrat im Lager je Warenart (Index = Warenart, siehe WAREN in src/sim/daten.ts). */
  vorrat: number[];
  pruefsumme: string;
}

export interface LeistenAufrufe {
  onWerkzeug(w: Werkzeug): void;
  onBestaetigen(): void;
  onAbbrechen(): void;
  /** 0 = Pause umschalten, sonst Tempo 1..3 setzen. */
  onTempo(t: number): void;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, html = ''): HTMLElementTagNameMap[K] {
  const d = document.createElement(tag);
  d.className = cls;
  if (html) d.innerHTML = html;
  return d;
}

/** Spielzeit mm:ss aus Ticks (20 je Sekunde). */
export function zeitText(tick: number, hz = 20): string {
  const s = Math.floor(tick / hz);
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

export class Spielleiste {
  private leiste = el('div', 'spielleiste');
  private hinweis = el('div', 'hinweis');
  private hinweisText = el('span', 'text');
  private bauen = el('button', 'aktion bauen', 'Bauen');
  private abbrechen = el('button', 'aktion abbrechen', 'Abbrechen');
  private knoepfe = new Map<Werkzeug, HTMLButtonElement>();
  private status = el('div', 'panel spielstatus');
  private tempoKnoepfe = new Map<number, HTMLButtonElement>();
  private zeit = el('span', 'zeit');
  private zeile2 = el('div', 'zeile2');
  private letzteStatus = '';

  constructor(root: HTMLElement, auf: LeistenAufrufe) {
    // Hinweiszeile mit Knöpfen
    this.bauen.type = 'button'; this.abbrechen.type = 'button';
    this.bauen.addEventListener('click', () => { auf.onBestaetigen(); this.bauen.blur(); });
    this.abbrechen.addEventListener('click', () => { auf.onAbbrechen(); this.abbrechen.blur(); });
    this.hinweis.append(this.hinweisText, this.bauen, this.abbrechen);
    // Werkzeugreihe
    const reihe = el('div', 'panel werkzeuge');
    for (const w of WERKZEUGE) {
      const b = el('button', 'werkzeug', `<span class="ic">${w.icon}</span><span class="lb">${w.label}</span><kbd>${w.taste}</kbd>`);
      b.type = 'button';
      b.dataset.w = w.id;
      b.title = `${w.titel} [${w.taste}]`;
      b.addEventListener('click', () => { auf.onWerkzeug(w.id); b.blur(); });
      this.knoepfe.set(w.id, b);
      reihe.append(b);
    }
    this.leiste.append(this.hinweis, reihe);
    root.append(this.leiste);

    // Statusleiste
    const z1 = el('div', 'zeile1');
    const tempo: [number, string, string][] = [[0, '❚❚', 'Pause (Leertaste)'], [1, '1×', 'Tempo 1× (−)'], [2, '2×', 'Tempo 2×'], [3, '3×', 'Tempo 3× (+)']];
    for (const [t, text, titel] of tempo) {
      const b = el('button', 'tempo', text);
      b.type = 'button'; b.title = titel; b.dataset.t = String(t);
      b.addEventListener('click', () => { auf.onTempo(t); b.blur(); });
      this.tempoKnoepfe.set(t, b);
      z1.append(b);
    }
    z1.append(this.zeit);
    this.status.append(z1, this.zeile2);
    root.append(this.status);
    this.setHinweis(null);
    this.setAktionen(null, false);
  }

  setWerkzeug(w: Werkzeug) {
    for (const [id, b] of this.knoepfe) b.classList.toggle('an', id === w);
  }

  /** Hinweiszeile über der Leiste; null blendet den Text aus. */
  setHinweis(text: string | null, warn = false) {
    this.hinweisText.textContent = text ?? '';
    this.hinweis.classList.toggle('warn', warn);
    this.hinweisZeigen();
  }

  /** „Bauen“-Knopf (Text oder null = weg; `aus` = sichtbar, aber nicht tippbar) und „Abbrechen“-Knopf. */
  setAktionen(bauenText: string | null, abbrechenSichtbar: boolean, aus = false) {
    this.bauen.style.display = bauenText ? 'block' : 'none';
    if (bauenText) this.bauen.textContent = bauenText;
    this.bauen.disabled = aus;
    this.abbrechen.style.display = abbrechenSichtbar ? 'block' : 'none';
    this.hinweisZeigen();
  }

  private hinweisZeigen() {
    const da = !!this.hinweisText.textContent || this.bauen.style.display === 'block' || this.abbrechen.style.display === 'block';
    this.hinweis.style.display = da ? '' : 'none';
    this.hoeheMelden();
  }

  setTempo(tempo: number, pausiert: boolean) {
    for (const [t, b] of this.tempoKnoepfe) b.classList.toggle('an', t === 0 ? pausiert : !pausiert && t === tempo);
  }

  setStatus(s: StatusDaten) {
    const [stamm, brett, stein] = s.vorrat;
    const kartoffeln = s.vorrat[6] ?? 0;
    const sig = `${s.tick >> 4}|${s.freieTraeger}|${s.vorrat.join(',')}|${s.pruefsumme}`;
    this.zeit.textContent = `${zeitText(s.tick)} · Tick ${s.tick}`;
    if (sig === this.letzteStatus) return;
    this.letzteStatus = sig;
    this.zeile2.innerHTML = `Träger frei <b>${s.freieTraeger}</b> · Lager: Stamm <b>${stamm}</b> · Brett <b>${brett}</b> · Stein <b>${stein}</b> · Kartoffeln <b>${kartoffeln}</b>` +
      ` · Sim <i class="simsumme" title="Prüfsumme des Spielzustands">${s.pruefsumme.slice(0, 8)}</i>`;
  }

  /** Höhe der Leiste in eine CSS-Variable schreiben, damit Info-Feld und Minimap darüber bleiben (Handy). */
  private hoeheMelden() {
    const h = Math.ceil(this.leiste.getBoundingClientRect().height);
    document.documentElement.style.setProperty('--leiste-h', `${h}px`);
  }
}
