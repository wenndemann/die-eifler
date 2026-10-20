// Kartenwahl (Drehbuch 3.1): Auswahl-Hex auf der Übersichtskarte der ganzen Welt verschieben, Größe wählen,
// Ort eintippen, Vorschläge antippen, „Hier siedeln!“. Reines Canvas-2D und DOM, keine Bibliotheken.
import './kartenwahl.css';
import {
  GROESSEN, GROESSE_NAME, GROESSE_SPIELER, HEX, KACHEL, KULISSE, LAND, WELT, FLAG,
  type AusschnittParam, type Groesse, type OrtEintrag,
} from '../welt/format';
import {
  bigHexBounds, bigHexOutline, hexCount, hexDistance, hexRound, hexTileIndex, hexToWorld, hexesInRadius, worldToHex,
} from '../welt/hexwelt';
import { holeBildUrl, holeBytes, holeJson, type Welt } from '../welt/laden';
import { VORSCHLAEGE } from '../map/presets';
import { holeAutosave, leseSpielstand, type Spielstand } from '../spiel/spielstand';

/** Ergebnis der Kartenwahl: allein siedeln, mit Freunden (Lobby) oder einen Spielstand laden. */
export type KartenwahlErgebnis = { art: 'allein' | 'freunde'; param: AusschnittParam } | { art: 'laden'; spielstand: Spielstand };

/* ------------------------------------------------------------------ Reine Logik (getestet) */

/** Name zum Suchen vergleichbar machen: klein, ohne Akzente/Umlaute, „St.“ = „Sankt“, Bindestrich = Leerzeichen. */
export function normalisiere(s: string): string {
  let t = s.toLowerCase().replace(/ß/g, 'ss');
  t = t.normalize('NFD').replace(/[̀-ͯ]/g, '');
  t = t.replace(/(ae|oe|ue)/g, (m) => m[0]); // „gemuend“ = „gemund“ = „Gemünd“
  t = t.replace(/[-_]+/g, ' ').replace(/[^a-z0-9. ]+/g, '');
  t = t.replace(/\bst\.\s*/g, 'sankt ').replace(/\bst\s+/g, 'sankt ');
  return t.replace(/\./g, '').replace(/\s+/g, ' ').trim();
}

export interface OrtGruppe {
  name: string;
  norm: string;
  /** Alle Orte dieses Namens (mehr als einer = Dublette), Städte vor Dörfern. */
  eintraege: OrtEintrag[];
  rang: number;
}

/** Orte nach Namen gruppieren (gleicher normalisierter Name = eine Gruppe). */
export function gruppiereOrte(orte: OrtEintrag[]): OrtGruppe[] {
  const map = new Map<string, OrtGruppe>();
  for (const o of orte) {
    const norm = normalisiere(o[0]);
    let g = map.get(norm);
    if (!g) { g = { name: o[0], norm, eintraege: [], rang: 0 }; map.set(norm, g); }
    g.eintraege.push(o);
  }
  for (const g of map.values()) g.eintraege.sort((a, b) => a[1] - b[1] || a[7].localeCompare(b[7]));
  return [...map.values()];
}

/** Vorschläge beim Tippen: genau > Anfang > Wortanfang > Teilstück; innerhalb Städte zuerst, dann alphabetisch. */
export function sucheOrte(gruppen: OrtGruppe[], text: string, max = 8): OrtGruppe[] {
  const q = normalisiere(text);
  if (!q) return [];
  const treffer: OrtGruppe[] = [];
  for (const g of gruppen) {
    let rang = -1;
    if (g.norm === q) rang = 0;
    else if (g.norm.startsWith(q)) rang = 1;
    else if (g.norm.includes(' ' + q)) rang = 2;
    else if (q.length >= 3 && g.norm.includes(q)) rang = 3;
    if (rang >= 0) treffer.push({ ...g, rang });
  }
  treffer.sort((a, b) => a.rang - b.rang || a.eintraege[0][1] - b.eintraege[0][1] || a.name.localeCompare(b.name, 'de'));
  return treffer.slice(0, max);
}

const ZAHLWORT = ['null', 'eins', 'zwei', 'drei', 'vier', 'fünf', 'sechs', 'sieben', 'acht', 'neun', 'zehn', 'elf', 'zwölf'];
export const zahlWort = (n: number) => ZAHLWORT[n] ?? String(n);

/** Überschrift der Auswahlliste bei gleichnamigen Orten. */
export const dubletteUeberschrift = (name: string, n: number) => `Welches ${name}? Et jitt ${zahlWort(n)}.`;

const kachelKey = (tx: number, tz: number) => tx * 1000 + tz;

/** Liegt das Spielfeld-Rechteck samt Kulisse vollständig in der Vereinigung der gebauten 6-km-Kacheln? */
export function passtInKacheln(kacheln: ReadonlySet<number>, q: number, r: number, size: Groesse): boolean {
  const b = bigHexBounds(q, r, GROESSEN[size]);
  const x0 = b.x0 - KULISSE, z0 = b.z0 - KULISSE, x1 = b.x1 + KULISSE, z1 = b.z1 + KULISSE;
  if (x0 < 0 || z0 < 0 || x1 > WELT.SX || z1 > WELT.SZ) return false;
  const t = KACHEL.m;
  for (let tz = Math.floor(z0 / t); tz <= Math.ceil(z1 / t) - 1; tz++) {
    for (let tx = Math.floor(x0 / t); tx <= Math.ceil(x1 / t) - 1; tx++) {
      if (!kacheln.has(kachelKey(tx, tz))) return false;
    }
  }
  return true;
}

/** Warum reicht das Hex nicht in die gebauten Kacheln? Weltrand (Drehbuch 3.1) oder Ende der Kacheln dieser Datenversion. */
export type KlemmGrund = 'weltrand' | 'kachelende';

/**
 * Grund, warum Spielfeld + Kulisse bei (q, r) nicht passen; null = passt. Fehlt irgendeine Kachel innerhalb der Welt,
 * ist es das Ende der Kacheln (Teilgebiet / Teilen-Version), sonst ragt das Rechteck über den Weltrand.
 */
export function klemmGrund(kacheln: ReadonlySet<number>, q: number, r: number, size: Groesse): KlemmGrund | null {
  if (passtInKacheln(kacheln, q, r, size)) return null;
  const b = bigHexBounds(q, r, GROESSEN[size]);
  const x0 = Math.max(0, b.x0 - KULISSE), z0 = Math.max(0, b.z0 - KULISSE);
  const x1 = Math.min(WELT.SX, b.x1 + KULISSE), z1 = Math.min(WELT.SZ, b.z1 + KULISSE);
  const t = KACHEL.m;
  for (let tz = Math.floor(z0 / t); tz <= Math.ceil(z1 / t) - 1; tz++) {
    for (let tx = Math.floor(x0 / t); tx <= Math.ceil(x1 / t) - 1; tx++) {
      if (!kacheln.has(kachelKey(tx, tz))) return 'kachelende';
    }
  }
  return 'weltrand';
}

/** Meldung, wenn das Hex verschoben wurde. ziel = Ortsname (oder Vorschlag), der eigentlich in der Mitte liegen sollte. */
export function klemmMeldung(grund: KlemmGrund, ziel?: string): string {
  if (grund === 'kachelende') {
    return ziel
      ? `Hier enden die Kacheln dieser Version – ${ziel} liegt deshalb nicht in der Mitte.`
      : 'Hier enden die Kacheln dieser Version – das Hex ist deshalb nach innen gerückt.';
  }
  return ziel
    ? `${ziel} liegt zu nah am Weltrand – das Hex ist nach innen gerückt, ${ziel} sitzt nicht ganz in der Mitte.`
    : 'Zu nah am Weltrand – das Hex ist nach innen gerückt.';
}

