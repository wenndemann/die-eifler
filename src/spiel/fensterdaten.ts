// Inhalte der Fenster (ROADMAP M7, DESIGN §9.2) als reine Daten, ohne Browser: Gebäude-, Lager-, Fahnen- und Wegfenster,
// Warenübersicht, Warenverteilung, Statistik, Ereignisprotokoll. Das Gebäudefenster ergibt sich nur aus den Feldern in
// data/buildings.json (Eingang, Ausgang, wandelt, Radius, Wohnraum, Vorrat, Funktion) – ohne Code für einzelne Gebäude.
// Gezeichnet wird in src/ui/fenster.ts. Einzeln testbar (tests/fensterdaten.test.ts).
import {
  ABNEHMER, DORFSTUFEN, FLAG_CAP, GEBAEUDE, GEBAEUDE_IDS, KIRMES, KLEINE_FESTE, MISCHKORB, NAHRUNG, VERTEILUNG_JE_WARE, WAREN, WAREN_GRUPPEN, zutatMenge,
} from '../sim/daten';
import type { GebaeudeTyp } from '../sim/daten';
import { PROMILLE, STAT_KOPF, TICK_HZ } from '../sim/typen';
import type { Id, SichtFahne, SichtGebaeude, SichtSegment, SichtStatistik, SimSicht } from '../sim/typen';
import type { Abschnitt, FensterDaten, Knopf, KurvenReihe, Rangzeile, TabZeile, WareMenge } from '../ui/fenster';
import { BAUPLATZ_NAMEN, PRIO_NAMEN, zustandsText, type WareText } from './baumenue';

/** Was die Fenster außer der Sicht brauchen. */
export interface FensterKontext {
  sicht: SimSicht;
  ich: number;
  /** Texte je Ware (Symbol, Ein- und Mehrzahl). */
  ware: readonly WareText[];
  /** Spielernamen (Index = Spieler). */
  namen: readonly string[];
  /** Was im Arbeitsbereich liegt („6 Bäume in Reichweite“), oder null. */
  reichweite?: (g: SichtGebaeude) => { text: string; warn: boolean } | null;
  /** Produktivität 0..100 der letzten Spielminuten oder null (noch zu wenig gemessen). */
  produktivitaet?: (id: Id) => number | null;
  /** Arbeitsbereich-Modus läuft für dieses Gebäude. */
  bereichModus?: Id | null;
  /** Abriss wurde einmal gedrückt und wartet auf Bestätigung (Fenster-Id). */
  abrissFrage?: string | null;
  /** Bilder der Gebäude (Icons aus den Modellen) je Typ. */
  gebaeudeBild?: (typ: string) => string | undefined;
}

const PROD_FENSTER = 2 * 60;

/**
 * Produktivität je Gebäude: Anteil der Messungen (eine je Spielsekunde) der letzten zwei Spielminuten, in denen es gearbeitet hat.
 * Nur Anzeige – läuft in der Oberfläche neben der Simulation.
 */
export class Produktivitaet {
  private proben = new Map<Id, { bits: number[]; n: number }>();
  private letzte = -1;

  /** Mit jeder neuen Sicht aufrufen; misst einmal je Spielsekunde. */
  messe(s: SimSicht, ich: number): void {
    const sek = Math.floor(s.tick / TICK_HZ);
    if (sek === this.letzte) return;
    this.letzte = sek;
    const da = new Set<Id>();
    for (const g of s.gebaeude) {
      if (g.sp !== ich || g.bau < PROMILLE || !GEBAEUDE[g.typ]?.arbeiter) continue;
      da.add(g.id);
      let p = this.proben.get(g.id);
      if (!p) { p = { bits: [], n: 0 }; this.proben.set(g.id, p); }
      p.bits.push(g.zustand === 'arbeitet' ? 1 : 0);
      p.n += p.bits[p.bits.length - 1];
      if (p.bits.length > PROD_FENSTER) p.n -= p.bits.shift()!;
    }
    for (const id of [...this.proben.keys()]) if (!da.has(id)) this.proben.delete(id);
  }

  /** 0..100 oder null, solange weniger als 20 Messungen da sind. */
  wert(id: Id): number | null {
    const p = this.proben.get(id);
    return p && p.bits.length >= 20 ? Math.round((100 * p.n) / p.bits.length) : null;
  }
}

/** Waren mit Menge > 0 (oder mit Höchstmenge alle mit Platz). */
function warenListe(menge: readonly number[] | undefined, max?: readonly number[]): WareMenge[] {
  const aus: WareMenge[] = [];
  for (let a = 0; a < WAREN.length; a++) {
    const n = menge?.[a] ?? 0;
    if (max) { if (max[a] > 0) aus.push({ ware: a, n, max: max[a] }); } else if (n > 0) aus.push({ ware: a, n });
  }
  return aus;
}

