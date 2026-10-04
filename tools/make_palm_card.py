# Kulissen (n20): Palmen-Karten (eigene Arbeit). Bei Poly Haven, ambientCG, Kenney und Quaternius gibt es keine realistische
# CC0-Palme (nur Low-Poly-Modelle, die im Kino-Look wie Spielzeug wirken) → Seitenansicht prozedural gemalt: Stamm mit
# Blattnarben-Ringen und leichter Krümmung, 14–18 Wedel aus vielen Fiederblättchen, hinten dunkler (Tiefe), Kokosnüsse.
# Aufruf aus tools/make_theme_atlas.py: palm_image(size, seed, bend) → RGBA-Bild (Fuß unten Mitte), Maße in m
import math, random
import numpy as np
from PIL import Image, ImageDraw, ImageFilter


def palm_image(size=512, seed=1, bend=0.12, height_m=11.0):
    S = size * 2
    R = random.Random(seed)
    im = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    W_m = height_m * 0.95                  # Breite der Karte in m (Krone breiter als der Stamm)
    px = S / W_m                           # Pixel je m (gleich in x/y bei quadratischer Karte und H = W … Höhe angepasst)
    H_m = S / px
    base = (S / 2, S - 2)
    top_h = height_m * 0.64 * px           # Kronenansatz
    # Stamm: Bézier mit Krümmung, Dicke 0,42 → 0,26 m
    def trunk(t):
        x = base[0] + bend * px * height_m * (t * t) * (1 if seed % 2 else -1)
        y = base[1] - top_h * t
        return x, y
    N = 120
    for i in range(N):
        t0, t1 = i / N, (i + 1) / N
        (x0, y0), (x1, y1) = trunk(t0), trunk(t1)
        w = (0.42 - 0.16 * t0) * px / 2
        ring = 0.86 + 0.12 * (1 if (i % 5) < 2 else 0) + R.uniform(-0.06, 0.06)
        c = tuple(int(v * ring) for v in (118, 98, 74))
        d.polygon([(x0 - w, y0), (x0 + w, y0), (x1 + w * 0.98, y1), (x1 - w * 0.98, y1)], fill=c + (255,))
        # Licht von links: rechte Hälfte dunkler
        d.polygon([(x0 + w * 0.15, y0), (x0 + w, y0), (x1 + w * 0.98, y1), (x1 + w * 0.15, y1)], fill=tuple(int(v * ring * 0.72) for v in (118, 98, 74)) + (255,))
    cx, cy = trunk(1.0)
    # Wedel: Mittelrippe als gebogene Kurve, Fiederblättchen zu beiden Seiten
    fronds = []
    n = R.randint(14, 18)
    for k in range(n):
        a = (k / n) * 2 * math.pi + R.uniform(-0.2, 0.2)
        side = math.cos(a)                     # −1 … 1 (links/rechts in der Karte)
        depth = math.sin(a)                    # hinten (−) / vorne (+)
        up = R.uniform(0.05, 0.4) if k % 3 else R.uniform(0.4, 0.7)
        L = R.uniform(3.2, 4.2) * px
        fronds.append((depth, side, up, L))
    fronds.sort(key=lambda f: f[0])            # hinten zuerst
    for depth, side, up, L in fronds:
        shade = 0.62 + 0.38 * (depth * 0.5 + 0.5)
        dry = R.random() < 0.18
        col = (np.array([98, 92, 52]) if dry else np.array([56, 96, 38])) * shade
        pts = []
        for i in range(40):
            t = i / 39
            # horizontale Reichweite verkürzt (Projektion), Bogen nach unten
            x = cx + side * L * t * (0.35 + 0.65 * abs(side)) * 1.0
            y = cy - (up * L * t) + (L * 0.75) * t * t * (0.55 + 0.45 * (1 - up))
            pts.append((x, y))
        for i in range(1, len(pts)):
            d.line([pts[i - 1], pts[i]], fill=tuple(int(v) for v in col * 0.8) + (255,), width=max(2, int(0.05 * px)))
        # Fiedern: kurze, schräg hängende Striche
        for i in range(3, 39):
            t = i / 39
            x, y = pts[i]
            lf = (0.55 + 0.35 * math.sin(t * math.pi)) * px * (1 - 0.5 * t)
            for s in (-1, 1):
                ang = math.atan2(pts[i][1] - pts[i - 1][1], pts[i][0] - pts[i - 1][0]) + s * (1.0 + R.uniform(-0.2, 0.2))
                ex, ey = x + math.cos(ang) * lf * 0.6, y + math.sin(ang) * lf * 0.6 + lf * 0.55
                cj = col * R.uniform(0.85, 1.15)
                d.line([(x, y), (ex, ey)], fill=tuple(int(min(255, v)) for v in cj) + (255,), width=max(2, int(0.035 * px)))
    # Kokosnüsse
    for k in range(R.randint(3, 6)):
        ox, oy = R.uniform(-0.35, 0.35) * px, R.uniform(0.05, 0.4) * px
        r = 0.13 * px
        d.ellipse([cx + ox - r, cy + oy - r, cx + ox + r, cy + oy + r], fill=(70, 58, 30, 255))
    im = im.filter(ImageFilter.SMOOTH)
    im = im.resize((size, size), Image.LANCZOS)
    return im, round(W_m, 3), round(H_m, 3)


if __name__ == '__main__':
    for s in (1, 2, 3):
        im, w, h = palm_image(512, s, 0.02 + 0.025 * s)
        bg = Image.new('RGBA', im.size, (120, 140, 170, 255)); bg.alpha_composite(im)
        bg.convert('RGB').save(f'/tmp/atlas_probe/palm{s}.jpg')
        print(w, h)
