# Baut aus dem Zweig-Atlas von Poly Haven "fir_tree_01" (CC0) eine Tannen-Silhouette (Billboard-Karte).
import os, random
from PIL import Image, ImageEnhance
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
S = os.path.join(ROOT, 'assets_src')
diff = Image.open(os.path.join(S, 'fir_tree_01_twig_diff_1k.jpg')).convert('RGB')
alpha = Image.open(os.path.join(S, 'fir_tree_01_twig_alpha_1k.png')).convert('L')
bark = Image.open(os.path.join(S, 'fir_tree_01_bark_diff_1k.jpg')).convert('RGB')
atlas = diff.copy(); atlas.putalpha(alpha)
boxes = [(190, 50, 430, 320), (320, 410, 660, 785), (650, 460, 915, 790), (670, 50, 950, 375)]
twigs = [atlas.crop(b) for b in boxes]
W, H = 512, 1024
rnd = random.Random(7)
def make(variant):
    card = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    # Stamm
    trunk = bark.resize((40, H)).crop((0, 0, 28, int(H * 0.9)))
    tr = trunk.convert('RGBA'); card.alpha_composite(ImageEnhance.Brightness(tr.convert('RGB')).enhance(0.55).convert('RGBA'), (W // 2 - 14, int(H * 0.1)))
    layers = 34
    for i in range(layers):
        t = i / (layers - 1)            # 0 unten .. 1 Spitze
        y = int(H * (0.93 - 0.86 * t))
        half = (1 - t) ** 0.95 * W * 0.40 + 12
        n = 2 + int((1 - t) * 3)
        for k in range(n):
            side = -1 if k % 2 == 0 else 1
            tw = rnd.choice(twigs)
            sc = (0.35 + 0.75 * (1 - t)) * rnd.uniform(0.8, 1.15)
            tw = tw.resize((max(8, int(tw.width * sc)), max(8, int(tw.height * sc))))
            ang = side * rnd.uniform(55, 80) + (0 if variant == 0 else rnd.uniform(-8, 8))   # Zweige nach außen, leicht hängend
            twr = tw.rotate(ang, expand=True, resample=Image.BICUBIC)
            shade = 0.55 + 0.45 * rnd.random() * (0.6 + 0.4 * t)
            rgb = ImageEnhance.Brightness(twr.convert('RGB')).enhance(shade); twr = Image.merge('RGBA', (*rgb.split(), twr.split()[3]))
            reach = rnd.uniform(0.25, 1.0) * half
            x = int(W / 2 + side * reach * 0.55 - twr.width / 2)
            yy = int(y - twr.height * 0.5 + rnd.uniform(-10, 10))
            # sicher einfügen (paste clippt am Rand)
            box = Image.new('RGBA', (W, H), (0, 0, 0, 0))
            box.paste(twr, (x, yy), twr)
            card = Image.alpha_composite(card, box)
    return card
for v in range(2):
    c = make(v)
    c.save(os.path.join(S, f'fir_card_{v}.png'))
    prev = Image.new('RGB', (W, H), (120, 160, 220)); prev.paste(c, (0, 0), c); prev.resize((256, 512)).save(f'/tmp/sb_dl/fir_card_{v}_prev.jpg')
print('ok')
