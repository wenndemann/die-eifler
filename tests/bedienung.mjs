// Bedienungs-Test im echten Browser (M4, Baumenü): Menü öffnen, Gebäude wählen, mit echten Mausklicks bauen, Gebäudekarte
// und Priorität, dazu eine Handy-Ansicht (390×844, Touch). Wird von smoke.mjs aufgerufen; Screenshots landen in `aus`.
//   5-baumenue.png      Menü offen (Desktop)
//   6-bauplaetze.png    Geist, Bauplatz-Anzeige und Arbeitsradius am Zielhex
//   7-baustelle.png     gebaute Baustelle mit Gebäudekarte und Priorität
//   8-handy-menue.png   Menü auf dem Handy
//   9-handy-bauen.png   Handy: Tipp zeigt Geist und Bauplätze, zweiter Tipp baut
import { statSync } from 'node:fs';
import { join } from 'node:path';

const frames = (page, n = 2) => page.evaluate((k) => new Promise((ok) => {
  const f = (i) => (i <= 0 ? ok() : requestAnimationFrame(() => f(i - 1)));
  f(k);
}), n);

/** Kamera nah ans Lager, Ziel-Hex suchen (Bäume im Radius, kannBauen), Hex-Koordinaten zurückgeben. */
async function vorbereiten(page, typ, abstand) {
  return page.evaluate(({ typ, abstand }) => {
    const e = window.eifeler, sp = e.spiel;
    sp.pause(false);
    const L = sp.lagerHex;
    const dist = (a, b) => (Math.abs(a.q - b.q) + Math.abs(a.r - b.r) + Math.abs(a.q + a.r - b.q - b.r)) / 2;
    let best = null, bw = -1;
    for (let dq = -6; dq <= 6; dq++) for (let dr = -6; dr <= 6; dr++) {
      const c = { q: L.q + dq, r: L.r + dr };
      const d = dist(c, L);
      if (d < 2 || d > 5 || !sp.sim.kannBauen(typ, c.q, c.r)) continue;
      const w = typ === 'holzfaeller' ? sp.sim.arbeitsHexe(typ, c.q, c.r).summe : 1;
      if (w > bw || (w === bw && d < dist(best, L))) { bw = w; best = c; }
    }
    const w = e.grid.toWorld(best);
    e.cam.pitchOverride = 40;
    e.cam.jumpTo(w.x, w.z + 80, abstand, 0.25);
    e.settle();
    return { hex: best, baeume: bw };
  }, { typ, abstand });
}

