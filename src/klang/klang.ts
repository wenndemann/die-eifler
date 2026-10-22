// Klang (Drehbuch 7.2, ROADMAP M12): Volksmusik (Akkordeon, Blasmusik, Fiedel), Tusch auf den Festen, Gebrabbel mit Eifeler Klang
// statt Sprecher, singende Betrunkene, Arbeitsgeräusche räumlich um den Blickpunkt, Vögel, Grillen, Wind, Regen und nachts der spukende
// Grenzsteinversetzer. Alles wird im Browser erzeugt (WebAudio), keine Aufnahmen. Nur Darstellung: die Simulation hört nichts.
// Der Ton startet erst nach dem ersten Tipp oder Tastendruck (Regel der Browser).
import klang from '../../data/klang.json';
import { frequenz, laengeAchtel, leseBass, leseMelodie, vokaleVon, type Ton } from './noten';

/** Was gerade zu hören sein soll (aus der Sicht und der Kamera berechnet, jedes Bild). */
export interface KlangLage {
  /** Tageszeit 0..1, Jahreszeit 0..3. */
  tag: number;
  jahreszeit: number;
  regen: number;
  wind: number;
  /** Es wird gefeiert (Kirmes, kleines Fest, Schützenfest): Blasmusik statt Hintergrundmusik. */
  fest: boolean;
  /** Arbeitende Gebäude nah am Blickpunkt: Typ, Links-rechts (−1..1), Nähe (0..1). */
  arbeit: { typ: string; id: number; pan: number; naehe: number }[];
  /** Betrunkene Boten nah am Blickpunkt. */
  betrunken: { pan: number; naehe: number }[];
  /** Kamera nah dran (0 weit … 1 ganz nah): Geräusche lauter, Musik etwas leiser. */
  nah: number;
  /** Bach, Fluss oder See nah am Blickpunkt (0..1): Plätschern. */
  wasser: number;
  /** M15: versetzte Grenzsteine (Links-rechts, Nähe): nachts spuken dort die Versetzer, alle `spukTakt` Sekunden. */
  spuk?: { pan: number; naehe: number }[];
  spukTakt?: number;
}

type Bus = 'musik' | 'geraeusche' | 'stimmen' | 'natur';

interface Stueck { name: string; instrument: string; takt: number; dreier: boolean; melodie: Ton[]; bass: (number | null)[] }

const STUECKE: Stueck[] = klang.musik.stuecke.map((s) => ({ ...s, melodie: leseMelodie(s.melodie), bass: leseBass(s.bass) }));
const GERAEUSCHE = klang.arbeit.geraeusche as Record<string, { art: string; takt_s: number }>;
const VOKALE = klang.gebrabbel.vokale as unknown as Record<string, [number, number]>;
const VOKAL_LISTE = Object.keys(VOKALE);

export class Klang {
  private ac: AudioContext | null = null;
  private haupt: GainNode | null = null;
  private busse = new Map<Bus, GainNode>();
  private rauschen: AudioBuffer | null = null;
  private windQuelle: { g: GainNode; f: BiquadFilterNode } | null = null;
  private regenQuelle: { g: GainNode } | null = null;
  private bachQuelle: { g: GainNode; f: BiquadFilterNode } | null = null;
  private musikBis = 0;
  private naechstesStueck = 8;
  private stueckNr = 0;
  private festMusik = false;
  private arbeitBis = new Map<number, number>();
  private naturBis = 0;
  private spukBis = 0;
  private singBis = 0;
  private lautMusik = 0.6;
  private lautGeraeusche = 0.8;

  /** Aus, solange der Browser automatisch gesteuert wird (Tests), außer mit #ton=1. */
  constructor(private erlaubt = true) {}

  /** Lautstärken 0..100 aus den Einstellungen. */
  setzeLautstaerke(musik: number, geraeusche: number): void {
    this.lautMusik = Math.max(0, Math.min(1, musik / 100));
    this.lautGeraeusche = Math.max(0, Math.min(1, geraeusche / 100));
    this.busLautstaerken();
  }

