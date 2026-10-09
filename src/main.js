// Stuntbahn – Einstieg: Renderer, Laden, Spielschleife (feste 120-Hz-Physik, Rendering entkoppelt),
// Debug-API window.__game für Headless-Tests.
import * as THREE from 'three';
import { BUILD } from './build.js';
import { makeMaterials, shadowUniforms, preloadKtx2, themeUniforms, vaoUniforms } from './gfx/materials.js';
import { makeSky, sunDirFromUV, bakeStaticShadow } from './gfx/env.js';
import { ThemeManager } from './gfx/themes.js';
import { themeFor, THEMES, THEME_IDS } from './track/themes.js';
import { wetterFor, parseWetter, wetterLook } from './track/wetter.js';
import { zeitFor, parseZeit, zeitLook } from './track/zeit.js';
import { zeitUniforms, glowUniforms, glowMesh, planNachtLichter, backeLichtKarte, reflNaechste } from './gfx/zeit.js';
import { Scheibe } from './gfx/scheibe.js';
import { kulisse2Uniforms, ampelAus, kulisse2Tick } from './gfx/kulisse2.js';
import { buildWorld, STATIC_LAYER, vaoAuftrag } from './gfx/world.js';
import { makeCar, loadCarModel, loadCarLods, parkedCarGeometry, EXHAUST } from './gfx/carmesh.js';
import { CameraRig, CAM_MODES, CAM_NAMES, cockpitDash, clearLens } from './gfx/camera.js';
import { Cockpit } from './gfx/cockpit.js';
import { displayGear } from './gfx/gauges.js';
import { Input } from './game/input.js';
import { Race, ASSISTS, GAME_SPEEDS, GAME_SPEED_STD, FAHRSTIL_URL, REC_HZ } from './game/race.js';
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
import { buildFilm, FilmPlayer, HL } from './game/highlights.js';
import { CineCam } from './game/cinecam.js';
import { ClipRecorder, clipMime } from './ui/cliprec.js';
import { Quality } from './gfx/quality.js';
import { GpuZeit } from './gfx/kern/autopilot.js';
import { geraeteSchluessel, ladeGeraet, merkeGeraet, messeBilder, skalaAusProbe } from './gfx/kern/startprobe.js';
import { DynReflex } from './gfx/kern/reflex.js';
import { ImpostorBibliothek } from './gfx/kern/impostor.js';
import { impostorArten } from './gfx/kulisse.js';
import { LineViz, LINE_LEVELS } from './gfx/lineviz.js';
import { Sound } from './audio/sound.js';
import { CarFX } from './gfx/fx.js';
import { PyroFX } from './gfx/pyro.js';
import { pyroGeo, ZIEL } from './game/zielshow.js';
import { Post } from './gfx/post.js';
import { KinoLook } from './gfx/kinolook.js';
import { mipBiasEinbauen } from './gfx/kern/taau.js';
import { loadDecoAssets, decoUniforms, GB } from './gfx/deco.js';
import { kulisseTick } from './gfx/kulisse.js';
import { DEKO, REDUCED, makeBirds, AirMotes, makeBrakeLights } from './gfx/deko.js';
import { daySeed } from './core/util.js';
import { showKmhMs } from './core/showspeed.js';
import { GMeter, G_ON } from './core/gforce.js';
import { WORLD_TAG, WORLD_SCALE, STUNT_TAG, TUBE_TAG, MAT } from './track/defs.js';
// Geprüfte Strecken (Autopilot, Entschärfungen) je Weltmaßstab getrennt: ?welt=1 prüft neu statt die Teile der
// anderen Welt zu übernehmen
const VBUILD = BUILD + WORLD_TAG + STUNT_TAG + TUBE_TAG + '@r29';   // n26: ?stunt=1 prüft und speichert getrennt; n29: ?roehre=glatt auch, Röhre mit Buckel prüft neu

const DT = 1 / 120;
const params = new URLSearchParams(location.search);
const app = window.__app = { frames: 0, build: BUILD, ready: false, errors: window.__errors || [] };

// ---------- Renderer ----------
const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', stencil: false });
renderer.outputColorSpace = THREE.SRGBColorSpace;
const TM = { aces: THREE.ACESFilmicToneMapping, neutral: THREE.NeutralToneMapping, agx: THREE.AgXToneMapping };
renderer.toneMapping = TM[params.get('tm')] || TM.neutral;
renderer.toneMappingExposure = +(params.get('exp') || 1.05);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.info.autoReset = false;   // zwei Durchgänge (Welt + Cockpit) → Zähler je Bild selbst zurücksetzen
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, 1, 0.25, 4000 * WORLD_SCALE);   // Fernring/Bergkranz wachsen mit
camera.layers.enable(STATIC_LAYER);
// Kino-Look (n17): ?look=0|1|2 erzwingt Einfach/Standard/Kino (A/B), ?look=alt = Bild wie bis n22 (alter Weg mit post.js),
// ?kl=-bloom,+ssao schaltet einzelne Stufen. Ohne ?look folgt der Look der Grafik-Stufe (Einstellung bzw. Automatik).
const LOOK = params.get('look');
const LOOK_FIX = LOOK != null && /^[012]$/.test(LOOK) ? +LOOK : null;
// n30: Qualitäts-Autopilot aus dem Grafik-Kern (Arbeitszeit, GPU-Zeit, auch aufwärts); ?autopilot=0 = alte Automatik
const quality = new Quality(renderer, params.get('q') ?? (LOOK_FIX != null ? String(LOOK_FIX) : null), { autopilot: params.get('autopilot') !== '0', tightShadow: params.get('schattenkam') !== '0' });
// n30: Kino ohne SSAO, solange die gebackene Vertex-AO an ist (Wände, Röhre, Looping; ?vao=0 = SSAO wie bisher);
// ?kl=+ssao schaltet sie trotzdem zu (spätere Angabe gewinnt)
// n31: TAAU als Kino-Look-Stufe `taa` (Standard AUS): ?taa=1 an, ?taa=0 aus; ?taaw= History-Gewicht (0,9), ?jit= Jitter-Muster
// (auto | 8 | 16 | 32 | 0 = kein Versatz), ?taagamma= Clip-Breite, ?taadis= Disocclusion-Schwelle, ?taaskala= Start-Renderskala
// (0,6–1; mit fester Stufe ?q= bleibt sie stehen) – für Peters A/B
const TAA_URL = params.get('taa') === '1' ? '+taa' : params.get('taa') === '0' ? '-taa' : '';
const kino = LOOK === 'alt' ? null : new KinoLook(renderer, { level: LOOK_FIX ?? quality.tier, stages: [params.get('vao') === '0' ? '' : '-ssao', TAA_URL, params.get('kl') || ''].filter(Boolean).join(','),
  taa: { gewicht: params.get('taaw'), muster: params.get('jit'), gamma: params.get('taagamma'), dis: params.get('taadis'), skala: params.get('taaskala'), debug: params.get('taadbg'), scharf: params.get('taasharp'), cub: params.get('taacub'), bewegung: params.get('taamot'), sigmaTreffer: params.get('taasig') } });
// n31: negativer Mip-Bias für TAAU (Texturen in Zielauflösungs-Schärfe abtasten, sonst bleibt Texturdetail bei Renderskala
// 0,65 verloren) – Konstante in den Shadern, deshalb hier beim Start vor dem ersten Übersetzen: log2(Start-Renderskala),
// ?taamip= für A/B (0 = aus). Ohne TAA 0.
const GPU_MESS = params.get('gpumess') === '1';
const TAA_BOOT = !!(kino && kino.taaGewuenscht(kino.level) && kino.taaTechnik());
app.mipBias = mipBiasEinbauen(THREE.ShaderChunk, TAA_BOOT ? (params.get('taamip') ?? Math.log2(kino.scaleRangeOf(kino.level)[0])) : 0);
// Bewegungsunschärfe: im Kino-Look Teil derselben Pipeline (ein Szenen-Durchlauf); ?look=alt: bisheriges post.js
const post = kino || new Post(renderer);
quality.post = post; quality.kino = kino;
let sun, M, carVis, ghostVis, sky, cockpit, themes, air = null, brakeLights = null, brakeV = null, scheibe = null, headL = null, headGlow = null;
// n30: dynamische Lack-Spiegelung (gfx/kern/reflex.js) nur auf Kino: dort kostet sie im Handy-Profil 0–3 % p95, auf
// Standard +26–31 % (Draw-Calls der Würfelseite, CPU) – Regel des Auftrags „> +8 % → nur Kino“. ?reflex=0 aus,
// ?reflex=1 auch auf Standard. Der Autopilot darf sie als „teure Deko“ abschalten (reflexOff)
const REFLEX_MIN = params.get('reflex') === '0' ? 9 : params.get('reflex') === '1' ? 1 : 2;
let reflex = null, reflexOff = false;
const REFLEX_LAYER = 2, REFLEX_OBJ = /^(trk|terrain|kulisse-(meer|horizont|nah|fern)|trees)/;   // nur große Flächen: jeder Draw-Call der Spiegel-Seite kostet am Handy CPU
// n30: Bäume als Oktaeder-Impostors (Standard/Kino), sobald assets/tex/imp/impostor.json da ist; ?impostor=0 = Karten
const IMP = params.get('impostor') === '0' ? null : new ImpostorBibliothek('assets/tex/imp/impostor.json', renderer);

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
// Gespeicherte Grafik-Wahl (Einfach/Standard/Kino) beim Start übernehmen; ohne Wahl startet die Automatik mit Kino
{ const q = String(store.settings.quality || 'auto');
  if (params.get('q') == null && LOOK_FIX == null && /^[012]$/.test(q)) { quality.forced = q; quality.tier = +q; resize(); } }
const ui = new UI(app, store);
const rig = new CameraRig(camera);
if (DEKO && REDUCED) rig.shakeOn = false;   // n28: „Bewegung reduzieren“ → kein Kameraschütteln
const sound = new Sound(store);
const trkLib = new TrkLib();
const sammlung = new Sammlung();      // 250 eigene Strecken, lädt erst beim Aufklappen in der Bibliothek
let parked = [];         // geparkte Autos (Szenerie „Geisterauto“ importierter Strecken)
window.__soundRef = sound;

