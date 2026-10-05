# Cockpit n27 im Browser: Fotos gerade / Kurve / Tunnel (quer + hoch, Pixel 7) mit Draw-Calls (gesamt, Cockpit-Durchgang,
# Innenspiegel), Tunnel-Abdunklung (cover), Drehzahl-LEDs, Kopfnicken (Kamera-Versatz bei G) – plus Grafik „Einfach“
# (vereinfachtes Cockpit ohne Spiegelbild/Schatten). Aufruf: python3 tests/cockpit_n27_shots.py [quer|hoch|desktop] [Wurzel]
# → tests/shots/cockpit_n27/<gerät>_<szene>.png und <gerät>_werte.json
import sys, time, json, os
sys.path.insert(0, 'tests')
from util import *

DEV = sys.argv[1] if len(sys.argv) > 1 else 'quer'
WURZEL = sys.argv[2] if len(sys.argv) > 2 else ROOT
PIXEL7_PORT = dict(PIXEL7_LAND, viewport={"width": 412, "height": 915})
DEVICES = {'quer': PIXEL7_LAND, 'hoch': PIXEL7_PORT, 'desktop': DESKTOP}
OUT = os.path.join(ROOT, 'tests', 'shots', 'cockpit_n27')
os.makedirs(OUT, exist_ok=True)

# Linienpunkt mit Decke darüber (Tunnel/Brücke, keine Röhre) bzw. Kurve/Gerade suchen
FIND = """(kind) => { const G = __game, L = G.env.track.line, W = G.env.world;
  for (let i = 40; i < L.n - 40; i += 3) {
    if (L.loop[i] || L.tube[i] || L.air[i]) continue;
    const up = W.rayTrack(L.px[i], L.py[i] + 1.5, L.pz[i], 0, 1, 0, 30, false);
    if (kind === 'tunnel' && up) { let ok = true; for (let k = -12; k <= 12; k += 3) if (!W.rayTrack(L.px[i + k], L.py[i + k] + 1.5, L.pz[i + k], 0, 1, 0, 30, false)) ok = false; if (ok) return i; }
  }
  return -1; }"""

def settle(s, t=1.2):
    s.ev("__game.setTimeScale(0.0005)"); s.frames(3); time.sleep(t)

def measure(s):
    return s.ev("""() => { const G = __game, ro = G.cockpit.readout(), i = G.info();
      return { calls: i.calls, cockpitCalls: ro.calls, mirrorCalls: ro.mirrorCalls, cover: ro.cover, tris: i.tris, tier: i.tier, view: G.rig.view,
        head: G.rig.head ? [+(G.rig.head.pos.x * 100).toFixed(2), +(G.rig.head.pos.z * 100).toFixed(2)] : null, dash: ro.dash, mode: ro.mode }; }""")

res = {'dev': DEV}
with Server(WURZEL) as srv, sync_playwright() as pw:
    s = Session(pw, srv.base, device=DEVICES[DEV])
    for code, q in (('4711-3', '?nosw&seed=4711&d=3'), ('1234-3-g', '?nosw&seed=1234&d=3&g=1')):
        s.open(q)
        s.ev("__game.setAssist('medium')"); s.ev("__game.start({autopilot:true})"); s.ev("__game.cam('cockpit')"); s.frames(3)
        s.ev("__game.setTimeScale(1)")
        if code == '4711-3':
            s.ev("__game.sim(3.5)"); time.sleep(1.5); settle(s)
            res['gerade'] = measure(s); s.shot(f'{DEV}_gerade', 'cockpit_n27')
            # Kurve: vorspulen bis Lenkeinschlag
            s.ev("(() => { for (let k = 0; k < 900; k++) { __game.sim(0.02); if (Math.abs(__game.race.car.steerAng) > 0.12 && __game.race.car.speed() > 30) break; } })()")
            s.ev("__game.setTimeScale(1)"); time.sleep(0.6); settle(s)
            res['kurve'] = measure(s); s.shot(f'{DEV}_kurve', 'cockpit_n27')
            # Grafik Einfach: vereinfacht (kein Spiegelbild, keine Schatten-Neuberechnung)
            s.ev("__game.quality.forced = '0'; __game.quality.tier = 0"); s.ev("__game.setTimeScale(1)"); time.sleep(1.2); settle(s)
            res['einfach'] = measure(s); s.shot(f'{DEV}_einfach', 'cockpit_n27')
            s.ev("__game.quality.forced = null; __game.quality.tier = 2")
        else:
            i = s.ev(FIND, 'tunnel')
            res['tunnel_idx'] = i
            if i >= 0:
                s.ev(f"__game.teleport({i - 30}, 30)"); s.ev("__game.setTimeScale(1)"); time.sleep(0.4)
                s.ev("(() => { for (let k = 0; k < 400; k++) { __game.sim(0.02); const r = __game.race, L = __game.env.track.line, W = __game.env.world, c = r.car; if (W.rayTrack(c.pos.x, c.pos.y + 1.2, c.pos.z, 0, 1, 0, 35, false)) break; } })()")
                s.ev("__game.setTimeScale(0.3)"); time.sleep(1.5); settle(s, 0.8)
                res['tunnel'] = measure(s); s.shot(f'{DEV}_tunnel', 'cockpit_n27')
    res['fehler'] = s.errors[:8]
    s.close()
json.dump(res, open(os.path.join(OUT, f'{DEV}_werte.json'), 'w'), ensure_ascii=False, indent=1)
print(json.dumps(res, ensure_ascii=False, indent=1))
ok = not res['fehler'] and res.get('tunnel', {}).get('cover', 0) > 0.5 and res['gerade']['view'] == 'cockpit'
print('ERGEBNIS', 'grün' if ok else 'ROT')
sys.exit(0 if ok else 1)
