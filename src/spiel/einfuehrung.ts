// Einführung ins freie Spiel (Drehbuch 1.4, ROADMAP M12): Schritte aus data/einfuehrung.json, geprüft an der Sicht des eigenen Dorfs.
// Rein (für Tests); die Anzeige macht src/ui/einfuehrung.ts.
import daten from '../../data/einfuehrung.json';
import { PROMILLE, type SimSicht } from '../sim/typen';

export interface Schritt { id: string; auftrag: string; hilfe: string; geschafft: string }
export const SCHRITTE: readonly Schritt[] = daten.schritte;

/** Welche Schritte das Dorf von `ich` schon geschafft hat (in der Reihenfolge der Daten). */
export function geschafft(s: SimSicht, ich: number): boolean[] {
  const eigene = s.gebaeude.filter((g) => g.sp === ich);
  const hat = (typ: string) => eigene.some((g) => g.typ === typ);
  const fertig = (typ: string) => eigene.some((g) => g.typ === typ && g.bau >= PROMILLE);
  // Weg: an der Fahne der Holzfällerhütte hängt ein Weg und sie ist mit dem Lager verbunden (nicht „getrennt“), oder sie ist schon fertig
  const weg = eigene.some((g) => g.typ === 'holzfaeller' && g.zustand !== 'getrennt' && s.segmente.some((x) => x.a === g.fahne || x.b === g.fahne))
    || fertig('holzfaeller');
  const pruefe: Record<string, boolean> = {
    holzfaeller: hat('holzfaeller'),
    weg,
    saegewerk: hat('saegewerk'),
    steinbruch: hat('steinbruch'),
    wohnhaus: hat('wohnhaus'),
    essen: hat('kartoffelfeld') && hat('kueche'),
    kirmesplatz: hat('kirmesplatz'),
    kirmes: s.dorf.stufe >= 1,
  };
  return SCHRITTE.map((x) => !!pruefe[x.id]);
}
