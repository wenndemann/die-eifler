// Screenshots des Clients (Playwright, headless Chromium mit SwiftShader – langsam).
// Aufruf: URL='http://localhost:5191/#rureifel' node tools/shot.mjs <ausgabe-prefix> '[{"place":"Nideggen","d":1500}, ...]'
// Ansicht: place (Ortsname) oder x/z (Ausschnitt-Meter), dz, d (Abstand), yaw, pitch (Grad), js, key, mouse, wait (ms), perf.
import { chromium } from 'playwright';
const out = process.argv[2];
const b = await chromium.launch({ headless: false, executablePath: '/opt/pw-browsers/chromium', args: ['--headless=new', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
// MOBILE=1 für Handy-Ansicht mit Touch
const mobile = !!process.env.MOBILE;
const p = await b.newPage(mobile
  ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }
  : { viewport: { width: 1600, height: 900 } });
const logs = [];
p.on('console', (m) => logs.push(m.type() + ': ' + m.text()));
p.on('pageerror', (e) => logs.push('ERR ' + e.message));
await p.goto(process.env.URL || 'http://localhost:5173/');
// Warten, bis der Ausschnitt geladen ist; Kamerafahrt überspringen
await p.waitForFunction(() => window.eifeler, null, { timeout: 900000, polling: 500 });
await p.evaluate(() => window.eifeler.skipIntro());
console.log('Prüfsumme', await p.evaluate(() => window.eifeler.ausschnitt.pruefsumme), 'Ladezeit', await p.evaluate(() => Math.round(window.eifeler.ladezeit)), 'ms');
const views = JSON.parse(process.argv[3] || '[{}]');
let n = 0;
for (const v of views) {
  if (v.d !== undefined) {
    await p.evaluate((v) => {
      const e = window.eifeler;
      const pl = v.place ? e.map.info.places.find((q) => q.name === v.place) : null;
      const x = pl ? pl.x : v.x, z = (pl ? pl.z : v.z) + (v.dz || 0);
      e.cam.pitchOverride = v.pitch ?? null;
      e.cam.jumpTo(x, z, v.d, v.yaw ?? 0);
      e.settle();
    }, v);
  }
  if (v.js) await p.evaluate(v.js);
  if (v.key) await p.keyboard.press(v.key);
  if (v.mouse) await p.mouse.move(v.mouse[0], v.mouse[1]);
  await p.waitForTimeout(v.wait || 10000);
  if (v.perf) console.log('PERF', n, await p.evaluate(() => document.querySelector('.perf')?.textContent));
  await p.screenshot({ path: `${out}-${n++}.png`, timeout: 180000 });
}
console.log(logs.slice(0, 20).map((l) => l.slice(0, 1500)).join('\n'));
await b.close();
