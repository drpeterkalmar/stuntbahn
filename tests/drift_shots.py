# Leicht „Brachial“ (n25) im Browser: Option „Autopilot-Fahrstil“ (Standard Brachial, gespeichert, Pause-Menü), Rennen auf
# Leicht mit Händen weg – Fotoserien (Burst 6 Bilder) von Drift-Kurven im Verfolger, ein Cockpit-Bild, ein Beinahe-Dreher,
# danach Kino-Replay mit Drift-Moment (Burst). Prüft 0 JS-Fehler und dass wirklich gedriftet wird (Schwimmwinkel).
# Aufruf: python3 tests/drift_shots.py [quer|hoch] [seed-d, z. B. 4711-2] [Zusatz-URL]  → tests/shots/drift/
import sys, time, json, os, math
sys.path.insert(0, 'tests')
from util import *

DEV = sys.argv[1] if len(sys.argv) > 1 else 'quer'
CODE = sys.argv[2] if len(sys.argv) > 2 else '4711-2'
EXTRA = sys.argv[3] if len(sys.argv) > 3 else ''
sd, dd = CODE.split('-')[:2]
Q = f'?nosw&seed={sd}&d={dd}' + ('&g=1' if CODE.endswith('-g') else '&3d=1' if CODE.endswith('-3d') else '') + EXTRA
PIXEL7_PORT = dict(PIXEL7_LAND, viewport={"width": 412, "height": 915})
DEVICES = {'quer': PIXEL7_LAND, 'hoch': PIXEL7_PORT}
OUT = os.path.join(ROOT, 'tests', 'shots', 'drift')
os.makedirs(OUT, exist_ok=True)

BETA = "(() => { const c = __game.race.car, F = c.frame; return Math.atan2(c.v.x*F.r.x+c.v.y*F.r.y+c.v.z*F.r.z, c.v.x*F.f.x+c.v.y*F.f.y+c.v.z*F.f.z) * 57.3; })()"
FIND = """([cond, maxT]) => { const G = window.__game; const f = new Function('c', 'r', 'G', 'D', 'return ' + cond);
  for (let t = 0; t < maxT; t += 1 / 60) { G.sim(1 / 60); const r = G.race; if (r.state === 'finished') return -1; if (f(r.car, r, G, r.drift)) return t; }
  return -2; }"""

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

def settle(s, wait=0.6):
    s.ev("__game.setTimeScale(0.0005)"); s.frames(3); time.sleep(wait)

res = {'dev': DEV, 'code': CODE}
with Server() as srv, sync_playwright() as pw:
    s = Session(pw, srv.base, device=DEVICES[DEV], kino=True)
    s.open(Q)
    shot = lambda n: s.shot(f'{DEV}_{n}', 'drift')
    # Option: Standard Brachial, im Optionen-Blatt sichtbar, Umschalten wird gespeichert
    s.ev("__game.setAssist('easy')")
    s.ev("__game.ui.showSettings()"); s.frames(2); time.sleep(0.3)
    res['option_standard'] = s.ev("(document.querySelector('[data-g=fahrstil] button.on') || {}).textContent || ''")
    s.pg.locator('[data-g=fahrstil]').first.scroll_into_view_if_needed(); time.sleep(0.2); shot('optionen')
    s.tap('[data-a=fahrstil][data-v=sauber]')
    res['option_sauber'] = s.ev("[__game.store.settings.fahrstil, JSON.parse(localStorage.getItem('stuntbahn.v1')).settings.fahrstil]")
    s.tap('[data-a=fahrstil][data-v=brachial]')
    res['option_brachial'] = s.ev("JSON.parse(localStorage.getItem('stuntbahn.v1')).settings.fahrstil")
    s.ev("__game.ui.showMenu(__game.env)")
    # Rennen auf Leicht, Hände weg (fester Zufall für die Show-Momente)
    s.ev("__game.start({seed: 7})"); s.ev("__game.cam('chase')")
    s.frames(3)
    res['brachial_aktiv'] = s.ev("(__game.sim(4.0), __game.race.brachial)")
    bursts = []
    for k in range(3):
        t = s.ev(FIND, ["D && D.st && D.st.ph === 'hold' && D.st.t > 0.05 && Math.abs(D.beta) > 0.3 && c.speed() > 12", 60])
        if t < 0: break
        paths, betas = [], []
        s.ev("() => { const r = __game.race; for (let i = 0; i < 18; i++) __game.sim(1/120); }")
        for q in range(6):
            settle(s, 0.35)
            paths.append(shot(f'drift{k}_{q}')); betas.append(round(s.ev(BETA), 1))
            s.ev("__game.setTimeScale(1)"); s.ev("__game.sim(0.22)")
        col = collage(paths, os.path.join(OUT, f'{DEV}_drift{k}_burst.jpg'))
        bursts.append({'beta': betas, 'collage': os.path.relpath(col, ROOT)})
        print('burst', k, json.dumps(bursts[-1]), flush=True)
        s.ev("__game.setTimeScale(1)")
        s.ev(FIND, ["!D.st", 8])
    res['bursts'] = bursts
    # Cockpit im Drift (Lenkrad gegengelenkt)
    s.ev("__game.cam('cockpit')")
    t = s.ev(FIND, ["D && D.st && D.st.ph === 'hold' && Math.abs(D.beta) > 0.35 && c.speed() > 12", 60])
    if t >= 0: settle(s); shot('cockpit_drift'); res['cockpit_beta'] = round(s.ev(BETA), 1)
    s.ev("__game.setTimeScale(1)"); s.ev("__game.cam('chase')")
    # bis ins Ziel → Kino-Replay
    st = s.ev("() => { for (let i = 0; i < 300 && window.__game.race.state !== 'finished'; i++) window.__game.sim(1); return window.__game.state(); }")
    res['ziel'] = [st['state'], round(st['time'] or 0, 1), st['crashes']]
    res['drifts'] = s.ev("__game.race.drift ? __game.race.drift.log.length : 0")
    for k in range(60):
        if s.ev("!!__game.cine"): break
        s.frames(2); time.sleep(0.2)
    info = s.ev("__game.cineInfo()")
    res['film'] = [c['label'] for c in info['clips']] if info else None
    if info:
        dk = [i for i, c in enumerate(info['clips']) if c['kind'] in ('drift', 'spin')]
        if dk:
            ci = dk[0]; c = info['clips'][ci]
            s.ev("__game.setTimeScale(0.12)")
            s.ev(f"__game.cineSeek({ci}, {c['tp'] - 0.5})"); s.frames(4); time.sleep(0.3)
            paths = []
            for q in range(6): paths.append(shot(f'kino_{q}')); time.sleep(0.16)
            res['kino'] = {'clip': c['label'], 'collage': os.path.relpath(collage(paths, os.path.join(OUT, f'{DEV}_kino_burst.jpg')), ROOT)}
            s.ev("__game.setTimeScale(1)")
    res['fehler'] = [e for e in s.errors if 'GL Driver' not in e][:10]
    s.close()
print(json.dumps(res, ensure_ascii=False, indent=1))
ok = res['option_standard'].strip().endswith('Brachial') and res['option_sauber'] == ['sauber', 'sauber'] and res['option_brachial'] == 'brachial' \
    and res['brachial_aktiv'] and len(res['bursts']) >= 2 and all(max(abs(b) for b in x['beta']) > 15 for x in res['bursts']) and not res['fehler'] and res['ziel'][0] == 'finished'
print('OK' if ok else 'FEHLER')
sys.exit(0 if ok else 1)
