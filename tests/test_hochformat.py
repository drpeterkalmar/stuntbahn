# Hochformat im Browser (Pixel 7): Drehen mitten im Rennen (quer → hoch → quer, auch im Cockpit), keine hängenden
# Finger, Touch reagiert danach, Neigen-Achse hochkant/quer, Platz für zwei weitere HUD-Knöpfe in beiden Formaten,
# Drehen in Menü und Replay, Leistung (Draw-Calls, Dreiecke, Pixel) hoch vs. quer, 0 Fehler.
import sys, time, json
sys.path.insert(0, 'tests')
from util import *
from hochformat_util import DEVICES, layout_check, fake_hud_worst

ok = True
def expect(cond, msg):
    global ok
    print(('OK   ' if cond else 'FAIL ') + msg, flush=True)
    ok = ok and bool(cond)

QUER, HOCH = {'width': 915, 'height': 412}, {'width': 412, 'height': 915}
def rotate(s, vp):
    s.pg.set_viewport_size(vp)
    s.frames(4); time.sleep(0.5); s.frames(2)
def down(s, sel, pid, dx=20, dy=20):
    return s.ev(f"""(() => {{ const T = document.querySelector('{sel}'); const r = T.getBoundingClientRect();
        T.dispatchEvent(new PointerEvent('pointerdown', {{ pointerId: {pid}, pointerType: 'touch', clientX: r.left + {dx}, clientY: r.top + {dy}, bubbles: true }}));
        return {{ ...window.__touchState }}; }})()""")
def up(s, sel, pid):
    s.ev(f"document.querySelector('{sel}').dispatchEvent(new PointerEvent('pointerup', {{ pointerId: {pid}, pointerType: 'touch', bubbles: true }}))")
def status(s):
    return s.ev("""(() => { const G = window.__game, c = G.renderer.domElement; return { orient: document.body.dataset.orient, aspect: +G.camera.aspect.toFixed(3),
      canvas: [c.width, c.height], css: [innerWidth, innerHeight], screen: G.ui.screen, state: G.race && G.race.state, time: G.race && G.race.time,
      touch: { ...window.__touchState }, inTouch: { ...G.ui.a.input.touch }, ids: G.ui.touchIds.size, view: G.rig.view }; })()""")

