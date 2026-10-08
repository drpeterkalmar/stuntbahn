# n31 TAAU: GPU-Zeit einzelner Abschnitte als Füllraten-Probe (Desktop 1920×1080 bei DPR 2 → Kino-Ziel 3840×2160, Spiel
# angehalten): gesamt (KinoLook.render), szene (Szenen-Durchlauf in kino.rt), resolve (TAAU) – je Abschnitt ein eigener
# Browser mit eigener Timer-Abfrage (EXT_disjoint_timer_query_webgl2, nicht verschachtelbar), Median über ~3 s.
# Auf schnellen GPUs ist die Stuntbahn CPU-gebunden; erst bei 4K zählen die Pixel wie auf einem Handy-Bildschirm.
# Aufruf: python3 tests/taau_gpu.py name=URL-Zusatz[|JS nach dem Laden] …   Umgebung: SEGS=gesamt,szene,resolve
#   PATCH=JS-Funktion (fs) => fs für Abwandlungen des Resolve-Shaders (Ablation, ohne Repo-Änderung)
import sys, os, time, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from util import *
import perf_gate as pg
VAR = [a.split('=', 1) for a in sys.argv[1:]]
SEGS = os.environ.get('SEGS', 'gesamt,szene,resolve').split(',')
PATCH = os.environ.get('PATCH', '')   # JS: (fs) => neuer Quelltext
dev = dict(viewport={"width": 1920, "height": 1080}, device_scale_factor=2)
HOOK = """(seg) => { const k = __game.kino, r = __game.renderer, gl = r.getContext(), ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
  const res = []; const offen = [];
  const mess = (fn) => function (...a) { const q = gl.createQuery(); gl.beginQuery(ext.TIME_ELAPSED_EXT, q); const x = fn.apply(this, a); gl.endQuery(ext.TIME_ELAPSED_EXT); offen.push(q); return x; };
  if (seg === 'resolve' && k.taau) k.taau.resolve = mess(k.taau.resolve.bind(k.taau));
  if (seg === 'szene') { const orig = r.render.bind(r); r.render = function (s, c) { if (r.getRenderTarget() === k.rt) return mess(orig)(s, c); return orig(s, c); }; }
  if (seg === 'gesamt') { const o = k.render.bind(k); k.render = mess(o); }
  window.__seg = () => { while (offen.length && gl.getQueryParameter(offen[0], gl.QUERY_RESULT_AVAILABLE)) { const q = offen.shift(); res.push(gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6); gl.deleteQuery(q); } return res; }; }"""
with Server(ROOT) as srv, sync_playwright() as pw:
    for name, zus in VAR:
        js = None
        if '|' in zus: zus, js = zus.split('|', 1)
        out = {}
        for seg in SEGS:
            b = pw.chromium.launch(args=GPU_ARGS + pg.UNGEDECKELT); ctx = b.new_context(**dev); p = ctx.new_page()
            try:
                p.goto(srv.base + 'index.html?nosw&q=2&startprobe=0&seed=4711&d=3&g=1' + zus)
                p.wait_for_function("window.__app && window.__app.ready && window.__app.frames > 3", timeout=300000)
                p.evaluate("__game.setAssist('easy'); __game.store.settings.fahrstil = 'sauber'; __game.start({ autopilot: true }); __game.cam('chase'); __game.sim(4)")
                if js: p.evaluate(js)
                p.evaluate("__game.freeze(true)"); time.sleep(1)
                if PATCH: p.evaluate("(src) => { const m = __game.kino.taau.mat; m.fragmentShader = eval(src)(m.fragmentShader); m.needsUpdate = true; }", PATCH); time.sleep(0.5)
                p.evaluate(HOOK, seg); time.sleep(3)
                r = sorted(p.evaluate("window.__seg()")[20:])
                out[seg] = round(r[len(r)//2], 3) if r else None
            finally: b.close()
        print(name, out, flush=True)
