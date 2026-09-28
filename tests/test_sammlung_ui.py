# Sammlung im Browser: Abschnitt „⭐ Sammlung (250)“ in der Bibliothek – eingeklappt, lädt erst beim Aufklappen,
# Strecke des Tages laden und fahren (Bestzeit, „zuletzt gefahren“), Suche, Filter-Chips, Sortierung, Zustand nach
# Neuladen, Touch-Ziele ≥ 44 px, Eingaben ≥ 16 px, Paket fehlt (404) → Abschnitt weg ohne Meldung, 0 Seitenfehler.
# Aufruf: python3 tests/test_sammlung_ui.py [basis-url]   (ohne URL: eingebauter Server auf das Repo)
# Fotos: tests/shots/sammlung/ (hoch + quer)
import sys, os, time, json
from util import Server, Session, PIXEL7_LAND, ROOT
from playwright.sync_api import sync_playwright

PIXEL7_PORT = dict(PIXEL7_LAND, viewport={"width": 412, "height": 915})
fails = []
def check(ok, msg):
    print(('OK   ' if ok else 'FAIL ') + msg, flush=True)
    if not ok: fails.append(msg)

META = json.load(open(os.path.join(ROOT, 'assets', 'sammlung.json')))
def day_index():
    import datetime
    d = datetime.date.today()
    return (d - datetime.date(1970, 1, 1)).days % len(META['tracks'])

def filters_open(s):
    if s.ev("() => document.querySelector('#sam .samfbtn').getAttribute('aria-expanded')") != 'true':
        s.tap('#sam .samfbtn'); time.sleep(0.2)

def open_lib(s):
    s.tap('[data-a=trklib]')
    s.pg.wait_for_selector('#sheet.show', timeout=10000)
    time.sleep(0.3)

