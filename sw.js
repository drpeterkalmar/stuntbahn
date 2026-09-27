// Service-Worker: offline spielbar, Cache-Busting über Inhalts-Hash (tools/update_sw.py)
const VERSION = '28cc91cd2f';
const CACHE = 'stuntbahn-' + VERSION;
const ASSETS = [
  './',
  'assets/car/goblin.glb',
  'assets/car/goblin_lod.glb',
  'assets/hdr/sky_1k.hdr',
  'assets/sky/sky.jpg',
  'assets/sky/sky.json',
  'assets/tex/asphalt_arm.webp',
  'assets/tex/asphalt_diff.webp',
  'assets/tex/asphalt_nor.webp',
  'assets/tex/concrete_arm.webp',
  'assets/tex/concrete_diff.webp',
  'assets/tex/concrete_nor.webp',
  'assets/tex/fir_card_0.webp',
  'assets/tex/fir_card_1.webp',
  'assets/tex/grass_arm.webp',
  'assets/tex/grass_diff.webp',
  'assets/tex/grass_nor.webp',
  'assets/tex/metal_arm.webp',
  'assets/tex/metal_diff.webp',
  'assets/tex/metal_nor.webp',
  'assets/tex/pad_arm.webp',
  'assets/tex/pad_diff.webp',
  'assets/tex/pad_nor.webp',
  'css/style.css',
  'icons/apple-touch-icon.png',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
  'index.html',
  'lib/addons/libs/meshopt_decoder.module.js',
  'lib/addons/loaders/GLTFLoader.js',
  'lib/addons/loaders/HDRLoader.js',
  'lib/addons/utils/BufferGeometryUtils.js',
  'lib/addons/utils/SkeletonUtils.js',
  'lib/three.core.min.js',
  'lib/three.module.min.js',
  'manifest.webmanifest',
  'src/ai/autopilot.js',
  'src/ai/ideal.js',
  'src/ai/profile.js',
  'src/audio/sound.js',
  'src/build.js',
  'src/core/util.js',
  'src/game/ghost.js',
  'src/game/input.js',
  'src/game/race.js',
  'src/game/replay.js',
  'src/game/store.js',
  'src/game/trklib.js',
  'src/gfx/camera.js',
  'src/gfx/carmesh.js',
  'src/gfx/cockpit.js',
  'src/gfx/env.js',
  'src/gfx/fx.js',
  'src/gfx/gauges.js',
  'src/gfx/lineviz.js',
  'src/gfx/materials.js',
  'src/gfx/quality.js',
  'src/gfx/world.js',
  'src/main.js',
  'src/physics/air.js',
  'src/physics/car.js',
  'src/physics/collide.js',
  'src/track/build.js',
  'src/track/defs.js',
  'src/track/generator.js',
  'src/track/pieces.js',
  'src/track/pieces_trk.js',
  'src/track/scenery.js',
  'src/track/showcase.js',
  'src/track/trk.js',
  'src/track/trkdesign.js',
  'src/track/trkelems.js',
  'src/track/trkimport.js',
  'src/track/trkterrain.js',
  'src/track/verify.js',
  'src/ui/minimap.js',
  'src/ui/ui.js'
];
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS.map((u) => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k.startsWith('stuntbahn-') && k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  if (req.mode === 'navigate') {
    e.respondWith(caches.match('index.html', { cacheName: CACHE }).then((r) => r || fetch(req)));
    return;
  }
  e.respondWith(caches.match(req, { cacheName: CACHE, ignoreSearch: true }).then((r) => r || fetch(req).then((res) => {
    if (res.ok) { const cp = res.clone(); caches.open(CACHE).then((c) => c.put(req, cp)); }
    return res;
  })));
});
