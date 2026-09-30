# CPU-Last des Tons (n16): 20 s Rennen mit Autopilot im Headless-Chrome, CPU-Zeit aller Browser-Prozesse gemessen –
# Ton aus / bisheriger Synth (?snd=alt) / Aufnahmen, je 2 Durchgänge abwechselnd (nie zwei Browser gleichzeitig).
# Ton-Anteil = CPU(Ton an) − CPU(Ton aus). Außerdem Ladezeit bis der Klangvorrat bereit ist.
import sys, time, subprocess, json
sys.path.insert(0, 'tests')
from util import *

def cpu_s():
    out = subprocess.run(['ps', '-Ao', 'time=,command='], capture_output=True, text=True).stdout
    tot = 0.0
    for line in out.splitlines():
        if 'ms-playwright' not in line and 'Chromium' not in line and 'chrome-headless' not in line: continue
        t = line.split()[0]; parts = t.replace('-', ':').split(':')
        secs = 0.0
        for p in parts: secs = secs * 60 + float(p)
        tot += secs
    return tot

res = {}
with Server() as srv, sync_playwright() as pw:
    for rnd in range(3):
        for name, q, snd in [('aus', '?nosw&seed=1000&d=1', False), ('alt', '?nosw&snd=alt&seed=1000&d=1', True), ('neu', '?nosw&seed=1000&d=1', True)]:
            s = Session(pw, srv.base, device=DESKTOP)
            s.open(q)
            s.ev(f"__game.store.settings.sound = {'true' if snd else 'false'}")
            t0 = time.time()
            s.tap('button[data-a=start]')
            ready = None
            for i in range(100):
                if s.ev("!!(window.__soundRef && window.__soundRef.bank) || !__game.store.settings.sound"): ready = time.time() - t0; break
                time.sleep(0.05)
            s.ev("__game.toMenu(); __game.start({ autopilot: true })")
            time.sleep(1)
            c0 = cpu_s(); w0 = time.time()
            time.sleep(25)
            c = cpu_s() - c0; w = time.time() - w0
            st = s.ev("({ running: !!(window.__soundRef && window.__soundRef.running), state: __game.race.state, fps: __game.info().fps })")
            res.setdefault(name, []).append(c / w)
            print(f"{name:4s} Lauf {rnd + 1}: CPU {100 * c / w:5.1f} % eines Kerns  Ton läuft {st['running']}  fps {st['fps']:.0f}  Klangvorrat bereit nach {ready and round(ready, 2)} s", flush=True)
            s.close()
m = {k: sum(v) / len(v) for k, v in res.items()}
print(json.dumps({k: round(100 * v, 1) for k, v in m.items()}))
print(f"Ton-Anteil: bisher {100 * (m['alt'] - m['aus']):.1f} %, neu {100 * (m['neu'] - m['aus']):.1f} % eines Kerns")
