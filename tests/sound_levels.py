import sys, time, json
sys.path.insert(0, 'tests')
from util import *
with Server() as srv, sync_playwright() as pw:
    s = Session(pw, srv.base, device=DESKTOP)
    s.open('?nosw&seed=1000&d=1')
    s.tap('button[data-a=start]'); time.sleep(5)
    lv = s.ev("""(() => { const S = window.__soundRef, B = S.bank; const db = (x) => +(20 * Math.log10(Math.max(1e-9, x))).toFixed(1);
      const m = (buf) => { const a = buf.getChannelData(0); let pk = 0, sq = 0; for (let i = 0; i < a.length; i++) { const v = Math.abs(a[i]); if (v > pk) pk = v; sq += a[i] * a[i]; } return { peak_dBFS: db(pk), rms_dBFS: db(Math.sqrt(sq / a.length)), s: +(a.length / buf.sampleRate).toFixed(2) }; };
      const o = {}; B.engine.forEach((e) => o['motor_' + e.rpm] = m(e.buf)); for (const k of ['tire', 'wind', 'crash', 'thump', 'beep', 'go', 'cp', 'finish']) o[k] = m(B[k]); o.ctx = S.ctx.state; o.sampleRate = S.ctx.sampleRate; return o; })()""")
    print(json.dumps(lv, indent=1))
    print('errors', s.errors[:4])
    s.close()
