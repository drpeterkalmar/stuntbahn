# n33 Hindernisse im Browser abnehmen: Zickzack-Barriere, Röhre mit Mittelwand, Spirale (flach/3D/Gelände).
# Je Fahrhilfe (Leicht = Autopilot, Mittel = Gas + Spurhilfe, Original = Autopilot ohne Hilfen) ins Element hineinfahren,
# Fotos aus Verfolger/Cockpit/Stoßstange an mehreren Stellen, dazu eine Außenansicht. Meldet Crashs/Resets und HUD-Text.
# Aufruf: python3 tests/hindernis_shots.py <hoch|quer> "<query ohne ?>" <typ[,typ2]> [hilfen] [kameras] [name] [zusatz]
#   z. B. python3 tests/hindernis_shots.py quer "seed=9&d=2&h=1" zigzag easy,medium,original chase,cockpit,bumper
#   typ = Stück-Typ im Layout (zigzag, zigzag2, tube_wall, spiral, tr_corkud …); mehrere mit Komma = erster gefundener
import sys, time, json
sys.path.insert(0, 'tests')
from util import *
mode = sys.argv[1]
q = sys.argv[2]
typen = sys.argv[3].split(',')
hilfen = (sys.argv[4] if len(sys.argv) > 4 else 'easy,medium,original').split(',')
kams = (sys.argv[5] if len(sys.argv) > 5 else 'chase,cockpit,bumper').split(',')
name = sys.argv[6] if len(sys.argv) > 6 else typen[0]
zusatz = sys.argv[7] if len(sys.argv) > 7 else ''
dev = dict(PIXEL7_LAND, viewport={"width": 412, "height": 915}) if mode == 'hoch' else PIXEL7_LAND
SUB = 'n33/hind'
FIND = """((typen) => { const t = __game.env.track, P = t.layout.pieces, I = t.pieces;
  for (let k = 0; k < P.length; k++) if (typen.includes(P[k].type) && I[k] && I[k].lineStart != null) return [k, I[k].lineStart, I[k].lineEnd, P[k].type];
  return null; })"""
