// Stuntbahn – Einstieg: Renderer, Laden, Spielschleife (feste 120-Hz-Physik, Rendering entkoppelt),
// Debug-API window.__game für Headless-Tests.
import * as THREE from 'three';
import { BUILD } from './build.js';
import { makeMaterials } from './gfx/materials.js';
import { makeSky, makeEnvironment, loadSkyInfo, sunDirFromUV, bakeStaticShadow } from './gfx/env.js';
import { buildWorld, STATIC_LAYER } from './gfx/world.js';
import { makeCar, loadCarModel } from './gfx/carmesh.js';
import { CameraRig } from './gfx/camera.js';
import { Input } from './game/input.js';
import { Race, ASSISTS } from './game/race.js';
import { UI } from './ui/ui.js';
import { generate, demoLayout, galleryLayout } from './track/generator.js';
import { verify, prepare } from './track/verify.js';
import { Store } from './game/store.js';
import { Ghost } from './game/ghost.js';
import { Replay } from './game/replay.js';
import { Quality } from './gfx/quality.js';
import { LineViz } from './gfx/lineviz.js';
import { Sound } from './audio/sound.js';
import { daySeed } from './core/util.js';

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
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, 1, 0.25, 4000);
camera.layers.enable(STATIC_LAYER);
const quality = new Quality(renderer, params.get('q'));
function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setPixelRatio(quality.pixelRatio());
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();

const input = new Input();
const store = new Store();
const ui = new UI(app, store);
const rig = new CameraRig(camera);
const sound = new Sound(store);

let sun, skyInfo, envMap, M, carVis, ghostVis, sky;
let env = null;          // aktuelle Strecke { track, world, ideal, prof, layout, meta }
let worldGroup = null;
let race = null, ghost = null, replay = null, lineViz = null;
let mode = 'menu';       // menu | race | replay
let acc = 0, last = performance.now(), frozen = false, timeScale = 1;
let prevPose = null;

async function boot() {
  ui.loading(0.05, 'Himmel und Licht …');
  skyInfo = await loadSkyInfo();
  const sunDir = sunDirFromUV(skyInfo.u, skyInfo.v);
  const [envTex] = await Promise.all([makeEnvironment(renderer), loadCarModel().then(() => ui.loading(0.45, 'Auto …'))]);
  envMap = envTex;
  scene.environment = envMap;
  scene.environmentIntensity = +(params.get('env') || 1.8);
  sky = makeSky(skyInfo);
  scene.add(sky);
  const hz = new THREE.Color().setRGB(...skyInfo.horizon, THREE.SRGBColorSpace);
  scene.fog = new THREE.Fog(hz, 260, 1500);
  sun = new THREE.DirectionalLight(0xfff1dc, +(params.get('sun') || 3.0));
  sun.position.copy(sunDir).multiplyScalar(60);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  const sc = sun.shadow.camera;
  sc.left = -7; sc.right = 7; sc.top = 7; sc.bottom = -7; sc.near = 1; sc.far = 140;
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.02;
  sun.userData.dir = sunDir.clone();
  scene.add(sun, sun.target);
  M = makeMaterials(renderer);
  ui.loading(0.6, 'Auto lackieren …');
  carVis = await makeCar({ color: store.settings.paint });
  scene.add(carVis.root);
  ghostVis = await makeCar({ color: 0xffffff });
  ghostVis.root.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = false; o.receiveShadow = false;
      o.material = new THREE.MeshBasicMaterial({ color: 0x9fe0ff, transparent: true, opacity: 0.28, depthWrite: false });
    }
  });
  ghostVis.root.visible = false;
  scene.add(ghostVis.root);
  lineViz = new LineViz(scene);
  ui.loading(0.8, 'Strecke bauen …');
  const q = params.get('seed');
  if (params.has('demo')) await loadTrack(demoLayout(), { name: 'Teststrecke' });
  else if (params.has('gallery')) await loadTrack(galleryLayout());
  else await loadGenerated(q ? +q : daySeed(), +(params.get('d') || 2));
  ui.loading(1, 'Fertig');
  app.ready = true;
  ui.bind({ startRace, newTrack, setAssist, toMenu, retry, startReplay, cycleCam, rewind: () => race && race.requestRewind(), pause: togglePause, setPaint, sound, input, quality });
  ui.showMenu(env);
  mode = params.has('race') ? 'race' : 'menu';
  if (mode === 'race') startRace();
  requestAnimationFrame(frame);
}

