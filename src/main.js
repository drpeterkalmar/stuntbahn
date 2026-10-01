// Stuntbahn – Einstieg: Renderer, Laden, Spielschleife (feste 120-Hz-Physik, Rendering entkoppelt),
// Debug-API window.__game für Headless-Tests.
import * as THREE from 'three';
import { BUILD } from './build.js';
import { makeMaterials, shadowUniforms } from './gfx/materials.js';
import { makeSky, makeEnvironment, loadSkyInfo, sunDirFromUV, bakeStaticShadow } from './gfx/env.js';
import { buildWorld, STATIC_LAYER } from './gfx/world.js';
import { makeCar, loadCarModel, parkedCarGeometry } from './gfx/carmesh.js';
import { CameraRig, CAM_MODES, CAM_NAMES, cockpitDash, clearLens } from './gfx/camera.js';
import { Cockpit } from './gfx/cockpit.js';
import { displayGear } from './gfx/gauges.js';
import { Input } from './game/input.js';
import { Race, ASSISTS } from './game/race.js';
import { UI } from './ui/ui.js';
import { generate, demoLayout, galleryLayout, galleryGelLayout } from './track/generator.js';
import { verify, prepare, probeLap } from './track/verify.js';
import { parseTrk } from './track/trk.js';
import { trkToLayout } from './track/trkimport.js';
import { KIND_NAMES } from './track/trkelems.js';
import { TrkLib, unzipTracks } from './game/trklib.js';
import { SHOWCASE, showcaseBytes } from './track/showcase.js';
import { Sammlung } from './game/sammlung.js';
import { Store, modeKey } from './game/store.js';
import { Ghost } from './game/ghost.js';
import { Replay } from './game/replay.js';
import { Quality } from './gfx/quality.js';
import { LineViz, LINE_LEVELS } from './gfx/lineviz.js';
import { Sound } from './audio/sound.js';
import { CarFX } from './gfx/fx.js';
import { Post } from './gfx/post.js';
import { loadDecoAssets, decoUniforms } from './gfx/deco.js';
import { daySeed } from './core/util.js';
import { WORLD_TAG, WORLD_SCALE } from './track/defs.js';
// Geprüfte Strecken (Autopilot, Entschärfungen) je Weltmaßstab getrennt: ?welt=1 prüft neu statt die Teile der
// anderen Welt zu übernehmen
const VBUILD = BUILD + WORLD_TAG;

const DT = 1 / 120;
const params = new URLSearchParams(location.search);
const app = window.__app = { frames: 0, build: BUILD, ready: false, errors: window.__errors || [] };

// ---------- Renderer ----------
const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', stencil: false });
renderer.outputColorSpace = THREE.SRGBColorSpace;
const TM = { aces: THREE.ACESFilmicToneMapping, neutral: THREE.NeutralToneMapping, agx: THREE.AgXToneMapping };
renderer.toneMapping = TM[params.get('tm') || 'neutral'];
renderer.toneMappingExposure = +(params.get('exp') || 1.05);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.info.autoReset = false;   // zwei Durchgänge (Welt + Cockpit) → Zähler je Bild selbst zurücksetzen
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, 1, 0.25, 4000 * WORLD_SCALE);   // Fernring/Bergkranz wachsen mit
camera.layers.enable(STATIC_LAYER);
const quality = new Quality(renderer, params.get('q'));
const post = new Post(renderer);   // Bewegungsunschärfe (nur wenn sie wirkt, sonst direktes Zeichnen)
quality.post = post;
let sun, skyInfo, envMap, M, carVis, ghostVis, sky, cockpit;

let sizeW = 0, sizeH = 0, portrait = null;
function resize() {
  const w = innerWidth, h = innerHeight;
  sizeW = w; sizeH = h;
  renderer.setPixelRatio(quality.pixelRatio());
  if (sun) quality.apply(sun, renderer);
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  const p = h > w;
  if (portrait !== null && p !== portrait) rotated(p);
  portrait = p;
  document.body.dataset.orient = p ? 'hoch' : 'quer';
}
addEventListener('resize', resize);
// Drehen: manche Browser melden die neuen Maße erst nach dem Ereignis → kurz danach noch einmal messen
const reResize = () => { resize(); setTimeout(resize, 120); setTimeout(resize, 400); };
addEventListener('orientationchange', reResize);
if (screen.orientation && screen.orientation.addEventListener) screen.orientation.addEventListener('change', reResize);
resize();

const input = new Input();
const store = new Store();
const ui = new UI(app, store);
const rig = new CameraRig(camera);
const sound = new Sound(store);
const trkLib = new TrkLib();
const sammlung = new Sammlung();      // 250 eigene Strecken, lädt erst beim Aufklappen in der Bibliothek
let parked = [];         // geparkte Autos (Szenerie „Geisterauto“ importierter Strecken)
window.__soundRef = sound;

