// Konstanten und Gebäudetypen der Simulation (DESIGN §4, §6). Waren und Gebäude kommen aus data/goods.json und
// data/buildings.json; hier werden sie in Ganzzahlen (Zeiten in Ticks, Mengen je Warenart) umgerechnet.
import { TICK_HZ } from './typen';
import warenJson from '../../data/goods.json';
import gebaeudeJson from '../../data/buildings.json';
import dorfJson from '../../data/dorf.json';
import jahrJson from '../../data/jahr.json';
import festeJson from '../../data/feste.json';

interface WareJson { id: string; name: string; gruppe: string; nahrung?: number; mischkorb?: boolean; form?: string; farbe?: string; farbe_fb?: string }
interface GebaeudeJson {
  id: string; name: string; gruppe: string; symbol: string; spruch: string;
  funktion: string; groesse: number; kosten: Record<string, number>;
  radius?: number; radiusGut?: number; arbeiter?: number; wohnraum?: number;
  vorrat?: Record<string, number>;
  eingang?: Record<string, number>;
  ausgang?: { ware: string; max: number };
  wandelt?: { ein: string | Record<string, number>; menge?: number; aus: string; dauer_s: number };
  zeiten?: { arbeit_s?: number; ruhe_s?: number };
  nahrung_plaetze?: number; ab_stufe?: number; einmalig?: boolean; taste?: string;
  saison?: string; werkzeug?: number; boten?: number; leistung?: string; fonds_menge?: number;
  voelkchen?: string[]; modell?: string; am_wasser?: boolean; kein_planieren?: boolean;
  laut?: boolean; am_moor?: boolean; schnellweg?: { radius?: number; prozent: number; bahn?: boolean };
  acker?: { name: string; wachsen_s: number; ernte?: number };
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
/** Zählt im Mischkorb der Marktflecken-Kirmes (veredelt: Nahrung ab Stufe 2 oder 'mischkorb' in goods.json). */
export const MISCHKORB: readonly boolean[] = warenListe.map((w) => (w.nahrung ?? 0) >= 2 || !!w.mischkorb);
/** Lesbares Modell je Warenart (Drehbuch 7.6): Form und Hauptfarbe. */
export const WAREN_FORM: readonly string[] = warenListe.map((w) => w.form ?? 'sack');
export const WAREN_FARBE: readonly string[] = warenListe.map((w) => w.farbe ?? '#b08850');
/** Hauptfarbe im Farbenblind-Modus (Einstellungen). */
export const WAREN_FARBE_FB: readonly string[] = warenListe.map((w, i) => w.farbe_fb ?? WAREN_FARBE[i]);

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
const dorf = dorfJson as unknown as {
  start: { bewohner: number; bauarbeiter: number; planierer: number };
  wohnen: { zyklus_s: number[]; notnagel_frei_unter: number; notnagel_s: number };
  bauen: { je_ware_s: number; planieren_ab_grad: number; planieren_s: number; planieren_je_grad_s: number };
  stufen: string[];
  kirmes: { liste: Record<string, number>; fest_s: number; zuzug: number; schaltet_frei: string[]; geschenk?: Record<string, number>; mischkorb?: number }[];
  bauleute: { takt_s: number; max: number };
  boten: { dauer_s: number; ab_hex: number; torkeln_prozent: number; verliert_jede: number; aufsammeln_s: number };
  verteilung: { abnehmer: { id: string; name: string; symbol: string }[]; standard: string[]; je_ware?: Record<string, string[]> };
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
export interface KirmesStufe {
  liste: readonly number[]; festTicks: number; zuzug: number; schaltetFrei: readonly string[];
  /** Kommt nach dem Fest ins Lager (je Warenart). */
  geschenk: readonly number[];
  /** So viele beliebige veredelte Waren (MISCHKORB) zusätzlich zur Liste. */
  mischkorb: number;
}

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

export type Funktion = 'lager' | 'wohnen' | 'holzfaeller' | 'foerster' | 'steinbruch' | 'erzeuger' | 'verarbeiter' | 'kirmes' | 'schaenke'
  | 'finder' | 'wache' | 'schuetzen' | 'zier' | 'hecke' | 'boote' | 'schnellweg' | 'fonds' | 'maijungen' | 'funde' | 'hof';

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
  /** Verarbeiter: macht aus den Waren `ein` (Warenart a, Menge n) in `ticks` eine Ware `aus`. */
  wandelt?: { ein: readonly { a: number; n: number }[]; aus: number; ticks: number };
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
  /** Taste im offenen Baumenü (Großbuchstabe) oder ''. */
  taste: string;
  /** Feld (saison 'feld'): ruht im Winter, Aussaat im Frühjahr, Ernte im Herbst (data/jahr.json). */
  feld: boolean;
  /** Werkzeug, das die Fachkraft braucht, bevor sie anfängt (0 = keins). */
  werkzeug: number;
  /** Schänke: höchstens so viele Boten zugleich. */
  boten: number;
  /** Satz fürs Gebäudefenster (data/buildings.json: leistung) oder ''. */
  leistung: string;
  /** M12 Eifelfonds: so viele Stück der Ausgangsware je Auszahlung. */
  fondsMenge: number;
  /** M11: nur diese Völkchen dürfen es bauen (leer = alle); Darstellung wie Gebäude `modell`; braucht Wasser nah; kein Planieren am Hang. */
  voelkchen: readonly string[]; modell: string; amWasser: boolean; keinPlanieren: boolean;
  /** Platz mit Hof hinter dem Haus (Kirmesplatz, Schützenhaus, Abtei): hinter ihm führt kein Weg entlang. */
  /** Laut (Laacher: nicht nah an der Abtei); braucht Moor nah; macht eigene Wege schneller (Römerstraße, Vennbahn). */
  laut: boolean; amMoor: boolean; schnellweg: { radius: number; prozent: number; bahn: boolean } | null;
  /** Hof (Höfe und Felder): das Feld, das der Bauer im Umkreis sät und erntet – Name, Wachstum in Ticks, Ernte je Feld; sonst null. */
  acker: { name: string; wachsenTicks: number; ernte: number } | null;
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
  // Werkzeug der Fachkraft kommt wie jede Zutat über den Eingang
  if (j.werkzeug) puffer[ausId('werkzeug')] += j.werkzeug;
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
    wandelt: j.wandelt ? {
      ein: typeof j.wandelt.ein === 'string' ? [{ a: ausId(j.wandelt.ein), n: j.wandelt.menge ?? 1 }] : Object.entries(j.wandelt.ein).map(([id, n]) => ({ a: ausId(id), n })),
      aus: ausId(j.wandelt.aus), ticks: ticks(j.wandelt.dauer_s),
    } : undefined,
    arbeitTicks: ticks(j.zeiten?.arbeit_s),
    ruheTicks: ticks(j.zeiten?.ruhe_s),
    wohnraum: j.wohnraum ?? 0,
    nahrungPlaetze: j.nahrung_plaetze ?? 0,
    abStufe: j.ab_stufe ?? 0,
    einmalig: !!j.einmalig,
    vorrat: jeWare(j.vorrat),
    pausierbar: (j.arbeiter ?? 0) > 0 || j.funktion === 'wohnen',
    taste: (j.taste ?? '').toUpperCase(),
    feld: j.saison === 'feld',
    werkzeug: j.werkzeug ?? 0,
    boten: j.boten ?? 0,
    leistung: j.leistung ?? '',
    fondsMenge: j.fonds_menge ?? 0,
    voelkchen: j.voelkchen ?? [], modell: j.modell ?? '', amWasser: !!j.am_wasser, keinPlanieren: !!j.kein_planieren,
    laut: !!j.laut, amMoor: !!j.am_moor,
    schnellweg: j.schnellweg ? { radius: j.schnellweg.radius ?? 0, prozent: j.schnellweg.prozent, bahn: !!j.schnellweg.bahn } : null,
    acker: j.acker ? { name: j.acker.name, wachsenTicks: ticks(j.acker.wachsen_s), ernte: Math.max(1, Math.floor(j.acker.ernte ?? 1)) } : null,
  };
}

