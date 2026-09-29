# Stoßstangen-Kamera (n15): Fotos hoch + quer im Rennen und im Replay; prüft, dass nichts vom eigenen Auto
# (Karosserie, Scheibenrahmen, Spoiler, Nitro-Flammen) im Bild liegt: das Auto wird allein in eine Fläche gerendert
# (Alpha-Maske) und der verdeckte Bildanteil gemessen.
# Aufruf: python3 tests/stossstange_shots.py <tag> [wurzel]  → tests/shots/stossstange/<tag>_*.png
import sys, os, json, time
sys.path.insert(0, 'tests')
from util import *

TAG = sys.argv[1] if len(sys.argv) > 1 else 'test'
RT = sys.argv[2] if len(sys.argv) > 2 else ROOT
DEV = {'quer': PIXEL7_LAND, 'hoch': dict(PIXEL7_LAND, viewport={"width": 412, "height": 915})}
CARMASK = r"""async () => {
  const THREE = await import('./lib/three.module.min.js');
  const G = window.__game, R = G.renderer, W = innerWidth, H = innerHeight, car = G.carVis.root;
  const sc = new THREE.Scene(), par = car.parent, vis = car.visible;
  sc.add(car); car.visible = true;
  const rt = new THREE.WebGLRenderTarget(W, H), prev = R.getRenderTarget(), cc = new THREE.Color(); R.getClearColor(cc); const ca = R.getClearAlpha();
  R.setRenderTarget(rt); R.setClearColor(0, 0); R.clear(true, true, true); R.render(sc, G.camera);
  const px = new Uint8Array(W * H * 4); R.readRenderTargetPixels(rt, 0, 0, W, H, px);
  R.setRenderTarget(prev); R.setClearColor(cc, ca); rt.dispose();
  par.add(car); car.visible = vis;
  let n = 0, rows = new Set(); for (let i = 0; i < W * H; i++) if (px[i * 4 + 3] > 20) { n++; rows.add(H - 1 - Math.floor(i / W)); }
  return { carPct: +(100 * n / (W * H)).toFixed(2), carRows: rows.size, carVisibleFlag: vis, view: G.rig.view };
}"""
d = os.path.join(ROOT, 'tests', 'shots', 'stossstange'); os.makedirs(d, exist_ok=True)
out = {}; bad = []
with Server(RT) as srv, sync_playwright() as pw:
    for dev in ['quer', 'hoch']:
        s = Session(pw, srv.base, device=DEV[dev])
        s.open('?nosw&seed=4711&d=2')
        s.ev("() => { const G = window.__game; G.setAssist('medium'); G.start({autopilot:true}); G.sim(6); G.cam('bumper'); }")
        s.frames(10); time.sleep(0.5)
        for k, extra in enumerate(['', 'nitro']):
            if extra: s.ev("() => { const G = window.__game; G.race.requestNitro(); G.sim(0.6); }"); s.frames(8); time.sleep(0.3)
            m = s.ev(CARMASK); name = f'{dev}_rennen{"_nitro" if extra else ""}'
            s.pg.screenshot(path=os.path.join(d, f'{TAG}_{name}.png')); out[name] = m; print(name, m, flush=True)
        s.ev("() => { const G = window.__game; for (let i = 0; i < 300 && G.race.state !== 'finished'; i++) G.sim(1); }")
        s.frames(3); s.ev("__game.replay()"); s.frames(3)
        s.tap('#replayui [data-v=bumper]')
        for frac in (0.25, 0.6):
            s.ev(f"() => {{ const R = window.__game.replayObj; R.t = R.duration * {frac}; }}"); s.frames(10); time.sleep(0.4)
            m = s.ev(CARMASK); name = f'{dev}_replay_{int(frac*100)}'
            s.pg.screenshot(path=os.path.join(d, f'{TAG}_{name}.png')); out[name] = m; print(name, m, flush=True)
        if s.errors: bad.append(s.errors[:3])
        s.close()
json.dump(out, open(os.path.join(d, f'werte_{TAG}.json'), 'w'), indent=1)
print('errors', bad)
