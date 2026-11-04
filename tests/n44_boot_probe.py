# n44: Start-Probe – öffnet die Seite (live oder lokal) für mehrere Fälle in EINEM Browser (nacheinander, je eigener
# Kontext), protokolliert den Ladebildschirm-Text, Konsole, pageerrors, window.__errors.
# python3 tests/n44_boot_probe.py <url> <faelle.json> [sekunden]
# Fall: { "name", "geraet": "handy"|"desktop", "datum": "2026-11-02T20:00:00", "ls": { key: wert(obj|str) }, "q": "?..." }
import sys, time, json
sys.path.insert(0, 'tests')
from util import *

def lauf(b, url, f, T, pw=None):
    g = f.get('geraet')
    opts = DESKTOP if g == 'desktop' else dict(pw.devices[g]) if g and g.startswith('iPhone') else PIXEL7_LAND
    ctx = b.new_context(**opts)
    ls = {k: (v if isinstance(v, str) else json.dumps(v)) for k, v in (f.get('ls') or {}).items()}
    if ls: ctx.add_init_script("(() => { if (sessionStorage.__n44) return; sessionStorage.__n44 = 1; const d = %s; for (const k in d) localStorage.setItem(k, d[k]); })()" % json.dumps(ls))
    pg = ctx.new_page()
    if f.get('datum'): pg.clock.install(time=f['datum'])
    errs, cons = [], []
    pg.on('pageerror', lambda e: errs.append(str(e)[:300]))
    pg.on('console', lambda m: cons.append(m.type + ': ' + m.text[:300]) if m.type in ('error', 'warning') and 'GL Driver' not in m.text and 'GPU stall' not in m.text else None)
    t0 = time.time(); pg.goto(url + f.get('q', ''))
    verlauf, last, ok = [], None, False
    while time.time() - t0 < T:
        try:
            st = pg.evaluate("() => ({ t: (document.querySelector('#loading p')||{}).textContent, show: !!document.querySelector('#loading.show'), ready: !!(window.__app && window.__app.ready), err: (window.__errors||[]).slice(0,3) })")
        except Exception as e:
            st = {'t': 'eval ' + str(e)[:60]}
        k = json.dumps(st, ensure_ascii=False)
        if k != last: verlauf.append(f'{time.time()-t0:5.1f}s {k}'); last = k
        if st.get('ready') and not st.get('show'): ok = True; break
        time.sleep(0.25)
    dt = round(time.time() - t0, 1)
    info = pg.evaluate("() => window.__app && window.__app.env ? null : null") if ok else None
    print(('OK     ' if ok else 'HAENGT '), f"{dt:5.1f}s", f['name'], flush=True)
    if not ok or errs or cons:
        for v in verlauf[-6:]: print('    ', v)
        for c in cons[:8]: print('     konsole', c)
        for e in errs[:5]: print('     pageerror', e)
    ctx.close()
    return {'name': f['name'], 'ok': ok, 's': dt, 'verlauf': verlauf, 'konsole': cons, 'pageerrors': errs}

if __name__ == '__main__':
    url = sys.argv[1]; faelle = json.load(open(sys.argv[2])); T = float(sys.argv[3]) if len(sys.argv) > 3 else 45
    with sync_playwright() as pw:
        b = pw.webkit.launch() if os.environ.get('ENGINE') == 'webkit' else pw.chromium.launch(args=ARGS)
        res = [lauf(b, url, f, T, pw) for f in faelle]
        b.close()
    out = sys.argv[4] if len(sys.argv) > 4 else None
    if out: json.dump(res, open(out, 'w'), ensure_ascii=False, indent=1)
    print('HAENGER', sum(not r['ok'] for r in res), 'von', len(res))
