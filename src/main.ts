import * as THREE from 'three';
import './style.css';
import { MapData } from './map/mapdata';
import { HexGrid } from './map/hex';
import { VORSCHLAEGE } from './map/presets';
import { Stage } from './render/scene';
import { Terrain } from './render/terrain';
import { Water } from './render/water';
import { Rivers } from './render/rivers';
import { Rails, Grenze } from './render/rails';
import { Trees } from './render/trees';
import { Houses } from './render/houses';
import { RtsCamera } from './render/camera';
import { setzeKulisse } from './render/kulisse';
import { Hud } from './ui/hud';
import { zeigeKartenwahl, type KartenwahlErgebnis } from './ui/kartenwahl';
import { frageName, Lobby, zeigeHinweis, type LobbyEinstellungen, type StartInfo } from './ui/lobby';
import { NAME_SPEICHER, speicher, Vermittlung, type RaumSicht } from './netz/vermittlung';
import { startePartie } from './netz/mehrspieler';
import { orteAus } from './netz/startplaetze';
import { ausschnittVon, leseSpielstand, type Spielstand } from './spiel/spielstand';
import { saatAusPruefsumme, waehleLagerHex } from './spiel/logik';
import { buildMockup } from './render/mockup';
import { gespeicherteQualitaet } from './render/qualitaet';
import { Bench, zeigeErgebnis, type BenchErgebnis } from './bench';
import { ladeWelt, type Welt } from './welt/laden';
import { ladeAusschnitt } from './welt/ausschnitt';
import { GROESSEN, type AusschnittParam, type Groesse } from './welt/format';
import { SimDemo } from './render/simdemo';
import { Spiel, type SpielKontext } from './spiel/spiel';
import { hexToWorld } from './welt/hexwelt';
import { setzeFarbenblind } from './render/waren';
import { ladeEinstellungen } from './ui/einstellungen';

const TERRAIN_NAMES: Record<string, string> = {
  wasser: 'Wasser', wiese: 'Wiese', wald: 'Wald', heide: 'Heide', moor: 'Moor (Venn)', stein: 'Fels', siedlung: 'Ortskern',
};
const LAENDER: Record<string, string> = { DE: 'Deutschland', BE: 'Belgien', LU: 'Luxemburg', NL: 'Niederlande' };

interface HashParam { version?: string; q?: number; r?: number; size?: Groesse; vorschlag?: string; bench?: boolean; simdemo?: boolean; raum?: string; freunde?: boolean }

/** Spielstand, der nach dem Neuladen geladen werden soll (Laden aus dem laufenden Spiel auf eine andere Karte). */
const LADEN_SPEICHER = 'eifeler.laden';

/** URL-Hash: #v=<version>&q=..&r=..&g=klein|mittel|gross oder #<vorschlag-id>. */
function leseHash(): HashParam {
  const h = location.hash.slice(1);
  if (!h) return {};
  if (!h.includes('=')) return { vorschlag: decodeURIComponent(h) };
  const sp = new URLSearchParams(h);
  const g = sp.get('g') as Groesse | null;
  const out: HashParam = { version: sp.get('v') ?? undefined, bench: sp.get('bench') === '1', simdemo: sp.get('simdemo') === '1', raum: sp.get('raum') ?? undefined, freunde: sp.get('freunde') === '1' };
  if (sp.has('q') && sp.has('r') && g && g in GROESSEN) { out.q = Number(sp.get('q')); out.r = Number(sp.get('r')); out.size = g; }
  return out;
}

function schreibeHash(p: AusschnittParam) {
  history.replaceState(null, '', `${location.pathname}${location.search}#v=${p.version}&q=${p.q}&r=${p.r}&g=${p.size}`);
}

function ladeanzeige(loading: HTMLElement) {
  loading.innerHTML = '<div class="ltext">Die Eifel wird geladen …</div><div class="bar"><i></i></div>';
  const t = loading.querySelector('.ltext') as HTMLElement, bar = loading.querySelector('i') as HTMLElement;
  return (text: string, anteil: number) => { t.textContent = `${text} …`; bar.style.width = `${Math.round(anteil * 100)}%`; };
}