const mengeText = (n: number, w: WareText | undefined) => (w ? `${n} ${n === 1 ? w.eins : w.mehr}` : String(n));

/** Name eines Gebäudes für Ziele („Sägewerk“). */
function gebName(s: SimSicht, id: Id): string {
  const g = s.gebaeude.find((x) => x.id === id);
  return g ? GEBAEUDE[g.typ]?.name ?? g.typ : '–';
}

/** Kurztext, was ein Gebäudetyp aus den Daten macht („2 Kartoffeln → 1 Bratkartoffeln in 12 s“). */
export function leistungText(t: GebaeudeTyp, w: readonly WareText[]): string[] {
  const z: string[] = [];
  if (t.wandelt) z.push(`${t.wandelt.ein.map((x) => mengeText(x.n, w[x.a])).join(' + ')} → 1 ${w[t.wandelt.aus]?.eins ?? ''} in ${Math.round(t.wandelt.ticks / TICK_HZ)} s`);
  else if (t.funktion === 'erzeuger' && t.ausgangWare >= 0) z.push(`alle ${Math.round(t.arbeitTicks / TICK_HZ)} s 1 ${w[t.ausgangWare]?.eins ?? ''}`);
  else if (t.radius > 0 && t.ausgangWare >= 0) z.push(`holt ${w[t.ausgangWare]?.mehr ?? ''} im Umkreis von ${t.radius} Hexen`);
  else if (t.radius > 0) z.push(`arbeitet im Umkreis von ${t.radius} Hexen (pflanzt, wo Platz ist)`);
  if (t.funktion === 'wohnen') z.push(`${t.nahrungPlaetze} Essensplätze · besseres Essen bringt schneller Nachwuchs`);
  if (t.wohnraum > 0) z.push(`Wohnraum für ${t.wohnraum}`);
  if (t.arbeiter) z.push(`braucht ${t.arbeiter} Bewohner als Arbeiter`);
  return z;
}

// ---------------------------------------------------------------------------------------------- Gebäude und Lager

