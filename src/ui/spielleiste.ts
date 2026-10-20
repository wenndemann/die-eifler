// Bauleiste unten (Weg, Fahne, „Bauen“-Menü, Abriss) mit Hinweiszeile und Knöpfen „Bauen“/„Abbrechen“, dem Baumenü
// (Gebäude nach Gruppe aus den Daten, mit Tooltip, Begründung und Taste) und der schmalen Statusleiste oben links (Tempo,
// Spielzeit, Dorf, Lagervorrat, Prüfsumme, Knöpfe für die Fenster). Gebäude, Fahnen und Wege zeigen ihre Fenster (src/ui/fenster.ts).
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

/** Fenster-Knöpfe in der Statusleiste (Taste, Zeichen, Titel). */
export const FENSTER_KNOEPFE: readonly { id: string; taste: string; icon: string; titel: string }[] = [
  { id: 'waren', taste: 'I', icon: '📦', titel: 'Warenübersicht: Lager, unterwegs, gemacht' },
  { id: 'verteilung', taste: 'V', icon: '⚖️', titel: 'Warenverteilung: wer eine Ware zuerst bekommt' },
  { id: 'statistik', taste: 'T', icon: '📈', titel: 'Statistik: Bewohner, Gebäude und Waren über die Zeit' },
  { id: 'protokoll', taste: 'L', icon: '📜', titel: 'Ereignisprotokoll: was bisher geschah, mit Sprung zum Ort' },
  { id: 'einstellungen', taste: 'Esc', icon: '⚙️', titel: 'Einstellungen: Grafik, Oberfläche, Steuerung, Spiel' },
  { id: 'hilfe', taste: 'H', icon: '❓', titel: 'Hilfe: So geht das Spiel, alle Tasten' },
];

/** Ein Gebäude im Baumenü (aus GEBAEUDE gebaut). */
export interface MenueEintrag {
  id: string; symbol: string; name: string; spruch: string;
  /** Icon aus dem 3D-Modell (data:-URL), sonst das Zeichen. */
  bild?: string;
  /** Taste bei offenem Menü (data/buildings.json) und Ziffer für alle Fälle (3–9), falls vergeben. */
  taste?: string; ziffer?: string;
  /** Zeilen des Tooltips (Kosten, Bauplatz, Ein- und Ausgang). */
  tooltip: string[];
  /** Kosten als Text („2 🪵 Bretter · 1 🪨 Stein“) und je Warenart (für „knapp“). */
  kostenText: string; kosten: readonly number[];
  groesse: number; groesseText: string;
  /** Arbeitsradius in Hexen (0 = keiner). */
  radius: number;
}
export interface MenueGruppeDaten { gruppe: string; eintraege: MenueEintrag[] }

export interface StatusDaten {
  tick: number;
  freieTraeger: number;
  /** Vorrat im Lager je Warenart (Index = Warenart, siehe WAREN in src/sim/daten.ts). */
  vorrat: number[];
  pruefsumme: string;
  /** Dorf (M5): Stufe, Bewohner und Wohnraum, Bauleute frei/gesamt, Kirmes-Zeile (fertiger Text) und deren Fortschritt in Prozent. */
  dorf?: {
    stufe: string; bewohner: number; wohnraum: number; frei: number;
    bauarbeiter: [number, number]; planierer: [number, number];
    kirmes: { text: string; prozent: number; fest: boolean } | null;
    /** Kleines Fest der Jahreszeit (wie die Kirmes-Zeile), Punkte aus kleinen Festen, Winter ohne Essen (friert). */
    fest?: { text: string; prozent: number; fest: boolean } | null;
    punkte?: number; friert?: boolean;
    /** Jahreszeit und Wetter als fertiger Text; Winter (Leiste in Winterfarben). */
    jahr?: string; winter?: boolean;
  };
  /** Kurznamen der Waren im Lager, die gezeigt werden (Index, Symbol, Name). */
  lagerZeigen?: { art: number; icon: string; name: string }[];
  /** Je Gebäudetyp, was im Lager für den Bau fehlt („2 Bretter“). */
  knappText?: Record<string, string>;
}

