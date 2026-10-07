# Deko (n28): Ergebnis-Karte nach dem Ziel (Mittel → erste Zeit = Bestzeit, golden) – Bilder während und nach der Animation
# Aufruf: python3 tests/deko_ergebnis.py [quer|hoch] [Zusatz-URL] → tests/shots/deko/ergebnis_*.png
import sys, time, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from util import *
DEVN = sys.argv[1] if len(sys.argv) > 1 else 'quer'
EXTRA = sys.argv[2] if len(sys.argv) > 2 else ''
DEV = dict(PIXEL7_LAND, viewport={"width": 412, "height": 915}) if DEVN == 'hoch' else PIXEL7_LAND
OUT = os.path.join(ROOT, 'tests', 'shots', 'deko')
with Server() as srv, sync_playwright() as pw:
    s = Session(pw, srv.base, device=DEV)
    s.open('?nosw&seed=4711&d=3' + EXTRA)
    s.ev("__game.setAssist('medium')"); s.ev("__game.start({ autopilot: true })")
    for k in range(150):
        if s.ev("__game.sim(2.0)")['state'] == 'finished': break
    s.pg.wait_for_selector('#result.show', timeout=30000)
    for i, dt in enumerate([0.35, 0.5, 1.6]):
        time.sleep(dt); s.pg.screenshot(path=os.path.join(OUT, f'ergebnis_{DEVN}_{i}.png'))
    print('Karte', s.ev("document.querySelector('#result .card').className"), 'Fehler', s.errors[:4])
    s.close()
