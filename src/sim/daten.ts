// Konstanten und Gebäudetypen der Simulation (DESIGN §4, §6). Waren und Gebäude kommen aus data/goods.json und
// data/buildings.json; hier werden sie in Ganzzahlen (Zeiten in Ticks, Mengen je Warenart) umgerechnet.
import { TICK_HZ } from './typen';
import warenJson from '../../data/goods.json';
import gebaeudeJson from '../../data/buildings.json';

interface WareJson { id: string; name: string; gruppe: string }
interface GebaeudeJson {
  id: string; name: string; gruppe: string; symbol: string; spruch: string;
  funktion: string; groesse: number; kosten: Record<string, number>;
  radius?: number; arbeiter?: number; wohnraum?: number;
  vorrat?: Record<string, number>;
  eingang?: Record<string, number>;
  ausgang?: { ware: string; max: number };
  wandelt?: { ein: string; aus: string; dauer_s: number };
  zeiten?: { arbeit_s?: number; ruhe_s?: number };
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
/** Der liefernde Träger verbaut eine Ware selbst (DESIGN §4.6: BUILD_ACTION 0,4 s). */
export const BUILD_ACTION = 8;

export const TRAEGER_START = 40;

/** Bäume (DESIGN §12): höchstens so viele je Hex (ausgewachsen + Jungbäume). */
export const TREE_MAX = 3;
/** Ein Jungbaum wird in dieser Zeit zum Baum (Startwert 75 s). */
export const BAUM_WACHSEN = 75 * TICK_HZ;
/** Felsen: Einheiten Stein je Hex (Steinfeld, Klippen ab STEIL_GRAD). */
export const FELS_STEIN = 12;
export const FELS_STEIL = 4;
export const STEIL_GRAD = 22;
/** Baustellen-Priorität 1..3, Standard 2. */
export const PRIO_MIN = 1;
export const PRIO_MAX = 3;
export const PRIO_STANDARD = 2;
/** Wartezeit, bis ein Arbeiter ohne Ziel (kein Baum, kein Fels, kein Platz) neu sucht. */
export const SUCHE_WARTE = 2 * TICK_HZ;

export type Funktion = 'lager' | 'wohnen' | 'holzfaeller' | 'foerster' | 'steinbruch' | 'saegewerk';

export interface GebaeudeTyp {
  id: string; name: string; gruppe: string; symbol: string; spruch: string;
  funktion: Funktion;
  groesse: 1 | 2 | 3;
  /** Baukosten je Warenart. */
  kosten: readonly number[];
  kostenSumme: number;
  /** Arbeitsradius in Hexen (0 = keiner). */
  radius: number;
  /** Braucht je einen Bewohner aus dem Vorrat (0 oder 1). */
  arbeiter: number;
  /** Input-Puffer: Größe je Warenart; 0 = nimmt die Ware nicht an. */
  puffer: readonly number[];
  pufferSumme: number;
  /** Output-Puffer (Warenart, Größe); -1 bei keiner. */
  ausgangWare: number;
  ausgangMax: number;
  /** Verarbeiter: macht aus 1 Ware `ein` in `ticks` eine Ware `aus`. */
  wandelt?: { ein: number; aus: number; ticks: number };
  /** Arbeitsdauer (Fällen, Pflanzen, Hauen) und Ruhe danach in Ticks. */
  arbeitTicks: number;
  ruheTicks: number;
  wohnraum: number;
  /** Startvorrat je Warenart (nur Lager). */
  vorrat: readonly number[];
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
    arbeiter: j.arbeiter ?? 0,
    puffer, pufferSumme: puffer.reduce((s, n) => s + n, 0),
    ausgangWare: j.ausgang ? ausId(j.ausgang.ware) : -1,
    ausgangMax: j.ausgang ? j.ausgang.max : 0,
    wandelt: j.wandelt ? { ein: ausId(j.wandelt.ein), aus: ausId(j.wandelt.aus), ticks: ticks(j.wandelt.dauer_s) } : undefined,
    arbeitTicks: ticks(j.zeiten?.arbeit_s),
    ruheTicks: ticks(j.zeiten?.ruhe_s),
    wohnraum: j.wohnraum ?? 0,
    vorrat: jeWare(j.vorrat),
  };
}

const typen = (gebaeudeJson as { gebaeude: GebaeudeJson[] }).gebaeude.map(baue);

/** Gebäudetypen nach Id (Reihenfolge wie in data/buildings.json). */
export const GEBAEUDE: Readonly<Record<string, GebaeudeTyp>> = Object.fromEntries(typen.map((t) => [t.id, t]));
/** Ids in der Reihenfolge der Datei (für das Baumenü). */
export const GEBAEUDE_IDS: readonly string[] = typen.map((t) => t.id);

/** Startvorrat des Lagers je Warenart (12 bretter, 8 stein, 8 kartoffeln). */
export const START_VORRAT: readonly number[] = GEBAEUDE.lager.vorrat;
