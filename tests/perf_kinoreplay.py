# Kino-Replay (n18): Bildrate Film gegen Rennen, abwechselnd gemessen (headless GPU schwankt stark – daher mehrere
# Runden und Mittelwerte). Rennen: 15 s Autopilot in Echtzeit; Film: ganzer Film. Dazu Grafik-Stufe/Renderskala.
# Aufruf: python3 tests/perf_kinoreplay.py [runden=2] [zusatz-url, z. B. &kl=-dof] [quer|hoch]
import sys, time, json
sys.path.insert(0, 'tests')
from util import *

N = int(sys.argv[1]) if len(sys.argv) > 1 else 2
EXTRA = sys.argv[2] if len(sys.argv) > 2 else ''
ART = sys.argv[3] if len(sys.argv) > 3 else 'quer'
DEV = PIXEL7_LAND if ART == 'quer' else dict(PIXEL7_LAND, viewport={"width": 412, "height": 915})
MEASURE = """(sec) => new Promise((res) => { const t = []; let last = performance.now(); const t0 = last;
  const f = (now) => { t.push(now - last); last = now; if (now - t0 < sec * 1000) requestAnimationFrame(f); else { t.shift(); t.sort((a, b) => a - b);
    const i = __game.info(); res({ fps: 1000 * t.length / t.reduce((a, b) => a + b, 0), p95: t[Math.floor(t.length * 0.95)], n: t.length, tier: __game.quality.tier, scale: __game.kino ? __game.kino.renderScale : 1, calls: i.calls, tris: i.tris }); } };
  requestAnimationFrame(f); })"""

with Server() as srv, sync_playwright() as pw:
    s = Session(pw, srv.base, device=DEV, kino=True)
    s.open('?nosw&seed=1234&d=3&g=1&q=2' + EXTRA)
    s.ev("__game.setAssist('medium')")
    rows = []
    for r in range(N):
        s.ev("__game.start({autopilot:true})"); time.sleep(2.0)
        race = s.ev("(" + MEASURE + ")(15)")
        for k in range(120):
            if s.ev("__game.sim(2.0)")['state'] == 'finished': break
        s.frames(2)
        film = s.ev("(" + MEASURE + ")(Math.max(5, __app.cine.duration - 1.5))")
        s.ev("__game.skipCine()")
        rows.append({'rennen': race, 'film': film})
        print(r, json.dumps(rows[-1]), flush=True)
    fr = sum(x['rennen']['fps'] for x in rows) / N; ff = sum(x['film']['fps'] for x in rows) / N
    print(json.dumps({'fps_rennen': round(fr, 1), 'fps_film': round(ff, 1), 'verhaeltnis': round(ff / fr, 3), 'fehler': s.errors[:5]}))
    ok = ff >= fr * 0.95 and not s.errors
    s.close()
print('ERGEBNIS', 'grün' if ok else 'ROT')
sys.exit(0 if ok else 1)
