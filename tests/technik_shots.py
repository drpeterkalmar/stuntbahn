# n30 Technik: Abnahme-Fotos der Neuerungen, je Teil eine Vergleichs-Collage nach tests/shots/technik/<teil>_<gerät>.jpg
# (Einzelbilder daneben, nicht im Repo). Jede Spalte = eine URL-Variante (A/B), jede Zeile = eine Szene.
# Aufruf: python3 tests/technik_shots.py <teil>[,<teil>] [hoch,quer] [Wurzel]
#   Teile: hdr (je Landschaft Himmel + Lack, ?hdr=1k gegen klein), lod (Auto nah/mittel/fern, Stufen erzwungen),
#          schatten (Auto-Schatten eng gegen bisher), detail (Fahrbahn nah), reflex (Lack-Spiegelung), vao (Strecke mit/ohne
#          gebackene Verdeckung, Kino mit/ohne SSAO), baeume (Impostors gegen Karten, nah/fern), looping
import sys, os, time, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from util import *
from PIL import Image, ImageDraw, ImageFont

TEILE = sys.argv[1].split(',') if len(sys.argv) > 1 else ['hdr']
DEVS = (sys.argv[2] if len(sys.argv) > 2 else 'quer').split(',')
WURZEL = os.path.abspath(sys.argv[3]) if len(sys.argv) > 3 else ROOT
OUT = os.path.join(ROOT, 'tests', 'shots', 'technik')
os.makedirs(OUT, exist_ok=True)
PORT = dict(PIXEL7_LAND, viewport={"width": 412, "height": 915})
DEV = {'quer': PIXEL7_LAND, 'hoch': PORT}
BASIS = '?nosw&q=2&startprobe=0&seed=4711&d=3&g=1&blur=off'
FONT = None
try: FONT = ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc', 26)
except Exception: FONT = ImageFont.load_default()

# Kamera relativ zum Auto: seitlich/vorn/hoch in Metern, Blick auf das Auto (+ Höhe), Bildwinkel
KAM = """([s, v, h, ziel, fov]) => { const g = __game, c = g.camera, car = g.race.car, p = car.pos, f = car.frame.f;
  const r = { x: f.z, z: -f.x }; window.__app.freezeCam = true;
  c.position.set(p.x + r.x * s + f.x * v, p.y + h, p.z + r.z * s + f.z * v); c.up.set(0, 1, 0);
  c.lookAt(p.x + f.x * ziel, p.y + 0.5, p.z + f.z * ziel); c.fov = fov; c.updateProjectionMatrix(); }"""

def start(pw, srv, dev, q, t=3.3):
    s = Session(pw, srv.base, device=DEV[dev])
    s.open(q)
    s.ev("window.__app.fixTime = 12.5")
    s.frames(6)
    # sofort anhalten (gleiche Stelle in jeder Variante: nur sim() bewegt das Auto, nicht die Echtzeit bis zum nächsten Befehl)
    s.ev("__game.setAssist('easy'); __game.start({ autopilot: true }); __game.freeze(true); __game.cam('chase')")
    s.ev(f"__game.sim({t})"); s.frames(12)
    return s

def foto(s, name, warte=6):
    s.frames(warte); time.sleep(0.3)
    p = os.path.join(OUT, name + '.png')
    s.pg.screenshot(path=p)
    return p

