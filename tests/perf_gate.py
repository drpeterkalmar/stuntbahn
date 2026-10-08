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

def _browser(pw, geraet, dpr):
    b = pw.chromium.launch(args=GPU_ARGS)
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
            t0 = time.time()
            while not pg.evaluate(s['bis']):
                if time.time() - t0 > float(s.get('max', 60)): raise RuntimeError('Bedingung nicht erreicht: ' + s['bis'])
                if s.get('schritt'): pg.evaluate(s['schritt'])
                else: time.sleep(0.05)

def messe_szene(pw, base, cfg, sz, geraet, a):
    b, ctx = _browser(pw, geraet, a.dpr)
    try:
        if sz.get('init'): ctx.add_init_script(sz['init'])
        elif cfg.get('init'): ctx.add_init_script(cfg['init'])
        pg = ctx.new_page()
        fehler = []
        pg.on('pageerror', lambda e: fehler.append('PAGEERROR ' + str(e)))
        pg.on('console', lambda m: fehler.append('CONSOLE ' + m.text) if m.type == 'error' else None)
        pg.goto(base + 'index.html' + sz['query'])
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
    ap = argparse.ArgumentParser(description='Mess-Gate Mittelklasse-Android (Grafik-Kern)')
    ap.add_argument('--szenen', default=os.path.join(HIER, 'perf_szenen.json'))
    ap.add_argument('--stand', default='stand'); ap.add_argument('--wurzel', default=REPO)
    ap.add_argument('--geraete', default='hoch,quer'); ap.add_argument('--sek', type=float, default=10)
    ap.add_argument('--drossel', type=float, default=4); ap.add_argument('--dpr', type=float, default=2.6)
    ap.add_argument('--nur', default=''); ap.add_argument('--runden', type=int, default=1)
    ap.add_argument('--ohne-ladegroesse', action='store_true'); ap.add_argument('--vergleich', nargs=2)
    a = ap.parse_args()
    if a.vergleich: return vergleich(*a.vergleich)
    from playwright.sync_api import sync_playwright
    cfg = json.load(open(a.szenen))
    wurzel = os.path.abspath(a.wurzel)
    try: rev = subprocess.run(['git', '-C', wurzel, 'rev-parse', '--short', 'HEAD'], capture_output=True, text=True, timeout=10).stdout.strip()
    except Exception: rev = None
    nur = set(x for x in a.nur.split(',') if x)
    res = {'datum': datetime.datetime.now().isoformat(timespec='seconds'), 'stand': a.stand, 'wurzel': wurzel, 'git': rev,
           'profil': {'drossel': a.drossel, 'dpr': a.dpr, 'sek': a.sek, 'geraete': a.geraete, 'gpu': 'ANGLE/Metal headless'}, 'szenen': {}}
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

if __name__ == '__main__':
    main()
