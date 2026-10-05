# Leicht „Brachial“ (n25): Bildrate im Rennen (Hände weg, Echtzeit) Sauber gegen Brachial, abwechselnd je Runde gemessen
# (Pixel 7 quer, GPU headless; schwankt ±10–20 %, daher mehrere Durchgänge), dazu lebende Qualm-Partikel (Budget 260).
# Aufruf: python3 tests/perf_drift.py [runden=3] [sekunden=12] [seed-d=4711-2]
import sys, time, json
sys.path.insert(0, 'tests')
from util import *
N = int(sys.argv[1]) if len(sys.argv) > 1 else 3
SEC = float(sys.argv[2]) if len(sys.argv) > 2 else 12
CODE = sys.argv[3] if len(sys.argv) > 3 else '4711-2'
sd, dd = CODE.split('-')[:2]
MEASURE = """(sec) => new Promise((res) => { const t = []; let last = performance.now(); const t0 = last; let pmax = 0;
  const f = (now) => { t.push(now - last); last = now; pmax = Math.max(pmax, __game.fx.parts.alive);
    if (now - t0 < sec * 1000) requestAnimationFrame(f); else { t.shift(); t.sort((a, b) => a - b);
      res({ fps: 1000 * t.length / t.reduce((a, b) => a + b, 0), p95ms: t[Math.floor(t.length * 0.95)], parts: pmax, beta: __game.race.drift ? __game.race.drift.log.length : 0 }); } };
  requestAnimationFrame(f); })"""
out = {'sauber': [], 'brachial': []}
with Server() as srv, sync_playwright() as pw:
    s = Session(pw, srv.base)
    s.open(f'?nosw&seed={sd}&d={dd}')
    s.ev("__game.setAssist('easy')")
    for k in range(N):
        for st in ['sauber', 'brachial']:
            s.ev(f"__game.store.settings.fahrstil = '{st}'")
            s.ev("__game.start({seed: 7})"); s.frames(5); time.sleep(4.5)   # Countdown + Anfahrt
            r = s.ev(f"({MEASURE})({SEC})")
            r['fps'] = round(r['fps'], 1); r['p95ms'] = round(r['p95ms'], 1)
            out[st].append(r); print(st, json.dumps(r), flush=True)
    print('fehler', [e for e in s.errors if 'GL Driver' not in e][:5])
    s.close()
for st in out: print(st, 'Ø fps', round(sum(r['fps'] for r in out[st]) / N, 1), 'max Partikel', max(r['parts'] for r in out[st]))
