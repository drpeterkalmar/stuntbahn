# Phase 3: jedes Streckenelement aus erhöhter Seitensicht (Baustein-Galerie) + Autopilot-Fahrt durch alle
import sys, time, json
sys.path.insert(0, 'tests')
from util import *
sub = 'elements'
with Server() as srv, sync_playwright() as pw:
    s = Session(pw, srv.base)
    s.open('?nosw&gallery')
    s.ev("__game.start({autopilot:true})")
    types = s.ev("[...new Set(__game.env.layout.pieces.map(p=>p.type))]")
    print('types', types)
    def look(t, back=26, side=16, up=9, frac=0.5):
        idx = s.ev(f"""(() => {{ const e=__game.env, L=e.track.line; const ids=[]; for(let i=0;i<L.n;i++) if (e.layout.pieces[L.piece[i]].type==='{t}') ids.push(i); return ids.length? ids[Math.floor(ids.length*{frac})] : -1; }})()""")
        if idx < 0: return
        s.ev(f"""(() => {{ const g=__game, L=g.env.track.line, i={idx}; g.teleport(Math.max(0,i-3), 0); g.freeze(true); window.__app.freezeCam=true;
          const c=g.camera; const p=[L.px[i],L.py[i],L.pz[i]]; const t=[L.tx[i],L.ty[i],L.tz[i]]; const b=[L.bx[i],L.by[i],L.bz[i]];
          const h = Math.hypot(t[0], t[2]) || 1;
          c.position.set(p[0]-t[0]/h*{back}+b[0]*{side}, Math.max(p[1],0)+{up}, p[2]-t[2]/h*{back}+b[2]*{side}); c.up.set(0,1,0); c.lookAt(p[0],Math.max(p[1],0)+1.5,p[2]); }})()""")
        s.frames(3); time.sleep(0.6)
        s.shot('e_' + t, sub)
    for t in types:
        look(t)
    # Detail: Looping von nah, Röhre von innen-vorne, Brücke von unten
    look('loop', back=14, side=-9, up=4)
    s.shot('e_loop_near', sub)
    look('tube', back=16, side=0.5, up=2.0, frac=0.05)
    s.shot('e_tube_mouth', sub)
    look('bridge', back=10, side=22, up=1.5)
    s.shot('e_bridge_low', sub)
    # Autopilot fährt die ganze Galerie (offen): Ziel erreicht?
    s.ev("(() => { const g=__game; g.freeze(false); window.__app.freezeCam=false; g.start({autopilot:true}); })()")
    st = s.ev("__game.sim(4)")
    for k in range(40):
        st = s.ev("__game.sim(3)")
        if st['state'] == 'finished' or st['crash']: break
    print('fahrt', json.dumps({k: st[k] for k in ['state', 'time', 'idx', 'n', 'crashes', 'rewinds', 'crash']}))
    print('errors', s.errors[:10])
    s.close()