perf = {}
with Server() as srv, sync_playwright() as pw:
    s = Session(pw, srv.base, device=DEVICES['pixel7q']['ctx'])
    s.open('?nosw&seed=4711&d=2')
    # --- Drehen im Menü: kein Fehler, Layout passt
    rotate(s, HOCH)
    r = layout_check(s)
    expect(status(s)['orient'] == 'hoch' and not r['overlap'] and not r['out'], f'Menü nach Drehen hochkant sauber {r}')
    rotate(s, QUER)
    # --- Rennen Mittel (Tasten), Gas halten
    s.ev("__game.store.settings.cam = 'chase'; __game.setAssist('medium')")
    s.tap('#menu [data-a=start]')
    s.ev("__game.sim(3.4)"); s.frames(3)
    t = down(s, '#touch .tb.gas', 11)
    expect(t['throttle'] == 1, 'quer: Gas gehalten')
    time.sleep(1.0)
    st0 = status(s)
    # --- quer → hoch, Finger liegt noch auf „Gas“ (kein pointerup)
    rotate(s, HOCH)
    st = status(s)
    print('nach Drehen hoch:', json.dumps(st, ensure_ascii=False))
    expect(st['orient'] == 'hoch' and abs(st['aspect'] - 412 / 915) < 0.01, 'Renderer/Kamera sofort hochkant')
    expect(st['canvas'][0] < st['canvas'][1], f"Zeichenfläche hochkant {st['canvas']}")
    expect(st['touch']['throttle'] == 0 and not st['touch']['active'] and st['ids'] == 0 and st['inTouch']['throttle'] == 0, 'kein hängendes Gas nach dem Drehen')
    expect(st['screen'] == 'pause', 'Rennen pausiert kurz (Pause-Karte)')
    t1 = status(s)['time']; time.sleep(0.8); t2 = status(s)['time']
    expect(abs(t2 - t1) < 1e-6, 'in der Pause steht die Uhr')
    s.shot('drehen_pause_hoch', 'hochformat')
    r = layout_check(s)
    expect(not r['overlap'] and not r['out'] and not r['small'], f'Pause-Karte hochkant sauber {r}')
    up(s, '#touch .tb.gas', 11)   # später losgelassener Finger: harmlos
    s.tap('#pause [data-a=resume]')
    t1 = status(s)['time']; s.frames(10); time.sleep(0.6); t2 = status(s)['time']
    expect(status(s)['screen'] is None and t2 > t1, f'„Weiter“ → Rennen fährt weiter ({t1:.2f} → {t2:.2f} s)')
    # Touch reagiert hochkant: Gas-Taste
    s.ev("__game.teleport(__game.race.tracker.idx, 0)")   # aus dem Stand (sonst bremst der Mittel-Assistent vor Kurven)
    sp0 = s.ev("__game.race.car.speed()")
    t = down(s, '#touch .tb.gas', 12)
    expect(t['throttle'] == 1, 'hoch: Gas-Taste reagiert')
    s.ev("__game.sim(1.2, window.__touchState)")
    sp1 = s.ev("__game.race.car.speed()")
    up(s, '#touch .tb.gas', 12)
    expect(sp1 > sp0 + 3, f'hoch: Auto beschleunigt ({sp0:.1f} → {sp1:.1f} m/s)')
    t = down(s, '#touch .tb[data-t=L]', 13)
    expect(t['steer'] == -1, 'hoch: Lenk-Taste links')
    up(s, '#touch .tb[data-t=L]', 13)
    # Tempo läuft auch in Echtzeit weiter
    s.frames(3)
    # Cockpit hochkant, dann zurück quer (Instrumente neu gelegt)
    s.tap('#hud [data-a=cam]'); s.frames(6); time.sleep(0.3)
    px_h = s.ev("__game.cockpit.readout().px")
    expect(s.ev("__game.rig.view") == 'cockpit' and px_h['xs'][1] < 412, f"Cockpit hochkant, Instrumente bei {[round(x) for x in px_h['xs']]}")
    perf['hoch_cockpit'] = s.ev("__game.info()")
    rotate(s, QUER)
    s.tap('#pause [data-a=resume]'); s.frames(6); time.sleep(0.3)
    px_q = s.ev("__game.cockpit.readout().px")
    st = status(s)
    expect(st['orient'] == 'quer' and st['screen'] is None and px_q['xs'][1] > 500, f"zurück quer: Cockpit neu gelegt {[round(x) for x in px_q['xs']]}, Rennen läuft")
    r = layout_check(s, ['cockpit'])
    expect(not r['overlap'] and not r['out'], f'Cockpit quer nach dem Drehen sauber {r}')
    perf['quer_cockpit'] = s.ev("__game.info()")
    s.tap('#hud [data-a=cam]'); s.frames(2)
    while s.ev("__game.rig.mode") != 'chase': s.tap('#hud [data-a=cam]')
    # --- Leicht: linke Hälfte halten, drehen → Lenkung gelöst
    s.ev("__game.setAssist('easy')"); s.frames(2)
    t = down(s, '#touch .half.l', 21, 40, 120)
    expect(t['steer'] == -1, 'quer: linke Hälfte lenkt')
    rotate(s, HOCH)
    st = status(s)
    expect(st['touch']['steer'] == 0 and st['ids'] == 0, 'Hälfte: keine hängende Lenkung nach dem Drehen')
    up(s, '#touch .half.l', 21)
    s.tap('#pause [data-a=resume]'); s.frames(3)
    t = down(s, '#touch .half.r', 22, 60, 300)
    expect(t['steer'] == 1, 'hoch: rechte Hälfte lenkt')
    up(s, '#touch .half.r', 22)
    # --- Neigen: Achse hochkant (gamma) bzw. quer (beta), synthetische Sensor-Ereignisse
    s.ev("__game.ui.a.input.enableTilt(true)")
    def tilt(beta, gamma):
        return s.ev(f"(() => {{ window.dispatchEvent(new DeviceOrientationEvent('deviceorientation', {{ alpha: 0, beta: {beta}, gamma: {gamma} }})); return [screen.orientation ? screen.orientation.angle : null, __game.ui.a.input.tilt.value]; }})()")
    ang, v = tilt(45, 15)
    print('Neigen hoch: Winkel', ang, 'Wert', v)
    expect(ang == 0 and v > 0.4, f'hoch: rechts kippen (gamma +15°) → rechts lenken ({v:.2f})')
    ang, v = tilt(45, -15)
    expect(v < -0.4, f'hoch: links kippen → links ({v:.2f})')
    ang, v = tilt(45, 0)
    expect(abs(v) < 0.02, 'hoch: gerade → 0')
    ang, v = tilt(15, 0)   # hochkant Nicken (beta) darf nicht lenken
    expect(abs(v) < 0.02, f'hoch: Nicken lenkt nicht ({v:.2f})')
    rotate(s, QUER)
    ang, v = tilt(15, 5)
    print('Neigen quer: Winkel', ang, 'Wert', v)
    expect((ang in (90, 270, -90)) and abs(v) > 0.4, f'quer: Achse beta ({v:.2f}, Winkel {ang})')
    s.ev("__game.ui.a.input.enableTilt(false); __game.ui.a.input.tilt.value = 0")
    s.tap('#pause [data-a=resume]'); s.frames(3)
    # --- Platz für zwei weitere runde Knöpfe (Nitro/Hüpfer, Optik) in beiden Formaten
    for name, vp in [('quer', QUER), ('hoch', HOCH), ('quer klein', {'width': 740, 'height': 360}), ('hoch klein', {'width': 360, 'height': 740})]:
        rotate(s, vp)
        if s.ev("__game.ui.screen") == 'pause': s.tap('#pause [data-a=resume]')
        s.ev("(() => { const R = document.querySelector('#hud .rbs'); for (const k of [1, 2]) { const b = document.createElement('button'); b.className = 'rb extra'; b.textContent = k === 1 ? '🚀' : '✨'; R.insertBefore(b, R.lastElementChild); } })()")
        fake_hud_worst(s)
        r = layout_check(s)
        s.shot('extra_knoepfe_' + name.replace(' ', '_'), 'hochformat')
        expect(not r['overlap'] and not r['out'] and not r['small'], f'{name}: 6 Knöpfe oben passen {r}')
        s.ev("document.querySelectorAll('#hud .rb.extra').forEach((b) => b.remove()); __game.freeze(false)")
    # --- Leistung hoch vs. quer (Verfolger)
    for name, vp in [('quer', QUER), ('hoch', HOCH)]:
        rotate(s, vp)
        if s.ev("__game.ui.screen") == 'pause': s.tap('#pause [data-a=resume]')
        s.ev("__game.sim(2)"); s.frames(4)
        f0 = s.ev("[__app.frames, performance.now()]"); time.sleep(3); f1 = s.ev("[__app.frames, performance.now()]")
        i = s.ev("__game.info()"); c = s.ev("[__game.renderer.domElement.width, __game.renderer.domElement.height]")
        perf[name + '_verfolger'] = dict(i, px=c[0] * c[1], fps_headless=round((f1[0] - f0[0]) / (f1[1] - f0[1]) * 1000, 1))
    # --- Ziel + Replay, dann im Replay drehen
    s.ev("() => { const G = window.__game; for (let i = 0; i < 400 && G.race.state !== 'finished'; i++) G.sim(1); }")
    s.frames(3)
    s.tap('#result [data-a=replay]'); s.frames(4)
    rotate(s, QUER); s.frames(4)
    r = layout_check(s)
    expect(s.ev("__game.mode") == 'replay' and not r['overlap'] and not r['out'], f'Replay nach Drehen quer sauber {r}')
    rotate(s, HOCH); s.frames(4)
    r = layout_check(s)
    expect(s.ev("__game.mode") == 'replay' and not r['overlap'] and not r['out'], f'Replay nach Drehen hoch sauber {r}')
    print('Leistung', json.dumps(perf, indent=1))
    expect(not s.errors, f'0 Fehler {s.errors[:5]}')
    s.close()
    # --- Desktop: breites Fenster hochkant gezogen → kein Pause-Zwang (keine Touch-Geräte)
    s = Session(pw, srv.base, device=DESKTOP)
    s.open('?nosw&seed=4711&d=2')
    s.ev("__game.start({autopilot: true}); __game.sim(3.5)")
    rotate(s, {'width': 600, 'height': 900})
    expect(s.ev("__game.ui.screen") is None and s.ev("__game.state().state") == 'running', 'Desktop: Fenster hochkant → Rennen läuft ohne Pause weiter')
    expect(not s.errors, f'Desktop 0 Fehler {s.errors[:5]}')
    s.close()
print('ERGEBNIS', 'grün' if ok else 'ROT')
sys.exit(0 if ok else 1)
