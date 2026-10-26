# n42 Ruckeln + langsamer Start: Messung „Mittelklasse-Android“ (CPU-Drossel ×4, Netz Fast 4G auf dem Server, DPR 2,6).
#   kalt    Kaltstart bis Menü / bis das Rennen fährt: (1) leerer Cache, (2) Service-Worker-Cache + neue Strecke (Prüfung läuft),
#           (3) Service-Worker-Cache + bekannte Strecke. Lade-Phasen, Wasserfall (größte Dateien, doppelt geladen), Long-Tasks,
#           auf Wunsch JS-Profil des Starts (--profil).
#   rennen  Autopilot-Rennen N s (Standard 180) mit CPU-Drossel ×4, ungedeckelt (wie tests/perf_gate.py): Bildzeit p50/p95/p99,
#           Bilder > 50 / > 100 ms, längster Hänger, je Hänger Zeitpunkt + Ursache (Shader neu, Textur, Geometrie, GC, Stufe/
#           Auflösung, Physik, Zeichnen, Aufgabe außerhalb des Bilds; mit --profil die teuersten Funktionen im Hänger).
#   Aufruf: python3 tests/n42_mess.py kalt|rennen [--wurzel <Ordner>] [--zusatz "&x=0"] [--stand name] [--sek 180] [--runden 1]
#           [--profil] [--geraet quer|hoch] [--strecke "seed=…&d=2&g=1&h=1"]
#           A/B im Wechsel: --ab vorher=/pfad/zur/kopie:: --ab nachher=   (wie perf_gate.py)
#   Ergebnis: tests/perf/<datum>_n42_<modus>_<stand>.json + Tabelle.
# Ein Browser zur Zeit (Mac 8 GB), Start per `open` (sonst Zeitgeber-Drosselung, perf_gate.py), stumm.
import os, sys, json, time, socket, argparse, subprocess, datetime

HIER = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HIER)
sys.path.insert(0, HIER)
from perf_gate import OffenerBrowser, GPU_ARGS, UNGEDECKELT, profil   # noqa: E402

STRECKE = 'seed=20261026&d=2&g=1&h=1'   # Gelände, Sportlich, aktueller Generator (wie die Strecke des Tages)

INIT = r"""(() => {
  if (window.__n42) return;
  const N = window.__n42 = { lade: [], lt: [], bereit: null, erstesBild: null, menu: null, dcl: null };
  try { performance.setResourceTimingBufferSize(5000); } catch (e) {}
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) N.lt.push([Math.round(e.startTime), Math.round(e.duration)]); }).observe({ type: 'longtask', buffered: true }); } catch (e) {}
  document.addEventListener('DOMContentLoaded', () => { N.dcl = performance.now(); });
  if (window.Profiler && /[?&]n42prof=1/.test(location.search)) { try { N.prof = new Profiler({ sampleInterval: 10, maxBufferSize: 400000 }); } catch (e) { N.profErr = String(e); } }
  // Lade-Texte per MutationObserver (kommt nach jedem await an die Reihe – rAF-Abfrage verpasst Texte während langer Arbeit)
  let last = '';
  const mo = new MutationObserver(() => { const lp = document.querySelector('#loading p'); if (!lp) return; const t = lp.textContent.replace(/\s*\d+\s*%.*$/, '').replace(/\s*…\s*$/, '');
    if (t !== last) { last = t; N.lade.push([Math.round(performance.now()), t]); } });
  mo.observe(document, { childList: true, characterData: true, subtree: true });
  const poll = () => {
    const a = window.__app;
    if (N.menu != null) mo.disconnect();
    if (a) { if (N.erstesBild == null && a.frames > 0) N.erstesBild = performance.now(); if (N.bereit == null && a.ready) N.bereit = performance.now(); }
    // Menü sichtbar: Ladebild weg, Menü-Modus, Bilder laufen (n42: „bereit“ kann später kommen – Prüfung im Worker)
    if (N.menu == null && a && a.frames > 2 && document.body.dataset.mode === 'menu' && !document.querySelector('#loading.show')) N.menu = performance.now();
    if (N.menu == null || N.fahrt == null) requestAnimationFrame(poll);
    if (N.klick != null && N.fahrt == null && window.__game && __game.race && __game.race.state === 'running') N.fahrt = performance.now();
  };
  requestAnimationFrame(poll);
})();"""

