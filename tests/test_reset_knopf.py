# n41 ↺ Reset-Knopf im Browser (Pixel 7 quer + hoch): Knopf im HUD statt ⏪ (alle Stufen, ≥ 48 px, nichts überdeckt, auch
# online mit 💬), ein Tipp → „+5 s ↺ Reset“, Aufblitzen, zurück auf die Fahrbahn; Doppeltipp-Schutz; Tasten T/Backspace,
# R spult weiter zurück (Leicht/Mittel); Gamepad Y = Reset, Steuerkreuz ◀ = Zurückspulen; Pause-Menü mit „⏪ 3 s zurückspulen“
# (nicht auf Original) und „↺ Reset“; mit KI-Gegnern ohne Fehler. Aufruf: python3 tests/test_reset_knopf.py [quer|hoch]
import sys, time
sys.path.insert(0, 'tests')
from util import *
from hochformat_util import layout_check

fails = []
def check(ok, msg):
    print(('OK   ' if ok else 'FAIL ') + msg, flush=True)
    if not ok: fails.append(msg)

PAD = """() => { window.__pad = { connected: true, axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) };
  navigator.getGamepads = () => [window.__pad]; }"""
def st(s): return s.ev("__game.state()")
def warte_lauf(s, n=40):
    for _ in range(n):
        if st(s)['state'] == 'running': return True
        time.sleep(0.1)
    return False

