# Deko (n28): Leistung vorher/nachher am Handy-Viewport (Pixel 7 hochkant) mit 4-facher CPU-Drosselung (CDP
# Emulation.setCPUThrottlingRate). Je Szene ≥ 10 s Bildzeiten (requestAnimationFrame) → p50/p95 in ms, dazu
# renderer.info (Draw-Calls, Dreiecke, Texturen). Grafikstufe fest (?q=2 Kino bzw. ?q=0 Einfach), damit die Automatik
# nicht mitten in der Messung umschaltet. Läufe abwechselnd vorher/nachher, nie zwei Browser gleichzeitig.
# Aufruf: python3 tests/perf_deko.py <Wurzel vorher> [Runden] [hoch|quer] [Zusatz nachher, z. B. &deko=0]
#   Wurzel vorher = '-' → nur nachher messen. Ergebnis: tests/shots/deko/perf_<dev>.json
import sys, time, json, os, statistics
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from util import *

VORHER = sys.argv[1] if len(sys.argv) > 1 else '-'
RUNDEN = int(sys.argv[2]) if len(sys.argv) > 2 else 2
DEV = sys.argv[3] if len(sys.argv) > 3 else 'hoch'
EXTRA = sys.argv[4] if len(sys.argv) > 4 else ''
SEK = float(os.environ.get('SEK', '10'))
DROSSEL = float(os.environ.get('DROSSEL', '4'))
PORT = dict(PIXEL7_LAND, viewport={"width": 412, "height": 915})
DEVICES = {'quer': PIXEL7_LAND, 'hoch': PORT}
CODE = '?nosw&seed=4711&d=3&g=1'
MEASURE = """(sec) => new Promise((res) => { const t = [], c = [], tr = []; let last = performance.now(); const t0 = last;
  const f = (now) => { t.push(now - last); last = now; const i = __game.renderer.info; c.push(i.render.calls); tr.push(i.render.triangles);
    if (now - t0 < sec * 1000) requestAnimationFrame(f); else { t.shift(); c.shift(); tr.shift(); const s = [...t].sort((a, b) => a - b);
      const q = (p) => s[Math.min(s.length - 1, Math.floor(p * s.length))];
      res({ n: t.length, p50: +q(0.5).toFixed(2), p95: +q(0.95).toFixed(2), fps: +(1000 * t.length / t.reduce((a, b) => a + b, 0)).toFixed(1),
        calls: Math.round(c.reduce((a, b) => a + b, 0) / c.length), tris: Math.round(tr.reduce((a, b) => a + b, 0) / tr.length), tex: __game.renderer.info.memory.textures }); } };
  requestAnimationFrame(f); })"""

# robust (n28): dasselbe Bild N-mal zeichnen und auf die GPU warten (gl.finish) → Zeichenzeit je Bild ohne Physik-Aufholjagd
DRAW = """(n) => { const g = __game, gl = g.renderer.getContext(), t = []; g.freeze(true);
  for (let i = 0; i < n + 3; i++) { const a = performance.now(); g.drawOnce({ run: false }); gl.finish(); if (i >= 3) t.push(performance.now() - a); }
  g.freeze(false); const s = [...t].sort((a, b) => a - b), q = (p) => s[Math.min(s.length - 1, Math.floor(p * s.length))];
  return { p50: +q(0.5).toFixed(2), p95: +q(0.95).toFixed(2), calls: g.renderer.info.render.calls, tris: g.renderer.info.render.triangles }; }"""

def run(pw, root, extra):
    out = {}
    with Server(root) as srv:
        for q in (2, 0):
            s = Session(pw, srv.base, device=DEVICES[DEV], kino=True)
            s.open(CODE + f'&q={q}' + extra)
            cdp = s.ctx.new_cdp_session(s.pg)
            s.ev("window.__app.fixTime = undefined")
            if q == 2:
                time.sleep(1.0)
                cdp.send('Emulation.setCPUThrottlingRate', {'rate': DROSSEL}); time.sleep(1.0)
                out['menu'] = s.ev(f"({MEASURE})({SEK})")
                out['menu']['draw'] = s.ev(f"({DRAW})(40)")
                cdp.send('Emulation.setCPUThrottlingRate', {'rate': 1})
            s.ev("__game.setAssist('easy')"); s.ev("__game.start({ autopilot: true })"); s.ev("__game.cam('chase')"); s.frames(3)
            s.ev("__game.sim(3.3)"); time.sleep(0.5)
            cdp.send('Emulation.setCPUThrottlingRate', {'rate': DROSSEL}); time.sleep(1.0)
            key = 'rennen' if q == 2 else 'rennen_einfach'
            out[key] = s.ev(f"({MEASURE})({SEK})")
            out[key]['draw'] = s.ev(f"({DRAW})(40)")
            if q == 2:
                cdp.send('Emulation.setCPUThrottlingRate', {'rate': 1})
                for k in range(150):
                    if s.ev("__game.sim(2.0)")['state'] == 'finished': break
                cdp.send('Emulation.setCPUThrottlingRate', {'rate': DROSSEL})
                out['ziel_film'] = s.ev(f"({MEASURE})({SEK})")   # Zielshow mit Feuerwerk, danach Highlight-Film
                out['ziel_film']['draw'] = s.ev(f"({DRAW})(40)")
            cdp.send('Emulation.setCPUThrottlingRate', {'rate': 1})
            out.setdefault('fehler', []).extend(s.errors[:3])
            s.close()
    return out

res = {'dev': DEV, 'drossel': DROSSEL, 'sek': SEK, 'vorher': [], 'nachher': []}
with sync_playwright() as pw:
    # Reihenfolge je Runde tauschen (der zweite Browser einer Runde war im Leerlauf-Vergleich gleicher Stände ~15 % schneller)
    for r in range(RUNDEN):
        order = [('vorher', VORHER, ''), ('nachher', ROOT, EXTRA)] if VORHER != '-' else [('nachher', ROOT, EXTRA)]
        if r % 2: order.reverse()
        for name, root, extra in order:
            res[name].append(run(pw, os.path.abspath(root), extra)); print(name, r, json.dumps(res[name][-1]), flush=True)
summ = {}
for k in ('menu', 'rennen', 'ziel_film', 'rennen_einfach'):
    row = {}
    for v in ('vorher', 'nachher'):
        xs = [x[k] for x in res[v] if k in x]
        if xs: row[v] = {f: round(statistics.median([a[f] for a in xs]), 2) for f in ('p50', 'p95', 'fps', 'calls', 'tris', 'tex')}
        if xs: row[v]['mittel_ms'] = round(1000 / statistics.median([a['fps'] for a in xs]), 1)
        if xs and all('draw' in a for a in xs): row[v]['draw_p50'] = round(statistics.median([a['draw']['p50'] for a in xs]), 2); row[v]['draw_p95'] = round(statistics.median([a['draw']['p95'] for a in xs]), 2)
    summ[k] = row
res['median'] = summ
os.makedirs(os.path.join(ROOT, 'tests', 'shots', 'deko'), exist_ok=True)
tag = os.environ.get('TAG', '')
json.dump(res, open(os.path.join(ROOT, 'tests', 'shots', 'deko', f'perf_{DEV}{tag}.json'), 'w'), ensure_ascii=False, indent=1)
print(json.dumps(summ, ensure_ascii=False, indent=1))
