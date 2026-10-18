// Rauchtest im echten Browser: Kartenwahl -> Vorschlag -> „Hier siedeln!“ -> Ausschnitt lädt, keine Seitenfehler,
// Screenshots aus drei festen Kamerapositionen, Prüfsumme nach Neuladen gleich, Gegenprobe mit tools/map/pruefsumme.py.
// Dazu (M3/M4): Determinismus Node = Browser (30-Segment-Szenario und Holzwirtschaft M4), Spiel auf der echten Karte
// (Aufbau per Befehle mit Holz und Stein, 5 Spielminuten, Screenshot nah am Lager) und Replay des Protokolls in einem
// zweiten Browser-Kontext. Dazu die Bedienung (tests/bedienung.mjs): Baumenü, Geist, Bauplätze, Klick-Bau, Priorität, Handy.
//
// Aufruf:  WELT_DATEN=/pfad/zu/daten npm run test:smoke
//   WELT_DATEN   Weltdaten (Standard welt-daten/), werden auch vom selbst gestarteten Vite-Server ausgeliefert
//   CHROMIUM_PATH  Chromium-Programm (Standard: /opt/pw-browsers/chromium, falls vorhanden, sonst Playwright-Standard)
//   SMOKE_URL    schon laufender Server (z. B. dist-share per python3 -m http.server): dann kein Vite-Start;
//                die Weltdaten liegen unter <SMOKE_URL>/welt/ (versions.json dort bestimmt die Version)
//   SMOKE_VERSION  Datenversion erzwingen (sonst „aktuell“)
//   SMOKE_OUT    Ausgabeordner der Screenshots (Standard test-results/smoke)
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { createServer as netServer } from 'node:net';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { bedienungsTest } from './bedienung.mjs';

const WURZEL = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DATEN = resolve(process.env.WELT_DATEN ?? join(WURZEL, 'welt-daten'));
const AUS = resolve(process.env.SMOKE_OUT ?? join(WURZEL, 'test-results', 'smoke'));
const fehler = [];
const fail = (m) => { fehler.push(m); console.error(`FEHLER: ${m}`); };
const info = (m) => console.log(m);

const freierPort = () => new Promise((ok, err) => {
  const s = netServer();
  s.once('error', err);
  s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => ok(p)); });
});

// Client-Logik zum Entscheiden, welcher Vorschlag in die Daten passt (gleiche Funktionen wie im Spiel)
async function clientLogik() {
  const b = await build({
    stdin: {
      contents: `export { ausschnittMoeglich, klemmeAusschnitt } from './src/welt/ausschnitt.ts';
export { VORSCHLAEGE } from './src/map/presets.ts';`,
      resolveDir: WURZEL, loader: 'ts',
    },
    bundle: true, format: 'esm', platform: 'node', write: false, define: { 'import.meta.env': '{}' }, logLevel: 'error',
  });
  return import(`data:text/javascript;base64,${Buffer.from(b.outputFiles[0].text).toString('base64')}`);
}

// Szenario-Replay als Bündel: einmal für Node (ESM), einmal für den Browser (IIFE, window.szenario.pruefsumme()).
async function szenarioBuendel(format, plattform, name = 'baueSzenario30') {
  const b = await build({
    stdin: {
      contents: `import { ${name} } from './tests/sim-szenario.ts';
import { spieleAb } from './src/sim/replay.ts';
export function pruefsumme() { const { karte, protokoll } = ${name}(); return spieleAb(karte, protokoll).pruefsumme(); }`,
      resolveDir: WURZEL, loader: 'ts',
    },
    bundle: true, format, globalName: format === 'iife' ? 'szenario' : undefined, platform: plattform, write: false, logLevel: 'error',
  });
  return b.outputFiles[0].text;
}

