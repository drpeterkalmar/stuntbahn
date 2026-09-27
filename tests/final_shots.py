# Finale Screenshots (Handy quer, Desktop, Handy hoch) + Leistungsdaten (renderer.info)
import sys, time, json
sys.path.insert(0, 'tests')
from util import *
perf = {}
def race_moments(s, prefix, sub):
    s.ev("__game.setAssist('easy')")
    s.tap('button[data-a=start]') if s.pg.locator('button[data-a=start]').first.is_visible() else s.ev("__game.start({})")
    s.ev("__game.sim(3.3)"); s.frames(3); time.sleep(0.5); s.shot(prefix + '_start', sub)
    perf[prefix + '_start'] = s.ev("__game.info()")
    got = {'loop': False, 'air': False}
    for k in range(700):
        st = s.ev("(() => { const g=__game; g.sim(0.1); const r=g.race, L=g.env.track.line, i=r.tracker.idx; return { loop: !!L.loop[i] && r.car.frame.u.y < -0.6, air: r.car.onGround===0 && r.car.pos.y > 2.5, fin: r.state==='finished' }; })()")
        for m in ['loop', 'air']:
            if st[m] and not got[m]:
                got[m] = True; s.frames(2); time.sleep(0.4); s.shot(f'{prefix}_{m}', sub)
                perf[f'{prefix}_{m}'] = s.ev("__game.info()")
        if st['fin'] or (got['loop'] and got['air']): break
    return got
with Server() as srv, sync_playwright() as pw:
    # Handy quer (Pixel 7)
    s = Session(pw, srv.base)
    s.open('?nosw&seed=4711&d=3')
    time.sleep(2); s.shot('handy_menue', 'final')
    perf['handy_menue'] = s.ev("__game.info()")
    perf['boot_s_handy'] = round(s.boot_s, 1)
    print('Momente Handy', race_moments(s, 'handy', 'final'))
    for k in range(80):
        st = s.ev("__game.sim(2)")
        if st['state'] == 'finished': break
    s.frames(3); time.sleep(1); s.shot('handy_ziel', 'final')
    s.tap('#result [data-a=replay]'); time.sleep(0.4); s.tap('#replayui [data-a=rcam][data-v=track]')
    s.ev("__game.setTimeScale(8)"); time.sleep(2); s.ev("__game.setTimeScale(1)"); s.frames(2); time.sleep(0.4)
    s.shot('handy_replay', 'final')
    perf['heap_mb'] = s.ev("performance.memory ? Math.round(performance.memory.usedJSHeapSize/1e6) : null")
    perf['errors_handy'] = s.errors[:5]
    s.close()
    # Desktop
    s = Session(pw, srv.base, device=DESKTOP)
    s.open('?nosw&seed=20260927&d=2')
    time.sleep(2); s.shot('desktop_menue', 'final')
    print('Momente Desktop', race_moments(s, 'desktop', 'final'))
    perf['errors_desktop'] = s.errors[:5]
    s.close()
    # Handy hoch
    s = Session(pw, srv.base, device=dict(PIXEL7_LAND, viewport={"width": 412, "height": 915}))
    s.open('?nosw&seed=4711&d=3')
    time.sleep(2); s.shot('handy_hoch_menue', 'final')
    s.ev("__game.start({})"); s.frames(3); time.sleep(0.6); s.shot('handy_hoch_rennen', 'final')
    perf['hoch_kleine_knoepfe'] = s.small_buttons()
    perf['errors_hoch'] = s.errors[:5]
    s.close()
print(json.dumps(perf, ensure_ascii=False, indent=1))
