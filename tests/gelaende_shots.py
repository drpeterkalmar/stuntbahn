# n22: Fotoserie Gelände-Strecken für den Bericht – je Code ein Element im Verfolger und im Hubschrauber, dazu eine
# Übersicht schräg von oben; Gelände-Galerie mit jedem Element. Quer oder hoch.
# Aufruf: python3 tests/gelaende_shots.py quer|hoch [galerie]
import sys, time
sys.path.insert(0, 'tests')
from util import *
mode = sys.argv[1] if len(sys.argv) > 1 else 'quer'
gal = len(sys.argv) > 2 and sys.argv[2] == 'galerie'
PIXEL7_PORT = dict(PIXEL7_LAND, viewport={"width": 412, "height": 915})
dev = PIXEL7_PORT if mode == 'hoch' else PIXEL7_LAND
SUB = 'gelaende_bericht'
CODES = [(25, 2), (4711, 3), (20261001, 2), (1038, 1), (8919, 3), (16838, 2), (72271, 3)]
FIND = """(typ) => { const e = __game.env, L = e.track.line, P = e.layout.pieces, pl = e.track.gel.plan.pieces;
  const hit = (k) => typ === 'tunnel' ? pl[k].portalIn : typ === 'bruecke' ? pl[k].bridge : typ === 'schlucht' ? P[k].g === 'gorge' : typ === 'kuppe' ? P[k].g === 'kuppe'
    : typ === 'hang' ? P[k].tilt0 != null && P[k].tilt1 && P[k].tilt0 : typ === 'drop' ? P[k].g === 'drop' : typ === 'halfpipe' ? P[k].type === 'halfpipe' : typ === 'mulde' ? P[k].type === 'bank'
    : typ === 'serpentine' ? (e.layout.gel.serp && e.layout.gel.serp.length && P[k].type === 'turnS' && P[k + 1] && P[k + 1].type === 'turnS') : typ === 'looping' ? P[k].type === 'loop' : false;
  for (let k = 0; k < P.length; k++) if (hit(k)) { const pi = e.track.pieces[k]; return [pi.lineStart, pi.lineEnd]; } return null; }"""
def at(s, typ):
    return s.ev(f"(({FIND})('{typ}'))")
def drive(s, i0, back, secs, cond=None):
    s.ev(f"(() => {{ const g = __game, i = Math.max(1, {i0} - {back}); g.freeze(true); g.teleport(i, g.env.prof.vt[i]); }})()")
    t = 0
    while t < secs:
        s.ev("__game.sim(0.05)"); t += 0.05; s.frames(1)
        if cond and s.ev(cond): break
def snap(s, name):
    s.frames(6); time.sleep(0.5); print('Foto', s.shot(f'{name}_{mode}', SUB), flush=True)
AIR = "(() => { const g = __game; if (g.race.car.onGround) { g._a = 0; return false; } return ++g._a > 14; })()"
def element_shots(s, prefix, typ):
    r = at(s, typ)
    if not r: return False
    i0, i1 = r
    if typ in ('schlucht', 'drop', 'kuppe'):
        s.ev("__game._a = 0"); drive(s, i0, 60 if typ != 'kuppe' else 40, 8, AIR)
    elif typ == 'tunnel':
        drive(s, i0, 30, 0.6)
    else:
        drive(s, (i0 + i1) // 2, 25, 0.8)
    s.ev("__game.cam('chase')"); snap(s, f'{prefix}_{typ}_verfolger')
    s.ev("__game.cam('far')"); snap(s, f'{prefix}_{typ}_hubschrauber')
    s.ev("__game.cam('chase')")
    return True
with Server() as srv, sync_playwright() as pw:
    s = Session(pw, srv.base, device=dev)
    if gal:
        s.open('?nosw&gallery=gel')
        s.ev("__game.setAssist('easy')"); s.ev("__game.start({ autopilot: true })"); s.ev("__game.sim(3.3)")
        for typ in ['serpentine', 'kuppe', 'hang', 'mulde', 'tunnel', 'schlucht', 'drop', 'halfpipe', 'looping', 'bruecke']:
            element_shots(s, 'galerie', typ)
    else:
        s.open('?nosw&seed=25&d=2&g=1')
        for seed, diff in CODES:
            s.ev(f"__game.newTrack({seed}, {diff}, 'gel')"); s.pg.wait_for_function(f"__game.env.meta.key === '{seed}-{diff}-g'", timeout=240000)
            s.ev("__game.setAssist('easy')"); s.ev("__game.start({ autopilot: true })"); s.ev("__game.sim(3.3)")
            for typ in ['schlucht', 'serpentine', 'kuppe', 'tunnel', 'hang', 'drop']:
                if element_shots(s, f'{seed}-{diff}', typ): break
            s.ev("""(() => { const g = __game, L = g.env.track.line; let cx = 0, cz = 0, cy = 0; for (let i = 0; i < L.n; i++) { cx += L.px[i]; cz += L.pz[i]; cy += L.py[i]; } cx /= L.n; cz /= L.n; cy /= L.n;
              g.freeze(true); window.__app.freezeCam = true; const c = g.camera; c.position.set(cx - 380, cy + 230, cz + 380); c.up.set(0, 1, 0); c.lookAt(cx, cy - 20, cz); c.fov = 55; c.updateProjectionMatrix(); })()""")
            snap(s, f'{seed}-{diff}_uebersicht')
            s.ev("__game.freeze(false); window.__app.freezeCam = false; __game.toMenu()")
    print('Fehler', s.errors[:5])
    s.close()
