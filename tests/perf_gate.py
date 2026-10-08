# Grafik-Kern, Baustein 1 (n30): Mess-Gate „Mittelklasse-Android“ – spielunabhängig, die Szenen kommen als JSON-Datei.
#   Profil: CPU-Drosselung ×4 (CDP Emulation.setCPUThrottlingRate), DPR 2,6, Viewport 412×915 hoch und 915×412 quer,
#   Touch/Mobil-UA, WebGL über die GPU (ANGLE/Metal, wie tests/util.py). Je Szene ≥ 10 s Bildabstände (rAF) → p50/p95/fps,
#   dazu die Zähler des Spiels (Draw-Calls, Dreiecke, Texturen – per `info`-Ausdruck aus der Szenen-Datei) und einmal die
#   Ladegröße (alle Antworten bis „bereit“, inkl. Worker; roh und gzip-9 gerechnet aus den Dateien auf der Platte).
#   Ergebnis: tests/perf/<datum>_<stand>.json + Tabelle (Markdown) auf stdout.
# Mac mini 8 GB: genau EIN Browser zur Zeit, nach jeder Szene geschlossen.
#
# Aufruf:  python3 tests/perf_gate.py --szenen tests/perf_szenen.json --stand vorher [--wurzel <Ordner>] [--geraete hoch,quer]
#          [--sek 10] [--drossel 4] [--dpr 2.6] [--nur menu_kino,looping_kino] [--runden 1] [--ohne-ladegroesse]
#   Vergleich zweier Läufe: python3 tests/perf_gate.py --vergleich tests/perf/A.json tests/perf/B.json
#
# Szenen-Datei (Beispiel für ein anderes Spiel – nur diese Datei ist spielspezifisch):
#   { "bereit": "window.__app && window.__app.ready",          // JS-Ausdruck: Spiel geladen
#     "info": "() => { const i = __game.renderer.info; return { calls: i.render.calls, tris: i.render.triangles, tex: i.memory.textures }; }",
#     "ladeQuery": "?nosw",                                     // Seite für die Ladegröße
#     "szenen": [ { "name": "menu", "query": "?nosw&q=2", "schritte": ["js-Ausdruck", {"warte": 1.5}, …] } ] }
#   Schritte: Zeichenkette = JS (page.evaluate), {"warte": s} = Pause (ungedrosselt), {"bis": "js", "max": s, "schritt": "js"}
#   = Schleife bis Bedingung (z. B. Auto im Looping), {"bilder": n} = n Bilder abwarten.
import os, sys, json, time, gzip, argparse, socket, threading, functools, subprocess, datetime, urllib.parse
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler

HIER = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HIER)
GPU_ARGS = ["--use-angle=metal", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--enable-webgl"]
# Linux (omen16, n31): ANGLE über Vulkan statt Metal (gleiche Weiche wie tests/util.py)
if sys.platform.startswith('linux'):
    GPU_ARGS = ["--use-gl=angle", "--use-angle=vulkan", "--ignore-gpu-blocklist", "--enable-webgl"]
UA = "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36"

def profil(geraet, dpr):
    vp = {"width": 412, "height": 915} if geraet == 'hoch' else {"width": 915, "height": 412}
    return dict(viewport=vp, device_scale_factor=dpr, is_mobile=True, has_touch=True, user_agent=UA)

# ---------- kleiner Server (ohne Cache, ohne gzip – gzip rechnen wir selbst) ----------
class _Leise(SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store'); super().end_headers()
class _Srv(ThreadingHTTPServer):
    request_queue_size = 128; daemon_threads = True
class Server:
    def __init__(self, wurzel): self.wurzel = wurzel
    def __enter__(self):
        s = socket.socket(); s.bind(('127.0.0.1', 0)); port = s.getsockname()[1]; s.close()
        self.httpd = _Srv(('127.0.0.1', port), functools.partial(_Leise, directory=self.wurzel))
        threading.Thread(target=self.httpd.serve_forever, daemon=True).start()
        self.base = f'http://127.0.0.1:{port}/'
        return self
    def __exit__(self, *a): self.httpd.shutdown(); self.httpd.server_close()

# ---------- Messung im Browser ----------
MESSEN = """async ([sek, info]) => { const f = info ? eval('(' + info + ')') : null; const t = [], c = [], tr = [], tx = [];
  await new Promise((res) => { let last = performance.now(); const t0 = last;
    const k = (now) => { t.push(now - last); last = now;
      if (f) { try { const i = f(); if (i) { c.push(i.calls || 0); tr.push(i.tris || 0); tx.push(i.tex || 0); } } catch (e) {} }
      if (now - t0 < sek * 1000) requestAnimationFrame(k); else res(); };
    requestAnimationFrame(k); });
  t.shift(); const s = [...t].sort((a, b) => a - b), q = (p) => s[Math.min(s.length - 1, Math.floor(p * s.length))];
  const mittel = (a) => a.length ? Math.round(a.reduce((x, y) => x + y, 0) / a.length) : null;
  return { n: t.length, p50: +q(0.5).toFixed(2), p95: +q(0.95).toFixed(2), p99: +q(0.99).toFixed(2),
    fps: +(1000 * t.length / t.reduce((a, b) => a + b, 0)).toFixed(1), calls: mittel(c), callsMax: c.length ? Math.max(...c) : null,
    tris: mittel(tr), tex: tx.length ? tx[tx.length - 1] : null }; }"""

# macOS: Prozesse, die von einem Hintergrund-Dienst abstammen (z. B. eine Job-Queue per launchd), erben eine starke
# Zeitgeber-Drosselung – ein mit Playwright gestarteter Browser kam am 08.10.2026 auf 15 Bilder/s selbst bei leerer Seite
# (time.sleep(0.05) dauerte 143 ms). Abhilfe: Browser per `open` (LaunchServices, eigene Prozessgruppe) starten und über CDP
# verbinden → 60 Bilder/s. Standard auf macOS; --start direkt = wie bisher pw.chromium.launch().
class OffenerBrowser:
    def __init__(self, pw, args):
        import tempfile
        exe = pw.chromium.executable_path
        app = exe[:exe.find('.app/') + 4]
        s = socket.socket(); s.bind(('127.0.0.1', 0)); self.port = s.getsockname()[1]; s.close()
        self.prof = tempfile.mkdtemp(prefix='perfgate_')
        subprocess.run(['open', '-na', app, '--args', '--headless=new', f'--remote-debugging-port={self.port}', f'--user-data-dir={self.prof}',
                        '--no-first-run', '--no-default-browser-check', *args, 'about:blank'], check=True, timeout=30)
        import urllib.request
        t0 = time.time()
        while True:
            try: urllib.request.urlopen(f'http://127.0.0.1:{self.port}/json/version', timeout=2).read(); break
            except Exception:
                if time.time() - t0 > 30: self.close(); raise RuntimeError('Browser per open nicht erreichbar')
                time.sleep(0.2)
        self.b = pw.chromium.connect_over_cdp(f'http://127.0.0.1:{self.port}')
    def new_context(self, **kw): return self.b.new_context(**kw)
    def close(self):
        import shutil
        try: self.b.new_browser_cdp_session().send('Browser.close')
        except Exception: pass
        t0 = time.time()
        while time.time() - t0 < 10 and subprocess.run(['pgrep', '-f', self.prof], capture_output=True).stdout.strip(): time.sleep(0.3)
        if subprocess.run(['pgrep', '-f', self.prof], capture_output=True).stdout.strip():
            subprocess.run(['pkill', '-f', self.prof])   # nur genau dieser Browser (eindeutiger Profil-Ordner)
        shutil.rmtree(self.prof, ignore_errors=True)

START = 'open' if sys.platform == 'darwin' else 'direkt'
# Ohne 60-Hz-Deckel (Standard): die Bildzeit ist dann die echte Arbeit je Bild statt eines Vielfachen von 16,7 ms – sonst
# sättigt p95 bei 16,7 ms (alles flüssig) bzw. springt in Bildtakt-Stufen und zeigt keine Unterschiede. --mit-vsync = Deckel.
UNGEDECKELT = ['--disable-gpu-vsync', '--disable-frame-rate-limit']
VSYNC = False
def _browser(pw, geraet, dpr):
    args = GPU_ARGS + ([] if VSYNC else UNGEDECKELT)
    b = OffenerBrowser(pw, args) if START == 'open' else pw.chromium.launch(args=args)
    ctx = b.new_context(**profil(geraet, dpr))
    return b, ctx

def _warte_bereit(pg, bereit, timeout_s=400):
    t0 = time.time()
    while True:
        try:
            pg.wait_for_function(bereit, timeout=20000); return time.time() - t0
        except Exception:
            if time.time() - t0 > timeout_s: raise

def _schritte(pg, schritte):
    for s in schritte or []:
        if isinstance(s, str): pg.evaluate(s)
        elif 'warte' in s: time.sleep(float(s['warte']))
        elif 'bilder' in s: pg.evaluate("(n) => new Promise((r) => { let k = 0; const f = () => (++k >= n ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); })", int(s['bilder']))
        elif 'bis' in s:
            # Schleife im Browser (ein Aufruf statt tausender Hin-und-Her; der Treiber kann gedrosselt sein): Bedingung prüfen,
            # sonst Schritt ausführen bzw. ein Bild warten; alle 20 Schritte ein Bild Luft für die Seite
            ok = pg.evaluate("""async ([bis, schritt, max]) => { const t0 = performance.now(); let k = 0;
              const B = () => eval(bis), S = schritt ? () => eval(schritt) : null, bild = () => new Promise((r) => requestAnimationFrame(r));
              while (!B()) { if (performance.now() - t0 > max * 1000) return false; if (S) { S(); if (++k % 20 === 0) await bild(); } else await bild(); }
              return true; }""", [s['bis'], s.get('schritt'), float(s.get('max', 60))])
            if not ok: raise RuntimeError('Bedingung nicht erreicht: ' + s['bis'])

def messe_szene(pw, base, cfg, sz, geraet, a, zusatz=None):
    b, ctx = _browser(pw, geraet, a.dpr)
    try:
        if sz.get('init'): ctx.add_init_script(sz['init'])
        elif cfg.get('init'): ctx.add_init_script(cfg['init'])
        pg = ctx.new_page()
        fehler = []
        pg.on('pageerror', lambda e: fehler.append('PAGEERROR ' + str(e)))
        pg.on('console', lambda m: fehler.append('CONSOLE ' + m.text) if m.type == 'error' else None)
        pg.goto(base + 'index.html' + sz['query'] + (a.zusatz if zusatz is None else zusatz))
        boot = _warte_bereit(pg, sz.get('bereit') or cfg.get('bereit', 'window.__app && window.__app.ready'))
        _schritte(pg, sz.get('schritte'))
        cdp = ctx.new_cdp_session(pg)
        cdp.send('Emulation.setCPUThrottlingRate', {'rate': a.drossel})
        time.sleep(1.0)   # einschwingen unter Last
        r = pg.evaluate(MESSEN, [max(a.sek, float(sz.get('sek', 0))), sz.get('info') or cfg.get('info')])
        cdp.send('Emulation.setCPUThrottlingRate', {'rate': 1})
        if sz.get('zusatz') or cfg.get('zusatz'):
            try: r['zusatz'] = pg.evaluate(sz.get('zusatz') or cfg.get('zusatz'))
            except Exception as e: r['zusatz'] = 'Fehler: ' + str(e)[:120]
        r['boot_s'] = round(boot, 1); r['fehler'] = fehler[:5]
        return r
    finally:
        ctx.close(); b.close()

def ladegroesse(pw, base, wurzel, cfg, a):
    b, ctx = _browser(pw, 'hoch', a.dpr)
    try:
        urls = set()
        ctx.on('requestfinished', lambda rq: urls.add(rq.url))   # auch Worker (Basis-Transcoder usw.)
        pg = ctx.new_page()
        pg.goto(base + 'index.html' + cfg.get('ladeQuery', '?nosw'))
        _warte_bereit(pg, cfg.get('bereit', 'window.__app && window.__app.ready'))
        time.sleep(float(cfg.get('ladeNachlauf', 3)))   # nachgeladene Dinge (z. B. LOD, Themen-Paket) mitzählen
        roh = gz = 0; extern = []; dateien = []
        for u in sorted(urls):
            p = urllib.parse.urlparse(u)
            if u.startswith(('blob:', 'data:')): continue
            if not u.startswith(base): extern.append(u); continue
            f = os.path.join(wurzel, urllib.parse.unquote(p.path.lstrip('/')) or 'index.html')
            if os.path.isdir(f): f = os.path.join(f, 'index.html')
            if not os.path.isfile(f): continue
            d = open(f, 'rb').read(); g = len(gzip.compress(d, 9))
            roh += len(d); gz += g; dateien.append((g, os.path.relpath(f, wurzel)))
        dateien.sort(reverse=True)
        return {'dateien': len(dateien), 'roh_mb': round(roh / 1e6, 2), 'gzip_mb': round(gz / 1e6, 2), 'extern': extern,
                'groesste_gzip_kb': [(n, round(g / 1e3)) for g, n in dateien[:10]]}
    finally:
        ctx.close(); b.close()

def tabelle(res):
    zeilen = ['| Szene | Gerät | p50 ms | p95 ms | fps | Draw-Calls (max) | Dreiecke | Texturen | Fehler |', '|---|---|---|---|---|---|---|---|---|']
    for name, je in res['szenen'].items():
        for g, r in je.items():
            if 'p50' not in r: zeilen.append(f"| {name} | {g} | – | – | – | – | – | – | {r.get('fehler')} |"); continue
            zeilen.append(f"| {name} | {g} | {r['p50']} | {r['p95']} | {r['fps']} | {r['calls']} ({r['callsMax']}) | {r['tris']} | {r['tex']} | {len(r.get('fehler') or [])} |")
    if res.get('ladegroesse'):
        L = res['ladegroesse']; zeilen.append(f"\nLadegröße: {L['dateien']} Dateien, {L['roh_mb']} MB roh, **{L['gzip_mb']} MB gzip**, externe Anfragen: {len(L['extern'])}")
    return '\n'.join(zeilen)

def vergleich(fa, fb):
    A, B = json.load(open(fa)), json.load(open(fb))
    print(f"| Szene | Gerät | p95 {A['stand']} | p95 {B['stand']} | Δ | Calls {A['stand']} | Calls {B['stand']} |\n|---|---|---|---|---|---|---|")
    for name, je in B['szenen'].items():
        for g, rb in je.items():
            ra = A['szenen'].get(name, {}).get(g)
            if not ra or 'p95' not in ra or 'p95' not in rb: continue
            d = (rb['p95'] - ra['p95']) / ra['p95'] * 100
            print(f"| {name} | {g} | {ra['p95']} | {rb['p95']} | {d:+.1f} % | {ra['calls']} | {rb['calls']} |")
    if A.get('ladegroesse') and B.get('ladegroesse'):
        print(f"\nLadegröße gzip: {A['ladegroesse']['gzip_mb']} → {B['ladegroesse']['gzip_mb']} MB")

def main():
    global START, VSYNC
    ap = argparse.ArgumentParser(description='Mess-Gate Mittelklasse-Android (Grafik-Kern)')
    ap.add_argument('--szenen', default=os.path.join(HIER, 'perf_szenen.json'))
    ap.add_argument('--stand', default='stand'); ap.add_argument('--wurzel', default=REPO)
    ap.add_argument('--geraete', default='hoch,quer'); ap.add_argument('--sek', type=float, default=10)
    ap.add_argument('--drossel', type=float, default=4); ap.add_argument('--dpr', type=float, default=2.6)
    ap.add_argument('--nur', default=''); ap.add_argument('--runden', type=int, default=1)
    ap.add_argument('--ohne-ladegroesse', action='store_true'); ap.add_argument('--vergleich', nargs=2)
    ap.add_argument('--ab', action='append', default=[], metavar='NAME=[WURZEL::]ZUSATZ',
                    help='A/B-Modus: Varianten im Wechsel messen (Reihenfolge je Runde gedreht), Median je Variante; '
                         'z. B. --ab vorher=../spiel_alt:: --ab nachher= --ab ohne_x=&x=0')
    ap.add_argument('--zusatz', default='', help='an jede Szenen-URL anhängen (A/B einzelner Regler, z. B. "&reflex=0")')
    ap.add_argument('--mit-vsync', action='store_true', help='Bildrate auf den Bildschirmtakt deckeln (Standard: ungedeckelt)')
    ap.add_argument('--start', choices=['open', 'direkt'], default=START, help='Browserstart (macOS: open = ohne geerbte Zeitgeber-Drosselung)')
    a = ap.parse_args()
    START = a.start; VSYNC = a.mit_vsync
    if a.vergleich: return vergleich(*a.vergleich)
    from playwright.sync_api import sync_playwright
    cfg = json.load(open(a.szenen))
    if a.ab: return ab_modus(a, cfg, sync_playwright)
    wurzel = os.path.abspath(a.wurzel)
    try: rev = subprocess.run(['git', '-C', wurzel, 'rev-parse', '--short', 'HEAD'], capture_output=True, text=True, timeout=10).stdout.strip()
    except Exception: rev = None
    nur = set(x for x in a.nur.split(',') if x)
    res = {'datum': datetime.datetime.now().isoformat(timespec='seconds'), 'stand': a.stand, 'wurzel': wurzel, 'git': rev,
           'profil': {'drossel': a.drossel, 'dpr': a.dpr, 'sek': a.sek, 'geraete': a.geraete, 'gpu': 'ANGLE/Vulkan headless (Linux)' if sys.platform.startswith('linux') else 'ANGLE/Metal headless', 'start': a.start, 'vsync': a.mit_vsync, 'zusatz': a.zusatz}, 'szenen': {}}
    with Server(wurzel) as srv, sync_playwright() as pw:
        for sz in cfg['szenen']:
            if nur and sz['name'] not in nur: continue
            res['szenen'][sz['name']] = {}
            for g in a.geraete.split(','):
                laeufe = []
                for k in range(a.runden):
                    try: laeufe.append(messe_szene(pw, srv.base, cfg, sz, g, a))
                    except Exception as e: laeufe.append({'fehler': [str(e)[:300]]})
                ok = [l for l in laeufe if 'p95' in l]
                # mehrere Runden: die mit dem mittleren p95 nehmen (Ausreißer durch Hintergrundlast)
                r = sorted(ok, key=lambda l: l['p95'])[len(ok) // 2] if ok else laeufe[0]
                if len(laeufe) > 1: r['runden_p95'] = [l.get('p95') for l in laeufe]
                res['szenen'][sz['name']][g] = r
                print(sz['name'], g, json.dumps({k: r.get(k) for k in ('p50', 'p95', 'fps', 'calls', 'tris', 'fehler')}, ensure_ascii=False), flush=True)
        if not a.ohne_ladegroesse:
            res['ladegroesse'] = ladegroesse(pw, srv.base, wurzel, cfg, a)
    os.makedirs(os.path.join(REPO, 'tests', 'perf'), exist_ok=True)   # Ergebnis immer in dieses Repo (auch bei --wurzel = main-Kopie)
    out = os.path.join(REPO, 'tests', 'perf', f"{datetime.date.today().isoformat()}_{a.stand}.json")
    json.dump(res, open(out, 'w'), ensure_ascii=False, indent=1)
    print(tabelle(res)); print('→', os.path.relpath(out, REPO))

# A/B im Wechsel: Hintergrundlast trifft alle Varianten gleich (auf einem geteilten Rechner schwankt dieselbe Variante
# zwischen zwei Läufen sonst leicht um ±30 %). Je Szene/Gerät: Runde für Runde jede Variante einmal, Reihenfolge gedreht.
def ab_modus(a, cfg, sync_playwright):
    import statistics
    var = []
    for x in a.ab:
        name, rest = x.split('=', 1)
        w, z = rest.split('::', 1) if '::' in rest else (REPO, rest)
        var.append((name, os.path.abspath(w), z))
    nur = set(x for x in a.nur.split(',') if x)
    runden = max(a.runden, 3)
    res = {'datum': datetime.datetime.now().isoformat(timespec='seconds'), 'stand': a.stand, 'modus': 'ab', 'runden': runden,
           'varianten': [{'name': n, 'wurzel': w, 'zusatz': z} for n, w, z in var],
           'profil': {'drossel': a.drossel, 'dpr': a.dpr, 'sek': a.sek, 'start': START, 'vsync': VSYNC}, 'szenen': {}}
    from contextlib import ExitStack
    with ExitStack() as st, sync_playwright() as pw:
        srv = {w: st.enter_context(Server(w)) for w in set(v[1] for v in var)}
        for sz in cfg['szenen']:
            if nur and sz['name'] not in nur: continue
            res['szenen'][sz['name']] = {}
            for g in a.geraete.split(','):
                je = {n: [] for n, _, _ in var}
                for k in range(runden):
                    for n, w, z in var[k % len(var):] + var[:k % len(var)]:
                        try: je[n].append(messe_szene(pw, srv[w].base, cfg, sz, g, a, zusatz=z))
                        except Exception as e: je[n].append({'fehler': [str(e)[:300]]})
                out = {}
                for n, L in je.items():
                    ok = [l for l in L if 'p95' in l]
                    med = lambda f: round(statistics.median([l[f] for l in ok]), 2) if ok else None
                    out[n] = {'p50': med('p50'), 'p95': med('p95'), 'fps': med('fps'), 'calls': med('calls'), 'tris': med('tris'),
                              'runden_p95': [l.get('p95') for l in L], 'fehler': sum(((l.get('fehler') or []) for l in L), [])[:5]}
                res['szenen'][sz['name']][g] = out
                b = out[var[0][0]]
                print(sz['name'], g, ' | '.join(f"{n}: p50 {o['p50']} p95 {o['p95']}" + (f" ({(o['p95'] - b['p95']) / b['p95'] * 100:+.0f} %)" if o['p95'] and b['p95'] and n != var[0][0] else '') + f" calls {o['calls']}" for n, o in out.items()), flush=True)
    out = os.path.join(REPO, 'tests', 'perf', f"{datetime.date.today().isoformat()}_{a.stand}.json")
    os.makedirs(os.path.dirname(out), exist_ok=True)
    json.dump(res, open(out, 'w'), ensure_ascii=False, indent=1)
    print('→', os.path.relpath(out, REPO))

if __name__ == '__main__':
    main()
