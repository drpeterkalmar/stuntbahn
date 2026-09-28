# Optik (28.09.2026): Pflanzen-Atlas aus Poly-Haven-Modellen (CC0) → assets/tex/veg_atlas.webp + veg_atlas.json.
# Rendert jede Pflanze headless (tools/impostor.html, GPU) von der Seite in 2× Auflösung, verkleinert, füllt die Farbe in
# die durchsichtigen Ränder (gegen dunkle Säume bei Mipmaps/alphaTest) und legt alles in einen 1024er-Atlas:
#   oben: 2 Laubbäume (je 512²), dann Büsche (4 × 256²), dann Gras + Blumen (4 × 256²).
# Vorher: python3 tools/fetch_deco.py
import os, sys, io, json, base64
import numpy as np
from PIL import Image, ImageFilter
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, 'tests'))
from util import Server, ARGS
from playwright.sync_api import sync_playwright

D = '../assets_src/deco/'
# (Name, Modell, Unter-Mesh, Drehung, Zelle x, y, Größe)
CELLS = [
    ('laub1', 'tree_small_02', None, 0.0, 0, 0, 512),
    ('laub2', 'island_tree_01', None, 0.6, 512, 0, 512),
    ('blume3', 'celandine_01', 'celandine_01_c_LOD0', 0.0, 0, 512, 256),
    ('blume4', 'celandine_01', 'celandine_01_d_LOD0', 1.2, 256, 512, 256),
    ('busch3', 'searsia_lucida', 'Cube070', 0.0, 512, 512, 256),
    ('busch4', 'searsia_lucida', 'Cube071', 0.9, 768, 512, 256),
    ('gras1', 'grass_medium_01', 'grass_medium_01_large_b_LOD0', 0.0, 0, 768, 256),
    ('gras2', 'grass_medium_01', 'grass_medium_01_mid_b_LOD0', 0.0, 256, 768, 256),
    ('blume1', 'dandelion_01', 'dandelion_01_a_LOD0', 0.0, 512, 768, 256),
    ('blume2', 'dandelion_01', 'dandelion_01_b_LOD0', 0.8, 768, 768, 256),
]

def bleed(im):
    # Farbe der deckenden Pixel schrittweise in die durchsichtigen schieben (Alpha bleibt)
    a = np.asarray(im).astype(np.float32) / 255
    rgb, al = a[..., :3], a[..., 3:4]
    filled = (al > 0.02).astype(np.float32)
    col = rgb * filled
    for _ in range(24):
        if filled.min() > 0: break
        k = lambda x: np.asarray(Image.fromarray((np.clip(x, 0, 1) * 255).astype(np.uint8).squeeze()).filter(ImageFilter.BoxBlur(2))).astype(np.float32) / 255
        cs = np.stack([k(col[..., i]) for i in range(3)], -1)
        fs = k(filled[..., 0])[..., None]
        grow = (fs > 0.01) & (filled < 0.5)
        col = np.where(grow, cs / np.maximum(fs, 1e-3), col)
        filled = np.where(grow, 1.0, filled)
    out = np.concatenate([np.clip(col, 0, 1), al], -1)
    return Image.fromarray((out * 255).astype(np.uint8), 'RGBA')

atlas = Image.new('RGBA', (1024, 1024), (0, 0, 0, 0))
meta = {}
with Server(ROOT) as srv, sync_playwright() as pw:
    b = pw.chromium.launch(args=ARGS)
    pg = b.new_page()
    errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto(srv.base + 'tools/impostor.html'); pg.wait_for_function('window.ready')
    for name, model, pick, yaw, x, y, sz in CELLS:
        r = pg.evaluate('([u, s, y, p]) => render(u, s, y, { pick: p })', [f'{D}{model}/{model}_1k.gltf', [sz * 2, sz * 2], yaw, pick])
        im = Image.open(io.BytesIO(base64.b64decode(r['url'].split(',')[1]))).convert('RGBA').resize((sz, sz), Image.LANCZOS)
        im = bleed(im)
        atlas.paste(im, (x, y))
        a = np.asarray(im)[..., 3]
        meta[name] = dict(uv=[x / 1024, 1 - (y + sz) / 1024, sz / 1024, sz / 1024], w=r['w'], h=r['h'], cover=round(float((a > 128).mean()), 3), model=model)
        print(name, meta[name], errs[:1], flush=True)
    b.close()
out = os.path.join(ROOT, 'assets', 'tex')
atlas.save(os.path.join(out, 'veg_atlas.webp'), 'WEBP', quality=86, method=6)
atlas.save(os.path.join(ROOT, 'assets_src', 'deco', 'veg_atlas_preview.png'))
json.dump(meta, open(os.path.join(out, 'veg_atlas.json'), 'w'), indent=1)
print('Atlas', os.path.getsize(os.path.join(out, 'veg_atlas.webp')), 'Bytes')
