// Kampagnen-Übersicht (Drehbuch 2.1, ROADMAP M13): Eifel-Karte mit dem Weg und dem schon gewanderten Stück, Etappen nach
// Abschnitten (✓ geschafft, ▶ nächste, 🔒 später), die Erzählfigur des Völkchens führt durch. Zwischen den Etappen und vom
// Startmenü aus. Löst mit der gewählten Etappe auf (oder Zurück).
import './startmenue.css';
import './kampagne.css';
import { VOELKCHEN_LISTE, erzaehlerFuer, erzaehlerVon } from '../spiel/meldungen';
import {
  KAMPAGNE_SPEICHER, WEGE, etappeOffen, etappenVon, kampagnenPunkte, leseKampagne, naechsteEtappe, neueKampagne, warenName, wegVon,
  type Etappe, type KampagnenStand, type Weg,
} from '../spiel/kampagne';
import { hexToWorld } from '../welt/hexwelt';
import { GEBAEUDE } from '../sim/daten';
import nachbarn from '../../data/nachbarn.json';

const STAEDTE: { name: string; q: number; r: number }[] = nachbarn.flachland.staedte;
import { WELT } from '../welt/format';
import { ausschnittMoeglich } from '../welt/ausschnitt';
import { alleVersionen, holeBildUrl, ladeWelt, type Welt } from '../welt/laden';

export type KampagnenWahl = { art: 'etappe'; stand: KampagnenStand; index: number; version: string } | { art: 'zurueck' };

export function ladeKampagne(): KampagnenStand | null {
  try { return leseKampagne(localStorage.getItem(KAMPAGNE_SPEICHER)); } catch { return null; }
}
export function speichereKampagne(k: KampagnenStand | null): void {
  try { if (k) localStorage.setItem(KAMPAGNE_SPEICHER, JSON.stringify(k)); else localStorage.removeItem(KAMPAGNE_SPEICHER); } catch { /* egal */ }
}

/** Kann die Etappe mit den geladenen Weltdaten gespielt werden? */
export function etappeSpielbar(welt: Welt, e: Etappe): boolean {
  return ausschnittMoeglich(welt.manifest, e.q, e.r, e.groesse);
}

/** Erste Datenversion, in der die Etappe ganz liegt (Weltdaten je Gebiet), sonst null. */
export function versionFuer(welten: readonly Welt[], e: Etappe): Welt | null {
  return welten.find((w) => etappeSpielbar(w, e)) ?? null;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
}
const SVG = 'http://www.w3.org/2000/svg';
function svg<K extends keyof SVGElementTagNameMap>(tag: K, attr: Record<string, string | number>): SVGElementTagNameMap[K] {
  const e = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attr)) e.setAttribute(k, String(v));
  return e;
}

/** Eifel-Karte mit Weg (gestrichelt), gewandertem Stück (kräftig) und Etappenpunkten. */
function karte(welt: Welt, welten: readonly Welt[], weg: Weg, k: KampagnenStand | null, aktiv: number, waehle: (i: number) => void): SVGSVGElement {
  const et = etappenVon(weg);
  const pts = [et[0].start, ...et.map((e) => e.ziel)].map((h) => hexToWorld(h.q, h.r));
  const xs = pts.map((p) => p.x), zs = pts.map((p) => p.z);
  const rand = 9000;
  const x0 = Math.max(0, Math.min(...xs) - rand), x1 = Math.min(WELT.SX, Math.max(...xs) + rand);
  const z0 = Math.max(0, Math.min(...zs) - rand), z1 = Math.min(WELT.SZ, Math.max(...zs) + rand);
  const s = svg('svg', { viewBox: `${x0} ${z0} ${x1 - x0} ${z1 - z0}`, class: 'kp-karte', role: 'img', 'aria-label': `Karte: ${weg.name}` });
  s.append(svg('rect', { x: 0, y: 0, width: WELT.SX, height: WELT.SZ, fill: '#cdbf98' }));
  const bild = svg('image', { x: 0, y: 0, width: WELT.SX, height: WELT.SZ, preserveAspectRatio: 'none', opacity: 0.9 });
  void holeBildUrl(welt.datei('uebersicht/relief.webp')).then((u) => bild.setAttribute('href', u)).catch(() => undefined);
  s.append(bild);
  // Kacheln mit Weltdaten leicht hell, damit man sieht, wo schon gespielt werden kann
  for (const w of welten) for (const [tx, tz] of w.manifest.kacheln) s.append(svg('rect', { x: tx * welt.manifest.tile, y: tz * welt.manifest.tile, width: welt.manifest.tile, height: welt.manifest.tile, fill: '#fff6d8', opacity: 0.25 }));
  // Flachland-Städte zur Orientierung (data/nachbarn.json)
  const rs = (x1 - x0) / 90;
  for (const st of STAEDTE) {
    const p = hexToWorld(st.q, st.r);
    if (p.x < x0 || p.x > x1 || p.z < z0 || p.z > z1) continue;
    s.append(svg('rect', { x: p.x - rs, y: p.z - rs, width: rs * 2, height: rs * 2, class: 'kp-stadt' }));
    const t = svg('text', { x: p.x + rs * 1.8, y: p.z + rs * 0.6, 'font-size': rs * 2.6, class: 'kp-stadtname' });
    t.textContent = st.name;
    s.append(t);
  }
  const linie = (von: number, bis: number, cls: string) => s.append(svg('polyline', { points: pts.slice(von, bis + 1).map((p) => `${p.x},${p.z}`).join(' '), class: cls }));
  linie(0, pts.length - 1, 'kp-weg');
  const bisHier = k ? Math.max(0, ...k.geschafft.map((i) => i + 1)) : 0;
  if (bisHier > 0) linie(0, bisHier, 'kp-gewandert');
  const r = (x1 - x0) / 90;
  pts.forEach((p, i) => {
    const e = i === 0 ? et[0] : et[i - 1];
    const name = i === 0 ? e.von : e.nach;
    const g = svg('g', { class: 'kp-punkt' + (i - 1 === aktiv || (i === 0 && aktiv === 0) ? ' akt' : '') });
    g.append(svg('circle', { cx: p.x, cy: p.z, r: i === 0 || i === pts.length - 1 ? r * 1.4 : r }));
    const t = svg('text', { x: p.x + r * 1.6, y: p.z + r * 0.5, 'font-size': r * 2.4 });
    t.textContent = name;
    g.append(t);
    if (i > 0) g.addEventListener('click', () => waehle(i - 1));
    s.append(g);
  });
  return s;
}

