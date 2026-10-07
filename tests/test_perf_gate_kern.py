# n30: reine Logik von tests/perf_gate.py ohne Browser/Server prüfen (Tabelle, Vergleich, Profil, Szenen-Datei).
# Aufruf: python3 tests/test_perf_gate_kern.py
import os, sys, json, tempfile, io, contextlib
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import perf_gate as G

bad = 0
def ok(c, m):
    global bad
    print(('OK   ' if c else 'FAIL ') + m)
    if not c: bad += 1

p = G.profil('hoch', 2.6); q = G.profil('quer', 2.6)
ok(p['viewport'] == {'width': 412, 'height': 915} and q['viewport'] == {'width': 915, 'height': 412} and p['device_scale_factor'] == 2.6 and p['is_mobile'], 'Profil Mittelklasse-Android: 412×915 hoch, 915×412 quer, DPR 2,6, mobil')
r = lambda p95, calls: {'p50': 10, 'p95': p95, 'fps': 60, 'calls': calls, 'callsMax': calls + 2, 'tris': 1000, 'tex': 30, 'fehler': []}
A = {'stand': 'vorher', 'szenen': {'menu': {'hoch': r(20, 80)}, 'loop': {'quer': r(30, 81)}}, 'ladegroesse': {'dateien': 90, 'roh_mb': 21, 'gzip_mb': 19.5, 'extern': [], 'groesste_gzip_kb': []}}
B = {'stand': 'nachher', 'szenen': {'menu': {'hoch': r(18, 85)}, 'loop': {'quer': r(33, 95)}}, 'ladegroesse': {'dateien': 92, 'roh_mb': 15, 'gzip_mb': 13.9, 'extern': [], 'groesste_gzip_kb': []}}
t = G.tabelle(B)
ok('| menu | hoch | 10 | 18 | 60 | 85 (87) |' in t and '13.9 MB gzip' in t, 'Tabelle mit p50/p95/fps/Draw-Calls und Ladegröße')
d = tempfile.mkdtemp()
fa, fb = os.path.join(d, 'a.json'), os.path.join(d, 'b.json')
json.dump(A, open(fa, 'w')); json.dump(B, open(fb, 'w'))
buf = io.StringIO()
with contextlib.redirect_stdout(buf): G.vergleich(fa, fb)
v = buf.getvalue()
ok('-10.0 %' in v and '+10.0 %' in v and '19.5 → 13.9' in v, 'Vergleich: Δ p95 je Szene und Ladegröße')
cfg = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'perf_szenen.json')))
namen = [s['name'] for s in cfg['szenen']]
ok(all(n in namen for n in ('menu_kino', 'looping_kino', 'looping_standard', 'cockpit_kino', 'replay_kino')), f'Stuntbahn-Szenen vollständig ({", ".join(namen)})')
ok(all(s['query'].startswith('?') and 'nosw' in s['query'] for s in cfg['szenen']), 'alle Szenen ohne Service-Worker (?nosw)')
ok('stuntbahn' not in open(G.__file__).read().lower().replace('stuntbahn-szenen', ''), 'Kern ohne Stuntbahn-Spezifika (nur die Szenen-Datei kennt das Spiel)')
print(f'{bad} FEHLER' if bad else 'alle perf_gate-Kern-Prüfungen OK')
sys.exit(1 if bad else 0)
