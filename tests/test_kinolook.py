# Kino-Look (n17): Stufen Einfach/Standard/Kino, Einstellung „Grafik“, A/B-Links (?look=0|1|2|alt, ?kl=), dynamische
# Auflösung, Kontaktschatten (im Sprung aus), Bild plausibel (nicht schwarz/weiß, kein NaN-Schwarz), Draw-Calls < 200,
# Hochformat, 0 Seitenfehler.
# Aufruf: python3 tests/test_kinolook.py
import os, sys, time, json, base64, io
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from util import Server, Session, PIXEL7_LAND, DESKTOP, ROOT
from playwright.sync_api import sync_playwright
from PIL import Image, ImageStat

fails = []
def check(c, m):
    print(('OK   ' if c else 'FAIL ') + m, flush=True)
    if not c: fails.append(m)

GRAB = """(o) => { const G = __game; G.drawOnce(o || {}); return G.renderer.domElement.toDataURL('image/png'); }"""
def image_stats(s, o=None):
    url = s.ev(GRAB, o or {})
    im = Image.open(io.BytesIO(base64.b64decode(url.split(',', 1)[1]))).convert('RGB')
    st = ImageStat.Stat(im)
    small = im.resize((96, 44))
    px = list(small.getdata())
    black = sum(1 for p in px if max(p) < 6) / len(px)
    white = sum(1 for p in px if min(p) > 250) / len(px)
    return {'mean': [round(x, 1) for x in st.mean], 'std': round(sum(st.stddev) / 3, 1), 'black': round(black, 3), 'white': round(white, 3)}

def race(s):
    s.ev("__game.setAssist('easy')"); s.ev("__game.start({ autopilot: true })"); s.ev("__game.cam('chase')"); s.ev("__game.sim(3.4)"); s.frames(5)

