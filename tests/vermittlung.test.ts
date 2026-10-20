// M6: Vermittlungs-Server (server/vermittlung.mjs) – Raum, Einladungscode, Wiederkommen mit Token, Startbedingung, Weiterleitung,
// Relais-Zugangsdaten und neuer Taktgeber.
import { createHmac } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';
// @ts-expect-error reines JavaScript ohne Typen
import { erzeugeServer } from '../server/vermittlung.mjs';

type N = Record<string, any>;
let server: any = null;
let uhr = 1_000_000;

async function starte(env: Record<string, string> = {}) {
  server = erzeugeServer({ env: { TURN_URLS: '', TURN_SECRET: '', ...env }, jetzt: () => uhr, pruefMs: 1e9 });
  await new Promise<void>((ok) => server.http.listen(0, '127.0.0.1', ok));
  return `ws://127.0.0.1:${server.http.address().port}/vermittlung`;
}
afterEach(async () => { await server?.schliessen(); server = null; });

/** Client mit Posteingang: warte(typ) liefert die nächste Nachricht dieses Typs. */
async function client(url: string) {
  const ws = new WebSocket(url);
  const ein: N[] = [];
  const warter: { typ: string; ok: (n: N) => void }[] = [];
  ws.on('message', (d) => {
    const n = JSON.parse(d.toString());
    const i = warter.findIndex((w) => w.typ === n.typ);
    if (i >= 0) warter.splice(i, 1)[0].ok(n); else ein.push(n);
  });
  await new Promise((ok) => ws.once('open', ok));
  return {
    ws,
    sende: (n: N) => ws.send(JSON.stringify(n)),
    warte: (typ: string) => new Promise<N>((ok, err) => {
      const i = ein.findIndex((n) => n.typ === typ);
      if (i >= 0) { ok(ein.splice(i, 1)[0]); return; }
      warter.push({ typ, ok });
      setTimeout(() => err(new Error(`keine Nachricht ${typ}`)), 2000);
    }),
    leeren: () => { ein.length = 0; },
    zu: () => new Promise((ok) => { ws.once('close', ok); ws.close(); }),
  };
}

