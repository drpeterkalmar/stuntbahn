# n31 TAAU: Bewertung der Bildfolgen aus tests/taau_folge.py im Bildinneren (ohne HUD-Ränder), Graustufen 0–255:
#   Abweichung = mittlere absolute Differenz zum Bezug; Schärfe = Kantenenergie (Gradienten²) relativ zum Bezug;
#   Flimmerfehler (mit PAAR=1) = mittlere Differenz zwischen der Bild-zu-Bild-Änderung der Variante und der des Bezugs.
# Aufruf: python3 tests/taau_wertung.py <tag> <bezug> <name> [<name> …]
import sys, glob, os, re
from PIL import Image; import numpy as np
D = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'tests', 'out', 'taau') + os.sep; tag, ref, vs = sys.argv[1], sys.argv[2], sys.argv[3:]
frs = sorted(int(m.group(1)) for p in glob.glob(f'{D}{tag}_{ref}_*.png') for m in [re.search(r'_(\d+)\.png$', p)] if m)
def L(n, f, b=''):
    a = np.asarray(Image.open(f'{D}{tag}_{n}_{f}{b}.png').convert('L')).astype(float); h, w = a.shape
    return a[int(h*.15):int(h*.82), int(w*.08):int(w*.92)]
def g(a): return (np.diff(a, axis=0)[:, :-1]**2 + np.diff(a, axis=1)[:-1, :]**2).mean()
for v in vs:
    m, s, fl = [], [], []
    for f in frs:
        a, b = L(ref, f), L(v, f); m.append(np.abs(a-b).mean()); s.append(g(b)/g(a))
        if os.path.exists(f'{D}{tag}_{v}_{f}b.png') and os.path.exists(f'{D}{tag}_{ref}_{f}b.png'):
            fl.append(np.abs((L(v, f, 'b') - b) - (L(ref, f, 'b') - a)).mean())   # zeitliche Änderung gegen die der Wahrheit
    print(f'{v:14s} Abweichung {np.mean(m):5.2f}  Schärfe {np.mean(s):4.2f}' + (f'  Flimmerfehler {np.mean(fl):4.2f}' if fl else '') + '  je Bild', ' '.join(f'{x:.1f}' for x in m))
