# Deko (n28): Himmel je Landschaft – Blick vom Start schräg nach oben zur Sonne und weg von ihr (Wolken, Vögel).
# Aufruf: python3 tests/deko_himmel.py [themen, z. B. alpen,wueste] [hoch|quer] [Zusatz-URL] → tests/shots/deko/himmel_*.png
import sys, time, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from util import *
TH = (sys.argv[1] if len(sys.argv) > 1 else 'alpen,wueste,kueste,stadt,herbst,winter,land').split(',')
DEVN = sys.argv[2] if len(sys.argv) > 2 else 'hoch'
EXTRA = sys.argv[3] if len(sys.argv) > 3 else ''
DEV = dict(PIXEL7_LAND, viewport={"width": 412, "height": 915}) if DEVN == 'hoch' else PIXEL7_LAND
OUT = os.path.join(ROOT, 'tests', 'shots', 'deko')
LOOK = """((a) => { const g = __game, p = g.race.car.pos, s = g.scene.getObjectByName('sun') || null; g.freeze(true); window.__app.freezeCam = true; const c = g.camera;
  const d = g.scene.children.find((o) => o.isDirectionalLight).userData.dir; const yaw = Math.atan2(d.z, d.x) + a;
  c.position.set(p.x, p.y + 3, p.z); c.up.set(0, 1, 0); c.lookAt(p.x + Math.cos(yaw) * 100, p.y + 3 + 32, p.z + Math.sin(yaw) * 100); c.fov = 62; c.updateProjectionMatrix(); })"""
with Server() as srv, sync_playwright() as pw:
    s = Session(pw, srv.base, device=DEV)
    s.open(f'?nosw&seed=4711&d=3&g=1&thema={TH[0]}{EXTRA}')
    s.ev("window.__app.fixTime = 40")
    for i, th in enumerate(TH):
        if i:
            s.ev("window.__app.freezeCam = false; __game.freeze(false); __game.toMenu()")
            s.ev(f"__game.setTheme('{th}')"); s.pg.wait_for_function(f"__game.theme === '{th}'", timeout=120000)
        s.ev("__game.setAssist('easy')"); s.ev("__game.start({ autopilot: true })"); s.ev("__game.sim(3.3)"); s.frames(4)
        for k, a in enumerate([0.35, 2.6]):
            s.ev(f"({LOOK})({a})"); s.frames(5); time.sleep(0.3)
            s.pg.screenshot(path=os.path.join(OUT, f'himmel_{th}_{k}_{DEVN}.png'))
    print('Fehler', s.errors[:5])
    s.close()
