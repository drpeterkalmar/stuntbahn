# n44: Start bei schwachem Netz mit warmem Offline-Speicher (Service Worker). Besuch 1 am <tag1> (schnelles Netz, SW
# installiert sich), dann Uhr auf <tag2>, Netz drosseln, neu laden → wie lange steht „Strecke bauen …“?
# python3 tests/n44_netz_probe.py <url> <tag1> <tag2> <kbit/s> <rtt_ms> [limit_s]   (kbit 0 = offline, -1 = Netz hängt)
import sys, time, json, os
sys.path.insert(0, 'tests')
from util import *
from n44_wiederkehr_lib import warte
url, t1, t2 = sys.argv[1], sys.argv[2], sys.argv[3]; kbit = float(sys.argv[4]); rtt = float(sys.argv[5]); T = float(sys.argv[6]) if len(sys.argv) > 6 else 90
with sync_playwright() as pw:
    b = pw.chromium.launch(args=ARGS)
    ctx = b.new_context(**PIXEL7_LAND, service_workers='allow')
    pg = ctx.new_page(); errs = []
    pg.on('console', lambda m: errs.append(m.type + ': ' + m.text[:200]) if m.type in ('error', 'warning') and 'GL Driver' not in m.text and 'GPU stall' not in m.text else None)
    pg.clock.install(time=t1)
    pg.goto(url); ok, dt, v = warte(pg, 60); print('Besuch 1', t1[:10], 'OK' if ok else 'HAENGT', round(dt, 1), 's', flush=True)
    time.sleep(40)
    pg.reload(); ok, dt, v = warte(pg, 60); print('Besuch 2', t1[:10], 'OK' if ok else 'HAENGT', round(dt, 1), 's', 'SW', pg.evaluate("!!navigator.serviceWorker.controller"), flush=True)
    time.sleep(3)
    print('   Themen im Offline-Speicher:', pg.evaluate("(async () => { const out = []; for (const k of await caches.keys()) { const c = await caches.open(k); for (const r of await c.keys()) if (r.url.includes('/themes/')) out.push(r.url.split('/themes/')[1]); } return out; })()"))
    pg.clock.set_system_time(t2)
    cdp = ctx.new_cdp_session(pg)
    cdp.send('Network.enable')
    stall = None
    if kbit == 0: ctx.set_offline(True)
    elif kbit < 0:
        stall = []
        ctx.route('**/assets/themes/**', lambda r: stall.append(r))   # nie beantworten: Netz hängt
    else: cdp.send('Network.emulateNetworkConditions', {'offline': False, 'latency': rtt, 'downloadThroughput': kbit * 1000 / 8, 'uploadThroughput': kbit * 1000 / 8 / 2})
    errs.clear()
    t0 = time.time(); pg.reload(wait_until='commit'); ok, dt, v = warte(pg, T)
    th = pg.evaluate("window.__game && window.__game.theme") if ok else pg.evaluate("window.__game && window.__game.themes && window.__game.themes().stats")
    print('Besuch 3', t2[:10], f'{kbit} kbit/s {rtt} ms', 'OK' if ok else 'HAENGT', round(dt, 1), 's', '| Thema', th, flush=True)
    for x in v[-5:]: print('   ', x)
    for e in errs[:8]: print('    ', e)
    if stall is not None: print('    hängende Anfragen', len(stall))
    try: ctx.unroute_all(behavior='ignoreErrors')
    except Exception: pass
    b.close()
