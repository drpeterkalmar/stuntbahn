# n22: Fotos je Gelände-Element (Außenansicht schräg von der Seite + Verfolger kurz davor): tunnel, bruecke, schlucht,
# kuppe, hang, serpentine, drop, halfpipe, mulde. Aufruf: python3 tests/gelaende_elem.py seed stufe [quer|hoch] [elemente,…]
import sys, time, json
sys.path.insert(0, 'tests')
from util import *
seed = int(sys.argv[1]) if len(sys.argv) > 1 else 1000
diff = int(sys.argv[2]) if len(sys.argv) > 2 else 3
mode = sys.argv[3] if len(sys.argv) > 3 else 'quer'
want = sys.argv[4].split(',') if len(sys.argv) > 4 else None
PIXEL7_PORT = dict(PIXEL7_LAND, viewport={"width": 412, "height": 915})
dev = PIXEL7_PORT if mode == 'hoch' else PIXEL7_LAND
SUB = 'gelaende'
FIND = """(typ) => { const e = __game.env, L = e.track.line, P = e.layout.pieces, pl = e.track.gel.plan.pieces;
  const hit = (k) => typ === 'tunnel' ? pl[k].tunnel : typ === 'bruecke' ? pl[k].bridge : typ === 'schlucht' ? P[k].g === 'gorge' : typ === 'kuppe' ? P[k].g === 'kuppe'
    : typ === 'hang' ? P[k].tilt0 != null : typ === 'drop' ? P[k].g === 'drop' : typ === 'halfpipe' ? P[k].type === 'halfpipe' : typ === 'mulde' ? P[k].type === 'bank'
    : typ === 'serpentine' ? (e.layout.gel.serp && e.layout.gel.serp.length && P[k].type === 'turnS' && P[k + 1] && P[k + 1].type === 'turnS') : typ === 'looping' ? P[k].type === 'loop' : false;
  let k0 = -1; for (let k = 0; k < P.length; k++) if (hit(k)) { k0 = k; break; } if (k0 < 0) return null;
  let k1 = k0; while (k1 + 1 < P.length && hit(k1 + 1) && typ !== 'kuppe') k1++;
  if (typ === 'serpentine') { k1 = k0 + 1; }
  const ids = []; for (let i = 0; i < L.n; i++) if (L.piece[i] >= k0 && L.piece[i] <= k1) ids.push(i); return ids; }"""
def ext(s, ids_js, back, side, up, ty, name):
    s.ev(f"""(() => {{ const g = __game, L = g.env.track.line, ids = {ids_js}; let cx = 0, cy = 0, cz = 0; for (const q of ids) {{ cx += L.px[q]; cy += L.py[q]; cz += L.pz[q]; }}
      cx /= ids.length; cy /= ids.length; cz /= ids.length; const a = ids[0], b = ids[ids.length - 1]; let tx = L.px[b] - L.px[a], tz = L.pz[b] - L.pz[a]; if (Math.hypot(tx, tz) < 1) {{ tx = L.tx[a]; tz = L.tz[a]; }}
      const tl = Math.hypot(tx, tz); tx /= tl; tz /= tl; const bx = -tz, bz = tx; g.freeze(true); window.__app.freezeCam = true; const c = g.camera;
      const px = cx - tx * {back} + bx * {side}, pz = cz - tz * {back} + bz * {side};
      c.position.set(px, Math.max(cy + {up}, g.env.track.terrain.height(px, pz) + 3), pz); c.up.set(0, 1, 0); c.lookAt(cx, cy + {ty}, cz); c.fov = 60; c.updateProjectionMatrix(); }})()""")
    s.frames(5); time.sleep(0.6); print('Foto', s.shot(f'{seed}-{diff}_{name}_{mode}', SUB))
    s.ev("__game.freeze(false); window.__app.freezeCam = false")
def chase(s, ids_js, off, name, dt=0.5):
    s.ev(f"""(() => {{ const g = __game, ids = {ids_js}, i = Math.max(0, ids[0] - {off}); g.freeze(true); g.teleport(i, g.env.prof.vt[i]); g.cam('chase'); }})()""")
    s.ev(f"__game.sim({dt})"); s.frames(6); time.sleep(0.5); print('Foto', s.shot(f'{seed}-{diff}_{name}_{mode}', SUB))
with Server() as srv, sync_playwright() as pw:
    s = Session(pw, srv.base, device=dev)
    s.open(f'?nosw&seed={seed}&d={diff}&g=1')
    print('Strecke', s.ev("__game.env.meta.key"), s.ev("JSON.stringify(__game.env.meta.elems)"))
    s.ev("__game.setAssist('easy')"); s.ev("__game.start({ autopilot: true })"); s.ev("__game.sim(3.3)")
    ids = lambda t: f"(({FIND})('{t}'))"
    for el in (want or ['tunnel', 'bruecke', 'schlucht', 'kuppe', 'hang', 'serpentine', 'drop', 'halfpipe', 'mulde']):
        if not s.ev(ids(el)): print('nicht vorhanden:', el); continue
        ext(s, ids(el), 40, 90, 35, 0, el + '_aussen')
        chase(s, ids(el), 25, el + '_verfolger', 0.8)
    print('Fehler', s.errors[:5])
    s.close()
