import sys, time
sys.path.insert(0, 'tests')
from util import *
variants = [('aces', 1.0, 1.0, 3.4), ('neutral', 1.0, 1.7, 3.0), ('agx', 1.2, 1.7, 3.2), ('neutral', 1.15, 2.2, 2.8)]
with Server() as srv, sync_playwright() as pw:
    for k, (tm, ex, env, sun) in enumerate(variants):
        s = Session(pw, srv.base, device=dict(viewport={"width": 960, "height": 432}, device_scale_factor=1))
        s.open(f'?nosw&gallery&tm={tm}&exp={ex}&env={env}&sun={sun}')
        s.ev("__game.start({autopilot:true})")
        idx = s.ev("""(() => { const e=__game.env, L=e.track.line; for(let i=0;i<L.n;i++) if (e.layout.pieces[L.piece[i]].type==='bridge') return i; })()""")
        s.ev(f"""(() => {{ const g=__game, L=g.env.track.line, i={idx}; g.teleport(i-30, 0); g.freeze(true); window.__app.freezeCam=true;
          const c=g.camera; const p=[L.px[i],L.py[i],L.pz[i]]; const b=[L.bx[i],L.by[i],L.bz[i]]; const t=[L.tx[i],L.ty[i],L.tz[i]];
          c.position.set(p[0]+b[0]*24-t[0]*22, 4, p[2]+b[2]*24-t[2]*22); c.up.set(0,1,0); c.lookAt(p[0]-t[0]*8,3,p[2]-t[2]*8); }})()""")
        s.frames(3); time.sleep(0.5)
        s.shot(f'light_{k}_{tm}_{ex}_{env}_{sun}', 'debug')
        s.close()
