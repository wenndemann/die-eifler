// Waren als kleine Modelle (Drehbuch 4.1: alle Waren sind sichtbar unterwegs; 7.6: erst lesbar, dann schön). Jede Ware hat
// eine klare Form und Hauptfarbe aus data/goods.json ('form', 'farbe'): der Stamm ist ein Stamm, das Brett ein Brett, der Käse
// ein gelbes Rad, der Most ein Krug, die Bratkartoffeln eine Pfanne. Gemeinsam für Warenstapel an Fahnen (fahnen.ts), getragene
// Ware (traeger.ts, arbeiter.ts) und Stapel an Baustellen und am Kirmesplatz (gebaeude.ts). Unten bei y = 0, in der Mitte bei
// x/z = 0, Größe um WARE_M. Aus denselben Modellen sollen später die Icons entstehen (M7).
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { paint } from './mockup';
import { WARE_M } from './massstab';
import { WAREN, WAREN_FARBE, WAREN_FARBE_FB, WAREN_FORM } from '../sim/daten';

/** Warenarten wie in der Simulation (data/goods.json). */
export const WAREN_ANZAHL = WAREN.length;

const W = WARE_M;

/** Farbe heller (f > 1) oder dunkler (f < 1). */
function ton(farbe: string, f: number): string {
  const c = new THREE.Color(farbe);
  if (f >= 1) c.lerp(new THREE.Color('#ffffff'), Math.min(1, f - 1));
  else c.multiplyScalar(f);
  return `#${c.getHexString()}`;
}
const walze = (r1: number, r2: number, h: number, y: number, farbe: string, seg = 9) =>
  paint(new THREE.CylinderGeometry(r1, r2, h, seg).translate(0, y + h / 2, 0), farbe);
const kugel = (r: number, x: number, y: number, z: number, farbe: string, sy = 1) =>
  paint(new THREE.SphereGeometry(r, 7, 5).scale(1, sy, 1).translate(x, y, z), farbe);

type Form = (farbe: string) => { teile: THREE.BufferGeometry[]; hoehe: number };

