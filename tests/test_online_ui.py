# n35 Online im Browser: EIN Playwright-Browser (stumm), ZWEI Pages = zwei Spieler. Standard über BroadcastChannel
# (?netz=bc, kein Internet nötig); mit ECHT=1 über Trystero/öffentliche Relays (Nostr, Ausweich MQTT).
# Ablauf: A erstellt Raum → Code; B öffnet den Teilen-Link (?raum=CODE), tritt bei; B bekommt die Strecke als Daten und baut sie;
# B „Bereit“; A: 2 KI auffüllen, Start; beide fahren per Autopilot in Echtzeit (die Rennuhr hängt an der Sitzungsuhr – kein
# __game.sim!); Countdown-Abstand, fremde Autos sichtbar, Rangliste im HUD, Zieltabelle auf beiden gleich, Liste „Online“,
# Solo-Bestzeiten unberührt; Revanche; Screenshots hoch/quer (Lobby, Startaufstellung, Zweikampf, Zieltabelle) nach
# tests/shots/n35/. 0 JS-Fehler. VORBAU (Leicht-Spur): NICHT ausgeführt – der Heavy-Job nimmt es ab und passt Wartezeiten an.
# Aufruf: python3 tests/test_online_ui.py            (BroadcastChannel)
#         ECHT=1 python3 tests/test_online_ui.py     (echte Relays, braucht Internet; Code zufällig)
import sys, time, json, os
sys.path.insert(0, 'tests')
import util as U
from util import *

# zwei Seiten im selben Browser sollen beide voll laufen (rAF/Timer nicht drosseln)
U.ARGS = U.ARGS + ['--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding']
ECHT = os.environ.get('ECHT') == '1'
NETZ = '' if ECHT else '&netz=bc'
Q = f'?nosw&online=1{NETZ}&seed=4711&d=2'

bad = 0
def ok(c, m):
    global bad
    print(('OK   ' if c else 'FAIL ') + m, flush=True)
    if not c: bad += 1

def warte(pg, js, s=30, schritt=0.25):
    t0 = time.time()
    while time.time() - t0 < s:
        try:
            if pg.evaluate(js): return True
        except Exception: pass
        time.sleep(schritt)
    return False

ZUSTAND = "(() => { const o = __game.online; return o && o.spiel ? o.spiel.zustand() : null; })()"

