# Sprung-Fotos: Auto an der Standard-Schanze am Scheitel (Verfolger, Hubschrauber, Streckenkamera =
# Seitenansicht) + Serie Absprung → Scheitel → Landung im Verfolger. Neu gegen alt (?air=1&lip=15).
# Aufruf: python3 tests/jump_shots.py  → tests/shots/sprung/
import sys, time, json
sys.path.insert(0, 'tests')
from util import *

SEED = '?nosw&seed=4711&d=2'

def to_jump(s, cam, slow=0.12):
    # vor die erste Schanze setzen (Profil-Tempo), Zeitlupe, Kamera wählen
    j = s.ev("""(() => { const e = __game.env, J = e.track.jumps[0], m = e.track.line.n - 1;
      const i = ((J.lipIdx - 70) % m + m) % m; return { lip: J.lipIdx, i, v: e.prof.vt[i] }; })()""")
    s.ev(f"__game.teleport({j['i']}, {j['v']})")
    s.ev(f"__game.cam('{cam}')")
    s.ev(f"__game.setTimeScale({slow})")
    return j

def wait_phase(s, phase, timeout=90):
    # phase: 'up' (steigt, in der Luft), 'apex' (vy <= 0 in der Luft), 'land' (wieder am Boden nach Flug)
    t0 = time.time(); flew = False
    while time.time() - t0 < timeout:
        st = s.ev("(() => { const c = __game.race.car; return { air: c.onGround === 0, vy: c.v.y, y: c.pos.y, t: c.airTime }; })()")
        if st['air'] and st['t'] > 0.25: flew = True
        if phase == 'up' and st['air'] and st['t'] > 0.35 and st['vy'] > 1.5: return st
        if phase == 'apex' and st['air'] and st['vy'] <= 0.3 and flew: return st
        if phase == 'land' and flew and not st['air']: return st
        time.sleep(0.05)
    return None

with Server() as srv, sync_playwright() as pw:
    for tag, q in [('neu', SEED), ('alt', SEED + '&air=1&lip=15')]:
        s = Session(pw, srv.base, device=dict(viewport={"width": 1280, "height": 576}, device_scale_factor=1))
        s.open(q)
        s.ev("__game.setAssist('easy'); __game.setLine && __game.setLine('off')")
        s.ev("__game.start({autopilot:true})")
        s.ev("__game.sim(3.6)")
        for cam in ['chase', 'far', 'track']:
            to_jump(s, cam)
            st = wait_phase(s, 'apex')
            s.ev("__game.freeze(true)"); s.frames(4); time.sleep(0.3)
            s.shot(f'{tag}_scheitel_{cam}', 'sprung')
            print(tag, cam, 'Scheitel', json.dumps(st), flush=True)
            s.ev("__game.freeze(false)")
        # Serie im Verfolger: Absprung, Scheitel, Landung
        to_jump(s, 'chase')
        for ph in ['up', 'apex', 'land']:
            st = wait_phase(s, ph)
            s.ev("__game.freeze(true)"); s.frames(4); time.sleep(0.3)
            s.shot(f'{tag}_serie_{ph}', 'sprung')
            print(tag, 'Serie', ph, json.dumps(st), flush=True)
            s.ev("__game.freeze(false)")
        st = s.ev("__game.state()")
        print(tag, 'Zustand', st['state'], 'Crashs', st['crashes'], 'Fehler', s.errors[:10], flush=True)
        s.close()
