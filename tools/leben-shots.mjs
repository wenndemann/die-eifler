// Lebendige Eifel – Bilder (ROADMAP M15): ein Dorf mit vielen Gebäuden am Lager (alle „arbeiten“, damit man alles sieht), dann
// nah an Schafweide, Hühnern und Wäsche, Sägewerk mit Wasserrad, Schmiede mit Funken, Kirmesplatz mit Kindern, Schänke mit Leuten,
// Vögel über dem Feld, Konfetti, Martinsfeuer, Nacht mit Fensterlicht und Winterrauch. Dazu eine kurze Bildfolge für Bewegung.
// Aufruf: node tools/leben-shots.mjs <Ausgabeordner> [Ort]   (Standard: Monschau)
import { existsSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { build } from 'esbuild';
import { chromium } from 'playwright';
import { createServer } from 'vite';

const WURZEL = '/home/user/die-eifler';
const AUS = resolve(process.argv[2] ?? 'test-results/leben');
const ORT = process.argv[3] ?? 'Höfen';
const NUR = process.env.NUR ? new Set(process.env.NUR.split(',')) : null;
mkdirSync(AUS, { recursive: true });
const vite = await createServer({ root: WURZEL, logLevel: 'warn', server: { port: 5199, strictPort: true, host: '127.0.0.1', hmr: false, watch: null } });
await vite.listen();
const exe = existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined;
const browser = await chromium.launch({ headless: false, executablePath: exe, args: ['--headless=new', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('pageerror', (e) => console.log('pageerror', e.message));
  page.on('console', (m) => { if (m.type() === 'error') console.log('console', m.text()); });
  const basis = 'http://127.0.0.1:5199/';
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
  const p = L.klemmeAusschnitt(manifest, { version, q: ort[5], r: ort[6], size: 'klein' });
  await page.goto(`${basis}#v=${p.version}&q=${p.q}&r=${p.r}&g=${p.size}&o=${encodeURIComponent(ORT)}`);
  await page.waitForFunction(() => window.eifeler?.spiel, null, { timeout: 600000, polling: 500 });
  await page.evaluate(() => window.eifeler.skipIntro());
  await page.addStyleTag({ content: '.meldeleiste, .einfuehrung { display: none !important; }' });

  // Dorf: Stufe 3, viele Gebäude fertig am Lager; die Darstellung tut so, als arbeiteten alle (sonst fehlen Waren und Leute)
  const info = await page.evaluate(() => {
    const e = window.eifeler, sp = e.spiel, L = sp.lagerHex;
    sp.pause(true);
    const dist = (a, b) => (Math.abs(a.q - b.q) + Math.abs(a.r - b.r) + Math.abs(a.q + a.r - b.q - b.r)) / 2;
    let sim = sp.sim;
    const st = sim.stand(); st.doerfer[0].stufe = 3;
    sim = sim.constructor.ausStand(e.ausschnitt.hex, st); sp.simErsetzt(sim);
    const ids = {};
    const baue = (typ) => {
      for (let d = 2; d <= 12; d++) for (let dq = -d; dq <= d; dq++) for (let dr = -d; dr <= d; dr++) {
        const c = { q: L.q + dq, r: L.r + dr };
        if (dist(c, L) !== d || !sim.kannBauen(typ, c.q, c.r, 0)) continue;
        const fs = sim.sicht(0).fahnen.filter((f) => f.sp === 0).sort((a, b) => dist(a, c) - dist(b, c)).slice(0, 6);
        const von = fs.find((f) => sim.wegVorschau(f, c, 0));
        if (!von) continue;
        const id = sim.gebaeudeErzeugen(typ, sim.karte.index(c.q, c.r), true, 0).id;
        sim.schritt();
        const pf = sim.wegVorschau(von, c, 0);
        if (pf) sim.befehl(sim.tick, 0, { art: 'weg', pfad: pf });
        sim.schritt(); sim.schritt();
        return { id, ...c };
      }
      return null;
    };
    for (const typ of ['kirmesplatz', 'wohnhaus', 'schaenke', 'schmiede', 'saegewerk', 'schafstall', 'bienenstock', 'kueche', 'wohnhaus', 'kaeserei', 'brauerei', 'kartoffelfeld', 'koehlerei', 'wohnhaus']) {
      const r = baue(typ);
      if (r) ids[typ + (ids[typ] ? '2' : '')] = r;
    }
    sp.schritte(2);
    const l = sp.leben, orig = l.update.bind(l);
    window.__festNr = -1;
    l.update = (s, dt, lg) => orig({
      ...s, gebaeude: s.gebaeude.map((g) => (g.bau >= 1000 ? { ...g, zustand: 'arbeitet' } : g)),
      dorf: window.__festNr >= 0 ? { ...s.dorf, fest: { nr: window.__festNr, liste: [], laeuft: 500, geliefert: [] } } : s.dorf,
    }, dt, lg);
    return { ids, L };
  });
  console.log('Szene', JSON.stringify(info));
  // weiterlaufen lassen (in der Pause steht auch das Leben still)
  await page.evaluate(() => window.eifeler.spiel.pause(false));
  const zu = async (q, r, abstand, pitch, dz = 0, dx = 0, warten = 2500) => {
    await page.evaluate(({ q, r, abstand, pitch, dz, dx }) => { const e = window.eifeler; const w = e.grid.toWorld({ q, r }); e.cam.pitchOverride = pitch; e.cam.jumpTo(w.x + dx, w.z + dz, abstand, 0.5); e.settle(); }, { q, r, abstand, pitch, dz, dx });
    await page.waitForTimeout(warten);
  };
  const wetter = (v) => page.evaluate((v) => { window.eifeler.spiel.wetterVorgabe = v; }, v);
  const bild = async (name) => {
    if (NUR && !NUR.has(name.split('-')[1])) return;
    await page.screenshot({ path: join(AUS, name), timeout: 180000 });
    console.log(name, JSON.stringify(await page.evaluate(() => window.eifeler.spiel.leben.zahlen)));
  };
  const I = info.ids;
  await wetter({ tag: 0.45, wind: 0.6 });
  await zu(info.L.q, info.L.r, 620, 42, 60); await bild('leben-1-dorf.png');
  if (I.schafstall) { await zu(I.schafstall.q, I.schafstall.r, 200, 38, -40); await bild('leben-2-schafweide.png'); }
  if (I.wohnhaus) { await zu(I.wohnhaus.q, I.wohnhaus.r, 170, 35, 10); await bild('leben-3-huehner-waesche.png'); }
  if (I.saegewerk) { await zu(I.saegewerk.q, I.saegewerk.r, 170, 30, 0, -10); await bild('leben-4-saegewerk-rad.png'); }
  if (I.schmiede) { await zu(I.schmiede.q, I.schmiede.r, 140, 30, 20, 20); await bild('leben-5-schmiede.png'); }
  if (I.kirmesplatz) { await zu(I.kirmesplatz.q, I.kirmesplatz.r, 230, 40, 0); await bild('leben-6-kirmesplatz-kinder.png'); }
  if (I.schaenke) { await zu(I.schaenke.q, I.schaenke.r, 150, 28, 30); await bild('leben-7-schaenke.png'); }
  if (I.kartoffelfeld) { await zu(I.kartoffelfeld.q, I.kartoffelfeld.r, 330, 22, 40); await bild('leben-8-voegel-feld.png'); }
  if (I.kirmesplatz) {
    await page.evaluate(() => { const sp = window.eifeler.spiel; const g = sp.sicht.gebaeude.find((x) => x.typ === 'kirmesplatz'); const l = sp.gebaeude.modellLage(g.id, g.typ); sp.leben.konfettiAus(l.x, l.y + 70, l.z); });
    await zu(I.kirmesplatz.q, I.kirmesplatz.r, 300, 30, 0, 0, 1200); await bild('leben-9-konfetti.png');
  }
  // Martinsfeuer in der Dämmerung
  const mnr = await page.evaluate(async () => (await import('/src/sim/daten.ts')).KLEINE_FESTE.findIndex((f) => f.id === 'martinsfeuer'));
  await page.evaluate((n) => { window.__festNr = n; }, mnr);
  await wetter({ tag: 0.8, wind: 0.2 });
  if (I.kirmesplatz) { await zu(I.kirmesplatz.q, I.kirmesplatz.r, 220, 25, -20, 20); await bild('leben-10-martinsfeuer.png'); }
  await page.evaluate(() => { window.__festNr = -1; });
  // Nacht: Fensterlicht, Glut, Rauch
  await wetter({ tag: 0.95, wind: 0.3 });
  await zu(info.L.q, info.L.r, 420, 35, 40); await bild('leben-11-nacht.png');
  if (I.wohnhaus) { await zu(I.wohnhaus.q, I.wohnhaus.r, 150, 25, 30); await bild('leben-11b-nacht-nah.png'); }
  // Bildfolge (Bewegung): drei Bilder im Abstand von 0,4 s
  await wetter({ tag: 0.45, wind: 0.8 });
  if (I.wohnhaus) {
    await zu(I.wohnhaus.q, I.wohnhaus.r, 190, 35, 10);
    for (let i = 0; i < 3; i++) { await bild(`leben-12-folge-${i + 1}.png`); await page.waitForTimeout(400); }
  }
  console.log('Leistung', JSON.stringify(await page.evaluate(() => { const r = window.eifeler.stage?.renderer?.info?.render; return r ? { calls: r.calls, dreiecke: r.triangles } : null; })));
} finally { await browser.close(); await vite.close(); }
