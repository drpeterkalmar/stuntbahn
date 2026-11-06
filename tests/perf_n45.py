# n45 Arcade-Drift: Bildrate im Rennen (Mittel, 5 Gegner, Autopilot fährt, Echtzeit) mit Arcade-Drift gegen ohne (Stärke 0 = Darstellung
# aus, gleiche Fahrt), abwechselnd je Runde (Pixel 7 quer bzw. hoch, GPU headless, stumm; schwankt, daher mehrere Durchgänge).
# Aufruf: python3 tests/perf_n45.py [quer|hoch] [runden=3] [sekunden=12]
import sys, time, json
sys.path.insert(0, 'tests')
from util import *
DEV = sys.argv[1] if len(sys.argv) > 1 else 'quer'
N = int(sys.argv[2]) if len(sys.argv) > 2 else 3
SEC = float(sys.argv[3]) if len(sys.argv) > 3 else 12
PIXEL7_PORT = dict(PIXEL7_LAND, viewport={"width": 412, "height": 915})
MEASURE = """(sec) => new Promise((res) => { const t = []; let last = performance.now(); const t0 = last; let pmax = 0, bq = 0, n = 0;
  const f = (now) => { t.push(now - last); last = now; pmax = Math.max(pmax, __game.fx.parts.alive); const a = __game.race.car.arcade; n++; if (a && Math.abs(a.beta) > 0.2) bq++;
    if (now - t0 < sec * 1000) requestAnimationFrame(f); else { t.shift(); t.sort((a, b) => a - b);
      res({ fps: 1000 * t.length / t.reduce((a, b) => a + b, 0), p95ms: t[Math.floor(t.length * 0.95)], parts: pmax, quer: bq / n }); } };
  requestAnimationFrame(f); })"""
out = {'aus': [], 'an': []}
with Server() as srv, sync_playwright() as pw:
    s = Session(pw, srv.base, device=PIXEL7_LAND if DEV == 'quer' else PIXEL7_PORT)
    s.open('?nosw&seed=4711&d=2&gegner=5&staerke=ebenbuertig')
    s.ev("__game.setAssist('medium')")
    for k in range(N):
        for m in ['aus', 'an']:
            s.ev("__game.start({seed: 7})"); s.frames(3)
            s.ev(f"(() => {{ const r = __game.race; r.autopilotOnly = true; r.arcadeAuch = true; }})()")
            s.ev(f"import('./src/core/arcadedrift.js').then((m) => {{ m.ARCADE_DRIFT.k = {0 if m == 'aus' else 1}; }})")
            s.frames(5); time.sleep(4.5)
            r = s.ev(f"({MEASURE})({SEC})")
            r['fps'] = round(r['fps'], 1); r['p95ms'] = round(r['p95ms'], 1); r['quer'] = round(r['quer'], 2)
            out[m].append(r); print(m, json.dumps(r), flush=True)
    print('fehler', [e for e in s.errors if 'GL Driver' not in e][:5])
    s.close()
for m in out: print(m, 'Ø fps', round(sum(r['fps'] for r in out[m]) / N, 1), 'Ø p95', round(sum(r['p95ms'] for r in out[m]) / N, 1), 'max Partikel', max(r['parts'] for r in out[m]))
