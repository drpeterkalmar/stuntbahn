# Kino-Look (n17): Vergleichsfotos mit gleicher Kameraposition und gleicher Zeit (Wolkenschatten, Wind) – heute gegen
# Einfach/Standard/Kino. Szenen: Start, Gerade mit Tempo (mit Bewegungsunschärfe), Kurve mit Randdetails, Looping, Sprung mit
# Landung, Cockpit, Hochformat. Das Bild wird direkt nach dem Zeichnen aus dem Canvas gelesen (ohne HUD).
# Aufruf: python3 tests/kinolook_shots.py <Etikett> [Wurzel] [Zusatz-Query] [Szenen] [Strecke]
#   z. B. python3 tests/kinolook_shots.py vorher tests/out/vorher_n17 '&q=1'
#         python3 tests/kinolook_shots.py standard . '&look=1'
# Ergebnis: tests/shots/kinolook/<Etikett>/<szene>.jpg
import os, sys, time, json, base64
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from util import Server, Session, PIXEL7_LAND, ROOT
from playwright.sync_api import sync_playwright

label = sys.argv[1] if len(sys.argv) > 1 else 'test'
root = os.path.abspath(sys.argv[2]) if len(sys.argv) > 2 and sys.argv[2] not in ('', '.') else ROOT
extra = sys.argv[3] if len(sys.argv) > 3 else ''
SCENES = (sys.argv[4] if len(sys.argv) > 4 and sys.argv[4] else 'start,gerade,kurve,looping,sprung,cockpit,hochformat').split(',')
TRACK = sys.argv[5] if len(sys.argv) > 5 and sys.argv[5] else 'demo'
OUT = os.path.join(ROOT, 'tests', 'shots', 'kinolook', label)
os.makedirs(OUT, exist_ok=True)
PIXEL7_HOCH = dict(PIXEL7_LAND, viewport={'width': 412, 'height': 915})

HELP = """window.__kl = {
  fast() { const G = __game, L = G.env.track.line, P = G.env.prof, V = P.vf || P.vt; let b = 0, bi = 0;
    const jz = new Uint8Array(L.n); for (const j of G.env.track.jumps || []) for (let i = 0; i < L.n; i++) if (L.s[i] > L.s[j.lipIdx] - 260 && L.s[i] < L.s[j.landIdx] + 60) jz[i] = 1;
    for (let i = 0; i < L.n; i++) if (!jz[i] && !L.loop[i] && !L.tube[i] && V[i] > b) { b = V[i]; bi = i; }
    let j = bi; while (j > 0 && L.s[bi] - L.s[j] < b * 1.3) j--; return [j, V[j]]; },
  back(i, m) { const L = __game.env.track.line; let j = i; while (j > 0 && L.s[i] - L.s[j] < m) j--; return j; },
  curve() { const G = __game, L = G.env.track.line; let b = 0, bi = 0;
    for (let i = 20; i < L.n - 20; i++) { if (L.loop[i] || L.tube[i]) continue; const a = Math.atan2(L.tx[i - 15], L.tz[i - 15]), c = Math.atan2(L.tx[i + 15], L.tz[i + 15]);
      let d = Math.abs(c - a); if (d > Math.PI) d = 2 * Math.PI - d; if (d > b) { b = d; bi = i; } } return bi; },
  firstLoop() { const L = __game.env.track.line; for (let i = 0; i < L.n; i++) if (L.loop[i]) return i; return -1; },
  cam(dist, h, look, side = 0, fov = null) { const G = __game, c = G.race.car, p = c.pos, f = c.frame.f, r = c.frame.r, cam = G.camera;
    cam.position.set(p.x - f.x * dist + r.x * side, p.y + h, p.z - f.z * dist + r.z * side);
    cam.up.set(0, 1, 0); cam.lookAt(p.x + f.x * look, p.y + 0.6, p.z + f.z * look);
    cam.fov = fov || (cam.aspect < 1 ? 86 : 62); if (cam.view && cam.view.enabled) cam.clearViewOffset(); cam.updateProjectionMatrix(); cam.updateMatrixWorld(); },
  draw(o) { const G = __game, cam = G.camera, P = G.post, r = G.renderer;
    if (o.v > 0 && P && P.prev) { const f = new cam.position.constructor(0, 0, -1).applyQuaternion(cam.quaternion);
      P.prev.pos.copy(cam.position).addScaledVector(f, -o.v / 60); P.prev.q.copy(cam.quaternion); P.prev.proj.copy(cam.projectionMatrix); P.prev.ok = true; P.autoOff = false; }
    if (G.drawOnce) G.drawOnce({ run: o.v > 0, speed: o.v, cockpit: !!o.cockpit });
    else { let drew = false; if (o.v > 0 && P) drew = P.render(G.scene, cam, { run: true, speed: o.v, boost: 0, car: G.carVis.root, dt: 1 / 60, cut: false });
      if (!drew) r.render(G.scene, cam); if (o.cockpit) G.cockpit.render(r); }
    return r.domElement.toDataURL('image/jpeg', 0.9); },
};"""

def save(s, name, url):
    with open(os.path.join(OUT, name + '.jpg'), 'wb') as fh:
        fh.write(base64.b64decode(url.split(',', 1)[1]))

def hold(s):
    s.ev("__game.freeze(true); window.__app.freezeCam = true; window.__app.fixTime = 1234.5")
    s.frames(4)