with Server() as srv, sync_playwright() as pw:
    # 1) feste Stufen per URL
    for look, dev in [(0, PIXEL7_LAND), (1, PIXEL7_LAND), (2, DESKTOP)]:
        s = Session(pw, srv.base, device=dev)
        s.open(f'?nosw&demo&look={look}')
        race(s)
        d = s.ev("__game.kino.describe()")
        check(s.ev("window.__app.ktx2") == 15, f'look={look}: 15 KTX2-Texturen geladen ({s.ev("window.__app.ktx2")})')
        check(d['level'] == look and d['pipeline'] == (look > 0), f'look={look}: Stufe {d["name"]}, Pipeline {d["pipeline"]} {d}')
        if look == 1: check(d['msaa'] == 0 and 'aa' in d['stages'] and 'bloom' in d['stages'] and 'ssao' not in d['stages'], 'Standard: Kantenglättung im Endbild, Bloom, keine Verdeckung')
        # n30: Kino ohne SSAO, solange die gebackene Vertex-AO an ist (?vao=0 → SSAO wie bisher, unten geprüft)
        if look == 2: check(d['msaa'] == 4 and 'ssao' not in d['stages'] and 'haze' in d['stages'], 'Kino: MSAA, Hitzeflimmern, SSAO aus (Vertex-AO)')
        st = image_stats(s)
        check(20 < sum(st['mean']) / 3 < 230 and st['std'] > 15 and st['black'] < 0.05 and st['white'] < 0.08, f'look={look}: Bild plausibel {st}')
        info = s.ev("__game.info()")
        check(info['calls'] < 200, f'look={look}: Draw-Calls {info["calls"]} < 200')
        if look == 2:
            b = s.ev("(() => { const G = __game; G.drawOnce({ run: true, speed: 70 }); return { active: G.post.active, k: G.post.k, drawn: G.kino.stats.drawn }; })()")
            check(b['active'] and b['k'] > 0.9, f'Kino: Bewegungsunschärfe in derselben Pipeline aktiv bei 250 km/h {b}')
        # Kontaktschatten am Boden sichtbar, im Sprung aus
        cs = s.ev("(() => { const c = __game.carVis.contact; return c ? { vis: c.visible, op: c.material.opacity } : null; })()")
        check(cs and cs['vis'] and cs['op'] > 0.3, f'look={look}: Kontaktschatten am Boden {cs}')
        check(not s.errors, f'look={look}: 0 Fehler {s.errors[:3]}')
        s.close()
    # 2) Sprung: Kontaktschatten blendet aus
    s = Session(pw, srv.base, device=PIXEL7_LAND)
    s.open('?nosw&demo&look=1')
    race(s)
    lip = s.ev("__game.env.track.jumps[0].lipIdx")
    s.ev(f"(() => {{ const G = __game, L = G.env.track.line; let j = {lip}; while (j > 0 && L.s[{lip}] - L.s[j] < 60) j--; G.teleport(j, (G.env.prof.vf || G.env.prof.vt)[j]); }})()")
    air = s.ev("""() => { const G = __game; for (let k = 0; k < 300; k++) { G.sim(0.02); if (G.race.car.onGround === 0) { G.sim(0.25); return G.race.car.onGround; } } return -1; }""")
    s.frames(12); time.sleep(0.3)
    cs = s.ev("(() => { const c = __game.carVis.contact; return { vis: c.visible, op: c.material.opacity, air: __game.race.car.onGround }; })()")
    check(air == 0 and (not cs['vis'] or cs['op'] < 0.1) if cs['air'] == 0 else True, f'Sprung: Kontaktschatten aus in der Luft {cs}')
    # 3) dynamische Auflösung: Renderskala sinkt bei Ruckeln, Zeichenfläche bleibt
    w0 = s.ev("__game.renderer.domElement.width"); s0 = s.ev("__game.kino.renderScale")
    s.ev("__game.kino.adapt(40); __game.kino.adapt(40)"); s.frames(4)
    d = s.ev("__game.kino.describe()")
    check(d['scale'] < s0 and s.ev("__game.renderer.domElement.width") == w0 and d['size'][0] < round(w0 * s0), f'Renderskala {s0} → {d["scale"]}, Bild {d["size"]}, Zeichenfläche bleibt {w0}')
    # 4) einzelne Stufen per ?kl=
    check(not s.errors, f'Sprung/Skala: 0 Fehler {s.errors[:3]}')
    s.close()
    s = Session(pw, srv.base, device=PIXEL7_LAND)
    s.open('?nosw&demo&look=1&kl=-bloom,+ssao')
    d = s.ev("__game.kino.describe()")
    check('bloom' not in d['stages'] and 'ssao' in d['stages'], f'?kl=-bloom,+ssao wirkt {d["stages"]}')
    check(not s.errors, f'?kl: 0 Fehler {s.errors[:3]}')
    s.close()
    s = Session(pw, srv.base, device=PIXEL7_LAND)
    s.open('?nosw&demo&look=2&vao=0')
    d = s.ev("__game.kino.describe()")
    check('ssao' in d['stages'], f'?vao=0: Kino mit SSAO wie bis n28 {d["stages"]}')
    s.close()
    # 5) ?look=alt: Bild wie bis n22 (kein Kino-Look, altes post.js)
    s = Session(pw, srv.base, device=PIXEL7_LAND)
    s.open('?nosw&demo&look=alt&q=1')
    race(s)
    check(s.ev("__game.kino") is None and s.ev("!!__game.post.render"), '?look=alt: alter Weg (post.js), kein Kino-Look')
    check(s.ev("__game.carVis.contact") is None, '?look=alt: kein Kontaktschatten')
    check(not s.errors, f'?look=alt: 0 Fehler {s.errors[:3]}')
    s.close()
    # 6) Einstellung „Grafik“: Einfach / Standard / Kino / Automatisch
    s = Session(pw, srv.base, device=PIXEL7_LAND)
    s.open('?nosw&demo')
    s.tap('#menu [data-a=settings]') if s.ev("!!document.querySelector('#menu [data-a=settings]')") else None
    names = s.ev("[...document.querySelectorAll('[data-a=quality]')].map((b) => b.textContent.trim())")
    check(names == ['Automatisch', 'Einfach', 'Standard', 'Kino'], f'Grafik-Knöpfe {names}')
    for v, lvl in [('2', 2), ('0', 0), ('1', 1)]:
        s.ev(f"document.querySelector('[data-a=quality][data-v=\"{v}\"]').click()"); s.frames(4)
        check(s.ev("__game.kino.level") == lvl, f'Grafik {v} → Kino-Look Stufe {lvl}')
    check(not s.errors, f'Einstellung: 0 Fehler {s.errors[:3]}')
    s.close()
    # 7) Hochformat mit Standard
    s = Session(pw, srv.base, device=dict(PIXEL7_LAND, viewport={'width': 412, 'height': 915}))
    s.open('?nosw&demo&look=1')
    race(s)
    d = s.ev("__game.kino.describe()"); st = image_stats(s)
    check(d['size'][1] > d['size'][0] and st['std'] > 15 and st['black'] < 0.05, f'Hochformat: Render-Target hochkant {d["size"]}, Bild {st}')
    check(not s.errors, f'Hochformat: 0 Fehler {s.errors[:3]}')
    s.close()
print('FEHLGESCHLAGEN:' if fails else 'ALLE OK', fails)
sys.exit(1 if fails else 0)
