// Rauchtest im echten Browser: Kartenwahl -> Vorschlag -> „Hier siedeln!“ -> Ausschnitt lädt, keine Seitenfehler,
// Screenshots aus drei festen Kamerapositionen, Prüfsumme nach Neuladen gleich, Gegenprobe mit tools/map/pruefsumme.py.
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
