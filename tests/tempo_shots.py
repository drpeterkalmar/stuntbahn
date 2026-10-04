# Tempo-Umbau (27.09.2026): Fotos Handy quer bei Vollgas + Prüfungen. Lange Test-Ringstrecke (eigene
# .TRK aus dem Designer, 2 × 480 m Gerade) auf Leicht: Verfolger und Cockpit bei > 300 km/h, dazu die
# Strecke des Tages an ihrer schnellsten Stelle (Mittel, Touch-Tasten sichtbar).
# Prüft: HUD-Tempo = Physik, Tachozeiger = Tempo auf der 600er-Skala, Verfolger bleibt nah am Auto
# (Tempo-Nachführung), Sichtfeld weiter, 0 Seitenfehler.  Aufruf: python3 tests/tempo_shots.py
import os, sys, time, json, subprocess
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from util import Server, Session, PIXEL7_LAND, ROOT, show_kmh
from playwright.sync_api import sync_playwright

RING = subprocess.run(['node', '--input-type=module', '-e', """
import { TrackDesigner } from './src/track/trkdesign.js';
const t = new TrackDesigner(2, 2, 0);
t.put('sf').road(23).put('large', { turn: 'R' }).road(6).put('large', { turn: 'R' }).road(24).put('large', { turn: 'R' }).road(6).put('large', { turn: 'R' });
console.log(JSON.stringify([...t.bytes(1)]));
"""], cwd=ROOT, check=True, capture_output=True, text=True).stdout
RING = json.loads(RING)

fails = []
def check(cond, msg):
    print(('OK   ' if cond else 'FAIL ') + msg, flush=True)
    if not cond: fails.append(msg)

FIND = """([cond, maxT]) => { const G = window.__game; const f = new Function('c', 'r', 'return ' + cond);
  for (let t = 0; t < maxT; t += 0.02) { G.sim(0.02); const r = G.race; if (r.state === 'finished') return -1; if (f(r.car, r)) return t; }
  return -2; }"""
READ = """() => { const G = window.__game, c = G.race.car, cam = G.camera;
  const ro = G.cockpit.readout ? G.cockpit.readout() : null;
  return { kmh: Math.abs(c.fwdSpeed()) * 3.6, hud: +document.querySelector('#hud .speed b').textContent, gear: c.gear, rpm: c.rpm,
    camDist: Math.hypot(cam.position.x - c.pos.x, cam.position.y - c.pos.y, cam.position.z - c.pos.z), fov: cam.fov,
    speedDeg: ro && ro.speedDeg, view: G.rig.view }; }"""

def settle(s, wait=1.6):
    # Physik fast angehalten, echte Bilder laufen weiter → Kamera/Zeiger schwingen auf ihren Wert ein.
    # Das Auto rollt dabei noch minimal weiter (Zeitlupe), die Nachführung bleibt also aktiv.
    s.ev("__game.setTimeScale(0.02)")
    time.sleep(wait)

def v_angle(v, mx=600, sweep=260):
    k = max(-0.015, min(1.02, v / mx))
    return -sweep / 2 + k * sweep

