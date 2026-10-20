# n36 Action-Momente: Bildfolgen (≥ 12 Bilder je Moment) als Collage – Bullet-Time am großen Sprung, Looping kopfüber,
# knappes Überholen, Crash, Foto-Finish, Grafik „Einfach“ (CSS-Effekte), Online-Schein, Bullet-Time im Highlight-Film.
# Das Spiel läuft dafür bildweise (__game.manuell / __game.bild(1/60)) – jedes Bild wie im Spiel, ohne Zeitdruck beim Fotografieren.
# Aufruf: python3 tests/action_shots.py [szene,…]   → tests/shots/action/*.png + collage_<szene>.jpg
import sys, os, time, json, subprocess
sys.path.insert(0, 'tests')
from util import *
OUT = os.path.join(ROOT, 'tests', 'shots', 'action')
WANT = sys.argv[1].split(',') if len(sys.argv) > 1 else ['bullet', 'kopf', 'vorbei', 'crash', 'ziel', 'einfach', 'online', 'film']
ERG = {}

def bis_moment(s, art=None, max_s=40, vor=None):
    # bildweise fahren, bis ein Moment (der Art art) läuft; vor(s) = JS je 0,5 s (z. B. teleport)
    js = """(a) => { const G = __game; for (let i = 0; i < a.n; i++) { G.bild(1 / 60); const M = G.action && G.action.M;
      if (M && (!a.art || M.art === a.art)) return { art: M.art, u: M.u, t: G.race.time, cam: M.cam };
      if (G.race.state === 'finished') return { fertig: true }; } return null; }"""
    for k in range(int(max_s * 2)):
        r = s.ev(js, {'n': 30, 'art': art})
        if r: return r
    return None

def folge(s, name, n=18, schritt=6):
    # n Bilder alle schritt Bilder (1/60 s) ab jetzt
    bilder, info = [], []
    for k in range(n):
        p = os.path.join(OUT, f'{name}_{k:02d}.png'); s.pg.screenshot(path=p); bilder.append(p)
        info.append(s.ev("__app.actionFx"))
        s.ev(f"__game.bild(1 / 60, {schritt})")
    return bilder, info

def collage(name, bilder, info, titel):
    args = []
    for k, (p, i) in enumerate(zip(bilder, info)):
        t = f"{k * 0.1:.1f} s" + (f" · {i['art']} {i['k']:.2f}×" if i and i.get('art') else ' · normal')
        args.append(f"{p}={t}")
    out = os.path.join(OUT, f'collage_{name}.jpg')
    subprocess.run([sys.executable, os.path.join(ROOT, 'tests', 'collage.py'), out, '6', '320', *args], check=True, capture_output=True)
    ERG[name] = {'titel': titel, 'collage': os.path.relpath(out, ROOT), 'bilder': len(bilder), 'arten': sorted({i['art'] for i in info if i and i.get('art')}),
                 'k_min': min([i['k'] for i in info if i] or [1]), 'fov': [i['fov'] for i in info if i][:3]}
    print(name, json.dumps(ERG[name], ensure_ascii=False), flush=True)

def neu(s, q):
    s.open(q)
    s.ev("window.__app.actionRnd = () => 0")   # jeder Kandidat zählt (Abkühlzeit/Gefahr gelten weiter)

