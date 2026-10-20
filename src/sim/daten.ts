// Konstanten und Gebäudetypen der Simulation (DESIGN §4, §6). Waren und Gebäude kommen aus data/goods.json und
// data/buildings.json; hier werden sie in Ganzzahlen (Zeiten in Ticks, Mengen je Warenart) umgerechnet.
import { TICK_HZ } from './typen';
import warenJson from '../../data/goods.json';
import gebaeudeJson from '../../data/buildings.json';
import dorfJson from '../../data/dorf.json';

interface WareJson { id: string; name: string; gruppe: string; nahrung?: number; form?: string; farbe?: string }
interface GebaeudeJson {
  id: string; name: string; gruppe: string; symbol: string; spruch: string;
  funktion: string; groesse: number; kosten: Record<string, number>;
  radius?: number; radiusGut?: number; arbeiter?: number; wohnraum?: number;
  vorrat?: Record<string, number>;
  eingang?: Record<string, number>;
  ausgang?: { ware: string; max: number };
  wandelt?: { ein: string; menge?: number; aus: string; dauer_s: number };
  zeiten?: { arbeit_s?: number; ruhe_s?: number };
  nahrung_plaetze?: number; ab_stufe?: number; einmalig?: boolean;
}

const warenListe = (warenJson as { waren: WareJson[] }).waren;

/** Warenarten (Ids); der Index ist die Warenart. */
export const WAREN: readonly string[] = warenListe.map((w) => w.id);
/** Id → Warenart-Index. */
export const WARE: Readonly<Record<string, number>> = Object.fromEntries(WAREN.map((id, i) => [id, i]));
/** Anzeigenamen je Warenart. */
export const WAREN_NAMEN: readonly string[] = warenListe.map((w) => w.name);
/** Gruppe je Warenart (Grundstoff, Nahrung ...). */
export const WAREN_GRUPPEN: readonly string[] = warenListe.map((w) => w.gruppe);
/** Nahrungsstufe je Warenart: 0 keine Nahrung, 1 einfach, 2 veredelt, 3 edel (DESIGN §5). */
export const NAHRUNG: readonly number[] = warenListe.map((w) => w.nahrung ?? 0);
/** Nahrungs-Warenarten, die beste Stufe zuerst (bei Gleichstand kleinere Warenart). */
export const NAHRUNG_REIHE: readonly number[] = WAREN.map((_, i) => i).filter((i) => NAHRUNG[i] > 0).sort((a, b) => NAHRUNG[b] - NAHRUNG[a] || a - b);
/** Lesbares Modell je Warenart (Drehbuch 7.6): Form und Hauptfarbe. */
export const WAREN_FORM: readonly string[] = warenListe.map((w) => w.form ?? 'sack');
export const WAREN_FARBE: readonly string[] = warenListe.map((w) => w.farbe ?? '#b08850');

/** Stapel an einer Fahne und Notplätze (nur für den Tausch der Träger). */
export const FLAG_CAP = 8;
export const NOTPLAETZE = 2;
/** Höchstzahl Segmente je Fahne (je Hex-Richtung eins). */
export const FAHNE_MAX_SEGMENTE = 6;
/** Längster Weg in Hex-Schritten. */
export const WEG_MAX_SCHRITTE = 60;

/** Trägertempo: ein Hex-Schritt in der Ebene in Ticks; Steigung: +1 Tick je 5 dm bergauf, +1 je 20 dm bergab. */
export const SCHRITT_EBENE = 24;
export const STEIGUNG_DM = 5;
export const GEFAELLE_DM = 20;
/** Dauer einer Übergabe an der Fahne. */
export const UEBERGABE_TICKS = 6;
const dorf = dorfJson as {
  start: { bewohner: number; bauarbeiter: number; planierer: number };
  wohnen: { zyklus_s: number[]; notnagel_frei_unter: number; notnagel_s: number };
  bauen: { je_ware_s: number; planieren_ab_grad: number; planieren_s: number; planieren_je_grad_s: number };
  stufen: string[];
  kirmes: { liste: Record<string, number>; fest_s: number; zuzug: number; schaltet_frei: string[] }[];
  verteilung: { abnehmer: { id: string; name: string; symbol: string }[]; standard: string[] };
  statistik: { takt_s: number; max_punkte: number };
  autosave: { takt_min: number };
};
const sek = (s: number) => Math.round(s * TICK_HZ);

