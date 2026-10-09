# Wetter (n32): Fotos je Wetter und Kamera für die Abnahme – Verfolger in Fahrt, Cockpit, Stoßstange, Hubschrauber.
# Ein Browser; Wetter per __game.setWetter, Thema per __game.setTheme gewechselt.
# Aufruf: python3 tests/wetter_shots.py quer|hoch [code=25-2-g] [themen=land,winter] [wetter=klar,regen,schnee] [q=2] [kams=chase,cockpit,bumper]
#         [root=Ordner (Vorher-Kopie)] [zusatz=&zeit=nacht] [tag=Dateizusatz]
# Ausgabe: tests/shots/wetter/<thema>_<wetter>_<kamera>_<quer|hoch><tag>.png + Fehler auf stdout
import sys, time, os, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from util import *
A = dict(a.split('=', 1) for a in sys.argv[2:] if '=' in a)
mode = sys.argv[1] if len(sys.argv) > 1 else 'quer'
code = A.get('code', '25-2-g')
themes = A.get('themen', 'land,winter').split(',')
wetter = A.get('wetter', 'klar,regen,schnee').split(',')
kams = A.get('kams', 'chase,cockpit,bumper').split(',')
qq = A.get('q', '2'); root = A.get('root', ROOT); zusatz = A.get('zusatz', ''); tag = A.get('tag', '')
dev = dict(PIXEL7_LAND, viewport={"width": 412, "height": 915}) if mode == 'hoch' else PIXEL7_LAND
seed, diff, *rest = code.split('-')
q = f'seed={seed}&d={diff}' + ('&g=1' if 'g' in rest else '&3d=1' if '3d' in rest else '')
SUB = 'wetter'
def snap(s, name, wait=0.4):
    s.frames(8); time.sleep(wait)
    p = s.shot(f'{name}_{mode}{tag}', SUB)
    print('Foto', p, flush=True)
with Server(root) as srv, sync_playwright() as pw:
    s = Session(pw, srv.base, device=dev)
    s.ctx.add_init_script("try { localStorage.setItem('stuntbahn.cam', 'chase'); } catch (e) {}")
    s.open(f'?nosw&{q}&thema={themes[0]}&q={qq}&startprobe=0{zusatz}')
    hatW = s.ev("typeof __game.setWetter === 'function'")
    for k, th in enumerate(themes):
        if k:
            s.ev("window.__app.freezeCam = false; __game.freeze(false); __game.cam('chase'); __game.toMenu()")
            s.ev(f"__game.setTheme('{th}')"); s.pg.wait_for_function(f"__game.theme === '{th}'", timeout=180000)
        for w in wetter:
            if hatW: s.ev(f"__game.setWetter('{w}')")
            elif w != 'klar': continue
            s.ev("window.__app.freezeCam = false; __game.freeze(false); __game.setAssist('easy'); __game.start({ autopilot: true })")
            s.ev("__game.sim(3.2)")
            # ein Stück fahren, bis Tempo da ist (Gischt ab 60 km/h)
            s.ev("__game.sim(6.0)")
            for kam in kams:
                s.ev(f"__game.cam('{kam}')")
                for _ in range(20): s.ev("__game.sim(0.033)"); s.frames(1)
                s.ev("__game.freeze(true)")
                snap(s, f'{th}_{w}_{kam}')
                s.ev("__game.freeze(false)")
            print(th, w, json.dumps(s.ev("({ w: __game.wetter, info: __game.info() })"))[:600], flush=True)
            s.ev("__game.cam('chase'); __game.toMenu()")
    print('Fehler', s.errors[:8])
    s.close()
