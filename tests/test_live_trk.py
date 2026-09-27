# Live-Prüfung Nacht 2 (GitHub Pages): HTTP 200, Build = lokal, 0 Fehler, Import einer LOKALEN .TRK-Datei
# per Datei-Auswahl (wie am Handy), Probefahrt, Rennen auf Leicht bis ins Ziel, Bibliothek nach Neuladen.
# Aufruf: python3 tests/test_live_trk.py [Pfad zur .TRK] [URL]
import os, sys, time, json, urllib.request
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from util import Session, PIXEL7_LAND, ROOT
from playwright.sync_api import sync_playwright

trk = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'tests', 'out', 'BEISPIEL.TRK')
URL = sys.argv[2] if len(sys.argv) > 2 else 'https://drpeterkalmar.github.io/stuntbahn/'
res = {'datei': os.path.basename(trk)}
res['http'] = urllib.request.urlopen(URL, timeout=30).status
res['build_live'] = urllib.request.urlopen(URL + 'src/build.js', timeout=30).read().decode().strip()
res['build_lokal'] = open(os.path.join(ROOT, 'src', 'build.js')).read().strip()
res['lod_http'] = urllib.request.urlopen(URL + 'assets/car/goblin_lod.glb', timeout=30).status
with sync_playwright() as pw:
    s = Session(pw, URL, device=PIXEL7_LAND)
    t0 = time.time()
    s.pg.goto(URL)
    s.pg.wait_for_function("window.__app && window.__app.ready && window.__app.frames > 3", timeout=400000)
    res['boot_s'] = round(time.time() - t0, 1)
    s.tap('[data-a=trklib]')
    s.pg.wait_for_selector('#sheet.show')
    with s.pg.expect_file_chooser() as fc:
        s.tap('[data-a=trkpick]')
    fc.value.set_files(trk)
    s.pg.wait_for_selector('#sheet .impres', timeout=60000)
    res['import'] = s.ev("() => document.querySelector('#sheet .impres').innerText")
    s.shot('live_trk_bibliothek', 'live')
    tid = s.ev("() => window.__game.trkLib.list[0].id")
    s.pg.locator(f'[data-a=trkplay][data-v="{tid}"]').scroll_into_view_if_needed()
    s.tap(f'[data-a=trkplay][data-v="{tid}"]')
    s.pg.wait_for_function(f"window.__game.mode === 'menu' && document.querySelector('#menu.show') && window.__game.env.meta.key === '{tid}'", timeout=400000)
    time.sleep(2)
    s.shot('live_trk_menue', 'live')
    res['menue'] = s.ev("() => { const m = window.__game.env.meta; return { name: m.name, km: +(window.__game.env.ideal.total / 1000).toFixed(2), autopilot: m.apTime, scheitert: m.apFail }; }")
    s.ev("() => window.__game.setAssist('easy')")
    s.tap('button[data-a=start]')
    st = None
    for k in range(80):
        st = s.ev("() => window.__game.sim(3.0)")
        if st['state'] == 'finished': break
    res['rennen'] = {k: st[k] for k in ['state', 'time', 'cp', 'cps', 'crashes']}
    s.frames(3); time.sleep(1)
    s.shot('live_trk_ziel', 'live')
    res['info'] = s.ev("() => window.__game.info()")
    s.pg.reload()
    s.pg.wait_for_function("window.__app && window.__app.ready", timeout=400000)
    res['nach_neuladen_in_bibliothek'] = s.ev(f"() => !!window.__game.trkLib.get('{tid}')")
    res['errors'] = s.errors[:10]
    print(json.dumps(res, ensure_ascii=False, indent=1))
    s.close()
