// HTML-Oberfläche über dem Canvas: Ortsnamen, Minimap, Kachel-Info, Einstellungen, Leistungsanzeige.
import * as THREE from 'three';
import type { MapData } from '../map/mapdata';
import { bigHexOutline } from '../welt/hexwelt';
import { GROESSE_NAME, type AusschnittParam } from '../welt/format';

const COVER_MINI = ['#3f6f8c', '#86ad4d', '#c2ae63', '#2f5228', '#8d6b80', '#958a5c', '#8e8a82', '#c9bba3'];

export interface Settings {
  exaggeration: number;
  grid: boolean;
  shadows: boolean;
  trees: boolean;
  perf: boolean;
}

export interface KopfInfo {
  name: string;
  param: AusschnittParam;
  pruefsumme: string;
  geklemmt: boolean;
  onAndere: () => void;
}

export class Hud {
  readonly settings: Settings;
  private labels: { el: HTMLDivElement; x: number; z: number; kind: string }[] = [];
  private labelLayer = el('div', 'labels');
  private info = el('div', 'panel info');
  private perf = el('div', 'panel perf');
  private mini: HTMLCanvasElement;
  private miniBg: HTMLCanvasElement;
  private miniScale: number;
  onSettings: (s: Settings) => void = () => {};
  onMinimap: (x: number, z: number) => void = () => {};

  constructor(root: HTMLElement, private map: MapData, kopf: KopfInfo) {
    this.settings = loadSettings(map.info.exaggeration);

    // Kopfleiste
    const top = el('div', 'topbar');
    const kurz = kopf.pruefsumme.slice(0, 8);
    top.innerHTML = `<div class="crest">E</div><div class="title"><b>Die Eifeler</b>` +
      `<span>${kopf.name} · ${GROESSE_NAME[kopf.param.size]}${kopf.geklemmt ? ' · an den Rand gerückt' : ''} · ` +
      `<i class="sum" title="Prüfsumme ${kopf.pruefsumme}\n${kopf.param.version} · Hex ${kopf.param.q}, ${kopf.param.r}">${kurz}</i></span></div>` +
      `<button class="andere" type="button">Andere Karte</button>`;
    top.querySelector('button')!.addEventListener('click', kopf.onAndere);
    root.append(this.labelLayer, top, this.info, this.perf);

    // Ortsnamen
    for (const p of map.info.places) {
      if (!p.imSpielfeld && p.kind !== 'stadt' && p.kind !== 'dorf') continue;
      const d = el('div', `label ${p.kind}`);
      d.textContent = p.name;
      this.labelLayer.append(d);
      this.labels.push({ el: d, x: p.x, z: p.z, kind: p.kind });
    }

    // Minimap
    const box = el('div', 'panel minimap');
    this.miniScale = 280 / Math.max(map.sizeX, map.sizeZ * 0.8); // Pixel je Meter
    this.miniBg = this.renderMinimap();
    this.mini = document.createElement('canvas');
    this.mini.width = this.miniBg.width; this.mini.height = this.miniBg.height;
    box.append(this.mini);
    root.append(box);
    const jump = (e: PointerEvent) => {
      const r = this.mini.getBoundingClientRect();
      this.onMinimap(((e.clientX - r.left) / r.width) * this.mini.width / this.miniScale, ((e.clientY - r.top) / r.height) * this.mini.height / this.miniScale);
    };
    this.mini.addEventListener('pointerdown', (e) => { jump(e); this.mini.setPointerCapture(e.pointerId); });
    this.mini.addEventListener('pointermove', (e) => { if (e.buttons & 1) jump(e); });

    // Einstellungen
    const set = el('div', 'panel settings');
    const touch = matchMedia('(pointer: coarse)').matches;
    if (touch || innerWidth < 700) set.classList.add('collapsed');
    set.innerHTML = `
      <h3>Ansicht</h3>
      <label>Überhöhung <output></output><input type="range" min="1" max="5" step="0.25" data-k="exaggeration"></label>
      <label><input type="checkbox" data-k="grid"> Hex-Raster <kbd>G</kbd></label>
      <label><input type="checkbox" data-k="shadows"> Schatten</label>
      <label><input type="checkbox" data-k="trees"> Wald</label>
      <label><input type="checkbox" data-k="perf"> Leistung <kbd>F3</kbd></label>
      <p class="help">${touch
        ? 'Ein Finger: verschieben · zwei Finger: zoomen und drehen'
        : '<kbd>WASD</kbd> bewegen · <kbd>Q</kbd><kbd>E</kbd> drehen · Rad zoomen · rechte Maustaste ziehen'}</p>`;
    root.append(set);
    set.querySelector('h3')!.addEventListener('click', () => set.classList.toggle('collapsed'));
    const credits = el('div', 'credits');
    credits.textContent = map.info.credits.map((c) => c.split(',')[0]).join(' · ');
    credits.title = map.info.credits.join('\n');
    root.append(credits);

    const out = set.querySelector('output')!;
    const sync = () => {
      set.querySelectorAll<HTMLInputElement>('input').forEach((i) => {
        const k = i.dataset.k as keyof Settings;
        if (i.type === 'checkbox') i.checked = this.settings[k] as boolean;
        else i.value = String(this.settings[k]);
      });
      out.textContent = `${this.settings.exaggeration.toFixed(2)}×`;
      this.perf.style.display = this.settings.perf ? '' : 'none';
    };
    set.querySelectorAll<HTMLInputElement>('input').forEach((i) => {
      i.addEventListener(i.type === 'range' ? 'change' : 'input', () => {
        const k = i.dataset.k as keyof Settings;
        (this.settings as unknown as Record<string, unknown>)[k] = i.type === 'checkbox' ? i.checked : Number(i.value);
        this.changed(sync);
      });
      if (i.type === 'range') i.addEventListener('input', () => { out.textContent = `${Number(i.value).toFixed(2)}×`; });
    });
    addEventListener('keydown', (e) => {
      if (e.code === 'KeyG') { this.settings.grid = !this.settings.grid; this.changed(sync); }
      if (e.code === 'F3') { e.preventDefault(); this.settings.perf = !this.settings.perf; this.changed(sync); }
    });
    sync();
  }

