// Meldungen der Erzählfigur (Drehbuch 1.1, 1.4, 4.4) aus den Ereignissen der Simulation: welches Völkchen zum Startort gehört,
// welcher Text zu welchem Ereignis passt und wann eine Meldung kommt (nicht zu jedem neuen Bewohner). Reine Textlogik ohne
// Browser, three oder Simulation; einzeln testbar (tests/meldungen.test.ts).
import regionenJson from '../../data/regions.json';
import meldungenJson from '../../data/meldungen.json';
import type { SichtDorf, SichtEreignis } from '../sim/typen';

interface Spruch { platt: string; hoch: string }
interface Voelkchen {
  id: string; name: string;
  erzaehler: { name: string; tick: string };
  kerngebiet: { orte: string[] };
  sprueche: Spruch[];
}

const VOELKCHEN = (regionenJson as unknown as { voelkchen: Voelkchen[] }).voelkchen;
const TEXTE = meldungenJson as unknown as Record<string, string[]>;

/** Erzählfigur eines Völkchens: Name, Sprachtick und Platt-Sprüche (mit Übersetzung). */
export interface Erzaehler { voelkchen: string; name: string; tick: string; sprueche: Spruch[]; /** Völkchen-Id (data/regions.json, data/voelkchen.json). */ id: string }

/**
 * Völkchen zum Startort (Drehbuch 5: es ergibt sich aus dem Startort): erst der Startort selbst in einem Kerngebiet, dann der erste
 * Ortskern des Ausschnitts, der in einem Kerngebiet liegt, sonst die Rursee-Leute (der Vorschlag Einruhr).
 */
export function erzaehlerFuer(startort: string | undefined, orte: readonly string[] = []): Erzaehler {
  const finde = (o: string | undefined) => (o ? VOELKCHEN.find((v) => v.kerngebiet.orte.includes(o)) : undefined);
  const v = finde(startort) ?? orte.map(finde).find(Boolean) ?? VOELKCHEN.find((x) => x.id === 'rursee') ?? VOELKCHEN[0];
  return { voelkchen: v.name, name: v.erzaehler.name, tick: v.erzaehler.tick, sprueche: v.sprueche, id: v.id };
}

/** Erzählfigur zum Völkchen mit der Id (Mehrspieler: jeder hat die seines Völkchens); unbekannt → wie erzaehlerFuer ohne Ort. */
export function erzaehlerVon(id: string): Erzaehler {
  const v = VOELKCHEN.find((x) => x.id === id);
  return v ? { voelkchen: v.name, name: v.erzaehler.name, tick: v.erzaehler.tick, sprueche: v.sprueche, id: v.id } : erzaehlerFuer(undefined);
}

/** Name des Völkchens zur Id oder ''. */
export function voelkchenName(id: string): string {
  return VOELKCHEN.find((x) => x.id === id)?.name ?? '';
}

export interface Meldung {
  /** Hochdeutscher Text der Meldung samt Sprachtick der Figur. */
  text: string;
  /** Platt-Spruch dazu (optional) mit Übersetzung für Flachländer (Drehbuch 7.2). */
  platt?: Spruch;
  /** Große Meldung (Kirmes, Dorfstufe): länger sichtbar. */
  gross: boolean;
  /** Gebäude, um das es geht (Klick springt hin), sonst fehlt es. */
  gebaeude?: number;
  /** Ort ohne Gebäude (z. B. verlorene Ware), Klick springt hin. */
  ort?: { q: number; r: number };
}

/** Werte für die Platzhalter. */
export interface MeldungsKontext {
  ort: string;
  gebaeude?: string;
  ware?: string;
  stufe?: string;
  n?: number;
  liste?: string;
  fest?: string;
  wetter?: string;
  feld?: string;
  /** M10: Ortsname, Stadt, Ausrede oder Spielername. */
  text?: string;
}