def collage(name, spalten, zeilen, bilder, breite=None):
    # bilder[(zeile, spalte)] = Pfad; Beschriftung oben (Spalten) und links (Zeilen)
    ims = {k: Image.open(v).convert('RGB') for k, v in bilder.items() if v and os.path.exists(v)}
    if not ims: return None
    w0, h0 = next(iter(ims.values())).size
    sk = (breite or (900 if w0 > h0 else 420)) / w0
    w, h = int(w0 * sk), int(h0 * sk)
    lx, ly = 150, 40
    C = Image.new('RGB', (lx + w * len(spalten), ly + h * len(zeilen)), (24, 24, 28))
    d = ImageDraw.Draw(C)
    for j, sp in enumerate(spalten): d.text((lx + j * w + 8, 6), sp, fill=(255, 255, 255), font=FONT)
    for i, z in enumerate(zeilen):
        d.text((8, ly + i * h + h // 2 - 14), z, fill=(255, 255, 255), font=FONT)
        for j in range(len(spalten)):
            if (i, j) in ims: C.paste(ims[(i, j)].resize((w, h), Image.LANCZOS), (lx + j * w, ly + i * h))
    p = os.path.join(OUT, name + '.jpg')
    C.save(p, quality=86)
    print('→', os.path.relpath(p, ROOT), flush=True)
    return p

def teil_hdr(pw, srv, dev):
    themen = ['land', 'alpen', 'wueste', 'kueste', 'stadt', 'herbst', 'winter']
    var = [('1k (bisher)', '&hdr=1k&reflex=0'), ('512 (neu)', '&reflex=0')]
    B = {}
    for i, th in enumerate(themen):
        for j, (_, extra) in enumerate(var):
            s = start(pw, srv, dev, BASIS + f'&thema={th}' + extra)
            try:
                s.ev(KAM, [3.6, 2.6, 1.15, 0.2, 42]); B[(2 * i, j)] = foto(s, f'hdr_{dev}_{th}_{j}_lack')
                s.ev(KAM, [0.0, -7.5, 2.2, 30, 70]); B[(2 * i + 1, j)] = foto(s, f'hdr_{dev}_{th}_{j}_himmel')
                if s.errors: print(th, extra, 'FEHLER', s.errors[:3])
            finally: s.close()
    zeilen = [f'{th} {k}' for th in themen for k in ('Lack', 'Himmel')]
    # zwei Collagen (sonst zu hoch)
    collage(f'hdr_{dev}_a', [v[0] for v in var], zeilen[:8], {k: v for k, v in B.items() if k[0] < 8})
    collage(f'hdr_{dev}_b', [v[0] for v in var], zeilen[8:], {(k[0] - 8, k[1]): v for k, v in B.items() if k[0] >= 8})

def teil_lod(pw, srv, dev):
    s = start(pw, srv, dev, BASIS + '&reflex=0')
    B = {}
    try:
        s.pg.wait_for_function("__game.info().carLod !== null && window.__app.carLod", timeout=30000)
        for i, (nm, kam) in enumerate([('6 m', [4.5, 3.5, 1.6, 0, 50]), ('30 m', [16, 25, 6, 0, 40]), ('70 m', [30, 60, 14, 0, 30])]):
            for j, lv in enumerate([0, 1, 2, None]):
                s.ev(f"window.__app.lodForce = {'undefined' if lv is None else lv}")
                s.ev(KAM, kam)
                B[(i, j)] = foto(s, f'lod_{dev}_{i}_{j}')
                if lv is None: print(nm, 'automatisch → Stufe', s.ev("__game.info().carLod"))
        print('LOD', s.ev("window.__app.carLod"), 'Fehler', s.errors[:3])
    finally: s.close()
    collage(f'lod_{dev}', ['Stufe 0 (55,7 k)', 'Stufe 1 (15 k)', 'Stufe 2 (7 k)', 'automatisch'], ['6 m', '30 m', '70 m'], B)

def teil_schatten(pw, srv, dev):
    var = [('bisher (±7 m, 2048)', '&schattenkam=0&reflex=0'), ('eng (±3,6 m, 1024)', '&reflex=0')]
    szenen = [('Start', 'alpen', 3.3, [3.0, 4.0, 2.2, 0, 50]), ('Winter', 'winter', 3.3, [-3.4, -3.0, 2.0, 0, 50]), ('Sprung', 'land', 9.5, None)]
    B = {}
    for i, (nm, th, t, kam) in enumerate(szenen):
        for j, (_, extra) in enumerate(var):
            s = start(pw, srv, dev, BASIS + f'&thema={th}' + extra, t=t)
            try:
                if kam: s.ev(KAM, kam)
                B[(i, j)] = foto(s, f'schatten_{dev}_{i}_{j}')
                if s.errors: print(nm, extra, 'FEHLER', s.errors[:3])
            finally: s.close()
    collage(f'schatten_{dev}', [v[0] for v in var], [s[0] for s in szenen], B)

def teil_detail(pw, srv, dev):
    var = [('ohne (?detail=0)', '&detail=0&reflex=0'), ('mit Asphaltkorn + Spurrinnen', '&reflex=0')]
    kams = [('Verfolger', None), ('Boden nah', [1.6, 3.0, 0.9, 7, 55]), ('Stoßstange', 'bumper')]
    B = {}
    for j, (_, extra) in enumerate(var):
        s = start(pw, srv, dev, BASIS + extra, t=6)
        try:
            for i, (nm, kam) in enumerate(kams):
                if kam == 'bumper': s.ev("window.__app.freezeCam = false; __game.cam('bumper')"); s.frames(6); s.ev("__game.freeze(true)")
                elif kam: s.ev(KAM, kam)
                B[(i, j)] = foto(s, f'detail_{dev}_{i}_{j}')
            if s.errors: print(extra, 'FEHLER', s.errors[:3])
        finally: s.close()
    collage(f'detail_{dev}', [v[0] for v in var], [k[0] for k in kams], B)

def teil_reflex(pw, srv, dev):
    var = [('ohne (?reflex=0)', '&reflex=0'), ('mit Lack-Spiegelung', '')] + [(f'Himmel ×{h}', f'&reflexhimmel={h}') for h in os.environ.get('HIMMEL', '').split(',') if h]
    kams = [('Verfolger', None), ('Seite', [3.4, 0.6, 1.0, 0, 45]), ('Front schräg', [2.4, 4.6, 1.4, 0, 45])]
    B = {}
    for j, (_, extra) in enumerate(var):
        s = start(pw, srv, dev, BASIS + '&thema=stadt' + extra, t=7)
        try:
            for i, (nm, kam) in enumerate(kams):
                if kam: s.ev(KAM, kam)
                B[(i, j)] = foto(s, f'reflex_{dev}_{i}_{j}', warte=14)
            print(extra or 'mit', s.ev("JSON.stringify(__game.info().reflex)"), 'Fehler', s.errors[:3])
        finally: s.close()
    collage(f'reflex_{dev}', [v[0] for v in var], [k[0] for k in kams], B)

def teil_vao(pw, srv, dev):
    var = [('Kino ohne alles', '&vao=0&kl=-ssao&reflex=0'), ('Kino SSAO (bisher)', '&vao=0&reflex=0'), ('Kino Vertex-AO, ohne SSAO', '&vao=sync&kl=-ssao&reflex=0'),
           ('Kino Vertex-AO + SSAO', '&vao=sync&reflex=0')]
    kams = [('Verfolger', None), ('Wandfuß', [-2.2, 6, 1.0, 12, 60]), ('von oben', [6, -8, 9, 10, 60])]
    B = {}
    for j, (_, extra) in enumerate(var):
        s = start(pw, srv, dev, BASIS + extra, t=8)
        try:
            for i, (nm, kam) in enumerate(kams):
                if kam: s.ev(KAM, kam)
                B[(i, j)] = foto(s, f'vao_{dev}_{i}_{j}')
            if j == 2: print('VAO', s.ev("JSON.stringify(__game.info().vao)"))
            if s.errors: print(extra, 'FEHLER', s.errors[:3])
        finally: s.close()
    collage(f'vao_{dev}', [v[0] for v in var], [k[0] for k in kams], B, breite=700 if dev == 'quer' else 330)

def teil_vao2(pw, srv, dev):
    # Stellen mit Verdeckung auf der Galerie-Strecke: Röhre, Wand, Brücke, Looping
    var = [('Kino ohne alles', '&vao=0&kl=-ssao&reflex=0'), ('Kino SSAO (bisher)', '&vao=0&reflex=0'), ('Vertex-AO, ohne SSAO', '&vao=sync&kl=-ssao&reflex=0'),
           ('Vertex-AO + SSAO', '&vao=sync&reflex=0')]
    stellen = [('Röhre', 19, 0.5, [0, -9, 2.2, 10, 60]), ('Wand', 30, 0.5, [-3.0, -8, 2.0, 10, 60]), ('Brücke', 14, 0.5, [7, -6, 1.0, 6, 60]), ('Looping', 7, 0.08, [5, -14, 3, 15, 60])]
    B = {}
    for j, (_, extra) in enumerate(var):
        s = Session(pw, srv.base, device=DEV[dev])
        try:
            s.open('?nosw&q=2&startprobe=0&gallery&blur=off' + extra)
            s.ev("window.__app.fixTime = 12.5")
            s.ev("__game.setAssist('easy'); __game.start({ autopilot: true }); __game.freeze(true); __game.cam('chase')"); s.ev("__game.sim(3.6)")
            for i, (nm, k, f, kam) in enumerate(stellen):
                s.ev(f"(() => {{ const P = __game.env.track.pieces[{k}]; const j = Math.round(P.lineStart + (P.lineEnd - P.lineStart) * {f}); __game.teleport(j, 30); __game.race.stuckProg = -1e9; }})()")
                s.ev("__game.sim(0.05)"); s.ev("window.__app.freezeCam = false"); s.frames(10)
                s.ev(KAM, kam)
                B[(i, j)] = foto(s, f'vao2_{dev}_{i}_{j}')
            if s.errors: print(extra, 'FEHLER', s.errors[:3])
        finally: s.close()
    collage(f'vao2_{dev}', [v[0] for v in var], [x[0] for x in stellen], B, breite=700 if dev == 'quer' else 330)

def teil_baeume(pw, srv, dev):
    var = [('Karten (?impostor=0)', '&impostor=0&reflex=0'), ('Impostors', '&reflex=0')]
    themen = [('alpen', 6), ('herbst', 6), ('wueste', 6), ('kueste', 6)]
    kams = [('nah', [7, 2, 2.0, 25, 60]), ('fern', [0, -14, 9, 60, 60])]
    B = {}
    for t_i, (th, t) in enumerate(themen):
        for j, (_, extra) in enumerate(var):
            s = start(pw, srv, dev, BASIS + f'&thema={th}' + extra, t=t)
            try:
                for k, (nm, kam) in enumerate(kams):
                    s.ev(KAM, kam)
                    B[(t_i * 2 + k, j)] = foto(s, f'baeume_{dev}_{th}_{k}_{j}')
                if j == 1: print(th, s.ev("JSON.stringify(__game.info().impostor)"), s.ev("__game.info().calls"))
                if s.errors: print(th, extra, 'FEHLER', s.errors[:3])
            finally: s.close()
    collage(f'baeume_{dev}', [v[0] for v in var], [f'{th} {k[0]}' for th, _ in themen for k in kams], B)

def teil_looping(pw, srv, dev):
    var = [('vorher-Look (alles aus)', '&lod=0&reflex=0&detail=0&vao=0&impostor=0&schattenkam=0&hdr=1k'), ('n30', '')]
    B = {}
    for j, (_, extra) in enumerate(var):
        s = Session(pw, srv.base, device=DEV[dev])
        try:
            s.open('?nosw&q=2&startprobe=0&gallery&blur=off' + extra)
            s.ev("window.__app.fixTime = 12.5")
            s.ev("__game.setAssist('easy'); __game.store.settings.fahrstil = 'sauber'"); s.ev("__game.start({ autopilot: true })"); s.ev("__game.cam('chase')"); s.ev("__game.sim(3.6)")
            s.ev("""(() => { const T = __game.env.track, L = T.line, k = T.pieces.findIndex((p) => p.type === 'loop'); const P = T.pieces[k]; let j = P.lineStart, acc = 0;
              while (acc < 60) { const q = j - 1; acc += Math.hypot(L.px[j] - L.px[q], L.pz[j] - L.pz[q]); j = q; } window.__pgLoop = k; __game.teleport(j, __game.env.prof.vt[j]); __game.race.stuckProg = -1e9; })()""")
            for _ in range(5400):
                if s.ev("""(() => { const g = __game, r = g.race, c = r.car, i = r.tracker.idx, P = g.env.track.pieces[window.__pgLoop]; return i >= P.lineStart && i <= P.lineEnd && !!g.env.track.line.loop[i] && c.frame.u.y < -0.5; })()"""): break
                s.ev("__game.sim(1/60)")
            s.ev("__game.freeze(true)")
            B[(0, j)] = foto(s, f'looping_{dev}_{j}', warte=14)
            print(extra or 'n30', s.ev("__game.info().calls"), 'Calls', s.errors[:3])
        finally: s.close()
    collage(f'looping_{dev}', [v[0] for v in var], ['Looping'], B)

with Server(WURZEL) as srv, sync_playwright() as pw:
    for dev in DEVS:
        for t in TEILE:
            print('==', t, dev, flush=True)
            globals()['teil_' + t](pw, srv, dev)
