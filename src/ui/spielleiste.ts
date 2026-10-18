// Bauleiste unten (Weg, Fahne, „Bauen“-Menü, Abriss) mit Hinweiszeile und Knöpfen „Bauen“/„Abbrechen“, dem Baumenü
// (Gebäude nach Gruppe aus den Daten), der Gebäudekarte (Zustand, Bedarf, Priorität) und der schmalen Statusleiste
// oben links (Tempo, Spielzeit, Träger, Lagervorrat, Prüfsumme).
// Reine HTML-Oberfläche: kennt weder Simulation noch Szene, meldet nur Bedienung zurück.

import './spielleiste.css';

/** 'keins', 'weg', 'fahne', 'abriss' oder die Id eines Gebäudetyps aus data/buildings.json. */
export type Werkzeug = string;

export interface WerkzeugInfo { id: Werkzeug; taste: string; label: string; icon: string; titel: string }

/** Knöpfe der Leiste; „menue“ öffnet das Baumenü (Gebäude kommen aus den Daten). */
export const WERKZEUGE: readonly WerkzeugInfo[] = [
  { id: 'weg', taste: '1', label: 'Weg', icon: '🛤️', titel: 'Weg bauen: Fahne als Start wählen, dann Hex für Hex oder über Zwischenpunkte führen; Fahne oder Weg anklicken baut. Rücktaste nimmt den letzten Punkt zurück.' },
  { id: 'fahne', taste: '2', label: 'Fahne', icon: '🚩', titel: 'Freie Fahne setzen (auch mitten auf einen Weg, das teilt ihn)' },
  { id: 'menue', taste: 'B', label: 'Bauen', icon: '🏗️', titel: 'Baumenü: Gebäude wählen (Zifferntasten ab 3 wählen direkt, P zeigt die Bauplätze)' },
  { id: 'abriss', taste: 'X', label: 'Abriss', icon: '🔨', titel: 'Abriss: Gebäude, Fahne oder Weg anklicken (Entf oder X). Das Lager bleibt stehen.' },
];

/** Ein Gebäude im Baumenü (aus GEBAEUDE gebaut). */
export interface MenueEintrag {
  id: string; symbol: string; name: string; spruch: string;
  /** Kosten als Text („2 🪵 Bretter · 1 🪨 Stein“) und je Warenart (für „knapp“). */
  kostenText: string; kosten: readonly number[];
  groesse: number; groesseText: string;
  /** Arbeitsradius in Hexen (0 = keiner). */
  radius: number;
}
export interface MenueGruppeDaten { gruppe: string; eintraege: MenueEintrag[] }

/** Inhalt der Gebäudekarte. */
export interface KartenDaten {
  symbol: string; titel: string;
  /** Zustand in Klartext und Spruch. */
  status: string; spruch: string; warn: boolean;
  zeilen: string[];
  /** Baufortschritt in Prozent (nur Baustelle). */
  fortschritt?: number;
  /** Baustellen-Priorität 1..3 (nur Baustelle). */
  prio?: number;
}

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
  /** Letzten Zwischenpunkt des offenen Wegs entfernen. */
  onZurueck(): void;
  /** 0 = Pause umschalten, sonst Tempo 1..3 setzen. */
  onTempo(t: number): void;
  /** Priorität der gewählten Baustelle setzen (1..3). */
  onPrioritaet(stufe: number): void;
  /** Gebäudekarte schließen. */
  onKarteZu(): void;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, html = ''): HTMLElementTagNameMap[K] {
  const d = document.createElement(tag);
  d.className = cls;
  if (html) d.innerHTML = html;
  return d;
}

