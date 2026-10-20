// Testaufbau M6 im echten Browser: zwei Fenster (Browser-Kontexte) auf einem Rechner, Vermittlungs-Server lokal, WebRTC direkt
// zwischen den Fenstern, simuliertes schlechtes Netz (#…&netz=schlecht). Ablauf: Gastgeber eröffnet einen Raum, Gast kommt über
// den Einladungslink, beide laden die Karte (gleiche Prüfsumme), Start, beide bauen, Tempo 3, der Gast lädt die Seite neu und muss
// in unter 30 Sekunden wieder drin sein, Pause, Prüfsummen gleich, Speichern. M7: Warenverteilung über das Fenster, Ruhen,
// Statistik und Autosave im Mehrspieler. M8: Lagerregel und Bauleute-Wunsch über das Lagerfenster, Jahreszeit und Wetter bei beiden gleich.
//
// Läuft in npm run test:smoke mit; allein:  node tests/mehrspieler.mjs   (Server und Vite startet es selbst)
import { existsSync, mkdirSync } from 'node:fs';
import { createServer as netServer } from 'node:net';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { erzeugeServer } from '../server/vermittlung.mjs';

const WURZEL = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export const freierPort = () => new Promise((ok, err) => {
  const s = netServer();
  s.once('error', err);
  s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => ok(p)); });
});

/** Vermittlungs-Server auf einem freien Port; setzt VERMITTLUNG_PORT für den Vite-Proxy. */
export async function starteVermittlung() {
  const port = await freierPort();
  const s = erzeugeServer({ env: { TURN_URLS: '', TURN_SECRET: '', STUN_URLS: '' } });
  await new Promise((ok) => s.http.listen(port, '127.0.0.1', ok));
  process.env.VERMITTLUNG_PORT = String(port);
  return { port, schliessen: () => s.schliessen() };
}

/** Im Spiel eines Fensters: ein Gebäude nahe dem eigenen Lager mit Weg zur Lagerfahne bauen. */
function baue(typ) {
  const s = window.eifeler.spiel, sim = s.sim, ich = s.ich, L = s.lagerHex;
  const ab = (a, b) => (Math.abs(a.q - b.q) + Math.abs(a.r - b.r) + Math.abs(a.q - b.q + a.r - b.r)) / 2;
  for (let d = 2; d <= 7; d++) {
    for (let dr = -d; dr <= d; dr++) {
      for (let dq = -d; dq <= d; dq++) {
        const h = { q: L.q + dq, r: L.r + dr };
        if (ab(h, L) !== d || !sim.kannBauen(typ, h.q, h.r, ich)) continue;
        const weg = sim.wegAbschnitt(h, L, [], 12, ich);
        if (!weg) continue;
        s.befehl({ art: 'gebaeude', typ, q: h.q, r: h.r });
        s.befehl({ art: 'weg', pfad: weg });
        return { ...h, ich };
      }
    }
  }
  return null;
}

const laeuft = () => !!(window.eifeler?.spiel && window.eifeler.partie?.sim && !window.eifeler.partie.angehalten);

/**
 * Der Test. `param`: Ausschnitt (version, q, r, size). `browser`: wird hier selbst gestartet (eigene Schalter für WebRTC).
 * Meldet Fehler über fail(), Fortschritt über info().
 */
