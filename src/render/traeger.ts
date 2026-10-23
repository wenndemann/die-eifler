// Träger (Drehbuch 4.1, 7.1): die erste knubbelige Figur – großer Kopf, Knollennase, rote Kappe, krumme Beine,
// Siedler-2-Körper mit Comic-Einschlag. Eine Geometrie, Gliedmaßen werden im Vertex-Shader geschwenkt (Laufen,
// Wippen, Arme hoch beim Tragen), damit viele Träger in einem Draw-Call stehen. Die getragene Ware sitzt sichtbar
// über dem Kopf (eigene Instanz-Sätze je Warenart, Modelle aus waren.ts).
// Reiner Leser der SimSicht: Position zwischen den Ticks aus fortschritt + alpha·schritt, entlang der Wegkurve
// des Segments (gleiche Kurve wie wege.ts), Höhe vom Gelände, Blick in Laufrichtung.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { MapData } from '../map/mapdata';
import type { HexGrid } from '../map/hex';
import { PROMILLE, type Id, type SimSicht } from '../sim/typen';
import { WARE } from '../sim/daten';
import { paint } from './mockup';
import { VOELKCHEN } from '../sim/voelkchen';
import { Instanzen } from './instanzen';
import { Kontaktschatten } from './kontakt';
import { entzerren, meisterPlaetze, traegerPlaetze, type Platz } from './gedraenge';
import { TRAEGER_H, WARE_TRAGEN, fernFaktor } from './massstab';
import { WAREN_ANZAHL, warenGeometrie } from './waren';
import { kurvenPunkt, wegPunkte, type Pkt } from './wege';

// ---- Modell (Einheitshöhe 1, vorn = +z). Teile: 0 Rumpf, 1/2 Bein links/rechts, 3/4 Arm links/rechts,
// M12 Gesicht: 5 Brauen, 6 Mund, 7 Augen (Mimik im Vertex-Shader, Gelenk = Drehpunkt bzw. Mitte des Teils).
// Gesichtsvariante (aVariante): 0 immer sichtbar, +n nur bei Variante n, −n nicht bei Variante n (Instanzwert aVar, VARIANTEN).
interface Teil { geo: THREE.BufferGeometry; teil: number; gelenk: [number, number, number]; tint: number; variante: number }
const teile: Teil[] = [];
const add = (geo: THREE.BufferGeometry, teil = 0, gelenk: [number, number, number] = [0, 0, 0], tint = 0, variante = 0) =>
  teile.push({ geo, teil, gelenk, tint, variante });

/** Walze zwischen zwei Punkten. */
function rohr(a: [number, number, number], b: [number, number, number], r1: number, r2: number, farbe: string, seg = 6) {
  const va = new THREE.Vector3(...a), vb = new THREE.Vector3(...b);
  const d = vb.clone().sub(va), len = d.length();
  const g = new THREE.CylinderGeometry(r2, r1, len, seg);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()));
  g.translate((va.x + vb.x) / 2, (va.y + vb.y) / 2, (va.z + vb.z) / 2);
  return paint(g, farbe);
}

/**
 * Geflochtener Zopf von a (Ansatz am Kopf) nach b: ein dunkler Kern, darauf abwechselnd links und rechts schräg gestellte Strähnen
 * (das Fischgrät-Muster eines Zopfs), unten Schleife und Quaste. Liefert die Teile; `variante` wie bei add.
 */
function zopf(a: [number, number, number], b: [number, number, number], dicke: number, farbe: string, schleife: string, variante = 0): void {
  const va = new THREE.Vector3(...a), vb = new THREE.Vector3(...b);
  const d = vb.clone().sub(va), len = d.length();
  const dreh = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize());
  const lege = (g: THREE.BufferGeometry, y: number) => g.translate(0, y, 0).applyQuaternion(dreh).translate(va.x, va.y, va.z);
  const dunkel = '#' + new THREE.Color(farbe).multiplyScalar(0.6).getHexString();
  add(paint(lege(new THREE.CylinderGeometry(dicke * 0.45, dicke * 0.6, len * 0.92, 5).translate(0, len * 0.46, 0), 0), dunkel), 0, [0, 0, 0], 0, variante);
  const n = 6;
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n, s = 1 - 0.3 * t, seite = i % 2 ? 1 : -1;
    const g = new THREE.SphereGeometry(dicke, 6, 4).scale(0.75 * s, (len / n) * 0.95 / dicke, 0.7 * s)
      .rotateZ(seite * 0.6).translate(seite * dicke * 0.28 * s, 0, 0);
    add(paint(lege(g, len * t * 0.92), farbe), 0, [0, 0, 0], 0, variante);
  }
  add(paint(lege(new THREE.TorusGeometry(dicke * 0.55, dicke * 0.3, 4, 8).rotateX(Math.PI / 2), len * 0.94), schleife), 0, [0, 0, 0], 0, variante);
  add(paint(lege(new THREE.SphereGeometry(dicke * 0.4, 5, 3).translate(-dicke * 0.6, 0, 0), len * 0.94), schleife), 0, [0, 0, 0], 0, variante);
  add(paint(lege(new THREE.SphereGeometry(dicke * 0.4, 5, 3).translate(dicke * 0.6, 0, 0), len * 0.94), schleife), 0, [0, 0, 0], 0, variante);
  add(paint(lege(new THREE.ConeGeometry(dicke * 0.75, len * 0.16, 6).rotateX(Math.PI), len * 1.04), farbe), 0, [0, 0, 0], 0, variante);
}

/**
 * Tracht (Berufe erkennbar, Gutachter): Kopfbedeckung, Schürze und Bart. Hut-Farben stehen fest (nur die Kappe der Träger nimmt die
 * Trachtfarbe an), das Hemd färbt weiter die Instanzfarbe.
 */