/** Gebäudefenster aus den Daten des Typs; null, wenn es das Gebäude nicht mehr gibt. Knöpfe: prio:N, bereich, bereich_zurueck, ruhen, kamera, abriss. */
export function gebaeudeFenster(id: Id, k: FensterKontext): FensterDaten | null {
  const s = k.sicht;
  const g = s.gebaeude.find((x) => x.id === id);
  if (!g) return null;
  const t = GEBAEUDE[g.typ];
  if (!t) return null;
  const fremd = g.sp !== k.ich;
  const baustelle = g.bau < PROMILLE;
  const w = k.ware;
  const ab: Abschnitt[] = [];
  const titel = baustelle ? `${t.name} (Baustelle)` : t.name;
  const kopf = { titel, bild: k.gebaeudeBild?.(g.typ), symbol: t.symbol };
  if (fremd) {
    ab.push({ art: 'status', text: `Gehört ${k.namen[g.sp] ?? `Spieler ${g.sp + 1}`}`, spruch: 'Schauen ja, anfassen nein.' });
    ab.push({ art: 'knoepfe', knoepfe: [{ id: 'kamera', text: '🎯 Hinsehen', titel: 'Kamera zum Gebäude' }] });
    return { ...kopf, abschnitte: ab };
  }
  const bedarfNamen = (b: readonly number[]) => b.map((n, a) => (n > 0 ? w[a]?.mehr : '')).filter(Boolean).join(', ');
  let eingang = '';
  if (baustelle) eingang = bedarfNamen(g.bedarf ?? []);
  else if (t.funktion === 'wohnen') eingang = 'Essen';
  else if (t.funktion === 'kirmes') eingang = 'die Warenliste';
  else eingang = bedarfNamen(t.puffer.map((n, a) => (n > 0 && (g.puffer?.[a] ?? 0) < zutatMenge(t, a) ? 1 : 0)));
  const zt = zustandsText(g.getrennt ? 'getrennt' : g.zustand, baustelle, eingang, t.funktion);
  ab.push({ art: 'status', text: zt.titel, warn: zt.warn, spruch: baustelle || zt.warn ? zt.spruch : t.spruch });

  if (baustelle) {
    ab.push({ art: 'balken', text: `Phase ${1 + Math.floor((3 * g.bau) / (PROMILLE + 1))} von 3 · ${Math.floor(g.bau / 10)} % gebaut`, prozent: g.bau / 10 });
    ab.push({ art: 'waren', titel: 'Fehlt noch', waren: warenListe(g.bedarf), leer: 'Material komplett – es wird verbaut.' });
    const bereit = warenListe(g.stapel);
    if (bereit.length) ab.push({ art: 'waren', titel: 'Liegt bereit', waren: bereit });
    if (g.planiert !== undefined) ab.push({ art: 'zeilen', zeilen: [g.planiert < PROMILLE ? `Am Hang: erst planieren (${Math.floor(g.planiert / 10)} %)` : 'Planiert.'] });
    ab.push({
      art: 'knoepfe', titel: 'Priorität',
      knoepfe: [1, 2, 3].map((p): Knopf => ({ id: `prio:${p}`, text: `${p} ${PRIO_NAMEN[p]}`, an: g.prioritaet === p, titel: p === 3 ? 'wird zuerst beliefert und gebaut' : undefined })),
    });
  } else {
    // Lager: Bestand nach Kategorie (Gruppe der Ware in data/goods.json)
    if (g.vorrat) {
      const gruppen = [...new Set(WAREN_GRUPPEN)];
      for (const gr of gruppen) {
        const liste = warenListe(g.vorrat.map((n, a) => (WAREN_GRUPPEN[a] === gr ? n : 0)));
        ab.push({ art: 'waren', titel: gr, waren: liste, leer: 'nichts da' });
      }
      const d = s.dorf;
      ab.push({
        art: 'zeilen', titel: 'Dorf',
        zeilen: [
          `${DORFSTUFEN[d.stufe] ?? ''} · ${d.bewohner} Bewohner, ${d.frei} frei, ${d.traeger} Träger, ${d.arbeiter} Arbeiter`,
          `Bauarbeiter ${d.bauarbeiter.frei}/${d.bauarbeiter.gesamt} frei · Planierer ${d.planierer.frei}/${d.planierer.gesamt} frei`,
        ],
      });
    }
    if (t.pufferSumme > 0) ab.push({ art: 'waren', titel: 'Eingang', waren: warenListe(g.puffer, t.puffer) });
    if (t.funktion === 'wohnen') ab.push({ art: 'waren', titel: 'Essen im Haus', waren: warenListe(g.puffer), leer: 'nichts – ein Träger bringt es' });
    if (t.funktion === 'kirmes') {
      const kirmes = s.dorf.kirmes;
      if (kirmes) {
        ab.push({ art: 'waren', titel: 'Warenliste der Kirmes', waren: warenListe(kirmes.geliefert.map((n, a) => Math.min(n, kirmes.liste[a])), kirmes.liste) });
        const k0 = KIRMES[s.dorf.stufe];
        if (k0) ab.push({ art: 'zeilen', zeilen: [`Schaltet frei: ${k0.schaltetFrei.join(', ')}`] });
      } else ab.push({ art: 'zeilen', zeilen: [`Das Dorf ist jetzt ${DORFSTUFEN[s.dorf.stufe] ?? ''}. Die nächste Kirmes kommt mit M8.`] });
    }
    if (t.ausgangMax > 0) ab.push({ art: 'waren', titel: 'Ausgang (wartet auf Abholung)', waren: [{ ware: t.ausgangWare, n: g.ausgang?.[t.ausgangWare] ?? 0, max: t.ausgangMax }] });
    const leistung = leistungText(t, w);
    if (t.arbeiter) {
      const p = k.produktivitaet?.(g.id) ?? null;
      ab.push(p === null ? { art: 'zeilen', titel: 'Produktivität', zeilen: ['wird gemessen …'] } : { art: 'balken', text: `Produktivität ${p} % (letzte 2 Minuten)`, prozent: p });
      if (t.ausgangWare >= 0) leistung.push(`bisher ${mengeText(g.erzeugt, w[t.ausgangWare])} gemacht`);
    }
    if (leistung.length) ab.push({ art: 'zeilen', titel: 'Was es macht', zeilen: leistung });
  }
  // Arbeitsbereich auch schon an der Baustelle setzbar
  if (t.radius > 0) {
    const z = [`gut bis ${t.radiusGut}, geht noch bis ${t.radius} Hexe${g.mitte ? ' – Mittelpunkt verlegt' : ''}`];
    const rw = k.reichweite?.(g);
    if (rw) z.push(rw.text);
    ab.push({ art: 'zeilen', titel: 'Arbeitsbereich', zeilen: z });
    const modus = k.bereichModus === g.id;
    const kn: Knopf[] = [{ id: 'bereich', text: modus ? '🚩 Mittelpunkt wählen …' : '🚩 Arbeitsbereich', an: modus, titel: 'Mittelpunkt des Arbeitsbereichs wählen: Ringe folgen dem Zeiger, Klick setzt' }];
    if (g.mitte) kn.push({ id: 'bereich_zurueck', text: 'Zurücksetzen', titel: 'Arbeitsbereich wieder um das Gebäude legen' });
    ab.push({ art: 'knoepfe', knoepfe: kn });
  }
  if (g.getrennt) ab.push({ art: 'zeilen', zeilen: ['⚠ Keine Wegverbindung zum Lager – einen Weg zur Fahne bauen.'] });
  const knoepfe: Knopf[] = [{ id: 'kamera', text: '🎯 Hinsehen', titel: 'Kamera zum Gebäude' }];
  if (t.pausierbar && !baustelle) knoepfe.push({ id: 'ruhen', text: g.ruht ? '▶ Weiterarbeiten' : '⏸ Anhalten', an: g.ruht, titel: g.ruht ? 'Wieder an die Arbeit' : 'Arbeit ruhen lassen (Waren werden weiter angenommen)' });
  if (g.typ !== 'lager') {
    const frage = k.abrissFrage === `geb:${g.id}`;
    knoepfe.push({ id: 'abriss', text: frage ? 'Wirklich abreißen?' : '🔨 Abreißen', warn: true, titel: 'Abreißen (zweimal drücken)' });
  }
  ab.push({ art: 'knoepfe', knoepfe });
  return { ...kopf, abschnitte: ab };
}