export interface KlemmErgebnis {
  q: number; r: number; geklemmt: boolean; passt: boolean;
  /** Nur wenn geklemmt: warum das gewünschte Hex nicht passte. */
  grund?: KlemmGrund;
}

/**
 * Mittel-Hex nach innen schieben, bis Spielfeld + 2000 m Kulisse in den gebauten Kacheln liegen
 * (gleiche Logik wie klemmeAusschnitt in welt/ausschnitt.ts). Das Hex wandert Schritt für Schritt
 * in Richtung Mitte der gebauten Fläche. passt=false: auch dort ist kein Platz (Größe zu groß).
 */
export function klemme(kacheln: [number, number][], q: number, r: number, size: Groesse): KlemmErgebnis {
  const set = new Set(kacheln.map(([tx, tz]) => kachelKey(tx, tz)));
  if (passtInKacheln(set, q, r, size)) return { q, r, geklemmt: false, passt: true };
  if (!kacheln.length) return { q, r, geklemmt: false, passt: false };
  const grund = klemmGrund(set, q, r, size) ?? 'kachelende';
  let sx = 0, sz = 0;
  for (const [tx, tz] of kacheln) { sx += (tx + 0.5) * KACHEL.m; sz += (tz + 0.5) * KACHEL.m; }
  const ziel = worldToHex(sx / kacheln.length, sz / kacheln.length);
  const d = hexDistance({ q, r }, ziel);
  for (let i = 1; i <= d; i++) {
    const t = i / d;
    const h = hexRound(q + (ziel.q - q) * t, r + (ziel.r - r) * t);
    if (passtInKacheln(set, h.q, h.r, size)) return { q: h.q, r: h.r, geklemmt: true, passt: true, grund };
  }
  return { q: ziel.q, r: ziel.r, geklemmt: true, passt: passtInKacheln(set, ziel.q, ziel.r, size), grund };
}

/** Fläche in km² und Breite in km eines Spielfelds. */
export function groesseMasse(size: Groesse) {
  const n = GROESSEN[size];
  const w = Math.sqrt(3) * HEX.R;
  const flaeche = hexCount(n) * (1.5 * Math.sqrt(3) * HEX.R * HEX.R) / 1e6;
  return { flaeche, breite: (2 * n + 1) * w / 1000, hexe: hexCount(n) };
}

/* ------------------------------------------------------------------ Hilfen */

const SPEICHER = 'eifeler.kartenwahl';
/** Meldungen (Klemmen) bleiben lange genug stehen, damit man sie auf dem Handy in Ruhe lesen kann. */
const TOAST_MS = 7000;
const GROESSEN_LISTE: Groesse[] = ['klein', 'mittel', 'gross'];
const LAND_NAME: Record<string, string> = { DE: 'Deutschland', BE: 'Belgien', LU: 'Luxemburg', NL: 'Niederlande' };
const ZIFFERN = new Intl.NumberFormat('de-DE');
const dez = (x: number, n = 1) => x.toLocaleString('de-DE', { maximumFractionDigits: n, minimumFractionDigits: n });

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
}

function lies(): Partial<AusschnittParam> | null {
  try {
    const s = localStorage.getItem(SPEICHER);
    return s ? (JSON.parse(s) as Partial<AusschnittParam>) : null;
  } catch { return null; }
}
function merke(a: AusschnittParam) {
  try { localStorage.setItem(SPEICHER, JSON.stringify(a)); } catch { /* privater Modus: egal */ }
}

function imPolygon(px: number, pz: number, poly: { x: number; z: number }[]): boolean {
  let in_ = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a.z > pz) !== (b.z > pz) && px < ((b.x - a.x) * (pz - a.z)) / (b.z - a.z) + a.x) in_ = !in_;
  }
  return in_;
}

interface Wanderweg { n: string; ref: string; netz: string; p: number[][] }
interface WegDraw { name: string; ref: string; steige: boolean; linien: { pts: Float32Array; x0: number; z0: number; x1: number; z1: number }[] }
interface Anteile { wasser: number; wald: number; wiese: number; heide: number; stein: number; siedlung: number; bebaubar: number; n: number }

// Hex-Kachel: terrain uint8[4096], height uint16[4096], slope uint8[4096], build, flags (FORMAT.md)
const OFF_BUILD = 4096 + 8192 + 4096;
const OFF_FLAGS = OFF_BUILD + 4096;

/* ------------------------------------------------------------------ Die Kartenwahl */

