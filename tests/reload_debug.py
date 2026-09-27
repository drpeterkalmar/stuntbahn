import sys, time, json
sys.path.insert(0, 'tests')
from util import *
with Server() as srv, sync_playwright() as pw:
    s = Session(pw, srv.base)
    s.open('?nosw&seed=1000&d=1')
    print('verified cache', s.ev("Object.keys(__game.store.verified)"))
    s.pg.reload()
    time.sleep(30)
    print('ready', s.ev("window.__app && window.__app.ready"), s.ev("window.__errors"))
    print('loading text', s.ev("document.querySelector('#loading p').textContent"))
    for c in s.console[-15:]:
        if 'GL Driver' not in c: print(c[:400])
    print('errors', s.errors[:6])
    s.close()
