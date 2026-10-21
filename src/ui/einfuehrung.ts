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
    // unter die Statusleiste (deren Höhe wechselt mit Fest- und Kirmeszeilen)
    const st = document.querySelector('.spielstatus')?.getBoundingClientRect();
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
