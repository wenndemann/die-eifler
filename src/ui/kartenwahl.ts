// Platzhalter der Kartenwahl (Drehbuch 3.1): einfaches Formular mit den gespeicherten Vorschlägen.
// Die echte Kartenwahl (Übersichtskarte, Auswahl-Hex, Ortssuche) baut ein anderer Agent und ersetzt diese Datei.
import type { Welt } from '../welt/laden';
import { GROESSE_NAME, GROESSEN, type AusschnittParam, type Groesse } from '../welt/format';
import { VORSCHLAEGE } from '../map/presets';

export function zeigeKartenwahl(root: HTMLElement, welt: Welt): Promise<AusschnittParam> {
  return new Promise((resolve) => {
    const box = document.createElement('div');
    box.className = 'kartenwahl';
    const sizes = (Object.keys(GROESSEN) as Groesse[])
      .map((g) => `<label><input type="radio" name="g" value="${g}"${g === 'mittel' ? ' checked' : ''}> ${GROESSE_NAME[g]}</label>`).join(' ');
    box.innerHTML = `<h2>Wo willst du siedeln?</h2><p class="sub">Datenversion ${welt.version}</p><div class="groessen">${sizes}</div><div class="liste"></div>`;
    const liste = box.querySelector('.liste')!;
    for (const v of VORSCHLAEGE) {
      const b = document.createElement('button');
      b.type = 'button';
      b.innerHTML = `<b>${v.name}</b><span>${v.text}</span>`;
      b.addEventListener('click', () => {
        const g = (box.querySelector('input[name=g]:checked') as HTMLInputElement).value as Groesse;
        box.remove();
        resolve({ version: welt.version, q: v.q, r: v.r, size: g });
      });
      liste.append(b);
    }
    root.append(box);
  });
}
