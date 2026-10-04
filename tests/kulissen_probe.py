# Kulissen (n20): schnelle Sichtprüfung beim Entwickeln – je Thema Verfolger nach dem Start, Übersicht schräg von oben,
# Blick zum Horizont. Ein Browser, Thema per __game.setTheme gewechselt (prüft dabei den Wechsel).
# Aufruf: python3 tests/kulissen_probe.py [code, z. B. 4711-3-g] [thema,thema …] [quer|hoch]
import sys, time, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from util import *
code = sys.argv[1] if len(sys.argv) > 1 else '4711-3-g'
themes = (sys.argv[2] if len(sys.argv) > 2 else 'land,wueste').split(',')
mode = sys.argv[3] if len(sys.argv) > 3 else 'quer'
dev = dict(PIXEL7_LAND, viewport={"width": 412, "height": 915}) if mode == 'hoch' else PIXEL7_LAND
seed, diff, *rest = code.split('-')
q = f'seed={seed}&d={diff}' + ('&g=1' if 'g' in rest else '&3d=1' if '3d' in rest else '')
SUB = 'kulissen/probe'
OVER = """(() => { const g = __game, L = g.env.track.line; let cx = 0, cz = 0, cy = 0; for (let i = 0; i < L.n; i++) { cx += L.px[i]; cz += L.pz[i]; cy += L.py[i]; } cx /= L.n; cz /= L.n; cy /= L.n;
  g.freeze(true); window.__app.freezeCam = true; const c = g.camera; c.position.set(cx - 520, cy + 300, cz + 520); c.up.set(0, 1, 0); c.lookAt(cx, cy - 20, cz); c.fov = 55; c.updateProjectionMatrix(); })()"""
HORI = """((a) => { const g = __game, p = g.race.car.pos; g.freeze(true); window.__app.freezeCam = true; const c = g.camera;
  c.position.set(p.x, p.y + 6, p.z); c.up.set(0, 1, 0); c.lookAt(p.x + Math.cos(a) * 1000, p.y + 40, p.z + Math.sin(a) * 1000); c.fov = 62; c.updateProjectionMatrix(); })"""
with Server() as srv, sync_playwright() as pw:
    s = Session(pw, srv.base, device=dev)
    s.open(f'?nosw&{q}&thema={themes[0]}')
    for i, th in enumerate(themes):
        if i:
            s.ev("window.__app.freezeCam = false; __game.freeze(false); __game.toMenu()")
            s.ev(f"__game.setTheme('{th}')"); s.pg.wait_for_function(f"__game.theme === '{th}'", timeout=120000)
        t0 = time.time()
        s.ev("__game.setAssist('easy')"); s.ev("__game.start({ autopilot: true })"); s.ev("__game.sim(3.3)")
        s.frames(8); time.sleep(0.6)
        print(th, 'Foto', s.shot(f'{code}_{th}_start_{mode}', SUB), s.ev("__game.info()"), flush=True)
        s.ev(OVER); s.frames(6); time.sleep(0.5); print(th, 'Foto', s.shot(f'{code}_{th}_uebersicht_{mode}', SUB), s.ev("__game.info()"), flush=True)
        for k, a in enumerate([0.4, 2.2, 4.0]):
            s.ev(f"({HORI})({a})"); s.frames(6); time.sleep(0.4); s.shot(f'{code}_{th}_horizont{k}_{mode}', SUB)
    print('Fehler', s.errors[:6])
    s.close()