with Server() as srv, sync_playwright() as pw:
    s = Session(pw, srv.base, device=PIXEL7_LAND)
    A = s.pg
    B = s.ctx.new_page()
    errB = []
    B.on('pageerror', lambda e: errB.append('PAGEERROR ' + str(e)))
    B.on('console', lambda m: errB.append('CONSOLE ' + m.text) if m.type == 'error' else None)
    s.open(Q)
    # --- A: Raum erstellen ---
    A.evaluate("__game.store.settings.spielerName = 'Peter'; __game.store.settings.assist = 'original'; __game.store.save()")
    best0 = A.evaluate("JSON.stringify(__game.store.best)")
    s.tap('[data-a=online]')
    ok(warte(A, "!!document.getElementById('onname')", 10), 'Menü „👥 Online“ öffnet die Start-Ansicht (Name, Raum erstellen, Code)')
    s.shot('lobby_start_quer', 'n35')
    s.tap('[data-a=onerstellen]')
    ok(warte(A, f"{ZUSTAND} && {ZUSTAND}.code", 20), 'Raum erstellt')
    z = A.evaluate(ZUSTAND)
    code, link = z['code'], z['link']
    ok(len(code) == 4 and all(c not in code for c in '0O1IL') and link.endswith('raum=' + code), f'Raumcode {z["vorlesbar"]}, Link {link}')
    # --- B: Link öffnen, beitreten ---
    B.goto(link)   # Teilen-Link = Adresse von A (lokal: …/index.html?nosw&online=1&netz=bc&…&raum=CODE)
    B.wait_for_function("window.__app && window.__app.ready && window.__app.frames > 3", timeout=400000)
    ok(warte(B, f"document.getElementById('oncode') && document.getElementById('oncode').value === '{code}'", 15), 'B: Link mit ?raum= öffnet die Beitreten-Ansicht mit vorbelegtem Code')
    B.evaluate("__game.store.settings.spielerName = 'Ben'; __game.store.settings.assist = 'easy'; __game.store.save(); document.getElementById('onname').value = 'Ben'")
    B.evaluate("__game.online.aktion('onbeitreten')")
    ok(warte(B, f"{ZUSTAND} && {ZUSTAND}.mitglieder.length === 2", 30) and warte(A, f"{ZUSTAND}.mitglieder.length === 2", 10), 'beide sehen 2 Mitglieder')
    ok(warte(B, f"{ZUSTAND}.geladen && {ZUSTAND}.geladen === {ZUSTAND}.einst.strecke", 90), 'B: Strecke als Daten bekommen und gebaut')
    ok(abs(A.evaluate("__game.env.track.line.total") - B.evaluate("__game.env.track.line.total")) < 1e-3, 'gleiche Strecke (Länge)')
    B.evaluate("__game.online.aktion('onbereit')")
    A.evaluate("__game.online.aktion('onki', '2')")
    ok(warte(A, f"{ZUSTAND}.start.ok", 10), 'Start frei (B bereit, Strecke geladen)')
    A.evaluate("__game.online.ansicht.zeigeLobby()"); time.sleep(0.4)
    s.shot('lobby_gastgeber_quer', 'n35')
    A.set_viewport_size({'width': 412, 'height': 915}); time.sleep(0.6); s.shot('lobby_gastgeber_hoch', 'n35'); A.set_viewport_size({'width': 915, 'height': 412})
    B.evaluate("__game.online.ansicht.zeigeLobby()"); time.sleep(0.4); B.screenshot(path='tests/shots/n35/lobby_gast_quer.png')
    # --- Start ---
    A.evaluate("__game.online.aktion('onstart')")
    ok(warte(A, "__game.race && __game.race.online", 15) and warte(B, "__game.race && __game.race.online", 15), 'beide im Online-Rennen')
    for P in (A, B): P.evaluate("__game.race.autopilotOnly = true")
    time.sleep(1.0); s.shot('startaufstellung_quer', 'n35')
    # „Los!“: Zeitpunkt in Sitzungszeit auf beiden Seiten (Abstand der wahren Zeit kann man in einem Browser direkt vergleichen)
    los = {}
    t0 = time.time()
    while time.time() - t0 < 15 and len(los) < 2:
        for n, P in (('A', A), ('B', B)):
            if n not in los and P.evaluate("__game.race.state !== 'countdown'"): los[n] = time.time()
        time.sleep(0.01)
    ok(len(los) == 2 and abs(los['A'] - los['B']) < 0.08, f'„Los!“ auf beiden Seiten {abs(los.get("A", 0) - los.get("B", 9)) * 1000:.0f} ms auseinander (Messung grob, 10-ms-Raster; Grenze ±50 ms)')
    time.sleep(6)
    fremd = B.evaluate("(() => { const R = __game.online.rennen; return [...R.autos.values()].map((X) => ({ ki: X.ki, ok: X.auto.gueltig, x: X.auto.pos.x })); })()")
    ok(sum(1 for f in fremd if f['ok']) == 3 and sum(1 for f in fremd if f['ki']) == 2, f'B sieht Peter + 2 KI ({fremd})')
    hud = B.evaluate("document.querySelector('#hud .gpos').textContent")
    ok(hud.startswith('Platz ') and '/4' in hud, f'HUD B: „{hud}“')
    ok(A.evaluate("__game.gegnerVis.aktiv") == 3 and B.evaluate("__game.gegnerVis.aktiv") == 3, 'je 3 fremde Autos dargestellt (GegnerVis)')
    s.shot('zweikampf_quer', 'n35'); B.screenshot(path='tests/shots/n35/zweikampf_gast_quer.png')
    # --- Ziel ---
    ok(warte(A, f"{ZUSTAND}.phase === 'ergebnis'", 240, 1) and warte(B, f"{ZUSTAND}.phase === 'ergebnis'", 20), 'Zieltabelle auf beiden')
    tab = lambda P: P.evaluate(f"JSON.stringify({ZUSTAND}.ergebnis.map((e) => [e.platz, e.name, e.zeit]))")
    ok(tab(A) == tab(B), f'Zieltabelle gleich: {tab(A)}')
    ok(warte(A, "!!document.querySelector('[data-a=onrevanche]')", 30), 'Ergebnis-Ansicht mit Revanche')
    s.shot('zieltabelle_quer', 'n35'); A.set_viewport_size({'width': 412, 'height': 915}); time.sleep(0.6); s.shot('zieltabelle_hoch', 'n35'); A.set_viewport_size({'width': 915, 'height': 412})
    ok(A.evaluate("__game.store.online.length") >= 1 and B.evaluate("__game.store.online.length") >= 1 and A.evaluate("JSON.stringify(__game.store.best)") == best0, 'Liste „Online“ auf beiden, Solo-Bestzeiten unberührt')
    # --- Revanche ---
    A.evaluate("__game.online.aktion('onrevanche')")
    ok(warte(B, "__game.race && __game.race.online && __game.race.state === 'countdown'", 15), 'Revanche: neuer Countdown bei B')
    A.evaluate("__game.online.aktion('onverlassen')"); B.evaluate("__game.online.aktion('onverlassen')")
    err = [e for e in s.errors + errB if 'GL Driver' not in e]
    ok(not err, f'keine JS-Fehler {err[:4]}')
    s.close()
print('Online-UI: ' + (f'{bad} FEHLER' if bad else 'alle Prüfungen grün'))
sys.exit(1 if bad else 0)
