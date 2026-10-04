# Kulissen (n20): Fotos je Landschafts-Thema für den Bericht – Start (Portal, Tribüne), Kurve mit Tribüne, Sprung mit
# Zuschauern (jubeln), Horizont (Fernkulisse). Ein Browser, Thema per __game.setTheme gewechselt.
# Aufruf: python3 tests/kulissen_shots.py quer|hoch [code=25-2-g] [themen=land,wueste,…]
# Ausgabe: tests/shots/kulissen/<thema>_<motiv>_<quer|hoch>.png (+ Prüfwerte je Bild auf stdout)
import sys, time, os, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from util import *
mode = sys.argv[1] if len(sys.argv) > 1 else 'quer'
code = sys.argv[2] if len(sys.argv) > 2 else '25-2-g'
code_k = sys.argv[4] if len(sys.argv) > 4 else '1038-1-g'   # Strecke mit Tribüne an einer Kurve
themes = (sys.argv[3] if len(sys.argv) > 3 else 'land,wueste,alpen,kueste,stadt,herbst,winter').split(',')
dev = dict(PIXEL7_LAND, viewport={"width": 412, "height": 915}) if mode == 'hoch' else PIXEL7_LAND
seed, diff, *rest = code.split('-')
q = f'seed={seed}&d={diff}' + ('&g=1' if 'g' in rest else '&3d=1' if '3d' in rest else '')
SUB = 'kulissen'
PLAN = "(() => { const w = __game.scene.getObjectByName('world'); return w && w.userData.stats.deco ? w.userData.stats.deco.planObj : null; })()"
# Index ds Meter vor/nach i (entlang der Linie)
BACK = "((i, ds) => { const L = __game.env.track.line; const s0 = L.s[i] - ds; let j = i; while (j > 1 && L.s[j] > s0) j--; return j; })"
def snap(s, name, wait=0.5):
    s.frames(6); time.sleep(wait)
    p = s.shot(f'{name}_{mode}', SUB)
    print('Foto', p, json.dumps(s.ev("__game.info()")), flush=True)
def drive_to(s, i, secs):
    s.ev(f"(() => {{ const g = __game; g.freeze(true); g.teleport({i}, g.env.prof.vt[{i}]); }})()")
    t = 0
    while t < secs:
        s.ev("__game.sim(0.05)"); t += 0.05; s.frames(1)