/** Start (Drehbuch 4.2, 4.5; data/dorf.json): freie Bewohner, fester Vorrat an Bauarbeitern und Planierern. */
export const START_BEWOHNER = dorf.start.bewohner;
export const START_BAUARBEITER = dorf.start.bauarbeiter;
export const START_PLANIERER = dorf.start.planierer;
/** Wohnhaus-Zyklus je Nahrungsstufe 1..3 in Ticks (Index = Stufe; 0 unbenutzt). */
export const NAHRUNG_ZYKLUS: readonly number[] = [0, ...dorf.wohnen.zyklus_s.map(sek)];
/** Notnagel (Drehbuch 4.3): unter so vielen freien Bewohnern und ohne Essen kommt alle NOTNAGEL_TICKS ein Zugezogener. */
export const NOTNAGEL_FREI_UNTER = dorf.wohnen.notnagel_frei_unter;
export const NOTNAGEL_TICKS = sek(dorf.wohnen.notnagel_s);
/** Bauarbeiter: Ticks je verbaute Ware (Drehbuch 4.5: Startwert 2–3 s). */
export const BAU_JE_WARE = sek(dorf.bauen.je_ware_s);
/** Planierer: ab dieser Steigung (Grad) muss ein Bauplatz planiert werden; Dauer in Ticks. */
export const PLANIEREN_AB_GRAD = dorf.bauen.planieren_ab_grad;
export function planierTicks(grad: number): number {
  if (grad < PLANIEREN_AB_GRAD) return 0;
  return sek(dorf.bauen.planieren_s) + (grad - PLANIEREN_AB_GRAD) * sek(dorf.bauen.planieren_je_grad_s);
}
/** Namen der Dorfstufen (0 Weiler, 1 Dorf, 2 Kirchdorf, 3 Marktflecken; Drehbuch 5.2). */
export const DORFSTUFEN: readonly string[] = dorf.stufen;

/** Kirmes je Dorfstufe (Index = Stufe, von der aus gefeiert wird): Warenliste je Warenart, Festdauer in Ticks, Zuzug, Freischaltungen. */
export interface KirmesStufe { liste: readonly number[]; festTicks: number; zuzug: number; schaltetFrei: readonly string[] }

/** Bäume (DESIGN §12): höchstens so viele je Hex (ausgewachsen + Jungbäume). */
export const TREE_MAX = 3;
/** Ein Jungbaum wird in dieser Zeit zum Baum (Startwert 75 s). */
export const BAUM_WACHSEN = 75 * TICK_HZ;
/** Wiese, Heide und Moor tragen auf einem Teil der Hexe einen Streubaum (Prozent der Hexe, nach hashHex). */
export const BAUM_WIESE_PROZENT = 12;
export const BAUM_HEIDE_PROZENT = 8;
export const BAUM_MOOR_PROZENT = 5;
/** Beim Bauen werden höchstens so viele gerodete Bäume zu Stämmen an der Gebäudefahne. */
export const RODUNG_STAMM_MAX = 2;
/** Stein (Einheiten je Hex): Fels-Hex (Steinfeld), Klippe (ab STEIL_GRAD), Lesesteinhaufen (Prozent der Wiesen-/Wald-Hexe nach hashHex2). */
export const FELS_STEIN = 80;
export const FELS_STEIL = 25;
export const STEIL_GRAD = 22;
export const FELS_LESE = 6;
export const LESE_PROZENT = 4;
/** Fairer Start: mindestens so viel Stein im Umkreis ums Lager; fehlt es, kommen Lesesteinhaufen (je FELS_LESE_START) dazu. */
export const START_STEIN_MIN = 150;
export const START_STEIN_RADIUS = 8;
export const START_STEIN_ABSTAND_MIN = 3;
export const FELS_LESE_START = 8;
/** Arbeitsbereich: Hex-Abstand vom Gebäude zum setzbaren Mittelpunkt höchstens so groß. */
export const ARBEIT_MITTE_MAX = 6;
/** Baustellen-Priorität 1..3, Standard 2. */
export const PRIO_MIN = 1;
export const PRIO_MAX = 3;
export const PRIO_STANDARD = 2;
/** Wartezeit, bis ein Arbeiter ohne Ziel (kein Baum, kein Fels, kein Platz) neu sucht. */
export const SUCHE_WARTE = 2 * TICK_HZ;