# Profil (JS-Self-Profiling) zusammenfassen: je Zeitfenster die Funktionen mit der meisten Zeit (inklusive, je Stapel einmal)
PROF_AUSWERTEN = r"""async (fenster) => {
  const N = window.__n42; if (!N.prof) return { fehler: N.profErr || 'kein Profiler' };
  const tr = N.profTrace || (N.profTrace = await N.prof.stop());
  const name = (f) => { const fr = tr.frames[f]; const r = fr.resourceId != null ? tr.resources[fr.resourceId] : ''; return (fr.name || '(anonym)') + ' ' + (r ? r.replace(/^.*\/(src|lib)\//, '$1/') : '') + (fr.line ? ':' + fr.line : ''); };
  const out = [];
  for (const [a, b] of fenster) {
    const inc = new Map(), self = new Map(); let n = 0;
    for (const s of tr.samples) {
      if (s.timestamp < a || s.timestamp > b) continue; n++;
      if (s.stackId == null) { self.set('(Leerlauf/nativ)', (self.get('(Leerlauf/nativ)') || 0) + 1); continue; }
      let st = tr.stacks[s.stackId]; const seen = new Set();
      self.set(name(st.frameId), (self.get(name(st.frameId)) || 0) + 1);
      while (st) { const k = name(st.frameId); if (!seen.has(k)) { seen.add(k); inc.set(k, (inc.get(k) || 0) + 1); } st = st.parentId != null ? tr.stacks[st.parentId] : null; }
    }
    const top = (m, k) => [...m.entries()].sort((x, y) => y[1] - x[1]).slice(0, k).map(([f, c]) => [f, c]);
    out.push({ a, b, proben: n, inklusiv: top(inc, 14), selbst: top(self, 8) });
  }
  return { intervall: tr.samples.length > 1 ? 10 : null, fenster: out };
}"""


class N42Server:
    """tests/n42_server.mjs als Unterprozess (HTTPS/HTTP2, gzip, Drossel auf dem Server)."""
    def __init__(self, wurzel, rtt=165, kbit=9000, log=None):
        self.wurzel, self.rtt, self.kbit, self.log = wurzel, rtt, kbit, log
    def __enter__(self):
        s = socket.socket(); s.bind(('127.0.0.1', 0)); self.port = s.getsockname()[1]; s.close()
        cmd = ['node', os.path.join(HIER, 'n42_server.mjs'), self.wurzel, str(self.port), '--rtt', str(self.rtt), '--kbit', str(self.kbit)]
        if self.log: cmd += ['--log', self.log]
        self.p = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True)
        zeile = self.p.stdout.readline()   # „n42-Server https://… “ = lauscht (HTTP/1-Prüfanfragen beantwortet der HTTP/2-Server nicht)
        if 'n42-Server' not in zeile: self.__exit__(); raise RuntimeError('n42-Server startet nicht: ' + zeile)
        self.base = f'https://127.0.0.1:{self.port}/'
        return self
    def __exit__(self, *a):
        self.p.terminate()
        try: self.p.wait(5)
        except Exception: self.p.kill()

# Zertifikat des Mess-Servers per SPKI-Hash als gültig behandeln (nicht --ignore-certificate-errors: dann speichert Chrome
# nichts im HTTP-Cache – der Vorab-Cache des Service Workers könnte nicht per 304 nachfragen wie bei GitHub Pages)
def _spki():
    cert = os.path.join(HIER, '.n42_cert', 'cert.pem')
    if not os.path.exists(cert):
        subprocess.run(['node', os.path.join(HIER, 'n42_server.mjs'), '--nur-zertifikat'], capture_output=True, timeout=30)
    pub = subprocess.run(['openssl', 'x509', '-pubkey', '-noout', '-in', cert], capture_output=True, check=True).stdout
    der = subprocess.run(['openssl', 'pkey', '-pubin', '-outform', 'der'], input=pub, capture_output=True, check=True).stdout
    import hashlib, base64
    return base64.b64encode(hashlib.sha256(der).digest()).decode()
ARGS_EXTRA = ['--enable-precise-memory-info', '--autoplay-policy=user-gesture-required']

def browser(pw, ungedeckelt=True):
    return OffenerBrowser(pw, GPU_ARGS + ARGS_EXTRA + ['--ignore-certificate-errors-spki-list=' + _spki()] + (UNGEDECKELT if ungedeckelt else []))

