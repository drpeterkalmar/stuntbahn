# Scheinwerfer in Lampenhöhe (Peter 20.10.2026: „Scheinwerferlichter sind zu hoch“).
# Bis 0.12.0 saßen die beiden Leuchtpunkte bei y 0,58 – Höhe der Windschutzscheibe, ~0,5 m über der Haube an dieser Stelle.
# Prüft: jeder Leuchtpunkt liegt innerhalb der Karosserie-Silhouette vorn (Höhe nicht über der Haube an seiner Längsposition,
# seitlich innerhalb der Breite) und die Lichtquelle in derselben Höhe; der Lichtkegel zeigt nach unten auf die Fahrbahn.
# Aufruf: python3 tests/test_scheinwerfer.py
import sys, os, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from util import *

JS = """(() => { const g = __game, gl = g.scene.getObjectByName('scheinwerfer-glanz'), root = gl.parent, L = g.scene.getObjectByName('scheinwerfer');
  root.updateMatrixWorld(true);
  const inv = root.matrixWorld.clone().invert(), V = new g.camera.position.constructor(), pts = [];
  root.traverse((o) => { if (!o.isMesh || o.userData.fx || o === gl || !o.geometry || !o.geometry.attributes.position) return;
    const P = o.geometry.attributes.position, M = inv.clone().multiply(o.matrixWorld), st = Math.max(1, Math.floor(P.count / 40000));
    for (let i = 0; i < P.count; i += st) { V.fromBufferAttribute(P, i).applyMatrix4(M); pts.push([V.x, V.y, V.z]); } });
  const m4 = new root.matrix.constructor(), glows = [];
  for (let k = 0; k < gl.count; k++) { gl.getMatrixAt(k, m4); const p = new V.constructor().setFromMatrixPosition(m4);
    const s = pts.filter(q => Math.abs(q[2] - p.z) < 0.06);
    glows.push({ x: p.x, y: p.y, z: p.z, top: Math.max(...s.map(q => q[1])), half: Math.max(...s.map(q => Math.abs(q[0]))), n: s.length }); }
  const lp = L ? L.position : null, lt = L ? L.target.position : null;
  return { glows, light: lp ? [lp.x, lp.y, lp.z] : null, target: lt ? [lt.x, lt.y, lt.z] : null, ground: Math.min(...pts.map(q => q[1])), parentOk: L ? L.parent === root : null }; })()"""

ok = True
def need(c, what):
    global ok
    print(('ok ' if c else 'FAIL ') + what, flush=True); ok &= bool(c)

with Server() as srv, sync_playwright() as pw:
    s = Session(pw, srv.base, device=PIXEL7_LAND)
    s.open('?nosw&seed=25&d=2&g=1&thema=land&q=2&startprobe=0&blur=off')
    s.ev("__game.setZeit('nacht')")
    r = s.ev(JS)
    print(json.dumps(r))
    need(len(r['glows']) == 2, 'zwei Leuchtpunkte')
    for k, p in enumerate(r['glows']):
        need(p['n'] > 20 and p['y'] <= p['top'] + 0.02, f"Leuchtpunkt {k}: y {p['y']:.2f} nicht über der Haube (Oberkante dort {p['top']:.2f})")
        need(abs(p['x']) <= p['half'], f"Leuchtpunkt {k}: x {p['x']:.2f} innerhalb der Breite (±{p['half']:.2f})")
        need(p['y'] - r['ground'] < 0.75, f"Leuchtpunkt {k}: {p['y'] - r['ground']:.2f} m über dem Boden (< 0,75)")
    if r['light']:
        need(abs(r['light'][1] - r['glows'][0]['y']) < 0.15, f"Lichtquelle in Lampenhöhe (y {r['light'][1]:.2f})")
        dy, dz = r['target'][1] - r['light'][1], r['target'][2] - r['light'][2]
        hit = (r['light'][1] - r['ground']) / (dy / dz) if dy else 1e9
        need(dy < 0 and 8 < abs(hit) < 30, f"Kegelmitte trifft die Fahrbahn {abs(hit):.1f} m vor der Lampe (8–30)")
    need(not s.errors, 'keine Seitenfehler ' + str(s.errors[:3]))
    s.close()
print('OK' if ok else 'FEHLER')
sys.exit(0 if ok else 1)
