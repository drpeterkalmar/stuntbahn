# n31 TAAU: Abnahme-Bilder für den Heavy-Job (VORBAU: geschrieben, NICHT ausgeführt – braucht den Browser).
# Collagen nach tests/shots/taau/<teil>_<gerät>.jpg, Einzelbilder daneben (nicht im Repo).
# Aufruf: python3 tests/taau_shots.py <teil>[,<teil>] [quer,hoch] [Wurzel]
#   stand   – Standbilder (Looping, Fahrbahnrand/Leitplanke, Wiese/Gras, Zaun/Banden): 1,0 + MSAA 4 (Kino heute) gegen
#             0,65 ohne TAA (FXAA-Art) gegen 0,65 + TAAU gegen 0,7 + TAAU; je Zeile volles Bild + 2×-Ausschnitt (Pixel ohne
#             Glättung vergrößert, sonst sieht man Treppen/Flimmern in der verkleinerten Collage nicht)
#   schwenk – Kamera gleitet langsam seitwärts (1,5 cm je Bild) über Zaun/Leitplanke: 8 Bilder je Variante als Reihe –
#             Treppen-Wandern/Flimmern sichtbar als Unterschied von Bild zu Bild; dazu Zahl „Bildwechsel“ (mittlere Änderung
#             je Bild im Ausschnitt, kleiner = ruhiger; die Bewegung selbst ist bei allen Varianten gleich)
#   fahrt   – 10 s Fahrt (Autopilot, Verfolgerkamera), alle 10 Bilder ein Ausschnitt ums Auto: Ghosting/Schlieren am Auto
#             (K.-o.-Kriterium) und an Zäunen; Varianten Kino heute gegen 0,65 + TAAU
#   cockpit – Cockpit-Ansicht (Innenraum + Spiegel sind Overlay, scharf darüber) und Kino-Replay mit Tiefenschärfe
# Beurteilen: SELBST ansehen (Vision), nicht nur Zahlen. Ghosting am Auto → Brief „Nicht tun“.
import sys, os, time, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from util import *
from PIL import Image, ImageDraw, ImageFont, ImageChops, ImageStat

TEILE = sys.argv[1].split(',') if len(sys.argv) > 1 else ['stand']
DEVS = (sys.argv[2] if len(sys.argv) > 2 else 'quer').split(',')
WURZEL = os.path.abspath(sys.argv[3]) if len(sys.argv) > 3 else ROOT
OUT = os.path.join(ROOT, 'tests', 'shots', 'taau')
os.makedirs(OUT, exist_ok=True)
PORT = dict(PIXEL7_LAND, viewport={"width": 412, "height": 915})
DEV = {'quer': PIXEL7_LAND, 'hoch': PORT}
BASIS = '?nosw&q=2&startprobe=0&seed=4711&d=3&g=1&blur=off&reflex=0'
FONT = None
try: FONT = ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc', 24)
except Exception: FONT = ImageFont.load_default()

# Varianten: (Name, URL-Zusatz, Renderskala, MSAA erzwingen oder None)
VAR = [
    ('1,0 + MSAA 4 (Kino heute)', '&taa=0', 1.0, None),
    ('0,65 ohne TAA (FXAA-Art)', '&taa=0&kl=+aa', 0.65, 0),
    ('0,65 + TAAU', '&taa=1', 0.65, None),
    ('0,7 + TAAU (Start)', '&taa=1', 0.7, None),
]
VAR_FAHRT = [VAR[0], VAR[2]]

# Kamera relativ zum Auto (wie technik_shots.py): seitlich/vorn/hoch in m, Blickziel vorn, Bildwinkel
KAM = """([s, v, h, ziel, fov]) => { const g = __game, c = g.camera, car = g.race.car, p = car.pos, f = car.frame.f;
  const r = { x: f.z, z: -f.x }; window.__app.freezeCam = true;
  c.position.set(p.x + r.x * s + f.x * v, p.y + h, p.z + r.z * s + f.z * v); c.up.set(0, 1, 0);
  c.lookAt(p.x + f.x * ziel, p.y + 0.5, p.z + f.z * ziel); c.fov = fov; c.updateProjectionMatrix(); }"""
# TODO Heavy-Job: Kamera-Stellen an der Strecke prüfen (Leitplanke/Zaun/Gras im Bild?) und ggf. anpassen
STELLEN = [
    ('Fahrbahnrand', 3.3, [-2.6, -5, 0.9, 30, 50]),
    ('Wiese/Gras', 6.0, [6, -4, 1.4, 18, 55]),
    ('Zaun/Banden fern', 8.0, [0, -10, 3.5, 80, 35]),
]

