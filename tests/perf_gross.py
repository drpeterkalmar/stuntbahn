# Optik (28.09.2026): Budget auf großen .TRK-Strecken (nur lokal, Archiv-Dateien in trk_local/): Draw-Calls < 200,
# Dreiecke, Bauzeit, Renderzeit je Stufe beim Fahren und im Überblick.
# Aufruf: python3 tests/perf_gross.py [Wurzel] [Datei …]
import os, sys, time, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from util import Server, Session, PIXEL7_LAND, DESKTOP, ROOT
from playwright.sync_api import sync_playwright
root = os.path.abspath(sys.argv[1]) if len(sys.argv) > 1 else ROOT
files = sys.argv[2:] or [os.path.join(ROOT, 'trk_local/zakpack/Tracks/l/1/LONG_GO2.TRK')]
RT = """() => { const G = window.__game, r = G.renderer, gl = r.getContext(), px = new Uint8Array(4); const ts = []; let info;
  for (let k = 0; k < 23; k++) { const t0 = performance.now(); r.info.reset(); r.render(G.scene, G.camera); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); if (k > 2) ts.push(performance.now() - t0); if (k === 3) info = [r.info.render.calls, r.info.render.triangles]; }
  ts.sort((a, b) => a - b); return { ms: +ts[10].toFixed(2), calls: info[0], tris: info[1] }; }"""
OVER = """() => { const G = window.__game, b = G.env.track.bounds; window.__app.freezeCam = true; G.freeze(true);
  const cx = (b.minX + b.maxX) / 2, cz = (b.minZ + b.maxZ) / 2, r = Math.hypot(b.maxX - b.minX, b.maxZ - b.minZ) / 2;
  const c = G.camera; c.position.set(cx - r * 0.6, r * 0.7, cz + r * 0.7); c.up.set(0, 1, 0); c.lookAt(cx, 0, cz); c.fov = 60; c.updateProjectionMatrix(); return 1; }"""
with Server(root) as srv, sync_playwright() as pw:
    for f in files:
        data = list(open(f, 'rb').read())
        for tier in (0, 1, 2):
            s = Session(pw, srv.base, device=DESKTOP if tier == 2 else PIXEL7_LAND)
            s.open(f'?nosw&q={tier}')
            r = s.ev("([a, n]) => __game.importBytes(a, n)", [data, os.path.basename(f)])
            rid = r[0]['id']
            t0 = time.time(); s.ev(f"__game.loadImported('{rid}')"); s.pg.wait_for_function("window.__game.env && window.__game.env.meta.key === '%s'" % rid, timeout=300000)
            load = time.time() - t0
            s.ev("__game.start({ autopilot: true })"); s.ev("__game.sim(3.3)"); s.ev("__game.sim(6)"); s.ev("__game.freeze(true)"); s.frames(3)
            drive = s.ev(RT)
            s.ev(OVER); s.frames(3); over = s.ev(RT)
            st = s.ev("(() => { const w = __game.scene.getObjectByName('world'); return { build: Math.round(__game.env.buildMs), deco: w.userData.stats.deco && w.userData.stats.deco.plan }; })()")
            print(json.dumps(dict(datei=os.path.basename(f), stufe=tier, laden_s=round(load, 1), fahrt=drive, ueberblick=over, **st, fehler=s.errors[:2]), ensure_ascii=False), flush=True)
            s.close()