export async function mehrspielerTest({ basis, param, aus, info, fail, exe }) {
  mkdirSync(aus, { recursive: true });
  const browser = await chromium.launch({
    headless: false, executablePath: exe,
    args: ['--headless=new', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist',
      // Host-Kandidaten als echte IP (sonst .local-Namen, die im Container niemand auflöst)
      '--disable-features=WebRtcHideLocalIpsWithMdns'],
  });
  const seitenfehler = [];
  const fenster = async (wer) => {
    const ctx = await browser.newContext({ viewport: { width: 900, height: 560 }, acceptDownloads: true });
    // zwei Szenen in Software-Grafik sind langsam: niedrige Qualität, ohne Schatten und Bäume
    await ctx.addInitScript(() => { try { localStorage.setItem('eifeler.view', JSON.stringify({ quality: 'niedrig', shadows: false, trees: false })); } catch { /* egal */ } });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => seitenfehler.push(`${wer}: ${e.message}`));
    if (process.env.MP_LOG) page.on('console', (m) => console.log(`[${wer}] ${m.text()}`));
    page.on('console', (m) => { if (m.type() === 'error' && !/favicon|fonts\.g/.test(m.text() + (m.location()?.url ?? ''))) seitenfehler.push(`${wer} console: ${m.text()}`); });
    return page;
  };
  try {
    const host = await fenster('Gastgeber'), gast = await fenster('Gast');
    const p = param;
    // 1. Gastgeber eröffnet einen Raum (Name, dann Lobby mit Einladungslink)
    await host.goto(`${basis}#v=${p.version}&q=${p.q}&r=${p.r}&g=${p.size}&freunde=1&netz=schlecht`);
    await host.waitForSelector('.lobby-name input', { timeout: 120000 });
    await host.fill('.lobby-name input', 'Mechthild');
    await host.press('.lobby-name input', 'Enter');
    await host.waitForSelector('.lobby-link input', { timeout: 30000 });
    const link = await host.inputValue('.lobby-link input');
    info(`Mehrspieler: Raum eröffnet, Einladungslink ${link}`);
    if (!/#raum=[A-Z2-9]{6}$/.test(link)) fail(`Einladungslink sieht falsch aus: ${link}`);
    // 2. Gast kommt über den Link (mit schlechtem Netz)
    await gast.goto(`${link}&netz=schlecht`);
    await gast.waitForSelector('.lobby-name input', { timeout: 60000 });
    await gast.fill('.lobby-name input', 'Pitter');
    await gast.press('.lobby-name input', 'Enter');
    // 3. Beide haben die Karte (gleiche Prüfsumme): der Gastgeber kann starten
    await host.waitForSelector('.lobby-los:not([disabled])', { timeout: 180000 });
    const lobby = await host.evaluate(() => [...document.querySelectorAll('.lobby-sp')].map((e) => e.textContent));
    info(`Mehrspieler: Lobby ${JSON.stringify(lobby)}`);
    await host.screenshot({ path: join(aus, 'mp-1-lobby.png') });
    await host.click('.lobby-los');
    await Promise.all([host, gast].map((s) => s.waitForFunction(laeuft, null, { timeout: 90000, polling: 250 })));
    const start = await Promise.all([host, gast].map((s) => s.evaluate(() => ({ ich: window.eifeler.spiel.ich, lager: window.eifeler.spiel.lagerHex, n: window.eifeler.partie.spielerZahl }))));
    info(`Mehrspieler: gestartet, Lager ${JSON.stringify(start.map((x) => x.lager))}`);
    if (start[0].ich !== 0 || start[1].ich !== 1 || start[1].n !== 2) fail(`Plätze falsch: ${JSON.stringify(start)}`);
    // 4. Tempo 3 (nur der Gastgeber), beide bauen
    await host.evaluate(() => window.eifeler.spiel.setzeTempo(3));
    const b0 = await host.evaluate(baue, 'holzfaeller');
    const b1 = await gast.evaluate(baue, 'holzfaeller');
    if (!b0 || !b1) fail(`Kein Bauplatz gefunden: ${JSON.stringify([b0, b1])}`);
    const fps = await Promise.all([host, gast].map((x) => x.evaluate(() => new Promise((ok) => { let n = 0; const t = performance.now(); const f = () => { n++; if (performance.now() - t < 3000) requestAnimationFrame(f); else ok(Math.round((n / (performance.now() - t)) * 10000) / 10); }; requestAnimationFrame(f); }))));
    info(`Mehrspieler: Bilder je Sekunde ${fps.join(' / ')}`);
    await host.waitForTimeout(15000);
    const sicht = await Promise.all([host, gast].map((s) => s.evaluate(() => {
      const v = window.eifeler.spiel.sicht;
      return { tick: v.tick, tempo: window.eifeler.partie.tempo, hf: v.gebaeude.filter((g) => g.typ === 'holzfaeller').map((g) => g.sp).sort() };
    })));
    info(`Mehrspieler: nach 15 s Tick ${sicht.map((x) => x.tick).join('/')}, Tempo ${sicht[1].tempo}, Holzfäller von ${JSON.stringify(sicht[1].hf)}`);
    if (sicht[1].tempo !== 3) fail('Tempo 3 kam beim Gast nicht an');
    for (const x of sicht) if (JSON.stringify(x.hf) !== '[0,1]') fail(`Nicht beide Holzfäller sichtbar: ${JSON.stringify(x.hf)}`);
    // M7: Fenster im Mehrspieler – der Gast stellt die Warenverteilung um (Fensterknopf), der Gastgeber lässt seinen Holzfäller ruhen
    await gast.evaluate(() => window.eifeler.spiel.fensterUmschalten('verteilung'));
    await gast.waitForSelector('.fenster[data-fenster="verteilung"] .fe-platz:not([disabled])', { timeout: 10000 });
    await gast.locator('.fenster[data-fenster="verteilung"] .fe-platz:not([disabled])').first().click();
    const hfId = await host.evaluate(() => { const sp = window.eifeler.spiel; const g = sp.sicht.gebaeude.find((x) => x.sp === sp.ich && x.typ === 'holzfaeller'); sp.oeffneGebaeude(g.id); return g.id; });
    await host.waitForSelector(`.fenster[data-fenster="geb:${hfId}"]`, { timeout: 10000 });
    await host.evaluate(() => window.eifeler.spiel.fensterUmschalten('statistik'));
    await host.waitForTimeout(500);
    const m7 = await host.evaluate(() => ({ fenster: window.eifeler.spiel.fenster.ids, auto: window.eifeler.spiel.autosave(), da: !!localStorage.getItem('eifeler.autosave') }));
    info(`Mehrspieler M7: Fenster beim Gastgeber ${m7.fenster.join(', ')}, Autosave ${m7.auto && m7.da ? 'geschrieben' : 'FEHLT'}`);
    if (!m7.auto || !m7.da) fail('Mehrspieler M7: Autosave im Mehrspieler ging nicht');
    await host.evaluate(() => window.eifeler.skipIntro());
    await host.screenshot({ path: join(aus, 'mp-2-spiel.png') });
    // 5. Der Gast lädt die Seite neu: in unter 30 s wieder drin (Stand vom Mitspieler)
    const t0 = Date.now();
    await gast.reload();
    await host.waitForFunction(() => (window.eifeler.partie.zug?.warten.length ?? 0) > 0, null, { timeout: 15000, polling: 100 }).catch(() => info('Mehrspieler: (Warten beim Gastgeber nicht gesehen – Gast war schneller zurück)'));
    await gast.waitForFunction(laeuft, null, { timeout: 60000, polling: 100 });
    const zurueck = Date.now() - t0;
    info(`Mehrspieler: Gast nach Neuladen wieder drin nach ${(zurueck / 1000).toFixed(1)} s`);
    if (zurueck >= 30000) fail(`Wiederbeitritt dauerte ${zurueck} ms (Ziel unter 30 s)`);
    const b2 = await gast.evaluate(baue, 'wohnhaus');
    if (!b2) fail('Nach dem Wiederbeitritt kein Bauplatz für das Wohnhaus');
    await gast.waitForFunction(() => window.eifeler.spiel.sicht.gebaeude.some((g) => g.sp === 1 && g.typ === 'wohnhaus'), null, { timeout: 60000, polling: 250 });
    await host.waitForTimeout(5000);
    // 6. Pause vom Gast: beide halten am selben Tick, Prüfsummen gleich, keine Abweichung gemeldet
    await gast.evaluate(() => window.eifeler.spiel.pauseUmschalten());
    const stand = async () => Promise.all([host, gast].map((s) => s.evaluate(() => ({
      tick: window.eifeler.partie.sim.tick, summe: window.eifeler.partie.sim.pruefsumme(), pause: window.eifeler.partie.zug?.pause?.spieler ?? -1,
      pausen: window.eifeler.partie.zug?.pausen, abw: window.eifeler.partie.ereignisse.filter((e) => e.art === 'auseinander' || e.art === 'fehler'),
      wohnhaus: window.eifeler.spiel.sicht.gebaeude.some((g) => g.sp === 1 && g.typ === 'wohnhaus'),
    }))));
    let s = await stand();
    for (let i = 0; i < 40 && (s[0].tick !== s[1].tick || s[0].pause < 0); i++) { await host.waitForTimeout(250); s = await stand(); }
    await host.waitForTimeout(1000);
    s = await stand();
    info(`Mehrspieler: Pause von Spieler ${s[0].pause}, Tick ${s[0].tick}/${s[1].tick}, Prüfsumme ${s[0].summe}/${s[1].summe}, Pausen übrig ${JSON.stringify(s[0].pausen)}`);
    if (s[0].pause !== 1) fail('Die Pause des Gasts kam beim Gastgeber nicht an');
    if (s[0].tick !== s[1].tick) fail(`In der Pause verschiedene Ticks: ${s[0].tick} / ${s[1].tick}`);
    else if (s[0].summe !== s[1].summe) fail(`Auseinandergelaufen: ${s[0].summe} / ${s[1].summe}`);
    if (JSON.stringify(s[0].pausen) !== '[3,2]') fail(`Pausen übrig: ${JSON.stringify(s[0].pausen)} statt [3,2]`);
    if (!s[0].wohnhaus || !s[1].wohnhaus) {
      const d = await host.evaluate(() => window.eifeler.partie.sim.protokoll({ version: '', q: 0, r: 0, size: '', pruefsumme: '' }).befehle.map((e) => `${e.tick}/${e.spieler}/${e.befehl.art}/${e.befehl.typ ?? ''}`));
      const g = await gast.evaluate(() => ({ offen: [...window.eifeler.partie.offen?.values?.() ?? []], tg: window.eifeler.partie.taktgeber, da: window.eifeler.partie.istDa(0) }));
      fail(`Das Wohnhaus des Gasts (nach dem Neuladen) fehlt: b2 ${JSON.stringify(b2)}, Befehle beim Gastgeber ${JSON.stringify(d)}, Gast ${JSON.stringify(g)}`);
    }
    for (const x of s) for (const e of x.abw) fail(`Partie meldet: ${JSON.stringify(e)}`);
    // M8: Lagerfenster im Mehrspieler – der Gast schaltet die Lagerregel für Steine um (Zeile antippen), der Gastgeber wünscht sich
    // einen Bauarbeiter mehr (Knopf); beides muss bei beiden ankommen
    const lagerId = async (s) => s.evaluate(() => { const sp = window.eifeler.spiel; const g = sp.sicht.gebaeude.find((x) => x.sp === sp.ich && x.typ === 'lager'); sp.oeffneGebaeude(g.id); return g.id; });
    const lg = await lagerId(gast), lh = await lagerId(host);
    await gast.waitForSelector(`.fenster[data-fenster="geb:${lg}"] [data-knopf="regel:2"]`, { timeout: 10000 });
    await gast.locator(`.fenster[data-fenster="geb:${lg}"] [data-knopf="regel:2"]`).click();
    await host.waitForSelector(`.fenster[data-fenster="geb:${lh}"] [data-knopf="bau:+"]`, { timeout: 10000 });
    await host.locator(`.fenster[data-fenster="geb:${lh}"] [data-knopf="bau:+"]`).click();
    await host.waitForTimeout(1500);
    // M7: Verteilung des Gasts und das Ruhen des Gastgebers sind bei beiden gleich (auch nach dem Neuladen des Gasts)
    await gast.evaluate(() => window.eifeler.spiel.pauseUmschalten());
    await host.waitForFunction(laeuft, null, { timeout: 10000 });
    await host.evaluate(() => { const sp = window.eifeler.spiel; const g = sp.sicht.gebaeude.find((x) => x.sp === sp.ich && x.typ === 'holzfaeller'); sp.befehl({ art: 'ruhen', id: g.id, an: true }); });
    await host.waitForTimeout(3000);
    await gast.evaluate(() => window.eifeler.spiel.pauseUmschalten());
    for (let i = 0; i < 40; i++) { const t = await Promise.all([host, gast].map((x) => x.evaluate(() => window.eifeler.partie.sim.tick))); if (t[0] === t[1]) break; await host.waitForTimeout(250); }
    const m7b = await Promise.all([host, gast].map((x) => x.evaluate(() => {
      const sim = window.eifeler.partie.sim;
      return {
        vert: JSON.stringify(sim.sicht(1).dorf.verteilung), ruht: sim.sicht(0).gebaeude.some((g) => g.sp === 0 && g.typ === 'holzfaeller' && g.ruht), stat: sim.statistikVon(1).punkte.length,
        regel: sim.sicht(1).gebaeude.find((g) => g.sp === 1 && g.typ === 'lager').regel[2], bauSoll: sim.sicht(0).dorf.bauSoll, jahr: JSON.stringify(sim.sicht(0).jahr), tick: sim.tick,
      };
    })));
    info(`Mehrspieler M8: Lagerregel Steine beim Gast ${m7b.map((x) => x.regel).join('/')}, Bauarbeiter-Wunsch Gastgeber ${m7b.map((x) => x.bauSoll).join('/')}, Jahreszeit gleich ${m7b[0].jahr === m7b[1].jahr}`);
    if (m7b.some((x) => x.regel !== 1)) fail(`Mehrspieler M8: Lagerregel des Gasts kam nicht an: ${m7b.map((x) => x.regel).join('/')}`);
    if (m7b.some((x) => x.bauSoll !== 5)) fail(`Mehrspieler M8: Bauleute-Wunsch des Gastgebers kam nicht an: ${m7b.map((x) => x.bauSoll).join('/')}`);
    if (m7b[0].tick === m7b[1].tick && m7b[0].jahr !== m7b[1].jahr) fail(`Mehrspieler M8: Jahreszeit/Wetter verschieden: ${m7b[0].jahr} / ${m7b[1].jahr}`);
    info(`Mehrspieler M7: Verteilung gleich ${m7b[0].vert === m7b[1].vert}, Holzfäller ruht ${m7b.map((x) => x.ruht).join('/')}, Statistik-Punkte ${m7b.map((x) => x.stat).join('/')}`);
    if (m7b[0].vert !== m7b[1].vert) fail('Mehrspieler M7: Warenverteilung unterschiedlich');
    if (!m7b[0].vert.includes('[0,1,3,2]') && !m7b[0].vert.includes('[0,2,1,3]')) fail(`Mehrspieler M7: Verteilung des Gasts kam nicht an: ${m7b[0].vert}`);
    if (!m7b[0].ruht || !m7b[1].ruht) fail('Mehrspieler M7: Ruhen kam nicht bei beiden an');
    await gast.screenshot({ path: join(aus, 'mp-3-gast-pause.png') });
    // 7. Speichern (Gastgeber) und weiter
    const gespeichert = await host.evaluate(() => { const st = window.eifeler.spiel.speichern(); return { n: st.spieler.length, namen: st.spieler, tick: st.stand.zahlen[0] }; });
    info(`Mehrspieler: gespeichert (${gespeichert.namen.join(', ')}, Tick ${gespeichert.tick})`);
    if (gespeichert.n !== 2 || gespeichert.namen[1] !== 'Pitter') fail(`Spielstand falsch: ${JSON.stringify(gespeichert)}`);
    await gast.evaluate(() => window.eifeler.spiel.pauseUmschalten());
    await host.waitForFunction(laeuft, null, { timeout: 10000 });
  } finally {
    for (const f of seitenfehler) fail(f);
    await browser.close().catch(() => undefined);
  }
}

