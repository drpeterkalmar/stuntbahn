# n45 Arcade-Drift – Browser-Fotos aus der normalen Spielkamera (Verfolger) mitten in einer Drift-Kurve (Pixel 7 quer oder hoch,
# stumm, ein Browser). Spieler fährt mit den Eingaben des Autopiloten (wie ein Mensch am Gerät, Fahrhilfe der Stufe aktiv), 5 Gegner.
#   ziel=spieler: spult vor, bis das eigene Auto sichtbar quer steht (Arcade-Drift > 20°), dann Foto
#   ziel=gegner:  bis ein Gegner ≤ 45 m vor dir sichtbar quer steht (> 18°), dann Foto
# Prüft 0 pageerrors, keine NaN. Aufruf: python3 tests/n45_shots.py [quer|hoch] [spieler|gegner] [medium|original] [Zusatz-URL] [Kamera]
#   → tests/shots/n45/   (Vorher-Bild 0.19.3: Zusatz-URL "&drift=n43")
import sys, time, os
sys.path.insert(0, 'tests')
from util import *

DEV = sys.argv[1] if len(sys.argv) > 1 else 'quer'
ZIEL = sys.argv[2] if len(sys.argv) > 2 else 'spieler'
ASSIST = sys.argv[3] if len(sys.argv) > 3 else 'medium'
EXTRA = sys.argv[4] if len(sys.argv) > 4 else ''
CAM = sys.argv[5] if len(sys.argv) > 5 else 'chase'
ST = 'locker' if ZIEL == 'gegner' else 'ebenbuertig'
Q = f'?nosw&seed=4711&d=2&gegner=5&staerke={ST}&startplatz={"hinten" if ZIEL == "gegner" else "vorne"}' + EXTRA
PIXEL7_PORT = dict(PIXEL7_LAND, viewport={"width": 412, "height": 915})
DEVICES = {'quer': PIXEL7_LAND, 'hoch': PIXEL7_PORT}
OUT = os.path.join(ROOT, 'tests', 'shots', 'n45')
os.makedirs(OUT, exist_ok=True)

# sichtbarer Schwimmwinkel (Grad) eines Autos: Arcade-Drift (gesamt) bzw. echter Winkel
WINKEL = """const W = (k) => { if (k.arcade) return Math.abs(k.arcade.gesamt) * 180 / Math.PI; const Fr = k.frame, vf = k.v.x * Fr.f.x + k.v.y * Fr.f.y + k.v.z * Fr.f.z, vr = k.v.x * Fr.r.x + k.v.y * Fr.r.y + k.v.z * Fr.r.z; return vf > 5 ? Math.abs(Math.atan2(vr, vf)) * 180 / Math.PI : 0; };"""
# vorspulen mit den Eingaben des Autopiloten (je Schritt), Partikel altern mit; Treffer: Spieler bzw. Gegner voraus quer
SUCHE = """([maxT, ziel, minB]) => { const G = window.__game; """ + WINKEL + """ let best = { b: 0, t: 0 };
  for (let t = 0; t < maxT; t += 1 / 120) { const r = G.race, o = r.ap.out; G.sim(1 / 120, { steer: o.steer, throttle: o.throttle, brake: o.brake });
    if (G.fx && G.camera && Math.round(t * 120) % 4 === 0) G.fx.update(1 / 30, G.camera); if (r.state === 'finished') break;
    const c = r.car; let b = 0, d = 0;
    if (ziel === 'spieler') b = r.state === 'running' && c.onGround >= 3 ? W(c) : 0;
    else for (const g of G.gegner.fahrer) { const k = g.car, dd = Math.hypot(k.pos.x - c.pos.x, k.pos.z - c.pos.z), cf = c.frame.f, vor = (k.pos.x - c.pos.x) * cf.x + (k.pos.z - c.pos.z) * cf.z;
      if (dd > 45 || vor < 7 || g.modus !== 'physik' || k.onGround < 3) continue; const x = W(k); if (x > b) { b = x; d = dd; } }
    if (b > best.b) best = { b, t, d };
    if (b >= minB && t > 2) return { t, b, d }; }
  return { ...best, keiner: true }; }"""
LAGE = """(() => { const G = __game, c = G.race.car; """ + WINKEL + """ return { spieler: W(c), arc: c.arcade ? c.arcade.beta * 57.3 : null, heck: !!c.assist.heck, v: c.speed() * 3.6,
  gegner: G.gegner.fahrer.map((g) => ({ b: W(g.car), d: Math.hypot(g.car.pos.x - c.pos.x, g.car.pos.z - c.pos.z), nan: !Number.isFinite(g.car.pos.x + g.car.pos.z) })) }; })()"""

bad = 0
def ok(c, m):
    global bad
    print(('OK   ' if c else 'FAIL ') + m, flush=True)
    if not c: bad += 1

with Server() as srv, sync_playwright() as pw:
    s = Session(pw, srv.base, device=DEVICES[DEV])
    s.open(Q)
    s.ev(f"__game.setAssist('{ASSIST}')")
    s.ev(f"__game.store.settings.cam = '{CAM}'")
    s.ev("__game.start({seed: 5})"); s.frames(3)
    s.ev("__game.sim(4.5)"); s.frames(3)
    tag = f'{DEV}_{ZIEL}_{ASSIST}' + ('_' + EXTRA.strip('&').replace('=', '').replace('&', '_') if EXTRA else '')
    minB = 20 if ZIEL == 'spieler' else 18
    for k in range(4):
        r = s.ev(SUCHE, [16, ZIEL, minB])
        # zwei Bilder in Echtzeit (Darstellung holt auf), dann anhalten
        s.ev("__game.setTimeScale(0.0005)"); s.frames(4); time.sleep(0.6)
        L = s.ev(LAGE)
        name = f'{tag}_{k + 1}'
        s.shot(name, 'n45')
        g = sorted(L['gegner'], key=lambda x: x['d'])
        print(f'  Foto {name}: +{r.get("t", 0):.1f} s, gesucht {r.get("b", 0):.0f}°{" (kein Treffer)" if r.get("keiner") else ""}; Spieler {L["spieler"]:.0f}° (Arcade {L["arc"] if L["arc"] is None else round(L["arc"])}°, Heck n43 {L["heck"]}, {L["v"]:.0f} km/h), Gegner nah {[(round(x["d"]), round(x["b"])) for x in g[:3]]}', flush=True)
        s.ev("__game.setTimeScale(1)")
        if s.ev("__game.race.state") == 'finished': break
    L = s.ev(LAGE)
    ok(not any(x['nan'] for x in L['gegner']), f'{DEV}: keine NaN')
    err = [e for e in s.errors if 'GL Driver' not in e]
    pe = [e for e in err if e.startswith('PAGEERROR')]
    ok(not pe, f'{DEV}: 0 pageerrors {pe[:3]}')
    ok(not err, f'{DEV}: keine JS-Fehler {err[:3]}')
    s.close()
print(f'n45-Fotos {DEV}/{ZIEL}/{ASSIST}: ' + (f'{bad} FEHLER' if bad else 'alle Prüfungen grün'))
sys.exit(1 if bad else 0)
