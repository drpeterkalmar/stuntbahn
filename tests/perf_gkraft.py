# G-Anzeige + Show-Tacho (n24 Etappe 1): Bildrate vorher (Stand vor n24, eigene Wurzel) gegen nachher, Grafik „Standard“
# (Stufe 1), Pixel 7 quer, Rennen auf Mittel mit Autopilot – Cockpit (rundes G-Meter) und Verfolger (G-Zahl im HUD), dazu
# Replay (G-Einblendung). Bildrate entsperrt (kein vsync), vorher/nachher abwechselnd (gleiche Hintergrundlast).
# Aufruf: python3 tests/perf_gkraft.py <vorher-Wurzel> [Runden]   → tests/out/n24/perf_gkraft.json
import os, sys, time, json, statistics
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import util
from util import Server, Session, PIXEL7_LAND, ROOT
util.ARGS = util.ARGS + ['--disable-gpu-vsync', '--disable-frame-rate-limit']
from playwright.sync_api import sync_playwright

old = os.path.abspath(sys.argv[1])
ROUNDS = int(sys.argv[2]) if len(sys.argv) > 2 else 3
SEC = 6.0
Q = '?nosw&seed=4711&d=3&q=1'

def measure(pw, root, label):
    res = {}
    with Server(root) as srv:
        s = Session(pw, srv.base, device=PIXEL7_LAND)
        s.open(Q)
        s.ev("__game.setAssist('medium')"); s.ev("__game.start({autopilot:true})")
        s.ev("() => { const G = window.__game; for (let i = 0; i < 40 && G.race.state !== 'running'; i++) G.sim(0.1); }")
        for cam in ['cockpit', 'chase']:
            s.ev(f"__game.cam('{cam}')"); time.sleep(1.5)
            f0 = s.ev("__app.frames"); t0 = time.time(); time.sleep(SEC); f1 = s.ev("__app.frames"); t1 = time.time()
            res[cam] = (f1 - f0) / (t1 - t0)
        s.ev("() => { for (let i = 0; i < 400 && window.__game.race.state !== 'finished'; i++) window.__game.sim(1); }")
        s.frames(3); s.ev("__game.replay()"); time.sleep(1.5)
        f0 = s.ev("__app.frames"); t0 = time.time(); time.sleep(SEC); f1 = s.ev("__app.frames"); t1 = time.time()
        res['replay'] = (f1 - f0) / (t1 - t0)
        res['errors'] = s.errors[:3]
        s.close()
    print(label, json.dumps({k: (round(v, 1) if isinstance(v, float) else v) for k, v in res.items()}), flush=True)
    return res

out = {'vorher': [], 'nachher': []}
with sync_playwright() as pw:
    for r in range(ROUNDS):
        for label, root in ([('vorher', old), ('nachher', ROOT)] if r % 2 == 0 else [('nachher', ROOT), ('vorher', old)]):
            out[label].append(measure(pw, root, label))
summ = {}
for k in ['cockpit', 'chase', 'replay']:
    a = statistics.median(x[k] for x in out['vorher']); b = statistics.median(x[k] for x in out['nachher'])
    summ[k] = {'vorher': round(a, 1), 'nachher': round(b, 1), 'diff_pct': round((b - a) / a * 100, 1)}
print('ERGEBNIS', json.dumps(summ))
os.makedirs(os.path.join(ROOT, 'tests/out/n24'), exist_ok=True)
json.dump({'runs': out, 'median': summ}, open(os.path.join(ROOT, 'tests/out/n24/perf_gkraft.json'), 'w'), indent=1)