const FORMEN: Record<string, Form> = {
  stamm: (f) => {
    const l = W * 1.5, r = W * 0.2;
    const teile = [
      paint(new THREE.CylinderGeometry(r, r, l, 8).rotateZ(Math.PI / 2).translate(0, r, 0), f),
      // helle Schnittflächen an den Enden mit Jahresringen (M12: schön)
      paint(new THREE.CylinderGeometry(r * 0.86, r * 0.86, l + 0.12, 8).rotateZ(Math.PI / 2).translate(0, r, 0), '#e0bf86'),
      paint(new THREE.CylinderGeometry(r * 0.55, r * 0.55, l + 0.16, 8).rotateZ(Math.PI / 2).translate(0, r, 0), '#c9a26a'),
      paint(new THREE.CylinderGeometry(r * 0.2, r * 0.2, l + 0.2, 6).rotateZ(Math.PI / 2).translate(0, r, 0), '#a87e4c'),
      paint(new THREE.CylinderGeometry(r * 1.03, r * 1.03, l - 0.5, 8).rotateZ(Math.PI / 2).translate(0, r, 0), f),
      // Rinde: dunkle Furchen längs und ein abgesägter Aststummel
      paint(new THREE.CylinderGeometry(W * 0.06, W * 0.07, W * 0.18, 6).rotateZ(0.5).translate(W * 0.25, r * 1.85, 0), ton(f, 0.85)),
      paint(new THREE.CylinderGeometry(W * 0.05, W * 0.05, W * 0.02, 6).rotateZ(0.5).translate(W * 0.29, r * 1.85 + W * 0.08, 0), '#e0bf86'),
    ];
    for (let i = 0; i < 4; i++) {
      const a = i * 1.6 + 0.3;
      teile.push(paint(new THREE.BoxGeometry(l - 0.6, W * 0.025, W * 0.04).translate(0, r + Math.cos(a) * r * 1.04, Math.sin(a) * r * 1.04), ton(f, 0.72)));
    }
    return { hoehe: W * 0.4, teile };
  },
  bretter: (f) => {
    const out: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 4; i++) {
      const x = (i % 2 - 0.5) * 0.18, y = W * 0.12 + i * W * 0.13;
      out.push(paint(new THREE.BoxGeometry(W * 1.45, W * 0.12, W * 0.62).translate(x, y, 0), i % 2 ? ton(f, 1.15) : f));
      // Maserung: feine dunkle Linien auf der Oberseite, leicht gewellt, dazu ein Ast
      if (i === 3) {
        for (let k = 0; k < 4; k++) out.push(paint(new THREE.BoxGeometry(W * 1.3, W * 0.012, W * 0.022).rotateY((k - 1.5) * 0.03).translate(x, y + W * 0.062, (k - 1.5) * W * 0.13), ton(f, 0.7)));
        out.push(paint(new THREE.CylinderGeometry(W * 0.045, W * 0.045, W * 0.014, 7).translate(x + W * 0.3, y + W * 0.063, W * 0.06), ton(f, 0.6)));
      }
    }
    // quer liegende Hölzer darunter
    out.push(paint(new THREE.BoxGeometry(W * 0.12, W * 0.1, W * 0.7).translate(-W * 0.45, W * 0.05, 0), '#7a5636'));
    out.push(paint(new THREE.BoxGeometry(W * 0.12, W * 0.1, W * 0.7).translate(W * 0.45, W * 0.05, 0), '#7a5636'));
    return { hoehe: W * 0.62, teile: out };
  },
  stein: (f) => {
    const s = W * 0.82;
    return {
      hoehe: W * 0.82,
      teile: [
        // behauener Block mit hellerer Oberkante, daneben ein runder Feldstein; Moos auf der Schattenseite (M12: schön)
        paint(new THREE.BoxGeometry(s, s * 0.8, s * 0.9).rotateY(0.3).translate(0, s * 0.4, 0), f),
        paint(new THREE.BoxGeometry(s * 0.9, s * 0.1, s * 0.8).rotateY(0.3).translate(0, s * 0.82, 0), ton(f, 1.25)),
        paint(new THREE.SphereGeometry(s * 0.32, 6, 5).scale(1, 0.75, 1).translate(s * 0.55, s * 0.22, s * 0.3), ton(f, 0.9)),
        paint(new THREE.SphereGeometry(s * 0.3, 6, 4).scale(1.2, 0.25, 0.9).rotateY(0.3).translate(-s * 0.18, s * 0.86, -s * 0.12), '#6f9a45'),
        paint(new THREE.SphereGeometry(s * 0.22, 6, 4).scale(0.5, 1, 1.1).rotateY(0.3).translate(-s * 0.5, s * 0.3, -s * 0.15), '#5f8a3c'),
        paint(new THREE.SphereGeometry(s * 0.14, 5, 4).scale(1, 0.4, 1).translate(s * 0.6, s * 0.45, s * 0.3), '#7aa64e'),
      ],
    };
  },
  setzling: (f) => ({
    hoehe: W * 1.0,
    teile: [
      walze(W * 0.28, W * 0.22, W * 0.35, 0, '#a0603a', 8),                         // Tontopf
      walze(W * 0.27, W * 0.27, W * 0.04, W * 0.33, '#5a3a22', 8),                  // Erde
      paint(new THREE.BoxGeometry(W * 0.05, W * 0.45, W * 0.05).translate(0, W * 0.55, 0), '#6b4a2e'),
      paint(new THREE.ConeGeometry(W * 0.28, W * 0.55, 6).translate(0, W * 0.85, 0), f),
    ],
  }),
  // Milchkanne: weiß mit blauem Band, Deckel und Henkel
  kanne: (f) => ({
    hoehe: W * 0.95,
    teile: [
      walze(W * 0.34, W * 0.36, W * 0.55, 0, f, 10),
      walze(W * 0.2, W * 0.34, W * 0.18, W * 0.55, f, 10),
      walze(W * 0.15, W * 0.15, W * 0.12, W * 0.73, f, 10),
      walze(W * 0.18, W * 0.18, W * 0.05, W * 0.85, '#8f969c', 10),
      walze(W * 0.37, W * 0.37, W * 0.09, W * 0.2, '#2f6db5', 10),
      paint(new THREE.TorusGeometry(W * 0.13, W * 0.03, 4, 8, Math.PI).translate(0, W * 0.9, 0), '#8f969c'),
    ],
  }),
  // Korb voller Äpfel: brauner Korb, rote Kugeln obendrauf
  korb: (f) => {
    const out = [walze(W * 0.48, W * 0.36, W * 0.38, 0, '#b0844e', 10), walze(W * 0.5, W * 0.5, W * 0.06, W * 0.36, '#8a6038', 10)];
    const pos = [[0, 0], [0.24, 0.1], [-0.22, 0.12], [0.05, -0.25], [-0.12, -0.15], [0.2, -0.18]];
    pos.forEach(([x, z], i) => out.push(kugel(W * 0.17, x * W, W * (0.48 + (i === 0 ? 0.1 : 0)), z * W, i % 3 === 2 ? ton(f, 0.8) : f)));
    out.push(paint(new THREE.TorusGeometry(W * 0.42, W * 0.035, 4, 10, Math.PI).translate(0, W * 0.4, 0), '#8a6038'));
    return { hoehe: W * 0.62, teile: out };
  },
  // Sack mit zugebundenem Zipfel, ein paar Kartoffeln liegen davor
  sack: (f) => ({
    hoehe: W * 0.8,
    teile: [
      kugel(W * 0.42, 0, W * 0.36, 0, '#d8c08a', 0.9),
      paint(new THREE.ConeGeometry(W * 0.22, W * 0.3, 7).translate(0, W * 0.78, 0), '#cfb57c'),
      walze(W * 0.12, W * 0.12, W * 0.06, W * 0.66, '#7a5636', 7),
      kugel(W * 0.16, W * 0.38, W * 0.1, W * 0.25, f, 0.75),
      kugel(W * 0.14, W * 0.12, W * 0.09, W * 0.42, ton(f, 0.85), 0.75),
      kugel(W * 0.13, -W * 0.3, W * 0.08, W * 0.33, f, 0.75),
    ],
  }),
  // Käse: gelbes Rad mit dunklerer Rinde und herausgeschnittenem Keil (helle Schnittfläche)
  rad: (f) => ({
    hoehe: W * 0.42,
    teile: [
      paint(new THREE.CylinderGeometry(W * 0.55, W * 0.55, W * 0.4, 14, 1, false, 0.6, Math.PI * 2 - 0.6).translate(0, W * 0.2, 0), f),
      paint(new THREE.CylinderGeometry(W * 0.56, W * 0.56, W * 0.08, 14, 1, false, 0.6, Math.PI * 2 - 0.6).translate(0, W * 0.38, 0), ton(f, 0.82)),
      paint(new THREE.BoxGeometry(W * 0.5, W * 0.38, W * 0.02).rotateY(-0.6 + Math.PI / 2).translate(Math.sin(0.6) * W * 0.25, W * 0.2, Math.cos(0.6) * W * 0.25), ton(f, 1.3)),
      paint(new THREE.BoxGeometry(W * 0.02, W * 0.38, W * 0.5).translate(0, W * 0.2, W * 0.25), ton(f, 1.3)),
    ],
  }),
  // Most: dickbauchiger grauer Steinzeugkrug mit blauem Band (wie aus dem Westerwald), Henkel und Korken
  krug: (f) => ({
    hoehe: W * 0.95,
    teile: [
      kugel(W * 0.38, 0, W * 0.38, 0, f, 1.05),
      walze(W * 0.16, W * 0.26, W * 0.25, W * 0.62, f, 9),
      walze(W * 0.1, W * 0.1, W * 0.12, W * 0.85, '#d9b57a', 7),
      walze(W * 0.39, W * 0.39, W * 0.08, W * 0.36, '#2f4f9a', 10),
      paint(new THREE.TorusGeometry(W * 0.17, W * 0.05, 5, 8, Math.PI * 1.2).rotateY(Math.PI / 2).translate(0, W * 0.6, W * 0.32), f),
    ],
  }),
  // Bratkartoffeln: schwarze Pfanne mit Stiel, goldbraune Würfel darin
  pfanne: (f) => {
    const out = [
      walze(W * 0.55, W * 0.45, W * 0.16, 0, '#2a2a2a', 12),
      paint(new THREE.BoxGeometry(W * 0.7, W * 0.07, W * 0.12).translate(W * 0.85, W * 0.12, 0), '#2a2a2a'),
      paint(new THREE.BoxGeometry(W * 0.3, W * 0.09, W * 0.16).translate(W * 1.15, W * 0.12, 0), '#6b4a2e'),
    ];
    const pos = [[0, 0], [0.22, 0.12], [-0.2, 0.15], [0.1, -0.24], [-0.18, -0.18], [0.3, -0.08], [-0.32, 0]];
    pos.forEach(([x, z], i) => out.push(paint(new THREE.BoxGeometry(W * 0.17, W * 0.13, W * 0.17).rotateY(i * 0.7).translate(x * W, W * 0.2, z * W), i % 2 ? f : ton(f, 0.78))));
    return { hoehe: W * 0.3, teile: out };
  },
  // Honigtopf: goldener Topf, Stoffdeckel mit Schnur, Holzlöffel
  topf: (f) => ({
    hoehe: W * 0.8,
    teile: [
      walze(W * 0.36, W * 0.3, W * 0.5, 0, f, 10),
      walze(W * 0.4, W * 0.38, W * 0.1, W * 0.5, ton(f, 0.75), 10),
      kugel(W * 0.36, 0, W * 0.6, 0, '#e8dcc0', 0.35),
      walze(W * 0.38, W * 0.38, W * 0.04, W * 0.55, '#c0392b', 10),
      paint(new THREE.BoxGeometry(W * 0.06, W * 0.55, W * 0.06).rotateZ(0.35).translate(W * 0.12, W * 0.8, 0), '#8a6340'),
    ],
  }),
  // Gerste: gebundene Garbe mit Ähren oben und Strohband
  garbe: (f) => {
    const out = [walze(W * 0.22, W * 0.3, W * 0.75, 0, ton(f, 0.85), 8), walze(W * 0.24, W * 0.24, W * 0.08, W * 0.32, '#8a6038', 8)];
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      out.push(paint(new THREE.ConeGeometry(W * 0.07, W * 0.3, 4).rotateZ(Math.cos(a) * 0.4).rotateX(Math.sin(a) * 0.4)
        .translate(Math.cos(a) * W * 0.14, W * 0.88, Math.sin(a) * W * 0.14), f));
    }
    return { hoehe: W * 1.0, teile: out };
  },
  // Landbier: liegendes Holzfass mit dunklen Reifen und Zapfhahn
  fass: (f) => ({
    hoehe: W * 0.75,
    teile: [
      paint(new THREE.CylinderGeometry(W * 0.36, W * 0.36, W * 0.85, 10).rotateZ(Math.PI / 2).translate(0, W * 0.38, 0), f),
      paint(new THREE.CylinderGeometry(W * 0.4, W * 0.4, W * 0.38, 10).rotateZ(Math.PI / 2).translate(0, W * 0.38, 0), ton(f, 1.12)),
      paint(new THREE.CylinderGeometry(W * 0.41, W * 0.41, W * 0.06, 10).rotateZ(Math.PI / 2).translate(-W * 0.3, W * 0.38, 0), '#3a2a1a'),
      paint(new THREE.CylinderGeometry(W * 0.41, W * 0.41, W * 0.06, 10).rotateZ(Math.PI / 2).translate(W * 0.3, W * 0.38, 0), '#3a2a1a'),
      paint(new THREE.BoxGeometry(W * 0.06, W * 0.14, W * 0.06).translate(W * 0.45, W * 0.3, 0), '#c9a227'),
    ],
  }),
  // Wacholder: kleines Körbchen mit dunkelblauen Beeren und einem grünen Zweig
  beeren: (f) => {
    const out = [walze(W * 0.36, W * 0.28, W * 0.26, 0, '#b0844e', 9)];
    for (let i = 0; i < 9; i++) {
      const a = i * 2.4, r = W * (0.05 + (i % 3) * 0.09);
      out.push(kugel(W * 0.09, Math.cos(a) * r, W * (0.3 + (i % 2) * 0.05), Math.sin(a) * r, i % 4 ? f : ton(f, 0.7)));
    }
    out.push(paint(new THREE.ConeGeometry(W * 0.08, W * 0.45, 4).rotateZ(1.1).translate(W * 0.25, W * 0.42, 0), '#3f6b3a'));
    return { hoehe: W * 0.5, teile: out };
  },
  // Schnaps: Flasche aus hellem Glas mit rotem Korken und Etikett – deutlich anders als der Mostkrug
  flasche: (f) => ({
    hoehe: W * 1.05,
    teile: [
      walze(W * 0.2, W * 0.2, W * 0.6, 0, f, 9),
      walze(W * 0.08, W * 0.2, W * 0.15, W * 0.6, f, 9),
      walze(W * 0.07, W * 0.07, W * 0.2, W * 0.75, f, 7),
      walze(W * 0.08, W * 0.08, W * 0.1, W * 0.95, '#b03a2e', 7),
      walze(W * 0.205, W * 0.205, W * 0.22, W * 0.18, '#f2e6c8', 9),
    ],
  }),
  // Erz: rostbrauner, kantiger Brocken mit dunklen Adern
  brocken: (f) => ({
    hoehe: W * 0.7,
    teile: [
      paint(new THREE.DodecahedronGeometry(W * 0.4, 0).scale(1.1, 0.85, 0.95).translate(0, W * 0.34, 0), f),
      paint(new THREE.DodecahedronGeometry(W * 0.2, 0).translate(W * 0.28, W * 0.18, W * 0.2), ton(f, 0.6)),
      paint(new THREE.DodecahedronGeometry(W * 0.16, 0).translate(-W * 0.3, W * 0.14, -W * 0.15), ton(f, 1.2)),
    ],
  }),
  // Holzkohle: offener Sack mit schwarzen Stücken obenauf
  kohle: (f) => {
    const out = [kugel(W * 0.4, 0, W * 0.32, 0, '#cbb88a', 0.85), walze(W * 0.3, W * 0.36, W * 0.1, W * 0.55, '#bfa978', 9)];
    for (let i = 0; i < 6; i++) out.push(paint(new THREE.DodecahedronGeometry(W * 0.1, 0).translate(Math.cos(i * 1.1) * W * 0.16, W * 0.66, Math.sin(i * 1.1) * W * 0.16), i % 2 ? f : ton(f, 1.6)));
    return { hoehe: W * 0.75, teile: out };
  },
  // Eisen: drei graublaue Barren, gestapelt
  barren: (f) => ({
    hoehe: W * 0.42,
    teile: [
      paint(new THREE.BoxGeometry(W * 0.9, W * 0.16, W * 0.3).translate(0, W * 0.08, -W * 0.17), f),
      paint(new THREE.BoxGeometry(W * 0.9, W * 0.16, W * 0.3).translate(0, W * 0.08, W * 0.17), ton(f, 0.85)),
      paint(new THREE.BoxGeometry(W * 0.3, W * 0.16, W * 0.9).translate(0, W * 0.24, 0), ton(f, 1.15)),
    ],
  }),
  // Holzbrücke: gewölbter Bohlenbelag mit zwei Geländern, zusammengebunden zum Tragen
  bruecke: (f) => ({
    hoehe: W * 0.45,
    teile: [
      ...[-0.36, -0.18, 0, 0.18, 0.36].map((x, i) => paint(new THREE.BoxGeometry(W * 0.16, W * 0.08, W * 0.6).translate(x * W, W * (0.1 + 0.08 * Math.cos(x * 4)), 0), i % 2 ? f : ton(f, 0.85))),
      paint(new THREE.BoxGeometry(W * 0.95, W * 0.06, W * 0.06).translate(0, W * 0.36, W * 0.28), ton(f, 0.7)),
      paint(new THREE.BoxGeometry(W * 0.95, W * 0.06, W * 0.06).translate(0, W * 0.36, -W * 0.28), ton(f, 0.7)),
      ...[-0.42, 0.42].flatMap((x) => [-0.28, 0.28].map((z) => paint(new THREE.BoxGeometry(W * 0.06, W * 0.3, W * 0.06).translate(x * W, W * 0.24, z * W), ton(f, 0.7)))),
    ],
  }),
  // Werkzeug: Hammer und Schaufel über Kreuz (Drehbuch 4.5)
  werkzeug: (f) => ({
    hoehe: W * 0.4,
    teile: [
      paint(new THREE.BoxGeometry(W * 1.1, W * 0.08, W * 0.08).rotateY(0.6).translate(0, W * 0.1, 0), '#8a6340'),
      paint(new THREE.BoxGeometry(W * 0.16, W * 0.18, W * 0.38).rotateY(0.6).translate(Math.cos(0.6) * W * 0.5, W * 0.12, -Math.sin(0.6) * W * 0.5), f),
      paint(new THREE.BoxGeometry(W * 1.0, W * 0.07, W * 0.07).rotateY(-0.6).translate(0, W * 0.2, 0), '#8a6340'),
      paint(new THREE.BoxGeometry(W * 0.3, W * 0.04, W * 0.26).rotateY(-0.6).translate(-Math.cos(0.6) * W * 0.55, W * 0.2, -Math.sin(0.6) * W * 0.55), ton(f, 0.9)),
    ],
  }),
};

/** Farbenblind-Modus (Einstellungen): andere Hauptfarben; gilt für Modelle, die danach gebaut werden. */
let farbenblind = false;
export function setzeFarbenblind(an: boolean): void { farbenblind = an; }

function form(art: number) {
  return (FORMEN[WAREN_FORM[art]] ?? FORMEN.sack)((farbenblind ? WAREN_FARBE_FB : WAREN_FARBE)[art] ?? '#b08850');
}

/** Geometrie einer Ware (Farben als Vertexfarben). */
export function warenGeometrie(art: number): THREE.BufferGeometry {
  const g = mergeGeometries(form(art).teile)!;
  if (!g.attributes.normal) g.computeVertexNormals();
  return g;
}

/** Höhe einer Ware in Metern (grob, zum Stapeln). */
export const WARE_HOEHE: readonly number[] = WAREN.map((_, a) => form(a).hoehe);
