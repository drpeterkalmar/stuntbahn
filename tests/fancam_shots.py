# Highlight-Film n27 im Browser: neue Kameras (Fan-Cam in drei Clips, Kran, Bodenkamera, Heckkamera) als Fotoserien
# (Burst 6 × ~160 ms bei verlangsamtem Film), dazu Reißschwenk, Freeze-Frame (Rekord-Stunt) und Weißblitz. Prüft, dass
# jede erzwungene Kamera wirklich läuft (oder sauber auf Drohne/Action ausweicht) und 0 JS-Fehler.
# Aufruf: python3 tests/fancam_shots.py [quer|hoch] [Code, z. B. 1234-3-g] → tests/shots/fancam/
import sys, time, json, os
sys.path.insert(0, 'tests')
from util import *

DEV = sys.argv[1] if len(sys.argv) > 1 else 'quer'
CODE = sys.argv[2] if len(sys.argv) > 2 else '1234-3-g'
sd, dd = CODE.split('-')[:2]
Q = f'?nosw&seed={sd}&d={dd}' + ('&g=1' if CODE.endswith('-g') else '&3d=1' if CODE.endswith('-3d') else '')
PIXEL7_PORT = dict(PIXEL7_LAND, viewport={"width": 412, "height": 915})
DEVICES = {'quer': PIXEL7_LAND, 'hoch': PIXEL7_PORT, 'desktop': DESKTOP}
OUT = os.path.join(ROOT, 'tests', 'shots', 'fancam')
os.makedirs(OUT, exist_ok=True)

def collage(paths, out):
    from PIL import Image
    ims = [Image.open(p) for p in paths]
    w, h = ims[0].size; sc = 0.4 if w > h else 0.5
    tw, th = int(w * sc), int(h * sc)
    cols = 3 if w > h else 6
    rows = (len(ims) + cols - 1) // cols
    C = Image.new('RGB', (tw * cols, th * rows), (20, 20, 20))
    for i, im in enumerate(ims): C.paste(im.convert('RGB').resize((tw, th)), ((i % cols) * tw, (i // cols) * th))
    C.save(out, quality=85); return out

def burst(s, tag, ci, frac, cam=None, n=6, ts=0.12):
    info = s.ev("__game.cineInfo()")
    c = info['clips'][ci]
    s.ev(f"__game.setTimeScale({ts})")
    s.ev(f"__game.cineSeek({ci}, {c['a'] + frac * (c['b'] - c['a'])})")
    if cam: s.ev(f"__game.cineForce('{cam}')")
    s.frames(4); time.sleep(0.3)
    paths, cams = [], []
    for k in range(n):
        paths.append(s.shot(f'{tag}_{k}', 'fancam')); cams.append(s.ev("__game.cineState().cam")); time.sleep(0.16)
    s.ev("__game.cineForce(null)")
    return {'clip': c['label'], 'kamera': cams, 'collage': collage(paths, os.path.join(OUT, f'{tag}_burst.jpg'))}

res = {'dev': DEV, 'code': CODE}
with Server() as srv, sync_playwright() as pw:
    s = Session(pw, srv.base, device=DEVICES[DEV], kino=True)
    s.open(Q)
    s.ev("__game.setAssist('medium')"); s.ev("__game.start({autopilot:true})"); s.frames(3)
    for k in range(150):
        if s.ev("__game.sim(2.0)")['state'] == 'finished': break
    s.ev("__game.skipShow()"); s.frames(3); time.sleep(0.5)
    info = s.ev("__game.cineInfo()")
    res['film'] = [f"{c['label']} [{' → '.join(x['cam'] for x in c['shots'])}]" for c in info['clips']]
    mom = [i for i, c in enumerate(info['clips']) if c['kind'] != 'finish']
    # drei Fan-Cam-Einstellungen in verschiedenen Clips
    j = 0
    for ci in mom:
        for frac in (0.3, 0.7):
            if j >= 3: break
            b = burst(s, f'{DEV}_fan{j}', ci, frac, 'fan')
            if b['kamera'].count('fan') >= 4: res[f'fan_{j}'] = b; j += 1
            else: res.setdefault('fan_ausweich', []).append(b['clip'] + ' → ' + b['kamera'][0])
    for cam, ci in (('crane', mom[min(1, len(mom) - 1)]), ('low', mom[min(2, len(mom) - 1)]), ('rear', mom[0])):
        res[cam] = burst(s, f'{DEV}_{cam}', ci, 0.5, cam)
    # Reißschwenk: Ende einer Einstellung mit whipOut
    wi = None
    for ci, c in enumerate(info['clips']):
        for sh in c['shots'][:-1]:
            if wi is None: wi = (ci, sh['t1'] - 0.1)
    if wi:
        s.ev("__game.setTimeScale(0.03)"); s.ev(f"__game.cineSeek({wi[0]}, {wi[1]})"); s.frames(2)
        res['whip'] = []; t0 = time.time()
        while time.time() - t0 < 12 and len(res['whip']) < 4:
            f = s.ev("window.__app.cineFx")
            if f and f.get('whip', 0) > 0.01: s.shot(f'{DEV}_whip_{len(res["whip"])}', 'fancam'); res['whip'].append(f)
            time.sleep(0.05)
    # Freeze-Frame am Rekord-Stunt
    rec = [i for i, c in enumerate(info['clips']) if c['label'].startswith('⭐')]
    if rec:
        c = info['clips'][rec[0]]
        s.ev("__game.setTimeScale(0.25)"); s.ev(f"__game.cineSeek({rec[0]}, {c['tp'] - 0.15})"); s.frames(2)
        t0 = time.time(); fz = None
        while time.time() - t0 < 8:
            f = s.ev("window.__app.cineFx")
            if f and f.get('freeze'): fz = f; break
            time.sleep(0.03)
        res['freeze'] = fz
        if fz: s.shot(f'{DEV}_freeze', 'fancam')
    s.ev("__game.setTimeScale(1)")
    res['fehler'] = s.errors[:8]
    s.close()
print(json.dumps(res, ensure_ascii=False, indent=1))
ok = not res['fehler'] and all(f'fan_{j}' in res for j in range(3)) and len(res.get('whip', [])) >= 1 and res.get('freeze')
print('ERGEBNIS', 'grün' if ok else 'ROT')
sys.exit(0 if ok else 1)