export interface LeistenAufrufe {
  onWerkzeug(w: Werkzeug): void;
  onBestaetigen(): void;
  onAbbrechen(): void;
  /** Letzten Zwischenpunkt des offenen Wegs entfernen. */
  onZurueck(): void;
  /** 0 = Pause umschalten, sonst Tempo 1..3 setzen. */
  onTempo(t: number): void;
  /** Fenster öffnen oder schließen (FENSTER_KNOEPFE). */
  onFenster(id: string): void;
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
  private eintraege = new Map<string, { knopf: HTMLButtonElement; daten: MenueEintrag; kosten: HTMLElement; grund: string; knapp: string }>();
  private menueIcon!: HTMLElement;
  private tipp = el('div', 'bm-tipp');
  private tippFuer: string | null = null;
  private reiter = new Map<string, HTMLButtonElement>();
  private gruppenEl = new Map<string, HTMLElement>();
  readonly fensterKnoepfe = new Map<string, HTMLButtonElement>();
  private status = el('div', 'panel spielstatus');
  private tempoKnoepfe = new Map<number, HTMLButtonElement>();
  private zeit = el('span', 'zeit');
  private zeileDorf = el('div', 'zeile-dorf');
  private kirmes = el('div', 'zeile-kirmes', '<span class="txt"></span><span class="balken"><i></i></span>');
  private festZeile = el('div', 'zeile-kirmes zeile-fest', '<span class="txt"></span><span class="balken"><i></i></span>');
  private jahrZeile = el('div', 'zeile-jahr');
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
    this.leiste.append(this.menue, this.hinweis, reihe);
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
    const fk = el('div', 'fensterknoepfe');
    for (const f of FENSTER_KNOEPFE) {
      const b = el('button', 'fk', f.icon);
      b.type = 'button'; b.dataset.f = f.id; b.title = `${f.titel} [${f.taste}]`; b.setAttribute('aria-label', f.titel);
      b.addEventListener('click', () => { auf.onFenster(f.id); b.blur(); });
      this.fensterKnoepfe.set(f.id, b);
      fk.append(b);
    }
    this.kirmes.title = 'Kirmes: Warenliste am Kirmesplatz abliefern, dann wird gefeiert und das Dorf steigt eine Stufe auf';
    this.festZeile.title = 'Kleines Fest der Jahreszeit: Warenliste am Kirmesplatz, einmal im Jahr, bringt Punkte';
    this.jahrZeile.title = 'Jahreszeit und Wetter: im Winter ruhen die Felder und das Dorf isst aus dem Lager; Wetter kündigt die Erzählfigur an';
    this.status.append(z1, fk, this.jahrZeile, this.zeileDorf, this.kirmes, this.festZeile, this.zeile2);
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
    kopf.append(mit('b', 'bm-titel', 'Bauen'), mit('span', 'bm-hilfe', 'Gebäude wählen (Taste rechts oben), dann auf der Karte setzen'), zu);
    // Reiter: alle Gruppen oder eine (DESIGN §9.2)
    const reiter = el('div', 'bm-reiter');
    for (const name of ['Alle', ...gruppen.map((g) => g.gruppe)]) {
      const r = mit('button', 'bm-reiter-knopf', name);
      r.type = 'button'; r.dataset.gruppe = name;
      r.addEventListener('click', () => { this.zeigeGruppe(name); r.blur(); });
      this.reiter.set(name, r);
      reiter.append(r);
    }
    const liste = el('div', 'bm-liste');
    for (const g of gruppen) {
      const sek = el('section', 'bm-gruppe');
      sek.append(mit('h4', '', g.gruppe));
      const raster = el('div', 'bm-raster');
      for (const e of g.eintraege) {
        const b = el('button', 'bm-eintrag');
        b.type = 'button'; b.dataset.id = e.id;
        b.setAttribute('aria-label', `${e.name}: ${e.tooltip.join('. ')}`);
        const kosten = mit('span', 'bm-kosten', e.kostenText);
        const name = el('span', 'bm-name');
        name.append(mit('span', '', e.name), mit('em', `bm-platz p${e.groesse}`, e.groesseText));
        const text = el('span', 'bm-text');
        text.append(name, kosten, mit('span', 'bm-spruch', e.spruch));
        const sym = el('span', 'bm-sym');
        if (e.bild) { const img = el('img', ''); img.src = e.bild; img.alt = ''; sym.append(img); } else sym.textContent = e.symbol;
        b.append(sym, text);
        if (e.taste || e.ziffer) b.append(mit('kbd', 'bm-taste', [e.taste, e.ziffer].filter(Boolean).join(' · ')));
        b.addEventListener('click', () => { this.menueZu(); this.auf.onWerkzeug(e.id); });
        b.addEventListener('pointerenter', (ev) => { if (ev.pointerType === 'mouse') this.zeigeTipp(e.id); });
        b.addEventListener('pointerleave', () => this.zeigeTipp(null));
        b.addEventListener('focus', () => this.zeigeTipp(e.id));
        b.addEventListener('blur', () => this.zeigeTipp(null));
        this.eintraege.set(e.id, { knopf: b, daten: e, kosten, grund: '', knapp: '' });
        raster.append(b);
      }
      sek.append(raster);
      this.gruppenEl.set(g.gruppe, sek);
      liste.append(sek);
    }
    this.tipp.hidden = true;
    this.tipp.setAttribute('role', 'tooltip');
    this.menue.append(kopf, reiter, liste, this.tipp);
    this.zeigeGruppe('Alle');
  }

  /** Reiter wählen: nur diese Gruppe zeigen („Alle“ = alle). */
  zeigeGruppe(name: string) {
    for (const [g, r] of this.reiter) r.classList.toggle('an', g === name);
    for (const [g, sek] of this.gruppenEl) sek.hidden = name !== 'Alle' && g !== name;
  }

  /** Tooltip eines Eintrags: Name, Kosten, Bauplatz, Ein-/Ausgang, Spruch, dazu Sperr- oder Knappheitsgrund. */
  private zeigeTipp(id: string | null) {
    this.tippFuer = id;
    const e = id ? this.eintraege.get(id) : undefined;
    if (!e) { this.tipp.hidden = true; return; }
    this.tipp.replaceChildren(mit('b', '', e.daten.name), ...e.daten.tooltip.map((z) => mit('div', '', z)));
    if (e.grund) this.tipp.append(mit('div', 'warn', `🔒 Gesperrt: ${e.grund}`));
    else if (e.knapp) this.tipp.append(mit('div', 'knapp', e.knapp));
    this.tipp.append(mit('div', 'bm-tipp-spruch', `„${e.daten.spruch}“`));
    if (e.daten.taste) this.tipp.append(mit('div', 'bm-tipp-taste', `Taste ${e.daten.taste}${e.daten.ziffer ? ` (immer: ${e.daten.ziffer})` : ''}`));
    this.tipp.hidden = false;
    const r = e.knopf.getBoundingClientRect(), m = this.menue.getBoundingClientRect();
    const z = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--ui-zoom')) || 1;
    this.tipp.style.left = `${Math.max(0, Math.min(m.width - 250 * z, r.left - m.left)) / z}px`;
    this.tipp.style.bottom = `${(m.bottom - r.top + 6) / z}px`;
  }

  /** Icons aus den Modellen nachreichen (sie werden nach dem Start gerendert). */
  setzeBilder(bilder: Readonly<Record<string, string | undefined>>) {
    for (const [id, e] of this.eintraege) {
      const b = bilder[id];
      if (!b || e.daten.bild === b) continue;
      e.daten.bild = b;
      const sym = e.knopf.querySelector('.bm-sym')!;
      const img = el('img', '');
      img.src = b; img.alt = '';
      sym.replaceChildren(img);
    }
  }

  /** Taste bei offenem Menü: Id des Gebäudes mit dieser Taste oder null. */
  menueTaste(taste: string): string | null {
    const t = taste.toUpperCase();
    for (const [id, e] of this.eintraege) if (e.daten.taste === t && !e.knopf.disabled) return id;
    return null;
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
    const sig = `${s.tick >> 4}|${s.freieTraeger}|${s.vorrat.join(',')}|${s.pruefsumme}|${JSON.stringify(s.dorf ?? null)}`;
    this.zeit.textContent = `${zeitText(s.tick)} · Tick ${s.tick}`;
    if (sig === this.letzteStatus) return;
    this.letzteStatus = sig;
    const d = s.dorf;
    this.zeileDorf.style.display = d ? '' : 'none';
    this.kirmes.style.display = d?.kirmes ? '' : 'none';
    this.festZeile.style.display = d?.fest ? '' : 'none';
    this.jahrZeile.style.display = d?.jahr ? '' : 'none';
    if (d) {
      this.jahrZeile.textContent = d.jahr ?? '';
      this.status.classList.toggle('winter', !!d.winter);
      if (d.fest) {
        (this.festZeile.firstElementChild as HTMLElement).textContent = d.fest.text;
        (this.festZeile.querySelector('i') as HTMLElement).style.width = `${Math.max(2, Math.min(100, d.fest.prozent))}%`;
        this.festZeile.classList.toggle('fest', d.fest.fest);
      }
      const voll = d.bewohner >= d.wohnraum;
      this.zeileDorf.innerHTML = `<b class="stufe">${d.stufe}</b> · <span title="Bewohner / Wohnraum (Wohnhäuser bauen für mehr Platz)"${voll ? ' class="warn"' : ''}>👪 <b>${d.bewohner}</b>/${d.wohnraum}</span>` +
        ` · <span title="freie Bewohner (werden Träger und Arbeiter)">frei <b>${d.frei}</b></span>` +
        ` · <span title="Bauarbeiter frei / gesamt">🔨 <b>${d.bauarbeiter[0]}</b>/${d.bauarbeiter[1]}</span>` +
        ` · <span title="Planierer frei / gesamt">⛏️ <b>${d.planierer[0]}</b>/${d.planierer[1]}</span>` +
        (d.punkte !== undefined ? ` · <span title="Punkte aus kleinen Festen">🎉 <b>${d.punkte}</b></span>` : '') +
        (d.friert ? ` · <span class="warn" title="Im Winter fehlt Essen im Lager: Gebäude arbeiten langsamer, kein Nachwuchs">🥶 friert</span>` : '');
      if (d.kirmes) {
        (this.kirmes.firstElementChild as HTMLElement).textContent = d.kirmes.text;
        (this.kirmes.querySelector('i') as HTMLElement).style.width = `${Math.max(2, Math.min(100, d.kirmes.prozent))}%`;
        this.kirmes.classList.toggle('fest', d.kirmes.fest);
      }
    }
    const zeigen = s.lagerZeigen ?? [{ art: 0, icon: '', name: 'Stamm' }, { art: 1, icon: '', name: 'Brett' }, { art: 2, icon: '', name: 'Stein' }, { art: 6, icon: '', name: 'Kartoffeln' }];
    const lager = zeigen.filter((w, i) => i < 3 || (s.vorrat[w.art] ?? 0) > 0)
      .map((w) => `<span title="${w.name}">${w.icon ? w.icon + ' ' : w.name + ' '}<b>${s.vorrat[w.art] ?? 0}</b></span>`).join(' · ');
    this.zeile2.innerHTML = `${d ? '' : `Träger frei <b>${s.freieTraeger}</b> · `}Lager: ${lager}` +
      ` · Sim <i class="simsumme" title="Prüfsumme des Spielzustands">${s.pruefsumme.slice(0, 8)}</i>`;
    // Baumenü: Gebäude, deren Material das Lager gerade nicht deckt, gedämpft zeigen (bauen geht trotzdem), mit Begründung im Tooltip
    for (const e of this.eintraege.values()) {
      const knapp = e.daten.kosten.some((n, i) => n > (s.vorrat[i] ?? 0));
      e.knopf.classList.toggle('knapp', knapp);
      e.knapp = knapp ? `⚠ Im Lager fehlt gerade Material (${s.knappText?.[e.daten.id] ?? 'siehe Kosten'}) – die Baustelle wartet dann.` : '';
    }
    if (this.tippFuer && !this.menue.hidden) this.zeigeTipp(this.tippFuer);
  }

  /**
   * Gesperrte Gebäude im Baumenü (Dorfstufe zu klein, einmaliges Gebäude steht schon): Id → Grund in Klartext; nicht genannte sind frei.
   */
  setGesperrt(gesperrt: Readonly<Record<string, string>>) {
    for (const [id, e] of this.eintraege) {
      const grund = gesperrt[id];
      e.grund = grund ?? '';
      e.knopf.disabled = !!grund;
      e.knopf.classList.toggle('gesperrt', !!grund);
      e.kosten.textContent = grund ? `🔒 ${grund}` : e.daten.kostenText;
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
