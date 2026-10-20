// Lobby für den Mehrspieler (Drehbuch 2.3, ROADMAP M6): Name, Einladungslink, Spielerliste mit Verbindung und Karten-Prüfsumme,
// Startplätze in verschiedenen Ortskernen, Tempo und (für den Gastgeber) Spielstand laden und „Los geht’s!“. Liegt über der schon
// geladenen Karte. Kennt keine Simulation; Entscheidungen über den Start trifft der Vermittlungs-Server.
import './lobby.css';
import type { Hx } from '../spiel/logik';
import type { Spielstand } from '../spiel/spielstand';
import { leseSpielstand } from '../spiel/spielstand';
import { pruefeStartplaetze, verteileStartplaetze, type Ort } from '../netz/startplaetze';
import { NAME_SPEICHER, speicher, type RaumSicht, type Vermittlung } from '../netz/vermittlung';
import { SPIELER_FARBEN } from './partieleiste';

/** Was der Gastgeber in den Raum schreibt (alle sehen es). */
export interface LobbyEinstellungen {
  param: { version: string; q: number; r: number; size: string };
  kartenName: string;
  /** Startort (Ortsname) je Platz, wie die Plätze vor dem Start nummeriert sind (null = frei). */
  startorte: (string | null)[];
  tempo: number;
  /** Geladener Spielstand: Spielernamen und Spielzeit (der Stand selbst bleibt beim Gastgeber). */
  spielstand: { spieler: string[]; tick: number; gespeichert: string } | null;
}

export interface StartInfo {
  du: number;
  raum: RaumSicht;
  einstellungen: LobbyEinstellungen;
  /** Nur beim Gastgeber: Startorte in der Reihenfolge der Spieler nach dem Start und der geladene Spielstand. */
  startorte: string[];
  spielstand: Spielstand | null;
}

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text = ''): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
};

/** Fragt den Spielernamen (gemerkt im Browser). */
export function frageName(root: HTMLElement, titel: string, knopf: string, text = ''): Promise<string> {
  return new Promise((ok) => {
    const w = el('div', 'lobby-huelle');
    const box = el('form', 'panel lobby lobby-name');
    box.append(el('h2', '', titel));
    if (text) box.append(el('p', 'lobby-text', text));
    const name = el('input', 'lobby-eingabe');
    name.maxLength = 24; name.placeholder = 'Dein Name'; name.setAttribute('autocomplete', 'nickname'); name.required = true;
    name.value = speicher(NAME_SPEICHER) ?? '';
    const los = el('button', 'lobby-los', knopf);
    los.type = 'submit';
    box.append(el('label', 'lobby-label', 'Wie heißt du?'), name, los);
    box.addEventListener('submit', (e) => {
      e.preventDefault();
      const n = name.value.trim();
      if (!n) return;
      speicher(NAME_SPEICHER, n);
      w.remove();
      ok(n);
    });
    w.append(box);
    root.append(w);
    name.focus();
  });
}

/** Meldung mit einem Knopf (Fehler beim Beitreten u. Ä.). */
export function zeigeHinweis(root: HTMLElement, titel: string, text: string, knopf: string, aktion: () => void): void {
  const w = el('div', 'lobby-huelle');
  const box = el('div', 'panel lobby lobby-name');
  const b = el('button', 'lobby-los', knopf);
  b.type = 'button';
  b.addEventListener('click', () => { w.remove(); aktion(); });
  box.append(el('h2', '', titel), el('p', 'lobby-text', text), b);
  w.append(box);
  root.append(w);
}

export interface LobbyOptionen {
  v: Vermittlung;
  kartenName: string;
  param: LobbyEinstellungen['param'];
  /** Prüfsumme der eigenen Kartendaten (M2). */
  kartePruef: string;
  orte: Ort[];
  mitte: Hx;
  /** Lager-Hex zu einem Ortsnamen (wie im Spiel gewählt) oder null. */
  lagerFuer: (name: string) => Hx | null;
  /** Gastgeber: vorab geladener Spielstand (aus der Kartenwahl). */
  spielstand?: Spielstand | null;
  erster?: string;
}

export class Lobby {
  private wurzel = el('div', 'panel lobby lobby-raum');
  private spielerListe = el('div', 'lobby-spieler');
  private hinweis = el('div', 'lobby-hinweis');
  private los = el('button', 'lobby-los');
  private tempoWahl = el('select', 'lobby-wahl');
  private standZeile = el('div', 'lobby-stand');
  private einst: LobbyEinstellungen | null = null;
  private spielstand: Spielstand | null;
  private fertig: ((s: StartInfo) => void) | null = null;
  private startorteVorStart: (string | null)[] = [];