out = {}
with Server() as srv, sync_playwright() as pw:
    s = Session(pw, srv.base, device=PIXEL7_LAND)
    s.open('?nosw')
    s.frames(5)
    # 1) Strecke des Tages, Mittel (Touch-Tasten), schnellste Stelle der ersten 40 s
    s.ev("__game.setAssist('medium')")
    s.ev("__game.start({ autopilot: true })")
    s.ev("__game.cam('chase')")
    vmax = s.ev("""() => { const G = window.__game; let best = 0, bt = 0;
      for (let t = 0; t < 40; t += 0.05) { G.sim(0.05); const v = G.race.car.fwdSpeed() * 3.6; if (v > best) { best = v; bt = t; } if (G.race.state === 'finished') break; }
      return best; }""")
    s.ev("__game.start({ autopilot: true })")
    t = s.ev(FIND, [f"c.fwdSpeed() * 3.6 > {vmax - 4}", 60])
    settle(s); s.shot('tempo_tag_verfolger', 'tempo'); r = s.ev(READ); out['tag'] = r
    print('Strecke des Tages, Höchsttempo', round(vmax), r)
    check(abs(r['hud'] - show_kmh(r['kmh'])) < 6, f"Strecke des Tages: HUD (Show-Tacho) {r['hud']} km/h = Physik {r['kmh']:.0f} km/h")
    # 2) Test-Ring: Import, Leicht, Vollgas auf der langen Geraden
    s.ev("__game.setTimeScale(1.25)")
    res = s.ev("(a) => window.__game.importBytes(a, 'TEMPO.TRK').then(r => r.map(x => ({ id: x.id, ok: x.ok, err: x.err })))", RING)
    rid = [x for x in res if x['ok']][0]['id']
    s.ev(f"() => window.__game.loadImported('{rid}')")
    s.pg.wait_for_function(f"window.__game.mode === 'menu' && window.__game.env.meta.key === '{rid}'", timeout=300000)
    s.ev("__game.setAssist('easy')")
    s.ev("__game.start()")
    s.ev("__game.cam('chase')")
    peak = s.ev("""() => { const G = window.__game; let best = 0;
      for (let t = 0; t < 30; t += 0.05) { G.sim(0.05); best = Math.max(best, G.race.car.fwdSpeed() * 3.6); if (G.race.state === 'finished') break; }
      return best; }""")
    print('Test-Ring: Höchsttempo', round(peak))
    s.ev("__game.start()")
    s.ev("__game.cam('chase')")
    t = s.ev(FIND, [f"c.fwdSpeed() * 3.6 > {peak - 6}", 40])
    s.ev("__game.setTimeScale(1.25)"); time.sleep(0.4)   # Kamera im laufenden Spiel einschwingen lassen
    settle(s); s.shot('tempo_ring_verfolger', 'tempo'); r = s.ev(READ); out['ring_chase'] = r
    print('Ring Verfolger', r)
    check(r['kmh'] > 300, f"Test-Ring: Vollgas > 300 km/h ({r['kmh']:.0f})")
    check(abs(r['hud'] - show_kmh(r['kmh'])) < 6, f"HUD {r['hud']} km/h = Physik {r['kmh']:.0f} km/h")
    check(r['camDist'] < 9.5, f"Verfolger bleibt nah am Auto: {r['camDist']:.1f} m (5 m Soll + höchstens 3 m Verzug)")
    check(r['fov'] > 76.5, f"Sichtfeld bei Tempo geweitet: {r['fov']:.1f}° (bisher höchstens 76°)")
    check(r['gear'] >= 5, f"Gang {r['gear']}, {r['rpm']:.0f} U/min")
    # 3) Cockpit an derselben Stelle
    s.ev("__game.start()")
    s.ev("__game.cam('cockpit')")
    t = s.ev(FIND, [f"c.fwdSpeed() * 3.6 > {peak - 6}", 40])
    s.ev("__game.setTimeScale(1.25)"); time.sleep(0.4)
    settle(s, 2.0); s.shot('tempo_ring_cockpit', 'tempo'); r = s.ev(READ); out['ring_cockpit'] = r
    print('Ring Cockpit', r)
    check(r['view'] == 'cockpit', 'Cockpit-Ansicht')
    check(r['speedDeg'] is not None and abs(r['speedDeg'] - v_angle(show_kmh(r['kmh']))) < 3, f"Tachozeiger {r['speedDeg']:.1f}° = {r['kmh']:.0f} km/h auf der Skala 0–600 ({v_angle(r['kmh']):.1f}°)")
    # 4) Ziel, 0 Fehler
    s.ev("__game.setTimeScale(1.25)")
    st = s.ev("() => { for (let i = 0; i < 200 && window.__game.race.state !== 'finished'; i++) window.__game.sim(1); return window.__game.state(); }")
    check(st['state'] == 'finished' and not st['crashes'], f"Test-Ring auf Leicht im Ziel, {st['crashes']} Crashs, {st['time']:.1f} s")
    check(not s.errors, f'0 Fehler (pageerror/console/request): {s.errors[:5]}')
    json.dump(out, open(os.path.join(ROOT, 'tests', 'shots', 'tempo', 'werte.json'), 'w'), indent=1)
    s.close()
print('FEHLSCHLÄGE', len(fails), fails)
sys.exit(1 if fails else 0)
