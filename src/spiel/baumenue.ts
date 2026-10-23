// Reine Textlogik fürs Baumenü ohne Browser, three oder Simulation: Umkreis-Hexe, Kosten- und Bedarfstexte, Menü-Gruppierung,
// Zustände in Klartext mit kurzem Spruch (DREHBUCH 1.1). Einzeln testbar (tests/baumenue.test.ts).
import type { Hx } from './logik';

/** Hexe im Umkreis (Hex-Abstand ≤ radius) um eine Mitte, nach r, dann q sortiert; ohne die Mitte, wenn nicht verlangt. */
export function hexeImUmkreis(mitte: Hx, radius: number, mitMitte = false): Hx[] {
  const aus: Hx[] = [];
  for (let dr = -radius; dr <= radius; dr++) {
    for (let dq = Math.max(-radius, -dr - radius); dq <= Math.min(radius, -dr + radius); dq++) {
      if (!mitMitte && dq === 0 && dr === 0) continue;
      aus.push({ q: mitte.q + dq, r: mitte.r + dr });
    }
  }
  return aus;
}

/** Symbol sowie Einzahl und Mehrzahl einer Ware für Kosten- und Bedarfstexte. */
export interface WareText { icon: string; eins: string; mehr: string }

const WARE_KURZ: Record<string, [string, string, string]> = {
  stamm: ['🌲', 'Stamm', 'Stämme'], bretter: ['🪵', 'Brett', 'Bretter'], stein: ['🪨', 'Stein', 'Steine'],
  setzling: ['🌱', 'Setzling', 'Setzlinge'], milch: ['🥛', 'Milch', 'Milch'], aepfel: ['🍎', 'Apfel', 'Äpfel'],
  kartoffeln: ['🥔', 'Kartoffel', 'Kartoffeln'], kaese: ['🧀', 'Käse', 'Käse'], most: ['🍏', 'Most', 'Most'],
  bratkartoffeln: ['🍳', 'Bratkartoffel', 'Bratkartoffeln'], honig: ['🍯', 'Honig', 'Honig'], bergkaese: ['🧀', 'Bergkäse', 'Bergkäse'],
  gerste: ['🌾', 'Gerste', 'Gerste'], landbier: ['🍺', 'Landbier', 'Landbier'], wacholder: ['🫐', 'Wacholder', 'Wacholder'],
  schnaps: ['🍶', 'Schnaps', 'Schnaps'], erz: ['🪨', 'Erz', 'Erz'], holzkohle: ['⚫', 'Holzkohle', 'Holzkohle'], eisen: ['🔩', 'Eisen', 'Eisen'],
  werkzeug: ['🔨', 'Werkzeug', 'Werkzeug'], kaffee: ['☕', 'Kaffee', 'Kaffee'], bruecke: ['🌉', 'Brücke', 'Brücken'],
  wildbret: ['🍖', 'Wildbret', 'Wildbret'], wildgulasch: ['🍲', 'Wildgulasch', 'Wildgulasch'],
  // Völkchen (M11)
  wolle: ['🐑', 'Wolle', 'Wolle'], tuch: ['🧣', 'Tuch', 'Tuch'], senf: ['🟡', 'Senf', 'Senf'], fisch: ['🐟', 'Fisch', 'Fische'],
  raeucherfisch: ['🐠', 'Räucherfisch', 'Räucherfische'], papier: ['📜', 'Papier', 'Papier'], werkstein: ['🧱', 'Werkstein', 'Werksteine'],
  sprudel: ['💧', 'Sprudel', 'Sprudel'], lavastein: ['🌋', 'Lavastein', 'Lavasteine'], trauben: ['🍇', 'Traube', 'Trauben'],
  rotwein: ['🍷', 'Rotwein', 'Rotwein'], muehlstein: ['⚙️', 'Mühlstein', 'Mühlsteine'], schiefer: ['🔷', 'Schiefer', 'Schiefer'],
  hopfen: ['🌿', 'Hopfen', 'Hopfen'], edelbier: ['🍻', 'Edelbier', 'Edelbier'], harz: ['🍯', 'Harz', 'Harz'], butter: ['🧈', 'Butter', 'Butter'],
  lohe: ['🟤', 'Lohe', 'Lohe'], leder: ['👞', 'Leder', 'Leder'], ham: ['🍖', 'Ham', 'Ham'], garn: ['🧶', 'Garn', 'Garn'],
  traubenmost: ['🧃', 'Traubenmost', 'Traubenmost'], dachschiefer: ['🏠', 'Dachschiefer', 'Dachschiefer'], torf: ['🟫', 'Torf', 'Torf'],
};

