# n35: Netz blockiert die direkte Verbindung (kein TURN) – ehrliche Meldung statt ewigem Warten. Echte Relays, zwei Pages
# in EINEM Browser (stumm). Auf dem Test-Mac (ProtonVPN) blockiert das Netz WebRTC ohne Medien-Erlaubnis von selbst:
# Partnersuche über Nostr klappt, die direkte Verbindung nicht – genau der Fall „Firmen-/Mobilfunknetz ohne TURN“.
# Prüft: Gast bekommt nach ~10 s „… WLAN probieren“, Gastgeber nach ~15 s „Verbindung zu … nicht möglich“; Screenshot.
# Aufruf: python3 tests/test_online_blockiert.py   (ohne VPN verbindet es sich – dann meldet der Test das als Hinweis)
import sys, time
sys.path.insert(0, 'tests')
import util as U
from util import *
U.ARGS = U.ARGS + ['--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding']
bad = 0
def ok(c, m):
    global bad
    print(('OK   ' if c else 'FAIL ') + m, flush=True)
    if not c: bad += 1
HIN = "(() => { const z = __game.online.spiel && __game.online.spiel.zustand(); return JSON.stringify([(z && z.hinweise) || [], document.querySelector('#toast') ? document.querySelector('#toast').textContent : '']); })()"
with Server() as srv, sync_playwright() as pw:
    s = Session(pw, srv.base, device=PIXEL7_LAND)
    A = s.pg; B = s.ctx.new_page()
    s.open('?nosw&online=1&seed=4711&d=2')
    A.evaluate("__game.store.settings.spielerName = 'Peter'; __game.store.save()")
    s.tap('[data-a=online]'); time.sleep(0.5); s.tap('[data-a=onerstellen]')
    time.sleep(3)
    link = A.evaluate("__game.online.spiel.zustand().link")
    B.goto(link); B.wait_for_function("window.__app && window.__app.ready && window.__app.frames > 3", timeout=400000)
    B.evaluate("document.getElementById('onname').value = 'Ben'; __game.online.aktion('onbeitreten')")
    t0 = time.time(); tB = tA = None
    while time.time() - t0 < 40 and (tB is None or tA is None):
        if tB is None and 'WLAN' in B.evaluate(HIN): tB = time.time() - t0
        if tA is None and 'nicht möglich' in A.evaluate(HIN): tA = time.time() - t0
        if B.evaluate("(__game.online.spiel.zustand().mitglieder || []).length") == 2: print('HINWEIS: Verbindung kam zustande (kein blockierendes Netz) – Test nicht aussagekräftig'); break
        time.sleep(0.5)
    print('Gast:', B.evaluate(HIN)); print('Gastgeber:', A.evaluate(HIN))
    ok(tB is not None and tB < 20, f'Gast: Meldung mit „WLAN probieren“ nach {tB and round(tB)} s')
    ok(tA is not None and tA < 30, f'Gastgeber: „Verbindung zu … nicht möglich“ nach {tA and round(tA)} s')
    B.evaluate("__game.online.ansicht.zeigeStart ? null : null"); time.sleep(0.3)
    B.screenshot(path='tests/shots/n35/blockiert_gast_quer.png'); s.shot('blockiert_gastgeber_quer', 'n35')
    s.close()
print('Blockiert: ' + (f'{bad} FEHLER' if bad else 'alle Prüfungen grün'))
sys.exit(1 if bad else 0)
