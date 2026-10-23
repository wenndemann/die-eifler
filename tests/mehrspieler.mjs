// Testaufbau M6 im echten Browser: zwei Fenster (Browser-Kontexte) auf einem Rechner, Vermittlungs-Server lokal, WebRTC direkt
// zwischen den Fenstern, simuliertes schlechtes Netz (#…&netz=schlecht). Ablauf: Gastgeber eröffnet einen Raum, Gast kommt über
// den Einladungslink, beide laden die Karte (gleiche Prüfsumme), Start, beide bauen, Tempo 3, der Gast lädt die Seite neu und muss
// in unter 30 Sekunden wieder drin sein, Pause, Prüfsummen gleich, Speichern. M7: Warenverteilung über das Fenster, Ruhen,
// Statistik und Autosave im Mehrspieler. M8: Lagerregel und Bauleute-Wunsch über das Lagerfenster, Jahreszeit und Wetter bei beiden gleich.
// M10: Regeln (Gebiet, Ziel), Gebiet und Eifel-Punkte bei beiden gleich, Ortsfenster. M11: Völkchen beider Dörfer bei beiden gleich. M12: Uhrzeit
// und Wetter-Optik (Talnebel/Aue) bei beiden gleich. M14: Mainacht und Maibäume bei beiden gleich. M15: Nacht, Zollhäuser, Grenzsteine,
// Teile des Großen Funds und Reiz bei beiden gleich, Grenzstein-Befehl des Gasts im Protokoll beider; Lebendige Eifel läuft in beiden;
// Holzbrücken (gebaute Brücken, fehlende je Weg) bei beiden gleich. Höfe und Felder: beide bauen einen Kartoffelhof, die Felder
// (Natur je Hex) sind bei beiden gleich und werden gezeichnet.
//
// Läuft in npm run test:smoke mit; allein:  node tests/mehrspieler.mjs   (Server und Vite startet es selbst)
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
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

/**
 * Im Spiel eines Fensters: ein Gebäude nahe dem eigenen Lager mit Weg zur Lagerfahne bauen. `arg`: Typ oder { typ, meiden } – Hexe, auf
 * die gerade erst ein Bauauftrag ging (der Befehl wirkt erst ein paar Ticks später), samt Weg und Nachbar-Hexen meiden.
 */
