# n44: Service-Worker-Update-Probe. Die Live-Adresse wird per Playwright-Route aus lokalen Ordnern bedient (erst Stand A,
# dann Stand B), der echte Service Worker (https) cacht und aktualisiert wie auf dem Handy.
# python3 tests/n44_sw_update.py <ordnerA> <ordnerB> [geraet] [besucheB]
import sys, time, json, os, mimetypes
sys.path.insert(0, 'tests')
from util import *
from n44_wiederkehr_lib import warte
BASE = 'https://drpeterkalmar.github.io/stuntbahn/'
A, B = sys.argv[1], sys.argv[2]; g = sys.argv[3] if len(sys.argv) > 3 else 'handy'; NB = int(sys.argv[4]) if len(sys.argv) > 4 else 4
mimetypes.add_type('application/wasm', '.wasm'); mimetypes.add_type('text/javascript', '.js'); mimetypes.add_type('image/ktx2', '.ktx2'); mimetypes.add_type('application/manifest+json', '.webmanifest')
stand = {'dir': A, 'n': 0, 'sw': 0, 'urls': {}, 'nav': 0}
import collections
def bedienen(route):
    u = route.request.url.split('#')[0].split('?')[0]
    rel = u[len(BASE):] or 'index.html'
    p = os.path.join(stand['dir'], rel)
    stand['n'] += 1
    k = ('SW ' if route.request.service_worker else '') + rel
    stand['urls'][k] = stand['urls'].get(k, 0) + 1
    if rel == 'sw.js': stand['sw'] += 1
    if not os.path.isfile(p):
        print('   404', rel, flush=True)
        return route.fulfill(status=404, body='nicht da')
    route.fulfill(status=200, body=open(p, 'rb').read(), headers={'Content-Type': mimetypes.guess_type(p)[0] or 'application/octet-stream', 'Cache-Control': 'no-cache'})
with sync_playwright() as pw:
    webkit = os.environ.get('ENGINE') == 'webkit'
    b = pw.webkit.launch() if webkit else pw.chromium.launch(args=ARGS)
    opts = DESKTOP if g == 'desktop' else dict(pw.devices[g]) if g.startswith('iPhone') else PIXEL7_LAND
    ctx = b.new_context(**opts, service_workers='allow')
    ctx.route(BASE + '**', bedienen)
    pg = ctx.new_page(); errs = []
    pg.on('framenavigated', lambda f: stand.__setitem__('nav', stand['nav'] + 1) if f == pg.main_frame else None)
    pg.on('pageerror', lambda e: errs.append(str(e)[:300]))
    pg.on('console', lambda m: errs.append(m.type + ': ' + m.text[:300]) if m.type == 'error' else None)
    def besuch(name, reload=True):
        try:
            if reload: pg.reload()
            else: pg.goto(BASE)
        except Exception as e:   # Seite lädt sich selbst neu (controllerchange)
            print('   (Neuladen unterbrochen:', str(e).split(chr(10))[0][:70], ')'); time.sleep(1)
        ok, dt, v = warte(pg, 60)
        ver = pg.evaluate("() => import('./src/build.js').then((m) => m.BUILD).catch((e) => 'x')") if ok else ''
        print(name, 'OK' if ok else 'HAENGT', round(dt, 1), 's', 'BUILD', ver, '| Anfragen', stand['n'], flush=True)
        if not ok:
            for x in v[-8:]: print('   ', x)
        if errs: print('   fehler', errs[:6]); errs.clear()
        top = sorted(stand['urls'].items(), key=lambda x: -x[1])[:6]
        if stand['n'] > 400: print('   meiste', top, 'navigationen', stand['nav'])
        stand['n'] = 0; stand['urls'] = {}; stand['nav'] = 0
        return ok
    besuch('A1', reload=False); time.sleep(40)
    besuch('A2'); time.sleep(5); besuch('A3'); time.sleep(3)
    print('caches', pg.evaluate("caches.keys()"))
    stand['dir'] = B
    for i in range(NB):
        besuch(f'B{i+1}'); time.sleep(12)
        try: print('   reg', pg.evaluate("navigator.serviceWorker.getRegistration().then(r => r && [r.installing && r.installing.state, r.waiting && r.waiting.state, r.active && r.active.state])"))
        except Exception as e: pass
        try: print('   caches', pg.evaluate("caches.keys()"), 'sw', pg.evaluate("navigator.serviceWorker.controller && navigator.serviceWorker.controller.scriptURL"))
        except Exception as e: print('   caches ?', str(e)[:80])
    time.sleep(5); besuch('B-Ende'); time.sleep(3); besuch('B-Ende2')
    print('INHALT', pg.evaluate('''async () => { const out = {}; for (const k of await caches.keys()) { const c = await caches.open(k); const g = async (u) => { const r = await c.match(u); return r ? (await r.text()).slice(0, 60).replace(/\\s+/g, ' ') : null; };
      out[k] = { n: (await c.keys()).length, build: await g('src/build.js'), main_newTrack: await (async () => { const r = await c.match('src/main.js'); if (!r) return null; const t = await r.text(); return t.includes('art, randomTheme') ? 'neu' : 'alt'; })() }; } return out; }'''))
    print('SEITE main.js geladen von', pg.evaluate("performance.getEntriesByType('resource').filter(e => /main\\.js|build\\.js/.test(e.name)).map(e => e.name + ' ' + e.transferSize + ' ' + e.deliveryType)"))
    b.close()
