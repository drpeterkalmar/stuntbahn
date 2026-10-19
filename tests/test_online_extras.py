# n35 Online-Extras im Browser (EIN Browser stumm, zwei Pages, BroadcastChannel): 💬 Kurzruf (Leiste, Emoji über dem Auto
# beim Absender und beim Mitspieler), ⏸ im Online-Rennen = „Weiterfahren / Aufgeben“ (Zeit läuft weiter), Aufgeben →
# Auto beim anderen sofort weg + Hinweis, Zieltabelle ohne 45-s-Warten mit „aufgegeben“; Knöpfe ≥ 48 px; Screenshots.
# Aufruf: python3 tests/test_online_extras.py
import sys, time
sys.path.insert(0, 'tests')
import util as U
from util import *
U.ARGS = U.ARGS + ['--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding']
Q = '?nosw&netz=bc&seed=4711&d=2'   # ohne ?online=1: der Knopf ist jetzt Standard
Z = "(() => { const o = __game.online; return o && o.spiel ? o.spiel.zustand() : null; })()"
bad = 0
def ok(c, m):
    global bad
    print(('OK   ' if c else 'FAIL ') + m, flush=True)
    if not c: bad += 1
def warte(pg, js, s=30, schritt=0.2):
    t0 = time.time()
    while time.time() - t0 < s:
        try:
            if pg.evaluate(js): return True
        except Exception: pass
        time.sleep(schritt)
    return False