// Generierte Strecke: aus Cache (bereits geprüft) oder Autopilot-Prüfung mit Fortschrittsanzeige
async function loadGenerated(seed, diff) {
  const lay = generate(seed, diff);
  const key = lay.meta.key;
  const cached = store.getVerified(key, BUILD);
  if (cached) {
    lay.pieces = cached.pieces;
    return loadTrack(lay, { apTime: cached.ap, fixes: cached.fixes });
  }
  ui.loading(0.82, 'Autopilot prüft die Strecke …');
  const res = await verify(lay, (p, f) => ui.loading(0.82 + 0.16 * p, `Autopilot prüft die Strecke … ${Math.round(p * 100)} %${f ? ' (entschärft: ' + f + ')' : ''}`));
  store.setVerified(key, BUILD, res.layout.pieces, res.apTime, res.fixes);
  return loadTrack(res.layout, { apTime: res.apTime, fixes: res.fixes }, res.env);
}

async function loadTrack(layout, meta = {}, pre = null) {
  if (worldGroup) { scene.remove(worldGroup); worldGroup.traverse((o) => { if (o.geometry) o.geometry.dispose(); }); }
  const t0 = performance.now();
  const P = pre || prepare(layout);
  const { track, world, ideal, prof } = P;
  env = { track, world, ideal, prof, layout, meta: { ...layout.meta, ...meta } };
  worldGroup = buildWorld(track, M);
  scene.add(worldGroup);
  bakeStaticShadow(renderer, scene, sun.userData.dir, track.bounds, quality.staticShadowSize());
  rig.setTrackCams(track);
  lineViz.build(ideal, prof, track);
  env.buildMs = performance.now() - t0;
  // Vorschau: Auto an den Start
  race = new Race(env, { assist: store.settings.assist, countdown: 1e9 });
  prevPose = null;
  return env;
}

function startRace(opts = {}) {
  replay = null;
  race = new Race(env, { assist: store.settings.assist, autopilot: !!opts.autopilot });
  ghost = new Ghost(store.loadGhost(env.meta.key, store.settings.assist));
  ghostVis.root.visible = !!ghost.data && store.settings.ghost;
  rig.init = false;
  mode = 'race';
  ui.showHud(race, env);
  sound.start();
  prevPose = null;
}
function retry() { startRace(); }
async function newTrack(seed, diff) {
  ui.loading(0.5, 'Strecke bauen …');
  await new Promise((r) => setTimeout(r, 30));
  await loadGenerated(seed, diff);
  ui.loading(1);
  ui.showMenu(env);
  mode = 'menu';
}
function setAssist(k) { store.settings.assist = k; store.save(); if (race) race.setAssist(k); ui.refresh(); ui.assistChanged(); }
function setPaint(c) { store.settings.paint = c; store.save(); carVis.setPaint(c); }
function toMenu() { mode = 'menu'; replay = null; sound.stop(); race = new Race(env, { assist: store.settings.assist, countdown: 1e9 }); ui.showMenu(env); }
function startReplay() {
  if (!race || !race.rec.length) return;
  replay = new Replay(race.rec, env);
  mode = 'replay';
  rig.mode = 'chase'; rig.init = false;
  ui.showReplay(replay);
}
function cycleCam() { const m = rig.cycle(); ui.toast({ chase: 'Verfolger', far: 'Hubschrauber', bumper: 'Stoßstange', track: 'Streckenkamera' }[m]); }
function togglePause() { if (mode !== 'race') return; frozen = !frozen; ui.showPause(frozen); if (frozen) sound.stop(); else sound.start(); }

// ---------- Schleife ----------
function frame(now) {
  requestAnimationFrame(frame);
  const rdt = Math.min(0.1, (now - last) / 1000);
  last = now;
  app.frames++;
  quality.sample(rdt, () => resize());
  const inp = input.update(rdt);
  if (input.consume('Escape') || input.consume('KeyP')) { if (mode === 'race') togglePause(); }
  if (input.consume('KeyC')) cycleCam();
  if (input.consume('KeyR') && mode === 'race' && race.assist.autoRewind !== undefined && store.settings.assist !== 'original') race.requestRewind();
  if (!frozen && mode === 'race') {
    acc += rdt * timeScale;
    let steps = 0;
    while (acc >= DT && steps < 14) {
      prevPose = race.car.snapshot();
      race.step(DT, inp);
      if (ghost) ghost.advance(DT, race);
      acc -= DT; steps++;
    }
    if (steps >= 14) acc = 0;
    handleEvents();
  } else if (mode === 'replay' && replay) {
    replay.advance(rdt * timeScale);
  }
  render(rdt);
}

