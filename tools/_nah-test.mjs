// Prüfskript: ein Gebäude nah ansehen (Typ als Argument), Leben auf „arbeitet“, optional Martinsfeuer
import { chromium } from 'playwright';
import { createServer } from 'vite';
const [aus, typ, tag = '0.45', fest = ''] = process.argv.slice(2);
const vite = await createServer({ root: '/home/user/die-eifler', logLevel: 'warn', server: { port: 5203, strictPort: true, host: '127.0.0.1', hmr: false, watch: null } });
await vite.listen();
const browser = await chromium.launch({ headless: false, executablePath: '/opt/pw-browsers/chromium', args: ['--headless=new', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (e) => console.log('pageerror', e.message));
await page.goto('http://127.0.0.1:5203/#v=eifel-2026.10&q=152&r=458&g=klein&o=152,458,H%C3%B6fen');
await page.waitForFunction(() => window.eifeler?.spiel, null, { timeout: 600000, polling: 500 });
await page.evaluate(() => window.eifeler.skipIntro());
await page.addStyleTag({ content: '.meldeleiste, .einfuehrung, .meldung { display: none !important; }' });
const r = await page.evaluate(async ({ typ, tag, fest }) => {
  const e = window.eifeler, sp = e.spiel, L = sp.lagerHex, sim = sp.sim;
  const dist = (a, b) => (Math.abs(a.q - b.q) + Math.abs(a.r - b.r) + Math.abs(a.q + a.r - b.q - b.r)) / 2;
  let ziel = null;
  for (let d = 3; d <= 8 && !ziel; d++) for (let dq = -d; dq <= d && !ziel; dq++) for (let dr = -d; dr <= d && !ziel; dr++) {
    const c = { q: L.q + dq, r: L.r + dr };
    if (dist(c, L) === d && sim.kannBauen('wohnhaus', c.q, c.r, 0)) ziel = c;
  }
  sim.gebaeudeErzeugen(typ, sim.karte.index(ziel.q, ziel.r), true, 0);
  sp.schritte(2);
  const { KLEINE_FESTE } = await import('/src/sim/daten.ts');
  const nr = KLEINE_FESTE.findIndex((f) => f.id === fest);
  const l = sp.leben, orig = l.update.bind(l);
  l.update = (s, dt, lg) => orig({ ...s, gebaeude: s.gebaeude.map((g) => (g.bau >= 1000 ? { ...g, zustand: 'arbeitet' } : g)), dorf: nr >= 0 ? { ...s.dorf, fest: { nr, liste: [], laeuft: 500, geliefert: [] } } : s.dorf }, dt, lg);
  sp.wetterVorgabe = { tag: Number(tag) };
  const g = sp.sicht.gebaeude.find((x) => x.typ === typ);
  const lg = sp.gebaeude.modellLage(g.id, g.typ);
  e.cam.pitchOverride = 32; e.cam.jumpTo(lg.x + 10, lg.z + 20, 150, 0.5); e.settle();
  return ziel;
}, { typ, tag, fest });
await page.waitForTimeout(5000);
console.log(JSON.stringify(r), JSON.stringify(await page.evaluate(() => window.eifeler.spiel.leben.zahlen)));
await page.screenshot({ path: aus });
await browser.close(); await vite.close();
