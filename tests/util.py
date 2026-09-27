# Test-Helfer: eingebauter HTTP-Server (Thread, endet mit dem Skript), Playwright mit
# Pixel-7-Emulation im Querformat, SwiftShader-WebGL, Fehler-Sammlung, Screenshots.
import os, time, json, threading, socket, functools
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PIXEL7_LAND = dict(viewport={"width": 915, "height": 412}, device_scale_factor=2.625, is_mobile=True, has_touch=True,
                   user_agent="Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36")
DESKTOP = dict(viewport={"width": 1280, "height": 720}, device_scale_factor=1)
ARGS = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--enable-webgl"]

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
    def __init__(self, pw, base, device=PIXEL7_LAND, dpr=None, storage=None):
        self.base = base
        self.b = pw.chromium.launch(args=ARGS)
        opts = dict(device)
        if dpr: opts['device_scale_factor'] = dpr
        if storage: opts['storage_state'] = storage
        self.ctx = self.b.new_context(**opts)
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
                if (time.time() - t0) * 1000 > timeout:
                    print('BOOT TIMEOUT', self.errors[:5]); raise
                print('  … lädt noch', round(time.time() - t0), 's, frames', self.ev("window.__app ? window.__app.frames : -1"), flush=True)
        self.boot_s = time.time() - t0
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