export type Hut = 'kappe' | 'pudel' | 'jaeger' | 'leder' | 'zimmermann' | 'stroh' | 'koch' | 'haube' | 'stirnband' | 'imker' | 'ohne';
export type Werkzeug = 'hammer' | 'kaese' | 'loeffel' | 'krug' | 'gabel' | 'angel' | 'schaufel' | 'smoker' | 'kelle';
export interface Tracht {
  hut: Hut; hutFarbe?: string; schuerze?: string; bart?: string;
  /** feste Hemdfarbe (sonst Instanzfarbe) */ hemd?: string;
  /** großes Werkzeug in der rechten Hand (bzw. Käselaib vor dem Bauch), STIL.md §6b */ werkzeug?: Werkzeug;
  /** Frau: ohne Schnauzer, mit Zöpfen */ frau?: boolean;
}
export const TRAEGER_TRACHT: Tracht = { hut: 'kappe' };

/** Kopfbedeckung um den Kopf (Mitte 0, 0.74, 0; Radius 0.235), leicht in den Nacken geschoben wie die Kappe. */
function hut(t: Tracht, nacken: (g: THREE.BufferGeometry) => THREE.BufferGeometry): void {
  const f = t.hutFarbe;
  const halbkugel = (r: number, y: number, farbe: string, sy = 1) => paint(new THREE.SphereGeometry(r, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, sy, 1).translate(0, y, 0), farbe);
  const walze = (r1: number, r2: number, h: number, y: number, farbe: string, seg = 14) => paint(new THREE.CylinderGeometry(r1, r2, h, seg).translate(0, y, 0), farbe);
  switch (t.hut) {
    case 'kappe':
      add(nacken(paint(new THREE.SphereGeometry(0.245, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, 0.83, 0), '#d8cfc4')), 0, [0, 0, 0], 1, -VARIANTE.frau);
      add(nacken(paint(new THREE.BoxGeometry(0.26, 0.03, 0.12).translate(0, 0.84, 0.2), '#9a9088')), 0, [0, 0, 0], 1, -VARIANTE.frau);
      add(nacken(paint(new THREE.SphereGeometry(0.06, 5, 4).translate(0, 1.08, 0), '#f3e9d2')), 0, [0, 0, 0], 0, -VARIANTE.frau);
      // Frau: Kopftuch in der Trachtfarbe, hinten geknotet (statt Kappe mit Bommel)
      add(nacken(paint(new THREE.SphereGeometry(0.255, 12, 7, 0, Math.PI * 2, 0, Math.PI * 0.55).translate(0, 0.78, -0.01), '#e8e0d4')), 0, [0, 0, 0], 1, VARIANTE.frau);
      add(nacken(paint(new THREE.SphereGeometry(0.06, 6, 4).scale(1.3, 0.8, 1).translate(0, 0.86, -0.25), '#e8e0d4')), 0, [0, 0, 0], 1, VARIANTE.frau);
      add(nacken(paint(new THREE.ConeGeometry(0.05, 0.13, 5).rotateX(-2.4).translate(0, 0.8, -0.29), '#e8e0d4')), 0, [0, 0, 0], 1, VARIANTE.frau);
      break;
    case 'pudel': {
      // Strickmütze mit Umschlag und dickem Bommel (Holzfäller, Köhler)
      const c = f ?? '#c8372d';
      add(nacken(halbkugel(0.25, 0.8, c, 1.35)));
      add(nacken(walze(0.255, 0.255, 0.09, 0.83, `#${new THREE.Color(c).multiplyScalar(0.7).getHexString()}`)));
      add(nacken(paint(new THREE.SphereGeometry(0.09, 7, 5).translate(0, 1.15, 0), '#f3ead8')));
      break;
    }
    case 'jaeger': {
      // Försterhut: grüner Filz, breite Krempe, Hutband, Feder
      const c = f ?? '#3f5f2e';
      add(nacken(walze(0.4, 0.4, 0.035, 0.88, c, 16)));
      add(nacken(walze(0.15, 0.21, 0.22, 0.99, c)));
      add(nacken(walze(0.212, 0.212, 0.05, 0.92, '#6b3a1e')));
      add(nacken(paint(new THREE.ConeGeometry(0.035, 0.36, 5).rotateZ(-0.5).translate(0.25, 1.06, -0.02), '#e8dcb0')));
      break;
    }
    case 'leder': {
      // Lederkappe mit Schirm und Schutzbrille (Steinbruch)
      add(nacken(halbkugel(0.255, 0.82, f ?? '#7a5434')));
      add(nacken(paint(new THREE.BoxGeometry(0.3, 0.035, 0.16).translate(0, 0.83, 0.22), '#5a3c24')));
      for (const sx of [-1, 1]) add(nacken(paint(new THREE.TorusGeometry(0.05, 0.018, 4, 10).translate(sx * 0.075, 0.93, 0.2), '#2a2a2a')));
      for (const sx of [-1, 1]) add(nacken(paint(new THREE.CircleGeometry(0.045, 10).translate(sx * 0.075, 0.93, 0.205), '#8fc0d8')));
      break;
    }
    case 'zimmermann':
      // schwarzer Zimmermannshut mit breiter Krempe (Bauleute, Sägewerk)
      add(nacken(walze(0.44, 0.44, 0.035, 0.88, f ?? '#26221f', 18)));
      add(nacken(walze(0.19, 0.21, 0.2, 0.99, f ?? '#26221f')));
      break;
    case 'stroh':
      // Strohhut mit rotem Band (Felder, Hof)
      add(nacken(walze(0.46, 0.46, 0.03, 0.88, f ?? '#e6c46a', 18)));
      add(nacken(walze(0.19, 0.22, 0.16, 0.97, f ?? '#dcb85a')));
      add(nacken(walze(0.222, 0.222, 0.045, 0.92, '#c0392b')));
      break;
    case 'koch':
      // hohe weiße Kochmütze
      add(walze(0.2, 0.2, 0.22, 1.0, '#fbfbf8'));
      add(paint(new THREE.SphereGeometry(0.26, 12, 8).scale(1, 0.7, 1).translate(0, 1.18, 0), '#fbfbf8'));
      break;
    case 'haube':
      // Haube bzw. Kopftuch mit Knoten hinten (Käserin, Spinnerin)
      add(nacken(halbkugel(0.255, 0.8, f ?? '#f6f3ec', 1.05)));
      add(nacken(paint(new THREE.SphereGeometry(0.07, 6, 5).translate(0, 0.86, -0.24), f ?? '#f6f3ec')));
      break;
    case 'stirnband':
      // Schmied: Stirnband, kurzes Haar
      add(halbkugel(0.24, 0.79, '#4a3020', 0.8));
      add(paint(new THREE.TorusGeometry(0.238, 0.03, 5, 16).rotateX(Math.PI / 2).translate(0, 0.86, 0), f ?? '#b8322a'));
      break;
    case 'imker':
      // Imkerhut mit Schleier
      // runder Hut, Netz nur seitlich und hinten (Gesicht bleibt frei), Rand des Netzes dunkel wie Gaze
      add(nacken(walze(0.4, 0.4, 0.03, 0.9, '#f4efe0', 16)));
      add(nacken(walze(0.17, 0.21, 0.16, 0.99, '#f4efe0')));
      add(nacken(paint(new THREE.CylinderGeometry(0.37, 0.32, 0.26, 16, 1, true, Math.PI * 0.3, Math.PI * 1.4).translate(0, 0.76, 0), '#5d6258')));
      break;
    case 'ohne':
      // Glatze mit Haarkranz (Wirt)
      add(paint(new THREE.TorusGeometry(0.2, 0.045, 5, 14).rotateX(Math.PI / 2).translate(0, 0.78, -0.03), '#8a6a50'));
      break;
  }
}

