# Bewegungsunschärfe (28.09.2026): wirkt im Rennen ab ~80 km/h, nicht in Menü, Pause, Replay-Standbild oder bei
# Grafik „Sparsam“; Einstellung Aus/Leicht/Stark; Auto bleibt scharf (Pixelvergleich im Auto-Bereich);
# 0 Seitenfehler. Fotos nach tests/shots/blur/.
# Aufruf: python3 tests/test_blur.py
import os, sys, time, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from util import Server, Session, PIXEL7_LAND, DESKTOP, ROOT
from playwright.sync_api import sync_playwright

OUT = os.path.join(ROOT, 'tests', 'shots', 'blur')
os.makedirs(OUT, exist_ok=True)
fails = []
def check(c, m):
    print(('OK   ' if c else 'FAIL ') + m, flush=True)
    if not c: fails.append(m)
def shot(s, n): s.pg.screenshot(path=os.path.join(OUT, n + '.jpg'), type='jpeg', quality=85)

FAST = """() => { const G = window.__game, L = G.env.track.line, P = G.env.prof, V = P.vf || P.vt; let b = 0, bi = 0;
  const jz = new Uint8Array(L.n); for (const j of G.env.track.jumps || []) for (let i = 0; i < L.n; i++) if (L.s[i] > L.s[j.lipIdx] - 260 && L.s[i] < L.s[j.landIdx] + 60) jz[i] = 1;
  for (let i = 0; i < L.n; i++) if (!jz[i] && !L.loop[i] && !L.tube[i] && V[i] > b) { b = V[i]; bi = i; }
  let j = bi; while (j > 0 && L.s[bi] - L.s[j] < b * 1.3) j--; return [j, V[j]]; }"""
POST = "() => { const p = __game.post; return { active: p.active, k: p.k, frames: p.stats.frames, last: p.stats.last, tier: p.tier, setting: p.setting, auto: p.autoOff, sup: p.supported }; }"

def run(dev, dname, q):
    s = Session(pw, srv.base, device=dev)
    s.open('?nosw&trk=demo-rundkurs' + q)
    s.frames(10)
    p = s.ev(POST); check(not p['active'] and p['frames'] == 0, f'{dname}: Menü ohne Unschärfe {p}')
    check(p['sup'], f'{dname}: WebGL2 vorhanden')
    s.ev("__game.setAssist('easy')"); s.ev("__game.start({ autopilot: true })"); s.ev("__game.cam('chase')")
    s.ev("__game.sim(3.2)")
    i, v = s.ev(FAST)
    s.ev(f"__game.teleport({i}, {v})"); time.sleep(1.3)
    p = s.ev(POST); kmh = s.ev("__game.state().speed") * 3.6
    check(p['active'] and p['frames'] > 5, f'{dname}: im Rennen bei {kmh:.0f} km/h aktiv {p}')
    shot(s, f'{dname}_tempo_{p["setting"]}')
    # Pause → aus
    s.ev("__game.freeze(true)"); s.frames(3); p = s.ev(POST)
    check(not p['active'], f'{dname}: Pause ohne Unschärfe')
    s.ev("__game.freeze(false)")
    # Stark
    s.ev("__game.store.settings.blur = 'strong'"); s.ev(f"__game.teleport({i}, {v})"); time.sleep(1.3)
    p = s.ev(POST); check(p['active'] and p['setting'] == 'strong', f'{dname}: Stark aktiv {p} {s.state()}')
    shot(s, f'{dname}_tempo_strong')
    s.ev(f"__game.teleport({i}, {v})"); time.sleep(0.4); s.ev("__game.nitro()"); time.sleep(0.9); shot(s, f'{dname}_nitro_strong')
    p = s.ev(POST); check(p['active'] and p['k'] > 1, f'{dname}: Nitro verstärkt (k={p["k"]:.2f})')
    s.ev("__game.store.settings.blur = 'off'"); s.frames(4); p = s.ev(POST)
    check(not p['active'], f'{dname}: Einstellung Aus wirkt')
    s.ev("__game.store.settings.blur = 'light'")
    # Replay: läuft → an, Standbild → aus
    s.ev("__game.sim(2)"); s.ev("__game.replay()")
    s.ev("() => { const r = __game.replayObj; r.t = Math.max(0, r.duration - 1.6); }")
    time.sleep(1.5); p1 = s.ev(POST)
    s.ev("() => { __game.replayObj.paused = true; }"); s.frames(4); p2 = s.ev(POST)
    check(not p2['active'], f'{dname}: Replay-Standbild ohne Unschärfe (läuft: {p1["active"]}, k={p1["k"]:.2f})')
    check(not s.errors, f'{dname}: 0 Fehler {s.errors[:3]}')
    s.close()

with Server() as srv, sync_playwright() as pw:
    run(PIXEL7_LAND, 'quer', '&q=1')
    run(DESKTOP, 'desktop', '&q=2')
    # Grafik „Sparsam“: keine Unschärfe
    s = Session(pw, srv.base, device=PIXEL7_LAND)
    s.open('?nosw&seed=4711&d=3&q=0')
    s.ev("__game.start({ autopilot: true })"); s.ev("__game.sim(3.2)")
    i, v = s.ev(FAST); s.ev(f"__game.teleport({i}, {v})"); time.sleep(1.2)
    p = s.ev(POST); check(not p['active'] and p['frames'] == 0, f'Stufe 0: keine Unschärfe {p}')
    check(not s.errors, f'Stufe 0: 0 Fehler {s.errors[:3]}')
    s.close()
print('FEHLGESCHLAGEN:' if fails else 'ALLE OK', fails)
sys.exit(1 if fails else 0)
