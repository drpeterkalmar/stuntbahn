# Kulissen n32: Nahaufnahmen jeder neuen Kulissen-Art (3D-Zuschauer ruhig/jubelnd, Tribünen-Bauformen, Event-Gelände,
# Picknick, Rennleitungsturm, Leinwand, Ampel, Startaufstellung, Banden, Fangzaun) – Kamera aus Richtung Strecke aufs Objekt.
# Aufruf: python3 tests/kulissen2_shots.py quer|hoch [code=25-2-g] [themen=land,alpen] [q=2] [zusatz=&wetter=klar] [tag=]
#         [arten=fans,stand,zelt,…]
# Ausgabe: tests/shots/kulissen2/<thema>_<art>_<quer|hoch><tag>.png
import sys, os, json, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from util import *
A = dict(a.split('=', 1) for a in sys.argv[2:] if '=' in a)
mode = sys.argv[1] if len(sys.argv) > 1 else 'quer'
code = A.get('code', '25-2-g'); themes = A.get('themen', 'land,alpen').split(',')
qq = A.get('q', '2'); zus = A.get('zusatz', '&wetter=klar'); tag = A.get('tag', ''); root = A.get('root', ROOT)
ARTEN = A.get('arten', 'fans,jubel,sitzen,stand,start,ampel,leitturm,leinwand,banden,zelt,foodtruck,riesenrad,huepfburg,strandbar,apres,picnic,parkauto').split(',')
dev = dict(PIXEL7_LAND, viewport={"width": 412, "height": 915}) if mode == 'hoch' else PIXEL7_LAND
seed, diff, *rest = code.split('-')
q = f'seed={seed}&d={diff}' + ('&g=1' if 'g' in rest else '&3d=1' if '3d' in rest else '')
SUB = 'kulissen2'
PLAN = "(() => { const p = __game.env.track.decoPlan; return p ? { inst: p.inst, fans: (p.fans || []).map((f) => [f.x, f.z, f.rot, f.pose]), portal: p.portal || null, startGrid: (p.startGrid || []).slice(0, 2) } : null; })()"
# Kamera: Abstand dist vom Objekt Richtung Straße (lokal +z), Höhe h, Blick auf Objekt + look m Höhe
CAM = """([x, z, rot, dist, h, look, side]) => { const g = __game, a = window.__app, T = g.env.track.terrain; a.freezeCam = true; const c = g.camera;
  const dx = Math.sin(rot + side), dz = Math.cos(rot + side), cx = x + dx * dist, cz = z + dz * dist;
  const gy = T.height(x, z), cy = Math.max(T.height(cx, cz) + 1.6, gy + h);
  c.position.set(cx, cy, cz); c.up.set(0, 1, 0); c.lookAt(x, gy + look, z); c.fov = 55; c.updateProjectionMatrix(); }"""
def snap(s, name):
    s.frames(30); time.sleep(0.3)
    p = s.shot(f'{name}_{mode}{tag}', SUB); print('Foto', p, flush=True)
with Server(root) as srv, sync_playwright() as pw:
    s = Session(pw, srv.base, device=dev)
    s.open(f'?nosw&{q}&thema={themes[0]}&q={qq}&startprobe=0&blur=off{zus}')
    for k, th in enumerate(themes):
        if k:
            s.ev("window.__app.freezeCam = false; __game.freeze(false); __game.toMenu()")
            s.ev(f"__game.setTheme('{th}')"); s.pg.wait_for_function(f"__game.theme === '{th}'", timeout=180000)
        s.ev("__game.setAssist('easy'); __game.start({ autopilot: true })"); s.ev("__game.sim(4.0)"); s.ev("__game.freeze(true)")
        s.ev("window.__app.fixTime = 20.0")
        P = s.ev(PLAN)
        if not P: print('keine Planung'); continue
        I = P['inst']
        print(th, {k2: len(v) for k2, v in I.items() if isinstance(v, list) and v}, 'fans', len(P['fans']), flush=True)
        def first(kind):
            L = I.get(kind) or []
            return L[0] if L else None
        for art in ARTEN:
            U = "__game.decoUniforms.uCheer.value"
            s.ev(f"{U}.set(0, 0, 0, 0)")
            if art in ('fans', 'jubel', 'sitzen'):
                F = [f for f in P['fans'] if (f[3] == 4) == (art == 'sitzen')]
                if not F: continue
                # dichteste Stelle: Figur mit den meisten Nachbarn in 6 m
                best = max(F[:400], key=lambda f: sum(1 for g in F if (g[0] - f[0]) ** 2 + (g[1] - f[1]) ** 2 < 36))
                if art == 'jubel': s.ev(f"{U}.set({best[0]}, {best[1]}, 80, 1)")
                s.ev(CAM, [best[0], best[1], best[2], 9 if art != 'sitzen' else 7, 2.2, 1.0, 0.35])
                snap(s, f'{th}_{art}')
                continue
            if art == 'stand':
                for f in sorted(set(st.get('form', 0) for st in I.get('stand', []))):
                    st = next(x for x in I['stand'] if x.get('form', 0) == f)
                    s.ev(CAM, [st['x'], st['z'], st.get('rot', 0), 30, 5, 4, 0.5])
                    snap(s, f'{th}_tribuene{f}')
                continue
            if art in ('start', 'ampel'):
                p = P['portal']
                if not p: continue
                if art == 'start':
                    s.ev(f"""(() => {{ window.__app.freezeCam = true; const c = __game.camera; c.position.set({p['x']} - {p['tx']} * 38, {p['y']} + 7, {p['z']} - {p['tz']} * 38);
                      c.up.set(0, 1, 0); c.lookAt({p['x']} + {p['tx']} * 25, {p['y']} + 4, {p['z']} + {p['tz']} * 25); c.fov = 62; c.updateProjectionMatrix(); }})()""")
                else:   # Countdown: neu starten, ~2 s in den Countdown (Ampel 3–4 rote Lichter)
                    s.ev("window.__app.freezeCam = false; __game.freeze(false); __game.toMenu(); __game.start({ autopilot: true })"); s.ev("__game.sim(1.9)"); s.ev("__game.freeze(true)")
                    s.ev(f"""(() => {{ window.__app.freezeCam = true; const c = __game.camera; c.position.set({p['x']} - {p['tx']} * 16, {p['y']} + 3, {p['z']} - {p['tz']} * 16);
                      c.up.set(0, 1, 0); c.lookAt({p['x']}, {p['y']} + 8, {p['z']}); c.fov = 55; c.updateProjectionMatrix(); }})()""")
                snap(s, f'{th}_{art}')
                continue
            if art == 'banden':
                it = first('pyro') or first('leinwand')
                if not it: continue
                s.ev(CAM, [it['x'], it['z'], it.get('rot', 0), 14, 2.5, 1.0, 0.6]); snap(s, f'{th}_{art}'); continue
            it = first(art)
            if not it: continue
            big = {'riesenrad': (45, 6, 9), 'leitturm': (32, 4, 7), 'leinwand': (38, 4, 8), 'picnic': (9, 2.5, 0.5), 'parkauto': (16, 3, 1), 'apres': (20, 3, 2.5), 'strandbar': (18, 3, 2)}.get(art, (16, 3, 1.5))
            s.ev(CAM, [it['x'], it['z'], it.get('rot', 0), big[0], big[1], big[2], 0.4])
            snap(s, f'{th}_{art}')
        s.ev("window.__app.fixTime = null")
    print('Fehler', s.errors[:6])
    s.close()