let env = null;          // aktuelle Strecke { track, world, ideal, prof, layout, meta }
let worldGroup = null;
let race = null, ghost = null, replay = null, lineViz = null, fx = null;
let mode = 'menu';       // menu | race | replay
// Spieltempo: 1.25 = 25 % schneller als Echtzeit (Peter 27.09.); ?speed=1 für Originaltempo
const GAME_SPEED = +(params.get('speed') || 1.25);
const FOG = [260 * WORLD_SCALE, 1500 * WORLD_SCALE];
let acc = 0, last = performance.now(), frozen = false, timeScale = GAME_SPEED;
let prevPose = null;
let blurCut = true;      // nächstes Bild ohne Bewegungsunschärfe (Kameraschnitt)

async function boot() {
  ui.loading(0.05, 'Himmel und Licht …');
  skyInfo = await loadSkyInfo();
  const sunDir = sunDirFromUV(skyInfo.u, skyInfo.v);
  const [envTex] = await Promise.all([makeEnvironment(renderer), loadCarModel().then(() => ui.loading(0.45, 'Auto …')),
    loadDecoAssets().catch((e) => console.warn('Deko nicht geladen', e))]);
  envMap = envTex;
  scene.environment = envMap;
  scene.environmentIntensity = +(params.get('env') || 1.8);
  sky = makeSky(skyInfo);
  scene.add(sky);
  const hz = new THREE.Color().setRGB(...skyInfo.horizon, THREE.SRGBColorSpace);
  // Nebel mit dem Weltmaßstab (bis 27.09.2026: 260–1500 m): die ganze Strecke klar, der Bergkranz im Dunst
  scene.fog = new THREE.Fog(hz, FOG[0], FOG[1]);
  sun = new THREE.DirectionalLight(0xfff1dc, +(params.get('sun') || 3.0));
  sun.position.copy(sunDir).multiplyScalar(60);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  const sc = sun.shadow.camera;
  sc.left = -7; sc.right = 7; sc.top = 7; sc.bottom = -7; sc.near = 1; sc.far = 140;
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.02;
  sun.userData.dir = sunDir.clone();
  scene.add(sun, sun.target);
  quality.apply(sun, renderer);
  M = makeMaterials(renderer);
  ui.loading(0.6, 'Auto lackieren …');
  carVis = await makeCar({ color: store.settings.paint });
  scene.add(carVis.root);
  rig.carBox = carLocalBox(carVis);   // Stoßstangen-Kamera: vor die Nase
  post.setCarBox(rig.carBox);
  ghostVis = await makeCar({ color: 0xffffff });
  ghostVis.root.traverse((o) => {
    if (o.isMesh && !o.userData.fx) {   // Nitro-Flammen des Geists bleiben Flammen
      o.castShadow = false; o.receiveShadow = false;
      o.material = new THREE.MeshBasicMaterial({ color: 0x9fe0ff, transparent: true, opacity: 0.28, depthWrite: false });
    }
  });
  ghostVis.root.visible = false;
  scene.add(ghostVis.root);
  cockpit = new Cockpit(envMap, carVis.mats.paint);
  lineViz = new LineViz(scene);
  fx = new CarFX(scene);
  ui.loading(0.8, 'Strecke bauen …');
  const q = params.get('seed');
  if (params.has('demo')) await loadTrack(demoLayout(), { name: 'Teststrecke' });
  else if (params.has('gallery')) await loadTrack(params.get('gallery') === 'gel' ? galleryGelLayout() : galleryLayout());   // ?gallery=gel: Gelände-Galerie (n22)
  else if (params.has('trk')) await loadImported(params.get('trk')).catch((e) => { console.warn(e); return loadGenerated(daySeed(), 2); });
  // ?seed=…&d=… wie bisher flach (alte Codes, Tests); &3d=1 = Hochstraße (n19), &g=1 = Gelände (n22). Ohne Seed: Strecke
  // des Tages in der gewählten Streckenart (ab n22 Standard „Gelände“; Schalter im Menü)
  else await loadGenerated(q ? +q : daySeed(), +(params.get('d') || 2), q ? (params.get('g') === '1' ? 'gel' : params.get('3d') === '1' ? '3d' : 'flat') : store.settings.trackMode);
  ui.loading(1, 'Fertig');
  app.ready = true;
  ui.bind({ startRace, newTrack, setAssist, toMenu, retry, startReplay, cycleCam, rewind: () => race && race.requestRewind(), pause: togglePause,
    hop: () => { if (mode === 'race' && race && !frozen) race.requestHop(); }, nitro: () => { if (mode === 'race' && race && !frozen) race.requestNitro(); }, setLine, toggleLine, setPaint, sound, input, quality, importFiles, playImported, deleteImported, trkLib, showcase: SHOWCASE, showcaseBytes, store, sammlung });
  initDrop();
  ui.showMenu(env);
  mode = params.has('race') ? 'race' : 'menu';
  if (mode === 'race') startRace();
  requestAnimationFrame(frame);
}

