// Gemeinsames Fenster-System (DESIGN §9.1, ROADMAP M7): verschiebbar, anpinnbar, Esc schließt das oberste, Live-Daten 4× je Sekunde.
// Ein Fenster beschreibt seinen Inhalt nur als Daten (FensterDaten: Abschnitte wie Zustand, Balken, Waren, Tabelle, Knöpfe, Kurve);
// gezeichnet wird hier, für alle Fenster gleich. Abschnitte werden nur neu gebaut, wenn sich ihre Daten geändert haben.
// Reine HTML-Oberfläche: kennt weder Simulation noch Szene.

import './fenster.css';

export interface Knopf {
  id: string; text: string; titel?: string;
  /** gedrückt (z. B. gewählte Priorität), gesperrt, rot (Abriss). */
  an?: boolean; aus?: boolean; warn?: boolean;
}
/** Ware mit Menge (und Höchstmenge für „4/6“); Bild und Name liefert die Warenliste der Fensterfläche. */
export interface WareMenge { ware: number; n: number; max?: number }
export interface Zelle { text: string; ware?: number; titel?: string; warn?: boolean }
export interface TabZeile { zellen: Zelle[]; knopf?: string; aktiv?: boolean }
export interface Rangzeile {
  id: string; ware: number; text: string;
  /** Abnehmer in Rangfolge; `betrifft` = nimmt diese Ware überhaupt; `knopf` = Id beim Antippen (eins nach vorn). */
  plaetze: { symbol: string; name: string; betrifft: boolean; knopf: string }[];
  standard: boolean;
}
export interface KurvenReihe { name: string; farbe: string; punkte: [number, number][] }
export interface Eingabe {
  id: string; text: string; typ: 'schalter' | 'auswahl' | 'regler';
  wert: boolean | string | number;
  optionen?: { wert: string; text: string }[];
  min?: number; max?: number; schritt?: number; einheit?: string; hilfe?: string;
}

export type Abschnitt =
  | { art: 'status'; text: string; warn?: boolean; spruch?: string }
  | { art: 'balken'; text: string; prozent: number }
  | { art: 'waren'; titel?: string; waren: WareMenge[]; leer?: string }
  | { art: 'zeilen'; titel?: string; zeilen: string[] }
  | { art: 'knoepfe'; titel?: string; knoepfe: Knopf[] }
  | { art: 'tabelle'; titel?: string; kopf: string[]; zeilen: TabZeile[]; leer?: string }
  | { art: 'rangliste'; titel?: string; zeilen: Rangzeile[] }
  | { art: 'kurve'; titel?: string; reihen: KurvenReihe[]; xText: string; yText: string; leer?: string }
  | { art: 'eingaben'; titel?: string; felder: Eingabe[] };

export interface FensterDaten {
  titel: string;
  /** Bild (Icon aus dem 3D-Modell, data:-URL) oder Zeichen. */
  bild?: string; symbol?: string;
  abschnitte: Abschnitt[];
}

export interface FensterArt {
  /** Eindeutig, z. B. „geb:12“, „waren“. */
  id: string;
  /** Gruppe für die Ablösung: ein neues Fenster der Gruppe ersetzt ein nicht angepinntes (z. B. „auswahl“). */
  gruppe: string;
  /** Liefert die aktuellen Daten; null = das Ding gibt es nicht mehr (Fenster geht zu). */
  daten: () => FensterDaten | null;
  onKnopf?: (id: string) => void;
  onEingabe?: (id: string, wert: boolean | string | number) => void;
  onZu?: () => void;
  breite?: number;
}

/** Waren für die Anzeige: Name und Bild (data:-URL) oder Zeichen je Warenart. */
export interface WarenBilder { name: (a: number) => string; bild: (a: number) => string | undefined; zeichen: (a: number) => string }

const LAGE_SPEICHER = 'eifeler.fenster';
const TAKT_S = 0.25;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text = ''): HTMLElementTagNameMap[K] {
  const d = document.createElement(tag);
  d.className = cls;
  if (text) d.textContent = text;
  return d;
}

/** Schmal (Handy): Fenster als Blatt am unteren Rand, nur eins auf einmal (außer angepinnten). */
export const schmal = () => innerWidth < 700;