RUFE = "[...document.querySelectorAll('#rufe i')].filter((e) => e.style.display !== 'none').map((e) => { const r = e.getBoundingClientRect(); return [e.textContent, Math.round(r.x + r.width / 2), Math.round(r.y + r.height)]; })"
with Server() as srv, sync_playwright() as pw:
    s = Session(pw, srv.base, device=PIXEL7_LAND)
    A = s.pg; B = s.ctx.new_page(); errB = []
    B.on('pageerror', lambda e: errB.append('PAGEERROR ' + str(e)))
    s.open(Q)
    # Menü mit „👥 Online“ (Standard an) hoch und quer: Knopf da, alle Knöpfe ≥ 48 px und im Bild
    ok(A.evaluate("!!document.querySelector('#menu [data-a=online]')"), 'Menü zeigt „👥 Online“ ohne ?online=1')
    # (das Menü scrollt – Knöpfe unterhalb des Bilds sind erlaubt, nur die Größe zählt)
    klein = lambda: [b for b in s.small_buttons() if b['w'] < 47.5 or b['h'] < 47.5]
    small = klein(); ok(not small, f'Menü quer: Knöpfe ≥ 48 px {small[:4]}'); s.shot('menue_online_quer', 'n35')
    A.set_viewport_size({'width': 412, 'height': 915}); time.sleep(0.8)
    small = klein(); ok(not small, f'Menü hoch: Knöpfe ≥ 48 px {small[:4]}'); s.shot('menue_online_hoch', 'n35')
    A.set_viewport_size({'width': 915, 'height': 412}); time.sleep(0.5)
    A.evaluate("__game.store.settings.spielerName = 'Peter'; __game.store.save()")
    s.tap('[data-a=online]'); time.sleep(0.3); s.tap('[data-a=onerstellen]')
    warte(A, f"{Z} && {Z}.code", 20)
    B.goto(A.evaluate(f"{Z}.link")); B.wait_for_function("window.__app && window.__app.ready && window.__app.frames > 3", timeout=400000)
    B.evaluate("document.getElementById('onname').value = 'Ben'; __game.online.aktion('onbeitreten')")
    ok(warte(B, f"{Z} && {Z}.geladen && {Z}.geladen === {Z}.einst.strecke", 90), 'B im Raum, Strecke geladen')
    B.evaluate("__game.online.aktion('onbereit')"); warte(A, f"{Z}.start.ok", 15)
    A.evaluate("__game.online.aktion('onstart')")
    ok(warte(A, "__game.race && __game.race.online", 15) and warte(B, "__game.race && __game.race.online", 15), 'beide im Rennen')
    for P in (A, B): P.evaluate("__game.race.autopilotOnly = true")
    ok(warte(A, "__game.race.state === 'running'", 15), 'läuft')
    time.sleep(2.5)
    ok(B.evaluate("document.body.dataset.screen") != 'sheet', 'kein Lobby-Blatt über dem Rennen beim Gast (Fehler aus der Abnahme: verspätetes Nachzeichnen nach „Bereit“)')
    # --- Kurzruf: A (vorn) ruft 👍 – B (dahinter) sieht es über A, A über dem eigenen Auto
    ok(B.evaluate("getComputedStyle(document.querySelector('#hud .rb.emo')).display") != 'none', '💬 im Online-Rennen sichtbar')
    box = B.locator('#hud .rb.emo').bounding_box()
    print('  💬 bei', box, 'oben liegt:', B.evaluate(f"(() => {{ const e = document.elementFromPoint({box['x'] + box['width'] / 2}, {box['y'] + box['height'] / 2}); return e ? e.tagName + '.' + e.className + '#' + e.id + ' ' + (e.dataset.a || '') : null; }})()"))
    B.touchscreen.tap(box['x'] + box['width'] / 2, box['y'] + box['height'] / 2); time.sleep(0.5)
    ok(B.evaluate("document.querySelector('#hud .emobar').classList.contains('show')"), 'Tippen auf 💬 öffnet die Kurzruf-Leiste')
    leiste = B.evaluate("[...document.querySelectorAll('#hud .emobar button')].map((b) => { const r = b.getBoundingClientRect(); return [b.textContent, Math.round(r.width), Math.round(r.height), Math.round(r.right), Math.round(r.bottom)]; })")
    ok(len(leiste) == 6 and all(w >= 48 and h >= 48 and r <= 915 and bt <= 412 for _, w, h, r, bt in leiste), f'6 Kurzrufe, je ≥ 48 px, im Bild: {leiste}')
    B.screenshot(path='tests/shots/n35/kurzruf_leiste_quer.png')
    UEBER = "(() => { const a = [...document.querySelectorAll('#hud .emobar button')].map((b) => b.getBoundingClientRect()); const x = [...document.querySelectorAll('#hud .xb, #touch .tb, #karte')].filter((e) => e.offsetParent !== null).map((e) => e.getBoundingClientRect()).filter((r) => r.width); return a.filter((r) => x.some((q) => r.left < q.right && r.right > q.left && r.top < q.bottom && r.bottom > q.top)).length; })()"
    ok(B.evaluate(UEBER) == 0, f'Kurzruf-Leiste quer überdeckt keine Fahr-Knöpfe/Minikarte ({B.evaluate(UEBER)})')
    B.evaluate("__game.online.ansicht.rufLeiste(false)"); B.set_viewport_size({'width': 412, 'height': 915}); time.sleep(0.6)
    B.evaluate("__game.online.ansicht.rufLeiste(true)"); time.sleep(0.3)
    ok(B.evaluate(UEBER) == 0, f'… und hochkant ({B.evaluate(UEBER)})')
    ok(B.evaluate("document.body.dataset.screen") != 'sheet', 'Drehen im Online-Rennen öffnet kein Blatt (Zeit läuft ohnehin)')
    B.screenshot(path='tests/shots/n35/kurzruf_leiste_hoch.png'); B.evaluate("__game.online.ansicht.rufLeiste(false)")
    B.set_viewport_size({'width': 915, 'height': 412}); time.sleep(0.5)
    # (zwei Seiten in einem Browser: die jeweils handelnde Seite nach vorn – eine Hintergrund-Seite zeichnet sonst evtl. kurz nicht)
    A.bring_to_front(); A.evaluate("__game.online.aktion('onruf', '👍')")
    ok(warte(A, f"{RUFE}.some((r) => r[0] === '👍')", 2, 0.05), 'A sieht den eigenen Ruf über dem eigenen Auto')
    B.bring_to_front()
    gesehen = warte(B, f"{RUFE}.some((r) => r[0] === '👍')", 3, 0.05)
    if not gesehen: print('  DEBUG B:', B.evaluate("JSON.stringify({ rufe: __game.online.rufe, autos: [...__game.online.rennen.autos.values()].map((X) => [X.pid, X.ki, X.auto.gueltig]), vis: __game.gegnerVis.autos.slice(0, __game.gegnerVis.aktiv).map((A) => A.car.root.visible) })"))
    ok(gesehen, f'B sieht 👍 von Peter über dessen Auto: {B.evaluate(RUFE)}')
    time.sleep(0.25); B.screenshot(path='tests/shots/n35/kurzruf_quer.png')
    ok(warte(B, f"{RUFE}.length === 0", 4), 'nach ~2,5 s wieder weg')
    # --- Online-Pause: Zeit läuft weiter, Weiterfahren / Aufgeben
    t0 = B.evaluate("__game.race.time")
    B.keyboard.press('Escape')
    ok(warte(B, "!!document.querySelector('[data-a=onaufgeben]')", 3), '⏸/Esc im Online-Rennen: Blatt „Weiterfahren / Aufgeben“')
    time.sleep(1.0)
    ok(B.evaluate("__game.race.time") > t0 + 0.8, f'Zeit läuft weiter ({t0:.1f} → {B.evaluate("__game.race.time"):.1f} s)')
    B.screenshot(path='tests/shots/n35/online_pause_quer.png')
    B.evaluate("__game.online.aktion('onweiter')"); time.sleep(0.3)
    ok(B.evaluate("document.body.dataset.screen") in ('null', 'none', ''), f'Weiterfahren schließt das Blatt ({B.evaluate("document.body.dataset.screen")})')
    B.keyboard.press('Escape'); warte(B, "!!document.querySelector('[data-a=onaufgeben]')", 3)
    B.evaluate("__game.online.aktion('onaufgeben')")
    ok(warte(A, "[...__game.online.rennen.autos.values()].filter((X) => !X.ki).length === 0", 3), 'Ben gibt auf → sein Auto ist bei Peter sofort weg')
    ok(warte(A, "document.querySelector('#toast').textContent.includes('aufgegeben')", 3), f'Hinweis bei Peter: „{A.evaluate("document.querySelector(\'#toast\').textContent")}“')
    ok(warte(B, "document.querySelector('.sheetc') && document.querySelector('.sheetc').textContent.includes('Aufgegeben')", 5), 'Ben: „🏳️ Aufgegeben – warte auf die anderen …“')
    B.screenshot(path='tests/shots/n35/aufgegeben_warte_quer.png')
    t1 = time.time()
    ok(warte(A, f"{Z}.phase === 'ergebnis'", 200, 1) and warte(B, f"{Z}.phase === 'ergebnis'", 10), 'Zieltabelle auf beiden')
    E = A.evaluate(f"JSON.stringify({Z}.ergebnis.map((e) => [e.platz, e.name, e.zeit, !!e.aufgabe]))")
    ok('"Ben",null,true' in E, f'Ben „aufgegeben“ in der Tabelle: {E}')
    ok(warte(B, "document.querySelector('.sheetc') && document.querySelector('.sheetc').textContent.includes('aufgegeben')", 5), 'Ben sieht die Tabelle mit „aufgegeben“')
    time.sleep(0.5); B.screenshot(path='tests/shots/n35/aufgegeben_tabelle_quer.png')
    err = [e for e in s.errors + errB if 'GL Driver' not in e]
    ok(not err, f'keine JS-Fehler {err[:4]}')
    s.close()
print('Online-Extras: ' + (f'{bad} FEHLER' if bad else 'alle Prüfungen grün'))
sys.exit(1 if bad else 0)