// ---------------------------------------------------------------------------------------------- Fahne und Weg

/** Fahnenfenster: Stapel mit Zielen, angeschlossene Wege. Knöpfe: weg:<id>, geb:<id>, kamera, abriss. */
export function fahneFenster(id: Id, k: FensterKontext): FensterDaten | null {
  const s = k.sicht;
  const f = s.fahnen.find((x) => x.id === id);
  if (!f) return null;
  const ab: Abschnitt[] = [];
  const voll = f.waren.length >= FLAG_CAP;
  ab.push({ art: 'status', text: f.waren.length ? `${f.waren.length} von ${FLAG_CAP} Waren` : 'Leer', warn: voll, spruch: voll ? 'Hier staut es. Ein zweiter Weg hilft.' : f.gebaeude ? `Fahne vor ${gebName(s, f.gebaeude)}` : 'Freie Fahne' });
  if (f.sp !== k.ich) return { titel: 'Fahne', symbol: '🚩', abschnitte: ab };
  const zeilen: TabZeile[] = f.waren.map((a, i) => {
    const ziel = f.ziele?.[i] ?? 0;
    return { zellen: [{ text: k.ware[a]?.eins ?? '', ware: a }, { text: ziel ? gebName(s, ziel) : 'sucht ein Ziel', warn: !ziel }], knopf: ziel ? `geb:${ziel}` : undefined };
  });
  ab.push({ art: 'tabelle', titel: 'Stapel', kopf: ['Ware', 'will nach'], zeilen: zeilen.reverse(), leer: 'Keine Waren an der Fahne.' });
  const segs = s.segmente.filter((x) => x.a === f.id || x.b === f.id);
  ab.push({
    art: 'tabelle', titel: 'Wege', kopf: ['nach', 'Schritte', 'Träger'],
    zeilen: segs.map((sg) => {
      const o = s.fahnen.find((x) => x.id === (sg.a === f.id ? sg.b : sg.a));
      return { zellen: [{ text: o?.gebaeude ? gebName(s, o.gebaeude) : 'Fahne' }, { text: String(sg.pfad.length - 1) }, traegerZelle(sg, k)], knopf: `weg:${sg.id}` };
    }),
    leer: 'Noch kein Weg – mit dem Wegwerkzeug anschließen.',
  });
  const kn: Knopf[] = [{ id: 'kamera', text: '🎯 Hinsehen' }];
  if (f.gebaeude) kn.push({ id: `geb:${f.gebaeude}`, text: '🏠 Gebäude' });
  else kn.push({ id: 'abriss', text: k.abrissFrage === `fahne:${f.id}` ? 'Wirklich abreißen?' : '🔨 Abreißen', warn: true, titel: 'Fahne mit ihren Wegen abreißen (zweimal drücken)' });
  ab.push({ art: 'knoepfe', knoepfe: kn });
  return { titel: 'Fahne', symbol: '🚩', abschnitte: ab };
}

function traegerZelle(sg: SichtSegment, k: FensterKontext): { text: string; ware?: number; warn?: boolean } {
  if (!sg.traeger) return { text: 'fehlt', warn: true };
  const t = k.sicht.traeger.find((x) => x.id === sg.traeger);
  if (!t) return { text: 'fehlt', warn: true };
  const auf = new Set(sg.pfad.map((h) => `${h.q},${h.r}`));
  if (!auf.has(`${t.von.q},${t.von.r}`) || !auf.has(`${t.nach.q},${t.nach.r}`)) return { text: 'kommt' };
  if (t.ware >= 0) return { text: 'trägt', ware: t.ware };
  return { text: t.tut === 'wartet' ? 'wartet' : 'läuft' };
}