let env = null;          // aktuelle Strecke { track, world, ideal, prof, layout, meta }
let worldGroup = null;
let race = null, ghost = null, replay = null, lineViz = null, fx = null;
let mode = 'menu';       // menu | race | replay (auch Kino-Replay: dann ist cine gesetzt)
// Kino-Replay nach dem Ziel (n18): Highlight-Film { film, player, cam, res, stats } oder null. Einstellung „Kino-Replay
// nach dem Ziel“ (Standard an); ?kino=0|1 übersteuert, Tests schalten ihn per window.__noKino ab (tests/util.py)
let cine = null;
// Zielshow (n27): nach der Ziellinie ZIEL.end Spielsekunden Auslaufen mit Feuerwerk, ab ZIEL.cut die Zielbogen-Kamera;
// danach Highlight-Film bzw. Ergebnis. { res, cc, shot, camOn } oder null. ?show=0 bzw. window.__noShow (ältere Tests):
// gleich weiter (das Auslaufen wird dann sofort vorgerechnet, Replay und Film enthalten es trotzdem)
let show = null, pyro = null;
const KINO_URL = params.get('kino');
const cineWanted = () => (KINO_URL === '0' ? false : KINO_URL === '1' ? true : !window.__noKino && store.settings.cine !== false);
// Spieltempo: 1.25 = 25 % schneller als Echtzeit (Peter 27.09.); Mittel ab n23 1,0 (Echtzeit: die Tacho-Zahl ist das
// Tempo, das man sieht; race.js GAME_SPEEDS). ?speed= übersteuert alle Stufen
const SPEED_URL = params.get('speed') ? +params.get('speed') : null;
const gameSpeed = (k) => SPEED_URL ?? GAME_SPEEDS[k] ?? GAME_SPEED_STD;
const GAME_SPEED = gameSpeed(store.settings.assist);
const FOG = [260 * WORLD_SCALE, 1500 * WORLD_SCALE];
let acc = 0, last = performance.now(), frozen = false, timeScale = GAME_SPEED;
let prevPose = null;
let blurCut = true;      // nächstes Bild ohne Bewegungsunschärfe (Kameraschnitt)

// Geist: durchscheinend hellblau, ohne Schatten (n30: auch für die nachgeladenen LOD-Stufen, nur = 'lod')
function ghostify(root, nur = null) {
  root.traverse((o) => {
    if (o.isMesh && !o.userData.fx && (nur !== 'lod' || o.userData.lod > 0)) {   // Nitro-Flammen des Geists bleiben Flammen
      o.castShadow = false; o.receiveShadow = false;
      o.material = new THREE.MeshBasicMaterial({ color: 0x9fe0ff, transparent: true, opacity: 0.28, depthWrite: false });
    }
  });
}

async function boot() {
  ui.loading(0.05, 'Himmel und Licht …');
  // Kulissen (n20): Himmel/Licht/Boden kommen mit dem Landschafts-Thema der Strecke (gfx/themes.js). Das Thema der Start-
  // Strecke steht schon vor dem Bau fest (Seed, Stufe, Streckenart) → sein Paket lädt parallel zum Auto.
  const sunDir = sunDirFromUV(0.595, 0.234);
  sky = makeSky({ cutV: 0.544, horizon: [0.744, 0.758, 0.799] }, null, { clouds: DEKO });
  scene.add(sky);
  scene.fog = new THREE.Fog(0xbdc1cc, FOG[0], FOG[1]);
  sun = new THREE.DirectionalLight(0xfff1dc, +(params.get('sun') || 3.0));
  sun.position.copy(sunDir).multiplyScalar(60);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  const sc = sun.shadow.camera;
  sc.left = -7; sc.right = 7; sc.top = 7; sc.bottom = -7; sc.near = 1; sc.far = 140;
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.02;
  sun.userData.dir = sunDir.clone();
  if (sky.material.uniforms.cSun) sky.material.uniforms.cSun.value = sun.userData.dir;   // n28: Wolken zur Sonne hin hell
  scene.add(sun, sun.target);
  themes = new ThemeManager({ renderer, scene, sky, sun, kino, get M() { return M; }, getCockpit: () => cockpit, params });
  { const q0 = params.get('seed'), bm = q0 ? (params.get('g') === '1' ? 'gel' : params.get('3d') === '1' ? '3d' : 'flat') : modeOf(store.settings.trackMode);
    if (!params.has('demo') && !params.has('gallery') && !params.has('trk')) themes.prefetch(themeOf({ meta: { seed: q0 ? +q0 : daySeed(), diff: +(params.get('d') || 2), gel: bm === 'gel', d3: bm === '3d' } })); }
  await Promise.all([loadCarModel().then(() => ui.loading(0.45, 'Auto …')),
    loadDecoAssets().catch((e) => console.warn('Deko nicht geladen', e)), preloadKtx2(renderer).then((n) => { app.ktx2 = n; })]);
  quality.apply(sun, renderer);
  M = makeMaterials(renderer);
  ui.loading(0.6, 'Auto lackieren …');
  carVis = await makeCar({ color: store.settings.paint, contact: !!kino });
  scene.add(carVis.root);
  rig.carBox = carLocalBox(carVis);
  if (DEKO) brakeLights = makeBrakeLights(carVis.root);   // n28 (nach der Auto-Box: zählt nicht zur Karosserie)   // Stoßstangen-Kamera: vor die Nase
  // n32 Tageszeit: Scheinwerfer (EIN echtes SpotLight, dreht mit dem Auto – auch im Looping) und zwei Leuchtpunkte vorn.
  // Hängen nur abends/nachts am Auto (ein Licht mehr ändert alle Shader; tagsüber kostet es so nichts).
  headL = new THREE.SpotLight(0xffeedd, 0, 170, 0.46, 0.75, 1.3);   // flacher Abfall: nah nicht überbelichtet (Looping), fern noch hell
  headL.position.set(0, 0.8, -2.0); headL.target.position.set(0, -1.6, -32); headL.name = 'scheinwerfer';
  headGlow = glowMesh([-0.66, 0.66].map((x) => ({ x, y: 0.58, z: -2.12, s: 0.75, c: [7, 6.8, 6.2], kind: 4, ph: 0 })), 'scheinwerfer-glanz');
  headGlow.visible = false; carVis.root.add(headGlow);
  post.setCarBox(rig.carBox);
  ghostVis = await makeCar({ color: 0xffffff, contact: false });
  ghostify(ghostVis.root);
  if (REFLEX_MIN <= 2) {
    reflex = new DynReflex(renderer, scene, { size: +(params.get('reflexgr') || 128), far: +(params.get('reflexweit') || 150), layer: REFLEX_LAYER, takt: +(params.get('reflextakt') || 1) });   // 128 px, Sichtweite 150 m
    sky.layers.enable(REFLEX_LAYER);
    carVis.root.traverse((o) => { if (o.isMesh && !o.userData.fx) for (const m of [].concat(o.material)) if (m.isMeshPhysicalMaterial && m.clearcoat > 0) reflex.attach(m); });   // Lack, Karosserie, Glas
  }
  ghostVis.root.visible = false;
  scene.add(ghostVis.root);
  cockpit = new Cockpit(scene.environment, carVis.mats.paint, { tier: quality.tier });
  lineViz = new LineViz(scene);
  fx = new CarFX(scene);
  pyro = new PyroFX(scene);
  if (DEKO) air = new AirMotes(scene);   // n28: Schnee, Blätter, Pollen, Sand je Landschaft
  scheibe = new Scheibe();   // n32: Regentropfen auf Scheibe/Linse (nur bei Regen in Cockpit-/Stoßstangen-Kamera)
  ui.loading(0.8, 'Strecke bauen …');
  const q = params.get('seed');
  if (params.has('demo')) await loadTrack(demoLayout(), { name: 'Teststrecke' });
  else if (params.has('gallery')) await loadTrack(params.get('gallery') === 'gel' ? galleryGelLayout() : galleryLayout());   // ?gallery=gel: Gelände-Galerie (n22)
  else if (params.has('trk')) await loadImported(params.get('trk')).catch((e) => { console.warn(e); return loadGenerated(daySeed(), 2); });
  // ?seed=…&d=… wie bisher flach (alte Codes, Tests); &3d=1 = Hochstraße (n19), &g=1 = Gelände (n22). Ohne Seed: Strecke
  // des Tages in der gewählten Streckenart (ab n22 Standard „Gelände“; Schalter im Menü)
  else await loadGenerated(q ? +q : daySeed(), +(params.get('d') || 2), q ? (params.get('g') === '1' ? 'gel' : params.get('3d') === '1' ? '3d' : 'flat') : store.settings.trackMode);
  reflexVorwaermen();
  await startAutopilot();
  ui.loading(1, 'Fertig');
  app.ready = true;
  ui.bind({ startRace, newTrack, setAssist, toMenu, retry, startReplay, cycleCam, rewind: () => race && race.requestRewind(), pause: togglePause,
    skipCine: () => endCine(true), skipShow: () => endShow(true), replayCine: () => { if (race && race.film && ui.lastRes) startCine(ui.lastRes); },
    recordCine: () => { if (race && race.film && ui.lastRes) startCine(ui.lastRes, { record: true }); },
    hop: () => { if (mode === 'race' && race && !frozen) race.requestHop(); }, nitro: () => { if (mode === 'race' && race && !frozen) race.requestNitro(); }, setLine, toggleLine, setPaint, setTheme, setWetter, setZeit, sound, input, quality, importFiles, playImported, deleteImported, trkLib, showcase: SHOWCASE, showcaseBytes, store, sammlung });
  initDrop();
  ui.showMenu(env);
  mode = params.has('race') ? 'race' : 'menu';
  if (mode === 'race') startRace();
  // n30: Heldenauto-LOD (Mittel/Fern) erst nach dem Start nachladen; ?lod=0 = immer volles Modell
  if (params.get('lod') !== '0') loadCarLods().then(([mid, far]) => {
    for (const c of [carVis, ghostVis]) { c.addLod(mid, 1); c.addLod(far, 2); }
    ghostify(ghostVis.root, 'lod');
    app.carLod = { mid: carVis.lodMeshes[1].length, far: carVis.lodMeshes[2].length };
  }).catch((e) => console.warn('Auto-LOD nicht geladen', e));
  // n31 Messhaken: ?gpumess=1 misst die GPU-Zeit je Bild auch bei fester Stufe (tests/perf_taau.py; sonst nur mit Autopilot)
  if (GPU_MESS && !quality.gpu) quality.gpu = new GpuZeit(renderer.getContext());
  requestAnimationFrame(frame);
}

// n30: Qualitäts-Autopilot starten. Startwert der Renderskala: je Gerät gespeichert (localStorage, 21 Tage), sonst
// Kurzmessung im Ladebildschirm (4 + 20 Bilder der fertigen Szene, je Bild auf die GPU gewartet). Kino bleibt Startstufe.
// ?startprobe=0 überspringt die Messung (Start mit dem Preset-Wert).
async function startAutopilot() {
  if (!quality.useAP) return;
  const gl = renderer.getContext();
  const key = geraeteSchluessel(gl, { w: screen.width, h: screen.height, dpr: devicePixelRatio });
  const [lo, hi, st] = quality.scaleRangeOf(quality.tier);
  let start = quality.forced ? null : ladeGeraet(localStorage, key);
  if (start) { if ((start.stufe ?? 2) < quality.tier) start.skala = lo; app.startProbe = { gespeichert: true, skala: start.skala }; }
  else if (!quality.forced && params.get('startprobe') !== '0') {
    ui.loading(0.95, 'Grafik einstellen …');
    const s0 = kino && quality.kinoOn() ? kino.renderScale : 1;
    const r = await messeBilder(() => render(1 / 60), gl, { bilder: 20, vorlauf: 4 });
    start = { skala: skalaAusProbe(r.median, { min: lo, max: hi, aktuell: s0 }) };
    app.startProbe = { ...r, skala: start.skala };
  }
  quality.startAutopilot({ skala: start ? start.skala : st, gl,
    // n31: TAAU als Stufe – zu langsam (Renderskala schon am Minimum 0,6) → Rückfall auf die FXAA-Art (MSAA bleibt aus).
    // Kosten 0,4: der Resolve in Bildschirmauflösung kostet gemessen ~40 % der GPU-Zeit eines Kino-Bilds (omen16, 4K-Probe,
    // TAAU_BERICHT.md) – der Vorbau hatte 0,05 geschätzt
    extra: [...(reflex ? [['reflex', 0.06, (s) => { reflexOff = s === 0; }]] : []), ...(kino && kino.taaGewuenscht(2) && kino.taaTechnik() ? [['taa', 0.4, (s) => { kino.taaRueckfall = s === 0; }]] : [])],
    onAenderung: () => merkeGeraet(localStorage, key, { skala: quality.ap.skala, stufe: quality.tier }) });
  if (start && quality.ap) merkeGeraet(localStorage, key, { skala: quality.ap.skala, stufe: quality.tier });
}

