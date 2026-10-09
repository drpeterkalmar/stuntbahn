# Tageszeit (n32): Rennen bis ins Ziel bei Nacht mit Zielshow und Highlight-Film (Kino-Replay) – 0 Fehler, Fotos.
import sys, os, json, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from util import *
z = sys.argv[1] if len(sys.argv) > 1 else 'nacht'
with Server() as srv, sync_playwright() as pw:
    s = Session(pw, srv.base, kino=True)
    s.open(f'?nosw&seed=4711&d=1&q=2&startprobe=0&zeit={z}&wetter=regen')
    s.ev("__game.setAssist('easy'); __game.start({ autopilot: true })")
    st = None
    for k in range(120):
        st = s.ev("__game.sim(2.0)")
        if st['state'] in ('finished', 'show') or s.ev("__game.mode") != 'race': break
    print('Zustand', st['state'], s.ev("__game.mode"), flush=True)
    for k in range(4):
        time.sleep(1.2); s.frames(5); s.shot(f'film_{z}_{k}', 'zeit')
    print('Modus', s.ev("__game.mode"), 'Fehler', s.errors[:5])
    s.close()