/** Wie viel von Ware `a` ein Verarbeiter je Arbeitsgang braucht (Werkzeug der Fachkraft: das Werkzeug; sonst 1). */
export function zutatMenge(t: GebaeudeTyp, a: number): number {
  return t.wandelt?.ein.find((z) => z.a === a)?.n ?? (a === WARE.werkzeug && t.werkzeug ? t.werkzeug : 1);
}

const typen = (gebaeudeJson as unknown as { gebaeude: GebaeudeJson[] }).gebaeude.map(baue);

/** Gebäudetypen nach Id (Reihenfolge wie in data/buildings.json). */
export const GEBAEUDE: Readonly<Record<string, GebaeudeTyp>> = Object.fromEntries(typen.map((t) => [t.id, t]));
/** Ids in der Reihenfolge der Datei (für das Baumenü). */
export const GEBAEUDE_IDS: readonly string[] = typen.map((t) => t.id);

/**
 * Feldarten (Höfe und Felder): die Höfe in Datei-Reihenfolge; ein Feld-Hex trägt 1 + Index (0 = kein Feld). Neue Höfe nur hinten
 * anfügen, sonst passen ältere Spielstände nicht mehr.
 */
export const FELD_ARTEN: readonly string[] = typen.filter((t) => t.funktion === 'hof').map((t) => t.id);

