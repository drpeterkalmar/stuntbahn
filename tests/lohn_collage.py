# n38: Collagen aus tests/lohn_shots.py → tests/shots/n38/collage_quer.jpg, collage_hoch.jpg (Beschriftung je Bild)
import os
from PIL import Image, ImageDraw, ImageFont
D = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'shots', 'n38')
BILDER = [('laden_flug2', 'Salto im Flug (Zeitlupe)'), ('laden_landung', 'Salto → Nitro sofort bereit'),
          ('vorrat_landung', 'Nitro bereit → Vorrat voll (Ring)'), ('zwischen_cp', 'Checkpoint mit Zwischenzeit'),
          ('zwischen_ziel', 'Ziel-Karte: Abschnitte gegen Bestfahrt'), ('drift', 'Drift-Turbo-Meter (?driftturbo=1)')]
try: F = ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial Bold.ttf', 28)
except Exception: F = ImageFont.load_default()
for lay, w in [('quer', 800), ('hoch', 360)]:
    try: F = ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial Bold.ttf', 28 if lay == 'quer' else 17)
    except Exception: pass
    ims = []
    for k, txt in BILDER:
        p = os.path.join(D, f'{lay}_{k}.png')
        if not os.path.exists(p): continue
        im = Image.open(p).convert('RGB'); im = im.resize((w, round(im.height * w / im.width)))
        d = ImageDraw.Draw(im); d.rectangle([0, im.height - 40, im.width, im.height], fill=(0, 0, 0)); d.text((10, im.height - 36), txt, fill=(255, 220, 120), font=F)
        ims.append(im)
    cols = 2 if lay == 'quer' else 3
    rows = (len(ims) + cols - 1) // cols
    W, H = w * cols, max(i.height for i in ims) * rows
    out = Image.new('RGB', (W, H), (20, 20, 20))
    for i, im in enumerate(ims): out.paste(im, ((i % cols) * w, (i // cols) * ims[0].height))
    out.save(os.path.join(D, f'collage_{lay}.jpg'), quality=82)
    print(lay, out.size)
