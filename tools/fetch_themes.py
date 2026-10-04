# Kulissen (n20): Quell-Assets der Landschafts-Themen nach assets_src/themes/ laden. Alle CC0:
#  - Himmel: Poly-Haven-HDRIs („Pure Sky“), 4k (Himmelsbild) + 1k (Umgebungslicht)
#  - Böden/Fels: ambientCG-Materialien 1K-JPG (Farbe, Normalen GL, Rauheit, AO)
#  - Pflanzen: Poly-Haven-Modelle (glTF 1k) → Karten (tools/make_theme_atlas.py)
#  - Kenney „Nature Kit“ (CC0, Zip): nur zum Vergleich geladen (--nur=kenney); die Low-Poly-Palmen/-Kakteen wirkten im
#    Kino-Look wie Spielzeug und sind NICHT im Spiel – Palmen sind eigene Karten (tools/make_palm_card.py)
# Die Lizenz wird an der Primärquelle geprüft und in assets_src/themes/quellen.json festgehalten:
#  Poly Haven: API /info/<id> (alle Assets CC0, Autoren), ambientCG: API-Feld „license“ = CC0, Kenney: License.txt im Zip.
# Aufruf: python3 tools/fetch_themes.py [--nur=hdri|tex|model|kenney]
import json, os, sys, time, urllib.request, zipfile, io

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'assets_src', 'themes')
os.makedirs(SRC, exist_ok=True)
UA = {'User-Agent': 'stuntbahn-asset-fetch'}
NUR = next((a.split('=', 1)[1] for a in sys.argv[1:] if a.startswith('--nur=')), None)

# Thema → Himmel (Poly Haven), Boden/Fels (ambientCG)
HDRIS = ['qwantani_afternoon_puresky', 'pizzo_pernice_puresky', 'kloofendal_38d_partly_cloudy_puresky', 'qwantani_late_afternoon_puresky',
         'autumn_field_puresky', 'snow_field_puresky']
TEXTURES = ['Ground097', 'Rock029', 'Grass004', 'Rock051', 'Grass001', 'ScatteredLeaves009', 'Snow010A', 'Rock058']
MODELS = ['quiver_tree_01', 'quiver_tree_02', 'wild_rooibos_bush', 'cheiridopsis_succulent', 'jacaranda_tree',
          'island_tree_02', 'island_tree_03', 'shrub_02', 'fir_sapling_medium', 'pachira_aquatica_01']
KENNEY = ('nature-kit', 'https://kenney.nl/media/pages/assets/nature-kit/37ac38a37b-1677698939/kenney_nature-kit.zip')


def fetch(url, tries=6, timeout=180):
    for i in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=timeout) as r:
                return r.read()
        except Exception as e:
            print('retry', i + 1, url, e, flush=True)
            time.sleep(2 * (i + 1))
    sys.exit('Download fehlgeschlagen: ' + url)


def get(url, dest, size=None):
    if os.path.exists(dest) and (size is None or os.path.getsize(dest) == size):
        return
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    b = fetch(url)
    if size is not None and len(b) != size:
        sys.exit('Größe falsch: ' + url)
    open(dest + '.part', 'wb').write(b)
    os.replace(dest + '.part', dest)
    print('ok', os.path.relpath(dest, SRC), len(b), flush=True)


def ph(path):
    return json.loads(fetch('https://api.polyhaven.com/' + path, timeout=60))


def check_cc0(page):
    # Lizenz an der Primärquelle (Asset-Seite) belegen: dort muss „CC0“ stehen, sonst Abbruch
    t = fetch(page, timeout=60).decode('utf8', 'ignore')
    if 'CC0' not in t:
        sys.exit('Keine CC0-Angabe auf ' + page)
    return page


qpath = os.path.join(SRC, 'quellen.json')
Q = json.load(open(qpath)) if os.path.exists(qpath) else {}

if NUR in (None, 'hdri'):
    for h in HDRIS:
        f = ph('files/' + h)['hdri']
        for res in ('4k', '1k'):
            e = f[res]['hdr']
            get(e['url'], os.path.join(SRC, 'hdri', f'{h}_{res}.hdr'), e.get('size'))
        info = ph('info/' + h); check_cc0('https://polyhaven.com/a/' + h)
        Q[h] = {'quelle': 'https://polyhaven.com/a/' + h, 'name': info.get('name'), 'autoren': list(info.get('authors', {}).keys()), 'lizenz': 'CC0', 'geprueft': time.strftime('%Y-%m-%d'), 'typ': 'hdri'}

if NUR in (None, 'tex'):
    for t in TEXTURES:
        d = json.loads(fetch(f'https://ambientcg.com/api/v2/full_json?type=Material&id={t}&include=downloadData,displayData', timeout=60))
        a = d['foundAssets'][0]
        check_cc0('https://ambientcg.com/a/' + t)   # Seite: „All assets are released under the Creative Commons CC0 license“
        dl = [x for x in a['downloadFolders']['default']['downloadFiletypeCategories']['zip']['downloads'] if x['attribute'] == '1K-JPG'][0]
        zp = os.path.join(SRC, 'tex', f'{t}_1K-JPG.zip')
        get(dl['downloadLink'], zp, dl.get('size'))
        with zipfile.ZipFile(zp) as z:
            for n in z.namelist():
                if n.lower().endswith('.jpg') and not os.path.exists(os.path.join(SRC, 'tex', t, n)):
                    z.extract(n, os.path.join(SRC, 'tex', t))
        Q[t] = {'quelle': 'https://ambientcg.com/view?id=' + t, 'name': a.get('displayName'), 'autoren': ['ambientCG (Lennart Demes)'], 'lizenz': 'CC0', 'geprueft': time.strftime('%Y-%m-%d'), 'typ': 'textur'}

if NUR in (None, 'model'):
    for m in MODELS:
        f = ph('files/' + m)['gltf']['1k']['gltf']
        d = os.path.join(SRC, 'models', m)
        get(f['url'], os.path.join(d, os.path.basename(f['url'])), f.get('size'))
        for rel, e in f.get('include', {}).items():
            get(e['url'], os.path.join(d, rel), e.get('size'))
        info = ph('info/' + m); check_cc0('https://polyhaven.com/a/' + m)
        Q[m] = {'quelle': 'https://polyhaven.com/a/' + m, 'name': info.get('name'), 'autoren': list(info.get('authors', {}).keys()), 'lizenz': 'CC0', 'geprueft': time.strftime('%Y-%m-%d'), 'typ': 'modell'}

if NUR == 'kenney':
    name, url = KENNEY
    zp = os.path.join(SRC, 'kenney', 'kenney_' + name + '.zip')
    get(url, zp)
    with zipfile.ZipFile(zp) as z:
        lic = z.read([n for n in z.namelist() if n.endswith('License.txt')][0]).decode('utf8', 'ignore')
        if 'Creative Commons Zero' not in lic and 'CC0' not in lic:
            sys.exit('Kenney: Lizenz nicht CC0')
        z.extractall(os.path.join(SRC, 'kenney', 'nk'))
    Q['kenney-' + name] = {'quelle': 'https://kenney.nl/assets/' + name, 'name': 'Nature Kit', 'autoren': ['Kenney (kenney.nl)'], 'lizenz': 'CC0', 'geprueft': time.strftime('%Y-%m-%d'), 'typ': 'modelle'}

json.dump(Q, open(qpath, 'w'), indent=1, ensure_ascii=False)
print('fertig', len(Q), 'Quellen')
