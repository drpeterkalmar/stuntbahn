# n40 Lack (Peter 22.10.: „Autos sehen derzeit aus wie Comiczeichnungen, früher waren sie photorealistischer“):
# gleiche Szene (Strecke 4711-3-g, Tag, klar, Kino-Look fest) in mehreren Ständen/Varianten, je Startaufstellung + Fahrt,
# Gesamtbild + Nahaufnahme des Autos (Ausschnitt um die projizierte Auto-Hülle, 2× vergrößert) → Collage.
#
#   python3 tests/lack_vergleich.py                          # Standard-Satz (siehe VARIANTEN), WebKit iPhone 15 quer+hoch
#   python3 tests/lack_vergleich.py --varianten alt,heute,d --geraete quer --q 1 --name std
#   ALT_SRC=<Ordner>: Quellbaum für den Stand 07.10. (sonst tests/shots/lack_alt_src = `git archive 49c8d3c`)
#
# Varianten: name → (Wurzel 'alt'|'neu', Zusatz-Query, Beschriftung). Nach n40 ist D der Standard; „heute“ = vorher (n30-Werte).
import os, sys, time, json, argparse
from PIL import Image, ImageDraw, ImageFont
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from util import Server, ROOT, GPU_ARGS
from playwright.sync_api import sync_playwright

ALT = os.environ.get('ALT_SRC') or os.path.join(ROOT, 'tests', 'shots', 'lack_alt_src')
OUT = os.path.join(ROOT, 'tests', 'shots', 'lack')
VARIANTEN = {
    'alt':   ('alt', '', '07.10. (49c8d3c)'),
    'heute': ('neu', '&reflex=1&hdr=512', 'vor n40 (Spiegelung Kino, HDR 512)'),
    'b':     ('neu', '&reflex=0&hdr=512', 'B reflex=0'),
    'c':     ('neu', '&reflex=1&hdr=1k', 'C hdr=1k'),
    'd':     ('neu', '&reflex=0&hdr=1k', 'D reflex=0 + hdr=1k'),
    'neu':   ('neu', '', 'n40 Standard (ohne Zusatz)'),
}
BASIS = '?nosw&startprobe=0&seed=4711&d=3&g=1&zeit=tag&wetter=klar&blur=off&action=0&karte=0'

# projizierte Hülle des Autos in CSS-Pixeln (für den Nah-Ausschnitt)
BOX_JS = """() => { const g = __game, cam = g.camera, root = g.carVis.root; root.updateMatrixWorld(true);
  const THREE = Object.getPrototypeOf(cam.position).constructor; const v = new THREE(); let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  const P = [], tmp = [];
  root.traverse((o) => { if (o.isMesh && o.visible && o.geometry) { o.geometry.computeBoundingBox(); const b = o.geometry.boundingBox;
    for (let i = 0; i < 8; i++) { v.set(i & 1 ? b.max.x : b.min.x, i & 2 ? b.max.y : b.min.y, i & 4 ? b.max.z : b.min.z).applyMatrix4(o.matrixWorld).project(cam);
      if (v.z > 1) continue; const x = (v.x + 1) / 2 * innerWidth, y = (1 - v.y) / 2 * innerHeight; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); } } });
  return [x0, y0, x1, y1]; }"""


def warte(pg, js, max_s, schritt=0.5):
    t0 = time.time()
    while time.time() - t0 < max_s:
        try:
            if pg.evaluate(js): return True
        except Exception: pass
        time.sleep(schritt)
    return False


def bilder(pg, n):
    f0 = pg.evaluate("window.__app.frames")
    pg.wait_for_function(f"window.__app.frames >= {f0 + n}", timeout=120000)


