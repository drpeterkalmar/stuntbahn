# Import-Oberfläche im Browser (Pixel 7 quer): Menüpunkt, Datei-Auswahl (mehrere Dateien inkl. kaputter,
# Replay, ZIP), Drag & Drop, Minikarten, Fahren bis ins Ziel, Bestzeit + Geist je Strecke, Löschen.
# Testdateien: node tests/make_test_trks.mjs (eigene Strecken, tests/out/).
import os, sys, time, json, base64, subprocess
from util import Server, Session, PIXEL7_LAND, ROOT
from playwright.sync_api import sync_playwright

OUT = os.path.join(ROOT, 'tests', 'out')
subprocess.run(['node', os.path.join(ROOT, 'tests', 'make_test_trks.mjs')], check=True, capture_output=True)
fails = []
def check(cond, msg):
    print(('OK   ' if cond else 'FAIL ') + msg)
    if not cond: fails.append(msg)

with Server() as srv, sync_playwright() as pw:
    s = Session(pw, srv.base, device=PIXEL7_LAND)
    s.pg.on('dialog', lambda d: d.accept())
    s.open('?nosw')
    s.frames(5)
    # Menüpunkt → Bibliothek
    s.tap('[data-a=trklib]')
    s.pg.wait_for_selector('#sheet.show')
    check(s.small_buttons() == [], 'Bibliothek: alle Knöpfe ≥ 48 px und im Bild ' + json.dumps(s.small_buttons()))
    # Datei-Auswahl mit mehreren Dateien
    with s.pg.expect_file_chooser() as fc:
        s.tap('[data-a=trkpick]')
    fc.value.set_files([os.path.join(OUT, f) for f in ['BEISPIEL.TRK', 'OVAL.TRK', 'KAPUTT.TRK', 'NOTIZ.TRK', 'LAUF.RPL', 'PAKET.ZIP']])
    s.pg.wait_for_selector('#sheet .impres', timeout=30000)
    res = s.ev("() => document.querySelector('#sheet .impres').innerText")
    print(res)
    check('5 Strecken importiert' in res, 'fünf Strecken importiert (TRK, TRK, RPL, 2× aus ZIP)')
    check('KAPUTT.TRK' in res and 'Geländecodes' in res, 'kaputte Datei mit Meldung')
    check('NOTIZ.TRK' in res and 'zu kurz' in res, 'keine Strecke → Meldung')
    n = s.ev("() => window.__game.trkLib.list.length")
    check(n == 5, f'Bibliothek hat 5 Strecken ({n})')
    # Minikarten werden beim Sichtbarwerden gezeichnet: alle nacheinander ins Bild scrollen
    for k in range(s.ev("() => document.querySelectorAll('#sheet canvas[data-mm]').length")):
        s.ev(f"() => document.querySelectorAll('#sheet canvas[data-mm]')[{k}].scrollIntoView({{ block: 'center' }})")
        s.pg.wait_for_function(f"document.querySelectorAll('#sheet canvas[data-mm]')[{k}].dataset.done === '1'", timeout=20000)
    var = s.ev("""() => [...document.querySelectorAll('#sheet canvas[data-mm]')].map(c => { const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; const set = new Set(); for (let i = 0; i < d.length; i += 97) set.add(d[i] + ',' + d[i+1] + ',' + d[i+2]); return set.size; })""")
    check(len(var) >= 6 and min(var) > 3, 'Minikarten gezeichnet ' + str(var))
    s.shot('ui_01_bibliothek', 'trkui')
    # im Scrollbereich zählt nur die Größe (Lage ist scrollbar)
    small = s.ev("""() => [...document.querySelectorAll('#sheet button')].map(b => b.getBoundingClientRect()).filter(r => r.width < 47.5 || r.height < 47.5).length""")
    check(small == 0, f'Liste: alle Knöpfe ≥ 48 px ({small} zu klein)')
    # Drag & Drop (Desktop-Weg): Datei per drop-Ereignis
    b64 = base64.b64encode(open(os.path.join(OUT, 'SCHOTTER.TRK'), 'rb').read()).decode()
    s.ev("""(b64) => { const bin = atob(b64), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
      const dt = new DataTransfer(); dt.items.add(new File([u], 'SCHOTTER.TRK'));
      for (const t of ['dragenter', 'dragover', 'drop']) window.dispatchEvent(new DragEvent(t, { dataTransfer: dt, bubbles: true, cancelable: true })); }""", b64)
    s.pg.wait_for_function("document.querySelector('#sheet .impres') && document.querySelector('#sheet .impres').innerText.includes('vorhanden')", timeout=20000)
    check(True, 'Drag & Drop: gleiche Strecke als „schon vorhanden“ erkannt (aus dem Replay)')
    # Strecke fahren: Oval (klein) → Menü zeigt Import → Rennen auf Leicht bis ins Ziel
    oid = s.ev("() => window.__game.trkLib.list.find(t => t.name === 'OVAL').id")
    s.pg.locator(f'[data-a=trkplay][data-v="{oid}"]').scroll_into_view_if_needed()
    s.tap(f'[data-a=trkplay][data-v="{oid}"]')
    s.pg.wait_for_function("window.__game.mode === 'menu' && document.querySelector('#menu.show') && window.__game.env.meta.key.startsWith('trk-')", timeout=300000)
    meta = s.ev("() => { const m = window.__game.env.meta; return { key: m.key, name: m.name, ap: m.apTime, imported: m.imported }; }")
    print('Menü:', meta)
    check(meta['imported'] and meta['ap'], 'Menü: importierte Strecke mit Autopilot-Referenz')
    s.shot('ui_02_menue', 'trkui')
    s.ev("() => window.__game.setAssist('easy')")
    s.ev("() => window.__game.start()")
    st = None
    for _ in range(12):
        st = s.ev("() => window.__game.sim(10)")
        if st['state'] == 'finished': break
    check(st and st['state'] == 'finished', 'Rennen auf Leicht im Ziel ' + json.dumps(st and {k: st[k] for k in ('state', 'time', 'crashes')}))
    s.frames(3)
    s.shot('ui_03_ziel', 'trkui')
    best = s.ev(f"() => window.__game.store.bestFor('{oid}', 'easy')")
    ghost = s.ev(f"() => !!localStorage.getItem('stuntbahn.ghost.{oid}|' + window.__game.modeKey('easy', false))")  # neue Physik/Welt: eigene Wertung
    check(best is not None and ghost, 'Bestzeit + Geist je Strecke und Fahrhilfe gespeichert')
    # Reload: Strecke + Bestzeit bleiben im Browser
    s.pg.reload(); s.pg.wait_for_function("window.__app && window.__app.ready", timeout=300000)
    s.ev("() => window.__game.ui.showLibrary()")
    txt = s.ev("() => document.querySelector('#sheet').innerText")
    check('OVAL' in txt and '🟢 0:' in txt.replace('\n', ' '), 'nach Neuladen: Strecke + Bestzeit in der Liste')
    # Löschen (Bestätigung wird angenommen)
    s.pg.locator(f'[data-a=trkdel][data-v="{oid}"]').scroll_into_view_if_needed()
    s.tap(f'[data-a=trkdel][data-v="{oid}"]')
    time.sleep(0.5)
    n2 = s.ev("() => window.__game.trkLib.list.length")
    check(n2 == 4 and s.ev(f"() => window.__game.store.bestFor('{oid}', 'easy')") is None, 'Löschen entfernt Strecke + Bestzeit')
    check(not s.errors, 'keine Fehler ' + json.dumps(s.errors[:3]))
    s.close()
print('FEHLER:' if fails else 'ALLES OK', fails)
sys.exit(1 if fails else 0)