// Generierte Strecke: aus Cache (bereits geprüft) oder Autopilot-Prüfung mit Fortschrittsanzeige.
// 3D (n19): scheitert der Autopilot auch nach dem Entschärfen, nimmt der Generator die nächste Variante desselben
// Codes (deterministisch – alle bekommen dieselbe Strecke), höchstens 4.
// Streckenart: 'flat' | '3d' (Hochstraße, n19) | 'gel' (Gelände, n22); true/false wie bis n21 (3D/flach)
const modeOf = (m) => (m === true ? '3d' : m === false ? 'flat' : m === '3d' || m === 'gel' || m === 'flat' ? m : store.settings.trackMode || 'gel');
async function loadGenerated(seed, diff, mode = 'flat') {
  mode = modeOf(mode);
  const gopt = (variant) => (mode === '3d' ? { d3: true, variant } : mode === 'gel' ? { gel: true, variant } : {});
  let lay = generate(seed, diff, gopt(0));
  const key = lay.meta.key;
  const cached = store.getVerified(key + WORLD_TAG, VBUILD);
  if (cached) {
    if (cached.variant) lay = generate(seed, diff, gopt(cached.variant));
    lay.pieces = cached.pieces;
    return loadTrack(lay, { apTime: cached.ap, fixes: cached.fixes });
  }
  for (let variant = 0; ; variant++) {
    if (variant) lay = generate(seed, diff, gopt(variant));
    ui.loading(0.82, 'Autopilot prüft die Strecke …');
    const res = await verify(lay, (p, f) => ui.loading(0.82 + 0.16 * p, `Autopilot prüft die Strecke … ${Math.round(p * 100)} %${f ? ' (entschärft: ' + f + ')' : ''}`));
    if (res.ok || mode === 'flat' || variant >= 3) {
      store.setVerified(key + WORLD_TAG, VBUILD, res.layout.pieces, res.apTime, res.fixes, variant);
      return loadTrack(res.layout, { apTime: res.apTime, fixes: res.fixes }, res.env);
    }
  }
}

// ---------- Importierte .TRK-Strecken ----------
function importedBytes(id) {
  if (id.startsWith('demo-')) return showcaseBytes(id);
  if (id.startsWith('sam-')) return sammlung.bytes(id);
  return trkLib.bytes(id);
}
async function loadImported(id) {
  const isSam = id.startsWith('sam-');
  if (isSam) await sammlung.load();
  const bytes = importedBytes(id);
  if (!bytes) throw new Error('Strecke nicht gefunden: ' + id);
  const sam = isSam ? sammlung.get(id) : null;
  const rec = sam || trkLib.get(id) || SHOWCASE.find((x) => x.id === id) || { name: id };
  const trk = parseTrk(bytes, rec.name + '.trk');
  trk.name = rec.name;
  const { layout, report } = trkToLayout(trk);
  layout.meta.key = id;
  layout.meta.name = rec.name;
  // Sammlung: der Build hat jede Strecke mit dem Autopiloten geprüft → Referenz aus dem Paket, keine Probefahrt
  const samV = sam ? { ap: sam.ap, ok: sam.ap != null, reason: (sam.apf || '').split('|')[0], kind: (sam.apf || '').split('|')[1] || '' } : null;
  let v = samV || trkLib.getVerified(id, VBUILD) || (id.startsWith('demo-') ? store.getVerified(id + WORLD_TAG, VBUILD) : null);
  let pre = null;
  if (!v) {
    ui.loading(0.84, 'Strecke bauen …');
    await new Promise((r) => setTimeout(r, 20));
    pre = prepare(layout);
    ui.loading(0.86, 'Autopilot fährt probe …');
    const r = await probeLap(pre, (p) => ui.loading(0.86 + 0.12 * p, `Autopilot fährt probe … ${Math.round(p * 100)} %`));
    v = { ap: r.time, ok: r.ok, reason: r.reason || '', kind: r.kind || '' };
    if (id.startsWith('demo-')) store.setVerified(id + WORLD_TAG, VBUILD, [], v.ap, 0); else trkLib.setVerified(id, VBUILD, v);
  }
  const apFail = v.ok === false ? `${v.reason} bei ${KIND_NAMES[v.kind] || v.kind || '?'}` : null;
  const day = sam && sammlung.today();
  return loadTrack(layout, { apTime: v.ap, apFail, report, imported: true, sam, samDay: !!(day && day.id === id) }, pre);
}
async function playImported(id) {
  ui.loading(0.5, 'Strecke laden …');
  await new Promise((r) => setTimeout(r, 30));
  try {
    await loadImported(id);
    ui.loading(1);
    ui.showMenu(env);
    mode = 'menu';
  } catch (e) {
    ui.loading(1);
    ui.showLibrary([{ name: id, err: e.message }]);
  }
}
async function importFiles(files) {
  const results = [];
  for (const f of files) {
    let u8;
    try { u8 = new Uint8Array(await f.arrayBuffer()); } catch { results.push({ name: f.name, err: 'Datei nicht lesbar.' }); continue; }
    const isZip = u8.length > 4 && u8[0] === 0x50 && u8[1] === 0x4b && u8[2] === 3 && u8[3] === 4;
    const entries = isZip ? await unzipTracks(u8) : [{ name: f.name, data: u8 }];
    if (isZip && !entries.length) results.push({ name: f.name, err: 'Keine .TRK-/.RPL-Dateien im ZIP gefunden.' });
    for (const e of entries) {
      try {
        const r = trkLib.add(e.data, e.name);
        // gleich prüfen, ob die Strecke fahrbar ist (Weg von Start/Ziel)
        trkToLayout(r.trk);
        results.push({ name: e.name, ok: true, dup: r.dup, id: r.rec.id });
      } catch (err) {
        results.push({ name: e.name, err: err.message });
      }
    }
  }
  ui.showLibrary(results);
  return results;
}
function deleteImported(id) {
  trkLib.remove(id);
  for (const k of Object.keys(store.best)) if (k.startsWith(id + '|')) delete store.best[k];
  delete store.times[id];
  // Geister aller Wertungen (Physik, Weltmaßstab) dieser Strecke
  try { for (const k of Object.keys(localStorage)) if (k.startsWith('stuntbahn.ghost.' + id + '|')) localStorage.removeItem(k); } catch { /* egal */ }
  store.save();
  ui.showLibrary();
}
// Drag & Drop am Desktop: Dateien irgendwo ins Fenster ziehen
function initDrop() {
  let depth = 0;
  const has = (e) => e.dataTransfer && [...(e.dataTransfer.types || [])].includes('Files');
  addEventListener('dragenter', (e) => { if (!has(e)) return; depth++; document.body.classList.add('dropping'); e.preventDefault(); });
  addEventListener('dragover', (e) => { if (has(e)) e.preventDefault(); });
  addEventListener('dragleave', () => { depth = Math.max(0, depth - 1); if (!depth) document.body.classList.remove('dropping'); });
  addEventListener('drop', (e) => {
    depth = 0; document.body.classList.remove('dropping');
    if (!has(e)) return;
    e.preventDefault();
    if (mode === 'race') return;
    importFiles([...e.dataTransfer.files]);
  });
}

