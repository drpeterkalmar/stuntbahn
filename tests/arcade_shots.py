# n37 Arcade-Fahrgefühl im Browser: Mittel mit echter Tastatur-Eingabe über die erste Schanze von 4711-2 – Vollgas
# gehalten (fliegt normal), in der Luft Gas loslassen und kurz antippen (Salto vorwärts) bzw. Pfeil rechts antippen
# (Schraube). Bildfolge Absprung → Flug → Landung + Stunt-Anzeige, quer und hochkant; vorher = ?physik=alt (Antippen tut
# nichts). Prüft: Trick angenommen, gelandet ohne Crash, Stunt-Punkte im HUD, 0 Seitenfehler.
# Aufruf: python3 tests/arcade_shots.py [quer|hoch] → tests/shots/n37/
import sys, time, json
sys.path.insert(0, 'tests')
from util import *

SEED = '?nosw&seed=4711&d=2'
SLOW = 0.2
PORTRAIT = dict(viewport={"width": 412, "height": 915}, device_scale_factor=2.625, is_mobile=True, has_touch=True,
                user_agent=PIXEL7_LAND['user_agent'])
which = sys.argv[1:] or ['quer', 'hoch']
fails = []

def air_state(s):
    return s.ev("(() => { const r = __game.race, c = r.car; return { air: c.onGround === 0, t: c.airTime, y: +c.pos.y.toFixed(2), crash: c.crash && c.crash.reason, crashes: r.crashes, trick: !!c.trick, total: r.stunts.total, last: r.stunts.last, upy: +c.frame.u.y.toFixed(2) }; })()")

def run(s, tag, key, sub):
    s.ev("__game.setAssist('medium'); __game.setLine && __game.setLine('off')")
    s.ev("__game.start({})")
    s.ev("__game.sim(3.6)")
    j = s.ev("""(() => { const e = __game.env, J = e.track.jumps[0], m = e.track.line.n - 1;
      const i = ((J.lipIdx - 60) % m + m) % m; return { lip: J.lipIdx, i, v: e.prof.vt[i] }; })()""")
    s.ev(f"__game.teleport({j['i']}, {j['v']})")
    s.ev("__game.cam('chase')")
    s.ev(f"__game.setTimeScale({SLOW})")
    s.pg.keyboard.down('ArrowUp')
    t0 = time.time(); shots = 0; tapped = False; flew = False; landed = None
    while time.time() - t0 < 60:
        st = air_state(s)
        if st['air'] and st['t'] > 0.2: flew = True
        if flew and st['air'] and not tapped and st['t'] > 0.4:
            s.pg.keyboard.up('ArrowUp'); time.sleep(0.15)
            s.pg.keyboard.down(key); time.sleep(0.35); s.pg.keyboard.up(key)   # ~0,07 s Spielzeit = Antippen
            tapped = True
            if key != 'ArrowUp': s.pg.keyboard.down('ArrowUp')
        if flew and st['air'] and st['t'] > 0.25 * (shots + 1) and shots < 9:
            s.ev("__game.freeze(true)"); s.frames(3); time.sleep(0.2)
            s.shot(f'{tag}_{shots}', sub); shots += 1
            s.ev("__game.freeze(false)")
        if flew and not st['air']:
            landed = st
            break
        time.sleep(0.03)
    s.pg.keyboard.down('ArrowUp')
    time.sleep(0.7 / SLOW)   # Abrechnung (0,4 s Spielzeit nach dem Aufsetzen)
    s.ev("__game.freeze(true)"); s.frames(3); time.sleep(0.2)
    s.shot(f'{tag}_landung', sub)
    st = air_state(s)
    s.ev("__game.freeze(false)")
    s.pg.keyboard.up('ArrowUp')
    return st, landed

with Server() as srv, sync_playwright() as pw:
    for lay in which:
        dev = PIXEL7_LAND if lay == 'quer' else PORTRAIT
        for var, q in [('neu', SEED), ('alt', SEED + '&physik=alt')]:
            for fig, key in [('salto', 'ArrowUp'), ('schraube', 'ArrowRight')]:
                if var == 'alt' and fig == 'schraube': continue
                s = Session(pw, srv.base, device=dev)
                s.open(q)
                st, landed = run(s, f'{lay}_{var}_{fig}', key, 'n37')
                ok_pts = st['total'] > 0
                print(lay, var, fig, 'gelandet' if landed else 'NICHT gelandet', 'Crashs', st['crashes'], 'Punkte', st['total'], json.dumps(st['last']), 'Fehler', s.errors[:5], flush=True)
                if st['crashes'] or not landed: fails.append(f'{lay} {var} {fig}: Crash/nicht gelandet')
                if var == 'neu' and not (st['last'] and (st['last']['flips'] >= 2 if fig == 'salto' else st['last']['rolls'] >= 2)): fails.append(f'{lay} {fig}: Trick nicht gewertet {st["last"]}')
                if var == 'alt' and st['last'] and st['last'].get('flips'): fails.append(f'{lay} alt: Salto trotz ?physik=alt')
                if not ok_pts: fails.append(f'{lay} {var} {fig}: keine Stunt-Punkte')
                if s.errors: fails.append(f'{lay} {var} {fig}: Seitenfehler {s.errors[:3]}')
                s.close()
print('FEHLER' if fails else 'OK', fails)
sys.exit(1 if fails else 0)
