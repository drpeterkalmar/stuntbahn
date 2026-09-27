# Phase 6: Ton (ohne Autoplay-Flag: Freischaltung per Tap) + Gamepad (simuliert) + Qualitätsstufen
import sys, time, json
sys.path.insert(0, 'tests')
from util import *
res = {}
with Server() as srv, sync_playwright() as pw:
    s = Session(pw, srv.base)
    # Gamepad-Attrappe vor dem Laden
    s.pg.add_init_script("""
      window.__pad = { axes: [0, 0, 0, 0], buttons: Array.from({length: 17}, () => ({ pressed: false, value: 0 })), connected: true, id: 'Test-Pad' };
      navigator.getGamepads = () => [window.__pad];
    """)
    s.open('?nosw&seed=1000&d=1')
    res['ton_vor_tap'] = s.ev("!!(__game.ui && window.__game)") and s.ev("(() => { const S = window.__soundRef; return S ? S.ctx && S.ctx.state : 'kein ctx'; })()")
    s.ev("__game.setAssist('original')")
    s.tap('button[data-a=start]')      # Geste → AudioContext freischalten
    time.sleep(4)
    res['ton'] = s.ev("(() => { const S = window.__soundRef; return S && S.ctx ? { state: S.ctx.state, bank: !!S.bank, running: S.running, loops: S.bank ? S.bank.engine.length : 0 } : 'kein ctx'; })()")
    s.ev("__game.sim(3.2)")   # Countdown
    # Gamepad: RT (Taste 7) Gas + Stick links
    s.ev("window.__pad.buttons[7] = { pressed: true, value: 1 }; window.__pad.axes[0] = -0.8;")
    s.frames(30)
    res['pad_eingabe'] = s.ev("(() => { const r = __game.race; return { steer: +r.lastInput.steer.toFixed(2), gas: r.lastInput.throttle, speed: +r.car.speed().toFixed(1) }; })()")
    s.ev("window.__pad.buttons[7] = { pressed: false, value: 0 }; window.__pad.axes[0] = 0;")
    res['info'] = s.ev("__game.info()")
    print(json.dumps(res, ensure_ascii=False, indent=1))
    print('errors', s.errors[:8])
    s.close()