// Geparkte Autos (Szenerie „Geisterauto“): vereinfachtes Modell, je Teil ein instanziertes Mesh
// (≈15 Draw-Calls gesamt, ~6,5 k Dreiecke je Auto), höchstens 8 Stück.
async function placeParkedCars(track) {
  for (const p of parked) scene.remove(p);
  parked = [];
  const cars = track.decals.filter((d) => d.type === 'car').slice(0, 8);
  if (!cars.length) return;
  let parts;
  try { parts = await parkedCarGeometry(); } catch { return; }
  const o = new THREE.Object3D();
  for (const { g, m } of parts) {
    const im = new THREE.InstancedMesh(g, m, cars.length);
    cars.forEach((d, k) => {
      o.position.set(d.p[0], d.p[1], d.p[2]);
      o.rotation.set(0, [-Math.PI / 2, Math.PI, Math.PI / 2, 0][d.d] ?? 0, 0);
      o.updateMatrix();
      im.setMatrixAt(k, o.matrix);
    });
    im.computeBoundingSphere();
    im.receiveShadow = true;
    im.name = 'parked';
    scene.add(im);
    parked.push(im);
  }
}

async function loadTrack(layout, meta = {}, pre = null) {
  if (worldGroup) { scene.remove(worldGroup); worldGroup.traverse((o) => { if (o.geometry) o.geometry.dispose(); }); }
  const t0 = performance.now();
  const P = pre || prepare(layout);
  const { track, world, ideal, prof } = P;
  env = { track, world, ideal, prof, layout, meta: { ...layout.meta, ...meta } };
  worldGroup = buildWorld(track, M, { world, tier: quality.tier, ideal, prof, deco: params.get('deko') !== '0' });
  scene.add(worldGroup);
  await placeParkedCars(track);
  bakeStaticShadow(renderer, scene, sun.userData.dir, track.bounds, quality.staticShadowSize());
  rig.setTrackCams(track);
  lineViz.build(ideal, prof, track);
  env.buildMs = performance.now() - t0;
  try { if (renderer.compileAsync) await renderer.compileAsync(scene, camera); } catch { /* optional */ }
  // Vorschau: Auto an den Start
  race = new Race(env, { assist: store.settings.assist, countdown: 1e9 });
  prevPose = null;
  return env;
}

