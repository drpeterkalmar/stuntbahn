# Versionsnummer beim Zusammenführen setzen (claude_job.py zusammenfuehren --vorher): package.json, „## __VERSION__“ im
# CHANGELOG, Service-Worker/Build-Hash (tools/update_sw.py), Commit. Wunsch-Version wird genommen, wenn sie größer ist als die
# aktuelle; sonst die nächste Neben-Version (ein anderer Job war schneller).
# Aufruf: python3 tools/version_setzen.py 0.13.0 "Tier-Zuschauer (n40)"
import json, os, re, subprocess, sys
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
want, titel = sys.argv[1], (sys.argv[2] if len(sys.argv) > 2 else '')
pj = os.path.join(ROOT, 'package.json'); txt = open(pj).read()
cur = json.loads(txt)['version']
t = lambda v: tuple(int(x) for x in v.split('.'))
ver = want if t(want) > t(cur) else f'{t(cur)[0]}.{t(cur)[1] + 1}.0'
open(pj, 'w').write(txt.replace(f'"version": "{cur}"', f'"version": "{ver}"', 1))
cl = os.path.join(ROOT, 'CHANGELOG.md'); c = open(cl).read()
if '## __VERSION__' not in c: sys.exit('CHANGELOG ohne „## __VERSION__“')
open(cl, 'w').write(c.replace('## __VERSION__', f'## {ver}', 1))
subprocess.run([sys.executable, os.path.join(ROOT, 'tools', 'update_sw.py')], check=True, cwd=ROOT)
subprocess.run(['git', 'add', 'package.json', 'CHANGELOG.md', 'sw.js', 'src/build.js', 'index.html'], check=True, cwd=ROOT)   # n42: index.html (Modul-Vorladeliste)
subprocess.run(['git', 'commit', '-qm', f'{ver}: {titel} – Version, CHANGELOG, Service-Worker\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>'], check=True, cwd=ROOT)
print('Version', cur, '→', ver)
