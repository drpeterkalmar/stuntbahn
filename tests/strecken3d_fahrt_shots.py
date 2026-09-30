# n19: Fotos auf einer 3D-Strecke (Standard 1038-3-3d): Spirale von außen, Überführung von oben und unten,
# Klippensprung im Flug (Verfolger + von der Seite), Steilwand, Verfolgerkamera unter der Brücke, Streckenkarte
# mit Kreuzung. Quer (Pixel 7) und hoch. Aufruf: python3 tests/strecken3d_fahrt_shots.py [quer|hoch] [seed] [stufe]
import sys, time, json
sys.path.insert(0, 'tests')
from util import *
mode = sys.argv[1] if len(sys.argv) > 1 else 'quer'
seed = int(sys.argv[2]) if len(sys.argv) > 2 else 1038
diff = int(sys.argv[3]) if len(sys.argv) > 3 else 3
PIXEL7_PORT = dict(PIXEL7_LAND, viewport={"width": 412, "height": 915})
dev = PIXEL7_PORT if mode == 'hoch' else PIXEL7_LAND
SUB = 'strecken3d'
FIND = """(typ) => { const e = __game.env, L = e.track.line, P = e.layout.pieces; let k = -1;
  if (typ === 'crosslo' || typ === 'crosshi') { const cells = new Map(); P.forEach((p, i) => { const q = p.i + ',' + p.j; cells.set(q, [...(cells.get(q) || []), i]); });
    for (const a of cells.values()) if (a.length === 2) { a.sort((x, y) => (P[x].lvl || 0) - (P[y].lvl || 0)); k = typ === 'crosslo' ? a[0] : a[1]; } }
  else k = P.findIndex((p) => p.type === typ || (typ === 'cliffany' && /^cliff/.test(p.type)));
  if (k < 0) return null; const ids = []; for (let i = 0; i < L.n; i++) if (L.piece[i] === k) ids.push(i); return ids; }"""
def ext(s, ids_js, back, side, up, ty, name):
    # Außenansicht: Kamera fest, Blick auf die Mitte des Stücks
    s.ev(f"""(() => {{ const g = __game, L = g.env.track.line, ids = {ids_js}; let cx = 0, cy = 0, cz = 0; for (const q of ids) {{ cx += L.px[q]; cy += L.py[q]; cz += L.pz[q]; }}
      cx /= ids.length; cy /= ids.length; cz /= ids.length; const a = ids[0], b = ids[ids.length - 1]; let tx = L.px[b] - L.px[a], tz = L.pz[b] - L.pz[a]; if (Math.hypot(tx, tz) < 1) {{ tx = L.tx[a]; tz = L.tz[a]; }}
      const tl = Math.hypot(tx, tz); tx /= tl; tz /= tl; const bx = -tz, bz = tx; g.freeze(true); window.__app.freezeCam = true; const c = g.camera;
      c.position.set(cx - tx * {back} + bx * {side}, Math.max(cy, 0) + {up}, cz - tz * {back} + bz * {side}); c.up.set(0, 1, 0); c.lookAt(cx, cy + {ty}, cz); c.fov = 60; c.updateProjectionMatrix(); }})()""")
    s.frames(4); time.sleep(0.6); print('Foto', s.shot(f'{name}_{mode}', SUB))
    s.ev("__game.freeze(false); window.__app.freezeCam = false")
def drive_to(s, ids_js, start_off, cond, max_s=12):
    # Autopilot fährt von start_off Linienpunkten vor dem Stück, bis cond (JS-Ausdruck) erfüllt ist
    # Spiel angehalten (nur sim treibt die Physik, die Kamera folgt weiter) – sonst läuft zwischen den Schritten Echtzeit mit
    s.ev(f"""(() => {{ const g = __game, ids = {ids_js}, i = Math.max(0, ids[0] - {start_off}); g.freeze(true); g.teleport(i, g.env.prof.vt[i]); }})()""")
    t = 0
    while t < max_s:
        s.ev("__game.sim(0.05)"); t += 0.05
        s.frames(1)
        if s.ev(cond): return True
    print('  nicht erreicht:', s.ev("(() => { const r = __game.race; return [r.tracker.idx, r.car.onGround, +r.car.pos.y.toFixed(1), r.state, r.car.crash && r.car.crash.reason, __game._airT]; })()"))
    return False
