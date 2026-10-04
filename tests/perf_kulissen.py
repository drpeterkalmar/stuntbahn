# Kulissen (n20): Leistung vorher (Stand vor n20, z. B. tests/out/n20/head) gegen nachher je Thema – GPU-Bildzeit (Median bis
# die GPU fertig ist, Szene angehalten, ganzes Bild wie im Spiel), Draw-Calls, Dreiecke, echte Bildrate (rAF entsperrt),
# Startzeit. Handy-Profil Pixel 7 quer (Stufe 0/1); PERF_DEV=big: 1920×1080 bei Pixeldichte 2 (GPU rechnet an der Pixelzahl
# wie ein Handy). Vorher/nachher abwechselnd, damit Hintergrundlast beide gleich trifft.
# Aufruf: python3 tests/perf_kulissen.py <vorher-Wurzel> [Strecken gel,g25,flach,3d] [Stufen 0,1] [Themen auto,stadt,kueste]
# Ausgabe: JSON-Zeilen (stdout und tests/out/n20/perf.jsonl)
import os, sys, time, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import util
from util import Server, Session, PIXEL7_LAND, DESKTOP, ROOT
util.ARGS = util.ARGS + ['--disable-gpu-vsync', '--disable-frame-rate-limit']
from playwright.sync_api import sync_playwright

old = os.path.abspath(sys.argv[1]) if len(sys.argv) > 1 else os.path.join(ROOT, 'tests/out/n20/head')
TR = {'gel': 'seed=20261004&d=2&g=1', 'g25': 'seed=25&d=2&g=1', 'flach': 'seed=4711&d=3', '3d': 'seed=4711&d=3&3d=1', 'trk': 'trk=demo-rundkurs'}
tracks = (sys.argv[2] if len(sys.argv) > 2 else 'gel,g25,flach,3d').split(',')
tiers = [int(t) for t in (sys.argv[3] if len(sys.argv) > 3 else '0,1').split(',')]
themes = (sys.argv[4] if len(sys.argv) > 4 else 'auto,stadt,kueste').split(',')
N = int(os.environ.get('PERF_N', '30')); SEC = float(os.environ.get('PERF_SEC', '4'))
DEV = os.environ.get('PERF_DEV', '')
MEASURE = """([n, v]) => { const G = window.__game, r = G.renderer, gl = r.getContext(), px = new Uint8Array(4); G.freeze(true); const ts = []; let info = null;
  for (let k = 0; k < n + 3; k++) { const t0 = performance.now(); r.info.reset(); G.drawOnce({ run: v > 0, speed: v }); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
    if (k >= 3) ts.push(performance.now() - t0); if (k === 3) info = { calls: r.info.render.calls, tris: r.info.render.triangles }; }
  G.freeze(false); ts.sort((a, b) => a - b); return { ms: +ts[ts.length >> 1].toFixed(2), ...info }; }"""
os.makedirs(os.path.join(ROOT, 'tests/out/n20'), exist_ok=True)
outf = open(os.path.join(ROOT, 'tests/out/n20/perf.jsonl'), 'a')

def run(pw, root, label, tname, tier, theme):
    with Server(root) as srv:
        dev = dict(DESKTOP, viewport={'width': 1920, 'height': 1080}, device_scale_factor=2) if DEV == 'big' else DESKTOP if DEV == 'desk' else PIXEL7_LAND
        s = Session(pw, srv.base, device=dev)
        t0 = time.time()
        s.open(f'?nosw&{TR[tname]}&q={tier}' + (f'&thema={theme}' if theme != 'auto' else ''))
        boot = time.time() - t0
        s.ev("__game.setAssist('easy')"); s.ev("__game.start({ autopilot: true })"); s.ev("__game.cam('chase')")
        s.ev("__game.sim(3.2)"); s.ev("__game.sim(4)"); s.frames(10)
        stand = s.ev(MEASURE, [N, 0]); fahrt = s.ev(MEASURE, [N, 97])
        f0 = s.ev("window.__app.frames"); t1 = time.time(); time.sleep(SEC); fps = (s.ev("window.__app.frames") - f0) / (time.time() - t1)
        th = s.ev("__game.theme || 'land'")
        r = dict(stand=label, strecke=tname, stufe=tier, thema=th, dev=DEV or 'pixel7', boot_s=round(boot, 2), bild_ms=stand['ms'], fahrt_ms=fahrt['ms'], calls=fahrt['calls'], tris=fahrt['tris'], fps=round(fps, 1), fehler=s.errors[:2])
        s.close()
    print(json.dumps(r, ensure_ascii=False), flush=True); outf.write(json.dumps(r, ensure_ascii=False) + '\n'); outf.flush()

with sync_playwright() as pw:
    for tname in tracks:
        for tier in tiers:
            run(pw, old, 'vorher', tname, tier, 'auto')
            for th in themes:
                run(pw, ROOT, 'nachher', tname, tier, th)
