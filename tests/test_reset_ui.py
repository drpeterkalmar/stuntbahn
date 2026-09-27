# Totalschaden-Option + Fahrbahn-Reset mit Zeitstrafe im Browser (Pixel 7 quer + hoch):
# Optionen-Schalter, „+5 s“-Anzeige mit Aufblitzen, Ergebnis mit Strafenzähler, Bestzeit je Wertung,
# alte Bestzeit (Schlüssel ohne Zusatz) zählt als „Totalschaden an“ für Mittel, Replay-Schnitt + Overlay.
import sys, time, json
sys.path.insert(0, 'tests')
from util import *

fails = []
def check(ok, msg):
    print(('OK   ' if ok else 'FAIL ') + msg, flush=True)
    if not ok: fails.append(msg)

LOOP_CRASH = """() => { const T = __game.env.track; const pc = T.pieces.find(p => p.type === 'loop');
  __game.teleport(pc.lineStart + ((pc.lineEnd - pc.lineStart) >> 1), 2); return pc.lineStart; }"""

with Server() as srv, sync_playwright() as pw:
    s = Session(pw, srv.base)
    s.open('?nosw&seed=1000&d=1')
    key = s.ev("__game.env.meta.key")
    check(s.ev("__game.store.settings.wreck") is False, 'Standard: Totalschaden aus')
    s.ev("__game.setAssist('medium')")
    # alte Bestzeit (vor dieser Änderung gespeichert: Schlüssel nur mit Fahrhilfe) → gilt als „Totalschaden an“
    s.ev(f"() => {{ __game.store.best['{key}|medium'] = {{ time: 51.23, date: '2026-09-26', name: 'alt' }}; __game.store.save(); __game.ui.refresh(); }}")
    menu_off = s.ev("document.querySelector('#menu .bests').textContent")
    check('0:51,23' not in menu_off and 'Reset +5 s' in menu_off, f'Menü (aus): alte Mittel-Zeit nicht gezeigt, Kennzeichnung da: {menu_off!r}')
    s.shot('reset_01_menu', 'reset')
    # Optionen: Schalter
    s.tap('button[data-a=settings]')
    s.shot('reset_02_optionen_aus', 'reset')
    check(s.ev("!!document.querySelector('#sheet [data-a=toggle][data-v=wreck]:not(.on)')"), 'Optionen: Schalter „Totalschaden“ vorhanden, aus')
    s.tap('#sheet [data-a=toggle][data-v=wreck]')
    check(s.ev("__game.store.settings.wreck") is True and s.ev("!!document.querySelector('#sheet [data-a=toggle][data-v=wreck].on')"), 'Schalter an → gespeichert')
    s.shot('reset_03_optionen_an', 'reset')
    s.tap('#sheet [data-a=close]')
    menu_on = s.ev("document.querySelector('#menu .bests').textContent")
    check('0:51,23' in menu_on and 'Totalschaden' in menu_on, f'Menü (an): alte Mittel-Bestzeit erscheint: {menu_on!r}')
    s.tap('button[data-a=settings]'); s.tap('#sheet [data-a=toggle][data-v=wreck]'); s.tap('#sheet [data-a=close]')
    check(s.ev("__game.store.settings.wreck") is False, 'wieder aus')

    # Rennen (Autopilot fährt), Crash im Looping erzwingen
    s.ev("__game.start({ autopilot: true })")
    s.frames(8)  # Rendering warmlaufen lassen (SwiftShader kompiliert beim ersten Rennbild ~2 s)
    s.ev("__game.sim(4)")
    s.ev(LOOP_CRASH)
    st = None
    for k in range(240):
        st = s.ev("() => { __game.freeze(true); return __game.sim(1/60); }")  # Echtzeit-Schleife anhalten (Foto im Crash-Moment)
        if st['state'] != 'running': break
    check(st['state'] == 'reset' and st['penalties'] == 1, f"Crash → Zustand {st['state']}, Strafen {st['penalties']} (nie 'wreck')")
    big = s.ev("document.getElementById('big').classList.contains('show') && document.getElementById('big').textContent")
    wipe = s.ev("document.getElementById('wipe').classList.contains('in')")
    check(bool(big) and '+5 s' in big and wipe, f'„+5 s“ groß angezeigt ({big!r}), Aufblitzen an ({wipe})')
    s.frames(1)
    s.shot('reset_04_crash_plus5', 'reset')
    t_before = st['time']
    st = s.ev("() => { const r = __game.sim(0.5); __game.freeze(false); return r; }")
    check(st['state'] == 'running' and st['penalties'] == 1, f"nach ≤0,5 s zurück auf der Fahrbahn (Zustand {st['state']}, Zeit {st['time']:.2f} s, vorher {t_before:.2f} s)")
    s.frames(3); time.sleep(0.5)
    pen = s.ev("document.querySelector('#hud .pen').textContent")
    check('+5 s' in pen, f'HUD zeigt Strafe: {pen!r}')
    s.shot('reset_05_nach_reset', 'reset')
    for k in range(60):
        st = s.ev("__game.sim(3)")
        if st['state'] == 'finished': break
    check(st['state'] == 'finished', f"Autopilot nach dem Reset im Ziel: {st['time']:.2f} s")
    s.frames(4); time.sleep(0.8)
    rp = s.ev("document.querySelector('#result .rpen') && document.querySelector('#result .rpen').textContent")
    meta = s.ev("document.querySelector('#result .rmeta').textContent")
    check(rp and '1 Strafe' in rp and '+5 s' in rp, f'Ergebnis mit Strafenzähler: {rp!r} / {meta!r}')
    s.shot('reset_06_ergebnis_quer', 'reset')
    best = s.ev(f"__game.store.best['{key}|medium+reset']")
    check(best and abs(best['time'] - st['time']) < 0.01 and best.get('pen') == 1 and s.ev(f"__game.store.best['{key}|medium'].time") == 51.23,
          f'Bestzeit unter eigener Wertung gespeichert ({best}), alte bleibt unberührt')
    small = s.small_buttons()
    check(not small, f'Ergebnis: alle Knöpfe ≥ 48 px {small}')

    # Replay: Schnitt mit Überblendung + Strafe im Overlay
    s.tap('#result [data-a=replay]'); time.sleep(0.3)
    cut = s.ev("__game.ui.replay.cutT[0]")
    s.ev(f"__game.ui.replay.paused = true; __game.ui.replay.t = {cut} - 0.04")
    s.frames(3); time.sleep(0.1)
    fade = s.ev("+getComputedStyle(document.getElementById('wipe')).opacity")
    info = s.ev("document.querySelector('#replayui .rinfo').textContent")
    check(fade > 0.8 and '+5 s' in info, f'Replay am Schnitt: Überblendung {fade:.2f}, Overlay {info!r}')
    s.shot('reset_07_replay_schnitt', 'reset')
    s.ev(f"__game.ui.replay.t = {cut} + 0.6")
    s.frames(3); time.sleep(0.1)
    fade2 = s.ev("+getComputedStyle(document.getElementById('wipe')).opacity")
    check(fade2 < 0.05, f'Replay nach dem Schnitt wieder klar ({fade2})')
    s.shot('reset_08_replay_danach', 'reset')
    s.tap('#replayui [data-a=rend]'); time.sleep(0.3)
    storage = s.ctx.storage_state()
    errs = list(s.errors)
    s.close()

    # Handy hochkant: Optionen + Ergebnis
    P = dict(PIXEL7_LAND); P['viewport'] = {"width": 412, "height": 915}
    s2 = Session(pw, srv.base, device=P, storage=storage)
    s2.open('?nosw&seed=1000&d=1')
    s2.tap('button[data-a=settings]')
    s2.shot('reset_09_optionen_hoch', 'reset')
    s2.tap('#sheet [data-a=close]')
    s2.ev("__game.setAssist('medium')")
    s2.ev("__game.start({ autopilot: true })")
    s2.ev("__game.sim(4)"); s2.ev(LOOP_CRASH)
    for k in range(60):
        st = s2.ev("__game.sim(3)")
        if st['state'] == 'finished': break
    s2.frames(4); time.sleep(0.8)
    check(st['penalties'] >= 1 and s2.ev("!!document.querySelector('#result .rpen')"), f"hochkant: Ergebnis mit Strafen ({st['penalties']})")
    s2.shot('reset_10_ergebnis_hoch', 'reset')
    small = s2.small_buttons()
    check(not small, f'hochkant: alle Knöpfe ≥ 48 px {small}')
    errs += s2.errors
    s2.close()

    check(not errs, f'0 Fehler (pageerror/console/request): {errs[:5]}')
print('FEHLSCHLÄGE', len(fails) if fails else 0)
sys.exit(1 if fails else 0)