/** UI-Größe (Einstellungen, CSS-Variable --ui-zoom): Bildschirm-Pixel ÷ zoom = Pixel im Stil. */
function zoom(): number {
  const z = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--ui-zoom'));
  return z > 0 ? z : 1;
}
/** Fenster an Bildschirmpunkt (x, y) setzen. */
function setze(e: HTMLElement, x: number, y: number): void {
  const z = zoom();
  e.style.left = `${x / z}px`; e.style.top = `${y / z}px`;
}

class Fenster {
  readonly el = el('section', 'panel fenster');
  readonly kopf = el('div', 'fe-kopf');
  private bild = el('span', 'fe-bild');
  private titel = el('b', 'fe-titel');
  readonly pin = el('button', 'fe-pin', '📌');
  private zu = el('button', 'fe-zu', '✕');
  private rumpf = el('div', 'fe-rumpf');
  private teile: { sig: string; el: HTMLElement; art: string }[] = [];
  private kopfSig = '';
  angepinnt = false;

  constructor(readonly art: FensterArt, private waren: WarenBilder, onZu: () => void, onPin: () => void, onVorne: () => void) {
    this.el.dataset.fenster = art.id;
    this.el.dataset.gruppe = art.gruppe;
    if (art.breite) this.el.style.width = `${art.breite}px`;
    this.pin.type = 'button'; this.pin.title = 'Anpinnen: bleibt offen (Esc und neue Auswahl schließen es nicht)';
    this.zu.type = 'button'; this.zu.title = 'Schließen (Esc)'; this.zu.setAttribute('aria-label', 'Fenster schließen');
    this.pin.addEventListener('click', (e) => { e.stopPropagation(); onPin(); this.pin.blur(); });
    this.zu.addEventListener('click', (e) => { e.stopPropagation(); onZu(); });
    this.kopf.append(this.bild, this.titel, this.pin, this.zu);
    this.el.append(this.kopf, this.rumpf);
    this.el.addEventListener('pointerdown', onVorne, true);
    this.rumpf.addEventListener('click', (e) => {
      const k = (e.target as HTMLElement).closest<HTMLElement>('[data-knopf]');
      if (!k || (k as HTMLButtonElement).disabled) return;
      this.art.onKnopf?.(k.dataset.knopf!);
      (k as HTMLButtonElement).blur?.();
    });
    this.rumpf.addEventListener('input', (e) => this.eingabe(e.target as HTMLInputElement | HTMLSelectElement, false));
    this.rumpf.addEventListener('change', (e) => this.eingabe(e.target as HTMLInputElement | HTMLSelectElement, true));
  }

  private eingabe(i: HTMLInputElement | HTMLSelectElement, fertig: boolean): void {
    const id = i.dataset.eingabe;
    if (!id) return;
    if (i instanceof HTMLInputElement && i.type === 'checkbox') { if (fertig) this.art.onEingabe?.(id, i.checked); return; }
    if (i instanceof HTMLInputElement && i.type === 'range') {
      const out = i.parentElement?.querySelector('output');
      if (out) out.textContent = `${i.value}${i.dataset.einheit ?? ''}`;
      if (fertig) this.art.onEingabe?.(id, Number(i.value));
      return;
    }
    if (fertig) this.art.onEingabe?.(id, i.value);
  }

  setzePin(an: boolean): void {
    this.angepinnt = an;
    this.pin.classList.toggle('an', an);
    this.el.classList.toggle('angepinnt', an);
  }

  /** Daten holen und zeichnen; false, wenn es den Inhalt nicht mehr gibt. */
  aktualisiere(): boolean {
    const d = this.art.daten();
    if (!d) return false;
    const ks = `${d.titel}|${d.bild ?? ''}|${d.symbol ?? ''}`;
    if (ks !== this.kopfSig) {
      this.kopfSig = ks;
      this.titel.textContent = d.titel;
      this.bild.replaceChildren();
      if (d.bild) { const img = el('img', ''); img.src = d.bild; img.alt = ''; this.bild.append(img); } else this.bild.textContent = d.symbol ?? '';
    }
    d.abschnitte.forEach((a, i) => {
      const sig = JSON.stringify(a);
      const alt = this.teile[i];
      if (alt && alt.sig === sig) return;
      // Eingaben in Ruhe lassen, solange sich nur Werte geändert haben (sonst springt der Regler unter dem Finger weg)
      if (alt && a.art === 'eingaben' && alt.art === 'eingaben' && this.nurWerte(alt.el, a)) { alt.sig = sig; return; }
      const neu = this.zeichne(a);
      if (alt) alt.el.replaceWith(neu); else this.rumpf.append(neu);
      this.teile[i] = { sig, el: neu, art: a.art };
    });
    while (this.teile.length > d.abschnitte.length) this.teile.pop()!.el.remove();
    return true;
  }

