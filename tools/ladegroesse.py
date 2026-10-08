# Deko (n28): Ladegröße gzip – alle Dateien der Precache-Liste aus sw.js (Erstladung/offline) und die Themen-Pakete
# (laden nur bei Bedarf), je roh und gzip-komprimiert (Stufe 6 wie üblich bei GitHub Pages).
# Aufruf: python3 tools/ladegroesse.py [Wurzel] → JSON
import gzip, json, os, re, sys
root = os.path.abspath(sys.argv[1]) if len(sys.argv) > 1 else os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sw = open(os.path.join(root, 'sw.js')).read()
files = [f for f in re.findall(r"'([^']+)'", sw.split('const ASSETS = [')[1].split('];')[0]) if f != './'] + ['index.html']
def size(rel):
    b = open(os.path.join(root, rel), 'rb').read()
    return len(b), len(gzip.compress(b, 6))
pre = [size(f) for f in sorted(set(files)) if os.path.exists(os.path.join(root, f))]
th = []
for dp, dn, fn in os.walk(os.path.join(root, 'assets', 'themes')):
    for f in fn:
        # n30: das alte 1k-HDR liegt nur noch für ?hdr=1k (A/B) im Repo, geladen wird env_512.hdr
        if f == 'env.hdr' and os.path.exists(os.path.join(dp, 'env_512.hdr')): continue
        th.append(size(os.path.relpath(os.path.join(dp, f), root)))
# n30: Impostor-Atlanten der Themen-Bäume (nicht vorab gecacht, laden mit der Landschaft)
imp = os.path.join(root, 'assets', 'tex', 'imp')
if os.path.isdir(imp):
    for f in os.listdir(imp):
        rel = os.path.join('assets', 'tex', 'imp', f)
        if f.endswith('.webp') and rel not in files: th.append(size(rel))
code = [size(f) for f in sorted(set(files)) if f.startswith(('src/', 'css/', 'index.html')) and os.path.exists(os.path.join(root, f))]
mb = lambda xs, i: round(sum(x[i] for x in xs) / 1e6, 3)
print(json.dumps({'wurzel': root, 'erstladung_mb': mb(pre, 0), 'erstladung_gzip_mb': mb(pre, 1), 'code_gzip_mb': mb(code, 1),
                  'themen_mb': mb(th, 0), 'themen_gzip_mb': mb(th, 1), 'dateien': len(pre)}, ensure_ascii=False))
