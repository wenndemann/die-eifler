// Vermittlungs-Server für den Mehrspieler (Drehbuch 2.3, 8.3; ROADMAP M6). Klein und ohne Konto: Räume mit Einladungscode,
// Spielername, Startbedingung (alle da, gleiche Karten-Prüfsumme) und Weiterleitung der WebRTC-Verbindungsdaten. Das Spiel selbst
// läuft direkt zwischen den Browsern; der Server sieht nur Lobby und Verbindungsaufbau. Er vergibt kurzlebige Zugangsdaten für
// das Notfall-Relais (coturn, „use-auth-secret“) und bestimmt einen neuen Taktgeber, wenn der alte zu lange fehlt.
//
// Start:  node server/vermittlung.mjs            (oder npm run vermittlung)
// Umgebung:
//   PORT          Port (Standard 8787)
//   TURN_URLS     Relais-Adressen, durch Komma getrennt, z. B. "turn:turn.example.de:3478,turns:turn.example.de:5349"
//   TURN_SECRET   gemeinsames Geheimnis mit coturn (static-auth-secret)
//   STUN_URLS     STUN-Adressen (Standard: die TURN-Hosts als stun:, sonst keine)
//   STATISCH      Ordner mit dem gebauten Spiel (dist/), wird unter / ausgeliefert (optional)
//   WELT_DATEN    Weltdaten, werden unter /welt/ ausgeliefert (optional, wie beim Entwicklungsserver)
import { createHmac, randomBytes } from 'node:crypto';
import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';

const WURZEL = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MP = JSON.parse(readFileSync(join(WURZEL, 'data', 'mehrspieler.json'), 'utf8'));
const SPIELER_MAX = MP.spieler_max;
const NAME_MAX = MP.server.name_max;
const NACHRICHT_MAX = MP.server.nachricht_max_kb * 1024;
const RAUM_LEER_MS = MP.server.raum_leer_min * 60_000;
const TURN_GUELTIG_S = MP.server.turn_gueltig_h * 3600;
const VERWALTER_NACH_MS = MP.verwalter_nach_s * 1000;
/** Codes ohne leicht verwechselbare Zeichen (0/O, 1/I/L). */
const CODE_ZEICHEN = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

/**
 * Raum: Plätze mit Name, Token (zum Wiederkommen), Verbindung und Karten-Prüfsumme. Vor dem Start können Plätze frei werden;
 * beim Start werden sie lückenlos durchnummeriert (Platz = Spieler-Index der Simulation).
 * @typedef {{ name: string, token: string, ws: import('ws').WebSocket | null, pruefsumme: string, wegSeit: number, sitzung: number }} Platz
 * @typedef {{ code: string, plaetze: (Platz | null)[], gastgeber: number, taktgeber: number, gestartet: boolean, einstellungen: unknown, leerSeit: number, start: number }} Raum
 */

