# n26 Stunt-Größe: Fotoserie je Stunt (Galerie bzw. Gelände-Galerie, Autopilot) – Verfolger im spektakulärsten Moment
# (Looping oben, Rolle kopfüber, Schanze/Klippe/Schlucht am Scheitel, Wellen in der Luft, Steilwand an der Wand …) und
# Fernsicht von der Seite (ganzes Bauwerk mit Fahrbahn davor/dahinter). quer + hoch, alter und neuer Stand.
# Aufruf: python3 tests/stuntgroesse_shots.py quer|hoch [Wurzel] [Name]   (Wurzel = alter Stand, Name z. B. vorher)
#         → tests/shots/stuntgroesse/<name>_<modus>_<stunt>_<kamera>.png
import sys, os, time, json, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from util import *
from hochformat_util import DEVICES

mode = sys.argv[1] if len(sys.argv) > 1 else 'quer'
root = sys.argv[2] if len(sys.argv) > 2 and sys.argv[2] != '.' else ROOT
name = sys.argv[3] if len(sys.argv) > 3 else 'nachher'
only = sys.argv[4].split(',') if len(sys.argv) > 4 else None
dev = DEVICES['pixel7q' if mode == 'quer' else 'pixel7']['ctx']
SUB = 'stuntgroesse'

# Stunt → (Galerie, Stück-Art, Moment als JS-Bedingung über g = __game, r = Rennen, c = Auto, L = Linie, i = Index, P = Stück)
MOMENTS = [
    ('looping', '', 'loop', "L.loop[i] && c.frame.u.y < -0.7"),
    ('roehre', '', 'tube', "L.tube[i] && i > (P.lineStart + P.lineEnd) / 2"),
    ('korkenzieher', '', 'tr_corklr', "L.loop[i] && c.frame.u.y < -0.2"),
    ('schanze', '', 'jump', "c.onGround === 0 && c.airTime > 0.4 && c.v.y < 0.5"),
    ('wellen', '', 'waves', "c.onGround === 0 && c.airTime > 0.1"),
    ('steilwand', '', 'wall', "c.frame.u.y < 0.45"),
    ('klippe', '', 'cliff', "c.onGround === 0 && c.airTime > 0.35"),
    ('kuppe', '', 'crest', "i > P.lineStart + (P.lineEnd - P.lineStart) * 0.45"),
    ('bodenwellen', '', 'bumps', "i > P.lineStart + (P.lineEnd - P.lineStart) * 0.5"),
    ('halfpipe', 'gel', 'halfpipe', "i > P.lineStart + (P.lineEnd - P.lineStart) * 0.5"),
    ('schlucht', 'gel', 'jump', "c.onGround === 0 && c.airTime > 0.5 && c.v.y < 0.5"),
]
if only: MOMENTS = [m for m in MOMENTS if m[0] in only]

FIND = """(t) => { const g = __game, T = g.env.track, L = T.line;
  const k = T.pieces.findIndex((p) => p.type === t.type && (!t.gorge || (g.env.layout && g.env.layout.pieces[T.pieces.indexOf(p)] && g.env.layout.pieces[T.pieces.indexOf(p)].g === 'gorge')));
  if (k < 0) return null;
  const P = T.pieces[k]; let j = P.lineStart, acc = 0;
  while (acc < t.back) { const q = j > 0 ? j - 1 : L.n - 2; acc += Math.hypot(L.px[j] - L.px[q], L.pz[j] - L.pz[q]); j = q; }
  return { k, j, v: g.env.prof.vt[j], a: P.lineStart, b: P.lineEnd }; }"""
COND = """(o) => { const g = __game, r = g.race, c = r.car, L = g.env.track.line, i = r.tracker.idx, P = g.env.track.pieces[o.k];
  const inP = i >= P.lineStart && i <= P.lineEnd; return { hit: inP && (%s), inP, past: i > P.lineEnd + 5 && i < P.lineEnd + 400, crash: !!c.crash }; }"""
