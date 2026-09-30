# n19: Fotos der neuen 3D-Streckenteile in der Galerie (?gallery) – Außenansicht je Teil, quer (Pixel 7) und hoch.
# Aufruf: python3 tests/strecken3d_shots.py [quer|hoch] [Teile …]   → tests/shots/strecken3d/
import sys, time
sys.path.insert(0, 'tests')
from util import *
mode = sys.argv[1] if len(sys.argv) > 1 else 'quer'
only = sys.argv[2:]
PIXEL7_PORT = dict(PIXEL7_LAND, viewport={"width": 412, "height": 915})
# (Name, Stück-Index in der Galerie, Blick: zurück, seitlich, hoch, Zielhöhe)
VIEWS = [
  ('spirale_aussen', 'spiral', 1, dict(back=-10, side=-95, up=30, ty=6, at=0.5)),
  ('spirale2_aussen', 'spiral', 2, dict(back=-20, side=110, up=40, ty=10, at=0.5)),
  ('ueberfuehrung_oben', 'cross', 0, dict(back=40, side=35, up=34, ty=4, at=0.5)),
  ('ueberfuehrung_unten', 'cross', 1, dict(back=25, side=6, up=1.2, ty=4, at=0.5)),
  ('wellen', 'waves', 1, dict(back=20, side=30, up=8, ty=1, at=0.5)),
  ('steilwand', 'wall', 1, dict(back=-30, side=-70, up=16, ty=4, at=0.5)),
  ('klippe', 'cliff', 1, dict(back=10, side=60, up=10, ty=0, at=0.45)),
  ('klippe2', 'cliff2', 1, dict(back=10, side=70, up=14, ty=-4, at=0.45)),
  ('steilabfahrt', 'slope4', 1, dict(back=30, side=60, up=20, ty=6, at=0.5)),
  ('steilauffahrt', 'slope3', 1, dict(back=30, side=-60, up=16, ty=4, at=0.5)),
  ('wendel', 'tr_corkud', 1, dict(back=10, side=70, up=20, ty=3, at=0.5)),
  ('korkenzieher', 'tr_corklr', 1, dict(back=20, side=30, up=8, ty=3, at=0.5)),
  ('steilkurve_trk', 'tr_bankC', 1, dict(back=20, side=-50, up=14, ty=2, at=0.5)),
]
dev = PIXEL7_PORT if mode == 'hoch' else PIXEL7_LAND
with Server() as srv, sync_playwright() as pw:
    s = Session(pw, srv.base, device=dev)
    s.open('?nosw&gallery')
    s.ev("__game.start({autopilot:true})")
    s.ev("__game.sim(3.2)")
    s.ev("__game.freeze(true); window.__app.freezeCam = true; __game.ui.show && 0")
    for name, typ, nth, v in VIEWS:
        if only and name not in only: continue
        # Stück finden: typ (nth-tes Vorkommen, 1-basiert) oder 'cross' = die Überführung (Gerade über Gerade)
        r = s.ev(f"""(() => {{
          const g = __game, e = g.env, L = e.track.line, P = e.layout.pieces;
          let k = -1, c = 0;
          if ('{typ}' === 'cross') {{
            const cells = new Map(); P.forEach((p, i) => {{ const key = p.i + ',' + p.j; if (!cells.has(key)) cells.set(key, []); cells.get(key).push(i); }});
            for (const L2 of cells.values()) if (L2.length > 1) {{ const a = L2.map((i) => P[i]).sort((x, y) => (y.lvl || 0) - (x.lvl || 0)); k = P.indexOf(a[{nth}]); }}
          }} else for (let i = 0; i < P.length; i++) if (P[i].type === '{typ}' && ++c === {nth}) {{ k = i; break; }}
          if (k < 0) return null;
          const ids = []; for (let i = 0; i < L.n; i++) if (L.piece[i] === k) ids.push(i);
          const i = ids[Math.floor(ids.length * {v['at']})], a = ids[0], b = ids[ids.length - 1];
          // Mitte des Stücks (Draufsicht), Richtung = Ein → Aus
          let cx = 0, cy = 0, cz = 0; for (const q of ids) {{ cx += L.px[q]; cy += L.py[q]; cz += L.pz[q]; }} cx /= ids.length; cy /= ids.length; cz /= ids.length;
          let tx = L.px[b] - L.px[a], tz = L.pz[b] - L.pz[a]; const tl = Math.hypot(tx, tz) || 1; tx /= tl; tz /= tl;
          if ('{typ}' === 'cross') {{ cx = L.px[i]; cy = L.py[i]; cz = L.pz[i]; tx = L.tx[i]; tz = L.tz[i]; const l2 = Math.hypot(tx, tz); tx /= l2; tz /= l2; }}
          const bx = -tz, bz = tx;
          const c2 = g.camera;
          c2.position.set(cx - tx * {v['back']} + bx * {v['side']}, Math.max(cy, 0) + {v['up']}, cz - tz * {v['back']} + bz * {v['side']});
          c2.up.set(0, 1, 0); c2.lookAt(cx, cy + {v['ty']}, cz);
          c2.fov = 60; c2.updateProjectionMatrix();
          return [k, ids.length];
        }})()""")
        if not r: print('nicht gefunden', name); continue
        s.frames(4); time.sleep(0.6)
        p = s.shot(f'{name}_{mode}', 'strecken3d')
        print('Foto', p, r)
    print('Fehler', s.errors[:10])
    s.close()
