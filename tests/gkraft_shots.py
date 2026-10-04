# G-Kräfte + Show-Tacho (n24 Etappe 1): Fotos und Prüfung im Browser – Cockpit in der Kurve und nach der Landung,
# HUD (Verfolger) mit G-Zahl, Replay mit G-Einblendung (km/h), Kino-Replay mit Untertiteln „… · 6,2 G“.
# Prüft: Tacho-Zahl = Show-Tacho, G-Meter sichtbar und nicht unter Touch-Tasten/Knöpfen, Werte plausibel, 0 Fehler.
# Aufruf: python3 tests/gkraft_shots.py [quer|hoch|desktop] [Zusatz-URL, z. B. '&tacho=echt']  → tests/shots/gkraft/
import sys, time, json, math
sys.path.insert(0, 'tests')
from util import *

DEV = sys.argv[1] if len(sys.argv) > 1 else 'quer'
EXTRA = sys.argv[2] if len(sys.argv) > 2 else ''
PIXEL7_PORT = dict(PIXEL7_LAND, viewport={"width": 412, "height": 915})
DEVICES = {'quer': PIXEL7_LAND, 'hoch': PIXEL7_PORT, 'desktop': DESKTOP}
SEED = '?nosw&seed=4711&d=3' + EXTRA
SUB = 'gkraft'

FIND = """([cond, maxT]) => { const G = window.__game; const f = new Function('c', 'r', 'G', 'return ' + cond);
  for (let t = 0; t < maxT; t += 1 / 60) { G.sim(1 / 60); const r = G.race; if (r.state === 'finished') return -1; if (f(r.car, r, G)) return t; }
  return -2; }"""

def settle(s, wait=1.5):
    s.ev("__game.setTimeScale(0.0005)")
    time.sleep(wait)

BOXES = """() => [...document.querySelectorAll('#touch.show .tb, #replayui.show button, #hud.show button, #cine.show .cskip, #cine.show .cap.show, #hud.show .speed')]
  .filter(e => e.offsetParent !== null || getComputedStyle(e).position === 'fixed').map(e => { const b = e.getBoundingClientRect(); return [b.left, b.top, b.right, b.bottom, (e.textContent || e.className || '').trim().slice(0, 12)]; })
  .filter(b => b[2] > b[0] && b[3] > b[1])"""

out = []
def check(s, name, want_meter):
    r = s.ev("""() => { const G = window.__game, R = G.replayObj, c = G.race.car, live = G.mode !== 'replay';
      return { g: G.gState(), box: G.gmeterBox(), kmh: Math.abs(live ? c.fwdSpeed() : R.speed()) * 3.6,
        hud: document.querySelector('#hud .speed b').textContent, hudShown: getComputedStyle(document.querySelector('#hud .speed')).display !== 'none' && document.querySelector('#hud').classList.contains('show'),
        gf: document.querySelector('#hud .gf').textContent, cap: (document.querySelector('#cine .cap.show') || {}).textContent || '',
        speedDeg: G.cockpit.readout().speedDeg, view: G.rig.view, mode: G.mode }; }""")
    boxes = s.ev(BOXES)
    hits = []
    b = r['box']
    if b:
        cx, cy, R = (b[0] + b[2]) / 2, (b[1] + b[1] + (b[2] - b[0])) / 2, (b[2] - b[0]) / 2
        for (x0, y0, x1, y1, t) in boxes:
            nx, ny = max(x0, min(cx, x1)), max(y0, min(cy, y1))
            if math.hypot(nx - cx, ny - cy) < R - 1: hits.append(t)
            if r['mode'] == 'replay' and x0 < b[2] and x1 > b[0] and y0 < b[3] and y1 > b[1]: hits.append(t + '(km/h)')
    g = r['g'] or {}
    ok = not hits and all(math.isfinite(g.get(k, 0)) for k in ('g', 'lat', 'lon', 'peak')) and 0 <= g.get('g', 0) <= 10.01
    if want_meter: ok = ok and b is not None
    if r['hudShown'] and r['mode'] == 'race' and 'echt' not in EXTRA:
        ok = ok and abs(int(r['hud'] or 0) - show_kmh(r['kmh'])) <= 6   # HUD zeigt Show-Tacho (Auffrischung 20 Hz)
    res = dict(name=name, mode=r['mode'], view=r['view'], kmh=round(r['kmh'], 1), show=round(show_kmh(r['kmh'])), hud=r['hud'], gf=r['gf'],
               g=round(g.get('g', 0), 2), lat=round(g.get('lat', 0), 2), lon=round(g.get('lon', 0), 2), peak=round(g.get('peak', 0), 2),
               box=[round(x) for x in b] if b else None, cap=r['cap'], overlap=hits, ok=ok)
    out.append(res)
    print(json.dumps(res, ensure_ascii=False), flush=True)