// Generierte Strecke: aus Cache (bereits geprüft) oder Autopilot-Prüfung mit Fortschrittsanzeige.
// 3D (n19): scheitert der Autopilot auch nach dem Entschärfen, nimmt der Generator die nächste Variante desselben
// Codes (deterministisch – alle bekommen dieselbe Strecke), höchstens 4.
// Streckenart: 'flat' | '3d' (Hochstraße, n19) | 'gel' (Gelände, n22); true/false wie bis n21 (3D/flach)
// Landschafts-Thema einer Strecke: URL ?thema= > Einstellung „Landschaft“ > passend (track/themes.js)
let URL_THEMA = params.get('thema');   // gilt, bis im Menü eine Landschaft gewählt wird
// „🎲 Zufall“ würfelt auch die Landschaft (Peter 05.10.): gilt nur für genau diese Strecke (Schlüssel) und hat Vorrang vor
// Einstellung und ?thema=; eine Wahl im Landschafts-Menü hebt es auf. Andere Strecken (Tages-Strecke, Code, .TRK) wie bisher.
let RANDOM_THEMA = null;   // { key, id }
const randomThemaOf = (layout) => (RANDOM_THEMA && layout && layout.meta && layout.meta.key === RANDOM_THEMA.key ? RANDOM_THEMA.id : null);
const themeOf = (layout) => randomThemaOf(layout) || themeFor(layout, store.settings.theme || 'auto', URL_THEMA);
// n32 Wetter (nur Optik): URL ?wetter= > Einstellung „Wetter“ (localStorage, gilt schon beim Start) > passend zu Strecke
// und Thema (track/wetter.js). Wertet nicht extra (kein A/B-Zusatz), Physik/Strecke/Bestzeit-Schlüssel unverändert.
let URL_WETTER = parseWetter(params.get('wetter'));   // gilt, bis im Menü ein Wetter gewählt wird
const wetterOf = (layout, themeId) => wetterFor(layout, themeId, store.settings.wetter || 'auto', URL_WETTER);
// Wetter der aktuellen Strecke anwenden: Licht/Nebel/Himmel/Flächen (ThemeManager), Teilchen (render), Gischt/Dampf/
// Spuren (fx), Regengeräusch (sound). Ohne Neubau der Welt.
function wendeWetter() {
  if (!env || !env.theme) return;
  env.wetter = wetterOf(env.layout, env.theme);
  env.wetterTier = quality.tier;
  env.zeit = zeitOf(env.layout, env.theme); env.zeitLook = zeitLook(env.zeit, quality.tier);   // n32 Tageszeit (unter dem Wetter)
  const L = (themes && themes.setWetter(env.wetter, quality.tier, env.zeitLook)) || wetterLook(env.wetter, env.theme, quality.tier);
  env.wetterLook = L;
  if (fx) Object.assign(fx.wetter, { spray: L.spray, sprayKmh: L.sprayKmh, steam: L.steam, tracks: L.tracks });
  sound.setRegen(L.rain);
  zeitAnwenden();
}
// n32 Tageszeit (Nachtrag Peter 09.10.): URL ?zeit= > Einstellung > passend (meist Tag). Nur Optik, wertet nicht extra.
let URL_ZEIT = parseZeit(params.get('zeit'));
// ?spiegel=0 … 4: Zahl der Licht-Spiegelungen auf nasser Fahrbahn fest (A/B, Messung); sonst Kino 4, Standard 2, „Deko sparsam“ (Automatik) 0
const SPIEGEL = params.has('spiegel') ? Math.max(0, Math.min(4, +params.get('spiegel') || 0)) : null;
const zeitOf = (layout, themeId) => zeitFor(layout, themeId, store.settings.zeit || 'auto', URL_ZEIT);
// Nacht-Lichter der Strecke (Licht-Karte + Leuchtpunkte) einmal je Welt bauen, sobald Abend/Nacht gebraucht wird
function nachtAufbauen() {
  if (!env || !env.worldReady || !worldGroup || !env.zeitLook || env.zeitLook.lights <= 0) return;
  if (env.nacht && env.nacht.group === worldGroup) return;
  const t0 = performance.now(), T = env.track, gy = (x, z) => T.terrain.height(x, z);
  const P = planNachtLichter(T, T.decoPlan, gy, env.theme);
  const K = backeLichtKarte(P.pools, T.bounds, quality.tier >= 1 ? 512 : 256);
  if (zeitUniforms.zLichtMap.value && zeitUniforms.zLichtMap.value.image && zeitUniforms.zLichtMap.value.image.width > 1) zeitUniforms.zLichtMap.value.dispose();
  zeitUniforms.zLichtMap.value = K.tex; zeitUniforms.zLichtXf.value.set(...K.xf);
  // Streckenlaternen (nur Abend/Nacht): Mast, Ausleger, Leuchtenkopf – EIN instanziertes Mesh im Paint-Material
  let lat = null;
  if (P.laternen.length) {
    const b = new GB(), st = [0.36, 0.38, 0.41];
    b.cyl(0, -0.3, 0, 0.11, 0.08, 10.1, 6, st, false);
    b.box(0, 9.75, 1.6, 0.1, 0.1, 3.3, st);
    b.box(0, 9.62, 3.2, 0.45, 0.16, 0.9, [0.2, 0.2, 0.22]);
    lat = new THREE.InstancedMesh(b.geo(), M[MAT.PAINT], P.laternen.length);
    const o = new THREE.Object3D();
    P.laternen.forEach((p, k) => { o.position.set(p.x, p.y, p.z); o.rotation.set(0, p.rot, 0); o.updateMatrix(); lat.setMatrixAt(k, o.matrix); });
    lat.computeBoundingSphere(); lat.name = 'nacht-laternen'; worldGroup.add(lat);
  }
  const glow = glowMesh(P.glows, 'nacht-lichter'), kette = glowMesh(P.ketten, 'nacht-ketten');
  worldGroup.add(glow); if (P.ketten.length) worldGroup.add(kette);
  env.nacht = { group: worldGroup, glow, kette, lat, refl: P.refl, n: P.glows.length + P.ketten.length, pools: P.pools.length, laternen: P.laternen.length, ms: Math.round(performance.now() - t0) };
}
// Licht-Richtung geändert (Abend tief, Nacht Mond) → Sonnenschatten der Strecke neu backen
function schattenNeu() {
  if (!env || !env.worldReady || !worldGroup) return;   // beim Laden backt loadTrack selbst
  const d = sun.userData.dir;
  if (env.bakedDir && env.bakedDir.distanceToSquared(d) < 1e-8) return;
  bakeStaticShadow(renderer, scene, d, env.track.bounds, quality.staticShadowSize());
  env.bakedDir = d.clone();
}
function zeitAnwenden() {
  const L = env.zeitLook, on = L.lights > 0;
  if (headL) {
    if (on && !headL.parent) carVis.root.add(headL, headL.target); else if (!on && headL.parent) { headL.parent.remove(headL.target); headL.parent.remove(headL); }
    headL.intensity = on ? 55 * L.headlight : 0;
  }
  if (headGlow) headGlow.visible = on;
  if (brakeLights) brakeLights.nacht = L.lights;
  if (cockpit) cockpit.envK = L.cockpit;
  nachtAufbauen();
  if (env.nacht) { env.nacht.glow.visible = on; env.nacht.kette.visible = on && L.ketten > 0; if (env.nacht.lat) env.nacht.lat.visible = on; }
  if (env.birds) env.birds.visible = L.id !== 'nacht';
  schattenNeu();
}
function setZeit(v) {
  store.settings.zeit = parseZeit(v) || 'auto'; store.save(); URL_ZEIT = null;
  wendeWetter();
  if (mode === 'menu') ui.showMenu(env);
}
function setWetter(v) {
  store.settings.wetter = parseWetter(v) || 'auto'; store.save(); URL_WETTER = null;
  wendeWetter();
  if (mode === 'menu') ui.showMenu(env);
}
// zufällige Landschaft, möglichst eine andere als die gerade sichtbare
function pickRandomThema(rnd = Math.random) {
  const ids = THEME_IDS.filter((id) => id !== (env && env.theme));
  return ids[Math.floor(rnd() * ids.length) % ids.length] || THEME_IDS[0];
}
const modeOf = (m) => (m === true ? '3d' : m === false ? 'flat' : m === '3d' || m === 'gel' || m === 'flat' ? m : store.settings.trackMode || 'gel');
async function loadGenerated(seed, diff, mode = 'flat', randomTheme = false) {
  mode = modeOf(mode);
  const gopt = (variant) => (mode === '3d' ? { d3: true, variant } : mode === 'gel' ? { gel: true, variant } : {});
  let lay = generate(seed, diff, gopt(0));
  if (randomTheme) RANDOM_THEMA = { key: lay.meta.key, id: typeof randomTheme === 'string' && THEMES[randomTheme] ? randomTheme : pickRandomThema() };
  themes.prefetch(themeOf(lay));   // Kulissen-Paket lädt, während der Autopilot prüft
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
  // Kulissen (n20): Thema laden/anwenden (Himmel, Licht, Boden), dann die Welt mit seinen Pflanzen, Bauten, Fernkulisse
  const th = await themes.use(themeOf(layout));
  env.theme = th.id;
  env.themeRandom = !!randomThemaOf(layout);
  wendeWetter();   // n32
  if (IMP && quality.tier >= 1) await IMP.vorladen(impostorArten(th.def));   // n30: fehlt der Atlas, bleiben es Karten
  if (worldGroup) { scene.remove(worldGroup); worldGroup.traverse((o) => { if (o.geometry) o.geometry.dispose(); }); worldGroup = null; }
  worldGroup = buildWorld(track, M, { world, tier: quality.tier, ideal, prof, deco: params.get('deko') !== 'aus', impostor: IMP, theme: { id: th.id, def: th.def, veg: th.veg, horizon: th.horizon, seed: layout.seed || layout.meta?.seed || 1 } });
  // Deko (n28): Vogelschwärme über der Landschaft (ein Draw-Call, Bahn im Shader)
  if (DEKO) { const b = makeBirds(track, th.id, quality.tier, layout.seed || layout.meta?.seed || 1); if (b) { worldGroup.add(b); env.birds = b; b.visible = !env.zeitLook || env.zeitLook.id !== 'nacht'; } }
  // n30: Lack-Spiegelung zeigt nur die großen Flächen (Strecke, Gelände, Wasser, Kulisse, Bäume, Tribünen, Zäune, Banner)
  if (reflex) worldGroup.traverse((o) => { if ((o.isMesh || o.isInstancedMesh) && REFLEX_OBJ.test(o.name)) o.layers.enable(REFLEX_LAYER); });
  scene.add(worldGroup);
  await placeParkedCars(track);
  bakeStaticShadow(renderer, scene, sun.userData.dir, track.bounds, quality.staticShadowSize());
  env.bakedDir = sun.userData.dir.clone(); env.worldReady = true;
  zeitAnwenden();   // n32: Nacht-Lichter dieser Welt (Abend/Nacht)
  // n30: gebackene Vertex-AO der Strecke – schrittweise in den ersten Bildern (frame), ?vao=0 = aus, ?vao=sync = sofort
  // nur auf Kino: dort ersetzt sie SSAO (spart), auf Standard kostete sie im Handy-Profil ~0,2 ms je Bild (+4 % p95) bei
  // kaum sichtbarer Wirkung – Budget „gleich oder besser“ (n30-Messung). ?vao=1 auch auf Standard/Einfach
  vaoJob = params.get('vao') === '0' || (quality.tier < 2 && params.get('vao') !== '1' && params.get('vao') !== 'sync') ? null : vaoAuftrag(worldGroup, world, { sync: params.get('vao') === 'sync' });
  vaoUniforms.sbVaoOn.value = vaoJob && vaoJob.done ? 1 : 0;   // fertig → in frame() weich einblenden statt „Plopp“
  rig.setTrackCams(track);
  lineViz.build(ideal, prof, track);
  env.buildMs = performance.now() - t0;
  try { if (renderer.compileAsync) await renderer.compileAsync(scene, camera); } catch { /* optional */ }
  if (quality.ap) quality.ap.schonen(1.5);   // n30: Shader/Texturen der neuen Strecke – erste Bilder zählen nicht
  // Vorschau: Auto an den Start
  quitShow();
  race = new Race(env, { assist: store.settings.assist, countdown: 1e9 });
  prevPose = null;
  return env;
}

