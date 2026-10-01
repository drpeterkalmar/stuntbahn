# Fotos der neuen Schanze (n21) mit jeder Hindernis-Variante: Auto am Scheitel aus der Streckenkamera (seitlich) und
# aus der Verfolgerkamera, quer + hoch; dazu je Variante ein Überblick von schräg oben (Hubschrauber) kurz vor der Lippe.
# Aufruf: python3 tests/sprung_hindernis_shots.py [quer|hoch] [kanal,busse,…] [--alt]  → tests/shots/sprung_n21/
import sys, time, json
sys.path.insert(0, 'tests')
from util import *
from hochformat_util import DEVICES

mode = sys.argv[1] if len(sys.argv) > 1 and not sys.argv[1].startswith('--') else 'quer'
kinds = (sys.argv[2] if len(sys.argv) > 2 and not sys.argv[2].startswith('--') else 'kanal,busse,bauernhof,hafen,zug,zirkus').split(',')
alt = '--alt' in sys.argv
if alt: kinds = ['alt']
dev = DEVICES['pixel7q' if mode == 'quer' else 'pixel7']['ctx']
SEED = '?nosw&seed=4711&d=2&q=2'

def to_jump(s, cam, slow=0.15, back=90):
    j = s.ev(f"""(() => {{ const e = __game.env, J = e.track.jumps[0], m = e.track.line.n - 1;
      const i = ((J.lipIdx - {back}) % m + m) % m; return {{ lip: J.lipIdx, i, v: e.prof.vt[i], obst: J.obstacle }}; }})()""")
    s.ev(f"__game.teleport({j['i']}, {j['v']})")
    s.ev(f"__game.cam('{cam}')")
    s.ev(f"__game.setTimeScale({slow})")
    return j

def wait_phase(s, phase, timeout=120):
    t0 = time.time(); flew = False
    while time.time() - t0 < timeout:
        st = s.ev("(() => { const c = __game.race.car; return { air: c.onGround === 0, vy: c.v.y, y: c.pos.y, t: c.airTime, v: c.speed() * 3.6, crash: c.crash && c.crash.reason }; })()")
        if st['air'] and st['t'] > 0.25: flew = True
        if phase == 'lip' and st['air'] and st['t'] > 0.05: return st
        if phase == 'apex' and st['air'] and st['vy'] <= 0.3 and flew: return st
        if phase == 'land' and flew and not st['air']: return st
        time.sleep(0.03)
    return None

out = []
with Server() as srv, sync_playwright() as pw:
    s = Session(pw, srv.base, device=dev)
    for k in kinds:
        s.pg.goto(srv.base + 'index.html' + SEED + ('&schanze=alt' if k == 'alt' else '&hindernis=' + k))
        s.pg.wait_for_function("window.__app && window.__app.ready && window.__app.frames > 3", timeout=180000)
        s.ev("__game.setAssist('easy'); __game.setLine && __game.setLine('off')")
        s.ev("__game.start({autopilot:true})")
        s.ev("__game.sim(3.6)")
        for cam, ph in [('track', 'apex'), ('chase', 'apex'), ('far', 'lip')]:
            j = to_jump(s, cam)
            st = wait_phase(s, ph)
            s.ev("__game.freeze(true)"); s.frames(5); time.sleep(0.4)
            p = s.shot(f'{mode}_{k}_{cam}_{ph}', 'sprung_n21')
            out.append({'k': k, 'cam': cam, 'phase': ph, 'obst': j['obst'], **(st or {})})
            print(k, cam, ph, j['obst'], json.dumps(st), flush=True)
            s.ev("__game.freeze(false)")
        st = s.ev("__game.state()")
        print(k, 'Zustand', st['state'], 'Crashs', st['crashes'], flush=True)
    print('Dreiecke/Draw-Calls', s.ev("__game.info()"))
    print('errors', s.errors[:10])
    s.close()
