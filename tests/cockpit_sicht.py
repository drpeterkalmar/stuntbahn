# Cockpit-Sicht messen (n15): Wie viel der Bildhöhe zeigt Fahrbahn, ab wie viel Metern ist sie zu sehen, wo liegt der
# Horizont, wo die Oberkante des Armaturenbretts? Hoch (412×915) und quer (915×412), Mittel (Touch-Tasten sichtbar),
# auf Demo-Strecke (Gerade) und einer Sanft-Strecke (Gerade, Kurve, Kuppe). Dazu „Wackeln“: Drehrate der Kamera
# gegenüber der Fahrzeug-Lage auf einer Bodenwellen-Strecke.
# Messung: Strahlen durch ein Pixelraster (Strecke vs. Gelände, CollisionWorld) + Maske des Cockpit-Durchgangs
# (eigene Render-Fläche, Alpha). „Fahrbahn-Zeilen“ = Anteil der Bildzeilen mit mindestens einem freien Fahrbahn-Pixel.
# Aufruf: python3 tests/cockpit_sicht.py <tag> [hoch|quer ...] [&url-zusatz] [wurzel]  → tests/shots/cockpit_sicht/<tag>_*.png + werte_<tag>.json
import sys, time, json, os
sys.path.insert(0, 'tests')
from util import *

TAG = sys.argv[1] if len(sys.argv) > 1 else 'test'
DEVS = [a for a in sys.argv[2:] if a in ('hoch', 'quer')] or ['hoch', 'quer']
EXTRA = next((a for a in sys.argv[2:] if a.startswith('&')), '')
RT = next((a for a in sys.argv[2:] if os.path.isdir(a)), ROOT)   # andere Wurzel (z. B. tests/out/n15_vorher)
DEV = {'quer': PIXEL7_LAND, 'hoch': dict(PIXEL7_LAND, viewport={"width": 412, "height": 915})}

# Stellen auf der Strecke: Gerade (60 m ohne Richtungsänderung), Kurve (vor dem stärksten Bogen), Kuppe (Scheitel)
FIND = r"""(kind) => {
  const G = window.__game, L = G.env.track.line, n = L.n, P = G.env.track.pieces;
  const head = (i) => { const j = (i + 3) % n; return Math.atan2(L.px[j] - L.px[i], L.pz[j] - L.pz[i]); };
  const turn = (i, m) => { let a = 0, s0 = L.s[i]; for (let k = i, c = 0; c < n; c++, k = (k + 1) % n) { const d = Math.abs(((head((k + 1) % n) - head(k) + 3 * Math.PI) % (2 * Math.PI)) - Math.PI); a += d; if (((L.s[k] - s0) + (L.s[n - 1] + 1)) % (L.s[n - 1] + 1) > m) break; } return a; };
  const bad = (i) => L.loop[i] || L.tube[i] || L.air[i];
  let best = -1, bv = kind === 'gerade' ? 1e9 : -1e9;
  for (let i = Math.floor(n * 0.05); i < n - 30; i += 3) {
    if (bad(i)) continue;
    const pc = P[L.piece[i]];
    if (kind === 'gerade') { const v = turn(i, 80) + Math.abs(L.py[(i + 20) % n] - L.py[i]); if (v < bv) { bv = v; best = i; } }
    else if (kind === 'kurve') { const v = turn(i, 45) - 0.5 * turn(i, 8); if (v > bv) { bv = v; best = i; } }
    else if (kind === 'kuppe') { if (!pc || pc.type !== 'crest') continue; const v = L.py[i]; if (v > bv) { bv = v; best = i; } }
  }
  if (kind === 'kuppe' && best >= 0) { let k = best, s = L.s[best]; while (k > 0 && s - L.s[k] < 14) k--; best = k; }
  return best;
}"""

