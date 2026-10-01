# Bestzeiten gestrichen (n21) im Browser: echtes Alt-Profil per add_init_script (Bestzeiten aller Physik-/Welt-/
# Mittel-Versionen + Geister + Leicht-Zeiten), Laden → alles gelöscht, Menü ohne „alte Physik/Welt/erste Physik“,
# Einstellungen bleiben; neue Bestzeit nach Neuladen noch da (Migration nur einmal); A/B-Link wertet nicht.
import sys, json
sys.path.insert(0, 'tests')
from util import *

fails = []
def check(ok, msg):
    print(('OK   ' if ok else 'FAIL ') + msg, flush=True)
    if not ok: fails.append(msg)

OLD = {"settings": {"assist": "medium", "paint": 1234, "wreck": False, "extras": True},
       "best": {"4711-2|medium+reset@t3@w2@x@m2": {"time": 61.1, "date": "2026-09-30"}, "4711-2|medium+reset@t3@w2@x": {"time": 62.2, "date": "2026-09-29"},
                "4711-2|original+reset@t3@w2@x": {"time": 63.3, "date": "2026-09-29"}, "4711-2|medium": {"time": 64.4, "date": "2026-09-26"},
                "4711-2|medium@t2": {"time": 65.5, "date": "2026-09-27"}},
       "ghostIndex": ["4711-2|medium+reset@t3@w2@x@m2"], "timesMig": 1,
       "times": {"4711-2": [{"t": 70.5, "d": "2026-09-30", "pen": 0, "x": 1, "w": 0}, {"t": 71, "d": "2026-09-20", "old": 1}]}}
INIT = "if (!sessionStorage.getItem('n21init')) { sessionStorage.setItem('n21init', '1'); localStorage.setItem('stuntbahn.v1', %s); localStorage.setItem('stuntbahn.ghost.4711-2|medium+reset@t3@w2@x@m2', 'AAAA'); }" % json.dumps(json.dumps(OLD))

with Server() as srv, sync_playwright() as pw:
    s = Session(pw, srv.base)
    s.ctx.add_init_script(INIT)
    s.open('?nosw&seed=4711&d=2')
    st = s.ev("(() => { const S = __game.store; return { best: Object.keys(S.best).length, ghosts: Object.keys(localStorage).filter(k => k.startsWith('stuntbahn.ghost.')).length, paint: S.settings.paint, assist: S.settings.assist, times: (S.times['4711-2'] || []).map(e => e.t), reset: JSON.parse(localStorage.getItem('stuntbahn.v1')).reset }; })()")
    check(st['best'] == 0 and st['ghosts'] == 0, f"Alt-Profil: Bestzeiten und Geister gelöscht {st}")
    check(st['paint'] == 1234 and st['assist'] == 'medium' and st['times'] == [70.5] and st['reset'] == 21, f"Einstellungen + Leicht-Zeiten bleiben, Markierung gespeichert {st}")
    menu = s.ev("document.querySelector('#menu .bests').textContent")
    check(not any(w in menu for w in ('alte Physik', 'erste Physik', 'alte Welt', '1:01', '1:02', '1:04', '1:05')), f"Menü ohne alte Listen: {menu!r}")
    s.shot('bestzeiten_menue_nach_reset', 'bestzeiten')
    # Mittel-Rennen mit Autopilot → neue Bestzeit
    s.ev("__game.start({ autopilot: true })"); s.frames(4)
    for k in range(60):
        r = s.ev("__game.sim(3)")
        if r['state'] == 'finished': break
    s.frames(3)
    key = s.ev("__game.env.meta.key")
    b = s.ev(f"__game.store.best['{key}|' + __game.modeKey('medium', false)]")
    check(r['state'] == 'finished' and b and abs(b['time'] - r['time']) < 0.01, f"neue Mittel-Bestzeit gespeichert ({b})")
    s.ev("__game.toMenu()")
    s.pg.reload(); s.pg.wait_for_function("window.__app && window.__app.ready && window.__app.frames > 3", timeout=120000)
    b2 = s.ev(f"__game.store.best['{key}|' + __game.modeKey('medium', false)]")
    g2 = s.ev(f"!!localStorage.getItem('stuntbahn.ghost.{key}|' + __game.modeKey('medium', false))")
    check(b2 and b2['time'] == b['time'] and g2, f"nach Neuladen: Bestzeit + Geist bleiben (Migration nur einmal) {b2}")
    menu2 = s.ev("document.querySelector('#menu .bests').textContent")
    check('🟡' in menu2 and not any(w in menu2 for w in ('alte Physik', 'erste Physik', 'alte Welt')), f"Menü zeigt die neue Bestzeit: {menu2!r}")
    errs = list(s.errors); s.close()
    # A/B-Link: wertet nicht
    s = Session(pw, srv.base)
    s.open('?nosw&seed=4711&d=2&haft=alt')
    s.ev("__game.setAssist('medium')"); s.ev("__game.start({ autopilot: true })"); s.frames(4)
    for k in range(60):
        r = s.ev("__game.sim(3)")
        if r['state'] == 'finished': break
    s.frames(4)
    res = s.ev("document.querySelector('#result') && document.querySelector('#result').textContent")
    nb = s.ev("Object.keys(__game.store.best).length")
    check(nb == 0 and res and 'A/B' in res, f"A/B-Link ?haft=alt: keine Bestzeit gespeichert ({nb}), Ergebnis-Hinweis: {res and res[:120]!r}")
    s.shot('bestzeiten_ab_ergebnis', 'bestzeiten')
    errs += s.errors; s.close()
    check(not errs, f"0 Fehler {errs[:3]}")
print(f"{len(fails)} Fehlschläge" if fails else 'Bestzeiten-Reset: alle Prüfungen grün')
sys.exit(1 if fails else 0)
