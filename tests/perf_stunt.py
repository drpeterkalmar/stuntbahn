# n26 Stunt-Größe: Leistung vorher/nachher an den Bauwerken – je Stunt der Galerie (Auto im Bauwerk, Verfolger) die
# GPU-Bildzeit (Median, Szene angehalten, ganzes Bild wie im Spiel), Draw-Calls, Dreiecke; dazu die echte Bildrate (rAF
# entsperrt) über 12 s Autopilot-Fahrt auf einer Gelände-Strecke. Pixel 7 quer, Grafikstufe Standard und Kino; vorher und
# nachher abwechselnd (Hintergrundlast trifft beide gleich).
# Aufruf: python3 tests/perf_stunt.py <vorher-Wurzel> [Stufen 1,2]   → tests/out/n26/perf.jsonl
import os, sys, time, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import util
from util import Server, Session, PIXEL7_LAND, ROOT
util.ARGS = util.ARGS + ['--disable-gpu-vsync', '--disable-frame-rate-limit']
from playwright.sync_api import sync_playwright

old = os.path.abspath(sys.argv[1])
tiers = [int(t) for t in (sys.argv[2] if len(sys.argv) > 2 else '1,2').split(',')]
MEASURE = """([n]) => { const G = window.__game, r = G.renderer, gl = r.getContext(), px = new Uint8Array(4); G.freeze(true); const ts = []; let info = null;
  for (let k = 0; k < n + 3; k++) { const t0 = performance.now(); r.info.reset(); G.drawOnce({ run: true, speed: 40 }); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
    if (k >= 3) ts.push(performance.now() - t0); if (k === 3) info = { calls: r.info.render.calls, tris: r.info.render.triangles }; }
  G.freeze(false); ts.sort((a, b) => a - b); return { ms: +ts[ts.length >> 1].toFixed(2), ...info }; }"""
FPS = """(sec) => new Promise((res) => { const G = window.__game; let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 < sec * 1000) requestAnimationFrame(f); else res(+(n / sec).toFixed(1)); }; requestAnimationFrame(f); })"""
STUNTS = [('loop', 'L.loop[i] && c.frame.u.y < -0.5'), ('tube', 'L.tube[i]'), ('tr_corklr', 'L.loop[i]'), ('jump', 'c.onGround === 0 && c.airTime > 0.4'), ('wall', 'c.frame.u.y < 0.6'), ('waves', 'c.onGround === 0')]
os.makedirs(os.path.join(ROOT, 'tests/out/n26'), exist_ok=True)
outf = open(os.path.join(ROOT, 'tests/out/n26/perf.jsonl'), 'a')

def run(pw, root, label, tier):
    res = {'label': label, 'tier': tier, 'stunts': {}}
    with Server(root) as srv:
        s = Session(pw, srv.base, device=PIXEL7_LAND)
        s.pg.goto(srv.base + f'index.html?nosw&q={tier}&gallery&blur=off'); s.pg.wait_for_function("window.__app && window.__app.ready && window.__app.frames > 3", timeout=300000)
        s.ev("__game.setAssist('easy'); __game.store.settings.fahrstil = 'sauber'"); s.ev("__game.start({autopilot: true})"); s.ev("__game.sim(3.6)")
        for typ, cond in STUNTS:
            j = s.ev("""(t) => { const T = __game.env.track, L = T.line, k = T.pieces.findIndex((p) => p.type === t); if (k < 0) return null; const P = T.pieces[k]; let j = P.lineStart, acc = 0; while (acc < 60) { const q = j - 1; acc += Math.hypot(L.px[j] - L.px[q], L.pz[j] - L.pz[q]); j = q; } return [j, __game.env.prof.vt[j], k]; }""", typ)
            if not j: continue
            s.ev(f"__game.teleport({j[0]}, {j[1]}); __game.race.stuckProg = -1e9")
            for k in range(1200):
                st = s.ev(f"(() => {{ const g = __game, r = g.race, c = r.car, L = g.env.track.line, i = r.tracker.idx, P = g.env.track.pieces[{j[2]}]; return i >= P.lineStart && i <= P.lineEnd && ({cond}); }})()")
                if st: break
                s.ev("__game.sim(1/60)"); s.frames(1)
            s.frames(4)
            res['stunts'][typ] = s.ev(MEASURE, [20])
        s.pg.goto(srv.base + f'index.html?nosw&q={tier}&seed=4711&d=3&g=1&blur=off'); s.pg.wait_for_function("window.__app && window.__app.ready && window.__app.frames > 3", timeout=300000)
        s.ev("__game.setAssist('easy'); __game.start({autopilot: true})"); time.sleep(4)
        res['fps'] = s.ev(FPS, 12)
        res['errors'] = s.errors[:4]
        s.close()
    print(json.dumps(res), flush=True); outf.write(json.dumps(res) + '\n'); outf.flush()
    return res

with sync_playwright() as pw:
    for tier in tiers:
        for rep in range(2):
            for root, label in ([(old, 'vorher'), (ROOT, 'nachher')] if rep == 0 else [(ROOT, 'nachher'), (old, 'vorher')]):
                run(pw, root, label, tier)
