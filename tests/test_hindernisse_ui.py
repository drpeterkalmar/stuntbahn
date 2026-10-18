# n33 Hindernisse im Menü (Browser): Strecke des Tages hat das „h“ im Code, Hinweis-Toast nur für bisherige Spieler und nur
# einmal, Code-Eingabe mit/ohne „h“ (Version 2 / Version 1 – gleiches Layout wie vorher), Bestzeit eines alten Codes bleibt,
# Menü-Zeile mit Symbol und Namen der neuen Elemente, 0 Seitenfehler. Aufruf: python3 tests/test_hindernisse_ui.py
import sys, time, json
sys.path.insert(0, 'tests')
from util import *
fails = 0
def check(ok, msg):
    global fails
    print(('OK   ' if ok else 'FAIL ') + msg, flush=True)
    if not ok: fails += 1
TOAST = "(() => [...document.querySelectorAll('.toast, #toast')].map((e) => e.textContent).join(' | '))()"
with Server() as srv, sync_playwright() as pw:
    # 1) Neu installiert: kein Hinweis, Strecke des Tages mit „h“
    s = Session(pw, srv.base)
    s.open('?nosw')
    key = s.ev("__game.env.meta.key")
    check(key.endswith('h'), f'Strecke des Tages (neu installiert): Code {key} endet auf „h“')
    time.sleep(1.5)
    check('Neue Hindernisse' not in s.ev(TOAST), 'neu installiert: kein Hinweis-Toast')
    # 2) Bisheriger Spieler (Speicherstand von vor n33, mit Bestzeit auf einem alten Code)
    s.ev("""(() => { const d = JSON.parse(localStorage.getItem('stuntbahn.v1') || '{}'); d.hindSeen = 29; d.settings = d.settings || {};
      d.best = { ...(d.best || {}), '4711-2-g|medium|w0|x1': { time: 77.7, date: '2026-10-01', name: 'Peter', pen: 0 } };
      localStorage.setItem('stuntbahn.v1', JSON.stringify(d)); })()""")
    s.pg.reload(); s.pg.wait_for_function("window.__app && window.__app.ready && window.__app.frames > 3", timeout=300000)
    t = ''
    for _ in range(30):
        time.sleep(0.5); t = s.ev(TOAST)
        if 'Neue Hindernisse' in t: break
    check('Neue Hindernisse' in t and '„h“' in t, f'bisheriger Spieler: Hinweis-Toast „{t[:90]}…“')
    st = s.ev("JSON.parse(localStorage.getItem('stuntbahn.v1'))")
    check(st.get('hindSeen') == 33 and '4711-2-g|medium|w0|x1' in st.get('best', {}), 'Hinweis gemerkt (hindSeen 33), Bestzeit des alten Codes 4711-2-g bleibt')
    s.pg.reload(); s.pg.wait_for_function("window.__app && window.__app.ready && window.__app.frames > 3", timeout=300000)
    time.sleep(3); t2 = s.ev(TOAST)
    check('Neue Hindernisse' not in t2, 'nach dem nächsten Laden kein zweiter Hinweis')
    # 3) Code-Eingabe: ohne „h“ = Version 1, mit „h“ = Version 2 (neue Elemente möglich)
    for code, gv in (('3194-3', 1), ('3194-3-h', 2), ('3000-3-g', 1), ('3000-3-gh', 2)):
        s.pg.once('dialog', lambda d, c=code: d.accept(c))
        s.tap('[data-a="code"]')
        s.pg.wait_for_function(f"window.__game.env && window.__game.env.meta.key === '{code}'", timeout=120000)
        typen = s.ev("__game.env.layout.pieces.map((p) => p.type)")
        neu = [t for t in typen if t in ('zigzag', 'zigzag2', 'tube_wall')]
        check((gv == 1 and not neu) or (gv == 2 and len(neu) > 0), f'Code {code}: Version {gv}, neue Elemente {sorted(set(neu)) or "keine"}')
    zeile = s.ev("(() => { const e = document.querySelector('#menu') || document.body; return e.innerText; })()")
    check(any(w in zeile for w in ('Zickzack', 'Röhre mit Wand', '🚧', '🔄')), 'Menü nennt die neuen Elemente (Symbol/Name) bei 3000-3-gh')
    check(not s.errors, f'0 Seitenfehler ({s.errors[:3]})')
    s.close()
print('\n' + (f'{fails} FEHLER' if fails else 'alles OK'))
sys.exit(1 if fails else 0)
