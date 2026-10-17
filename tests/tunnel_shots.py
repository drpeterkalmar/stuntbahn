# n33 Tunnel-Einfahrt: Fotos der Anfahrt (Verfolger 140/90/55 Punkte vor dem Portal), innen, Blick zum Ausgang, Cockpit innen
# und eine Außenansicht schräg aufs Portal – je Landschaft/Tageszeit. Vergleich alt/neu per Zusatz-Query (?tunnelalt=1).
# Aufruf: python3 tests/tunnel_shots.py [hoch|quer] [themen,…] [zusatz-query] [name-suffix] [seed] [stufe] [zeit]
#   z. B. python3 tests/tunnel_shots.py hoch wueste,alpen,stadt "" neu 1000 3
#         python3 tests/tunnel_shots.py quer wueste "&tunnelalt=1" alt
import sys, time
sys.path.insert(0, 'tests')
from util import *
mode = sys.argv[1] if len(sys.argv) > 1 else 'hoch'
themen = (sys.argv[2] if len(sys.argv) > 2 else 'wueste').split(',')
extra = sys.argv[3] if len(sys.argv) > 3 else ''
tag = sys.argv[4] if len(sys.argv) > 4 else 'neu'
seed = sys.argv[5] if len(sys.argv) > 5 else '1000'
diff = int(sys.argv[6]) if len(sys.argv) > 6 else 3
zeit = sys.argv[7] if len(sys.argv) > 7 else ''
nur = sys.argv[8].split(',') if len(sys.argv) > 8 else None
PIXEL7_PORT = dict(PIXEL7_LAND, viewport={"width": 412, "height": 915})
dev = PIXEL7_PORT if mode == 'hoch' else PIXEL7_LAND
SUB = 'n33/tunnel'
# erster Tunnel: Linienpunkte der Tunnel-Stücke (Gelände-Plan)
FIND = """(() => { const e = __game.env, L = e.track.line, pl = e.track.gel ? e.track.gel.plan.pieces : e.track.layout.pieces.map((p) => ({ tunnel: p.deco === 'tunnel' && !p.sub }));
  let i0 = -1, i1 = -1; for (let i = 0; i < L.n; i++) { const t = pl[L.piece[i]] && pl[L.piece[i]].tunnel; if (t && i0 < 0) i0 = i; if (i0 >= 0 && t) i1 = i; if (i0 >= 0 && !t) break; }
  return i0 < 0 ? null : [i0, i1]; })()"""
def chase(s, i, name, cam='chase', dt=0.6):
    s.ev(f"(() => {{ const g = __game, i = Math.max(0, {i}); g.freeze(true); g.teleport(i, Math.max(15, g.env.prof.vt[i] * 0.8)); g.cam('{cam}'); }})()")
    s.ev(f"__game.sim({dt})"); s.frames(8); time.sleep(0.6)
    print('Foto', s.shot(f'{name}', SUB), flush=True)
def aussen(s, i0, name, back=38, side=16, up=6):
    s.ev("__game.cam('chase')"); s.frames(2)
    s.ev(f"""(() => {{ const g = __game, L = g.env.track.line, i = {i0}; g.freeze(true); window.__app.freezeCam = true; const c = g.camera;
      const tx = L.tx[i], tz = L.tz[i], tl = Math.hypot(tx, tz), ux = tx / tl, uz = tz / tl, bx = -uz, bz = ux;
      const px = L.px[i] - ux * {back} + bx * {side}, pz = L.pz[i] - uz * {back} + bz * {side};
      c.position.set(px, Math.max(L.py[i] + {up}, g.env.track.terrain.height(px, pz) + 2.5), pz); c.up.set(0, 1, 0);
      c.lookAt(L.px[i], L.py[i] + 3.5, L.pz[i]); c.fov = 55; c.updateProjectionMatrix(); }})()""")
    s.frames(8); time.sleep(0.6); print('Foto', s.shot(name, SUB), flush=True)
    s.ev("window.__app.freezeCam = false")
with Server() as srv, sync_playwright() as pw:
    for th in themen:
        s = Session(pw, srv.base, device=dev)
        z = f'&zeit={zeit}' if zeit else ''
        s.open(f'?nosw&q=2&vao=sync&trk={seed}&thema={th}{z}{extra}' if seed.startswith('sam-') else f'?nosw&q=2&vao=sync&seed={seed}&d={diff}&g=1&thema={th}{z}{extra}')
        s.ev("__game.setAssist('easy')"); s.ev("__game.start({ autopilot: true })"); s.ev("__game.sim(3.3)")
        r = s.ev(FIND)
        if not r: print('kein Tunnel', seed, diff); s.close(); continue
        i0, i1 = r
        n = f'{seed}-{diff}_{th}{("_" + zeit) if zeit else ""}_{mode}_{tag}'
        print(th, 'Tunnel', i0, i1, 'Länge', round(s.ev(f"__game.env.track.line.s[{i1}] - __game.env.track.line.s[{i0}]")), 'm', flush=True)
        for off in (140, 90, 55):
            if nur and str(off) not in nur: continue
            chase(s, i0 - off, f'{n}_v{off}')
        if not nur or 'innen' in nur: chase(s, i0 + 12, f'{n}_innen')
        if not nur or 'ausgang' in nur: chase(s, max(i0 + 14, i1 - 30), f'{n}_ausgang')
        if not nur or 'cockpit' in nur: chase(s, i0 + 10, f'{n}_cockpit', cam='cockpit', dt=0.15)
        if not nur or 'aussen' in nur: aussen(s, i0, f'{n}_aussen')
        if not nur or 'nah' in nur: aussen(s, i0, f'{n}_nah', 20, 0, 3)
        if not nur or 'oben' in nur: aussen(s, i0, f'{n}_oben', 30, 25, 28)
        print('Fehler', s.errors[:5], flush=True)
        s.close()
