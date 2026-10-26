# n40 Zieljubel im Browser: dieselbe Fahrt (Leicht, Seed fest) mit ?zieljubel=aus | dreher | stunt → Rennzeit, gespeicherte
# Bestzeit, Geist und Aufzeichnung bis zur Linie müssen bitgleich sein (wie n27); dazu Fotos aus dem Zieleinlauf des
# Highlight-Films (Stunt im Film, Titel „🏁 Ziel · …“) → tests/shots/n40/film_ziel_<quer|hoch>.jpg
# Aufruf: python3 tests/n40_ziel_probe.py [quer|hoch] [Code, z. B. 4-2] [Figur back|front|schraube]
import sys, time, json, os, hashlib
sys.path.insert(0, 'tests')
from util import *

DEV = sys.argv[1] if len(sys.argv) > 1 else 'quer'
CODE = sys.argv[2] if len(sys.argv) > 2 else '4-2'
FIG = sys.argv[3] if len(sys.argv) > 3 else 'back'
sd, dd, *rest = CODE.split('-')
fl = rest[0] if rest else ''
Q = f'?nosw&seed={sd}&d={dd}' + ('&g=1' if fl.startswith('g') else '&3d=1' if fl.startswith('3d') else '') + ('&h=1' if fl.endswith('h') else '')
PIXEL7_PORT = dict(PIXEL7_LAND, viewport={"width": 412, "height": 915})
DEVICES = {'quer': PIXEL7_LAND, 'hoch': PIXEL7_PORT, 'desktop': DESKTOP}
OUT = os.path.join(ROOT, 'tests', 'shots', 'n40')
os.makedirs(OUT, exist_ok=True)
STAND = """(() => { const r = __game.race, n = r.finF * 16, a = Array.from(r.rec.slice(0, n)).map((x) => x.toFixed(6)).join(',');
  const st = __game.store, best = JSON.stringify(st.best), gi = JSON.stringify(st.ghostIndex);
  return { zeit: r.finalTime, finF: r.finF, rec: a, best, gi, recLen: r.rec.length / 16, zstunt: r.zstunt ? r.zstunt.art : null, why: r.zstuntWhy || null }; })()"""

def collage(paths, out):
    from PIL import Image
    ims = [Image.open(p) for p in paths]
    w, h = ims[0].size; sc = 0.36 if w > h else 0.42
    tw, th = int(w * sc), int(h * sc); cols = 4 if w > h else 5
    rows = (len(ims) + cols - 1) // cols
    C = Image.new('RGB', (tw * cols, th * rows), (20, 20, 20))
    for i, im in enumerate(ims): C.paste(im.convert('RGB').resize((tw, th)), ((i % cols) * tw, (i // cols) * th))
    C.save(out, quality=86); return out

res = {'dev': DEV, 'code': CODE, 'figur': FIG, 'laeufe': {}}
with Server() as srv, sync_playwright() as pw:
    for zj in ('aus', 'dreher', 'stunt'):
        s = Session(pw, srv.base, device=DEVICES[DEV], kino=True)
        s.open(Q + f'&zieljubel={zj}&zstunt={FIG}')
        s.ev("__game.setAssist('easy')"); s.ev("__game.start({ seed: 11 })"); s.ev("__game.cam('chase')"); s.frames(3)
        for k in range(150):
            if s.ev("__game.sim(2.0)")['state'] == 'finished': break
        s.ev("__game.skipShow()"); s.frames(3); time.sleep(0.5)
        st = s.ev(STAND)
        r = {k: st[k] for k in ('zeit', 'finF', 'recLen', 'zstunt', 'why')}
        r['rec_hash'] = hashlib.sha1(st['rec'].encode()).hexdigest()[:12]
        r['best_hash'] = hashlib.sha1((st['best'] + st['gi']).encode()).hexdigest()[:12]
        info = s.ev("__game.cineInfo()")
        fin = [i for i, c in enumerate(info['clips']) if c['kind'] == 'finish']
        r['film'] = [c['label'] for c in info['clips']]
        if zj == 'stunt' and fin:
            c = info['clips'][fin[0]]
            r['ziel_clip'] = {k: c[k] for k in ('label', 'a', 'b')}; r['ziel_clip']['shots'] = [(x['cam'], round(x['t0'], 2), round(x['t1'], 2)) for x in c['shots']]
            s.ev("__game.setTimeScale(0.1)"); paths = []
            for k in range(12):
                s.ev(f"__game.cineSeek({fin[0]}, {c['a'] + (k + 1) / 13 * (c['b'] - c['a'])})"); s.frames(4); time.sleep(0.25)
                paths.append(s.shot(f'film_ziel_{k}_{DEV}', 'n40'))
            r['collage'] = collage(paths, os.path.join(OUT, f'film_ziel_{DEV}.jpg'))
            s.ev("__game.setTimeScale(1)")
        r['fehler'] = s.errors[:8]
        res['laeufe'][zj] = r
        s.close()
L = res['laeufe']
gleich = len({(L[z]['zeit'], L[z]['finF'], L[z]['rec_hash'], L[z]['best_hash']) for z in L}) == 1
res['bitgleich'] = gleich
print(json.dumps(res, ensure_ascii=False, indent=1))
ok = gleich and L['stunt']['zstunt'] == FIG and not any(L[z]['fehler'] for z in L) and any('🏁 Ziel ·' in t for t in L['stunt']['film'])
print('ERGEBNIS', 'grün' if ok else 'ROT')
sys.exit(0 if ok else 1)
