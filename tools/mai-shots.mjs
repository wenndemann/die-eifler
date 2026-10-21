// Mai-Bilder (ROADMAP M14): Spiel auf der echten Karte, Kirmesplatz und Junggesellenverein am Lager, dann in die Mainacht springen:
// Maibaum mit Wache, Fenster des Vereins, Maijungen mit geklautem Baum, Burschen torkeln nach dem Bier heim.
// Aufruf: node tools/mai-shots.mjs <Ausgabeordner>
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { chromium } from 'playwright';
import { createServer } from 'vite';

const WURZEL = '/home/user/die-eifler';
const AUS = resolve(process.argv[2]);
mkdirSync(AUS, { recursive: true });
const vite = await createServer({ root: WURZEL, logLevel: 'warn', server: { port: 5197, strictPort: true, host: '127.0.0.1', hmr: false, watch: null } });
await vite.listen();
const exe = existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined;
const browser = await chromium.launch({ headless: false, executablePath: exe, args: ['--headless=new', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('pageerror', (e) => console.log('pageerror', e.message));
  // Ausschnitt wie im Rauchtest: ein passender Vorschlag oder ein Ort aus den Daten
  const basis = 'http://127.0.0.1:5197/';
  const hol = async (pfad) => (await fetch(new URL(pfad, basis))).json();
  const version = (await hol('welt/versions.json')).aktuell;
  const manifest = await hol(`welt/${version}/manifest.json`);
  const orte = await hol(`welt/${version}/orte.json`);
  const b = await build({
    stdin: { contents: `export { ausschnittMoeglich, klemmeAusschnitt } from './src/welt/ausschnitt.ts';\nexport { VORSCHLAEGE } from './src/map/presets.ts';`, resolveDir: WURZEL, loader: 'ts' },
    bundle: true, format: 'esm', platform: 'node', write: false, define: { 'import.meta.env': '{}' }, logLevel: 'error',
  });
  const L = await import(`data:text/javascript;base64,${Buffer.from(b.outputFiles[0].text).toString('base64')}`);
  const v = L.VORSCHLAEGE.find((x) => L.ausschnittMoeglich(manifest, x.q, x.r, x.size));
  let p;
  if (v) p = { version, q: v.q, r: v.r, size: v.size };
  else {
    const ort = orte.orte.find((o) => o[5] !== undefined && o[1] !== undefined && orte.kinds[o[1]] !== 'gewaesser');
    p = L.klemmeAusschnitt(manifest, { version, q: ort[5], r: ort[6], size: 'klein' });
  }
  await page.goto(`${basis}#v=${p.version}&q=${p.q}&r=${p.r}&g=${p.size}`);
  await page.waitForFunction(() => window.eifeler?.spiel, null, { timeout: 600000, polling: 500 });
  await page.evaluate(() => window.eifeler.skipIntro());



  await page.addStyleTag({ content: '.meldeleiste { display: none !important; }' });
  const goods = JSON.parse(readFileSync(join(WURZEL, 'data', 'goods.json'), 'utf8'));
  const liste = goods.waren ?? goods.goods ?? goods;
  const idx = (id) => liste.findIndex((x) => x.id === id);
  const W = [[idx('stamm'), 6], [idx('landbier'), 30], [idx('bratkartoffeln'), 10]];
  const info = await page.evaluate(({ MAI_AB, W }) => {
    const e = window.eifeler, sp = e.spiel, sim = sp.sim, L = sp.lagerHex;
    sp.pause(true);
    const dist = (a, b) => (Math.abs(a.q - b.q) + Math.abs(a.r - b.r) + Math.abs(a.q + a.r - b.q - b.r)) / 2;
    const ids = {};
    for (const typ of ['kirmesplatz', 'junggesellen', 'wohnhaus', 'brauerei']) {
      let best = null;
      for (let d = 2; d <= 8 && !best; d++) for (let dq = -d; dq <= d && !best; dq++) for (let dr = -d; dr <= d && !best; dr++) {
        const c = { q: L.q + dq, r: L.r + dr };
        if (dist(c, L) === d && sim.kannBauen(typ, c.q, c.r)) {
          const fs = sp.sicht.fahnen.slice().sort((a, b) => dist(a, c) - dist(b, c)).slice(0, 6);
          const von = fs.find((f) => sim.wegVorschau(f, c));
          if (von) best = { c, von };
        }
      }
      if (!best) continue;
      ids[typ] = sim.gebaeudeErzeugen(typ, sim.karte.index(best.c.q, best.c.r), true, 0).id;
      sp.schritte(1);
      const p = sim.wegVorschau(best.von, best.c);
      if (p) sp.befehl({ art: 'weg', pfad: p });
      sp.schritte(2);
    }
    // in die Mainacht springen: Stand ändern und neu laden
    const st = sim.stand();
    st.zahlen[0] = MAI_AB - 40;
    const d = st.doerfer[0]; d.stufe = 1; d.maiJungen = 6; d.frei -= 6; d.bewohner += 20; d.frei += 20;
    for (const g of st.gebaeude) if (g.vorrat) for (const [a, n] of W) g.vorrat[a] += n;
    const s0 = sp.sicht;
    const kp = s0.gebaeude.find((g) => g.id === ids.kirmesplatz) ?? s0.gebaeude.find((g) => g.typ === 'lager');
    const orte = s0.orte.map((o, i) => ({ i, o, d: dist(o, kp) })).sort((a, b) => a.d - b.d);
    // Burschen aus dem nächsten Ort kommen später in der Nacht
    const heim = sim.karte.index(orte[0].o.q, orte[0].o.r);
    st.mai = { trupps: [{ id: st.zahlen[2], sp: -1, ziel: 0, n: 3, phase: 0, ab: MAI_AB + 400, heim, route: [], ri: 0, t: 0, dauer: 0 }] };
    st.zahlen[2] += 1;
    const neu = sim.constructor.ausStand(e.ausschnitt.hex, st);
    sp.simErsetzt(neu);
    return { ids, kp: { q: kp.q, r: kp.r }, ort: orte[1] ? orte[1].i : orte[0].i };
  }, { MAI_AB: 12000, W });
  console.log('Szene', JSON.stringify(info));
  await page.evaluate(() => { const sp = window.eifeler.spiel; sp.schritte(60); sp.befehl({ art: 'mai', was: 'stellen' }); sp.befehl({ art: 'mai', was: 'wache', n: 3 }); sp.schritte(6); });
  const zu = async (q, r, abstand, pitch, dz = 0, dx = 0) => {
    await page.evaluate(({ q, r, abstand, pitch, dz, dx }) => { const e = window.eifeler; const w = e.grid.toWorld({ q, r }); e.cam.pitchOverride = pitch; e.cam.jumpTo(w.x + dx, w.z + dz, abstand, 0.5); e.settle(); }, { q, r, abstand, pitch, dz, dx });
    await page.waitForTimeout(4000);
  };
  const bild = async (name) => { await page.screenshot({ path: join(AUS, name), timeout: 180000 }); console.log(name, JSON.stringify(await page.evaluate(() => { const s = window.eifeler.spiel.sicht; return { mai: s.dorf.mai, nacht: s.mainacht, trupps: s.trupps }; }))); };
  await zu(info.kp.q, info.kp.r, 260, 32, 40, 10); await bild('mai-1-maibaum-wache.png');
  await zu(info.kp.q, info.kp.r, 700, 45, 80); await bild('mai-2-uebersicht-nacht.png');
  await page.evaluate((id) => window.eifeler.spiel.oeffneGebaeude(id), info.ids.junggesellen);
  await page.waitForTimeout(1500); await bild('mai-3-verein-fenster.png');
  await page.keyboard.press('Escape');
  // Wache weg, Bier an; eigene Maijungen klauen im Nachbarort
  await page.evaluate((ort) => { const sp = window.eifeler.spiel; sp.befehl({ art: 'mai', was: 'wache', n: 0 }); sp.befehl({ art: 'mai', was: 'bier', an: true }); sp.befehl({ art: 'mai', was: 'klau', ziel: -1 - ort, n: 4 }); sp.schritte(4); }, info.ort);
  const warte = async (fn, max = 400) => { for (let i = 0; i < max; i++) { const t = await page.evaluate(fn); if (t) return t; await page.evaluate(() => window.eifeler.spiel.schritte(15)); } return null; };
  const mitBaum = await warte(() => (window.eifeler.spiel.sicht.trupps ?? []).find((x) => x.sp === 0 && x.phase === 1));
  if (mitBaum) { await zu(mitBaum.von.q, mitBaum.von.r, 240, 30, 30); await bild('mai-4-maijungen-mit-baum.png'); }
  const torkelt = await warte(() => (window.eifeler.spiel.sicht.trupps ?? []).find((x) => x.sp === -1 && x.phase === 3));
  if (torkelt) { await zu(torkelt.von.q, torkelt.von.r, 220, 30, 30); await bild('mai-5-burschen-torkeln.png'); }
} finally { await browser.close(); await vite.close(); }
