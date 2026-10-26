# n40 Optionen im Browser (hoch/quer): „Zuschauer: Tiere/Menschen“ baut die Welt um (Tier- bzw. Menschen-Material in der Szene),
# „Zieljubel: Stunt/Dreher/Aus“ wird gespeichert und gilt im nächsten Rennen; Standard ohne Einstellung/Link = Tiere + Stunt;
# nach Neuladen bleibt die Wahl, ?zuschauer=/?zieljubel= haben Vorrang. Fotos: tests/shots/n40/menu_*.png
import sys, os, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from util import *
ok = True
def expect(c, m):
    global ok
    print(('OK   ' if c else 'FAIL ') + m, flush=True); ok = ok and bool(c)
MAT = """(() => { const n = {}; __game.scene.traverse((o) => { const m = o.material; if (o.isMesh && m && m.userData && m.userData.uFanFade) { const k = o.geometry.attributes.aMask ? 'tiere' : 'menschen'; n[k] = (n[k] || 0) + 1; } }); return n; })()"""
Q = '?nosw&seed=4711&d=2&g=1&q=1&startprobe=0'
with Server() as srv, sync_playwright() as pw:
    for mode, vp in (('hoch', {'width': 412, 'height': 915}), ('quer', {'width': 915, 'height': 412})):
        s = Session(pw, srv.base, device=dict(PIXEL7_LAND, viewport=vp))
        s.open(Q); time.sleep(1)
        expect(s.ev("__game.store.settings.zuschauer") == 'tiere' and s.ev("__game.store.settings.zieljubel") == 'stunt', f'{mode}: Standard Tiere + Stunt')
        m0 = s.ev(MAT); expect(m0.get('tiere'), f'{mode}: Szene mit Tier-Figuren {m0}')
        s.tap('button[data-a="settings"]'); time.sleep(0.4)
        s.ev("document.querySelector('button[data-a=\"zuschauer\"]').scrollIntoView({block: 'center'})"); time.sleep(0.3)
        s.shot(f'menu_{mode}', 'n40')
        s.tap('button[data-a="zuschauer"][data-v="mensch"]')
        t0 = time.time()
        while time.time() - t0 < 30 and s.ev(MAT).get('tiere'): time.sleep(0.3)
        time.sleep(0.5)
        m1 = s.ev(MAT); expect(m1.get('menschen') and not m1.get('tiere'), f'{mode}: Menschen gewählt → Welt neu mit Menschen {m1}')
        expect(s.ev("(() => { const b = document.querySelector('button[data-a=zieljubel]'); return !!b && b.offsetParent !== null; })()"), f'{mode}: danach wieder in den Optionen')
        s.tap('button[data-a="zieljubel"][data-v="aus"]'); time.sleep(0.3)
        expect(s.ev("__game.store.settings.zieljubel") == 'aus', f'{mode}: Zieljubel Aus gespeichert')
        s.ev("document.querySelector('button[data-a=\"zieljubel\"]').scrollIntoView({block: 'center'})"); time.sleep(0.3)
        s.shot(f'menu_wahl_{mode}', 'n40')
        st = s.ctx.storage_state(); s.close()
        s = Session(pw, srv.base, device=dict(PIXEL7_LAND, viewport=vp), storage=st)
        s.open(Q); time.sleep(0.5)
        m2 = s.ev(MAT); expect(m2.get('menschen') and not m2.get('tiere'), f'{mode}: nach Neuladen Menschen {m2}')
        s.ev("__game.setAssist('easy')"); s.ev("__game.start()"); s.frames(3)
        expect(s.ev("__game.race.zieljubel") == 'aus', f'{mode}: Rennen mit Zieljubel Aus')
        s.close()
        s = Session(pw, srv.base, device=dict(PIXEL7_LAND, viewport=vp), storage=st)
        s.open(Q + '&zuschauer=tiere&zieljubel=dreher'); time.sleep(0.5)
        m3 = s.ev(MAT); s.ev("__game.setAssist('easy')"); s.ev("__game.start()"); s.frames(3)
        expect(m3.get('tiere') and s.ev("__game.race.zieljubel") == 'dreher', f'{mode}: Link-Zusatz hat Vorrang {m3}')
        expect(not s.errors, f'{mode}: 0 Fehler {s.errors[:3]}')
        s.close()
print('ERGEBNIS', 'OK' if ok else 'FEHLER')
sys.exit(0 if ok else 1)
