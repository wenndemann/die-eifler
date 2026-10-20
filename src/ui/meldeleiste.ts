// Meldungen am rechten Rand (DESIGN §9.2): Störungen zusammengefasst („3× Fahne voll“), ein Klick springt zum nächsten Ort,
// das ✕ blendet die Meldung aus, bis sich ihre Zahl ändert. Reine HTML-Oberfläche.

export interface RandMeldung { art: string; text: string; orte: { q: number; r: number }[] }

export class Meldeleiste {
  private box = document.createElement('div');
  private eintraege = new Map<string, { el: HTMLElement; text: HTMLElement; m: RandMeldung; reihum: number }>();
  /** Ausgeblendet bis zu dieser Zahl von Orten. */
  private weg = new Map<string, number>();

  constructor(root: HTMLElement, private springe: (h: { q: number; r: number }) => void) {
    this.box.className = 'meldeleiste';
    this.box.setAttribute('aria-live', 'polite');
    root.append(this.box);
  }

  /** Neue Liste (einmal je Sekunde); gibt die Arten zurück, die gerade neu dazugekommen sind. */
  setze(liste: readonly RandMeldung[]): RandMeldung[] {
    const neu: RandMeldung[] = [];
    const da = new Set(liste.map((m) => m.art));
    for (const [art, e] of this.eintraege) if (!da.has(art)) { e.el.remove(); this.eintraege.delete(art); }
    for (const art of [...this.weg.keys()]) if (!da.has(art)) this.weg.delete(art);
    for (const m of liste) {
      const aus = this.weg.get(m.art);
      if (aus !== undefined && aus === m.orte.length) continue;
      this.weg.delete(m.art);
      let e = this.eintraege.get(m.art);
      if (!e) {
        const el = document.createElement('div');
        el.className = 'randmeldung';
        el.dataset.art = m.art;
        const text = document.createElement('span');
        const zu = document.createElement('button');
        zu.type = 'button'; zu.textContent = '✕'; zu.title = 'Ausblenden'; zu.setAttribute('aria-label', 'Meldung ausblenden');
        el.append(text, zu);
        const eintrag = { el, text, m, reihum: 0 };
        el.addEventListener('click', () => {
          const o = eintrag.m.orte;
          if (o.length) this.springe(o[eintrag.reihum++ % o.length]);
        });
        zu.addEventListener('click', (ev) => { ev.stopPropagation(); this.weg.set(eintrag.m.art, eintrag.m.orte.length); el.remove(); this.eintraege.delete(eintrag.m.art); });
        this.box.append(el);
        e = eintrag;
        this.eintraege.set(m.art, e);
        neu.push(m);
      }
      e.m = m;
      if (e.text.textContent !== `⚠ ${m.text}`) e.text.textContent = `⚠ ${m.text}`;
      e.el.title = m.orte.length > 1 ? 'Klick: zum nächsten Ort' : 'Klick: hinsehen';
    }
    return neu;
  }
}
