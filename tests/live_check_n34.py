# n34: Live-Seite (GitHub Pages) – Build-Kennung und ein Rennen mit 3 Gegnern ohne JS-Fehler. Aufruf: python3 tests/live_check_n34.py [build]
import sys, time, json
sys.path.insert(0, 'tests')
from util import *
URL = 'https://drpeterkalmar.github.io/stuntbahn/'
with sync_playwright() as pw:
    s = Session(pw, URL)
    s.open('?nosw&seed=4711&d=2&gegner=3')
    s.ev("__game.start({seed: 5})"); s.frames(3); s.ev("__game.race.autopilotOnly = true"); s.ev("__game.sim(15)"); s.frames(6)
    r = s.ev("({ build: __app.build, gegner: __game.gegner && __game.gegner.fahrer.length, hud: document.querySelector('#hud .gpos').textContent, auf: __game.gegner && __game.gegner.opt.aufholhilfe })")
    r['fehler'] = [e for e in s.errors if 'GL Driver' not in e][:5]
    s.close()
print(json.dumps(r, ensure_ascii=False))
sys.exit(0 if (len(sys.argv) < 2 or r['build'] == sys.argv[1]) and r['gegner'] == 3 and not r['fehler'] else 1)
