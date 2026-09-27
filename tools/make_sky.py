# 4k-HDR (Poly Haven, CC0) -> Himmel-Hintergrund als JPG (obere Halbkugel + 8° unter Horizont)
# und Sonnenrichtung (hellster Bereich) nach assets/sky/sky.json.
import numpy as np, json, os, re, sys
from PIL import Image
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
src = os.path.join(ROOT, 'assets_src', 'kloofendal_48d_partly_cloudy_puresky_4k.hdr')

def read_hdr(path):
    data = open(path, 'rb').read()
    i = 0; header = []
    while True:
        j = data.index(b'\n', i); line = data[i:j].decode('ascii', 'ignore'); i = j + 1
        if line == '': break
        header.append(line)
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

img = read_hdr(src)
H, W, _ = img.shape
lum = img @ np.array([0.2126, 0.7152, 0.0722], np.float32)
y, x = np.unravel_index(np.argmax(lum), lum.shape)
# Schwerpunkt der Sonnenscheibe
win = lum[max(0, y - 40):y + 40, max(0, x - 40):x + 40]
yy, xx = np.mgrid[max(0, y - 40):y + 40, max(0, x - 40):x + 40]
m = win > win.max() * 0.3
cy, cx = (yy[m] * win[m]).sum() / win[m].sum(), (xx[m] * win[m]).sum() / win[m].sum()
u, v = (cx + 0.5) / W, (cy + 0.5) / H
phi = u * 2 * np.pi; theta = v * np.pi   # three.js-Equirect: u=0.5 -> -Z?
elev = 90 - np.degrees(theta)
print('Sonne px', x, y, 'u,v', round(u, 4), round(v, 4), 'Höhe', round(float(elev), 1), 'Grad, Peak', float(lum.max()))
# Tonemapping (ACES-Näherung) mit Belichtung wie im Spiel
exp = 1.0
c = img * exp
a, b, cc, d, e = 2.51, 0.03, 2.43, 0.59, 0.14
t = np.clip((c * (a * c + b)) / (c * (cc * c + d) + e), 0, 1)
srgb = np.where(t <= 0.0031308, 12.92 * t, 1.055 * np.power(t, 1 / 2.4) - 0.055)
cut = int(H * (0.5 + 8 / 180))   # bis 8° unter den Horizont
out = (np.clip(srgb[:cut], 0, 1) * 255 + 0.5).astype(np.uint8)
im = Image.fromarray(out, 'RGB')
os.makedirs(os.path.join(ROOT, 'assets', 'sky'), exist_ok=True)
im.save(os.path.join(ROOT, 'assets', 'sky', 'sky.jpg'), quality=84, optimize=True, progressive=True)
# Horizontfarbe (für Nebel) = Mittel der Zeile knapp über dem Horizont
hz = srgb[int(H * 0.5) - int(H * 2 / 180):int(H * 0.5)].reshape(-1, 3).mean(0)
json.dump({'u': float(u), 'v': float(v), 'elevation': float(elev), 'cutV': cut / H,
           'horizon': [float(hz[0]), float(hz[1]), float(hz[2])]},
          open(os.path.join(ROOT, 'assets', 'sky', 'sky.json'), 'w'), indent=1)
print('sky.jpg', im.size, os.path.getsize(os.path.join(ROOT, 'assets', 'sky', 'sky.jpg')), 'Horizont', hz)
