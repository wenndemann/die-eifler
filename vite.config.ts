import { defineConfig, type Plugin } from 'vite';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { join, normalize, resolve } from 'node:path';

// Weltdaten liegen außerhalb von Git in welt-daten/ (tools/map/setup.py). Der Entwicklungsserver
// liefert sie unter /welt/ aus, ohne gzip anzufassen (der Client entpackt selbst).
const DATEN = resolve(process.env.WELT_DATEN ?? 'welt-daten');

function weltDaten(): Plugin {
  const serve: Plugin['configureServer'] = (server) => {
    server.middlewares.use('/welt', (req, res, next) => {
      const rel = normalize(decodeURIComponent((req.url ?? '/').split('?')[0])).replace(/^([/\\]|\.\.)+/, '');
      const file = join(DATEN, rel);
      if (!file.startsWith(DATEN) || !existsSync(file) || !statSync(file).isFile()) return next();
      const type = file.endsWith('.json') ? 'application/json'
        : file.endsWith('.webp') ? 'image/webp' : 'application/octet-stream';
      res.setHeader('Content-Type', type);
      res.setHeader('Cache-Control', file.endsWith('versions.json') ? 'no-cache' : 'max-age=31536000, immutable');
      createReadStream(file).pipe(res);
    });
  };
  return { name: 'welt-daten', configureServer: serve, configurePreviewServer: serve as Plugin['configurePreviewServer'] };
}

export default defineConfig({
  plugins: [weltDaten()],
});