  private changed(sync: () => void) {
    sync();
    try { localStorage.setItem('eifeler.view', JSON.stringify(this.settings)); } catch { /* egal */ }
    this.onSettings(this.settings);
  }

  setInfo(html: string | null) {
    this.info.style.display = html ? '' : 'none';
    if (html) this.info.innerHTML = html;
  }

  setPerf(text: string) {
    if (this.settings.perf) this.perf.textContent = text;
  }

  /** Ortsnamen an die Bildschirmposition setzen. */
  updateLabels(camera: THREE.PerspectiveCamera, yAt: (x: number, z: number) => number, distance: number) {
    const v = new THREE.Vector3();
    const w = innerWidth, h = innerHeight;
    for (const l of this.labels) {
      const show = l.kind === 'stadt' || l.kind === 'gewaesser' ? distance < 15000
        : l.kind === 'dorf' ? distance < 8000 : distance < 4000;
      v.set(l.x, yAt(l.x, l.z) + 60, l.z).project(camera);
      if (!show || v.z > 1 || Math.abs(v.x) > 1.1 || Math.abs(v.y) > 1.1) { l.el.style.display = 'none'; continue; }
      l.el.style.display = '';
      l.el.style.transform = `translate(${((v.x + 1) / 2) * w}px, ${((1 - v.y) / 2) * h}px) translate(-50%, -100%)`;
    }
  }

  /** Kamera-Ausschnitt (Bodenpunkte der Bildschirmecken) auf der Minimap zeichnen. */
  updateMinimap(corners: THREE.Vector3[]) {
    const ctx = this.mini.getContext('2d')!;
    ctx.drawImage(this.miniBg, 0, 0);
    const s = this.miniScale;
    ctx.beginPath();
    corners.forEach((c, i) => (i ? ctx.lineTo(c.x * s, c.z * s) : ctx.moveTo(c.x * s, c.z * s)));
    ctx.closePath();
    ctx.fillStyle = 'rgba(255,240,200,0.12)';
    ctx.fill();
    ctx.strokeStyle = '#ffe2a0';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  private renderMinimap(): HTMLCanvasElement {
    const { cell } = this.map.info;
    const sc = this.miniScale;
    const w = Math.round(this.map.sizeX * sc), h = Math.round(this.map.sizeZ * sc);
    const out = document.createElement('canvas');
    out.width = w; out.height = h;
    const ctx = out.getContext('2d')!;
    const img = ctx.createImageData(w, h);
    const pal = COVER_MINI.map((c) => [1, 3, 5].map((o) => parseInt(c.slice(o, o + 2), 16)));
    const g = this.map.ground;
    const A = this.map.ausschnitt;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = Math.min(this.map.info.width - 1, Math.floor(x / sc / cell)), j = Math.min(this.map.info.height - 1, Math.floor(y / sc / cell));
        const k = j * this.map.info.width + i;
        const r4 = Math.max(1, Math.round(1 / (sc * cell)));
        const dx = (g[this.map.idx(i + r4, j)] - g[this.map.idx(i - r4, j)]) / (2 * r4 * cell) * 3;
        const dz = (g[this.map.idx(i, j + r4)] - g[this.map.idx(i, j - r4)]) / (2 * r4 * cell) * 3;
        const shade = Math.min(1.35, Math.max(0.45, 0.85 + (-dx - dz) * 0.45 / Math.hypot(1, dx, dz)));
        const c = pal[this.map.water[k] > 0 ? 0 : this.map.cover[k] === 7 ? 1 : this.map.cover[k]];
        const o = (y * w + x) * 4;
        img.data[o] = Math.min(255, c[0] * shade);
        img.data[o + 1] = Math.min(255, c[1] * shade);
        img.data[o + 2] = Math.min(255, c[2] * shade);
        img.data[o + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    // Kulisse abdunkeln: alles außerhalb des Spielfeld-Hex
    const ring = bigHexOutline(A.param.q, A.param.r, A.radius).map((p) => ({ x: (p.x - A.originX) * sc, z: (p.z - A.originZ) * sc }));
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, w, h);
    ring.forEach((p, i) => (i ? ctx.lineTo(p.x, p.z) : ctx.moveTo(p.x, p.z)));
    ctx.closePath();
    ctx.fillStyle = 'rgba(70,78,86,0.55)';
    ctx.fill('evenodd');
    ctx.restore();
    ctx.beginPath();
    ring.forEach((p, i) => (i ? ctx.lineTo(p.x, p.z) : ctx.moveTo(p.x, p.z)));
    ctx.closePath();
    ctx.strokeStyle = 'rgba(243,190,80,0.9)';
    ctx.lineWidth = 1.2;
    ctx.stroke();
    return out;
  }
}

function el(tag: string, cls: string) {
  const d = document.createElement(tag) as HTMLDivElement;
  d.className = cls;
  return d;
}

function loadSettings(ex: number): Settings {
  const def: Settings = { exaggeration: ex, grid: false, shadows: !matchMedia('(pointer: coarse)').matches, trees: true, perf: false };
  try {
    return { ...def, ...JSON.parse(localStorage.getItem('eifeler.view') ?? '{}') };
  } catch {
    return def;
  }
}
