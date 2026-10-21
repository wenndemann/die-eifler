// Startmenü (ROADMAP M12): Titel, ein Spruch der Völkchen, Freies Spiel, Mit Freunden, Weiterspielen, Kampagne (kommt mit M13)
// und Mitwirkende mit Quellenangaben. Führt danach in die Kartenwahl (oder setzt den Autosave fort).
import './startmenue.css';
import regionen from '../../data/regions.json';
import { holeAutosave, type Spielstand } from '../spiel/spielstand';

export type StartWahl = { art: 'frei' } | { art: 'freunde' } | { art: 'kampagne' } | { art: 'weiter'; spielstand: Spielstand };

interface Spruch { platt: string; hoch: string }
const V = regionen.voelkchen as unknown as { name: string; erzaehler: { name: string; tick: string; charakter: string }; sprueche: Spruch[] }[];
const ALLE: { spruch: Spruch; wer: string }[] = [
  ...(regionen.flachlaender as Spruch[]).map((s) => ({ spruch: s, wer: 'Jedes Eifeler Dorf über das nächste' })),
  ...V.flatMap((v) => v.sprueche.map((s) => ({ spruch: s, wer: v.name }))),
];

/** Quellen und Mitwirkende (Weltdaten aus dem Manifest der Datenversion dazu). */
export function creditsZeilen(datenQuellen: readonly string[]): { titel: string; zeilen: string[] }[] {
  return [
    { titel: 'Spiel', zeilen: ['Idee und Drehbuch: wenndemann', 'Programmiert mit Claude Code'] },
    { titel: 'Erzählfiguren', zeilen: [...V.map((v) => `${v.erzaehler.name} (${v.name}) – „${v.erzaehler.tick}“`), 'Alle Figuren sind frei erfunden.'] },
    { titel: 'Weltdaten', zeilen: [...datenQuellen, 'Höhendaten: Geobasis NRW (dl-de/zero-2.0), GeoBasis-DE / LVermGeoRP (dl-de/by-2.0), ACT Luxemburg (CC0), Copernicus GLO-30 DEM'] },
    { titel: 'Technik', zeilen: ['three.js (MIT-Lizenz)', 'Schrift: Alegreya (SIL Open Font License)', 'Musik und Geräusche entstehen beim Spielen im Browser (WebAudio) – keine Aufnahmen'] },
    { titel: 'Recherche', zeilen: ['Eifelsteig, Kaffeeschmuggel, „Preußisch Sibirien“, Eifeler Platt, Dürener Annakirmes, Monschauer Rotes Haus und Senfmühle – Quellen im Drehbuch (DREHBUCH.md)'] },
    { titel: 'Hinweis', zeilen: ['Die Eifeler stehlen nie. Sie finden.', 'Das Ahr-Hochwasser 2021 ist echt und schmerzhaft; Hochwasser kommt im Spiel vor, aber nie als Witz.'] },
  ];
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
}

export function zeigeCredits(root: HTMLElement, datenQuellen: readonly string[]): void {
  const hinter = el('div', 'sm-hinter sm-credits-hinter');
  const box = el('section', 'sm-credits');
  box.setAttribute('role', 'dialog');
  box.append(el('h2', '', 'Mitwirkende und Quellen'));
  for (const a of creditsZeilen(datenQuellen)) {
    box.append(el('h3', '', a.titel));
    const ul = el('ul');
    for (const z of a.zeilen) ul.append(el('li', '', z));
    box.append(ul);
  }
  const zu = el('button', 'sm-knopf sm-zu', 'Zurück');
  zu.type = 'button';
  const schliessen = () => hinter.remove();
  zu.onclick = schliessen;
  hinter.onclick = (e) => { if (e.target === hinter) schliessen(); };
  addEventListener('keydown', function esc(e) { if (e.key === 'Escape') { schliessen(); removeEventListener('keydown', esc); } });
  box.append(zu);
  hinter.append(box);
  root.append(hinter);
  zu.focus();
}

/** Startmenü zeigen; löst auf, sobald gewählt ist. */
export function zeigeStartmenue(root: HTMLElement, datenQuellen: readonly string[]): Promise<StartWahl> {
  return new Promise((fertig) => {
    const hinter = el('div', 'sm-hinter startmenue');
    const box = el('section', 'sm-box');
    const titel = el('h1', 'sm-titel', 'Die Eifeler');
    const unter = el('div', 'sm-unter', 'Finden statt Stehlen – ein Aufbauspiel auf der echten Eifel');
    const z = ALLE[Math.floor(Math.random() * ALLE.length)];
    const spruch = el('blockquote', 'sm-spruch');
    spruch.append(el('span', 'sm-platt', `„${z.spruch.platt}“`), el('span', 'sm-hoch', z.spruch.hoch), el('cite', '', z.wer));
    spruch.title = z.spruch.hoch;
    const knoepfe = el('div', 'sm-knoepfe');
    const knopf = (text: string, cls: string, f: (() => void) | null, hinweis = '') => {
      const b = el('button', `sm-knopf ${cls}`, text);
      b.type = 'button';
      if (hinweis) b.title = hinweis;
      if (f) b.onclick = f; else b.disabled = true;
      knoepfe.append(b);
      return b;
    };
    const waehle = (w: StartWahl) => { hinter.remove(); fertig(w); };
    const auto = holeAutosave();
    if (auto) knopf(`⏱ Weiterspielen${auto.ort ? ` (${auto.ort})` : ''}`, 'sm-weiter', () => waehle({ art: 'weiter', spielstand: auto.stand }));
    const frei = knopf('🏡 Freies Spiel', 'sm-frei', () => waehle({ art: 'frei' }), 'Ausschnitt der Eifel wählen und ein Dorf gründen');
    knopf('👥 Mit Freunden spielen', 'sm-freunde', () => waehle({ art: 'freunde' }), 'Ausschnitt wählen, dann Freunde per Link einladen');
    knopf('🥾 Kampagne „Der Eifelsteig“', 'sm-kampagne', () => waehle({ art: 'kampagne' }), 'Mit dem eigenen Völkchen den Eifelsteig entlang wandern');
    knopf('📜 Mitwirkende und Quellen', 'sm-credits-knopf', () => zeigeCredits(root, datenQuellen));
    box.append(titel, unter, spruch, knoepfe, el('div', 'sm-fuss', 'Mer renne nit. Langsam, mir sin en d’r Eifel.'));
    hinter.append(box);
    root.append(hinter);
    (auto ? (knoepfe.firstElementChild as HTMLButtonElement) : frei).focus();
  });
}