def warte(pg, js, max_s, schritt=0.25):
    t0 = time.time()
    while time.time() - t0 < max_s:
        try:
            v = pg.evaluate(js)
            if v: return v
        except Exception: pass
        time.sleep(schritt)
    return None

def drossel(ctx, pg, rate):
    cdp = ctx.new_cdp_session(pg)
    cdp.send('Emulation.setCPUThrottlingRate', {'rate': rate})
    return cdp

# ---------------------------------------------------------------- Kaltstart
def ein_start(ctx, base, query, a, etikett, vorher_js=None):
    pg = ctx.new_page()
    fehler = []
    pg.on('pageerror', lambda e: fehler.append(str(e)[:160]))
    pg.goto(base + 'icons/icon-192.png')            # gleiche Herkunft → gleicher Renderer-Prozess, Drossel bleibt
    if vorher_js: pg.evaluate(vorher_js)
    drossel(ctx, pg, a.drossel)
    t_nav = time.time()
    pg.goto(base + 'index.html?' + query + ('&n42prof=1' if a.profil else ''), wait_until='commit')
    menu = warte(pg, '() => window.__n42 && window.__n42.menu', 600)
    if not menu: raise RuntimeError(f'{etikett}: Menü nicht erreicht ' + str(fehler[:2]))
    time.sleep(0.5)
    pg.evaluate("() => { window.__n42.klick = performance.now(); document.querySelector('[data-a=start]').click(); }")
    fahrt = warte(pg, '() => window.__n42.fahrt', 120)
    # Bildzeiten der ersten 6 s nach dem Klick (Hänger beim Losfahren)
    nach = pg.evaluate("""() => new Promise((res) => { const t = []; let l = performance.now(); const t0 = l;
      const k = (n) => { t.push(n - l); l = n; if (n - t0 < 6000) requestAnimationFrame(k); else res(t); }; requestAnimationFrame(k); })""")
    r = pg.evaluate("""() => { const N = window.__n42, nav = performance.getEntriesByType('navigation')[0];
      const res = performance.getEntriesByType('resource').map((e) => ({ u: e.name.replace(location.origin + '/', ''), s: Math.round(e.startTime), e: Math.round(e.responseEnd), n: e.transferSize, roh: e.decodedBodySize, typ: e.initiatorType }));
      return { dcl: N.dcl && Math.round(N.dcl), erstesBild: N.erstesBild && Math.round(N.erstesBild), bereit: N.bereit && Math.round(N.bereit), menu: Math.round(N.menu), klick: Math.round(N.klick), fahrt: N.fahrt && Math.round(N.fahrt),
        lade: N.lade, lt: N.lt, res, sw: !!navigator.serviceWorker.controller, apTime: __game.env && __game.env.meta.apTime, build: __app.build }; }""")
    r['nach_klick'] = {'max': round(max(nach), 1), 'ueber50': sum(1 for x in nach if x > 50), 'ueber100': sum(1 for x in nach if x > 100), 'erste': [round(x) for x in nach[:6]]}
    if a.profil:
        ph = phasen(r)
        fen = [[p['von'], p['bis']] for p in ph]
        r['profil'] = pg.evaluate(PROF_AUSWERTEN, fen)
    r['fehler'] = fehler[:5]
    r['etikett'] = etikett
    pg.close()
    return r

def phasen(r):
    L = r['lade'] + [[r['menu'], 'Menü sichtbar']]
    out = []
    for (t, name), (t2, _) in zip(L, L[1:]):
        out.append({'phase': name, 'von': t, 'bis': t2, 'ms': t2 - t})
    return out

def kalt(pw, base, a, zusatz):
    q = a.strecke + zusatz
    b = browser(pw, ungedeckelt=False)
    try:
        ctx = b.new_context(**profil(a.geraet, a.dpr), service_workers='allow', ignore_https_errors=True)
        ctx.add_init_script(INIT)
        r1 = ein_start(ctx, base, q, a, 'leer')
        # Service Worker fertig installiert (Vorab-Cache komplett)?
        pg = ctx.new_page(); pg.goto(base + 'icons/icon-192.png')
        sw = warte(pg, """async () => { const r = await navigator.serviceWorker.getRegistration(); if (!r || !r.active) return null;
          const k = (await caches.keys()).filter((x) => x.startsWith('stuntbahn-')); if (!k.length) return null; const c = await caches.open(k[0]); return (await c.keys()).length; }""", 300, 1)
        pg.close()
        r2 = ein_start(ctx, base, q, a, 'sw_neu', vorher_js="() => localStorage.removeItem('stuntbahn.v1.verified')")
        r3 = ein_start(ctx, base, q, a, 'sw_bekannt')
        return {'leer': r1, 'sw_neu': r2, 'sw_bekannt': r3, 'sw_eintraege': sw}
    finally:
        b.close()

