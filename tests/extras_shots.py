# Fotos der Extras: HUD mit vollen/leeren Knöpfen, Nitro-Flammen bei Tempo (Verfolger), Auto im Hüpfer
# (Seitenansicht + Verfolger), Replay mit Flammen. Handy quer + hoch, Desktop. → tests/shots/extras/final_*.png
# Aufruf: python3 tests/extras_shots.py [pixel7q,pixel7,desktop]
import sys, time, json
sys.path.insert(0, 'tests')
from util import *
from hochformat_util import DEVICES, set_safe

SEED = '?nosw&seed=4711&d=2'
profs = (sys.argv[1] if len(sys.argv) > 1 else 'pixel7q,pixel7,desktop').split(',')

def side_cam(s, dist=9.0, h=1.2, back=0.0):
    # Kamera seitlich neben das Auto (rechts), Blick auf das Auto; Rennen angehalten
    s.ev(f"""(() => {{ const G = __game, c = G.race.car, F = c.frame, cam = G.camera; __app.freezeCam = true; G.freeze(true);
      const gy = c.pos.y - (G.race.car.hopUp ? 0 : 0);
      cam.position.set(c.pos.x + F.r.x * {dist} - F.f.x * {back}, c.pos.y + {h}, c.pos.z + F.r.z * {dist} - F.f.z * {back});
      cam.up.set(0, 1, 0); cam.lookAt(c.pos.x - F.f.x * {back} * 0.3, c.pos.y - 1.2, c.pos.z - F.f.z * {back} * 0.3); cam.fov = 50; cam.updateProjectionMatrix(); }})()""")

def unfreeze(s):
    s.ev("__app.freezeCam = false; __game.freeze(false)")

def drive_until(s, cond_js, maxsec=60, step=0.05):
    t = 0
    while t < maxsec:
        if s.ev(cond_js): return True
        s.ev(f"__game.sim({step})"); t += step
    return False

with Server() as srv, sync_playwright() as pw:
    for prof in profs:
        dev = DESKTOP if prof == 'desktop' else DEVICES[prof]['ctx']
        s = Session(pw, srv.base, device=dev)
        s.open(SEED)
        if prof != 'desktop': set_safe(s, DEVICES[prof]['safe'])
        s.ev("__game.setAssist('medium'); __game.setLine('off'); __game.store.settings.extras = true; __game.store.settings.autoExtras = false; __game.store.settings.cam = 'chase'")
        s.ev("__game.start({autopilot:true})"); s.ev("__game.cam('chase')")
        s.ev("__game.sim(3.3)"); s.frames(8); time.sleep(0.3)
        s.shot(f'final_{prof}_hud_voll', 'extras')
        # Nitro dort, wo ihn auch der Leicht-Autopilot zündet (längste Gerade), mit Tempo
        s.ev("(() => { const r = __game.race, P = r.planExtras().nitro; __game.teleport(P.i0, 30); })()")
        s.ev("__game.sim(0.3)"); s.ev("__game.nitro()"); s.ev("__game.sim(2.0)"); s.frames(10); time.sleep(0.2)
        s.ev("__game.freeze(true)"); s.frames(6); time.sleep(0.3)
        st = s.state(); print(prof, 'Nitro', round(st['speed'] * 3.6), 'km/h', st['x'], flush=True)
        s.shot(f'final_{prof}_nitro', 'extras')
        side_cam(s, 7.5, 0.9, 3.5); s.frames(4); time.sleep(0.3)
        s.shot(f'final_{prof}_nitro_seite', 'extras')
        unfreeze(s); s.ev("__game.cam('chase')")
        s.ev("__game.sim(4)")
        # Hüpfer: nächste Stelle, an der er geht, bei Tempo > 60 km/h
        # freie Gerade suchen (Hüpfer möglich bei ~100 km/h), dorthin setzen, anfahren lassen, hüpfen
        ok = s.ev("""(() => { const G = __game, r = G.race, L = G.env.track.line, P = G.env.prof;
          for (let i = 30; i < L.n - 300; i += 7) { if (P.vt[i] < 28) continue; G.teleport(i, 27); r.charges.hop = 1; G.sim(0.4);
            if (r.car.onGround >= 3 && r.hopBlock(r.ap.tr.idx) === null) return i; } return -1; })()""") >= 0
        s.ev("__game.hop()"); s.ev("__game.sim(0.1)")
        print(prof, 'Hüpfer ausgelöst', s.state()['used'], flush=True)
        drive_until(s, "(() => { const c = __game.race.car; return c.onGround === 0 && c.v.y <= 0.2; })()", 5, 1 / 60)
        st = s.state(); print(prof, 'Hüpfer-Scheitel', ok, round(st['speed'] * 3.6), 'km/h', 'y', round(st['pos'][1], 2), flush=True)
        s.ev("__game.freeze(true)"); s.frames(6); time.sleep(0.3)
        s.shot(f'final_{prof}_huepfer_verfolger', 'extras')
        side_cam(s, 11, 0.4, 0); s.frames(4); time.sleep(0.3)
        s.shot(f'final_{prof}_huepfer_seite', 'extras')
        unfreeze(s); s.ev("__game.cam('chase')")
        s.ev("__game.sim(2.5)"); s.frames(8); time.sleep(0.3)
        s.shot(f'final_{prof}_hud_leer', 'extras')
        if prof == 'pixel7q':
            s.ev("__game.cam('cockpit')"); s.frames(8); time.sleep(0.3)
            s.shot(f'final_{prof}_cockpit_leer', 'extras')
            s.ev("__game.cam('chase')")
        if prof == 'desktop':
            s.ev("__game.sim(200)")
            s.ev("__game.replay()"); s.frames(3)
            f0 = s.ev("__game.replayObj.nitros[0].t0")
            s.ev(f"__game.replayObj.t = {f0} + 1.3; __game.replayObj.paused = true"); s.frames(8); time.sleep(0.3)
            s.shot('final_desktop_replay_nitro', 'extras')
        print(prof, 'Fehler', s.errors[:5], flush=True)
        s.close()
