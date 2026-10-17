// Baut eine eigenständige Teilen-Version nach dist-share/ (z. B. als Artifact-Seite fürs Handy):
//   npm run build:share -- [--version V] [--vorschlaege monschau-rursee,rureifel] [--ausschnitt q,r,groesse]...
// - Spiel mit relativen Pfaden (vite build --base ./), VITE_WELT_B64=1, VITE_WELT_URL=./welt
// - Teil-Datenversion unter dist-share/welt/<version>/: nur die Kacheln, die die gewählten Vorschläge/Ausschnitte
//   samt Kulisse brauchen; Binärdateien (.gz, .webp) als Base64-Text mit Endung .txt
// - index.html ohne Dokument-Gerüst (Artifact-Seiten liefern nur Text zuverlässig aus)
// Datenquelle: WELT_DATEN (Standard welt-daten/).
import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const WURZEL = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(WURZEL, 'dist-share');
const DATEN = resolve(process.env.WELT_DATEN ?? join(WURZEL, 'welt-daten'));

// ---------------------------------------------------------------- Argumente
const args = process.argv.slice(2);
const opt = (name) => args.flatMap((a, i) => (a === `--${name}` ? [args[i + 1]] : a.startsWith(`--${name}=`) ? [a.slice(name.length + 3)] : []));
let version = opt('version')[0];
const vorschlagIds = opt('vorschlaege').flatMap((s) => s.split(',')).map((s) => s.trim()).filter(Boolean);
const ausschnitte = opt('ausschnitt').map((s) => {
  const [q, r, size] = s.split(',').map((x) => x.trim());
  if (!Number.isFinite(Number(q)) || !Number.isFinite(Number(r)) || !['klein', 'mittel', 'gross'].includes(size)) {
    throw new Error(`--ausschnitt q,r,groesse erwartet, bekam „${s}“ (groesse: klein|mittel|gross)`);
  }
  return { q: Number(q), r: Number(r), size };
});
const lesJson = (p) => JSON.parse(readFileSync(p, 'utf8'));
if (!version) version = lesJson(join(DATEN, 'versions.json')).aktuell;
const quelle = join(DATEN, version);
if (!existsSync(join(quelle, 'manifest.json'))) throw new Error(`Datenversion ${version} nicht gefunden in ${DATEN}`);

// ---------------------------------------------------------------- Client-Logik für die Kachelmengen (gleiche Funktionen wie im Spiel)
const bundle = await build({
  stdin: {
    contents: `export { klemmeAusschnitt, datenRechteck } from './src/welt/ausschnitt.ts';
export { toOffset } from './src/welt/hexwelt.ts';
export { GROESSEN, HEX, KACHEL } from './src/welt/format.ts';
export { VORSCHLAEGE } from './src/map/presets.ts';`,
    resolveDir: WURZEL, loader: 'ts',
  },
  bundle: true, format: 'esm', platform: 'node', write: false, define: { 'import.meta.env': '{}' }, logLevel: 'error',
});
const L = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);

const manifest = lesJson(join(quelle, 'manifest.json'));
const auswahl = [];
for (const id of vorschlagIds) {
  const v = L.VORSCHLAEGE.find((x) => x.id === id);
  if (!v) throw new Error(`Unbekannter Vorschlag „${id}“ (bekannt: ${L.VORSCHLAEGE.map((x) => x.id).join(', ')})`);
  auswahl.push({ name: id, q: v.q, r: v.r, size: v.size });
}
for (const a of ausschnitte) auswahl.push({ name: `ausschnitt ${a.q},${a.r},${a.size}`, ...a });
if (!auswahl.length) {
  for (const v of L.VORSCHLAEGE) auswahl.push({ name: v.id, q: v.q, r: v.r, size: v.size });
  console.log('Hinweis: weder --vorschlaege noch --ausschnitt angegeben, nehme alle Vorschläge, die in die Daten passen.');
}

// ---------------------------------------------------------------- Kachelmengen
const rKacheln = new Set(), hexKacheln = new Set();
const manifestR = new Set(manifest.kacheln.map(([x, z]) => `${x}_${z}`));
const manifestH = new Set(manifest.hex.kacheln.map(([x, z]) => `${x}_${z}`));
let genommen = 0;
for (const a of auswahl) {
  let p;
  try { p = L.klemmeAusschnitt(manifest, { version, q: a.q, r: a.r, size: a.size }); } catch (e) {
    console.warn(`Übersprungen: ${a.name} – ${e.message}`);
    continue;
  }
  if (p.q !== a.q || p.r !== a.r) console.warn(`Hinweis: ${a.name} liegt nicht ganz in den Daten, Mitte verschoben auf ${p.q},${p.r}.`);
  genommen++;
  const n = L.GROESSEN[a.size], K = L.KACHEL.m;
  // Rechteck Spielfeld + Kulisse (2000 m); darin liegt auch der r10-Rand (300 m). Alle Rasterarten für alle diese Kacheln.
  const b = L.datenRechteck(p.q, p.r, n);
  for (let tz = Math.floor(b.z0 / K); tz <= Math.floor((b.z1 - 1e-6) / K); tz++) {
    for (let tx = Math.floor(b.x0 / K); tx <= Math.floor((b.x1 - 1e-6) / K); tx++) if (manifestR.has(`${tx}_${tz}`)) rKacheln.add(`${tx}_${tz}`);
  }
  for (let dr = -n; dr <= n; dr++) {
    const a0 = Math.max(-n, -dr - n), z0 = Math.min(n, -dr + n);
    const c0 = L.toOffset(p.q + a0, p.r + dr).col, c1 = L.toOffset(p.q + z0, p.r + dr).col;
    const hz = Math.floor((p.r + dr) / L.HEX.tile);
    for (let hx = Math.floor(c0 / L.HEX.tile); hx <= Math.floor(c1 / L.HEX.tile); hx++) if (manifestH.has(`${hx}_${hz}`)) hexKacheln.add(`${hx}_${hz}`);
  }
}
if (!genommen) throw new Error('Kein Vorschlag/Ausschnitt passt in die Daten dieser Version – nichts zu bauen.');

