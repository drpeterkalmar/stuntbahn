# n26: Vergleichs-Collagen je Stunt aus tests/shots/stuntgroesse (tests/stuntgroesse_shots.py) → tests/shots/final/stunt_*.jpg
# quer: 2 × 2 (Zeilen Verfolger/Fern, Spalten bis n25 / n26), hoch: 1 × 4 (Verfolger alt/neu, Fern alt/neu)
import os, sys
from PIL import Image, ImageDraw, ImageFont
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'tests', 'shots', 'stuntgroesse'); DST = os.path.join(ROOT, 'tests', 'shots', 'final')
STUNTS = ['looping', 'roehre', 'korkenzieher', 'schanze', 'klippe', 'wellen', 'steilwand', 'kuppe', 'bodenwellen', 'halfpipe', 'schlucht']
try: FONT = ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial Bold.ttf', 30)
except Exception: FONT = ImageFont.load_default()
def label(im, t):
    d = ImageDraw.Draw(im); d.rectangle([0, 0, 18 * len(t) + 24, 46], fill=(0, 0, 0)); d.text((12, 6), t, fill=(255, 255, 255), font=FONT); return im
for st in STUNTS:
    for mode, W in [('quer', 900), ('hoch', 380)]:
        ims = {}
        for nm in ['vorher', 'nachher']:
            for cam in ['chase', 'fern']:
                p = os.path.join(SRC, f'{nm}_{mode}_{st}_{cam}.png')
                if not os.path.exists(p): continue
                im = Image.open(p).convert('RGB'); im = im.resize((W, round(im.height * W / im.width)), Image.LANCZOS)
                ims[(nm, cam)] = label(im, ('bis n25' if nm == 'vorher' else 'n26') + (' · Verfolger' if cam == 'chase' else ' · Fern'))
        if len(ims) < 4: continue
        w, h = ims[('vorher', 'chase')].size
        if mode == 'quer':
            out = Image.new('RGB', (2 * w + 6, 2 * h + 6), (255, 255, 255))
            for r, cam in enumerate(['chase', 'fern']):
                for c, nm in enumerate(['vorher', 'nachher']): out.paste(ims[(nm, cam)], (c * (w + 6), r * (h + 6)))
        else:
            out = Image.new('RGB', (4 * w + 18, h), (255, 255, 255))
            for c, key in enumerate([('vorher', 'chase'), ('nachher', 'chase'), ('vorher', 'fern'), ('nachher', 'fern')]): out.paste(ims[key], (c * (w + 6), 0))
        out.save(os.path.join(DST, f'stunt_{st}_{mode}.jpg'), quality=80)
print('ok')