  constructor(root: HTMLElement, private o: LobbyOptionen) {
    this.spielstand = o.spielstand ?? null;
    const v = o.v;
    const gast = () => v.du !== v.raum?.gastgeber;
    this.wurzel.append(el('h2', '', 'Mit Freunden spielen'), el('p', 'lobby-karte', o.kartenName));

    // Einladungslink
    const link = `${location.origin}${location.pathname}${location.search}#raum=${v.raumCode}`;
    const linkZeile = el('div', 'lobby-link');
    const feld = el('input', 'lobby-eingabe');
    feld.readOnly = true; feld.value = link;
    const kopieren = el('button', 'lobby-knopf', 'Kopieren');
    kopieren.type = 'button';
    kopieren.addEventListener('click', async () => {
      feld.select();
      try { await navigator.clipboard.writeText(link); kopieren.textContent = 'Kopiert ✓'; } catch { document.execCommand?.('copy'); }
      setTimeout(() => { kopieren.textContent = 'Kopieren'; }, 2000);
    });
    linkZeile.append(feld, kopieren);
    this.wurzel.append(el('label', 'lobby-label', `Einladungslink (Raum ${v.raumCode})`), linkZeile);

    // Spieler
    this.wurzel.append(el('label', 'lobby-label', 'Spieler und Startorte'), this.spielerListe);

    // Tempo und Spielstand (Gastgeber)
    const reihe = el('div', 'lobby-reihe');
    for (const t of [1, 2, 3]) { const op = el('option', '', `Tempo ${t}×`); op.value = String(t); this.tempoWahl.append(op); }
    this.tempoWahl.addEventListener('change', () => this.schreibe());
    const laden = el('label', 'lobby-knopf', '📂 Spielstand laden');
    const datei = el('input');
    datei.type = 'file'; datei.accept = '.json,application/json'; datei.hidden = true;
    datei.addEventListener('change', async () => {
      const f = datei.files?.[0];
      datei.value = '';
      if (!f) return;
      try {
        const s = leseSpielstand(await f.text());
        if (s.karte.pruefsumme !== o.kartePruef) throw new Error('Dieser Spielstand gehört zu einer anderen Karte – in der Kartenwahl „Spielstand laden“ nehmen, dann kommt die richtige Karte mit.');
        this.spielstand = s;
        this.schreibe();
      } catch (e) { this.zeigeHinweis((e as Error).message, true); }
    });
    laden.append(datei);
    const neu = el('button', 'lobby-knopf', 'Neues Spiel');
    neu.type = 'button';
    neu.addEventListener('click', () => { this.spielstand = null; this.schreibe(); });
    reihe.append(this.tempoWahl, laden, neu);
    this.wurzel.append(reihe, this.standZeile, this.hinweis, this.los);
    this.los.type = 'button';
    this.los.addEventListener('click', () => { if (!gast()) v.start(); });
    root.append(this.wurzel);

    v.onRaum = (r) => this.zeige(r);
    v.onFehler = (t) => this.zeigeHinweis(t, true);
    v.onStart = (du, r) => this.gestartet(du, r);
    // der Gastgeber schreibt die Einstellungen (neue Karte: alle melden ihre Prüfsumme neu), dann melden alle ihre Kartenprüfsumme
    if (!gast()) this.schreibe(true);
    v.pruefsumme(o.kartePruef);
    if (v.raum) this.zeige(v.raum);
    reihe.hidden = gast();
  }

  /** Wartet, bis der Gastgeber startet. */
  warteAufStart(): Promise<StartInfo> { return new Promise((ok) => { this.fertig = ok; }); }

  private zeigeHinweis(text: string, warn: boolean): void {
    this.hinweis.textContent = text;
    this.hinweis.classList.toggle('warn', warn);
  }

  /** Gastgeber: Startorte verteilen (neue Spieler bekommen einen freien, weit entfernten Ort) und Einstellungen schreiben. */
  private schreibe(neueKarte = false): void {
    const v = this.o.v, r = v.raum;
    if (!r || v.du !== r.gastgeber) return;
    const plaetze = r.spieler;
    const alt = (this.einst?.startorte ?? []).slice();
    let startorte: (string | null)[];
    if (this.spielstand) {
      // geladener Stand: die Orte stehen fest (Lager im Stand), Platz i spielt Dorf i
      startorte = plaetze.map((p, i) => (p ? `Dorf ${i + 1}` : null));
    } else {
      const besetzt = plaetze.filter((p) => p).length;
      const vorschlag = verteileStartplaetze(this.o.orte, Math.max(besetzt, 1), this.o.mitte, this.o.erster);
      const vergeben = new Set(alt.filter((x, i) => x && plaetze[i] && this.o.orte.some((o) => o.name === x)) as string[]);
      startorte = plaetze.map((p, i) => {
        if (!p) return null;
        const a = alt[i];
        if (a && plaetze[i] && this.o.orte.some((o) => o.name === a)) return a;
        const frei = vorschlag.find((n) => n && !vergeben.has(n)) ?? '';
        if (frei) vergeben.add(frei);
        return frei;
      });
    }
    this.einst = {
      param: this.o.param, kartenName: this.o.kartenName, startorte, tempo: Number(this.tempoWahl.value) || 1,
      spielstand: this.spielstand ? { spieler: this.spielstand.spieler, tick: this.spielstand.stand.zahlen[0], gespeichert: this.spielstand.gespeichert } : null,
    };
    v.einstellungen(this.einst, neueKarte);
  }

