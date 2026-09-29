# Hochformat (und quer zum Vergleich): Fotos aller Bildschirme + Layout-Prüfung (nichts überlappt, nichts
# abgeschnitten, Knöpfe ≥ 48 px, sichere Ränder oben/unten). Aufruf: python3 tests/hochformat_shots.py [geräte…]
# Geräte: pixel7 iphone14 klein (hochkant), pixel7q (quer). Fotos: tests/shots/hochformat/
import sys, time, json
sys.path.insert(0, 'tests')
from util import *
from hochformat_util import DEVICES, layout_check, set_safe, fake_hud_worst

SUB = 'hochformat'
want = sys.argv[1:] or ['pixel7', 'iphone14', 'klein']
ok = True
def expect(cond, msg):
    global ok
    print(('OK   ' if cond else 'FAIL ') + msg, flush=True)
    ok = ok and bool(cond)

def check(s, name, groups=None):
    r = layout_check(s, groups)
    expect(not r['overlap'] and not r['out'] and not r['small'], f"{name}: Layout {json.dumps({k: v for k, v in r.items() if v and k != 'n'}, ensure_ascii=False)[:600]} ({r['n']} Elemente)")

with Server() as srv, sync_playwright() as pw:
    for dev in want:
        D = DEVICES[dev]
        s = Session(pw, srv.base, device=D['ctx'], dpr=D.get('shot_dpr'))
        s.open('?nosw&seed=4711&d=1')
        set_safe(s, D.get('safe'))
        p = dev
        time.sleep(1); s.shot(p + '_menue', SUB)
        check(s, p + ' Menü')
        # Menü ganz nach unten scrollen: letzte Knöpfe erreichbar
        s.ev("document.getElementById('menu').scrollTop = 1e6"); time.sleep(0.3)
        s.shot(p + '_menue_unten', SUB)
        check(s, p + ' Menü unten')
        s.ev("document.getElementById('menu').scrollTop = 0")
        for a in ['settings', 'help', 'trklib']:
            s.tap(f'#menu [data-a={a}]'); time.sleep(0.5); s.shot(f'{p}_sheet_{a}', SUB)
            check(s, f'{p} {a}')
            s.tap('#sheet [data-a=close]'); time.sleep(0.3)
        # Rennen Leicht (Bildschirmhälften), Verfolger
        s.ev("__game.store.settings.cam = 'chase'; __game.setAssist('easy')")
        s.tap('#menu [data-a=start]')
        s.ev("__game.sim(2.2)"); s.frames(3); time.sleep(0.3); s.shot(p + '_countdown', SUB)
        s.ev("__game.sim(4)"); s.frames(4); time.sleep(0.4)
        s.shot(p + '_leicht_verfolger', SUB)
        fake_hud_worst(s)
        s.frames(2); s.shot(p + '_leicht_verfolger_voll', SUB)
        check(s, p + ' Rennen Leicht (alle HUD-Teile)')
        s.ev("__game.freeze(false)")
        # Mittel (Tasten)
        s.ev("__game.setAssist('medium')"); s.frames(2)
        s.ev("__game.sim(1.5, {steer:0, throttle:1, brake:0})"); s.frames(4); time.sleep(0.3)
        fake_hud_worst(s)
        s.shot(p + '_mittel_verfolger', SUB)
        check(s, p + ' Rennen Mittel (Tasten)')
        s.ev("__game.freeze(false)")
        # Cockpit (Tasten + Hälften)
        s.tap('#hud [data-a=cam]'); s.frames(6); time.sleep(0.4)
        s.shot(p + '_mittel_cockpit', SUB)
        check(s, p + ' Cockpit Mittel', ['cockpit'])
        expect((s.ev("getComputedStyle(document.querySelector('#hud .speed')).display") == 'none') == (s.ev("__game.cockpit.mode") != 'hud'), p + ' Cockpit: Digital-Tempo nur ohne Rundinstrumente (' + s.ev("__game.cockpit.mode") + ')')
        s.ev("__game.setAssist('easy')"); s.frames(6); time.sleep(0.4)
        s.shot(p + '_leicht_cockpit', SUB)
        check(s, p + ' Cockpit Leicht', ['cockpit'])
        # Pause
        s.tap('#hud [data-a=pause]'); time.sleep(0.4); s.shot(p + '_pause', SUB)
        check(s, p + ' Pause')
        s.tap('#pause [data-a=resume]'); time.sleep(0.3)
        s.tap('#hud [data-a=cam]'); s.frames(2)
        while s.ev("__game.rig.mode") != 'chase': s.tap('#hud [data-a=cam]')
        # Ziel
        s.ev("() => { const G = window.__game; G.race.setAssist && 0; for (let i = 0; i < 400 && G.race.state !== 'finished'; i++) G.sim(1); }")
        s.frames(3); time.sleep(0.6); s.shot(p + '_ergebnis', SUB)
        expect(s.ev("__game.state().state") == 'finished', p + ' Ziel erreicht')
        check(s, p + ' Ergebnis')
        # Replay: Verfolger, Cockpit
        s.tap('#result [data-a=replay]'); time.sleep(0.3)
        s.ev("() => { const R = window.__game.replayObj; R.t = R.duration * 0.3; }"); s.frames(4); time.sleep(0.4)
        s.shot(p + '_replay_verfolger', SUB)
        check(s, p + ' Replay')
        s.tap('#replayui [data-v=cockpit]'); s.frames(6); time.sleep(0.4)
        s.shot(p + '_replay_cockpit', SUB)
        check(s, p + ' Replay Cockpit', ['cockpit'])
        s.tap('#replayui [data-v=far]'); s.frames(4); time.sleep(0.3)
        s.shot(p + '_replay_heli', SUB)
        s.tap('#replayui [data-a=rend]'); time.sleep(0.3)
        s.tap('#result [data-a=menu]'); time.sleep(0.5)
        expect(not s.errors, f'{p}: 0 Fehler {s.errors[:4]}')
        s.close()
print('ERGEBNIS', 'grün' if ok else 'ROT')
sys.exit(0 if ok else 1)
