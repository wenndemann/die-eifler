// Prüfskript: Bildzeit (ms je Frame) im Software-Renderer an einer festen Stelle messen; Aufruf: node tools/_fps-test.mjs [Wurzel] [Port]
import { chromium } from 'playwright';
import { createServer } from 'vite';
const wurzel = process.argv[2] ?? '/home/user/die-eifler', port = Number(process.argv[3] ?? 5205);
const vite = await createServer({ root: wurzel, logLevel: 'warn', server: { port, strictPort: true, host: '127.0.0.1', hmr: false, watch: null } });
await vite.listen();
const browser = await chromium.launch({ headless: false, executablePath: '/opt/pw-browsers/chromium', args: ['--headless=new', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto(`http://127.0.0.1:${port}/#v=eifel-2026.10&q=247&r=393&g=gross`);
await page.waitForFunction(() => window.eifeler?.spiel, null, { timeout: 600000, polling: 500 });
await page.evaluate(() => window.eifeler.skipIntro());
await page.waitForTimeout(8000);
for (const d of [500, 1500]) {
  const r = await page.evaluate(async (d) => {
    const e = window.eifeler, L = e.spiel.lagerHex, w = e.grid.toWorld(L);
    e.cam.pitchOverride = 38; e.cam.jumpTo(w.x, w.z + 60, d, 0.3); e.settle();
    await new Promise((ok) => setTimeout(ok, 3000));
    const t = [];
    await new Promise((ok) => { let n = 0, a = performance.now(); const f = () => { const b = performance.now(); t.push(b - a); a = b; if (++n < 8) requestAnimationFrame(f); else ok(); }; requestAnimationFrame(f); });
    const ri = e.stage?.renderer?.info?.render;
    return { ms: Math.round(t.slice(1).reduce((x, y) => x + y, 0) / (t.length - 1)), calls: ri?.calls, dreiecke: ri?.triangles };
  }, d);
  console.log(wurzel, d, JSON.stringify(r));
}
await browser.close(); await vite.close();
