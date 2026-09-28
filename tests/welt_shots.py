# Weltmaßstab (27.09.2026): Fotos zur Sichtprüfung – Handy quer, Handy hoch, Desktop. Verfolger bei Tempo,
# Hubschrauber, Sprung von außen (fliegendes Auto), Übersicht von oben mit Nebel/Bergkranz (auch ?welt=1 zum
# Vergleich), Bibliothek mit Minikarten. Prüft nebenbei: 0 Seitenfehler, Auto im Sprung wirklich in der Luft.
# Aufruf: python3 tests/welt_shots.py  → tests/shots/welt/*.jpg (Auswahl von Hand nach tests/shots/final/)
import os, sys, time, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from util import Server, Session, PIXEL7_LAND, DESKTOP, ROOT
from playwright.sync_api import sync_playwright

PIXEL7_HOCH = dict(viewport={"width": 412, "height": 915}, device_scale_factor=2.625, is_mobile=True, has_touch=True,
                   user_agent=PIXEL7_LAND['user_agent'])
OUT = os.path.join(ROOT, 'tests', 'shots', 'welt')
os.makedirs(OUT, exist_ok=True)
fails = []
def check(cond, msg):
    print(('OK   ' if cond else 'FAIL ') + msg, flush=True)
    if not cond: fails.append(msg)
def shot(s, name):
    s.pg.screenshot(path=os.path.join(OUT, name + '.jpg'), type='jpeg', quality=84)

def settle(s, wait=1.4):
    s.ev("__game.setTimeScale(0.02)"); time.sleep(wait)

# Schnellste Stelle der ersten maxT Sekunden suchen, dann neu starten und genau dort anhalten
FASTEST = """([maxT, want]) => { const G = window.__game; let best = 0;
  for (let t = 0; t < maxT; t += 0.02) { G.sim(0.02); const v = G.race.car.fwdSpeed() * 3.6; if (v > best) best = v; if (v >= want || G.race.state === 'finished') break; }
  return best; }"""
# Vor den ersten Sprung setzen, Autopilot fahren lassen, im Scheitel anhalten; Kamera seitlich außen
JUMP = """([side, back, up]) => { const G = window.__game, T = G.env.track, L = T.line, J = T.jumps[0];
  if (!J) return null;
  let i = J.lipIdx; while (i > 0 && L.s[J.lipIdx] - L.s[i] < 160) i--;
  G.teleport(i, G.env.prof.vt[i]); G.race.stuckProg = -1e9; G.race.stuckT = 0; let air = 0, apexY = -1e9, t = 0;
  for (; t < 20; t += 1 / 120) { G.sim(1 / 120); const c = G.race.car; if (c.onGround === 0) { air += 1 / 120; if (c.pos.y > apexY) apexY = c.pos.y; else if (air > 0.3) break; } }
  const c = G.race.car, li = J.lipIdx, lx = L.px[li], lz = L.pz[li];
  const bx = L.bx[li], bz = L.bz[li], tx = L.tx[li], tz = L.tz[li];
  window.__app.freezeCam = true; G.freeze(true);
  const cam = G.camera; cam.position.set(c.pos.x + bx * side - tx * back, c.pos.y + up, c.pos.z + bz * side - tz * back);
  cam.up.set(0, 1, 0); cam.lookAt(c.pos.x, c.pos.y - 1, c.pos.z); cam.fov = 55; cam.updateProjectionMatrix();
  return { air, apexY, lipY: L.py[li], y: c.pos.y, ground: G.race.car.onGround, kmh: c.fwdSpeed() * 3.6 }; }"""
# Übersicht von schräg oben über die Streckenmitte
OVER = """([h, d]) => { const G = window.__game, b = G.env.track.bounds;
  const cx = (b.minX + b.maxX) / 2, cz = (b.minZ + b.maxZ) / 2, r = Math.hypot(b.maxX - b.minX, b.maxZ - b.minZ) / 2;
  window.__app.freezeCam = true; G.freeze(true);
  const cam = G.camera; cam.position.set(cx - r * d, h * r, cz + r * d * 1.1); cam.up.set(0, 1, 0); cam.lookAt(cx, 0, cz);
  cam.fov = 60; cam.updateProjectionMatrix(); return { r: Math.round(r), world: G.worldScale }; }"""

