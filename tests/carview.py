import sys, time, json
sys.path.insert(0, 'tests')
from util import *
with Server() as srv, sync_playwright() as pw:
    s = Session(pw, srv.base, device=dict(viewport={"width": 1200, "height": 600}, device_scale_factor=1))
    for m in ['side', 'top', 'front']:
        s.pg.goto(srv.base + f'tests/carview.html?m={m}')
        try:
            s.pg.wait_for_function("window.__done === true", timeout=60000)
        except Exception as e:
            print('TIMEOUT', s.errors[:5], [c for c in s.console if 'GL Driver' not in c][:10]); raise
        time.sleep(0.5)
        s.shot('carview_' + m)
    print(json.dumps(s.ev("window.__info")))
    print('errors', s.errors[:5])
    s.close()
