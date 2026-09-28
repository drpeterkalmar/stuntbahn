# Optik (28.09.2026): Fremd-Assets für die detailliertere Umgebung (alle Poly Haven, CC0) nach assets_src/deco/.
# Modelle als glTF 1k (Laubbäume, Büsche, Gras, Blumen, Felsen), Kies-Textur 1k. Mit Wiederholung bei Abbrüchen
# (VPN/TLS). Danach: python3 tools/make_impostors.py (Karten aus den Modellen) und node tools/build_deco.mjs.
# Aufruf: python3 tools/fetch_deco.py
import json, os, sys, time, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'assets_src', 'deco')
os.makedirs(SRC, exist_ok=True)
MODELS = ['tree_small_02', 'island_tree_01', 'celandine_01', 'searsia_lucida', 'grass_medium_01', 'dandelion_01', 'rock_moss_set_01']
TEXTURES = {'gravel_floor_02': ['Diffuse', 'nor_gl']}
UA = {'User-Agent': 'stuntbahn-asset-fetch'}

def get(url, dest, size=None, tries=6):
    if os.path.exists(dest) and (size is None or os.path.getsize(dest) == size):
        return
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    for i in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=120) as r, open(dest + '.part', 'wb') as f:
                while True:
                    b = r.read(1 << 16)
                    if not b: break
                    f.write(b)
            if size is not None and os.path.getsize(dest + '.part') != size:
                raise IOError('Größe falsch')
            os.replace(dest + '.part', dest)
            print('ok', os.path.relpath(dest, SRC), os.path.getsize(dest), flush=True)
            return
        except Exception as e:
            print('retry', i + 1, url, e, flush=True)
            time.sleep(2 * (i + 1))
    sys.exit('Download fehlgeschlagen: ' + url)

def files(asset):
    for i in range(6):
        try:
            with urllib.request.urlopen(urllib.request.Request('https://api.polyhaven.com/files/' + asset, headers=UA), timeout=60) as r:
                return json.load(r)
        except Exception as e:
            print('retry api', asset, e, flush=True); time.sleep(2 * (i + 1))
    sys.exit('API fehlgeschlagen: ' + asset)

meta = {}
for m in MODELS:
    f = files(m)['gltf']['1k']['gltf']
    d = os.path.join(SRC, m)
    get(f['url'], os.path.join(d, os.path.basename(f['url'])), f.get('size'))
    for rel, e in f.get('include', {}).items():
        get(e['url'], os.path.join(d, rel), e.get('size'))
    meta[m] = 'https://polyhaven.com/a/' + m
for t, maps in TEXTURES.items():
    f = files(t)
    for mp in maps:
        e = f[mp]['1k']['jpg']
        get(e['url'], os.path.join(SRC, f'{t}_{mp}_1k.jpg'), e['size'])
    meta[t] = 'https://polyhaven.com/a/' + t
json.dump(meta, open(os.path.join(SRC, 'quellen.json'), 'w'), indent=1)
print('fertig', len(meta), 'Assets')
