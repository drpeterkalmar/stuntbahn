# Effekte: Bremsspuren beim Driften, Wrack-Rauch in Original
import sys, time, json
sys.path.insert(0, 'tests')
from util import *
with Server() as srv, sync_playwright() as pw:
    s = Session(pw, srv.base)
    s.open('?nosw&seed=1000&d=1')
    s.ev("__game.setAssist('original')")
    s.tap('button[data-a=start]')
    s.ev("__game.sim(3.2)")
    # Vollgas geradeaus, dann hart einlenken + bremsen → Driften/Spuren
    s.ev("__game.sim(3.0, {steer:0, throttle:1, brake:0})")
    for k in range(12):
        s.ev("__game.sim(0.12, {steer:1, throttle:1, brake:0})"); s.frames(1)
    s.frames(6); time.sleep(0.6); s.shot('fx_skid', 'fx')
    skids = s.ev("__game.scene.getObjectByName('skids').geometry.attributes.alpha.array.reduce((a,b)=>a+(b>0?1:0),0)")
    # Crash erzwingen: auf den Kopf stellen
    s.ev("(() => { const c = __game.race.car; c.q.x = 1; c.q.y = 0; c.q.z = 0; c.q.w = 0; c.pos.y += 1.5; })()")
    c0 = s.state()['crashes']
    for k in range(8):
        s.ev("__game.sim(0.1)"); s.frames(1)
    s.frames(3); time.sleep(0.3); s.shot('fx_wreck', 'fx')
    st = s.state(); st['crashes_neu'] = st['crashes'] - c0
    print(json.dumps({'spur_vertices': skids, 'state': st['state'], 'crash': st['crash'], 'crashes_neu': st['crashes_neu'], 'partikel': s.ev("__game.scene.getObjectByName('particles').visible")}, ensure_ascii=False))
    print('errors', s.errors[:6])
    s.close()