MEASURE = r"""async () => {
  const THREE = await import('./lib/three.module.min.js');
  const G = window.__game, cam = G.camera, R = G.renderer, W = innerWidth, H = innerHeight, world = G.env.world;
  cam.updateMatrixWorld(true);
  // Maske: Cockpit-Durchgang allein in eine Fläche (Alpha)
  let mask = null;
  if (G.rig.view === 'cockpit') {
    const cp = G.cockpit, rt = new THREE.WebGLRenderTarget(W, H);
    const prev = R.getRenderTarget(), cc = new THREE.Color(); R.getClearColor(cc); const ca = R.getClearAlpha();
    cp.cam.updateMatrixWorld(true);
    R.setRenderTarget(rt); R.setClearColor(0x000000, 0); R.clear(true, true, true); R.render(cp.scene, cp.cam);
    mask = new Uint8Array(W * H * 4); R.readRenderTargetPixels(rt, 0, 0, W, H, mask);
    R.setRenderTarget(prev); R.setClearColor(cc, ca); rt.dispose();
  }
  const covered = (x, y) => mask ? mask[((H - 1 - y) * W + x) * 4 + 3] > 127 : false;
  const car = G.race.car, up = new THREE.Vector3(car.frame.u.x, car.frame.u.y, car.frame.u.z);
  const o = cam.position, v = new THREE.Vector3();
  const SX = 6, SY = 3;
  let rows = 0, rowsC = 0, area = 0, tot = 0, near = 1e9, nearC = 1e9, far = 0;
  const x0c = W / 3, x1c = 2 * W / 3;
  for (let y = 1; y < H; y += SY) {
    let any = false, anyC = false;
    for (let x = 2; x < W; x += SX) {
      tot++;
      if (covered(x, y)) continue;
      v.set((x + 0.5) / W * 2 - 1, 1 - (y + 0.5) / H * 2, 0.5).unproject(cam).sub(o).normalize();
      const a = world.rayTrack(o.x, o.y, o.z, v.x, v.y, v.z, 900, false, {});
      if (!a) continue;
      const b = world.rayTerrain(o.x, o.y, o.z, v.x, v.y, v.z, a.t, {});
      if (b) continue;
      if (a.nx * up.x + a.ny * up.y + a.nz * up.z < 0.6) continue;     // Wand/Leitplanke/Unterseite
      area++; any = true;
      const d = Math.hypot(a.x - o.x, a.z - o.z);
      if (d < near) near = d; if (d > far) far = d;
      if (x >= x0c && x <= x1c) { anyC = true; if (d < nearC) nearC = d; }
    }
    if (any) rows++; if (anyC) rowsC++;
  }
  const ny = Math.ceil((H - 1) / SY);
  // Horizont: Punkt 2 km voraus waagrecht (Fahrtrichtung ohne Neigung)
  const f = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion); f.y = 0; f.normalize();
  const hp = o.clone().addScaledVector(f, 2000).project(cam), hz = (1 - hp.y) / 2 * H;
  // Oberkante Armaturenbrett/Lenkrad in der Bildmitte (erste verdeckte Zeile unter dem Horizont)
  let dash = H;
  if (mask) for (let y = Math.max(0, Math.round(hz)); y < H; y++) if (covered(Math.round(W / 2), y)) { dash = y; break; }
  let cov = 0; if (mask) for (let i = 3; i < mask.length; i += 4) if (mask[i] > 127) cov++;
  return { W, H, view: G.rig.view, rowsPct: +(100 * rows / ny).toFixed(1), rowsCenterPct: +(100 * rowsC / ny).toFixed(1), areaPct: +(100 * area / tot).toFixed(1),
    nearM: near < 1e8 ? +near.toFixed(1) : null, nearCenterM: nearC < 1e8 ? +nearC.toFixed(1) : null, farM: +far.toFixed(0),
    horizonPct: +(100 * hz / H).toFixed(1), dashTopPct: +(100 * dash / H).toFixed(1), cockpitPct: mask ? +(100 * cov / (W * H)).toFixed(1) : 0,
    fov: +cam.fov.toFixed(1) };
}"""

