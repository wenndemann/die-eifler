// Prüfskript Wald und Wild: Jagdhütte mit Hochsitz am Waldrand, Wildküche, Schafstall mit Herdenschutzhund (sofort fertig), dann das
// Wild der Simulation (Rehe, Wildschweine, Wolf, Wildkatze) und den Jäger nah ansehen.  Aufruf: node tools/_jagd.mjs test-results/jagd.png
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const wurzel = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const aus = process.argv[2] ?? 'test-results/jagd.png';
const vite = await createServer({ root: wurzel, logLevel: 'warn', server: { port: 5213, strictPort: true, host: '127.0.0.1', hmr: false, watch: null } });
await vite.listen();
const browser = await chromium.launch({ headless: false, executablePath: '/opt/pw-browsers/chromium', args: ['--headless=new', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (e) => console.log('pageerror', e.message));
await page.goto('http://127.0.0.1:5213/#v=eifel-2026.10&q=152&r=458&g=klein&o=152,458,H%C3%B6fen');
await page.waitForFunction(() => window.eifeler?.spiel, null, { timeout: 600000, polling: 500 });
await page.evaluate(() => window.eifeler.skipIntro());
await page.addStyleTag({ content: '.meldeleiste, .einfuehrung, .meldung, .kampagne-panel, .kalle { display: none !important; }' });
const r = await page.evaluate(async () => {
  const e = window.eifeler, sp = e.spiel, sim = sp.sim, L = sp.lagerHex, k = sim.karte;
  sim.doerfer[0].stufe = 1;
  const gebaut = [];
  const baue = (typ, gut) => {
    for (let d = 2; d <= 10; d++) for (let j = 0; j < 6 * d; j++) {
      const a = (j / (6 * d)) * Math.PI * 2, w = e.grid.toWorld(L), h = e.grid.fromWorld(w.x + Math.cos(a) * d * 104, w.z + Math.sin(a) * d * 104);
      if (!sim.kannBauen(typ, h.q, h.r, 0) || (gut && !gut(k.index(h.q, h.r)))) continue;
      const f = sim.sicht(0).fahnen.filter((x) => x.sp === 0).sort((x, y) => Math.hypot(x.q - h.q, x.r - h.r) - Math.hypot(y.q - h.q, y.r - h.r))[0];
      const weg = sim.wegAbschnitt(h, f, [], 12, 0, true);
      if (!weg) continue;
      sim.befehl(sim.tick, 0, { art: 'gebaeude', typ, q: h.q, r: h.r });
      sim.befehl(sim.tick, 0, { art: 'weg', pfad: weg });
      sp.schritte(1);
      gebaut.push({ typ, ...h });
      return { typ, ...h };
    }
    return null;
  };
  // Jagdhütte am Waldrand: im Umkreis 3 viel Wild
  const wildUm = (i) => { let n = 0; for (let x = 0; x < k.count; x++) if (k.abstand(i, x) <= 3) n += sim.reh[x] + sim.sau[x]; return n; };
  baue('jagdhuette', (i) => wildUm(i) >= 3) ?? baue('jagdhuette');
  baue('schafstall'); baue('herdenschutzhund'); baue('kartoffelfeld'); baue('wildkueche');
  for (const g of sim.gebaeude.values()) if (!g.fertig) { g.fertig = 1; g.verbaut = sim.kosten(g.typ); g.planIst = g.planSoll; g.stapel.fill(0); g.incoming.fill(0); g.getrennt = false; }
  sim.doerfer[0].frei += 10; sim.doerfer[0].bewohner += 10;
  sp.schritte(20 * 60);
  // nächste Hexe mit Wild der Simulation (für die Nahansicht)
  const j = gebaut[0], ji = k.index(j.q, j.r);
  const nah = (a) => { let b = -1; for (let x = 0; x < k.count; x++) if (a[x] && (b < 0 || k.abstand(ji, x) < k.abstand(ji, b))) b = x; return b < 0 ? null : { q: k.qs[b], r: k.rs[b] }; };
  return { gebaut, reh: nah(sim.reh), sau: nah(sim.sau), wolf: nah(sim.wolf), katze: nah(sim.katze), wild: sim.sicht(0).dorf.wild };
});
console.log(JSON.stringify(r));
const bild = async (name, g, hoehe, pitch, dz = 60) => {
  if (!g) return;
  await page.evaluate(([g, hoehe, pitch, dz]) => { const e = window.eifeler, w = e.grid.toWorld(g); e.cam.pitchOverride = pitch; e.cam.jumpTo(w.x, w.z + dz, hoehe, 0.6); e.settle(); }, [g, hoehe, pitch, dz]);
  await page.waitForTimeout(5000);
  await page.screenshot({ path: aus.replace('.png', `-${name}.png`), timeout: 300000 });
  console.log(name, JSON.stringify(await page.evaluate(() => window.eifeler.spiel.wild.zahlen)));
};
await bild('jagdhuette', r.gebaut[0], 300, 36);
await bild('schafstall', r.gebaut.find((x) => x.typ === 'schafstall'), 330, 38);
await bild('reh', r.reh, 220, 32, 30);
await bild('sau', r.sau, 220, 32, 30);
await bild('wolf', r.wolf, 220, 32, 30);
await bild('wildkatze', r.katze, 180, 30, 25);
await browser.close(); await vite.close();
