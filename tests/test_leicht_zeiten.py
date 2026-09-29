# Leicht ohne Bestzeiten (n15) im Browser: Leicht-Rennen bis ins Ziel → „Deine Zeit“ + Liste, kein „Neue Bestzeit!“,
# keine Leicht-Bestzeit und kein Geist gespeichert, HUD/Menü ohne Leicht-Bestzeit. Danach Mittel-Rennen → Bestzeit
# und Geist wie bisher. 0 Fehler.
import sys, time, json
sys.path.insert(0, 'tests')
from util import *

ok = True
def expect(cond, msg):
    global ok
    print(('OK   ' if cond else 'FAIL ') + msg, flush=True)
    ok = ok and bool(cond)
FINISH = "() => { const G = window.__game; for (let i = 0; i < 400 && G.race.state !== 'finished'; i++) G.sim(1); return G.state(); }"
with Server() as srv, sync_playwright() as pw:
    s = Session(pw, srv.base)
    s.open('?nosw&seed=1000&d=1')
    key = s.ev("__game.env.meta.key")
    s.ev("__game.setAssist('easy')")
    s.tap('button[data-a=start]')
    st = s.ev(FINISH); s.frames(4); time.sleep(0.8)
    expect(st['state'] == 'finished', f"Leicht im Ziel ({st['time']:.2f} s)")
    txt = s.ev("document.querySelector('#result .card').innerText")
    expect('Deine Zeit' in txt and not s.ev("!!document.querySelector('#result .rec')") and 'Bestzeit' not in txt, f'Ergebnis Leicht: „Deine Zeit“, kein Bestzeit-Jubel/-Vergleich')
    items = s.ev("[...document.querySelectorAll('#result ol.times li')].map(e => e.innerText)")
    expect(len(items) == 1 and items[0].startswith(s.ev("document.querySelector('#result .rtime').textContent")), f'Liste der letzten Zeiten: {items}')
    stored = s.ev(f"() => ({{ best: Object.keys(__game.store.best).filter(k => k.startsWith('{key}|easy')), ghost: Object.keys(localStorage).filter(k => k.startsWith('stuntbahn.ghost.{key}|')), times: __game.store.timesFor('{key}') }})")
    expect(not stored['best'] and not stored['ghost'] and len(stored['times']) == 1, f'keine Leicht-Bestzeit, kein Geist gespeichert, Zeit notiert {stored}')
    s.shot('leicht_ergebnis', 'leicht')
    # zweites Leicht-Rennen: Liste wächst, neueste oben; HUD zeigt „Zuletzt“, kein Geist
    s.tap('#result [data-a=retry]'); s.frames(3)
    expect(s.ev("document.querySelector('#hud .best').textContent").startswith('Zuletzt'), 'HUD Leicht: „Zuletzt …“ statt Bestzeit')
    expect(not s.ev("__game.ghostVis.root.visible"), 'Leicht: kein Geisterauto')
    s.ev("() => window.__game.sim(3)"); st = s.ev(FINISH); s.frames(4); time.sleep(0.6)
    items = s.ev("[...document.querySelectorAll('#result ol.times li')].map(e => e.innerText)")
    expect(len(items) == 2 and s.ev("document.querySelector('#result ol.times li').classList.contains('cur')"), f'zweite Fahrt oben in der Liste (hervorgehoben): {items}')
    # Reload: Menü ohne Leicht-Bestzeit, mit „zuletzt“
    s.pg.reload(); s.pg.wait_for_function("window.__app && window.__app.ready && window.__app.frames > 3", timeout=300000); time.sleep(0.5)
    bests = s.ev("document.querySelector('#menu .bests').textContent")
    expect('🟢 –' not in bests and '🟢 0' not in bests and '🟢 1' not in bests and 'zuletzt' in bests, f'Menü: keine Leicht-Bestzeit, „zuletzt“: {bests!r}')
    s.shot('leicht_menue', 'leicht')
    # Mittel wie bisher (Autopilot fährt)
    s.ev("() => { const G = window.__game; G.setAssist('medium'); G.start({autopilot:true}); }")
    st = s.ev(FINISH); s.frames(4); time.sleep(0.8)
    expect(s.ev("!!document.querySelector('#result .rec')") and not s.ev("!!document.querySelector('#result ol.times')"), 'Mittel: „Neue Bestzeit!“, keine Zeiten-Liste')
    stored = s.ev(f"() => ({{ best: Object.keys(__game.store.best).filter(k => k.startsWith('{key}|medium')), ghost: Object.keys(localStorage).filter(k => k.startsWith('stuntbahn.ghost.{key}|medium')) }})")
    expect(len(stored['best']) == 1 and len(stored['ghost']) == 1, f'Mittel: Bestzeit + Geist gespeichert {stored}')
    s.shot('mittel_ergebnis', 'leicht')
    s.tap('#result [data-a=retry]'); s.frames(3)
    expect(s.ev("document.querySelector('#hud .best').textContent").startswith('Beste') and s.ev("__game.ghostVis.root.visible"), 'Mittel: HUD „Beste …“ und Geisterauto')
    expect(not s.errors, f'0 Fehler {s.errors[:5]}')
    s.close()
print('ERGEBNIS', 'grün' if ok else 'ROT')
sys.exit(0 if ok else 1)
