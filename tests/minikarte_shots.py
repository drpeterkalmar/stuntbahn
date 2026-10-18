# n39 Minikarte: Fotos im Rennen (hoch/quer) auf mehreren Strecken + Nacht, Prüfung Lage/Sichtbarkeit, 0 Fehler.
#   python3 tests/minikarte_shots.py [hoch,quer] [Strecken] [Zusatz]
#   Strecken (Komma): looping = Galerie (Looping, Korkenzieher, Spirale, Röhre), roehre = 3194-3-h (Röhre mit Wand),
#   spirale = 2-2-gh (Gelände, Spiralen-Hochstraße), flach = 4711-2, acht = 4711-3-3d (Hochstraße, Brücke), nacht = 4711-3-g Nacht
#   Bilder: tests/shots/n39/<strecke>_<geraet>[_<art>].png, Ausschnitte der Karte *_karte.png
import sys, os, json, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from util import Server, Session, PIXEL7_LAND
from playwright.sync_api import sync_playwright

HOCH = dict(PIXEL7_LAND, viewport={"width": 412, "height": 915})
GERAETE = {'quer': PIXEL7_LAND, 'hoch': HOCH}
STRECKEN = {
    'looping': ('?nosw&gallery', 0.52),
    'roehre': ('?nosw&seed=3194&d=3&h=1', 0.2),
    'spirale': ('?nosw&seed=2&d=2&g=1&h=1', 0.3),
    'flach': ('?nosw&seed=4711&d=2', 0.15),
    'acht': ('?nosw&seed=4711&d=3&3d=1', 0.35),
    'nacht': ('?nosw&seed=4711&d=3&g=1&zeit=nacht&wetter=regen', 0.25),
    'schnee': ('?nosw&seed=4711&d=3&g=1&wetter=schnee', 0.25),
}
geraete = (sys.argv[1] if len(sys.argv) > 1 else 'hoch,quer').split(',')
strecken = (sys.argv[2] if len(sys.argv) > 2 and sys.argv[2] else 'looping,roehre,flach,nacht').split(',')
zusatz = sys.argv[3] if len(sys.argv) > 3 else ''
OUT = 'n39'
ASSIST = os.environ.get('ASSIST', 'easy')
fehler = []
erg = {}
with Server() as srv, sync_playwright() as pw:
    for g in geraete:
        for st in strecken:
            q, anteil = STRECKEN[st]
            s = Session(pw, srv.base, device=GERAETE[g])
            try:
                s.open(q + '&q=1&startprobe=0' + zusatz)
                # ASSIST=medium: Mittel mit Touch-Tasten (Lage-Prüfung gegen die Tasten), sonst Leicht mit Autopilot
                if ASSIST == 'medium': s.ev("__game.setAssist('medium')"); s.ev("__game.start({})")
                else: s.ev("__game.setAssist('easy'); __game.store.settings.fahrstil = 'sauber'"); s.ev("__game.start({ autopilot: true })")
                s.ev("__game.cam('chase')")
                # an eine Stelle mit Stunt in Sichtweite: Anteil der Strecke vorspulen
                s.ev(f"(() => {{ const g = __game, L = g.env.track.line; const i = Math.floor(L.n * {anteil}); g.sim(3.5); g.teleport(i, g.env.prof.vt[i] * 0.9); g.race.stuckProg = -1e9; g.sim(1.5); }})()")
                time.sleep(1.2)
                info = s.ev("""(() => { const k = __game.minikarte, u = __game.ui.karte, e = document.getElementById('karte'), b = e.getBoundingClientRect();
                  const boxes = {}; for (const [n, sel] of [['tl', '#hud .tl'], ['tr', '#hud .tr'], ['speed', '#hud .speed'], ['hop', '#hud .xb.hop'], ['nitro', '#hud .xb.nitro'], ['padL', '#touch .pad.left'], ['padR', '#touch .pad.right']]) { const x = document.querySelector(sel); if (!x) continue; const r = x.getBoundingClientRect(); if (r.width && getComputedStyle(x).display !== 'none') boxes[n] = [r.left, r.top, r.right, r.bottom].map(Math.round); }
                  return { sichtbar: k.sichtbar, art: k.art, rect: u, dom: [b.left, b.top, b.width, b.height].map(Math.round), on: e.classList.contains('on'), stats: k.stats, boxes, W: innerWidth, H: innerHeight }; })()""")
                # Überlappung mit Tasten/Tacho
                R = info['rect']; kb = [R['x'], R['y'], R['x'] + R['w'], R['y'] + R['h']]
                ueber = [n for n, b in info['boxes'].items() if n not in ('tl', 'tr') and not (b[2] <= kb[0] or b[0] >= kb[2] or b[3] <= kb[1] or b[1] >= kb[3])]
                info['ueberlappt'] = ueber
                p = s.shot(f'{st}_{g}' + ('_mittel' if ASSIST == 'medium' else ''), OUT)
                s.pg.screenshot(path=p.replace('.png', '_karte.png'), clip={'x': max(0, R['x'] - 6), 'y': max(0, R['y'] - 6), 'width': R['w'] + 12, 'height': R['h'] + 12})
                # groß
                s.ev("__game.ui.karteGross()"); time.sleep(0.6)
                R2 = s.ev("__game.ui.karte")
                p2 = s.shot(f'{st}_{g}_gross' + ('_mittel' if ASSIST == 'medium' else ''), OUT)
                s.ev("__game.ui.karteGross()")
                erg[f'{st}_{g}'] = info
                print(st, g, json.dumps({k: info[k] for k in ('sichtbar', 'art', 'rect', 'on', 'ueberlappt')}), 'stats', json.dumps(info['stats']), 'gross', R2, flush=True)
                if not info['sichtbar'] or not info['on']: fehler.append(f'{st}/{g}: Karte nicht sichtbar')
                if ueber: fehler.append(f'{st}/{g}: Karte überlappt {ueber}')
                if s.errors: fehler.append(f'{st}/{g}: ' + '; '.join(s.errors[:3]))
            finally:
                s.close()
os.makedirs(os.path.join('tests', 'shots', OUT), exist_ok=True)
json.dump(erg, open(os.path.join('tests', 'shots', OUT, f'minikarte_shots_{"_".join(strecken)}_{ASSIST}.json'), 'w'), indent=1)
print('FEHLER' if fehler else 'OK', fehler)
sys.exit(1 if fehler else 0)