/** Namen für die Meldungen ab M8: kleine Feste, Wetterarten (Id und Anzeigename), Feldtypen. */
export interface MeldungsNamen {
  fest: (nr: number) => string;
  wetter: (art: number) => { id: string; name: string };
  feld: (typ: string) => string;
  /** M10: Name des Orts (Index in SimSicht.orte), des Marktpostens, eines Spielers, eine Ausrede. */
  ort?: (i: number) => string;
  posten?: (i: number) => string;
  spieler?: (sp: number) => string;
  ausrede?: (i: number) => string;
}

/** Text Nummer `nr` (reihum) eines Anlasses mit ersetzten Platzhaltern. */
export function textFuer(anlass: string, nr: number, k: MeldungsKontext, e: Erzaehler): string {
  const liste = TEXTE[anlass];
  if (!liste || !liste.length) return '';
  const roh = liste[((nr % liste.length) + liste.length) % liste.length];
  return roh.replace(/\{(\w+)\}/g, (_, n: string) => {
    if (n === 'name') return e.name;
    const v = (k as unknown as Record<string, string | number | undefined>)[n];
    return v === undefined ? '' : String(v);
  });
}

/** Sprachtick anhängen („…, sag ich mal.“ oder als eigener Satz). */
export function mitTick(text: string, e: Erzaehler): string {
  const t = e.tick.trim();
  if (!t) return text;
  if (/^[a-zäöü]/.test(t)) return `${text.replace(/[.!]$/, '')}, ${t}.`;
  return `${text} ${t}`;
}

/** Merkt sich, was schon gemeldet wurde, damit nicht jeder Bewohner und jedes Gebäude eine Meldung bekommt. */
export class MeldungsFilter {
  private letzteNr = 0;
  private typenFertig = new Set<string>();
  private ersterBewohner = false;
  private bewohnerMarke = 0;
  private wohnraumGemeldet = false;
  private zaehler = 0;

  constructor(private e: Erzaehler, private ort: string) {}

  /** Begrüßung zum Start (Drehbuch 4.4, Schritt 1) mit einem Platt-Spruch der Figur. */
  begruessung(liste: string): Meldung {
    return { text: mitTick(textFuer('begruessung', 0, { ort: this.ort, liste }, this.e), this.e), platt: this.e.sprueche[0], gross: true };
  }

  /** Tipp Nummer i (0..3) für die ersten Minuten. */
  tipp(i: number, liste: string): Meldung | null {
    const t = textFuer('erste_schritte', i, { ort: this.ort, liste }, this.e);
    return t ? { text: t, gross: false } : null;
  }

