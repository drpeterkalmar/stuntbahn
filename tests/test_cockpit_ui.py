# Cockpit-Kamera (Browser): Kamera-Knopf schaltet Verfolger → Cockpit, Wahl bleibt nach Neuladen,
# Wrack (Totalschaden an) → kurz Verfolger, danach wieder Cockpit; Fahrhilfe Leicht: Lenk-Pfeile nicht über
# den Instrumenten; Replay-Knopf „Cockpit“; Draw-Calls; 0 Fehler.
import sys, time, json, math
sys.path.insert(0, 'tests')
from util import *

ok = True
def expect(cond, msg):
    global ok
    print(('OK   ' if cond else 'FAIL ') + msg, flush=True)
    ok = ok and bool(cond)

with Server() as srv, sync_playwright() as pw:
    s = Session(pw, srv.base)
    s.open('?nosw&seed=4711&d=2')
    s.ev("__game.setAssist('easy')")
    s.tap('[data-a=start]')
    s.frames(3)
    expect(s.ev("__game.rig.mode") == 'chase', 'Start im Verfolger')
    calls_chase = s.ev("() => { window.__game.sim(4); return 0; }")
    s.frames(5); calls_chase = s.ev("__game.info().calls")
    s.tap('#hud [data-a=cam]')
    s.frames(5)
    expect(s.ev("__game.rig.view") == 'cockpit', 'Kamera-Knopf → Cockpit')
    calls_cp = s.ev("__game.info().calls")
    print('Draw-Calls Verfolger', calls_chase, 'Cockpit', calls_cp)
    expect(calls_cp <= calls_chase + 20, f'Draw-Calls im Rahmen ({calls_cp})')
    expect(s.ev("getComputedStyle(document.querySelector('#hud .speed')).display") == 'none', 'Digital-Tempo ausgeblendet')
    expect(s.ev("getComputedStyle(document.querySelector('#hud .time')).display") != 'none', 'Rundenzeit sichtbar')
    expect(s.ev("__game.store.settings.cam") == 'cockpit', 'Kamerawahl gespeichert')
    # Leicht: Pfeile der Bildschirmhälften nicht über den Instrumenten
    s.frames(20)
    px = s.ev("__game.cockpit.readout().px")
    arrows = s.ev("() => [...document.querySelectorAll('#touch.show .half span')].map(e => { const b = e.getBoundingClientRect(); return [b.left, b.top, b.right, b.bottom]; })")
    hit = [a for a in arrows for gx in px['xs'] if math.hypot(max(a[0], min(gx, a[2])) - gx, max(a[1], min(px['yc'], a[3])) - px['yc']) < px['gd'] / 2]
    expect(len(arrows) == 2 and not hit, f'Leicht-Pfeile außerhalb der Instrumente {arrows}')
    s.shot('ui_leicht', 'cockpit')
    # Neuladen → Cockpit bleibt
    s.open('?nosw&seed=4711&d=2')
    s.ev("__game.start({autopilot:true})"); s.frames(3)
    expect(s.ev("__game.rig.mode") == 'cockpit', 'nach Neuladen wieder Cockpit')
    # Wrack: Totalschaden an → Verfolger, Karosserie sichtbar; danach zurück ins Cockpit
    s.ev("() => { const G = window.__game; G.store.settings.wreck = true; G.store.save(); G.start({autopilot:true}); G.sim(5); G.race.car.setCrash('Test'); G.sim(0.1); }")
    s.frames(5)
    st = s.ev("() => ({ state: __game.race.state, view: __game.rig.view, car: __game.scene.getObjectByName('car').visible })")
    expect(st['state'] == 'wreck' and st['view'] == 'chase' and st['car'], f'Wrack → Verfolger {st}')
    s.shot('ui_wrack', 'cockpit')
    s.ev("__game.sim(3)"); s.frames(5)
    st = s.ev("() => ({ state: __game.race.state, view: __game.rig.view, car: __game.scene.getObjectByName('car').visible })")
    expect(st['state'] == 'running' and st['view'] == 'cockpit' and not st['car'], f'nach dem Wrack wieder Cockpit {st}')
    s.ev("() => { window.__game.store.settings.wreck = false; window.__game.store.save(); }")
    # Replay-Knopf
    s.ev("() => { const G = window.__game; for (let i = 0; i < 300 && G.race.state !== 'finished'; i++) G.sim(1); }")
    s.frames(3)
    s.ev("__game.replay()"); s.frames(3)
    expect(s.ev("!!document.querySelector('#replayui [data-v=cockpit]')"), 'Replay-Knopf „🏁 Cockpit“ vorhanden')
    s.tap('#replayui [data-v=cockpit]'); s.frames(5)
    expect(s.ev("__game.rig.view") == 'cockpit', 'Replay im Cockpit')
    r = s.ev("document.querySelector('#replayui').getBoundingClientRect().top")
    expect(r < 5, f'Replay-Leiste im Cockpit oben ({r})')
    # Zeiger folgen der Aufzeichnung: zwei Zeitpunkte mit verschiedenem Tempo
    vals = []
    for frac in (0.2, 0.55):
        s.ev(f"() => {{ const R = window.__game.replayObj; R.t = R.duration * {frac}; window.__game.setTimeScale(0.0005); }}")
        time.sleep(1.5)
        vals.append(s.ev("() => ({ deg: __game.cockpit.readout().speedDeg, kmh: Math.abs(__game.replayObj.speed()) * 3.6 })"))
    print('Replay-Zeiger', vals)
    expect(all(abs(v['deg'] - (-130 + min(1.02, v['kmh'] / 300) * 260)) < 3 for v in vals), 'Replay-Tachozeiger = aufgezeichnetes Tempo')
    s.ev("__game.setTimeScale(1.25)")
    s.tap('#replayui [data-v=chase]'); s.frames(3)
    expect(s.ev("__game.scene.getObjectByName('car').visible"), 'zurück im Verfolger: Auto sichtbar')
    expect(not s.errors, f'0 Fehler {s.errors[:5]}')
    s.close()
print('ERGEBNIS', 'grün' if ok else 'ROT')
sys.exit(0 if ok else 1)