/** Großes Werkzeug je Beruf: in der rechten Hand (Teil 4, schwingt mit dem Arm), der Käselaib vor dem Bauch. Aufrecht, Kopf oben. */
function werkzeug(w: Werkzeug): void {
  const sch: [number, number, number] = [0.25, 0.54, 0], hx = 0.36, hz = 0.16;
  // fast doppelt so groß wie echt (um die Hand) und etwas vor dem Körper: aus der Spielkamera als Werkzeug erkennbar
  const gross = (g: THREE.BufferGeometry) => g.translate(-hx, -0.27, -hz).scale(1.9, 1.9, 1.9).translate(hx, 0.27, hz + 0.04);
  const stiel = (unten: number, oben: number, f = '#8a6340', r = 0.026) => add(gross(paint(new THREE.CylinderGeometry(r, r, oben - unten, 6).translate(hx, (oben + unten) / 2, hz), f)), 4, sch);
  const teil = (g: THREE.BufferGeometry, f: string) => add(gross(paint(g, f)), 4, sch);
  switch (w) {
    case 'hammer': stiel(0.18, 0.62); teil(new THREE.BoxGeometry(0.1, 0.11, 0.24).translate(hx, 0.64, hz), '#4a4d52'); break;
    case 'kelle': stiel(0.2, 0.75); teil(new THREE.SphereGeometry(0.09, 8, 5, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2).translate(hx, 0.78, hz), '#a87a4a'); break;
    case 'loeffel': stiel(0.2, 0.72, '#c89a5a', 0.018); teil(new THREE.SphereGeometry(0.07, 8, 6).scale(1, 1.4, 0.4).translate(hx, 0.78, hz), '#c89a5a'); break;
    case 'krug': teil(new THREE.CylinderGeometry(0.075, 0.065, 0.17, 10).translate(hx, 0.36, hz + 0.02), '#d8c8a0'); teil(new THREE.CylinderGeometry(0.08, 0.08, 0.05, 10).translate(hx, 0.46, hz + 0.02), '#fbfaf2'); break;
    case 'gabel':
      stiel(-0.02, 0.95);
      for (const dx of [-0.05, 0, 0.05]) teil(new THREE.CylinderGeometry(0.012, 0.008, 0.18, 4).translate(hx + dx, 1.03, hz), '#9aa0a6');
      teil(new THREE.BoxGeometry(0.13, 0.02, 0.02).translate(hx, 0.95, hz), '#9aa0a6');
      break;
    case 'schaufel': stiel(0.05, 0.85); teil(new THREE.BoxGeometry(0.16, 0.2, 0.025).translate(hx, 0.95, hz), '#5a5d63'); break;
    case 'angel': teil(new THREE.CylinderGeometry(0.016, 0.03, 0.8, 6).rotateZ(-0.6).translate(hx + 0.22, 0.6, hz), '#8a6340'); teil(new THREE.SphereGeometry(0.04, 6, 4).translate(hx + 0.45, 0.42, hz), '#e8482a'); break;
    case 'smoker':
      teil(new THREE.CylinderGeometry(0.06, 0.06, 0.15, 10).translate(hx, 0.3, hz + 0.02), '#b8bcc0');
      teil(new THREE.ConeGeometry(0.06, 0.09, 8).translate(hx, 0.42, hz + 0.02), '#9aa0a6');
      break;
    case 'kaese':
      add(paint(new THREE.CylinderGeometry(0.15, 0.15, 0.1, 14).rotateX(Math.PI / 2).translate(0, 0.38, 0.3), '#f2c94c'));
      add(paint(new THREE.CylinderGeometry(0.155, 0.155, 0.02, 14).rotateX(Math.PI / 2).translate(0, 0.38, 0.35), '#e0a830'));
      break;
  }
}