def release(s):
    s.ev("__game.freeze(false); window.__app.freezeCam = false"); s.frames(2)

def run_scenes(s, scenes):
    s.ev(HELP)
    s.ev("__game.setAssist('easy')"); s.ev("__game.start({ autopilot: true })"); s.ev("__game.cam('chase')"); s.frames(3)
    for sc in scenes:
        v = 0; cockpit = False
        if sc == 'start':
            s.ev("__game.teleport(0, 0)") if False else None
            hold(s); s.ev("__kl.cam(6.2, 2.0, 10, 1.2)")
        else:
            st = s.state()
            if st['state'] == 'countdown': s.ev("__game.sim(3.3)")
            if sc in ('gerade', 'hochformat', 'cockpit'):
                i, vv = s.ev("__kl.fast()"); s.ev(f"__game.teleport({i}, {vv})"); s.ev("__game.sim(1.0)")
                v = s.ev("__game.race.car.speed()")
                if sc == 'cockpit':
                    s.ev("__game.cam('cockpit')"); s.ev("__game.freeze(true)"); s.frames(30); time.sleep(0.3)
                    s.ev("window.__app.freezeCam = true; window.__app.fixTime = 1234.5"); s.frames(3); cockpit = True
                else:
                    hold(s); s.ev("__kl.cam(6.5, 2.1, 14)")
            elif sc.startswith('teil_'):
                typ = sc[5:]
                i = s.ev(f"""() => {{ const G = __game, L = G.env.track.line, P = G.env.layout.pieces; for (let i = 0; i < L.n; i++) if (P[L.piece[i]] && P[L.piece[i]].type.startsWith('{typ}')) return i; return -1; }}""")
                if i < 0: print('kein Teil', typ); continue
                j = s.ev(f"__kl.back({i}, 30)")
                s.ev(f"__game.teleport({j}, (__game.env.prof.vf || __game.env.prof.vt)[{j}])"); s.ev("__game.sim(0.9)")
                v = s.ev("__game.race.car.speed()")
                hold(s); s.ev("__kl.cam(10, 4.5, 25, 3)")
            elif sc == 'nah':
                s.ev("__game.teleport(40, 0)"); s.ev("__game.sim(1.0)"); hold(s); s.ev("__kl.cam(4.2, 1.3, 2, 2.6)")
                if os.environ.get('KL_DEBUG'): s.ev(f"__game.kino.debug = '{os.environ['KL_DEBUG']}'")
            elif sc == 'kurve':
                i = s.ev("__kl.curve()"); j = s.ev(f"__kl.back({i}, 26)")
                s.ev(f"__game.teleport({j}, Math.min(30, (__game.env.prof.vf || __game.env.prof.vt)[{j}]))"); s.ev("__game.sim(0.5)")
                hold(s); s.ev("__kl.cam(9, 4.2, 12, -2.5)")
            elif sc == 'looping':
                i = s.ev("__kl.firstLoop()"); j = s.ev(f"__kl.back({i}, 34)")
                s.ev(f"__game.teleport({j}, (__game.env.prof.vf || __game.env.prof.vt)[{j}])"); s.ev("__game.sim(0.35)")
                v = s.ev("__game.race.car.speed()")
                hold(s); s.ev("__kl.cam(7.5, 2.6, 20, 0)")
            elif sc == 'sprung':
                lip = s.ev("__game.env.track.jumps[0].lipIdx"); j = s.ev(f"__kl.back({lip}, 70)")
                s.ev(f"__game.teleport({j}, (__game.env.prof.vf || __game.env.prof.vt)[{j}])")
                s.ev("""() => { const G = __game; let air = false; for (let k = 0; k < 400; k++) { G.sim(0.02); const c = G.race.car;
                  if (c.onGround === 0) air = true; else if (air) { G.sim(0.06); return k; } } return -1; }""")
                v = s.ev("__game.race.car.speed()")
                hold(s); s.ev("__kl.cam(7, 2.4, 10, 3.2)")
            if sc != 'cockpit' and not s.ev("window.__app.freezeCam"): hold(s)
        url = s.ev("(o) => __kl.draw(o)", {'v': v, 'cockpit': cockpit})
        save(s, sc, url)
        print(sc, 'v=%.0f km/h' % (v * 3.6), flush=True)
        if sc == 'cockpit': s.ev("__game.cam('chase')")
        release(s)

TR = {'demo': 'demo', 'gel': 'seed=4711&d=2&g=1', 'tag': 'seed=20260927&d=2', 'gal': 'gallery', 'galg': 'gallery=gel'}
with Server(root) as srv, sync_playwright() as pw:
    land = [x for x in SCENES if x != 'hochformat']
    if land:
        s = Session(pw, srv.base, device=PIXEL7_LAND)
        s.open(f'?nosw&{TR.get(TRACK, TRACK)}{extra}')
        run_scenes(s, land)
        info = s.ev("__game.kino ? __game.kino.describe() : null")
        print('kino', json.dumps(info), 'Fehler', s.errors[:3])
        s.close()
    if 'hochformat' in SCENES:
        s = Session(pw, srv.base, device=PIXEL7_HOCH)
        s.open(f'?nosw&{TR.get(TRACK, TRACK)}{extra}')
        run_scenes(s, ['hochformat'])
        print('hoch Fehler', s.errors[:3])
        s.close()
