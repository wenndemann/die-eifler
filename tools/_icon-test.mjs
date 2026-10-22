// Prüfskript: Icons aus den Modellen rendern und eines als Bild speichern (Fehler sichtbar machen)
import { writeFileSync } from 'node:fs';
import { chromium } from 'playwright';
import { createServer } from 'vite';
const aus = process.argv[2];
const vite = await createServer({ root: '/home/user/die-eifler', logLevel: 'warn', server: { port: 5204, strictPort: true, host: '127.0.0.1', hmr: false, watch: null } });
await vite.listen();
const browser = await chromium.launch({ headless: false, executablePath: '/opt/pw-browsers/chromium', args: ['--headless=new', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage();
page.on('console', (m) => console.log('console', m.type(), m.text()));
page.on('pageerror', (e) => console.log('pageerror', e.message));
await page.goto(process.env.SPIEL ? 'http://127.0.0.1:5204/#v=eifel-2026.10&q=152&r=458&g=klein&o=152,458,H%C3%B6fen' : 'http://127.0.0.1:5204/tools/stilprobe/index.html');
if (process.env.SPIEL) { await page.waitForFunction(() => window.eifeler?.spiel, null, { timeout: 600000, polling: 500 }); await page.evaluate(() => window.eifeler.skipIntro()); await page.waitForTimeout(20000); }
const r = await page.evaluate(async () => {
  const m = await import('/src/render/icons.ts');
  const t0 = performance.now();
  m.icons();
  await new Promise((ok) => m.wennIconsDa(ok));
  const ms = performance.now() - t0;
  const i = m.icons();
  return { ms, w: i.ware.filter(Boolean).length, g: Object.values(i.gebaeude).filter(Boolean).length, bild: i.gebaeude.wohnhaus ?? null, bild2: i.gebaeude.saegewerk ?? null };
});
console.log(r.w, r.g, Math.round(r.ms), 'ms');
if (r.bild) { writeFileSync(aus, Buffer.from(r.bild.split(',')[1], 'base64')); writeFileSync(aus.replace('.png', '-2.png'), Buffer.from(r.bild2.split(',')[1], 'base64')); }
await browser.close(); await vite.close();
