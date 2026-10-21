// Bildstrecke (ROADMAP M9, STIL.md §8): feste Szene auf der echten Karte (feste Saat), ein Dorf mit allen Gebäuden, Wegen, Trägern,
// Boten und Waren, dann feste Kamerapositionen: Übersicht, Dorf, Gebäude nah, Figuren nah, Fenster, Fest, Winter und eine Bildfolge
// eines laufenden Trägers. Grundlage für die Gutachter-Agenten. Aufruf: node tools/bildstrecke.mjs [Ausgabeordner]
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { chromium } from 'playwright';
import { createServer } from 'vite';

const WURZEL = '/home/user/die-eifler';
const AUS = resolve(process.argv[2]);
mkdirSync(AUS, { recursive: true });
const vite = await createServer({ root: WURZEL, logLevel: 'warn', server: { port: 5194, strictPort: true, host: '127.0.0.1', hmr: false, watch: null } });
await vite.listen();
const exe = existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined;
const browser = await chromium.launch({ headless: false, executablePath: exe, args: ['--headless=new', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('pageerror', (e) => console.log('pageerror', e.message));
  // Ausschnitt wie im Rauchtest: ein passender Vorschlag oder ein Ort aus den Daten
  const basis = 'http://127.0.0.1:5194/';
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


  await page.addStyleTag({ content: '.meldeleiste, .meldungen { display: none !important; }' });
  const LH = await page.evaluate(() => window.eifeler.spiel.lagerHex);
  const faelle = JSON.parse(process.argv[3] ?? '[]');
  for (const f of faelle) {
    await page.evaluate(({ LH, f }) => { const e = window.eifeler; e.spiel.wetterVorgabe = f.v; const w = e.grid.toWorld(LH); e.cam.pitchOverride = f.pitch ?? 45; e.cam.jumpTo(w.x, w.z + 100, f.abstand ?? 1500, 0.3); e.settle(); }, { LH, f });
    await page.waitForTimeout(4000);
    await page.screenshot({ path: join(AUS, f.name + '.png'), timeout: 180000 }); console.log(f.name);
  }
} finally { await browser.close(); await vite.close(); }