describe('Vermittlungs-Server', () => {
  it('Raum anlegen, mit Code beitreten, Namen sehen, Signale weiterleiten', async () => {
    const url = await starte();
    const a = await client(url);
    a.sende({ typ: 'anlegen', name: 'Mechthild' });
    const ra = await a.warte('raum');
    expect(ra.code).toMatch(/^[A-Z2-9]{6}$/);
    expect(ra.du).toBe(0);
    const b = await client(url);
    b.sende({ typ: 'beitreten', code: ra.code.toLowerCase(), name: '  Pitter <b>  ' });
    const rb = await b.warte('raum');
    expect(rb.du).toBe(1);
    expect(rb.raum.spieler.map((s: N) => s.name)).toEqual(['Mechthild', 'Pitter b']);
    let z = await a.warte('zustand');
    while (z.raum.spieler.length < 2) z = await a.warte('zustand');
    expect(z.raum.spieler[1]).toMatchObject({ name: 'Pitter b', da: true });
    a.sende({ typ: 'signal', an: 1, daten: { sdp: 'x' } });
    expect(await b.warte('signal')).toEqual({ typ: 'signal', von: 0, daten: { sdp: 'x' } });
  });

  it('Start erst, wenn alle da sind und die Karten-Prüfsumme gleich ist; danach kein Fremder mehr', async () => {
    const url = await starte();
    const a = await client(url), b = await client(url), c = await client(url);
    a.sende({ typ: 'anlegen', name: 'A' });
    const { code } = await a.warte('raum');
    b.sende({ typ: 'beitreten', code, name: 'B' }); await b.warte('raum');
    c.sende({ typ: 'beitreten', code, name: 'C' }); await c.warte('raum');
    c.sende({ typ: 'verlassen' });
    a.sende({ typ: 'einstellungen', daten: { q: 1 }, neueKarte: true });
    b.sende({ typ: 'start' }); // nur der Gastgeber
    a.sende({ typ: 'start' });
    expect((await a.warte('fehler')).text).toMatch(/Prüfsumme/);
    a.sende({ typ: 'pruefsumme', wert: 'abc' });
    b.sende({ typ: 'pruefsumme', wert: 'abd' });
    await new Promise((ok) => setTimeout(ok, 50));
    a.sende({ typ: 'start' });
    expect((await a.warte('fehler')).text).toMatch(/Prüfsumme/);
    b.sende({ typ: 'pruefsumme', wert: 'abc' });
    await new Promise((ok) => setTimeout(ok, 50));
    a.sende({ typ: 'start' });
    const s = await b.warte('start');
    expect(s.du).toBe(1);
    expect(s.raum).toMatchObject({ gestartet: true, gastgeber: 0, taktgeber: 0, einstellungen: { q: 1 } });
    expect(s.raum.spieler.length).toBe(2);
    const d = await client(url);
    d.sende({ typ: 'beitreten', code, name: 'D' });
    expect((await d.warte('fehler')).text).toMatch(/läuft schon/);
  });

  it('Wiederkommen mit Token auf denselben Platz; neuer Taktgeber, wenn der alte 5 Minuten fehlt', async () => {
    const url = await starte();
    const a = await client(url), b = await client(url), c = await client(url);
    a.sende({ typ: 'anlegen', name: 'A' });
    const { code } = await a.warte('raum');
    b.sende({ typ: 'beitreten', code, name: 'B' });
    const rb = await b.warte('raum');
    c.sende({ typ: 'beitreten', code, name: 'C' }); await c.warte('raum');
    for (const x of [a, b, c]) x.sende({ typ: 'pruefsumme', wert: 'k' });
    await new Promise((ok) => setTimeout(ok, 50));
    a.sende({ typ: 'start' });
    await b.warte('start');
    // B lädt neu
    await b.zu();
    const b2 = await client(url);
    b2.sende({ typ: 'beitreten', code, token: rb.token });
    const r2 = await b2.warte('raum');
    expect(r2.du).toBe(1);
    expect(r2.raum.spieler[1]).toMatchObject({ name: 'B', da: true });
    // A (Taktgeber) fällt aus: erst nach 5 Minuten übernimmt der kleinste Platz, der da ist
    await a.zu();
    b2.leeren();
    uhr += 60_000;
    server.aufraeumen();
    setTimeout(() => { uhr += 5 * 60_000; server.aufraeumen(); }, 100);
    let z = await b2.warte('zustand');
    while (z.raum.spieler[0].da) z = await b2.warte('zustand');
    expect(z.raum.taktgeber).toBe(0); // eine Minute weg: noch kein Wechsel
    z = await b2.warte('zustand');
    expect(z.raum.taktgeber).toBe(1);
  });

  it('Relais: kurzlebige coturn-Zugangsdaten (HMAC-SHA1 über Ablaufzeit:Name)', async () => {
    const url = await starte({ TURN_URLS: 'turn:relais.example:3478,turns:relais.example:5349', TURN_SECRET: 'geheim' });
    const a = await client(url);
    a.sende({ typ: 'anlegen', name: 'Mechthild' });
    const { ice } = await a.warte('raum');
    expect(ice[0]).toEqual({ urls: ['stun:relais.example:3478'] });
    const t = ice[1];
    expect(t.urls).toEqual(['turn:relais.example:3478', 'turns:relais.example:5349']);
    expect(t.username).toBe(`${Math.floor(uhr / 1000) + 12 * 3600}:Mechthild`);
    expect(t.credential).toBe(createHmac('sha1', 'geheim').update(t.username).digest('base64'));
  });

  it('unbekannter Raum, voller Raum, Unsinn', async () => {
    const url = await starte();
    const a = await client(url);
    a.sende({ typ: 'beitreten', code: 'ZZZZZZ', name: 'x' });
    expect((await a.warte('fehler')).text).toMatch(/gibt es nicht/);
    a.ws.send('kein json');
    a.sende({ typ: 'anlegen', name: 'A' });
    const { code } = await a.warte('raum');
    const andere = [];
    for (let i = 0; i < 3; i++) { const x = await client(url); x.sende({ typ: 'beitreten', code, name: `S${i}` }); await x.warte('raum'); andere.push(x); }
    const voll = await client(url);
    voll.sende({ typ: 'beitreten', code, name: 'zu viel' });
    expect((await voll.warte('fehler')).text).toMatch(/voll/);
  });
});
