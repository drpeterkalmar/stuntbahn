# Test (Peter 02.11.: „Zufallsstrecke startet in der Wiese neben der Strecke, Auto/Strecke teils schwarz“): Rennen → Ergebnis
# → 📼 Replay → ✕ → „🎲 Neue Strecke“. Vor dem Fix blieb das Spiel im Replay-Modus (newTrack-Parameter `mode` verdeckte den
# Spielmodus) und zeichnete das Auto der alten Aufzeichnung in die neue Landschaft. Soll: Menü-Modus, Auto am neuen Start.
# Aufruf: REPLAY=1 python3 tests/test_neue_strecke_nach_replay.py [skip|warte]   (ohne REPLAY: direkt aus dem Ergebnis)
import os, sys, time, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from util import Server, Session, PIXEL7_LAND
from playwright.sync_api import sync_playwright

ART = sys.argv[1] if len(sys.argv) > 1 else 'skip'
os.environ.setdefault('REPLAY', '1')
POS = """(() => { const s = __game.state(); const L = __game.env.track.line; let best = 1e9;
  for (let i = 0; i < L.n; i++) best = Math.min(best, Math.hypot(L.px[i] - s.pos[0], L.py[i] - s.pos[1], L.pz[i] - s.pos[2]));
  const car = __game.scene.getObjectByName('car'); const cp = car ? car.getWorldPosition(new car.position.constructor()) : null;
  return { mode: s.mode, state: s.state, key: s.key, pos: s.pos.map(v => +v.toFixed(1)), dLinie: +best.toFixed(2),
    carVis: cp ? [cp.x, cp.y, cp.z].map(v => +v.toFixed(1)) : null, cam: __game.camera.position.toArray().map(v => +v.toFixed(1)) }; })()"""

with Server() as srv, sync_playwright() as pw:
    s = Session(pw, srv.base, device=PIXEL7_LAND, kino=True)
    s.open('?nosw&seed=1000&d=1')
    s.ev("(() => { Object.assign(__game.store.settings, {assist:'medium', gegner:3}); __game.store.save(); })()")
    s.ev("__game.start({autopilot:true})")
    for k in range(120):
        st = s.ev("__game.sim(2.0)")
        if st['state'] == 'finished': break
    print('Ziel', st['state'], round(st['time'] or 0, 1), flush=True)
    t0 = time.time()
    while time.time() - t0 < 240:
        vis = s.ev("(() => { const b = document.querySelector('#result [data-a=next]'); return !!(b && b.offsetParent); })()")
        if vis: break
        if ART == 'skip':
            try: s.ev("__game.skipCine()")
            except Exception: pass
        time.sleep(1)
    print('Ergebnis nach', round(time.time() - t0), 's', s.ev(POS), flush=True)
    s.shot('n0_ergebnis', 'zufallstart')
    if os.environ.get('REPLAY'):
        s.tap('#result [data-a=replay]'); time.sleep(3)
        print('Replay', s.ev(POS), flush=True)
        s.tap('#replayui [data-a=rend]'); time.sleep(1)
        print('nach Replay-Ende', s.ev(POS), flush=True)
    s.tap('#result [data-a=next]')
    t0 = time.time()
    while time.time() - t0 < 300:
        if s.ev("__game.state().mode") == 'menu' and not s.ev("document.querySelector('#loading').classList.contains('show')"): break
        time.sleep(0.5)
    time.sleep(1)
    m = s.ev(POS); print('Menü', m, flush=True)
    vis_d = ((m['carVis'][0] - m['pos'][0])**2 + (m['carVis'][1] - m['pos'][1])**2 + (m['carVis'][2] - m['pos'][2])**2) ** 0.5
    fails = []
    if m['mode'] != 'menu': fails.append('Modus nach Neue Strecke = ' + m['mode'])
    if vis_d > 1 or m['dLinie'] > 6: fails.append(f'Auto nicht am Start der neuen Strecke (Abstand Bild/Physik {vis_d:.1f} m, Linie {m["dLinie"]} m)')
    s.shot('n1_menu', 'zufallstart')
    s.tap('button[data-a=start]')
    time.sleep(2); s.frames(5)
    print('Start', s.ev(POS), flush=True)
    s.shot('n2_start', 'zufallstart')
    time.sleep(4); s.frames(5)
    print('+4s', s.ev(POS), flush=True)
    s.shot('n3_lauf', 'zufallstart')
    print('errors', s.errors[:6])
    if s.errors: fails.append('Fehler im Browser')
    s.close()
print('ALLES OK' if not fails else 'FEHLER: ' + '; '.join(fails))
sys.exit(1 if fails else 0)