/** Schürze (vorn über dem Bauch) und Vollbart. */
function zusatz(t: Tracht): void {
  if (t.schuerze) {
    add(paint(new THREE.CylinderGeometry(0.248, 0.262, 0.32, 12, 1, true, -1.05, 2.1).translate(0, 0.33, 0), t.schuerze));
    add(paint(new THREE.BoxGeometry(0.16, 0.12, 0.02).translate(0, 0.53, 0.2), t.schuerze));
  }
  // Mitte knapp über 0,6: wächst mit dem Kopf (Stil-Skalierung unten)
  if (t.bart) add(paint(new THREE.SphereGeometry(0.17, 10, 7).scale(1.05, 0.8, 0.7).translate(0, 0.605, 0.15), t.bart), 0, [0, 0, 0], 0, -VARIANTE.frau);
}

export function figur(tracht: Tracht = TRAEGER_TRACHT): THREE.BufferGeometry {
  teile.length = 0;
  const HOSE = '#6b4a2e', STIEFEL = '#2c2118', HAUT = '#f1bf96', NASE = '#e98a73';
  for (const [i, sx] of [[1, -1], [2, 1]] as const) {
    const hip: [number, number, number] = [sx * 0.1, 0.28, 0];
    // krumme Beine: Knie nach außen, Fuß wieder nach innen
    add(rohr(hip, [sx * 0.19, 0.15, 0.02], 0.085, 0.075, HOSE), i, hip);
    add(rohr([sx * 0.19, 0.15, 0.02], [sx * 0.13, 0.05, 0.03], 0.075, 0.065, HOSE), i, hip);
    add(paint(new THREE.BoxGeometry(0.15, 0.08, 0.24).translate(sx * 0.13, 0.04, 0.07), STIEFEL), i, hip);
  }
  // Rumpf: dicker Bauch, Gürtel
  add(paint(new THREE.SphereGeometry(0.23, 12, 9).scale(1, 1.05, 0.95).translate(0, 0.42, 0), '#ffffff'), 0, [0, 0, 0], 1);
  add(paint(new THREE.CylinderGeometry(0.235, 0.235, 0.05, 12).translate(0, 0.33, 0), '#4a3220'));
  add(paint(new THREE.BoxGeometry(0.07, 0.06, 0.02).translate(0, 0.33, 0.235), '#e8c14a'));
  // Hosenträger und heller Hemdkragen: der Rumpf liest sich als Kleidung, nicht als farbige Kugel
  for (const sx of [-1, 1]) {
    // (die Frau trägt keine Hosenträger)
    if (!tracht.frau) {
      add(paint(new THREE.TorusGeometry(0.245, 0.018, 4, 12, 1.6).rotateY(-Math.PI / 2).rotateX(0.35).translate(sx * 0.09, 0.42, 0), HOSE), 0, [0, 0, 0], 0, -VARIANTE.frau);
      add(paint(new THREE.SphereGeometry(0.024, 5, 4).translate(sx * 0.09, 0.47, 0.24), '#e8c14a'), 0, [0, 0, 0], 0, -VARIANTE.frau);
    }
  }
  add(paint(new THREE.TorusGeometry(0.12, 0.035, 5, 12).rotateX(Math.PI / 2).translate(0, 0.6, 0), '#f3ead8'));
  // Kopf: groß, Knollennase, Augen, Ohren
  add(paint(new THREE.SphereGeometry(0.235, 14, 10).translate(0, 0.74, 0), HAUT));
  // Knollennase; die Frau (Tracht oder Gesichtsvariante) hat eine kleine Stupsnase
  if (!tracht.frau) add(paint(new THREE.SphereGeometry(0.1, 9, 7).scale(1, 0.95, 1.1).translate(0, 0.71, 0.24), NASE), 0, [0, 0, 0], 0, -VARIANTE.frau);
  add(paint(new THREE.SphereGeometry(0.06, 8, 6).scale(1, 0.9, 1.1).translate(0, 0.715, 0.235), NASE), 0, [0, 0, 0], 0, tracht.frau ? 0 : VARIANTE.frau);
  for (const sx of [-1, 1]) add(paint(new THREE.SphereGeometry(0.06, 6, 5).scale(0.6, 1, 1).translate(sx * 0.235, 0.73, 0), HAUT));
  for (const sx of [-1, 1]) {
    // Augen (blinzeln): Weißes und Pupille um die Augenmitte
    add(paint(new THREE.SphereGeometry(0.062, 6, 5).translate(sx * 0.09, 0.785, 0.195), '#ffffff'), 7, [sx * 0.09, 0.785, 0.2]);
    add(paint(new THREE.SphereGeometry(0.032, 5, 4).translate(sx * 0.09, 0.79, 0.25), '#1b1b1b'), 7, [sx * 0.09, 0.785, 0.2]);
    add(paint(new THREE.SphereGeometry(0.05, 5, 4).translate(sx * 0.16, 0.69, 0.14), '#f08f7a'));   // Wangen
    // Brauen: dick und beweglich (hoch bei Freude, innen runter bei Ärger)
    if (!tracht.frau) add(paint(new THREE.BoxGeometry(0.12, 0.028, 0.03).rotateZ(sx * 0.2).translate(sx * 0.085, 0.85, 0.215), '#5a3b26'), 5, [sx * 0.085, 0.85, 0.215], 0, -VARIANTE.frau);
    // Frau: schmale, gebogene Brauen
    const fv = tracht.frau ? 0 : VARIANTE.frau;
    add(paint(new THREE.TorusGeometry(0.055, 0.009, 3, 8, 2.2).rotateZ(0.47).translate(sx * 0.09, 0.82, 0.215), '#6a4a30'), 5, [sx * 0.085, 0.85, 0.215], 0, fv);
  }
  // Frau: Rock über den Hüften (in der Hemdfarbe)
  add(paint(new THREE.CylinderGeometry(0.21, 0.29, 0.2, 14, 1, true).translate(0, 0.21, 0), '#ffffff'), 0, [0, 0, 0], 1, tracht.frau ? 0 : VARIANTE.frau);
  // Schnauzer (nicht bei der Frau, beim Alten grau); Gesichtsvarianten: Vollbart, Brille, Frau mit Zöpfen, Alter mit grauem Bart
  if (!tracht.frau) {
    add(paint(new THREE.BoxGeometry(0.2, 0.05, 0.03).translate(0, 0.655, 0.215), '#b5835a'), 0, [0, 0, 0], 0, -VARIANTE.frau);
    add(paint(new THREE.SphereGeometry(0.16, 10, 7).scale(1.05, 0.85, 0.7).translate(0, 0.605, 0.15), '#7a4a2a'), 0, [0, 0, 0], 0, VARIANTE.vollbart);
    for (const sx of [-1, 1]) {
      add(paint(new THREE.TorusGeometry(0.055, 0.012, 4, 12).translate(sx * 0.09, 0.785, 0.245), '#2a2a2a'), 0, [0, 0, 0], 0, VARIANTE.brille);
    }
    // der Alte: weißer Rauschebart
    add(paint(new THREE.SphereGeometry(0.17, 10, 7).scale(1.1, 0.95, 0.75).translate(0, 0.6, 0.16), '#eeebe4'), 0, [0, 0, 0], 0, VARIANTE.alt);
    add(paint(new THREE.BoxGeometry(0.06, 0.012, 0.012).translate(0, 0.79, 0.25), '#2a2a2a'), 0, [0, 0, 0], 0, VARIANTE.brille);
    for (const sx of [-1, 1]) {
      // Zöpfe seitlich vor den Schultern (von vorn gut zu sehen), mit roter Schleife
      zopf([sx * 0.22, 0.78, 0.02], [sx * 0.33, 0.44, 0.08], 0.065, '#c8843a', '#d6262a', VARIANTE.frau);
    }
  }
  else for (const sx of [-1, 1]) {
    // Zöpfe mit Schleife
    zopf([sx * 0.2, 0.78, -0.08], [sx * 0.29, 0.46, -0.08], 0.06, '#b8743a', '#d6262a');
  }
  // Mund unter dem Schnauzer: Bogen, im Shader zwischen Lachen (∪), Strich und Flunsch (∩) gebogen, beim Jubeln offen
  if (!tracht.frau) add(paint(new THREE.TorusGeometry(0.06, 0.017, 4, 9, Math.PI).rotateZ(Math.PI).translate(0, 0.625, 0.205), '#7a2a22'), 6, [0, 0.625, 0.205], 0, -VARIANTE.frau);
  add(paint(new THREE.TorusGeometry(0.05, 0.02, 4, 9, Math.PI).rotateZ(Math.PI).translate(0, 0.63, 0.205), '#c8303a'), 6, [0, 0.625, 0.205], 0, tracht.frau ? 0 : VARIANTE.frau);
  // Kappe mit Schirm und Bommel
  // Kappe in den Nacken geschoben, damit man das Gesicht auch von schräg oben sieht (Spielkamera)
  const nacken = (g: THREE.BufferGeometry) => g.translate(0, -0.74, 0).rotateX(-0.42).translate(0, 0.74, -0.02);
  // Kopfbedeckung je Tracht; die Kappe der Träger in der Trachtfarbe (Tint), damit das Gewimmel bunt ist
  hut(tracht, nacken);
  zusatz(tracht);
  // Arme: Gelenk an der Schulter, Hand als Kugel
  for (const [i, sx] of [[3, -1], [4, 1]] as const) {
    const sch: [number, number, number] = [sx * 0.25, 0.54, 0];
    add(rohr(sch, [sx * 0.32, 0.3, 0.03], 0.065, 0.06, '#ffffff'), i, sch, 1);
    add(paint(new THREE.SphereGeometry(0.07, 5, 4).translate(sx * 0.32, 0.27, 0.03), HAUT), i, sch);
  }
  if (tracht.werkzeug) werkzeug(tracht.werkzeug);
  // Stil (STIL.md): großer Kopf und runder Bauch – Kopfteile um den Hals vergrößert, Bauch breiter
  for (const t of teile) {
    t.geo.computeBoundingBox();
    const b = t.geo.boundingBox!, cy = (b.min.y + b.max.y) / 2;
    const kopf = (p: [number, number, number]): [number, number, number] => [p[0] * KOPF, (p[1] - 0.6) * KOPF + 0.62, p[2] * KOPF];
    if (t.teil >= 5) { t.geo.translate(0, -0.6, 0).scale(KOPF, KOPF, KOPF).translate(0, 0.6 + 0.02, 0); t.gelenk = kopf(t.gelenk); }
    else if (t.teil === 0 && cy > 0.6) t.geo.translate(0, -0.6, 0).scale(KOPF, KOPF, KOPF).translate(0, 0.6 + 0.02, 0);
    else if (t.teil === 0 && cy > 0.3) t.geo.translate(0, -0.42, 0).scale(BAUCH, 1.04, BAUCH).translate(0, 0.42, 0);
  }
  const geos = teile.map((t) => {
    const g = t.geo;
    const n = g.attributes.position.count;
    g.setAttribute('aTeil', new THREE.BufferAttribute(new Float32Array(n).fill(t.teil), 1));
    g.setAttribute('aGelenk', new THREE.BufferAttribute(new Float32Array(n * 3).map((_, k) => t.gelenk[k % 3]), 3));
    g.setAttribute('aTint', new THREE.BufferAttribute(new Float32Array(n).fill(t.tint), 1));
    g.setAttribute('aVariante', new THREE.BufferAttribute(new Float32Array(n).fill(t.variante), 1));
    return g;
  });
  return mergeGeometries(geos)!;
}

