# Galerie: Standbilder bestimmter Elemente (Looping, Röhre, Steilkurve, Schanze, Brücke) + Auto-Nahaufnahme.
import sys, time, json
sys.path.insert(0, 'tests')
from util import *
sub = sys.argv[1] if len(sys.argv) > 1 else 'gallery'
with Server() as srv, sync_playwright() as pw:
    s = Session(pw, srv.base)
    s.open('?nosw&demo')
    s.ev("__game.start({autopilot:true})")
    s.ev("__game.sim(3.2)")
    def at_type(t, frac=0.5):
        return s.ev(f"""(() => {{ const e=__game.env, L=e.track.line; const ids=[]; for(let i=0;i<L.n;i++) if (e.layout.pieces[L.piece[i]].type==='{t}') ids.push(i); return ids.length? ids[Math.floor(ids.length*{frac})] : -1; }})()""")
    def look(idx, back=30, side=14, up=9, name='x'):
        s.ev(f"""(() => {{ const g=__game, L=g.env.track.line, i={idx}; g.teleport(Math.max(0,i-5), 0); g.freeze(true); window.__app.freezeCam=true;
          const c=g.camera; const p=[L.px[i],L.py[i],L.pz[i]]; const t=[L.tx[i],L.ty[i],L.tz[i]]; const b=[L.bx[i],L.by[i],L.bz[i]];
          c.position.set(p[0]-t[0]*{back}+b[0]*{side}, Math.max(p[1],0)+{up}, p[2]-t[2]*{back}+b[2]*{side}); c.up.set(0,1,0); c.lookAt(p[0],Math.max(p[1],0)+2,p[2]); }})()""")
        s.frames(4); time.sleep(0.8)
        s.shot(name, sub)
    for t, nm in [('loop', 'g_loop'), ('jump', 'g_jump'), ('turnL', 'g_turn'), ('start', 'g_start'), ('checkpoint', 'g_cp')]:
        i = at_type(t)
        if i >= 0: look(i, name=nm)
    # Auto-Nahaufnahme
    s.ev("""(() => { const g=__game; g.freeze(false); window.__app.freezeCam=false; g.teleport(40, 0); })()""")
    s.ev("__game.sim(0.5)")
    s.ev("""(() => { const g=__game; g.freeze(true); window.__app.freezeCam=true; const c=g.camera, p=g.race.car.pos, f=g.race.car.frame.f, r=g.race.car.frame.r;
      c.position.set(p.x+f.x*5+r.x*3.5, p.y+1.4, p.z+f.z*5+r.z*3.5); c.up.set(0,1,0); c.lookAt(p.x,p.y+0.2,p.z); })()""")
    s.frames(4); time.sleep(0.8); s.shot('g_car', sub)
    print('errors', s.errors[:10])
    s.close()
