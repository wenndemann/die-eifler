// Prüfskript: alle Trachten (Berufe und Meister aus data/leben.json) nebeneinander, von vorn-oben wie die Spielkamera
import { chromium } from 'playwright';
import { createServer } from 'vite';
const aus = process.argv[2];
const vite = await createServer({ root: '/home/user/die-eifler', logLevel: 'warn', server: { port: 5207, strictPort: true, host: '127.0.0.1', hmr: false, watch: null } });
await vite.listen();
const browser = await chromium.launch({ headless: false, executablePath: '/opt/pw-browsers/chromium', args: ['--headless=new', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1400, height: 520 } });
page.on('pageerror', (e) => console.log('pageerror', e.message));
await page.goto('http://127.0.0.1:5207/tools/stilprobe/index.html');
await page.evaluate(async () => {
  document.body.innerHTML = '';
  const THREE = await import('/node_modules/.vite/deps/three.js');
  const { figur, material, FIGUR_ATTRIBUTE, TRAEGER_TRACHT } = await import('/src/render/traeger.ts');
  const { Instanzen } = await import('/src/render/instanzen.ts');
  const leben = await (await fetch('/data/leben.json')).json();
  const liste = [['Träger', TRAEGER_TRACHT], ...Object.entries(leben.berufe), ['Schmied', leben.meister.schmiede], ['Koch', leben.meister.kueche], ['Käserin', leben.meister.kaeserei], ['Brauer', leben.meister.brauerei], ['Wirt', leben.meister.schaenke], ['Köhler', leben.meister.koehlerei], ['Imker', leben.meister.bienenstock], ['Fischer', leben.meister.fischerhuette]];
  const r = new THREE.WebGLRenderer({ antialias: true }); r.setSize(1400, 520); document.body.append(r.domElement);
  const sz = new THREE.Scene(); sz.background = new THREE.Color('#9cc46a');
  sz.add(new THREE.HemisphereLight('#dfefff', '#4a5a30', 1.3)); const so = new THREE.DirectionalLight('#ffe8c8', 2.6); so.position.set(-2, 5, 4); sz.add(so);
  const mat = material(), m = new THREE.Matrix4(), farben = ['#3f6fb5', '#b5463f', '#4f8a4a', '#d0a030', '#7a4fa0'];
  liste.forEach(([name, t], i) => {
    const s = new Instanzen(sz, figur(t), mat, true, false, FIGUR_ATTRIBUTE, 1);
    s.beginne(); m.makeTranslation((i - (liste.length - 1) / 2) * 1.05, 0, 0); s.fuege(m, new THREE.Color(farben[i % 5]), [0.3, 0, 0, 0.6, 0]); s.fertig();
    const d = document.createElement('div'); d.textContent = name; d.style.cssText = `position:absolute;top:470px;left:${(i + 0.5) * 1400 / liste.length - 40}px;width:80px;text-align:center;font:14px sans-serif`;
    document.body.append(d);
  });
  const k = new THREE.PerspectiveCamera(30, 1400 / 520, 0.1, 100); k.position.set(0, 3.2, 9); k.lookAt(0, 0.55, 0);
  r.render(sz, k);
});
await page.waitForTimeout(500);
await page.screenshot({ path: aus });
await browser.close(); await vite.close();