export async function bedienungsTest({ browser, url, aus, info, fail }) {
  const bild = async (page, name) => {
    const datei = join(aus, name);
    await page.screenshot({ path: datei, timeout: 180000 });
    const kb = Math.round(statSync(datei).size / 1024);
    info(`Screenshot ${datei} (${kb} KB)`);
    if (kb < 20) fail(`Bedienung: Screenshot ${name} verdächtig klein (${kb} KB)`);
  };

  // ------------------------------------------------------------ Desktop: Maus
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => fail(`Bedienung (pageerror): ${e.message}`));
  await page.goto(url, { timeout: 120000 });
  await page.waitForFunction(() => window.eifeler?.spiel, null, { timeout: 600000, polling: 500 });
  await page.evaluate(() => window.eifeler.skipIntro());
  const ziel = await vorbereiten(page, 'holzfaeller', 900);
  info(`Bedienung: Ziel-Hex ${ziel.hex.q},${ziel.hex.r} (${ziel.baeume} Bäume im Radius)`);

  // Baumenü: Knopf „Bauen“ öffnet es, ein Eintrag je Gebäude außer dem Lager
  await page.locator('.werkzeug[data-w="menue"]').click();
  await page.waitForSelector('.baumenue:not([hidden])', { timeout: 5000 });
  const menue = await page.evaluate(() => ({
    eintraege: [...document.querySelectorAll('.bm-eintrag')].map((b) => b.dataset.id),
    gruppen: [...document.querySelectorAll('.bm-gruppe h4')].map((h) => h.textContent),
    kosten: document.querySelector('.bm-eintrag[data-id="saegewerk"] .bm-kosten')?.textContent,
  }));
  info(`Bedienung: Menü ${menue.gruppen.join(' | ')}; Einträge ${menue.eintraege.join(', ')}; Sägewerk ${menue.kosten}`);
  if (menue.eintraege.length < 5 || menue.eintraege.includes('lager')) fail(`Bedienung: Menü-Einträge unerwartet: ${menue.eintraege.join(', ')}`);
  if (!/2 .*Bretter · 1 .*Stein/.test(menue.kosten ?? '')) fail(`Bedienung: Kostentext im Menü: ${menue.kosten}`);
  await page.waitForTimeout(500);
  await bild(page, '5-baumenue.png');

  // Holzfällerhütte wählen: Menü schließt sich, Werkzeug gesetzt
  await page.locator('.bm-eintrag[data-id="holzfaeller"]').click();
  const nachWahl = await page.evaluate(() => ({ w: window.eifeler.spiel.werkzeug, offen: !document.querySelector('.baumenue').hidden }));
  if (nachWahl.w !== 'holzfaeller' || nachWahl.offen) fail(`Bedienung: nach der Wahl Werkzeug ${nachWahl.w}, Menü offen ${nachWahl.offen}`);

  // Zeiger auf den Ziel-Hex: Geist, Bauplatz-Anzeige, Radius, Hinweis
  const pos = await page.evaluate((h) => window.eifeler.spiel.bildschirm(h), ziel.hex);
  await page.mouse.move(pos.x - 30, pos.y - 20);
  await page.mouse.move(pos.x, pos.y, { steps: 4 });
  await page.waitForFunction((h) => { const f = window.eifeler.spiel.fokus; return f && f.q === h.q && f.r === h.r; }, ziel.hex, { timeout: 30000, polling: 200 });
  await frames(page, 6);
  await page.waitForTimeout(800);
  const vor = await page.evaluate(() => {
    const sp = window.eifeler.spiel;
    return {
      plaetze: sp.bauplaetze.anzahl, geist: sp.geist.group.visible, hinweis: document.querySelector('.hinweis .text')?.textContent,
      warn: document.querySelector('.hinweis')?.classList.contains('warn'),
    };
  });
  info(`Bedienung: Bauplätze (klein/mittel/groß) ${vor.plaetze.join('/')}, Geist ${vor.geist}, Hinweis „${vor.hinweis}“`);
  if (vor.plaetze.reduce((a, b) => a + b, 0) < 5) fail(`Bedienung: kaum Bauplätze angezeigt: ${vor.plaetze.join('/')}`);
  if (!vor.geist) fail('Bedienung: kein Geistermodell');
  if (!/Holzfällerhütte · .*Bretter · \d+ Bäume? in Reichweite/.test(vor.hinweis ?? '')) fail(`Bedienung: Hinweis der Bauvorschau: ${vor.hinweis}`);
  await bild(page, '6-bauplaetze.png');

  // Mit echtem Klick bauen
  const vorher = await page.evaluate(() => window.eifeler.spiel.sicht.gebaeude.length);
  await page.mouse.click(pos.x, pos.y);
  await page.waitForFunction((n) => window.eifeler.spiel.sicht.gebaeude.length > n, vorher, { timeout: 30000, polling: 200 });
  const gebaut = await page.evaluate((h) => window.eifeler.spiel.sicht.gebaeude.find((g) => g.q === h.q && g.r === h.r), ziel.hex);
  info(`Bedienung: Gebäude dazugekommen: ${gebaut?.typ} (Baustelle ${gebaut?.bau ?? '?'}‰, Priorität ${gebaut?.prioritaet})`);
  if (gebaut?.typ !== 'holzfaeller') fail(`Bedienung: nach dem Klick kein Holzfäller auf ${ziel.hex.q},${ziel.hex.r}`);

  // Gebäudekarte: ohne Werkzeug auf die Baustelle klicken, Priorität 3 über den Knopf setzen
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => window.eifeler.spiel.werkzeug === 'keins', null, { timeout: 5000 });
  await page.mouse.move(pos.x + 200, pos.y + 160);
  const pos2 = await page.evaluate((h) => window.eifeler.spiel.bildschirm(h), ziel.hex);
  await page.mouse.click(pos2.x, pos2.y);
  await page.waitForSelector('.gebkarte:not([hidden])', { timeout: 10000 });
  await page.locator('.gk-prio-knopf[data-p="3"]').click();
  await page.waitForFunction((h) => window.eifeler.spiel.sicht.gebaeude.find((g) => g.q === h.q && g.r === h.r)?.prioritaet === 3, ziel.hex, { timeout: 30000, polling: 200 });
  const karte = await page.evaluate(() => ({
    status: document.querySelector('.gk-status')?.textContent, zeilen: [...document.querySelectorAll('.gk-zeilen div')].map((d) => d.textContent),
    an: document.querySelector('.gk-prio-knopf.an')?.dataset.p,
  }));
  info(`Bedienung: Gebäudekarte „${karte.status}“ ${karte.zeilen.join(' / ')}; Priorität an: ${karte.an}`);
  if (karte.an !== '3') fail(`Bedienung: Prioritätsknopf zeigt ${karte.an} statt 3`);
  // Rechtsklick schaltet weiter: 3 → 1
  await page.mouse.click(pos2.x, pos2.y, { button: 'right' });
  await page.waitForFunction((h) => window.eifeler.spiel.sicht.gebaeude.find((g) => g.q === h.q && g.r === h.r)?.prioritaet === 1, ziel.hex, { timeout: 30000, polling: 200 });
  await page.keyboard.press('Escape');
  await page.mouse.click(pos2.x, pos2.y);
  await page.waitForSelector('.gebkarte:not([hidden])', { timeout: 10000 });
  await page.waitForTimeout(800);
  await bild(page, '7-baustelle.png');
  // Tasten: B öffnet das Menü, Esc schließt es; P schaltet die Bauplätze ohne Werkzeug
  await page.keyboard.press('b');
  if (!(await page.evaluate(() => !document.querySelector('.baumenue').hidden))) fail('Bedienung: Taste B öffnet das Menü nicht');
  await page.keyboard.press('Escape');
  if (!(await page.evaluate(() => document.querySelector('.baumenue').hidden))) fail('Bedienung: Esc schließt das Menü nicht');
  await ctx.close();

  // ------------------------------------------------------------ Handy: Touch, 390×844
  const handy = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const hp = await handy.newPage();
  hp.on('pageerror', (e) => fail(`Bedienung Handy (pageerror): ${e.message}`));
  await hp.goto(url, { timeout: 120000 });
  await hp.waitForFunction(() => window.eifeler?.spiel, null, { timeout: 600000, polling: 500 });
  await hp.evaluate(() => window.eifeler.skipIntro());
  const z2 = await vorbereiten(hp, 'holzfaeller', 1000);
  await hp.locator('.werkzeug[data-w="menue"]').tap();
  await hp.waitForSelector('.baumenue:not([hidden])', { timeout: 5000 });
  await hp.waitForTimeout(600);
  const mass = await hp.evaluate(() => {
    const r = document.querySelector('.baumenue').getBoundingClientRect();
    const knoepfe = [...document.querySelectorAll('.bm-eintrag')].map((b) => b.getBoundingClientRect());
    return {
      scrollBreite: document.documentElement.scrollWidth, innen: innerWidth, links: r.left, rechts: r.right, oben: r.top, unten: r.bottom,
      kleinsteHoehe: Math.min(...knoepfe.map((k) => k.height)), ueberlauf: knoepfe.some((k) => k.right > innerWidth + 0.5),
    };
  });
  info(`Bedienung Handy: Menü ${Math.round(mass.links)}..${Math.round(mass.rechts)} px von ${mass.innen}, Eintrag mind. ${Math.round(mass.kleinsteHoehe)} px hoch`);
  if (mass.scrollBreite > mass.innen || mass.rechts > mass.innen + 0.5 || mass.links < -0.5 || mass.ueberlauf) fail(`Bedienung Handy: Überlauf ${JSON.stringify(mass)}`);
  if (mass.kleinsteHoehe < 44) fail(`Bedienung Handy: Menü-Einträge zu klein (${mass.kleinsteHoehe} px)`);
  await bild(hp, '8-handy-menue.png');
  await hp.locator('.bm-eintrag[data-id="holzfaeller"]').tap();
  const p3 = await hp.evaluate((h) => window.eifeler.spiel.bildschirm(h), z2.hex);
  await hp.touchscreen.tap(p3.x, p3.y);   // erster Tipp zeigt Geist und Bauplätze
  await hp.waitForFunction((h) => { const f = window.eifeler.spiel.fokus; return f && f.q === h.q && f.r === h.r; }, z2.hex, { timeout: 30000, polling: 200 });
  await frames(hp, 6);
  await hp.waitForTimeout(800);
  const hv = await hp.evaluate(() => ({ plaetze: window.eifeler.spiel.bauplaetze.anzahl, geist: window.eifeler.spiel.geist.group.visible, n: window.eifeler.spiel.sicht.gebaeude.length }));
  info(`Bedienung Handy: nach erstem Tipp Bauplätze ${hv.plaetze.join('/')}, Geist ${hv.geist}`);
  if (!hv.geist || hv.plaetze.reduce((a, b) => a + b, 0) < 5) fail('Bedienung Handy: Geist oder Bauplätze fehlen nach dem ersten Tipp');
  await bild(hp, '9-handy-bauen.png');
  await hp.locator('.aktion.bauen').tap();   // „Bauen“ bestätigt
  await hp.waitForFunction((n) => window.eifeler.spiel.sicht.gebaeude.length > n, hv.n, { timeout: 30000, polling: 200 });
  info('Bedienung Handy: Gebäude per Tipp und „Bauen“ gebaut');
  await handy.close();
  await ctx.close().catch(() => undefined);
}
