# n22: Gelände-Strecken im Browser – Menü (Code „-g“, Karte mit Höhenschattierung, Schalter), Rennen mit Autopilot ins
# Ziel, Verfolgerkamera nie hinter Bauteilen oder im Hang (Strahl Auto → Kamera gegen Strecke UND Gelände), Hochformat,
# 0 Fehler. Fotos: tests/shots/gelaende/ui_*. Aufruf: python3 tests/test_gelaende_ui.py [seed] [stufe]
import sys, time, json
sys.path.insert(0, 'tests')
from util import *
seed = int(sys.argv[1]) if len(sys.argv) > 1 else 4711
diff = int(sys.argv[2]) if len(sys.argv) > 2 else 3
PIXEL7_PORT = dict(PIXEL7_LAND, viewport={"width": 412, "height": 915})
bad = []
def check(c, msg):
    print(('OK   ' if c else 'FEHLER ') + msg, flush=True)
    if not c: bad.append(msg)
RAY = """(() => { const g = __game, c = g.camera.position, p = g.race.car.pos, u = g.rig.up, w = g.env.world;
  const o = [p.x + u.x * 1.2, p.y + u.y * 1.2, p.z + u.z * 1.2]; const d = [c.x - o[0], c.y - o[1], c.z - o[2]]; const L = Math.hypot(...d);
  if (L < 0.5) return [0, 0, null];
  const h = w.rayTrack(o[0], o[1], o[2], d[0] / L, d[1] / L, d[2] / L, L, false), t = w.rayTerrain(o[0], o[1], o[2], d[0] / L, d[1] / L, d[2] / L, L, {});
  const ti = g.race.tracker.idx, pc = g.env.layout.pieces[g.env.track.line.piece[ti]], pl = g.env.track.gel.plan.pieces[g.env.track.line.piece[ti]];
  const camUnder = c.y < g.env.track.terrain.height(c.x, c.z) + 0.2;
  return [h ? 1 : 0, (t || camUnder) ? 1 : 0, [pc && pc.type, pl.tunnel ? 'tunnel' : '', h ? h.mat : null, camUnder]]; })()"""
with Server() as srv, sync_playwright() as pw:
    s = Session(pw, srv.base)
    s.open('?nosw')
    m = s.ev("__game.env.meta")
    check(m.get('gel') and m['key'].endswith('-g'), f"Start = Strecke des Tages im Gelände ({m['key']})")
    txt = s.ev("document.querySelector('#menu .tmeta').textContent")
    check('-g' in txt and '⛰️' in txt, 'Menü zeigt Code mit -g und Höhenunterschied: ' + txt)
    px = s.ev("(() => { const c = document.querySelector('#menu canvas.tmap'); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; const v = new Set(); for (let i = 0; i < d.length; i += 4 * 7) v.add(d[i] >> 3 << 10 | d[i + 1] >> 3 << 5 | d[i + 2] >> 3); return v.size; })()")
    check(px > 120, f'Streckenkarte mit Höhenschattierung ({px} Farbstufen)')
    s.pg.locator('#menu canvas.tmap').screenshot(path=f'{ROOT}/tests/shots/gelaende/ui_karte.png')
    s.shot('ui_menu_quer', 'gelaende')
    s.ev(f"__game.newTrack({seed}, {diff}, 'gel')"); s.pg.wait_for_function(f"__game.env.meta.key === '{seed}-{diff}-g'", timeout=240000)
    s.ev("__game.setAssist('easy')"); s.ev("__game.start({ autopilot: true })"); s.ev("__game.sim(3.3)")
    frames = blockedT = blockedG = 0
    for k in range(400):
        st = s.ev("__game.sim(0.4)")
        s.frames(2)
        r = s.ev(RAY)
        inner = r[2] and r[2][0] in ('loop', 'tube', 'tr_corklr')
        if r[0] and not inner: blockedT += 1; print('   verdeckt (Bauteil)', r[2])
        if r[1]: blockedG += 1; print('   verdeckt (Gelände)', r[2])
        frames += 1
        if st['state'] == 'finished': break
    check(st['state'] == 'finished', f"Gelände-Strecke {seed}-{diff}-g im Ziel: {json.dumps({k: st[k] for k in ['state', 'time', 'crashes', 'cp', 'cps']})}")
    check(blockedT == 0 and blockedG == 0, f'Kamera nie verdeckt: {blockedT} Bauteil, {blockedG} Gelände von {frames} Bildern')
    check(not s.errors, 'Fehler: ' + str(s.errors[:5]))
    s.close()
    s = Session(pw, srv.base, device=PIXEL7_PORT)
    s.open('?nosw')
    s.frames(3); time.sleep(0.5); s.shot('ui_menu_hoch', 'gelaende')
    check(not s.small_buttons(), 'hochkant: keine zu kleinen/abgeschnittenen Knöpfe ' + str(s.small_buttons()[:4]))
    check(not s.errors, 'Fehler hochkant: ' + str(s.errors[:5]))
    s.close()
print('ERGEBNIS', 'OK' if not bad else 'FEHLER: ' + '; '.join(bad))
sys.exit(1 if bad else 0)