function baue(arg) {
  const typ = typeof arg === 'string' ? arg : arg.typ, meiden = typeof arg === 'string' ? [] : arg.meiden;
  const s = window.eifeler.spiel, sim = s.sim, ich = s.ich, L = s.lagerHex;
  const ab = (a, b) => (Math.abs(a.q - b.q) + Math.abs(a.r - b.r) + Math.abs(a.q - b.q + a.r - b.r)) / 2;
  for (let d = 2; d <= 9; d++) {
    for (let dr = -d; dr <= d; dr++) {
      for (let dq = -d; dq <= d; dq++) {
        const h = { q: L.q + dq, r: L.r + dr };
        if (ab(h, L) !== d || !sim.kannBauen(typ, h.q, h.r, ich) || meiden.some((m) => ab(m, h) <= 1)) continue;
        // Weg zur Lagerfahne, sonst zur nächsten eigenen Fahne (an der Lagerfahne ist nicht in jeder Richtung Platz)
        const ziele = [L, ...sim.sicht(ich).fahnen.filter((f) => f.sp === ich && ab(f, h) <= 6).sort((a, b) => ab(a, h) - ab(b, h)).slice(0, 4)];
        let weg = null;
        for (const z of ziele) if (!weg) weg = sim.wegAbschnitt(h, z, meiden.filter((m) => m.q !== z.q || m.r !== z.r), 12, ich);
        if (!weg) continue;
        s.befehl({ art: 'gebaeude', typ, q: h.q, r: h.r });
        s.befehl({ art: 'weg', pfad: weg });
        return { ...h, ich, weg };
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
const hexAbstand = (a, b) => (Math.abs(a.q - b.q) + Math.abs(a.r - b.r) + Math.abs(a.q + a.r - b.q - b.r)) / 2;
const RADIUS = { klein: 45, mittel: 60, gross: 80 };

/** Ein Dorf aus dem Ortsverzeichnis, möglichst weit von der Mitte, aber sicher im Spielfeld (für den Wunsch-Ort). */
function wunschDorf(p) {
  try {
    const orte = JSON.parse(readFileSync(join(WURZEL, 'welt-daten', p.version, 'orte.json'), 'utf8')).orte;
    const n = RADIUS[p.size];
    const drin = orte.filter((o) => o[1] === 1 && hexAbstand({ q: o[5], r: o[6] }, p) <= n - 8)
      .sort((a, b) => hexAbstand({ q: b[5], r: b[6] }, p) - hexAbstand({ q: a[5], r: a[6] }, p));
    return drin.length ? { name: drin[0][0], q: drin[0][5], r: drin[0][6] } : null;
  } catch { return null; }
}

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
    // Wunsch-Ort (wie aus der Ortssuche der Kartenwahl): ein Dorf weit weg von der Mitte, aber im Spielfeld
    const wunsch = wunschDorf(p);
    // 1. Gastgeber eröffnet einen Raum (Name, dann Lobby mit Einladungslink)
    const o = wunsch ? `&o=${wunsch.q},${wunsch.r},${encodeURIComponent(wunsch.name)}` : '';
    await host.goto(`${basis}#v=${p.version}&q=${p.q}&r=${p.r}&g=${p.size}${o}&freunde=1&netz=schlecht`);
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
    if (wunsch) {
      const d = hexAbstand(start[0].lager, wunsch);
      info(`Mehrspieler Wunsch-Ort: ${wunsch.name} (${wunsch.q}/${wunsch.r}), Lager des Gastgebers ${d} Hex daneben`);
      if (d > 2) fail(`Lager des Gastgebers nicht im Wunsch-Ort ${wunsch.name}: ${JSON.stringify(start[0].lager)}`);
      if (hexAbstand(start[1].lager, wunsch) <= 2) fail('Der Gast startet im Wunsch-Ort des Gastgebers');
    }
    // 4. Tempo 3 (nur der Gastgeber), beide bauen
    await host.evaluate(() => window.eifeler.spiel.setzeTempo(3));
    const b0 = await host.evaluate(baue, 'holzfaeller');
    const b1 = await gast.evaluate(baue, 'holzfaeller');
    if (!b0 || !b1) fail(`Kein Bauplatz gefunden: ${JSON.stringify([b0, b1])}`);
    const h0 = await host.evaluate(baue, { typ: 'kartoffelfeld', meiden: b0 ? [b0, ...b0.weg] : [] });
    const h1 = await gast.evaluate(baue, { typ: 'kartoffelfeld', meiden: b1 ? [b1, ...b1.weg] : [] });
    if (!h0 || !h1) fail(`Kein Bauplatz für den Kartoffelhof: ${JSON.stringify([h0, h1])}`);
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
    await gast.waitForSelector('.fenster[data-fenster="verteilung"] .fe-platz:not([disabled])', { timeout: 30000 });
    // Software-Grafik mit zwei Szenen ist sehr langsam (unter 1 Bild/s): nicht auf die Navigation nach dem Klick warten
    await gast.locator('.fenster[data-fenster="verteilung"] .fe-platz:not([disabled])').first().click({ noWaitAfter: true, timeout: 90000 });
    const hfId = await host.evaluate(() => { const sp = window.eifeler.spiel; const g = sp.sicht.gebaeude.find((x) => x.sp === sp.ich && x.typ === 'holzfaeller'); sp.oeffneGebaeude(g.id); return g.id; });
    await host.waitForSelector(`.fenster[data-fenster="geb:${hfId}"]`, { timeout: 30000 });
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
    await gast.waitForSelector(`.fenster[data-fenster="geb:${lg}"] [data-knopf="regel:2"]`, { timeout: 30000 });
    await gast.locator(`.fenster[data-fenster="geb:${lg}"] [data-knopf="regel:2"]`).click({ noWaitAfter: true, timeout: 90000 });
    await host.waitForSelector(`.fenster[data-fenster="geb:${lh}"] [data-knopf="bau:+"]`, { timeout: 30000 });
    await host.locator(`.fenster[data-fenster="geb:${lh}"] [data-knopf="bau:+"]`).click({ noWaitAfter: true, timeout: 90000 });
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
    // M10: Regeln (Gebiet, Ziel), Gebiet und Eifel-Punkte bei beiden gleich; das Ortsfenster geht auf, die Grenze steht
    const m10 = await Promise.all([host, gast].map((x) => x.evaluate(() => {
      const sp = window.eifeler.spiel, s = sp.sim.sicht(sp.ich);
      sp.oeffneOrt(0);
      return { vk: s.spieler.map((p) => p.voelkchen).join(','), regeln: JSON.stringify(s.regeln), rev: s.gebiet.rev, punkte: s.spieler.map((p) => p.punkte).join(','), hexe: s.spieler.map((p) => p.hexe).join(','), orte: s.orte.length, posten: s.posten.length, tick: sp.sim.tick };
    })));
    await gast.waitForSelector('.fenster[data-fenster="ort:0"]', { timeout: 30000 }).catch(() => fail('Mehrspieler M10: Ortsfenster geht nicht auf'));
    info(`Mehrspieler M10: Regeln ${m10[0].regeln}, Gebiet ${m10.map((x) => x.hexe).join(' / ')}, Punkte ${m10.map((x) => x.punkte).join(' / ')}, ${m10[0].orte} Orte, ${m10[0].posten} Marktposten`);
    info(`Mehrspieler M11: Völkchen ${m10.map((x) => x.vk).join(' / ')}`);
    if (m10.some((x) => x.vk !== m10[0].vk) || m10[0].vk.split(',').some((v) => !v)) fail(`Mehrspieler M11: Völkchen fehlen oder verschieden: ${m10.map((x) => x.vk).join(' / ')}`);
    if (m10.some((x) => x.regeln !== m10[0].regeln) || !m10[0].regeln.includes('"gebiet":true')) fail(`Mehrspieler M10: Regeln verschieden oder ohne Gebiet: ${m10.map((x) => x.regeln).join(' / ')}`);
    if (m10[0].tick === m10[1].tick && (m10[0].hexe !== m10[1].hexe || m10[0].punkte !== m10[1].punkte)) fail('Mehrspieler M10: Gebiet oder Punkte verschieden');
    // M12: Tageszeit (läuft mit dem gemeinsamen Tick) und Wetter-Optik bei beiden
    const m12 = await Promise.all([host, gast].map((x) => x.evaluate(() => {
      const sp = window.eifeler.spiel;
      const uhr = /(\d+) Uhr/.exec(document.querySelector('.spielstatus')?.textContent ?? '')?.[1] ?? '';
      const s = sp.sim.sicht(sp.ich);
      return { uhr, tick: sp.sim.tick, scheiben: JSON.stringify(sp.wetterOptik.zahlen()), mai: `${s.mainacht?.ab}/${s.spieler.map((x) => x.maibaum).join(',')}` };
    })));
    info(`Mehrspieler M12: Uhr ${m12.map((x) => x.uhr).join(' / ')}, Nebel/Aue ${m12.map((x) => x.scheiben).join(' / ')}`);
    if (m12.some((x) => !x.uhr)) fail('Mehrspieler M12: keine Uhrzeit in der Statusleiste');
    info(`Mehrspieler M14: Mainacht ab Tick / Maibäume ${m12.map((x) => x.mai).join(' | ')}`);
    if (m12[0].mai !== m12[1].mai) fail(`Mehrspieler M14: Mai verschieden: ${m12.map((x) => x.mai).join(' | ')}`);
    if (m12[0].scheiben !== m12[1].scheiben) fail(`Mehrspieler M12: Talnebel/Aue verschieden: ${m12.map((x) => x.scheiben).join(' / ')}`);
    // M15: Grenzland – Nacht, Zollhäuser, Grenzsteine, Teile und Reiz bei beiden gleich; ein Grenzstein-Befehl des Gasts kommt beim Gastgeber an
    await gast.evaluate(() => window.eifeler.spiel.befehl({ art: 'grenzstein', id: 1, ziel: 0 }));
    await host.waitForTimeout(2500);
    const m15 = await Promise.all([host, gast].map((x) => x.evaluate(() => {
      const sp = window.eifeler.spiel, sim = sp.sim, s = sim.sicht(sp.ich), g = s.grenzland;
      return {
        tick: sim.tick, nacht: g.nacht, zoll: JSON.stringify(g.zoll.map((z) => [z.q, z.r])), steine: JSON.stringify(g.steine), teile: s.spieler.map((p) => p.teile).join(','),
        reiz: [0, 1].map((i) => sim.sicht(i).dorf.grenz.reiz).join(','),
        befehl: sim.protokoll({ version: '', q: 0, r: 0, size: '', pruefsumme: '' }).befehle.some((e) => e.befehl.art === 'grenzstein' && e.spieler === 1),
        kaffee: s.dorf.verteilung.length === s.dorf.erzeugt.length,
        leben: !!sp.leben?.zahlen && sp.gras?.anzahl >= 0 && sp.leben.group.children.length > 0,
        bruecken: JSON.stringify([sim.stand().bruecken, s.segmente.map((x) => x.bruecken)]),
        felder: (() => { const n = sim.sicht(0).natur; let h = 0, z = 0; n.feld.forEach((v, i) => { if (v) { z++; h = (h * 31 + i * 7 + v * 3 + n.feldStufe[i]) % 1000003; } }); return `${z}:${h}`; })(),
        hoefe: [0, 1].map((i) => sim.sicht(i).gebaeude.filter((g) => g.sp === i && g.typ === 'kartoffelfeld').map((g) => `${g.zustand}/${g.erzeugt}`).join('')).join(','),
        gezeichnet: sp.felder.anzahl,
      };
    })));
    info(`Mehrspieler M15: Nacht ${m15.map((x) => x.nacht).join('/')}, Zollhäuser ${m15[0].zoll}, Grenzsteine ${m15[0].steine}, Teile ${m15.map((x) => x.teile).join(' / ')}, Reiz ${m15.map((x) => x.reiz).join(' / ')}`);
    if (m15.some((x) => x.zoll !== m15[0].zoll)) fail(`Mehrspieler M15: Zollhäuser verschieden: ${m15.map((x) => x.zoll).join(' / ')}`);
    if (m15.some((x) => x.steine !== m15[0].steine || x.teile !== m15[0].teile)) fail(`Mehrspieler M15: Grenzsteine/Teile verschieden: ${JSON.stringify(m15)}`);
    if (m15[0].tick === m15[1].tick && (m15[0].reiz !== m15[1].reiz || m15[0].nacht !== m15[1].nacht)) fail(`Mehrspieler M15: Reiz/Nacht verschieden: ${JSON.stringify(m15)}`);
    if (m15.some((x) => !x.befehl)) fail(`Mehrspieler M15: Grenzstein-Befehl des Gasts fehlt im Protokoll: ${m15.map((x) => x.befehl).join('/')}`);
    if (m15.some((x) => !x.kaffee)) fail('Mehrspieler M15: Kaffee fehlt in Verteilung oder Statistik');
    info(`Mehrspieler Brücken: ${m15.map((x) => x.bruecken).join(' / ')}`);
    if (m15[0].tick === m15[1].tick && m15[0].bruecken !== m15[1].bruecken) fail(`Mehrspieler: Holzbrücken verschieden: ${m15.map((x) => x.bruecken).join(' / ')}`);
    info(`Mehrspieler Höfe: Felder (Zahl:Hash) ${m15.map((x) => x.felder).join(' / ')}, Höfe ${m15.map((x) => x.hoefe).join(' / ')}, gezeichnet ${m15.map((x) => x.gezeichnet).join(' / ')}`);
    if (m15[0].tick === m15[1].tick && m15[0].felder !== m15[1].felder) fail(`Mehrspieler: Felder verschieden: ${m15.map((x) => x.felder).join(' / ')}`);
    if (m15.some((x) => x.hoefe.split(',').length !== 2 || x.hoefe.split(',').some((h) => !h))) fail(`Mehrspieler: Kartoffelhöfe fehlen: ${m15.map((x) => x.hoefe).join(' / ')}`);
    // gezeichnet wird im nächsten Bild: bei wenigen Bildern je Sekunde kann ein frisch gesätes Feld noch fehlen
    if (m15.some((x) => Number(x.felder.split(':')[0]) >= 3 && x.gezeichnet === 0)) fail(`Mehrspieler: Felder werden nicht gezeichnet: ${m15.map((x) => `${x.gezeichnet} von ${x.felder}`).join(' / ')}`);
    if (m15.some((x) => !x.leben)) fail('Mehrspieler M15: Lebendige Eifel (Rauch, Tiere, Gras) läuft nicht in beiden Fenstern');
    if (Math.abs(m12[0].tick - m12[1].tick) < 40 && Math.abs(Number(m12[0].uhr) - Number(m12[1].uhr)) > 1) fail(`Mehrspieler M12: Uhrzeit verschieden: ${m12.map((x) => x.uhr).join(' / ')}`);
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
