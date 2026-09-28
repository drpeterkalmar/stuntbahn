# Optik (28.09.2026): Vergleichsbögen vorher | nachher je Gerät → tests/shots/optik/vergleich_<gerät>.jpg
import os, sys
from PIL import Image, ImageDraw
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
D = os.path.join(ROOT, 'tests', 'shots', 'optik')
for dev, w in [('quer', 760), ('hoch', 300), ('desktop', 700)]:
    rows = []
    for t in ['tag', '4711', 'trk']:
        for p in ['1start', '2gerade', '3kurve', '4landschaft']:
            a, b = os.path.join(D, 'vorher', f'{dev}_{t}_{p}.jpg'), os.path.join(D, 'nachher', f'{dev}_{t}_{p}.jpg')
            if os.path.exists(a) and os.path.exists(b): rows.append((f'{t} {p}', Image.open(a), Image.open(b)))
    if not rows: continue
    h = int(w * rows[0][1].height / rows[0][1].width)
    W = Image.new('RGB', (2 * w + 30, len(rows) * (h + 22) + 30), 'white'); d = ImageDraw.Draw(W)
    d.text((10, 8), f'{dev}: links vorher (HEAD e321500^), rechts nachher', fill='black')
    for k, (lab, a, b) in enumerate(rows):
        y = 30 + k * (h + 22)
        d.text((10, y), lab, fill='black')
        W.paste(a.resize((w, h)), (10, y + 14)); W.paste(b.resize((w, h)), (w + 20, y + 14))
    out = os.path.join(D, f'vergleich_{dev}.jpg'); W.save(out, quality=82); print(out, W.size)