with Server() as srv, sync_playwright() as pw:
    s = Session(pw, srv.base, device=dev)
    s.open(f'?nosw&seed={seed}&d={diff}&3d=1')
    print('Strecke', s.ev("__game.env.meta.key"), s.ev("__game.env.meta.levels"), 'Ebenen')
    # Karte im Menü (Ausschnitt)
    s.frames(3); time.sleep(0.4)
    s.pg.locator('#menu canvas.tmap').screenshot(path=f'{ROOT}/tests/shots/{SUB}/karte_{mode}.png'); print('Foto karte')
    s.shot(f'menu3d_{mode}', SUB)
    s.ev("__game.setAssist('easy')"); s.ev("__game.start({ autopilot: true })"); s.ev("__game.sim(3.3)")
    s.ev("__game.cam('chase')")
    ids = lambda t: f"(({FIND})('{t}'))"
    # Spirale von außen, Überführung von oben
    if s.ev(ids('spiral')): ext(s, ids('spiral'), -10, -100, 32, 5, 'fahrt_spirale_aussen')
    if s.ev(ids('crosshi')): ext(s, ids('crosshi'), 45, 40, 36, 3, 'fahrt_ueberfuehrung_oben')
    # Verfolger unter der Brücke (Auto auf der unteren Durchfahrt, Mitte des Feldes)
    if s.ev(ids('crosslo')):
        ok = drive_to(s, ids('crosslo'), 40, f"(() => {{ const g = __game, ids = {ids('crosslo')}; return g.race.tracker.idx >= ids[0] - 9; }})()")
        s.ev("__game.freeze(true)"); s.frames(3); time.sleep(0.5); print('Foto', s.shot(f'fahrt_unter_bruecke_{mode}', SUB), ok, 'herangezogen', s.ev("__game.rig.occK || 0"))
        s.ev("__game.freeze(false)")
        ext(s, ids('crosslo'), 30, 7, 1.3, 4, 'fahrt_ueberfuehrung_unten')
    # Klippensprung im Flug: Verfolger + Seitenansicht
    if s.ev(ids('cliffany')):
        s.ev("__game._airT = 0")
        ok = drive_to(s, ids('cliffany'), 30, "(() => { const g = __game; if (g.race.car.onGround) { g._airT = 0; return false; } return ++g._airT > 16; })()")
        s.ev("__game.freeze(true)"); s.frames(3); time.sleep(0.5); print('Foto', s.shot(f'fahrt_klippe_flug_{mode}', SUB), ok)
        s.ev("""(() => { const g = __game, p = g.race.car.pos, f = g.race.car.frame.f; window.__app.freezeCam = true; const c = g.camera;
          c.position.set(p.x - f.z * 28 - f.x * 4, p.y + 1, p.z + f.x * 28 - f.z * 4); c.up.set(0, 1, 0); c.lookAt(p.x + f.x * 6, p.y - 4, p.z + f.z * 6); c.fov = 60; c.updateProjectionMatrix(); })()""")
        s.frames(3); time.sleep(0.5); print('Foto', s.shot(f'fahrt_klippe_seite_{mode}', SUB))
        s.ev("__game.freeze(false); window.__app.freezeCam = false")
    # Steilwand: Verfolger in der Wand + Außenansicht
    if s.ev(ids('wall')):
        ok = drive_to(s, ids('wall'), 30, f"(() => {{ const g = __game, ids = {ids('wall')}; return g.race.tracker.idx >= ids[Math.floor(ids.length * 0.5)]; }})()")
        s.ev("__game.freeze(true)"); s.frames(3); time.sleep(0.5); print('Foto', s.shot(f'fahrt_steilwand_{mode}', SUB), ok, 'Lage', s.ev("__game.race.car.frame.u.y"))
        s.ev("__game.freeze(false)")
        ext(s, ids('wall'), -40, -85, 22, 4, 'fahrt_steilwand_aussen')
    print('Fehler', s.errors[:5])
    s.close()