function startRace(opts = {}) {
  replay = null;
  if (fx) fx.reset();
  const S = store.settings;
  race = new Race(env, { assist: S.assist, wreck: S.wreck, autopilot: !!opts.autopilot, extras: S.extras, autoExtras: S.autoExtras, brakeHelp: S.brakeHelp });
  // Sammlung: „zuletzt gefahren“ / „noch nie gefahren“
  if (env.meta.sam) { S.samPlayed = { ...(S.samPlayed || {}), [env.meta.key]: Date.now() }; store.save(); }
  // Leicht (n15): kein Geisterauto (keine Bestzeit-Wertung)
  ghost = new Ghost(S.assist === 'easy' ? null : store.loadGhost(env.meta.key, S.assist, race.wreckOn, race.extrasOn));
  ghostVis.root.visible = !!ghost.data && store.settings.ghost;
  rig.mode = CAM_MODES.includes(store.settings.cam) ? store.settings.cam : 'chase';
  rig.init = false;
  mode = 'race';
  ui.showHud(race, env);
  sound.start();
  prevPose = null;
}
function retry() { startRace(); }
async function newTrack(seed, diff, mode) {
  ui.loading(0.5, 'Strecke bauen …');
  await new Promise((r) => setTimeout(r, 30));
  await loadGenerated(seed, diff, modeOf(mode));
  ui.loading(1);
  ui.showMenu(env);
  mode = 'menu';
}
function setAssist(k) { store.settings.assist = k; store.save(); if (race) race.setAssist(k); if (k === 'easy' && ghostVis) ghostVis.root.visible = false; ui.refresh(); ui.assistChanged(); }
function setPaint(c) { store.settings.paint = c; store.save(); carVis.setPaint(c); }
function toMenu() { mode = 'menu'; replay = null; sound.stop(); race = new Race(env, { assist: store.settings.assist, countdown: 1e9 }); ui.showMenu(env); }
function startReplay() {
  if (!race || !race.rec.length) return;
  replay = new Replay(race.rec, env, { cuts: race.cuts, pens: race.pens, xev: race.xev });
  mode = 'replay';
  rig.mode = 'chase'; rig.init = false;
  ui.showReplay(replay);
}
// Ideallinie: Stufe setzen (Optionen/Pause) bzw. im Rennen zwischen Aus und der gewählten Stufe umschalten
function setLine(v) { const S = store.settings; S.line = v; if (v !== 'off') S.lineLast = v; store.save(); ui.lineChanged(); }
function toggleLine() {
  if (store.settings.assist === 'original') return;
  const S = store.settings;
  setLine(S.line === 'off' ? (S.lineLast || 'soft') : 'off');
  ui.toast('Ideallinie: ' + LINE_LEVELS[S.line].name);
  if (ui.screen === 'pause') ui.showPause(true);
}
// Kamera wechseln; die Wahl im Rennen bleibt gespeichert (Replay startet wie bisher im Verfolger)
function cycleCam() {
  const m = rig.cycle();
  blurCut = true;
  if (mode === 'replay') ui.replayCamMark(m);
  else { store.settings.cam = m; store.save(); }
  ui.toast(CAM_NAMES[m]);
}
// Quer ↔ hoch gedreht: Finger sind weg (Touch lösen, kein hängendes Gas/Lenken); im laufenden Rennen am
// Touch-Gerät kurz pausieren – Pause-Karte mit „▶ Weiter“ (Tastatur/Desktop: Rennen läuft einfach weiter)
function rotated(p) {
  ui.releaseTouch();
  input.releaseTouch();
  rig.init = false;
  if (mode === 'race' && !frozen && race && (race.state === 'running' || race.state === 'countdown') && ui.isTouchDevice()) {
    togglePause();
    ui.toast(p ? '📱 Hochformat' : '📱 Querformat');
  }
}
function togglePause() { if (mode !== 'race') return; frozen = !frozen; ui.showPause(frozen); if (frozen) sound.stop(); else sound.start(); }

// ---------- Schleife ----------
function frame(now) {
  requestAnimationFrame(frame);
  const rdt = Math.min(0.1, (now - last) / 1000);
  last = now;
  app.frames++;
  if (innerWidth !== sizeW || innerHeight !== sizeH) resize();   // Drehen ohne (rechtzeitiges) resize-Ereignis
  quality.sample(rdt, () => resize());
  const inp = input.update(rdt);
  if (input.consume('Escape') || input.consume('KeyP')) { if (mode === 'race') togglePause(); }
  if (input.consume('KeyC')) cycleCam();
  if (input.consume('KeyL') && mode === 'race') toggleLine();
  if (input.consume('KeyR') && mode === 'race' && race.assist.autoRewind !== undefined && store.settings.assist !== 'original') race.requestRewind();
  // Extras: Leertaste (Gamepad B) = Hüpfer, Shift/N (Gamepad RB) = Nitro
  if (input.consume('Space') && mode === 'race' && !frozen) race.requestHop();
  if ((input.consume('KeyN') | input.consume('ShiftLeft') | input.consume('ShiftRight')) && mode === 'race' && !frozen) race.requestNitro();
  if (!frozen && mode === 'race') {
    acc += rdt * timeScale;
    let steps = 0;
    while (acc >= DT && steps < 14) {
      prevPose = race.car.snapshot();
      race.step(DT, inp);
      if (ghost) ghost.advance(DT, race);
      if (fx) fx.step(DT, race.car, race.state);
      acc -= DT; steps++;
    }
    if (steps >= 14) acc = 0;
    handleEvents();
  } else if (mode === 'replay' && replay) {
    replay.advance(rdt * timeScale);
    if (replay.jumped) { replay.jumped = false; rig.init = false; blurCut = true; } // Schnitt: Kamera neu ansetzen statt schwenken
  }
  render(rdt);
}

