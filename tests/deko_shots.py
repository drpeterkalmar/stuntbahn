# Deko (n28): Rundgang mit festen Szenen für den Vorher/Nachher-Vergleich – Menü, Start, Kurve (Leicht/Brachial, Drift),
# Cockpit, Blick über die Strecke, Zielshow, Ergebnis; je hoch und quer. Gleiche Physik → gleiche Stelle in beiden Ständen.
# Aufruf: python3 tests/deko_shots.py <Wurzel> <Name> [hoch,quer] [Code 4711-3-g] [Zusatz-URL, z. B. &deko=0]
#         → tests/shots/deko/<Name>_<hoch|quer>_<Szene>.png (+ info.json mit Draw-Calls/Dreiecken je Szene)
import sys, time, json, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from util import *

WURZEL = os.path.abspath(sys.argv[1]) if len(sys.argv) > 1 else ROOT
NAME = sys.argv[2] if len(sys.argv) > 2 else 'nachher'
DEVS = (sys.argv[3] if len(sys.argv) > 3 else 'hoch,quer').split(',')
CODE = sys.argv[4] if len(sys.argv) > 4 else '4711-3-g'
EXTRA = sys.argv[5] if len(sys.argv) > 5 else ''
SZENEN = os.environ.get('SZENEN', 'menu,start,kurve,cockpit,ueberblick,ziel,ergebnis').split(',')
sd, dd = CODE.split('-')[:2]
Q = f'?nosw&seed={sd}&d={dd}' + ('&g=1' if CODE.endswith('-g') else '&3d=1' if CODE.endswith('-3d') else '') + EXTRA
PORT = dict(PIXEL7_LAND, viewport={"width": 412, "height": 915})
DEV = {'quer': PIXEL7_LAND, 'hoch': PORT}
OUT = os.path.join(ROOT, 'tests', 'shots', 'deko')
os.makedirs(OUT, exist_ok=True)
T_KURVE = float(os.environ.get('T_KURVE', '17'))
# Blick schräg von hinten oben über die Strecke (zeigt Streckenrand, Landschaft, Himmel)
UEBER = """(() => { const g = __game, c = g.camera, car = g.race.car, p = car.pos, f = car.frame.f; g.freeze(true); window.__app.freezeCam = true;
  c.position.set(p.x - f.x * 34, p.y + 16, p.z - f.z * 34); c.up.set(0, 1, 0); c.lookAt(p.x + f.x * 40, p.y + 1, p.z + f.z * 40); c.fov = 62; c.updateProjectionMatrix(); })()"""

def shot(s, dev, sz, info):
    p = os.path.join(OUT, f'{NAME}_{dev}_{sz}.png')
    s.pg.screenshot(path=p)
    s.ev("__game.drawOnce !== undefined")
    info[sz] = s.ev("__game.info()")
    print(' ', sz, info[sz]['calls'], 'Calls', info[sz]['tris'], 'Dreiecke', flush=True)

def run(pw, srv, dev):
    info = {}
    s = Session(pw, srv.base, device=DEV[dev], kino=True)
    s.open(Q)
    s.ev("window.__app.fixTime = 12.5")
    s.frames(10); time.sleep(1.0)
    if 'menu' in SZENEN: shot(s, dev, 'menu', info)
    s.ev("__game.setAssist('easy')"); s.ev("__game.start({ autopilot: true })"); s.ev("__game.cam('chase')")
    s.ev("__game.sim(3.3)"); s.frames(12); time.sleep(0.5)
    s.ev("__game.freeze(true)"); s.frames(4)
    if 'start' in SZENEN: shot(s, dev, 'start', info)
    s.ev("__game.freeze(false)")
    s.ev(f"__game.sim({T_KURVE - 3.3 - 0.4})")
    # die letzten 0,4 s in Echtzeit-Schritten, damit Qualm/Spuren im Bild leben
    s.ev("__game.setTimeScale(0.25)"); time.sleep(1.4); s.ev("__game.freeze(true)"); s.ev("__game.setTimeScale(1)"); s.frames(4)
    if 'kurve' in SZENEN: shot(s, dev, 'kurve', info)
    if 'cockpit' in SZENEN:
        s.ev("__game.cam('cockpit')"); s.frames(8); time.sleep(0.4); shot(s, dev, 'cockpit', info); s.ev("__game.cam('chase')"); s.frames(4)
    if 'ueberblick' in SZENEN:
        s.ev(UEBER); s.frames(6); time.sleep(0.4); shot(s, dev, 'ueberblick', info)
    s.ev("window.__app.freezeCam = false; __game.freeze(false)")
    if 'ziel' in SZENEN or 'ergebnis' in SZENEN:
        for k in range(150):
            if s.ev("__game.sim(2.0)")['state'] == 'finished': break
        s.ev("__game.setTimeScale(0.15)")
        t0 = time.time()
        while s.ev("__game.show ? __game.showTau() : 99") < 1.45 and time.time() - t0 < 30: time.sleep(0.03)
        s.ev("__game.freeze(true)"); s.frames(3)
        if 'ziel' in SZENEN: shot(s, dev, 'ziel', info)
        s.ev("__game.freeze(false); __game.setTimeScale(1)")
        if s.ev("!!__game.show"): s.ev("__game.skipShow()")
        s.frames(3)
        if s.ev("!!__game.cine"): s.ev("__game.skipCine()")
        s.frames(10); time.sleep(1.2)
        if 'ergebnis' in SZENEN: shot(s, dev, 'ergebnis', info)
    info['fehler'] = s.errors[:6]
    print(dev, 'Fehler', s.errors[:6], flush=True)
    s.close()
    return info

res = {}
with Server(WURZEL) as srv, sync_playwright() as pw:
    for dev in DEVS:
        res[dev] = run(pw, srv, dev)
json.dump(res, open(os.path.join(OUT, f'{NAME}_info.json'), 'w'), ensure_ascii=False, indent=1)
