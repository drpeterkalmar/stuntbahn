# n31 TAAU: deterministische Bildfolge für Bildvergleiche – requestAnimationFrame per Testhaken, jedes Bild genau 1/60 s,
# alle Varianten zeigen in Bild n exakt dieselbe Szene (Gegenprobe: Referenz gegen sich selbst, Abweichung 0,02/255).
# Aufruf: python3 tests/taau_folge.py <tag> <kamera> <bild,bild,…> name=URL-Zusatz[|JS nach dem Laden] …
#   z. B. … t5 chase 180,300,420,540 ss='&taa=0|__game.kino.renderScale = 2' msaa='&taa=0' taau='&taa=1'
#   (ss = Bezug: Renderskala 2 + MSAA 4 = 16 Abtastungen je Pixel)
# Umgebung: BLUR=off|light|strong (Bewegungsunschärfe, Standard off), Q=Grafikstufe (2), PAAR=1 (je Stelle auch das
#   Folgebild, für den Flimmerfehler), STAND=n (n Bilder fahren, dann anhalten; Bildnummern ab dem Anhalten),
#   PRE=JS (nach dem Anhalten, z. B. Kamera setzen + window.__pre = Schwenk je Bild)
# Bilder: tests/out/taau/<tag>_<name>_<bild>[b].png – Bewertung: python3 tests/taau_wertung.py <tag> <bezug> <name> …
import sys, os, time, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from util import *
OUT = os.path.join(ROOT, 'tests', 'out', 'taau'); os.makedirs(OUT, exist_ok=True)
tag, cam, fr = sys.argv[1], sys.argv[2], [int(v) for v in sys.argv[3].split(',')]
VAR = [a.split('=', 1) for a in sys.argv[4:]]
PAAR = os.environ.get('PAAR') == '1'   # je Stelle auch das Folgebild (Flimmer-Messung)
blur = os.environ.get('BLUR', 'off')
INIT = """(() => { const q = []; const orig = window.requestAnimationFrame.bind(window); let manual = false, t = 0;
  window.requestAnimationFrame = (cb) => { if (!manual) return orig(cb); q.push(cb); return q.length; };
  window.__manual = () => { manual = true; t = performance.now(); };
  window.__step = (n) => { for (let i = 0; i < n; i++) { if (window.__pre) window.__pre(); t += 1000 / 60; const c = q.splice(0); for (const f of c) f(t); } return q.length; }; })()"""
with Server(ROOT) as srv, sync_playwright() as pw:
    for name, zus in VAR:
        js = None
        if '|' in zus: zus, js = zus.split('|', 1)
        s = Session(pw, srv.base)
        s.ctx.add_init_script(INIT)
        s.pg.close(); s.pg = s.ctx.new_page()
        s.pg.on("pageerror", lambda e: s.errors.append("PAGEERROR " + str(e)))
        try:
            s.open(f'?nosw&q={os.environ.get("Q", "2")}&startprobe=0&seed=4711&d=3&g=1&reflex=0&blur={blur}' + zus)
            s.ev("window.__app.fixTime = 12.5")
            if js: s.ev(js)
            s.ev("window.__manual()"); time.sleep(0.3); s.ev("window.__step(2)")
            s.ev("__game.setAssist('easy'); __game.store.settings.fahrstil = 'sauber'; __game.start({ autopilot: true }); __game.cam('%s')" % cam)
            done = 0
            if os.environ.get('STAND'):   # erst fahren, dann anhalten: Bildnummern zählen ab dem Anhalten
                n0 = int(os.environ['STAND'])
                while done < n0: s.ev("window.__step(30)"); done += 30
                s.ev("__game.freeze(true)"); done = 0
                if os.environ.get('PRE'): s.ev(os.environ['PRE'])   # z. B. Kamera setzen + window.__pre (Schwenk je Bild)
            for f in fr:
                while done < f:
                    k = min(30, f - done); s.ev(f"window.__step({k})"); done += k
                time.sleep(0.05)
                s.pg.screenshot(path=f'{OUT}/{tag}_{name}_{f}.png')
                if PAAR:
                    s.ev("window.__step(1)"); done += 1; time.sleep(0.05)
                    s.pg.screenshot(path=f'{OUT}/{tag}_{name}_{f}b.png')
            print(name, 'ok', s.ev("JSON.stringify(__game.kino.describe().taa)")[:160], s.errors[:3], flush=True)
        finally: s.close()