  /**
   * Neue Ereignisse (nr größer als zuletzt gesehen) in Meldungen übersetzen. `gebName(id)` liefert Typ und Namen eines Gebäudes,
   * `wareName(art)` den Namen einer Ware, `stufeName(n)` den der Dorfstufe; `freigeschaltet` und `liste` für Stufe und Kirmesplatz.
   */
  neue(ereignisse: readonly SichtEreignis[], dorf: SichtDorf, gebName: (id: number) => { typ: string; name: string } | null,
    wareName: (art: number) => string, stufeName: (n: number) => string, freigeschaltet: string, liste: string, namen?: MeldungsNamen,
    kommt: readonly { art: number; feld: string }[] = []): Meldung[] {
    const aus: Meldung[] = [];
    const k = (x: Partial<MeldungsKontext>): MeldungsKontext => ({ ort: this.ort, liste, ...x });
    const add = (anlass: string, ctx: MeldungsKontext, gross = false, platt = false, gebaeude = 0) => {
      const t = textFuer(anlass, this.zaehler++, ctx, this.e);
      if (!t) return;
      const m: Meldung = { text: mitTick(t, this.e), gross, platt: platt ? this.e.sprueche[this.zaehler % this.e.sprueche.length] : undefined };
      if (gebaeude) m.gebaeude = gebaeude;
      aus.push(m);
    };
    for (const ev of ereignisse) {
      if (ev.nr <= this.letzteNr) continue;
      this.letzteNr = ev.nr;
      switch (ev.art) {
        case 'fertig': {
          const g = gebName(ev.gebaeude);
          if (!g || this.typenFertig.has(g.typ)) break;
          this.typenFertig.add(g.typ);
          add(g.typ === 'kirmesplatz' ? 'kirmesplatz' : 'fertig', k({ gebaeude: g.name }), g.typ === 'kirmesplatz', false, ev.gebaeude);
          break;
        }
        case 'bewohner':
          if (!this.ersterBewohner) { this.ersterBewohner = true; add('bewohner_erster', k({ ware: wareName(ev.wert) }), false, false, ev.gebaeude); }
          break;
        case 'notnagel': add('notnagel', k({}), false, true); break;
        case 'kirmes': add('kirmes', k({}), true, true, ev.gebaeude); break;
        case 'stufe': add('stufe', k({ stufe: stufeName(ev.wert), liste: freigeschaltet }), true); break;
        case 'zuzug': add('zuzug', k({ n: ev.wert })); break;
        case 'jahreszeit': add(`jahreszeit_${ev.wert}`, k({}), ev.wert === 3); break;
        case 'wetter': {
          // Bauernregel der Erzählfigur (Drehbuch 7.4): kündigt das Wetter an
          const w = namen?.wetter(ev.wert);
          const feld = kommt.find((x) => x.art === ev.wert)?.feld ?? '';
          if (w) add(`wetter_${w.id}`, k({ wetter: w.name, feld: feld && namen ? namen.feld(feld) : 'Feld' }), true);
          break;
        }
        case 'kleines_fest': add('kleines_fest', k({ fest: namen?.fest(ev.wert) ?? 'Fest' }), true, true, ev.gebaeude); break;
        case 'friert': add('friert', k({}), true); break;
        case 'satt': add('satt', k({})); break;
        case 'bauleute': add('bauleute', k({ gebaeude: ev.wert === 0 ? 'Bauarbeiter' : 'Planierer' })); break;
        case 'einstand': add('einstand', k({ text: namen?.ort?.(ev.wert) ?? 'dem Ort' }), true, true, ev.gebaeude); break;
        case 'zu_spaet': add('zu_spaet', k({ text: namen?.ort?.(ev.wert) ?? 'dem Ort' }), true); break;
        case 'handel': add('handel', k({ text: namen?.posten?.(ev.wert) ?? 'dem Flachland' }), false, false, ev.gebaeude); break;
        case 'fund': add('fund', k({ ware: wareName(ev.wert) }), false, true, ev.gebaeude); break;
        case 'erwischt': add('erwischt', k({ text: namen?.ausrede?.(ev.wert) ?? '' }), false, false, ev.gebaeude); break;
        case 'ertappt': add('ertappt', k({ text: namen?.spieler?.(ev.wert) ?? 'nebenan' })); break;
        case 'schuetzenfest': add('schuetzenfest', k({ n: ev.wert }), true, true, ev.gebaeude); break;
        case 'koenig': add('koenig', k({ text: namen?.spieler?.(ev.wert) ?? 'Einer' }), true, true); break;
        case 'ende': add('ende', k({ text: namen?.spieler?.(ev.wert) ?? 'Einer' }), true, true); break;
        case 'verloren': {
          const n = aus.length;
          add('verloren', k({ ware: wareName(ev.wert) }));
          if (aus.length > n && ev.q !== undefined && ev.r !== undefined) aus[n].ort = { q: ev.q, r: ev.r };
          break;
        }
      }
    }
    // runde Bewohnerzahlen (alle 10) und einmal „Wohnraum voll“
    const marke = Math.floor(dorf.bewohner / 10) * 10;
    if (marke >= 20 && marke > this.bewohnerMarke) { this.bewohnerMarke = marke; add('bewohner_viele', k({ n: marke })); }
    else if (marke > this.bewohnerMarke) this.bewohnerMarke = marke;
    if (dorf.bewohner >= dorf.wohnraum && dorf.wohnraum > 10 && !this.wohnraumGemeldet) { this.wohnraumGemeldet = true; add('wohnraum_voll', k({})); }
    else if (dorf.bewohner < dorf.wohnraum - 2) this.wohnraumGemeldet = false;
    return aus;
  }
}