/** Übersicht zeigen; löst mit der gewählten Etappe oder „zurück“ auf. */
export function zeigeKampagne(root: HTMLElement, welt: Welt): Promise<KampagnenWahl> {
  return new Promise((fertig) => {
    const hinter = el('div', 'sm-hinter kampagne');
    const box = el('section', 'kp-box');
    hinter.append(box);
    root.append(hinter);
    let stand = ladeKampagne();
    let gewaehlt = stand ? Math.max(0, naechsteEtappe(stand)) : 0;
    let wegId = stand?.weg ?? WEGE[0].id;
    const ende = (w: KampagnenWahl) => { hinter.remove(); fertig(w); };
    // weitere Datenversionen (je Gebiet eine) nachladen: eine Etappe ist spielbar, wenn irgendeine sie ganz enthält
    let welten: Welt[] = [welt];
    void alleVersionen(welt.base).then(async (ids) => {
      const mehr = await Promise.all(ids.filter((id) => id !== welt.version).map((id) => ladeWelt(id, welt.base).catch(() => null)));
      welten = [welt, ...mehr.filter((w): w is Welt => !!w)];
      if (hinter.isConnected) zeichne();
    }).catch(() => undefined);

    const zeichne = () => {
      box.replaceChildren();
      const weg = wegVon(wegId)!;
      const et = etappenVon(weg);
      const kopf = el('div', 'kp-kopf');
      kopf.append(el('h1', 'sm-titel kp-titel', weg.name), el('div', 'sm-unter', weg.beschreibung));
      box.append(kopf);
      const inhalt = el('div', 'kp-inhalt');
      box.append(inhalt);
      inhalt.append(karte(welt, welten, weg, stand, gewaehlt, (i) => { gewaehlt = i; zeichne(); }));
      const rechts = el('div', 'kp-rechts');
      inhalt.append(rechts);

      if (!stand || stand.weg !== weg.id) {
        // Neue Kampagne: Weg und Völkchen wählen; das Völkchen bleibt für alle Etappen
        const wege = el('div', 'kp-wege');
        for (const w of WEGE) {
          const b = el('button', 'sm-knopf kp-wegwahl' + (w.id === wegId ? ' an' : ''), w.name);
          b.type = 'button';
          b.onclick = () => { wegId = w.id; gewaehlt = 0; zeichne(); };
          wege.append(b);
        }
        rechts.append(el('h3', '', 'Weg'), wege);
        const vorschlag = erzaehlerFuer(et[0].von).id;
        const wahl = el('select', 'kp-voelkchen');
        for (const v of VOELKCHEN_LISTE) {
          const o = el('option', '', v.name);
          o.value = v.id;
          if (v.id === vorschlag) o.selected = true;
          wahl.append(o);
        }
        rechts.append(el('h3', '', 'Mit welchem Völkchen?'), wahl);
        const e = erzaehlerVon(vorschlag);
        rechts.append(el('p', 'kp-erzaehler', `${e.name}: „${et[0].einleitung}“`));
        if (stand) rechts.append(el('p', 'kp-hinweis', `Eine andere Kampagne läuft schon (${wegVon(stand.weg)?.name}). Neu anfangen ersetzt sie.`));
        const los = el('button', 'sm-knopf sm-frei kp-los', '🥾 Losgehen');
        los.type = 'button';
        los.onclick = () => {
          stand = neueKampagne(weg.id, wahl.value);
          speichereKampagne(stand);
          gewaehlt = 0;
          zeichne();
        };
        rechts.append(los);
      } else {
        const k = stand;
        const e = erzaehlerVon(k.voelkchen);
        const voelkchen = VOELKCHEN_LISTE.find((v) => v.id === k.voelkchen)?.name ?? k.voelkchen;
        rechts.append(el('div', 'kp-stand', `${voelkchen} · ${k.geschafft.length}/${et.length} Etappen · ${kampagnenPunkte(k)} Eifel-Punkte`));
        const rs = Object.entries(k.rucksack);
        if (rs.length) rechts.append(el('div', 'kp-rucksack', `🎒 Rucksack: ${rs.map(([id, n]) => `${n} ${warenName(id)}`).join(', ')}`));
        // Etappenliste nach Abschnitten
        const liste = el('div', 'kp-liste');
        let i = 0;
        for (const a of weg.abschnitte) {
          liste.append(el('h3', '', a.name));
          for (const et1 of a.etappen) {
            const idx = i++;
            const offen = etappeOffen(k, idx), ok = k.geschafft.includes(idx);
            const b = el('button', 'kp-etappe' + (idx === gewaehlt ? ' an' : '') + (ok ? ' ok' : ''), `${ok ? '✓' : offen ? '▶' : '🔒'} ${et1.nr}. ${et1.name}`);
            b.type = 'button';
            b.dataset.etappe = String(idx);
            b.onclick = () => { gewaehlt = idx; zeichne(); };
            liste.append(b);
          }
        }
        rechts.append(liste);
        // Gewählte Etappe: Erzählfigur, Ziele, Start
        const sel = et[gewaehlt];
        const det = el('div', 'kp-detail');
        det.append(el('h2', '', `Etappe ${sel.nr}: ${sel.name}`));
        det.append(el('p', 'kp-erzaehler', `${e.name}: „${sel.einleitung}“`));
        const zl = el('ul', 'kp-ziele');
        for (const z of sel.ziele) zl.append(el('li', '', zielText(z)));
        det.append(el('h3', '', 'Ziele'), zl);
        const passend = versionFuer(welten, sel), spielbar = !!passend, offen = etappeOffen(k, gewaehlt);
        if (!spielbar) det.append(el('p', 'kp-hinweis', `Für diese Etappe fehlen die Kartendaten (geladen: ${welten.map((w) => w.manifest.gebiet).join(', ')}). Gebiet „eifelsteig“ rechnen und laden: Actions → Weltdaten, dann tools/welt-laden.sh eifelsteig.`));
        else if (!offen) det.append(el('p', 'kp-hinweis', 'Erst die Etappen davor schaffen.'));
        const start = el('button', 'sm-knopf sm-frei kp-start', k.geschafft.includes(gewaehlt) ? '↻ Nochmal wandern' : '🥾 Etappe starten');
        start.type = 'button';
        start.disabled = !spielbar || !offen;
        start.onclick = () => { if (passend) ende({ art: 'etappe', stand: k, index: gewaehlt, version: passend.version }); };
        det.append(start);
        if (naechsteEtappe(k) < 0) det.append(el('p', 'kp-fertig', `Geschafft! ${weg.name} ist gewandert – ${kampagnenPunkte(k)} Eifel-Punkte.`));
        rechts.append(det);
        const neu = el('button', 'sm-knopf kp-neu', 'Neue Kampagne');
        neu.type = 'button';
        neu.onclick = () => { if (confirm('Die laufende Kampagne verwerfen und neu anfangen?')) { stand = null; speichereKampagne(null); zeichne(); } };
        rechts.append(neu);
      }
      const zurueck = el('button', 'sm-knopf kp-zurueck', 'Zurück');
      zurueck.type = 'button';
      zurueck.onclick = () => ende({ art: 'zurueck' });
      rechts.append(zurueck);
    };
    zeichne();
  });
}

function zielText(z: Etappe['ziele'][number]): string {
  switch (z.art) {
    case 'bewohner': return `${z.n} Bewohner`;
    case 'stufe': return ['Weiler', 'Dorf (erste Kirmes)', 'Kirchdorf', 'Marktflecken'][z.n] ?? `Stufe ${z.n}`;
    case 'lager': return `${z.n} ${warenName(z.ware)} im Lager`;
    case 'gebaeude': return `${z.n}× ${GEBAEUDE[z.typ]?.name ?? z.typ}`;
    case 'punkte': return `${z.n} Eifel-Punkte`;
    case 'koenig': return 'Schützenkönig werden';
    case 'ort': return `${z.name} gewinnen`;
  }
}