os.makedirs(OUT, exist_ok=True)
with Server() as srv, sync_playwright() as pw:
    s = Session(pw, srv.base)
    if 'bullet' in WANT:
        neu(s, '?nosw&seed=4711&d=2&action=2')
        s.tap('button[data-a=start]'); s.ev("__game.manuell(true)")
        r = bis_moment(s, 'bullet'); print('bullet', r)
        b, i = folge(s, 'bullet'); collage('bullet', b, i, 'Bullet-Time am großen Sprung (Scheitel)')
        # Eingabe in der Bullet-Time: Gas-Tipp (drücken + loslassen in einem Bild) zählt – Salto beginnt
        s.ev("__game.manuell(false)")
    if 'kopf' in WANT:
        neu(s, '?nosw&seed=1000&d=3&action=2')
        s.tap('button[data-a=start]'); s.ev("__game.manuell(true)")
        s.ev("__game.bild(1/60, 200)")
        idx = s.ev("(() => { const K = __game.race.bauK; for (let i = 0; i < K.length; i++) if (K[i] === 'loop') return i; return -1; })()")
        s.ev(f"__game.teleport(Math.max(0, {idx} - 40), 33)")
        r = bis_moment(s, 'kopf', 20); print('kopf', idx, r)
        b, i = folge(s, 'kopf', 14, 5); collage('kopf', b, i, 'Looping-Scheitel: Speed-Ramp + Zoom-Punch')
        s.ev("__game.manuell(false)")
    if 'vorbei' in WANT:
        neu(s, '?nosw&seed=2024&d=2&action=2&gegner=3&startplatz=hinten')
        s.tap('button[data-a=start]'); s.ev("__game.manuell(true)")
        r = bis_moment(s, 'vorbei', 60); print('vorbei', r)
        if r and r.get('art') == 'vorbei':
            b, i = folge(s, 'vorbei', 13, 5); collage('vorbei', b, i, 'Knappes Überholen: Speed-Ramp, Blick zum Gegner')
        s.ev("__game.manuell(false)")
    if 'crash' in WANT:
        # Überschlag nachgestellt: Auto (mit Beulen, Schaden „Nur Optik“) bei Tempo hochgeworfen und rollend, dann der Crash der
        # Physik (setCrash) – der Weg Rennen-Ereignis → Regie → Bullet-Time ist der echte
        neu(s, '?nosw&seed=4711&d=2&action=2&schaden=optik')
        s.tap('button[data-a=start]'); s.ev("__game.manuell(true)")
        s.ev("__game.bild(1/60, 260)")
        s.ev("__game.teleport(300, 40)"); s.ev("__game.bild(1/60, 20)")
        s.ev("__game.treffer([-0.3, 0.1, -2.4], [0, 0, -1], 30); __game.treffer([-1.08, 0.1, 0.8], [-1, 0, 0], 24); __game.treffer([0.6, 0.2, 2.25], [0, 0, 1], 22)")
        s.ev("(() => { const c = __game.race.car; c.pos.y += 1.6; c.v.y = 5; c.w.x = 0; c.w.z = 0; const F = c.frame.f; c.w.x = F.x * 7; c.w.y = F.y * 7; c.w.z = F.z * 7; })()")
        s.ev("__game.bild(1/60, 14)")
        s.ev("__game.race.car.setCrash('Überschlag')")
        r = bis_moment(s, 'crash', 3); print('crash', r, s.ev("__game.action.log.map(e => e.art + ':' + (e.ok ? 'OK' : e.grund))"))
        if r and r.get('art') == 'crash':
            b, i = folge(s, 'crash', 14, 6); collage('crash', b, i, 'Crash/Überschlag: Bullet-Time um das Wrack')
        s.ev("__game.manuell(false)")
    if 'ziel' in WANT:
        neu(s, '?nosw&seed=4711&d=2&action=2&gegner=1&startplatz=vorne')
        s.tap('button[data-a=start]'); s.ev("__game.manuell(true)")
        s.ev("__game.bild(1/60, 300)")
        s.ev("__game.actionStart('ziel')")
        b, i = folge(s, 'ziel', 13, 6); collage('ziel', b, i, 'Foto-Finish (erzwungen): Zeitlupe, Fotoblitz, Balken')
        s.ev("__game.manuell(false)")
    if 'einfach' in WANT:
        neu(s, '?nosw&seed=4711&d=2&action=2&q=0')
        s.ev("__game.quality.forced = '0'; __game.quality.tier = 0; dispatchEvent(new Event('resize'))")
        s.tap('button[data-a=start]'); s.ev("__game.manuell(true)")
        r = bis_moment(s, 'bullet'); print('einfach', r)
        b, i = folge(s, 'einfach', 14, 7); collage('einfach', b, i, 'Grafik Einfach: Effekte per CSS (Balken, Blitz, Vignette)')
        s.ev("__game.manuell(false)")
    print('Fehler', s.errors[:6])
    s.close()
    if 'online' in WANT:
        s = Session(pw, srv.base)
        neu(s, '?nosw&seed=4711&d=2&onlineprobe=1&action=2')
        s.ev("__game.start({})"); time.sleep(1.5); s.ev("__game.manuell(true)")
        r = bis_moment(s, 'bullet', 30); print('online', r, s.ev("__game.action && __game.action.online"))
        b, i = folge(s, 'online', 13, 7); collage('online', b, i, 'Online: nur Schein (Zoom-Punch + Effekte, Physik echt)')
        print('Fehler online', s.errors[:6])
        s.close()
    if 'film' in WANT:
        s = Session(pw, srv.base, kino=True)
        neu(s, '?nosw&seed=4711&d=2&action=2')
        s.tap('button[data-a=start]'); s.ev("__game.manuell(true)")
        r = bis_moment(s, 'bullet'); print('film: live', r)
        s.ev("__game.bild(1/60, 120)"); s.ev("__game.manuell(false)")
        s.ev("__game.sim(90)")   # zu Ende fahren (ohne Bild)
        s.pg.wait_for_function("__game.cine && __game.cine.player", timeout=60000)
        info = s.ev("__game.cineInfo()")
        ci = next((k for k, c in enumerate(info['clips']) if c['freeze'] and c['freeze'].get('orbit')), -1)
        print('film clips', [(c['kind'], c['freeze']) for c in info['clips']])
        if ci >= 0:
            fz = info['clips'][ci]['freeze']
            s.ev("__game.manuell(true)")
            s.ev(f"__game.cineSeek({ci}, {fz['t'] - 0.4})")
            b, i = [], []
            for k in range(16):
                p = os.path.join(OUT, f'film_{k:02d}.png'); s.ev("__game.bild(1 / 60, 6)"); s.pg.screenshot(path=p); b.append(p)
                st = s.ev("(() => { const P = __game.cine.player; return { art: P.hold > 0 ? 'film-bullet' : 'film', k: P.speed, fov: __game.camera.fov }; })()"); i.append(st)
            collage('film', b, i, 'Highlight-Film: Bullet-Time-Standbild mit Kreisfahrt')
        print('Fehler film', s.errors[:6])
        s.close()
json.dump(ERG, open(os.path.join(OUT, 'ergebnis.json'), 'w'), ensure_ascii=False, indent=1)
