// Bedienungs-Test im echten Browser (M4, Baumenü): Menü öffnen, Gebäude wählen, mit echten Mausklicks bauen, Gebäudefenster
// und Priorität, dazu eine Handy-Ansicht (390×844, Touch). Wird von smoke.mjs aufgerufen; Screenshots landen in `aus`.
//   5-baumenue.png      Menü offen (Desktop)
//   6-bauplaetze.png    Geist, Bauplatz-Anzeige und Arbeitsradius am Zielhex
//   7-baustelle.png     gebaute Baustelle mit Gebäudefenster und Priorität
//   8-handy-menue.png   Menü auf dem Handy
//   9-handy-bauen.png   Handy: Tipp zeigt Geist und Bauplätze, zweiter Tipp baut
//   10-arbeitsbereich.png  Gebäudefenster, Modus „Arbeitsbereich“: zwei Ringe, Fähnchen und Linie am Zeiger
//   11-natur-nah.png    Nahansicht: Fels, Lesesteine und Bäume auf der Wiese
//   12-baumenue-tooltip.png  M7: Baumenü mit Tooltip
//   13-fuenf-fenster.png     M7: fünf offene Fenster (Lager angepinnt, Waren, Verteilung, Statistik, Protokoll)
//   14-handy-fenster.png     M7: Gebäudefenster am Handy
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
  // Bedienung prüft die Oberfläche, nicht die Grafik: Stufe „Niedrig“ (ohne Bilderbuch-Pass und Schatten), damit der
  // Software-Renderer im Container genug Bilder je Sekunde schafft, dass echte Mausklicks nicht in den Wartezeiten hängen
  await ctx.addInitScript(() => { try { localStorage.setItem('eifeler.view', JSON.stringify({ quality: 'niedrig', shadows: false })); } catch { /* egal */ } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => fail(`Bedienung (pageerror): ${e.message}`));
  await page.goto(url, { timeout: 120000 });
  await page.waitForFunction(() => window.eifeler?.spiel, null, { timeout: 600000, polling: 500 });
  await page.evaluate(() => window.eifeler.skipIntro());
  const ziel = await vorbereiten(page, 'holzfaeller', 900);
  info(`Bedienung: Ziel-Hex ${ziel.hex.q},${ziel.hex.r} (${ziel.baeume} Bäume im Radius)`);

  // Baumenü: Knopf „Bauen“ öffnet es, ein Eintrag je Gebäude außer dem Lager
  // echter Mausklick; nicht auf „geplante Navigationen“ warten (im Software-Renderer hängt das sonst an langen Bildern)
  await page.locator('.werkzeug[data-w="menue"]').click({ noWaitAfter: true, timeout: 120000 });
  await page.waitForSelector('.baumenue:not([hidden])', { timeout: 120000 });
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

  // Gebäudefenster: ohne Werkzeug auf die Baustelle klicken, Priorität 3 über den Knopf setzen
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => window.eifeler.spiel.werkzeug === 'keins', null, { timeout: 30000 });
  await page.mouse.move(pos.x + 200, pos.y + 160);
  const pos2 = await page.evaluate((h) => window.eifeler.spiel.bildschirm(h), ziel.hex);
  await page.mouse.click(pos2.x, pos2.y);
  await page.waitForSelector('.fenster[data-gruppe="auswahl"]', { timeout: 10000 });
  await page.locator('.fenster [data-knopf="prio:3"]').click();
  await page.waitForFunction((h) => window.eifeler.spiel.sicht.gebaeude.find((g) => g.q === h.q && g.r === h.r)?.prioritaet === 3, ziel.hex, { timeout: 30000, polling: 200 });
  // das Fenster zeigt den neuen Stand mit der nächsten Aktualisierung (4× je Sekunde)
  await page.waitForSelector('.fenster .fe-knopf.an[data-knopf="prio:3"]', { timeout: 20000 }).catch(() => undefined);
  const karte = await page.evaluate(() => ({
    status: document.querySelector('.fenster .fe-zustand')?.textContent, zeilen: [...document.querySelectorAll('.fenster .fe-zeile, .fenster .fe-balkentext')].map((d) => d.textContent),
    an: document.querySelector('.fenster .fe-knopf.an[data-knopf^="prio:"]')?.dataset.knopf.slice(5),
  }));
  info(`Bedienung: Gebäudefenster „${karte.status}“ ${karte.zeilen.join(' / ')}; Priorität an: ${karte.an}`);
  if (karte.an !== '3') fail(`Bedienung: Prioritätsknopf zeigt ${karte.an} statt 3`);
  // Rechtsklick schaltet weiter: 3 → 1 (erst das Fenster schließen, es liegt über der Mitte)
  await page.keyboard.press('Escape');
  await page.mouse.click(pos2.x, pos2.y, { button: 'right' });
  await page.waitForFunction((h) => window.eifeler.spiel.sicht.gebaeude.find((g) => g.q === h.q && g.r === h.r)?.prioritaet === 1, ziel.hex, { timeout: 30000, polling: 200 });
  await page.keyboard.press('Escape');
  await page.mouse.click(pos2.x, pos2.y);
  await page.waitForSelector('.fenster[data-gruppe="auswahl"]', { timeout: 10000 });
  await page.waitForTimeout(800);
  await bild(page, '7-baustelle.png');
  // Arbeitsbereich: Knopf im Gebäudefenster, Ringe folgen dem Zeiger, echter Klick setzt den Mittelpunkt (Befehl 'arbeitsbereich')
  const bz = await page.evaluate((b) => {
    const e = window.eifeler, sp = e.spiel, w = e.grid.toWorld(b);
    e.cam.pitchOverride = 45;
    e.cam.jumpTo(w.x, w.z + 120, 950, 0.25);
    e.settle();
    const dist = (a, c) => (Math.abs(a.q - c.q) + Math.abs(a.r - c.r) + Math.abs(a.q + a.r - c.q - c.r)) / 2;
    const k = sp.sim.karte;
    let best = null;
    for (let dq = -3; dq <= 3; dq++) for (let dr = -3; dr <= 3; dr++) {
      const c = { q: b.q + dq, r: b.r + dr };
      if (dist(c, b) !== 3) continue;
      const i = k.index(c.q, c.r);
      if (i < 0 || !k.begehbar[i]) continue;
      const p = sp.bildschirm(c);
      if (p.x < 100 || p.x > 1000 || p.y < 110 || p.y > 620) continue;
      if ((p.x > 560 && p.y < 560) || (p.x > 400 && p.x < 880 && p.y > 560)) continue;   // hinter Gebäudefenster und Hinweiszeile
      if (!best || Math.abs(p.x - 640) + Math.abs(p.y - 220) < Math.abs(best.p.x - 640) + Math.abs(best.p.y - 220)) best = { c, p };
    }
    return best;
  }, ziel.hex);
  await frames(page, 4);
  if (!bz) fail('Bedienung: kein Hex in drei Hexen Abstand im Blickfeld für den Arbeitsbereich');
  else {
    const bp = await page.evaluate((c) => window.eifeler.spiel.bildschirm(c), bz.c);
    await page.locator('.fenster [data-knopf="bereich"]').click();
    await page.waitForSelector('.fenster [data-knopf="bereich"].an', { timeout: 30000 });
    await page.mouse.move(bp.x - 20, bp.y - 10);
    await page.mouse.move(bp.x, bp.y, { steps: 4 });
    // der Zeiger trifft nicht immer genau den Nachbar-Hex (Hang, Überhöhung): der tatsächlich getroffene Hex zählt
    await page.waitForFunction((b) => { const f = window.eifeler.spiel.fokus; return f && Math.max(Math.abs(f.q - b.q), Math.abs(f.r - b.r)) <= 6; }, ziel.hex, { timeout: 30000, polling: 200 });
    const treff = await page.evaluate(() => ({ ...window.eifeler.spiel.fokus }));
    bz.c = treff;
    await frames(page, 6);
    await page.waitForTimeout(800);
    const hint = await page.evaluate(() => document.querySelector('.hinweis .text')?.textContent);
    info(`Bedienung: Arbeitsbereich-Modus, Hinweis „${hint}“`);
    if (!/Arbeitsbereich/.test(hint ?? '')) fail(`Bedienung: Hinweis im Arbeitsbereich-Modus: ${hint}`);
    await bild(page, '10-arbeitsbereich.png');
    await page.mouse.click(bp.x, bp.y);
    await page.waitForFunction((h) => window.eifeler.spiel.protokoll().befehle.some((x) => x.befehl.art === 'arbeitsbereich' && x.befehl.q === h.q && x.befehl.r === h.r), bz.c, { timeout: 30000, polling: 200 });
    // der Befehl gilt ab dem nächsten Tick: warten, bis die Sicht den Mittelpunkt zeigt
    await page.waitForFunction((b) => !!window.eifeler.spiel.sicht.gebaeude.find((g) => g.q === b.q && g.r === b.r)?.mitte, ziel.hex, { timeout: 30000, polling: 200 }).catch(() => undefined);
    const gesetzt = await page.evaluate((b) => ({
      id: window.eifeler.spiel.sicht.gebaeude.find((g) => g.q === b.q && g.r === b.r)?.id,
      befehle: window.eifeler.spiel.protokoll().befehle.filter((x) => x.befehl.art === 'arbeitsbereich').map((x) => x.befehl),
      mitte: window.eifeler.spiel.sicht.gebaeude.find((g) => g.q === b.q && g.r === b.r)?.mitte ?? null,
      modus: !!document.querySelector('.fenster [data-knopf="bereich"].an'),
    }), ziel.hex);
    info(`Bedienung: Arbeitsbereich gesetzt, Befehl ${JSON.stringify(gesetzt.befehle[0])}, Sicht.mitte ${JSON.stringify(gesetzt.mitte)}`);
    if (!gesetzt.mitte || gesetzt.mitte.q !== bz.c.q || gesetzt.mitte.r !== bz.c.r) fail(`Bedienung: Sicht.mitte nach dem Setzen ${JSON.stringify(gesetzt.mitte)} statt ${JSON.stringify(bz.c)}`);
    if (gesetzt.befehle[0]?.id !== gesetzt.id) fail('Bedienung: Befehl arbeitsbereich mit falscher Gebäude-Id');
    if (gesetzt.modus) fail('Bedienung: Arbeitsbereich-Modus nach dem Setzen noch an');
    // Esc beendet den Modus ohne Befehl
    const vorBefehle = gesetzt.befehle.length;
    await page.locator('.fenster [data-knopf="bereich"]').click();
    await page.waitForSelector('.fenster [data-knopf="bereich"].an', { timeout: 30000 });
    await page.keyboard.press('Escape');
    const nachEsc = await page.evaluate(() => ({ modus: !!document.querySelector('.fenster [data-knopf="bereich"].an'), n: window.eifeler.spiel.protokoll().befehle.filter((x) => x.befehl.art === 'arbeitsbereich').length }));
    if (nachEsc.modus || nachEsc.n !== vorBefehle) fail(`Bedienung: Esc im Arbeitsbereich-Modus: ${JSON.stringify(nachEsc)}`);
  }
  // Natur aus der Nähe: Felsgruppe, Lesesteine, Bäume auf der Wiese (Sicht.natur; ohne felsArt/start aus der Menge geschätzt)
  await page.keyboard.press('Escape');   // Gebäudefenster zu (vor der Kamerafahrt: Tasten brechen sie ab)
  const natur = await page.evaluate(() => {
    const e = window.eifeler, sp = e.spiel, k = sp.sim.karte, nat = sp.sicht.natur, L = sp.lagerHex;
    const dist = (a, c) => (Math.abs(a.q - c.q) + Math.abs(a.r - c.r) + Math.abs(a.q + a.r - c.q - c.r)) / 2;
    const art = (i) => (nat.felsArt ? nat.felsArt[i] : k.terrain[i] === 5 ? 1 : nat.fels[i] >= 12 ? 2 : 3);
    const hexe = (f) => { const l = []; for (let i = 0; i < k.count; i++) if (f(i)) l.push({ q: k.qs[i], r: k.rs[i] }); return l; };
    const naechster = (l, von) => l.reduce((b, h) => (!b || dist(h, von) < dist(b, von) ? h : b), null);
    const fels = hexe((i) => nat.fels[i] > 0 && art(i) === 1), lese = hexe((i) => nat.fels[i] > 0 && art(i) === 3);
    const wiese = hexe((i) => k.terrain[i] === 1 && nat.baum[i] > 0);
    const f = naechster(fels, L), l = f ? naechster(lese, f) : naechster(lese, L), w = naechster(wiese, f ?? L);
    const a = f ?? l ?? L, b = l ?? a;
    const mitte = { q: Math.round((a.q + b.q) / 2), r: Math.round((a.r + b.r) / 2) };
    const wm = e.grid.toWorld(mitte);
    e.cam.pitchOverride = 38;
    e.cam.jumpTo(wm.x, wm.z + 40, 380 + dist(a, b) * 55, 0.3);
    e.settle();
    return { fels: fels.length, lese: lese.length, wiese: wiese.length, f, l, w };
  });
  info(`Bedienung: Natur nah – Felshexe ${natur.fels}, Lesesteinhexe ${natur.lese}, Wiesenbaum-Hexe ${natur.wiese}`);
  await frames(page, 4);
  await page.waitForTimeout(2500);
  await bild(page, '11-natur-nah.png');
  // Tasten: B öffnet das Menü, Esc schließt es; P schaltet die Bauplätze ohne Werkzeug
  await page.keyboard.press('b');
  if (!(await page.evaluate(() => !document.querySelector('.baumenue').hidden))) fail('Bedienung: Taste B öffnet das Menü nicht');
  await page.keyboard.press('Escape');
  if (!(await page.evaluate(() => document.querySelector('.baumenue').hidden))) fail('Bedienung: Esc schließt das Menü nicht');

  // ---- M7: Baumenü mit Reitern, Tooltip und Taste; Fenster mit Pin, Esc und Live-Daten; 5 Fenster im Leistungsbudget
  await page.keyboard.press('b');
  await page.locator('.bm-reiter-knopf[data-gruppe="Essen"]').click();
  const reiter = await page.evaluate(() => [...document.querySelectorAll('.bm-gruppe')].filter((g) => !g.hidden).map((g) => g.querySelector('h4').textContent));
  if (reiter.length !== 1 || reiter[0] !== 'Essen') fail(`Bedienung M7: Reiter „Essen“ zeigt ${reiter.join(', ')}`);
  await page.locator('.bm-reiter-knopf[data-gruppe="Alle"]').click();
  await page.hover('.bm-eintrag[data-id="kueche"]');
  const tipp = await page.evaluate(() => { const t = document.querySelector('.bm-tipp'); return t && !t.hidden ? t.textContent : null; });
  info(`Bedienung M7: Tooltip Küche „${tipp}“`);
  if (!/Kosten: .*Kartoffeln → 1 Bratkartoffel/.test(tipp ?? '')) fail(`Bedienung M7: Tooltip im Baumenü: ${tipp}`);
  await bild(page, '12-baumenue-tooltip.png');
  await page.keyboard.press('f');
  const taste = await page.evaluate(() => ({ w: window.eifeler.spiel.werkzeug, offen: !document.querySelector('.baumenue').hidden }));
  if (taste.w !== 'holzfaeller' || taste.offen) fail(`Bedienung M7: Taste F im Baumenü: ${JSON.stringify(taste)}`);
  await page.keyboard.press('Escape');
  // Lagerfenster per Klick, anpinnen, weitere Fenster per Taste; Esc schließt nur nicht angepinnte
  await page.evaluate(() => { const e = window.eifeler, sp = e.spiel, w = e.grid.toWorld(sp.lagerHex); e.cam.pitchOverride = 45; e.cam.jumpTo(w.x, w.z + 120, 900, 0.25); e.settle(); return null; });
  await frames(page, 4);
  const lagerPos = await page.evaluate(() => window.eifeler.spiel.bildschirm(window.eifeler.spiel.lagerHex));
  await page.mouse.click(lagerPos.x, lagerPos.y);
  await page.waitForSelector('.fenster[data-fenster="geb:1"]', { timeout: 10000 });
  await page.locator('.fenster[data-fenster="geb:1"] .fe-pin').click();
  for (const k of ['i', 'v', 't', 'l']) await page.keyboard.press(k);
  await page.waitForTimeout(600);
  const offen = await page.evaluate(() => window.eifeler.spiel.fenster.ids);
  info(`Bedienung M7: offene Fenster ${offen.join(', ')}`);
  if (offen.length !== 5) fail(`Bedienung M7: 5 Fenster erwartet, offen: ${offen.join(', ')}`);
  // Fenster verschieben (Kopf ziehen)
  const kopf = await page.locator('.fenster[data-fenster="protokoll"] .fe-kopf').boundingBox();
  await page.mouse.move(kopf.x + 60, kopf.y + 15);
  await page.mouse.down();
  await page.mouse.move(kopf.x - 240, kopf.y + 140, { steps: 5 });
  await page.mouse.up();
  const neu = await page.locator('.fenster[data-fenster="protokoll"]').boundingBox();
  if (Math.abs(neu.x - (kopf.x - 300)) > 12 || Math.abs(neu.y - (kopf.y + 125)) > 12) fail(`Bedienung M7: Fenster nicht verschoben (${Math.round(neu.x)},${Math.round(neu.y)})`);
  // Leistungsbudget (DESIGN §11.2: Frame-CPU unter 8 ms): mit 5 Fenstern kostet ihre Aktualisierung (4× je Sekunde) fast nichts
  const mess = await page.evaluate(async () => {
    const sp = window.eifeler.spiel;
    sp.pause(false);
    sp.fenster.messung = { ms: 0, max: 0, n: 0 };
    const t0 = performance.now(), f0 = sp.fenster.messung.n;
    let bilder = 0;
    await new Promise((ok) => { const f = () => { bilder++; if (performance.now() - t0 < 4000) requestAnimationFrame(f); else ok(); }; requestAnimationFrame(f); });
    const lager = [...document.querySelectorAll('.fenster[data-fenster="geb:1"] .fe-ware')].map((w) => w.title).join(' ');
    return { ms: sp.fenster.messung.ms, max: sp.fenster.messung.max, n: sp.fenster.messung.n - f0, s: (performance.now() - t0) / 1000, lager, bilder };
  });
  info(`Bedienung M7: 5 Fenster, ${mess.n} Aktualisierungen in ${mess.s.toFixed(1)} s (${mess.bilder} Bilder), im Mittel ${mess.ms.toFixed(2)} ms (max ${mess.max.toFixed(1)} ms)`);
  // 4× je Sekunde, aber höchstens einmal je Bild (Software-Grafik im Test ist langsam)
  if (mess.n < Math.min(14, mess.bilder) - 2) fail(`Bedienung M7: Fenster werden kaum aktualisiert (${mess.n} in ${mess.s.toFixed(1)} s)`);
  if (mess.ms > 4) fail(`Bedienung M7: Fenster-Aktualisierung zu teuer (${mess.ms.toFixed(2)} ms im Mittel)`);
  if (!/Bretter|Stein/.test(mess.lager)) fail('Bedienung M7: Lagerfenster ohne Bestand');
  await bild(page, '13-fuenf-fenster.png');
  for (let i = 0; i < 6; i++) await page.keyboard.press('Escape');
  const nachEscs = await page.evaluate(() => window.eifeler.spiel.fenster.ids);
  info(`Bedienung M7: nach Esc offen: ${nachEscs.join(', ')}`);
  if (!nachEscs.includes('geb:1') || nachEscs.some((x) => !['geb:1', 'einstellungen'].includes(x))) fail(`Bedienung M7: Esc und Pin: ${nachEscs.join(', ')}`);
  // Warenverteilung über das Fenster (Befehl 'verteilung'), Ruhen über das Gebäudefenster ist im Unit-Test
  await page.evaluate(() => { const sp = window.eifeler.spiel; for (const id of sp.fenster.ids) if (id !== 'geb:1') sp.fenster.schliesse(id); sp.fensterUmschalten('verteilung'); });
  await page.waitForSelector('.fenster[data-fenster="verteilung"] .fe-platz:not([disabled])', { timeout: 30000 });
  await page.locator('.fenster[data-fenster="verteilung"] .fe-platz:not([disabled])').first().click();
  await page.waitForFunction(() => window.eifeler.spiel.protokoll().befehle.some((x) => x.befehl.art === 'verteilung'), null, { timeout: 10000, polling: 200 })
    .then(() => info('Bedienung M7: Warenverteilung umgestellt (Befehl verteilung)'))
    .catch(() => fail('Bedienung M7: Klick in der Warenverteilung schickt keinen Befehl'));
  // Meldung am Rand: ein Gebäude ohne Weg, Klick springt hin
  await page.evaluate(() => {
    const sp = window.eifeler.spiel, L = sp.lagerHex;
    for (let d = 3; d < 8; d++) for (const [dq, dr] of [[d, 0], [0, d], [-d, 0], [0, -d], [d, -d], [-d, d]]) {
      const c = { q: L.q + dq, r: L.r + dr };
      if (sp.sim.kannBauen('wohnhaus', c.q, c.r)) { sp.befehl({ art: 'gebaeude', typ: 'wohnhaus', q: c.q, r: c.r }); return; }
    }
  });
  await page.waitForSelector('.randmeldung[data-art="getrennt"]', { timeout: 15000 })
    .then(async () => {
      const vor = await page.evaluate(() => ({ ...window.eifeler.cam.target }));
      await page.locator('.randmeldung[data-art="getrennt"]').click();
      await page.waitForTimeout(800);
      const nach = await page.evaluate(() => ({ ...window.eifeler.cam.target }));
      info(`Bedienung M7: Meldung am Rand „${await page.locator('.randmeldung[data-art="getrennt"]').textContent()}“, Kamera ${Math.round(Math.hypot(nach.x - vor.x, nach.z - vor.z))} m gefahren`);
    })
    .catch(() => fail('Bedienung M7: keine Meldung am Rand für ein Gebäude ohne Weg'));
  const prot = await page.evaluate(() => window.eifeler.spiel.protokollZeilen.map((z) => z.text));
  if (!prot.some((t) => /ohne Weg/.test(t))) fail(`Bedienung M7: Protokoll ohne die Meldung: ${prot.slice(-5).join(' | ')}`);
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
  await hp.waitForSelector('.baumenue:not([hidden])', { timeout: 30000 });
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
  // M7 Handy: Gebäudefenster als Blatt unten, ganz im Bild
  await hp.evaluate(() => { const sp = window.eifeler.spiel; sp.waehleWerkzeug('keins'); sp.klickAuf(sp.lagerHex, true); });
  await hp.waitForSelector('.fenster[data-fenster="geb:1"]', { timeout: 10000 });
  await hp.waitForTimeout(500);
  const blatt = await hp.evaluate(() => { const r = document.querySelector('.fenster').getBoundingClientRect(); return { l: r.left, r: r.right, o: r.top, u: r.bottom, b: innerWidth, h: innerHeight, sb: document.documentElement.scrollWidth }; });
  info(`Bedienung Handy: Gebäudefenster ${Math.round(blatt.l)}..${Math.round(blatt.r)} × ${Math.round(blatt.o)}..${Math.round(blatt.u)} px`);
  if (blatt.l < 0 || blatt.r > blatt.b + 0.5 || blatt.o < 0 || blatt.u > blatt.h || blatt.sb > blatt.b) fail(`Bedienung Handy: Fenster ragt aus dem Bild ${JSON.stringify(blatt)}`);
  await bild(hp, '14-handy-fenster.png');
  await hp.evaluate(() => window.eifeler.spiel.fenster.schliesseGruppe('auswahl', true));
  // Weg am Handy: Start-Fahne, ein Zwischenpunkt, dann Tipp auf die Gebäudefahne baut sofort (ohne Bestätigen)
  const weg = await hp.evaluate((ziel) => {
    const sp = window.eifeler.spiel;
    const L = sp.lagerHex;
    const n = sp.sicht.segmente.length;
    sp.waehleWerkzeug('weg');
    sp.klickAuf(L, true);
    const RICHT = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
    const zw = RICHT.map(([dq, dr]) => ({ q: L.q + dq, r: L.r + dr }))
      .find((h) => sp.sim.wegAbschnitt(L, h, [L], 1) && sp.sim.wegAbschnitt(h, ziel, [L, h], 59));
    if (!zw) return { n, zw: null };
    sp.klickAuf(zw, true);
    sp.klickAuf(ziel, true);
    return { n, zw };
  }, z2.hex);
  if (!weg.zw) info('Bedienung Handy: kein Zwischenpunkt neben dem Lager gefunden, Weg-Test übersprungen');
  else {
    await hp.waitForFunction((n) => window.eifeler.spiel.sicht.segmente.length > n, weg.n, { timeout: 30000, polling: 200 })
      .then(() => info('Bedienung Handy: Weg mit Zwischenpunkt per Tipp auf die Fahne sofort gebaut'))
      .catch(() => fail('Bedienung Handy: Tipp auf die Fahne hat den Weg nicht gebaut'));
  }
  await handy.close();
  await ctx.close().catch(() => undefined);
}
