# n35 Abbrüche im Browser (EIN Browser stumm, Pages = Spieler, BroadcastChannel ?netz=bc):
# 1) drei Spieler + 1 KI im Rennen; Gast C schließt den Tab → Auto verschwindet mit Hinweis „Cleo ist weg“
# 2) Gastgeber A reißt mitten im Rennen ab (Funkloch: kein Abmelden, Netz stumm) → B wird Gastgeber, A + KI verschwinden,
#    B fährt zu Ende, Zieltabelle (A „weg“ bzw. nicht im Ziel)
# 3) B (jetzt Gastgeber) in der Lobby; Neu-Laden eines Gast-Tabs (D tritt bei, lädt neu) → gleicher Platz
# 4) App im Hintergrund > 4 s (sichtbar(false/true)) → „Verbinde neu …“, danach wieder beide in der Lobby
# Screenshots nach tests/shots/n35/. Aufruf: python3 tests/test_online_abbruch.py
import sys, time, os
sys.path.insert(0, 'tests')
import util as U
from util import *
U.ARGS = U.ARGS + ['--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding']
Q = '?nosw&online=1&netz=bc&seed=4711&d=2'
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
Z = "(() => { const o = __game.online; return o && o.spiel ? o.spiel.zustand() : null; })()"
HIN = "JSON.stringify(__game.online.spiel.hinweise.map((h) => h.text))"
def neue(s, link, name):
    P = s.ctx.new_page()
    errs = []
    P.on('pageerror', lambda e: errs.append('PAGEERROR ' + str(e)))
    P.goto(link); P.wait_for_function("window.__app && window.__app.ready && window.__app.frames > 3", timeout=400000)
    P.evaluate(f"__game.store.settings.spielerName = '{name}'; __game.store.save(); document.getElementById('onname').value = '{name}'; __game.online.aktion('onbeitreten')")
    return P, errs

