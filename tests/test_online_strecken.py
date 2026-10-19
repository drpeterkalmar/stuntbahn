# n35 Strecke als Daten im Browser (EIN Browser stumm, zwei Pages, BroadcastChannel): der Gastgeber nimmt nacheinander eine
# Sammlungs-Strecke und eine eigene, importierte .TRK-Datei (Bytes gehen Base64 an den Gast, der sie NICHT in seiner
# Bibliothek hat) – der Gast baut jeweils dieselbe Strecke (Name, Länge, Checkpoints) und kann starten.
# Aufruf: python3 tests/test_online_strecken.py
import sys, time
sys.path.insert(0, 'tests')
import util as U
from util import *
U.ARGS = U.ARGS + ['--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding']
Z = "(() => { const o = __game.online; return o && o.spiel ? o.spiel.zustand() : null; })()"
GLEICH = "JSON.stringify([__game.env.meta.name, Math.round(__game.env.track.line.total * 10), __game.env.track.checkpoints ? __game.env.track.checkpoints.length : -1])"
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
with Server() as srv, sync_playwright() as pw:
    s = Session(pw, srv.base, device=PIXEL7_LAND)
    A = s.pg; B = s.ctx.new_page(); errB = []
    B.on('pageerror', lambda e: errB.append('PAGEERROR ' + str(e)))
    s.open('?nosw&netz=bc&seed=4711&d=2')
    A.evaluate("__game.store.settings.spielerName = 'Peter'; __game.store.save()")
    s.tap('[data-a=online]'); time.sleep(0.3); s.tap('[data-a=onerstellen]')
    warte(A, f"{Z} && {Z}.code", 20)
    B.goto(A.evaluate(f"{Z}.link")); B.wait_for_function("window.__app && window.__app.ready && window.__app.frames > 3", timeout=400000)
    B.evaluate("document.getElementById('onname').value = 'Ben'; __game.online.aktion('onbeitreten')")
    ok(warte(B, f"{Z} && {Z}.geladen && {Z}.geladen === {Z}.einst.strecke", 90), 'B im Raum mit der Zufallsstrecke')
    # 1) Sammlung
    sid = A.evaluate("(async () => { await __game.sammlung.load(); return __game.sammlung.meta.tracks[7].id; })()")
    A.evaluate(f"__game.loadImported('{sid}')")
    ok(warte(A, f"__game.env.meta.key === '{sid}'", 60), f'A lädt Sammlungs-Strecke {sid}')
    A.evaluate("__game.online.aktion('onstrecke')")
    ok(warte(B, f"{Z}.geladen === '{sid}' || ({Z}.geladen && {Z}.geladen.includes('{sid}'))", 90) and warte(B, f"__game.env.meta.key === '{sid}'", 30), f'B baut dieselbe Sammlungs-Strecke ({B.evaluate("__game.env.meta.key")})')
    gA, gB = A.evaluate(GLEICH), B.evaluate(GLEICH)
    ok(gA == gB, f'gleich (Name, Länge, Checkpoints): {gA} / {gB}')
    # 2) eigene .TRK (nur A hat sie): Bytes der Beispielstrecke unter neuem Namen importieren
    A.evaluate("(async () => { const m = await import('./src/track/showcase.js'); const b = m.showcaseBytes('demo-rundkurs'); const r = await __game.importBytes([...b], 'Peters Bahn.trk'); window.__trkId = r[0].id; })()")
    ok(warte(A, "!!window.__trkId", 20), f'A importiert eine .TRK ({A.evaluate("window.__trkId")})')
    tid = A.evaluate("window.__trkId")
    A.evaluate(f"__game.loadImported('{tid}')")
    ok(warte(A, f"__game.env.meta.key === '{tid}'", 90), 'A lädt die eigene .TRK')
    ok(B.evaluate(f"!__game.trkLib.get('{tid}')"), 'B hat sie nicht in der Bibliothek')
    A.evaluate("__game.online.aktion('onstrecke')")
    ok(warte(B, f"__game.env.meta.key === '{tid}'", 90), 'B baut die .TRK aus den übertragenen Bytes')
    gA, gB = A.evaluate(GLEICH), B.evaluate(GLEICH)
    ok(gA == gB, f'gleich: {gA} / {gB}')
    ok(B.evaluate(f"!__game.trkLib.get('{tid}')"), 'fremde .TRK landet nicht in Bens Bibliothek')
    B.evaluate("__game.online.aktion('onbereit')")
    ok(warte(A, f"{Z}.start.ok", 20), 'Start frei auf der .TRK')
    A.evaluate("__game.online.ansicht.zeigeLobby()"); time.sleep(0.4); s.shot('lobby_trk_quer', 'n35')
    A.evaluate("__game.online.aktion('onstart')")
    ok(warte(A, "__game.race && __game.race.online && __game.race.state === 'running'", 20) and warte(B, "__game.race && __game.race.online && __game.race.state === 'running'", 5), 'Rennen auf der .TRK läuft auf beiden')
    err = [e for e in s.errors + errB if 'GL Driver' not in e]
    ok(not err, f'keine JS-Fehler {err[:4]}')
    s.close()
print('Online-Strecken: ' + (f'{bad} FEHLER' if bad else 'alle Prüfungen grün'))
sys.exit(1 if bad else 0)
