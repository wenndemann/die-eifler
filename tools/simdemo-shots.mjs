// Screenshots der Sim-Demo (#…&simdemo=1) mit Playwright.
// Aufruf: URL='http://localhost:5199/#v=..&q=..&r=..&g=klein&simdemo=1' node tools/simdemo-shots.mjs <ausgabeordner> '<ansichten-json>'
// Ansicht: name, d (Abstand), yaw, pitch, typ (Gebäudetyp als Ziel, sonst Lager), dx/dz, js (Code vor der Aufnahme), wait, perf.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
const aus = process.argv[2] || 'test-results/simdemo';
mkdirSync(aus, { recursive: true });
const b = await chromium.launch({ headless: false, executablePath: '/opt/pw-browsers/chromium', args: ['--headless=new', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 1600, height: 900 } });
const logs = [];
p.on('console', (m) => logs.push(m.type() + ': ' + m.text()));
p.on('pageerror', (e) => logs.push('ERR ' + e.message));
await p.goto(process.env.URL);
await p.waitForFunction(() => window.eifeler?.simdemo, null, { timeout: 900000, polling: 500 });
await p.evaluate(() => window.eifeler.skipIntro());
const ansichten = JSON.parse(process.argv[3] || '[]');
for (const v of ansichten) {
  await p.evaluate((v) => {
    const e = window.eifeler, d = e.simdemo;
    if (v.js) (0, eval)(`(function(e,d){${v.js}})`)(e, d);
    const info = d.info();
    let ziel = info.lager;
    if (v.typ) { const g = info.gebaeude.find((x) => x.typ === v.typ); if (g) ziel = g.mitte ?? g; }
    e.cam.pitchOverride = v.pitch ?? null;
    e.cam.jumpTo(ziel.x + (v.dx ?? 0), ziel.z + (v.dz ?? 0), v.d, v.yaw ?? 0);
    e.settle();
  }, v);
  await p.waitForTimeout(v.wait ?? 4000);
  await p.screenshot({ path: `${aus}/${v.name}.png`, timeout: 180000 });
  if (v.perf) console.log(v.name, await p.evaluate(async () => {
    const i = window.eifeler.stage.renderer.info.render;
    let n = 0; const t0 = performance.now();
    await new Promise((ok) => { const f = () => { n++; performance.now() - t0 < 3000 ? requestAnimationFrame(f) : ok(); }; f(); });
    return `Draw-Calls ${i.calls}, Dreiecke ${i.triangles}, ${(n / 3).toFixed(1)} fps (Software-Renderer)`;
  }));
}
console.log(logs.slice(0, 20).join('\n'));
await b.close();
