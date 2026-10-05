# n27 Bildrate vorher/nachher (headless über die GPU, Grafik Kino fest ?q=2): Rennen (Verfolger, Referenz), Cockpit,
# nach dem Ziel (vorher: Ergebnis über dem Auslaufen, nachher: Zielshow mit Feuerwerk), Highlight-Film. Je Szene Bilder/s
# (requestAnimationFrame) und mittlere Draw-Calls; Runden abwechselnd vorher/nachher (nie zwei Browser gleichzeitig).
# Aufruf: python3 tests/perf_zielshow.py <Wurzel vorher> [quer|desktop] [Runden]
import sys, time, json, os, statistics
sys.path.insert(0, 'tests')
from util import *

VORHER = sys.argv[1]
DEV = sys.argv[2] if len(sys.argv) > 2 else 'quer'
RUNDEN = int(sys.argv[3]) if len(sys.argv) > 3 else 2
DEVICES = {'quer': PIXEL7_LAND, 'desktop': DESKTOP}
Q = '?nosw&seed=4711&d=3&q=2'
MEASURE = """(sec) => new Promise((res) => { const t = [], c = []; let last = performance.now(); const t0 = last;
  const f = (now) => { t.push(now - last); last = now; c.push(__game.info().calls); if (now - t0 < sec * 1000) requestAnimationFrame(f); else { t.shift(); c.shift(); res([1000 * t.length / t.reduce((a, b) => a + b, 0), c.reduce((a, b) => a + b, 0) / c.length]); } };
  requestAnimationFrame(f); })"""

def run(pw, root, tag):
    out = {}
    with Server(root) as srv:
        s = Session(pw, srv.base, device=DEVICES[DEV], kino=True, dpr=float(os.environ.get('DPR') or 0) or None)
        s.open(Q)
        # STRESS=k: Renderauflösung fest k-fach (Grafikchip voll ausgelastet, sonst steht headless alles am Bildraten-Anschlag)
        if os.environ.get('STRESS'): s.ev(f"(() => {{ const r = __game.renderer; __game.quality.pixelRatio = () => {float(os.environ['STRESS'])}; r.setPixelRatio({float(os.environ['STRESS'])}); r.setSize(innerWidth, innerHeight, false); }})()")
        neu = s.ev("typeof __game.skipShow === 'function'")
        s.ev("__game.setAssist('medium')"); s.ev("__game.start({autopilot:true})"); s.ev("__game.cam('chase')"); s.frames(3)
        s.ev("__game.sim(6)"); time.sleep(1.5)
        out['rennen'] = s.ev(f"({MEASURE})(5)")
        s.ev("__game.cam('cockpit')"); time.sleep(1.5)
        out['cockpit'] = s.ev(f"({MEASURE})(5)")
        s.ev("__game.cam('chase')")
        for k in range(150):
            if s.ev("__game.sim(2.0)")['state'] == 'finished': break
        time.sleep(0.2)
        out['nach_ziel'] = s.ev(f"({MEASURE})(3.5)")   # nachher: Zielshow mit Feuerwerk; vorher: Film startet sofort
        if neu: s.ev("__game.skipShow()")
        s.frames(3); time.sleep(1.0)
        if s.ev("!!__game.cine"): out['film'] = s.ev(f"({MEASURE})(8)")
        out['fehler'] = s.errors[:5]
        s.close()
    return out

res = {'dev': DEV, 'vorher': [], 'nachher': []}
with sync_playwright() as pw:
    for r in range(RUNDEN):
        res['vorher'].append(run(pw, VORHER, 'vorher')); print('vorher', r, json.dumps(res['vorher'][-1]), flush=True)
        res['nachher'].append(run(pw, ROOT, 'nachher')); print('nachher', r, json.dumps(res['nachher'][-1]), flush=True)
summ = {}
for k in ('rennen', 'cockpit', 'nach_ziel', 'film'):
    row = {}
    for v in ('vorher', 'nachher'):
        xs = [x[k] for x in res[v] if k in x]
        if xs: row[v] = {'fps': round(statistics.median([a[0] for a in xs]), 1), 'calls': round(statistics.median([a[1] for a in xs]), 1)}
    summ[k] = row
res['median'] = summ
os.makedirs(os.path.join(ROOT, 'tests', 'shots', 'zielshow'), exist_ok=True)
json.dump(res, open(os.path.join(ROOT, 'tests', 'shots', 'zielshow', f'perf_{DEV}{"_stress" + os.environ["STRESS"] if os.environ.get("STRESS") else ""}.json'), 'w'), ensure_ascii=False, indent=1)
print(json.dumps(summ, ensure_ascii=False, indent=1))
