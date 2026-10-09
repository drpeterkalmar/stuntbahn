# Tageszeit (n32 Nachtrag): Fotos Abend/Nacht – Verfolger in Fahrt, Cockpit, Start/Ziel von hinten, Looping kopfüber
# (Galerie-Strecke) – und Messung der Fahrbahn-Helligkeit (Lesbarkeit: Mittelwert eines Fahrbahn-Ausschnitts vor dem Auto).
# Aufruf: python3 tests/zeit_shots.py quer|hoch [themen=land,stadt] [zeiten=abend,nacht] [wetter=klar] [motive=chase,cockpit,start,loop] [q=2] [tag=]
import sys, os, json, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from util import *
from PIL import Image
import numpy as np
A = dict(a.split('=', 1) for a in sys.argv[2:] if '=' in a)
mode = sys.argv[1] if len(sys.argv) > 1 else 'quer'
themes = A.get('themen', 'land,stadt').split(','); zeiten = A.get('zeiten', 'abend,nacht').split(','); wetter = A.get('wetter', 'klar').split(',')
motive = A.get('motive', 'chase,cockpit,start,loop').split(','); qq = A.get('q', '2'); tag = A.get('tag', '')
dev = dict(PIXEL7_LAND, viewport={"width": 412, "height": 915}) if mode == 'hoch' else PIXEL7_LAND
SUB = 'zeit'; res = {}
def snap(s, name, roi=None):
    s.frames(10); time.sleep(0.3)
    p = s.shot(f'{name}_{mode}{tag}', SUB)
    if roi:   # Fahrbahn-Helligkeit (0 … 1, Luminanz sRGB) im Ausschnitt roi = (x0, y0, x1, y1) relativ
        im = np.asarray(Image.open(p).convert('RGB')).astype(float) / 255; h, w = im.shape[:2]
        c = im[int(roi[1] * h):int(roi[3] * h), int(roi[0] * w):int(roi[2] * w)]
        lum = float((0.2126 * c[..., 0] + 0.7152 * c[..., 1] + 0.0722 * c[..., 2]).mean()); res[name] = round(lum, 3)
        print('Foto', p, 'Fahrbahn-Helligkeit', round(lum, 3), flush=True)
    else: print('Foto', p, flush=True)
LOOP = """(() => { const T = __game.env.track, L = T.line, k = T.pieces.findIndex((p) => p.type === 'loop'); if (k < 0) return false; const P = T.pieces[k]; let j = P.lineStart, acc = 0; while (acc < 60) { const q = j - 1; acc += Math.hypot(L.px[j] - L.px[q], L.pz[j] - L.pz[q]); j = q; } window.__pgLoop = k; __game.teleport(j, __game.env.prof.vt[j]); __game.race.stuckProg = -1e9; return true; })()"""
INLOOP = "(() => { const g = __game, r = g.race, c = r.car, i = r.tracker.idx, P = g.env.track.pieces[window.__pgLoop]; return i >= P.lineStart && i <= P.lineEnd && !!g.env.track.line.loop[i] && c.frame.u.y < -0.5; })()"
with Server() as srv, sync_playwright() as pw:
    s = Session(pw, srv.base, device=dev)
    s.open(f'?nosw&seed=25&d=2&g=1&thema={themes[0]}&q={qq}&startprobe=0&blur=off')
    for k, th in enumerate(themes):
        if k:
            s.ev("window.__app.freezeCam = false; __game.freeze(false); __game.toMenu()")
            s.ev(f"__game.setTheme('{th}')"); s.pg.wait_for_function(f"__game.theme === '{th}'", timeout=180000)
        for z in zeiten:
            for w in wetter:
                s.ev(f"__game.setZeit('{z}'); __game.setWetter('{w}')")
                nm = f'{th}_{z}' + (f'_{w}' if w != 'klar' else '')
                s.ev("window.__app.freezeCam = false; __game.freeze(false); __game.cam('chase'); __game.setAssist('easy'); __game.start({ autopilot: true })")
                if 'start' in motive:
                    s.ev("__game.sim(0.4)"); s.ev("__game.freeze(true)")
                    p = s.ev("(() => { const p = __game.env.track.decoPlan && __game.env.track.decoPlan.portal; return p ? { x: p.x, y: p.y, z: p.z, tx: p.tx, tz: p.tz } : null; })()")
                    if p:
                        s.ev(f"""(() => {{ window.__app.freezeCam = true; const c = __game.camera; c.position.set({p['x']} - {p['tx']} * 48, {p['y']} + 6.5, {p['z']} - {p['tz']} * 48);
                          c.up.set(0, 1, 0); c.lookAt({p['x']} + {p['tx']} * 20, {p['y']} + 5, {p['z']} + {p['tz']} * 20); c.fov = 62; c.updateProjectionMatrix(); }})()""")
                        snap(s, f'{nm}_start')
                    s.ev("window.__app.freezeCam = false; __game.freeze(false)")
                s.ev("__game.sim(9.0)")
                for cam, roi in (('chase', (0.3, 0.82, 0.7, 0.98) if mode == 'quer' else (0.25, 0.86, 0.75, 0.97)), ('cockpit', (0.3, 0.42, 0.7, 0.6) if mode == 'quer' else (0.25, 0.45, 0.75, 0.6))):
                    if cam not in motive: continue
                    s.ev(f"__game.cam('{cam}')")
                    for _ in range(20): s.ev("__game.sim(0.033)"); s.frames(1)
                    s.ev("__game.freeze(true)"); snap(s, f'{nm}_{cam}', roi); s.ev("__game.freeze(false)")
                s.ev("__game.cam('chase'); __game.toMenu()")
                print(th, z, w, json.dumps(s.ev("(() => { const n = __game.nacht; return { zeit: __game.zeit, nacht: n ? { n: n.n, pools: n.pools, ms: n.ms } : null, calls: __game.info().calls }; })()")), flush=True)
    if 'loop' in motive:
        s.ev("window.__app.freezeCam = false; __game.freeze(false); __game.toMenu()")
        s.close()
        for z in zeiten:
            s = Session(pw, srv.base, device=dev)
            s.open(f'?nosw&q={qq}&startprobe=0&gallery&blur=off&zeit={z}&thema={themes[0]}')
            s.ev("__game.setAssist('easy'); __game.store.settings.fahrstil = 'sauber'; __game.start({ autopilot: true }); __game.cam('chase')"); s.ev("__game.sim(3.6)")
            if s.ev(LOOP):
                for _ in range(900):
                    if s.ev(INLOOP): break
                    s.ev("__game.sim(1/60)")
                s.ev("__game.freeze(true)"); snap(s, f'{themes[0]}_{z}_looping')
                s.ev("__game.cam('far')"); snap(s, f'{themes[0]}_{z}_looping_heli')
            print('Fehler', s.errors[:6]); s.close()
    else:
        print('Fehler', s.errors[:6]); s.close()
print('HELLIGKEIT', json.dumps(res))
