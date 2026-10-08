# n30 Grafik-Kern, Baustein 4: Oktaeder-Impostors backen → assets/tex/imp/<art>_farbe.webp, <art>_nor.webp, impostor.json
# Steuert tools/build_impostor.html (GPU-Browser, wie tools/make_impostors.py). Danach: Farbe in durchsichtige Ränder
# ausbluten (gegen dunkle Säume bei Mipmaps), WebP schreiben, Vorschau-Collage tests/shots/technik/impostor_<art>.png.
# Vorher: python3 tools/fetch_deco.py und tools/fetch_themes.py (assets_src/ mit den Poly-Haven-Modellen und Tannen-Zweigen).
# Aufruf: python3 tools/build_impostor.py [art,art,…] [--N=8] [--zelle=128]
# Mac mini 8 GB: ein Browser, danach geschlossen.
import os, sys, io, json, base64
import numpy as np
from PIL import Image, ImageFilter
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, 'tests'))
from util import Server, ARGS
from playwright.sync_api import sync_playwright

arg = {k[2:].split('=')[0]: k.split('=')[1] for k in sys.argv[1:] if k.startswith('--')}
NUR = [a for a in sys.argv[1:] if not a.startswith('--')]
N = int(arg.get('N', 8)); ZELLE = int(arg.get('zelle', 128))
OUT = os.path.join(ROOT, 'assets', 'tex', 'imp'); os.makedirs(OUT, exist_ok=True)
SHOTS = os.path.join(ROOT, 'tests', 'shots', 'technik'); os.makedirs(SHOTS, exist_ok=True)

def png(url): return Image.open(io.BytesIO(base64.b64decode(url.split(',', 1)[1]))).convert('RGBA')

def bleed(im, schritte=8):
    # Farbe der deckenden Pixel schrittweise in die durchsichtigen schieben (Alpha bleibt)
    a = np.array(im).astype(np.float32); rgb = a[..., :3]; al = a[..., 3] > 127
    m = al.copy()
    for _ in range(schritte):
        acc = np.zeros_like(rgb); cnt = np.zeros(m.shape, np.float32)
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            sm = np.roll(np.roll(m, dy, 0), dx, 1); sr = np.roll(np.roll(rgb, dy, 0), dx, 1)
            acc += sr * sm[..., None]; cnt += sm
        neu = (~m) & (cnt > 0)
        rgb[neu] = acc[neu] / cnt[neu][:, None]; m = m | neu
    a[..., :3] = rgb
    return Image.fromarray(a.clip(0, 255).astype(np.uint8), 'RGBA')

meta_pfad = os.path.join(OUT, 'impostor.json')
meta = json.load(open(meta_pfad)) if os.path.exists(meta_pfad) else {'version': 1, 'arten': {}}
with Server(ROOT) as srv, sync_playwright() as pw:
    b = pw.chromium.launch(args=ARGS)
    pg = b.new_page(viewport={'width': 800, 'height': 800})
    fehler = []
    pg.on('pageerror', lambda e: fehler.append(str(e)))
    pg.on('console', lambda m: fehler.append(m.text) if m.type == 'error' else None)
    pg.goto(srv.base + 'tools/build_impostor.html'); pg.wait_for_function('window.ready === true', timeout=60000)
    arten = NUR or pg.evaluate('window.arten()')
    for name in arten:
        r = pg.evaluate('([n, N, z]) => window.backeArt(n, N, z)', [name, N, ZELLE])
        farbe = bleed(png(r['farbe'])); nor = png(r['normalen'])
        # Normalen-Atlas: durchsichtige Stellen neutral (nach oben), Deckkraft nicht nötig
        na = np.array(nor); leer = na[..., 3] < 128; na[leer] = (128, 255, 128, 255); na[..., 3] = 255
        nor = Image.fromarray(na, 'RGBA').convert('RGB')
        ff, fn = f'{name}_farbe.webp', f'{name}_nor.webp'
        # n30-Abnahme (Ladegröße): Normalen nur fürs Licht → halbe Auflösung reicht; Farbe q80 (vorher 86/90: 2,9 MB alle Arten)
        farbe.save(os.path.join(OUT, ff), 'WEBP', quality=80, alpha_quality=85, method=6)
        nor.resize((nor.width // 2, nor.height // 2), Image.LANCZOS).save(os.path.join(OUT, fn), 'WEBP', quality=82, method=6)
        meta['arten'][name] = {'farbe': ff, 'normalen': fn, **r['meta']}
        # Vorschau: Farbe über Grau neben Normalen
        bg = Image.new('RGBA', farbe.size, (90, 90, 90, 255)); bg.alpha_composite(farbe)
        prev = Image.new('RGB', (farbe.width * 2, farbe.height)); prev.paste(bg.convert('RGB'), (0, 0)); prev.paste(nor, (farbe.width, 0))
        prev.resize((prev.width // 2, prev.height // 2)).save(os.path.join(SHOTS, f'impostor_{name}.png'))
        kb = (os.path.getsize(os.path.join(OUT, ff)) + os.path.getsize(os.path.join(OUT, fn))) // 1000
        print(name, r['meta'], f'{kb} KB', flush=True)
    b.close()
json.dump(meta, open(meta_pfad, 'w'), ensure_ascii=False, indent=1)
print('→', os.path.relpath(meta_pfad, ROOT), len(meta['arten']), 'Arten', 'Fehler:', fehler[:5])
