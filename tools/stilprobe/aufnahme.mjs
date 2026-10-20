// Screenshots der Stilprobe (ROADMAP M8b): je Variante A, B, C eine Übersicht und eine Nahaufnahme der Figuren.
// Aufruf: node tools/stilprobe/aufnahme.mjs [Ausgabeordner]
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createServer } from 'vite';

const WURZEL = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const AUS = resolve(process.argv[2] ?? join(WURZEL, 'test-results', 'stilprobe'));
mkdirSync(AUS, { recursive: true });
const vite = await createServer({ root: WURZEL, logLevel: 'warn', server: { port: 5192, strictPort: true, host: '127.0.0.1' } });
await vite.listen();
const exe = existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined;
const browser = await chromium.launch({ headless: false, executablePath: exe, args: ['--headless=new', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('pageerror', (e) => console.log('pageerror', e.message));
  for (const v of ['a', 'b', 'c']) for (const nah of [0, 1]) {
    await page.goto(`http://127.0.0.1:5192/tools/stilprobe/index.html?v=${v}&nah=${nah}`);
    await page.waitForFunction(() => window.stilFertig, null, { timeout: 120000 });
    await page.waitForTimeout(500);
    const datei = join(AUS, `stil-${v}${nah ? '-nah' : ''}.png`);
    await page.screenshot({ path: datei });
    console.log(datei);
  }
} finally {
  await browser.close();
  await vite.close();
}