def kalt_zeile(r):
    f = lambda x: f'{x / 1000:.1f}' if x else '–'
    nk = r.get('nach_klick', {})
    return f"| {r['etikett']} | {f(r['erstesBild'])} | {f(r['menu'])} | {f(r['fahrt'] - r['klick'] if r.get('fahrt') else None)} | {nk.get('max')} | {sum(x['n'] or 0 for x in r['res']) / 1e6:.2f} | {len(r['res'])} | {len([l for l in r['lt'] if l[0] < r['menu']])} / {max([l[1] for l in r['lt'] if l[0] < r['menu']] or [0])} |"

def wasserfall(r, k=12):
    res = sorted(r['res'], key=lambda x: -(x['n'] or 0))[:k]
    zeilen = ['| Datei | Start s | Ende s | übertragen kB |', '|---|---|---|---|']
    for x in res: zeilen.append(f"| {x['u'][:60]} | {x['s'] / 1000:.2f} | {x['e'] / 1000:.2f} | {round((x['n'] or 0) / 1000)} |")
    cnt = {}
    for x in r['res']:
        u = x['u'].split('?')[0]; cnt[u] = cnt.get(u, 0) + 1
    doppelt = {u: n for u, n in cnt.items() if n > 1}
    return '\n'.join(zeilen), doppelt

