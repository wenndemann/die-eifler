// Partieleiste oben in der Mitte: Spieler (Farbe, Name, Dorf, verbunden/Verwalter), Zustand der Partie (Pause von …, Warten auf …)
// und „Speichern“. Im Einzelspiel nur „Speichern“ und „Laden“. Reine HTML-Oberfläche, meldet nur Bedienung zurück.
import './partieleiste.css';
import mp from '../../data/mehrspieler.json';

export const SPIELER_FARBEN: readonly string[] = mp.farben.liste;

export interface ParteiSpieler { name: string; ich: boolean; da: boolean; verwalter: boolean; dorf: string; taktgeber: boolean }
export interface PartieAnzeige {
  spieler: ParteiSpieler[];
  /** Zustandszeile ('' = läuft) und ob sie warnt. */
  status: string;
  warn: boolean;
  /** Knopf „Weiter“ zeigen (eigene Pause oder Gastgeber). */
  weiter: boolean;
  /** Übrige eigene Pausen (null im Einzelspiel). */
  pausen: number | null;
}

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text = ''): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
};

export class Partieleiste {
  private wurzel = el('div', 'panel partieleiste');
  private liste = el('div', 'pl-spieler');
  private status = el('div', 'pl-status');
  private weiterKnopf = el('button', 'pl-knopf weiter', 'Weiter');
  private pausenText = el('span', 'pl-pausen');
  private sig = '';

  constructor(root: HTMLElement, auf: { onSpeichern: () => void; onLaden?: (datei: File) => void; onWeiter: () => void }, mehrspieler: boolean) {
    const knoepfe = el('div', 'pl-knoepfe');
    const speichern = el('button', 'pl-knopf', '💾 Speichern');
    speichern.type = 'button';
    speichern.title = 'Spielstand als Datei speichern (mit Karte und allen Dörfern)';
    speichern.addEventListener('click', () => { auf.onSpeichern(); speichern.blur(); });
    knoepfe.append(speichern);
    if (auf.onLaden) {
      const laden = el('label', 'pl-knopf', '📂 Laden');
      laden.title = 'Spielstand aus einer Datei laden';
      const datei = el('input');
      datei.type = 'file'; datei.accept = '.json,application/json'; datei.hidden = true;
      datei.addEventListener('change', () => { const f = datei.files?.[0]; if (f) auf.onLaden!(f); datei.value = ''; });
      laden.append(datei);
      knoepfe.append(laden);
    }
    this.weiterKnopf.type = 'button';
    this.weiterKnopf.hidden = true;
    this.weiterKnopf.addEventListener('click', () => auf.onWeiter());
    this.wurzel.classList.toggle('mehrspieler', mehrspieler);
    if (mehrspieler) this.wurzel.append(this.liste, this.status);
    knoepfe.prepend(this.weiterKnopf, this.pausenText);
    this.wurzel.append(knoepfe);
    root.append(this.wurzel);
  }

  setze(a: PartieAnzeige): void {
    const sig = JSON.stringify(a);
    if (sig === this.sig) return;
    this.sig = sig;
    this.liste.replaceChildren(...a.spieler.map((s, i) => {
      const z = el('span', `pl-sp${s.ich ? ' ich' : ''}${s.da ? '' : ' weg'}`);
      const punkt = el('i', 'pl-farbe');
      punkt.style.background = SPIELER_FARBEN[i % SPIELER_FARBEN.length];
      const zusatz = s.verwalter ? ' · Verwalter' : !s.da ? ' · fehlt' : '';
      z.append(punkt, el('b', '', s.name), el('em', '', ` ${s.dorf}${zusatz}`));
      z.title = `${s.name}${s.ich ? ' (du)' : ''}${s.taktgeber ? ' – gibt den Takt' : ''}`;
      return z;
    }));
    this.status.textContent = a.status;
    this.status.hidden = !a.status;
    this.status.classList.toggle('warn', a.warn);
    this.weiterKnopf.hidden = !a.weiter;
    this.pausenText.textContent = a.pausen === null ? '' : `Pausen übrig: ${a.pausen}`;
  }
}
