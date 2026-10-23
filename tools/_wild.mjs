// Prüfskript: alle Wildtiere (src/render/wild.ts) nebeneinander, schräg von vorn-oben, eine Trägerfigur zum Größenvergleich
import { chromium } from 'playwright';
import { createServer } from 'vite';
const aus = process.argv[2];
const vite = await createServer({ root: '/home/user/die-eifler', logLevel: 'warn', server: { port: 5208, strictPort: true, host: '127.0.0.1', hmr: false, watch: null } });
await vite.listen();
const browser = await chromium.launch({ headless: false, executablePath: '/opt/pw-browsers/chromium', args: ['--headless=new', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1400, height: 520 } });
page.on('pageerror', (e) => console.log('pageerror', e.message));
await page.goto('http://127.0.0.1:5208/tools/stilprobe/index.html');
await page.evaluate(async (nah) => {
  document.body.innerHTML = '';
  const THREE = await import('/node_modules/.vite/deps/three.js');
  const { figur, material, FIGUR_ATTRIBUTE } = await import('/src/render/traeger.ts');
  const { wildModelle, WILD_ARTEN } = await import('/src/render/wild.ts');
  const { Instanzen } = await import('/src/render/instanzen.ts');
  const leben = await (await fetch('/data/leben.json')).json();
  const r = new THREE.WebGLRenderer({ antialias: true }); r.setSize(1400, 520); document.body.append(r.domElement);
  const sz = new THREE.Scene(); sz.background = new THREE.Color('#9cc46a');
  sz.add(new THREE.HemisphereLight('#dfefff', '#4a5a30', 1.3)); const so = new THREE.DirectionalLight('#ffe8c8', 2.6); so.position.set(-2, 5, 4); sz.add(so);
  const mo = wildModelle(), mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 });
  const liste = [...WILD_ARTEN, 'figur'];
  liste.forEach((a, i) => {
    const x = (i - (liste.length - 1) / 2) * 1.55;
    if (a === 'figur') {
      const s = new Instanzen(sz, figur(), material(), true, false, FIGUR_ATTRIBUTE, 1);
      s.beginne(); s.fuege(new THREE.Matrix4().makeTranslation(x, 0, 0).multiply(new THREE.Matrix4().makeScale(20.5 / leben.wild.skala / 4, 20.5 / leben.wild.skala / 4, 20.5 / leben.wild.skala / 4)), new THREE.Color('#3f6fb5'), [0.3, 0, 0, 0.6, 0]); s.fertig();
    } else {
      const m = new THREE.Mesh(mo[a], mat); const g = leben.wild.arten[a].groesse / (nah ? 1.6 : 4); m.scale.setScalar(g); m.position.x = x; m.rotation.y = -0.6; sz.add(m);
    }
    const d = document.createElement('div'); d.textContent = a; d.style.cssText = `position:absolute;top:470px;left:${(i + 0.5) * 1400 / liste.length - 40}px;width:80px;text-align:center;font:14px sans-serif`;
    document.body.append(d);
  });
  const k = new THREE.PerspectiveCamera(30, 1400 / 520, 0.1, 100); k.position.set(0, 4.2, 11); k.lookAt(0, 0.5, 0);
  r.render(sz, k);
}, !!process.env.NAH);
await page.waitForTimeout(500);
await page.screenshot({ path: aus });
await browser.close(); await vite.close();
