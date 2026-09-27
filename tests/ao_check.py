import sys, time, json
sys.path.insert(0, 'tests')
from util import *
with Server() as srv, sync_playwright() as pw:
    s = Session(pw, srv.base, device=dict(viewport={"width": 1280, "height": 576}, device_scale_factor=1))
    s.open('?nosw&gallery')
    print('buildMs', s.ev("Math.round(__game.env.buildMs)"), 'aoRays', s.ev("__game.scene.getObjectByName('world').userData.stats.aoRays"))
    s.ev("__game.start({autopilot:true})")
    for t, back, side, up in [('bridge', 18, 26, 6), ('loop', 20, 18, 7), ('rampUp', 16, 14, 5)]:
        idx = s.ev(f"""(() => {{ const e=__game.env, L=e.track.line; for(let i=0;i<L.n;i++) if (e.layout.pieces[L.piece[i]].type==='{t}') return i+10; }})()""")
        s.ev(f"""(() => {{ const g=__game, L=g.env.track.line, i={idx}; g.teleport(Math.max(0,i-60), 0); g.freeze(true); window.__app.freezeCam=true;
          const c=g.camera; const p=[L.px[i],L.py[i],L.pz[i]]; const b=[L.bx[i],L.by[i],L.bz[i]]; const tt=[L.tx[i],L.ty[i],L.tz[i]];
          c.position.set(p[0]+b[0]*{side}-tt[0]*{back}, {up}, p[2]+b[2]*{side}-tt[2]*{back}); c.up.set(0,1,0); c.lookAt(p[0],1,p[2]); }})()""")
        s.frames(3); time.sleep(0.5); s.shot('ao_' + t, 'debug')
    print('errors', s.errors[:5])
    s.close()
