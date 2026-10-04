# Kulissen (n20): Himmel je Landschafts-Thema aus Poly-Haven-HDRIs (CC0, assets_src/themes/hdri/, tools/fetch_themes.py).
# Wie tools/make_sky.py (Land): 4k-HDR → Himmelsbild (obere Halbkugel + 8° unter dem Horizont, ACES-Näherung wie im Spiel)
# als JPG, Sonnenrichtung (hellster Bereich), Horizontfarbe (Nebel), dazu Sonnenfarbe und -stärke (bedeckt: schwach) und
# die mittlere Himmelsfarbe. Das 1k-HDR wird unverändert als Umgebungslicht übernommen.
# Ausgabe: assets/themes/<thema>/sky.jpg, sky.json, env.hdr
# Aufruf: python3 tools/make_theme_sky.py [thema …]
import numpy as np, json, os, sys, shutil
from PIL import Image
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'assets_src', 'themes', 'hdri')
SKIES = {
    'wueste': 'qwantani_afternoon_puresky',
    'alpen': 'pizzo_pernice_puresky',
    'kueste': 'kloofendal_38d_partly_cloudy_puresky',
    'stadt': 'qwantani_late_afternoon_puresky',
    'herbst': 'autumn_field_puresky',
    'winter': 'snow_field_puresky',
}


def read_hdr(path):
    import re
    data = open(path, 'rb').read()
    i = 0
    while True:
        j = data.index(b'\n', i); line = data[i:j].decode('ascii', 'ignore'); i = j + 1
        if line == '': break
    j = data.index(b'\n', i); res = data[i:j].decode(); i = j + 1
    m = re.match(r'-Y (\d+) \+X (\d+)', res); H, W = int(m.group(1)), int(m.group(2))
    buf = np.frombuffer(data, dtype=np.uint8, offset=i)
    out = np.zeros((H, W, 4), np.uint8); p = 0
    for y in range(H):
        if buf[p] == 2 and buf[p + 1] == 2:
            p += 4
            for c in range(4):
                x = 0; row = out[y, :, c]
                while x < W:
                    n = int(buf[p]); p += 1
                    if n > 128:
                        n -= 128; row[x:x + n] = buf[p]; p += 1
                    else:
                        row[x:x + n] = buf[p:p + n]; p += n
                    x += n
        else:
            out[y] = buf[p:p + W * 4].reshape(W, 4); p += W * 4
    rgb = out[..., :3].astype(np.float32); e = out[..., 3].astype(np.float32)
    f = np.where(e > 0, np.ldexp(1.0, (e - 136).astype(np.int32)), 0.0)
    return rgb * f[..., None]


def srgb(c):
    return np.where(c <= 0.0031308, 12.92 * c, 1.055 * np.power(np.maximum(c, 0), 1 / 2.4) - 0.055)


def aces(c):
    a, b, cc, d, e = 2.51, 0.03, 2.43, 0.59, 0.14
    return np.clip((c * (a * c + b)) / (c * (cc * c + d) + e), 0, 1)


def make(theme, hdri):
    src = os.path.join(SRC, hdri + '_4k.hdr')
    img = read_hdr(src)
    H, W, _ = img.shape
    lum = img @ np.array([0.2126, 0.7152, 0.0722], np.float32)
    upper = lum[:H // 2]
    y, x = np.unravel_index(np.argmax(upper), upper.shape)
    win = lum[max(0, y - 40):y + 40, max(0, x - 40):x + 40]
    yy, xx = np.mgrid[max(0, y - 40):y + 40, max(0, x - 40):x + 40]
    m = win > win.max() * 0.3
    cy, cx = (yy[m] * win[m]).sum() / win[m].sum(), (xx[m] * win[m]).sum() / win[m].sum()
    u, v = (cx + 0.5) / W, (cy + 0.5) / H
    elev = 90 - np.degrees(v * np.pi)
    peak = float(lum.max())
    # Sonnenfarbe: Mittel der Scheibe (normiert), Stärke über die Spitze (bedeckter Himmel: keine echte Sonne)
    disc = img[max(0, y - 6):y + 6, max(0, x - 6):x + 6].reshape(-1, 3)
    sc = disc.mean(0); sc = sc / max(1e-6, sc.max())
    # Himmel ohne Sonne: mittlere Farbe der oberen Halbkugel (gewichtet nach Raumwinkel)
    wy = np.cos((np.arange(H // 2) + 0.5) / H * np.pi - np.pi / 2)[:, None, None]
    skyMean = (np.minimum(img[:H // 2], 4.0) * wy).sum((0, 1)) / (wy.sum() * W)
    t = aces(img * 1.0)
    s = srgb(t)
    cut = int(H * (0.5 + 8 / 180))
    out = (np.clip(s[:cut], 0, 1) * 255 + 0.5).astype(np.uint8)
    im = Image.fromarray(out, 'RGB')
    dst = os.path.join(ROOT, 'assets', 'themes', theme)
    os.makedirs(dst, exist_ok=True)
    im.save(os.path.join(dst, 'sky.jpg'), quality=84, optimize=True, progressive=True)
    hz = s[int(H * 0.5) - int(H * 2 / 180):int(H * 0.5)].reshape(-1, 3).mean(0)
    info = {'u': float(u), 'v': float(v), 'elevation': float(elev), 'cutV': cut / H,
            'horizon': [float(c) for c in hz], 'peak': peak, 'sunColor': [float(c) for c in sc],
            'skyMean': [float(c) for c in skyMean], 'hdri': hdri}
    json.dump(info, open(os.path.join(dst, 'sky.json'), 'w'), indent=1)
    shutil.copyfile(os.path.join(SRC, hdri + '_1k.hdr'), os.path.join(dst, 'env.hdr'))
    print(theme, hdri, 'Sonne', round(float(elev), 1), '° Spitze', round(peak), 'Farbe', np.round(sc, 2), 'Horizont', np.round(hz, 3),
          'jpg', os.path.getsize(os.path.join(dst, 'sky.jpg')), flush=True)


for th in (sys.argv[1:] or SKIES.keys()):
    make(th, SKIES[th])
