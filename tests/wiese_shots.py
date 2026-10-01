# Wiese = Wiese (n21): Fotos vom Auto auf der Wiese mit Tacho (quer + hoch, Verfolger): kurz nach dem Abkommen mit
# ~200 km/h (Grasbüschel, Tempo fällt) und danach mit Vollgas auf der Wiese (≤ 30 km/h). Prüft Tempo und 0 Fehler.
# Aufruf: python3 tests/wiese_shots.py [quer|hoch] [--alt]   → tests/shots/wiese/
import sys, time, json
sys.path.insert(0, 'tests')
from util import *
from hochformat_util import DEVICES

mode = sys.argv[1] if len(sys.argv) > 1 and not sys.argv[1].startswith('--') else 'quer'
alt = '--alt' in sys.argv
dev = DEVICES['pixel7q' if mode == 'quer' else 'pixel7']['ctx']
tag = f"{mode}{'_alt' if alt else ''}"
with Server() as srv, sync_playwright() as pw:
    s = Session(pw, srv.base, device=dev)
    s.open('?nosw&seed=4711&d=2' + ('&wiese=alt' if alt else ''))
    s.ev("__game.setAssist('original')")
    s.ev("__game.start({})")
    s.frames(5)
    # Countdown abwarten, dann auf die schnellste Stelle der Strecke (Profil) mit ~200 km/h setzen, kurz geradeaus
    s.ev("__game.sim(3.5)")
    s.ev("(() => { const G = __game, P = G.env.prof, L = G.env.track.line; let b = 0; for (let i = 0; i < L.n; i++) if (P.vt[i] > P.vt[b] && !L.air[i]) b = i; G.teleport(Math.max(0, b - 40), 56); })()")
    st = s.ev("(() => { const G = __game, c = G.race.ap.control(G.race.car); return G.sim(0.3, { steer: c.steer, throttle: 1, brake: 0 }); })()")
    print('vor dem Abkommen', round(st['speed'] * 3.6), 'km/h')
    out = []
    s.ev("__game.freeze(true)")
    st = s.ev("__game.sim(0.45, { steer: -1, throttle: 1, brake: 0 })")
    st = s.ev("__game.sim(0.35, { steer: 0, throttle: 1, brake: 0 })")
    s.ev("__game.freeze(true)"); s.frames(4); time.sleep(0.8)
    g = s.ev("__game.race.car.grass")
    out.append(('abkommen', round(st['speed'] * 3.6), g)); s.shot(f'wiese_{tag}_1_abkommen', 'wiese')
    s.ev("__game.freeze(false)"); st = s.ev("__game.sim(0.4, { steer: 0, throttle: 1, brake: 0 })")
    s.ev("__game.freeze(true)"); s.frames(4); time.sleep(0.8)
    out.append(('bremst', round(st['speed'] * 3.6), s.ev("__game.race.car.grass"))); s.shot(f'wiese_{tag}_2_bremst', 'wiese')
    s.ev("__game.freeze(false)"); st = s.ev("__game.sim(3.0, { steer: -0.1, throttle: 1, brake: 0 })")
    s.ev("__game.freeze(true)"); s.frames(4); time.sleep(0.8)
    out.append(('vollgas', round(st['speed'] * 3.6), s.ev("__game.race.car.grass"))); s.shot(f'wiese_{tag}_3_vollgas', 'wiese')
    hud = s.ev("(() => { const e = document.querySelector('#hud .spd, #hud .speed, #spd'); return e ? e.textContent : null; })()")
    print(json.dumps(out), 'HUD', hud)
    print('errors', s.errors[:10])
    s.close()
