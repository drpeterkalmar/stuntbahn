# Test-Helfer: eingebauter HTTP-Server (Thread, endet mit dem Skript), Playwright mit
# Pixel-7-Emulation im Querformat, WebGL über die GPU (ANGLE/Metal), Fehler-Sammlung, Screenshots.
import os, sys, time, json, threading, socket, functools
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PIXEL7_LAND = dict(viewport={"width": 915, "height": 412}, device_scale_factor=2.625, is_mobile=True, has_touch=True,
                   user_agent="Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36")
DESKTOP = dict(viewport={"width": 1280, "height": 720}, device_scale_factor=1)
# WebGL headless über die echte GPU (ANGLE/Metal) statt SwiftShader (CPU-Emulation): 27.09.2026 an der
# Schmetterlingswiese gemessen 60 statt 5 fps und 0,2 statt 3 CPU-Kerne bei gleichem Bild.
# --enable-unsafe-swiftshader bleibt nur als Rückfall, falls Metal einmal fehlt (dann warnt _check_gl).
# SwiftShader erzwingen: WEBGL=swiftshader python3 tests/<test>.py
GPU_ARGS = ["--use-angle=metal", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--enable-webgl", "--mute-audio"]   # n32: stumm (Peter 08.10.)
SWIFT_ARGS = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--enable-webgl", "--mute-audio"]
# Linux (omen16, n31): Metal gibt es nicht – ANGLE über Vulkan (RTX 3070), sonst fiele Chromium auf SwiftShader zurück
if sys.platform.startswith('linux'):
    GPU_ARGS = ["--use-gl=angle", "--use-angle=vulkan", "--ignore-gpu-blocklist", "--enable-webgl", "--mute-audio"]
ARGS = SWIFT_ARGS if os.environ.get('WEBGL') == 'swiftshader' else GPU_ARGS
GL_RENDERER = """() => { const gl = document.createElement('canvas').getContext('webgl2'); if (!gl) return 'kein WebGL2';
  const e = gl.getExtension('WEBGL_debug_renderer_info'); return e ? gl.getParameter(e.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER); }"""
_gl_checked = False

class Quiet(SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

class BigQueueServer(ThreadingHTTPServer):
    request_queue_size = 128   # Standard 5 → Verbindungsabbrüche bei vielen parallelen Texturen
    daemon_threads = True

class Server:
    def __init__(self, root=ROOT):
        self.root = root
    def __enter__(self):
        s = socket.socket(); s.bind(('127.0.0.1', 0)); port = s.getsockname()[1]; s.close()
        self.httpd = BigQueueServer(('127.0.0.1', port), functools.partial(Quiet, directory=self.root))
        self.t = threading.Thread(target=self.httpd.serve_forever, daemon=True); self.t.start()
        self.base = f'http://127.0.0.1:{port}/'
        return self
    def __exit__(self, *a):
        self.httpd.shutdown(); self.httpd.server_close()

class Session:
    def __init__(self, pw, base, device=PIXEL7_LAND, dpr=None, storage=None, kino=False, offen=False):
        self.base = base
        # offen=True (n30): Browser per `open` statt als Kindprozess starten – nötig für echte Bildraten/Zeitmessung, wenn
        # das Skript aus einer Hintergrund-Queue läuft (macOS drosselt sonst die Zeitgeber des ganzen Prozessbaums,
        # siehe tests/perf_gate.py OffenerBrowser). Auch per Umgebung: BROWSER=open
        if (offen or os.environ.get('BROWSER') == 'open') and sys.platform == 'darwin':   # Linux (n31): nicht nötig, `open` gibt es nicht
            from perf_gate import OffenerBrowser
            self.b = OffenerBrowser(pw, ARGS)
        else:
            self.b = pw.chromium.launch(args=ARGS)
        opts = dict(device)
        if dpr: opts['device_scale_factor'] = dpr
        if storage: opts['storage_state'] = storage
        self.ctx = self.b.new_context(**opts)
        # Kino-Replay nach dem Ziel (n18, Standard an) für die älteren Tests aus: sie erwarten das Ergebnis direkt nach
        # dem Ziel. tests/test_kinoreplay.py schaltet ihn mit kino=True ein (oder KINO=1 für alle Tests).
        # Zielshow (n27) ebenso: window.__noShow = Ergebnis gleich (das Auslaufen wird sofort vorgerechnet)
        if not kino and os.environ.get('KINO') != '1':
            self.ctx.add_init_script("window.__noKino = true; window.__noShow = true")
        self.pg = self.ctx.new_page()
        self.errors = []; self.console = []
        self.pg.on("pageerror", lambda e: self.errors.append("PAGEERROR " + str(e)))
        self.warnings = []
        self.pg.on("requestfailed", lambda r: (self.warnings if 'ERR_ABORTED' in str(r.failure) else self.errors).append("REQFAIL " + r.url + " " + str(r.failure)))
        self.pg.on("console", lambda m: (self.console.append(m.type + ": " + m.text), self.errors.append("CONSOLE " + m.text) if m.type == "error" else None))
    def open(self, q='?nosw', timeout=400000):
        t0 = time.time()
        self.pg.goto(self.base + 'index.html' + q)
        while True:
            try:
                self.pg.wait_for_function("window.__app && window.__app.ready && window.__app.frames > 3", timeout=20000)
                break
            except Exception:
                if any(e.startswith('PAGEERROR') for e in self.errors):
                    print('BOOT FEHLER', self.errors[:5]); raise
                if (time.time() - t0) * 1000 > timeout:
                    print('BOOT TIMEOUT', self.errors[:5]); raise
                print('  … lädt noch', round(time.time() - t0), 's, frames', self.ev("window.__app ? window.__app.frames : -1"), flush=True)
        self.boot_s = time.time() - t0
        self._check_gl()
    def _check_gl(self):
        # einmal pro Testlauf: meldet, falls statt der GPU die CPU-Emulation rendert (still langsam)
        global _gl_checked
        if _gl_checked: return
        _gl_checked = True
        try: r = self.ev(GL_RENDERER)
        except Exception as e: r = 'unbekannt (' + str(e)[:80] + ')'
        if ARGS is GPU_ARGS and 'Metal' not in str(r) and 'Vulkan' not in str(r):
            print('WARNUNG WebGL läuft nicht auf der GPU:', r, file=sys.stderr, flush=True)
    def ev(self, js, arg=None):
        return self.pg.evaluate(js, arg) if arg is not None else self.pg.evaluate(js)
    def shot(self, name, sub=''):
        d = os.path.join(ROOT, 'tests', 'shots', sub) if sub else os.path.join(ROOT, 'tests', 'shots')
        os.makedirs(d, exist_ok=True)
        p = os.path.join(d, f'{name}.png')
        self.pg.screenshot(path=p)
        return p
    def frames(self, n=3, timeout=60000):
        f0 = self.ev("window.__app.frames")
        self.pg.wait_for_function(f"window.__app.frames >= {f0 + n}", timeout=timeout)
    def tap(self, sel):
        el = self.pg.locator(sel).first
        el.wait_for(state='visible', timeout=20000)
        el.scroll_into_view_if_needed(timeout=5000)   # Hochformat: Menü/Karten scrollen
        box = el.bounding_box()
        try:
            self.pg.touchscreen.tap(box['x'] + box['width'] / 2, box['y'] + box['height'] / 2)
        except Exception:   # Desktop-Kontext ohne Touch: Mausklick
            self.pg.mouse.click(box['x'] + box['width'] / 2, box['y'] + box['height'] / 2)
        time.sleep(0.2)
    def state(self):
        return self.ev("__game.state()")
    def small_buttons(self):
        # alle sichtbaren Buttons < 48 px oder außerhalb des Viewports
        return self.ev("""() => { const out=[]; const W=innerWidth,H=innerHeight;
          for (const b of document.querySelectorAll('button, #touch .tb')) { const r=b.getBoundingClientRect(); const st=getComputedStyle(b);
            if (!r.width || st.display==='none' || st.visibility==='hidden' || b.offsetParent===null) continue;
            if (r.width < 47.5 || r.height < 47.5 || r.left < -1 || r.top < -1 || r.right > W+1 || r.bottom > H+1) out.push({t:(b.textContent||'').trim().slice(0,24), w:Math.round(r.width), h:Math.round(r.height), x:Math.round(r.left), y:Math.round(r.top)}); }
          return out; }""")
    def close(self):
        self.b.close()


# Show-Tacho (n24, src/core/showspeed.js): angezeigte km/h aus echten km/h (k = 1,5; ab 250 km/h echt)
def show_kmh(v, k=1.5):
    u = abs(v) / 250
    return abs(v) + k * abs(v) * (1 - u) ** 2 if u < 1 else abs(v)
