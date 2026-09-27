# Cockpit-Kamera: Fotos (Gerade, Kurve, Looping kopfüber, Sprung, Rückwärtsgang, Replay) je Gerät +
# Zahlenprüfung: Zeigerwinkel = Tempo/Drehzahl, Ganganzeige = Gang, Instrumente nicht unter Touch-Knöpfen.
# Aufruf: python3 tests/cockpit_shots.py [quer|hoch|desktop|tablet]  → tests/shots/cockpit/<gerät>_<szene>.png
import sys, time, json, math
sys.path.insert(0, 'tests')
from util import *

DEV = sys.argv[1] if len(sys.argv) > 1 else 'quer'
PIXEL7_PORT = dict(PIXEL7_LAND, viewport={"width": 412, "height": 915})
TABLET_PORT = dict(viewport={"width": 820, "height": 1180}, device_scale_factor=2, is_mobile=True, has_touch=True,
                   user_agent="Mozilla/5.0 (Linux; Android 14; Pixel Tablet) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36")
DEVICES = {'quer': PIXEL7_LAND, 'hoch': PIXEL7_PORT, 'desktop': DESKTOP, 'tablet': TABLET_PORT}
SEED = '?nosw&seed=4711&d=3'

# Winkel wie in src/gfx/gauges.js
def v_angle(v, mx, sweep=260):
    k = max(-0.015, min(1.02, v / mx))
    return -sweep / 2 + k * sweep

# Physik vorspulen, bis die Bedingung (JS-Ausdruck mit c = Auto, r = Rennen) gilt
FIND = """([cond, maxT]) => { const G = window.__game; const f = new Function('c', 'r', 'return ' + cond);
  for (let t = 0; t < maxT; t += 0.02) { G.sim(0.02); const r = G.race; if (r.state === 'finished') return -1; if (f(r.car, r)) return t; }
  return -2; }"""

def settle(s, wait=2.0):
    # fast stehende Zeit, aber echte Bildzeit → Zeiger schwingen auf ihren Wert ein
    s.ev("__game.setTimeScale(0.0005)")
    time.sleep(wait)

def check(s, name, out):
    r = s.ev("""() => { const G = window.__game, R = G.replayObj, c = G.race.car, ro = G.cockpit.readout();
      const live = G.mode !== 'replay';
      return { ro, kmh: Math.abs(live ? c.fwdSpeed() : R.speed()) * 3.6, rpm: live ? c.rpm : R.rpm(),
        gear: live ? (c.fwdSpeed() < -0.5 ? 'R' : c.gear) : R.gear(), steer: live ? c.steerAng : R.phys().wheels[0].steer,
        up: live ? c.frame.u.y : R.pose().frame.u.y, air: live ? c.onGround === 0 : R.pose().air, view: G.rig.view, cam: document.body.dataset.cam,
        speedHud: getComputedStyle(document.querySelector('#hud .speed')).display, carVisible: G.scene.getObjectByName('car').visible,
        calls: G.info().calls }; }""")
    ro = r['ro']
    es = abs(ro['speedDeg'] - v_angle(r['kmh'], 300))
    et = abs(ro['rpmDeg'] - v_angle(r['rpm'] / 1000, 8))
    # Überdeckung: Instrumente (Kreise) gegen sichtbare Touch-Knöpfe / Replay-Leiste
    px = ro['px']
    boxes = s.ev("""() => [...document.querySelectorAll('#touch.show .tb, #touch.show .half span, #replayui.show button, #hud.show button')]
        .filter(e => e.offsetParent !== null).map(e => { const b = e.getBoundingClientRect(); return [b.left, b.top, b.right, b.bottom, (e.textContent || '').trim().slice(0, 10)]; })""")
    hits = []
    for (x0, y0, x1, y1, t) in boxes:
        for gx in px['xs']:
            R = px['gd'] / 2
            nx, ny = max(x0, min(gx, x1)), max(y0, min(px['yc'], y1))
            if math.hypot(nx - gx, ny - px['yc']) < R: hits.append(t)
        gxc, gyc, gw, gh = px['gate']
        if x0 < gxc + gw / 2 and x1 > gxc - gw / 2 and y0 < gyc + gh / 2 and y1 > gyc - gh / 2: hits.append(t + '(Kulisse)')
    res = dict(name=name, kmh=round(r['kmh'], 1), rpm=round(r['rpm']), gear=r['gear'], gateGear=ro['gear'], steerDeg=round(math.degrees(r['steer']), 1),
               up=round(r['up'], 2), air=r['air'], view=r['view'], errSpeedDeg=round(es, 2), errRpmDeg=round(et, 2),
               speedHud=r['speedHud'], carVisible=r['carVisible'], overlap=hits, calls=r['calls'])
    res['ok'] = es < 3 and et < 4 and str(r['gear']) == str(ro['gear']) and not hits and (r['view'] != 'cockpit' or (r['speedHud'] == 'none' or name.startswith('replay')) and not r['carVisible'])
    out.append(res)
    print(json.dumps(res, ensure_ascii=False), flush=True)

