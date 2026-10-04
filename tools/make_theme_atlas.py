# Kulissen (n20): Pflanzen-Atlanten der Landschafts-Themen aus CC0-Modellen (Poly Haven, Kenney; tools/fetch_themes.py),
# gerendert wie tools/make_impostors.py (Seitenansicht, tools/impostor.html über die GPU, Farbe in die Ränder gezogen).
# Ausgabe: assets/themes/veg/<atlas>.webp + .json (Zellen: uv, Breite/Höhe in Modell-Metern, Deckung).
# Aufruf: python3 tools/make_theme_atlas.py [atlas …]   (--probe: nur Einzelbilder nach /tmp/atlas_probe/)
import os, sys, io, json, base64
import numpy as np
from PIL import Image
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, 'tests'))
sys.path.insert(0, os.path.join(ROOT, 'tools'))
from util import Server, ARGS
from playwright.sync_api import sync_playwright
from PIL import ImageFilter
from make_palm_card import palm_image


# wie tools/make_impostors.py: Farbe der deckenden Pixel in die durchsichtigen Ränder ziehen (gegen dunkle Säume)
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

PH = '../assets_src/themes/models/'
KN = '../assets_src/themes/kenney/nk/Models/GLTF format/'
ph = lambda m: f'{PH}{m}/{m}_1k.gltf'
kn = lambda m: f'{KN}{m}.glb'
# Atlas → Zellen (Name, Modell, Unter-Mesh oder None, Drehung, x, y, Größe). 1024 × 1024.
ATLASES = {
    # Wüste/Canyon (Karoo-Art): Köcherbäume, Rooibos-Busch, Sukkulenten (Kenney-Kakteen wirkten wie Spielzeug → nicht genutzt)
    'wueste': [
        ('koecher1', ph('quiver_tree_01'), None, 0.0, 0, 0, 512),
        ('koecher2', ph('quiver_tree_02'), None, 0.5, 512, 0, 512),
        ('rooibos', ph('wild_rooibos_bush'), 'Plane012', 0.0, 0, 512, 256),
        ('rooibos2', ph('wild_rooibos_bush'), 'Plane001', 0.7, 256, 512, 256),
        ('sukk1', ph('cheiridopsis_succulent'), 'Icosphere013', 0.0, 512, 512, 256),
        ('sukk2', ph('cheiridopsis_succulent'), 'Icosphere005', 0.6, 768, 512, 256),
    ],
    # Küste/Tropen: Palmen (eigene Karten, tools/make_palm_card.py), Inselbaum, Wasserkastanie, Strauch
    'kueste': [
        ('palme1', 'palm:1:0.045', None, 0.0, 0, 0, 512),
        ('palme2', 'palm:2:0.07', None, 0.0, 512, 0, 512),
        ('insel', ph('island_tree_02'), None, 0.3, 0, 512, 512),
        ('palme3', 'palm:3:0.095', None, 0.0, 512, 512, 256),
        ('pachira', ph('pachira_aquatica_01'), None, 0.0, 768, 512, 256),
        ('strauch', ph('shrub_02'), 'shrub_02_c', 0.0, 512, 768, 256),
        ('strauch2', ph('shrub_02'), 'shrub_02_a', 0.8, 768, 768, 256),
    ],
    # Stadt: Jacaranda (Straßenbaum), Inselbaum, Sträucher
    'stadt': [
        ('jacaranda', ph('jacaranda_tree'), None, 0.0, 0, 0, 512),
        ('insel3', ph('island_tree_03'), None, 0.4, 512, 0, 512),
        ('strauch', ph('shrub_02'), 'shrub_02_c', 0.0, 0, 512, 256),
        ('strauch2', ph('shrub_02'), 'shrub_02_b', 0.8, 256, 512, 256),
    ],
    # Alpen/Winter: junge Tanne, Strauch
    'berg': [
        ('jungtanne', ph('fir_sapling_medium'), 'NurbsPath007', 0.0, 0, 0, 512),
        ('strauch', ph('shrub_02'), 'shrub_02_d', 0.0, 512, 0, 256),
    ],
}
PROBE = '--probe' in sys.argv
want = [a for a in sys.argv[1:] if not a.startswith('--')] or list(ATLASES)
out_dir = os.path.join(ROOT, 'assets', 'themes', 'veg')
os.makedirs(out_dir, exist_ok=True)
with Server(ROOT) as srv, sync_playwright() as pw:
    b = pw.chromium.launch(args=ARGS)
    pg = b.new_page()
    errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto(srv.base + 'tools/impostor.html'); pg.wait_for_function('window.ready')
    for an in want:
        cells = ATLASES[an]
        H = max(y + sz for *_, y, sz in cells)
        atlas = Image.new('RGBA', (1024, H), (0, 0, 0, 0))
        meta = {}
        for name, url, pick, yaw, x, y, sz in cells:
            if url.startswith('palm:'):
                _, sd, bend = url.split(':')
                im, w, h = palm_image(sz, int(sd), float(bend))
                r = {'w': w, 'h': h}
                url = 'eigene Palmenkarte ' + sd
            else:
                r = pg.evaluate('([u, s, y, p]) => render(u, s, y, { pick: p })', [url, [sz * 2, sz * 2], yaw, pick])
                im = Image.open(io.BytesIO(base64.b64decode(r['url'].split(',')[1]))).convert('RGBA').resize((sz, sz), Image.LANCZOS)
            im = bleed(im)
            if PROBE:
                os.makedirs('/tmp/atlas_probe', exist_ok=True); im.save(f'/tmp/atlas_probe/{an}_{name}.png')
            atlas.paste(im, (x, y))
            a = np.asarray(im)[..., 3]
            meta[name] = dict(uv=[x / 1024, 1 - (y + sz) / H, sz / 1024, sz / H], w=r['w'], h=r['h'], cover=round(float((a > 128).mean()), 3), model=url.split('/')[-1])
            print(an, name, meta[name], errs[:1], flush=True)
        if not PROBE:
            atlas.save(os.path.join(out_dir, an + '.webp'), 'WEBP', quality=86, method=6)
            json.dump(meta, open(os.path.join(out_dir, an + '.json'), 'w'), indent=1)
            print('Atlas', an, os.path.getsize(os.path.join(out_dir, an + '.webp')), 'Bytes', flush=True)
        else:
            atlas.save(f'/tmp/atlas_probe/{an}_atlas.png')
    b.close()
