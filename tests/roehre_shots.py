# n29 Röhre mit Hindernis: Fotos aus Verfolger-, Cockpit- und Stoßstangen-Kamera vor dem Buckel und in der Luft über dem
# Buckel, quer + hoch (Galerie, Original-Physik mit Autopilot, 150 km/h am Buckel), dazu A/B ?roehre=glatt (vor dem Buckel)
# und Draw-Calls/Dreiecke im Bild (renderer.info) mit und ohne Buckel. 0 pageerrors.
# Aufruf: python3 tests/roehre_shots.py   → tests/shots/roehre/<modus>_<moment>_<kamera>.png + werte.json
import sys, os, time, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from util import *
from hochformat_util import DEVICES

SUB = 'roehre'
FIND = """(back) => { const g = __game, T = g.env.track, L = T.line, h = T.humps[0];
  if (!h) return null;
  let j = h.idx0, acc = 0;
  while (acc < back) { const q = j > 0 ? j - 1 : L.n - 2; acc += Math.hypot(L.px[j] - L.px[q], L.pz[j] - L.pz[q]); j = q; }
  return { j, i0: h.idx0, ic: h.idxC, i1: h.idx1 }; }"""
COND = {
    'vor': "L.tube[i] && L.s[o.i0] - L.s[i] < 24 && L.s[o.i0] - L.s[i] > 14",
    'luft': "c.onGround === 0 && i > o.ic && c.airTime > 0.18",
}
CHECK = """(o) => { const g = __game, r = g.race, c = r.car, L = g.env.track.line, i = r.tracker.idx;
  return { hit: %s, past: i > o.i1 + 120 && i < o.i1 + 2000, crash: !!c.crash, v: c.speed() * 3.6, air: c.onGround === 0, y: c.pos.y - L.py[i] }; }"""
INFO = """() => { const R = __game.renderer; R.info.autoReset = false; R.info.reset(); __game.renderNow ? __game.renderNow() : null;
  return null; }"""
out = {'shots': [], 'info': {}, 'errors': []}
with Server(ROOT) as srv, sync_playwright() as pw:
    for mode in ['quer', 'hoch']:
        dev = DEVICES['pixel7q' if mode == 'quer' else 'pixel7']['ctx']
        for variant in ['', 'glatt']:
            if variant and mode == 'hoch': continue
            s = Session(pw, srv.base, device=dev)
            s.open('?nosw&q=2&gallery' + ('&roehre=glatt' if variant else ''))
            s.ev("__game.setAssist('original'); __game.setLine && __game.setLine('off')")
            s.ev("__game.start({autopilot: true})"); s.ev("__game.sim(3.6)")
            moments = ['vor', 'luft'] if not variant else ['vor']
            cams = ['chase', 'cockpit', 'bumper'] if not variant else ['chase', 'cockpit']
            for mom in moments:
                for cam in cams:
                    o = s.ev(FIND, 70)
                    if not o and variant:   # glatte Röhre: kein Buckel – Stelle aus der Röhren-Mitte
                        o = s.ev("""() => { const g = __game, T = g.env.track, L = T.line, k = T.pieces.findIndex((p) => p.type === 'tube'), P = T.pieces[k];
                          const m = (P.lineStart + P.lineEnd) >> 1; let i0 = m; while (L.s[m] - L.s[i0] < 8) i0--; let j = i0; while (L.s[i0] - L.s[j] < 70) j--; return { j, i0, ic: m, i1: m + 10 }; }""")
                    hit = None
                    for tries in range(3):
                        c0 = s.ev("__game.state().crashes")
                        s.ev(f"__game.teleport({o['j']}, {150 / 3.6}); __game.race.stuckProg = -1e9")
                        s.ev(f"__game.cam('{cam}')"); s.ev("__game.setTimeScale(0.25)")
                        t0 = time.time()
                        while time.time() - t0 < 40:
                            st = s.ev(CHECK % COND[mom], o)
                            if st['hit'] and s.ev("__game.state().crashes") == c0: hit = st; break
                            if st['past'] or st['crash']: break
                            time.sleep(0.015)
                        if hit: break
                        s.ev("__game.setTimeScale(1)")
                    s.ev("__game.freeze(true)")
                    s.frames(6); time.sleep(0.4)
                    name = f"{mode}_{mom}_{cam}{'_glatt' if variant else ''}"
                    s.shot(name, SUB)
                    # Draw-Calls/Dreiecke dieses Bildes (Verfolger vor dem Buckel: Röhre im Bild)
                    if mom == 'vor' and cam == 'chase':
                        info = s.ev("() => { const R = __game.renderer; const a = R.info.autoReset; R.info.autoReset = false; R.info.reset(); return new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(() => { const x = { calls: R.info.render.calls, tris: R.info.render.triangles }; R.info.autoReset = a; res(x); }))); }")
                        out['info'][mode + ('_glatt' if variant else '')] = info
                    s.ev("__game.freeze(false); __game.setTimeScale(1)")
                    rec = {'name': name, 'hit': bool(hit), **({k: hit[k] for k in ['v', 'air', 'y']} if hit else {})}
                    print(json.dumps(rec), flush=True)
                    out['shots'].append(rec)
            out['errors'] += s.errors
            s.close()
print('info', out['info'])
print('Fehler', out['errors'][:6])
json.dump(out, open(os.path.join(ROOT, 'tests', 'shots', SUB, 'werte.json'), 'w'), indent=1)
