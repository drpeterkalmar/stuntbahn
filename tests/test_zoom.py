# Kein versehentlicher Doppeltipp-Zoom (n15). Pixel 7 hochkant (Chromium, Touch-Emulation):
# 1) Jeder Scrollbereich (overflow auto/scroll) hat touch-action ≠ auto, jedes input/select ≥ 16 px Schrift –
#    in Menü, Streckenliste (mit aufgeklappter Sammlung), Optionen, Pause, Ergebnis.
# 2) CDP Input.synthesizeTapGesture (tapCount 2) auf Menü, Streckenliste, Pause-Blatt, im Rennen auf HUD-Knopf und
#    Touch-Taste → visualViewport.scale bleibt 1.
# 3) Zwei schnelle Taps auf eine Touch-Taste (GAS) = 2 Auslösungen (pointerdown), Doppel-Tap-Geste ebenso.
# 4) iOS-Abwehr vorhanden: gesturestart/dblclick werden abgefangen (defaultPrevented).
# Ehrlich: Chromium hält sich ohnehin an user-scalable=no – echtes iOS-Verhalten nur am iPhone prüfbar.
import sys, time
sys.path.insert(0, 'tests')
from util import *

ok = True
def expect(cond, msg):
    global ok
    print(('OK   ' if cond else 'FAIL ') + msg, flush=True)
    ok = ok and bool(cond)

AUDIT = r"""() => {
  const bad = [], small = []; let n = 0;
  for (const e of document.querySelectorAll('body *')) {
    const st = getComputedStyle(e);
    if (/(auto|scroll)/.test(st.overflowY + ' ' + st.overflowX) && e.offsetParent !== null) { n++; if (st.touchAction === 'auto') bad.push((e.id ? '#' + e.id : '') + '.' + String(e.className).replace(/ /g, '.')); }
  }
  for (const e of document.querySelectorAll('input, select, textarea')) { const f = parseFloat(getComputedStyle(e).fontSize); if (e.type !== 'file' && f < 16) small.push(e.className + ' ' + f); }
  return { n, bad, small };
}"""
PORT = dict(PIXEL7_LAND, viewport={"width": 412, "height": 915})
with Server() as srv, sync_playwright() as pw:
    s = Session(pw, srv.base, device=PORT)
    s.open('?nosw&seed=4711&d=1')
    cdp = s.ctx.new_cdp_session(s.pg)
    def dtap(x, y, count=2):
        cdp.send('Input.synthesizeTapGesture', {'x': x, 'y': y, 'tapCount': count, 'gestureSourceType': 'touch'})
        time.sleep(0.5)
        return s.ev("visualViewport.scale")
    def center(sel):
        b = s.pg.locator(sel).first.bounding_box(); return b['x'] + b['width'] / 2, b['y'] + b['height'] / 2
    def audit(where):
        a = s.ev(AUDIT)
        expect(not a['bad'] and not a['small'], f'{where}: {a["n"]} Scrollbereiche mit touch-action, Eingaben ≥ 16 px {a}')
    audit('Menü')
    expect(dtap(*center('#menu .track .tname')) == 1, 'Menü: Doppeltipp auf Streckenkarte → kein Zoom')
    expect(dtap(206, 880) == 1, 'Menü: Doppeltipp unten (Scrollbereich) → kein Zoom')
    s.tap('#menu [data-a=trklib]'); time.sleep(0.5)
    s.tap('#sam .samhead'); s.pg.wait_for_selector('#sam .samlist .trk', timeout=30000); time.sleep(0.5)
    audit('Streckenliste + Sammlung')
    expect(dtap(*center('#sheet .sambody .samday .ti')) == 1, 'Streckenliste: Doppeltipp auf Eintrag → kein Zoom')
    expect(dtap(*center('#sheet h2')) == 1, 'Streckenliste: Doppeltipp auf Titel → kein Zoom')
    s.tap('#sheet [data-a=close]'); time.sleep(0.3)
    s.tap('#menu [data-a=settings]'); time.sleep(0.4); audit('Optionen'); s.tap('#sheet [data-a=close]'); time.sleep(0.3)
    # Rennen (Mittel → Touch-Tasten)
    s.ev("__game.setAssist('medium')"); s.tap('[data-a=start]'); s.ev("__game.sim(3.3)"); s.frames(5)
    s.ev("""() => { window.__gasN = 0; document.querySelector('#touch .tb.gas').addEventListener('pointerdown', () => window.__gasN++, true); }""")
    x, y = center('#touch .tb.gas')
    sc = dtap(x, y)
    n1 = s.ev("window.__gasN")
    expect(sc == 1 and n1 == 2, f'GAS: Doppel-Tap-Geste → kein Zoom, 2 Auslösungen ({n1})')
    # zwei schnelle einzelne Taps (70 ms Abstand)
    for k in range(2):
        cdp.send('Input.dispatchTouchEvent', {'type': 'touchStart', 'touchPoints': [{'x': x, 'y': y}]}); time.sleep(0.03)
        cdp.send('Input.dispatchTouchEvent', {'type': 'touchEnd', 'touchPoints': []}); time.sleep(0.04)
    time.sleep(0.3)
    n2 = s.ev("window.__gasN") - n1
    expect(n2 == 2 and s.ev("visualViewport.scale") == 1, f'GAS: zwei schnelle Taps = 2 Auslösungen ({n2}), kein Zoom')
    expect(not s.ev("window.__touchState.active"), 'danach keine hängende Taste')
    line0 = s.ev("__game.store.settings.line")
    expect(dtap(*center('#hud [data-a=linetoggle]')) == 1 and s.ev("__game.store.settings.line") == line0, 'HUD-Knopf Ideallinie: Doppeltipp → kein Zoom, zweimal umgeschaltet (wieder wie vorher)')
    expect(dtap(206, 400) == 1, 'Rennen: Doppeltipp ins Bild → kein Zoom')
    audit('Rennen')
    s.tap('#hud [data-a=pause]'); time.sleep(0.4)
    audit('Pause')
    expect(dtap(*center('#pause h2')) == 1, 'Pause-Blatt: Doppeltipp → kein Zoom')
    # iOS-Abwehr: gesturestart/dblclick werden verhindert
    pv = s.ev("""() => { const g = new Event('gesturestart', { cancelable: true }); document.body.dispatchEvent(g);
      const d = new MouseEvent('dblclick', { cancelable: true, bubbles: true }); document.body.dispatchEvent(d); return [g.defaultPrevented, d.defaultPrevented]; }""")
    # gesturestart bubbelt nicht vom body → direkt auf document prüfen
    pv2 = s.ev("() => { const g = new Event('gesturestart', { cancelable: true }); document.dispatchEvent(g); return g.defaultPrevented; }")
    expect(pv2 and pv[1], f'iOS: gesturestart und dblclick abgefangen ({pv2}, {pv[1]})')
    s.tap('#pause [data-a=resume]'); time.sleep(0.3)
    s.ev("() => { const G = window.__game; G.start({autopilot:true}); for (let i = 0; i < 400 && G.race.state !== 'finished'; i++) G.sim(1); }")
    s.frames(4); time.sleep(0.6)
    audit('Ergebnis')
    expect(dtap(*center('#result .rtime')) == 1, 'Ergebnis: Doppeltipp → kein Zoom')
    expect(not s.errors, f'0 Fehler {s.errors[:5]}')
    s.close()
print('ERGEBNIS', 'grün' if ok else 'ROT')
sys.exit(0 if ok else 1)