# ---------------------------------------------------------------- Rennen
RENNEN_JS = r"""async ([sek, langMs]) => {
  const G = window.__game, R = G.renderer, Rp = G.race.constructor.prototype, N = window.__n42;
  // Zeit in Physik und Zeichnen je Bild (umwickeln, ohne Spielcode zu ändern)
  const acc = { phys: 0, rend: 0 };
  if (!Rp.__n42) { const o = Rp.step; Rp.step = function (...x) { const t = performance.now(); const r = o.apply(this, x); acc.phys += performance.now() - t; return r; }; Rp.__n42 = 1; }
  if (!R.__n42) { const o = R.render.bind(R); R.render = function (s, c) { const t = performance.now(); o(s, c); acc.rend += performance.now() - t; }; R.__n42 = 1; }
  // neue Shader-Programme: Aufrufstapel + Uniform-Namen (welcher Effekt/welches Material übersetzt wurde)
  const neuP = []; Error.stackTraceLimit = 60;
  if (R.info.programs && !R.info.programs.__n42) { const P = R.info.programs, gl = R.getContext(); P.__n42 = 1;
    P.push = function (...x) { for (const p of x) { let u = ''; try { const sh = gl.getAttachedShaders(p.program); const src = sh.map((q) => gl.getShaderSource(q)).join('\n'); u = [...new Set([...src.matchAll(/uniform\s+\w+\s+(\w+)/g)].map((m) => m[1]).filter((n) => !/^(modelMatrix|modelViewMatrix|projectionMatrix|viewMatrix|normalMatrix|cameraPosition|isOrthographic|toneMappingExposure)$/.test(n)))].slice(0, 10).join(' '); } catch (e) {}
      neuP.push({ t: +(performance.now() - t0).toFixed(0), name: p.name, stapel: (new Error().stack || '').split('\n').slice(2, 40).map((z) => z.trim().replace(/^at /, '').replace(/\(?https?:\/\/[^/]+\//, '').replace(/\)$/, '')).filter((z) => !/three\.module/.test(z)).slice(0, 5).join(' < '), uniforms: u }); }
      return Array.prototype.push.apply(this, x); }; }
  // erstes Zeichnen je (Programm, Ziel): ANGLE/Treiber bauen die Pipeline oft erst dann (auch wenn das Programm vorher übersetzt war)
  const erst = new Set(); let erstNeu = [];
  if (!R.__n42b) { R.__n42b = 1; const o = R.renderBufferDirect.bind(R);
    R.renderBufferDirect = function (cam, sc, geo, mat, obj, grp) { o(cam, sc, geo, mat, obj, grp); const p = R.properties.get(mat).currentProgram, rt = R.getRenderTarget();
      const k = (p ? p.id : '?') + '|' + (rt ? rt.texture.uuid.slice(0, 4) + rt.samples : 'bild') + '|' + mat.blending + mat.side;
      if (!erst.has(k)) { erst.add(k); erstNeu.push((obj.name || obj.type) + ':' + (mat.name || mat.type) + (rt ? '→rt' + rt.width + 'x' + rt.height : '→bild')); } }; }
  // Lastwechsel (Handy-Ersatz): alle 30 s für 12 s künstliche Arbeit je Bild → Grafik-Autopilot regelt runter und wieder rauf
  const lastMs = window.__n42last || 0;
  const info = () => { const i = R.info; return [i.programs ? i.programs.length : 0, i.memory.textures, i.memory.geometries]; };
  const heap = () => (performance.memory ? performance.memory.usedJSHeapSize : 0);
  const stueck = (G) => { try { const r = G.race, T = G.env.track; const p = T.pieces[T.line.piece[r.tracker.idx]]; return p ? p.type : '?'; } catch (e) { return '?'; } };
  const bilder = []; const ereig = []; let starts = 0;
  let li = info(), lh = heap(), lpr = R.getPixelRatio(), ltier = G.quality.tier, lstate = G.race.state, lmode = G.mode, lsc = G.kino ? G.kino.renderScale : 1;
  const t0 = performance.now(); let l = t0, fin = null;
  await new Promise((res) => {
    const k = (now) => {
      const arbeit = performance.now() - now;   // Zeit der Spiel-Callbacks dieses Bilds (vor diesem)
      const dt = now - l; l = now;
      const i = info(), h = heap(), pr = R.getPixelRatio(), tier = G.quality.tier, st = G.race && G.race.state, md = G.mode, sc = G.kino ? G.kino.renderScale : 1;
      const e = [];
      if (i[0] !== li[0]) { const P = R.info.programs || []; e.push('shader+' + (i[0] - li[0]) + ' [' + P.slice(li[0]).map((p) => p.name || p.type || '?').join(',') + ']'); }
      if (i[1] !== li[1]) e.push('tex' + (i[1] > li[1] ? '+' : '') + (i[1] - li[1]));
      if (i[2] - li[2] > 2 || i[2] - li[2] < -2) e.push('geo' + (i[2] > li[2] ? '+' : '') + (i[2] - li[2]));
      if (h < lh - 1.5e6) e.push('gc-' + Math.round((lh - h) / 1e6) + 'MB');
      if (pr !== lpr || Math.abs(sc - lsc) > 0.01) e.push('aufl ' + (pr * sc).toFixed(2));
      if (tier !== ltier) e.push('stufe ' + tier);
      if (st !== lstate) e.push('zustand ' + st);
      if (md !== lmode) e.push('modus ' + md);
      if (erstNeu.length && bilder.length > 2) e.push('erst[' + erstNeu.slice(0, 6).join(', ') + (erstNeu.length > 6 ? ' …+' + (erstNeu.length - 6) : '') + ']');
      erstNeu = [];
      li = i; lh = h; lpr = pr; ltier = tier; lstate = st; lmode = md; lsc = sc;
      const rt = G.race ? +(G.race.time || 0).toFixed(1) : 0;
      bilder.push([+(now - t0).toFixed(1), +dt.toFixed(1), +acc.phys.toFixed(1), +acc.rend.toFixed(1), +arbeit.toFixed(1)]);
      if (e.length) ereig.push([bilder.length - 1, e.join(' '), stueck(G), rt]);
      acc.phys = 0; acc.rend = 0;
      if (lastMs) window.__app.testLast = ((now - t0) / 1000) % 30 >= 10 && ((now - t0) / 1000) % 30 < 22 ? lastMs : 0;
      // Rennen zu Ende (Zielshow vorbei, Ergebnis) → „Nochmal“ wie ein Spieler
      if (G.race && G.race.state === 'finished' && !G.show && G.mode === 'race') { if (fin == null) fin = now; else if (now - fin > 1500) { fin = null; starts++; G.start({ autopilot: true, seed: 1 + starts }); } }
      if (now - t0 < sek * 1000) requestAnimationFrame(k); else res();
    };
    requestAnimationFrame(k);
  });
  window.__app.testLast = 0;
  return { bilder, ereig, starts, neuP, lt: N.lt.filter((x) => x[0] >= t0).map((x) => [+(x[0] - t0).toFixed(0), x[1]]), t0, apLog: G.quality.ap ? G.quality.ap.log.slice(-40) : null, info: G.info() };
}"""

