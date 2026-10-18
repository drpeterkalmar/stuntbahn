# n37: Bildfolgen-Collagen aus tests/arcade_shots.py (vorher = ?physik=alt, nachher = Arcade: Salto, Schraube), quer + hoch
# → tests/shots/n37/bildfolge_quer.jpg, bildfolge_hoch.jpg
import os
from PIL import Image, ImageDraw, ImageFont
D = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'shots', 'n37')
try: FONT = ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial Bold.ttf', 30)
except Exception: FONT = ImageFont.load_default()
for lay, w in [('quer', 480), ('hoch', 220)]:
    rows = [('vorher (?physik=alt): Vollgas, in der Luft Gas antippen – nichts', 'alt_salto'), ('nachher Mittel: Gas antippen = Salto', 'neu_salto'), ('nachher Mittel: Pfeil rechts antippen = Schraube', 'neu_schraube')]
    frames = ['1', '3', '5', '7', 'landung']
    tiles = []
    for label, key in rows:
        ims = []
        for f in frames:
            p = os.path.join(D, f'{lay}_{key}_{f}.png')
            if os.path.exists(p):
                im = Image.open(p).convert('RGB'); ims.append(im.resize((w, round(im.height * w / im.width))))
        tiles.append((label, ims))
    h = max(im.height for _, ims in tiles for im in ims)
    W, H = w * len(frames) + 10 * (len(frames) + 1), (h + 50) * len(rows) + 10
    C = Image.new('RGB', (W, H), (18, 18, 22)); dr = ImageDraw.Draw(C)
    for r, (label, ims) in enumerate(tiles):
        y = 10 + r * (h + 50)
        dr.text((12, y), label, fill=(255, 220, 120), font=FONT)
        for k, im in enumerate(ims): C.paste(im, (10 + k * (w + 10), y + 40))
    out = os.path.join(D, f'bildfolge_{lay}.jpg'); C.save(out, quality=82); print(out, C.size)
