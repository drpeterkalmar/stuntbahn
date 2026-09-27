# Hochkant-Verfolger an Stunts (Looping, Sprung, Röhre/Korkenzieher auf dem Demo-Rundkurs): Fotos + Auto im Bild.
# Aufruf: python3 tests/hochformat_stunts.py → tests/shots/hochformat/stunt_*.png
import sys, time, json
sys.path.insert(0, 'tests')
from util import *
from hochformat_util import DEVICES

ok = True
def expect(cond, msg):
    global ok
    print(('OK   ' if cond else 'FAIL ') + msg, flush=True)
    ok = ok and bool(cond)
CAR_NDC = """(() => { const G = window.__game, c = G.race.car, v = c.pos, u = c.frame.u, cam = G.camera;
  const p = cam.position.clone(); p.set(v.x + u.x * 0.5, v.y + u.y * 0.5, v.z + u.z * 0.5); p.project(cam); return [p.x, p.y, p.z]; })()"""
with Server() as srv, sync_playwright() as pw:
    s = Session(pw, srv.base, device=DEVICES['pixel7']['ctx'], dpr=2)
    for q, tag in [('?nosw&seed=4711&d=3', 'gen'), ('?nosw&trk=demo-rundkurs', 'demo')]:
        s.open(q)
        s.ev("__game.store.settings.cam = 'chase'; __game.setAssist('easy'); __game.start({autopilot: true}); __game.sim(3.4)")
        got = {}
        want = ['loop', 'air', 'tube', 'cork'] if tag == 'demo' else ['loop', 'air']
        for k in range(900):
            st = s.ev("""(() => { const g = __game; g.sim(0.1); const r = g.race, L = g.env.track.line, i = r.tracker.idx, pc = g.env.track.pieces[L.piece[i]] || {};
              return { loop: !!L.loop[i] && r.car.frame.u.y < -0.6, air: r.car.onGround === 0 && r.car.pos.y > 2.5, tube: !!L.tube[i], cork: /cork/.test(pc.kind || pc.type || ''), fin: r.state === 'finished' }; })()""")
            for m in want:
                if st[m] and m not in got:
                    s.frames(6); time.sleep(0.3)
                    ndc = s.ev(CAR_NDC)
                    got[m] = ndc
                    s.shot(f'stunt_{tag}_{m}', 'hochformat')
                    expect(abs(ndc[0]) < 0.95 and abs(ndc[1]) < 0.95 and ndc[2] < 1, f'{tag} {m}: Auto im Bild {[round(x, 2) for x in ndc]}')
            if st['fin'] or len(got) == len(want): break
        expect(len(got) == len(want), f'{tag}: Momente gefunden {list(got)}')
    expect(not s.errors, f'0 Fehler {s.errors[:4]}')
    s.close()
print('ERGEBNIS', 'grün' if ok else 'ROT')
sys.exit(0 if ok else 1)
