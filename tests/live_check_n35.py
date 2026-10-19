# n35: Live-Seite (GitHub Pages) – Build-Kennung, Menü „👥 Online“, Start-Ansicht, Trystero lädt (vendor/), Raum erstellen
# über die echten Relays (Code + QR), 0 JS-Fehler. Aufruf: python3 tests/live_check_n35.py [build]
import sys, time, json
sys.path.insert(0, 'tests')
from util import *
URL = 'https://drpeterkalmar.github.io/stuntbahn/'
with sync_playwright() as pw:
    s = Session(pw, URL)
    s.open('?nosw&seed=4711&d=2')
    r = {'build': s.ev("__app.build"), 'online_knopf': s.ev("!!document.querySelector('#menu [data-a=online]')")}
    s.tap('[data-a=online]'); time.sleep(0.5)
    r['start_ansicht'] = s.ev("!!document.getElementById('onname')")
    s.ev("document.getElementById('onname').value = 'Live-Test'"); s.tap('[data-a=onerstellen]')
    t0 = time.time()
    while time.time() - t0 < 20 and not s.ev("(() => { const z = __game.online.spiel && __game.online.spiel.zustand(); return !!(z && z.code); })()"): time.sleep(0.5)
    z = s.ev("(() => { const z = __game.online.spiel.zustand(); return { code: z.vorlesbar, link: z.link, qr: !!document.querySelector('.onqr svg') }; })()")
    r.update(z)
    r['trystero'] = s.ev("performance.getEntriesByType('resource').some((e) => e.name.includes('vendor/trystero/nostr.js'))")
    s.ev("__game.online.aktion('onverlassen')")
    r['fehler'] = [e for e in s.errors if 'GL Driver' not in e and 'WebSocket connection' not in e][:5]
    s.close()
print(json.dumps(r, ensure_ascii=False))
sys.exit(0 if (len(sys.argv) < 2 or r['build'] == sys.argv[1]) and r['online_knopf'] and r.get('code') and r['qr'] and r['trystero'] and not r['fehler'] else 1)
