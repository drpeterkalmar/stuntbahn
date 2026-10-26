# Schreibt sw.js neu: Precache-Liste aller Spieldateien + Inhalts-Hash als Version (Cache-Busting).
# Nach jeder Änderung an Spieldateien ausführen: python3 tools/update_sw.py
import hashlib, os
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
files = ['index.html', 'manifest.webmanifest', 'css/style.css']
for d in ['src', 'lib', 'icons', 'assets']:
    for dp, dn, fn in os.walk(os.path.join(ROOT, d)):
        for f in sorted(fn):
            rel = os.path.relpath(os.path.join(dp, f), ROOT)
            # sammlung_stil.json: Stil-Modell nur für den Build, nicht fürs Spiel
            # n17: KTX2-Texturen + Basis-Transcoder; WebP mit KTX2-Zwilling nur als Rückfall (nicht vorab cachen)
            twin = f.endswith('.webp') and os.path.exists(os.path.join(dp, f[:-5] + '.ktx2'))
            # n20: Landschafts-Themen (assets/themes/) laden nur bei Bedarf – der Service-Worker legt sie beim ersten Abruf ab
            if rel.startswith(os.path.join('assets', 'themes') + os.sep): continue
            # n40: Standard wieder das 1k-Land-HDR; das 512er (n30-Diät) nur noch für ?hdr=512 (A/B) – nicht vorab cachen
            if rel == os.path.join('assets', 'hdr', 'sky_512.hdr'): continue
            # n30 Impostors: nur die Tannen (Land, Standard-Landschaft) vorab; die Themen-Bäume beim ersten Abruf
            if rel.startswith(os.path.join('assets', 'tex', 'imp') + os.sep) and not (f == 'impostor.json' or f.startswith('tanne')): continue
            if f.endswith(('.js', '.png', '.css', '.webp', '.jpg', '.json', '.glb', '.hdr', '.bin', '.m4a', '.ktx2', '.wasm')) and not f.startswith('.') and not twin and rel != os.path.join('assets', 'sammlung_stil.json'):
                files.append(rel)
files = sorted(set(files))
# n42: <link rel="modulepreload"> für alle statisch importierten Module ab src/main.js in index.html (Import-Map wie dort:
# 'three' → lib/three.module.min.js, 'three/addons/' → lib/addons/). Dynamische import(…) (Online) bleiben draußen.
import re
def _modul(dep, von):
    if dep == 'three': return 'lib/three.module.min.js'
    if dep.startswith('three/addons/'): return 'lib/addons/' + dep[len('three/addons/'):]
    if dep.startswith('.'): return os.path.normpath(os.path.join(os.path.dirname(von), dep)).replace(os.sep, '/')
    return None
_RX = re.compile(r'''(?:\bfrom\s*|\bimport\s*)["']([^"']+\.js|three)["']''')
def _ohne_kommentare(t): return re.sub(r'(?m)^\s*//.*$', '', t)
graph, todo = [], ['src/main.js']
while todo:
    f = todo.pop()
    if f in graph or not os.path.isfile(os.path.join(ROOT, f)): continue
    graph.append(f)
    for dep in _RX.findall(_ohne_kommentare(open(os.path.join(ROOT, f), encoding='utf-8').read())):
        m = _modul(dep, f)
        if m and m not in graph: todo.append(m)
graph = sorted(graph, key=lambda x: (not x.startswith('lib/three'), x))
ix = os.path.join(ROOT, 'index.html'); html = open(ix, encoding='utf-8').read()
a, b = '<!-- n42-modulepreload', '<!-- /n42-modulepreload -->'
if a in html and b in html:
    i = html.index(a); i = html.index('-->', i) + 3; j = html.index(b)
    html = html[:i] + '\n' + ''.join(f'<link rel="modulepreload" href="{g}">\n' for g in graph) + html[j:]
    open(ix, 'w', encoding='utf-8').write(html)
    print('modulepreload', len(graph), 'Module')
# Inhalts-Hash auch über die Themen-Pakete (nicht vorab gecacht, aber eine Änderung muss die Version wechseln)
hashed = list(files)
for dp, dn, fn in os.walk(os.path.join(ROOT, 'assets', 'themes')):
    for f in sorted(fn):
        if not f.startswith('.'): hashed.append(os.path.relpath(os.path.join(dp, f), ROOT))
# n35: vendor/ (Trystero, nur für Online geladen) ebenfalls nicht vorab, aber in den Hash – sonst bliebe nach einem
# Bibliotheks-Update die alte Fassung im Cache der laufenden Version
for d in ['vendor']:
    for dp, dn, fn in os.walk(os.path.join(ROOT, d)):
        for f in sorted(fn):
            if not f.startswith('.'): hashed.append(os.path.relpath(os.path.join(dp, f), ROOT))
hashed = sorted(set(hashed))
h = hashlib.sha256()
for f in hashed:
    if f == 'src/build.js': continue  # enthält selbst die Version
    h.update(f.encode()); h.update(open(os.path.join(ROOT, f), 'rb').read())
ver = h.hexdigest()[:10]
tpl = open(os.path.join(ROOT, 'tools', 'sw.template.js')).read()
out = tpl.replace('__VERSION__', ver).replace('__ASSETS__', ',\n  '.join("'" + f + "'" for f in files))
open(os.path.join(ROOT, 'sw.js'), 'w').write(out)
open(os.path.join(ROOT, 'src', 'build.js'), 'w').write(f"export const BUILD = '{ver}';\n")
size = sum(os.path.getsize(os.path.join(ROOT, f)) for f in files)
print('sw.js Version', ver, len(files), 'Dateien', round(size / 1e6, 2), 'MB')
