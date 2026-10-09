# Wetter (n32): Beleg „Klar = Bild wie bis n31“. Zwei Stände (Vorher-Kopie und jetzt mit ?wetter=klar&kulisse=alt) mit fester
# Zeit (app.fixTime) und fester Kamera hinter dem Auto je Landschaft fotografieren und Pixel vergleichen.
# Aufruf: python3 tests/wetter_klar_gleich.py <Wurzel vorher> [themen] [zusatz=&kulisse=alt]
import sys, os, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from util import *
import numpy as np
from PIL import Image
vorher = sys.argv[1]
themes = (sys.argv[2] if len(sys.argv) > 2 else 'land,wueste,alpen,kueste,stadt,herbst,winter').split(',')
zus = sys.argv[3] if len(sys.argv) > 3 else '&kulisse=alt'
D = os.path.join(ROOT, 'tests', 'shots', 'wetter'); os.makedirs(D, exist_ok=True)
POSE = """(() => { const g = __game, a = window.__app; a.fixTime = 12.5; a.freezeCam = true;
  const c = g.camera, p = g.race.car.pos, F = g.race.car.frame;
  c.position.set(p.x - F.f.x * 9, p.y + 3.2, p.z - F.f.z * 9); c.up.set(0, 1, 0); c.lookAt(p.x + F.f.x * 30, p.y, p.z + F.f.z * 30); c.fov = 62; c.updateProjectionMatrix(); })()"""
def run(root, extra, tag):
    out = {}
    with Server(root) as srv, sync_playwright() as pw:
        s = Session(pw, srv.base)
        s.open(f'?nosw&seed=25&d=2&g=1&thema={themes[0]}&q=2&startprobe=0&blur=off{extra}')
        for k, th in enumerate(themes):
            if k:
                s.ev("window.__app.freezeCam = false; __game.freeze(false); __game.toMenu()")
                s.ev(f"__game.setTheme('{th}')"); s.pg.wait_for_function(f"__game.theme === '{th}'", timeout=180000)
            s.ev("__game.setAssist('easy'); __game.start({ autopilot: true }); __game.freeze(true)"); s.ev("__game.sim(9.0)")
            s.ev(POSE); s.frames(40)
            p = os.path.join(D, f'gleich_{th}_{tag}.png'); s.pg.screenshot(path=p); out[th] = p
        print(tag, 'Fehler', s.errors[:4], flush=True)
        s.close()
    return out
A = run(vorher, '', 'vorher'); B = run(ROOT, '&wetter=klar' + zus, 'jetzt')
for th in themes:
    a = np.asarray(Image.open(A[th]).convert('RGB')).astype(float); b = np.asarray(Image.open(B[th]).convert('RGB')).astype(float)
    d = np.abs(a - b).max(axis=2)
    print(th, json.dumps({'mittel': round(float(d.mean()), 3), 'anteil>8': round(float((d > 8).mean()) * 100, 3), 'max': int(d.max())}))
