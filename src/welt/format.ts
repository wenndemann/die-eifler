// Weltdaten-Format 1 (tools/map/FORMAT.md). Gemeinsame Konstanten für Client und Tests.

/** Welt-Ursprung (NW-Ecke) in UTM 32N und Größe in Metern. x = E − E0 (Osten), z = N0 − N (Süden). */
export const WELT = { E0: 266000, N0: 5643000, SX: 126000, SZ: 138000 } as const;
/** Raster-Kacheln: Kantenlänge in Metern, Zellen je Kachel für r10 und r40. */
export const KACHEL = { m: 6000, r10: 600, r40: 150 } as const;
/** Hex-Raster: Umkreisradius, Kachelgröße (Hexe), Weltgröße in Spalten/Zeilen (odd-r). */
export const HEX = { R: 60, tile: 64, cols: 1213, rows: 1534 } as const;
/** Kulisse rund um das Spielfeld (Meter). */
export const KULISSE = 2000;

export const GROESSEN = { klein: 45, mittel: 60, gross: 80 } as const;
export type Groesse = keyof typeof GROESSEN;
export const GROESSE_NAME: Record<Groesse, string> = { klein: 'klein', mittel: 'mittel', gross: 'groß' };
/** Mindestzahl Spieler je Größe (Drehbuch 3.1), für „Hier wohnt keiner.“ */
export const GROESSE_SPIELER: Record<Groesse, [number, number]> = { klein: [1, 2], mittel: [2, 4], gross: [4, 6] };

export const COVER = ['wasser', 'wiese', 'acker', 'wald', 'heide', 'moor', 'fels', 'siedlung'] as const;
export const TERRAIN = ['wasser', 'wiese', 'wald', 'heide', 'moor', 'stein', 'siedlung'] as const;
export const LAND = ['', 'DE', 'BE', 'LU', 'NL'] as const;

/** Bits im Hex-Feld flags. */
export const FLAG = { ortskern: 1, fluss: 2, ufer: 4, grenze: 8, keineDaten: 16 } as const;

export interface Manifest {
  format: number;
  version: string;
  gebiet: string;
  erstellt: string;
  crs: string;
  origin: [number, number];
  size: [number, number];
  tile: number;
  tiles: [number, number];
  kacheln: [number, number][];
  hex: { size: number; tile: number; tiles: [number, number]; cols: number; rows: number; terrain: string[]; fields: string[]; kacheln: [number, number][] };
  cover: string[];
  heightRange: [number, number];
  quellen?: Record<string, string[]>;
  files: Record<string, string>;
  credits: string[];
}

export interface Versionen {
  aktuell: string;
  versionen: { id: string; gebiet: string; erstellt: string }[];
}

/** Ein Ort im Ortsverzeichnis: Name, Art (Index in kinds), x, z (Weltmeter), Land, Hex q, r des Ortskerns, „bei“-Ort. */
export type OrtEintrag = [string, number, number, number, number, number, number, string];

export interface Orte {
  kinds: string[];
  orte: OrtEintrag[];
  gewaesser: [string, number, number][];
}

/** Ein Ausschnitt ist vollständig beschrieben durch Datenversion, Mittel-Hex und Größe (Drehbuch 8.1). */
export interface AusschnittParam {
  version: string;
  q: number;
  r: number;
  size: Groesse;
}