// ---- allein laufen lassen: node tests/mehrspieler.mjs
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const fehler = [];
  const info = (m) => console.log(m);
  const fail = (m) => { fehler.push(m); console.error(`FEHLER: ${m}`); };
  const vm = await starteVermittlung();
  const { createServer } = await import('vite');
  const port = await freierPort();
  const vite = await createServer({ root: WURZEL, logLevel: 'warn', server: { port, strictPort: true, host: '127.0.0.1' } });
  await vite.listen();
  const basis = `http://127.0.0.1:${port}/`;
  try {
    const versionen = await (await fetch(new URL('welt/versions.json', basis))).json();
    const version = process.env.SMOKE_VERSION ?? versionen.aktuell;
    const orte = await (await fetch(new URL(`welt/${version}/orte.json`, basis))).json();
    const manifest = await (await fetch(new URL(`welt/${version}/manifest.json`, basis))).json();
    const { build } = await import('esbuild');
    const b = await build({ stdin: { contents: `export { klemmeAusschnitt } from './src/welt/ausschnitt.ts';`, resolveDir: WURZEL, loader: 'ts' }, bundle: true, format: 'esm', platform: 'node', write: false, define: { 'import.meta.env': '{}' }, logLevel: 'error' });
    const L = await import(`data:text/javascript;base64,${Buffer.from(b.outputFiles[0].text).toString('base64')}`);
    const ort = orte.orte.find((o) => o[5] !== undefined && orte.kinds[o[1]] === 'dorf') ?? orte.orte.find((o) => o[5] !== undefined);
    const param = L.klemmeAusschnitt(manifest, { version, q: ort[5], r: ort[6], size: 'klein' });
    const exe = process.env.CHROMIUM_PATH || (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
    await mehrspielerTest({ basis, param, aus: join(WURZEL, 'test-results', 'smoke'), info, fail, exe });
  } catch (e) { fail(e.stack ?? String(e)); } finally {
    await vite.close().catch(() => undefined);
    await vm.schliessen();
  }
  console.log(fehler.length ? `\nMEHRSPIELER FEHLGESCHLAGEN (${fehler.length})` : '\nMEHRSPIELER OK');
  process.exit(fehler.length ? 1 : 0);
}