let vite = null;
let basis = process.env.SMOKE_URL;
if (!basis) {
  const port = await freierPort();
  vite = await createServer({ root: WURZEL, logLevel: 'warn', server: { port, strictPort: true, host: '127.0.0.1' } });
  await vite.listen();
  basis = `http://127.0.0.1:${port}/`;
}
if (!basis.endsWith('/')) basis += '/';
info(`Server: ${basis}  Daten: ${DATEN}`);

let browser;
try {
  // ---- Datenversion und Plan
  const hol = async (pfad) => {
    const r = await fetch(new URL(pfad, basis));
    if (!r.ok) throw new Error(`${pfad}: ${r.status}`);
    return r.json();
  };
  const versionen = await hol('welt/versions.json');
  const version = process.env.SMOKE_VERSION ?? versionen.aktuell;
  const manifest = await hol(`welt/${version}/manifest.json`);
  const orte = await hol(`welt/${version}/orte.json`);
  const L = await clientLogik();
  const vorschlag = L.VORSCHLAEGE.find((v) => L.ausschnittMoeglich(manifest, v.q, v.r, v.size));
  let plan;
  if (vorschlag) plan = { art: 'kartenwahl', vorschlag };
  else {
    const ort = orte.orte.find((o) => o[5] !== undefined && o[1] !== undefined && orte.kinds[o[1]] !== 'gewaesser');
    if (!ort) throw new Error('Weder ein Vorschlag passt in die Daten noch gibt es einen Ort in orte.json');
    let p = { version, q: ort[5], r: ort[6], size: 'klein' };
    p = L.klemmeAusschnitt(manifest, p);
    plan = { art: 'hash', ort: ort[0], param: p };
  }
  info(`Datenversion ${version} (Gebiet ${manifest.gebiet}); Plan: ${plan.art === 'kartenwahl' ? `Vorschlag „${plan.vorschlag.name}“ anklicken` : `Hash um ${plan.ort} (${plan.param.q},${plan.param.r})`}`);

  // ---- Browser
  const exe = process.env.CHROMIUM_PATH || (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
  browser = await chromium.launch({
    headless: false, executablePath: exe,
    args: ['--headless=new', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const seitenfehler = [];
  const ursprung = new URL(basis).origin;
  page.on('pageerror', (e) => seitenfehler.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const url = m.location()?.url ?? '';
    if (/favicon/i.test(url)) return;
    if (url && !url.startsWith(ursprung)) return; // Fremdhosts (Schriften) sind offline egal
    seitenfehler.push(`console.error: ${m.text()} ${url}`);
  });

  const bereit = (t) => page.waitForFunction(() => window.eifeler?.ausschnitt?.pruefsumme, null, { timeout: t, polling: 500 });

  if (plan.art === 'kartenwahl') {
    await page.goto(basis);
    await page.waitForSelector('.kw-vorschlag', { timeout: 60000 });
    info('Kartenwahl erscheint');
    await page.locator('.kw-vorschlag', { hasText: plan.vorschlag.name }).first().click();
    await page.waitForTimeout(500);
    await page.locator('.kw-los').click();
  } else {
    const p = plan.param;
    await page.goto(`${basis}#v=${p.version}&q=${p.q}&r=${p.r}&g=${p.size}`);
  }
  await bereit(600000);
  await page.evaluate(() => window.eifeler.skipIntro());
  const a1 = await page.evaluate(() => {
    const a = window.eifeler.ausschnitt;
    return { pruefsumme: a.pruefsumme, param: a.param, geklemmt: a.geklemmt, ms: Math.round(window.eifeler.ladezeit) };
  });
  info(`Ausschnitt geladen: Prüfsumme ${a1.pruefsumme}, ${a1.param.version} q=${a1.param.q} r=${a1.param.r} ${a1.param.size}, ${a1.ms} ms`);
  if (!/^[0-9a-f]{16}$/.test(a1.pruefsumme)) fail(`Prüfsumme hat unerwartetes Format: ${a1.pruefsumme}`);

  // ---- Screenshots aus drei festen Kamerapositionen
  mkdirSync(AUS, { recursive: true });
  const posen = [
    { name: '1-uebersicht', d: 13000, pitch: 55, yaw: 0, ziel: 'mitte' },
    { name: '2-tal-schraeg', d: 3500, pitch: 32, yaw: 0.6, ziel: 'start' },
    { name: '3-ortskern-nah', d: 700, pitch: 38, yaw: 0, ziel: 'start' },
  ];
  for (const pose of posen) {
    await page.evaluate((v) => {
      const e = window.eifeler;
      const start = e.map.info.places.find((q) => q.name === e.map.info.start);
      const mitte = { x: e.map.sizeX / 2, z: e.map.sizeZ / 2 };
      const z = v.ziel === 'start' && start ? start : mitte;
      e.cam.pitchOverride = v.pitch;
      e.cam.jumpTo(z.x, z.z, v.d, v.yaw);
      e.settle();
    }, pose);
    await page.waitForTimeout(3000);
    const datei = join(AUS, `${pose.name}.png`);
    await page.screenshot({ path: datei, timeout: 180000 });
    const kb = Math.round(statSync(datei).size / 1024);
    info(`Screenshot ${datei} (${kb} KB)`);
    if (kb < 20) fail(`Screenshot ${pose.name} ist verdächtig klein (${kb} KB), vermutlich leer`);
  }

  // ---- Neuladen mit demselben Hash: Prüfsumme gleich
  const hash = await page.evaluate(() => location.hash);
  if (!hash.includes('q=')) fail(`URL-Hash nach dem Laden unvollständig: ${hash}`);
  await page.reload();
  await bereit(600000);
  const pruef2 = await page.evaluate(() => window.eifeler.ausschnitt.pruefsumme);
  info(`Nach Neuladen (${hash}): Prüfsumme ${pruef2}`);
  if (pruef2 !== a1.pruefsumme) fail(`Prüfsumme nach Neuladen verschieden: ${a1.pruefsumme} gegen ${pruef2}`);

  // ---- Gegenprobe mit Python
  const py = join(WURZEL, 'tools', 'map', 'pruefsumme.py');
  if (existsSync(py) && existsSync(join(DATEN, version, 'manifest.json'))) {
    const p = a1.param;
    const r = spawnSync('python3', ['-I', py, '--daten', DATEN, '--version', p.version, '--q', String(p.q), '--r', String(p.r), '--size', p.size], { encoding: 'utf8' });
    if (r.error || (r.status !== 0 && /No module named/.test(r.stderr ?? ''))) info('Gegenprobe Python übersprungen (python3/numpy nicht verfügbar)');
    else if (r.status !== 0) fail(`pruefsumme.py scheiterte: ${r.stderr}`);
    else {
      const py16 = r.stdout.trim().split(/\s+/).pop();
      info(`Python-Gegenprobe: ${py16}`);
      if (py16 !== a1.pruefsumme) fail(`Prüfsumme Browser ${a1.pruefsumme} ist ungleich Python ${py16}`);
    }
  } else info('Gegenprobe Python übersprungen (Skript oder Daten fehlen)');

  // ---- M3 a) Determinismus Node = Browser: das 30-Segment-Szenario und die Holzwirtschaft M4 (je 12000 Ticks) in beiden Umgebungen
  for (const name of ['baueSzenario30', 'baueSzenarioM4']) {
    const nodeCode = await szenarioBuendel('esm', 'node', name);
    const nodeMod = await import(`data:text/javascript;base64,${Buffer.from(nodeCode).toString('base64')}`);
    const t1 = Date.now();
    const sumNode = nodeMod.pruefsumme();
    const msNode = Date.now() - t1;
    const leer = await browser.newPage();
    await leer.addScriptTag({ content: await szenarioBuendel('iife', 'browser', name) });
    const t2 = Date.now();
    const sumBrowser = await leer.evaluate(() => window.szenario.pruefsumme());
    const msBrowser = Date.now() - t2;
    await leer.close();
    info(`Determinismus ${name}: Node ${sumNode} (${msNode} ms), Browser ${sumBrowser} (${msBrowser} ms)`);
    if (sumNode !== sumBrowser) fail(`Determinismus ${name}: Prüfsumme Node ${sumNode} ungleich Browser ${sumBrowser}`);
  }

  // ---- M3 b) Spiel auf der echten Karte: Aufbau mit Holz und Stein per Befehle, 5 Spielminuten, Screenshot, Replay in zweitem Kontext
  const url = `${basis}#v=${a1.param.version}&q=${a1.param.q}&r=${a1.param.r}&g=${a1.param.size}`;
  await page.goto('about:blank');
  await page.goto(url);
  await page.waitForFunction(() => window.eifeler?.spiel, null, { timeout: 600000, polling: 500 });
  await page.evaluate(() => window.eifeler.skipIntro());
  const aufbau = await page.evaluate(() => {
    const sp = window.eifeler.spiel;
    sp.pause(true);   // keine Echtzeit-Ticks dazwischen; befehl() rechnet bei Pause selbst 2 Ticks
    const L = sp.lagerHex;
    const RICHT = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
    const dist = (a, b) => (Math.abs(a.q - b.q) + Math.abs(a.r - b.r) + Math.abs(a.q + a.r - b.q - b.r)) / 2;
    const gebaut = [];
    let wege = 0;
    // 1) Wege vom Lager in verschiedene Richtungen, jeweils zu einem freien Hex (dort entsteht eine Fahne)
    for (let d = 0; d < 6 && wege < 4; d++) {
      for (const k of [4, 3, 5, 2]) {
        const T = { q: L.q + RICHT[d][0] * k, r: L.r + RICHT[d][1] * k };
        const p = sp.sim.wegVorschau(L, T);
        if (p && p.length <= 8) { sp.befehl({ art: 'weg', pfad: p }); wege++; break; }
      }
    }
    // 2) eine Fahne mitten auf den ersten Weg (teilt das Segment)
    const erster = sp.sicht.segmente[0];
    if (erster && erster.pfad.length > 3) {
      const m = erster.pfad[Math.floor(erster.pfad.length / 2)];
      if (sp.sim.kannFahne(m.q, m.r)) sp.befehl({ art: 'fahne', q: m.q, r: m.r });
    }
    // 3) Gebäude an passenden Plätzen (kannBauen), jeweils mit Weg zur nächsten Fahne (wegVorschau vorher prüfen).
    //    Holzfäller dort, wo es die meisten Bäume im Radius gibt (arbeitsHexe); Förster daneben; Steinbruch nur bei Felsen in Reichweite.
    const kandidaten = [];
    for (let dq = -12; dq <= 12; dq++) for (let dr = -12; dr <= 12; dr++) {
      const c = { q: L.q + dq, r: L.r + dr };
      const dd = dist(c, L);
      if (dd >= 2 && dd <= 12) kandidaten.push({ ...c, dd });
    }
    kandidaten.sort((a, b) => a.dd - b.dd || a.r - b.r || a.q - b.q);
    const nutzen = (typ, c) => {
      const fs = sp.sicht.fahnen.slice().sort((a, b) => dist(a, c) - dist(b, c) || a.id - b.id).slice(0, 6);
      const von = fs.find((f) => sp.sim.wegVorschau(f, c));
      if (!von) return false;
      sp.befehl({ art: 'gebaeude', typ, q: c.q, r: c.r });
      const p = sp.sim.wegVorschau(von, c);
      if (p) sp.befehl({ art: 'weg', pfad: p });
      gebaut.push({ typ, q: c.q, r: c.r });
      return true;
    };
    const beste = (typ, nahBei, wert) => {
      let best = null, bw = 0;
      for (const c of kandidaten) {
        if (nahBei && dist(c, nahBei) > 2) continue;
        if (c.dd > 8 && typ !== 'holzfaeller' && typ !== 'steinbruch') continue;
        if (!sp.sim.kannBauen(typ, c.q, c.r)) continue;
        const w = wert ? wert(c) : 1;
        if (w > bw) { bw = w; best = c; }
      }
      return best;
    };
    const baeume = (c) => sp.sim.arbeitsHexe('holzfaeller', c.q, c.r).summe;
    const felsen = (c) => sp.sim.arbeitsHexe('steinbruch', c.q, c.r).summe;
    const hf = beste('holzfaeller', null, baeume);
    if (hf && baeume(hf) > 0 && nutzen('holzfaeller', hf)) {
      sp.schritte(2);
      const fo = beste('foerster', hf, () => 1);
      if (fo) nutzen('foerster', fo);
    }
    for (const [typ, wert] of [['saegewerk', null], ['steinbruch', felsen], ['huette', null]]) {
      sp.schritte(2);
      const c = beste(typ, null, wert);
      if (c && (typ !== 'steinbruch' || felsen(c) > 0)) nutzen(typ, c);
    }
    const holzfaeller = gebaut.find((g) => g.typ === 'holzfaeller');
    const baumVorher = holzfaeller ? baeume(holzfaeller) : 0;
    // 4) fünf Spielminuten rechnen, dabei Träger mit Ware zählen
    let maxUnterwegs = 0, maxMitWare = 0;
    for (let i = 0; i < 60; i++) {
      sp.schritte(100);
      const t = sp.sicht.traeger;
      maxUnterwegs = Math.max(maxUnterwegs, t.length);
      maxMitWare = Math.max(maxMitWare, t.filter((x) => x.ware >= 0).length);
    }
    const fertig = sp.sicht.gebaeude.filter((g) => g.typ !== 'lager' && g.bau === 1000).map((g) => g.typ);
    return {
      lager: L, gebaut, fertig, baumVorher, wegeGesetzt: wege, segmente: sp.sicht.segmente.length, fahnen: sp.sicht.fahnen.length, tick: sp.sim.tick,
      maxUnterwegs, maxMitWare, statistik: sp.sim.statistik(), innen: sp.sim.pruefeInnenzustand(), pruefsumme: sp.pruefsumme(),
      protokoll: JSON.parse(JSON.stringify(sp.protokoll())), eigenReplay: sp.nachspielen(sp.protokoll()),
      getrennt: sp.sicht.gebaeude.filter((g) => g.getrennt).length,
    };
  });
  info(`Spiel: Lager ${aufbau.lager.q},${aufbau.lager.r}; gebaut ${aufbau.gebaut.map((g) => g.typ).join(', ')}; fertig ${aufbau.fertig.join(', ') || '-'}; ` +
    `Bäume im Holzfäller-Radius beim Bau ${aufbau.baumVorher}; ${aufbau.segmente} Segmente, ${aufbau.fahnen} Fahnen; ` +
    `Tick ${aufbau.tick}; Träger unterwegs max ${aufbau.maxUnterwegs}, mit Ware max ${aufbau.maxMitWare}; Statistik ${JSON.stringify(aufbau.statistik)}`);
  info(`Spiel: Sim-Prüfsumme Kontext 1: ${aufbau.pruefsumme}; Replay im selben Kontext: ${aufbau.eigenReplay}`);
  if (aufbau.gebaut.length < 3) fail(`Spiel: nur ${aufbau.gebaut.length} Gebäude ließen sich bauen (erwartet mindestens 3)`);
  if (aufbau.segmente < 3) fail(`Spiel: nur ${aufbau.segmente} Segmente`);
  if (aufbau.maxUnterwegs < 1) fail('Spiel: kein Träger unterwegs');
  if (aufbau.maxMitWare < 1) fail('Spiel: nie ein Träger mit Ware');
  if (aufbau.fertig.length < 1) fail(`Spiel: nach 5 Spielminuten ist keine Baustelle fertig (gebaut: ${aufbau.gebaut.map((g) => g.typ).join(', ')})`);
  if (aufbau.gebaut.some((g) => g.typ === 'holzfaeller') && aufbau.fertig.includes('holzfaeller') && !(aufbau.statistik.erzeugtJe[0] > 0)) {
    fail(`Spiel: Holzfäller fertig, aber nach 5 Spielminuten kein Stamm erzeugt (${JSON.stringify(aufbau.statistik)})`);
  }
  if (!(aufbau.statistik.angekommen > 0)) fail(`Spiel: keine Ware angekommen (${JSON.stringify(aufbau.statistik)})`);
  if (aufbau.innen.length) fail(`Spiel: Innenzustand widersprüchlich: ${aufbau.innen.join('; ')}`);
  if (aufbau.getrennt) fail(`Spiel: ${aufbau.getrennt} Gebäude ohne Verbindung zum Lager`);
  if (aufbau.eigenReplay !== aufbau.pruefsumme) fail(`Spiel: Replay im selben Browser ${aufbau.eigenReplay} ungleich live ${aufbau.pruefsumme}`);
  if (aufbau.protokoll.karte.pruefsumme !== a1.pruefsumme) fail('Spiel: Karten-Prüfsumme im Protokoll passt nicht zum Ausschnitt');

  // Screenshot nah am Lager (etwa 500 m)
  await page.evaluate((h) => {
    const e = window.eifeler;
    const w = e.grid.toWorld(h);
    e.cam.pitchOverride = 38;
    e.cam.jumpTo(w.x, w.z + 60, 500, 0.3);
    e.settle();
  }, aufbau.lager);
  await page.evaluate(() => new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(ok))));
  await page.waitForTimeout(3000);
  const spielBild = join(AUS, '4-spiel-lager-nah.png');
  await page.screenshot({ path: spielBild, timeout: 180000 });
  const kbSpiel = Math.round(statSync(spielBild).size / 1024);
  info(`Screenshot ${spielBild} (${kbSpiel} KB)`);
  if (kbSpiel < 20) fail(`Spiel-Screenshot verdächtig klein (${kbSpiel} KB)`);

  // Replay in einem zweiten, frischen Browser-Kontext mit derselben Karten-Adresse und eigener Karte
  {
    const ctx2 = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const page2 = await ctx2.newPage();
    page2.on('pageerror', (e) => seitenfehler.push(`pageerror (Kontext 2): ${e.message}`));
    await page2.goto(url);
    await page2.waitForFunction(() => window.eifeler?.spiel, null, { timeout: 600000, polling: 500 });
    const r2 = await page2.evaluate((p) => ({ summe: window.eifeler.spiel.nachspielen(p), karte: window.eifeler.ausschnitt.pruefsumme }), aufbau.protokoll);
    await ctx2.close();
    info(`Replay in zweitem Kontext: Sim-Prüfsumme ${r2.summe} (Karte ${r2.karte})`);
    if (r2.karte !== a1.pruefsumme) fail(`Kontext 2 hat eine andere Karten-Prüfsumme: ${r2.karte}`);
    if (r2.summe !== aufbau.pruefsumme) fail(`Replay Kontext 2 ${r2.summe} ungleich Kontext 1 ${aufbau.pruefsumme}`);
  }

  // ---- M4 Bedienung: Baumenü, Geist, Bauplätze, echte Mausklicks, Gebäudekarte mit Priorität, Handy-Ansicht (Screenshots 5 bis 9)
  await page.goto('about:blank');   // die schwere Szene der Hauptseite nicht weiterrechnen lassen
  await bedienungsTest({ browser, url, aus: AUS, info, fail });

  for (const s of seitenfehler) fail(s);
} catch (e) {
  fail(e.stack ?? String(e));
} finally {
  await browser?.close().catch(() => undefined);
  await vite?.close().catch(() => undefined);
}

if (fehler.length) {
  console.error(`\nSMOKE FEHLGESCHLAGEN (${fehler.length} Fehler)`);
  process.exit(1);
}
console.log('\nSMOKE OK');
process.exit(0);
