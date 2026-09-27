# Phase 5: Rennen bis ins Ziel, Ergebnis, Bestzeit nach Reload, Geisterauto, Replay mit 4 Kameras
import sys, time, json
sys.path.insert(0, 'tests')
from util import *
res = {}
with Server() as srv, sync_playwright() as pw:
    s = Session(pw, srv.base)
    s.open('?nosw&seed=1000&d=1')
    s.ev("__game.setAssist('easy')")
    s.tap('button[data-a=start]')
    t0 = time.time()
    st = None
    for k in range(80):
        st = s.ev("__game.sim(2.0)")
        if st['state'] == 'finished': break
    res['ziel'] = {k: st[k] for k in ['state', 'time', 'cp', 'cps', 'crashes', 'rewinds']}
    s.frames(4); time.sleep(1.0)
    res['ergebnis_sichtbar'] = s.ev("document.getElementById('result').classList.contains('show')")
    res['ergebnis_text'] = s.ev("document.querySelector('#result .rtime') && document.querySelector('#result .rtime').textContent")
    res['neue_bestzeit'] = s.ev("!!document.querySelector('#result .rec')")
    s.shot('r_result', 'race')
    res['kleine_knoepfe_ergebnis'] = s.small_buttons()
    # Replay mit Kamerawechsel
    s.tap('#result [data-a=replay]'); time.sleep(0.5)
    positions = []
    for cam in ['chase', 'far', 'track', 'bumper']:
        s.tap(f'#replayui [data-a=rcam][data-v={cam}]')
        s.ev("window.__game.setTimeScale(6)"); time.sleep(2.5); s.ev("window.__game.setTimeScale(1)")
        s.frames(2); time.sleep(0.4)
        positions.append(s.ev("[__game.camera.position.x, __game.camera.position.y, __game.camera.position.z].map(v=>+v.toFixed(1))"))
        s.shot('r_replay_' + cam, 'race')
    res['replay_kamerapositionen'] = positions
    res['kleine_knoepfe_replay'] = s.small_buttons()
    s.tap('#replayui [data-a=rend]'); time.sleep(0.4)
    # Reload: Bestzeit + Geist müssen da sein
    s.pg.reload()
    s.pg.wait_for_function("window.__app && window.__app.ready && window.__app.frames > 3", timeout=300000)
    time.sleep(1)
    res['menue_bestzeiten'] = s.ev("document.querySelector('#menu .bests').textContent")
    s.tap('button[data-a=start]')
    s.ev("__game.sim(8)")
    s.frames(3); time.sleep(0.6)
    res['geist_sichtbar'] = s.ev("__game.scene.getObjectByName('car') && [...__game.scene.children].filter(o=>o.name==='car').map(o=>o.visible)")
    s.shot('r_ghost', 'race')
    print(json.dumps(res, ensure_ascii=False, indent=1))
    print('errors', s.errors[:8])
    s.close()
