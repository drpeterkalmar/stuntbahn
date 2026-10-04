# Schanzen-Belag (n24): Fotos der Schanze (Anlauf im Verfolger, Hubschrauber über der Lippe) je Grafikstufe Einfach /
# Standard / Kino, quer + hoch, und die mittlere Farbe des Belags im Bild (Pixel innerhalb der projizierten Fahrbahn
# zwischen 20 m vor der Lippe und 2 m vor den Warnstreifen, innere 70 % der Breite): Sättigung, Grün-/Lila-Stich.
# Aufruf: python3 tests/schanze_shots.py [quer|hoch] [Wurzel] [Name]   → tests/shots/schanze/<name>_<lage>_<stufe>_<kamera>.png
# Wurzel = anderer Stand (z. B. Arbeitskopie vor n24) für Vorher-Fotos. Prüft (nur nachher): Sättigung < 0,12, |Grün − Mitte| klein.
import sys, os, time, json, colorsys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from util import *
from hochformat_util import DEVICES
from PIL import Image, ImageDraw

mode = sys.argv[1] if len(sys.argv) > 1 else 'quer'
root = os.path.abspath(sys.argv[2]) if len(sys.argv) > 2 and sys.argv[2] != '.' else ROOT
name = sys.argv[3] if len(sys.argv) > 3 else 'nachher'
dev = DEVICES['pixel7q' if mode == 'quer' else 'pixel7']['ctx']
SUB = 'schanze'

POLY = """(([a, b]) => { const G = window.__game, L = G.env.track.line, J = G.env.track.jumps.find((j) => !j.gen), cam = G.camera;
  const W = innerWidth, H = innerHeight, pts = [], li = J.lipIdx;
  const P = (i, k) => { const bl = Math.hypot(L.bx[i], L.bz[i]) || 1, w = L.hw[i] * 0.7 * k;
    const v = { x: L.px[i] + L.bx[i] / bl * w, y: L.py[i] + 0.02, z: L.pz[i] + L.bz[i] / bl * w };
    const e = cam.matrixWorldInverse.elements, pr = cam.projectionMatrix.elements;
    const x = e[0]*v.x + e[4]*v.y + e[8]*v.z + e[12], y = e[1]*v.x + e[5]*v.y + e[9]*v.z + e[13], z = e[2]*v.x + e[6]*v.y + e[10]*v.z + e[14];
    const cx = pr[0]*x + pr[8]*z, cy = pr[5]*y + pr[9]*z, cw = -z; if (cw <= 0.1) return null;
    return [(cx / cw + 1) / 2 * W, (1 - cy / cw) / 2 * H]; };
  const s0 = L.s[li] - a, s1 = L.s[li] - b; const idx = []; for (let i = li - 60; i <= li; i++) if (L.s[i] >= s0 && L.s[i] <= s1) idx.push(i);
  for (const i of idx) pts.push(P(i, -1)); for (const i of idx.slice().reverse()) pts.push(P(i, 1));
  return pts.some((p) => !p) ? null : { pts, W, H }; })"""

def deck_color(png, poly):
    im = Image.open(png).convert('RGB'); sc = im.width / poly['W']
    mask = Image.new('L', im.size, 0); ImageDraw.Draw(mask).polygon([(x * sc, y * sc) for x, y in poly['pts']], fill=255)
    px = [p for p, m in zip(im.getdata(), mask.getdata()) if m]
    if len(px) < 200: return None
    r = sum(p[0] for p in px) / len(px); g = sum(p[1] for p in px) / len(px); b = sum(p[2] for p in px) / len(px)
    h, l, s = colorsys.rgb_to_hls(r / 255, g / 255, b / 255)
    m = (r + g + b) / 3
    return {'rgb': [round(r), round(g), round(b)], 'sat': round(s, 3), 'hell': round(l, 3), 'gruen': round((g - (r + b) / 2) / max(1, m), 3), 'lila': round(((r + b) / 2 - g) / max(1, m), 3), 'n': len(px)}

out = []
with Server(root) as srv, sync_playwright() as pw:
    s = Session(pw, srv.base, device=dev)
    for q in [0, 1, 2]:
        s.pg.goto(srv.base + f'index.html?nosw&seed=4711&d=2&q={q}&hindernis=bauernhof&thema=land')
        s.pg.wait_for_function("window.__app && window.__app.ready && window.__app.frames > 3", timeout=240000)
        s.ev("__game.setAssist('easy'); __game.setLine && __game.setLine('off')")
        s.ev("__game.start({autopilot:true})"); s.ev("__game.sim(3.6)")
        for cam, back, wait, tag in [('chase', 45, 0.25, 'chase'), ('far', 35, 0.2, 'far'), ('chase', 24, 0.15, 'nah')]:
            j = s.ev(f"(() => {{ const e = __game.env, L = e.track.line, J = e.track.jumps.find((x) => !x.gen); let i = J.lipIdx; while (i > 0 && L.s[J.lipIdx] - L.s[i] < {back}) i--; return {{ i, v: e.prof.vt[i] }}; }})()")
            s.ev(f"__game.teleport({j['i']}, {j['v']})"); s.ev(f"__game.cam('{cam}')"); s.ev("__game.setTimeScale(0.25)")
            time.sleep(wait / 0.25 + 0.3)
            s.ev("__game.freeze(true)"); s.frames(6); time.sleep(0.5)
            p = s.shot(f'{name}_{mode}_q{q}_{tag}', SUB)
            poly = s.ev(POLY, [13, 3] if tag != 'nah' else [8, 3])   # Schanzen-Bogen 15 m (n21), vor den Warnstreifen
            c = deck_color(p, poly) if poly else None
            pr = s.ev(POLY, [40, 22]) if cam == 'far' else None   # Asphalt vor der Schanze als Bezug (gleiches Licht)
            res = {'stand': name, 'lage': mode, 'stufe': q, 'kamera': tag, 'farbe': c, 'asphalt': deck_color(p, pr) if pr else None}
            out.append(res); print(json.dumps(res, ensure_ascii=False), flush=True)
            s.ev("__game.freeze(false)"); s.ev("__game.setTimeScale(1)")
    print('errors', s.errors[:5])
    s.close()
os.makedirs(os.path.join(ROOT, 'tests/out/n24'), exist_ok=True)
json.dump(out, open(os.path.join(ROOT, f'tests/out/n24/schanze_{name}_{mode}.json'), 'w'), indent=1, ensure_ascii=False)
if name == 'nachher':
    # neutral: wenig Sättigung, kein Grün-/Lila-Stich über den des Asphalts (gleiches Himmelslicht) hinaus
    def stich(o):
        a = o.get('asphalt') or {'lila': 0, 'sat': 0}
        return o['farbe']['lila'] - a['lila']
    bad = [o for o in out if not o['farbe'] or o['farbe']['sat'] > 0.12 or abs(o['farbe']['gruen']) > 0.06 or (o.get('asphalt') and abs(stich(o)) > 0.03)]
    print('ERGEBNIS', mode, 'Belag neutral' if not bad else f'FARBSTICH {len(bad)}', 'Fehler', len(s.errors))
    sys.exit(1 if bad or s.errors else 0)
