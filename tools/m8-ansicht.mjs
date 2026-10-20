// Hilfsskript (M8): stellt alle neuen Gebäude, Boten und verlorene Waren ans Lager und macht Screenshots im Sommer und im Winter.
// Aufruf: node tools/m8-ansicht.mjs [Ausgabeordner]
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { chromium } from 'playwright';
import { createServer } from 'vite';

const WURZEL = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const AUS = resolve(process.argv[2] ?? join(WURZEL, 'test-results', 'm8'));
mkdirSync(AUS, { recursive: true });
const vite = await createServer({ root: WURZEL, logLevel: 'warn', server: { port: 5191, strictPort: true, host: '127.0.0.1' } });
await vite.listen();
const exe = existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined;
const browser = await chromium.launch({ headless: false, executablePath: exe, args: ['--headless=new', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('pageerror', (e) => console.log('pageerror', e.message));
  // Ausschnitt wie im Rauchtest: ein passender Vorschlag oder ein Ort aus den Daten
  const basis = 'http://127.0.0.1:5191/';
  const hol = async (pfad) => (await fetch(new URL(pfad, basis))).json();
  const version = (await hol('welt/versions.json')).aktuell;
  const manifest = await hol(`welt/${version}/manifest.json`);
  const orte = await hol(`welt/${version}/orte.json`);
  const b = await build({
    stdin: { contents: `export { ausschnittMoeglich, klemmeAusschnitt } from './src/welt/ausschnitt.ts';\nexport { VORSCHLAEGE } from './src/map/presets.ts';`, resolveDir: WURZEL, loader: 'ts' },
    bundle: true, format: 'esm', platform: 'node', write: false, define: { 'import.meta.env': '{}' }, logLevel: 'error',
  });
  const L = await import(`data:text/javascript;base64,${Buffer.from(b.outputFiles[0].text).toString('base64')}`);
  const v = L.VORSCHLAEGE.find((x) => L.ausschnittMoeglich(manifest, x.q, x.r, x.size));
  let p;
  if (v) p = { version, q: v.q, r: v.r, size: v.size };
  else {
    const ort = orte.orte.find((o) => o[5] !== undefined && o[1] !== undefined && orte.kinds[o[1]] !== 'gewaesser');
    p = L.klemmeAusschnitt(manifest, { version, q: ort[5], r: ort[6], size: 'klein' });
  }
  await page.goto(`${basis}#v=${p.version}&q=${p.q}&r=${p.r}&g=${p.size}`);
  await page.waitForFunction(() => window.eifeler?.spiel, null, { timeout: 600000, polling: 500 });
  await page.evaluate(() => window.eifeler.skipIntro());
  const info = await page.evaluate(() => {
    const sp = window.eifeler.spiel, sim = sp.sim;
    sp.pause(true);
    sim.doerfer[0].stufe = 3;
    const L = sp.lagerHex;
    const dist = (a, b) => (Math.abs(a.q - b.q) + Math.abs(a.r - b.r) + Math.abs(a.q + a.r - b.q - b.r)) / 2;
    const typen = ['lagerhaus', 'gerstenfeld', 'brauerei', 'wacholderheide', 'brennerei', 'schaenke', 'erzgrube', 'koehlerei', 'eisenhuette', 'schmiede', 'kirmesplatz'];
    const gebaut = [];
    for (const typ of typen) {
      let best = null;
      for (let d = 2; d <= 9 && !best; d++) for (let dq = -d; dq <= d && !best; dq++) for (let dr = -d; dr <= d && !best; dr++) {
        const c = { q: L.q + dq, r: L.r + dr };
        if (dist(c, L) === d && sim.kannBauen(typ, c.q, c.r)) best = c;
      }
      if (!best) continue;
      sim.gebaeudeErzeugen(typ, sim.karte.index(best.q, best.r), true, 0);
      gebaut.push(typ);
    }
    // drei Boten mit verschiedenem Pegel und zwei verlorene Waren
    const k = sim.karte, h0 = k.index(L.q, L.r);
    for (let i = 0; i < 3; i++) {
      const ziel = k.index(L.q + 4 - i * 4, L.r + 3);
      const route = sim.torkelPfad(h0, ziel) ?? [h0];
      sim.boten.set(9000 + i, { id: 9000 + i, sp: 0, schaenke: 0, bis: sim.tick + [3500, 2400, 1000][i], phase: 2, route, ri: 1, t: 0, dauer: 400, art: [13, 15, 19][i], ziel: 0, lager: 0, faellt: -1 });
    }
    sim.liegend.push({ h: k.index(L.q + 2, L.r - 1), art: 15, sp: 0, bis: sim.tick + 99999, bote: 0 }, { h: k.index(L.q - 2, L.r + 1), art: 19, sp: 0, bis: sim.tick + 99999, bote: 0 });
    sp.schritte(2);
    return { L, gebaut };
  });
  console.log('gebaut', info.gebaut.join(', '));
  const kamera = async () => {
    await page.evaluate((h) => { const e = window.eifeler; const w = e.grid.toWorld(h); e.cam.pitchOverride = 40; e.cam.jumpTo(w.x, w.z + 60, 700, 0.3); e.settle(); }, info.L);
    await page.evaluate(() => new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(ok))));
    await page.waitForTimeout(4000);
  };
  await kamera();
  await page.screenshot({ path: join(AUS, 'm8-sommer.png'), timeout: 180000 });
  // Winter: Tick in den Winter setzen
  await page.evaluate(() => { const sp = window.eifeler.spiel; sp.sim._tick = 3 * 18000 + 3000; sp.schritte(2); });
  await kamera();
  await page.screenshot({ path: join(AUS, 'm8-winter.png'), timeout: 180000 });
  // Nah an einem Boten
  await page.evaluate(() => { const e = window.eifeler, b = e.spiel.sicht.boten[0]; const w = e.grid.toWorld(b.von); e.cam.pitchOverride = 30; e.cam.jumpTo(w.x, w.z + 20, 160, 0.3); e.settle(); });
  await page.waitForTimeout(4000);
  await page.screenshot({ path: join(AUS, 'm8-bote.png'), timeout: 180000 });
  console.log('Screenshots in', AUS);
} finally {
  await browser.close();
  await vite.close();
}
