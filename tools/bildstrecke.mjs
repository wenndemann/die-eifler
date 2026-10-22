// Bildstrecke (ROADMAP M9, STIL.md §8): feste Szene auf der echten Karte (feste Saat), ein Dorf mit allen Gebäuden, Wegen, Trägern,
// Boten und Waren, dann feste Kamerapositionen: Übersicht, Dorf, Gebäude nah, Figuren nah, Fenster, Fest, Winter und eine Bildfolge
// eines laufenden Trägers; seit der Lebendigen Eifel (M15) läuft das Spiel dabei weiter (Rauch, Tiere, Leute bewegen sich) und es kommen
// Herbst, Nacht und Tiere nah dazu. Grundlage für die Gutachter-Agenten. Aufruf: node tools/bildstrecke.mjs [Ausgabeordner]
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { chromium } from 'playwright';
import { createServer } from 'vite';

const WURZEL = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const AUS = resolve(process.argv[2] ?? join(WURZEL, 'test-results', 'bildstrecke'));
mkdirSync(AUS, { recursive: true });
const vite = await createServer({ root: WURZEL, logLevel: 'warn', server: { port: 5193, strictPort: true, host: '127.0.0.1', hmr: false, watch: null } });
await vite.listen();
const exe = existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined;
const browser = await chromium.launch({ headless: false, executablePath: exe, args: ['--headless=new', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('pageerror', (e) => console.log('pageerror', e.message));
  // Ausschnitt wie im Rauchtest: ein passender Vorschlag oder ein Ort aus den Daten
  const basis = 'http://127.0.0.1:5193/';
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

  const info = await page.evaluate(() => {
    const sp = window.eifeler.spiel, sim = sp.sim;
    sp.pause(true);
    sim.doerfer[0].stufe = 3;
    const L = sp.lagerHex;
    const dist = (a, b) => (Math.abs(a.q - b.q) + Math.abs(a.r - b.r) + Math.abs(a.q + a.r - b.q - b.r)) / 2;
    // genug Leute für Träger und Arbeiter; Hinweise über den Häusern aus (es geht um den Stil)
    sim.doerfer[0].bewohner += 120; sim.doerfer[0].frei += 120;
    sp.gebaeude.hinweise = false;
    const lager = sim.gebaeude.get(1);
    for (let a = 0; a < lager.vorrat.length; a++) lager.vorrat[a] += 30;
    const typen = ['wohnhaus', 'kueche', 'kaeserei', 'mostkeller', 'saegewerk', 'brauerei', 'schaenke', 'wohnhaus', 'kirmesplatz', 'bienenstock', 'schafstall', 'kartoffelfeld', 'obstwiese', 'gerstenfeld', 'schmiede', 'brennerei', 'lagerhaus', 'reifekeller', 'eisenhuette', 'koehlerei'];
    const gebaut = [];
    for (const typ of typen) {
      let best = null;
      for (let d = 2; d <= 10 && !best; d++) for (let dq = -d; dq <= d && !best; dq++) for (let dr = -d; dr <= d && !best; dr++) {
        const c = { q: L.q + dq, r: L.r + dr };
        if (dist(c, L) === d && sim.kannBauen(typ, c.q, c.r)) {
          const fs = sp.sicht.fahnen.slice().sort((a, b) => dist(a, c) - dist(b, c)).slice(0, 6);
          const von = fs.find((f) => sim.wegVorschau(f, c));
          if (von) best = { c, von };
        }
      }
      if (!best) continue;
      sim.gebaeudeErzeugen(typ, sim.karte.index(best.c.q, best.c.r), true, 0);
      sp.schritte(1);
      const p = sim.wegVorschau(best.von, best.c);
      if (p) sp.befehl({ art: 'weg', pfad: p });
      gebaut.push(typ);
    }
    for (const sg of sp.sicht.segmente.slice()) for (let i = 2; i < sg.pfad.length - 2; i += 2) { const m = sg.pfad[i]; if (sim.kannFahne(m.q, m.r)) sp.befehl({ art: 'fahne', q: m.q, r: m.r }); }
    // zwei Boten und ein Rechenlauf, damit Träger mit Waren unterwegs sind
    const k = sim.karte, h0 = k.index(L.q, L.r);
    for (let i = 0; i < 2; i++) {
      const route = sim.torkelPfad(h0, k.index(L.q + 5 - i * 9, L.r + 4)) ?? [h0];
      sim.boten.set(9000 + i, { id: 9000 + i, sp: 0, schaenke: 0, bis: sim.tick + 99999, phase: 2, route, ri: 1, t: 0, dauer: 900, art: [13, 15][i], ziel: 0, lager: 0, faellt: -1 });
    }
    sp.schritte(2400);
    const s = sp.sicht;
    const kp = s.gebaeude.find((g) => g.typ === 'kirmesplatz');
    const wh = s.gebaeude.find((g) => g.typ === 'wohnhaus');
    const tr = s.traeger.filter((t) => t.ware >= 0).map((t) => t.id);
    return { L, gebaut, kp: kp && { q: kp.q, r: kp.r }, wh: wh && { q: wh.q, r: wh.r }, lagerId: 1, traeger: tr.length };
  });
  console.log('gebaut', info.gebaut.length, info.gebaut.join(', '), 'Träger mit Ware', info.traeger);
  // weiterlaufen lassen: in der Pause steht auch das Leben still
  await page.evaluate(() => window.eifeler.spiel.pause(false));
  await page.addStyleTag({ content: '.meldeleiste { display: none !important; }' });
  const zu = async (h, abstand, pitch, dz = 0) => {
    await page.evaluate(({ h, abstand, pitch, dz }) => { const e = window.eifeler; const w = e.grid.toWorld(h); e.cam.pitchOverride = pitch; e.cam.jumpTo(w.x, w.z + dz, abstand, 0.3); e.settle(); }, { h, abstand, pitch, dz });
    await page.evaluate(() => new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(ok))));
    await page.waitForTimeout(3500);
  };
  const bild = async (name) => { await page.screenshot({ path: join(AUS, name), timeout: 180000 }); console.log(name); };
  await zu(info.L, 1500, 48, 120); await bild('01-uebersicht.png');
  await zu(info.L, 650, 40, 60); await bild('02-dorf.png');
  await page.addStyleTag({ content: 'body.nah .spielstatus, body.nah .minimap, body.nah #minimap, body.nah .partieleiste { visibility: hidden; }' });
  await page.evaluate(() => document.body.classList.add('nah'));
  await zu(info.wh ?? info.L, 240, 42, -30); await bild('03-gebaeude-nah.png');
  // Figuren nah: der erste Träger mit Ware
  // Figuren nah: ein Träger mit Ware frontal (Kamera in seiner Laufrichtung vor ihm), dazu ein Bote nah dabei
  await page.evaluate(() => {
    const e = window.eifeler, sp = e.spiel;
    const t = sp.sicht.traeger.find((x) => x.ware >= 0 && x.tut === 'laeuft') ?? sp.sicht.traeger.find((x) => x.ware >= 0) ?? sp.sicht.traeger[0];
    const a = e.grid.toWorld(t.von), b = e.grid.toWorld(t.nach), f = t.fortschritt / 1000;
    const px = a.x + (b.x - a.x) * f, pz = a.z + (b.z - a.z) * f;
    const yaw = Math.atan2(b.x - a.x, b.z - a.z) || 0.3;
    // ein Bote läuft neben ihm
    const sim = sp.sim, k = sim.karte;
    sim.boten.set(9100, { id: 9100, sp: 0, schaenke: 0, bis: sim.tick + 99999, phase: 2, route: [k.index(t.von.q, t.von.r), k.index(t.nach.q, t.nach.r)], ri: 0, t: 0, dauer: 9999, art: 15, ziel: 0, lager: 0, faellt: -1 });
    sp.schritte(1);
    e.cam.pitchOverride = 30; e.cam.jumpTo(px, pz, 170, yaw); e.settle();
  });
  await page.waitForTimeout(3500);
  await bild('04-figuren-nah.png');
  // Bildfolge: drei Bilder im Abstand von je 10 Ticks
  for (let i = 0; i < 3; i++) { await page.evaluate(() => window.eifeler.spiel.schritte(40)); await page.waitForTimeout(1500); await bild(`05-bildfolge-${i + 1}.png`); }
  await page.evaluate(() => document.body.classList.remove('nah'));
  // Fenster: Lager und Baumenü
  await zu(info.L, 650, 40, 60);
  await page.evaluate(() => window.eifeler.spiel.oeffneGebaeude(1));
  await page.waitForTimeout(1500);
  await bild('06-fenster-lager.png');
  await page.evaluate(() => { document.querySelectorAll('.fe-zu').forEach((b) => b.click()); });
  await page.evaluate(() => document.querySelector('.werkzeug[data-w="menue"]').click());
  await page.waitForTimeout(1500);
  await bild('07-baumenue.png');
  await page.keyboard.press('Escape');
  // Fest am Kirmesplatz
  if (info.kp) {
    await page.evaluate(() => { const sim = window.eifeler.spiel.sim; sim.doerfer[0].stufe = 2; sim.doerfer[0].fest = 600; window.eifeler.spiel.schritte(2); });
    await zu(info.kp, 300, 34, 25); await bild('08-fest.png');
  }
  // Winter
  await page.evaluate(() => { const sp = window.eifeler.spiel; sp.sim._tick = 3 * 18000 + 3000; sp.schritte(2); });
  await zu(info.L, 650, 40, 60); await bild('09-winter.png');
  // Herbst (Laub), Nacht (Fensterlicht), Tiere nah
  await page.evaluate(() => { const sp = window.eifeler.spiel; sp.sim._tick = 2 * 18000 + 13000; sp.schritte(2); });
  await zu(info.L, 650, 40, 60); await bild('10-herbst.png');
  await page.evaluate(() => { const sp = window.eifeler.spiel; sp.sim._tick = 1 * 18000 + 6000; sp.schritte(2); sp.wetterVorgabe = { tag: 0.93 }; });
  await zu(info.L, 420, 35, 40); await bild('11-nacht.png');
  await page.evaluate(() => { window.eifeler.spiel.wetterVorgabe = { tag: 0.45, wind: 0.6 }; });
  const stall = await page.evaluate(() => { const g = window.eifeler.spiel.sicht.gebaeude.find((x) => x.typ === 'schafstall'); return g && { q: g.q, r: g.r }; });
  if (stall) { await zu(stall, 210, 38, -40); await bild('12-tiere-nah.png'); }
  // Wild am Waldrand (Rotte bzw. Rudel nah) und ein Meister in Tracht vor seiner Werkstatt
  const wild = await page.evaluate(async () => {
    const e = window.eifeler, sp = e.spiel, w = e.grid.toWorld(sp.lagerHex);
    e.cam.jumpTo(w.x, w.z, 900, 0.5); e.settle();
    for (let i = 0; i < 40 && !sp.wild.gruppenListe.length; i++) await new Promise((ok) => setTimeout(ok, 500));
    const l = sp.wild.gruppenListe;
    const g = l.find((x) => x.art === 'wildschwein') ?? l.find((x) => x.art === 'reh') ?? l[0];
    return g ? { x: g.x, z: g.z, art: g.art } : null;
  });
  if (wild) {
    await page.evaluate((g) => { const e = window.eifeler; e.cam.pitchOverride = 32; e.cam.jumpTo(g.x, g.z + 30, 200, 0.5); e.settle(); }, wild);
    await page.waitForTimeout(3500);
    await bild('13-wild-nah.png');
  }
  const meister = await page.evaluate(async () => {
    // ein besetztes Gebäude mit Meister (Schmied, Koch, Käserin …), bevorzugt die Schmiede
    const m = (await (await fetch('/data/leben.json')).json()).meister;
    const ohne = new Set(['baustelle', 'wartet_material', 'kein_arbeiter', 'getrennt']);
    const l = window.eifeler.spiel.sicht.gebaeude.filter((x) => m[x.typ] && x.bau >= 1000 && !ohne.has(x.zustand));
    const g = l.find((x) => x.typ === 'schmiede') ?? l.find((x) => x.typ === 'kueche') ?? l[0];
    return g && { q: g.q, r: g.r, typ: g.typ };
  });
  if (meister) { console.log('Meister an', meister.typ); await zu(meister, 170, 30, 30); await bild('14-meister-nah.png'); }
  console.log('Bildstrecke in', AUS);
} finally {
  await browser.close();
  await vite.close();
}