  private zeige(r: RaumSicht): void {
    const v = this.o.v, ich = v.du, gastgeber = ich === r.gastgeber;
    const e = (r.einstellungen as LobbyEinstellungen | null) ?? this.einst;
    // Gastgeber: neue oder gegangene Spieler bekommen sofort Startorte
    if (gastgeber && e && (e.startorte.length !== r.spieler.length || e.startorte.some((x, i) => (x === null) !== (r.spieler[i] === null)))) { this.schreibe(); return; }
    if (e) this.einst = e;
    const startorte = e?.startorte ?? [];
    this.startorteVorStart = startorte;
    const pruefHost = r.spieler[r.gastgeber]?.pruefsumme ?? '';
    this.spielerListe.replaceChildren(...r.spieler.map((s, platz) => {
      if (!s) return el('span');
      const z = el('div', `lobby-sp${platz === ich ? ' ich' : ''}`);
      const farbe = el('i', 'lobby-farbe');
      const nr = r.spieler.slice(0, platz).filter((x) => x).length;
      farbe.style.background = SPIELER_FARBEN[nr % SPIELER_FARBEN.length];
      const karteOk = !!s.pruefsumme && s.pruefsumme === pruefHost;
      const zustand = !s.da ? 'getrennt' : !s.pruefsumme ? 'lädt die Karte …' : karteOk ? 'Karte ✓' : 'Karte weicht ab ✗';
      z.append(farbe, el('b', '', s.name + (platz === ich ? ' (du)' : '') + (platz === r.gastgeber ? ' · Gastgeber' : '')),
        el('span', `lobby-zustand${karteOk && s.da ? ' ok' : ' warn'}`, zustand));
      const ort = startorte[platz] ?? '';
      if (gastgeber && !e?.spielstand) {
        const wahl = el('select', 'lobby-wahl');
        for (const o of this.o.orte) { const op = el('option', '', o.name); op.value = o.name; wahl.append(op); }
        wahl.value = ort;
        wahl.addEventListener('change', () => { if (this.einst) { this.einst.startorte[platz] = wahl.value; this.o.v.einstellungen(this.einst); } });
        z.append(wahl);
      } else z.append(el('span', 'lobby-ort', ort ? `startet in ${ort}` : ''));
      return z;
    }));
    // Spielstand und Tempo
    this.tempoWahl.value = String(e?.tempo ?? 1);
    const st = e?.spielstand;
    this.standZeile.textContent = st ? `Fortsetzen: Spielstand vom ${new Date(st.gespeichert).toLocaleString('de-DE')} mit ${st.spieler.join(', ')} (Spielzeit ${Math.floor(st.tick / 1200)} min)` : '';
    // Startbedingung (der Server prüft sie noch einmal)
    const da = r.spieler.filter((s) => s);
    const lager = startorte.map((n, i) => (r.spieler[i] && n && !st ? this.o.lagerFuer(n) : null));
    const pruef = st ? { fehler: [] as string[], hinweise: [] as string[] } : pruefeStartplaetze(lager.filter((_, i) => r.spieler[i]), startorte.filter((_, i) => r.spieler[i]) as string[]);
    const fehler = da.length < 2 ? 'Warte auf Mitspieler – schick ihnen den Link.'
      : da.some((s) => !s!.da) ? 'Nicht alle sind verbunden.'
      : !pruefHost || da.some((s) => s!.pruefsumme !== pruefHost) ? 'Warte, bis alle die Karte geladen haben (gleiche Prüfsumme).'
      : st && st.spieler.length !== da.length ? `Der Spielstand ist für ${st.spieler.length} Spieler, im Raum sind ${da.length}.`
      : pruef.fehler[0] ?? '';
    if (fehler) this.zeigeHinweis(fehler, da.length >= 2);
    else this.zeigeHinweis(pruef.hinweise[0] ?? (gastgeber ? 'Alle da, alle Karten gleich.' : 'Alle da – der Gastgeber startet.'), !!pruef.hinweise.length);
    this.los.textContent = gastgeber ? (st ? 'Weiterspielen!' : 'Los geht’s!') : 'Warte auf den Gastgeber …';
    this.los.disabled = !gastgeber || !!fehler;
  }

  private gestartet(du: number, r: RaumSicht): void {
    const e = (r.einstellungen as LobbyEinstellungen | null) ?? this.einst!;
    // Startorte in der neuen Reihenfolge (der Server rückt die Plätze lückenlos auf)
    const startorte = this.startorteVorStart.filter((x) => x !== null) as string[];
    this.wurzel.remove();
    this.fertig?.({ du, raum: r, einstellungen: e, startorte, spielstand: this.spielstand });
  }
}
