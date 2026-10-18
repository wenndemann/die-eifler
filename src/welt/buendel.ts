// Bündel-Dateien der Teilen-Version (tools/build_share.mjs): Artifact-Seiten dürfen nur wenige Dateien haben,
// darum liegen viele Kacheln als Base64-Text in einem Bündel. Format: je Zeile „pfad<TAB>base64“.
// Die Datei buendel.json der Datenversion sagt, in welchem Bündel ein Pfad liegt: { "r10/9_4.bin.gz": "buendel/r10-0.txt" }.

/** Pfade, die in Bündeln liegen: Kacheln. Übersicht und Ortsverzeichnis bleiben Einzeldateien. */
export const BUENDEL_ART = /^(r10|r40|vec|hex)\//;

export interface BuendelErgebnis {
  /** Name (z. B. buendel/r10-0.txt) → Textinhalt */
  buendel: Map<string, string>;
  /** Pfad → Name des Bündels */
  index: Record<string, string>;
}

/**
 * Packt (pfad, base64)-Paare in Bündel von höchstens maxBytes Zeichen. Je Kachelart (erster Pfadteil) eigene Bündel,
 * in der gegebenen Reihenfolge (benachbarte Kacheln bleiben zusammen). Eine einzelne zu große Datei bekommt ein eigenes Bündel.
 */
export function packeBuendel(dateien: [string, string][], maxBytes: number): BuendelErgebnis {
  const buendel = new Map<string, string>();
  const index: Record<string, string> = {};
  const zaehler = new Map<string, number>();
  let art = '', name = '', teile: string[] = [], groesse = 0;
  const schliesse = () => {
    if (name && teile.length) buendel.set(name, teile.join(''));
    teile = []; groesse = 0; name = '';
  };
  for (const [pfad, b64] of dateien) {
    if (pfad.includes('\t') || pfad.includes('\n')) throw new Error(`Ungültiger Pfad im Bündel: ${pfad}`);
    const a = pfad.split('/')[0];
    const zeile = `${pfad}\t${b64}\n`;
    if (a !== art) { schliesse(); art = a; }
    if (name && groesse + zeile.length > maxBytes) schliesse();
    if (!name) {
      const n = zaehler.get(a) ?? 0;
      zaehler.set(a, n + 1);
      name = `buendel/${a}-${n}.txt`;
    }
    teile.push(zeile);
    groesse += zeile.length;
    index[pfad] = name;
  }
  schliesse();
  return { buendel, index };
}

/** Bündel-Text in Pfad → Base64-Text zerlegen. */
export function parseBuendel(text: string): Map<string, string> {
  const m = new Map<string, string>();
  let von = 0;
  while (von < text.length) {
    let bis = text.indexOf('\n', von);
    if (bis < 0) bis = text.length;
    const tab = text.indexOf('\t', von);
    if (tab > von && tab < bis) m.set(text.slice(von, tab), text.slice(tab + 1, bis));
    von = bis + 1;
  }
  return m;
}
