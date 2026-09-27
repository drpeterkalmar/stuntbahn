import sys, time, json
sys.path.insert(0, 'tests')
from util import *
with Server() as srv, sync_playwright() as pw:
    s = Session(pw, srv.base, device=DESKTOP)
    s.open('?nosw&gallery')
    s.ev("__game.start({autopilot:true})")
    idx = s.ev("""(() => { const e=__game.env, L=e.track.line; for(let i=0;i<L.n;i++) if (e.layout.pieces[L.piece[i]].type==='rampUp') return i+15; })()""")
    s.ev(f"""(() => {{ const g=__game, L=g.env.track.line, i={idx}; g.teleport(i-8, 0); g.freeze(true); window.__app.freezeCam=true;
      const c=g.camera; const p=[L.px[i],L.py[i],L.pz[i]]; const b=[L.bx[i],L.by[i],L.bz[i]];
      for (const sg of [1]) {{ c.position.set(p[0]+b[0]*14*sg, 3, p[2]+b[2]*14*sg); c.up.set(0,1,0); c.lookAt(p[0],1.5,p[2]); }} }})()""")
    def px():
        s.frames(3); time.sleep(0.4)
        return s.ev("""(() => { const g=__game.renderer.getContext(); const w=g.drawingBufferWidth, h=g.drawingBufferHeight; __game.renderer.render(__game.scene, __game.camera); const a=new Uint8Array(4); g.readPixels(Math.floor(w/2), Math.floor(h*0.45), 1,1, g.RGBA, g.UNSIGNED_BYTE, a); return Array.from(a); })()""")
    print('normal', px()); s.shot('wall_a', 'debug')
    s.ev("__game.scene.environmentIntensity = 3"); print('env x3', px()); s.shot('wall_b', 'debug')
    s.ev("__game.scene.environmentIntensity = 1; __game.scene.traverse(o=>{ if(o.isDirectionalLight) o.intensity=0; })"); print('no sun', px())
    s.ev("__game.scene.traverse(o=>{ if(o.isDirectionalLight) o.intensity=3.4; }); __game.scene.environment=null"); print('no env', px())
    print('errors', s.errors[:5])
    s.close()