function handleEvents() {
  for (const e of race.events) {
    ui.event(e, race);
    sound.event(e);
    // Auto versetzt (Reset/Überspringen/Rückspulen): Kamera neu ansetzen, keine Zwischenbild-Interpolation
    if (e.type === 'reset' || e.type === 'skip' || e.type === 'rewind') { rig.init = false; prevPose = null; blurCut = true; }
    if (e.type === 'finish') {
      const res = store.submit(env.meta.key, race.assistKey, race.wreckOn, race.finalTime, race.assistKey === 'easy' ? null : race.ghostRec(), { ...env.meta, penalties: race.penalties, extras: race.extrasOn, nitro: race.nitroLog });
      ui.showResult(race, res, env);
      sound.stop();
    }
  }
  race.events.length = 0;
}

// Cockpit-Layout: freie Zone zwischen den Touch-Tasten (Querformat) bzw. über den Tasten (Hochformat: Tasten
// in einer Reihe unten, Instrumente zwischen Hüpfer und Nitro) bzw. über der Replay-Leiste; Gestenleiste
// (safe-area unten) bleibt frei. Reicht die Lücke nicht, wählt das Cockpit selbst „compact“ oder „hud“ – das
// Armaturenbrett rückt dafür nicht mehr nach oben (n15: Fahrbahn bleibt sichtbar).
// DOM-Maße nur alle 15 Bilder lesen (erzwingt sonst jedes Bild eine Layout-Berechnung).
let cpZone = null, cpZoneF = -1e9;
function cockpitZone() {
  if (cpZone && app.frames - cpZoneF < 15 && cpZone.W === innerWidth && cpZone.H === innerHeight) return cpZone;
  cpZoneF = app.frames;
  const W = innerWidth, H = innerHeight;
  const half = Math.min(0.47 * W, 0.55 * H);
  let zl = W / 2 - half, zr = W / 2 + half, bottom = ui.safeBottom();
  // Touch-Tasten und (am Touch-Gerät) die Extras-Knöpfe über den Daumen halten die Instrumente frei
  const touch = document.body.dataset.touch && document.body.dataset.touch !== 'none';
  const rect = (sel) => [...document.querySelectorAll(sel)].map((p) => p.getBoundingClientRect()).filter((r) => r.width);
  const pads = rect('#touch.show.pads .pad'), xbs = touch ? rect('#hud.show .xb') : [];
  // Hochkant: Tasten unten in einer Reihe → Instrumente darüber, seitlich nur Hüpfer/Nitro als Grenze
  const stack = pads.length && H > W;
  if (stack) bottom = Math.max(bottom, H - Math.min(...pads.map((r) => r.top)) + 10);
  for (const r of stack ? xbs : [...pads, ...xbs]) { if (r.left < W / 2) zl = Math.max(zl, r.right + 12); else zr = Math.min(zr, r.left - 12); }
  const R = document.getElementById('replayui');
  if (R && R.classList.contains('show')) { const r = R.getBoundingClientRect(); if (r.top > H / 2) bottom = Math.max(bottom, H - r.top); }
  cpZone = { W, H, zl, zr, bottom, dash: cockpitDash(W / H) };
  return cpZone;
}
function cockpitValues() {
  if (mode === 'replay' && replay) return { kmh: Math.abs(replay.speed()) * 3.6, rpm: replay.rpm(), gear: replay.gear(), steer: replay.phys().wheels[0].steer };
  const c = race.car;
  return { kmh: Math.abs(c.fwdSpeed()) * 3.6, rpm: c.rpm, gear: displayGear(c.fwdSpeed(), c.gear), steer: c.steerAng };
}

// Auto-Box in Auto-Koordinaten (Karosserie + Räder, ohne Flammen) für die Schärfe-Maske der Bewegungsunschärfe
function carLocalBox(cv) {
  const root = cv.root, p = root.position.clone(), q = root.quaternion.clone();
  root.position.set(0, 0, 0); root.quaternion.identity(); root.updateMatrixWorld(true);
  const box = new THREE.Box3();
  root.traverse((o) => { if (o.isMesh && !o.userData.fx && o.geometry) { let fx = false; for (let a = o; a; a = a.parent) if (a === cv.flames.grp) fx = true; if (!fx) box.expandByObject(o); } });
  root.position.copy(p); root.quaternion.copy(q); root.updateMatrixWorld(true);
  if (box.isEmpty()) box.set(new THREE.Vector3(-1.1, -0.6, -2.5), new THREE.Vector3(1.1, 1.4, 2.5));
  return box;
}