/** Wegfenster mit dem Träger. Knöpfe: fahne:<id>, kamera, abriss. */
export function wegFenster(id: Id, k: FensterKontext): FensterDaten | null {
  const s = k.sicht;
  const sg = s.segmente.find((x) => x.id === id);
  if (!sg) return null;
  const ende = (fid: Id) => { const f = s.fahnen.find((x) => x.id === fid); return f?.gebaeude ? gebName(s, f.gebaeude) : 'Fahne'; };
  const tz = traegerZelle(sg, k);
  const ab: Abschnitt[] = [];
  const zustand = tz.warn ? 'Kein Träger – es fehlt ein freier Bewohner' : tz.text === 'kommt' ? 'Der Träger ist auf dem Weg hierher'
    : tz.ware !== undefined ? `Der Träger trägt ${k.ware[tz.ware]?.eins ?? 'etwas'}` : tz.text === 'wartet' ? 'Der Träger wartet auf Ware' : 'Der Träger läuft';
  ab.push({ art: 'status', text: zustand, warn: !!tz.warn, spruch: 'Ein Weg, ein Träger. So war es immer.' });
  const verkehr = sg.verkehr > 150 ? 'viel' : sg.verkehr > 40 ? 'mittel' : sg.verkehr > 0 ? 'wenig' : 'keiner';
  ab.push({ art: 'zeilen', zeilen: [`Von ${ende(sg.a)} nach ${ende(sg.b)}`, `${sg.pfad.length - 1} Schritte · Verkehr: ${verkehr}`] });
  if (sg.sp === k.ich) {
    ab.push({
      art: 'knoepfe', knoepfe: [
        { id: 'kamera', text: '🎯 Hinsehen' }, { id: `fahne:${sg.a}`, text: '🚩 Anfang' }, { id: `fahne:${sg.b}`, text: '🚩 Ende' },
        { id: 'abriss', text: k.abrissFrage === `weg:${sg.id}` ? 'Wirklich abreißen?' : '🔨 Abreißen', warn: true, titel: 'Weg abreißen (zweimal drücken)' },
      ],
    });
  }
  return { titel: 'Weg und Träger', symbol: '🧺', abschnitte: ab };
}

// ---------------------------------------------------------------------------------------------- Waren und Verteilung

/** Warenübersicht (I): je Ware Lager, unterwegs, in Gebäuden, bisher erzeugt; nach Kategorie. */
export function warenFenster(k: FensterKontext): FensterDaten {
  const s = k.sicht, ich = k.ich;
  const lager = new Array<number>(WAREN.length).fill(0), weg = lager.slice(), drin = lager.slice();
  for (const g of s.gebaeude) {
    if (g.sp !== ich) continue;
    for (let a = 0; a < WAREN.length; a++) {
      lager[a] += g.vorrat?.[a] ?? 0;
      drin[a] += (g.puffer?.[a] ?? 0) + (g.ausgang?.[a] ?? 0) + (g.stapel?.[a] ?? 0);
    }
  }
  for (const f of s.fahnen) if (f.sp === ich) for (const a of f.waren) weg[a]++;
  for (const t of s.traeger) if (t.sp === ich && t.ware >= 0) weg[t.ware]++;
  const ab: Abschnitt[] = [];
  for (const gr of [...new Set(WAREN_GRUPPEN)]) {
    const zeilen: TabZeile[] = [];
    for (let a = 0; a < WAREN.length; a++) {
      if (WAREN_GRUPPEN[a] !== gr) continue;
      zeilen.push({ zellen: [{ text: k.ware[a]?.mehr ?? WAREN[a], ware: a }, { text: String(lager[a]) }, { text: String(weg[a]) }, { text: String(drin[a]) }, { text: String(s.dorf.erzeugt[a] ?? 0) }] });
    }
    ab.push({ art: 'tabelle', titel: gr, kopf: ['Ware', 'Lager', 'unterwegs', 'in Häusern', 'gemacht'], zeilen });
  }
  return { titel: 'Waren', symbol: '📦', abschnitte: ab };
}

/** Welche Abnehmer-Arten eine Ware überhaupt nehmen (aus den Daten): Baukosten, Kirmeslisten und Mischkorb, kleine Feste, Eingang der Verarbeiter, Essen. */
export function betroffen(a: number): boolean[] {
  const typen = GEBAEUDE_IDS.map((id) => GEBAEUDE[id]);
  return ABNEHMER.map((ab) => {
    if (ab.id === 'baustelle') return typen.some((t) => t.kosten[a] > 0);
    if (ab.id === 'kirmes') return KIRMES.some((x) => x.liste[a] > 0 || (x.mischkorb > 0 && MISCHKORB[a])) || KLEINE_FESTE.some((f) => f.liste[a] > 0);
    if (ab.id === 'verarbeiter') return typen.some((t) => t.funktion !== 'wohnen' && t.funktion !== 'kirmes' && t.puffer[a] > 0);
    if (ab.id === 'wohnen') return NAHRUNG[a] > 0;
    return false;
  });
}