orients = sys.argv[1:] or ['quer', 'hoch']
with Server() as srv, sync_playwright() as pw:
    for orient in orients:
        dev = PIXEL7_LAND if orient == 'quer' else dict(PIXEL7_LAND, viewport={"width": 412, "height": 915})
        print('==', orient, dev['viewport'], flush=True)
        s = Session(pw, srv.base, device=dev)
        s.open('?nosw&seed=1000&d=1')
        s.ev("__game.setAssist('medium')")
        s.ev("__game.start({ autopilot: true })")
        s.frames(8)
        s.ev("__game.sim(5)")
        s.frames(3); time.sleep(0.3)
        # HUD: ↺ statt ⏪, groß genug, nichts überdeckt
        check(s.ev("!document.querySelector('#hud [data-a=rewind]') && !!document.querySelector('#hud [data-a=reset]')"), f'{orient}: HUD hat ↺ Reset, kein ⏪ mehr')
        lab = s.ev("document.querySelector('#hud [data-a=reset]').textContent")
        check('↺' in lab and 'Reset' in lab, f'{orient}: Knopf beschriftet „{lab}“')
        r = layout_check(s)
        check(not r['overlap'] and not r['out'] and not s.small_buttons(), f'{orient}: HUD sauber (Überlappung/außerhalb/klein) {r} {s.small_buttons()}')
        s.shot(f'n41_hud_{orient}', 'n41')
        # Tippen: Spiel verlangsamt, damit der kurze Reset-Zustand messbar ist
        s.ev("__game.setTimeScale(0.05)")
        p0 = st(s); t0 = p0['time']
        s.tap('#hud [data-a=reset]')
        a = st(s)
        big = s.ev("document.getElementById('big').textContent")
        wipe = s.ev("document.getElementById('wipe').classList.contains('in')")
        cool = s.ev("document.querySelector('#hud [data-a=reset]').classList.contains('cool')")
        check(a['state'] == 'reset' and a['penalties'] == 1 and a['resets'] == 1 and a['time'] - t0 >= 5, f"{orient}: 1 Tipp → Zustand {a['state']}, Strafen {a['penalties']}, Uhr +{a['time'] - t0:.2f} s")
        check('+5 s' in big and 'Reset' in big and wipe and cool, f'{orient}: „{big}“ groß, Aufblitzen {wipe}, Knopf gedimmt {cool}')
        s.shot(f'n41_tipp_{orient}', 'n41')
        s.tap('#hud [data-a=reset]')
        check(st(s)['penalties'] == 1, f'{orient}: zweiter Tipp sofort danach gesperrt (Doppeltipp-Schutz)')
        s.ev("__game.setTimeScale(1)")
        check(warte_lauf(s), f'{orient}: zurück auf der Fahrbahn, Zustand {st(s)["state"]}')
        s.frames(10); time.sleep(0.4)
        b = st(s)
        pen = s.ev("document.querySelector('#hud .pen').textContent")
        check(b['up'] > 0.9 and b['speed'] > 4 and '+5 s' in pen, f"{orient}: Auto aufrecht ({b['up']:.2f}), mit Schwung ({b['speed'] * 3.6:.0f} km/h), HUD „{pen}“")
        s.shot(f'n41_nach_reset_{orient}', 'n41')
        time.sleep(1.1)
        # Tasten: T, Backspace (je +5 s), R = Zurückspulen (Mittel)
        for key in ('t', 'Backspace'):
            n0 = st(s)['resets']
            s.pg.keyboard.press(key); s.frames(3)
            check(st(s)['resets'] == n0 + 1, f'{orient}: Taste {key} → Reset')
            warte_lauf(s); s.ev("__game.sim(1.2)")
        w0 = st(s)['rewinds']
        s.ev("__game.sim(4)")
        s.pg.keyboard.press('r'); s.frames(3)
        check(st(s)['rewinds'] == w0 + 1, f'{orient}: Taste R spult weiter zurück (Mittel)')
        # Gamepad (nachgebaut): Y = Reset, Steuerkreuz links = Zurückspulen
        s.ev(PAD); s.ev("__game.sim(1.5)")
        n0, w0 = st(s)['resets'], st(s)['rewinds']
        s.ev("window.__pad.buttons[3].pressed = true"); s.frames(3); s.ev("window.__pad.buttons[3].pressed = false"); s.frames(2)
        check(st(s)['resets'] == n0 + 1 and st(s)['rewinds'] == w0, f'{orient}: Gamepad Y → Reset')
        warte_lauf(s); s.ev("__game.sim(4)")
        s.ev("window.__pad.buttons[14].pressed = true"); s.frames(3); s.ev("window.__pad.buttons[14].pressed = false"); s.frames(2)
        check(st(s)['rewinds'] == w0 + 1, f'{orient}: Gamepad Steuerkreuz ◀ → Zurückspulen')
        s.ev("navigator.getGamepads = () => []")
        # Pause-Menü: ⏪ und ↺
        s.ev("__game.sim(4)")
        s.tap('#hud [data-a=pause]'); time.sleep(0.4)
        check(s.ev("!!document.querySelector('#pause [data-a=prewind]') && !!document.querySelector('#pause [data-a=preset]')"), f'{orient}: Pause-Menü (Mittel) mit „⏪ 3 s zurückspulen“ und „↺ Reset“')
        kl = [x for x in s.small_buttons() if x['w'] < 47.5 or x['h'] < 47.5]   # (Karte scrollt: unterhalb des Bildes ist erlaubt)
        check(not kl, f'{orient}: Pause-Menü alle Knöpfe ≥ 48 px {kl}')
        s.shot(f'n41_pause_{orient}', 'n41')
        w0 = st(s)['rewinds']
        s.tap('#pause [data-a=prewind]'); time.sleep(0.3)
        check(st(s)['rewinds'] == w0 + 1 and not s.ev("document.getElementById('pause').classList.contains('show')"), f'{orient}: Pause → Zurückspulen: weiter und 3 s zurück')
        s.ev("__game.sim(1.5)")
        s.tap('#hud [data-a=pause]'); time.sleep(0.4)
        n0 = st(s)['resets']
        s.tap('#pause [data-a=preset]'); time.sleep(0.2)
        check(st(s)['resets'] == n0 + 1, f'{orient}: Pause → ↺ Reset')
        warte_lauf(s)
        # Original: Reset-Knopf da, im Pause-Menü kein Zurückspulen, R tut nichts
        s.ev("__game.setAssist('original')"); s.frames(3); s.ev("__game.sim(1.5)")
        check(s.ev("getComputedStyle(document.querySelector('#hud [data-a=reset]')).display") != 'none', f'{orient}: Original → ↺ Reset-Knopf sichtbar')
        n0 = st(s)['resets']
        s.tap('#hud [data-a=reset]'); time.sleep(0.2)
        check(st(s)['resets'] == n0 + 1, f'{orient}: Original → Reset per Knopf')
        warte_lauf(s); s.ev("__game.sim(1.5)")
        s.tap('#hud [data-a=pause]'); time.sleep(0.4)
        check(not s.ev("!!document.querySelector('#pause [data-a=prewind]')") and s.ev("!!document.querySelector('#pause [data-a=preset]')"), f'{orient}: Pause-Menü (Original) ohne Zurückspulen, mit Reset')
        s.tap('#pause [data-a=resume]'); time.sleep(0.3)
        # online: 💬-Knopf dazu – Reihe bleibt sauber
        s.ev("document.body.dataset.online = '1'"); s.frames(3); time.sleep(0.3)
        s.ev("__game.setAssist('medium')"); s.frames(3); time.sleep(0.3)
        r = layout_check(s)
        check(not r['overlap'] and not r['out'] and not s.small_buttons(), f'{orient}: online (mit 💬) HUD sauber {r}')
        s.shot(f'n41_hud_online_{orient}', 'n41')
        s.ev("delete document.body.dataset.online")
        # Hilfe: Reset beschrieben, Tasten genannt
        s.ev("__game.toMenu()"); time.sleep(0.4)
        s.tap('#menu [data-a=help]'); time.sleep(0.4)
        h = s.ev("document.getElementById('sheet').textContent")
        check('↺ Reset' in h and 'Backspace' in h and 'Steuerkreuz' in h and 'Pause-Menü' in h, f'{orient}: Steuerungsseite erklärt ↺ Reset, Tasten und Zurückspulen')
        s.shot(f'n41_hilfe_{orient}', 'n41')
        check(not s.errors, f'{orient}: keine Fehler {s.errors[:3]}')
        s.close()
    # mit KI-Gegnern: Reset mitten im Feld, keine Fehler, Spieler fährt weiter
    s = Session(pw, srv.base)
    s.open('?nosw&seed=1000&d=1&gegner=3&staerke=profi')
    s.ev("__game.setAssist('medium')")
    s.ev("__game.start({ autopilot: true })")
    s.frames(8)
    s.ev("__game.sim(3)")
    n = s.ev("__game.gegner ? __game.gegner.fahrer.length : 0")
    s.ev("__game.reset()")
    s.ev("__game.sim(0.5)")
    sp = s.ev("__game.gegner ? __game.gegner.spGeistT : -1")
    s.ev("__game.sim(4)")
    a = st(s)
    s.frames(5); s.shot('n41_gegner', 'n41')
    check(n >= 1 and a['state'] == 'running' and a['penalties'] >= 1 and sp > 0 and not s.errors, f"KI-Gegner ({n}): Reset → Geist-Phase ({sp:.2f} s), weiter im Rennen, Crashs {a['crashes']}, Fehler {s.errors[:3]}")
    s.close()

print('FEHLER: ' + str(len(fails)) if fails else 'Reset-Knopf im Browser ok', flush=True)
sys.exit(1 if fails else 0)
