# Leistung vorher/nachher (Weltmaßstab, 27.09.2026): Ladezeit, Streckenbau, Bildrate und Last im Handy-Profil
# (Pixel 7 quer, Qualitätsstufe fest 0 bzw. 1), Autopilot fährt, Verfolger-Kamera.
# Aufruf: python3 tests/perf_welt.py [Wurzelordner] [Zusatz-Parameter …]
#   z. B. python3 tests/perf_welt.py /pfad/zu/HEAD-Kopie        (alter Stand)
#         python3 tests/perf_welt.py . '&welt=1'                (neuer Code, alter Maßstab)
# Ausgabe: eine JSON-Zeile je Stufe/Strecke (für die Tabelle im Bericht).
import sys, time, json
from util import Server, Session, ROOT, PIXEL7_LAND
from playwright.sync_api import sync_playwright

root = sys.argv[1] if len(sys.argv) > 1 else ROOT
extra = sys.argv[2] if len(sys.argv) > 2 else ''
TRACKS = [('Tag 20260927-2', 'seed=20260927&d=2'), ('4711-3', 'seed=4711&d=3'), ('Showcase', 'trk=demo-rundkurs')]

with Server(root) as srv, sync_playwright() as pw:
    for name, q in TRACKS:
        for tier in (0, 1):
            s = Session(pw, srv.base, device=PIXEL7_LAND)
            t0 = time.time()
            s.open(f'?nosw&{q}&q={tier}{extra}')
            boot = time.time() - t0
            build = s.ev("__game.env.buildMs")
            s.ev("__game.start({ autopilot: true })")
            s.frames(30)
            s.ev("__game.sim(4)")          # ein Stück in die Strecke
            s.frames(30)
            # 6 s echte Bildrate (rAF, gedeckelt bei ~60 Hz), dazu Draw-Calls/Dreiecke im letzten Bild
            f0 = s.ev("[__app.frames, performance.now()]"); time.sleep(6); f1 = s.ev("[__app.frames, performance.now()]")
            fps = (f1[0] - f0[0]) / (f1[1] - f0[1]) * 1000
            info = s.ev("__game.info()")
            # robuster als rAF-fps (Hintergrundlast): Renderzeit je Bild bei angehaltener Szene bis die GPU fertig ist
            # (1-Pixel-readPixels erzwingt das; Median von 40) und CPU-Zeit der Physik/Spiellogik je Spielsekunde
            render_ms = s.ev("""() => { const G = window.__game, r = G.renderer, gl = r.getContext(), px = new Uint8Array(4); G.freeze(true); const ts = [];
              for (let k = 0; k < 40; k++) { const t0 = performance.now(); r.info.reset(); r.render(G.scene, G.camera); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); ts.push(performance.now() - t0); }
              G.freeze(false); ts.sort((a, b) => a - b); return ts[20]; }""")
            sim_ms = s.ev("() => { const t0 = performance.now(); __game.sim(3); return (performance.now() - t0) / 3; }")
            mem = s.ev("performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1e6) : null")
            ws = s.ev("__game.worldScale || 1")
            out = dict(strecke=name, stufe=tier, welt=ws, boot_s=round(boot, 2), bau_ms=round(build), fps=round(fps, 1), render_ms=round(render_ms, 2), sim_ms_je_s=round(sim_ms, 1), calls=info['calls'], tris=info['tris'], heap_mb=mem, fehler=s.errors[:3])
            print(json.dumps(out, ensure_ascii=False), flush=True)
            s.close()