/** Warenverteilung (V): je Ware, die mindestens zwei Abnehmer-Arten nimmt, die Rangfolge. Knöpfe: v:<ware>:<platz> (eins vor), v:<ware>:std. */
export function verteilungFenster(k: FensterKontext): FensterDaten {
  const v = k.sicht.dorf.verteilung;
  const zeilen: Rangzeile[] = [];
  for (let a = 0; a < WAREN.length; a++) {
    const b = betroffen(a);
    if (b.filter(Boolean).length < 2) continue;
    const reihe = v[a] ?? [...VERTEILUNG_JE_WARE[a]];
    // nur die Abnehmer, die die Ware nehmen; ihr Rang in der ganzen Reihe bleibt im Knopf
    const plaetze = reihe.map((x, i) => ({ x, i })).filter((p) => b[p.x]);
    zeilen.push({
      id: `v:${a}`, ware: a, text: k.ware[a]?.mehr ?? WAREN[a],
      plaetze: plaetze.map((p) => ({ symbol: ABNEHMER[p.x].symbol, name: ABNEHMER[p.x].name, betrifft: true, knopf: `v:${a}:${p.i}` })),
      standard: plaetze.every((p, j) => p.x === VERTEILUNG_JE_WARE[a].filter((x) => b[x])[j]),
    });
  }
  return {
    titel: 'Warenverteilung', symbol: '⚖️',
    abschnitte: [
      { art: 'zeilen', zeilen: ['Wer eine Ware zuerst bekommt: links zuerst. Antippen rückt einen Abnehmer eins nach vorn. Das Lager nimmt, was übrig bleibt.'] },
      { art: 'rangliste', zeilen },
    ],
  };
}

/**
 * Neue Rangfolge, wenn der Abnehmer auf Rang `platz` vor den nächsten davor rückt, der die Ware auch nimmt (oder 'std');
 * null bei nichts zu tun.
 */
export function verteilungKnopf(knopf: string, v: readonly (readonly number[])[]): { ware: number; reihe: number[] } | null {
  const m = /^v:(\d+):(\d+|std)$/.exec(knopf);
  if (!m) return null;
  const ware = Number(m[1]);
  if (!(ware >= 0 && ware < WAREN.length)) return null;
  if (m[2] === 'std') return { ware, reihe: [...VERTEILUNG_JE_WARE[ware]] };
  const reihe = [...(v[ware] ?? VERTEILUNG_JE_WARE[ware])];
  const b = betroffen(ware);
  const p = Number(m[2]);
  if (!(p >= 1 && p < reihe.length)) return null;
  let q = p - 1;
  while (q >= 0 && !b[reihe[q]]) q--;
  if (q < 0) return null;
  [reihe[q], reihe[p]] = [reihe[p], reihe[q]];
  return { ware, reihe };
}

// ---------------------------------------------------------------------------------------------- Statistik

/** Kennzahlen der Statistik (S): Kopfwerte oder Ware (Bestand / Erzeugtes je Minute). */
export type StatMass = 'bewohner' | 'gebaeude' | `lager:${number}` | `rate:${number}`;
export const SPIELER_FARBEN = ['#e7c27a', '#6fb6e8', '#e8746f', '#8fd17a', '#c49be8', '#e8a34f', '#7ad1c4', '#d1d17a'];