/** Startvorrat des Lagers je Warenart (12 bretter, 8 stein, 8 kartoffeln). */
export const START_VORRAT: readonly number[] = GEBAEUDE.lager.vorrat;

/** Kirmes-Stufen aus data/dorf.json (Weiler → Dorf → Kirchdorf → Marktflecken). */
export const KIRMES: readonly KirmesStufe[] = dorf.kirmes.map((k) => ({
  liste: jeWare(k.liste), festTicks: sek(k.fest_s), zuzug: k.zuzug, schaltetFrei: k.schaltet_frei.slice(),
  geschenk: jeWare(k.geschenk), mischkorb: k.mischkorb ?? 0,
}));

/** Neue Bauleute aus Werkzeug (Drehbuch 4.5): Takt in Ticks und Höchstzahl je Beruf. */
export const BAULEUTE_TAKT = sek(dorf.bauleute.takt_s);
export const BAULEUTE_MAX = dorf.bauleute.max;

/** Beschwipste Boten (DESIGN §10.3): Dauer in Ticks, ab welchem Abstand (Hexe) sie tragen, Torkeln, Verlust, Aufsammeln. */
export const BOTE_TICKS = sek(dorf.boten.dauer_s);
export const BOTE_AB_HEX = dorf.boten.ab_hex;
export const BOTE_TORKELN_PROZENT = dorf.boten.torkeln_prozent;
export const BOTE_VERLIERT_JEDE = Math.max(1, dorf.boten.verliert_jede);
export const AUFSAMMELN_TICKS = sek(dorf.boten.aufsammeln_s);

// ---------------------------------------------------------------- Jahreszeiten und Wetter (data/jahr.json, Drehbuch 7.4)

interface WetterJson {
  name: string; symbol: string; wege?: number; arbeit?: number; felder?: number; missernte?: number; hochwasser?: boolean; wegschwimmen?: number; wo: string;
}
const jahr = jahrJson as unknown as {
  jahr_min: number; jahreszeiten: string[];
  feld: { saat_s: number; ernte_prozent: number; alte_hoefe_felder: number };
  winter: { essen_s: number; je_bewohner: number; frieren_prozent: number; schnee_prozent: number };
  wetter: {
    je_jahreszeit_min: number; je_jahreszeit_max: number; dauer_min_s: number; dauer_max_s: number; ankuendigung_s: number;
    tal_dm: number; hoehe_prozent: number; aue_dm: number;
    arten: Record<string, WetterJson>; je_jahreszeit: string[][];
  };
};
/** Ein Spieljahr in Ticks (Startwert 60 min) und eine Jahreszeit (ein Viertel). */
export const JAHR_TICKS = Math.max(4, sek(jahr.jahr_min * 60) - (sek(jahr.jahr_min * 60) % 4));
export const JAHRESZEIT_TICKS = JAHR_TICKS / 4;
export const JAHRESZEITEN: readonly string[] = jahr.jahreszeiten;
export const WINTER = 3;
export const SAAT_TICKS = sek(jahr.feld.saat_s);
export const ERNTE_PROZENT = jahr.feld.ernte_prozent;
/** Höfe und Felder: so viele reife Felder bekommt ein Hof aus einem älteren Spielstand. */
export const FELD_ALT = jahr.feld.alte_hoefe_felder;
export const WINTER_ESSEN_TICKS = sek(jahr.winter.essen_s);
export const WINTER_JE_BEWOHNER = Math.max(1, jahr.winter.je_bewohner);
export const FRIEREN_PROZENT = jahr.winter.frieren_prozent;
export const SCHNEE_PROZENT = jahr.winter.schnee_prozent;