def run(pw, base, device, tag, full):
    s = Session(pw, base, device=device)
    s.open('?nosw')
    # Boot lädt die Sammlung nicht
    net0 = s.ev("() => performance.getEntriesByType('resource').filter((e) => e.name.includes('assets/sammlung.')).length")
    check(net0 == 0, f'[{tag}] beim Start kein Request auf das Paket ({net0})')
    open_lib(s)
    head = s.pg.locator('#sam .samhead')
    check(head.count() == 1 and 'Sammlung (250)' in head.inner_text(), f'[{tag}] Abschnitt „⭐ Sammlung (250)“ vorhanden')
    order = s.ev("""() => { const t = document.querySelector('#sheet .scroll').textContent; return [t.indexOf('Meine Strecken'), t.indexOf('Sammlung (250)'), t.indexOf('Beispiele')]; }""")
    check(order[0] < order[1] < order[2], f'[{tag}] Reihenfolge: Meine Strecken → Sammlung → Beispiele {order}')
    check(s.ev("() => document.querySelector('#sam .sambody').hidden") is True, f'[{tag}] eingeklappt')
    check('im Stil der beliebtesten Stunts-Wettbewerbe' in head.inner_text(), f'[{tag}] Untertitel')
    s.tap('#sam .samhead')
    s.pg.wait_for_selector('#sam .samlist .trk', timeout=20000)
    time.sleep(0.8)
    net1 = s.ev("() => performance.getEntriesByType('resource').filter((e) => e.name.includes('assets/sammlung.')).map((e) => e.name.split('/').pop())")
    check(sorted(net1) == ['sammlung.bin', 'sammlung.json'], f'[{tag}] beim Aufklappen genau 2 Requests: {net1}')
    n_rows = s.ev("() => document.querySelectorAll('#sam .samlist .trk').length")
    check(n_rows == 250, f'[{tag}] 250 Zeilen in der Liste ({n_rows})')
    di = day_index(); want = META['tracks'][di]
    day_name = s.ev("() => document.querySelector('#sam .samday .trk b').textContent")
    check(day_name == want['name'], f'[{tag}] Strecke des Tages = #{di + 1} „{want["name"]}“ ({day_name})')
    check(s.ev("() => !document.querySelector('#sam [data-a=trkdel]')"), f'[{tag}] kein 🗑 in der Sammlung')
    link = s.ev("() => { const a = document.querySelector('#sam .samlink a'); return a && a.href; }")
    check(link == 'https://zak.stunts.hu/tracks', f'[{tag}] Hinweis mit Link auf zak.stunts.hu/tracks')
    drawn = s.ev("() => document.querySelectorAll('#sam canvas[data-done]').length")
    check(0 < drawn < 60, f'[{tag}] Minikarten träge gezeichnet ({drawn} von 251)')
    # Touch-Ziele + Schrift
    small = s.ev("""() => [...document.querySelectorAll('#sam button, #sam .samq, #sam .samsel')].filter((b) => b.offsetParent)
      .map((b) => { const r = b.getBoundingClientRect(); return { t: (b.textContent || b.className).trim().slice(0, 20), h: Math.round(r.height), w: Math.round(r.width) }; })
      .filter((x) => x.h < 44 || x.w < 44)""")
    check(not small, f'[{tag}] Touch-Ziele ≥ 44 px {small[:4]}')
    fs = s.ev("() => [getComputedStyle(document.querySelector('#sam .samq')).fontSize, getComputedStyle(document.querySelector('#sam .samsel')).fontSize]")
    check(all(float(x[:-2]) >= 16 for x in fs), f'[{tag}] Suchfeld/Sortierung Schrift ≥ 16 px {fs}')
    s.ev("() => document.querySelector('#sam').scrollIntoView({ block: 'start' })"); time.sleep(0.4)
    s.shot(f'{tag}_1_offen', 'sammlung')
    # Suche (Groß/klein egal) – Tippen darf keine Spieltasten auslösen (C = Kamera)
    word = META['tracks'][0]['name'].split(' ')[1][:5]
    s.pg.locator('#sam .samq').click(); s.pg.keyboard.type(word.upper()); time.sleep(0.6)
    rows = s.ev("() => [...document.querySelectorAll('#sam .samlist .trk b')].map((b) => b.textContent)")
    check(rows and all(word.lower() in r.lower() for r in rows), f'[{tag}] Suche „{word.upper()}“ → {len(rows)} Treffer')
    check(s.ev("() => document.querySelector('#toast').classList.contains('show') ? document.querySelector('#toast').textContent : ''") == '', f'[{tag}] Tippen löst keine Spieltaste aus')
    s.pg.locator('#sam .samq').fill(''); s.pg.locator('#sam .samq').dispatch_event('input'); time.sleep(0.5)
    # Filter: Irre + Looping
    filters_open(s)
    s.tap('#sam .chip[data-v="d:3"]'); s.tap('#sam .chip[data-v="st:loop"]'); time.sleep(0.4)
    want_n = sum(1 for t in META['tracks'] if t['d'] == 3 and t['st'].get('loop'))
    got_n = s.ev("() => document.querySelectorAll('#sam .samlist .trk').length")
    check(got_n == want_n, f'[{tag}] Filter Irre + Looping: {got_n} (erwartet {want_n})')
    subs = s.ev("() => [...document.querySelectorAll('#sam .samlist .trk small')].map((x) => x.textContent)")
    check(all('Irre' in x for x in subs), f'[{tag}] alle Zeilen „Irre“')
    s.ev("() => document.querySelector('#sam .chips').scrollIntoView({ block: 'start' })"); time.sleep(0.3)
    s.shot(f'{tag}_2_filter', 'sammlung')
    # Sortierung Länge
    s.pg.select_option('#sam .samsel', 'len'); time.sleep(0.4)
    kms = s.ev("() => [...document.querySelectorAll('#sam .samlist .trk small')].map((x) => parseFloat(x.textContent.split('·')[1].replace(',', '.')))")
    check(kms == sorted(kms) and len(kms) == want_n, f'[{tag}] Sortierung Länge aufsteigend ({kms[:4]} …)')
    if full:
        # Zustand bleibt nach Neuladen
        s.pg.reload(); s.pg.wait_for_function("window.__app && window.__app.ready && window.__app.frames > 3", timeout=120000)
        open_lib(s); s.pg.wait_for_selector('#sam .samlist .trk', timeout=20000); time.sleep(0.5)
        st = s.ev("() => window.__game.store.settings.sam")
        check(st['open'] and st['d'] == [3] and st['st'] == ['loop'] and st['sort'] == 'len', f'[{tag}] Zustand nach Neuladen: offen, Irre+Looping, Länge')
        check(s.ev("() => document.querySelectorAll('#sam .samlist .trk').length") == want_n, f'[{tag}] gefilterte Liste nach Neuladen')
        s.tap('#sam [data-a=samreset]'); time.sleep(0.4)
        check(s.ev("() => document.querySelectorAll('#sam .samlist .trk').length") == 250, f'[{tag}] Zurücksetzen → 250')
        # Strecke des Tages fahren
        s.tap('#sam .samday [data-a=trkplay]')
        s.pg.wait_for_function("window.__game.mode === 'menu' && document.querySelector('#menu.show') && window.__game.env.meta.key && window.__game.env.meta.key.startsWith('sam-')", timeout=120000)
        time.sleep(1.0)
        info = s.ev("() => { const m = window.__game.env.meta; return { key: m.key, name: m.name, day: !!m.samDay, ap: m.apTime, tname: document.querySelector('#menu .tname').innerText, meta: document.querySelector('#menu .tmeta').innerText }; }")
        check(info['key'] == want['id'] and info['day'] and 'Strecke des Tages' in info['tname'] and '⭐ Sammlung' in info['meta'], f'[{tag}] Menü: {info["name"]} ({info["key"]}), „Strecke des Tages“, {info["meta"][:40]}')
        check(abs((info['ap'] or 0) - (want['ap'] or 0)) < 0.01, f'[{tag}] Autopilot-Referenz aus dem Paket, keine Probefahrt ({info["ap"]})')
        s.shot(f'{tag}_3_menue', 'sammlung')
        s.tap('[data-a=start]'); time.sleep(0.5)
        s.ev("() => window.__game.sim(4)")
        st = s.ev("() => window.__game.sim(12)")
        check(st['state'] == 'running' and st['speed'] > 10, f'[{tag}] Rennen läuft auf Leicht ({st["speed"]:.0f} m/s)')
        s.frames(4); time.sleep(0.5)
        s.shot(f'{tag}_4_fahrt', 'sammlung')
        st = s.ev("() => window.__game.sim(400)")
        s.pg.wait_for_function("document.querySelector('#result.show')", timeout=30000)
        check(st['state'] == 'finished', f'[{tag}] im Ziel ({st["time"]:.1f} s)')
        best = s.ev(f"() => window.__game.store.bestFor('{want['id']}', 'easy')")
        check(best is not None, f'[{tag}] Bestzeit gespeichert ({best and best["time"]:.2f} s)')
        s.tap('[data-a=menu]'); time.sleep(0.4)
        open_lib(s); s.pg.wait_for_selector('#sam .samlist .trk', timeout=20000); time.sleep(0.4)
        filters_open(s)
        s.tap('#sam .chip[data-v="never:1"]'); time.sleep(0.3)
        n_never = s.ev("() => document.querySelectorAll('#sam .samlist .trk').length")
        check(n_never == 249, f'[{tag}] „noch nie gefahren“ → 249 ({n_never})')
        s.tap('#sam .chip[data-v="never:1"]'); s.tap('#sam .chip[data-v="mine:1"]'); time.sleep(0.3)
        mine = s.ev("() => [...document.querySelectorAll('#sam .samlist .trk b')].map((b) => b.textContent)")
        check(mine == [want['name']], f'[{tag}] „mit meiner Bestzeit“ → {mine}')
        s.tap('#sam .chip[data-v="mine:1"]'); time.sleep(0.2)
        s.pg.select_option('#sam .samsel', 'recent'); time.sleep(0.4)
        first = s.ev("() => document.querySelector('#sam .samlist .trk b').textContent")
        check(first == want['name'], f'[{tag}] „zuletzt gefahren“ zuerst: {first}')
        bt = s.ev("() => document.querySelector('#sam .samlist .trk .tbests').innerText")
        check(any(ch.isdigit() for ch in bt), f'[{tag}] eigene Bestzeit in der Zeile ({bt.strip()[:30]})')
        s.pg.select_option('#sam .samsel', 'rec'); time.sleep(0.2)
        # „Meine Strecken“ bleibt leer (Sammlung zählt nicht dazu)
        check(s.ev("() => window.__game.trkLib.list.length") == 0, f'[{tag}] nicht in „Meine Strecken“ aufgenommen')
    errs = [e for e in s.errors]
    check(not errs, f'[{tag}] 0 Seitenfehler {errs[:3]}')
    s.close()