function mit<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text: string): HTMLElementTagNameMap[K] {
  const d = el(tag, cls);
  d.textContent = text;
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
  private zurueck = el('button', 'aktion zurueck', 'Zurück');
  private abbrechen = el('button', 'aktion abbrechen', 'Abbrechen');
  private knoepfe = new Map<string, HTMLButtonElement>();
  private menue = el('div', 'panel baumenue');
  private eintraege = new Map<string, { knopf: HTMLButtonElement; daten: MenueEintrag; kosten: HTMLElement }>();
  private menueIcon!: HTMLElement;
  private karte = el('div', 'panel gebkarte');
  private k = {
    sym: el('span', 'gk-sym'), titel: el('b', 'gk-titel'), status: el('div', 'gk-status'), balken: el('div', 'gk-balken', '<i></i>'),
    zeilen: el('div', 'gk-zeilen'), spruch: el('div', 'gk-spruch'), prio: el('div', 'gk-prio'), prioKnoepfe: [] as HTMLButtonElement[],
  };
  private karteSig = '';
  private status = el('div', 'panel spielstatus');
  private tempoKnoepfe = new Map<number, HTMLButtonElement>();
  private zeit = el('span', 'zeit');
  private zeile2 = el('div', 'zeile2');
  private letzteStatus = '';

  constructor(root: HTMLElement, private auf: LeistenAufrufe, menue: MenueGruppeDaten[]) {
    // Hinweiszeile mit Knöpfen
    this.bauen.type = 'button'; this.abbrechen.type = 'button'; this.zurueck.type = 'button';
    this.zurueck.title = 'Letzten Zwischenpunkt entfernen (Rücktaste)';
    this.bauen.addEventListener('click', () => { auf.onBestaetigen(); this.bauen.blur(); });
    this.abbrechen.addEventListener('click', () => { auf.onAbbrechen(); this.abbrechen.blur(); });
    this.zurueck.addEventListener('click', () => { auf.onZurueck(); this.zurueck.blur(); });
    this.hinweis.append(this.hinweisText, this.bauen, this.zurueck, this.abbrechen);
    // Werkzeugreihe
    const reihe = el('div', 'panel werkzeuge');
    for (const w of WERKZEUGE) {
      const b = el('button', 'werkzeug', `<span class="ic">${w.icon}</span><span class="lb">${w.label}</span><kbd>${w.taste}</kbd>`);
      b.type = 'button';
      b.dataset.w = w.id;
      b.title = `${w.titel} [${w.taste}]`;
      if (w.id === 'menue') {
        this.menueIcon = b.querySelector('.ic')!;
        b.addEventListener('click', () => { this.menueUmschalten(); b.blur(); });
      } else b.addEventListener('click', () => { this.menueZu(); auf.onWerkzeug(w.id); b.blur(); });
      this.knoepfe.set(w.id, b);
      reihe.append(b);
    }
    this.baueMenue(menue);
    this.baueKarte();
    this.leiste.append(this.menue, this.karte, this.hinweis, reihe);
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

  // ------------------------------------------------------------------ Baumenü

  private baueMenue(gruppen: MenueGruppeDaten[]) {
    this.menue.hidden = true;
    const kopf = el('div', 'bm-kopf');
    const zu = mit('button', 'bm-zu', '✕');
    zu.type = 'button'; zu.title = 'Menü schließen (Esc)'; zu.setAttribute('aria-label', 'Menü schließen');
    zu.addEventListener('click', () => this.menueZu());
    kopf.append(mit('b', 'bm-titel', 'Bauen'), mit('span', 'bm-hilfe', 'Gebäude wählen, dann auf der Karte setzen'), zu);
    const liste = el('div', 'bm-liste');
    for (const g of gruppen) {
      const sek = el('section', 'bm-gruppe');
      sek.append(mit('h4', '', g.gruppe));
      const raster = el('div', 'bm-raster');
      for (const e of g.eintraege) {
        const b = el('button', 'bm-eintrag');
        b.type = 'button'; b.dataset.id = e.id; b.title = e.spruch;
        const kosten = mit('span', 'bm-kosten', e.kostenText);
        const name = el('span', 'bm-name');
        name.append(mit('span', '', e.name), mit('em', `bm-platz p${e.groesse}`, e.groesseText));
        const text = el('span', 'bm-text');
        text.append(name, kosten, mit('span', 'bm-spruch', e.spruch));
        b.append(mit('span', 'bm-sym', e.symbol), text);
        b.addEventListener('click', () => { this.menueZu(); this.auf.onWerkzeug(e.id); });
        this.eintraege.set(e.id, { knopf: b, daten: e, kosten });
        raster.append(b);
      }
      sek.append(raster);
      liste.append(sek);
    }
    this.menue.append(kopf, liste);
  }

  get menueOffen(): boolean { return !this.menue.hidden; }

  menueZu() {
    if (this.menue.hidden) return;
    this.menue.hidden = true;
    this.knoepfe.get('menue')?.classList.remove('offen');
    this.hoeheMelden();
  }

  menueAuf() {
    this.menue.hidden = false;
    this.knoepfe.get('menue')?.classList.add('offen');
    this.hoeheMelden();
  }

  menueUmschalten() {
    if (this.menueOffen) this.menueZu(); else this.menueAuf();
  }

  // ------------------------------------------------------------------ Gebäudekarte

  private baueKarte() {
    this.karte.hidden = true;
    const kopf = el('div', 'gk-kopf');
    const zu = mit('button', 'gk-zu', '✕');
    zu.type = 'button'; zu.title = 'Schließen (Esc)'; zu.setAttribute('aria-label', 'Karte schließen');
    zu.addEventListener('click', () => this.auf.onKarteZu());
    kopf.append(this.k.sym, this.k.titel, zu);
    this.k.prio.append(mit('span', 'gk-prio-label', 'Priorität'));
    ([[1, 'Später'], [2, 'Normal'], [3, 'Zuerst']] as const).forEach(([stufe, name]) => {
      const b = el('button', 'gk-prio-knopf');
      b.type = 'button';
      b.dataset.p = String(stufe);
      b.title = `Priorität ${stufe}: ${name}${stufe === 3 ? ' – wird zuerst beliefert' : ''}`;
      b.append(mit('b', '', String(stufe)), mit('span', '', name));
      b.addEventListener('click', () => { this.auf.onPrioritaet(stufe); b.blur(); });
      this.k.prioKnoepfe.push(b);
      this.k.prio.append(b);
    });
    this.karte.append(kopf, this.k.status, this.k.balken, this.k.zeilen, this.k.spruch, this.k.prio);
  }

  /** Gebäudekarte zeigen oder (null) ausblenden. */
  setKarte(d: KartenDaten | null) {
    if (!d) {
      if (!this.karte.hidden) { this.karte.hidden = true; this.karteSig = ''; this.hoeheMelden(); }
      return;
    }
    const sig = JSON.stringify(d);
    const warAus = this.karte.hidden;
    this.karte.hidden = false;
    if (sig !== this.karteSig) {
      this.karteSig = sig;
      this.k.sym.textContent = d.symbol;
      this.k.titel.textContent = d.titel;
      this.k.status.textContent = d.status;
      this.k.status.classList.toggle('warn', d.warn);
      this.k.spruch.textContent = d.spruch;
      this.k.zeilen.replaceChildren(...d.zeilen.map((z) => mit('div', '', z)));
      const hatBalken = d.fortschritt !== undefined;
      this.k.balken.style.display = hatBalken ? '' : 'none';
      if (hatBalken) (this.k.balken.firstElementChild as HTMLElement).style.width = `${Math.max(2, Math.min(100, d.fortschritt!))}%`;
      this.k.prio.style.display = d.prio !== undefined ? '' : 'none';
      for (const b of this.k.prioKnoepfe) b.classList.toggle('an', Number(b.dataset.p) === d.prio);
    }
    if (warAus) this.hoeheMelden();
  }

  // ------------------------------------------------------------------ Werkzeuge, Hinweis

  setWerkzeug(w: Werkzeug) {
    for (const [id, b] of this.knoepfe) if (id !== 'menue') b.classList.toggle('an', id === w);
    const e = this.eintraege.get(w);
    const mk = this.knoepfe.get('menue');
    mk?.classList.toggle('an', !!e);
    this.menueIcon.textContent = e ? e.daten.symbol : WERKZEUGE.find((x) => x.id === 'menue')!.icon;
    for (const [id, x] of this.eintraege) x.knopf.classList.toggle('an', id === w);
  }

  /** Hinweiszeile über der Leiste; null blendet den Text aus. */
  setHinweis(text: string | null, warn = false) {
    this.hinweisText.textContent = text ?? '';
    this.hinweis.classList.toggle('warn', warn);
    this.hinweisZeigen();
  }

  /** „Bauen“-Knopf (Text oder null = weg; `aus` = sichtbar, aber nicht tippbar), „Abbrechen“-Knopf und „Zurück“ (beim Wegführen). */
  setAktionen(bauenText: string | null, abbrechenSichtbar: boolean, aus = false, zurueckSichtbar = false) {
    this.bauen.style.display = bauenText ? 'block' : 'none';
    if (bauenText) this.bauen.textContent = bauenText;
    this.bauen.disabled = aus;
    this.zurueck.style.display = zurueckSichtbar ? 'block' : 'none';
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
    // Baumenü: Gebäude, deren Material das Lager gerade nicht deckt, gedämpft zeigen (bauen geht trotzdem)
    for (const { knopf, daten } of this.eintraege.values()) {
      knopf.classList.toggle('knapp', daten.kosten.some((n, i) => n > (s.vorrat[i] ?? 0)));
    }
  }

  /** Höhe der Leiste in eine CSS-Variable schreiben, damit Info-Feld und Minimap darüber bleiben (Handy). */
  private hoeheMelden() {
    // das Baumenü liegt über der Karte und zählt nicht mit, die Gebäudekarte schon
    const menue = this.menue.hidden ? 0 : this.menue.getBoundingClientRect().height + 6;
    const h = Math.max(0, Math.ceil(this.leiste.getBoundingClientRect().height - menue));
    document.documentElement.style.setProperty('--leiste-h', `${h}px`);
  }
}