def aufnahme(pw, browser, base, query, geraet, q, tag):
    dev = pw.devices['iPhone 15 landscape' if geraet == 'quer' else 'iPhone 15'] if browser == 'webkit' else \
        dict(viewport={'width': 915, 'height': 412} if geraet == 'quer' else {'width': 412, 'height': 915}, device_scale_factor=2.625, is_mobile=True, has_touch=True)
    dev = {k: v for k, v in dev.items() if k != 'default_browser_type'}
    b = pw.webkit.launch() if browser == 'webkit' else pw.chromium.launch(args=GPU_ARGS)
    ctx = b.new_context(**dev)
    ctx.add_init_script("window.__noKino = true; window.__noShow = true")
    pg = ctx.new_page(); fehler = []
    pg.on('pageerror', lambda e: fehler.append(str(e)))
    url = base + 'index.html' + BASIS + f'&q={q}' + query
    pg.goto(url)
    if not warte(pg, "window.__app && window.__app.ready && window.__app.frames > 3", 300):
        b.close(); raise RuntimeError('lädt nicht: ' + url + ' ' + str(fehler[:3]))
    warte(pg, "(() => { const v = __game.info().vao; return !v || v.fertig; })()", 120)
    info0 = pg.evaluate("(() => { const i = __game.info(); return { tier: i.tier, reflex: i.reflex || null, theme: __game.theme && (__game.theme.id || __game.theme.name || null) }; })()")
    pg.evaluate("__game.setAssist('easy'); __game.start({ autopilot: true }); __game.cam('chase'); __game.freeze(true)")
    bilder(pg, 40)
    res = {}
    for art in ('start', 'fahrt'):
        if art == 'fahrt':
            pg.evaluate("__game.freeze(false); __game.sim(9); __game.freeze(true)")
            bilder(pg, 40)   # Spiegel-Würfel (6 Seiten) und Schatten nachziehen lassen
        os.makedirs(OUT, exist_ok=True)
        pg.add_style_tag(content='body > *:not(canvas) { visibility: hidden !important; }')   # nur das 3D-Bild, keine Anzeigen
        p = os.path.join(OUT, f'{tag}_{art}.png')
        pg.screenshot(path=p)
        box = pg.evaluate(BOX_JS)
        res[art] = {'bild': p, 'box': box, 'state': pg.evaluate("(() => { const s = __game.state(); return { speed: s.speed, idx: s.idx, state: s.state }; })()")}
    res['info'] = pg.evaluate("(() => { const i = __game.info(); return { tier: i.tier, reflex: i.reflex || null }; })()")
    res['info0'] = info0; res['fehler'] = fehler[:5]; res['url'] = url
    b.close()
    return res


def nah(bild, box, dpr, w=520):
    im = Image.open(bild).convert('RGB')
    x0, y0, x1, y1 = [c * dpr for c in box]
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    s = max(x1 - x0, (y1 - y0) * 1.4) * 1.25
    a = (int(cx - s / 2), int(cy - s / 2.8), int(cx + s / 2), int(cy + s / 2.8))
    c = im.crop(a)
    return c.resize((w, int(w * c.height / max(1, c.width))), Image.LANCZOS)


def collage(namen, ergebnisse, geraet, dpr, datei):
    try: font = ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial.ttf', 22)
    except Exception: font = ImageFont.load_default()
    spalten = []
    for n in namen:
        r = ergebnisse[n]
        teile = []
        for art in ('start', 'fahrt'):
            g = Image.open(r[art]['bild']).convert('RGB')
            gw = 520 if geraet == 'quer' else 300
            teile.append(g.resize((gw, int(gw * g.height / g.width)), Image.LANCZOS))
            teile.append(nah(r[art]['bild'], r[art]['box'], dpr))
        spalten.append((VARIANTEN[n][2], teile))
    W = 520
    hoehe = [sum(t.height + 8 for t in teile) for _, teile in spalten]
    C = Image.new('RGB', (len(spalten) * (W + 12) + 12, max(hoehe) + 50), (30, 30, 30))
    d = ImageDraw.Draw(C)
    for k, (lab, teile) in enumerate(spalten):
        x = 12 + k * (W + 12); y = 44
        d.text((x, 10), lab, fill=(255, 255, 255), font=font)
        for t in teile:
            C.paste(t, (x + (W - t.width) // 2, y)); y += t.height + 8
    C.save(datei, quality=86)
    return datei


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--varianten', default='alt,heute,b,c,d')
    ap.add_argument('--geraete', default='quer,hoch')
    ap.add_argument('--browser', default='webkit', choices=['webkit', 'chromium'])
    ap.add_argument('--q', default='2')
    ap.add_argument('--name', default='kino')
    a = ap.parse_args()
    namen = a.varianten.split(',')
    alle = {}
    with sync_playwright() as pw, Server(ROOT) as neu, Server(ALT) as alt:
        for geraet in a.geraete.split(','):
            erg = {}
            for n in namen:
                wurzel, zusatz, _ = VARIANTEN[n]
                tag = f'{a.name}_{a.browser}_{geraet}_{n}'
                t0 = time.time()
                erg[n] = aufnahme(pw, a.browser, (alt if wurzel == 'alt' else neu).base, zusatz, geraet, a.q, tag)
                print(geraet, n, round(time.time() - t0), 's', json.dumps({k: erg[n][k] for k in ('info0', 'info', 'fehler')}, ensure_ascii=False),
                      {art: erg[n][art]['state'] for art in ('start', 'fahrt')}, flush=True)
            dpr = 3 if a.browser == 'webkit' else 2.625
            p = collage(namen, erg, geraet, dpr, os.path.join(OUT, f'vergleich_{a.name}_{a.browser}_{geraet}.jpg'))
            print('Collage', p, flush=True)
            alle[geraet] = erg
    with open(os.path.join(OUT, f'vergleich_{a.name}_{a.browser}.json'), 'w') as f:
        json.dump(alle, f, ensure_ascii=False, indent=1)


if __name__ == '__main__':
    main()