  private nurWerte(box: HTMLElement, a: Extract<Abschnitt, { art: 'eingaben' }>): boolean {
    const felder = box.querySelectorAll<HTMLInputElement | HTMLSelectElement>('[data-eingabe]');
    if (felder.length !== a.felder.length) return false;
    for (let i = 0; i < a.felder.length; i++) {
      const f = a.felder[i], x = felder[i];
      if (x.dataset.eingabe !== f.id) return false;
      if (document.activeElement === x) continue;
      if (x instanceof HTMLInputElement && x.type === 'checkbox') x.checked = !!f.wert;
      else x.value = String(f.wert);
    }
    return true;
  }

  private ware(a: number, n?: string): HTMLElement {
    const s = el('span', 'fe-ware');
    const b = this.waren.bild(a);
    if (b) { const img = el('img', ''); img.src = b; img.alt = ''; s.append(img); } else s.append(el('i', '', this.waren.zeichen(a)));
    s.title = this.waren.name(a);
    if (n !== undefined) s.append(el('b', '', n));
    return s;
  }

  private zeichne(a: Abschnitt): HTMLElement {
    const box = el('div', `fe-teil fe-${a.art}`);
    if ('titel' in a && a.titel) box.append(el('h4', '', a.titel));
    switch (a.art) {
      case 'status': {
        box.append(el('div', `fe-zustand${a.warn ? ' warn' : ''}`, a.text));
        if (a.spruch) box.append(el('div', 'fe-spruch', a.spruch));
        break;
      }
      case 'balken': {
        const b = el('div', 'fe-balkenbox');
        const i = el('i', '');
        i.style.width = `${Math.max(2, Math.min(100, a.prozent))}%`;
        b.append(i);
        box.append(el('div', 'fe-balkentext', a.text), b);
        break;
      }
      case 'waren': {
        const reihe = el('div', 'fe-warenreihe');
        for (const w of a.waren) reihe.append(this.ware(w.ware, w.max !== undefined ? `${w.n}/${w.max}` : String(w.n)));
        if (!a.waren.length) reihe.append(el('span', 'fe-leer', a.leer ?? 'nichts'));
        box.append(reihe);
        break;
      }
      case 'zeilen': for (const z of a.zeilen) box.append(el('div', 'fe-zeile', z)); break;
      case 'knoepfe': {
        const r = el('div', 'fe-knopfreihe');
        for (const k of a.knoepfe) r.append(this.knopf(k));
        box.append(r);
        break;
      }
      case 'tabelle': {
        const t = el('table', 'fe-tab');
        if (a.kopf.length) { const tr = el('tr', ''); for (const k of a.kopf) tr.append(el('th', '', k)); t.append(el('thead', '')); t.tHead!.append(tr); }
        const tb = el('tbody', '');
        for (const z of a.zeilen) {
          const tr = el('tr', z.aktiv ? 'aktiv' : '');
          if (z.knopf) { tr.dataset.knopf = z.knopf; tr.classList.add('klickbar'); }
          for (const c of z.zellen) {
            const td = el('td', c.warn ? 'warn' : '');
            if (c.titel) td.title = c.titel;
            if (c.ware !== undefined) { td.append(this.ware(c.ware)); td.append(document.createTextNode(` ${c.text}`)); } else td.textContent = c.text;
            tr.append(td);
          }
          tb.append(tr);
        }
        t.append(tb);
        if (!a.zeilen.length) box.append(el('div', 'fe-leer', a.leer ?? 'nichts')); else box.append(t);
        break;
      }
      case 'rangliste': {
        for (const z of a.zeilen) {
          const r = el('div', 'fe-rang');
          r.append(this.ware(z.ware), el('span', 'fe-rang-name', z.text));
          const pl = el('div', 'fe-rang-plaetze');
          z.plaetze.forEach((p, i) => {
            const b = el('button', `fe-platz${p.betrifft ? '' : ' egal'}`);
            b.type = 'button';
            b.dataset.knopf = p.knopf;
            b.disabled = i === 0;
            b.title = i === 0 ? `${p.name}: bekommt ${z.text} zuerst` : `${p.name} eins nach vorn${p.betrifft ? '' : ' (nimmt diese Ware gar nicht)'}`;
            b.append(el('em', '', String(i + 1)), el('span', '', p.symbol), el('small', '', p.name));
            pl.append(b);
          });
          const std = el('button', 'fe-knopf fe-std', '↺');
          std.type = 'button'; std.dataset.knopf = `${z.id}:std`; std.disabled = z.standard; std.title = 'Standard-Reihenfolge';
          r.append(pl, std);
          box.append(r);
        }
        break;
      }
      case 'kurve': box.append(kurve(a)); break;
      case 'eingaben': {
        for (const f of a.felder) {
          const l = el('label', `fe-eingabe fe-${f.typ}`);
          if (f.hilfe) l.title = f.hilfe;
          if (f.typ === 'schalter') {
            const i = el('input', '');
            i.type = 'checkbox'; i.checked = !!f.wert; i.dataset.eingabe = f.id;
            l.append(i, el('span', '', f.text));
          } else if (f.typ === 'auswahl') {
            const s = el('select', '');
            s.dataset.eingabe = f.id;
            for (const o of f.optionen ?? []) { const op = el('option', '', o.text); op.value = o.wert; s.append(op); }
            s.value = String(f.wert);
            l.append(el('span', '', f.text), s);
          } else {
            const i = el('input', '');
            i.type = 'range'; i.min = String(f.min ?? 0); i.max = String(f.max ?? 100); i.step = String(f.schritt ?? 1);
            i.value = String(f.wert); i.dataset.eingabe = f.id; i.dataset.einheit = f.einheit ?? '';
            l.append(el('span', '', f.text), el('output', '', `${f.wert}${f.einheit ?? ''}`), i);
          }
          box.append(l);
        }
        break;
      }
    }
    return box;
  }