async function main() {
  const app = document.getElementById('app')!;
  const loading = document.getElementById('loading')!;
  const fortschritt = ladeanzeige(loading);

  // 1. Weltdaten (Manifest, Ortsverzeichnis)
  const hp = leseHash();
  const preset = hp.vorschlag ? VORSCHLAEGE.find((v) => v.id === hp.vorschlag) : undefined;
  let welt: Welt;
  try {
    welt = await ladeWelt(hp.version);
  } catch (e) {
    throw new Error(`Weltdaten nicht erreichbar (${(e as Error).message}). Läuft der Server mit welt-daten/?`);
  }

  // 2. Ausschnitt-Parameter: aus der URL, aus einem Vorschlag, per Kartenwahl, aus einem Spielstand oder (Mehrspieler-Gast) vom Gastgeber
  let param: AusschnittParam;
  let wahl: KartenwahlErgebnis | null = null;
  let gast: Vermittlung | null = null;
  let spielstand: Spielstand | null = null;
  try {
    const t = sessionStorage.getItem(LADEN_SPEICHER);
    if (t) { sessionStorage.removeItem(LADEN_SPEICHER); spielstand = leseSpielstand(t); }
  } catch { spielstand = null; }
  if (hp.raum) {
    loading.style.display = 'none';
    const r = await raumBeitreten(hp.raum);
    gast = r.v;
    param = r.param;
    loading.style.display = '';
  } else if (spielstand) param = ausschnittVon(spielstand);
  else if (hp.q !== undefined && hp.size) param = { version: welt.version, q: hp.q, r: hp.r!, size: hp.size };
  else if (preset) param = { version: welt.version, q: preset.q, r: preset.r, size: preset.size };
  else {
    loading.style.display = 'none';
    wahl = await zeigeKartenwahl(document.body, welt);
    loading.style.display = '';
    if (wahl.art === 'laden') { spielstand = wahl.spielstand; param = ausschnittVon(spielstand); } else param = wahl.param;
  }
  if (param.version !== welt.version) welt = await ladeWelt(param.version);
  // Mehrspieler: als Gast, als Gastgeber („Mit Freunden spielen“) oder mit einem Spielstand mehrerer Spieler
  const mehrspieler = !!gast || wahl?.art === 'freunde' || !!hp.freunde || (!!spielstand && spielstand.spieler.length > 1);
  const t0 = performance.now();
  const ausschnitt = await ladeAusschnitt(welt, param, fortschritt);
  if (spielstand && spielstand.karte.pruefsumme !== ausschnitt.pruefsumme) {
    throw new Error('Der Spielstand passt nicht zu diesen Kartendaten (Prüfsumme weicht ab) – ist die Datenversion noch vorhanden?');
  }
  if (!mehrspieler) schreibeHash(ausschnitt.param);
  const ladezeit = performance.now() - t0;
  fortschritt('Gelände wird aufgebaut', 1);
  await new Promise((r) => setTimeout(r, 30));

  // 3. Karte und Szene
  const treffer = VORSCHLAEGE.find((v) => v.q === ausschnitt.param.q && v.r === ausschnitt.param.r && v.size === ausschnitt.param.size)
    ?? (preset && preset.size === ausschnitt.param.size ? preset : undefined);
  const mitte = hexToWorld(ausschnitt.param.q, ausschnitt.param.r);
  const cx = mitte.x - ausschnitt.originX, cz = mitte.z - ausschnitt.originZ;
  let name = treffer?.name ?? '';
  if (!name) {
    const nah = ausschnitt.orte.filter((o) => o.kind !== 'gewaesser' && o.kind !== 'weiler')
      .sort((a, b) => Math.hypot(a.x - cx, a.z - cz) - Math.hypot(b.x - cx, b.z - cz))[0];
    name = nah ? `Ausschnitt bei ${nah.name}` : 'Eigener Ausschnitt';
  }
  const map = MapData.fromAusschnitt(ausschnitt, name, treffer?.id ?? 'ausschnitt', welt.manifest.credits);
  const grid = new HexGrid(ausschnitt.originX, ausschnitt.originZ, ausschnitt.hex);
  const base = map.info.heightMin - 5;
  setzeKulisse(ausschnitt.originX, ausschnitt.originZ, ausschnitt.param.q, ausschnitt.param.r, ausschnitt.radius);

  const stage = new Stage(app, gespeicherteQualitaet());
  const hud = new Hud(app, map, {
    name, param: ausschnitt.param, pruefsumme: ausschnitt.pruefsumme, geklemmt: ausschnitt.geklemmt,
    onAndere: () => { history.replaceState(null, '', location.pathname + location.search); location.reload(); },
  });
  let ex = hud.settings.exaggeration;

  const terrain = new Terrain(map, base, new THREE.Vector2(grid.ox, grid.oz));
  const water = new Water(map, base);
  const rivers = new Rivers(map, base);
  const rails = new Rails(map, base);
  const grenze = new Grenze(map, base);
  terrain.group.add(water.mesh, rivers.mesh, rails.mesh, grenze.mesh);
  // Häuser zuerst: sie planieren das Gelände (map.ground) und sperren Zellen für den Wald
  const houses = new Houses(map, base, ex);
  const trees = new Trees(map, base, ex, houses.maske);
  stage.scene.add(terrain.group, trees.group, houses.group);

  // Entwicklungs-Demo ohne Simulation (#…&simdemo=1): Wege, Fahnen, Träger, Waren, Gebäude mit Fake-Sicht
  const haken = { terrain, houses, trees };
  const simdemo = hp.simdemo ? new SimDemo({ map, grid, base, ex, haken }) : null;
  if (simdemo) stage.scene.add(simdemo.group);

  const yAt = (x: number, z: number) => (map.surfaceAt(x, z) - base) * ex;

  // Kamera bleibt auf Spielfeld + etwas Rand (fraktionaler Hex-Abstand zur Mitte)
  const R = map.info.hex.size, rad = ausschnitt.radius;
  const rand = rad + 5;
  const clamp = (x: number, z: number): [number, number] => {
    const dx = x - cx, dz = z - cz;
    const fq = ((Math.sqrt(3) / 3) * dx - dz / 3) / R, fr = ((2 / 3) * dz) / R;
    const d = (Math.abs(fq) + Math.abs(fr) + Math.abs(fq + fr)) / 2;
    if (d <= rand) return [x, z];
    const k = rand / d;
    return [cx + dx * k, cz + dz * k];
  };
  const cam = new RtsCamera(stage.renderer.domElement, { groundY: yAt, bounds: { x: map.sizeX, z: map.sizeZ }, clamp });
  const breite = rad * 2 * 104;
  cam.maxDistance = Math.max(16000, breite * 1.4);

  // Das Spiel: Simulation, Darstellung von Wegen/Fahnen/Trägern/Gebäuden und Bauleiste (nicht in der Demo ohne Simulation)
  const spielKontext = (extra: Partial<SpielKontext>): SpielKontext => ({
    map, grid, ausschnitt, base, ex, haken, scene: stage.scene, camera: cam.camera, abstand: () => cam.distance,
    canvas: stage.renderer.domElement, root: document.body,
    pick: (x, y) => {
      const p = pickGelaende(new THREE.Vector2((x / innerWidth) * 2 - 1, -(y / innerHeight) * 2 + 1));
      return p ? { x: p.x, z: p.z } : null;
    },
    yAt,
    // Spielstand aus dem laufenden Spiel laden: Seite mit dessen Karte neu laden und dort fortsetzen
    springe: (x, z) => { intro = null; api.ready = true; cam.lookAt(...clamp(x, z + 350)); },
    grafik: { felder: () => hud.grafikFelder(), setze: (k, v) => hud.setze(k, v) },
    kameraTempo: (f) => { cam.tempo = f; },
    onLaden: (st) => {
      try { sessionStorage.setItem(LADEN_SPEICHER, JSON.stringify(st)); } catch { alert('Der Spielstand ist zu groß für diesen Browser.'); return; }
      history.replaceState(null, '', location.pathname + location.search);
      location.reload();
    },
    ...extra,
  });
  // Farbenblind-Modus (Einstellungen): vor dem Bau der Warenmodelle
  setzeFarbenblind(ladeEinstellungen().farbenblind);
  let spiel = simdemo || mehrspieler ? null : new Spiel(spielKontext({ laden: spielstand?.stand }));
  if (spiel) hud.versteckeEinstellungen();
  const lagerW = spiel ? grid.toWorld(spiel.lagerHex) : null;
  const start = lagerW ?? map.info.places.find((p) => p.name === map.info.start) ?? { x: cx, z: cz };

  let qualitaet = gespeicherteQualitaet();
  const apply = () => {
    ex = hud.settings.exaggeration;
    terrain.setExaggeration(ex);
    if (Math.abs(trees.group.userData.ex - ex) > 1e-6 || trees.group.userData.ex === undefined) {
      trees.setExaggeration(ex);
      houses.setExaggeration(ex);
      simdemo?.setExaggeration(ex);
      spiel?.setExaggeration(ex);
      trees.group.userData.ex = ex;
    }
    terrain.uniforms.uGrid.value = hud.settings.grid ? 1 : 0;
    stage.setShadows(hud.settings.shadows);
    trees.setVisible(hud.settings.trees);
    if (qualitaet !== hud.settings.quality) {
      qualitaet = hud.settings.quality;
      stage.setQuality(qualitaet);
      terrain.setQuality(qualitaet);
      trees.setQuality(qualitaet);
    }
  };
  simdemo?.setKamera(cam.camera);
  hud.onSettings = apply;
  stage.setQuality(hud.settings.quality);
  terrain.setQuality(hud.settings.quality);
  trees.setQuality(hud.settings.quality);
  qualitaet = hud.settings.quality;
  hud.onMinimap = (x, z) => { intro = null; cam.lookAt(...clamp(x, z)); };
  apply();

  // Picking: Strahl über dem Höhenfeld abtasten, dann verfeinern
  const ray = new THREE.Raycaster();
  const mouse = new THREE.Vector2(9, 9);
  stage.renderer.domElement.addEventListener('pointermove', (e) => {
    mouse.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  });
  stage.renderer.domElement.addEventListener('pointerleave', () => mouse.set(9, 9));
  const pickGelaende = (ndc: THREE.Vector2): THREE.Vector3 | null => {
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

  // Kamerafahrt: von hoch über dem Spielfeld hinunter zum Startort
  const nahDist = 2600;
  const hochDist = Math.min(cam.maxDistance, breite * 1.25);
  let intro: { t: number } | null = { t: 0 };
  const INTRO_S = 6;
  const api: Record<string, unknown> = {};
  cam.onInput(() => { if (intro) { intro = null; api.ready = true; } });
  const introPose = (t: number) => {
    const e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    const dist = Math.exp(Math.log(hochDist) * (1 - e) + Math.log(nahDist) * e);
    const gx = cx + (start.x - cx) * e, gz = cz + (start.z + 350 - cz) * e;
    cam.jumpTo(gx, gz, dist, 0.5 * (1 - e));
  };
  introPose(0);
  cam.update(0.016);
  terrain.update(cam.camera.position, 1e9);

  // Leistungsmessung (#…&bench=1): fester Kameraflug, Ergebnis in window.eifeler.bench
  const bench = new Bench({
    cam, stage, map, mitte: { x: cx, z: cz }, start: { x: start.x, z: start.z }, hochDist,
    qualitaet: () => hud.settings.quality,
    daten: `${ausschnitt.param.version} · Hex ${ausschnitt.param.q}, ${ausschnitt.param.r} · ${ausschnitt.param.size} · Prüfsumme ${ausschnitt.pruefsumme.slice(0, 8)}`,
    settle: () => { cam.update(0.016); terrain.update(cam.camera.position, 1e9); trees.update(cam.camera.position); },
    onFertig: (e: BenchErgebnis) => { api.bench = e; zeigeErgebnis(document.body, e); },
  });
  const startBench = () => {
    intro = null; api.ready = true;
    api.bench = { fertig: false };
    bench.start(performance.now());
  };

  const clock = new THREE.Clock();
  let frames = 0, acc = 0, fps = 0, frameMs = 0;
  let infoTimer = 0;
  stage.renderer.info.autoReset = false;

  const frame = () => {
    const rohDt = clock.getDelta();                 // echte Frame-Zeit (fps-Anzeige), für die Bewegung auf 0,1 s begrenzt
    const dt = Math.min(rohDt, 0.1);
    const t0f = performance.now();
    bench.vorFrame(t0f);
    if (bench.aktiv) intro = null;
    if (intro) {
      intro.t += dt / INTRO_S;
      if (intro.t >= 1) { intro = null; api.ready = true; } else introPose(intro.t);
    }
    cam.update(dt);
    stage.follow(cam.target, cam.distance);
    terrain.update(cam.camera.position);
    trees.update(cam.camera.position);
    simdemo?.update(dt);
    spiel?.update(dt);
    water.uniforms.uTime.value += dt;
    rivers.uniforms.uTime.value += dt;
    trees.uniforms.uTime.value += dt;

    // Hover-Hex (gedrosselt), Raster und Hover nur im Spielfeld
    infoTimer -= dt;
    if (infoTimer <= 0) {
      infoTimer = 0.05;
      // Hex unter der Maus bzw. (im Spiel) der Hex, den das Spiel im Fokus hat (Maus-Hover oder letzter Tipp)
      let h: { q: number; r: number } | null = null;
      if (spiel) h = spiel.fokus;
      else { const p = mouse.x < 2 ? pickGelaende(mouse) : null; if (p) h = grid.fromWorld(p.x, p.z); }
      if (h) {
        const info = map.hexInfo(h.q, h.r);
        terrain.uniforms.uHover.value.set(h.q, h.r);
        terrain.uniforms.uHoverOn.value = info.imSpielfeld ? 1 : 0;
        if (info.imSpielfeld) {
          const zeilen = [`<b>${TERRAIN_NAMES[info.terrain!] ?? info.terrain}</b>`,
            `<span>Hex ${h.q}, ${h.r}${info.land ? ' · ' + (LAENDER[info.land] ?? info.land) : ''}</span>`,
            `<span>${Math.round(info.hoehe!)} m ü. NN · Bauplatz ${info.bauplatz}</span>`];
          if (info.ort) zeilen.push(`<span>Ortskern ${info.ort}</span>`);
          if (info.bahn) zeilen.push('<span>Bahnstrecke</span>');
          if (spiel) zeilen.unshift(...spiel.infoZeilen(h));
          hud.setInfo(zeilen.join(''));
        } else {
          const w = grid.toWorld(h);
          hud.setInfo(`<b>Kulisse</b><span>Hex ${h.q}, ${h.r}</span><span>${Math.round(map.heightAt(w.x, w.z))} m ü. NN · nicht bespielbar</span>`);
        }
      } else {
        terrain.uniforms.uHoverOn.value = 0;
        hud.setInfo(null);
      }
    }

    stage.renderer.info.reset();
    stage.renderer.render(stage.scene, cam.camera);
    if (bench.aktiv) bench.nachFrame(stage.renderer.info.render.calls, stage.renderer.info.render.triangles);
    hud.updateLabels(cam.camera, yAt, cam.distance);
    hud.updateMinimap(corners());

    frameMs = frameMs * 0.9 + (performance.now() - t0f) * 0.1;
    frames++; acc += rohDt;
    if (acc >= 0.5) {
      fps = frames / acc; frames = 0; acc = 0;
      const r = stage.renderer.info.render;
      const ts = terrain.stats();
      hud.setPerf(`${fps.toFixed(0)} fps · CPU ${frameMs.toFixed(1)} ms\n` +
        `Draw-Calls ${r.calls} · Dreiecke ${(r.triangles / 1e6).toFixed(2)} M\n` +
        `Gelände-Knoten ${ts.chunks} · Stufen ${ts.lod.join('/')}\n` +
        `Bäume ${(trees.count / 1000).toFixed(0)}k · nah ${(trees.visibleNear / 1000).toFixed(1)}k · Häuser ${houses.count}\n` +
        `Gitter ${map.info.width}×${map.info.height} · Ladezeit ${(ladezeit / 1000).toFixed(1)} s` +
        (spiel ? `\nFenster ${spiel.fenster.anzahl} · Aktualisierung ${spiel.fenster.messung.ms.toFixed(2)} ms (max ${spiel.fenster.messung.max.toFixed(1)})` : ''));
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
  Object.assign(api, {
    map, cam, stage, terrain, simdemo, spiel, trees, hud, mockup, ausschnitt, grid, rails, rivers, ladezeit,
    skipIntro: () => { intro = null; api.ready = true; },
    startBench, bench: null,
    /** alle fehlenden Gelände-Netze sofort bauen (Screenshots) */
    settle: () => { cam.update(0.016); terrain.update(cam.camera.position, 1e9); },
  });
  (window as unknown as { eifeler: unknown }).eifeler = api;
  frame();
  if (hp.bench) setTimeout(startBench, 1500);

  // 3. Mehrspieler: Raum eröffnen (Gastgeber), Lobby, Start, Partie im Gleichschritt
  if (mehrspieler && !simdemo) {
    try {
      const v = gast ?? await raumEroeffnen();
      api.vermittlung = v;
      const raum = v.raum!;
      const e0 = raum.einstellungen as LobbyEinstellungen | null;
      let start: StartInfo;
      if (raum.gestartet) start = { du: v.du, raum, einstellungen: e0!, startorte: [], spielstand: null };
      else {
        const lobby = new Lobby(document.body, {
          v, kartenName: name, param: ausschnitt.param, kartePruef: ausschnitt.pruefsumme, orte: orteAus(ausschnitt.kerne),
          mitte: { q: ausschnitt.param.q, r: ausschnitt.param.r }, erster: map.info.start, spielstand: gast ? null : spielstand,
          lagerFuer: (n) => (n ? waehleLagerHex(ausschnitt.hex, ausschnitt.kerne, n) : null),
        });
        api.lobby = lobby;
        start = await lobby.warteAufStart();
      }
      const neu = !raum.gestartet && start.du === start.raum.taktgeber ? {
        starts: start.startorte.map((n) => waehleLagerHex(ausschnitt.hex, ausschnitt.kerne, n)),
        saat: saatAusPruefsumme(ausschnitt.pruefsumme), tempo: start.einstellungen.tempo, spielstand: start.spielstand,
      } : undefined;
      const lauf = await startePartie({ v, du: start.du, raum: start.raum, karte: ausschnitt.hex, kartePruef: ausschnitt.pruefsumme, neu });
      spiel = new Spiel(spielKontext({ mehrspieler: { partie: lauf.partie, namen: lauf.namen, anwesend: (sp) => lauf.netz.istOffen(sp) } }));
      hud.versteckeEinstellungen();
      Object.assign(api, { spiel, partie: lauf.partie, netz: lauf.netz });
      intro = null; api.ready = true;
      const w = grid.toWorld(spiel.lagerHex);
      cam.lookAt(...clamp(w.x, w.z + 350));
    } catch (e) {
      zeigeHinweis(document.body, 'Mehrspieler geht gerade nicht', (e as Error).message, 'Allein spielen', () => {
        history.replaceState(null, '', location.pathname + location.search);
        location.reload();
      });
    }
  }

  /** Gastgeber: Name fragen, Raum anlegen, Einladungslink in die Adresse (Neuladen bringt einen zurück). */
  async function raumEroeffnen(): Promise<Vermittlung> {
    const n = await frageName(document.body, 'Raum eröffnen', 'Raum eröffnen', 'Du lädst deine Freunde per Link ein. Kein Konto nötig, nur ein Name.');
    const v = new Vermittlung();
    await v.anlegen(n);
    history.replaceState(null, '', `${location.pathname}${location.search}#raum=${v.raumCode}${schlechtTeil()}`);
    return v;
  }
}

/** Testaufbau: „&netz=schlecht“ in der Adresse behalten. */
function schlechtTeil(): string {
  return new URLSearchParams(location.hash.slice(1)).get('netz') === 'schlecht' ? '&netz=schlecht' : '';
}

/**
 * Mehrspieler-Gast (Einladungslink #raum=CODE): Name fragen (beim Wiederkommen mit gemerktem Platz nicht), beitreten und warten,
 * bis der Gastgeber die Karte gewählt hat.
 */
async function raumBeitreten(code: string): Promise<{ v: Vermittlung; param: AusschnittParam }> {
  const gemerkt = speicher(`eifeler.raum.${code.toUpperCase()}`) && speicher(NAME_SPEICHER);
  const n = gemerkt || await frageName(document.body, 'Mit Freunden spielen', 'Beitreten', `Du bist eingeladen (Raum ${code.toUpperCase()}).`);
  const v = new Vermittlung();
  let raum: RaumSicht;
  try { raum = await v.beitreten(code, n); } catch (e) {
    await new Promise<void>(() => zeigeHinweis(document.body, 'Beitreten ging nicht', (e as Error).message, 'Allein spielen', () => {
      history.replaceState(null, '', location.pathname + location.search);
      location.reload();
    }));
    throw e;
  }
  const e = await new Promise<LobbyEinstellungen>((ok) => {
    const da = raum.einstellungen as LobbyEinstellungen | null;
    if (da?.param) { ok(da); return; }
    v.onRaum = (r) => { const x = r.einstellungen as LobbyEinstellungen | null; if (x?.param) ok(x); };
  });
  return { v, param: { version: e.param.version, q: e.param.q, r: e.param.r, size: e.param.size as Groesse } };
}

main().catch((e) => {
  const l = document.getElementById('loading');
  if (l) l.textContent = `Fehler beim Laden: ${e.message}`;
  console.error(e);
});
