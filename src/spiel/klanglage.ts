// Was gerade zu hören ist (M12): arbeitende Gebäude und betrunkene Boten nah am Blickpunkt mit Links-rechts und Nähe, Fest ja/nein.
// Rein (für Tests); die Welt-Positionen kommen über `wo` (Hex → Ausschnitt-Meter).
import klang from '../../data/klang.json';
import { SPUK_GERAEUSCH_S } from '../sim/grenzland';
import type { SimSicht } from '../sim/typen';
import type { KlangLage } from '../klang/klang';
import type { WetterLage } from '../render/wetter';

/** Höchstens so viele Geräuschquellen auf einmal (die nächsten). */
export const KLANG_QUELLEN = 8;

export function klangLage(
  s: SimSicht, ich: number, wo: (h: { q: number; r: number }) => { x: number; z: number },
  ziel: { x: number; z: number }, rechts: { x: number; z: number }, abstand: number, tag: number, wetter: WetterLage, wasser = 0,
): KlangLage {
  const reich = klang.arbeit.reichweite_m * Math.max(1, abstand / 900);
  const quelle = (h: { q: number; r: number }) => {
    const p = wo(h), dx = p.x - ziel.x, dz = p.z - ziel.z, d = Math.hypot(dx, dz);
    if (d > reich) return null;
    return { pan: Math.max(-1, Math.min(1, (dx * rechts.x + dz * rechts.z) / (reich * 0.6))), naehe: 1 - d / reich, d };
  };
  const arbeit: (KlangLage['arbeit'][number] & { d: number })[] = [];
  for (const g of s.gebaeude) {
    if (g.zustand !== 'arbeitet' || !(g.typ in klang.arbeit.geraeusche)) continue;
    const q = quelle(g);
    if (q) arbeit.push({ typ: g.typ, id: g.id, ...q });
  }
  arbeit.sort((a, b) => a.d - b.d);
  const betrunken: KlangLage['betrunken'] = [];
  for (const b of s.boten) {
    if (b.pegel < 2) continue;
    const q = quelle(b.von);
    if (q) betrunken.push({ pan: q.pan, naehe: q.naehe });
  }
  const d = s.dorf;
  const fest = !!(d.kirmes?.fest || d.fest?.laeuft || d.schuetzen?.fest || (d.grenz?.jfest ?? 0) > 0 || s.gebaeude.some((g) => g.sp === ich && g.zustand === 'fest'));
  // M15: versetzte Grenzsteine – nachts spuken dort die Versetzer (auch weiter weg zu hören)
  const spuk: { pan: number; naehe: number; d: number }[] = [];
  for (const st of s.grenzland?.steine ?? []) {
    if (st.art !== 0) continue;
    const p = wo(st), dx = p.x - ziel.x, dz = p.z - ziel.z, dd = Math.hypot(dx, dz), weit = reich * 3;
    spuk.push({ pan: Math.max(-1, Math.min(1, (dx * rechts.x + dz * rechts.z) / (weit * 0.6))), naehe: Math.max(0, 1 - dd / weit), d: dd });
  }
  spuk.sort((a, b) => a.d - b.d);
  return {
    spuk: spuk.slice(0, 1).map(({ d: _d, ...x }) => x), spukTakt: SPUK_GERAEUSCH_S,
    tag, jahreszeit: s.jahr.jahreszeit, regen: Math.max(wetter.regen, wetter.schnee * 0.3), wind: wetter.wind, fest,
    arbeit: arbeit.slice(0, KLANG_QUELLEN).map(({ d: _d, ...a }) => a), betrunken: betrunken.slice(0, 3),
    nah: Math.max(0, Math.min(1, 1 - (abstand - 200) / 1800)), wasser,
  };
}