/** Statistik-Fenster: Kurve der gewählten Kennzahl für alle Dörfer. Knöpfe: m:<mass>. */
export function statistikFenster(k: FensterKontext, stat: readonly SichtStatistik[], mass: StatMass): FensterDaten {
  const reihen: KurvenReihe[] = stat.map((st, sp) => {
    const minute = (tick: number) => Math.round((10 * tick) / (60 * TICK_HZ)) / 10;
    let punkte: [number, number][];
    if (mass === 'bewohner') punkte = st.punkte.map((p) => [minute(p[0]), p[1]]);
    else if (mass === 'gebaeude') punkte = st.punkte.map((p) => [minute(p[0]), p[3]]);
    else {
      const a = Number(mass.split(':')[1]);
      if (mass.startsWith('lager')) punkte = st.punkte.map((p) => [minute(p[0]), p[STAT_KOPF + a] ?? 0]);
      else {
        // erzeugt je Spielminute zwischen zwei Punkten
        punkte = [];
        for (let i = 1; i < st.punkte.length; i++) {
          const p = st.punkte[i], q = st.punkte[i - 1];
          const dt = (p[0] - q[0]) / (60 * TICK_HZ);
          if (dt > 0) punkte.push([minute(p[0]), Math.round((10 * ((p[STAT_KOPF + WAREN.length + a] ?? 0) - (q[STAT_KOPF + WAREN.length + a] ?? 0))) / dt) / 10]);
        }
      }
    }
    return { name: sp === k.ich ? `${k.namen[sp] ?? 'Du'} (du)` : k.namen[sp] ?? `Spieler ${sp + 1}`, farbe: SPIELER_FARBEN[sp % SPIELER_FARBEN.length], punkte };
  });
  const wareTeil = (m: string) => Number(m.split(':')[1]);
  const yText = mass === 'bewohner' ? 'Bewohner' : mass === 'gebaeude' ? 'Gebäude' : mass.startsWith('lager') ? `${k.ware[wareTeil(mass)]?.mehr ?? ''} im Lager` : `${k.ware[wareTeil(mass)]?.mehr ?? ''} je Minute`;
  const ware = mass.startsWith('lager') || mass.startsWith('rate') ? wareTeil(mass) : -1;
  const wahl: Knopf[] = [
    { id: 'm:bewohner', text: '👪 Bewohner', an: mass === 'bewohner' },
    { id: 'm:gebaeude', text: '🏠 Gebäude', an: mass === 'gebaeude' },
  ];
  if (ware >= 0) {
    wahl.push({ id: `m:lager:${ware}`, text: 'Bestand', an: mass.startsWith('lager') }, { id: `m:rate:${ware}`, text: 'je Minute gemacht', an: mass.startsWith('rate') });
  }
  const waren: Knopf[] = WAREN.map((_, a) => ({ id: `m:${mass.startsWith('rate') ? 'rate' : 'lager'}:${a}`, text: `${k.ware[a]?.icon ?? ''} ${k.ware[a]?.mehr ?? ''}`.trim(), an: a === ware }));
  return {
    titel: 'Statistik', symbol: '📈',
    abschnitte: [
      { art: 'knoepfe', knoepfe: wahl },
      { art: 'kurve', reihen, xText: 'Spielminuten', yText },
      { art: 'knoepfe', titel: 'Ware', knoepfe: waren },
    ],
  };
}

// ---------------------------------------------------------------------------------------------- Ereignisprotokoll

export interface ProtokollZeile { tick: number; text: string; warn: boolean; ort?: { q: number; r: number } }