with Server() as srv, sync_playwright() as pw:
    s = Session(pw, srv.base, device=dev)
    s.open(f'?nosw&{q}&thema={themes[0]}&q=1')
    for k, th in enumerate(themes):
        if k:
            s.ev("window.__app.freezeCam = false; __game.freeze(false); __game.cam('chase'); __game.toMenu()")
            s.ev(f"__game.setTheme('{th}')"); s.pg.wait_for_function(f"__game.theme === '{th}'", timeout=180000)
        if s.ev("__game.env.meta.key") != code:
            s.ev(f"__game.newTrack({seed}, {diff}, '{'gel' if 'g' in rest else '3d' if '3d' in rest else 'flat'}')"); s.pg.wait_for_function(f"__game.env.meta.key === '{code}'", timeout=300000)
        s.ev("__game.setAssist('easy')")
        # Start: Auto in der Startaufstellung, Portal, Tribüne, Fahnen
        s.ev("__game.start({ autopilot: true })"); s.ev("__game.sim(0.4)"); s.ev("__game.freeze(true)")
        plan = s.ev(PLAN)
        p = plan.get('portal') if plan else None
        if p:   # Startaufstellung von hinten: Portal, Tribünen, Fahnen
            s.ev(f"""(() => {{ window.__app.freezeCam = true; const c = __game.camera; c.position.set({p['x']} - {p['tx']} * 48, {p['y']} + 6.5, {p['z']} - {p['tz']} * 48);
              c.up.set(0, 1, 0); c.lookAt({p['x']} + {p['tx']} * 20, {p['y']} + 5, {p['z']} + {p['tz']} * 20); c.fov = 62; c.updateProjectionMatrix(); }})()""")
        snap(s, f'{th}_start')
        s.ev("window.__app.freezeCam = false"); s.ev("__game.freeze(false)"); s.ev("__game.sim(3.2)")   # Countdown vorbei
        stands = plan['inst'].get('stand', []) if plan else []
        # Sprung mit Zuschauern: vor die Schanze, fliegen lassen, im Flug (Jubel)
        jumps = s.ev("__game.env.track.jumps.map((j) => [j.landIdx - j.lipIdx, j.lipIdx]).sort((a, b) => b[0] - a[0]).map((j) => j[1])")
        if jumps:
            i = s.ev(f"({BACK})({jumps[0]}, 110)")
            s.ev("__game.freeze(false)"); s.ev(f"(() => {{ const g = __game; g.freeze(true); g.teleport({i}, g.env.prof.vt[{i}]); }})()")
            t = 0; air = 0
            while t < 8:
                s.ev("__game.sim(0.05)"); t += 0.05; s.frames(1)
                if not s.ev("__game.race.car.onGround"): air += 1
                if air > 18: break
            s.ev("__game.freeze(true)")
            snap(s, f'{th}_sprung')
            s.ev("__game.cam('far')"); snap(s, f'{th}_sprung_heli'); s.ev("__game.cam('chase')")
        # Horizont: auf Augenhöhe vom Auto in die Ferne (Richtung mit der weitesten Sicht: höchster Blickpunkt)
        s.ev("""(() => { const g = __game, p = g.race.car.pos, T = g.env.track.terrain; let best = 0, ba = 0;
          const w = g.scene.getObjectByName('world'), P = w.userData.stats.deco.planObj.inst;
          for (let a = 0; a < 6.28; a += 0.26) { let m = 1e9; for (let r = 60; r < 900; r += 60) m = Math.min(m, p.y + 8 - T.height(p.x + Math.cos(a) * r, p.z + Math.sin(a) * r) + r * 0.02); if (m > best) { best = m; ba = a; } }
          // Küste: Richtung Leuchtturm/Meer, Stadt: Richtung der höchsten Hochhäuser
          if (P.light && P.light.length) ba = Math.atan2(P.light[0].z - p.z, P.light[0].x - p.x);
          if (P.tower && P.tower.length) { const t = P.tower.slice().sort((a, b) => b.h - a.h).slice(0, 12); let sx = 0, sz = 0; for (const q of t) { sx += q.x; sz += q.z; } ba = Math.atan2(sz / t.length - p.z, sx / t.length - p.x); }
          window.__app.freezeCam = true; const c = g.camera, hy = Math.max(p.y, T.height(p.x, p.z)) + (innerHeight > innerWidth ? 70 : 30); c.position.set(p.x, hy, p.z); c.up.set(0, 1, 0);
          c.lookAt(p.x + Math.cos(ba) * 1000, hy - (innerHeight > innerWidth ? 30 : -10), p.z + Math.sin(ba) * 1000); c.fov = 62; c.updateProjectionMatrix(); })()""")
        snap(s, f'{th}_horizont')
        # Kurve mit Tribüne (zweite Strecke): Auto fährt darauf zu
        ks, kd, *kr = code_k.split('-')
        s.ev("window.__app.freezeCam = false; __game.freeze(false); __game.toMenu()")
        s.ev(f"__game.newTrack({ks}, {kd}, '{'gel' if 'g' in kr else '3d' if '3d' in kr else 'flat'}')"); s.pg.wait_for_function(f"__game.env.meta.key === '{code_k}'", timeout=300000)
        s.ev("__game.start({ autopilot: true })"); s.ev("__game.sim(3.2)")
        plan = s.ev(PLAN); stands = plan['inst'].get('stand', []) if plan else []
        print('Tribünen', code_k, th, len(stands), s.ev('__game.env.meta.key'), s.ev("__game.scene.children.filter(o => o.name === 'world').map(w => (w.userData.stats.deco.planObj.inst.stand || []).length)"), s.ev('__game.info().tier'), flush=True)
        st = None
        for want in ('kurve', 'looping', 'sprung', 'roehre', 'start'):
            st = st or next((x for x in stands if x.get('stunt') == want), None)
        st = st or (stands[0] if stands else None)
        if st:
            # Auto 30 m vor der Tribüne, Kamera 62 m davor auf 5 m Höhe, Blick zwischen Auto und Tribüne
            i = s.ev(f"({BACK})({st['i']}, 30)"); i0 = s.ev(f"({BACK})({st['i']}, 62)")
            s.ev(f"(() => {{ const g = __game; g.freeze(true); g.teleport({i}, 0); g.sim(0.05); }})()")
            s.ev(f"""(() => {{ const g = __game, L = g.env.track.line; window.__app.freezeCam = true; const c = g.camera;
              c.position.set(L.px[{i0}] - L.bx[{i0}] * 2, L.py[{i0}] + 5, L.pz[{i0}] - L.bz[{i0}] * 2); c.up.set(0, 1, 0);
              const kk = {0.8 if mode == 'hoch' else 0.5}; c.lookAt({st['x']} * kk + L.px[{i}] * (1 - kk), L.py[{i}] + 3, {st['z']} * kk + L.pz[{i}] * (1 - kk)); c.fov = 62; c.updateProjectionMatrix(); }})()""")
            snap(s, f'{th}_kurve')
            s.ev("window.__app.freezeCam = false")
    print('Fehler', s.errors[:6])
    s.close()
