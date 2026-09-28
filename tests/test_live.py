# Live-Prüfung GitHub Pages: HTTP 200, Boot, Rennen, 0 Fehler, PWA-Installierbarkeit, offline spielbar
import sys, time, json, urllib.request
sys.path.insert(0, 'tests')
from util import *
URL = sys.argv[1] if len(sys.argv) > 1 else 'https://drpeterkalmar.github.io/stuntbahn/'
res = {}
res['http'] = urllib.request.urlopen(URL, timeout=30).status
build_live = urllib.request.urlopen(URL + 'src/build.js', timeout=30).read().decode().strip()
res['build_live'] = build_live
res['build_lokal'] = open('src/build.js').read().strip()
with sync_playwright() as pw:
    s = Session(pw, URL)
    t0 = time.time()
    s.pg.goto(URL)
    s.pg.wait_for_function("window.__app && window.__app.ready && window.__app.frames > 3", timeout=400000)
    res['boot_s'] = round(time.time() - t0, 1)
    time.sleep(2); s.shot('live_menu', 'live')
    cdp = s.ctx.new_cdp_session(s.pg)
    res['installierbar_fehler'] = cdp.send('Page.getInstallabilityErrors').get('installabilityErrors')
    s.ev("__game.setAssist('easy')")
    s.tap('button[data-a=start]')
    st = None
    for k in range(90):   # große Welt (27.09.2026): Runden bis ~1:40
        st = s.ev("__game.sim(2.0)")
        if st['state'] == 'finished': break
    res['rennen'] = {k: st[k] for k in ['state', 'time', 'cp', 'cps', 'crashes', 'seed', 'diff']}
    s.frames(3); time.sleep(1); s.shot('live_result', 'live')
    # Service-Worker bereit → offline neu laden
    sw = s.ev("navigator.serviceWorker && navigator.serviceWorker.ready.then(r => !!r.active).catch(() => false)")
    res['sw_aktiv'] = sw
    time.sleep(3)
    s.ctx.set_offline(True)
    try:
        s.pg.reload()
        s.pg.wait_for_function("window.__app && window.__app.ready && window.__app.frames > 3", timeout=300000)
        res['offline_boot'] = True
        s.shot('live_offline', 'live')
    except Exception as e:
        res['offline_boot'] = 'FEHLER ' + str(e)[:100]
    s.ctx.set_offline(False)
    res['errors'] = s.errors[:10]
    res['warnings'] = s.warnings[:5]
    print(json.dumps(res, ensure_ascii=False, indent=1))
    s.close()