/** Texte je Warenart (Index = Warenart). Unbekannte Waren bekommen das letzte Wort ihres Anzeigenamens. */
export function wareTexte(ids: readonly string[], namen: readonly string[]): WareText[] {
  return ids.map((id, i) => {
    const k = WARE_KURZ[id];
    if (k) return { icon: k[0], eins: k[1], mehr: k[2] };
    const n = (namen[i] ?? id).split(' ').pop() ?? id;
    return { icon: '', eins: n, mehr: n };
  });
}

/** „2 Bretter“ / „1 Stein“ für eine Menge. */
export function mengeText(n: number, w: WareText): string {
  return `${n} ${n === 1 ? w.eins : w.mehr}`;
}

/** Kosten oder Bedarf als Text: „2 Bretter, 1 Stein“; mit `symbole` „2 🪵 Bretter · 1 🪨 Stein“. Leer → „nichts“. */
export function kostenText(kosten: readonly number[], w: readonly WareText[], symbole = false): string {
  const teile: string[] = [];
  kosten.forEach((n, i) => {
    if (!(n > 0) || !w[i]) return;
    teile.push(symbole ? `${n} ${w[i].icon ? w[i].icon + ' ' : ''}${n === 1 ? w[i].eins : w[i].mehr}` : mengeText(n, w[i]));
  });
  return teile.join(symbole ? ' · ' : ', ') || 'nichts';
}

/** Fehlmengen je Warenart, wenn der Vorrat die Kosten nicht deckt (sonst lauter Nullen). */
export function fehlmengen(kosten: readonly number[], vorrat: readonly number[]): number[] {
  return kosten.map((n, i) => Math.max(0, n - (vorrat[i] ?? 0)));
}

/** Namen der Waren mit Bedarf („Bretter, Steine“) für „Wartet auf …“. */
export function bedarfNamen(bedarf: readonly number[], w: readonly WareText[]): string {
  return bedarf.map((n, i) => (n > 0 && w[i] ? w[i].mehr : '')).filter(Boolean).join(', ');
}

export const BAUPLATZ_NAMEN = ['kein', 'klein', 'mittel', 'groß'] as const;

/** Was die Gruppierung von einem Gebäudetyp braucht (GebaeudeTyp erfüllt das). */
export interface MenueTyp { id: string; gruppe: string }
export interface MenueGruppe<T extends MenueTyp = MenueTyp> { gruppe: string; typen: T[] }

/** Gebäude nach `gruppe` gruppieren (Reihenfolge des ersten Auftretens in den Daten), ohne die ausgeschlossenen Ids (Standard: das Lager). */
export function menueGruppen<T extends MenueTyp>(typen: readonly T[], ohne: readonly string[] = ['lager']): MenueGruppe<T>[] {
  const aus: MenueGruppe<T>[] = [];
  for (const t of typen) {
    if (ohne.includes(t.id)) continue;
    let g = aus.find((x) => x.gruppe === t.gruppe);
    if (!g) { g = { gruppe: t.gruppe, typen: [] }; aus.push(g); }
    g.typen.push(t);
  }
  return aus;
}