with Server() as srv, sync_playwright() as pw:
    # ---------- Handy quer ----------
    s = Session(pw, srv.base, device=PIXEL7_LAND)
    s.open('?nosw&seed=20260927&d=2')
    s.frames(5); shot(s, 'quer_menue')
    s.ev("__game.setAssist('easy')"); s.ev("__game.start({ autopilot: true })"); s.ev("__game.cam('chase')")
    v = s.ev(FASTEST, [60, 150]); settle(s); shot(s, 'quer_verfolger_tempo')
    check(v > 150, f'Handy quer, Strecke des Tages: Spitze {v:.0f} km/h im Bild')
    s.ev("__game.setTimeScale(1.25)"); s.ev("__game.cam('far')"); s.ev("__game.sim(3)"); settle(s); shot(s, 'quer_hubschrauber')
    s.ev("__game.cam('chase')")
    j = s.ev(JUMP, [26, 18, 5]); s.frames(6); time.sleep(0.6); shot(s, 'quer_sprung_aussen')
    check(j and j['air'] > 0.3 and j['y'] - j['lipY'] > 1.5, f'Sprung von außen: Auto in der Luft {json.dumps(j)}')
    s.ev("__game.freeze(false)"); s.ev("window.__app.freezeCam = false")
    check(not s.errors, f'Handy quer: 0 Fehler {s.errors[:3]}')
    s.close()
    # Bibliothek mit Minikarten (Beispiel-Rundkurs + eigene .TRK aus dem Designer)
    s = Session(pw, srv.base, device=PIXEL7_LAND)
    s.open('?nosw&trk=demo-rundkurs')
    s.ev("() => window.__game.ui.showLibrary()"); s.frames(10); time.sleep(0.8); shot(s, 'quer_bibliothek')
    s.ev("() => window.__game.ui.hide && window.__game.ui.hide()")
    s.ev("__game.setAssist('easy')"); s.ev("__game.start({ autopilot: true })"); s.ev("__game.cam('chase')")
    v = s.ev(FASTEST, [90, 285]); settle(s); shot(s, 'quer_beispiel_verfolger')
    check(v > 250, f'Beispiel-Rundkurs: Spitze {v:.0f} km/h')
    j = s.ev(JUMP, [30, 20, 6]); s.frames(6); time.sleep(0.6); shot(s, 'quer_beispiel_sprung_aussen')
    check(j and j['air'] > 0.3, f'Beispiel-Rundkurs Sprung über die Scheune: {json.dumps(j)}')
    check(not s.errors, f'Bibliothek/Beispiel: 0 Fehler {s.errors[:3]}')
    s.close()
    # ---------- Handy hoch ----------
    s = Session(pw, srv.base, device=PIXEL7_HOCH)
    s.open('?nosw&seed=42&d=3')
    s.ev("__game.setAssist('easy')"); s.ev("__game.start({ autopilot: true })"); s.ev("__game.cam('chase')")
    v = s.ev(FASTEST, [60, 170]); settle(s); shot(s, 'hoch_verfolger_tempo')
    j = s.ev(JUMP, [24, 22, 5]); s.frames(6); time.sleep(0.6); shot(s, 'hoch_sprung_aussen')
    check(j and j['air'] > 0.3, f'Handy hoch, Sprung von außen: {json.dumps(j)}')
    check(not s.errors, f'Handy hoch: 0 Fehler {s.errors[:3]}')
    s.close()
    # ---------- Desktop ----------
    for q, tag in (('', 'welt2'), ('&welt=1', 'welt1')):
        s = Session(pw, srv.base, device=DESKTOP)
        s.open('?nosw&seed=4711&d=3' + q)
        s.ev("__game.setAssist('easy')"); s.ev("__game.start({ autopilot: true })"); s.ev("__game.cam('chase')")
        v = s.ev(FASTEST, [90, 200 if tag == 'welt2' else 125]); settle(s); shot(s, f'desktop_{tag}_verfolger')
        print(tag, 'Spitze', round(v), 'km/h', flush=True)
        o = s.ev(OVER, [0.55, 0.9]); s.frames(6); time.sleep(0.6); shot(s, f'desktop_{tag}_uebersicht')
        print(tag, 'Übersicht', o, flush=True)
        check(not s.errors, f'Desktop {tag}: 0 Fehler {s.errors[:3]}')
        s.close()
print('FEHLSCHLÄGE', len(fails), fails)
