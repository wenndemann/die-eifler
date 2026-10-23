// Prüfskript Höfe und Felder: ein paar Höfe ums Lager bauen (sofort fertig), die Bauern säen und ernten lassen, dann nah ansehen.
// Aufruf: node tools/_hoefe.mjs test-results/hoefe.png
import { chromium } from 'playwright';
import { createServer } from 'vite';
const aus = process.argv[2] ?? 'test-results/hoefe.png';
const vite = await createServer({ root: '/home/user/die-eifler', logLevel: 'warn', server: { port: 5211, strictPort: true, host: '127.0.0.1', hmr: false, watch: null } });
await vite.listen();
const browser = await chromium.launch({ headless: false, executablePath: '/opt/pw-browsers/chromium', args: ['--headless=new', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (e) => console.log('pageerror', e.message));
await page.goto('http://127.0.0.1:5211/#v=eifel-2026.10&q=152&r=458&g=klein&o=152,458,H%C3%B6fen');
await page.waitForFunction(() => window.eifeler?.spiel, null, { timeout: 600000, polling: 500 });
await page.evaluate(() => window.eifeler.skipIntro());
await page.addStyleTag({ content: '.meldeleiste, .einfuehrung, .meldung, .kampagne-panel, .kalle { display: none !important; }' });
const r = await page.evaluate(async () => {
  const e = window.eifeler, sp = e.spiel, sim = sp.sim, L = sp.lagerHex;
  const typen = ['kartoffelfeld', 'gerstenfeld', 'obstwiese', 'wacholderheide', 'weinberg'];
  const gebaut = [];
  const { voelkchenIndex } = await import('/src/sim/voelkchen.ts');
  const dorf = sim.doerfer[0]; dorf.stufe = 2; dorf.vk = voelkchenIndex('ahr');
  for (const typ of typen) {
    let ok = false;
    for (let d = 3; d <= 9 && !ok; d++) for (let k = 0; k < 6 * d && !ok; k++) {
      const a = (k / (6 * d)) * Math.PI * 2 + typen.indexOf(typ) * 1.3;
      const w = e.grid.toWorld(L), h = e.grid.fromWorld(w.x + Math.cos(a) * d * 104, w.z + Math.sin(a) * d * 104);
      if (!sim.kannBauen(typ, h.q, h.r, 0)) continue;
      const s = sim.sicht(0);
      const f = s.fahnen.filter((x) => x.sp === 0).sort((x, y) => Math.hypot(x.q - h.q, x.r - h.r) - Math.hypot(y.q - h.q, y.r - h.r))[0];
      const weg = sim.wegAbschnitt(h, f, [], 12, 0, true);
      if (!weg) continue;
      sim.befehl(sim.tick, 0, { art: 'gebaeude', typ, q: h.q, r: h.r });
      sim.befehl(sim.tick, 0, { art: 'weg', pfad: weg });
      sp.schritte(1);
      gebaut.push({ typ, ...h });
      ok = true;
    }
  }
  // sofort fertig bauen
  for (const g of sim.gebaeude.values()) if (!g.fertig) { g.fertig = 1; g.verbaut = sim.kosten(g.typ); g.planIst = g.planSoll; g.stapel.fill(0); g.incoming.fill(0); g.getrennt = false; }
  dorf.frei += 10; dorf.bewohner += 10;
  sp.schritte(20 * 260);
  window.__gebaut = gebaut;
  return gebaut;
});
console.log(JSON.stringify(r));
const bild = async (name, g, hoehe, pitch, dx = 0, dz = 0) => {
  await page.evaluate(([g, hoehe, pitch, dx, dz]) => { const e = window.eifeler, w = e.grid.toWorld(g); e.cam.pitchOverride = pitch; e.cam.jumpTo(w.x + dx, w.z + dz, hoehe, 0.6); e.settle(); }, [g, hoehe, pitch, dx, dz]);
  await page.waitForTimeout(5000);
  await page.screenshot({ path: aus.replace('.png', `-${name}.png`), timeout: 300000 });
};
for (const g of r) await bild(g.typ, g, 330, 38, 0, 60);
await bild('uebersicht', r[0], 900, 50, 0, 200);
const zahlen = await page.evaluate(() => {
  const s = window.eifeler.spiel.sim.sicht(0);
  let felder = 0; s.natur.feld.forEach((v) => { if (v) felder++; });
  return { felder, hoefe: s.gebaeude.filter((g) => window.__gebaut.some((x) => x.q === g.q && x.r === g.r)).map((g) => `${g.typ}:${g.zustand}:${g.erzeugt}`) };
});
console.log(JSON.stringify(zahlen));
await browser.close(); await vite.close();