# Wackeln: Nicken und Wanken der Cockpit-Kamera (Grad) und Kopfhöhe (cm) nach Abzug des gleitenden Mittels über 0,5 s (Hochpass, RMS)
# über 12 s Autopilot-Fahrt auf der Sanft-Strecke mit Bodenwellen. Kamera und Physik im Gleichschritt 1/60 s, ohne Rendern.
WOBBLE = r"""async () => {
  const THREE = await import('./lib/three.module.min.js');
  const G = window.__game, rig = G.rig, cam = G.camera, race = G.race;
  const f = new THREE.Vector3(), r = new THREE.Vector3(), pit = [], rol = [], hy = [];
  for (let k = 0; k < 720; k++) {
    G.sim(1 / 60);
    const c = race.car;
    rig.update(1 / 60, { pos: c.pos, q: c.q, frame: c.frame, wheels: c.wheels, air: c.onGround === 0 }, false, G.env.world, c.speed());
    f.set(0, 0, -1).applyQuaternion(cam.quaternion); r.set(1, 0, 0).applyQuaternion(cam.quaternion);
    pit.push(Math.asin(Math.max(-1, Math.min(1, f.y))) * 180 / Math.PI); rol.push(Math.asin(Math.max(-1, Math.min(1, r.y))) * 180 / Math.PI); hy.push(cam.position.y * 100);
    if (race.state === 'finished') break;
  }
  const hp = (a) => { let s = 0, n = 0; for (let i = 15; i < a.length - 15; i++) { let m = 0; for (let j = -15; j <= 15; j++) m += a[i + j]; m /= 31; s += (a[i] - m) ** 2; n++; } return +Math.sqrt(s / Math.max(1, n)).toFixed(3); };
  return { pitchRms: hp(pit), rollRms: hp(rol), headCm: hp(hy), n: pit.length };
}"""

out = {}
d = os.path.join(ROOT, 'tests', 'shots', 'cockpit_sicht'); os.makedirs(d, exist_ok=True)
with Server(RT) as srv, sync_playwright() as pw:
    for dev in DEVS:
        s = Session(pw, srv.base, device=DEV[dev])
        for trk, q, kinds in [('demo', '?nosw&demo', ['gerade']), ('s4711', '?nosw&seed=4711&d=1', ['gerade', 'kurve', 'kuppe'])]:
            s.open(q + EXTRA)
            s.ev("() => { const G = window.__game; G.store.settings.cam = 'cockpit'; G.setAssist('medium'); G.start({autopilot:true}); G.sim(4); }")
            s.frames(5)
            for kind in kinds:
                i = s.ev(FIND, kind)
                if i < 0: print('nicht gefunden', trk, kind); continue
                s.ev(f"() => {{ const G = window.__game; G.freeze(false); G.teleport({i}, 25); G.sim(0.25); G.freeze(true); }}")
                s.ev("__game.cam('cockpit')")
                time.sleep(1.2); s.frames(10)
                m = s.ev(MEASURE)
                name = f'{dev}_{trk}_{kind}'
                s.pg.screenshot(path=os.path.join(d, f'{TAG}_{name}.png'))
                out[name] = m
                print(name, json.dumps(m), flush=True)
            s.ev("__game.freeze(false)")
        # Wackeln (Bodenwellen): Sanft-Strecke, Autopilot fährt
        s.open('?nosw&seed=4711&d=1' + EXTRA)
        s.ev("() => { const G = window.__game; G.store.settings.cam = 'cockpit'; G.setAssist('medium'); G.start({autopilot:true}); G.sim(4); G.freeze(true); G.cam('cockpit'); }")
        w = s.ev(WOBBLE)
        out[f'{dev}_wackeln'] = w
        print(dev, 'wackeln', w, flush=True)
        print('errors', s.errors[:5])
        s.close()
json.dump(out, open(os.path.join(d, f'werte_{TAG}.json'), 'w'), ensure_ascii=False, indent=1)
