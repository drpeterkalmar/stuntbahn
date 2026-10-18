# n33: ganze Runde(n) im Browser mit dem Autopiloten (Leicht/Original) – Crashs/Zurückspulen mit Stelle und Stück-Typ.
# Aufruf: python3 tests/hindernis_runde.py "<query ohne ?>" [hilfe] [fahrstil]
import sys, time, json
sys.path.insert(0, 'tests')
from util import *
q = sys.argv[1]
hilfe = sys.argv[2] if len(sys.argv) > 2 else 'easy'
stil = sys.argv[3] if len(sys.argv) > 3 else 'brachial'
with Server() as srv, sync_playwright() as pw:
    s = Session(pw, srv.base)
    s.open(f'?nosw&q=0&{q}')
    s.ev(f"__game.setAssist('{hilfe}'); __game.store.settings.fahrstil = '{stil}'")
    s.ev("__game.start({ autopilot: true })")
    typ = s.ev("__game.env.layout.pieces.map((p) => p.type)")
    piece = s.ev("Array.from(__game.env.track.line.piece)")
    last = s.ev("__game.state()"); c0 = last['crashes'] + last['rewinds']
    t0 = time.time()
    while time.time() - t0 < 400:
        st = s.ev("__game.sim(0.25)")
        c = st['crashes'] + st['rewinds']
        if c != c0:
            i = last['idx']; print(f'  Crash/Reset bei idx {i} ({typ[piece[i]]}) t {st["time"]:.1f} s', flush=True); c0 = c
        last = st
        if st['state'] == 'finished': break
    print('Ergebnis', s.ev("__game.env.meta.key"), hilfe, stil, 'Zeit', round(last['time'], 1), 'Zustand', last['state'], 'Crashs', last['crashes'], 'Zurück', last['rewinds'], 'Fehler', s.errors[:3], flush=True)
    s.close()