def start(pw, srv, dev, q, sc, msaa, t=3.3, gallery=False):
    s = Session(pw, srv.base, device=DEV[dev])
    s.open(q)
    s.ev("window.__app.fixTime = 12.5")
    s.frames(6)
    s.ev(f"__game.kino.renderScale = {sc}")
    if msaa is not None: s.ev(f"__game.kino.samples = {msaa}")
    s.ev("__game.setAssist('easy'); __game.store.settings.fahrstil = 'sauber'; __game.start({ autopilot: true }); __game.freeze(true); __game.cam('chase')")
    s.ev(f"__game.sim({t})"); s.frames(12)
    return s

def foto(s, name, warte=48):
    # TAA braucht Bilder zum Einschwingen (Gewicht 0,9 → ~20 Bilder); alle Varianten gleich lang warten
    s.frames(warte); time.sleep(0.3)
    p = os.path.join(OUT, name + '.png')
    s.pg.screenshot(path=p)
    return p

def ausschnitt(p, rel=(0.38, 0.38, 0.62, 0.62), k=2):
    # Bildmitte ohne Glättung vergrößern (Pixel sichtbar)
    im = Image.open(p).convert('RGB'); W, H = im.size
    box = (int(W * rel[0]), int(H * rel[1]), int(W * rel[2]), int(H * rel[3]))
    c = im.crop(box); c = c.resize((c.width * k, c.height * k), Image.NEAREST)
    q = p.replace('.png', '_aus.png'); c.save(q)
    return q

