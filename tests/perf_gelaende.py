# n22: Leistung Gelände gegen flach (gleicher Code, gleiche Blickpunkte = gleiche Anteile der Runde, Verfolger):
# Draw-Calls, Dreiecke (renderer.info), Renderzeit je Bild (gemittelt). Quality-Stufe fest 1 (Mittel).
# Aufruf: python3 tests/perf_gelaende.py [seeds…]
import sys, time, json
sys.path.insert(0, 'tests')
from util import *
seeds = [int(a) for a in sys.argv[1:]] or [4711, 20261001, 1038]
out = {}
with Server() as srv, sync_playwright() as pw:
    s = Session(pw, srv.base)
    s.open('?nosw&seed=4711&d=2')
    for seed in seeds:
        for mode in ['flat', 'gel']:
            s.ev(f"__game.newTrack({seed}, 2, '{mode}')"); s.pg.wait_for_function(f"__game.env.meta.key === '{seed}-2{'-g' if mode == 'gel' else ''}'", timeout=240000)
            s.ev("__game.quality.set && __game.quality.set(1)")
            s.ev("__game.setAssist('easy')"); s.ev("__game.start({ autopilot: true })"); s.ev("__game.sim(3.3)")
            rows = []
            for f in [0.06, 0.18, 0.31, 0.43, 0.56, 0.68, 0.81, 0.93]:
                s.ev(f"(() => {{ const g = __game, i = Math.round(g.env.track.line.n * {f}); g.freeze(true); g.teleport(i, g.env.prof.vt[i]); g.cam('chase'); }})()")
                s.ev("__game.sim(0.4)"); s.frames(6); time.sleep(0.2)
                r = s.ev("(() => { const r = __game.renderer, sc = __game.scene, c = __game.camera; const ar = r.info.autoReset; r.info.autoReset = false; r.info.reset(); r.render(sc, c); const calls = r.info.render.calls, tris = r.info.render.triangles; const t0 = performance.now(); for (let k = 0; k < 5; k++) r.render(sc, c); r.getContext().finish(); const ms = (performance.now() - t0) / 5; r.info.autoReset = ar; return [calls, tris, ms]; })()")
                rows.append(tuple(r))
            key = f'{seed}-{mode}'
            out[key] = {'calls': round(sum(r[0] for r in rows) / len(rows), 1), 'calls_max': max(r[0] for r in rows), 'tris': round(sum(r[1] for r in rows) / len(rows)), 'ms': round(sum(r[2] for r in rows) / len(rows), 2)}
            print(key, out[key], flush=True)
            s.ev("__game.freeze(false); __game.toMenu()")
    print('Fehler', s.errors[:4])
    s.close()
import os
os.makedirs('tests/out/n22', exist_ok=True)
json.dump(out, open('tests/out/n22/perf_gelaende.json', 'w'), indent=1)