  private knopf(k: Knopf): HTMLButtonElement {
    const b = el('button', `fe-knopf${k.an ? ' an' : ''}${k.warn ? ' warn' : ''}`, k.text);
    b.type = 'button';
    b.dataset.knopf = k.id;
    b.disabled = !!k.aus;
    if (k.titel) b.title = k.titel;
    return b;
  }
}

/** Liniendiagramm als SVG: x in Spielminuten, eine Linie je Reihe, Achsen mit wenigen runden Marken. */
function kurve(a: Extract<Abschnitt, { art: 'kurve' }>): HTMLElement {
  const box = el('div', 'fe-kurvenbox');
  const pkt = a.reihen.flatMap((r) => r.punkte);
  if (pkt.length < 2) { box.append(el('div', 'fe-leer', a.leer ?? 'Noch zu wenig Daten – nach ein paar Spielminuten gibt es hier Kurven.')); return box; }
  const B = 340, H = 170, L = 40, U = 22, O = 8, R = 10;
  const xmax = Math.max(1, ...pkt.map((p) => p[0]));
  const ymax = Math.max(1, ...pkt.map((p) => p[1]));
  const schritt = (m: number) => { const r = Math.pow(10, Math.floor(Math.log10(m / 4))); return [1, 2, 5, 10].map((f) => f * r).find((s) => m / s <= 5) ?? r * 10; };
  const ys = schritt(ymax), xs = schritt(xmax);
  const yo = Math.ceil(ymax / ys) * ys;
  const X = (x: number) => L + ((B - L - R) * x) / xmax, Y = (y: number) => O + (H - O - U) * (1 - y / yo);
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', `0 0 ${B} ${H}`);
  svg.setAttribute('class', 'fe-kurve');
  const add = (tag: string, at: Record<string, string | number>, text?: string) => {
    const e = document.createElementNS(ns, tag);
    for (const [k, v] of Object.entries(at)) e.setAttribute(k, String(v));
    if (text) e.textContent = text;
    svg.append(e);
    return e;
  };
  for (let y = 0; y <= yo + 1e-9; y += ys) {
    add('line', { x1: L, x2: B - R, y1: Y(y), y2: Y(y), class: 'gitter' });
    add('text', { x: L - 5, y: Y(y) + 4, 'text-anchor': 'end', class: 'marke' }, String(Math.round(y * 10) / 10));
  }
  for (let x = 0; x <= xmax + 1e-9; x += xs) add('text', { x: X(x), y: H - 6, 'text-anchor': 'middle', class: 'marke' }, String(Math.round(x)));
  add('text', { x: B - R, y: H - 6 - 12, 'text-anchor': 'end', class: 'achse' }, a.xText);
  add('text', { x: L + 2, y: O + 10, class: 'achse' }, a.yText);
  for (const r of a.reihen) {
    if (!r.punkte.length) continue;
    const d = r.punkte.map((p, i) => `${i ? 'L' : 'M'}${X(p[0]).toFixed(1)},${Y(p[1]).toFixed(1)}`).join('');
    const pfad = add('path', { d, fill: 'none', stroke: r.farbe, 'stroke-width': 2, 'stroke-linejoin': 'round', class: 'linie' });
    const t = document.createElementNS(ns, 'title');
    t.textContent = `${r.name}: zuletzt ${r.punkte[r.punkte.length - 1][1]}`;
    pfad.append(t);
  }
  box.append(svg);
  if (a.reihen.length > 1) {
    const leg = el('div', 'fe-legende');
    for (const r of a.reihen) {
      const s = el('span', '');
      const f = el('i', '');
      f.style.background = r.farbe;
      s.append(f, document.createTextNode(r.name));
      leg.append(s);
    }
    box.append(leg);
  }
  return box;
}

