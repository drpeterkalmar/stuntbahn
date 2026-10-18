# n35: CPU-Profil (CDP, Drosselung ×4 wie das Mess-Gate) einer Rennszene – wofür geht die Zeit? Selbstzeit je Funktion.
# Aufruf: python3 tests/online_profil.py "&onlineprobe=3" [sek_warten] [sek_profil]
import sys, time, json, collections
sys.path.insert(0, 'tests')
from util import *
import util as U
U.ARGS = U.ARGS + ['--disable-gpu-vsync', '--disable-frame-rate-limit']   # ungedeckelt wie das Mess-Gate
ZUSATZ = sys.argv[1] if len(sys.argv) > 1 else ''
WARTE = float(sys.argv[2]) if len(sys.argv) > 2 else 25
PROF = float(sys.argv[3]) if len(sys.argv) > 3 else 8
with Server() as srv, sync_playwright() as pw:
    s = Session(pw, srv.base, device=PIXEL7_LAND, offen=True)
    s.open('?nosw&q=1&startprobe=0&seed=4711&d=3&g=1' + ZUSATZ)
    s.pg.wait_for_function("(() => { const v = __game.info().vao; return !v || v.fertig; })()", timeout=120000)
    cdp = s.ctx.new_cdp_session(s.pg)
    s.ev("__game.setAssist('medium'); __game.store.settings.fahrstil = 'sauber'"); s.ev("__game.start({ autopilot: true })"); s.ev("__game.cam('chase')")
    s.pg.wait_for_function("__game.race && __game.race.state === 'running'", timeout=30000)
    cdp.send('Emulation.setCPUThrottlingRate', {'rate': 4})
    time.sleep(WARTE)
    cdp.send('Profiler.enable'); cdp.send('Profiler.setSamplingInterval', {'interval': 200}); cdp.send('Profiler.start')
    f0 = s.ev("__app.frames"); time.sleep(PROF); f1 = s.ev("__app.frames")
    prof = cdp.send('Profiler.stop')['profile']
    s.close()
nodes = {n['id']: n for n in prof['nodes']}
dt = collections.Counter()
deltas = prof['timeDeltas']; samples = prof['samples']
for sid, d in zip(samples, deltas): dt[sid] += d
selbst = collections.Counter()
for nid, t in dt.items():
    cf = nodes[nid]['callFrame']; key = f"{cf['functionName'] or '(anon)'} {cf['url'].split('/')[-1]}:{cf['lineNumber'] + 1}"
    selbst[key] += t
ges = sum(selbst.values())
print(f'Bilder {f1 - f0} in {PROF} s ({(f1 - f0) / PROF:.0f}/s), Profil {ges / 1e3:.0f} ms')
for k, t in selbst.most_common(30): print(f'{t / 1e3:8.0f} ms {100 * t / ges:5.1f} %  {k}')
# Summe je Datei
proDatei = collections.Counter()
for k, t in selbst.items(): proDatei[k.split(' ')[-1].split(':')[0]] += t
json.dump({'selbst': dict(selbst), 'datei': dict(proDatei), 'bilder': f1 - f0}, open('tests/out/profil' + (ZUSATZ.replace('&', '_').replace('=', '') or '_solo') + '.json', 'w'))
print('--- je Datei'); [print(f'{t / 1e3:8.0f} ms {100 * t / ges:5.1f} %  {k}') for k, t in proDatei.most_common(18)]
