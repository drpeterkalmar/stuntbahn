# Rauchtest: Laden, Menü, Rennen mit Autopilot vorspulen, Screenshots, 0 Fehler.
import sys, time, json
sys.path.insert(0, 'tests')
from util import *
with Server() as srv, sync_playwright() as pw:
    s = Session(pw, srv.base)
    t0 = time.time()
    s.open('?nosw&seed=4711&d=2')
    print('boot', round(time.time() - t0, 1), 's')
    time.sleep(2); s.shot('smoke_01_menu')
    print('state', s.state())
    s.ev("__game.start({autopilot:true})")
    s.frames(5); time.sleep(1.5); s.shot('smoke_02_countdown')
    for k in range(6):
        st = s.ev("__game.sim(2.0)")
        s.frames(3); time.sleep(0.6)
        s.shot(f'smoke_03_race_{k}')
        print(json.dumps({k: st[k] for k in ['state', 'time', 'speed', 'cp', 'idx', 'n', 'crashes']}))
    print('info', s.ev("__game.info()"))
    print('small buttons', s.small_buttons())
    print('errors', s.errors[:20])
    print('\n'.join([c for c in s.console if 'GL Driver' not in c][:25]))
    s.close()