with Server() as srv, sync_playwright() as pw:
    s = Session(pw, srv.base, device=DEVICES[DEV])
    s.open(SEED)
    out = []
    shot = lambda n: s.shot(f'{DEV}_{n}', 'cockpit')
    s.ev("__game.setAssist('medium')")   # Mittel → Touch-Tasten sichtbar (Handy)
    s.ev("__game.start({autopilot:true})")
    s.ev("__game.cam('cockpit')")
    race_ok = DEV != 'hoch'   # Handy hochkant: Rennen zeigt „Bitte quer halten“ → nur Replay
    if DEV == 'hoch':
        s.ev("__game.sim(4)"); settle(s, 1.0); shot('rennen_bitte_quer')
    scenes = [('gerade', "r.time > 5 && c.speed() > 15", 20), ('kurve', "Math.abs(c.steerAng) > 0.16 && c.speed() > 12", 60),
              ('looping', "c.frame.u.y < -0.93", 120), ('sprung', "c.onGround === 0 && c.airTime > 0.7 && !c.surfaceKind", 150)]
    if race_ok:
        for name, cond, mx in scenes:
            t = s.ev(FIND, [cond, mx])
            if t < 0: print('nicht gefunden', name, t); continue
            settle(s); shot(name); check(s, name, out)
            s.ev("__game.setTimeScale(1.25)")
    # bis ins Ziel, dann Replay im Cockpit
    s.ev("__game.setTimeScale(1.25)")
    st = s.ev("() => { for (let i = 0; i < 400 && window.__game.race.state !== 'finished'; i++) window.__game.sim(1); return window.__game.state(); }")
    print('ziel', st['state'], round(st['time'] or 0, 1))
    s.frames(3)
    s.ev("__game.replay()")
    s.frames(3)
    s.tap('#replayui [data-v=cockpit]')
    for k, frac in enumerate([0.12, 0.35, 0.6, 0.8]):
        s.ev(f"() => {{ const R = window.__game.replayObj; R.t = R.duration * {frac}; }}")
        settle(s, 2.0)
        shot(f'replay_{k}'); check(s, f'replay_{k}', out)
    # Replay-Looping (kopfüber) suchen
    t = s.ev("""() => { const R = window.__game.replayObj; for (let t = 0; t < R.duration; t += 1 / 60) { R.t = t; if (R.pose().frame.u.y < -0.93) return t; } return -1; }""")
    if t > 0:
        s.ev(f"() => {{ window.__game.replayObj.t = {t}; }}"); settle(s, 2.0); shot('replay_looping'); check(s, 'replay_looping', out)
    # Rückwärtsgang: neues Rennen ohne Autopilot, Original, Bremse im Stand = rückwärts
    if race_ok:
        s.ev("__game.setAssist('original')")
        s.ev("__game.start()"); s.frames(2)
        s.ev("__game.cam('cockpit')")
        s.ev("() => { const G = window.__game; for (let i = 0; i < 60 && G.race.state !== 'running'; i++) G.sim(0.1); }")
        s.ev("() => window.__game.sim(2.5, { steer: 0.4, throttle: 0, brake: 1 })")
        # Eingabe während der Wartezeit halten (Tastatur), sonst rollt es aus
        s.pg.keyboard.down('Space')
        settle(s); shot('rueckwaerts'); check(s, 'rueckwaerts', out)
        s.pg.keyboard.up('Space')
        # Wrack/Crash: Totalschaden an → Verfolger, danach zurück ins Cockpit
    print('info', s.ev("__game.info()"))
    print('errors', s.errors[:10])
    bad = [o['name'] for o in out if not o['ok']]
    print('ERGEBNIS', DEV, f'{len(out) - len(bad)}/{len(out)} ok', bad)
    json.dump(out, open(f'tests/shots/cockpit/{DEV}_werte.json', 'w'), ensure_ascii=False, indent=1)
    s.close()
    sys.exit(1 if bad or s.errors else 0)