with Server() as srv, sync_playwright() as pw:
    s = Session(pw, srv.base, device=DEVICES[DEV])
    s.open(SEED)
    shot = lambda n: s.shot(f'{DEV}_{n}', SUB)
    s.ev("__game.setAssist('medium')")
    s.ev("__game.start({autopilot:true})")
    s.ev("__game.cam('cockpit')")
    s.frames(3)
    # Cockpit: Kurve (Querbeschleunigung), dann nach der Landung eines Sprungs
    t = s.ev(FIND, ["c.onGround === 4 && c.speed() > 20 && Math.abs(G.gState().lat) > 1.8 && G.gState().g < 4", 70])
    if t >= 0: settle(s); shot('cockpit_kurve'); check(s, 'cockpit_kurve', True)
    s.ev("__game.setTimeScale(1)")
    t = s.ev(FIND, ["c.onGround === 0 && c.airTime > 0.8 && !c.surfaceKind", 150])
    if t >= 0:
        s.ev(FIND, ["c.onGround > 0", 5]); s.ev("__game.sim(0.12)")
        settle(s); shot('cockpit_landung'); check(s, 'cockpit_landung', True)
    s.ev("__game.setTimeScale(1)")
    # Verfolger: HUD mit G-Zahl neben dem Tempo
    s.ev("__game.cam('chase')")
    t = s.ev(FIND, ["c.onGround === 4 && c.speed() > 15 && Math.abs(G.gState().lat) > 1.5 && G.gState().g < 4", 60])
    if t >= 0: settle(s); shot('hud_kurve'); check(s, 'hud_kurve', False)
    s.ev("__game.setTimeScale(1)")
    # bis ins Ziel → Replay mit G-Einblendung an der stärksten Stelle und in einer Kurve
    st = s.ev("() => { for (let i = 0; i < 400 && window.__game.race.state !== 'finished'; i++) window.__game.sim(1); return window.__game.state(); }")
    print('ziel', st['state'], round(st['time'] or 0, 1))
    s.frames(3)
    s.ev("__game.replay()")
    s.frames(3)
    tg = s.ev("() => { const R = window.__game.replayObj, G = R.G; let m = 0, im = 0; for (let i = 0; i < G.F; i++) if (G.g[i] > m) { m = G.g[i]; im = i; } return im / 60; }")
    for name, tt in [('replay_spitze', tg + 0.05), ('replay_mitte', None)]:
        if tt is None: s.ev("() => { const R = window.__game.replayObj; R.t = R.duration * 0.45; }")
        else: s.ev(f"() => {{ window.__game.replayObj.t = {tt}; }}")
        settle(s, 1.2); shot(name); check(s, name, True)
    s.tap('#replayui [data-v=cockpit]'); s.frames(3)
    s.ev(f"() => {{ window.__game.replayObj.t = {tg + 0.05}; }}"); settle(s, 1.2); shot('replay_cockpit'); check(s, 'replay_cockpit', True)
    s.ev("__game.setTimeScale(1)")
    s.tap('#replayui [data-a=rend]'); s.frames(3)
    # Kino-Replay: Untertitel mit G
    ok = s.ev("__game.startCine()")
    s.frames(5)
    info = s.ev("__game.cineInfo()")
    labels = [c['label'] for c in info['clips']] if info else []
    print('film', labels)
    k = 0
    for ci, c in enumerate(info['clips'] if info else []):
        if ' G' not in c['label'] or k >= 2: continue
        s.ev("__game.setTimeScale(1)")
        s.ev(f"__game.cineSeek({ci}, {c['c0'] - 0.3})")
        s.frames(20)
        settle(s, 1.0); shot(f'cine_{k}'); check(s, f'cine_{k}', True); k += 1
    s.ev("__game.setTimeScale(1)")
    s.ev("__game.skipCine()")
    print('errors', s.errors[:10])
    bad = [o['name'] for o in out if not o['ok']]
    print('ERGEBNIS', DEV, f'{len(out) - len(bad)}/{len(out)} ok', bad, 'Film:', labels)
    os.makedirs(f'tests/shots/{SUB}', exist_ok=True)
    json.dump({'werte': out, 'film': labels}, open(f'tests/shots/{SUB}/{DEV}_werte.json', 'w'), ensure_ascii=False, indent=1)
    s.close()
    sys.exit(1 if bad or s.errors or len(out) < 6 else 0)