const tmpQ = new THREE.Quaternion(), tmpQ2 = new THREE.Quaternion();
function render(rdt) {
  let pose = null;
  decoUniforms.uTime.value = shadowUniforms.sbTime.value = performance.now() / 1000;   // Wind im Gras, Wolkenschatten, Wellen
  shadowUniforms.sbCloudOn.value = quality.tier > 0 && !quality.decoLite && params.get('wolken') !== '0' ? 1 : 0;
  // Automatik „Deko sparsam“: Gras/Blumen und Büsche ausblenden (Welt nicht neu bauen)
  if (worldGroup && worldGroup.userData.lite !== !!quality.decoLite) {
    worldGroup.userData.lite = !!quality.decoLite;
    for (const m of worldGroup.children) if (m.name === 'deco-grass' || m.name === 'deco-bushes') m.visible = !quality.decoLite;
  }
  renderer.info.reset();
  let boost = 0;
  if (mode === 'replay' && replay) {
    pose = replay.pose();
    const ph = replay.phys();
    pose.wheels = ph.wheels;
    carVis.sync(ph, 1, pose);
    boost = replay.nitro();
  } else if (race) {
    boost = mode === 'race' ? race.car.boost : 0;
    const c = race.car;
    const a = acc / DT;
    if (prevPose && !frozen) {
      pose = { pos: { x: prevPose.p[0] + (c.pos.x - prevPose.p[0]) * a, y: prevPose.p[1] + (c.pos.y - prevPose.p[1]) * a, z: prevPose.p[2] + (c.pos.z - prevPose.p[2]) * a }, q: null, frame: c.frame };
      tmpQ.set(prevPose.q[0], prevPose.q[1], prevPose.q[2], prevPose.q[3]);
      tmpQ2.set(c.q.x, c.q.y, c.q.z, c.q.w);
      tmpQ.slerp(tmpQ2, a);
      pose.q = { x: tmpQ.x, y: tmpQ.y, z: tmpQ.z, w: tmpQ.w };
    } else pose = { pos: c.pos, q: c.q, frame: c.frame };
    pose.air = c.onGround === 0 && !c.surfaceKind && !c.crash;
    pose.wheels = c.wheels;
    carVis.sync(c, 1, pose);
  }
  if (pose && mode === 'menu' && !app.freezeCam) {
    // Menü: langsame Kamerafahrt um das Auto am Start
    clearLens(camera);
    const t = performance.now() / 1000 * 0.12;
    const r = 7.5;
    camera.position.set(pose.pos.x + Math.cos(t) * r, pose.pos.y + 2.2, pose.pos.z + Math.sin(t) * r);
    camera.up.set(0, 1, 0);
    camera.lookAt(pose.pos.x, pose.pos.y + 0.4, pose.pos.z);
    sun.target.position.set(pose.pos.x, pose.pos.y, pose.pos.z);
    sun.position.copy(sun.target.position).addScaledVector(sun.userData.dir, 60);
    sun.target.updateMatrixWorld();
  } else if (pose) {
    const crashed = race && (race.state === 'wreck');
    const sp = mode === 'replay' ? Math.abs(replay.speed()) : race ? race.car.speed() : 0;
    rig.boost = boost;
    if (!frozen || !app.freezeCam) rig.update(rdt, pose, crashed, env && env.world, sp);
    // Sonne mit Schattenkamera folgt dem Auto
    sun.target.position.set(pose.pos.x, pose.pos.y, pose.pos.z);
    sun.position.copy(sun.target.position).addScaledVector(sun.userData.dir, 60);
    sun.target.updateMatrixWorld();
  }
  carVis.setNitro(boost, frozen || (replay && replay.paused) ? 0 : rdt);
  // Grafik „Sparsam“ (keine Bewegungsunschärfe): dezente Tempo-Streifen am Rand ab ~260 km/h
  const lineSpd = mode === 'race' && race && !frozen && quality.tier === 0 && (store.settings.blur || 'light') !== 'off' ? race.car.speed() * 3.6 : 0;
  ui.boost(mode === 'menu' ? 0 : boost, Math.max(0, Math.min(1, (lineSpd - 260) / 240)) * 0.55);
  if (ghost && ghostVis.root.visible && mode === 'race') { ghost.sync(ghostVis); ghostVis.setNitro(ghost.nitro(), frozen ? 0 : rdt); }
  if (fx && mode === 'race' && !frozen) fx.update(rdt, camera);
  if (lineViz) lineViz.update(camera, race, store.settings.assist, mode, store.settings.line);
  sky.position.copy(camera.position);
  if (mode === 'race' && race) { ui.hud(race, env, ghost); sound.update(race.car, rdt, race.state, { cockpit: rig.view === 'cockpit' }); }
  if (mode === 'replay' && replay) ui.replayHud(replay);
  // Cockpit: Außenkarosserie ausblenden (ragt sonst ins Bild), Innenraum im zweiten Durchgang darüber
  const inCockpit = mode !== 'menu' && !!pose && rig.view === 'cockpit';
  carVis.root.visible = !inCockpit;
  const camTag = mode === 'menu' ? 'menu' : rig.view;
  if (document.body.dataset.cam !== camTag) document.body.dataset.cam = camTag;
  // Bewegungsunschärfe: nur im laufenden Rennen/Replay (nicht Menü, Pause, Replay-Standbild, Test-Standbild)
  post.setting = params.get('blur') || store.settings.blur || 'light';
  post.tier = quality.tier;
  const running = !frozen && !app.freezeCam && ((mode === 'race' && race && race.state !== 'countdown') || (mode === 'replay' && replay && !replay.paused));
  const spd = !pose ? 0 : mode === 'replay' && replay ? Math.abs(replay.speed()) : race ? race.car.speed() : 0;
  if (!post.render(scene, camera, { run: running, speed: spd, boost, car: carVis.root, dt: rdt, cut: blurCut })) renderer.render(scene, camera);
  blurCut = false;
  if (inCockpit) {
    cockpit.layout({ ...cockpitZone(), vfov: camera.fov });
    const cv = cockpitValues();
    cockpit.update(frozen ? 0 : rdt * (mode === 'replay' && replay ? replay.speedMul * (replay.paused ? 0 : 1) : 1), cv, camera, sun.userData.dir);
    cockpit.render(renderer);
    ui.cockpitMode(cockpit.gaugePx, cv.gear);
  }
}