/** Ereignisprotokoll (L): neueste zuerst; mit Ort springt ein Klick hin (Knopf ort:<index>). */
export function protokollFenster(zeilen: readonly ProtokollZeile[]): FensterDaten {
  const zeit = (t: number) => { const s = Math.floor(t / TICK_HZ); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
  const tab: TabZeile[] = [];
  for (let i = zeilen.length - 1; i >= 0 && tab.length < 150; i--) {
    const z = zeilen[i];
    tab.push({ zellen: [{ text: zeit(z.tick) }, { text: `${z.ort ? '🎯 ' : ''}${z.text}`, warn: z.warn }], knopf: z.ort ? `ort:${i}` : undefined });
  }
  return { titel: 'Ereignisprotokoll', symbol: '📜', abschnitte: [{ art: 'tabelle', kopf: ['Zeit', 'Was war'], zeilen: tab, leer: 'Noch ist nichts passiert.' }] };
}

// ---------------------------------------------------------------------------------------------- Meldungen am Rand

/** Eine zusammengefasste Meldung am rechten Rand („3× Fahne voll“) mit allen Orten. */
export interface Warnung { art: string; text: string; orte: { q: number; r: number }[] }

/** Störungen im eigenen Dorf aus der Sicht, nach Art zusammengefasst. */
export function warnungen(s: SimSicht, ich: number): Warnung[] {
  const arten: [string, string, (g: SichtGebaeude) => boolean][] = [
    ['getrennt', 'ohne Weg zum Lager', (g) => g.getrennt],
    ['kein_arbeiter', 'ohne Arbeiter', (g) => !g.getrennt && g.zustand === 'kein_arbeiter'],
    ['voll', 'voll, keiner holt ab', (g) => !g.getrennt && g.zustand === 'voll'],
    ['kein_baum', 'ohne Bäume in Reichweite', (g) => !g.getrennt && g.zustand === 'kein_baum'],
    ['kein_fels', 'ohne Fels in Reichweite', (g) => !g.getrennt && g.zustand === 'kein_fels'],
    ['kein_platz', 'ohne Pflanzplatz', (g) => !g.getrennt && g.zustand === 'kein_platz'],
  ];
  const aus: Warnung[] = [];
  for (const [art, text, pruef] of arten) {
    const orte = s.gebaeude.filter((g) => g.sp === ich && g.typ !== 'lager' && pruef(g)).map((g) => ({ q: g.q, r: g.r }));
    if (orte.length) aus.push({ art, text: `${orte.length}× Gebäude ${text}`, orte });
  }
  const voll = s.fahnen.filter((f: SichtFahne) => f.sp === ich && f.waren.length >= FLAG_CAP).map((f) => ({ q: f.q, r: f.r }));
  if (voll.length) aus.push({ art: 'fahne_voll', text: `${voll.length}× Fahne voll`, orte: voll });
  const ohne = s.segmente.filter((sg) => sg.sp === ich && !sg.traeger);
  if (ohne.length && s.freieTraeger === 0) aus.push({ art: 'kein_traeger', text: `${ohne.length}× Weg ohne Träger – keiner frei`, orte: ohne.map((sg) => sg.pfad[sg.pfad.length >> 1]) });
  return aus;
}

// ---------------------------------------------------------------------------------------------- Tooltip im Baumenü

/** Zeilen des Tooltips im Baumenü: Kosten, Bauplatz, Ein- und Ausgang, Arbeiter, Spruch (aus den Daten). */
export function bauTooltip(id: string, w: readonly WareText[]): string[] {
  const t = GEBAEUDE[id];
  if (!t) return [];
  const kosten = t.kosten.map((n, a) => (n > 0 ? mengeText(n, w[a]) : '')).filter(Boolean).join(', ') || 'nichts';
  const z = [`Kosten: ${kosten}`, `Bauplatz: ${BAUPLATZ_NAMEN[t.groesse]}${t.abStufe > 0 ? ` · ab ${DORFSTUFEN[t.abStufe]}` : ''}${t.einmalig ? ' · nur einer je Dorf' : ''}`];
  z.push(...leistungText(t, w));
  return z;
}

// ---------------------------------------------------------------------------------------------- Hilfe

/** Hilfe (H): die Grundzüge in fünf Schritten und alle Tasten. */
export function hilfeFenster(touch: boolean): FensterDaten {
  const schritte = [
    '1. Ein Weg beginnt an einer Fahne: „Weg“ wählen, die Fahne vor dem Lager anklicken, dann Hex für Hex oder gleich zum Ziel.',
    '2. „Bauen“ öffnet das Baumenü. Grüne Plätze passen, das Geistermodell zeigt das Haus. Jedes Haus braucht einen Weg zum Lager.',
    '3. Holzfäller und Sägewerk machen Bretter, der Steinbruch Steine – daraus wachsen die Baustellen.',
    '4. Kartoffelfeld und Wohnhaus bringen neue Bewohner. Küche, Mostkeller und Käserei füllen die Warenliste der Kirmes.',
    '5. Am Kirmesplatz die Warenliste abliefern: Es wird gefeiert, und aus dem Weiler wird ein Dorf.',
    'Ein Klick auf ein Gebäude, eine Fahne oder einen Weg öffnet sein Fenster. 📌 pinnt es an, Esc schließt das oberste.',
  ];
  const tasten: TabZeile[] = (touch ? [
    ['Ein Finger', 'Karte verschieben'], ['Zwei Finger', 'Zoomen und drehen'], ['Antippen', 'Wählen; zweites Antippen oder „Bauen“ bestätigt'],
  ] : [
    ['W A S D, Pfeile', 'Kamera verschieben'], ['Q E', 'Kamera drehen'], ['Mausrad', 'Zoomen'], ['Rechte Maustaste ziehen', 'Verschieben'],
    ['1 / 2', 'Weg / Fahne'], ['B', 'Baumenü (darin: Taste des Gebäudes)'], ['3 – 9', 'Gebäude direkt'], ['P', 'Bauplätze zeigen'],
    ['X, Entf', 'Abriss'], ['Rechtsklick auf Baustelle', 'Priorität durchschalten'], ['Leertaste', 'Pause'], ['+ / −', 'Tempo'],
    ['I', 'Waren'], ['V', 'Warenverteilung'], ['T', 'Statistik'], ['L', 'Ereignisprotokoll'], ['H', 'diese Hilfe'],
    ['Esc', 'Abbrechen, Fenster schließen, Einstellungen'], ['G', 'Hex-Raster'], ['F3', 'Leistung'],
  ]).map(([a, b]) => ({ zellen: [{ text: a }, { text: b }] }));
  return {
    titel: 'Hilfe', symbol: '❓',
    abschnitte: [{ art: 'zeilen', titel: 'So geht es', zeilen: schritte }, { art: 'tabelle', titel: touch ? 'Bedienung' : 'Tasten', kopf: [], zeilen: tasten }],
  };
}