/** Fensterfläche: hält die offenen Fenster, ihre Reihenfolge (oben = zuletzt angefasst) und ihre Lage. */
export class Fensterflaeche {
  private flaeche = el('div', 'fensterflaeche');
  private fenster: Fenster[] = [];
  private uhr = 0;
  private lagen: Record<string, { x: number; y: number }> = {};
  /** Mittlere Zeit einer Aktualisierung aller Fenster (ms), für die Leistungsanzeige und den Test. */
  messung = { ms: 0, max: 0, n: 0 };

  constructor(root: HTMLElement, private waren: WarenBilder) {
    root.append(this.flaeche);
    try { this.lagen = JSON.parse(localStorage.getItem(LAGE_SPEICHER) ?? '{}') ?? {}; } catch { this.lagen = {}; }
    addEventListener('resize', () => { for (const f of this.fenster) this.klemme(f); });
  }

  get anzahl(): number { return this.fenster.length; }
  get ids(): string[] { return this.fenster.map((f) => f.art.id); }
  istOffen(id: string): boolean { return this.fenster.some((f) => f.art.id === id); }
  angepinnt(id: string): boolean { return !!this.fenster.find((f) => f.art.id === id)?.angepinnt; }

  /** Öffnen oder (schon offen) nach vorn holen. Ein nicht angepinntes Fenster derselben Gruppe macht Platz. */
  oeffne(art: FensterArt): void {
    const da = this.fenster.find((f) => f.art.id === art.id);
    if (da) { da.art.daten = art.daten; this.vorne(da); da.aktualisiere(); return; }
    for (const f of [...this.fenster]) {
      if (f.angepinnt) continue;
      if (f.art.gruppe === art.gruppe || schmal()) this.weg(f);
    }
    const f = new Fenster(art, this.waren, () => this.weg(f), () => f.setzePin(!f.angepinnt), () => this.vorne(f));
    if (!f.aktualisiere()) return;
    this.fenster.push(f);
    this.flaeche.append(f.el);
    this.lage(f);
    this.ziehbar(f);
    this.vorne(f);
  }

  umschalten(art: FensterArt): void {
    if (this.istOffen(art.id)) this.schliesse(art.id); else this.oeffne(art);
  }

  schliesse(id: string): void {
    const f = this.fenster.find((x) => x.art.id === id);
    if (f) this.weg(f);
  }

  /** Esc: das oberste nicht angepinnte Fenster schließen; false, wenn keins da war. */
  schliesseOberstes(): boolean {
    for (let i = this.fenster.length - 1; i >= 0; i--) {
      if (!this.fenster[i].angepinnt) { this.weg(this.fenster[i]); return true; }
    }
    return false;
  }

