// Konstanten und Gebäudetypen der Simulation (DESIGN §4, §6). Alles Ganzzahlen; Zeiten in Ticks.
import { TICK_HZ } from './typen';

/** Warenarten; der Index ist die Warenart. */
export const WAREN = ['stamm', 'brett', 'stein', 'essen'] as const;
export const WARE = { stamm: 0, brett: 1, stein: 2, essen: 3 } as const;

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

export const TRAEGER_START = 40;
/** Startvorrat des Lagers je Warenart. */
export const START_VORRAT: readonly number[] = [0, 12, 8, 10];
/** Bau ohne Material (M3): Dauer von 0 auf PROMILLE. */
export const BAU_TICKS = 30 * TICK_HZ;

export interface GebaeudeTyp {
  groesse: 1 | 2 | 3;
  /** Größe des Puffers je Warenart (Input bzw. Verbraucher); 0 = nimmt die Ware nicht an. */
  puffer: readonly number[];
  /** Erzeuger: liefert alle `ticks` eine Ware, wenn seine Fahne Platz hat. */
  erzeugt?: { ware: number; ticks: number };
  /** Verarbeiter: macht aus 1 Ware `ein` in `ticks` eine Ware `aus`. */
  wandelt?: { ein: number; aus: number; ticks: number };
  /** Verbraucher: verbraucht alle `ticks` je eine Ware jeder Art im Puffer. */
  verbraucht?: { ticks: number };
}

export const GEBAEUDE: Readonly<Record<string, GebaeudeTyp>> = {
  lager: { groesse: 3, puffer: [0, 0, 0, 0] },
  holzfaeller: { groesse: 1, puffer: [0, 0, 0, 0], erzeugt: { ware: WARE.stamm, ticks: 20 * TICK_HZ } },
  steinbruch: { groesse: 1, puffer: [0, 0, 0, 0], erzeugt: { ware: WARE.stein, ticks: 25 * TICK_HZ } },
  saegewerk: { groesse: 2, puffer: [4, 0, 0, 0], wandelt: { ein: WARE.stamm, aus: WARE.brett, ticks: 15 * TICK_HZ } },
  wohnhaus: { groesse: 1, puffer: [0, 2, 2, 2], verbraucht: { ticks: 30 * TICK_HZ } },
};