const OHNE_ARBEIT: Record<string, string> = {
  baum: 'Kein Baum in Reichweite – die Hütte hätte nichts zu tun.',
  fels: 'Kein Fels in Reichweite – der Steinbruch hätte nichts zu tun.',
  platz: 'Kein Pflanzplatz in Reichweite – die Försterei hätte nichts zu tun.',
  feld: 'Kein Platz für Felder in Reichweite – der Hof hätte nichts zu tun.',
  wild: 'Kein Wild in Reichweite – der Jäger hätte nichts zu tun. Wild lebt im Wald.',
};

/** Was im Arbeitsradius liegt, als Text (arbeitsHexe der Simulation); `warn` bei nichts. null bei Gebäuden ohne Arbeitsradius.
 *  `nah` = davon im inneren („guten“) Ring; ohne Angabe fehlt der Nachsatz. */
export function reichweiteText(art: string, summe: number, nah?: number): { text: string; warn: boolean } | null {
  if (!(art in OHNE_ARBEIT)) return null;
  if (summe <= 0) return { text: OHNE_ARBEIT[art], warn: true };
  const rest = nah === undefined ? '' : nah <= 0 ? ', keiner davon nah' : nah >= summe && summe > 1 ? ', alle nah' : `, ${nah} davon nah`;
  if (art === 'baum') return { text: `${summe} ${summe === 1 ? 'Baum' : 'Bäume'} in Reichweite${rest}`, warn: false };
  if (art === 'fels') return { text: `Fels für ${summe} ${summe === 1 ? 'Stein' : 'Steine'} in Reichweite${rest}`, warn: false };
  if (art === 'wild') return { text: `${summe} Stück Wild in Reichweite${rest}`, warn: false };
  if (art === 'feld') return { text: `Platz für ${summe} ${summe === 1 ? 'Feld' : 'Felder'} in Reichweite${rest}`, warn: false };
  return { text: `Platz für ${summe} ${summe === 1 ? 'Baum' : 'Bäume'} in Reichweite${rest}`, warn: false };
}

/** Zustand eines Gebäudes in Klartext mit kurzem Spruch. */
export interface ZustandsText { titel: string; spruch: string; warn: boolean }