/** Wetterart (Index = Art in der Simulation). wo: 0 alle, 1 Tal, 2 Höhe, 3 Aue. */
export interface WetterArt {
  id: string; name: string; symbol: string;
  wege: number; arbeit: number; felder: number; missernte: number; hochwasser: boolean; wegschwimmen: number; wo: 0 | 1 | 2 | 3;
}
const WO: Record<string, 0 | 1 | 2 | 3> = { alle: 0, tal: 1, hoehe: 2, aue: 3 };
export const WETTER: readonly WetterArt[] = Object.entries(jahr.wetter.arten).map(([id, w]) => ({
  id, name: w.name, symbol: w.symbol, wege: w.wege ?? 0, arbeit: w.arbeit ?? 0, felder: w.felder ?? 0, missernte: w.missernte ?? 0,
  hochwasser: !!w.hochwasser, wegschwimmen: w.wegschwimmen ?? 0, wo: WO[w.wo] ?? 0,
}));
/** Mögliche Wetterarten je Jahreszeit (Indizes in WETTER). */
export const WETTER_JE_JAHRESZEIT: readonly (readonly number[])[] = jahr.wetter.je_jahreszeit.map((l) => l.map((id) => {
  const i = WETTER.findIndex((w) => w.id === id);
  if (i < 0) throw new Error(`Unbekanntes Wetter "${id}" in data/jahr.json`);
  return i;
}));
export const WETTER_MIN = jahr.wetter.je_jahreszeit_min;
export const WETTER_MAX = Math.max(WETTER_MIN, jahr.wetter.je_jahreszeit_max);
export const WETTER_DAUER_MIN = sek(jahr.wetter.dauer_min_s);
export const WETTER_DAUER_MAX = Math.max(WETTER_DAUER_MIN, sek(jahr.wetter.dauer_max_s));
export const WETTER_ANKUENDIGUNG = sek(jahr.wetter.ankuendigung_s);
/** Tal: Hex mindestens TAL_DM tiefer als der Schnitt im Umkreis 4; Höhe: oberes Drittel der Höhen; Aue: am Wasser und höchstens AUE_DM darüber. */
export const TAL_DM = jahr.wetter.tal_dm;
export const HOEHE_PROZENT = jahr.wetter.hoehe_prozent;
export const AUE_DM = jahr.wetter.aue_dm;

// ---------------------------------------------------------------- Kleine Feste (data/feste.json, Drehbuch 6 „Feste“)

export interface KleinesFest { id: string; name: string; symbol: string; jahreszeit: number; liste: readonly number[]; punkte: number }
const feste = festeJson as unknown as { obergrenze: number; fest_s: number; feste: { id: string; name: string; symbol: string; jahreszeit: number; liste: Record<string, number>; punkte: number }[] };
export const KLEINE_FESTE: readonly KleinesFest[] = feste.feste.map((f) => ({ id: f.id, name: f.name, symbol: f.symbol, jahreszeit: f.jahreszeit, liste: jeWare(f.liste), punkte: f.punkte }));
export const FEST_OBERGRENZE = feste.obergrenze;
export const KLEINES_FEST_TICKS = sek(feste.fest_s);

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
/** Standard-Rangfolge je Warenart (Index = Ware): meist VERTEILUNG_STANDARD, für einzelne Waren abweichend (data/dorf.json: je_ware). */
export const VERTEILUNG_JE_WARE: readonly (readonly number[])[] = WAREN.map((id) => {
  const r = dorf.verteilung.je_ware?.[id];
  if (!r) return VERTEILUNG_STANDARD;
  const x = r.map((a) => ABNEHMER.findIndex((b) => b.id === a));
  if (new Set(x).size !== ABNEHMER_ZAHL || x.some((i) => i < 0)) throw new Error(`data/dorf.json: verteilung.je_ware.${id} muss jeden Abnehmer genau einmal nennen`);
  return x;
});

/** Statistik (ROADMAP M7): Messpunkt alle STAT_TAKT Ticks je Dorf, höchstens STAT_MAX Punkte (dann wird ausgedünnt). */
export const STAT_TAKT = sek(dorf.statistik.takt_s);
export const STAT_MAX = Math.max(4, dorf.statistik.max_punkte);
/** Autosave alle so viele Spielminuten (Oberfläche, nicht Simulation). */
export const AUTOSAVE_MIN = dorf.autosave.takt_min;
