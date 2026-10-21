// Einführung als kleine Liste links (M12): „Erste Schritte mit <Figur>“, abgehakt, der nächste Schritt mit Hilfe; einklappbar.
import type { Schritt } from '../spiel/einfuehrung';

export class EinfuehrungsListe {
  private el: HTMLElement;
  private kopf: HTMLButtonElement;
  private liste: HTMLOListElement;
  private hilfe: HTMLElement;
  private sig = '';
  private zu: boolean;

  constructor(root: HTMLElement, private wer: string) {
    this.el = document.createElement('aside');
    this.el.className = 'einfuehrung panel';
    this.kopf = document.createElement('button');
    this.kopf.type = 'button';
    this.kopf.className = 'ef-kopf';
    this.liste = document.createElement('ol');
    this.hilfe = document.createElement('div');
    this.hilfe.className = 'ef-hilfe';
    this.el.append(this.kopf, this.liste, this.hilfe);
    // am Handy zuerst eingeklappt
    this.zu = typeof matchMedia !== 'undefined' && matchMedia('(max-width: 700px)').matches;
    this.kopf.onclick = () => { this.zu = !this.zu; this.sig = ''; this.el.classList.toggle('zu', this.zu); };
    this.el.classList.toggle('zu', this.zu);
    root.append(this.el);
  }

  zeige(schritte: readonly Schritt[], fertig: readonly boolean[], an: boolean): void {
    const alle = fertig.every(Boolean);
    this.el.hidden = !an || alle;
    if (this.el.hidden) return;
    // unter die Statusleiste (deren Höhe wechselt mit Fest- und Kirmeszeilen) bzw. unter die Etappenziele
    const ziele = document.querySelector<HTMLElement>('.etappenziele:not([hidden])');
    const st = (ziele ?? document.querySelector('.spielstatus'))?.getBoundingClientRect();
    const zoom = Number.parseFloat(getComputedStyle(this.el).zoom) || 1;
    if (st && st.height) this.el.style.top = `${Math.round((st.bottom + 8) / zoom)}px`;
    const sig = fertig.map((f) => (f ? 1 : 0)).join('');
    if (sig === this.sig) return;
    this.sig = sig;
    const n = fertig.filter(Boolean).length;
    this.kopf.textContent = `🧭 Erste Schritte mit ${this.wer} · ${n}/${schritte.length} ${this.zu ? '▸' : '▾'}`;
    this.liste.replaceChildren(...schritte.map((s, i) => {
      const li = document.createElement('li');
      li.textContent = s.auftrag;
      li.className = fertig[i] ? 'ok' : fertig.indexOf(false) === i ? 'jetzt' : '';
      return li;
    }));
    const naechster = schritte[fertig.indexOf(false)];
    this.hilfe.textContent = naechster ? naechster.hilfe : '';
  }
}

/** M13: Ziele der Kampagnen-Etappe als Liste unter der Statusleiste (abgehakt, was erfüllt ist). */
export class ZielListe {
  private el: HTMLElement;
  private kopf: HTMLButtonElement;
  private liste: HTMLUListElement;
  private sig = '';
  private zu = false;

  constructor(root: HTMLElement, private titel: string) {
    this.el = document.createElement('aside');
    this.el.className = 'einfuehrung etappenziele panel';
    this.kopf = document.createElement('button');
    this.kopf.type = 'button';
    this.kopf.className = 'ef-kopf';
    this.liste = document.createElement('ul');
    this.el.append(this.kopf, this.liste);
    this.kopf.onclick = () => { this.zu = !this.zu; this.sig = ''; this.el.classList.toggle('zu', this.zu); };
    root.append(this.el);
  }

  zeige(ziele: readonly { text: string; erfuellt: boolean }[]): void {
    const st = document.querySelector('.spielstatus')?.getBoundingClientRect();
    const zoom = Number.parseFloat(getComputedStyle(this.el).zoom) || 1;
    if (st && st.height) this.el.style.top = `${Math.round((st.bottom + 8) / zoom)}px`;
    const sig = ziele.map((z) => `${z.erfuellt ? 1 : 0}${z.text}`).join('|') + this.zu;
    if (sig === this.sig) return;
    this.sig = sig;
    const n = ziele.filter((z) => z.erfuellt).length;
    this.kopf.textContent = `🥾 ${this.titel} · ${n}/${ziele.length} ${this.zu ? '▸' : '▾'}`;
    this.liste.replaceChildren(...ziele.map((z) => {
      const li = document.createElement('li');
      li.textContent = z.text;
      li.className = z.erfuellt ? 'ok' : '';
      return li;
    }));
  }
}