with Server() as srv, sync_playwright() as pw:
    s = Session(pw, srv.base, device=PIXEL7_LAND)
    A = s.pg
    s.open(Q)
    A.evaluate("__game.store.settings.spielerName = 'Peter'; __game.store.save()")
    s.tap('[data-a=online]'); time.sleep(0.3); s.tap('[data-a=onerstellen]')
    ok(warte(A, f"{Z} && {Z}.code", 20), 'A: Raum erstellt')
    link = A.evaluate(f"{Z}.link")
    B, eB = neue(s, link, 'Ben'); C, eC = neue(s, link, 'Cleo')
    ok(warte(A, f"{Z}.mitglieder.length === 3", 30), 'drei Spieler im Raum')
    for P in (B, C): ok(warte(P, f"{Z}.geladen && {Z}.geladen === {Z}.einst.strecke", 90), 'Strecke beim Gast gebaut'); P.evaluate("__game.online.aktion('onbereit')")
    A.evaluate("__game.online.aktion('onki', '1')")
    ok(warte(A, f"{Z}.start.ok", 15), 'Start frei')
    A.evaluate("__game.online.aktion('onstart')")
    ok(all(warte(P, "__game.race && __game.race.online", 15) for P in (A, B, C)), 'alle drei im Rennen')
    for P in (A, B, C): P.evaluate("__game.race.autopilotOnly = true")
    ok(warte(B, "__game.race.state === 'running'", 15), 'Rennen läuft')
    time.sleep(4)
    ok(B.evaluate("__game.gegnerVis.aktiv") == 3, f'B sieht 3 fremde Autos (Peter, Cleo, KI): {B.evaluate("__game.gegnerVis.aktiv")}')
    # 1) Gast schließt den Tab
    C.close()
    ok(warte(B, f"{HIN}.includes('Cleo ist weg')", 10) and warte(A, f"{HIN}.includes('Cleo ist weg')", 5), 'Cleo schließt den Tab → „Cleo ist weg“ bei A und B')
    ok(warte(B, "[...__game.online.rennen.autos.values()].filter((X) => !X.ki).length === 1", 5), 'Cleos Auto verschwindet bei B')
    time.sleep(0.3); B.screenshot(path='tests/shots/n35/abbruch_gast_weg_quer.png')
    # 2) Gastgeber reißt ab (Funkloch: Netz stumm, keine Abmeldung)
    A.evaluate("(() => { const t = __game.online.spiel.S.tr; t.aktiv = false; clearInterval(t._herz); })()")
    t0 = time.time()
    ok(warte(B, f"{Z}.gastgeber", 20), f'B wird Gastgeber nach {time.time() - t0:.1f} s')
    ok(warte(B, f"{HIN}.includes('Du bist jetzt Gastgeber')", 3), 'Hinweis „Du bist jetzt Gastgeber“')
    ok(warte(B, "__game.online.rennen.autos.size === 0", 8), 'A und die KI des alten Gastgebers verschwinden bei B')
    ok(B.evaluate("__game.race.online && __game.race.state === 'running'"), 'B fährt weiter')
    time.sleep(0.5); B.screenshot(path='tests/shots/n35/abbruch_gastgeber_weg_quer.png')
    A.close()
    ok(warte(B, f"{Z}.phase === 'ergebnis'", 240, 1), 'B im Ziel → Zieltabelle')
    E = B.evaluate(f"JSON.stringify({Z}.ergebnis.map((e) => [e.platz, e.name, e.zeit, !!e.weg]))")
    ok('"Ben"' in E, f'Zieltabelle bei B: {E}')
    time.sleep(1); B.screenshot(path='tests/shots/n35/abbruch_ziel_quer.png')
    # 3) Lobby, neuer Gast D, Neu-Laden → gleicher Platz
    B.evaluate("__game.online.aktion('onlobby')")
    D, eD = neue(s, B.evaluate(f"{Z}.link"), 'Dora')
    ok(warte(B, f"{Z}.mitglieder.length === 2", 30), 'Dora tritt dem Raum von B (neuer Gastgeber) bei')
    nrD = D.evaluate(f"{Z}.mitglieder.find((m) => m.ich).nummer")
    D.reload(); D.wait_for_function("window.__app && window.__app.ready && window.__app.frames > 3", timeout=400000)
    D.evaluate("document.getElementById('onname').value = 'Dora'; __game.online.aktion('onbeitreten')")
    ok(warte(D, f"{Z} && {Z}.mitglieder.length === 2 && {Z}.status === 'lobby'", 30), 'Dora nach Neu-Laden wieder im Raum')
    ok(warte(B, f"{Z}.mitglieder.length === 2", 10), f'B: weiter 2 Mitglieder (keine Doppelung) {B.evaluate(Z + ".mitglieder.map((m) => m.name + m.nummer).join()")}')
    ok(D.evaluate(f"{Z}.mitglieder.find((m) => m.ich).nummer") == nrD, f'gleicher Platz nach Neu-Laden (Nr. {nrD})')
    # 4) Hintergrund > 4 s
    D.evaluate("__game.online.spiel.sichtbar(false)"); time.sleep(5); D.evaluate("__game.online.spiel.sichtbar(true)")
    ok(warte(D, f"{HIN}.includes('Verbinde neu …')", 3), 'nach 5 s Hintergrund: „Verbinde neu …“')
    ok(warte(D, f"{Z}.status === 'lobby' && {Z}.mitglieder.length === 2", 20) and warte(B, f"{Z}.mitglieder.length === 2", 5), 'nach dem Neu-Verbinden wieder beide in der Lobby')
    D.evaluate("__game.online.aktion('onbereit')")
    ok(warte(B, f"{Z}.start.ok", 15), 'Start wieder frei')
    err = [e for e in s.errors + eB + eC + eD if 'GL Driver' not in e]
    ok(not err, f'keine JS-Fehler {err[:4]}')
    s.close()
print('Online-Abbrüche: ' + (f'{bad} FEHLER' if bad else 'alle Prüfungen grün'))
sys.exit(1 if bad else 0)
