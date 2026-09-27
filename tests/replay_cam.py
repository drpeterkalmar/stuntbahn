import sys, time, json
sys.path.insert(0, 'tests')
from util import *
with Server() as srv, sync_playwright() as pw:
    s = Session(pw, srv.base, device=dict(viewport={"width": 960, "height": 432}, device_scale_factor=1))
    s.open('?nosw&seed=1000&d=1')
    s.ev("__game.setAssist('easy'); __game.start({autopilot:true})")
    for k in range(40):
        st = s.ev("__game.sim(2.0)")
        if st['state'] == 'finished': break
    s.ev("__game.replay()")
    for cam in ['chase', 'far']:
        s.ev(f"__game.cam('{cam}')")
        out = []
        for k in range(6):
            time.sleep(0.8)
            out.append(s.ev("""(() => { const g=__game, c=g.camera.position; const r=g.scene.getObjectByName('car'); const p=r.position;
              const f=new r.position.constructor(0,0,-1).applyQuaternion(r.quaternion); const d=p.clone().sub(c).normalize();
              return +(d.x*f.x+d.y*f.y+d.z*f.z).toFixed(2); })()"""))
        print(cam, 'dot(Blick, Fahrtrichtung) =', out)
    s.close()
