// Baut eine eigenständige Teilen-Version nach dist-share/ (z. B. als Artifact-Seite fürs Handy):
// relative Pfade, Raster als Base64-Text (.bin.txt), index.html ohne Dokument-Gerüst.
import { execSync } from 'node:child_process';
import { readdirSync, readFileSync, writeFileSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';

const out = 'dist-share';
rmSync(out, { recursive: true, force: true });
execSync(`npx vite build --base ./ --outDir ${out}`, { stdio: 'inherit', env: { ...process.env, VITE_MAP_B64: '1' } });

const walk = (d) => readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)]));
for (const f of walk(join(out, 'maps'))) {
  if (!f.endsWith('.bin')) continue;
  writeFileSync(`${f}.txt`, readFileSync(f).toString('base64'));
  rmSync(f);
}
const html = readFileSync(join(out, 'index.html'), 'utf8')
  .replace(/<!doctype html>|<\/?html[^>]*>|<\/?head>|<\/?body>|<meta charset[^>]*>|<meta name="viewport"[^>]*>/gi, '')
  .replace(/^\s*\n/gm, '');
writeFileSync(join(out, 'index.html'), html);
console.log(walk(out).map((f) => `${statSync(f).size}\t${f}`).join('\n'));