export function zeigeKartenwahl(root: HTMLElement, welt: Welt): Promise<KartenwahlErgebnis> {
  return new Promise<KartenwahlErgebnis>((fertig) => {
    const man = welt.manifest;
    const kacheln = man.kacheln;
    const kachelSet = new Set(kacheln.map(([a, b]) => kachelKey(a, b)));
    /** Datenversion deckt nicht die ganze Welt ab (Teilgebiet / Teilen-Version). */
    const teilgebiet = man.gebiet !== 'welt';
    const gruppen = gruppiereOrte(welt.orte.orte);
    const kinds = welt.orte.kinds;

    /* --- Zustand --- */
    let size: Groesse = 'mittel';
    let q = 0, r = 0;
    let marke: { x: number; z: number; name: string } | null = null;
    const view = { cx: WELT.SX / 2, cz: WELT.SZ / 2, s: 0.01 };
    let W = 0, H = 0, dpr = 1;
    let relief: HTMLImageElement | null = null;
    let wege: WegDraw[] = [];
    let grenzen: number[][] = [];
    let hoehe: Uint16Array | null = null;
    let hoverWeg: WegDraw | null = null;
    let fertigGeladen = false;

    /* --- DOM --- */
    const wurzel = el('div', 'kw');
    const karte = el('div', 'kw-karte');
    const canvas = el('canvas', 'kw-canvas');
    const ctx = canvas.getContext('2d')!;
    const tip = el('div', 'kw-tip');
    const toast = el('div', 'kw-toast');
    const zoomBox = el('div', 'kw-zoom');
    karte.append(canvas, tip, toast, zoomBox);

    const leiste = el('aside', 'kw-leiste');
    const griff = el('button', 'kw-griff');
    griff.type = 'button';
    const scroll = el('div', 'kw-scroll');
    const fuss = el('div', 'kw-fuss');
    leiste.append(griff, scroll, fuss);
    wurzel.append(karte, leiste);

    // Kopf
    const kopf = el('header', 'kw-kopf');
    const wappen = el('div', 'kw-wappen', 'E');
    const kopfText = el('div', 'kw-kopftext');
    kopfText.append(el('b', '', 'Wo darf’s sein?'), el('span', '', 'Schieb das Sechseck dorthin, wo ihr siedeln wollt.'));
    kopf.append(wappen, kopfText);

    // Größe
    const groesseBox = el('section', 'kw-block');
    groesseBox.append(el('h3', '', 'Größe'));
    const groesseReihe = el('div', 'kw-groessen');
    const groesseKnoepfe = new Map<Groesse, HTMLButtonElement>();
    for (const g of GROESSEN_LISTE) {
      const m = groesseMasse(g);
      const b = el('button', 'kw-groesse');
      b.type = 'button';
      b.append(el('b', '', GROESSE_NAME[g]), el('span', '', `ca. ${ZIFFERN.format(Math.round(m.flaeche))} km²`),
        el('span', '', `${dez(m.breite)} km breit`), el('span', 'kw-spieler', `${GROESSE_SPIELER[g][0]}–${GROESSE_SPIELER[g][1]} Spieler`));
      b.addEventListener('click', () => setzeGroesse(g));
      groesseKnoepfe.set(g, b);
      groesseReihe.append(b);
    }
    groesseBox.append(groesseReihe);

    // Suche
    const sucheBox = el('section', 'kw-block');
    sucheBox.append(el('h3', '', 'Ort suchen'));
    const eingabe = el('input', 'kw-suche');
    eingabe.type = 'search';
    eingabe.placeholder = 'z. B. Gemünd, Monschau, St. Vith …';
    eingabe.autocomplete = 'off';
    eingabe.spellcheck = false;
    eingabe.setAttribute('aria-label', 'Ort suchen');
    const vorschlagListe = el('div', 'kw-treffer');
    sucheBox.append(eingabe, vorschlagListe);

    // Info
    const infoBox = el('section', 'kw-block kw-info');

    // Vorschläge
    const vorBox = el('section', 'kw-block');
    vorBox.append(el('h3', '', 'Vorschläge'));
    const vorListe = el('div', 'kw-vorschlaege');
    for (const v of VORSCHLAEGE) {
      const b = el('button', 'kw-vorschlag');
      b.type = 'button';
      b.append(el('b', '', v.name), el('span', '', v.text), el('em', '', GROESSE_NAME[v.size]));
      b.addEventListener('click', () => {
        size = v.size;
        setzeMitte(v.q, v.r, v.name);
        zoomZumHex();
      });
      vorListe.append(b);
    }
    vorBox.append(vorListe);
    if (!VORSCHLAEGE.length) vorBox.hidden = true;

    scroll.append(kopf, groesseBox, sucheBox, infoBox, vorBox);
    if (teilgebiet) {
      const hinweis = el('section', 'kw-block kw-teil');
      hinweis.append(el('h3', '', 'Teilgebiet'));
      hinweis.append(el('p', '', `Diese Version enthält nur einen Teil der Welt (${man.gebiet}, ${kacheln.length} Kacheln). Die schraffierten Bereiche der Karte haben keine Kacheln – dort kann man nicht siedeln.`));
      scroll.append(hinweis);
    }

    // Fuß: Kurzstatus + Los
    const kurz = el('div', 'kw-kurz');
    const los = el('button', 'kw-los', 'Hier siedeln!');
    los.type = 'button';
    // Mehrspieler (M6) und Spielstand
    const extra = el('div', 'kw-extra');
    const freunde = el('button', 'kw-freunde', '👥 Mit Freunden spielen');
    freunde.type = 'button';
    freunde.title = 'Raum eröffnen und Freunde per Link einladen – ohne Konto, nur mit Namen';
    const laden = el('label', 'kw-freunde', '📂 Spielstand laden');
    const datei = el('input');
    datei.type = 'file'; datei.accept = '.json,application/json'; datei.hidden = true;
    laden.append(datei);
    extra.append(freunde, laden);
    // Autosave (M7): der letzte automatisch gespeicherte Stand
    const auto = holeAutosave();
    const fortsetzen = el('button', 'kw-freunde kw-autosave', `⏱ Weiterspielen${auto?.ort ? ` (${auto.ort})` : ''}`);
    fortsetzen.type = 'button';
    fortsetzen.title = auto ? `Autosave vom ${new Date(auto.stand.gespeichert).toLocaleString('de-DE')}` : '';
    if (auto) extra.append(fortsetzen);
    fuss.append(kurz, los, extra);

    // Zoom-Knöpfe
    const mkZoom = (text: string, titel: string, f: () => void, cls = '') => {
      const b = el('button', 'kw-zbtn ' + cls, text);
      b.type = 'button';
      b.title = titel;
      b.setAttribute('aria-label', titel);
      b.addEventListener('click', f);
      zoomBox.append(b);
      return b;
    };
    mkZoom('+', 'Hineinzoomen', () => zoomUm(1.6));
    mkZoom('−', 'Herauszoomen', () => zoomUm(1 / 1.6));
    mkZoom('Hex', 'Zum Auswahl-Hex', () => zoomZumHex(), 'text');
    mkZoom('Alles', 'Ganze Karte', () => zoomAufGebaut(), 'text');

    root.append(wurzel);

    /* --- Karte: Koordinaten --- */
    const sx = (x: number) => (x - view.cx) * view.s + W / 2;
    const sz = (z: number) => (z - view.cz) * view.s + H / 2;
    const wx = (px: number) => (px - W / 2) / view.s + view.cx;
    const wz = (py: number) => (py - H / 2) / view.s + view.cz;
    const sMin = () => Math.max(1e-4, Math.min(W / WELT.SX, H / WELT.SZ) * 0.85);
    const S_MAX = 0.35;

    function begrenze() {
      view.s = Math.min(S_MAX, Math.max(sMin(), view.s));
      view.cx = Math.min(WELT.SX, Math.max(0, view.cx));
      view.cz = Math.min(WELT.SZ, Math.max(0, view.cz));
    }

    function zoomUm(f: number, px = W / 2, py = H / 2) {
      const x = wx(px), z = wz(py);
      view.s *= f;
      view.s = Math.min(S_MAX, Math.max(sMin(), view.s));
      view.cx = x - (px - W / 2) / view.s;
      view.cz = z - (py - H / 2) / view.s;
      begrenze();
      zeichne();
    }

    function passeEin(x0: number, z0: number, x1: number, z1: number, rand = 0.9) {
      view.s = Math.min(S_MAX, Math.max(sMin(), Math.min(W / (x1 - x0), H / (z1 - z0)) * rand));
      view.cx = (x0 + x1) / 2;
      view.cz = (z0 + z1) / 2;
      begrenze();
      zeichne();
    }

    function zoomAufGebaut() {
      let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
      for (const [tx, tz] of kacheln) {
        x0 = Math.min(x0, tx * KACHEL.m); z0 = Math.min(z0, tz * KACHEL.m);
        x1 = Math.max(x1, (tx + 1) * KACHEL.m); z1 = Math.max(z1, (tz + 1) * KACHEL.m);
      }
      if (!isFinite(x0)) { x0 = 0; z0 = 0; x1 = WELT.SX; z1 = WELT.SZ; }
      passeEin(x0, z0, x1, z1, 0.94);
    }

    function zoomZumHex() {
      const b = bigHexBounds(q, r, GROESSEN[size]);
      passeEin(b.x0 - KULISSE, b.z0 - KULISSE, b.x1 + KULISSE, b.z1 + KULISSE, 0.62);
    }

    /* --- Auswahl --- */
    const radius = () => GROESSEN[size];

    /** ziel: Name des Orts/Vorschlags, der in die Mitte sollte (für die Meldung); mitMarke: Ort auf der Karte markieren. */
    function setzeMitte(nq: number, nr: number, ziel?: string, mitMarke = false, meldung = true) {
      const k = klemme(kacheln, nq, nr, size);
      q = k.q; r = k.r;
      toast.classList.remove('an'); // alte Meldung weg, sobald eine neue Aktion kommt
      if (!k.passt) toastZeigen('Für diese Größe ist hier noch nicht genug Karte gebaut.');
      else if (k.geklemmt && k.grund && meldung) toastZeigen(klemmMeldung(k.grund, ziel));
      marke = ziel && mitMarke ? { ...hexToWorld(nq, nr), name: ziel } : null;
      nachAenderung();
    }

    function setzeGroesse(g: Groesse) {
      if (g === size) return;
      size = g;
      setzeMitte(q, r);
      zoomZumHex();
    }

    /** Beim Ziehen: nur klemmen, keine Meldung, kein Neuzeichnen der Seitenleiste bei jedem Pixel. */
    function ziehe(nq: number, nr: number) {
      const k = klemme(kacheln, nq, nr, size);
      if (k.q === q && k.r === r) return;
      q = k.q; r = k.r; marke = null;
      if (k.geklemmt && k.grund) {
        const t = klemmMeldung(k.grund);
        if (toast.textContent !== t || !toast.classList.contains('an')) toastZeigen(t);
      }
      zeichne();
      planeInfo();
    }

    function nachAenderung() {
      zeichneGroessenKnoepfe();
      zeichne();
      aktualisiereInfo();
      merke({ version: welt.version, q, r, size });
    }

    let toastTimer = 0;
    function toastZeigen(t: string) {
      toast.textContent = t;
      toast.classList.add('an');
      clearTimeout(toastTimer);
      toastTimer = window.setTimeout(() => toast.classList.remove('an'), TOAST_MS);
    }

    /* --- Auswertung des Hex --- */
    interface Auswertung {
      starts: OrtEintrag[]; seen: string[]; laender: string[]; grenze: boolean;
      hoch: number | null; tief: number | null;
    }
    let ausw: Auswertung = { starts: [], seen: [], laender: [], grenze: false, hoch: null, tief: null };
    let anteile: Anteile | null = null;
    let infoTimer = 0;
    let anteilToken = 0;

    function planeInfo() {
      clearTimeout(infoTimer);
      infoTimer = window.setTimeout(() => { merke({ version: welt.version, q, r, size }); aktualisiereInfo(); }, 160);
    }

    function werteAus(): Auswertung {
      const n = radius();
      const mitte = { q, r };
      const starts = welt.orte.orte.filter((o) => hexDistance(mitte, { q: o[5], r: o[6] }) <= n);
      starts.sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0], 'de'));
      const poly = bigHexOutline(q, r, n);
      const seen = welt.orte.gewaesser.filter((g) => imPolygon(g[1], g[2], poly)).map((g) => g[0]);
      const laender = [...new Set(starts.map((o) => LAND[o[4]]).filter(Boolean))];
      // Grenzlinien im Hex: Segmente alle ~150 m abtasten
      let grenze = false;
      const b = bigHexBounds(q, r, n);
      outer: for (const l of grenzen) {
        for (let i = 0; i + 3 < l.length; i += 2) {
          const ax = l[i], az = l[i + 1], bx = l[i + 2], bz = l[i + 3];
          if (Math.max(ax, bx) < b.x0 || Math.min(ax, bx) > b.x1 || Math.max(az, bz) < b.z0 || Math.min(az, bz) > b.z1) continue;
          const len = Math.hypot(bx - ax, bz - az);
          const k = Math.max(1, Math.ceil(len / 150));
          for (let j = 0; j <= k; j++) {
            if (imPolygon(ax + ((bx - ax) * j) / k, az + ((bz - az) * j) / k, poly)) { grenze = true; break outer; }
          }
        }
      }
      // Höhe aus dem 200-m-Raster
      let hoch: number | null = null, tief: number | null = null;
      if (hoehe) {
        const GX = Math.round(WELT.SX / 200);
        const x0 = Math.max(0, Math.floor(b.x0 / 200)), x1 = Math.min(GX - 1, Math.floor(b.x1 / 200));
        const z0 = Math.max(0, Math.floor(b.z0 / 200)), z1 = Math.min(Math.round(WELT.SZ / 200) - 1, Math.floor(b.z1 / 200));
        for (let gz = z0; gz <= z1; gz++) {
          for (let gx = x0; gx <= x1; gx++) {
            const v = hoehe[gz * GX + gx];
            if (v === 0) continue;
            const px = gx * 200 + 100, pz = gz * 200 + 100;
            if (!kachelSet.has(kachelKey(Math.floor(px / KACHEL.m), Math.floor(pz / KACHEL.m)))) continue;
            if (hexDistance(mitte, worldToHex(px, pz)) > n) continue;
            if (hoch === null || v > hoch) hoch = v;
            if (tief === null || v < tief) tief = v;
          }
        }
      }
      return { starts, seen, laender, grenze, hoch: hoch === null ? null : hoch / 10, tief: tief === null ? null : tief / 10 };
    }

    const hexKachelCache = new Map<number, Promise<Uint8Array | null>>();
    function hexKachel(hx: number, hz: number): Promise<Uint8Array | null> {
      const k = hx * 1000 + hz;
      let p = hexKachelCache.get(k);
      if (!p) {
        p = holeBytes(welt.datei(`hex/${hx}_${hz}.bin.gz`)).catch(() => null);
        hexKachelCache.set(k, p);
      }
      return p;
    }

    /** Anteile Wald/Wasser/… aus den Hex-Kacheln (terrain, build, flags). */
    async function berechneAnteile(token: number) {
      const n = radius();
      const hexe = [...hexesInRadius(q, r, n)];
      const brauch = new Set<string>();
      for (const h of hexe) {
        const t = hexTileIndex(h.q, h.r);
        if (t) brauch.add(`${t.hx},${t.hz}`);
      }
      const daten = new Map<string, Uint8Array | null>();
      await Promise.all([...brauch].map(async (key) => {
        const [hx, hz] = key.split(',').map(Number);
        daten.set(key, await hexKachel(hx, hz));
      }));
      if (token !== anteilToken) return;
      const idx = man.hex.terrain;
      const zaehl: Record<string, number> = {};
      let gesamt = 0, bebaubar = 0;
      for (const h of hexe) {
        const t = hexTileIndex(h.q, h.r);
        const d = t ? daten.get(`${t.hx},${t.hz}`) : null;
        if (!t || !d || d.length < OFF_FLAGS + 4096) continue;
        if (d[OFF_FLAGS + t.i] & FLAG.keineDaten) continue;
        const name = idx[d[t.i]];
        zaehl[name] = (zaehl[name] ?? 0) + 1;
        gesamt++;
        if (d[OFF_BUILD + t.i] > 0) bebaubar++;
      }
      if (!gesamt) { anteile = null; zeichneInfo(); return; }
      const p = (k: string) => ((zaehl[k] ?? 0) / gesamt) * 100;
      anteile = { wasser: p('wasser'), wald: p('wald'), wiese: p('wiese'), heide: p('heide') + p('moor'), stein: p('stein'), siedlung: p('siedlung'), bebaubar: (bebaubar / gesamt) * 100, n: gesamt };
      zeichneInfo();
    }

    function aktualisiereInfo() {
      ausw = werteAus();
      anteile = null;
      const token = ++anteilToken;
      zeichneInfo();
      void berechneAnteile(token);
    }

    function zeichneInfo() {
      const [minSp, maxSp] = GROESSE_SPIELER[size];
      const n = ausw.starts.length;
      infoBox.replaceChildren();
      const status = el('div', 'kw-status');
      let klasse = 'ok';
      let los_ok = true;
      let losText = 'Hier siedeln!';
      let kurzText = `${n} Startplätze · ${GROESSE_NAME[size]}`;
      if (!kachelHatPlatz()) {
        klasse = 'schlecht'; los_ok = false;
        status.append(el('b', '', 'Hier ist noch Nebel.'), el('span', '', 'Für diese Größe sind an dieser Stelle noch keine Karten gebaut.'));
        kurzText = 'Noch nicht gebaut';
      } else if (n === 0) {
        klasse = 'schlecht'; los_ok = false;
        status.append(el('b', '', 'Hier wohnt keiner.'), el('span', '', 'Kein einziger Ortskern im Hex. Nur Wind, Wald und Nebel.'));
        kurzText = 'Hier wohnt keiner.';
      } else if (n < minSp) {
        klasse = 'warn'; losText = 'Trotzdem siedeln!';
        status.append(el('b', '', `Zu wenig Dörfer für ${minSp} Spieler.`), el('span', '', `${n} Startplatz${n === 1 ? '' : 'e'} – es wird eng.`));
        kurzText = `Zu wenig Dörfer (${n})`;
      } else {
        status.append(el('b', '', `${n} Startplätze`), el('span', '', `Reicht für ${minSp}–${maxSp} Spieler.`));
      }
      status.classList.add(klasse);
      infoBox.append(el('h3', '', 'Im Hex'), status);
      if (n) {
        const chips = el('div', 'kw-chips');
        const zeig = ausw.starts.slice(0, 7);
        for (const o of zeig) {
          const c = el('button', 'kw-chip ' + (kinds[o[1]] ?? ''), o[0]);
          c.type = 'button';
          c.title = 'Dorf in die Mitte setzen';
          c.addEventListener('click', () => waehleOrt(o));
          chips.append(c);
        }
        if (n > zeig.length) chips.append(el('span', 'kw-mehr', `+ ${n - zeig.length} weitere`));
        infoBox.append(chips);
      }
      const rows = el('dl', 'kw-werte');
      const zeile = (k: string, v: string | Node) => { rows.append(el('dt', '', k)); const d = el('dd'); d.append(v); rows.append(d); };
      if (ausw.hoch !== null && ausw.tief !== null) {
        zeile('Höhen', `${Math.round(ausw.tief)} bis ${Math.round(ausw.hoch)} m ü. NN`);
      }
      if (anteile) {
        const bar = el('div', 'kw-bar');
        const teile: [string, number, string][] = [['wald', anteile.wald, 'Wald'], ['wiese', anteile.wiese, 'Wiese und Acker'], ['heide', anteile.heide, 'Heide und Moor'], ['stein', anteile.stein, 'Fels'], ['wasser', anteile.wasser, 'Wasser'], ['siedlung', anteile.siedlung, 'Ortskern']];
        for (const [k, v, t] of teile) {
          if (v < 0.5) continue;
          const s = el('i', 'kw-t-' + k);
          s.style.flexGrow = String(v);
          s.title = `${t} ${Math.round(v)} %`;
          bar.append(s);
        }
        const wrap = el('div');
        wrap.append(bar, el('span', 'kw-bar-text', `Wald ${Math.round(anteile.wald)} % · Wasser ${Math.round(anteile.wasser)} % · bebaubar ${Math.round(anteile.bebaubar)} %`));
        zeile('Land', wrap);
      }
      if (ausw.seen.length) zeile('Gewässer', ausw.seen.slice(0, 5).join(', ') + (ausw.seen.length > 5 ? ' …' : ''));
      const namen = ausw.laender.map((l) => LAND_NAME[l] ?? l);
      if (namen.length) zeile('Länder', namen.join(', '));
      infoBox.append(rows);
      if (ausw.laender.length > 1 || ausw.grenze) {
        infoBox.append(el('p', 'kw-zoll', 'Über die Grenze: Zöllner inklusive.'));
      }
      kurz.textContent = kurzText;
      kurz.className = 'kw-kurz ' + klasse;
      los.disabled = !los_ok;
      freunde.disabled = !los_ok;
      los.textContent = losText;
    }

    function kachelHatPlatz() { return passtInKacheln(kachelSet, q, r, size); }

    function zeichneGroessenKnoepfe() {
      for (const g of GROESSEN_LISTE) {
        const b = groesseKnoepfe.get(g)!;
        b.classList.toggle('aktiv', g === size);
        b.setAttribute('aria-pressed', String(g === size));
        const passt = klemme(kacheln, q, r, g).passt;
        b.disabled = !passt;
        b.title = passt ? '' : 'Dafür ist hier noch nicht genug Karte gebaut.';
      }
    }

    /* --- Suche --- */
    let treffer: OrtGruppe[] = [];
    let aktivTreffer = -1;

    function zeigeTreffer() {
      vorschlagListe.replaceChildren();
      treffer = sucheOrte(gruppen, eingabe.value);
      aktivTreffer = treffer.length ? 0 : -1;
      if (!treffer.length) {
        if (eingabe.value.trim()) vorschlagListe.append(el('div', 'kw-leer', 'Kenn ich nicht. Gibt’s das überhaupt in der Eifel?'));
        return;
      }
      treffer.forEach((g, i) => {
        const b = el('button', 'kw-tr');
        b.type = 'button';
        b.dataset.i = String(i);
        const e0 = g.eintraege[0];
        b.append(el('b', '', g.name));
        b.append(el('span', '', g.eintraege.length > 1 ? `${g.eintraege.length}× in der Eifel` : (kinds[e0[1]] ?? '') + (e0[7] ? ` bei ${e0[7]}` : '')));
        b.addEventListener('click', () => waehleGruppe(g));
        vorschlagListe.append(b);
      });
      markiereTreffer();
    }

    function markiereTreffer() {
      [...vorschlagListe.children].forEach((c, i) => c.classList.toggle('akt', i === aktivTreffer));
    }

    function waehleGruppe(g: OrtGruppe) {
      if (g.eintraege.length === 1) { waehleOrt(g.eintraege[0]); return; }
      vorschlagListe.replaceChildren();
      vorschlagListe.append(el('div', 'kw-dub', dubletteUeberschrift(g.name, g.eintraege.length)));
      for (const o of g.eintraege) {
        const b = el('button', 'kw-tr');
        b.type = 'button';
        b.append(el('b', '', o[0]), el('span', '', o[7] ? `bei ${o[7]}` : (kinds[o[1]] ?? '')));
        b.addEventListener('click', () => waehleOrt(o));
        vorschlagListe.append(b);
      }
      treffer = []; aktivTreffer = -1;
    }

    function waehleOrt(o: OrtEintrag) {
      eingabe.value = o[0];
      vorschlagListe.replaceChildren();
      treffer = [];
      setzeMitte(o[5], o[6], o[0], true);
      zoomZumHex();
    }

    eingabe.addEventListener('input', zeigeTreffer);
    eingabe.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        if (!treffer.length) return;
        e.preventDefault();
        aktivTreffer = (aktivTreffer + (e.key === 'ArrowDown' ? 1 : -1) + treffer.length) % treffer.length;
        markiereTreffer();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (!treffer.length) zeigeTreffer();
        const g = treffer[Math.max(0, aktivTreffer)];
        if (g) waehleGruppe(g);
      } else if (e.key === 'Escape') {
        eingabe.value = ''; vorschlagListe.replaceChildren(); treffer = [];
      }
    });

    /* --- Mobil: Leiste ein-/ausklappen --- */
    let offen = false;
    function setzeOffen(o: boolean) {
      offen = o;
      wurzel.classList.toggle('offen', o);
      griff.textContent = o ? '▼  Einstellungen einklappen' : '▲  Größe, Ort, Vorschläge';
      griff.setAttribute('aria-expanded', String(o));
    }
    griff.addEventListener('click', () => { setzeOffen(!offen); zumHexNachResize = true; });
    setzeOffen(false);

    /* --- Zeichnen --- */
    let rafOffen = false;
    function zeichne() {
      if (rafOffen) return;
      rafOffen = true;
      requestAnimationFrame(() => { rafOffen = false; maleKarte(); });
    }

    interface Rect { x: number; y: number; w: number; h: number }
    const frei = (belegt: Rect[], r_: Rect) => !belegt.some((b) => r_.x < b.x + b.w && r_.x + r_.w > b.x && r_.y < b.y + b.h && r_.y + r_.h > b.y);

    function maleKarte() {
      if (!W || !H) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = '#23262a';
      ctx.fillRect(0, 0, W, H);
      const s = view.s;
      // Weltrahmen und Relief
      ctx.fillStyle = '#2d3136';
      ctx.fillRect(sx(0), sz(0), WELT.SX * s, WELT.SZ * s);
      if (relief && relief.complete && relief.naturalWidth) {
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(relief, sx(0), sz(0), WELT.SX * s, WELT.SZ * s);
      }
      // Ungebaute Kacheln abdunkeln (Weltrechteck minus gebaute Kacheln, even-odd)
      ctx.save();
      ctx.beginPath();
      ctx.rect(sx(0), sz(0), WELT.SX * s, WELT.SZ * s);
      for (const [tx, tz] of kacheln) ctx.rect(sx(tx * KACHEL.m), sz(tz * KACHEL.m), KACHEL.m * s, KACHEL.m * s);
      ctx.fillStyle = 'rgba(14, 16, 18, 0.72)';
      ctx.fill('evenodd');
      // Teilgebiet (Teilen-Version, Probedaten): zusätzlich schraffieren, damit man sieht, wo Kacheln fehlen
      const muster = teilgebiet ? schraffur() : null;
      if (muster) {
        ctx.fillStyle = muster;
        ctx.fill('evenodd');
      }
      ctx.restore();
      // Hinweis in ungebauten Kacheln (nur wenn groß genug)
      if (KACHEL.m * s > 150) {
        ctx.font = 'italic 500 13px "Alegreya Sans", sans-serif';
        ctx.fillStyle = 'rgba(231,194,122,0.55)';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        const tx0 = Math.max(0, Math.floor(wx(0) / KACHEL.m)), tx1 = Math.min(man.tiles[0] - 1, Math.floor(wx(W) / KACHEL.m));
        const tz0 = Math.max(0, Math.floor(wz(0) / KACHEL.m)), tz1 = Math.min(man.tiles[1] - 1, Math.floor(wz(H) / KACHEL.m));
        for (let tz = tz0; tz <= tz1; tz++) for (let tx = tx0; tx <= tx1; tx++) {
          if (kachelSet.has(kachelKey(tx, tz))) continue;
          ctx.fillText('Noch Nebel hier', sx((tx + 0.5) * KACHEL.m), sz((tz + 0.5) * KACHEL.m));
        }
      }

      maleGrenzen();
      maleWege();
      maleHex();
      maleBeschriftung();
      maleMassstab();
    }

    let schraffurMuster: CanvasPattern | null = null;
    /** Feine Diagonallinien als Muster (einmal erzeugt). */
    function schraffur(): CanvasPattern | null {
      if (schraffurMuster) return schraffurMuster;
      const c = document.createElement('canvas');
      c.width = c.height = 14;
      const g = c.getContext('2d');
      if (!g) return null;
      g.strokeStyle = 'rgba(231, 194, 122, 0.22)';
      g.lineWidth = 1.5;
      g.beginPath();
      g.moveTo(-2, 16); g.lineTo(16, -2);
      g.moveTo(-2, 2); g.lineTo(2, -2);
      g.moveTo(12, 16); g.lineTo(16, 12);
      g.stroke();
      schraffurMuster = ctx.createPattern(c, 'repeat');
      return schraffurMuster;
    }

    function sichtbar(x0: number, z0: number, x1: number, z1: number) {
      return x1 >= wx(0) && x0 <= wx(W) && z1 >= wz(0) && z0 <= wz(H);
    }

    function maleGrenzen() {
      ctx.save();
      ctx.lineJoin = 'round';
      ctx.setLineDash([9, 5]);
      for (const pass of [0, 1]) {
        ctx.beginPath();
        for (const l of grenzen) {
          for (let i = 0; i + 1 < l.length; i += 2) {
            const x = sx(l[i]), y = sz(l[i + 1]);
            if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
          }
        }
        if (pass === 0) { ctx.strokeStyle = 'rgba(20, 8, 8, 0.65)'; ctx.lineWidth = 3.6; } else { ctx.strokeStyle = '#ff8f8f'; ctx.lineWidth = 1.6; }
        ctx.stroke();
      }
      ctx.restore();
    }

    function pfad(w: WegDraw) {
      const minAbst = 1.5;
      for (const l of w.linien) {
        if (!sichtbar(l.x0, l.z0, l.x1, l.z1)) continue;
        let lx = 0, ly = 0, erst = true;
        const p = l.pts;
        for (let i = 0; i + 1 < p.length; i += 2) {
          const x = sx(p[i]), y = sz(p[i + 1]);
          if (erst) { ctx.moveTo(x, y); lx = x; ly = y; erst = false; continue; }
          if (Math.abs(x - lx) + Math.abs(y - ly) < minAbst && i + 2 < p.length) continue;
          ctx.lineTo(x, y); lx = x; ly = y;
        }
      }
    }

    function maleWege() {
      ctx.save();
      ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      // Alle übrigen Wege dünn gestrichelt
      ctx.beginPath();
      for (const w of wege) if (!w.steige && w !== hoverWeg) pfad(w);
      ctx.setLineDash([2.5, 3.5]);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.78)';
      ctx.lineWidth = 1.1;
      ctx.stroke();
      // Eifelsteig hervorgehoben
      const stg = wege.filter((w) => w.steige && w !== hoverWeg);
      if (stg.length) {
        ctx.beginPath();
        for (const w of stg) pfad(w);
        ctx.setLineDash([]);
        ctx.strokeStyle = 'rgba(30, 18, 6, 0.6)'; ctx.lineWidth = 4.2; ctx.stroke();
        ctx.setLineDash([7, 4]);
        ctx.strokeStyle = '#ffd36b'; ctx.lineWidth = 2.4; ctx.stroke();
      }
      if (hoverWeg) {
        ctx.beginPath(); pfad(hoverWeg);
        ctx.setLineDash([]); ctx.strokeStyle = 'rgba(20, 12, 4, 0.7)'; ctx.lineWidth = 5; ctx.stroke();
        ctx.setLineDash([6, 3]); ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2.6; ctx.stroke();
      }
      ctx.restore();
    }

    function umriss(poly: { x: number; z: number }[]) {
      poly.forEach((p, i) => { const x = sx(p.x), y = sz(p.z); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); });
      ctx.closePath();
    }

    function maleHex() {
      const n = radius();
      const innen = bigHexOutline(q, r, n);
      const c = hexToWorld(q, r);
      // Kulisse: Umriss um 2000 m nach außen
      const d = Math.hypot(innen[0].x - c.x, innen[0].z - c.z);
      const f = (d + KULISSE / Math.cos(Math.PI / 6)) / d;
      const aussen = innen.map((p) => ({ x: c.x + (p.x - c.x) * f, z: c.z + (p.z - c.z) * f }));
      ctx.save();
      ctx.lineJoin = 'round';
      // Alles außerhalb der Kulisse leicht abdunkeln
      ctx.beginPath(); ctx.rect(0, 0, W, H); umriss(aussen);
      ctx.fillStyle = 'rgba(10, 12, 14, 0.34)'; ctx.fill('evenodd');
      // Kulisse-Rand dünn und gestrichelt
      ctx.beginPath(); umriss(aussen);
      ctx.setLineDash([5, 4]); ctx.strokeStyle = 'rgba(243, 234, 216, 0.85)'; ctx.lineWidth = 1.2; ctx.stroke();
      // Spielfeld
      ctx.beginPath(); umriss(innen);
      ctx.fillStyle = 'rgba(231, 194, 122, 0.16)'; ctx.fill();
      ctx.setLineDash([]); ctx.strokeStyle = 'rgba(30, 18, 6, 0.75)'; ctx.lineWidth = 5; ctx.stroke();
      ctx.strokeStyle = '#f0c870'; ctx.lineWidth = 2.6; ctx.stroke();
      // Mittel-Hex
      const hexR = HEX.R * view.s;
      if (hexR > 3) {
        ctx.beginPath();
        for (let k = 0; k < 6; k++) {
          const a = Math.PI / 6 + (Math.PI / 3) * k;
          const x = sx(c.x) + hexR * Math.cos(a), y = sz(c.z) + hexR * Math.sin(a);
          if (k) ctx.lineTo(x, y); else ctx.moveTo(x, y);
        }
        ctx.closePath(); ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.fill();
      } else {
        ctx.beginPath(); ctx.arc(sx(c.x), sz(c.z), 3, 0, 7); ctx.fillStyle = '#fff'; ctx.fill();
      }
      // Ortskerne im Hex = Startplätze
      for (const o of ausw.starts) {
        const x = sx(o[2]), y = sz(o[3]);
        if (x < -10 || y < -10 || x > W + 10 || y > H + 10) continue;
        const rad = o[1] === 0 ? 6 : o[1] === 1 ? 4.6 : 3.6;
        ctx.beginPath(); ctx.arc(x, y, rad + 1.8, 0, 7); ctx.fillStyle = 'rgba(20,12,4,0.85)'; ctx.fill();
        ctx.beginPath(); ctx.arc(x, y, rad, 0, 7); ctx.fillStyle = '#ffc94d'; ctx.fill();
      }
      // Gesuchter Ort
      if (marke) {
        const x = sx(marke.x), y = sz(marke.z);
        ctx.beginPath(); ctx.arc(x, y, 11, 0, 7); ctx.strokeStyle = '#fff'; ctx.lineWidth = 2.2; ctx.stroke();
      }
      ctx.restore();
    }

    function maleBeschriftung() {
      const s = view.s;
      const belegt: Rect[] = [];
      ctx.save();
      ctx.lineJoin = 'round';
      ctx.textBaseline = 'middle';
      const text = (t: string, x: number, y: number, font: string, fill: string, ausrichtung: CanvasTextAlign = 'left') => {
        ctx.font = font; ctx.textAlign = ausrichtung;
        const w = ctx.measureText(t).width;
        const px = ausrichtung === 'center' ? x - w / 2 : x;
        const rc = { x: px - 2, y: y - 9, w: w + 4, h: 18 };
        if (rc.x > W || rc.y > H || rc.x + rc.w < 0 || rc.y + rc.h < 0 || !frei(belegt, rc)) return false;
        belegt.push(rc);
        ctx.strokeStyle = 'rgba(14, 10, 6, 0.85)'; ctx.lineWidth = 3.4; ctx.strokeText(t, x, y);
        ctx.fillStyle = fill; ctx.fillText(t, x, y);
        return true;
      };
      const inHex = new Set(ausw.starts);
      // Seen und Flüsse
      if (s > 0.009) {
        for (const g of welt.orte.gewaesser) {
          const x = sx(g[1]), y = sz(g[2]);
          if (x < 0 || y < 0 || x > W || y > H) continue;
          text(g[0], x, y, 'italic 500 14px "Alegreya Sans", serif', '#bfe6ff', 'center');
        }
      }
      const alle = welt.orte.orte;
      for (const art of [0, 1, 2]) {
        const grenzeS = art === 0 ? 0 : art === 1 ? 0.011 : 0.024;
        for (const o of alle) {
          if (o[1] !== art) continue;
          const hexOrt = inHex.has(o);
          if (s < grenzeS && !(hexOrt && s > 0.012 && art < 2)) continue;
          const x = sx(o[2]), y = sz(o[3]);
          if (x < -40 || y < -20 || x > W + 40 || y > H + 20) continue;
          const font = art === 0 ? '700 17px "Alegreya SC", serif' : art === 1 ? '500 14px "Alegreya Sans", sans-serif' : '500 12px "Alegreya Sans", sans-serif';
          const ok = text(o[0], x + 7, y - 1, font, art === 0 ? '#fff0c8' : '#fff8e8');
          if (ok && !hexOrt) {
            ctx.beginPath(); ctx.arc(x, y, art === 0 ? 3.2 : 2.2, 0, 7);
            ctx.fillStyle = '#fff'; ctx.strokeStyle = 'rgba(14,10,6,.8)'; ctx.lineWidth = 1.4; ctx.stroke(); ctx.fill();
          }
        }
      }
      if (marke) text(marke.name, sx(marke.x) + 14, sz(marke.z) - 14, '700 18px "Alegreya SC", serif', '#ffffff');
      ctx.restore();
    }

    function maleMassstab() {
      const ziele = [500, 1000, 2000, 5000, 10000, 20000, 50000];
      let m = ziele[0];
      for (const z of ziele) { if (z * view.s <= 140) m = z; }
      const bw = m * view.s;
      const x = 16, y = H - 18;
      ctx.save();
      ctx.strokeStyle = 'rgba(14,10,6,0.85)'; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(x, y - 5); ctx.lineTo(x, y); ctx.lineTo(x + bw, y); ctx.lineTo(x + bw, y - 5); ctx.stroke();
      ctx.strokeStyle = '#fff8e8'; ctx.lineWidth = 1.6; ctx.stroke();
      ctx.font = '500 12px "Alegreya Sans", sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
      const t = m >= 1000 ? `${m / 1000} km` : `${m} m`;
      ctx.strokeStyle = 'rgba(14,10,6,0.85)'; ctx.lineWidth = 3; ctx.strokeText(t, x + 2, y - 5);
      ctx.fillStyle = '#fff8e8'; ctx.fillText(t, x + 2, y - 5);
      ctx.restore();
    }

    /* --- Größe der Zeichenfläche --- */
    let ersteGroesse = true;
    let zumHexNachResize = false;
    const ro = new ResizeObserver(() => {
      const b = karte.getBoundingClientRect();
      const neuW = Math.max(1, Math.round(b.width)), neuH = Math.max(1, Math.round(b.height));
      if (neuW === W && neuH === H) return;
      W = neuW; H = neuH; dpr = Math.min(2.5, window.devicePixelRatio || 1);
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
      canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
      if (ersteGroesse) { ersteGroesse = false; zoomAufGebaut(); } else if (zumHexNachResize) { zumHexNachResize = false; zoomZumHex(); } else { begrenze(); zeichne(); }
    });
    ro.observe(karte);

    /* --- Zeiger: Ziehen, Zoomen, Tippen --- */
    const zeiger = new Map<number, { x: number; y: number }>();
    let modus: 'keiner' | 'schieben' | 'hex' | 'pinch' = 'keiner';
    let start = { x: 0, y: 0 };
    let bewegt = 0;
    let greif = { x: 0, z: 0 };
    let pinch = { d: 1, s: 1 };

    const lokal = (e: PointerEvent | WheelEvent) => {
      const b = canvas.getBoundingClientRect();
      return { x: e.clientX - b.left, y: e.clientY - b.top };
    };

    function imHex(px: number, py: number): boolean {
      const x = wx(px), z = wz(py);
      if (imPolygon(x, z, bigHexOutline(q, r, radius()))) return true;
      const c = hexToWorld(q, r);
      return Math.hypot(sx(c.x) - px, sz(c.z) - py) < 16;
    }

    canvas.addEventListener('pointerdown', (e) => {
      canvas.setPointerCapture(e.pointerId);
      const p = lokal(e);
      zeiger.set(e.pointerId, p);
      if (zeiger.size === 1) {
        start = p; bewegt = 0;
        if (imHex(p.x, p.y)) {
          modus = 'hex';
          const c = hexToWorld(q, r);
          greif = { x: wx(p.x) - c.x, z: wz(p.y) - c.z };
        } else modus = 'schieben';
      } else if (zeiger.size === 2) {
        const [a, b] = [...zeiger.values()];
        pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, s: view.s };
        modus = 'pinch';
      }
    });

    canvas.addEventListener('pointermove', (e) => {
      const p = lokal(e);
      const alt = zeiger.get(e.pointerId);
      if (!alt) {
        if (e.pointerType === 'mouse') hover(p.x, p.y);
        return;
      }
      zeiger.set(e.pointerId, p);
      if (modus === 'pinch' && zeiger.size >= 2) {
        const [a, b] = [...zeiger.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y) || 1;
        const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
        const x = wx(mx), z = wz(my);
        view.s = Math.min(S_MAX, Math.max(sMin(), pinch.s * (d / pinch.d)));
        view.cx = x - (mx - W / 2) / view.s;
        view.cz = z - (my - H / 2) / view.s;
        begrenze(); zeichne();
        bewegt = 99;
        return;
      }
      bewegt = Math.max(bewegt, Math.hypot(p.x - start.x, p.y - start.y));
      if (modus === 'schieben') {
        view.cx -= (p.x - alt.x) / view.s;
        view.cz -= (p.y - alt.y) / view.s;
        begrenze(); zeichne();
      } else if (modus === 'hex' && bewegt > 3) {
        const h = worldToHex(wx(p.x) - greif.x, wz(p.y) - greif.z);
        ziehe(h.q, h.r);
      }
    });

    const loslassen = (e: PointerEvent) => {
      const hatte = zeiger.has(e.pointerId);
      zeiger.delete(e.pointerId);
      if (!hatte) return;
      if (modus === 'pinch') {
        if (zeiger.size < 2) modus = 'keiner';
        return;
      }
      const p = lokal(e);
      if (e.type === 'pointerup' && bewegt < 6 && zeiger.size === 0) {
        // Tippen: Wanderweg benennen; außerhalb des Hex zusätzlich das Hex dorthin setzen
        const weg = wegBei(p.x, p.y, e.pointerType === 'mouse' ? 7 : 14);
        if (weg) zeigeTip(p.x, p.y, weg, true);
        if (modus === 'schieben') {
          const h = worldToHex(wx(p.x), wz(p.y));
          setzeMitte(h.q, h.r);
        }
      } else if (modus === 'hex') {
        nachAenderung();
      }
      modus = 'keiner';
    };
    canvas.addEventListener('pointerup', loslassen);
    canvas.addEventListener('pointercancel', loslassen);
    canvas.addEventListener('pointerleave', () => { if (!zeiger.size) { tip.classList.remove('an'); if (hoverWeg) { hoverWeg = null; zeichne(); } } });

    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const p = lokal(e);
      zoomUm(Math.exp(-e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.0016)), p.x, p.y);
    }, { passive: false });

    function wegBei(px: number, py: number, tol: number): WegDraw | null {
      const x = wx(px), z = wz(py);
      const tm = tol / view.s; // Toleranz in Metern
      let best: WegDraw | null = null, bd = tm * tm;
      for (const w of wege) {
        for (const l of w.linien) {
          if (x < l.x0 - tm || x > l.x1 + tm || z < l.z0 - tm || z > l.z1 + tm) continue;
          const p = l.pts;
          for (let i = 0; i + 3 < p.length; i += 2) {
            const ax = p[i], az = p[i + 1], dx = p[i + 2] - ax, dz = p[i + 3] - az;
            const len2 = dx * dx + dz * dz;
            const t = len2 ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / len2)) : 0;
            const ex = x - (ax + dx * t), ez = z - (az + dz * t);
            const d2 = ex * ex + ez * ez;
            if (d2 < bd) { bd = d2; best = w; }
          }
        }
      }
      return best;
    }

    let tipTimer = 0;
    function zeigeTip(px: number, py: number, w: WegDraw, haelt = false) {
      tip.replaceChildren(el('b', '', w.name + (w.ref && !w.steige ? ` (${w.ref})` : '')));
      tip.append(el('span', '', w.steige ? 'Hier läuft die Kampagne entlang.' : 'Wanderweg'));
      tip.style.left = Math.min(W - 200, Math.max(8, px + 14)) + 'px';
      tip.style.top = Math.min(H - 60, Math.max(8, py + 14)) + 'px';
      tip.classList.add('an');
      hoverWeg = w; zeichne();
      clearTimeout(tipTimer);
      if (haelt) tipTimer = window.setTimeout(() => { tip.classList.remove('an'); hoverWeg = null; zeichne(); }, 3200);
    }

    function hover(px: number, py: number) {
      canvas.style.cursor = imHex(px, py) ? 'grab' : 'crosshair';
      const w = wegBei(px, py, 7);
      if (w) zeigeTip(px, py, w);
      else if (hoverWeg) { hoverWeg = null; tip.classList.remove('an'); zeichne(); }
    }

    /* --- Los --- */
    function schliesse() {
      ro.disconnect();
      window.removeEventListener('resize', onResize);
      clearTimeout(infoTimer); clearTimeout(toastTimer); clearTimeout(tipTimer);
      wurzel.remove();
    }
    const onResize = () => { /* ResizeObserver reicht; Platzhalter für Geräte ohne */ };
    window.addEventListener('resize', onResize);

    const waehle = (art: 'allein' | 'freunde') => {
      if (los.disabled || !fertigGeladen) return;
      const a: AusschnittParam = { version: welt.version, q, r, size };
      merke(a);
      schliesse();
      fertig({ art, param: a });
    };
    los.addEventListener('click', () => waehle('allein'));
    freunde.addEventListener('click', () => waehle('freunde'));
    fortsetzen.addEventListener('click', () => {
      const a = holeAutosave();
      if (!a) { toastZeigen('Kein Autosave mehr da.'); return; }
      schliesse();
      fertig({ art: 'laden', spielstand: a.stand });
    });
    datei.addEventListener('change', async () => {
      const f = datei.files?.[0];
      datei.value = '';
      if (!f) return;
      try {
        const st = leseSpielstand(await f.text());
        schliesse();
        fertig({ art: 'laden', spielstand: st });
      } catch (e) { toastZeigen((e as Error).message); }
    });

    /* --- Start: gemerkte Wahl oder Vorschlag --- */
    {
      const gem = lies();
      if (gem && (gem.size === 'klein' || gem.size === 'mittel' || gem.size === 'gross')) size = gem.size;
      let start_: { q: number; r: number } | null = null;
      if (gem && gem.version === welt.version && Number.isFinite(gem.q) && Number.isFinite(gem.r)) start_ = { q: gem.q!, r: gem.r! };
      if (!start_) {
        // Erster passender Vorschlag, sonst Mitte der gebauten Fläche
        const v = VORSCHLAEGE.find((x) => passtInKacheln(kachelSet, x.q, x.r, x.size));
        if (v) { start_ = { q: v.q, r: v.r }; size = v.size; }
        else start_ = { q: 0, r: 0 };
      }
      let k = klemme(kacheln, start_.q, start_.r, size);
      if (!k.passt) {
        for (const g of ['gross', 'mittel', 'klein'] as Groesse[]) {
          const k2 = klemme(kacheln, start_.q, start_.r, g);
          if (k2.passt) { size = g; k = k2; break; }
        }
      }
      q = k.q; r = k.r;
      ausw = { starts: [], seen: [], laender: [], grenze: false, hoch: null, tief: null };
      zeichneGroessenKnoepfe();
      zeichneInfo();
    }

    /* --- Daten nachladen --- */
    const img = new Image();
    img.onload = () => { relief = img; zeichne(); };
    void holeBildUrl(welt.datei('uebersicht/relief.webp')).then((u) => { img.src = u; }).catch(() => undefined);

    const ladeAlles = Promise.all([
      holeJson<Wanderweg[]>(welt.datei('uebersicht/wanderwege.json')).then((ws) => {
        wege = ws.map((w) => ({
          name: w.n, ref: w.ref ?? '', steige: /^eifelsteig/i.test(w.n),
          linien: w.p.filter((l) => l.length >= 4).map((l) => {
            const pts = Float32Array.from(l);
            let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
            for (let i = 0; i + 1 < pts.length; i += 2) {
              x0 = Math.min(x0, pts[i]); x1 = Math.max(x1, pts[i]); z0 = Math.min(z0, pts[i + 1]); z1 = Math.max(z1, pts[i + 1]);
            }
            return { pts, x0, z0, x1, z1 };
          }),
        }));
        // Eifelsteig zuletzt, damit er oben liegt (Reihenfolge im Zeichnen: eigener Pfad, hier nur Hover-Suche)
      }).catch(() => undefined),
      holeJson<number[][]>(welt.datei('uebersicht/grenzen.json')).then((g) => { grenzen = g; }).catch(() => undefined),
      holeBytes(welt.datei('uebersicht/hoehe.bin.gz')).then((b) => {
        hoehe = new Uint16Array(b.buffer, b.byteOffset, Math.floor(b.byteLength / 2));
      }).catch(() => undefined),
    ]);
    void ladeAlles.then(() => {
      fertigGeladen = true;
      aktualisiereInfo();
      zeichne();
    });
    // Los ist von Anfang an möglich, sobald die Auswertung steht (Ortsdaten sind schon da)
    fertigGeladen = true;
    aktualisiereInfo();
    merke({ version: welt.version, q, r, size });
  });
}