function handleEvents() {
  for (const e of race.events) {
    ui.event(e, race);
    sound.event(e);
    if (e.type === 'finish') {
      const res = store.submit(env.meta.key, race.assistKey, race.finalTime, race.rec, env.meta);
      ui.showResult(race, res, env);
      sound.stop();
    }
  }
  race.events.length = 0;
}

const tmpQ = new THREE.Quaternion(), tmpQ2 = new THREE.Quaternion();
function render(rdt) {
  let pose = null;
  if (mode === 'replay' && replay) {
    pose = replay.pose();
    carVis.sync(replay.phys(), 1, pose);
  } else if (race) {
    const c = race.car;
    const a = acc / DT;
    if (prevPose && !frozen) {
      pose = { pos: { x: prevPose.p[0] + (c.pos.x - prevPose.p[0]) * a, y: prevPose.p[1] + (c.pos.y - prevPose.p[1]) * a, z: prevPose.p[2] + (c.pos.z - prevPose.p[2]) * a }, q: null, frame: c.frame };
      tmpQ.set(prevPose.q[0], prevPose.q[1], prevPose.q[2], prevPose.q[3]);
      tmpQ2.set(c.q.x, c.q.y, c.q.z, c.q.w);
      tmpQ.slerp(tmpQ2, a);
      pose.q = { x: tmpQ.x, y: tmpQ.y, z: tmpQ.z, w: tmpQ.w };
    } else pose = { pos: c.pos, q: c.q, frame: c.frame };
    carVis.sync(c, 1, pose);
  }
  if (pose) {
    const crashed = race && (race.state === 'wreck');
    const sp = mode === 'replay' ? Math.abs(replay.speed()) : race ? race.car.speed() : 0;
    if (!frozen || !app.freezeCam) rig.update(rdt, pose, crashed, env && env.world, sp);
    // Sonne mit Schattenkamera folgt dem Auto
    sun.target.position.set(pose.pos.x, pose.pos.y, pose.pos.z);
    sun.position.copy(sun.target.position).addScaledVector(sun.userData.dir, 60);
    sun.target.updateMatrixWorld();
  }
  if (ghost && ghostVis.root.visible && mode === 'race') ghost.sync(ghostVis);
  if (lineViz) lineViz.update(camera, race, store.settings.assist, mode);
  sky.position.copy(camera.position);
  if (mode === 'race' && race) { ui.hud(race, env, ghost); sound.update(race.car, rdt, race.state); }
  if (mode === 'replay' && replay) ui.replayHud(replay);
  renderer.render(scene, camera);
}

// ---------- Debug-API ----------
window.__game = {
  get env() { return env; }, get race() { return race; }, get mode() { return mode; }, scene, camera, renderer, rig, store, ui, quality,
  info() { const i = renderer.info; return { calls: i.render.calls, tris: i.render.triangles, geometries: i.memory.geometries, textures: i.memory.textures, programs: i.programs ? i.programs.length : 0, pixelRatio: renderer.getPixelRatio(), tier: quality.tier, fps: quality.fps }; },
  state() {
    const c = race && race.car;
    return { mode, state: race && race.state, time: race && race.time, speed: c && c.speed(), pos: c && [c.pos.x, c.pos.y, c.pos.z], up: c && c.frame.u.y, cp: race && race.cpNext, cps: race && race.cps.length, lap: race && race.tracker.lap, idx: race && race.tracker.idx, n: env && env.track.line.n, crashes: race && race.crashes, rewinds: race && race.rewinds, crash: c && c.crash, assist: store.settings.assist, seed: env && env.meta.seed, diff: env && env.meta.diff, key: env && env.meta.key, frames: app.frames };
  },
  start: (o) => startRace(o || {}),
  newTrack: (s, d) => newTrack(s, d),
  setAssist,
  replay: startReplay,
  toMenu,
  freeze(on = true) { frozen = on; },
  setTimeScale(s) { timeScale = s; },
  cam(m) { rig.mode = m; rig.init = false; },
  // Physik ohne Rendering vorspulen (Headless: schneller als Echtzeit)
  sim(seconds, inp = null) {
    const I = inp || { steer: 0, throttle: 0, brake: 0 };
    const n = Math.round(seconds / DT);
    for (let k = 0; k < n; k++) { prevPose = race.car.snapshot(); race.step(DT, I); if (ghost) ghost.advance(DT, race); if (race.state === 'finished') break; }
    handleEvents();
    return this.state();
  },
  teleport(idx, speed = 20) { race.place(idx, speed); prevPose = null; },
};

boot().catch((e) => { console.error(e); window.__errors && window.__errors.push(String(e && e.stack || e)); ui.fatal(e); });
