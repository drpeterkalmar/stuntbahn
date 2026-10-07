# Deko (n28): Kosten der neuen Effekte im direkten A/B-Wechsel in DERSELBEN Seite (gleicher Browser, gleiche Szene,
# Szene angehalten → keine Physik-Aufholjagd): Deko an/aus abwechselnd je SEK s, RUNDEN-mal. „aus“ = Himmel ohne Wolken
# und wieder zuerst gezeichnet, ohne Vögel, Luft-Teilchen, Bremslichter, Wiesenblumen/-flecken (wie bis n29).
# Modi: DROSSEL (CPU 4×, Standard) oder STRESS=k (Renderauflösung k-fach, Grafikchip voll ausgelastet, ohne Drossel).
# Aufruf: python3 tests/perf_deko_ab.py [hoch|quer] [q=2|0] [Runden] → tests/shots/deko/perf_ab_<…>.json
import sys, time, json, os, statistics
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from util import *
DEVN = sys.argv[1] if len(sys.argv) > 1 else 'hoch'
Q = int(sys.argv[2]) if len(sys.argv) > 2 else 2
RUNDEN = int(sys.argv[3]) if len(sys.argv) > 3 else 6
SEK = float(os.environ.get('SEK', '4'))
STRESS = float(os.environ.get('STRESS', '0'))
DROSSEL = 1 if STRESS else float(os.environ.get('DROSSEL', '4'))
DEV = dict(PIXEL7_LAND, viewport={"width": 412, "height": 915}) if DEVN == 'hoch' else PIXEL7_LAND
THEMA = os.environ.get('THEMA', '')
MEASURE = """(sec) => new Promise((res) => { const t = []; let last = performance.now(); const t0 = last;
  const f = (now) => { t.push(now - last); last = now; if (now - t0 < sec * 1000) requestAnimationFrame(f); else { t.shift(); const s = [...t].sort((a, b) => a - b);
    const q = (p) => s[Math.min(s.length - 1, Math.floor(p * s.length))]; res({ p50: q(0.5), p95: q(0.95), mean: t.reduce((a, b) => a + b, 0) / t.length, calls: __game.renderer.info.render.calls }); } };
  requestAnimationFrame(f); })"""
SET = """(on) => { const g = __game, sky = g.scene.getObjectByName('sky'), U = sky.material.uniforms;
  if (window.__dk === undefined) window.__dk = { k: U.cK.value, ro: sky.renderOrder, fl: g.decoUniforms && 0 };
  U.cK.value = on ? window.__dk.k : 0; sky.renderOrder = on ? window.__dk.ro : -1;
  const b = g.scene.getObjectByName('deko-voegel'); if (b) b.visible = on;
  if (g.air) g.air.mesh.material.visible = on;
  if (g.brakeLights) g.brakeLights.grp.visible = on;
  const T = window.__themeU; if (T) { T.tMeadow.value = on ? 1 : 0; T.tFlowers.value = on ? window.__dk.fl2 : 0; } }"""
SZENEN = [('start', 3.3), ('kurve', 17.0)]
res = {'dev': DEVN, 'q': Q, 'drossel': DROSSEL, 'stress': STRESS, 'sek': SEK, 'runden': RUNDEN, 'thema': THEMA, 'szenen': {}}
with Server() as srv, sync_playwright() as pw:
    s = Session(pw, srv.base, device=DEV)
    s.open(f'?nosw&seed=4711&d=3&g=1&q={Q}' + (f'&thema={THEMA}' if THEMA else ''))
    s.ev("import('./src/gfx/materials.js').then((m) => { window.__themeU = m.themeUniforms; })"); time.sleep(0.5)
    s.ev("window.__dk = undefined; (() => { const sky = __game.scene.getObjectByName('sky'); window.__dk = { k: sky.material.uniforms.cK.value, ro: sky.renderOrder, fl2: window.__themeU ? window.__themeU.tFlowers.value : 0 }; })()")
    if STRESS: s.ev(f"(() => {{ const r = __game.renderer; __game.quality.pixelRatio = () => {STRESS}; r.setPixelRatio({STRESS}); r.setSize(innerWidth, innerHeight, false); }})()")
    cdp = s.ctx.new_cdp_session(s.pg)
    s.ev("__game.setAssist('easy')"); s.ev("__game.start({ autopilot: true })"); s.ev("__game.cam('chase')")
    t_sim = 0
    for name, T in SZENEN:
        s.ev(f"__game.sim({T - t_sim})"); t_sim = T
        s.ev("__game.freeze(true)"); s.frames(5)
        cdp.send('Emulation.setCPUThrottlingRate', {'rate': DROSSEL}); time.sleep(0.8)
        A, B = [], []
        for r in range(RUNDEN):
            for on in ((True, False) if r % 2 == 0 else (False, True)):
                s.ev(f"({SET})({'true' if on else 'false'})"); time.sleep(0.4)
                m = s.ev(f"({MEASURE})({SEK})")
                (A if on else B).append(m)
        cdp.send('Emulation.setCPUThrottlingRate', {'rate': 1})
        s.ev(f"({SET})(true)"); s.ev("__game.freeze(false)")
        med = lambda xs, k: round(statistics.median([x[k] for x in xs]), 2)
        res['szenen'][name] = {v: {k: med(xs, k) for k in ('p50', 'p95', 'mean', 'calls')} for v, xs in (('aus', B), ('an', A))}
        res['szenen'][name]['roh'] = {'an': [round(x['mean'], 1) for x in A], 'aus': [round(x['mean'], 1) for x in B]}
        print(name, json.dumps(res['szenen'][name]), flush=True)
    res['fehler'] = s.errors[:5]
    s.close()
tag = f"{DEVN}_q{Q}" + (f"_stress{int(STRESS)}" if STRESS else f"_drossel{int(DROSSEL)}") + (f"_{THEMA}" if THEMA else '')
json.dump(res, open(os.path.join(ROOT, 'tests', 'shots', 'deko', f'perf_ab_{tag}.json'), 'w'), ensure_ascii=False, indent=1)
print('Fehler', res['fehler'])
