# Deko (n28): Vergleichs-Collagen vorher/nachher aus tests/shots/deko/ → tests/shots/deko/vergleich_*.jpg
import os
from PIL import Image, ImageDraw, ImageFont
D = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'tests', 'shots', 'deko')
SZ = ['menu', 'start', 'kurve', 'cockpit', 'ueberblick', 'ziel', 'ergebnis']
NAMEN = {'menu': 'Menü', 'start': 'Start', 'kurve': 'Fahrt', 'cockpit': 'Cockpit', 'ueberblick': 'Blick über die Strecke', 'ziel': 'Zielshow', 'ergebnis': 'Ergebnis'}
try: F = ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial Bold.ttf', 26)
except Exception: F = ImageFont.load_default()

def label(im, txt):
    d = ImageDraw.Draw(im); w = d.textlength(txt, font=F)
    d.rectangle([6, 6, 18 + w, 42], fill=(0, 0, 0)); d.text((12, 9), txt, font=F, fill=(255, 210, 60))
    return im

def tile(p, w, h, txt):
    return label(Image.open(p).convert('RGB').resize((w, h), Image.LANCZOS), txt)

def quer():
    w, h = 900, 405
    for part, szs in (('a', SZ[:4]), ('b', SZ[4:])):
        C = Image.new('RGB', (2 * w + 10, len(szs) * (h + 10)), (25, 25, 25))
        for r, sz in enumerate(szs):
            for c, v in enumerate(('vorher', 'nachher')):
                C.paste(tile(os.path.join(D, f'{v}_quer_{sz}.png'), w, h, f'{NAMEN[sz]} – {v}'), (c * (w + 10), r * (h + 10)))
        C.save(os.path.join(D, f'vergleich_quer_{part}.jpg'), quality=85)

def hoch():
    w, h = 330, 733
    C = Image.new('RGB', (len(SZ) * (w + 8), 2 * (h + 8)), (25, 25, 25))
    for c, sz in enumerate(SZ):
        for r, v in enumerate(('vorher', 'nachher')):
            C.paste(tile(os.path.join(D, f'{v}_hoch_{sz}.png'), w, h, f'{NAMEN[sz]} {v}'), (c * (w + 8), r * (h + 8)))
    C.save(os.path.join(D, 'vergleich_hoch.jpg'), quality=85)

def themen():
    w, h = 400, 888
    TH = [t for t in ('herbst', 'winter', 'wueste', 'stadt') if os.path.exists(os.path.join(D, f'vorher_{t}_hoch_kurve.png'))]
    C = Image.new('RGB', (len(TH) * (w + 8), 2 * (h + 8)), (25, 25, 25))
    for c, t in enumerate(TH):
        for r, v in enumerate(('vorher', 'nachher')):
            C.paste(tile(os.path.join(D, f'{v}_{t}_hoch_kurve.png'), w, h, f'{t.capitalize()} {v}'), (c * (w + 8), r * (h + 8)))
    C.save(os.path.join(D, 'vergleich_themen_hoch.jpg'), quality=85)

quer(); hoch(); themen()
print(sorted(f for f in os.listdir(D) if f.startswith('vergleich_')))