/** Kopf- und Bauchfaktor der Figuren (STIL.md). */
export const KOPF = 1.2, BAUCH = 1.12;

/**
 * Trachtfarbe (Drehbuch 7.1, M11: je Völkchen): halb die Farbe des Völkchens, halb eine der bunten Grundfarben – das Gewimmel bleibt
 * bunt, aber ein Völkchen erkennt man an seinem Farbton.
 */
export function trachtFarbe(ziel: THREE.Color, id: number, voelkchen: string | undefined): THREE.Color {
  ziel.copy(TRACHT[id % TRACHT.length]);
  const v = voelkchen ? VOLK_FARBE.get(voelkchen) : undefined;
  return v ? ziel.lerp(v, 0.55) : ziel;
}
const VOLK_FARBE = new Map(VOELKCHEN.map((v) => [v.id, new THREE.Color(v.tracht)] as [string, THREE.Color]));

const SCHWER_A = WARE.stamm, SCHWER_B = WARE.stein;
const TRACHT = ['#3f6fb5', '#b5463f', '#4f8a4a', '#d0a030', '#7a4fa0', '#3a8a8a', '#e0709a', '#c8642f'].map((c) => new THREE.Color(c));

/** Instanz-Attribute der Figuren: Animation (Phase, Tragen, Laufen) und Mimik (Laune, Geste). */
export const FIGUR_ATTRIBUTE = [{ name: 'aAnim', size: 3 }, { name: 'aMimik', size: 2 }, { name: 'aVar', size: 1 }];
/** Gesichtsvarianten (sechster Wert der Figur-Attribute): 0 Schnauzer, 1 Vollbart, 2 Brille, 3 Frau mit Zöpfen, 4 Alter mit grauem Bart. */
export const VARIANTE = { schnauzer: 0, vollbart: 1, brille: 2, frau: 3, alt: 4 } as const;
/** Variante aus einer Id (fest je Figur): gut die Hälfte Schnauzer, sonst Bart, Brille, Frau, Alter. */
export function variante(id: number): number {
  const v = ((id * 7919) >>> 0) % 9;
  return v < 3 ? 0 : v < 4 ? 1 : v < 5 ? 2 : v < 8 ? 3 : 4;
}

