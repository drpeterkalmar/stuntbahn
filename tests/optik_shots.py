# Optik (28.09.2026): Vorher/Nachher-Fotos derselben Stellen – Handy quer, Handy hoch, Desktop; drei Strecken
# (Strecke des Tages, 4711-3, Beispiel-Rundkurs im .TRK-Format). Je Strecke: Start, Gerade mit Tempo (Auto fährt
# in Echtzeit → Bewegungsunschärfe sichtbar), Kurve (Echtzeit), Blick über die Landschaft (Standbild).
# Aufruf: python3 tests/optik_shots.py [Wurzelordner] [Zusatz] [nur-Gerät]
#   python3 tests/optik_shots.py tests/out/vorher_src vorher      → tests/shots/optik/vorher/*.jpg
#   python3 tests/optik_shots.py . nachher                        → tests/shots/optik/nachher/*.jpg
import os, sys, time, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from util import Server, Session, PIXEL7_LAND, DESKTOP, ROOT
from playwright.sync_api import sync_playwright

root = os.path.abspath(sys.argv[1]) if len(sys.argv) > 1 else ROOT
tag = sys.argv[2] if len(sys.argv) > 2 else 'nachher'
only = sys.argv[3] if len(sys.argv) > 3 else ''
extra = sys.argv[4] if len(sys.argv) > 4 else ''
PIXEL7_HOCH = dict(viewport={"width": 412, "height": 915}, device_scale_factor=2.625, is_mobile=True, has_touch=True,
                   user_agent=PIXEL7_LAND['user_agent'])
DEVICES = [('quer', PIXEL7_LAND), ('hoch', PIXEL7_HOCH), ('desktop', DESKTOP)]
TRACKS = [('tag', 'seed=20260927&d=2'), ('4711', 'seed=4711&d=3'), ('trk', 'trk=demo-rundkurs')]
OUT = os.path.join(ROOT, 'tests', 'shots', 'optik', tag)
os.makedirs(OUT, exist_ok=True)

# Stellen aus Linie + Tempo-Profil: schnellste Gerade am Boden (höchstes Profil-Tempo, keine Stunts) und die
# engste Kurve am Boden; je Index 1,2 s bzw. 0,9 s Anlauf in Echtzeit
PICK = """() => { const G = window.__game, T = G.env.track, L = T.line, P = G.env.prof, n = L.n;
  const jz = new Uint8Array(n);
  for (const j of T.jumps || []) for (let i = 0; i < n; i++) if (L.s[i] > L.s[j.lipIdx] - 260 && L.s[i] < L.s[j.landIdx] + 60) jz[i] = 1;
  const flat = (i) => !jz[i] && !L.loop[i] && !L.tube[i] && !L.air[i] && Math.abs(L.py[i] - G.env.track.terrain.height(L.px[i], L.pz[i])) < 0.6;
  const V = P.vf || P.vt;
  let fast = -1, fv = 0, curve = -1, ck = 0;
  for (let i = 20; i < n - 20; i++) {
    if (!flat(i)) continue;
    if (V[i] > fv) { fv = V[i]; fast = i; }
    const a = Math.atan2(L.tz[i + 8], L.tx[i + 8]) - Math.atan2(L.tz[i - 8], L.tx[i - 8]);
    const k = Math.abs(Math.atan2(Math.sin(a), Math.cos(a))) / Math.max(1, L.s[i + 8] - L.s[i - 8]);
    if (k > ck && V[i] > 20) { ck = k; curve = i; }
  }
  const back = (i, m) => { let j = i; while (j > 0 && L.s[i] - L.s[j] < m) j--; return j; };
  return { fast: back(fast, V[fast] * 1.3), fv: V[fast] * 3.6, curve: back(curve, V[curve] * 1.0), cv: V[curve] * 3.6 }; }"""
LAND = """() => { const G = window.__game, T = G.env.track, L = T.line, b = T.bounds, i = T.start.idx;
  const cx = (b.minX + b.maxX) / 2, cz = (b.minZ + b.maxZ) / 2;
  window.__app.freezeCam = true; G.freeze(true);
  const x = L.px[i], z = L.pz[i], dx = x - cx, dz = z - cz, l = Math.hypot(dx, dz) || 1;
  const cam = G.camera; cam.position.set(x - dx / l * 30, L.py[i] + 22, z - dz / l * 30); cam.up.set(0, 1, 0);
  cam.lookAt(x + dx / l * 400, L.py[i] - 10, z + dz / l * 400); cam.fov = 60; cam.updateProjectionMatrix(); return 1; }"""

def shot(s, name):
    p = os.path.join(OUT, name + '.jpg')
    s.pg.screenshot(path=p, type='jpeg', quality=85)
    return p

log = []
with Server(root) as srv, sync_playwright() as pw:
    for dname, dev in DEVICES:
        if only and dname != only: continue
        for tname, q in TRACKS:
            s = Session(pw, srv.base, device=dev)
            qq = '' if 'q=' in extra else ('&q=2' if dname == 'desktop' else '&q=1')   # feste Stufe (Headless-Bildrate)
            s.open(f'?nosw&{q}{qq}{extra}')
            s.ev("__game.setAssist('easy')")
            s.ev("__game.start({ autopilot: true })"); s.ev("__game.cam('chase')")
            s.frames(20); time.sleep(0.4)
            shot(s, f'{dname}_{tname}_1start')
            pk = s.ev(PICK)
            s.ev("__game.sim(3.2)")   # Countdown vorbei
            s.ev(f"__game.teleport({pk['fast']}, __game.env.prof.vf ? __game.env.prof.vf[{pk['fast']}] : __game.env.prof.vt[{pk['fast']}])"); s.ev("__game.rig.init = false")
            time.sleep(1.2); v1 = s.ev("__game.state().speed") * 3.6
            shot(s, f'{dname}_{tname}_2gerade')
            s.ev(f"__game.teleport({pk['curve']}, __game.env.prof.vf ? __game.env.prof.vf[{pk['curve']}] : __game.env.prof.vt[{pk['curve']}])"); s.ev("__game.rig.init = false")
            time.sleep(0.9); v2 = s.ev("__game.state().speed") * 3.6
            shot(s, f'{dname}_{tname}_3kurve')
            s.ev(LAND); s.frames(6); time.sleep(0.5)
            shot(s, f'{dname}_{tname}_4landschaft')
            info = s.ev("__game.info()")
            rec = dict(geraet=dname, strecke=tname, profil_kmh=round(pk['fv']), gerade_kmh=round(v1), kurve_kmh=round(v2), fps=round(info['fps']), calls=info['calls'], tris=info['tris'], fehler=s.errors[:3])
            print(json.dumps(rec, ensure_ascii=False), flush=True)
            log.append(rec)
            s.close()
with open(os.path.join(OUT, 'log.json'), 'w') as f: json.dump(log, f, ensure_ascii=False, indent=1)
