# n22: Schnellblick auf eine Gelände-Strecke: Menü (Karte), Verfolger an mehreren Stellen, Hubschrauber, freie Kamera von
# oben schräg. Aufruf: python3 tests/gelaende_look.py seed stufe [quer|hoch] [tag]
import sys, time, json
sys.path.insert(0, 'tests')
from util import *
seed = int(sys.argv[1]) if len(sys.argv) > 1 else 4711
diff = int(sys.argv[2]) if len(sys.argv) > 2 else 2
mode = sys.argv[3] if len(sys.argv) > 3 else 'quer'
tag = sys.argv[4] if len(sys.argv) > 4 else ''
PIXEL7_PORT = dict(PIXEL7_LAND, viewport={"width": 412, "height": 915})
dev = PIXEL7_PORT if mode == 'hoch' else PIXEL7_LAND
SUB = 'gelaende'
name = lambda n: f'{tag}{seed}-{diff}_{n}_{mode}'
with Server() as srv, sync_playwright() as pw:
    s = Session(pw, srv.base, device=dev)
    s.open(f'?nosw&seed={seed}&d={diff}&g=1')
    print('Strecke', s.ev("__game.env.meta.key"), s.ev("JSON.stringify(__game.env.meta.elems)"), 'Fehler', s.errors[:3])
    s.frames(3); time.sleep(0.4)
    s.shot(name('menu'), SUB)
    s.ev("__game.setAssist('easy')"); s.ev("__game.start({ autopilot: true })"); s.ev("__game.sim(3.3)")
    n = s.ev("__game.env.track.line.n")
    pts = [int(n * f) for f in (0.12, 0.3, 0.47, 0.63, 0.8, 0.93)]
    for k, idx in enumerate(pts):
        s.ev(f"(() => {{ const g = __game; g.freeze(true); g.teleport({idx}, g.env.prof.vt[{idx}]); g.cam('chase'); }})()")
        s.ev("__game.sim(0.6)"); s.frames(6); time.sleep(0.4)
        s.shot(name(f'chase{k}'), SUB)
        if k % 2 == 0:
            s.ev("__game.cam('far')"); s.frames(6); time.sleep(0.3)
            s.shot(name(f'heli{k}'), SUB)
    # frei: schräg von oben über die Strecke
    s.ev("""(() => { const g = __game, L = g.env.track.line; let cx = 0, cz = 0, cy = 0; for (let i = 0; i < L.n; i++) { cx += L.px[i]; cz += L.pz[i]; cy += L.py[i]; } cx /= L.n; cz /= L.n; cy /= L.n;
      g.freeze(true); window.__app.freezeCam = true; const c = g.camera; c.position.set(cx - 420, cy + 260, cz + 420); c.up.set(0, 1, 0); c.lookAt(cx, cy - 20, cz); c.fov = 55; c.updateProjectionMatrix(); })()""")
    s.frames(6); time.sleep(0.6); s.shot(name('uebersicht'), SUB)
    print('info', s.ev("__game.info()"))
    print('Fehler', s.errors[:5])
    s.close()
