import { chromium } from 'playwright';
const out = process.argv[2];
const b = await chromium.launch({ headless: false, executablePath: '/opt/pw-browsers/chromium', args: ['--headless=new', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
// URL=… für andere Karten (?map=rureifel), MOBILE=1 für Handy-Ansicht mit Touch
const mobile = !!process.env.MOBILE;
const p = await b.newPage(mobile
  ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }
  : { viewport: { width: 1600, height: 900 } });
const logs = [];
p.on('console', (m) => logs.push(m.type() + ': ' + m.text()));
p.on('pageerror', (e) => logs.push('ERR ' + e.message));
await p.goto(process.env.URL || 'http://localhost:5173/');
await p.waitForTimeout(15000);
const views = JSON.parse(process.argv[3] || '[{}]');
let n = 0;
for (const v of views) {
  if (v.x !== undefined) await p.evaluate((v) => { const e = window.eifeler; const pl = e.map.info.places.find(p=>p.name===v.place); e.cam.lookAt(pl ? pl.x : v.x, pl ? pl.z + (v.dz||0) : v.z, true); e.cam.setDistance(v.d); e.cam.distance = v.d; if (v.yaw!==undefined) {e.cam.goal.yaw=v.yaw; e.cam.yaw=v.yaw;} }, v);
  if (v.key) await p.keyboard.press(v.key);
  if (v.mouse) await p.mouse.move(v.mouse[0], v.mouse[1]);
  await p.waitForTimeout(v.wait || 8000);
  await p.screenshot({ path: `${out}-${n++}.png` });
}
console.log(logs.slice(0, 20).map((l) => l.slice(0, 1500)).join('\n'));
await b.close();