function startRace(opts = {}) {
  replay = null;
  quitShow();
  if (cine) { cine = null; ui.hideCine(); }
  if (fx) fx.reset();
  const S = store.settings;
  // Fahrstil des Autopiloten auf Leicht (n25): Einstellung bzw. ?fahrstil=; Zufall für die Show-Momente je Rennen neu
  race = new Race(env, { assist: S.assist, wreck: S.wreck, autopilot: !!opts.autopilot, extras: S.extras, autoExtras: S.autoExtras, brakeHelp: S.brakeHelp, fahrstil: FAHRSTIL_URL || S.fahrstil || 'brachial', seed: opts.seed ?? ((Math.random() * 1e9) >>> 0) });
  timeScale = gameSpeed(S.assist);
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
async function newTrack(seed, diff, mode, randomTheme = false) {
  ui.loading(0.5, 'Strecke bauen …');
  await new Promise((r) => setTimeout(r, 30));
  await loadGenerated(seed, diff, modeOf(mode), randomTheme);
  ui.loading(1);
  ui.showMenu(env);
  mode = 'menu';
}
// Kulissen (n20): Einstellung „Landschaft“ ('auto' = passend oder ein Thema) – die aktuelle Strecke bekommt sofort das neue
// Thema (Welt neu, Strecke/Physik/Bestzeiten unverändert)
async function setTheme(v) {
  store.settings.theme = v; store.save(); URL_THEMA = null; RANDOM_THEMA = null;
  if (!env) return;
  ui.loading(0.5, 'Landschaft …');
  await new Promise((r) => setTimeout(r, 20));
  await loadTrack(env.layout, env.meta, { track: env.track, world: env.world, ideal: env.ideal, prof: env.prof });
  ui.loading(1);
  if (mode === 'menu') ui.showMenu(env);
}
function setAssist(k) { store.settings.assist = k; store.save(); if (race) race.setAssist(k); timeScale = gameSpeed(k); if (k === 'easy' && ghostVis) ghostVis.root.visible = false; ui.refresh(); ui.assistChanged(); }
function setPaint(c) { store.settings.paint = c; store.save(); carVis.setPaint(c); }
function toMenu() { mode = 'menu'; replay = null; quitShow(); if (cine) { cine = null; ui.hideCine(); } sound.stop(); race = new Race(env, { assist: store.settings.assist, countdown: 1e9 }); ui.showMenu(env); }
function startReplay() {
  if (!race || !race.rec.length) return;
  replay = new Replay(race.rec, env, marksOf(race));
  mode = 'replay';
  rig.mode = 'chase'; rig.init = false;
  ui.showReplay(replay);
}
// Kino-Replay (n18): Film aus der Aufzeichnung bauen (einmal je Rennen) und abspielen; danach das Ergebnis (res)
function marksOf(r) { return { cuts: r.cuts, pens: r.pens, xev: r.xev, crashes: r.crashLog, fin: r.finF != null ? { f: r.finF, time: r.finalTime } : null }; }
// Film einmal je Rennen bauen (auch bei Einstellung „aus“ – dann über „🎬 Highlights“ im Ergebnis)
function ensureFilm() {
  if (!race || !race.rec.length) return null;
  if (race.film === undefined) {
    const t0 = performance.now();
    try { race.film = buildFilm(race.rec, env, marksOf(race), { max: HL.film.max * timeScale }); } catch (e) { console.warn('Kino-Replay', e); race.film = null; }
    app.cineBuildMs = performance.now() - t0;
  }
  return race.film;
}
function startCine(res, opt = {}) {
  if (!ensureFilm()) return false;
  replay = new Replay(race.rec, env, marksOf(race));
  const t0 = performance.now();
  const cam = new CineCam(env, replay.rec, race.film, { carTop: rig.carBox ? rig.carBox.max.y : 0.75 });
  app.cineSetupMs = performance.now() - t0;
  cine = { film: race.film, player: new FilmPlayer(race.film), cam, res, cut: true, stats: { t0: performance.now(), frames: 0, slowIdx: -1 } };
  mode = 'replay';
  if (fx) fx.reset();
  ghostVis.root.visible = false;
  sound.start();
  // als Video aufnehmen (Knopf „🎥 Video“ im Ergebnis)
  if (opt.record && clipMime()) {
    try { cine.rec = new ClipRecorder(canvas, sound.stream()); } catch (e) { console.warn('Video-Aufnahme', e); ui.toast('Video-Aufnahme geht hier nicht'); }
  }
  ui.showCine(cine);
  rig.init = false; blurCut = true;
  app.cine = { running: true, clips: race.film.clips.length, duration: race.film.duration / timeScale };
  return true;
}
function endCine(skipped = false) {
  if (!cine) return;
  const c = cine, S = c.stats, sec = (performance.now() - S.t0) / 1000;
  app.cine = { ...app.cine, running: false, skipped, seconds: sec, fps: S.frames / Math.max(0.01, sec), clipsSeen: c.player.ci + 1 };
  cine = null; replay = null;
  sound.stop();
  ui.hideCine();
  if (c.rec) {
    if (skipped) { c.rec.cancel(); ui.toast('Aufnahme abgebrochen'); }
    else {
      const rec = c.rec, name = `stuntbahn-${(env.meta.key || 'strecke').replace(/[^\w-]+/g, '_')}.${rec.ext}`;
      rec.stop().then((blob) => {
        ui.lastClip = { blob, name };
        app.clip = { size: blob.size, type: blob.type, frames: rec.frames, seconds: (performance.now() - rec.t0) / 1000, w: rec.cv.width, h: rec.cv.height };
        if (ui.screen === 'result') ui.showResult(race, c.res, env);
      });
    }
  }
  // zurück zum Auslaufen hinter dem Ziel (Rennen „finished“) mit dem Ergebnis darüber – wie bisher ohne Film
  mode = 'race'; rig.init = false; prevPose = null; blurCut = true;
  ui.showResult(race, c.res, env);
}
// ---------- Zielshow (n27) ----------
// Spielsekunden seit der Ziellinie (Rennen: Simulationszeit + Rest bis zum nächsten Schritt, Replay/Film: Aufzeichnungszeit)
function showTau() {
  if (!race || race.finSim == null) return -1;
  if (mode === 'replay' && replay) return replay.t - race.finF / REC_HZ;
  return race.simTime - race.finSim + (frozen ? 0 : acc);
}
function startShow(res) {
  // Feuerwerk einmal je Zieldurchgang planen: Grafikstufe, Bestzeit, Leicht, Seed aus Strecke + Zeit (Replay/Film gleich)
  race.pyroOpt = { tier: quality.tier, best: !!res.isBest && !res.ab && !res.easy, easy: race.assistKey === 'easy', seed: `${env.meta.key || ''}|${race.finalTime.toFixed(3)}` };
  pyro.prepare(pyroGeo(env.track), race.pyroOpt);
  pyro.sndT = -1;
  show = { res, camOn: false, t0: performance.now() };
  app.show = { running: true, best: race.pyroOpt.best, tier: race.pyroOpt.tier, particles: pyro.plan.n, spin: race.spinPlan ? race.spinPlan.ph : null };
  if (window.__noShow || params.get('show') === '0') { endShow(true, true); return; }
  ui.showShow(race, res);
}
// je Bild (nach den Physikschritten): Kamera-Schnitt, Ende
function showTick() {
  const tau = showTau();
  if (!show.camOn && tau >= ZIEL.cut) {
    show.cc = show.cc || new CineCam(env, race.rec, { clips: [] }, { carTop: rig.carBox ? rig.carBox.max.y : 0.75 });
    const t0 = race.finF / REC_HZ + tau;
    show.shot = { cam: 'arch', t0, t1: race.finF / REC_HZ + ZIEL.end, ci: 0 };
    show.shot.setup = show.cc.setupArch();
    show.camOn = true; show.cut = true; blurCut = true;
    app.show.cam = { pos: show.shot.setup.pos, vis: show.shot.setup.vis, fallback: !!show.shot.setup.fallback };
  }
  if (tau >= ZIEL.end) endShow(false);
}
function showCamera(rdt, pose) {
  const tau = showTau(), t = race.finF / REC_HZ + tau;
  pose.speed = race.car.fwdSpeed();
  const O = show.cc.update(rdt * timeScale, t, pose, show.shot, null, camera.aspect, show.cut);
  show.cut = false;
  clearLens(camera);
  camera.position.set(O.pos[0], O.pos[1], O.pos[2]);
  camera.up.set(O.up[0], O.up[1], O.up[2]);
  camera.lookAt(O.look[0], O.look[1], O.look[2]);
  if (Math.abs(camera.fov - O.fov) > 0.01) { camera.fov = O.fov; camera.updateProjectionMatrix(); }
  rig.view = 'cine';
}
// Ende der Zielshow (abgelaufen oder Tipp): Auslaufen fertig aufzeichnen (übersprungen → sofort vorrechnen), dann Film
// bzw. Ergebnis wie bisher
function endShow(skipped = false, quiet = false) {
  if (!show) return;
  const res = show.res;
  app.show = { ...app.show, running: false, skipped, seconds: (performance.now() - show.t0) / 1000 };
  show = null;
  if (!quiet) ui.hideShow();
  const zero = { steer: 0, throttle: 0, brake: 0 };
  for (let k = 0; race.state === 'finished' && race.finT < ZIEL.rec && k < 2000; k++) race.step(DT, zero);
  race.events.length = 0;
  rig.init = false; prevPose = null; blurCut = true;
  ensureFilm();
  if (cineWanted() && startCine(res)) return;
  ui.showResult(race, res, env);
}
function quitShow() { if (show) { show = null; ui.hideShow(); } if (pyro) pyro.hide(); }
// Feuerwerk je Bild: Zeit setzen, Ton auslösen, Funken am Auto; liefert den Lichtblitz für den Kino-Look
function pyroTick(rdt, pose) {
  if (!pyro || !pyro.plan || !race || race.finSim == null || mode === 'menu') { if (pyro) pyro.hide(); return null; }
  const tau = showTau(), F = pyro.set(tau);
  if (tau >= 0 && tau < pyro.plan.end + 0.2) {
    // Ton (nur wenn an): Raketen, Knall, Knistern, Fontänen – leiser mit dem Abstand zur Kamera; in der Zeitlupe tiefer
    const rate = cine ? 0.55 + 0.45 * cine.player.speed : replay ? replay.speedMul : 1;
    for (const ev of pyro.due(pyro.sndT ?? -1, tau)) {
      const p = ev.p || pyro.geo.p, d = Math.hypot(p[0] - camera.position.x, p[1] - camera.position.y, p[2] - camera.position.z);
      sound.pyro(ev, Math.max(0.15, Math.min(1, 40 / Math.max(10, d))), rate);
    }
    pyro.sndT = tau;
    // Schweif-Funken am Auto (erste Sekunden hinter der Linie)
    const gdt = frozen || (replay && replay.paused) ? 0 : rdt * timeScale * (cine ? cine.player.speed : replay ? replay.speedMul : 1);
    if (fx && pose && tau < 1.6 && gdt > 0) fx.trail(gdt, pose, mode === 'replay' && replay ? replay.speed() : race.car.fwdSpeed(), 1 - tau / 1.6);
  } else pyro.sndT = tau;
  return F.k > 0.002 ? F : null;
}

// Ton im Kino-Replay: Werte aus der Aufzeichnung, Zeitlupe → tiefer (pitch)
const cineCarObj = { rpm: 0, gear: 1, boost: 0, input: { throttle: 0 }, wheels: [0, 1, 2, 3].map(() => ({ contact: true, slip: 0 })), onGround: 4, v: { y: 0 }, scrape: 0, _sp: 0, speed() { return this._sp; } };
function cineSound(rdt) {
  const P = cine.player, k = P.speed, pitch = 0.5 + 0.5 * k, ph = replay.phys(), C = cineCarObj;
  const sp = Math.abs(replay.speed()), last = C._last ?? sp;
  C.input.throttle = sp > last + 0.01 || sp > 40 ? 1 : 0.2; C._last = sp;
  C.rpm = replay.rpm() * (sound.nodes && sound.nodes.rec ? 1 : pitch); C.gear = replay.gear(); C.boost = replay.nitro(); C._sp = sp * pitch;
  let on = 0; ph.wheels.forEach((w, i) => { C.wheels[i].contact = w.comp > 0; on += w.comp > 0; });
  // Reifenquietschen im Drift (n25): Rutschen der Hinterräder aus dem aufgezeichneten Schwimmwinkel
  const sl = Math.tan(Math.min(1.3, Math.abs(replay.slip())));
  C.wheels[2].slip = C.wheels[3].slip = sl; C.wheels[0].slip = C.wheels[1].slip = sl * 0.3;
  C.onGround = on;
  const y = replay.pose().pos.y; C.v.y = rdt > 0 && C._y != null && !P.cut ? (y - C._y) / Math.max(1e-3, rdt * timeScale * k) : 0; C._y = y;
  sound.update(C, rdt, 'running', { pitch });
  // Stinger beim Eintritt in die Zeitlupe
  if (P.clip && P.ci !== cine.stats.slowIdx && P.t >= P.clip.c0 - 0.2 && P.clip.smin < 0.5) { cine.stats.slowIdx = P.ci; sound.stinger(); }
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
let cpuLast = null;   // n30: CPU-Arbeitszeit des letzten Bildes (Qualitäts-Autopilot)
let vaoJob = null;    // n30: Vertex-AO der aktuellen Strecke (gfx/world.js vaoAuftrag), rechnet je Bild ein Stück
function frame(now) {
  requestAnimationFrame(frame);
  const tA = performance.now();
  const rdt = Math.min(0.1, (now - last) / 1000);
  last = now;
  app.frames++;
  if (innerWidth !== sizeW || innerHeight !== sizeH) resize();   // Drehen ohne (rechtzeitiges) resize-Ereignis
  quality.sample(rdt, () => resize(), cpuLast);
  // Mittel (n23): Touch-Pfeile mit tempoabhängiger Rampe (input.js rampSteer)
  input.touchRamp = !!(race && race.assist && race.assist.touchRamp); input.speedHint = race ? Math.abs(race.car.fwdSpeed()) : 0;
  const inp = input.update(rdt);
  // Kino-Replay: Esc, Enter oder Leertaste überspringt (Tipp: #cine in ui.js)
  if (cine && (input.consume('Escape') | input.consume('Enter') | input.consume('Space'))) endCine(true);
  if (show && showTau() >= ZIEL.tap && (input.consume('Escape') | input.consume('Enter') | input.consume('Space'))) endShow(true);
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
    if (show) showTick();
  } else if (mode === 'replay' && replay && cine) {
    // Kino-Replay: Film-Uhr mit Zeitlupe; Schnitt (neuer Clip/neue Kamera) ohne Unschärfe-Verschmieren
    cine.player.advance(rdt * timeScale);
    replay.t = cine.player.t;
    if (cine.player.cut) { cine.cut = true; blurCut = true; ui.gmeterCut(); }
    if (cine.player.done) endCine(false);
  } else if (mode === 'replay' && replay) {
    replay.advance(rdt * timeScale);
    if (replay.jumped) { replay.jumped = false; rig.init = false; blurCut = true; ui.gmeterCut(); } // Schnitt: Kamera neu ansetzen statt schwenken
  }
  // Test-Haken (tests/test_autopilot.py): künstliche Arbeit je Bild in ms – zählt in die CPU-Zeit wie echte Spiellast
  if (app.testLast > 0) { const tE = performance.now() + app.testLast; while (performance.now() < tE); }
  // GPU-Zeit nur messen, wenn der Autopilot regelt (feste Nutzerwahl: keine Abfragen, kostet sonst je Bild)
  const gpuMess = quality.gpu && (!quality.forced || GPU_MESS);
  if (gpuMess) quality.gpu.anfang();
  render(rdt);
  if (gpuMess) quality.gpu.ende();
  cpuLast = performance.now() - tA;
  // n30: Vertex-AO nach dem Zeichnen und außerhalb der Autopilot-Messung, nur mit Luft im Bild (Menü bis 8 ms, sonst bis
  // 3 ms); fertig → über 1,5 s einblenden
  if (vaoJob && !vaoJob.done && vaoJob.step(mode === 'menu' ? Math.max(1, Math.min(8, 14 - cpuLast)) : Math.max(0.5, Math.min(3, 12 - cpuLast)))) app.vao = vaoJob.stats;
  if (vaoJob && vaoJob.done && vaoUniforms.sbVaoOn.value < 1) vaoUniforms.sbVaoOn.value = Math.min(1, vaoUniforms.sbVaoOn.value + rdt / 1.5);
}

function handleEvents() {
  for (const e of race.events) {
    ui.event(e, race);
    sound.event(e);
    // Auto versetzt (Reset/Überspringen/Rückspulen): Kamera neu ansetzen, keine Zwischenbild-Interpolation
    if (e.type === 'reset' || e.type === 'skip' || e.type === 'rewind') { rig.init = false; prevPose = null; blurCut = true; }
    if (e.type === 'finish') {
      const res = store.submit(env.meta.key, race.assistKey, race.wreckOn, race.finalTime, race.assistKey === 'easy' ? null : race.ghostRec(), { ...env.meta, penalties: race.penalties, extras: race.extrasOn, nitro: race.nitroLog });
      ui.lastRace = race; ui.lastRes = res;
      startShow(res);
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
// Tacho-Zeiger als Show-Tacho (n24, core/showspeed.js); Skala 0–600 bleibt, ab 250 km/h echt
function cockpitValues() {
  if (mode === 'replay' && replay) return { kmh: Math.abs(showKmhMs(replay.speed())), rpm: replay.rpm(), gear: replay.gear(), steer: replay.phys().wheels[0].steer };
  const c = race.car;
  return { kmh: Math.abs(showKmhMs(c.fwdSpeed())), rpm: c.rpm, gear: displayGear(c.fwdSpeed(), c.gear), steer: c.steerAng };
}

const cpCover = { v: null };
// G-Kräfte live (n24): dieselbe Rechnung wie im Replay (core/gforce.js) auf der Aufzeichnung des Rennens – neue Bilder
// nachführen, an Schnitten (Reset, Rückspulen mit Uhr) und beim Zurückspulen neu ansetzen; Spitze je Rennen
const gLive = { m: new GMeter(), race: null, fed: 0, cut: 0 };
function gLiveSync() {
  const G = gLive, F = race.recFrames();
  if (G.race !== race) { G.race = race; G.m.reset(); G.m.resetPeak(); G.fed = 0; G.cut = 0; }
  if (F < G.fed) { G.m.reset(); G.fed = F; G.cut = race.cuts.filter((c) => c.f <= F).length; ui.gmeterCut(); }
  for (; G.fed < F; G.fed++) {
    let cut = false;
    while (G.cut < race.cuts.length && race.cuts[G.cut].f <= G.fed) { if (race.cuts[G.cut].f === G.fed) cut = true; G.cut++; }
    if (cut) { G.m.reset(); ui.gmeterCut(); }
    G.m.push(race.rec, G.fed);
  }
}
// G-Meter im Cockpit: rundes Display auf der Instrumentenhutze – „full“ über der Schaltkulisse zwischen den
// Rundinstrumenten, „compact“ zwischen den Rundinstrumenten über dem Gang-Schild; „hud“: keine Hutze → Zahl im HUD
function cockpitGSpot(px) {
  if (!px || !px.gd || px.mode === 'hud') return null;
  const x = innerWidth / 2;
  return px.mode === 'full' ? { x, y: px.yc - 0.34 * px.gd, d: Math.round(0.5 * px.gd) } : { x, y: px.yc - 0.47 * px.gd, d: Math.round(0.34 * px.gd) };
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
// Kulissen (n20): Zuschauer jubeln, wenn in ihrer Nähe ein Stunt läuft (Sprung, Looping, Röhre) oder das Auto ins Ziel
// kommt – Rennen, Replay und Kino-Replay. Ort = Auto, Stärke steigt schnell (0,25 s) und klingt langsam ab (3 s).
const cheer = { idx: 0, k: 0 };
// n32 Kulissen: Pyro an Stunts – beim Einsetzen des Jubels (Sprung, Looping, Röhre) feuern die Abschussrohre der Planung
// (track/kulisse2.js, inst.pyro) im Umkreis von 140 m 0,8 s lang Funkenfontänen (v 0) bzw. Rauch (v 1). Nutzt die Funken/
// Partikel von fx (kein neuer Draw-Call); nur ab Standard (fx.rich). TODO n32-Heavy: Menge/Höhe am Bild abstimmen.
const stuntPyroState = { was: 0, t: 0, sites: [] };
function stuntPyro(pose, rdt) {
  const S = stuntPyroState, w = decoUniforms.uCheer.value.w, dt = Math.min(0.1, rdt || 0);
  const P = env && env.track.decoPlan && env.track.decoPlan.inst.pyro;
  if (!P || !P.length || !fx || !fx.rich || !pose || frozen) { S.was = w; return; }
  if (w > 0.5 && S.was <= 0.5 && S.t <= -4) {
    const d2 = (p) => (p.x - pose.pos.x) ** 2 + (p.z - pose.pos.z) ** 2;
    S.sites = P.filter((p) => d2(p) < 140 * 140).sort((a, b) => d2(a) - d2(b)).slice(0, 6);   // Funken-Vorrat (160) reicht für 6
    S.t = S.sites.length ? 0.8 : S.t;
  }
  S.was = w;
  if (S.t > 0) {
    for (const p of S.sites) {
      const y = env.track.terrain.height(p.x, p.z);
      if (p.v === 0) for (let k = 0; k < 2; k++) fx.sparks.spawn(p.x, y + 0.6, p.z, (Math.random() - 0.5) * 2.5, 9 + Math.random() * 5, (Math.random() - 0.5) * 2.5, 0.7 + Math.random() * 0.5, y + 0.1);
      else if (Math.random() < 0.5) fx.parts.spawn(fx.p.set(p.x, y + 0.7, p.z), fx.v.set((Math.random() - 0.5) * 1.5, 2.5 + Math.random() * 1.5, (Math.random() - 0.5) * 1.5), 0.8, 4.5, 2.2, Math.random() < 0.5 ? 0xd84315 : 0xeeeeee, 0.55);
    }
  }
  S.t -= dt;
}
function updateCheer(pose, rdt) {
  const U = decoUniforms.uCheer.value;
  let on = false;
  if (pose && env && (mode === 'race' || mode === 'replay')) {
    const L = env.track.line, x = pose.pos.x, z = pose.pos.z;
    let i = cheer.idx < L.n ? cheer.idx : 0, best = (L.px[i] - x) ** 2 + (L.pz[i] - z) ** 2;
    for (let k = -40; k <= 40; k++) { const j = (i + k + L.n) % L.n, d = (L.px[j] - x) ** 2 + (L.pz[j] - z) ** 2; if (d < best) { best = d; cheer.idx = j; } }
    if (best > 900) { for (let j = 0; j < L.n; j += 3) { const d = (L.px[j] - x) ** 2 + (L.pz[j] - z) ** 2; if (d < best) { best = d; cheer.idx = j; } } }
    const j = cheer.idx;
    on = !!(L.loop[j] || L.tube[j] || L.air[j] || pose.air) || (mode === 'race' && race && race.state === 'finished');
    if (on) U.set(x, z, 190, U.w);
  }
  const dt = Math.min(0.1, rdt || 0.016);
  U.w = on ? Math.min(1, U.w + dt * 4) : Math.max(0, U.w - dt / 3);
}
function render(rdt) {
  let pose = null;
  decoUniforms.uTime.value = shadowUniforms.sbTime.value = app.fixTime ?? performance.now() / 1000;   // Wind im Gras, Wolkenschatten, Wellen (Tests: feste Zeit)
  shadowUniforms.sbKino.value = kino && kino.pipeline ? kino.level : 0;   // Fahrbahn-Details des Kino-Looks
  shadowUniforms.sbCloudOn.value = quality.tier > 0 && !quality.decoLite && params.get('wolken') !== '0' ? 1 : 0;
  // Automatik „Deko sparsam“: Gras/Blumen und Büsche ausblenden (Welt nicht neu bauen)
  if (worldGroup && worldGroup.userData.lite !== !!quality.decoLite) {
    worldGroup.userData.lite = !!quality.decoLite;
    for (const m of worldGroup.children) if (m.name === 'deco-grass' || m.name === 'deco-bushes') m.visible = !quality.decoLite;
  }
  // n28: Wiesenblumen/-flecken nicht auf „Einfach“ und nicht bei „Deko sparsam“ (Budget der niedrigsten Stufe)
  themeUniforms.tDekoK.value = quality.tier === 0 || quality.decoLite ? 0 : 1;
  // n32: Wetter-Aussehen hängt an der Grafikstufe (Gischt, Pfützen-Spiegelung, Scheibe ab Standard) → bei Wechsel neu
  if (env && env.theme && env.wetterTier !== quality.tier) wendeWetter();
  // n28: Luft-Teilchen passend zu Thema und Grafikstufe; Automatik „Deko sparsam“ nimmt sie mit weg
  // n32: Regen/Schnee-Wetter ersetzt die Luft des Themas; bei „Deko sparsam“ halbiert statt aus (Regen bleibt sichtbar)
  if (air && env) {
    const wA = env.wetter && env.wetter !== 'klar' ? env.wetter : null, lite = !!quality.decoLite;
    if (air.theme !== env.theme || air.tier !== quality.tier || air.wReq !== wA || (wA && air.lite !== lite)) { air.set(env.theme, quality.tier, sun.userData.dir, wA, lite); air.wReq = wA; }
    air.mesh.visible = (!quality.decoLite || !!air.wetter) && air.mesh.geometry.instanceCount > 0;
    if (air.wetter === 'regen') {
      // Regenstreifen: Kamera-Geschwindigkeit (Strich relativ zur Kamera), bei Kameraschnitten 0
      const cp = camera.position, V = air.u.uCamVel.value;
      if (air.lastCam && rdt > 0 && !blurCut) V.subVectors(cp, air.lastCam).divideScalar(Math.max(rdt, 1 / 240)).clampLength(0, 120); else V.set(0, 0, 0);
      (air.lastCam || (air.lastCam = cp.clone())).copy(cp);
    }
    if (air.mesh.visible) {
      const cp = camera.position;
      if (app.frames % 8 === 0 || air.covered == null) air.covered = !!env.world.rayTrack(cp.x, cp.y + 0.5, cp.z, 0, 1, 0, 40, false);
      air.shelter(air.covered, Math.min(0.1, rdt || 0.016));
    }
  }
  renderer.info.reset();
  let boost = 0;
  if (mode === 'replay' && replay) {
    pose = replay.pose();
    const ph = replay.phys();
    pose.wheels = ph.wheels;
    pose.vel = replay.vel();
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
    pose.vel = c.v;
    carVis.sync(c, 1, pose);
  }
  updateCheer(pose, rdt);
  stuntPyro(pose, rdt);   // n32
  // n28: Bremslichter – Pedal (Rennen) bzw. Verzögerung aus dem Tempo (Autopilot, Replay, Film)
  if (brakeLights) {
    let b = 0;
    const v = mode === 'replay' && replay ? Math.abs(replay.speed()) : race ? race.car.speed() : 0;
    if (mode === 'race' && race && race.car.input) b = race.car.input.brake > 0.2 && v > 1 ? 1 : 0;
    if (brakeV != null && rdt > 0 && mode !== 'menu') { const dec = (brakeV - v) / rdt; if (dec > 5 && v > 2) b = Math.max(b, Math.min(1, (dec - 5) / 8)); }
    brakeV = frozen || (replay && replay.paused) ? brakeV : v;
    brakeLights.set(b, frozen ? 0 : rdt);
  }
  kulisseTick(decoUniforms.uTime.value);
  // n32 Tageszeit: Leuchtpunkte (Zeit, Auto für Reflektoren im Scheinwerferlicht, Lichterketten aus bei „Deko sparsam“)
  if (env && env.zeitLook && env.zeitLook.lights > 0) {
    glowUniforms.uTime.value = decoUniforms.uTime.value;
    const R = carVis.root; R.updateMatrixWorld();
    glowUniforms.uCar.value.setFromMatrixPosition(R.matrixWorld); glowUniforms.uCarF.value.set(0, 0, -1).transformDirection(R.matrixWorld);
    glowUniforms.uKetten.value = quality.decoLite ? 0 : env.zeitLook.ketten;
  }
  kulisse2Tick(camera);   // n32: 3D-Zuschauer in Sichtweite vorauswählen
  // n32: Startampel (rot 1 … 5 im Countdown, dann kurz grün; im Menü aus)
  { const [on, go] = mode === 'race' && race ? ampelAus(race.state, race.countdown, race.time) : [0, 0]; kulisse2Uniforms.uAmpel.value.set(on, go); }
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
    rig.speedLook = mode === 'race' && race && race.assistKey === 'medium' && !race.autopilotOnly ? 1 : 0;   // Mittel (n23): weiter voraus
    rig.driftCam = mode === 'replay' || (mode === 'race' && race && race.brachial);   // n25: Drift-Kamera (Leicht Brachial, Replays)
    if (cine) cineCamera(rdt, pose);
    else if (show && show.camOn && !app.freezeCam) showCamera(rdt, pose);
    else if (!frozen || !app.freezeCam) rig.update(rdt, pose, crashed, env && env.world, sp);
    // Sonne mit Schattenkamera folgt dem Auto
    sun.target.position.set(pose.pos.x, pose.pos.y, pose.pos.z);
    sun.position.copy(sun.target.position).addScaledVector(sun.userData.dir, 60);
    sun.target.updateMatrixWorld();
  }
  if (carVis.contact && kino && !kino.stages.contact) carVis.contact.visible = false;   // ?kl=-contact
  carVis.setNitro(boost, frozen || (replay && replay.paused) ? 0 : rdt);
  // Grafik „Einfach“ (keine Bewegungsunschärfe): dezente Tempo-Streifen am Rand ab ~260 km/h
  const lineSpd = mode === 'race' && race && !frozen && quality.tier === 0 && (store.settings.blur || 'light') !== 'off' ? race.car.speed() * 3.6 : 0;
  ui.boost(mode === 'menu' ? 0 : boost, Math.max(0, Math.min(1, (lineSpd - 260) / 240)) * 0.55);
  if (ghost && ghostVis.root.visible && mode === 'race') { ghost.sync(ghostVis); ghostVis.setNitro(ghost.nitro(), frozen ? 0 : rdt); }
  if (fx) fx.rich = !!(kino && kino.pipeline);
  if (fx && mode === 'race' && !frozen) fx.update(rdt, camera);
  // Replay/Kino-Replay (n25): Reifenqualm aus dem aufgezeichneten Schwimmwinkel
  if (fx && mode === 'replay' && replay && pose) {
    const rt = replay.paused ? 0 : rdt * timeScale * (cine ? cine.player.speed : replay.speedMul);
    // n27: Landung im Replay/Film → Staub und Funken (in der Zeitlupe kräftiger)
    const air = !!pose.air;
    if (fx.repAir && !air && rt > 0 && (fx.repAirT || 0) > 0.3) fx.replayLand(pose, Math.min(1, fx.repAirT / 1.5), cine ? 1 / Math.max(0.25, cine.player.speed) : 1);
    fx.repAirT = air ? (fx.repAirT || 0) + rt : 0; fx.repAir = air;
    fx.replayStep(rt, pose, replay.slip(), replay.speed());
    fx.update(replay.paused ? 0 : rdt * (cine ? cine.player.speed : replay.speedMul), camera);
  }
  if (lineViz) lineViz.update(camera, race, store.settings.assist, mode, store.settings.line);
  // n32: abends/nachts leuchtet die Ideallinie stärker (Lesbarkeit)
  if (lineViz && lineViz.mat && LINE_LEVELS[store.settings.line] && LINE_LEVELS[store.settings.line].opacity) lineViz.mat.uniforms.uOpacity.value = Math.min(0.9, LINE_LEVELS[store.settings.line].opacity * (1 + (env && env.zeitLook ? env.zeitLook.line : 0)));
  sky.position.copy(camera.position);
  if (mode === 'race' && race) { ui.hud(race, env, ghost); sound.update(race.car, rdt, race.state, { cockpit: rig.view === 'cockpit' }); }
  if (mode === 'replay' && replay && cine) { ui.cineHud(cine); cineSound(rdt); cine.stats.frames++; }
  else if (mode === 'replay' && replay) ui.replayHud(replay);
  // Cockpit: Außenkarosserie ausblenden (ragt sonst ins Bild), Innenraum im zweiten Durchgang darüber
  const inCockpit = mode !== 'menu' && !!pose && rig.view === 'cockpit';
  carVis.root.visible = !inCockpit;
  const camTag = mode === 'menu' ? 'menu' : rig.view;
  if (document.body.dataset.cam !== camTag) document.body.dataset.cam = camTag;
  // Bewegungsunschärfe: nur im laufenden Rennen/Replay (nicht Menü, Pause, Replay-Standbild, Test-Standbild)
  const running = !frozen && !app.freezeCam && ((mode === 'race' && race && race.state !== 'countdown') || (mode === 'replay' && replay && !replay.paused));
  const spd = !pose ? 0 : mode === 'replay' && replay ? Math.abs(replay.speed()) : race ? race.car.speed() : 0;
  if (inCockpit) {
    cockpit.layout({ ...cockpitZone(), vfov: camera.fov });
    const cv = cockpitValues();
    // n27: Tunnel/Brücke über dem Auto (Strahl nach oben, alle 5 Bilder) → Innenraum dunkler, Tunnellichter
    if (app.frames % 5 === 0 || cpCover.v == null) cpCover.v = env && env.world.rayTrack(pose.pos.x, pose.pos.y + 1.2, pose.pos.z, 0, 1, 0, 35, false) ? 1 : 0;
    cockpit.tier = quality.tier;
    cockpit.update(frozen ? 0 : rdt * (mode === 'replay' && replay ? replay.speedMul * (replay.paused ? 0 : 1) : 1), cv, camera, sun.userData.dir, { cover: cpCover.v, speed: spd, head: rig.head });
    if (!frozen && !(replay && replay.paused)) cockpit.renderMirror(renderer, scene, camera);
    ui.cockpitMode(cockpit.gaugePx, cv.gear);
  }
  // G-Kräfte (n24): Cockpit-Display, Replay-/Kino-Einblendung (mit km/h), sonst dezente Zahl im HUD
  if (G_ON) {
    let gs = null, gk = null, gw = null;
    if (mode === 'replay' && replay && pose) { gs = replay.gState(); gk = Math.abs(showKmhMs(replay.speed())); }
    else if (mode === 'race' && race && pose) { gLiveSync(); gs = gLive.m.state(); }
    if (gs) gw = inCockpit ? cockpitGSpot(cockpit.gaugePx) : mode === 'replay' ? ui.gmeterSpot(cine ? 'cine' : 'replay') : null;
    rig.gHead = gs ? { lon: gs.lon, lat: gs.lat } : null;   // n27: Kopfnicken im Cockpit (nächstes Bild)
    ui.gmeter(gw, gs, gk, frozen || (replay && replay.paused) ? 0 : rdt);
    ui.hudG(mode === 'race' && gs && !gw ? gs.g : null);
  } else ui.gmeter(null);
  // Kino-Replay: Tiefenschärfe auf das Auto, Unschärfe in der Zeitlupe etwas länger belichtet (Wischer bleiben sichtbar)
  const cdof = cine && cine.cam.out ? { focus: cine.cam.out.focus, k: cine.cam.out.dof * (cine.player.speed < 0.6 ? 1 : 0.8) } : null;
  // n27 Kino-Replay-Effekte: Weißblitz (Übergang „flash“, Freeze-Frame), Reißschwenk-Unschärfe, Zuschauer im Vordergrund
  const cfx = cine ? cineFx(rdt) : null;
  const shutter = cine ? Math.min(2.5, 1 / Math.pow(Math.max(0.2, cine.player.speed), 0.6)) : 1;
  const flash = pyroTick(rdt, pose);
  drawFrame({ run: running, speed: spd, boost, dt: rdt, cut: blurCut, cockpit: inCockpit, heat: !inCockpit && pose && mode !== 'menu' ? heatOf(spd, boost) : null, dof: cdof, shutter, flash, white: cfx ? cfx.white : 0, whip: cfx ? cfx.whip : null, flareK: (cine ? 1.5 : 1) * (env && env.zeitLook ? env.zeitLook.flare : 1) });
  // Video-Aufnahme: Bild direkt nach dem Zeichnen kopieren (Balken wie im CSS: 2,39:1, mindestens 8,5 %)
  if (cine && cine.rec) { const W = innerWidth, H = innerHeight; cine.rec.frame(H > W ? 0 : Math.max(0.085, (H - W / 2.39) / 2 / H), ui.capState()); }
  blurCut = false;
}

// Kino-Replay-Effekte je Bild (n27): Weißblitz am Clip-Anfang (Übergang „flash“) und beim Freeze-Frame (Rekord-Stunt),
// Reißschwenk-Unschärfe aus der Kamera, Zuschauer-Silhouetten bei der Fan-Cam (ui.js, auch im Video)
function cineFx(rdt) {
  const P = cine.player, c = P.clip;
  if (cine.fxCi !== P.ci) { cine.fxCi = P.ci; cine.sinceClip = 0; } else cine.sinceClip = (cine.sinceClip || 0) + rdt;
  let white = 0;
  if (c && c.trans === 'flash') white = Math.max(white, 0.9 * Math.max(0, 1 - cine.sinceClip / 0.28) ** 2);
  if (P.hold > 0 || (P.holdT > 0 && P.holdT < 0.3 && P.frozeCi === P.ci)) white = Math.max(white, 0.8 * Math.max(0, 1 - P.holdT / 0.22) ** 2);
  app.cineFx = { white: +white.toFixed(3), whip: cine.whip ? +cine.whip.len.toFixed(3) : 0, fan: cine.fan, freeze: P.hold > 0, trans: c ? c.trans : null };
  ui.cineFx(white, cine.fan, !(kino && kino.pipeline));
  return { white: kino && kino.pipeline ? white : 0, whip: cine.whip };
}

// Kino-Replay: Kamera des Films (game/cinecam.js, reine Rechnung) auf die three.js-Kamera übertragen
function cineCamera(rdt, pose) {
  const P = cine.player;
  pose.speed = replay.speed();
  if (cine.force && cine.force.ci !== P.ci) cine.force = null;
  const O = cine.cam.update(rdt, P.t, pose, cine.force || P.shot, P.clip, camera.aspect, cine.cut);
  cine.cut = false;
  cine.whip = O.whip; cine.fan = !!O.fan;
  clearLens(camera);
  camera.position.set(O.pos[0], O.pos[1], O.pos[2]);
  camera.up.set(O.up[0], O.up[1], O.up[2]);
  camera.lookAt(O.look[0], O.look[1], O.look[2]);
  if (Math.abs(camera.fov - O.fov) > 0.01) { camera.fov = O.fov; camera.updateProjectionMatrix(); }
  rig.view = 'cine';
}

// n30 Lack-Spiegelung: Auto und Geist nicht in die eigene Spiegelung; aussetzen, wenn das Auto nicht zu sehen oder weit weg
// ist (Fern-LOD) – und solange die Schattenkarte des Autos fehlt (erstes Bild, nach Stufen-/Größenwechsel neu angelegt),
// sonst bindet three.js eine leere Textur an den Schatten-Sampler (GL_INVALID_OPERATION)
// Himmel in der Spiegelung REFLEX_SKY-fach heller: das Himmelsbild (8 bit, ≤ 1) ersetzt im Lack die HDR-Umgebung (bis 4),
// sonst wirkt das Auto mit Spiegelung dunkler als ohne (n30-Abnahme); ?reflexhimmel= zum Abstimmen
const REFLEX_SKY = +(params.get('reflexhimmel') || 3);
const skyHell = () => { sky.material.uniforms.exposure.value = REFLEX_SKY; }, skyNormal = () => { sky.material.uniforms.exposure.value = 1; };
function reflexOpts() {
  // kopfüber (Looping, Korkenzieher): die Würfelkamera 0,9 m über der Automitte säße in bzw. hinter der Fahrbahn → nicht
  // neu zeichnen, der letzte Würfel bleibt (spart dort auch die Seite)
  const kopf = carVis.root.matrixWorld.elements[5] < 0.4;   // y-Anteil der Auto-Hochachse (gilt auch im Replay/Film)
  return { hide: [carVis.root, ghostVis.root], skip: !carVis.root.visible || carVis.lod >= 2 || kopf || (sun.castShadow && !sun.shadow.map), vor: skyHell, nach: skyNormal };
}
// Vorwärmen im Ladebildschirm: ein Bild (legt die Schattenkarte an), eine volle Würfelrunde, noch ein Bild (Vorfiltern) –
// so werden die Shader der Spiegel-Ansicht beim Laden übersetzt statt als Hänger im ersten Menübild
function reflexVorwaermen() {
  if (!reflex || quality.tier < REFLEX_MIN) return;
  render(1 / 60);
  for (let i = 0; i < 6; i++) reflex.update(carVis.root, reflexOpts());
  render(1 / 60);
}

// Bild zeichnen: Kino-Look (eine Pipeline: Szene, Unschärfe, Licht/Farbe, Cockpit darüber) bzw. ?look=alt wie bis n22
function drawFrame(o) {
  // n32 Nacht: Spiegel-Lichter mit der endgültigen Kamera dieses Bilds (Blickraum); nur bei Nässe, ab Standard (Kino 8, Standard 4)
  if (env && env.nacht && env.zeitLook && env.zeitLook.lights > 0) reflNaechste(env.wetterLook && env.wetterLook.wet > 0 ? env.nacht.refl : null, camera, SPIEGEL ?? (quality.decoLite ? 0 : quality.tier >= 2 ? 4 : quality.tier >= 1 ? 2 : 0));
  // n30: Auto-LOD nach Entfernung/Bildwinkel (Geist mindestens Mittel: durchscheinend, Feinheiten sieht man nicht)
  carVis.updateLod(camera, app.lodForce != null ? { force: app.lodForce } : undefined);
  if (ghostVis.root.visible) ghostVis.updateLod(camera, { min: 1 });
  // n30: Lack-Spiegelung – eine Würfelseite je Bild; ausgelassen, wenn das Auto nicht zu sehen oder weit weg ist (Fern-LOD)
  // (hier statt in render(), damit auch drawOnce der Mess-Skripte sie mitzählt)
  if (reflex) {
    reflex.setEnabled(quality.tier >= REFLEX_MIN && !reflexOff);
    reflex.update(carVis.root, reflexOpts());
  }
  post.setting = params.get('blur') || store.settings.blur || 'light';
  post.tier = quality.tier;
  // n32: Regentropfen auf der Scheibe (Cockpit) bzw. Linse (Stoßstange) – vor dem Cockpit, damit das Armaturenbrett davor liegt
  const glass = scheibe && env && env.wetterLook && env.wetterLook.glass > 0 && mode !== 'menu' && (o.cockpit || rig.view === 'bumper') ? env.wetterLook.glass : 0;
  const overlay = o.cockpit || glass ? (r) => {
    if (glass) scheibe.render(r, { k: glass, speed: o.speed, dt: o.dt, lens: !o.cockpit, covered: !!(air && air.covered) });
    if (o.cockpit) cockpit.render(r);
  } : null;
  if (kino) {
    kino.setLevel(LOOK_FIX ?? quality.tier);
    kino.render(scene, camera, { run: o.run, speed: o.speed, boost: o.boost, car: carVis.root, ghost: ghostVis.root, dt: o.dt, cut: o.cut, sunDir: sun.userData.dir, heat: o.heat, overlay, time: app.fixTime, dof: o.dof, shutter: o.shutter, flash: o.flash, white: o.white, whip: o.whip, flareK: o.flareK });
    return;
  }
  if (!post.render(scene, camera, { run: o.run, speed: o.speed, boost: o.boost, car: carVis.root, dt: o.dt, cut: o.cut })) renderer.render(scene, camera);
  if (overlay) overlay(renderer);
}

// Hitzeflimmern hinter den Endrohren (Kino): stark im Stand/beim Anfahren mit Gas und mit Nitro, bei Tempo weht es weg
const heatA = [new THREE.Vector3(), new THREE.Vector3()], heatB = [new THREE.Vector3(), new THREE.Vector3()];
function heatOf(speed, boost) {
  if (!kino || !kino.stages.haze || !carVis.root.visible) return null;
  const thr = mode === 'race' && race ? race.car.input.throttle || 0 : 0.3;
  const k = Math.max(boost, (0.35 + 0.65 * thr) * (1 - Math.min(1, Math.max(0, (speed - 4) / 30))));
  if (k < 0.02) return null;
  carVis.root.updateMatrixWorld();
  return EXHAUST.map(([x, y, z], i) => ({ a: carVis.root.localToWorld(heatA[i].set(x, y + 0.02, z + 0.12)), b: carVis.root.localToWorld(heatB[i].set(x * 1.3, y + 0.32, z + 1.5)), r: 0.2, k }));
}

// ---------- Debug-API ----------
window.__game = {
  get env() { return env; }, get race() { return race; }, get mode() { return mode; }, get replayObj() { return replay; }, scene, camera, renderer, rig, store, ui, quality, trkLib, sammlung,
  modeKey, worldScale: WORLD_SCALE,
  get theme() { return env && env.theme; }, themes: () => themes, setTheme: (v) => setTheme(v), THEMES, decoUniforms,
  get wetter() { return env && env.wetter; }, get wetterLook() { return env && env.wetterLook; }, setWetter: (v) => setWetter(v),   // n32
  get zeit() { return env && env.zeit; }, get zeitLook() { return env && env.zeitLook; }, setZeit: (v) => setZeit(v), get nacht() { return env && env.nacht; }, zeitUniforms, glowUniforms,
  // Import (Tests): Bytes als Array → Ergebnisliste; Strecke laden
  importBytes: (arr, name) => importFiles([new File([new Uint8Array(arr)], name || 'test.trk')]),
  loadImported: (id) => playImported(id),
  info() { const i = renderer.info; return { calls: i.render.calls, tris: i.render.triangles, geometries: i.memory.geometries, textures: i.memory.textures, programs: i.programs ? i.programs.length : 0, pixelRatio: renderer.getPixelRatio(), tier: quality.tier, fps: quality.fps,
    ap: quality.ap ? quality.ap.zustand() : null, carLod: carVis ? carVis.lod : null, ghostLod: ghostVis ? ghostVis.lod : null,
    impostor: IMP ? { atlas: !!(IMP.meta && IMP.meta.arten), arten: [...IMP.arten.keys()], fehler: IMP.fehler } : null,
    reflex: reflex ? { an: reflex.enabled, bereit: reflex.bereit, ...reflex.stats } : null,
    vao: vaoJob ? { fertig: vaoJob.done, anteil: +vaoJob.anteil.toFixed(3), ...(vaoJob.stats || {}) } : null, apLog: quality.ap ? quality.ap.log.slice(-12) : null, startProbe: app.startProbe || null, gpuZeit: quality.gpu ? quality.gpu.ok : null }; },
  state() {
    const c = race && race.car;
    return { mode, state: race && race.state, time: race && race.time, speed: c && c.speed(), pos: c && [c.pos.x, c.pos.y, c.pos.z], up: c && c.frame.u.y, cp: race && race.cpNext, cps: race && race.cps.length, lap: race && race.tracker.lap, idx: race && race.tracker.idx, n: env && env.track.line.n, crashes: race && race.crashes, rewinds: race && race.rewinds, penalties: race && race.penalties, wreck: race && race.wreckOn, crash: c && c.crash, assist: store.settings.assist, seed: env && env.meta.seed, diff: env && env.meta.diff, key: env && env.meta.key, frames: app.frames,
      charges: race && { ...race.charges }, used: race && { ...race.used }, x: race && race.xstate(), onGround: c && c.onGround, extras: race && race.extrasOn };
  },
  start: (o) => startRace(o || {}),
  // G-Kräfte (n24): live (Rennen) bzw. Replay an der aktuellen Stelle; Lage des runden G-Meters
  gState() { if (mode === 'replay' && replay) return { ...replay.gState() }; if (!race) return null; gLiveSync(); return gLive.m.state(); },
  gmeterBox() { const e = document.getElementById('gmeter'); if (!e || !e.classList.contains('show')) return null; const b = e.getBoundingClientRect(); return [b.left, b.top, b.right, b.bottom]; },
  newTrack: (s, d, mode, randomTheme) => newTrack(s, d, mode, randomTheme),
  setAssist,
  setLine,
  toggleLine,
  replay: startReplay,
  toMenu,
  // Kino-Replay (Tests): Zustand, überspringen, an eine Stelle springen (Aufzeichnungszeit t im Clip ci)
  get cine() { return cine; },
  cineInfo() { const f = cine ? cine.film : race && race.film; return f ? { duration: f.duration, clips: f.clips.map((c) => ({ kind: c.kind, label: c.label, a: c.a, b: c.b, c0: c.c0, c1: c.c1, tp: c.tp, film: c.film, shots: c.shots.map((s) => ({ cam: s.cam, t0: s.t0, t1: s.t1, vis: s.setup && s.setup.vis, side: s.setup && s.setup.side })) })) } : null; },
  cineState() { return cine ? { ci: cine.player.ci, t: cine.player.t, speed: cine.player.speed, cam: cine.cam.out.cam, fov: cine.cam.out.fov, focus: cine.cam.out.focus, frames: cine.stats.frames, progress: cine.player.progress() } : null; },
  cineSeek(ci, t) { if (!cine) return; ui._capClip = -1; ui._capShow = 0; const E = document.querySelector('#cine .cap'); if (E) E.className = 'cap'; const P = cine.player; P.ci = ci; P.t = t; P.done = false; P.cut = true; cine.cut = true; replay.t = t; blurCut = true; },
  // Kamera-Art im laufenden Clip erzwingen (Fotos jeder Art), null = wie geplant
  cineForce(cam) {
    if (!cine) return;
    if (!cam) { cine.force = null; cine.cut = true; return; }
    const P = cine.player, c = P.clip, sh = { cam, t0: c.a, t1: c.b, ci: P.ci };
    sh.setup = cine.cam.setup(c, sh); cine.force = sh; cine.cut = true; blurCut = true;
  },
  skipCine: () => endCine(true),
  // Zielshow (n27): Zustand, überspringen, Feuerwerk-Plan
  get show() { return show; }, skipShow: () => endShow(true), get pyro() { return pyro; }, showTau: () => showTau(),
  startCine: () => (ui.lastRes ? startCine(ui.lastRes) : false),
  freeze(on = true) { frozen = on; },
  setTimeScale(s) { timeScale = s; },
  get timeScale() { return timeScale; },
  cam(m) { rig.mode = m; rig.init = false; },
  get cockpit() { return cockpit; },
  get brakeLights() { return brakeLights; }, get air() { return air; },
  get fx() { return fx; },
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
  post, kino, shadowUniforms,
  // ein Bild wie im Spiel zeichnen (Tests/Messung, Szene angehalten): o = { run, speed, boost, cockpit }
  drawOnce(o = {}) { renderer.info.reset(); drawFrame({ run: !!o.run, speed: o.speed || 0, boost: o.boost || 0, dt: 1 / 60, cut: false, cockpit: !!o.cockpit, heat: o.heat === false ? null : (o.cockpit ? null : heatOf(o.speed || 0, o.boost || 0)) }); },
  setLook(l) { if (kino) { kino.setLevel(l); } },
  hop() { race.requestHop(); }, nitro() { race.requestNitro(); },
};

boot().catch((e) => { console.error(e); window.__errors && window.__errors.push(String(e && e.stack || e)); ui.fatal(e); });