  /** Beim ersten Tipp: AudioContext anlegen (oder nach dem Pausieren des Tabs wieder wecken). */
  wecke(): void {
    if (!this.erlaubt) return;
    if (this.ac) { if (this.ac.state === 'suspended') void this.ac.resume(); return; }
    const AC = (globalThis as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }).AudioContext
      ?? (globalThis as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ac = new AC();
    this.ac = ac;
    this.haupt = ac.createGain();
    // sanfter Begrenzer gegen Übersteuern, wenn viel auf einmal klingt
    const komp = ac.createDynamicsCompressor();
    komp.threshold.value = -14; komp.ratio.value = 4;
    this.haupt.connect(komp).connect(ac.destination);
    for (const b of ['musik', 'geraeusche', 'stimmen', 'natur'] as Bus[]) {
      const g = ac.createGain();
      g.connect(this.haupt);
      this.busse.set(b, g);
    }
    this.busLautstaerken();
    const n = ac.sampleRate * 2, buf = ac.createBuffer(1, n, ac.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    this.rauschen = buf;
    // Dauerrauschen für Wind und Regen
    const wind = this.rauschQuelle('lowpass', 380), regen = this.rauschQuelle('highpass', 1400);
    this.windQuelle = wind;
    this.regenQuelle = regen;
    // Bach: Rauschen durch einen schmalen Bandpass, dessen Mitte unruhig wandert (Plätschern)
    const bach = this.rauschQuelle('bandpass', 900);
    bach.f.Q.value = 2.5;
    const lfo = ac.createOscillator(), tiefe = ac.createGain();
    lfo.type = 'triangle'; lfo.frequency.value = 3.3; tiefe.gain.value = 350;
    lfo.connect(tiefe).connect(bach.f.frequency); lfo.start();
    this.bachQuelle = bach;
  }

  get an(): boolean { return !!this.ac && this.ac.state === 'running'; }

  private busLautstaerken(): void {
    if (!this.ac) return;
    const t = this.ac.currentTime, b = klang.busse;
    this.busse.get('musik')?.gain.setTargetAtTime(b.musik * this.lautMusik, t, 0.2);
    for (const [k, v] of [['geraeusche', b.geraeusche], ['stimmen', b.stimmen], ['natur', b.natur]] as const) this.busse.get(k)?.gain.setTargetAtTime(v * this.lautGeraeusche, t, 0.2);
  }

  private rauschQuelle(typ: BiquadFilterType, hz: number): { g: GainNode; f: BiquadFilterNode } {
    const ac = this.ac!, q = ac.createBufferSource();
    q.buffer = this.rauschen; q.loop = true;
    const f = ac.createBiquadFilter(); f.type = typ; f.frequency.value = hz;
    const g = ac.createGain(); g.gain.value = 0;
    q.connect(f).connect(g).connect(this.busse.get('natur')!);
    q.start();
    return { g, f };
  }

  /** Jedes Bild: Musik planen, Wetter, Natur, Arbeit und Betrunkene. */
  update(l: KlangLage): void {
    const ac = this.ac;
    if (!ac || ac.state !== 'running') return;
    const t = ac.currentTime;
    // Wetter
    this.windQuelle?.g.gain.setTargetAtTime(0.25 + l.wind * 0.9 + l.regen * 0.2, t, 1.5);
    this.windQuelle?.f.frequency.setTargetAtTime(300 + l.wind * 500, t, 2);
    this.regenQuelle?.g.gain.setTargetAtTime(l.regen * 0.7, t, 1.5);
    this.bachQuelle?.g.gain.setTargetAtTime(l.wasser * (0.25 + 0.5 * l.nah), t, 1.2);
    // Musik: Fest → Blasmusik ohne Pause, sonst ein Stück, dann Pause
    if (l.fest !== this.festMusik) { this.festMusik = l.fest; if (l.fest) this.naechstesStueck = t; }
    if (t >= this.musikBis && t >= this.naechstesStueck) {
      const s = l.fest ? STUECKE.find((x) => x.instrument === 'blech') ?? STUECKE[0] : STUECKE[this.stueckNr++ % STUECKE.length];
      const dauer = this.spiele(s, t + 0.1, l.fest ? 1 : 0.8 - 0.25 * l.nah);
      this.musikBis = t + 0.1 + dauer;
      const [p0, p1] = klang.musik.pause_s;
      this.naechstesStueck = this.musikBis + (l.fest ? 0.6 : p0 + Math.random() * (p1 - p0));
    }
    // Natur: Vögel am Tag (nicht im Winter, nicht im Regen), Grillen in Sommernächten, nachts Spuk
    const tag = l.tag > 0.24 && l.tag < 0.8;
    if (t >= this.naturBis) {
      if (tag && l.jahreszeit !== 3 && l.regen < 0.5) this.vogel(Math.random() * 1.6 - 0.8);
      else if (!tag && l.jahreszeit === 1 && klang.natur.grillen_nachts) this.grillen(Math.random() * 1.6 - 0.8);
      this.naturBis = t + (60 / klang.natur.voegel_je_min) * (0.5 + Math.random());
    }
    if (!tag && t >= this.spukBis) {
      // M15: wo Grenzsteine versetzt wurden, spukt es regelmäßig (der nächste Stein), sonst nur selten irgendwo
      const st = l.spuk?.[0];
      if (st) { this.spuk(st.pan, 0.4 + 0.6 * st.naehe); this.spukBis = t + (l.spukTakt ?? 25) * (0.8 + Math.random() * 0.4); }
      else { if (Math.random() < klang.natur.spuk_je_min / 6) this.spuk(Math.random() * 1.4 - 0.7); this.spukBis = t + 10; }
    }
    // Arbeit: je Gebäude im eigenen Takt (leicht verschoben, sonst klopft alles gleichzeitig)
    for (const a of l.arbeit) {
      const g = GERAEUSCHE[a.typ];
      if (!g) continue;
      const bis = this.arbeitBis.get(a.id) ?? t + Math.random() * g.takt_s;
      if (t >= bis) {
        this.arbeitsgeraeusch(g.art, a.pan, a.naehe * (0.4 + 0.6 * l.nah));
        this.arbeitBis.set(a.id, t + g.takt_s * (0.85 + Math.random() * 0.3));
      } else if (!this.arbeitBis.has(a.id)) this.arbeitBis.set(a.id, bis);
    }
    if (this.arbeitBis.size > 200) this.arbeitBis.clear();
    // Betrunkene singen, mal schief
    if (l.betrunken.length && t >= this.singBis) {
      const b = l.betrunken[Math.floor(Math.random() * l.betrunken.length)];
      this.singBis = t + this.singe(b.pan, b.naehe) + 2 + Math.random() * 4;
    }
  }

  // ---------------------------------------------------------------- Instrumente

  private panner(pan: number, bus: Bus, laut: number): GainNode {
    const ac = this.ac!, g = ac.createGain(), p = ac.createStereoPanner();
    g.gain.value = laut;
    p.pan.value = Math.max(-1, Math.min(1, pan));
    g.connect(p).connect(this.busse.get(bus)!);
    return g;
  }

  /** Ein Ton des Instruments ab Zeit t (s) für d Sekunden in den Ausgang. */
  private ton(instr: string, hz: number, t: number, d: number, aus: AudioNode, laut = 1): void {
    const ac = this.ac!;
    const g = ac.createGain();
    const f = ac.createBiquadFilter();
    f.type = 'lowpass';
    const oscs: OscillatorNode[] = [];
    const neu = (typ: OscillatorType, verstimmt: number) => { const o = ac.createOscillator(); o.type = typ; o.frequency.value = hz; o.detune.value = verstimmt; o.connect(f); oscs.push(o); return o; };
    let an = 0.02, ab = 0.08, spitze = 0.18 * laut;
    if (instr === 'akkordeon') {
      neu('sawtooth', -7); neu('sawtooth', 7); neu('square', 0);
      f.frequency.value = 2400; spitze *= 0.55;
      // Balg-Tremolo
      const lfo = ac.createOscillator(), tiefe = ac.createGain();
      lfo.frequency.value = 5.5; tiefe.gain.value = spitze * 0.18;
      lfo.connect(tiefe).connect(g.gain); lfo.start(t); lfo.stop(t + d + ab + 0.05);
    } else if (instr === 'blech') {
      neu('sawtooth', 0); neu('sawtooth', 4);
      f.frequency.setValueAtTime(500, t); f.frequency.linearRampToValueAtTime(2600, t + 0.05); f.frequency.setTargetAtTime(1300, t + 0.06, 0.15);
      an = 0.035; spitze *= 0.6;
    } else if (instr === 'fiedel') {
      const o = neu('sawtooth', 0);
      f.frequency.value = 3200;
      const lfo = ac.createOscillator(), tiefe = ac.createGain();
      lfo.frequency.value = 5.8; tiefe.gain.setValueAtTime(0, t); tiefe.gain.linearRampToValueAtTime(hz * 0.006, t + Math.min(0.25, d));
      lfo.connect(tiefe).connect(o.frequency); lfo.start(t); lfo.stop(t + d + ab + 0.05);
      an = 0.06; spitze *= 0.5;
    } else if (instr === 'tuba') {
      neu('sawtooth', 0); f.frequency.value = 420; an = 0.03; spitze *= 0.9;
    } else {
      neu('triangle', 0); f.frequency.value = 900; spitze *= 1.1;
    }
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(spitze, t + an);
    g.gain.setValueAtTime(spitze, t + Math.max(an, d - 0.02));
    g.gain.linearRampToValueAtTime(0, t + d + ab);
    f.connect(g).connect(aus);
    for (const o of oscs) { o.start(t); o.stop(t + d + ab + 0.05); }
  }

  /** Ein Stück ab Zeit t; Rückgabe: Dauer in Sekunden. */
  private spiele(s: Stueck, t: number, laut: number): number {
    const achtel = 30 / s.takt;
    const aus = this.panner(0, 'musik', laut);
    let z = t;
    for (const n of s.melodie) {
      if (n.hz) this.ton(s.instrument, n.hz, z, n.achtel * achtel * 0.92, aus);
      z += n.achtel * achtel;
    }
    const laenge = laengeAchtel(s.melodie) * achtel;
    const bassInstr = s.instrument === 'blech' ? 'tuba' : 'bass';
    for (let i = 0, zb = t; zb < t + laenge - 0.01; i++, zb += achtel * 2) {
      const hz = s.bass[i % s.bass.length];
      // Umtata: im Dreier der erste Schlag tief, die beiden anderen als Nachschlag kurz
      const kurz = s.dreier ? i % 3 !== 0 : i % 2 === 1;
      if (hz) this.ton(bassInstr, kurz && !s.dreier ? hz * 2 : hz, zb, achtel * (kurz ? 0.8 : 1.6), aus, kurz ? 0.6 : 0.9);
    }
    return laenge;
  }

  /** Tusch (Ta-ta-taaa) auf Kirmes, Fest, neuer Stufe und Schützenkönig. */
  tusch(): void {
    if (!this.an) return;
    const t = this.ac!.currentTime + 0.05, achtel = 30 / klang.tusch.takt;
    const aus = this.panner(0, 'musik', 1.3);
    let z = t;
    for (const l of klang.tusch.folge) {
      for (const n of klang.tusch.akkord) { const hz = frequenz(n); if (hz) this.ton('blech', hz, z, l * achtel * 0.9, aus, 0.7); }
      z += l * achtel;
    }
    // Pauke dazu
    this.trommel(t, 0.9); this.trommel(t + 2 * achtel, 1.2);
  }

  private trommel(t: number, laut: number): void {
    const ac = this.ac!, o = ac.createOscillator(), g = ac.createGain();
    o.frequency.setValueAtTime(110, t); o.frequency.exponentialRampToValueAtTime(55, t + 0.3);
    g.gain.setValueAtTime(0.5 * laut, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
    o.connect(g).connect(this.busse.get('musik')!);
    o.start(t); o.stop(t + 0.55);
  }

  // ---------------------------------------------------------------- Stimmen

  /** Eine Stimme mit Formanten: Silben aus Vokalen, Grundton hz; Rückgabe Dauer. */
  private stimme(vokale: string[], hz: number, t: number, silbe: number, aus: AudioNode, laut: number, singen = false): number {
    const ac = this.ac!;
    const o = ac.createOscillator(); o.type = 'sawtooth';
    const f1 = ac.createBiquadFilter(), f2 = ac.createBiquadFilter();
    f1.type = 'bandpass'; f2.type = 'bandpass'; f1.Q.value = 7; f2.Q.value = 9;
    const g = ac.createGain(); g.gain.value = 0;
    o.connect(f1); o.connect(f2); f1.connect(g); f2.connect(g); g.connect(aus);
    let z = t;
    vokale.forEach((v, i) => {
      const [a, b] = VOKALE[v] ?? VOKALE.a;
      f1.frequency.setTargetAtTime(a, z, 0.02); f2.frequency.setTargetAtTime(b, z, 0.02);
      // Tonfall: Fragen gehen hoch, Aussagen runter; beim Singen eine kleine Melodie
      const h = singen ? hz * Math.pow(2, [0, 4, 7, 4, 2, 0, -1, 0][i % 8] / 12) * (1 + (Math.random() - 0.5) * 0.06)
        : hz * (1 + 0.25 * Math.sin(i * 1.7) - (i / vokale.length) * 0.2);
      o.frequency.setTargetAtTime(h, z, singen ? 0.04 : 0.03);
      const d = silbe * (0.75 + Math.random() * 0.5);
      g.gain.setTargetAtTime(laut, z, 0.015);
      g.gain.setTargetAtTime(0.0001, z + d * 0.75, 0.02);
      // Konsonant: kurzes Rauschen am Silbenanfang
      if (!singen && this.rauschen && Math.random() < 0.7) {
        const q = ac.createBufferSource(), qg = ac.createGain(), qf = ac.createBiquadFilter();
        q.buffer = this.rauschen; qf.type = 'highpass'; qf.frequency.value = 2500;
        qg.gain.setValueAtTime(laut * 0.35, z); qg.gain.exponentialRampToValueAtTime(0.001, z + 0.04);
        q.connect(qf).connect(qg).connect(aus); q.start(z, Math.random()); q.stop(z + 0.05);
      }
      z += d;
    });
    o.start(t); o.stop(z + 0.1);
    return z - t;
  }

  /**
   * Gebrabbel der Erzählfigur zu einer Meldung (statt Sprecher): ein paar Eifeler Silben, Stimmlage aus dem Namen der Figur.
   * `wie` 0..1 wählt die Stimmlage (hoch/tief), stabil je Figur.
   */
  brabbel(wie: number, laenge = 1): void {
    if (!this.an) return;
    const [s0, s1] = klang.gebrabbel.silben, [h0, h1] = klang.gebrabbel.stimme_hz;
    const n = Math.round(s0 + (s1 - s0) * Math.min(1, laenge) * (0.6 + Math.random() * 0.4));
    const v: string[] = [];
    while (v.length < n) v.push(...vokaleVon(klang.gebrabbel.worte[Math.floor(Math.random() * klang.gebrabbel.worte.length)], VOKAL_LISTE));
    this.stimme(v.slice(0, n), h0 + (h1 - h0) * wie, this.ac!.currentTime + 0.05, 0.13, this.panner(0, 'stimmen', 1), 0.5);
  }

  private singe(pan: number, naehe: number): number {
    const v = ['a', 'a', 'a', 'o', 'a', 'e', 'a', 'a'];
    return this.stimme(v, 150 + Math.random() * 40, this.ac!.currentTime + 0.05, 0.32, this.panner(pan, 'stimmen', naehe), 0.4, true);
  }

  // ---------------------------------------------------------------- Geräusche

  private knall(t: number, aus: AudioNode, typ: BiquadFilterType, hz: number, d: number, laut: number, q = 1): void {
    const ac = this.ac!, s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
    s.buffer = this.rauschen; f.type = typ; f.frequency.value = hz; f.Q.value = q;
    g.gain.setValueAtTime(laut, t); g.gain.exponentialRampToValueAtTime(0.001, t + d);
    s.connect(f).connect(g).connect(aus); s.start(t, Math.random()); s.stop(t + d + 0.02);
  }

  private sinus(t: number, aus: AudioNode, hz: number, hz2: number, d: number, laut: number, typ: OscillatorType = 'sine'): void {
    const ac = this.ac!, o = ac.createOscillator(), g = ac.createGain();
    o.type = typ; o.frequency.setValueAtTime(hz, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, hz2), t + d);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(laut, t + Math.min(0.01, d / 4)); g.gain.exponentialRampToValueAtTime(0.001, t + d);
    o.connect(g).connect(aus); o.start(t); o.stop(t + d + 0.02);
  }

  private arbeitsgeraeusch(art: string, pan: number, laut: number): void {
    if (laut < 0.02) return;
    const t = this.ac!.currentTime + 0.02, aus = this.panner(pan, 'geraeusche', laut);
    switch (art) {
      case 'saege': for (let i = 0; i < 4; i++) this.knall(t + i * 0.24, aus, 'bandpass', i % 2 ? 1500 : 1900, 0.22, 0.5, 2); break;
      case 'axt': this.knall(t, aus, 'lowpass', 1100, 0.12, 0.9); this.sinus(t, aus, 140, 70, 0.15, 0.5); break;
      case 'amboss': for (const [hz, l] of [[1180, 0.4], [2760, 0.25], [4130, 0.15]]) this.sinus(t, aus, hz, hz * 0.99, 0.6, l); this.knall(t, aus, 'highpass', 3000, 0.04, 0.4); break;
      case 'klopfen': this.knall(t, aus, 'bandpass', 2600, 0.06, 0.8, 3); this.knall(t + 0.18, aus, 'bandpass', 2300, 0.05, 0.5, 3); break;
      case 'zischen': this.knall(t, aus, 'highpass', 3200, 1.1, 0.25); break;
      case 'blubbern': for (let i = 0; i < 4; i++) this.sinus(t + i * 0.13 + Math.random() * 0.05, aus, 280 + Math.random() * 200, 600, 0.07, 0.25); break;
      case 'maeh': this.stimme(['ä', 'e'], 310, t, 0.3, aus, 0.35, true); break;
      case 'muh': this.stimme(['u', 'u'], 105, t, 0.55, aus, 0.5, true); break;
      case 'wuff': this.stimme(['o'], 260, t, 0.09, aus, 0.5); this.stimme(['o'], 240, t + 0.22, 0.09, aus, 0.5); break;
      case 'summen': this.sinus(t, aus, 210, 230, 1.2, 0.08, 'sawtooth'); break;
    }
  }

  private vogel(pan: number): void {
    const t = this.ac!.currentTime + 0.02, aus = this.panner(pan, 'natur', 0.5);
    const n = 2 + Math.floor(Math.random() * 4), hz = 2600 + Math.random() * 1600;
    for (let i = 0; i < n; i++) this.sinus(t + i * 0.11, aus, hz * (1 + (i % 2) * 0.12), hz * 1.35, 0.07, 0.18);
  }

  private grillen(pan: number): void {
    const t = this.ac!.currentTime + 0.02, aus = this.panner(pan, 'natur', 0.35);
    for (let i = 0; i < 6; i++) this.sinus(t + i * 0.06, aus, 4400, 4500, 0.04, 0.1);
  }

  /** M15: Spuk sofort (ein Grenzstein wurde versetzt, die Nacht beginnt). */
  spukRuf(pan = 0): void {
    if (this.an) this.spuk(pan, 1);
  }

  /** Der spukende Grenzsteinversetzer: hohles Heulen in der Nacht, mit Echo. */
  private spuk(pan: number, laut = 1): void {
    const ac = this.ac!, t = ac.currentTime + 0.05, aus = this.panner(pan, 'natur', 0.7 * laut);
    const echo = ac.createDelay(1); echo.delayTime.value = 0.33;
    const rueck = ac.createGain(); rueck.gain.value = 0.45;
    echo.connect(rueck).connect(echo); echo.connect(aus);
    const o = ac.createOscillator(), g = ac.createGain(), lfo = ac.createOscillator(), tiefe = ac.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(380, t); o.frequency.linearRampToValueAtTime(640, t + 1.1); o.frequency.linearRampToValueAtTime(330, t + 2.6);
    lfo.frequency.value = 4; tiefe.gain.value = 14; lfo.connect(tiefe).connect(o.frequency);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.16, t + 0.5); g.gain.linearRampToValueAtTime(0, t + 2.8);
    o.connect(g); g.connect(aus); g.connect(echo);
    o.start(t); lfo.start(t); o.stop(t + 2.9); lfo.stop(t + 2.9);
    setTimeout(() => { try { echo.disconnect(); rueck.disconnect(); } catch { /* schon weg */ } }, 6000);
  }
}
