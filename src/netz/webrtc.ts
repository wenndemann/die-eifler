// Verbindung direkt zwischen den Browsern (WebRTC-Datenkanal, zuverlässig und geordnet), jeder mit jedem (höchstens 4 Spieler).
// Den Verbindungsaufbau (Angebot, Antwort, ICE-Kandidaten) leitet der Vermittlungs-Server weiter; klappt kein direkter Weg, nimmt
// WebRTC selbst das Notfall-Relais (TURN) aus den ICE-Servern. Es ruft immer der Spieler mit dem kleineren Platz an.
// Große Nachrichten (der Stand beim Start oder Wiederbeitritt) werden in Stücke geteilt. Für den Testaufbau kann ein schlechtes
// Netz vorgeschaltet werden (Verzögerung, Schwankung, Stau – die Reihenfolge bleibt wie im echten Kanal).
import type { Nachricht } from './partie';

const STUECK = 16_000;
/** So lange darf der Verbindungsaufbau dauern, dann ruft man neu an (auch über das Relais dauert es selten länger). */
const ANRUF_MS = 12_000;

export interface SchlechtesNetz { verzoegerung_ms: number; schwankung_ms: number; stau_prozent: number; stau_ms: number }

interface Peer {
  pc: RTCPeerConnection;
  kanal: RTCDataChannel | null;
  offen: boolean;
  teile: Map<string, string[]>;
  /** Letzte geplante Sendezeit (schlechtes Netz, Reihenfolge erhalten). */
  letzte: number;
  kandidaten: RTCIceCandidateInit[];
}

export class Netz {
  private peers = new Map<number, Peer>();
  /** Zuletzt gesehene Sitzung je Platz (neue Sitzung = der andere hat neu geladen). */
  private sitzungen = new Map<number, number>();
  private nr = 0;
  onNachricht: ((von: number, n: Nachricht) => void) | null = null;
  onVerbindung: ((von: number, da: boolean) => void) | null = null;
  /** Mitschnitt für die Anzeige. */
  gesendet = 0;
  empfangen = 0;

  constructor(
    private readonly ich: number,
    private readonly ice: RTCIceServer[],
    private readonly signal: (an: number, daten: unknown) => void,
    private readonly schlecht: SchlechtesNetz | null = null,
  ) {}

  /**
   * Stand der Lobby: wer ist da (und in welcher Sitzung)? Fehlt einer, wird seine Verbindung geschlossen; ist er (wieder) da oder
   * hat er neu geladen, ruft der mit dem kleineren Platz an.
   */
  anwesend(platz: number, da: boolean, sitzung = 0): void {
    if (platz === this.ich) return;
    const alt = this.sitzungen.get(platz);
    this.sitzungen.set(platz, sitzung);
    if (!da || (alt !== undefined && alt !== sitzung)) { if (this.peers.has(platz)) this.schliesse(platz); if (!da) return; }
    if (this.peers.has(platz)) return;
    if (this.ich < platz) this.anrufen(platz);
    // der andere ruft an; wer gerade erst dazukommt (oder neu geladen hat), bittet darum – ein früheres Angebot kam vielleicht zu früh
    else if (alt === undefined || alt !== sitzung) this.signal(platz, { art: 'ruf_mich' });
  }

  istOffen(platz: number): boolean { return !!this.peers.get(platz)?.offen; }

  senden(an: number, n: Nachricht): void {
    const p = this.peers.get(an);
    if (!p || !p.offen || !p.kanal) return;
    const text = JSON.stringify(n);
    const stuecke: string[] = [];
    if (text.length <= STUECK) stuecke.push('G' + text);
    else {
      const id = `${this.ich}.${++this.nr}`, anzahl = Math.ceil(text.length / STUECK);
      for (let i = 0; i < anzahl; i++) stuecke.push(`T${id}:${i}:${anzahl}:${text.slice(i * STUECK, (i + 1) * STUECK)}`);
    }
    this.gesendet++;
    const k = p.kanal;
    const raus = () => { for (const s of stuecke) if (k.readyState === 'open') k.send(s); };
    if (!this.schlecht) { raus(); return; }
    const a = this.schlecht;
    let d = a.verzoegerung_ms + Math.random() * a.schwankung_ms;
    if (Math.random() * 100 < a.stau_prozent) d += a.stau_ms;
    const zeit = Math.max(performance.now() + d, p.letzte);
    p.letzte = zeit;
    setTimeout(raus, zeit - performance.now());
  }

