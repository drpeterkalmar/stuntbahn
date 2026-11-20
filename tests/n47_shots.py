# n47 Sicht-Prüfung: feste Posen (Start, Kurve, TV-Kamera, Hochformat) im Look des Vorbilds „Uno com escada“.
# Aufruf: py tests/n47_shots.py <tag> [Zusatz-URL, z. B. &look=alt]  → tests/shots/n47/<tag>_*.png
import sys, time, os
sys.path.insert(0, 'tests')
from util import *

TAG = sys.argv[1] if len(sys.argv) > 1 else 'neu'
EXTRA = sys.argv[2] if len(sys.argv) > 2 else ''
Q = '?nosw&seed=4711&d=2&q=2' + EXTRA
PORT = dict(PIXEL7_LAND, viewport={"width": 412, "height": 915})
DESK = dict(viewport={"width": 1600, "height": 900}, device_scale_factor=1)

def still(s, w=0.5):
    s.ev("__game.setTimeScale(0.0005)"); s.frames(4); time.sleep(w)

def run(dev, posen):
    s = Session(pw, srv.base, device=dev)
    s.open(Q)
    s.ev("__game.start({seed: 7})"); s.ev("__game.setAssist && __game.setAssist('easy')")
    out = []
    for name, simt, cam in posen:
        s.ev("__game.setTimeScale(1)"); s.ev(f"__game.cam('{cam}')")
        if simt: s.ev(f"__game.sim({simt})")
        s.frames(30); still(s)
        out.append(s.shot(f'{TAG}_{name}', 'n47'))
    print(TAG, 'Fehler:', s.errors[:3], flush=True)
    s.close()
    return out

with Server() as srv, sync_playwright() as pw:
    run(DESK, [('start', 0, 'chase'), ('kurve', 9, 'chase'), ('tv', 3, 'tv'), ('tv2', 6, 'tv')])
    run(PORT, [('hoch', 9, 'chase')])
