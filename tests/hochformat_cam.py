# Verfolger-Kamera hoch vs. quer vermessen (ohne Rendern: Kamera-Rig direkt an vielen Stellen der Strecke):
#  autoY  – Bildhöhe des Autos (NDC, −1 unten … +1 oben; unteres Drittel = unter −0,33)
#  horizY – Bildhöhe des Horizonts (NDC)
#  voraus – wie viele Meter Mittellinie am Stück im Bild bleiben (max. 300 m) – Median und 10-%-Quantil (Kurven)
#  breite – Autobreite in Bildbreiten
#  draw_* / dreiecke_k – Draw-Calls und Dreiecke (Tausend) der Welt aus dieser Kamera
# Aufruf: python3 tests/hochformat_cam.py [seed|demo-…] [json-Parameter für PORTRAIT | -] [Stufe]
import sys, json
sys.path.insert(0, 'tests')
from util import *
from hochformat_util import DEVICES

seed = sys.argv[1] if len(sys.argv) > 1 else '4711'
override = json.loads(sys.argv[2]) if len(sys.argv) > 2 and sys.argv[2] != '-' else None
JS = r"""async ([W, H, over, off]) => {
  const G = window.__game, cam = G.camera, rig = G.rig, M = await import('./src/gfx/camera.js');
  const keep = { ...M.PORTRAIT };
  if (over) Object.assign(M.PORTRAIT, over);
  if (off) Object.assign(M.PORTRAIT, { vfov: 62, dist: 0, h: 0, look: 0, lookUp: 0, speedFov: 0, aim: 0 });
  cam.aspect = W / H; cam.updateProjectionMatrix();
  const L = G.env.track.line, n = L.n, res = [];
  const T = await import('three'); const v = new T.Vector3();
  const ndc = (x, y, z) => { v.set(x, y, z).project(cam); return [v.x, v.y, v.z]; };
  G.start({ autopilot: true }); G.sim(3.4);
  for (let k = 0; k < 60 && G.race.state !== 'finished'; k++) {
    G.sim(0.9);
    const c = G.race.car; if (c.onGround === 0) continue;
    rig.mode = 'chase'; rig.init = false;   // wie nach einem Versetzen: Kamera + Streckenbezug neu
    const pose = { pos: c.pos, q: c.q, frame: c.frame, air: false, wheels: c.wheels };
    for (let i = 0; i < 40; i++) rig.update(1 / 30, pose, false, G.env.world, c.speed());
    cam.updateMatrixWorld(); cam.matrixWorldInverse.copy(cam.matrixWorld).invert();
    const u = c.frame.u, f = c.frame.f;
    const a = ndc(c.pos.x + u.x * 0.5, c.pos.y + u.y * 0.5, c.pos.z + u.z * 0.5);
    const fh = Math.hypot(f.x, f.z) || 1;
    const hz = ndc(cam.position.x + f.x / fh * 5000, cam.position.y, cam.position.z + f.z / fh * 5000);
    const b = { x: -f.z / fh, y: 0, z: f.x / fh };
    const l1 = ndc(c.pos.x - b.x, c.pos.y - b.y, c.pos.z - b.z), l2 = ndc(c.pos.x + b.x, c.pos.y + b.y, c.pos.z + b.z);
    // Mittellinie ab dem Auto voraus
    let i0 = G.race.tracker.idx, s0 = L.s[i0], ahead = 0;
    for (let j = 1; j < n; j++) {
      const i = (i0 + j) % n; let ds = L.s[i] - s0; if (ds < 0) ds += L.s[n - 1] + 1;
      if (ds > 300) { ahead = 300; break; }
      const p = ndc(L.px[i], L.py[i] + 0.2, L.pz[i]);
      if (p[2] > 1 || Math.abs(p[0]) > 1 || Math.abs(p[1]) > 1) { ahead = ds; break; }
      ahead = ds;
    }
    G.renderer.info.reset(); G.renderer.render(G.scene, cam);
    const calls = G.renderer.info.render.calls, tris = G.renderer.info.render.triangles;
    res.push({ calls, tris, idx: G.race.tracker.idx, kind: G.env.track.pieces[L.piece[G.race.tracker.idx]]?.kind || G.env.track.pieces[L.piece[G.race.tracker.idx]]?.type, carY: a[1], carX: Math.abs(a[0]), hz: hz[1], ahead, w: Math.abs(l2[0] - l1[0]) / 2, kmh: c.speed() * 3.6 });
  }
  Object.assign(M.PORTRAIT, keep);
  return res;
}"""
def stats(r):
    q = lambda k, p: sorted(x[k] for x in r)[int(p * (len(r) - 1))]
    return dict(n=len(r), autoY=round(q('carY', 0.5), 2), horizY=round(q('hz', 0.5), 2), voraus_med=round(q('ahead', 0.5)), voraus_p10=round(q('ahead', 0.1)), breite=round(q('w', 0.5), 2), autoX_max=round(q('carX', 1.0), 2),
                draw_mittel=round(sum(x['calls'] for x in r) / len(r)), draw_max=q('calls', 1.0), dreiecke_k=round(sum(x['tris'] for x in r) / len(r) / 1000))
with Server() as srv, sync_playwright() as pw:
    s = Session(pw, srv.base, device=DEVICES['pixel7']['ctx'], dpr=1)
    s.open(f'?nosw&seed={seed}&d={sys.argv[3] if len(sys.argv) > 3 else 2}' if not seed.startswith('demo') else '?nosw&trk=' + seed)
    out = {}
    out['quer 915×412'] = stats(s.pg.evaluate(JS, [915, 412, None, False]))
    out['hoch alt (wie quer)'] = stats(s.pg.evaluate(JS, [412, 915, None, True]))
    rr = s.pg.evaluate(JS, [412, 915, override, False])
    out['hoch neu'] = stats(rr)
    for x in rr:
        if x['carX'] > 0.8: print('  Auto am Rand:', x)
    out['hoch klein 360×740'] = stats(s.pg.evaluate(JS, [360, 740, override, False]))
    for k, v in out.items(): print(f'{k:22s}', v)
    print('errors', s.errors[:3])
    s.close()
