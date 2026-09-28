# Optik (28.09.2026): Detail-Fotos zur Sichtprüfung – Streckenrand aus 1,7 m Höhe (Kiesbett, Reifen, Gras, Banner),
# Luftbild (Wolkenschatten, Felder, Höfe, Wald), Blick von der Tribüne. Prüft: Draw-Calls/Dreiecke, 0 Fehler.
# Aufruf: python3 tests/optik_detail.py [Zusatz-URL-Parameter]  → tests/shots/optik/detail/*.jpg
import os, sys, time, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from util import Server, Session, DESKTOP, ROOT
from playwright.sync_api import sync_playwright
extra = sys.argv[1] if len(sys.argv) > 1 else ''
OUT = os.path.join(ROOT, 'tests', 'shots', 'optik', 'detail'); os.makedirs(OUT, exist_ok=True)
CAM = """([px, py, pz, lx, ly, lz, fov]) => { const G = window.__game; window.__app.freezeCam = true; G.freeze(true);
  const c = G.camera; c.position.set(px, py, pz); c.up.set(0, 1, 0); c.lookAt(lx, ly, lz); c.fov = fov; c.updateProjectionMatrix(); return 1; }"""
SPOTS = """() => { const G = window.__game, T = G.env.track, L = T.line, W = G.scene.getObjectByName('world'), st = W.userData.stats;
  const get = (n) => { const m = W.getObjectByName(n); if (!m || !m.count) return null; const a = new m.matrix.constructor(), p = new m.position.constructor(); m.getMatrixAt(0, a); p.setFromMatrixPosition(a); return [p.x, p.y, p.z]; };
  return { tyre: get('deco-tyres'), stand: get('deco-stands'), hut: get('deco-huts'), start: [L.px[T.start.idx], L.py[T.start.idx], L.pz[T.start.idx]], b: T.bounds, deco: st.deco && st.deco.plan, meshes: W.children.length }; }"""
with Server() as srv, sync_playwright() as pw:
    for name, q in [('tag', 'seed=20260927&d=2'), ('trk', 'trk=demo-rundkurs')]:
        s = Session(pw, srv.base, device=DESKTOP)
        s.open(f'?nosw&{q}&q=2{extra}')
        s.ev("__game.start({ autopilot: true })"); s.ev("__game.sim(3.3)")
        sp = s.ev(SPOTS)
        print(name, json.dumps({k: sp[k] for k in ('deco', 'meshes')}), flush=True)
        if sp['tyre']:
            x, y, z = sp['tyre']
            s.ev(CAM, [x + 9, y + 1.7, z + 9, x, y + 0.5, z, 60]); s.frames(4); time.sleep(0.4)
            s.pg.screenshot(path=os.path.join(OUT, f'{name}_reifen.jpg'), type='jpeg', quality=85)
        x, y, z = sp['start']
        s.ev(CAM, [x + 14, y + 1.7, z + 6, x - 30, y + 0.5, z - 20, 65]); s.frames(4); time.sleep(0.4)
        s.pg.screenshot(path=os.path.join(OUT, f'{name}_start_boden.jpg'), type='jpeg', quality=85)
        b = sp['b']; cx, cz = (b['minX'] + b['maxX']) / 2, (b['minZ'] + b['maxZ']) / 2
        s.ev(CAM, [cx - 200, 380, cz + 900, cx + 200, 0, cz - 600, 60]); s.frames(4); time.sleep(0.4)
        s.pg.screenshot(path=os.path.join(OUT, f'{name}_luft.jpg'), type='jpeg', quality=85)
        info = s.ev("__game.info()")
        s.ev("() => { window.__app.freezeCam = false; __game.freeze(false); }")
        s.ev("__game.cam('chase')"); time.sleep(1.0); info2 = s.ev("__game.info()")
        print(name, 'Luftbild', info['calls'], 'Calls', info['tris'], 'Dreiecke · Fahrt', info2['calls'], info2['tris'], 'Fehler', s.errors[:3], flush=True)
        s.close()