def collage(name, spalten, zeilen, bilder, breite=None):
    ims = {k: Image.open(v).convert('RGB') for k, v in bilder.items() if v and os.path.exists(v)}
    if not ims: return None
    w0, h0 = next(iter(ims.values())).size
    sk = (breite or (640 if w0 > h0 else 320)) / w0
    w, h = int(w0 * sk), int(h0 * sk)
    lx, ly = 190, 36
    C = Image.new('RGB', (lx + w * len(spalten), ly + h * len(zeilen)), (24, 24, 28))
    d = ImageDraw.Draw(C)
    for j, sp in enumerate(spalten): d.text((lx + j * w + 8, 6), sp, fill=(255, 255, 255), font=FONT)
    for i, z in enumerate(zeilen):
        d.text((8, ly + i * h + h // 2 - 12), z, fill=(255, 255, 255), font=FONT)
        for j in range(len(spalten)):
            if (i, j) in ims: C.paste(ims[(i, j)].resize((w, h), Image.NEAREST if '_aus' in bilder[(i, j)] else Image.LANCZOS), (lx + j * w, ly + i * h))
    p = os.path.join(OUT, name + '.jpg')
    C.save(p, quality=90)
    print('→', os.path.relpath(p, ROOT), flush=True)
    return p

def info(s, was):
    d = s.ev("JSON.stringify(__game.kino.describe().taa)")
    print(was, 'TAA', d, 'Fehler', s.errors[:3], flush=True)

def looping(s):
    s.ev("""(() => { const T = __game.env.track, L = T.line, k = T.pieces.findIndex((p) => p.type === 'loop'); const P = T.pieces[k]; let j = P.lineStart, acc = 0;
      while (acc < 60) { const q = j - 1; acc += Math.hypot(L.px[j] - L.px[q], L.pz[j] - L.pz[q]); j = q; } window.__pgLoop = k; __game.teleport(j, __game.env.prof.vt[j]); __game.race.stuckProg = -1e9; })()""")
    s.ev("window.__app.freezeCam = false; __game.freeze(false)")
    for _ in range(5400):
        if s.ev("""(() => { const g = __game, r = g.race, c = r.car, i = r.tracker.idx, P = g.env.track.pieces[window.__pgLoop]; return i >= P.lineStart && i <= P.lineEnd && !!g.env.track.line.loop[i] && c.frame.u.y < -0.5; })()"""): break
        s.ev("__game.sim(1/60)")
    s.ev("__game.freeze(true)")

def teil_stand(pw, srv, dev):
    B, zeilen = {}, []
    for i, (nm, t, kam) in enumerate(STELLEN):
        zeilen += [nm, nm + ' 2×']
        for j, (vn, extra, sc, ms) in enumerate(VAR):
            s = start(pw, srv, dev, BASIS + extra, sc, ms, t=t)
            try:
                s.ev(KAM, kam)
                p = foto(s, f'stand_{dev}_{i}_{j}'); B[(2 * i, j)] = p; B[(2 * i + 1, j)] = ausschnitt(p)
                info(s, f'{nm} / {vn}')
            finally: s.close()
    # Looping (Galerie-Strecke)
    zeilen += ['Looping', 'Looping 2×']; n = len(STELLEN)
    for j, (vn, extra, sc, ms) in enumerate(VAR):
        s = Session(pw, srv.base, device=DEV[dev])
        try:
            s.open('?nosw&q=2&startprobe=0&gallery&blur=off&reflex=0' + extra)
            s.ev("window.__app.fixTime = 12.5"); s.frames(6)
            s.ev(f"__game.kino.renderScale = {sc}")
            if ms is not None: s.ev(f"__game.kino.samples = {ms}")
            s.ev("__game.setAssist('easy'); __game.store.settings.fahrstil = 'sauber'; __game.start({ autopilot: true }); __game.freeze(true); __game.cam('chase')"); s.ev("__game.sim(3.6)")
            looping(s)
            p = foto(s, f'stand_{dev}_loop_{j}'); B[(2 * n, j)] = p; B[(2 * n + 1, j)] = ausschnitt(p)
            info(s, f'Looping / {vn}')
        finally: s.close()
    collage(f'stand_{dev}', [v[0] for v in VAR], zeilen, B)

def teil_schwenk(pw, srv, dev):
    B, zeilen, zahlen = {}, [], {}
    nm, t, kam = STELLEN[0]
    N = 8
    for j, (vn, extra, sc, ms) in enumerate(VAR):
        s = start(pw, srv, dev, BASIS + extra, sc, ms, t=t)
        try:
            s.ev(KAM, kam); s.frames(48)
            vor, diffs = None, []
            for f in range(N):
                # 1,5 cm seitwärts je Bild (Bruchteil eines Pixels in der Ferne → Treppen wandern ohne TAA)
                s.ev("(() => { const c = __game.camera, car = __game.race.car, f = car.frame.f; c.position.x += f.z * 0.015; c.position.z += -f.x * 0.015; c.updateMatrixWorld(); })()")
                s.frames(1); time.sleep(0.05)
                p = os.path.join(OUT, f'schwenk_{dev}_{j}_{f}.png'); s.pg.screenshot(path=p)
                q = ausschnitt(p, rel=(0.55, 0.35, 0.85, 0.65), k=2); B[(j, f)] = q
                im = Image.open(q).convert('L')
                if vor is not None: diffs.append(ImageStat.Stat(ImageChops.difference(im, vor)).mean[0])
                vor = im
            zahlen[vn] = round(sum(diffs) / len(diffs), 2)
            info(s, f'Schwenk / {vn}: Bildwechsel {zahlen[vn]}')
        finally: s.close()
        zeilen.append(f'{vn[:22]} ({zahlen[vn]})')
    print('Bildwechsel je Variante (kleiner = ruhiger):', json.dumps(zahlen, ensure_ascii=False))
    collage(f'schwenk_{dev}', [f'Bild {f + 1}' for f in range(N)], zeilen, B, breite=260)

def teil_fahrt(pw, srv, dev):
    B, zeilen = {}, []
    for j, (vn, extra, sc, ms) in enumerate(VAR_FAHRT):
        s = start(pw, srv, dev, BASIS + extra, sc, ms, t=2.0)
        try:
            s.ev("window.__app.freezeCam = false")
            k = 0
            for f in range(600):          # 10 s in 1/60-Schritten, je Schritt ein gezeichnetes Bild
                s.ev("__game.sim(1/60)"); s.frames(1)
                if f % 50 == 49:
                    p = os.path.join(OUT, f'fahrt_{dev}_{j}_{k}.png'); s.pg.screenshot(path=p)
                    B[(j, k)] = ausschnitt(p, rel=(0.3, 0.45, 0.7, 0.85), k=1); k += 1
            info(s, f'Fahrt / {vn}')
        finally: s.close()
        zeilen.append(vn[:24])
    collage(f'fahrt_{dev}', [f'{(c + 1) * 50 / 60:.1f} s' for c in range(12)], zeilen, B, breite=240)

def teil_cockpit(pw, srv, dev):
    B = {}
    for j, (vn, extra, sc, ms) in enumerate(VAR_FAHRT):
        s = start(pw, srv, dev, BASIS + extra, sc, ms, t=5)
        try:
            s.ev("window.__app.freezeCam = false; __game.cam('cockpit')"); s.frames(6)
            B[(0, j)] = foto(s, f'cockpit_{dev}_{j}')
            info(s, f'Cockpit / {vn}')
        finally: s.close()
    collage(f'cockpit_{dev}', [v[0] for v in VAR_FAHRT], ['Cockpit'], B)
    # TODO Heavy-Job: Kino-Replay mit Tiefenschärfe (tests/kinoreplay-Skripte als Vorlage: Rennen beenden, __game.startCine(),
    # __game.cineSeek(ci, t), DoF-Einstellung) mit ?taa=0/1 vergleichen – Hintergrund darf nicht wabern

with Server(WURZEL) as srv, sync_playwright() as pw:
    for dev in DEVS:
        for t in TEILE:
            print('==', t, dev, flush=True)
            globals()['teil_' + t](pw, srv, dev)