// ---------------------------------------------------------------- Spiel bauen
rmSync(OUT, { recursive: true, force: true });
execSync(`npx vite build --base ./ --outDir ${OUT} --emptyOutDir`, {
  stdio: 'inherit', cwd: WURZEL, env: { ...process.env, VITE_WELT_B64: '1', VITE_WELT_URL: './welt' },
});

// ---------------------------------------------------------------- Teil-Datenversion schreiben
const ziel = join(OUT, 'welt', version);
const schreibe = (rel, inhalt) => {
  const f = join(ziel, rel);
  mkdirSync(dirname(f), { recursive: true });
  writeFileSync(f, inhalt);
};
const behalten = new Set(['orte.json']);
const kopiere = (rel) => {
  if (!existsSync(join(quelle, rel))) return false;
  const bytes = readFileSync(join(quelle, rel));
  if (/\.(gz|webp)$/.test(rel)) schreibe(`${rel}.txt`, bytes.toString('base64')); else schreibe(rel, bytes);
  behalten.add(rel);
  return true;
};
kopiere('orte.json');
if (existsSync(join(quelle, 'uebersicht'))) for (const f of readdirSync(join(quelle, 'uebersicht'))) kopiere(`uebersicht/${f}`);
for (const k of rKacheln) for (const art of ['r10', 'r40']) kopiere(`${art}/${k}.bin.gz`);
for (const k of rKacheln) kopiere(`vec/${k}.json.gz`); // nicht jede Kachel hat Vektoren
for (const k of hexKacheln) kopiere(`hex/${k}.bin.gz`);

const teil = (liste, set) => liste.filter(([x, z]) => set.has(`${x}_${z}`));
const files = Object.fromEntries(Object.entries(manifest.files).filter(([k]) => behalten.has(k)));
const m2 = { ...manifest, kacheln: teil(manifest.kacheln, rKacheln), hex: { ...manifest.hex, kacheln: teil(manifest.hex.kacheln, hexKacheln) }, files };
schreibe('manifest.json', JSON.stringify(m2));
const vers = lesJson(join(DATEN, 'versions.json'));
const eintrag = vers.versionen.find((v) => v.id === version) ?? { id: version, gebiet: manifest.gebiet, erstellt: manifest.erstellt };
mkdirSync(join(OUT, 'welt'), { recursive: true });
writeFileSync(join(OUT, 'welt', 'versions.json'), JSON.stringify({ aktuell: version, versionen: [eintrag] }));

// ---------------------------------------------------------------- index.html ohne Dokument-Gerüst
const html = readFileSync(join(OUT, 'index.html'), 'utf8')
  .replace(/<!doctype html>|<\/?html[^>]*>|<\/?head>|<\/?body>|<meta charset[^>]*>|<meta name="viewport"[^>]*>/gi, '')
  .replace(/^\s*\n/gm, '');
writeFileSync(join(OUT, 'index.html'), html);

// ---------------------------------------------------------------- Bericht
const walk = (d) => readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)]));
const dateien = walk(OUT).map((f) => ({ f: f.slice(OUT.length + 1), n: statSync(f).size })).sort((a, b) => a.f.localeCompare(b.f));
const kb = (n) => (n / 1024).toFixed(n < 10240 ? 1 : 0).padStart(8) + ' KB';
const gruppen = new Map();
for (const d of dateien) {
  const t = d.f.split('/');
  const g = t[0] === 'welt' && t.length > 3 ? t.slice(0, 3).join('/') + '/…' : d.f;
  const e = gruppen.get(g) ?? { n: 0, z: 0 };
  e.n += d.n; e.z++;
  gruppen.set(g, e);
}
console.log(`\nTeilen-Version: ${version}, ${rKacheln.size} Raster-Kacheln, ${hexKacheln.size} Hex-Kacheln`);
for (const [g, e] of gruppen) console.log(`${kb(e.n)}  ${g}${e.z > 1 ? `  (${e.z} Dateien)` : ''}`);
const summe = dateien.reduce((s, d) => s + d.n, 0);
console.log(`${kb(summe)}  Summe, ${dateien.length} Dateien   -> ${OUT}`);
const seite = dateien.filter((d) => /^(index\.html|assets\/.*\.js)$/.test(d.f)).reduce((s, d) => s + d.n, 0);
const warn = [];
if (seite > 16 * 2 ** 20) warn.push(`Seite (index.html + JS) ist ${(seite / 2 ** 20).toFixed(1)} MB (> 16 MB)`);
for (const d of dateien) if (d.n > 15 * 2 ** 20) warn.push(`Datei ${d.f} ist ${(d.n / 2 ** 20).toFixed(1)} MB (> 15 MB)`);
if (dateien.length > 250) warn.push(`${dateien.length} Dateien (> 250)`);
if (summe > 60 * 2 ** 20) warn.push(`Summe ${(summe / 2 ** 20).toFixed(1)} MB (> 60 MB)`);
for (const w of warn) console.warn(`WARNUNG: ${w}`);
if (!warn.length) console.log('Grenzen eingehalten (Seite <= 16 MB, Datei <= 15 MB, <= 250 Dateien, Summe <= 60 MB).');