  /** Alle Fenster einer Gruppe schließen (auch angepinnte nur mit `alle`). */
  schliesseGruppe(gruppe: string, alle = false): void {
    for (const f of [...this.fenster]) if (f.art.gruppe === gruppe && (alle || !f.angepinnt)) this.weg(f);
  }

  /** Sofort neu zeichnen (nach einer Bedienung, damit der Knopf gleich reagiert). */
  jetzt(id?: string): void {
    for (const f of [...this.fenster]) if (!id || f.art.id === id) if (!f.aktualisiere()) this.weg(f);
  }

  /** Live-Daten: alle TAKT_S Sekunden echter Zeit (4× je Sekunde) alle offenen Fenster aktualisieren; aus jedem Frame aufrufen. */
  takt(): void {
    const jetzt = performance.now();
    if (jetzt - this.uhr < TAKT_S * 1000) return;
    this.uhr = jetzt;
    if (!this.fenster.length) return;
    const t0 = performance.now();
    for (const f of [...this.fenster]) if (!f.aktualisiere()) this.weg(f);
    const ms = performance.now() - t0;
    this.messung.n++;
    this.messung.ms += (ms - this.messung.ms) / Math.min(this.messung.n, 20);
    this.messung.max = Math.max(this.messung.max, ms);
  }

  private weg(f: Fenster): void {
    const i = this.fenster.indexOf(f);
    if (i < 0) return;
    this.fenster.splice(i, 1);
    f.el.remove();
    f.art.onZu?.();
  }

  private vorne(f: Fenster): void {
    const i = this.fenster.indexOf(f);
    if (i >= 0 && i !== this.fenster.length - 1) { this.fenster.splice(i, 1); this.fenster.push(f); }
    this.fenster.forEach((x, j) => { x.el.style.zIndex = String(20 + j); x.el.classList.toggle('oben', j === this.fenster.length - 1); });
  }

  /** Lage: gemerkt je Gruppe, sonst gestaffelt rechts oben. */
  private lage(f: Fenster): void {
    if (schmal()) return;
    const l = this.lagen[f.art.gruppe === 'auswahl' ? 'auswahl' : f.art.id];
    const n = this.fenster.length - 1;
    const x = l ? l.x : innerWidth - f.el.getBoundingClientRect().width - 330 - (n % 4) * 28;
    const y = l ? l.y + (this.fenster.filter((g) => g.art.gruppe === f.art.gruppe).length - 1) * 26 : 70 + (n % 4) * 28;
    setze(f.el, x, y);
    this.klemme(f);
  }

  private klemme(f: Fenster): void {
    if (schmal()) { f.el.style.left = ''; f.el.style.top = ''; return; }
    const r = f.el.getBoundingClientRect();
    const x = Math.min(Math.max(4, r.left), innerWidth - Math.min(r.width, innerWidth) - 4);
    const y = Math.min(Math.max(4, r.top), innerHeight - 40);
    setze(f.el, x, y);
  }

  private ziehbar(f: Fenster): void {
    let start: { px: number; py: number; x: number; y: number; id: number } | null = null;
    f.kopf.addEventListener('pointerdown', (e) => {
      if (schmal() || (e.target as HTMLElement).closest('button')) return;
      const r = f.el.getBoundingClientRect();
      start = { px: e.clientX, py: e.clientY, x: r.left, y: r.top, id: e.pointerId };
      f.kopf.setPointerCapture(e.pointerId);
      e.preventDefault();
    });
    f.kopf.addEventListener('pointermove', (e) => {
      if (!start || e.pointerId !== start.id) return;
      setze(f.el, start.x + e.clientX - start.px, start.y + e.clientY - start.py);
      this.klemme(f);
    });
    const ende = (e: PointerEvent) => {
      if (!start || e.pointerId !== start.id) return;
      start = null;
      const r = f.el.getBoundingClientRect();
      this.lagen[f.art.gruppe === 'auswahl' ? 'auswahl' : f.art.id] = { x: Math.round(r.left), y: Math.round(r.top) };
      try { localStorage.setItem(LAGE_SPEICHER, JSON.stringify(this.lagen)); } catch { /* egal */ }
    };
    f.kopf.addEventListener('pointerup', ende);
    f.kopf.addEventListener('pointercancel', ende);
  }
}