FAR = """(o) => { const g = __game, T = g.env.track, L = T.line, P = T.pieces[o.k], cam = g.camera;
  let cx = 0, cy = 0, cz = 0, n = 0, y0 = 1e9, y1 = -1e9, x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
  for (let i = P.lineStart; i <= P.lineEnd; i++) { cx += L.px[i]; cy += L.py[i]; cz += L.pz[i]; n++; y0 = Math.min(y0, L.py[i]); y1 = Math.max(y1, L.py[i]); x0 = Math.min(x0, L.px[i]); x1 = Math.max(x1, L.px[i]); z0 = Math.min(z0, L.pz[i]); z1 = Math.max(z1, L.pz[i]); }
  cx /= n; cz /= n; const span = Math.max(x1 - x0, z1 - z0, 30), H = y1 - y0;
  const m = (P.lineStart + P.lineEnd) >> 1;
  // seitlich (rechts der Fahrtrichtung in der Stückmitte), Abstand so, dass Bauwerk + Fahrbahn davor/dahinter ins Bild passen
  const d = o.portrait ? Math.max(60, span * 1.05) : Math.max(48, span * 0.7), h = Math.max(14, H * 0.6 + 12);
  // Seite mit freier Sicht aufs Bauwerk (Steilwand: von innen, nicht auf die Rückwand)
  let best = null;
  for (const sd of [1, -1]) {
    const sx = cx + L.bx[m] * d * sd, sz = cz + L.bz[m] * d * sd, ground = T.terrain && T.terrain.height ? T.terrain.height(sx, sz) : 0;
    const py = Math.max(y0 + h, ground + 3), tyy = y0 + H * 0.45 + 1;
    let free = 0;
    for (let q = P.lineStart; q <= P.lineEnd; q += Math.max(1, (P.lineEnd - P.lineStart) >> 4)) {
      const dx = L.px[q] - sx, dy = L.py[q] + 1 - py, dz = L.pz[q] - sz, len = Math.hypot(dx, dy, dz);
      const hit = g.env.world.rayTrack(sx, py, sz, dx / len, dy / len, dz / len, len - 1.5, false);
      if (!hit) free++;
    }
    if (!best || free > best.free) best = { sx, sz, py, free };
  }
  let sx = best.sx, sz = best.sz, py = best.py, lx = cx, ly = y0 + H * 0.45 + 1, lz = cz;
  if (o.curve) {   // Kurven-Bauwerk (Steilwand): aus der Kurvenmitte über den Bogen auf die Wand
    const ix = cx - L.px[m], iz = cz - L.pz[m], il = Math.hypot(ix, iz) || 1, D = o.portrait ? 110 : 95;
    sx = L.px[m] + ix / il * D; sz = L.pz[m] + iz / il * D; py = y0 + 16; lx = L.px[m]; lz = L.pz[m]; ly = y0 + H * 0.5;
  }
  if (o.along) {   // im Tal (Halfpipe): von schräg oben hinter dem Stück die Strecke entlang
    const a = P.lineStart, tx0 = L.tx[a], tz0 = L.tz[a], tl = Math.hypot(tx0, tz0) || 1;
    sx = L.px[a] - tx0 / tl * 35; sz = L.pz[a] - tz0 / tl * 35; py = L.py[a] + 32; lx = L.px[m]; lz = L.pz[m]; ly = L.py[m];
  }
  cam.position.set(sx, py, sz);
  cam.up.set(0, 1, 0); cam.lookAt(lx, ly, lz);
  cam.fov = o.portrait ? 62 : 40; cam.updateProjectionMatrix();
  // Bäume/Deko (Instanzen) in der Sichtlinie nahe der Kamera ausblenden (nur fürs Foto; RESTORE stellt sie wieder her)
  const tx = cx, tz = cz, cxp = cam.position.x, czp = cam.position.z, M = new cam.matrix.constructor(), Q = cam.position.clone(), hid = [];
  g.scene.traverse((ob) => { if (!ob.isInstancedMesh || !ob.visible) return; for (let q = 0; q < ob.count; q++) {
    ob.getMatrixAt(q, M); Q.setFromMatrixPosition(M).applyMatrix4(ob.matrixWorld);
    const vx = tx - cxp, vz = tz - czp, L2 = vx * vx + vz * vz, u = ((Q.x - cxp) * vx + (Q.z - czp) * vz) / L2;
    if (u < 0 || u > 0.75) continue; const ex = cxp + vx * u - Q.x, ez = czp + vz * u - Q.z;
    if (ex * ex + ez * ez < 64) { hid.push([ob, q, M.clone()]); M.makeScale(0, 0, 0); ob.setMatrixAt(q, M); ob.instanceMatrix.needsUpdate = true; } } });
  window.__n26hid = hid;
  return { d, h, span, H, hidden: hid.length }; }"""
