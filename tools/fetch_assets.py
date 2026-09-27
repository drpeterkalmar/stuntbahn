# Lädt alle Fremd-Assets (Poly Haven CC0) reproduzierbar nach assets_src/ (nicht im Repo).
# Aufruf: python3 tools/fetch_assets.py   — danach: node tools/build_assets.mjs
# Das Auto (Sketchfab, CC-BY) wird separat mit Token geladen (tools/fetch_car.sh).
import json, os, sys, time, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'assets_src')
os.makedirs(SRC, exist_ok=True)

TEXTURES = {  # Poly-Haven-ID: benötigte Karten
    'asphalt_02': ['Diffuse', 'nor_gl', 'arm'],
    'leafy_grass': ['Diffuse', 'nor_gl', 'arm'],
    'gravel_concrete_03': ['Diffuse', 'nor_gl', 'arm'],
    'concrete_floor_02': ['Diffuse', 'nor_gl', 'arm'],
    'metal_plate': ['Diffuse', 'nor_gl', 'arm'],
}
TREE = ('fir_tree_01', ['twig_diff', 'twig_alpha', 'twig_nor_gl', 'bark_diff', 'bark_nor_gl'])
HDRI = ('kloofendal_48d_partly_cloudy_puresky', ['1k', '4k'])

def get(url, dest, size=None, tries=5):
    if os.path.exists(dest) and (size is None or os.path.getsize(dest) == size):
        return
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers={'User-Agent': 'stuntbahn-asset-fetch'})
            with urllib.request.urlopen(req, timeout=120) as r, open(dest + '.part', 'wb') as f:
                while True:
                    b = r.read(1 << 16)
                    if not b: break
                    f.write(b)
            if size is not None and os.path.getsize(dest + '.part') != size:
                raise IOError('Größe falsch')
            os.replace(dest + '.part', dest)
            print('ok', os.path.basename(dest), os.path.getsize(dest))
            return
        except Exception as e:
            print('retry', i + 1, url, e)
            time.sleep(2 * (i + 1))
    sys.exit('Download fehlgeschlagen: ' + url)

def files(asset):
    for i in range(5):
        try:
            req = urllib.request.Request('https://api.polyhaven.com/files/' + asset, headers={'User-Agent': 'stuntbahn-asset-fetch'})
            with urllib.request.urlopen(req, timeout=60) as r:
                return json.load(r)
        except Exception as e:
            print('retry api', asset, e); time.sleep(2 * (i + 1))
    sys.exit('API fehlgeschlagen: ' + asset)

meta = {}
for asset, maps in TEXTURES.items():
    f = files(asset)
    for m in maps:
        e = f[m]['1k']['jpg']
        get(e['url'], os.path.join(SRC, f'{asset}_{m}_1k.jpg'), e['size'])
    meta[asset] = 'https://polyhaven.com/a/' + asset
tid, maps = TREE
f = files(tid)
for m in maps:
    fmt = 'png' if 'alpha' in m else 'jpg'
    e = f[m]['1k'][fmt]
    get(e['url'], os.path.join(SRC, f'{tid}_{m}_1k.{fmt}'), e['size'])
meta[tid] = 'https://polyhaven.com/a/' + tid
hid, ress = HDRI
f = files(hid)
for res in ress:
    e = f['hdri'][res]['hdr']
    get(e['url'], os.path.join(SRC, f'{hid}_{res}.hdr'), e['size'])
meta[hid] = 'https://polyhaven.com/a/' + hid
json.dump(meta, open(os.path.join(SRC, 'sources.json'), 'w'), indent=1)
print('fertig')