/** `funktion` (optional, aus den Daten): Wohnhäuser „arbeiten“ nicht, bei ihnen kommt Nachwuchs. */
export function zustandsText(zustand: string, baustelle: boolean, bedarf: string, funktion = ''): ZustandsText {
  if (!baustelle && funktion === 'wohnen' && zustand === 'arbeitet') return { titel: 'Nachwuchs kommt', spruch: 'Satt und zufrieden. Da kommen die Leute von selbst.', warn: false };
  if (baustelle) {
    if (zustand === 'getrennt') return { titel: 'Keine Verbindung zum Lager', spruch: 'Ohne Weg kommt kein Brett an.', warn: true };
    if (zustand === 'wartet_material') return { titel: bedarf ? `Wartet auf ${bedarf}` : 'Wartet auf Material', spruch: 'Der Träger kommt. Irgendwann.', warn: false };
    if (zustand === 'kein_planierer') return { titel: 'Wartet auf einen Planierer', spruch: 'Am Hang baut keiner schief. Erst wird planiert.', warn: false };
    if (zustand === 'planieren') return { titel: 'Wird planiert', spruch: 'Die Schaufel ebnet, was der Herrgott schief gemacht hat.', warn: false };
    if (zustand === 'kein_bauarbeiter') return { titel: 'Wartet auf einen Bauarbeiter', spruch: 'Material liegt da. Der Bauarbeiter ist noch woanders.', warn: false };
    return { titel: 'Wird gebaut', spruch: 'Es hämmert.', warn: false };
  }
  switch (zustand) {
    case 'getrennt': return { titel: 'Keine Verbindung zum Lager', spruch: 'Ein Weg wäre hilfreich.', warn: true };
    case 'kein_arbeiter': return { titel: 'Kein freier Bewohner', spruch: 'Alle beschäftigt. Oder beim Kaffee.', warn: true };
    case 'kein_baum': return { titel: 'Kein Baum mehr in Reichweite', spruch: 'Ein Förster könnte helfen. Oder Geduld.', warn: true };
    case 'kein_fels': return { titel: 'Kein Fels mehr in Reichweite', spruch: 'Der Berg ist leer. Das gibt es.', warn: true };
    case 'kein_platz': return { titel: 'Kein Pflanzplatz frei', spruch: 'Hier wächst schon alles zu.', warn: true };
    case 'kein_wild': return { titel: 'Kein Wild in Reichweite', spruch: 'Leergejagt. Der Wald braucht Ruhe – oder Wild von nebenan.', warn: true };
    case 'kein_feld': return { titel: 'Kein Platz für Felder', spruch: 'Wo Wege und Häuser stehen, wächst keine Kartoffel.', warn: true };
    case 'voll': return { titel: 'Lager voll – keiner holt ab', spruch: 'Wer nicht abholt, stapelt.', warn: true };
    case 'wartet_material': return { titel: bedarf ? `Wartet auf ${bedarf}` : 'Wartet auf Nachschub', spruch: 'Ohne Rohstoff kein Feierabend.', warn: false };
    case 'hunger': return { titel: 'Wartet auf Essen', spruch: 'Mit leerem Teller zieht hier keiner ein.', warn: true };
    case 'wohnraum_voll': return { titel: 'Kein Wohnraum frei – noch ein Wohnhaus bauen', spruch: 'Voll ist voll. Auch in der Eifel.', warn: false };
    case 'ruht': return { titel: 'Angehalten', spruch: 'Feierabend auf Anweisung. Keiner beschwert sich.', warn: false };
    case 'fest': return { titel: 'Es wird gefeiert!', spruch: 'Musik, Karussell, Feuerwerk. Gearbeitet wird morgen.', warn: false };
    case 'winter': return { titel: 'Ruht im Winter', spruch: 'Unter dem Schnee wächst nichts. Außer der Vorfreude.', warn: false };
    case 'saat': return { titel: 'Wird gesät', spruch: 'Erst säen, dann ernten. So war das schon immer.', warn: false };
    case 'hochwasser': return { titel: 'Hochwasser – steht still', spruch: 'Das Wasser geht wieder. Nicht in die Aue bauen hilft.', warn: true };
    case 'kein_werkzeug': return { titel: 'Wartet auf Werkzeug', spruch: 'Ohne Hammer kein Handwerk. Die Schmiede macht welches.', warn: true };
    case 'waechst': return { titel: 'Wächst noch heran', spruch: 'Eine Hecke braucht Geduld. Und Wasser. Und noch mehr Geduld.', warn: false };
    case 'regen': return { titel: 'Ruht bei Regen', spruch: 'Bei dem Wetter fährt keiner raus. Ist ja nicht wasserdicht.', warn: false };
    case 'fremd': return { titel: 'Steht auf fremdem Gebiet still', spruch: 'Die Grenze ist gewandert. Das Haus nicht.', warn: true };
    case 'ausrede': return { titel: 'Finder sitzt in der Ausredenstube', spruch: 'Je besser die Ausrede, desto schneller ist er frei.', warn: true };
    case 'arbeitet': return funktion === 'finder' ? { titel: 'Der Finder ist unterwegs', spruch: 'Er „findet“. Fragen Sie nicht.', warn: false }
      : funktion === 'wache' ? { titel: 'Passt auf', spruch: 'Keiner kommt ungesehen durch.', warn: false } : { titel: 'Arbeitet', spruch: 'Läuft.', warn: false };
    default: return { titel: 'Fertig', spruch: 'Steht und wartet auf Arbeit.', warn: false };
  }
}

export const PRIO_NAMEN = ['', 'Später', 'Normal', 'Zuerst'] as const;

/** Nächste Baustellen-Priorität beim Durchschalten (Rechtsklick): 1 → 2 → 3 → 1. */
export function naechstePrioritaet(stufe: number): number {
  return stufe >= 3 || stufe < 1 ? 1 : stufe + 1;
}
