// Kampagne im Browser (ROADMAP M13), Teil des Rauchtests: Startmenü → Kampagne → Etappe starten (Rur-Weg, „Heimbach – Nideggen“,
// die einzige Etappe in den Nideggen-Daten) → Start in Heimbach mit Völkchen und Rucksack, Etappenziele links → „Etappe geschafft“ →
// Weiterwandern → zurück in der Übersicht, die Etappe ist abgehakt.
import { chromium } from 'playwright';

export async function kampagneTest({ basis, info, fail, exe }) {
  const browser = await chromium.launch({
    headless: false, executablePath: exe,
    args: ['--headless=new', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  });
  const fehler = [];
  try {
    const ctx = await browser.newContext({ viewport: { width: 1100, height: 700 } });
    // zwei Etappen schon geschafft, Rucksack voll Werkzeug; niedrige Qualität (Software-Grafik)
    await ctx.addInitScript(() => {
      try {
        localStorage.setItem('eifeler.view', JSON.stringify({ quality: 'niedrig', shadows: false }));
        if (!sessionStorage.getItem('kp-test')) {
          sessionStorage.setItem('kp-test', '1');
          localStorage.setItem('eifeler.kampagne', JSON.stringify({ weg: 'rurweg', voelkchen: 'monschau', geschafft: [0, 1], punkte: { 0: 50, 1: 70 }, rucksack: { werkzeug: 4 } }));
        }
      } catch { /* egal */ }
    });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => fehler.push(`pageerror: ${e.message}`));
    await page.goto(basis, { timeout: 120000 });
    await page.waitForSelector('.sm-kampagne', { timeout: 60000 });
    await page.locator('.sm-kampagne').click();
    await page.waitForSelector('.kp-box', { timeout: 30000 });
    const etappen = await page.locator('.kp-etappe').allTextContents();
    info(`Kampagne: Übersicht ${etappen.join(' | ')}`);
    if (!etappen.some((t) => t.startsWith('▶ 3.'))) fail(`Kampagne: Etappe 3 sollte die nächste sein: ${etappen.join(' | ')}`);
    if (await page.locator('.kp-start').isDisabled()) fail(`Kampagne: Etappe 3 nicht startbar (${await page.locator('.kp-hinweis').allTextContents()})`);
    await page.locator('.kp-start').click();
    await page.waitForFunction(() => window.eifeler?.spiel, null, { timeout: 600000, polling: 500 });
    await page.evaluate(() => window.eifeler.skipIntro());
    const st = await page.evaluate(() => {
      const sp = window.eifeler.spiel, s = sp.sim.sicht(0);
      const lager = s.gebaeude.find((g) => g.typ === 'lager');
      return { hash: location.hash, etappe: sp.etappe?.name, lager: sp.lagerHex, vk: s.dorf.voelkchen, werkzeug: lager ? sp.sim.startDaten()[0].waren ?? null : null, ziele: document.querySelector('.etappenziele')?.textContent ?? '' };
    });
    info(`Kampagne: Etappe ${st.etappe}, Lager ${JSON.stringify(st.lager)}, Völkchen ${st.vk}, Rucksack ${JSON.stringify(st.werkzeug)}, Ziele „${st.ziele.slice(0, 120)}“`);
    if (!st.hash.includes('k=rurweg.2')) fail(`Kampagne: Etappe nicht im Link: ${st.hash}`);
    if (st.etappe !== 'Heimbach – Nideggen') fail(`Kampagne: falsche Etappe ${st.etappe}`);
    if (st.vk !== 'monschau') fail(`Kampagne: Völkchen der Kampagne fehlt (${st.vk})`);
    if (!st.werkzeug || st.werkzeug.werkzeug !== 4) fail(`Kampagne: Rucksack nicht im Startlager: ${JSON.stringify(st.werkzeug)}`);
    if (Math.abs(st.lager.q - 363) + Math.abs(st.lager.r - 341) > 12) fail(`Kampagne: Lager nicht bei Heimbach: ${JSON.stringify(st.lager)}`);
    if (!st.ziele.includes('Nideggen')) fail(`Kampagne: Etappenziele fehlen: ${st.ziele}`);
    // Etappe als geschafft vorführen: Fenster mit Rucksack, dann weiterwandern
    await page.evaluate(() => window.eifeler.spiel.zeigeEtappe());
    await page.waitForSelector('.fenster[data-fenster="etappe"]', { timeout: 30000 });
    const fenster = await page.locator('.fenster[data-fenster="etappe"]').textContent();
    info(`Kampagne: Fenster „${fenster.replace(/\s+/g, ' ').slice(0, 140)}“`);
    await page.locator('.fenster[data-fenster="etappe"] [data-knopf="weiter"]').click();
    await page.waitForSelector('.kp-box', { timeout: 120000 });
    const nachher = await page.evaluate(() => JSON.parse(localStorage.getItem('eifeler.kampagne')));
    const liste = await page.locator('.kp-etappe').allTextContents();
    info(`Kampagne: nach dem Weiterwandern geschafft ${JSON.stringify(nachher.geschafft)}, ${liste.join(' | ')}`);
    if (!nachher.geschafft.includes(2)) fail(`Kampagne: Etappe 3 nicht gespeichert: ${JSON.stringify(nachher)}`);
    if (!liste.some((t) => t.startsWith('✓ 3.'))) fail(`Kampagne: Etappe 3 nicht abgehakt: ${liste.join(' | ')}`);
  } catch (e) {
    fail(`Kampagne: ${e.message}`);
  } finally {
    for (const f of fehler) fail(`Kampagne: ${f}`);
    await browser.close();
  }
}
