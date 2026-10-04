# Mittel n24 im Browser (Pixel 7 quer + hoch): Fahrt auf Mittel mit Vollgas (Lenkung wie die Ideallinie, Gas immer voll –
# „Vollgas aus normaler Anfahrt“): Schanzen-Hinweis im HUD vor der Lippe, Flug mit Sprung-Hilfe, Landung auf der Rampe;
# Tempo nach 3 s Vollgas aus dem Stand (Tacho = Show-Tacho der Physik); Gegenprobe ?m=n23 (alter Antrieb). 0 Fehler.
# Aufruf: python3 tests/mittel3_shots.py [quer|hoch]  → tests/shots/mittel3/
import sys, os, time, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from util import *
from hochformat_util import DEVICES, set_safe

mode = sys.argv[1] if len(sys.argv) > 1 else 'quer'
D = DEVICES['pixel7q' if mode == 'quer' else 'pixel7']
SUB = 'mittel3'
DRIVE = """([cond, maxT]) => { const G = window.__game, r = G.race; const f = new Function('c', 'r', 'return ' + cond);
  for (let t = 0; t < maxT; t += 1 / 120) { const a = r.ap.control(r.car); G.sim(1 / 120, { steer: a.steer, throttle: 1, brake: 0 }); if (r.state === 'finished') return -1; if (f(r.car, r)) return t; }
  return -2; }"""
ok = True
def check(c, m):
    global ok
    print(('OK   ' if c else 'FAIL ') + m, flush=True); ok = ok and bool(c)

with Server() as srv, sync_playwright() as pw:
    s = Session(pw, srv.base, device=D['ctx'])
    s.open('?nosw&seed=4711&d=2&hindernis=bauernhof')
    set_safe(s, D['safe'])
    s.ev("__game.setAssist('medium')"); s.ev("__game.start({})")
    s.ev("() => { const G = window.__game; for (let i = 0; i < 60 && G.race.state !== 'running'; i++) G.sim(0.1); }")
    s.ev("__game.cam('chase')")
    # 3 s Vollgas aus dem Stand: Tempo (echt) und Tacho
    t = s.ev(DRIVE, ["r.time > 3.05", 6])
    s.frames(4)
    v = s.ev("({ kmh: __game.race.car.speed() * 3.6, hud: +document.querySelector('#hud .speed b').textContent, drive: __game.race.car.assist.drive, ramp: __game.race.assist.thrRamp })")
    check(70 < v['kmh'] < 115 and abs(v['hud'] - show_kmh(v['kmh'])) < 8, f"nach 3 s Vollgas: {v['kmh']:.0f} km/h echt, Tacho {v['hud']} (Show-Tacho), Antrieb ×{v['drive']}, Rampe {v['ramp']} s")
    # Schanzen-Hinweis
    t = s.ev(DRIVE, ["r.hud && /Schanze/.test(r.hud.text)", 60])
    s.ev("__game.setTimeScale(0.0005)"); time.sleep(0.8)
    h = s.ev("({ t: document.querySelector('#hud .hint2').textContent, c: document.querySelector('#hud .hint2').className, v: __game.race.car.speed() * 3.6 })")
    s.shot(f'{mode}_schanze_hinweis', SUB)
    check(t >= 0 and 'Schanze' in h['t'] and 'show' in h['c'], f"Schanzen-Hinweis: „{h['t']}“ ({h['c']}) bei {h['v']:.0f} km/h echt")
    s.ev("__game.setTimeScale(1)")
    # Flug mit Sprung-Hilfe (Scheitel) und Landung
    t = s.ev(DRIVE, ["c.onGround === 0 && c.airTime > 0.9", 20])
    s.ev("__game.setTimeScale(0.0005)"); time.sleep(0.8)
    k = s.ev("__game.race.jumpK")
    s.shot(f'{mode}_flug', SUB)
    s.ev("__game.setTimeScale(1)")
    t2 = s.ev(DRIVE, ["c.onGround > 0", 8])
    s.ev("__game.sim(0.4, { steer: 0, throttle: 1, brake: 0 })")
    s.ev("__game.setTimeScale(0.0005)"); time.sleep(0.8)
    st = s.ev("__game.state()")
    s.shot(f'{mode}_landung', SUB)
    check(t >= 0 and t2 >= 0 and not st['crash'], f"Sprung: Hilfe-Stärke im Flug {k:.2f}, gelandet ohne Crash (Crashs {st['crashes']})")
    # Gegenprobe ?m=n23
    s.pg.goto(srv.base + 'index.html?nosw&seed=4711&d=2&m=n23')
    s.pg.wait_for_function("window.__app && window.__app.ready && window.__app.frames > 3", timeout=240000)
    s.ev("__game.setAssist('medium')"); s.ev("__game.start({})")
    s.ev("() => { const G = window.__game; for (let i = 0; i < 60 && G.race.state !== 'running'; i++) G.sim(0.1); }")
    s.ev(DRIVE, ["r.time > 3.05", 6])
    v2 = s.ev("({ kmh: __game.race.car.speed() * 3.6, drive: __game.race.car.assist.drive, jp: !!__game.race.assist.jumpPull })")
    check(v2['drive'] == 1.25 and not v2['jp'] and v2['kmh'] > v['kmh'] + 60, f"?m=n23: Antrieb ×{v2['drive']}, ohne Sprung-Hilfe, nach 3 s {v2['kmh']:.0f} km/h")
    check(not s.errors, f"0 Fehler {s.errors[:3]}")
    s.close()
print('ERGEBNIS', mode, 'grün' if ok else 'ROT')
sys.exit(0 if ok else 1)