HUD = "(() => (__game.race && __game.race.hud ? __game.race.hud.text : ''))()"
erg = {}
with Server() as srv, sync_playwright() as pw:
    s = Session(pw, srv.base, device=dev)
    s.open(f'?nosw&q=2&vao=sync&{q}{zusatz}')
    r = s.ev(f"({FIND})({json.dumps(typen)})")
    if not r: print('Element nicht gefunden', typen, s.ev("__game.env.meta.key")); s.close(); sys.exit(1)
    k, i0, i1, typ = r
    print('Strecke', s.ev("__game.env.meta.key"), 'Element', typ, 'Stück', k, 'Linie', i0, i1, flush=True)
    n = i1 - i0
    for h in hilfen:
        s.ev(f"__game.setAssist('{h}')")
        s.ev(f"__game.start({{ autopilot: {'false' if h == 'medium' else 'true'} }})")
        s.ev("__game.sim(3.3)")
        # Mittel: Gas, bremst wie ein Spieler auf „Bremsen!“ (über dem Plan-Tempo 8 Punkte voraus) – lenken tut die Spurhilfe
        # (lenkt in Kurven wie ein guter Spieler: Lenkwinkel des Autopiloten; im Stunt lenkt die Spurhilfe mit)
        SIM = ("(() => { const g = __game, r = g.race, P = g.env.prof.vt, i = r.tracker.idx, v = r.car.speed(), vt = P[Math.min(P.length - 1, i + 8)];"
               " const st = r.ap.control(r.car).steer;"
               " return g.sim(0.05, v > vt * 1.03 ? { steer: st, throttle: 0, brake: 1 } : { steer: st, throttle: 0.85, brake: 0 }); })()") if h == 'medium' else "__game.sim(0.05)"
        for cam in kams:
            c0 = s.ev("__game.state().crashes + __game.state().rewinds")
            s.ev(f"(() => {{ const g = __game; g.freeze(true); g.teleport({max(0, i0 - 30)}, Math.max(18, g.env.prof.vt[{max(0, i0 - 30)}] * 0.9)); g.race.stuckProg = -1e9; g.race.stuckT = 0; g.cam('{cam}'); }})()")
            # in kleinen Schritten durchs Element, Fotos bei 0 %, 35 %, 48 %, 65 % der Länge
            ziele = [i0 - 4, i0 + int(n * 0.35), i0 + int(n * 0.48), i0 + int(n * 0.65)]
            for zi, ziel in enumerate(ziele):
                for _ in range(400):
                    st = s.ev(SIM)
                    if st['idx'] >= ziel or st['state'] not in ('race', 'running', 'go', None) and st['state'] != 'countdown' and False: break
                if st['idx'] < ziel - 2: print('  nicht erreicht', h, cam, ziel, st['idx'], st['state'])
                s.frames(6); time.sleep(0.35)
                hud = s.ev(HUD)
                # Röhre: Abstand der Kamera zur Röhrenachse (Linienpunkt + Normale × Radius 5,6 m), > 5,6 m = außerhalb
                ach = s.ev("(() => { const g = __game, L = g.env.track.line, i = g.race.tracker.idx, c = g.camera.position, R = 5.6;"
                           " const ax = L.px[i] + L.nx[i] * R, ay = L.py[i] + L.ny[i] * R, az = L.pz[i] + L.nz[i] * R;"
                           " const dx = c.x - ax, dy = c.y - ay, dz = c.z - az, t = dx * L.tx[i] + dy * L.ty[i] + dz * L.tz[i];"
                           " return Math.hypot(dx - t * L.tx[i], dy - t * L.ty[i], dz - t * L.tz[i]); })()") if 'tube_wall' in typen else 0
                p = s.shot(f'{name}_{mode}_{h}_{cam}_{zi}', SUB)
                print(f'  {h:8s} {cam:7s} Stelle {zi} idx {st["idx"]} v {st["speed"] * 3.6:5.0f} km/h up {st["up"]:+.2f} Achse {ach:4.1f} m HUD „{hud}“', flush=True)
            # zu Ende fahren
            for _ in range(400):
                st = s.ev(SIM)
                if st['idx'] >= i1 + 5: break
            c1 = s.ev("__game.state().crashes + __game.state().rewinds")
            erg[f'{h}/{cam}'] = c1 - c0
            print(f'  {h:8s} {cam:7s} Crash/Zurückspulen im Element: {c1 - c0}', flush=True)
    # Außenansicht schräg von oben auf das Element
    s.ev("__game.cam('chase')"); s.frames(2)
    s.ev(f"""(() => {{ const g = __game, L = g.env.track.line, a = {i0}, b = {i1}; g.freeze(true); window.__app.freezeCam = true; const c = g.camera;
      let cx = 0, cy = 0, cz = 0, m = 0; for (let i = a; i <= b; i++) {{ cx += L.px[i]; cy += L.py[i]; cz += L.pz[i]; m++; }} cx /= m; cy /= m; cz /= m;
      let tx = L.px[b] - L.px[a], tz = L.pz[b] - L.pz[a]; if (Math.hypot(tx, tz) < 5) {{ tx = L.tx[a]; tz = L.tz[a]; }} const tl = Math.hypot(tx, tz); tx /= tl; tz /= tl;
      const px = cx - tx * 45 - tz * 30, pz = cz - tz * 45 + tx * 30;
      c.position.set(px, Math.max(cy + 22, g.env.track.terrain.height(px, pz) + 6), pz); c.up.set(0, 1, 0); c.lookAt(cx, cy + 2, cz); c.fov = 55; c.updateProjectionMatrix(); }})()""")
    s.frames(8); time.sleep(0.6); print('Foto', s.shot(f'{name}_{mode}_aussen', SUB))
    print('Ergebnis', json.dumps(erg), 'Fehler', s.errors[:5], flush=True)
    s.close()
