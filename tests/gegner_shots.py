# n34 KI-Gegner + Schadensmodell im Browser (für den Heavy-Job; im Vorbau NICHT ausgeführt): Menü-Blatt „🏁 Gegner“,
# Startaufstellung, Zweikampf, Namensschilder, HUD „Platz“, Zieltabelle, Replay mit Gegnern, Schaden leicht/mittel/stark.
# Prüft dabei: 0 JS-Fehler, Gegner im Ziel bzw. hochgerechnet, Rangliste im HUD, Schaden-Zustand nach __game.treffer().
# Aufruf: python3 tests/gegner_shots.py [quer|hoch] [seed-d, z. B. 4711-2] [Zusatz-URL]  → tests/shots/n34/
import sys, time, json, os
sys.path.insert(0, 'tests')
from util import *

DEV = sys.argv[1] if len(sys.argv) > 1 else 'quer'
CODE = sys.argv[2] if len(sys.argv) > 2 else '4711-2'
EXTRA = sys.argv[3] if len(sys.argv) > 3 else ''
sd, dd = CODE.split('-')[:2]
Q = f'?nosw&seed={sd}&d={dd}&gegner=5&staerke=ebenbuertig&schaden=optik' + EXTRA
PIXEL7_PORT = dict(PIXEL7_LAND, viewport={"width": 412, "height": 915})
DEVICES = {'quer': PIXEL7_LAND, 'hoch': PIXEL7_PORT}
OUT = os.path.join(ROOT, 'tests', 'shots', 'n34')
os.makedirs(OUT, exist_ok=True)

# vorspulen, bis eine Bedingung gilt (c = Spieler-Auto, r = Race, G = __game, F = Gegner-Feld); -1 = Ziel, -2 = nicht gefunden
FIND = """([cond, maxT]) => { const G = window.__game; const f = new Function('c', 'r', 'G', 'F', 'return ' + cond);
  for (let t = 0; t < maxT; t += 1 / 60) { G.sim(1 / 60); const r = G.race; if (r.state === 'finished') return -1; if (f(r.car, r, G, G.gegner)) return t; }
  return -2; }"""
# nächster Gegner (Abstand m) zum Spieler
NAH = "(() => { const c = __game.race.car; return Math.min(...__game.gegner.fahrer.map((g) => Math.hypot(g.car.pos.x - c.pos.x, g.car.pos.z - c.pos.z))); })()"

def settle(s, wait=0.6):
    s.ev("__game.setTimeScale(0.0005)"); s.frames(3); time.sleep(wait)
def weiter(s):
    s.ev("__game.setTimeScale(1)")

res = {'dev': DEV, 'code': CODE}
with Server() as srv, sync_playwright() as pw:
    s = Session(pw, srv.base, device=DEVICES[DEV], kino=True)
    s.open(Q)
    shot = lambda n: s.shot(f'{DEV}_{n}', 'n34')
    # 1. Menü: Knopf „🏁 5 Gegner · Ebenbürtig“, Blatt
    res['menu_knopf'] = s.ev("(document.querySelector('[data-a=gegnerwahl]') || {}).textContent || ''")
    shot('menu')
    s.tap('[data-a=gegnerwahl]'); time.sleep(0.3); shot('menu_gegner_blatt')
    s.ev("__game.ui.showMenu(__game.env)")
    # 2. Startaufstellung (Countdown angehalten)
    s.ev("__game.setAssist('medium')")
    s.ev("__game.start({seed: 7})"); s.ev("__game.cam('chase')"); s.frames(4)
    settle(s, 0.8); shot('start_raster')
    s.ev("__game.cam('far')"); s.frames(3); time.sleep(0.4); shot('start_raster_heli'); s.ev("__game.cam('chase')")
    res['raster'] = s.ev("({ platz: __game.gegner.spielerPlatz + 1, n: __game.gegner.fahrer.length })")
    weiter(s)
    # 3. Zweikampf: Spieler fährt per Autopilot-Lenkung (Mittel, Hände am Steuer = Autopilot-Eingabe) bis ein Gegner < 6 m
    s.ev("__game.race.autopilotOnly = true")
    t = s.ev(FIND, [f"r.state === 'running' && {NAH} < 6 && c.speed() > 15", 90])
    res['zweikampf_t'] = t
    if t >= 0:
        settle(s); shot('zweikampf_verfolger')
        s.ev("__game.cam('bumper')"); s.frames(3); time.sleep(0.4); shot('zweikampf_stossstange'); s.ev("__game.cam('chase')")
        res['hud_platz'] = s.ev("document.querySelector('#hud .gpos').textContent")
        weiter(s)
    # 4. Schaden leicht / mittel / stark (Abnahme-Haken), je Bild angehalten
    for name, vn in [('leicht', 12), ('mittel', 25), ('stark', 45)]:
        res['schaden_' + name] = s.ev("(vn) => (__game.treffer([0.3, 0.1, -2.4], [0, 0, -1], vn), __game.treffer([-0.95, 0.3, -0.75], [-1, 0, 0], vn * 0.6))", vn)
        s.frames(12); settle(s, 0.6); shot('schaden_' + name)
        s.ev("__game.cam('far')"); s.frames(3); time.sleep(0.3); shot('schaden_' + name + '_heli'); s.ev("__game.cam('chase')")
        weiter(s)
    # 5. bis ins Ziel, Zieltabelle
    t = s.ev(FIND, ["false", 400])
    s.frames(10); time.sleep(13)   # Zielshow + Nachlauf (≤ 10 s) bzw. Highlights überspringen
    if s.ev("!!document.querySelector('#cine.show')"): s.ev("__game.ui.action('cineskip')"); time.sleep(1)
    res['ergebnis'] = s.ev("(document.querySelector('#result h2') || {}).textContent || ''")
    res['zieltabelle_zeilen'] = s.ev("document.querySelectorAll('#result .gtab tr').length")
    shot('ziel_tabelle')
    # 6. Replay mit Gegnern
    s.ev("__game.replay()"); time.sleep(1.5)
    s.ev("__game.setTimeScale(1)"); time.sleep(4); settle(s); shot('replay')
    res['fehler'] = [e for e in s.errors if 'GL Driver' not in e][:8]
    s.close()
print(json.dumps(res, ensure_ascii=False, indent=1))
