# n32: einfache Collage aus Bildern (Raster, Beschriftung) – zum Ansehen und für den Bericht.
# Aufruf: python3 tests/collage.py <ausgabe.jpg> <spalten> <breite je Bild> bild1[=Text] bild2[=Text] …
import sys
from PIL import Image, ImageDraw, ImageFont
out, cols, w = sys.argv[1], int(sys.argv[2]), int(sys.argv[3])
items = []
for a in sys.argv[4:]:
    p, _, t = a.partition('=')
    items.append((p, t or p.rsplit('/', 1)[-1].rsplit('.', 1)[0]))
ims = []
for p, t in items:
    try: im = Image.open(p).convert('RGB')
    except Exception: im = Image.new('RGB', (w, w // 2), (60, 0, 0))
    im = im.resize((w, round(im.height * w / im.width)), Image.LANCZOS)
    ims.append((im, t))
h = max(i.height for i, _ in ims)
rows = (len(ims) + cols - 1) // cols
C = Image.new('RGB', (cols * w, rows * h), (20, 20, 20))
try: font = ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc', max(14, w // 28))
except Exception: font = ImageFont.load_default()
d = ImageDraw.Draw(C)
for k, (im, t) in enumerate(ims):
    x, y = (k % cols) * w, (k // cols) * h
    C.paste(im, (x, y))
    d.rectangle([x, y, x + d.textlength(t, font=font) + 12, y + font.size + 10], fill=(0, 0, 0))
    d.text((x + 6, y + 4), t, fill=(255, 255, 255), font=font)
C.save(out, quality=86)
print(out, C.size)