def run404(pw, base):
    s = Session(pw, base, device=PIXEL7_PORT)
    s.pg.route('**/assets/sammlung.json', lambda r: r.fulfill(status=404, body='not found'))
    s.open('?nosw')
    open_lib(s)
    s.tap('#sam .samhead')
    try: s.pg.wait_for_function("() => !document.getElementById('sam')", timeout=15000)
    except Exception: pass
    gone = s.ev("() => !document.getElementById('sam')")
    txt = s.ev("() => document.querySelector('#sheet .scroll').innerText")
    check(gone and 'Fehler' not in txt and 'Sammlung' not in txt, f'[404] Paket fehlt → Abschnitt ausgeblendet, keine Fehlermeldung (weg: {gone}, Text: {txt[:160]!r})')
    s.tap('[data-a=close]'); time.sleep(0.3); open_lib(s)
    check(s.ev("() => !document.getElementById('sam')"), '[404] bleibt ausgeblendet')
    errs = [e for e in s.errors if '404' not in e and 'Failed to load resource' not in e]
    check(not errs, f'[404] keine Seitenfehler {errs[:3]}')
    s.close()

base = sys.argv[1] if len(sys.argv) > 1 else None
with sync_playwright() as pw:
    if base:
        run(pw, base, PIXEL7_PORT, 'live_hoch', True)
    else:
        with Server() as srv:
            run(pw, srv.base, PIXEL7_PORT, 'hoch', True)
            run(pw, srv.base, PIXEL7_LAND, 'quer', False)
            run404(pw, srv.base)
print(f'{len(fails)} Fehler' if fails else 'Sammlung-Oberfläche: alle Prüfungen grün')
sys.exit(1 if fails else 0)
