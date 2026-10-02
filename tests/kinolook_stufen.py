# Kino-Look (n17): was bringt jede Stufe? Gleiches Bild (eine Sitzung, Szene angehalten), je Stufe aus/an →
# tests/shots/kinolook/stufe_<name>.jpg (links ohne, rechts mit). Aufruf: python3 tests/kinolook_stufen.py [Strecke] [look]
import os, sys, base64, io
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from util import Server, Session, PIXEL7_LAND, ROOT
from playwright.sync_api import sync_playwright
from PIL import Image, ImageDraw, ImageFont
track = sys.argv[1] if len(sys.argv) > 1 else 'seed=4711&d=2&g=1'
look = sys.argv[2] if len(sys.argv) > 2 else '2'
OUT = os.path.join(ROOT, 'tests', 'shots', 'kinolook'); os.makedirs(OUT, exist_ok=True)
STUFEN = [('grade', 'Farbkorrektur + S-Kurve'), ('aerial', 'Luftperspektive (Dunst)'), ('ssao', 'Umgebungsverdeckung'), ('contact', 'Kontaktschatten'),
          ('bloom', 'Bloom'), ('flare', 'Sonnen-Blendung'), ('aa,sharpen', 'Kantenglättung + Nachschärfen'), ('vignette', 'Vignette'), ('haze', 'Hitzeflimmern')]
try: font = ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial Bold.ttf', 26)
except Exception: font = ImageFont.load_default()
GRAB = """(off) => { const G = __game, K = G.kino, keep = {};
  for (const k of off) { keep[k] = K.stages[k]; K.stages[k] = false; }
  G.carVis.contact.visible = K.stages.contact; G.drawOnce({ speed: 0 });
  const url = G.renderer.domElement.toDataURL('image/jpeg', 0.92);
  for (const k of off) K.stages[k] = keep[k]; G.carVis.contact.visible = true; return url; }"""
def img(url): return Image.open(io.BytesIO(base64.b64decode(url.split(',', 1)[1]))).convert('RGB')
with Server() as srv, sync_playwright() as pw:
    s = Session(pw, srv.base, device=PIXEL7_LAND)
    s.open(f'?nosw&{track}&look={look}')
    s.ev("__game.setAssist('easy')"); s.ev("__game.start({ autopilot: true })"); s.ev("__game.sim(3.3)")
    s.ev("__game.teleport(40, 0)"); s.ev("__game.sim(1.0)")
    s.ev("__game.freeze(true); window.__app.freezeCam = true; window.__app.fixTime = 1234.5"); s.frames(3)
    s.ev("""(() => { const G = __game, c = G.race.car, p = c.pos, f = c.frame.f, r = c.frame.r, cam = G.camera;
      cam.position.set(p.x - f.x * 4.2 + r.x * 2.6, p.y + 1.3, p.z - f.z * 4.2 + r.z * 2.6); cam.up.set(0, 1, 0);
      cam.lookAt(p.x + f.x * 2, p.y + 0.6, p.z + f.z * 2); cam.fov = 62; cam.updateProjectionMatrix(); cam.updateMatrixWorld(); })()""")
    full = img(s.ev(GRAB, []))
    for key, name in STUFEN:
        off = img(s.ev(GRAB, key.split(',')))
        W = 960; a = off.resize((W, round(off.height * W / off.width))); b = full.resize(a.size)
        out = Image.new('RGB', (W * 2, a.height)); out.paste(a, (0, 0)); out.paste(b, (W, 0))
        d = ImageDraw.Draw(out); d.rectangle([0, 0, W * 2, 38], fill=(0, 0, 0))
        d.text((12, 5), f'ohne: {name}', fill=(255, 255, 255), font=font); d.text((W + 12, 5), 'mit (alle Stufen)', fill=(255, 255, 255), font=font)
        p = os.path.join(OUT, f'stufe_{key.split(",")[0]}.jpg'); out.save(p, quality=88); print(p)
    print('Fehler', s.errors[:3])
    s.close()