export type Funktion = 'lager' | 'wohnen' | 'holzfaeller' | 'foerster' | 'steinbruch' | 'erzeuger' | 'verarbeiter' | 'kirmes';

export interface GebaeudeTyp {
  id: string; name: string; gruppe: string; symbol: string; spruch: string;
  funktion: Funktion;
  groesse: 1 | 2 | 3;
  /** Baukosten je Warenart. */
  kosten: readonly number[];
  kostenSumme: number;
  /** Arbeitsradius in Hexen um den Mittelpunkt (0 = keiner); radiusGut: innerer Ring „gut“ (kurze Wege), außen „geht noch“. */
  radius: number;
  radiusGut: number;
  /** Braucht je einen Bewohner aus dem Vorrat (0 oder 1). */
  arbeiter: number;
  /** Input-Puffer: Größe je Warenart; 0 = nimmt die Ware nicht an. */
  puffer: readonly number[];
  pufferSumme: number;
  /** Output-Puffer (Warenart, Größe); -1 bei keiner. */
  ausgangWare: number;
  ausgangMax: number;
  /** Verarbeiter: macht aus `menge` Waren `ein` in `ticks` eine Ware `aus`. */
  wandelt?: { ein: number; menge: number; aus: number; ticks: number };
  /** Arbeitsdauer (Fällen, Pflanzen, Hauen) und Ruhe danach in Ticks. */
  arbeitTicks: number;
  ruheTicks: number;
  wohnraum: number;
  /** Wohnhaus: Essensplätze (alle Nahrungswaren zusammen). */
  nahrungPlaetze: number;
  /** Ab dieser Dorfstufe baubar (0 = von Anfang an). */
  abStufe: number;
  /** Höchstens eins je Dorf (Kirmesplatz). */
  einmalig: boolean;
  /** Startvorrat je Warenart (nur Lager). */
  vorrat: readonly number[];
  /** Kann ruhen (Befehl 'ruhen'): Gebäude mit Arbeiter und Wohnhäuser. */
  pausierbar: boolean;
}

const ticks = (s: number | undefined) => Math.round((s ?? 0) * TICK_HZ);

function ausId(id: string): number {
  const i = WARE[id];
  if (i === undefined) throw new Error(`Unbekannte Ware "${id}" in data/buildings.json`);
  return i;
}

function jeWare(m: Record<string, number> | undefined): number[] {
  const a = new Array<number>(WAREN.length).fill(0);
  if (m) for (const [id, n] of Object.entries(m)) a[ausId(id)] = Math.floor(n);
  return a;
}

