# n36 Action-Momente im Browser: Optionen (Aus/Selten/Oft, Blitze reduzieren, ?action=), Eingabe in der Zeitlupe (Gas-Tipp in
# der Bullet-Time auf Mittel → Salto zählt; Lenken/Gas wirken weiter), Rennuhr läuft langsamer mit, Pause hält den Moment an,
# „Blitze reduzieren“ dämpft den Weißblitz, Effekte wieder aus nach dem Moment, keine Fehler.
import sys, time, json
sys.path.insert(0, 'tests')
from util import *
bad = 0
def ok(c, m):
    global bad
    print(('OK   ' if c else 'FAIL ') + m, flush=True)
    if not c: bad += 1
BIS = """(a) => { const G = __game; for (let i = 0; i < a.n; i++) { G.bild(1 / 60); const M = G.action && G.action.M;
  if (M && (!a.art || M.art === a.art)) return { art: M.art, u: M.u, t: G.race.time }; } return null; }"""
with Server() as srv, sync_playwright() as pw:
    s = Session(pw, srv.base)
    s.open('?nosw&seed=4711&d=2')
    # 1. Optionen
    s.tap('button[data-a=settings]')
    seg = s.ev("[...document.querySelectorAll('[data-g=action] button')].map(b => b.textContent + (b.classList.contains('on') ? '*' : ''))")
    ok(seg == ['Aus', 'Selten*', 'Oft'], f'Optionen: 🎬 Action-Momente {seg} (Standard Selten)')
    s.tap('[data-g=action] button[data-v=oft]')
    ok(s.ev("__game.store.settings.action") == 'oft', 'Oft gewählt und gespeichert')
    ok(s.ev("!!document.querySelector('button[data-a=toggle][data-v=blitzeArm]')"), 'Schalter ⚡ Blitze reduzieren da')
    s.tap('.sheetc button.big')
    # 2. Eingabe in der Bullet-Time (Mittel): Gas halten bis zum Scheitel, im Moment loslassen und kurz antippen
    s.ev("__game.setAssist('medium'); window.__app.actionRnd = () => 0")
    s.tap('button[data-a=start]')
    s.ev("__game.manuell(true)")
    s.pg.keyboard.down('ArrowUp')
    r = None
    for k in range(40):
        r = s.ev(BIS, {'n': 30, 'art': 'bullet'})
        if r: break
    ok(bool(r), f'Bullet-Time am Sprung auf Mittel: {r}')
    s.pg.keyboard.up('ArrowUp'); s.ev("__game.bild(1/60, 3)")
    s.ev("""(() => { const R = __game.race, o = R.emit.bind(R); window.__tr = []; R.emit = (t, d) => { if (t === 'trick' || t === 'trickno') window.__tr.push(t); return o(t, d); }; })()""")
    t0 = s.ev("__game.race.time"); f0 = s.ev("__game.race.stunts.cur ? __game.race.stunts.cur.flip : 0")
    # Tipp: drücken und loslassen innerhalb EINES Bilds (in der Bullet-Time liegen ~17 Bilder zwischen zwei Physikschritten)
    s.pg.keyboard.down('ArrowUp'); s.ev("__game.bild(1/60, 1)"); s.pg.keyboard.up('ArrowUp')
    s.ev("__game.bild(1/60, 40)")
    t1 = s.ev("__game.race.time"); tr = s.ev("window.__tr")
    ok(0 < t1 - t0 < 0.2, f'Rennuhr läuft in der Bullet-Time langsam mit: +{(t1 - t0):.3f} s in 0,68 s')
    ok('trick' in tr or 'trickno' in tr, f'Gas-Tipp in der Bullet-Time angenommen (Salto-Ereignis {tr})')
    # Pause hält den Moment an
    u0 = s.ev("__game.action.M ? __game.action.M.u : -1")
    s.ev("__game.freeze(true)"); s.ev("__game.bild(1/60, 20)"); u1 = s.ev("__game.action.M ? __game.action.M.u : -1")
    ok(u0 >= 0 and abs(u1 - u0) < 1e-9, f'Pause: Moment steht ({u0:.2f} → {u1:.2f})')
    s.ev("__game.freeze(false)")
    s.ev("__game.bild(1/60, 120)")
    flips = s.ev("__game.race.stunts.last ? __game.race.stunts.last.flips : null")
    ok(s.ev("__app.actionFx") is None and s.ev("document.querySelector('#actfx').classList.contains('on')") is False, f'nach dem Moment: Effekte aus (letzter Stunt halbe Saltos {flips})')
    st = s.ev("__game.action.stats()")
    print(json.dumps(st, ensure_ascii=False))
    s.ev("__game.manuell(false)")
    # 3. Blitze reduzieren + ?action=0
    s.ev("__game.store.settings.blitzeArm = true; __game.toMenu()"); time.sleep(0.5)
    s.tap('button[data-a=start]'); s.ev("__game.manuell(true)")
    ok(s.ev("__game.action.arm") is True, 'Blitze reduzieren → Regie gedämpft')
    s.ev("__game.bild(1/60, 300)"); s.ev("__game.actionStart('kopf')"); s.ev("__game.bild(1/60, 2)")
    w = s.ev("__app.actionFx && __app.actionFx.white")
    ok(w is not None and w <= 0.08, f'Weißblitz gedämpft ({w})')
    s.ev("__game.manuell(false)")
    s.open('?nosw&seed=4711&d=2&action=0')
    s.tap('button[data-a=start]'); time.sleep(1)
    ok(s.ev("__game.action.stufe") == 'aus', '?action=0 → Aus (vor der Einstellung „Oft“)')
    ok(not s.errors, f'keine Fehler {s.errors[:4]}')
    s.close()
print('Action-UI: ' + (f'{bad} FEHLER' if bad else 'alle Prüfungen grün'))
sys.exit(1 if bad else 0)
