// Gespeicherte Ausschnitte (Vorschläge in der Kartenwahl, Drehbuch 8.1). Version leer = aktuelle Datenversion.
import type { Groesse } from '../welt/format';

export interface Vorschlag { id: string; name: string; q: number; r: number; size: Groesse; text: string }

export const VORSCHLAEGE: Vorschlag[] = [
  { id: 'monschau-rursee', name: 'Monschauer Land & Rursee', q: 247, r: 393, size: 'gross',
    text: 'Rursee, Obersee und Urftsee, Einruhr und Rurberg, im Westen das Venn.' },
  { id: 'rureifel', name: 'Rureifel & Dürener Land', q: 419, r: 230, size: 'gross',
    text: 'Nideggen mit den Buntsandsteinfelsen, Heimbach, Kreuzau und die Rurtalbahn.' },
];