export function erzeugeServer(o = {}) {
  const env = { ...process.env, ...o.env };
  const jetzt = o.jetzt ?? (() => Date.now());
  /** @type {Map<string, Raum>} */
  const raeume = new Map();
  const turnUrls = (env.TURN_URLS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  const stunUrls = env.STUN_URLS ? env.STUN_URLS.split(',').map((s) => s.trim()).filter(Boolean)
    : [...new Set(turnUrls.map((u) => u.replace(/^turns?:/, 'stun:').replace(/\?.*$/, '')).filter((u) => !u.endsWith(':5349')))];

  /** ICE-Server für einen Platz: STUN und TURN mit kurzlebigen Zugangsdaten (coturn REST-API, HMAC-SHA1). */
  function iceServer(name) {
    const ice = [];
    if (stunUrls.length) ice.push({ urls: stunUrls });
    if (turnUrls.length && env.TURN_SECRET) {
      const username = `${Math.floor(jetzt() / 1000) + TURN_GUELTIG_S}:${name.replace(/[^A-Za-z0-9]/g, '').slice(0, 16) || 'eifeler'}`;
      const credential = createHmac('sha1', env.TURN_SECRET).update(username).digest('base64');
      ice.push({ urls: turnUrls, username, credential });
    }
    return ice;
  }

  function neuerCode() {
    for (;;) {
      let c = '';
      const b = randomBytes(6);
      for (let i = 0; i < 6; i++) c += CODE_ZEICHEN[b[i] % CODE_ZEICHEN.length];
      if (!raeume.has(c)) return c;
    }
  }

  const sicht = (raum) => ({
    code: raum.code, gastgeber: raum.gastgeber, taktgeber: raum.taktgeber, gestartet: raum.gestartet, einstellungen: raum.einstellungen,
    spieler: raum.plaetze.map((p, platz) => (p ? { platz, name: p.name, da: !!p.ws, sitzung: p.sitzung, pruefsumme: p.pruefsumme } : null)),
  });

  const schicke = (ws, n) => { if (ws && ws.readyState === 1) ws.send(JSON.stringify(n)); };
  const verteile = (raum) => { const s = sicht(raum); for (const p of raum.plaetze) if (p) schicke(p.ws, { typ: 'zustand', raum: s }); };

  function name(x) {
    const n = typeof x === 'string' ? x.replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, NAME_MAX) : '';
    return n || 'Eifeler';
  }

  /** Taktgeber neu, wenn er nach dem Start zu lange fehlt: der kleinste Platz, der da ist (Drehbuch 8.3). */
  function taktgeberPruefen(raum) {
    if (!raum.gestartet) return;
    const t = raum.plaetze[raum.taktgeber];
    if (t && t.ws) return;
    if (t && jetzt() - t.wegSeit < VERWALTER_NACH_MS) return;
    const neu = raum.plaetze.findIndex((p) => p && p.ws);
    if (neu >= 0 && neu !== raum.taktgeber) { raum.taktgeber = neu; verteile(raum); }
  }

  function aufraeumen() {
    for (const [code, raum] of raeume) {
      taktgeberPruefen(raum);
      const leer = raum.plaetze.every((p) => !p || !p.ws);
      if (!leer) raum.leerSeit = 0;
      else if (!raum.leerSeit) raum.leerSeit = jetzt();
      else if (jetzt() - raum.leerSeit > RAUM_LEER_MS) raeume.delete(code);
    }
  }

  function setzeEin(raum, platz, ws, token) {
    const p = raum.plaetze[platz];
    if (p.ws && p.ws !== ws) { schicke(p.ws, { typ: 'fehler', text: 'Dieser Platz wurde in einem anderen Fenster übernommen.' }); p.ws.close(); }
    p.ws = ws; p.wegSeit = 0; p.sitzung = (p.sitzung ?? 0) + 1;
    ws.raum = raum; ws.platz = platz;
    schicke(ws, { typ: 'raum', code: raum.code, du: platz, token, ice: iceServer(p.name), raum: sicht(raum) });
    verteile(raum);
  }

  function nachricht(ws, n) {
    if (!n || typeof n !== 'object' || typeof n.typ !== 'string') return;
    const raum = ws.raum;
    switch (n.typ) {
      case 'anlegen': {
        if (raum) return;
        const token = randomBytes(18).toString('base64url');
        const r = { code: neuerCode(), plaetze: [{ name: name(n.name), token, ws: null, pruefsumme: '', wegSeit: 0, sitzung: 0 }], gastgeber: 0, taktgeber: 0, gestartet: false, einstellungen: null, leerSeit: 0, start: 0 };
        raeume.set(r.code, r);
        setzeEin(r, 0, ws, token);
        return;
      }
      case 'beitreten': {
        if (raum) return;
        const r = raeume.get(String(n.code ?? '').toUpperCase());
        if (!r) { schicke(ws, { typ: 'fehler', text: 'Diesen Raum gibt es nicht (mehr).' }); return; }
        // Wiederkommen mit Token: derselbe Platz
        const alt = typeof n.token === 'string' ? r.plaetze.findIndex((p) => p && p.token === n.token) : -1;
        if (alt >= 0) { if (n.name) r.plaetze[alt].name = name(n.name); setzeEin(r, alt, ws, n.token); return; }
        if (r.gestartet) { schicke(ws, { typ: 'fehler', text: 'Die Partie läuft schon – nur wer dabei war, kommt wieder hinein.' }); return; }
        let platz = r.plaetze.findIndex((p) => !p);
        if (platz < 0) platz = r.plaetze.length;
        if (platz >= SPIELER_MAX) { schicke(ws, { typ: 'fehler', text: `Der Raum ist voll (${SPIELER_MAX} Spieler).` }); return; }
        const token = randomBytes(18).toString('base64url');
        r.plaetze[platz] = { name: name(n.name), token, ws: null, pruefsumme: '', wegSeit: 0, sitzung: 0 };
        setzeEin(r, platz, ws, token);
        return;
      }
      case 'name': if (raum) { raum.plaetze[ws.platz].name = name(n.name); verteile(raum); } return;
      case 'einstellungen':
        if (!raum || ws.platz !== raum.gastgeber || raum.gestartet) return;
        raum.einstellungen = n.daten ?? null;
        // neue Karte: alle melden ihre Prüfsumme neu
        if (n.neueKarte) for (const p of raum.plaetze) if (p) p.pruefsumme = '';
        verteile(raum);
        return;
      case 'pruefsumme':
        if (!raum || typeof n.wert !== 'string') return;
        raum.plaetze[ws.platz].pruefsumme = n.wert.slice(0, 64);
        verteile(raum);
        return;
      case 'verlassen':
        if (!raum || raum.gestartet || ws.platz === raum.gastgeber) return;
        raum.plaetze[ws.platz] = null;
        ws.raum = null;
        verteile(raum);
        return;
      case 'start': {
        if (!raum || ws.platz !== raum.gastgeber || raum.gestartet) return;
        const da = raum.plaetze.filter((p) => p);
        const grund = da.length < 2 ? 'Es braucht mindestens zwei Spieler.'
          : da.some((p) => !p.ws) ? 'Nicht alle Spieler sind verbunden.'
          : da.some((p) => !p.pruefsumme || p.pruefsumme !== da[0].pruefsumme) ? 'Die Kartendaten sind nicht bei allen gleich (Prüfsumme).'
          : '';
        if (grund) { schicke(ws, { typ: 'fehler', text: grund }); return; }
        // lückenlos durchnummerieren: Platz = Spieler in der Simulation
        raum.plaetze = da;
        raum.plaetze.forEach((p, i) => { p.ws.platz = i; });
        raum.gastgeber = raum.taktgeber = raum.plaetze.indexOf(raum.plaetze.find((p) => p.ws === ws));
        raum.gestartet = true;
        raum.start = jetzt();
        for (const [i, p] of raum.plaetze.entries()) schicke(p.ws, { typ: 'start', du: i, raum: sicht(raum) });
        return;
      }
      case 'signal': {
        if (!raum || !Number.isInteger(n.an)) return;
        const ziel = raum.plaetze[n.an];
        if (ziel) schicke(ziel.ws, { typ: 'signal', von: ws.platz, daten: n.daten });
        return;
      }
      case 'ping': schicke(ws, { typ: 'pong', t: n.t }); return;
    }
  }

  function verbunden(ws) {
    ws.raum = null; ws.platz = -1;
    ws.on('message', (daten, binaer) => {
      if (binaer || daten.length > NACHRICHT_MAX) return;
      let n;
      try { n = JSON.parse(daten.toString()); } catch { return; }
      try { nachricht(ws, n); } catch (e) { console.error('Vermittlung:', e); }
    });
    ws.on('close', () => {
      const raum = ws.raum;
      if (!raum) return;
      const p = raum.plaetze[ws.platz];
      if (p && p.ws === ws) { p.ws = null; p.wegSeit = jetzt(); }
      verteile(raum);
    });
  }

  // ------------------------------------------------------------------ HTTP: optional das gebaute Spiel und die Weltdaten
  const TYPEN = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webp': 'image/webp', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
  const statisch = env.STATISCH ? resolve(env.STATISCH) : null;
  const welt = env.WELT_DATEN ? resolve(env.WELT_DATEN) : null;
  function datei(res, basis, rel) {
    const f = join(basis, normalize(decodeURIComponent(rel)).replace(/^([/\\]|\.\.)+/, ''));
    if (!f.startsWith(basis) || !existsSync(f) || !statSync(f).isFile()) return false;
    res.setHeader('Content-Type', TYPEN[extname(f)] ?? 'application/octet-stream');
    createReadStream(f).pipe(res);
    return true;
  }
  const http = createServer((req, res) => {
    const pfad = (req.url ?? '/').split('?')[0];
    if (pfad === '/vermittlung/status') {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ raeume: raeume.size, turn: turnUrls.length > 0 && !!env.TURN_SECRET }));
      return;
    }
    if (welt && pfad.startsWith('/welt/') && datei(res, welt, pfad.slice(6))) return;
    if (statisch && datei(res, statisch, pfad === '/' ? 'index.html' : pfad)) return;
    res.statusCode = 404;
    res.end('nicht gefunden');
  });
  const wss = new WebSocketServer({ server: http, path: '/vermittlung', maxPayload: NACHRICHT_MAX });
  wss.on('connection', verbunden);
  const uhr = setInterval(aufraeumen, o.pruefMs ?? 5000);
  uhr.unref?.();
  return {
    http, wss, raeume, aufraeumen,
    schliessen: () => new Promise((ok) => { clearInterval(uhr); for (const c of wss.clients) c.terminate(); wss.close(); http.close(() => ok()); }),
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT ?? 8787);
  const s = erzeugeServer();
  s.http.listen(port, () => console.log(`Vermittlung läuft auf Port ${port} (ws://…/vermittlung)${process.env.TURN_URLS ? `, Relais: ${process.env.TURN_URLS}` : ', ohne Relais (TURN_URLS/TURN_SECRET fehlen)'}`));
}
