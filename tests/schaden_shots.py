# n34 Schadensmodell im Browser: Nahaufnahmen des Heldenautos (feste Kamera vorn-seitlich, Seite, Heck) heil / leicht / mittel /
# stark (Abnahme-Haken __game.treffer), dazu ein Gegner mit Schaden. HUD ausgeblendet. Gibt JSON (Schaden-Zustand, JS-Fehler) aus.
# Aufruf: python3 tests/schaden_shots.py [quer|hoch] [Zusatz-URL]  → tests/shots/n34/schaden_<gerät>_<stufe>_<ansicht>.png
import sys, time, json, os
sys.path.insert(0, 'tests')
from util import *

DEV = sys.argv[1] if len(sys.argv) > 1 else 'quer'
EXTRA = sys.argv[2] if len(sys.argv) > 2 else ''
PIXEL7_PORT = dict(PIXEL7_LAND, viewport={"width": 412, "height": 915})
DEVICES = {'quer': PIXEL7_LAND, 'hoch': PIXEL7_PORT}
Q = '?nosw&seed=4711&d=2&schaden=optik&q=2' + EXTRA

# Kamera in Auto-Koordinaten (x rechts, y oben, z hinten) an off, Blick auf ziel
KAMERA = """([off, ziel]) => { const G = __game, c = G.race.car, q = c.q;
  const rot = (v) => { const x = v[0], y = v[1], z = v[2], tx = 2 * (q.y * z - q.z * y), ty = 2 * (q.z * x - q.x * z), tz = 2 * (q.x * y - q.y * x);
    return [x + q.w * tx + (q.y * tz - q.z * ty), y + q.w * ty + (q.z * tx - q.x * tz), z + q.w * tz + (q.x * ty - q.y * tx)]; };
  const a = rot(off), b = rot(ziel), cam = G.camera;
  cam.position.set(c.pos.x + a[0], c.pos.y + a[1], c.pos.z + a[2]); cam.lookAt(c.pos.x + b[0], c.pos.y + b[1], c.pos.z + b[2]); cam.updateMatrixWorld(); return true; }"""
ANSICHTEN = {
    'vorn': ([-2.9, 1.15, -4.2], [0, 0.1, -0.6]),
    'seite': ([-4.6, 1.0, 0.2], [0, 0.15, 0.0]),
    'heck': ([2.6, 1.3, 4.3], [0, 0.2, 0.6]),
}
# Treffer je Stufe: (Ort, Außen-Normale, Stoß-Tempo m/s) – kumulativ
STUFEN = [
    ('heil', []),
    ('leicht', [([-0.6, 0.0, -2.35], [-0.3, 0, -1], 11), ([-1.05, 0.15, 0.3], [-1, 0, 0], 8)]),
    ('mittel', [([0.2, 0.05, -2.4], [0, 0, -1], 20), ([-1.05, 0.2, -0.5], [-1, 0, 0], 16), ([0.5, 0.1, 2.25], [0, 0, 1], 12)]),
    ('stark', [([-0.3, 0.1, -2.4], [0, 0, -1], 34), ([-1.08, 0.1, 0.8], [-1, 0, 0], 26), ([-0.4, 0.6, -0.2], [0, 1, 0], 22), ([0.6, 0.2, 2.25], [0, 0, 1], 24)]),
]
res = {'dev': DEV}
with Server() as srv, sync_playwright() as pw:
    s = Session(pw, srv.base, device=DEVICES[DEV])
    s.open(Q)
    s.ev("__game.setAssist('medium')")
    s.ev("__game.start({seed: 3})"); s.frames(3)
    s.ev("__game.race.autopilotOnly = true"); s.ev("__game.sim(2.5)"); s.frames(5)
    s.ev("__game.store.settings.karte = 'aus'")
    s.ev("__game.freeze(true); window.__app.freezeCam = true; for (const e of document.querySelectorAll('#hud, #touch, #minikarte, .karte')) e.style.visibility = 'hidden'")
    for name, hits in STUFEN:
        for (p, n, vn) in hits:
            s.ev("([p, n, vn]) => __game.treffer(p, n, vn)", [p, n, vn])
        s.frames(20); time.sleep(0.5)
        res[name] = s.ev("(() => { const S = __game.schaden.S; return { gesamt: +S.gesamt.toFixed(2), teile: S.teile, dellen: S.dellen.length }; })()")
        for a, (off, ziel) in ANSICHTEN.items():
            s.ev(KAMERA, [off, ziel]); s.frames(4); time.sleep(0.35)
            s.shot(f'schaden_{DEV}_{name}_{a}', 'n34')
    res['fehler'] = [e for e in s.errors if 'GL Driver' not in e][:8]
    s.close()
print(json.dumps(res, ensure_ascii=False))
