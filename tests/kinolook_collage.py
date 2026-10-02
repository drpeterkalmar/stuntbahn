# Kino-Look (n17): Nebeneinander-Collagen aus tests/shots/kinolook/<Etikett>/<szene>.jpg
# Aufruf: python3 tests/kinolook_collage.py [Etiketten vorher,look0,look1,look2] [Titel …] [Präfix vergleich]
import os, sys
from PIL import Image, ImageDraw, ImageFont
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
D = os.path.join(ROOT, 'tests', 'shots', 'kinolook')
labels = (sys.argv[1] if len(sys.argv) > 1 else 'vorher,look0,look1,look2').split(',')
titles = (sys.argv[2] if len(sys.argv) > 2 else 'Heute (bis n22),Einfach,Standard,Kino').split(',')
prefix = sys.argv[3] if len(sys.argv) > 3 else 'vergleich'
scenes = (sys.argv[4] if len(sys.argv) > 4 else 'start,gerade,kurve,looping,sprung,cockpit,hochformat').split(',')
try: font = ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial Bold.ttf', 26)
except Exception: font = ImageFont.load_default()
for sc in scenes:
    ims = []
    for l in labels:
        p = os.path.join(D, l, sc + '.jpg')
        ims.append(Image.open(p).convert('RGB') if os.path.exists(p) else None)
    if not any(ims): continue
    hoch = sc == 'hochformat'
    W = 520 if hoch else 960
    tiles = []
    for im, t in zip(ims, titles):
        if im is None: im = Image.new('RGB', (W, int(W * 0.45)), (40, 40, 40))
        im = im.resize((W, round(im.height * W / im.width)), Image.LANCZOS)
        d = ImageDraw.Draw(im); d.rectangle([0, 0, W, 38], fill=(0, 0, 0)); d.text((12, 5), t, fill=(255, 255, 255), font=font)
        tiles.append(im)
    if hoch:
        out = Image.new('RGB', (W * len(tiles), max(t.height for t in tiles)))
        for i, t in enumerate(tiles): out.paste(t, (i * W, 0))
    else:
        cols = 2; rows = (len(tiles) + 1) // 2; th = max(t.height for t in tiles)
        out = Image.new('RGB', (W * cols, th * rows))
        for i, t in enumerate(tiles): out.paste(t, ((i % cols) * W, (i // cols) * th))
    p = os.path.join(D, f'{prefix}_{sc}.jpg'); out.save(p, quality=86); print(p)
