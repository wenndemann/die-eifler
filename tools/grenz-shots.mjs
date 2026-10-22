// Grenzland-Bilder (ROADMAP M15): Monschau an der belgischen Grenze, zwei Dörfer (das zweite im Nachbarort), Finderhütte und Fundbüro
// am Lager. Nachts trägt der Finder einen Grenzstein über die Grenze (Figur mit Stein), danach spukt es am versetzten Stein; am Tag das
// Zollhaus mit Zöllner und ein Finder mit dem Kaffeesack; dazu die Fenster (Finderhütte, Fundbüro, Zollhaus, Lager, Warenverteilung).
// Aufruf: node tools/grenz-shots.mjs <Ausgabeordner> [Ort, Standard Monschau]
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { build } from 'esbuild';
import { chromium } from 'playwright';
import { createServer } from 'vite';

const WURZEL = '/home/user/die-eifler';
const AUS = resolve(process.argv[2] ?? 'test-results/grenzland');
const ORT = process.argv[3] ?? 'Monschau';
mkdirSync(AUS, { recursive: true });
const vite = await createServer({ root: WURZEL, logLevel: 'warn', server: { port: 5198, strictPort: true, host: '127.0.0.1', hmr: false, watch: null } });
await vite.listen();
const exe = existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined;
const browser = await chromium.launch({ headless: false, executablePath: exe, args: ['--headless=new', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('pageerror', (e) => console.log('pageerror', e.message));
  const basis = 'http://127.0.0.1:5198/';
  const hol = async (pfad) => (await fetch(new URL(pfad, basis))).json();
  const version = (await hol('welt/versions.json')).aktuell;
  const manifest = await hol(`welt/${version}/manifest.json`);
  const orte = await hol(`welt/${version}/orte.json`);
  const b = await build({
    stdin: { contents: `export { klemmeAusschnitt } from './src/welt/ausschnitt.ts';`, resolveDir: WURZEL, loader: 'ts' },
    bundle: true, format: 'esm', platform: 'node', write: false, define: { 'import.meta.env': '{}' }, logLevel: 'error',
  });
  const L = await import(`data:text/javascript;base64,${Buffer.from(b.outputFiles[0].text).toString('base64')}`);
  const ort = orte.orte.find((o) => o[0] === ORT && o[5] !== undefined);
  if (!ort) throw new Error(`Ort ${ORT} nicht in den Weltdaten`);
  const p = L.klemmeAusschnitt(manifest, { version, q: ort[5], r: ort[6], size: 'klein' });
  await page.goto(`${basis}#v=${p.version}&q=${p.q}&r=${p.r}&g=${p.size}&o=${encodeURIComponent(ORT)}`);
  await page.waitForFunction(() => window.eifeler?.spiel, null, { timeout: 600000, polling: 500 });
  await page.evaluate(() => window.eifeler.skipIntro());
  await page.addStyleTag({ content: '.meldeleiste { display: none !important; }' });
  const goods = JSON.parse(readFileSync(join(WURZEL, 'data', 'goods.json'), 'utf8')).waren;
  const idx = (id) => goods.findIndex((x) => x.id === id);
  const W = { kaffee: idx('kaffee'), bretter: idx('bretter'), stein: idx('stein'), werkzeug: idx('werkzeug'), kartoffeln: idx('kartoffeln') };

  // Szene: zweites Dorf im nächsten Ort 9–16 Hexe weg, beide Monschauer & Venner, Gebiets-Regel, Ziel „Der Große Fund“
  const info = await page.evaluate(({ W }) => {
    const e = window.eifeler, sp = e.spiel, L = sp.lagerHex;
    sp.pause(true);
    const dist = (a, b) => (Math.abs(a.q - b.q) + Math.abs(a.r - b.r) + Math.abs(a.q + a.r - b.q - b.r)) / 2;
    const S = sp.sim.constructor;
    const kand = sp.sicht.orte.map((o) => ({ o, d: dist(o, L) })).filter((x) => x.d >= 9 && x.d <= 16).sort((a, b) => a.d - b.d);
    let sim = null, zweit = null;
    for (const { o } of kand) {
      try { sim = new S(e.ausschnitt.hex, 7, [{ q: L.q, r: L.r, voelkchen: 'monschau' }, { q: o.q, r: o.r, voelkchen: 'monschau' }], { gebiet: 1, ziel: 'grosser_fund' }); zweit = o; break; } catch { /* nächster */ }
    }
    if (!sim) throw new Error('kein zweiter Startort');
    sp.simErsetzt(sim);
    const ids = {};
    const baue = (typ, um, spieler) => {
      let best = null;
      for (let d = 2; d <= 8 && !best; d++) for (let dq = -d; dq <= d && !best; dq++) for (let dr = -d; dr <= d && !best; dr++) {
        const c = { q: um.q + dq, r: um.r + dr };
        if (dist(c, um) === d && sim.kannBauen('wohnhaus', c.q, c.r, spieler)) {
          const fs = sim.sicht(spieler).fahnen.filter((f) => f.sp === spieler).sort((a, b) => dist(a, c) - dist(b, c)).slice(0, 6);
          const von = fs.find((f) => sim.wegVorschau(f, c, spieler));
          if (von) best = { c, von };
        }
      }
      if (!best) return 0;
      const id = sim.gebaeudeErzeugen(typ, sim.karte.index(best.c.q, best.c.r), true, spieler).id;
      sim.schritt();
      const pf = sim.wegVorschau(best.von, best.c, spieler);
      if (pf) sim.befehl(sim.tick, spieler, { art: 'weg', pfad: pf });
      sim.schritt(); sim.schritt();
      return id;
    };
    ids.finder = baue('finderhuette', L, 0);
    ids.buero = baue('fundbuero', L, 0);
    ids.wohn = baue('wohnhaus', L, 0);
    baue('wohnhaus', zweit, 1);
    // Stand: Stufe 1, Kaffee im Fundbüro, Funde, zwei Teile des Großen Funds, Grenzstein-Auftrag, kurz vor der Nacht
    const st = sim.stand();
    for (const d of st.doerfer) { d.stufe = 1; d.bewohner += 12; d.frei += 12; }
    const d0 = st.doerfer[0]; d0.funde = [1, 3]; d0.grossP = 100; d0.gewehr = 1; d0.teile = [0, 1001]; d0.kaffeeP = 8;
    for (const g of st.gebaeude) {
      if (g.vorrat) { g.vorrat[W.kaffee] += 6; g.vorrat[W.bretter] += 20; g.vorrat[W.kartoffeln] += 20; }
      if (g.id === ids.buero) g.puffer[W.kaffee] = 3;
      if (g.id === ids.finder) { g.gz = 1; g.ar = 1; g.ph = 0; g.pt = 0; }
    }
    st.doerfer[0].frei -= 1;
    const neu = S.ausStand(e.ausschnitt.hex, st);
    sp.simErsetzt(neu);
    return { ids, L, zweit: { q: zweit.q, r: zweit.r }, zoll: neu.sicht(0).grenzland.zoll, bisNacht: neu.sicht(0).grenzland.bisNacht };
  }, { W });
  console.log('Szene', JSON.stringify(info));
  const schritte = (n) => page.evaluate((n) => window.eifeler.spiel.schritte(n), n);
  // bis kurz vor die Nacht rechnen
  for (let rest = info.bisNacht - 40; rest > 0; rest -= 400) await schritte(Math.min(400, rest));
  const zu = async (q, r, abstand, pitch, dz = 0, dx = 0) => {
    await page.evaluate(({ q, r, abstand, pitch, dz, dx }) => { const e = window.eifeler; const w = e.grid.toWorld({ q, r }); e.cam.pitchOverride = pitch; e.cam.jumpTo(w.x + dx, w.z + dz, abstand, 0.5); e.settle(); }, { q, r, abstand, pitch, dz, dx });
    await page.waitForTimeout(4000);
  };
  const bild = async (name) => {
    await page.screenshot({ path: join(AUS, name), timeout: 180000 });
    console.log(name, JSON.stringify(await page.evaluate(() => { const s = window.eifeler.spiel.sicht; return { nacht: s.grenzland.nacht, steine: s.grenzland.steine.length, finder: s.grenzland.finder, hexe: s.spieler.map((x) => x.hexe) }; })));
  };
  const warte = async (fn, max = 300, n = 10) => { for (let i = 0; i < max; i++) { const t = await page.evaluate(fn); if (t) return t; await schritte(n); } return null; };
  // 1. Finder mit dem Grenzstein auf dem Weg zur Grenze (nachts)
  const mitStein = await warte(() => { const f = window.eifeler.spiel.sicht.grenzland.finder.find((x) => x.traegt === 'stein'); return f && f.fortschritt >= 0 ? f : null; });
  if (mitStein) {
    await schritte(60);
    const f = await page.evaluate(() => window.eifeler.spiel.sicht.grenzland.finder.find((x) => x.traegt === 'stein'));
    if (f) { await zu(f.von.q, f.von.r, 230, 40, 10); await bild('grenz-1-finder-mit-grenzstein.png'); }
  }
  // 2. Stein gesetzt (sonst erwischt: dann den Stein für das Bild selbst setzen)
  const ende = await warte(() => { const g = window.eifeler.spiel.sicht.gebaeude.find((x) => x.typ === 'finderhuette' && x.sp === 0); return g && (g.finder.tut === 'heim' || g.finder.tut === 'ausrede') ? g.finder.tut : null; }, 400, 20);
  console.log('Grenzstein:', ende);
  if (ende !== 'heim') {
    await page.evaluate(() => {
      const e = window.eifeler, sp = e.spiel, sim = sp.sim, st = sim.stand();
      const h = sim.grenzHex(0, 1);
      st.grenzland.steine.push({ id: st.zahlen[2], sp: 0, opfer: 1, h, art: 0 }); st.zahlen[2]++;
      sp.simErsetzt(sim.constructor.ausStand(e.ausschnitt.hex, st));
      sp.schritte(101);
    });
  }
  const stein = await page.evaluate(() => window.eifeler.spiel.sicht.grenzland.steine[0]);
  if (stein) { await zu(stein.q, stein.r, 260, 35, 30, 10); await bild('grenz-2-grenzstein-spuk-nacht.png'); }
  // 3. Am Tag: Grenze mit dem versetzten Stein von oben, Zollhaus mit Zöllner, Finder mit Kaffeesack
  await page.evaluate(() => { const sp = window.eifeler.spiel; sp.wetterVorgabe = { tag: 0.5 }; });
  if (stein) { await zu(stein.q, stein.r, 900, 60, 120); await bild('grenz-3-grenze-uebersicht.png'); }
  if (info.zoll.length) {
    const z = info.zoll[0];
    await page.evaluate(({ z, finder }) => {
      // der Finder kommt gerade mit dem Kaffee vom Zollhaus zurück
      const e = window.eifeler, sp = e.spiel, sim = sp.sim, st = sim.stand();
      const g = st.gebaeude.find((x) => x.id === finder);
      const zh = sim.karte.index(z.q, z.r);
      g.weg = sim.geradePfad(g.h, zh); g.ph = 1; g.zh = 2000; g.pd = 2 * (g.weg.length - 1) * 40; g.pt = st.zahlen[0] + Math.floor(g.pd * 0.45); g.gz = -1;
      sp.simErsetzt(sim.constructor.ausStand(e.ausschnitt.hex, st));
      sp.schritte(1);
    }, { z, finder: info.ids.finder });
    await zu(z.q, z.r, 300, 35, 40, 20); await bild('grenz-4-zollhaus-zoellner.png');
    const f = await page.evaluate(() => window.eifeler.spiel.sicht.grenzland.finder[0]);
    if (f) { await zu(f.von.q, f.von.r, 220, 40, 10); await bild('grenz-5-finder-kaffeesack.png'); }
    await page.evaluate(() => window.eifeler.spiel.oeffneZoll(0));
    await page.waitForTimeout(1200); await bild('grenz-6-zollhaus-fenster.png');
    await page.evaluate(() => window.eifeler.spiel.fenster.schliesse('zoll:0'));
  }
  // 4. Fenster: Finderhütte (Grenzsteine), Fundbüro (Großer Fund), Lager (Grenzland, Kaffee), Warenverteilung (Kaffee)
  await zu(info.L.q, info.L.r, 420, 45, 60);
  for (const [id, name] of [[info.ids.finder, 'grenz-7-finderhuette-fenster.png'], [info.ids.buero, 'grenz-8-fundbuero-fenster.png']]) {
    if (!id) continue;
    await page.evaluate((id) => window.eifeler.spiel.oeffneGebaeude(id), id);
    await page.waitForTimeout(1200); await bild(name);
    await page.evaluate((id) => window.eifeler.spiel.fenster.schliesse(`geb:${id}`), id);
  }
  const lager = await page.evaluate(() => { const sp = window.eifeler.spiel; const g = sp.sicht.gebaeude.find((x) => x.sp === 0 && x.typ === 'lager'); sp.oeffneGebaeude(g.id); return g.id; });
  await page.waitForTimeout(1200);
  await page.evaluate(() => { const f = document.querySelector('.fenster[data-fenster^="geb:"] .inhalt, .fenster[data-fenster^="geb:"]'); const t = [...document.querySelectorAll('.fenster *')].find((x) => x.textContent === 'Grenzland'); t?.scrollIntoView(); void f; });
  await page.waitForTimeout(500); await bild('grenz-9-lager-grenzland.png');
  await page.evaluate((id) => window.eifeler.spiel.fenster.schliesse(`geb:${id}`), lager);
  await page.evaluate(() => window.eifeler.spiel.fensterUmschalten('verteilung'));
  await page.waitForTimeout(800);
  await page.evaluate(() => { const t = [...document.querySelectorAll('.fenster *')].find((x) => x.textContent === 'Kaffee'); t?.scrollIntoView(); });
  await page.waitForTimeout(500); await bild('grenz-10-verteilung-kaffee.png');
} finally { await browser.close(); await vite.close(); }
