# Kino-Look (n17): Leistung je Grafik-Stufe – GPU-Bildzeit (Median bis die GPU fertig ist, Szene angehalten), Draw-Calls,
# Dreiecke, echte Bildrate im laufenden Rennen (Autopilot, rAF-Zähler über PERF_SEC Sekunden).
# Aufruf: python3 tests/perf_kinolook.py [Wurzel] [Zusatz-Query] [Stufen 0,1,2] [Strecken demo,tag,gel]
#   Wurzel = Repo (Standard) oder z. B. tests/out/vorher_n17 (Stand vor n17)
#   Zusatz z. B. '&look=alt' (alter Weg) oder '&kl=-ssao' (eine Kino-Stufe abschalten)
# Handy-Profil = Pixel 7 quer (Stufe 0/1), Desktop 1280×720 (Stufe 2). Mit PERF_THROTTLE=4 wird die CPU per CDP gedrosselt.
import os, sys, time, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import util
from util import Server, Session, PIXEL7_LAND, DESKTOP, ROOT
# Headless drosselt requestAnimationFrame sonst auf ~10/s: Bildrate entsperren, damit die echte Leistung messbar ist
util.ARGS = util.ARGS + ['--disable-gpu-vsync', '--disable-frame-rate-limit']
from playwright.sync_api import sync_playwright

root = os.path.abspath(sys.argv[1]) if len(sys.argv) > 1 and sys.argv[1] not in ('', '.') else ROOT
extra = sys.argv[2] if len(sys.argv) > 2 else ''
tiers = [int(t) for t in (sys.argv[3] if len(sys.argv) > 3 else '0,1,2').split(',')]
TR = {'demo': 'demo', 'tag': 'seed=20260927&d=2', 'gel': 'seed=4711&d=2&g=1', '3d': 'seed=4711&d=3&3d=1', 'trk': 'trk=demo-rundkurs'}
tracks = (sys.argv[4] if len(sys.argv) > 4 else 'demo').split(',')
N = int(os.environ.get('PERF_N', '30'))
SEC = float(os.environ.get('PERF_SEC', '5'))
THR = float(os.environ.get('PERF_THROTTLE', '0'))
DEV = os.environ.get('PERF_DEV', '')   # 'desk' = immer Desktop, 'phone' = immer Pixel 7 quer

# Bildzeit: ganzes Bild wie im Spiel (G.drawOnce, ab n17) bzw. altes Verfahren (Post/direkt); v = Tempo für die Unschärfe
MEASURE = """([n, v]) => { const G = window.__game, r = G.renderer, gl = r.getContext(), px = new Uint8Array(4), cam = G.camera, P = G.post;
  G.freeze(true); const ts = []; let info = null;
  for (let k = 0; k < n + 3; k++) {
    const t0 = performance.now(); r.info.reset();
    if (P && P.prev) { const f = new cam.position.constructor(0, 0, -1).applyQuaternion(cam.quaternion);
      P.prev.pos.copy(cam.position).addScaledVector(f, -v / 60); P.prev.q.copy(cam.quaternion); P.prev.proj.copy(cam.projectionMatrix); P.prev.ok = true; P.autoOff = false; }
    if (G.drawOnce) G.drawOnce({ run: v > 0, speed: v });
    else { let drew = false; if (P && v > 0) drew = P.render(G.scene, cam, { run: true, speed: v, boost: 0, car: G.carVis.root, dt: 1 / 60, cut: false }); if (!drew) r.render(G.scene, cam); }
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
    if (k >= 3) ts.push(performance.now() - t0);
    if (k === 3) info = { calls: r.info.render.calls, tris: r.info.render.triangles };
  }
  G.freeze(false); ts.sort((a, b) => a - b);
  return { ms: +ts[ts.length >> 1].toFixed(2), p90: +ts[Math.floor(ts.length * 0.9)].toFixed(2), ...info }; }"""

with Server(root) as srv, sync_playwright() as pw:
    for tname in tracks:
        for tier in tiers:
            dev = DESKTOP if (DEV == 'desk' or (tier == 2 and DEV != 'phone')) else PIXEL7_LAND
            # 'big': 1920×1080 bei Pixeldichte 2 (bis 8,3 MP) – die GPU rechnet dann an der Pixelzahl, nicht an der Latenz;
            # so lassen sich die Kosten einzelner Stufen trennen (für den Bericht auf Handy-Pixel umgerechnet)
            if DEV == 'big': dev = dict(DESKTOP, viewport={'width': 1920, 'height': 1080}, device_scale_factor=2)
            s = Session(pw, srv.base, device=dev)
            t0 = time.time()
            s.open(f'?nosw&{TR[tname]}&q={tier}{extra}')
            boot = time.time() - t0
            if THR:
                cdp = s.ctx.new_cdp_session(s.pg); cdp.send('Emulation.setCPUThrottlingRate', {'rate': THR})
            s.ev("__game.setAssist('easy')"); s.ev("__game.start({ autopilot: true })"); s.ev("__game.cam('chase')")
            s.ev("__game.sim(3.2)"); s.ev("__game.sim(4)"); s.frames(10)
            stand = s.ev(MEASURE, [N, 0])
            fahrt = s.ev(MEASURE, [N, 97])
            # echte Bildrate: Rennen läuft (Echtzeit), Automatik aus (q fest)
            f0 = s.ev("window.__app.frames"); t1 = time.time(); time.sleep(SEC); f1 = s.ev("window.__app.frames"); fps = (f1 - f0) / (time.time() - t1)
            info = s.ev("__game.info()")
            kl = s.ev("__game.kino ? __game.kino.describe() : null")
            out = dict(strecke=tname, stufe=tier, geraet='big' if DEV == 'big' else ('desktop' if dev is DESKTOP else 'pixel7q'), boot_s=round(boot, 2), stand=stand, fahrt=fahrt,
                       fps=round(fps, 1), pr=info.get('pixelRatio'), kino=kl, fehler=s.errors[:3], drossel=THR or None)
            print(json.dumps(out, ensure_ascii=False), flush=True)
            s.close()