// ---------- Debug-API ----------
window.__game = {
  get env() { return env; }, get race() { return race; }, get mode() { return mode; }, get replayObj() { return replay; }, scene, camera, renderer, rig, store, ui, quality, trkLib, sammlung,
  modeKey, worldScale: WORLD_SCALE,
  // Import (Tests): Bytes als Array → Ergebnisliste; Strecke laden
  importBytes: (arr, name) => importFiles([new File([new Uint8Array(arr)], name || 'test.trk')]),
  loadImported: (id) => playImported(id),
  info() { const i = renderer.info; return { calls: i.render.calls, tris: i.render.triangles, geometries: i.memory.geometries, textures: i.memory.textures, programs: i.programs ? i.programs.length : 0, pixelRatio: renderer.getPixelRatio(), tier: quality.tier, fps: quality.fps }; },
  state() {
    const c = race && race.car;
    return { mode, state: race && race.state, time: race && race.time, speed: c && c.speed(), pos: c && [c.pos.x, c.pos.y, c.pos.z], up: c && c.frame.u.y, cp: race && race.cpNext, cps: race && race.cps.length, lap: race && race.tracker.lap, idx: race && race.tracker.idx, n: env && env.track.line.n, crashes: race && race.crashes, rewinds: race && race.rewinds, penalties: race && race.penalties, wreck: race && race.wreckOn, crash: c && c.crash, assist: store.settings.assist, seed: env && env.meta.seed, diff: env && env.meta.diff, key: env && env.meta.key, frames: app.frames,
      charges: race && { ...race.charges }, used: race && { ...race.used }, x: race && race.xstate(), onGround: c && c.onGround, extras: race && race.extrasOn };
  },
  start: (o) => startRace(o || {}),
  newTrack: (s, d, mode) => newTrack(s, d, mode),
  setAssist,
  setLine,
  toggleLine,
  replay: startReplay,
  toMenu,
  freeze(on = true) { frozen = on; },
  setTimeScale(s) { timeScale = s; },
  cam(m) { rig.mode = m; rig.init = false; },
  get cockpit() { return cockpit; },
  get carVis() { return carVis; }, get ghostVis() { return ghostVis; }, get ghost() { return ghost; },
  // Physik ohne Rendering vorspulen (Headless: schneller als Echtzeit)
  sim(seconds, inp = null) {
    const I = inp || { steer: 0, throttle: 0, brake: 0 };
    const n = Math.round(seconds / DT);
    for (let k = 0; k < n; k++) { prevPose = race.car.snapshot(); race.step(DT, I); if (ghost) ghost.advance(DT, race); if (fx) fx.step(DT, race.car, race.state); if (race.state === 'finished') break; }
    handleEvents();
    return this.state();
  },
  teleport(idx, speed = 20) { race.place(idx, speed); prevPose = null; blurCut = true; },
  post, shadowUniforms,
  hop() { race.requestHop(); }, nitro() { race.requestNitro(); },
};

boot().catch((e) => { console.error(e); window.__errors && window.__errors.push(String(e && e.stack || e)); ui.fatal(e); });
