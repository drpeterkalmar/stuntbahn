# Optik (28.09.2026): Frame-Zeit, Draw-Calls, Dreiecke je Qualitätsstufe – vorher (HEAD-Kopie) gegen nachher, mit
# Bewegungsunschärfe Aus/Leicht/Stark. Gemessen wird die Zeit bis die GPU fertig ist (1-Pixel-readPixels), Median
# aus 40 Bildern, bei angehaltener Physik. Damit die Unschärfe realistisch rechnet, steht die „vorige“ Kamera je Bild
# 1,6 m hinter der aktuellen (≈ 350 km/h bei 60 Bildern/s, echter Streifen-Aufwand statt Leerlauf).
# Aufruf: python3 tests/perf_optik.py [Wurzel] [Zusatz]   (WEBGL=swiftshader → CPU-Rasterung als Handy-Näherung)
import os, sys, time, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from util import Server, Session, PIXEL7_LAND, DESKTOP, ROOT
from playwright.sync_api import sync_playwright

root = os.path.abspath(sys.argv[1]) if len(sys.argv) > 1 else ROOT
extra = sys.argv[2] if len(sys.argv) > 2 else ''
tiers = [int(t) for t in (sys.argv[3] if len(sys.argv) > 3 else '0,1,2').split(',')]
TRACKS = [t for t in [('tag', 'seed=20260927&d=2'), ('4711', 'seed=4711&d=3'), ('trk', 'trk=demo-rundkurs')] if not os.environ.get('PERF_TRACKS') or t[0] in os.environ['PERF_TRACKS'].split(',')]
N = int(os.environ.get('PERF_N', '40'))

MEASURE = """([mode, n]) => { const G = window.__game, r = G.renderer, gl = r.getContext(), px = new Uint8Array(4), P = G.post, cam = G.camera;
  G.freeze(true); const ts = []; let info = null;
  for (let k = 0; k < n + 3; k++) {
    const t0 = performance.now(); r.info.reset();
    let drew = false;
    if (P && mode !== 'direct') {
      const f = new cam.position.constructor(0, 0, -1).applyQuaternion(cam.quaternion);
      P.prev.pos.copy(cam.position).addScaledVector(f, -1.6); P.prev.q.copy(cam.quaternion); P.prev.proj.copy(cam.projectionMatrix); P.prev.ok = true;
      if (window.__perfSamples != null) P.samples = window.__perfSamples;
      P.setting = mode; P.autoOff = false;
      drew = P.render(G.scene, cam, { run: true, speed: 97, boost: 0, car: G.carVis.root, dt: 1 / 60, cut: false });
    }
    if (!drew) r.render(G.scene, cam);
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
    if (k >= 3) ts.push(performance.now() - t0);
    if (k === 3) info = { calls: r.info.render.calls, tris: r.info.render.triangles, drew };
  }
  G.freeze(false); ts.sort((a, b) => a - b);
  return { ms: +ts[ts.length >> 1].toFixed(2), p90: +ts[Math.floor(ts.length * 0.9)].toFixed(2), ...info, pr: r.getPixelRatio(), w: r.domElement.width, h: r.domElement.height }; }"""

with Server(root) as srv, sync_playwright() as pw:
    for tname, q in TRACKS:
        for tier in tiers:
            dev = DESKTOP if tier == 2 else PIXEL7_LAND
            s = Session(pw, srv.base, device=dev)
            t0 = time.time()
            s.open(f'?nosw&{q}&q={tier}{extra}')
            boot = time.time() - t0
            s.ev("__game.setAssist('easy')"); s.ev("__game.start({ autopilot: true })"); s.ev("__game.cam('chase')")
            s.ev("__game.sim(3.2)"); s.ev("__game.sim(4)"); s.frames(10)
            has_post = s.ev("!!__game.post")
            modes = ['direct'] + (['off', 'light', 'strong'] if has_post and tier > 0 else (['off'] if has_post else []))
            res = {}
            for m in modes:
                res[m] = s.ev(MEASURE, [m, N])
            if os.environ.get('PERF_SAMPLES') and has_post and tier > 0:
                for sm in os.environ['PERF_SAMPLES'].split(','):
                    s.ev(f"window.__perfSamples = {sm}")
                    res['light_s' + sm] = s.ev(MEASURE, ['light', N])
                s.ev("window.__perfSamples = null")
            out = dict(strecke=tname, stufe=tier, geraet='desktop' if tier == 2 else 'pixel7q', boot_s=round(boot, 2), neu=has_post, messung=res, fehler=s.errors[:3])
            print(json.dumps(out, ensure_ascii=False), flush=True)
            s.close()
