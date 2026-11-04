# n44: viele Zufalls-Strecken im Browser über __game.newTrack (inkl. Autopilot-Prüfung), je Strecke Zeitlimit 15 s.
# python3 tests/n44_neue_strecke_sweep.py [je_kombination=10]
import os, sys, time, json, random
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from util import *
N = int(sys.argv[1]) if len(sys.argv) > 1 else 10
random.seed(44)
with Server() as srv, sync_playwright() as pw:
    s = Session(pw, srv.base)
    s.open('?nosw')
    res, haenger = {}, []
    for art in ['gel', '3d', 'flat']:
        for d in [1, 2, 3]:
            ts = []
            for k in range(N):
                seed = random.randrange(1, 999999)
                t0 = time.time()
                s.ev(f"() => {{ window.__f = false; __game.newTrack({seed}, {d}, '{art}').then(() => {{ window.__f = true; }}, (e) => {{ window.__f = 'Fehler ' + e; }}); }}")
                ok = False
                while time.time() - t0 < 15:
                    f = s.ev("window.__f")
                    if f is True: ok = True; break
                    if f: break
                    time.sleep(0.1)
                dt = time.time() - t0; ts.append(dt)
                if not ok: haenger.append({'seed': seed, 'd': d, 'art': art, 's': round(dt, 1), 'f': s.ev("window.__f")}); print('HAENGER', haenger[-1], flush=True)
                if not ok: s.pg.reload(); s.open('?nosw')
            res[f'{art}/{d}'] = {'n': N, 'mittel_s': round(sum(ts) / N, 2), 'max_s': round(max(ts), 2)}
            print(art, d, res[f'{art}/{d}'], flush=True)
    print('Fehler im Browser', s.errors[:5])
    s.close()
json.dump({'je': res, 'haenger': haenger}, open(os.path.join(ROOT, 'tests', 'perf', 'n44_neue_strecke_sweep.json'), 'w'), indent=1)
print('HAENGER', len(haenger))
