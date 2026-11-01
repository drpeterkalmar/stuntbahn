# n43 Gegner fahren besser / alle Autos driften mehr – Browser-Rauchtest und Fotos (Pixel 7 quer oder hoch, stumm, ein Browser):
# Rennen mit 5 Gegnern (Stärke wählbar) auf Mittel, Spieler per Autopilot; spult vor, bis möglichst viele Gegner nah vor dem
# Spieler sind und (Etappe 2) mehrere davon driften (Schwimmwinkel > 10°), dann Foto. Prüft 0 pageerrors, keine NaN, Gegner
# fahren. Aufruf: python3 tests/n43_shots.py [quer|hoch] [staerke] [seed-d] [Zusatz-URL]  → tests/shots/n43/
import sys, time, json, os
sys.path.insert(0, 'tests')
from util import *

DEV = sys.argv[1] if len(sys.argv) > 1 else 'quer'
ST = sys.argv[2] if len(sys.argv) > 2 else 'locker'
CODE = sys.argv[3] if len(sys.argv) > 3 else '4711-2'
EXTRA = sys.argv[4] if len(sys.argv) > 4 else ''
CAM = sys.argv[5] if len(sys.argv) > 5 else 'far'   # Kamera: far (erhöht, Drift gut sichtbar) | chase
sd, dd = CODE.split('-')[:2]
Q = f'?nosw&seed={sd}&d={dd}&gegner=5&staerke={ST}&startplatz=hinten' + EXTRA
PIXEL7_PORT = dict(PIXEL7_LAND, viewport={"width": 412, "height": 915})
DEVICES = {'quer': PIXEL7_LAND, 'hoch': PIXEL7_PORT}
OUT = os.path.join(ROOT, 'tests', 'shots', 'n43')
os.makedirs(OUT, exist_ok=True)

# Lage: je Gegner Abstand (m) zum Spieler, Schwimmwinkel (Grad), Drift-Regler an, Tempo
LAGE = """(() => { const G = __game, F = G.gegner, c = G.race.car; if (!F) return null;
  return F.fahrer.map((g) => { const k = g.car, Fr = k.frame, vf = k.v.x * Fr.f.x + k.v.y * Fr.f.y + k.v.z * Fr.f.z, vr = k.v.x * Fr.r.x + k.v.y * Fr.r.y + k.v.z * Fr.r.z;
    return { d: Math.hypot(k.pos.x - c.pos.x, k.pos.y - c.pos.y, k.pos.z - c.pos.z), b: Math.abs(Math.atan2(vr, Math.max(1, vf))) * 180 / Math.PI,
      drift: !!k.driftOn, v: g.tempo(), modus: g.modus, nan: !Number.isFinite(k.pos.x + k.pos.y + k.pos.z) }; }); })()"""
# vorspulen in kleinen Schritten, bester Moment: Anzahl Gegner ≤ 45 m VOR dem Spieler mit Drift (> 10°) zuerst, dann Gegner ≤ 45 m
SUCHE = """([maxT, minDrift]) => { const G = window.__game; let best = null;
  for (let t = 0; t < maxT; t += 1 / 30) { G.sim(1 / 30); if (G.fx && G.camera) G.fx.update(1 / 30, G.camera); const r = G.race; if (r.state === 'finished') break;
    const c = r.car, n = [0, 0];
    for (const g of G.gegner.fahrer) { const k = g.car, d = Math.hypot(k.pos.x - c.pos.x, k.pos.z - c.pos.z); const cf = c.frame.f, vor = (k.pos.x - c.pos.x) * cf.x + (k.pos.z - c.pos.z) * cf.z; if (d > 40 || vor < 8 || g.modus !== 'physik') continue;
      const Fr = k.frame, vf = k.v.x * Fr.f.x + k.v.y * Fr.f.y + k.v.z * Fr.f.z, vr = k.v.x * Fr.r.x + k.v.y * Fr.r.y + k.v.z * Fr.r.z;
      n[1]++; if (vf > 12 && Math.abs(Math.atan2(vr, vf)) > 18 * Math.PI / 180) n[0]++; }
    if (n[0] >= minDrift && t > 1) return { t, drift: n[0], nah: n[1] };
    if (!best || n[0] * 10 + n[1] > best.drift * 10 + best.nah) best = { t, drift: n[0], nah: n[1] }; }
  return { ...(best || {}), keiner: true }; }"""

def settle(s, wait=0.8):
    s.ev("__game.setTimeScale(0.0005)"); s.frames(4); time.sleep(wait)

bad = 0
def ok(c, m):
    global bad
    print(('OK   ' if c else 'FAIL ') + m, flush=True)
    if not c: bad += 1

with Server() as srv, sync_playwright() as pw:
    s = Session(pw, srv.base, device=DEVICES[DEV])
    s.open(Q)
    s.ev("__game.setAssist('medium')")
    s.ev(f"__game.store.settings.cam = '{CAM}'")
    s.ev("__game.start({seed: 5})"); s.frames(3)
    s.ev("__game.race.autopilotOnly = true")
    s.ev("__game.sim(4)"); s.frames(3)
    tag = f'{DEV}_{ST}_{CAM}' + ('_' + EXTRA.strip('&').replace('=', '').replace('&', '_') if EXTRA else '')
    fotos = []
    for k, (maxT, minD) in enumerate([(14, 1), (14, 1), (14, 1), (14, 1)]):
        r = s.ev(SUCHE, [maxT, minD])
        # kurz in Echtzeit weiter (Darstellung, Qualm und Spuren holen die Physik ein), dann anhalten
        s.ev("__game.setTimeScale(1)"); s.frames(12); time.sleep(0.2)
        settle(s)
        L = s.ev(LAGE)
        name = f'{tag}_{k + 1}'
        s.shot(name, 'n43'); fotos.append(name)
        print(f'  Foto {name}: t+{r.get("t", 0):.1f} s, Gegner ≤ 40 m voraus: {r.get("nah")}, davon driftend (> 18°): {r.get("drift")}; Winkel {[round(x["b"]) for x in L]}°, Abstand {[round(x["d"]) for x in L]} m', flush=True)
        s.ev("__game.setTimeScale(1)")
        if s.ev("__game.race.state") == 'finished': break
    L = s.ev(LAGE)
    ok(L and len(L) == 5 and not any(x['nan'] for x in L), f'{DEV}: 5 Gegner, keine NaN')
    err = [e for e in s.errors if 'GL Driver' not in e]
    pe = [e for e in err if e.startswith('PAGEERROR')]
    ok(not pe, f'{DEV}: 0 pageerrors {pe[:3]}')
    ok(not err, f'{DEV}: keine JS-Fehler {err[:3]}')
    s.close()
print(f'n43-Fotos {DEV}/{ST}: ' + (f'{bad} FEHLER' if bad else 'alle Prüfungen grün'))
sys.exit(1 if bad else 0)