def ursache(b, prev, evs, lts):
    """Hänger-Bild b (dt lang): Arbeit steckt im vorigen Bild (prev) bzw. in Aufgaben zwischen den Bildern."""
    teile = []
    if evs: teile.append(evs)
    if prev:
        if prev[2] > 25: teile.append(f'Physik {prev[2]:.0f} ms')
        if prev[3] > 25: teile.append(f'Zeichnen {prev[3]:.0f} ms')
    lt_in = [x for x in lts if x[0] >= b[0] - b[1] - 5 and x[0] <= b[0]]
    if lt_in and prev and max(x[1] for x in lt_in) > prev[4] + prev[2] + 30: teile.append(f'Aufgabe außerhalb des Bilds {max(x[1] for x in lt_in)} ms')
    return ', '.join(teile) or 'unklar (GPU/Browser)'

def rennen(pw, base, a, zusatz):
    b = browser(pw, ungedeckelt=True)
    try:
        ctx = b.new_context(**profil(a.geraet, a.dpr), service_workers='block', ignore_https_errors=True)
        ctx.add_init_script(INIT)
        ctx.add_init_script('window.__noKino = true')
        pg = ctx.new_page(); fehler = []
        pg.on('pageerror', lambda e: fehler.append(str(e)[:160]))
        pg.goto(base + 'index.html?' + a.strecke + '&action=1' + zusatz + ('&n42prof=1' if a.profil else ''))
        if not warte(pg, '() => window.__n42 && window.__n42.menu && window.__app.ready', 600): raise RuntimeError('Menü nicht erreicht ' + str(fehler[:2]))
        time.sleep(1)
        # Zufall fest (Action-Momente, Fahrstil-Seed): Läufe vorher/nachher fahren dieselben Rennen
        pg.evaluate('(() => { let a = 42; window.__app.actionRnd = () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; __game.start({ autopilot: true, seed: 1 }); })()')
        drossel(ctx, pg, a.drossel)
        if a.last: pg.evaluate(f'window.__n42last = {a.last}')
        r = pg.evaluate(RENNEN_JS, [a.sek, 50])
        B = r['bilder']; dts = sorted(x[1] for x in B[1:])
        q = lambda p: dts[min(len(dts) - 1, int(p * len(dts)))]
        ev = {e[0]: e for e in r['ereig']}
        haenger = []
        for k in range(1, len(B)):
            if B[k][1] <= 50: continue
            e = ev.get(k - 1); e2 = ev.get(k)
            evs = ' '.join(x[1] for x in (e, e2) if x)
            info = (e or e2)
            haenger.append({'t': round(B[k][0] / 1000, 1), 'ms': B[k][1], 'ursache': ursache(B[k], B[k - 1], evs, r['lt']),
                            'stueck': info[2] if info else None, 'renn_t': info[3] if info else None, 'vorbild': B[k - 1][2:]})
        if a.profil and haenger:
            fen = [[r['t0'] + h['t'] * 1000 - h['ms'] - 20, r['t0'] + h['t'] * 1000] for h in sorted(haenger, key=lambda h: -h['ms'])[:25]]
            pr = pg.evaluate(PROF_AUSWERTEN, fen)
            for h, f in zip(sorted(haenger, key=lambda h: -h['ms'])[:25], pr.get('fenster', [])): h['profil'] = f['inklusiv'][:8]
        out = {'n': len(B), 'p50': q(0.5), 'p95': q(0.95), 'p99': q(0.99), 'ueber50': sum(1 for x in dts if x > 50), 'ueber100': sum(1 for x in dts if x > 100),
               'max': dts[-1], 'starts': r['starts'], 'haenger': haenger, 'lt_anzahl': len(r['lt']), 'apLog': r['apLog'], 'info': r['info'], 'fehler': fehler[:5], 'neuP': r['neuP'],
               'gc': [e for e in r['ereig'] if 'gc-' in e[1]].__len__(), 'ap_aenderungen': [e for e in r['ereig'] if 'aufl' in e[1] or 'stufe' in e[1]].__len__()}
        return out
    finally:
        b.close()

