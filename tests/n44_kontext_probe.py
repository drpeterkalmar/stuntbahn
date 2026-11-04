# n44: Kontextverlust beim Laden. Sobald der Ladebildschirm „Strecke bauen …“ zeigt, wird der WebGL-Kontext verloren
# (WEBGL_lose_context, wie iOS/Android bei Speichernot) und nach <wieder> ms wiederhergestellt (-1 = nie).
# python3 tests/n44_kontext_probe.py <url> [wieder_ms] [sekunden]
import sys, time, json, os
sys.path.insert(0, 'tests')
from util import *
from n44_wiederkehr_lib import warte
url = sys.argv[1]; wieder = int(sys.argv[2]) if len(sys.argv) > 2 else 300; T = float(sys.argv[3]) if len(sys.argv) > 3 else 40
ART = os.environ.get('ART', 'text')   # text: beim Text „Strecke bauen“; poll: bei der ersten Shader-Fertig-Abfrage nach „Strecke bauen“
INIT_POLL = """(() => { const W = %d; let done = false; const P = WebGL2RenderingContext.prototype, g0 = P.getProgramParameter;
  P.getProgramParameter = function (prog, pn) {
    const p = document.querySelector('#loading p');
    if (!done && pn === 0x91B1 && p && /Strecke bauen/.test(p.textContent)) { const ext = this.getExtension('WEBGL_lose_context'); if (ext) { done = true; window.__n44verlust = performance.now(); ext.loseContext(); if (W >= 0) setTimeout(() => { ext.restoreContext(); window.__n44wieder = performance.now(); }, W); } }
    return g0.call(this, prog, pn); }; })()"""
INIT = """(() => { const W = %d; let done = false;
  const tick = () => { const p = document.querySelector('#loading p');
    if (!done && p && /Strecke bauen/.test(p.textContent)) { const c = document.getElementById('c'); const gl = c && (c.getContext('webgl2') || c.getContext('webgl'));
      const ext = gl && gl.getExtension('WEBGL_lose_context'); if (ext) { done = true; window.__n44verlust = performance.now(); ext.loseContext(); if (W >= 0) setTimeout(() => { ext.restoreContext(); window.__n44wieder = performance.now(); }, W); } }
    if (!done) setTimeout(tick, 5); };
  addEventListener('DOMContentLoaded', tick); })()"""
INIT, INIT_POLL = INIT % wieder, INIT_POLL % wieder
def lauf(pw, url, engine='chromium'):
    b = pw.webkit.launch() if engine == 'webkit' else pw.chromium.launch(args=ARGS)
    ctx = b.new_context(**(dict(pw.devices['iPhone 15 landscape']) if engine == 'webkit' else PIXEL7_LAND))
    ctx.add_init_script(INIT_POLL if ART == 'poll' else INIT)
    pg = ctx.new_page(); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)[:200]))
    pg.on('console', lambda m: errs.append(m.type + ': ' + m.text[:200]) if m.type in ('error', 'warning') and 'GL Driver' not in m.text else None)
    pg.goto(url)
    ok, dt, v = warte(pg, T)
    verl = pg.evaluate("[window.__n44verlust != null, window.__n44wieder != null]")
    frames0 = pg.evaluate("window.__app ? window.__app.frames : -1"); time.sleep(1.5); frames1 = pg.evaluate("window.__app ? window.__app.frames : -1")
    print(('OK    ' if ok else 'HAENGT'), round(dt, 1), 's', '| Kontext verloren/wieder', verl, '| Bilder/1,5 s', frames1 - frames0, '|', v[-1] if v else '', flush=True)
    for e in errs[:6]: print('    ', e)
    b.close()
    return ok
if __name__ == '__main__':
    with sync_playwright() as pw:
        ok = lauf(pw, url, os.environ.get('ENGINE', 'chromium'))
    sys.exit(0 if ok else 1)