/** Gesten (aMimik.y). */
export const GESTE = { keine: 0, winken: 1, jubeln: 2, schimpfen: 3, kratzen: 4, hand: 5 } as const;

/** Laune des Dorfs für die Gesichter: Feste machen froh, Frieren und Hunger grimmig. */
export function dorfLaune(s: SimSicht): { laune: number; fest: boolean } {
  const d = s.dorf;
  const fest = !!(d.kirmes?.fest || d.fest?.laeuft || d.schuetzen?.fest || (d.grenz?.jfest ?? 0) > 0);
  if (fest) return { laune: 1, fest };
  if (d.friert) return { laune: -1, fest };
  return { laune: 0.35, fest };
}

export function material(): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, flatShading: false });
  mat.onBeforeCompile = (shader) => {
    // Randlicht: ein schmaler, warmer Saum an der Silhouette hebt die Figuren ab (begrenzt auf 1: kein Überstrahlen im Leuchten)
    shader.fragmentShader = shader.fragmentShader.replace('#include <opaque_fragment>', `#include <opaque_fragment>
gl_FragColor.rgb = min(gl_FragColor.rgb + vec3(1.0, 0.9, 0.72) * smoothstep(0.82, 0.97, 1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0)) * 0.14, vec3(1.0));`);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
attribute float aTeil; attribute vec3 aGelenk; attribute float aTint; attribute vec3 aAnim; attribute vec2 aMimik; attribute float aVariante; attribute float aVar;`)
      .replace('#include <color_vertex>', `#include <color_vertex>
#ifdef USE_INSTANCING_COLOR
vColor.xyz = mix(color.xyz, color.xyz * instanceColor.xyz, aTint);
#endif`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
// Gesichtsvariante: nicht passende Teile auf einen Punkt im Kopf zusammenziehen (unsichtbar)
if ((aVariante > 0.5 && abs(aVariante - aVar) > 0.5) || (aVariante < -0.5 && abs(-aVariante - aVar) < 0.5)) transformed = vec3(0.0, 0.7, 0.0);
{
  float sw = sin(aAnim.x) * 0.75 * aAnim.z;
  float ang = 0.0, angZ = 0.0;
  // Mimik und Gesten (M12): aMimik.x Laune −1 (grimmig) … 1 (fröhlich), aMimik.y Geste 0 keine, 1 Winken, 2 Jubeln, 3 Schimpfen, 4 Kopfkratzen,
  // 5 Hand ausgestreckt (M14: Wache, Hand am Maibaum)
  float laune = aMimik.x, geste = aMimik.y, gt = aAnim.x * 5.0;
  bool frei = aAnim.y < 0.01;
  if (aTeil > 0.5 && aTeil < 1.5) ang = sw;
  else if (aTeil > 1.5 && aTeil < 2.5) ang = -sw;
  else if (aTeil > 2.5 && aTeil < 3.5) {
    ang = mix(-sw * 0.9, -2.75 - sw * 0.08, aAnim.y);
    if (frei && abs(geste - 2.0) < 0.5) { ang = -2.85 + 0.18 * sin(gt * 1.3); angZ = -0.4; }
  } else if (aTeil > 3.5 && aTeil < 4.5) {
    ang = mix(sw * 0.9, -2.75 + sw * 0.08, aAnim.y);
    if (frei) {
      if (abs(geste - 1.0) < 0.5) { ang = -0.2; angZ = 2.45 + 0.38 * sin(gt * 1.8); }
      else if (abs(geste - 2.0) < 0.5) { ang = -2.85 + 0.18 * sin(gt * 1.3 + 1.0); angZ = 0.4; }
      else if (abs(geste - 3.0) < 0.5) { ang = -1.55 + 0.35 * sin(gt * 2.4); }
      else if (abs(geste - 4.0) < 0.5) { ang = -2.45; angZ = 0.95 + 0.12 * sin(gt * 2.0); }
      else if (abs(geste - 5.0) < 0.5) { ang = -1.45; angZ = 0.15; }
    }
  }
  if (aTeil > 0.5 && aTeil < 4.5) {
    vec3 pp = transformed - aGelenk;
    float c = cos(ang), s = sin(ang);
    pp = vec3(pp.x, pp.y * c - pp.z * s, pp.y * s + pp.z * c);
    float cz = cos(angZ), sz = sin(angZ);
    pp = vec3(pp.x * cz - pp.y * sz, pp.x * sz + pp.y * cz, pp.z);
    transformed = pp + aGelenk;
  } else if (aTeil > 4.5 && aTeil < 5.5) {
    // Brauen: hoch vor Freude, innen runter vor Ärger
    float innen = 1.0 - clamp(abs(transformed.x) / 0.17, 0.0, 1.0);
    transformed.y += 0.03 * max(laune, 0.0) - 0.06 * max(-laune, 0.0) * innen + 0.012 * max(-laune, 0.0);
  } else if (aTeil > 5.5 && aTeil < 6.5) {
    // Mund: Bogen um die Mundwinkel biegen (1 lacht, 0 Strich, −1 Flunsch); beim Jubeln weit offen
    vec3 pp = transformed - aGelenk;
    float bogen = clamp(laune * 0.9 + 0.2, -1.0, 1.0);
    if (frei && abs(geste - 2.0) < 0.5) { bogen = 1.7; pp.x *= 0.8; }
    pp.y *= bogen;
    transformed = pp + aGelenk;
  } else if (aTeil > 6.5) {
    // Augen: ab und zu blinzeln
    float zu = step(0.965, fract(aAnim.x * 0.11 + aGelenk.x * 3.0 + 0.3));
    vec3 pp = transformed - aGelenk;
    pp.y *= mix(1.0, 0.12, zu);
    transformed = pp + aGelenk;
  }
  // Jubeln: hüpfen
  if (frei && abs(geste - 2.0) < 0.5) transformed.y += abs(sin(gt * 1.3)) * 0.07;
  // Wippen und leichtes Hin-und-Her-Schaukeln beim Laufen
  float roll = sin(aAnim.x) * 0.07 * aAnim.z;
  float cr = cos(roll), sr = sin(roll);
  transformed.xy = vec2(transformed.x * cr - transformed.y * sr, transformed.x * sr + transformed.y * cr);
  transformed.y += abs(sin(aAnim.x)) * 0.05 * aAnim.z;
}`);
  };
  return mat;
}

interface Zustand { phase: number; yaw: number; x: number; z: number; benutzt: number }
/** Abstand in der Warteschlange (Anteil eines Wegstücks zwischen zwei Hexen, etwa eine Körperbreite). */
const SCHLANGE = 0.14;
interface Kante { pts: Pkt[]; i: number; rueck: boolean }

export class Traeger {
  readonly group = new THREE.Group();
  /** Wenn gesetzt: Figuren wachsen mit dem Kameraabstand (Lesbarkeit von weit weg). */
  kamera: THREE.Camera | null = null;
  private figuren: Instanzen;
  private kontakt: Kontaktschatten;
  private waren: Instanzen[] = [];
  private zustand = new Map<Id, Zustand>();
  private kanten = new Map<string, Kante>();
  private kantenSig = '';
  private ex: number;
  private runde = 0;
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private p = new THREE.Vector3();
  private s = new THREE.Vector3();
  private yAchse = new THREE.Vector3(0, 1, 0);
  private farbe = new THREE.Color();
  private wq = new THREE.Quaternion();
  private we = new THREE.Euler();

  constructor(private map: MapData, private grid: HexGrid, private base: number, ex: number) {
    this.ex = ex;
    this.figuren = new Instanzen(this.group, figur(), material(), true, true, FIGUR_ATTRIBUTE, 256);
    this.kontakt = new Kontaktschatten(this.group, 256);
    const matte = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, flatShading: false });
    for (let a = 0; a < WAREN_ANZAHL; a++) this.waren.push(new Instanzen(this.group, warenGeometrie(a), matte, false, true, [], 256));
  }

  setExaggeration(ex: number) {
    this.ex = ex;
  }

  /** Kanten-Nachschlagetabelle aus den Segmenten (nur bei Änderung neu). */
  private baueKanten(sicht: SimSicht) {
    let sig = sicht.tick + ':' + sicht.segmente.length + ':' + this.map.groundRev;
    if (sig === this.kantenSig) return;
    this.kantenSig = sig;
    this.kanten.clear();
    sig = '';
    for (const s of sicht.segmente) {
      const pts = wegPunkte(s.pfad, (h) => this.grid.toWorld(h));
      for (let i = 0; i < s.pfad.length - 1; i++) {
        const a = s.pfad[i], b = s.pfad[i + 1];
        this.kanten.set(`${a.q},${a.r}>${b.q},${b.r}`, { pts, i, rueck: false });
        this.kanten.set(`${b.q},${b.r}>${a.q},${a.r}`, { pts, i, rueck: true });
      }
    }
  }

  private tmpA: Pkt = { x: 0, z: 0 };
  private tmpB: Pkt = { x: 0, z: 0 };

  /** Punkt auf der Strecke von → nach bei Anteil f (0..1), entlang der Wegkurve, wenn bekannt. */
  private ort(von: { q: number; r: number }, nach: { q: number; r: number }, f: number, out: Pkt): Pkt {
    const k = this.kanten.get(`${von.q},${von.r}>${nach.q},${nach.r}`);
    if (k) return kurvenPunkt(k.pts, k.i, k.rueck ? 1 - f : f, out);
    const a = this.grid.toWorld(von), b = this.grid.toWorld(nach);
    out.x = a.x + (b.x - a.x) * f; out.z = a.z + (b.z - a.z) * f;
    return out;
  }

  update(sicht: SimSicht, alpha = 0, dt = 0) {
    this.baueKanten(sicht);
    this.runde++;
    this.figuren.beginne();
    this.kontakt.beginne();
    for (const w of this.waren) w.beginne();
    const { map, base, ex, m, q, p, s, farbe } = this;
    const dl = dorfLaune(sicht);
    // erst alle Plätze, dann das Gedränge auflösen (stehende Träger rücken auseinander und weichen den Meistern aus)
    const plaetze: Platz[] = [], laeuft: boolean[] = [];
    // Wartende am selben Fleck stellen sich hintereinander entlang ihres Wegs auf (Schlange statt Knäuel)
    const schlange = new Map<string, number>(), fs: number[] = [];
    const reihe = [...sicht.traeger.keys()].sort((i, j) => sicht.traeger[i].id - sicht.traeger[j].id);
    for (const i of reihe) {
      const t = sicht.traeger[i];
      let f = Math.min(1, Math.max(0, (t.fortschritt + (t.tut === 'laeuft' ? alpha * t.schritt : 0)) / PROMILLE));
      if (t.tut !== 'laeuft') {
        const h = f < 0.5 ? t.von : t.nach, key = `${h.q},${h.r}`;
        const k = schlange.get(key) ?? 0;
        schlange.set(key, k + 1);
        f = Math.min(1, Math.max(0, f + (f < 0.5 ? 1 : -1) * k * SCHLANGE));
      }
      fs[i] = f;
    }
    for (let ti = 0; ti < sicht.traeger.length; ti++) {
      const t = sicht.traeger[ti];
      const a = this.ort(t.von, t.nach, fs[ti], this.tmpA);
      plaetze.push({ x: a.x, z: a.z, r: TRAEGER_H * 0.55, fest: false });
      laeuft.push(t.tut === 'laeuft');
    }
    entzerren(plaetze, meisterPlaetze, laeuft);
    traegerPlaetze.length = 0;
    for (const p of plaetze) traegerPlaetze.push(p);
    for (let ti = 0; ti < sicht.traeger.length; ti++) {
      const t = sicht.traeger[ti];
      const f = fs[ti];
      const x = plaetze[ti].x, z = plaetze[ti].z;
      // Blickrichtung: Tangente der Kurve
      const f0 = Math.max(0, f - 0.04), f1 = Math.min(1, f + 0.04);
      const p0 = this.ort(t.von, t.nach, f0, this.tmpA), p1 = this.ort(t.von, t.nach, f1, this.tmpB);
      let st = this.zustand.get(t.id);
      if (!st) { st = { phase: (t.id * 1.7) % 6.28, yaw: 0, x, z, benutzt: 0 }; st.yaw = Math.atan2(p1.x - p0.x, p1.z - p0.z); this.zustand.set(t.id, st); }
      st.benutzt = this.runde;
      const dx = p1.x - p0.x, dz = p1.z - p0.z;
      if (Math.hypot(dx, dz) > 1e-3) {
        const ziel = Math.atan2(dx, dz);
        let d = ziel - st.yaw;
        d = Math.atan2(Math.sin(d), Math.cos(d));
        st.yaw += d * Math.min(1, dt * 14 + (dt === 0 ? 1 : 0));
      }
      const lauf = t.tut === 'laeuft';
      const weg = Math.hypot(x - st.x, z - st.z);
      st.x = x; st.z = z;
      if (lauf) st.phase += Math.min(weg, 30) / 13 * Math.PI * 2 * 0.5;
      else st.phase += dt * 1.6;
      const y = (map.heightAt(x, z) - base) * ex;
      const k = this.kamera ? fernFaktor(this.kamera.position.distanceTo(p.set(x, y, z))) : 1;
      const sk = TRAEGER_H * k;
      q.setFromAxisAngle(this.yAchse, st.yaw);
      s.set(sk, sk, sk);
      m.compose(p.set(x, y, z), q, s);
      const trage = t.ware >= 0 ? 1 : 0;
      // Mimik nur fürs eigene Dorf (dessen Lage kennt die Sicht); schwere Last verzieht das Gesicht
      const eigen = t.sp === sicht.ich;
      const schwer = t.ware === SCHWER_A || t.ware === SCHWER_B;
      const laune = eigen ? (schwer && !dl.fest ? Math.min(dl.laune, -0.3) : dl.laune) : 0.2;
      const geste = t.tut === 'uebergibt' ? GESTE.winken : t.tut === 'wartet' ? (eigen && dl.fest ? GESTE.jubeln : t.id % 3 === 0 ? GESTE.kratzen : GESTE.keine) : GESTE.keine;
      this.figuren.fuege(m, trachtFarbe(farbe, t.id, sicht.spieler[t.sp]?.voelkchen), [st.phase, trage, lauf ? 1 : t.tut === 'uebergibt' ? 0.35 : 0.1, laune, geste, variante(t.id)]);
      this.kontakt.setze(x, y, z, 0.32 * sk);
      if (trage && t.ware < WAREN_ANZAHL) {
        // Ware über dem Kopf, wippt mit
        const wip = lauf ? Math.abs(Math.sin(st.phase)) * 0.05 * sk : 0;
        const ws = k * WARE_TRAGEN;
        s.set(ws, ws, ws);
        // M12: die Ware wackelt beim Tragen (schwere mehr) – kippelt seitlich und nach vorn im Schritt
        const wack = lauf ? (schwer ? 0.16 : 0.1) : 0.02;
        this.wq.setFromEuler(this.we.set(Math.sin(st.phase * 2) * wack * 0.5, 0, Math.sin(st.phase) * wack));
        m.compose(p.set(x, y + 1.12 * sk + wip, z), this.wq.premultiply(q), s);
        this.waren[t.ware].fuege(m);
      }
    }
    this.figuren.fertig();
    this.kontakt.fertig();
    for (const w of this.waren) w.fertig();
    if (this.zustand.size > sicht.traeger.length + 16) {
      for (const [id, z] of this.zustand) if (z.benutzt !== this.runde) this.zustand.delete(id);
    }
  }

  /** Zahl der gezeichneten Träger. */
  get anzahl(): number {
    return this.figuren.n;
  }
}
