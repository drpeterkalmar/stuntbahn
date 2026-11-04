# Test n44 (Peter 02.11.: „stuntbahn hängt bei ‚Strecke bauen‘“ – beim Öffnen der Seite): Die Landschafts-Pakete liegen nicht
# im Vorab-Cache (nach jedem Update fehlen sie). Die Tagesstrecke vom 02.11. (Gelände) hat „Wüste“ – hängt deren Abruf (Netz
# da, aber es kommt nichts), wartete der Start ewig bei „Strecke bauen …“. Soll: nach dem Zeitlimit Ersatz-Landschaft „Land“,
# Menü steht. Dazu: 🎲 Neue Strecke bei hängendem Netz, erzwungener Baufehler beim Start und bei Neue Strecke (?ladefehler).
# Aufruf: python3 tests/test_n44_strecke_bauen.py            (N44_ROOT=<Ordner> = anderen Stand prüfen, z. B. 0.19.2)
#         N44_LIMIT=25 (s bis „hängt“)
import os, sys, time, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from util import Server, ARGS, PIXEL7_LAND, DESKTOP
from playwright.sync_api import sync_playwright

ROOT = os.environ.get('N44_ROOT') or None
LIMIT = float(os.environ.get('N44_LIMIT', '25'))
ZUSTAND = """() => ({ t: (document.querySelector('#loading p') || {}).textContent, show: !!document.querySelector('#loading.show'),
  ready: !!(window.__app && window.__app.ready), menu: document.body.dataset.screen === 'menu',
  thema: window.__game ? window.__game.theme : null, key: window.__game && window.__game.env ? window.__game.env.meta.key : null,
  rueckfall: window.__app ? window.__app.rueckfall || null : null, neu: window.__n44fertig === undefined ? null : window.__n44fertig })"""

def warte_menu(pg, T=LIMIT):
    t0 = time.time(); st = {}
    while time.time() - t0 < T:
        try: st = pg.evaluate(ZUSTAND)
        except Exception: st = {}
        if st.get('ready') and not st.get('show') and st.get('menu') and st.get('neu') in (None, True) and st.get('thema'): return True, time.time() - t0, st
        time.sleep(0.2)
    return False, time.time() - t0, st

def fall(b, base, name, q='', datum='2026-11-02T20:30:00', haengt=True, geraet=PIXEL7_LAND, danach=None):
    ctx = b.new_context(**geraet)
    ctx.add_init_script("window.__noKino = true; window.__noShow = true")
    stall = []
    if haengt: ctx.route('**/assets/themes/**', lambda r: stall.append(r))   # nie beantworten: Netz hängt
    pg = ctx.new_page(); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)[:200]))
    if datum: pg.clock.install(time=datum)
    pg.goto(base + 'index.html?nosw' + q, wait_until='commit')
    ok, dt, st = warte_menu(pg)
    res = {'name': name, 'ok': ok, 's': round(dt, 1), 'zustand': st, 'haengende_anfragen': len(stall), 'pageerrors': errs[:3]}
    if ok and danach:
        ok2, dt2, st2 = danach(pg)
        res.update({'ok': ok2, 'danach_s': round(dt2, 1), 'danach': st2})
    print(('OK    ' if res['ok'] else 'HAENGT'), name, f"{res['s']} s" + (f" / danach {res['danach_s']} s" if 'danach_s' in res else ''),
          '|', json.dumps(res.get('danach', st), ensure_ascii=False)[:230], flush=True)
    try: ctx.unroute_all(behavior='ignoreErrors')
    except Exception: pass
    ctx.close()
    return res

def neue_strecke(seed, art):
    def f(pg):
        pg.evaluate(f"() => {{ window.__n44fertig = false; __game.newTrack({seed}, 2, '{art}').then(() => {{ window.__n44fertig = true; }}, (e) => {{ window.__n44fertig = 'Fehler ' + e; }}); }}")
        time.sleep(0.5)
        return warte_menu(pg)
    return f

if __name__ == '__main__':
    fails, alle = [], []
    with Server(**({'root': ROOT} if ROOT else {})) as srv, sync_playwright() as pw:
        b = pw.chromium.launch(args=ARGS)
        R = lambda *a, **k: alle.append(fall(b, srv.base, *a, **k)) or alle[-1]
        # (1) Start am 02.11., Gelände = Wüste, Netz hängt → Menü mit Ersatz-Landschaft
        r = R('Start 02.11. Gelände (Wüste), Netz hängt')
        if not r['ok']: fails.append('Start hängt bei hängendem Landschafts-Paket')
        elif r['zustand'].get('thema') != 'land': fails.append('Start: Ersatz-Landschaft nicht Land: ' + str(r['zustand'].get('thema')))
        # (1b) dasselbe am Desktop, 3D-Strecke (Winter)
        r = R('Start 02.11. 3D (Winter), Netz hängt, Desktop', geraet=DESKTOP, q='&seed=20261102&3d=1&p=1')
        if not r['ok']: fails.append('Start 3D hängt')
        # (2) ohne Hänger: Wüste wie bisher (Normalfall unverändert)
        r = R('Start 02.11. Gelände, Netz normal', haengt=False)
        if not r['ok'] or r['zustand'].get('thema') != 'wueste': fails.append('Normalfall: nicht Wüste/kein Menü ' + json.dumps(r['zustand'], ensure_ascii=False))
        # (3) 🎲 Neue Strecke bei hängendem Netz (03.11. Gelände = Alpen)
        r = R('Neue Strecke (Alpen), Netz hängt', datum='2026-11-01T12:00:00', danach=neue_strecke(20261103, 'gel'))
        if not r['ok']: fails.append('Neue Strecke hängt bei hängendem Landschafts-Paket')
        # (4) Baufehler beim Start → Ersatzstrecke, Menü
        r = R('Start mit Baufehler (?ladefehler=1)', q='&ladefehler=1', haengt=False)
        if not r['ok']: fails.append('Start bleibt nach Baufehler stehen')
        # (5) Baufehler bei Neue Strecke → zurück zur bisherigen Strecke, Menü
        r = R('Neue Strecke mit Baufehler (?ladefehler=2)', q='&ladefehler=2', haengt=False, datum='2026-11-01T12:00:00', danach=neue_strecke(4711, 'gel'))
        if not r['ok']: fails.append('Neue Strecke bleibt nach Baufehler stehen')
        b.close()
    out = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'perf', 'n44_strecke_bauen' + ('_' + os.path.basename(ROOT.rstrip('/')) if ROOT else '') + '.json')
    os.makedirs(os.path.dirname(out), exist_ok=True); json.dump(alle, open(out, 'w'), ensure_ascii=False, indent=1)
    print('ALLES OK' if not fails else 'FEHLER: ' + '; '.join(fails))
    sys.exit(1 if fails else 0)