  /** Signal vom Vermittlungs-Server (Angebot, Antwort oder ICE-Kandidat). */
  async signalEmpfangen(von: number, d: { art: string; sdp?: string; kandidat?: RTCIceCandidateInit }): Promise<void> {
    if (!d || typeof d !== 'object') return;
    if (d.art === 'ruf_mich') {
      if (this.ich < von && !this.peers.get(von)?.offen) { if (this.peers.has(von)) this.schliesse(von); this.anrufen(von); }
      return;
    }
    if (d.art === 'angebot' && d.sdp) {
      // neues Angebot (auch nach Neuladen des anderen): alte Verbindung weg
      if (this.peers.has(von)) this.schliesse(von);
      const p = this.neuerPeer(von);
      await p.pc.setRemoteDescription({ type: 'offer', sdp: d.sdp });
      for (const c of p.kandidaten.splice(0)) await p.pc.addIceCandidate(c).catch(() => undefined);
      const antwort = await p.pc.createAnswer();
      await p.pc.setLocalDescription(antwort);
      this.signal(von, { art: 'antwort', sdp: antwort.sdp });
    } else if (d.art === 'antwort' && d.sdp) {
      const p = this.peers.get(von);
      if (p && p.pc.signalingState === 'have-local-offer') {
        await p.pc.setRemoteDescription({ type: 'answer', sdp: d.sdp });
        for (const c of p.kandidaten.splice(0)) await p.pc.addIceCandidate(c).catch(() => undefined);
      }
    } else if (d.art === 'kandidat' && d.kandidat) {
      const p = this.peers.get(von);
      if (!p) return;
      if (p.pc.remoteDescription) await p.pc.addIceCandidate(d.kandidat).catch(() => undefined);
      else p.kandidaten.push(d.kandidat);
    }
  }

  schliesseAlle(): void { for (const platz of [...this.peers.keys()]) this.schliesse(platz); }

  private neuerPeer(platz: number): Peer {
    const pc = new RTCPeerConnection({ iceServers: this.ice });
    const p: Peer = { pc, kanal: null, offen: false, teile: new Map(), letzte: 0, kandidaten: [] };
    this.peers.set(platz, p);
    pc.onicecandidate = (e) => { if (e.candidate) this.signal(platz, { art: 'kandidat', kandidat: e.candidate.toJSON() }); };
    pc.ondatachannel = (e) => this.kanalDran(platz, p, e.channel);
    pc.onconnectionstatechange = () => {
      if (this.peers.get(platz) !== p) return;
      if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        this.schliesse(platz);
        // wer anruft, versucht es nach kurzer Zeit noch einmal
        if (this.ich < platz) setTimeout(() => { if (!this.peers.has(platz)) this.anrufen(platz); }, 2000);
      }
    };
    return p;
  }

  /** Anrufen; steht der Kanal nach ANRUF_MS nicht, noch einmal (das Angebot kann verloren gegangen sein). */
  private anrufen(platz: number): void {
    const p = this.neuerPeer(platz);
    this.kanalDran(platz, p, p.pc.createDataChannel('spiel', { ordered: true }));
    void (async () => {
      const angebot = await p.pc.createOffer();
      await p.pc.setLocalDescription(angebot);
      this.signal(platz, { art: 'angebot', sdp: angebot.sdp });
    })().catch(() => this.schliesse(platz));
    setTimeout(() => {
      if (this.peers.get(platz) !== p || p.offen || this.sitzungen.get(platz) === undefined) return;
      this.schliesse(platz);
      this.anrufen(platz);
    }, ANRUF_MS);
  }

  private kanalDran(platz: number, p: Peer, k: RTCDataChannel): void {
    p.kanal = k;
    k.onopen = () => { if (this.peers.get(platz) !== p) return; p.offen = true; this.onVerbindung?.(platz, true); };
    k.onclose = () => { if (this.peers.get(platz) === p) this.schliesse(platz); };
    k.onmessage = (e) => {
      const s = String(e.data);
      let text: string | null = null;
      if (s[0] === 'G') text = s.slice(1);
      else if (s[0] === 'T') {
        const m = /^T([^:]+):(\d+):(\d+):/.exec(s);
        if (!m) return;
        const [kopf, id, i, n] = m;
        const liste = p.teile.get(id) ?? new Array<string>(Number(n)).fill('');
        liste[Number(i)] = s.slice(kopf.length);
        p.teile.set(id, liste);
        if (Number(i) !== Number(n) - 1) return;
        p.teile.delete(id);
        text = liste.join('');
      }
      if (text === null) return;
      let n: Nachricht;
      try { n = JSON.parse(text) as Nachricht; } catch { return; }
      this.empfangen++;
      this.onNachricht?.(platz, n);
    };
  }

  private schliesse(platz: number): void {
    const p = this.peers.get(platz);
    if (!p) return;
    this.peers.delete(platz);
    const war = p.offen;
    p.offen = false;
    try { p.kanal?.close(); } catch { /* schon zu */ }
    try { p.pc.close(); } catch { /* schon zu */ }
    if (war) this.onVerbindung?.(platz, false);
  }
}
