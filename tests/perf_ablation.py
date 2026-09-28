# Optik (28.09.2026): Welcher Deko-Teil kostet wie viel? Renderzeit mit einzeln ausgeblendeten Teilen (Stufe fest).
# Aufruf: WEBGL=swiftshader python3 tests/perf_ablation.py [Stufe] [Strecke]
import os, sys, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from util import Server, Session, PIXEL7_LAND, DESKTOP
from playwright.sync_api import sync_playwright
tier = sys.argv[1] if len(sys.argv) > 1 else '1'
q = sys.argv[2] if len(sys.argv) > 2 else 'trk=demo-rundkurs'
N = int(os.environ.get('PERF_N', '10'))
RT = """([hide, cloud, n, a2c]) => { const G = window.__game, r = G.renderer, gl = r.getContext(), px = new Uint8Array(4), w = G.scene.getObjectByName('world');
  const U = G.shadowUniforms; const hidden = [];
  for (const m of w.children) if (hide.some((h) => m.name.startsWith(h))) { m.visible = false; hidden.push(m); }
  if (U) U.sbCloudOn.value = cloud; G.quality.forced = '1'; const ts = [];
  for (const m of w.children) if (m.material && m.name.startsWith('deco-') && m.material.alphaTest > 0) { if (m.material.alphaToCoverage !== a2c) { m.material.alphaToCoverage = a2c; m.material.needsUpdate = true; } }
  r.render(G.scene, G.camera);
  for (let k = 0; k < n + 2; k++) { const t0 = performance.now(); r.render(G.scene, G.camera); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); if (k > 1) ts.push(performance.now() - t0); }
  for (const m of hidden) m.visible = true; ts.sort((a, b) => a - b); return +ts[ts.length >> 1].toFixed(1); }"""
CASES = [('alles', [], 1), ('ohne Alpha-to-Coverage', [], 1, False), ('ohne Wolken', [], 0), ('ohne Gras/Blumen', ['deco-grass'], 1), ('ohne Laubbäume', ['deco-laub'], 1), ('ohne Büsche', ['deco-bushes'], 1),
         ('ohne Streifen/Kies', ['deco-strips'], 1), ('ohne Abrieb', ['deco-marks'], 1), ('ohne Felsen', ['deco-rocks'], 1), ('ohne Reifen', ['deco-tyres'], 1),
         ('ohne Zaun/Zuschauer', ['deco-fence', 'deco-crowd'], 1), ('ohne alle Deko', ['deco-'], 1), ('ohne Deko+Wolken', ['deco-'], 0), ('alles (Kontrolle)', [], 1)]
with Server() as srv, sync_playwright() as pw:
    s = Session(pw, srv.base, device=DESKTOP if tier == '2' else PIXEL7_LAND)
    s.open(f'?nosw&{q}&q={tier}')
    s.ev("__game.start({ autopilot: true })"); s.ev("__game.sim(3.3)"); s.ev("__game.sim(4)"); s.ev("__game.freeze(true)"); s.frames(3)
    for c in CASES:
        name, hide, cloud = c[:3]; a2c = c[3] if len(c) > 3 else True
        print(f'{name:24s}', s.ev(RT, [hide, cloud, N, a2c]), 'ms', flush=True)
    s.close()
