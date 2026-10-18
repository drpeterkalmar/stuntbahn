# n34 KI-Gegner im Browser (Regressionstest): je Fahrhilfe Leicht/Mittel/Original ein Rennen mit 3 Gegnern 25 s vorspulen –
# Gegner da und in Bewegung, keine NaN, HUD „Platz n/4“, Minikarte mit 3 Gegner-Punkten, Gegner mit der Physik der Stufe
# (n37 Arcade: Wand schrammt), Gummiband Standard an, ?aufholhilfe=0 aus, Menü-Schalter merkt sich die Wahl, „Gegner Aus“ =
# kein Feld, kein HUD, keine Punkte. 0 JS-Fehler. Aufruf: python3 tests/test_gegner_ui.py
import sys, time, json
sys.path.insert(0, 'tests')
from util import *

bad = 0
def ok(c, m):
    global bad
    print(('OK   ' if c else 'FAIL ') + m, flush=True)
    if not c: bad += 1

LAGE = """(() => { const G = __game, F = G.gegner; if (!F) return null; const p = G.race.tracker.progress();
  return { n: F.fahrer.length, d: F.fahrer.map((g) => Math.round(g.fortschritt() - p)), v: F.fahrer.map((g) => +g.tempo().toFixed(1)),
    nan: F.fahrer.some((g) => !Number.isFinite(g.car.pos.x + g.car.pos.y + g.car.pos.z)), hud: document.querySelector('#hud .gpos').textContent,
    hudAn: document.querySelector('#hud .gpos').classList.contains('show'), karte: G.minikarte.marken.length, auf: F.opt.aufholhilfe,
    wand: F.fahrer.map((g) => g.car.assist.wall || 0), arcade: F.fahrer.map((g) => g.car.assist.arcade || 0), gelaufen: F.uhr }; })()"""

with Server() as srv, sync_playwright() as pw:
    s = Session(pw, srv.base)
    s.open('?nosw&seed=4711&d=2&gegner=3')
    for assist in ['easy', 'medium', 'original']:
        s.ev(f"__game.setAssist('{assist}')")
        s.ev("__game.start({seed: 5})"); s.frames(3)
        s.ev("__game.race.autopilotOnly = true")   # Spieler fährt per Autopilot (sonst stünde er auf Mittel/Original)
        s.ev("__game.sim(25)"); s.frames(8); time.sleep(0.3)
        L = s.ev(LAGE)
        ok(L and L['n'] == 3 and not L['nan'] and max(L['v']) > 5 and L['gelaufen'] > 20, f'{assist}: 3 Gegner fahren (Abstände {L and L["d"]} m, Tempo {L and L["v"]} m/s), keine NaN')
        ok(L and L['hudAn'] and L['hud'].startswith('Platz ') and '/4' in L['hud'], f'{assist}: HUD „{L and L["hud"]}“')
        ok(L and L['karte'] == 3, f'{assist}: Minikarte mit {L and L["karte"]} Gegner-Punkten')
        ok(L and L['auf'], f'{assist}: Gummiband („Gegner bleiben in der Nähe“) Standard an')
        ok(L and all(a == 1 for a in L['arcade']) and all(w > 0 for w in L['wand']), f'{assist}: Gegner mit der Arcade-Physik der Stufe (Wand {L and L["wand"]})')
        s.ev("__game.toMenu()"); time.sleep(0.3)
    # Menü-Schalter: Gummiband aus → gespeichert → Feld ohne Band
    s.pg.goto(srv.base + 'index.html?nosw&seed=4711&d=2'); s.pg.wait_for_function("window.__app && window.__app.ready && window.__app.frames > 3", timeout=120000)
    s.ev("__game.store.settings.gegner = 1; __game.store.save()")
    s.tap('[data-a=gegnerwahl]'); time.sleep(0.3)
    knopf = s.ev("document.querySelector('[data-a=gaufhol]').textContent")
    ok('Gegner bleiben in der Nähe' in knopf and '✅' in knopf, f'Menü: Schalter „{knopf.strip()}“ (an)')
    s.tap('[data-a=gaufhol]'); time.sleep(0.3)
    ok(s.ev("__game.store.settings.aufholhilfe") is False and '⬜' in s.ev("document.querySelector('[data-a=gaufhol]').textContent"), 'Menü: Schalter aus, gespeichert (settings.aufholhilfe = false)')
    s.ev("__game.ui.showMenu(__game.env)")
    s.ev("__game.start({seed: 5})"); s.frames(3)
    ok(s.ev("__game.gegner && __game.gegner.fahrer.length === 1 && __game.gegner.opt.aufholhilfe === false"), 'gespeichert: 1 Gegner, Gummiband aus')
    s.ev("__game.toMenu()"); s.ev("__game.store.settings.aufholhilfe = true; __game.store.settings.gegner = 0; __game.store.save()")
    # ?aufholhilfe=0
    s.pg.goto(srv.base + 'index.html?nosw&seed=4711&d=2&gegner=1&aufholhilfe=0'); s.pg.wait_for_function("window.__app && window.__app.ready && window.__app.frames > 3", timeout=120000)
    s.ev("__game.start({seed: 5})"); s.frames(3)
    ok(s.ev("__game.gegner && __game.gegner.opt.aufholhilfe === false"), '?aufholhilfe=0: Gummiband aus')
    # Gegner Aus
    s.pg.goto(srv.base + 'index.html?nosw&seed=4711&d=2&gegner=0'); s.pg.wait_for_function("window.__app && window.__app.ready && window.__app.frames > 3", timeout=120000)
    s.ev("__game.start({seed: 5})"); s.frames(3); s.ev("__game.race.autopilotOnly = true"); s.ev("__game.sim(5)"); s.frames(5)
    ok(s.ev("__game.gegner === null && !document.querySelector('#hud .gpos').classList.contains('show') && __game.minikarte.marken.length === 0 && !__game.gegnerVis.aktiv"), 'Gegner Aus: kein Feld, kein Platz im HUD, keine Punkte, keine Gegner-Autos')
    err = [e for e in s.errors if 'GL Driver' not in e]
    ok(not err, f'keine JS-Fehler {err[:3]}')
    s.close()
print('Gegner-UI: ' + (f'{bad} FEHLER' if bad else 'alle Prüfungen grün'))
sys.exit(1 if bad else 0)