# Allokationen im Rennen (GC-Druck): Stichproben-Heap-Profil inkl. schon wieder eingesammelter Objekte, je Funktion (selbst)
def alloc(pw, base, a, zusatz):
    b = browser(pw, ungedeckelt=False)
    try:
        ctx = b.new_context(**profil(a.geraet, a.dpr), service_workers='block', ignore_https_errors=True)
        ctx.add_init_script(INIT); ctx.add_init_script('window.__noKino = true')
        pg = ctx.new_page()
        pg.goto(base + 'index.html?' + a.strecke + '&action=1' + zusatz)
        if not warte(pg, '() => window.__n42 && window.__n42.menu && window.__app.ready', 600): raise RuntimeError('Menü nicht erreicht')
        time.sleep(1)
        pg.evaluate('__game.start({ autopilot: true, seed: 1 })')
        time.sleep(6)
        cdp = ctx.new_cdp_session(pg)
        cdp.send('HeapProfiler.enable')
        cdp.send('HeapProfiler.startSampling', {'samplingInterval': 4096, 'includeObjectsCollectedByMajorGC': True, 'includeObjectsCollectedByMinorGC': True})
        t0 = time.time(); time.sleep(a.sek); sek = time.time() - t0
        prof = cdp.send('HeapProfiler.stopSampling')['profile']
        agg = {}
        def walk(n, pfad):
            cf = n['callFrame']; name = f"{cf['functionName'] or '(anonym)'} {cf['url'].split('/')[-1]}:{cf['lineNumber'] + 1}"
            agg[name] = agg.get(name, 0) + n['selfSize']
            for c in n.get('children', []): walk(c, pfad)
        walk(prof['head'], [])
        # Aufrufer der großen three.js-Posten: erster Rahmen außerhalb von lib/ (welcher Spielcode löst es aus)
        auf = {}
        def walk2(n, st):
            cf = n['callFrame']; name = f"{cf['functionName'] or '(anonym)'} {cf['url'].split('/')[-1]}:{cf['lineNumber'] + 1}"
            st = st + [(name, cf['url'])]
            if n['selfSize'] and 'three.' in cf['url']:
                spiel = next((x for x, u in reversed(st) if '/src/' in u), '?')
                k = name.split(' ')[0] + ' ← ' + ' < '.join(x for x, u in reversed(st[-4:-1])) + ' ⇐ ' + spiel
                auf[k] = auf.get(k, 0) + n['selfSize']
            for c in n.get('children', []): walk2(c, st)
        walk2(prof['head'], [])
        tot = sum(agg.values())
        top = sorted(agg.items(), key=lambda x: -x[1])[:40]
        return {'sek': round(sek), 'mb': round(tot / 1e6, 1), 'mb_s': round(tot / 1e6 / sek, 2), 'top': [(f, round(v / 1e6, 2)) for f, v in top], 'three_aufrufer': [(f, round(v / 1e6, 2)) for f, v in sorted(auf.items(), key=lambda x: -x[1])[:25]]}
    finally:
        b.close()

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('modus', choices=['kalt', 'rennen', 'alloc'])
    ap.add_argument('--wurzel', default=REPO); ap.add_argument('--zusatz', default=''); ap.add_argument('--stand', default='stand')
    ap.add_argument('--sek', type=float, default=180); ap.add_argument('--runden', type=int, default=1)
    ap.add_argument('--drossel', type=float, default=4); ap.add_argument('--dpr', type=float, default=2.6)
    ap.add_argument('--geraet', default='quer'); ap.add_argument('--strecke', default=STRECKE)
    ap.add_argument('--profil', action='store_true'); ap.add_argument('--rtt', type=int, default=165); ap.add_argument('--kbit', type=int, default=9000)
    ap.add_argument('--ab', action='append', default=[]); ap.add_argument('--last', type=float, default=0, help='Lastwechsel: ms künstliche Arbeit je Bild (alle 30 s für 12 s)')
    a = ap.parse_args()
    from playwright.sync_api import sync_playwright
    var = []
    for x in a.ab:
        n, rest = x.split('=', 1)
        w, z = rest.split('::', 1) if '::' in rest else (a.wurzel, rest)
        var.append((n, os.path.abspath(w), z))
    if not var: var = [(a.stand, os.path.abspath(a.wurzel), a.zusatz)]
    res = {'datum': datetime.datetime.now().isoformat(timespec='seconds'), 'modus': a.modus, 'profil': {'drossel': a.drossel, 'dpr': a.dpr, 'geraet': a.geraet, 'rtt': a.rtt, 'kbit': a.kbit, 'sek': a.sek, 'strecke': a.strecke, 'js_profil': a.profil},
           'varianten': {n: {'wurzel': w, 'zusatz': z, 'laeufe': []} for n, w, z in var}}
    with sync_playwright() as pw:
        for k in range(a.runden):
            for n, w, z in var[k % len(var):] + var[:k % len(var)]:
                log = os.path.join(REPO, 'tests', 'out', f'n42_server_{n}_{k}.jsonl') if a.modus == 'kalt' else None
                if log: os.makedirs(os.path.dirname(log), exist_ok=True); open(log, 'w').close()
                with N42Server(w, a.rtt if a.modus == 'kalt' else 0, a.kbit if a.modus == 'kalt' else 0, log) as srv:
                    try:
                        r = kalt(pw, srv.base, a, z) if a.modus == 'kalt' else alloc(pw, srv.base, a, z) if a.modus == 'alloc' else rennen(pw, srv.base, a, z)
                    except Exception as e:
                        r = {'fehler': [str(e)[:300]]}
                if log and os.path.exists(log):
                    L = [json.loads(x) for x in open(log) if x.strip()]
                    cnt = {}
                    for x in L: cnt[x['p']] = cnt.get(x['p'], 0) + 1
                    r['server'] = {'anfragen': len(L), 'bytes': sum(x['n'] for x in L), 'mehrfach': sorted([(p, c) for p, c in cnt.items() if c > 1], key=lambda x: -x[1])[:30],
                                   'bytes_mehrfach': sum(x['n'] for x in L if cnt[x['p']] > 1) }
                res['varianten'][n]['laeufe'].append(r)
                if a.modus == 'kalt' and 'leer' in r:
                    print(f'## {n} Runde {k}'); print('| Fall | erstes Bild s | Menü s | Klick→fährt s | max Bild nach Klick ms | übertragen MB | Dateien | Long-Tasks bis Menü (Anzahl/max ms) |\n|---|---|---|---|---|---|---|---|')
                    for f in ('leer', 'sw_neu', 'sw_bekannt'): print(kalt_zeile(r[f]))
                    for f in ('leer', 'sw_neu', 'sw_bekannt'): print(f, ' → '.join(f"{p['phase']} {p['ms'] / 1000:.1f}" for p in phasen(r[f])))
                    if 'server' in r: print('Server:', r['server']['anfragen'], 'Anfragen', round(r['server']['bytes'] / 1e6, 2), 'MB, mehrfach', round(r['server']['bytes_mehrfach'] / 1e6, 2), 'MB')
                elif a.modus == 'rennen' and 'p50' in r:
                    for x in r.get('neuP', []): print('   Shader', x)
                    print(f"## {n} Runde {k}: GC {r.get('gc')} AP-Änderungen {r.get('ap_aenderungen')} n {r['n']} p50 {r['p50']} p95 {r['p95']} p99 {r['p99']} >50 {r['ueber50']} >100 {r['ueber100']} max {r['max']} Neustarts {r['starts']} Fehler {r['fehler']}")
                    for h in sorted(r['haenger'], key=lambda h: -h['ms'])[:15]: print(f"   {h['t']:7.1f} s  {h['ms']:6.1f} ms  {h['stueck']}  {h['ursache']}" + (f"  | {h['profil'][:4]}" if h.get('profil') else ''))
                elif a.modus == 'alloc' and 'top' in r:
                    print(f"## {n}: {r['mb_s']} MB/s Allokation im Rennen ({r['sek']} s, {r['mb']} MB)")
                    for f, mb in r['top'][:30]: print(f'   {mb:7.2f} MB  {f}')
                    print('  three.js-Posten nach Aufrufer:')
                    for f, mb in r['three_aufrufer']: print(f'   {mb:7.2f} MB  {f}')
                else:
                    print(n, 'Fehler', r.get('fehler'))
                sys.stdout.flush()
    out = os.path.join(REPO, 'tests', 'perf', f"{datetime.date.today().isoformat()}_n42_{a.modus}_{a.stand}.json")
    os.makedirs(os.path.dirname(out), exist_ok=True)
    json.dump(res, open(out, 'w'), ensure_ascii=False, indent=1)
    print('→', os.path.relpath(out, REPO))

if __name__ == '__main__':
    main()