function baue(j: GebaeudeJson): GebaeudeTyp {
  const kosten = jeWare(j.kosten);
  const puffer = jeWare(j.eingang);
  return {
    id: j.id, name: j.name, gruppe: j.gruppe, symbol: j.symbol, spruch: j.spruch,
    funktion: j.funktion as Funktion,
    groesse: j.groesse as 1 | 2 | 3,
    kosten, kostenSumme: kosten.reduce((s, n) => s + n, 0),
    radius: j.radius ?? 0,
    radiusGut: j.radiusGut ?? 0,
    arbeiter: j.arbeiter ?? 0,
    puffer, pufferSumme: puffer.reduce((s, n) => s + n, 0),
    ausgangWare: j.ausgang ? ausId(j.ausgang.ware) : -1,
    ausgangMax: j.ausgang ? j.ausgang.max : 0,
    wandelt: j.wandelt ? { ein: ausId(j.wandelt.ein), menge: j.wandelt.menge ?? 1, aus: ausId(j.wandelt.aus), ticks: ticks(j.wandelt.dauer_s) } : undefined,
    arbeitTicks: ticks(j.zeiten?.arbeit_s),
    ruheTicks: ticks(j.zeiten?.ruhe_s),
    wohnraum: j.wohnraum ?? 0,
    nahrungPlaetze: j.nahrung_plaetze ?? 0,
    abStufe: j.ab_stufe ?? 0,
    einmalig: !!j.einmalig,
    vorrat: jeWare(j.vorrat),
    pausierbar: (j.arbeiter ?? 0) > 0 || j.funktion === 'wohnen',
  };
}

const typen = (gebaeudeJson as { gebaeude: GebaeudeJson[] }).gebaeude.map(baue);

/** Gebäudetypen nach Id (Reihenfolge wie in data/buildings.json). */
export const GEBAEUDE: Readonly<Record<string, GebaeudeTyp>> = Object.fromEntries(typen.map((t) => [t.id, t]));
/** Ids in der Reihenfolge der Datei (für das Baumenü). */
export const GEBAEUDE_IDS: readonly string[] = typen.map((t) => t.id);

/** Startvorrat des Lagers je Warenart (12 bretter, 8 stein, 8 kartoffeln). */
export const START_VORRAT: readonly number[] = GEBAEUDE.lager.vorrat;

/** Kirmes-Stufen aus data/dorf.json (Weiler → Dorf; weitere kommen in M8). */
export const KIRMES: readonly KirmesStufe[] = dorf.kirmes.map((k) => ({
  liste: jeWare(k.liste), festTicks: sek(k.fest_s), zuzug: k.zuzug, schaltetFrei: k.schaltet_frei.slice(),
}));

/**
 * Warenverteilung (ROADMAP M7, wie Siedler 2): Abnehmer-Arten in der Reihenfolge von data/dorf.json (Index = Art: 0 Baustellen,
 * 1 Kirmesplatz, 2 Verarbeiter, 3 Wohnhäuser). Je Ware und Dorf gilt eine Rangfolge dieser Arten; das Lager nimmt immer zuletzt.
 */
export const ABNEHMER: readonly { id: string; name: string; symbol: string }[] = dorf.verteilung.abnehmer.map((a) => ({ ...a }));
export const ABNEHMER_ZAHL = ABNEHMER.length;
/** Standard-Rangfolge (Abnehmer-Indizes), für jede Ware gleich: die feste Reihenfolge aus M5. */
export const VERTEILUNG_STANDARD: readonly number[] = dorf.verteilung.standard.map((id) => {
  const i = ABNEHMER.findIndex((a) => a.id === id);
  if (i < 0) throw new Error(`Unbekannter Abnehmer "${id}" in data/dorf.json`);
  return i;
});
if (new Set(VERTEILUNG_STANDARD).size !== ABNEHMER_ZAHL) throw new Error('data/dorf.json: verteilung.standard muss jeden Abnehmer genau einmal nennen');

/** Statistik (ROADMAP M7): Messpunkt alle STAT_TAKT Ticks je Dorf, höchstens STAT_MAX Punkte (dann wird ausgedünnt). */
export const STAT_TAKT = sek(dorf.statistik.takt_s);
export const STAT_MAX = Math.max(4, dorf.statistik.max_punkte);
/** Autosave alle so viele Spielminuten (Oberfläche, nicht Simulation). */
export const AUTOSAVE_MIN = dorf.autosave.takt_min;
