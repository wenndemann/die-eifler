// Prüfskript: einen Weg vom Lager über den nächsten Bach oder Fluss legen und die Brücke nah ansehen; dazu einen Kirmesplatz mit Weg
import { chromium } from 'playwright';
import { createServer } from 'vite';
const aus = process.argv[2];
const vite = await createServer({ root: '/home/user/die-eifler', logLevel: 'warn', server: { port: 5209, strictPort: true, host: '127.0.0.1', hmr: false, watch: null } });
await vite.listen();
const browser = await chromium.launch({ headless: false, executablePath: '/opt/pw-browsers/chromium', args: ['--headless=new', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (e) => console.log('pageerror', e.message));
await page.goto('http://127.0.0.1:5209/#v=eifel-2026.10&q=152&r=458&g=klein&o=152,458,H%C3%B6fen');
await page.waitForFunction(() => window.eifeler?.spiel, null, { timeout: 600000, polling: 500 });
await page.evaluate(() => window.eifeler.skipIntro());
await page.addStyleTag({ content: '.meldeleiste, .einfuehrung, .meldung, .kampagne-panel, .kalle { display: none !important; }' });
const r = await page.evaluate(() => {
  const e = window.eifeler, sp = e.spiel, sim = sp.sim, L = sp.lagerHex;
  // nächster Flusspunkt zum Lager
  const w = e.grid.toWorld(L);
  let best = null;
  for (const f of e.map.rivers) for (let i = 0; i + 2 < f.p.length; i += 3) {
    const d = Math.hypot(f.p[i] - w.x, f.p[i + 1] - w.z);
    if (d > 60 && d < 400 && (!best || d < best.d)) best = { d, x: f.p[i], z: f.p[i + 1] };
  }
  if (!best) return null;
  // Ziel: Hex jenseits des Flusses (vom Lager aus gesehen)
  const dx = best.x - w.x, dz = best.z - w.z, l = Math.hypot(dx, dz);
  const ziel = e.grid.fromWorld(best.x + (dx / l) * 60, best.z + (dz / l) * 60);
  const start = sim.sicht(0).fahnen.filter((f) => f.sp === 0).sort((a, b) => Math.hypot(e.grid.toWorld(a).x - best.x, e.grid.toWorld(a).z - best.z) - Math.hypot(e.grid.toWorld(b).x - best.x, e.grid.toWorld(b).z - best.z))[0];
  const pf = sim.wegVorschau(start, ziel, 0);
  if (pf) sim.befehl(sim.tick, 0, { art: 'weg', pfad: pf });
  sp.schritte(2);
  e.cam.pitchOverride = 35; e.cam.jumpTo(best.x, best.z + 40, 260, 0.6); e.settle();
  return { fluss: best, weg: pf?.length ?? 0 };
});
await page.waitForTimeout(6000);
console.log(JSON.stringify(r), await page.evaluate(() => window.eifeler.spiel["wege"].anzahlBruecken));
await page.screenshot({ path: aus, timeout: 300000 });
await browser.close(); await vite.close();
