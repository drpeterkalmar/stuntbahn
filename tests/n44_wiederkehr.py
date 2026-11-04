# n44: Wiederkehr-Probe – dieselbe Seite mehrmals im SELBEN Kontext öffnen (Service Worker, localStorage, geprüfte
# Strecken bleiben), je Besuch Zeit bis zum Menü bzw. HAENGT. python3 tests/n44_wiederkehr.py <url> [besuche] [geraet] [pause_s]
import sys, time, json, os
sys.path.insert(0, 'tests')
from util import *
url = sys.argv[1]; N = int(sys.argv[2]) if len(sys.argv) > 2 else 4; g = sys.argv[3] if len(sys.argv) > 3 else 'handy'; pause = float(sys.argv[4]) if len(sys.argv) > 4 else 35
from n44_wiederkehr_lib import warte
with sync_playwright() as pw:
    webkit = os.environ.get('ENGINE') == 'webkit'
    b = pw.webkit.launch() if webkit else pw.chromium.launch(args=ARGS)
    opts = DESKTOP if g == 'desktop' else dict(pw.devices[g]) if g.startswith('iPhone') else PIXEL7_LAND
    ctx = b.new_context(**opts)
    pg = ctx.new_page(); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)[:300]))
    pg.on('console', lambda m: errs.append(m.type + ': ' + m.text[:300]) if m.type in ('error',) else None)
    for i in range(N):
        if i == 0: pg.goto(url)
        else: pg.reload()
        ok, dt, v = warte(pg)
        print('Besuch', i + 1, 'OK' if ok else 'HAENGT', round(dt, 1), 's', v[-1] if v else '', flush=True)
        if not ok:
            for x in v[-8:]: print('   ', x)
        if errs: print('   fehler', errs[:6]); errs.clear()
        if i < N - 1: time.sleep(pause)
    b.close()
