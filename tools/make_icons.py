# App-Icons: stilisierter Looping auf dunklem Grund (eigene Grafik)
from PIL import Image, ImageDraw, ImageFilter
import os, math
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
def icon(S, maskable=False):
    im = Image.new('RGBA', (S, S), (14, 17, 22, 255))
    d = ImageDraw.Draw(im)
    pad = S * (0.18 if maskable else 0.08)
    # Hintergrund-Verlauf
    for y in range(S):
        c = int(22 + 30 * y / S)
        d.line([(0, y), (S, y)], fill=(c, c + 6, c + 18, 255))
    cx, cy, r = S / 2, S * 0.47, (S / 2 - pad) * 0.62
    w = max(4, int(S * 0.085))
    # Looping-Band (orange) + Straße
    d.ellipse([cx - r, cy - r, cx + r, cy + r], outline=(255, 106, 42, 255), width=w)
    d.rectangle([pad, cy + r - w * 0.55, S - pad, cy + r + w * 0.55], fill=(255, 106, 42, 255))
    # Auto (Keil) oben im Looping, kopfüber
    cw, ch = r * 0.55, r * 0.22
    top = cy - r + w * 0.5
    d.polygon([(cx - cw / 2, top + 2), (cx + cw / 2, top + 2), (cx + cw * 0.3, top + ch), (cx - cw * 0.4, top + ch)], fill=(245, 245, 245, 255))
    # Speedlines
    for k in range(3):
        y = cy + r + w * 1.6 + k * w * 0.9
        d.line([(pad + k * S * 0.05, y), (S * 0.45 - k * S * 0.03, y)], fill=(255, 194, 61, 200), width=max(2, w // 3))
    return im
os.makedirs(os.path.join(ROOT, 'icons'), exist_ok=True)
icon(192).save(os.path.join(ROOT, 'icons', 'icon-192.png'))
icon(512).save(os.path.join(ROOT, 'icons', 'icon-512.png'))
icon(512, True).save(os.path.join(ROOT, 'icons', 'icon-maskable-512.png'))
icon(180).convert('RGB').save(os.path.join(ROOT, 'icons', 'apple-touch-icon.png'))
print('Icons ok')
