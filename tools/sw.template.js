// Service-Worker: offline spielbar, Cache-Busting über Inhalts-Hash (tools/update_sw.py)
const VERSION = '__VERSION__';
const CACHE = 'stuntbahn-' + VERSION;
const ASSETS = [
  './',
  __ASSETS__
];
self.addEventListener('install', (e) => {
  // n42: 'no-cache' statt 'reload' – fragt mit ETag nach (304 ohne Inhalt, wenn die Datei schon im HTTP-Cache liegt, z. B.
  // gerade vom ersten Spielstart geladen); vorher lud der Vorab-Cache alles ein zweites Mal
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS.map((u) => new Request(u, { cache: 'no-cache' })))).then(() => self.skipWaiting()));
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
