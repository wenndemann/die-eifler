// Meldungen der Erzählfigur oben in der Mitte (Drehbuch 1.4, 4.4): Name der Figur, Text, darunter ein Platt-Spruch, dessen
// Übersetzung als Tooltip erscheint (Drehbuch 7.2). Höchstens drei auf einmal, sie verschwinden von selbst.
// Reine HTML-Oberfläche: kennt weder Simulation noch Szene.

export interface MeldungsDaten {
  wer: string; text: string; platt?: { platt: string; hoch: string }; gross: boolean;
  /** Klick springt zum Ort (dann mit 🎯 markiert). */
  onKlick?: () => void;
}

const MAX = 3;

export class Meldungen {
  private box = document.createElement('div');
  /** Zuletzt gezeigte Texte (für Tests und die Info-Leiste). */
  readonly verlauf: string[] = [];

  constructor(root: HTMLElement) {
    this.box.className = 'meldungen';
    this.box.setAttribute('aria-live', 'polite');
    root.append(this.box);
  }

  zeige(m: MeldungsDaten): void {
    const d = document.createElement('div');
    d.className = `meldung${m.gross ? ' gross' : ''}`;
    const wer = document.createElement('span');
    wer.className = 'wer';
    wer.textContent = m.wer;
    const text = document.createElement('span');
    text.textContent = m.text;
    d.append(wer, text);
    if (m.platt) {
      const p = document.createElement('span');
      p.className = 'platt';
      p.textContent = `„${m.platt.platt}“`;
      p.title = `Auf Hochdeutsch: ${m.platt.hoch}`;
      d.append(p);
    }
    if (m.onKlick) { d.classList.add('ort'); d.title = 'Klick: hinsehen'; }
    d.addEventListener('click', () => { m.onKlick?.(); this.weg(d); });
    this.box.append(d);
    while (this.box.children.length > MAX) this.box.firstElementChild!.remove();
    this.verlauf.push(m.text);
    if (this.verlauf.length > 50) this.verlauf.shift();
    setTimeout(() => this.weg(d), m.gross ? 12000 : 7000);
  }

  private weg(d: HTMLElement): void {
    if (!d.isConnected) return;
    d.classList.add('weg');
    setTimeout(() => d.remove(), 450);
  }
}
