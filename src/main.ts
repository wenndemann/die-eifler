import * as THREE from 'three';
import './style.css';
import { MapData } from './map/mapdata';
import { HexGrid } from './map/hex';
import { Stage } from './render/scene';
import { Terrain } from './render/terrain';
import { Water } from './render/water';
import { Rivers } from './render/rivers';
import { Trees } from './render/trees';
import { Houses } from './render/houses';
import { RtsCamera } from './render/camera';
import { Hud } from './ui/hud';
import { buildMockup } from './render/mockup';

const TERRAIN_NAMES: Record<string, string> = {
  wasser: 'Wasser', wiese: 'Wiese', wald: 'Wald', heide: 'Heide', moor: 'Moor (Venn)', stein: 'Fels', siedlung: 'Ortschaft',
};

async function main() {
  const app = document.getElementById('app')!;
  const loading = document.getElementById('loading')!;
  const mapsBase = `${import.meta.env.BASE_URL}maps`;
  const maps = (await (await fetch(`${mapsBase}/index.json`)).json()) as { id: string; name: string }[];
  // Karte: #id (auch in veröffentlichten Seiten), ?map=id, zuletzt gewählte, sonst die erste
  let remembered: string | null = null;
  try { remembered = localStorage.getItem('eifeler.map'); } catch { /* egal */ }
  const wanted = location.hash.slice(1) || new URLSearchParams(location.search).get('map') || remembered;
  const mapId = maps.find((m) => m.id === wanted)?.id ?? maps[0]?.id ?? 'monschau-rursee';
  const map = await MapData.load(`${mapsBase}/${mapId}`);
  const grid = new HexGrid(map.info.hex.size, map.info.hex.cols, map.info.hex.rows);
  const base = map.info.heightMin - 5;

  const stage = new Stage(app);
  const hud = new Hud(app, map, maps);
  let ex = hud.settings.exaggeration;

  const terrain = new Terrain(map, base, new THREE.Vector2(grid.ox, grid.oz));
  const water = new Water(map, base);
  const rivers = new Rivers(map, base);
  terrain.group.add(water.mesh, rivers.mesh);
  const trees = new Trees(map, base, ex);
  const houses = new Houses(map, base, ex);
  stage.scene.add(terrain.group, trees.group, houses.group);

  const yAt = (x: number, z: number) => (map.surfaceAt(x, z) - base) * ex;
  const cam = new RtsCamera(stage.renderer.domElement, { groundY: yAt, bounds: { x: map.sizeX, z: map.sizeZ } });
  const start = map.info.places.find((p) => p.name === map.info.start) ?? { x: map.sizeX / 2, z: map.sizeZ / 2 };
  cam.lookAt(start.x, start.z + 600, true);
  cam.setDistance(3800);

  const apply = () => {
    ex = hud.settings.exaggeration;
    terrain.setExaggeration(ex);
    if (Math.abs(trees.group.userData.ex - ex) > 1e-6 || trees.group.userData.ex === undefined) {
      trees.setExaggeration(ex);
      houses.setExaggeration(ex);
      trees.group.userData.ex = ex;
    }
    terrain.uniforms.uGrid.value = hud.settings.grid ? 1 : 0;
    stage.setShadows(hud.settings.shadows);
    trees.setVisible(hud.settings.trees);
  };
  hud.onSettings = apply;
  hud.onMinimap = (x, z) => cam.lookAt(x, z);
  apply();

  // Picking: Strahl über dem Höhenfeld abtasten, dann verfeinern
  const ray = new THREE.Raycaster();
  const mouse = new THREE.Vector2(9, 9);
  stage.renderer.domElement.addEventListener('pointermove', (e) => {
    mouse.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  });
  stage.renderer.domElement.addEventListener('pointerleave', () => mouse.set(9, 9));
  const pick = (ndc: THREE.Vector2): THREE.Vector3 | null => {
    ray.setFromCamera(ndc, cam.camera);
    const o = ray.ray.origin, d = ray.ray.direction;
    const step = Math.max(8, cam.distance * 0.006);
    let prev = 0;
    for (let t = 0; t < cam.camera.far; t += step) {
      const x = o.x + d.x * t, z = o.z + d.z * t;
      if (o.y + d.y * t <= yAt(x, z)) {
        let a = prev, b = t;
        for (let k = 0; k < 12; k++) {
          const m = (a + b) / 2;
          if (o.y + d.y * m <= yAt(o.x + d.x * m, o.z + d.z * m)) b = m; else a = m;
        }
        const p = new THREE.Vector3().copy(o).addScaledVector(d, b);
        return map.inside(p.x, p.z) ? p : null;
      }
      prev = t;
    }
    return null;
  };

  // Bodenpunkte der Bildschirmecken für die Minimap (Schnitt mit Ebene in Zielhöhe)
  const corners = () => {
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -cam.target.y);
    return [[-1, 1], [1, 1], [1, -1], [-1, -1]].map(([x, y]) => {
      ray.setFromCamera(new THREE.Vector2(x, y), cam.camera);
      const p = new THREE.Vector3();
      if (!ray.ray.intersectPlane(plane, p)) {
        p.copy(ray.ray.origin).addScaledVector(ray.ray.direction, cam.distance * 4);
      }
      return p;
    });
  };

  const resize = () => {
    stage.resize(innerWidth, innerHeight);
    cam.resize(innerWidth, innerHeight);
  };
  addEventListener('resize', resize);
  resize();

  const clock = new THREE.Clock();
  let frames = 0, acc = 0, fps = 0, frameMs = 0;
  let infoTimer = 0;
  stage.renderer.info.autoReset = false;

  const frame = () => {
    const dt = Math.min(clock.getDelta(), 0.1);
    const t0 = performance.now();
    cam.update(dt);
    stage.follow(cam.target, cam.distance);
    terrain.update(cam.camera.position);
    trees.update(cam.camera.position);
    water.uniforms.uTime.value += dt;
    rivers.uniforms.uTime.value += dt;
    trees.uniforms.uTime.value += dt;

    // Hover-Kachel (gedrosselt)
    infoTimer -= dt;
    if (infoTimer <= 0) {
      infoTimer = 0.05;
      const p = mouse.x < 2 ? pick(mouse) : null;
      if (p) {
        const h = grid.fromWorld(p.x, p.z);
        const i = grid.index(h);
        terrain.uniforms.uHover.value.set(h.q, h.r);
        terrain.uniforms.uHoverOn.value = i >= 0 ? 1 : 0;
        if (i >= 0) {
          const t = map.info.hex.terrain[map.hexTerrain[i]];
          let near = '', best = Infinity;
          for (const pl of map.info.places) {
            if (pl.kind === 'gewaesser') continue;
            const d = Math.hypot(pl.x - p.x, pl.z - p.z);
            if (d < best) { best = d; near = pl.name; }
          }
          hud.setInfo(`<b>${TERRAIN_NAMES[t] ?? t}</b><span>Hex ${h.q}, ${h.r}</span>` +
            `<span>${Math.round(map.heightAt(p.x, p.z))} m ü. NN</span>` +
            `<span>${best < 700 ? 'in' : (best / 1000).toFixed(1) + ' km bei'} ${near}</span>`);
        }
      } else {
        terrain.uniforms.uHoverOn.value = 0;
        hud.setInfo(null);
      }
    }

    stage.renderer.info.reset();
    stage.renderer.render(stage.scene, cam.camera);
    hud.updateLabels(cam.camera, yAt, cam.distance);
    hud.updateMinimap(corners());

    frameMs = frameMs * 0.9 + (performance.now() - t0) * 0.1;
    frames++; acc += dt;
    if (acc >= 0.5) {
      fps = frames / acc; frames = 0; acc = 0;
      const r = stage.renderer.info.render;
      const ts = terrain.stats();
      hud.setPerf(`${fps.toFixed(0)} fps · CPU ${frameMs.toFixed(1)} ms\n` +
        `Draw-Calls ${r.calls} · Dreiecke ${(r.triangles / 1e6).toFixed(2)} M\n` +
        `Chunks ${ts.chunks} · LOD ${ts.lod.join('/')}\n` +
        `Bäume ${(trees.count / 1000).toFixed(0)}k · nah ${(trees.visibleNear / 1000).toFixed(1)}k · Häuser ${houses.count}`);
    }
    requestAnimationFrame(frame);
  };
  loading.remove();
  // Entwicklungswerkzeug: Maßstabs-Probe (Musterdorf) ein- und ausblenden
  let mock: THREE.Group | null = null;
  const mockup = (scale: number, place = 'Einruhr') => {
    if (mock) stage.scene.remove(mock);
    mock = null;
    if (!scale) return null;
    const r = buildMockup({ map, grid, base, ex: () => ex }, scale, place);
    mock = r.group;
    stage.scene.add(mock);
    return r.center;
  };
  (window as unknown as { eifeler: unknown }).eifeler = { map, cam, stage, terrain, trees, hud, mockup };
  frame();
}

main().catch((e) => {
  document.getElementById('loading')!.textContent = `Fehler beim Laden: ${e.message}`;
  console.error(e);
});