RESTORE = """() => { for (const [ob, q, M] of window.__n26hid || []) { ob.setMatrixAt(q, M); ob.instanceMatrix.needsUpdate = true; } window.__n26hid = []; }"""

# Reihenfolge entlang der Strecke (nur vorwärts versetzen: rückwärts hält die Fortschritts-Überwachung das Auto für
# „Festgefahren“) – Index des ersten Stücks je Art in der jeweiligen Galerie
out = []
with Server(root) as srv, sync_playwright() as pw:
    s = Session(pw, srv.base, device=dev)
    loaded = None
    def piece_index(gal, typ, tag):
        return s.ev("(t) => __game.env.track.pieces.findIndex((p, k) => p.type === t.type && (!t.gorge || (__game.env.layout.pieces[k] || {}).g === 'gorge'))", {'type': typ, 'gorge': tag == 'schlucht'})
    plan = []
    for gal in ['', 'gel']:
        mm = [m for m in MOMENTS if m[1] == gal]
        if not mm: continue
        s.pg.goto(srv.base + 'index.html?nosw&q=2&gallery' + ('=gel' if gal else ''))
        s.pg.wait_for_function("window.__app && window.__app.ready && window.__app.frames > 3", timeout=300000)
        plan += sorted(mm, key=lambda m: piece_index(gal, m[2], m[0]))
        loaded = None
    for tag, gal, typ, cond in plan:
        if gal != loaded:
            s.pg.goto(srv.base + 'index.html?nosw&q=2&gallery' + ('=gel' if gal else ''))
            s.pg.wait_for_function("window.__app && window.__app.ready && window.__app.frames > 3", timeout=300000)
            s.ev("__game.setAssist('easy'); __game.setLine && __game.setLine('off'); __game.store.settings.fahrstil = 'sauber'")
            s.ev("__game.start({autopilot: true})"); s.ev("__game.sim(3.6)")
            loaded = gal
        o = s.ev(FIND, {'type': typ, 'back': 70, 'gorge': tag == 'schlucht'})
        if not o:
            print(tag, 'kein Stück', typ, flush=True); continue
        o['portrait'] = mode == 'hoch'; o['curve'] = typ == 'wall'; o['along'] = typ == 'halfpipe'
        res = {'stunt': tag}
        for cam in ['chase', 'fern']:
            hit = None
            # Anlauf 70 m, bei Fehlschlag (Crash, Stelle verpasst, zu langsam am Galerie-Start) 150 bzw. 230 m
            for back in [70, 150, 230]:
                oo = s.ev(FIND, {'type': typ, 'back': back, 'gorge': tag == 'schlucht'})
                c0 = s.ev("__game.state().crashes")
                s.ev(f"__game.teleport({oo['j']}, {oo['v']}); __game.race.stuckProg = -1e9"); s.ev("__game.cam('chase')"); s.ev("__game.setTimeScale(0.3)")
                t0 = time.time()
                while time.time() - t0 < 60:
                    st = s.ev(COND % cond, o)
                    if st['hit'] and s.ev("__game.state().crashes") == c0: hit = st; break
                    if st['past'] or st['crash'] or s.ev("__game.state().crashes") > c0: break
                    time.sleep(0.02)
                if hit: break
                s.ev("__game.setTimeScale(1)")
            s.ev("__game.freeze(true)")
            if cam == 'fern':
                s.ev("window.__app.freezeCam = true")
                res['fern'] = s.ev(FAR, o)
            s.frames(6); time.sleep(0.5)
            s.shot(f'{name}_{mode}_{tag}_{cam}', SUB)
            s.ev(RESTORE)
            s.ev("window.__app.freezeCam = false; __game.freeze(false); __game.setTimeScale(1)")
            res[cam] = bool(hit)
        st = s.ev("__game.state()")
        res['crashes'] = st['crashes']; res['crash'] = st['crash'] and st['crash'].get('reason')
        print(json.dumps(res), flush=True)
        out.append(res)
    print('Fehler', s.errors[:6])
    json.dump({'shots': out, 'errors': s.errors}, open(os.path.join(ROOT, 'tests', 'shots', SUB, f'{name}_{mode}.json'), 'w'))
    s.close()
