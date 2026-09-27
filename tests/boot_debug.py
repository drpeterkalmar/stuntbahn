import sys, time
sys.path.insert(0, 'tests')
from util import *
with Server() as srv, sync_playwright() as pw:
    s = Session(pw, srv.base)
    s.pg.goto(srv.base + 'index.html?nosw&' + (sys.argv[1] if len(sys.argv) > 1 else 'demo'))
    time.sleep(25)
    print('ready', s.ev("window.__app && window.__app.ready"), 'frames', s.ev("window.__app && window.__app.frames"))
    print('errors', s.ev("window.__errors"))
    for c in s.console[:40]:
        if 'GL Driver' not in c: print(c[:600])
    print('pageerrors', s.errors[:10])
    s.close()
