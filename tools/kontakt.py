# Kontaktbogen: Bilder eines Ordners (Muster) verkleinert im Raster mit Dateinamen – für die Sichtprüfung
import sys, glob, os
from PIL import Image, ImageDraw
pat, out = sys.argv[1], sys.argv[2]
cols = int(sys.argv[3]) if len(sys.argv) > 3 else 3
w = int(sys.argv[4]) if len(sys.argv) > 4 else 640
files = sorted(glob.glob(pat))
ims = []
for f in files:
    im = Image.open(f).convert('RGB'); h = int(im.height * w / im.width); ims.append((os.path.basename(f), im.resize((w, h))))
H = max(i.height for _, i in ims) + 22
rows = (len(ims) + cols - 1) // cols
sheet = Image.new('RGB', (cols * w, rows * H), (20, 20, 20))
d = ImageDraw.Draw(sheet)
for k, (n, im) in enumerate(ims):
    x, y = (k % cols) * w, (k // cols) * H
    sheet.paste(im, (x, y + 22)); d.text((x + 4, y + 4), n, fill=(255, 255, 0))
sheet.save(out, quality=82)
print(out, len(ims))
