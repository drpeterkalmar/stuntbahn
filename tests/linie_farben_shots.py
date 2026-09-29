# Farbige Ideallinie wie bei Forza (n14): Fotos hoch + quer, Leicht und Mittel, je Dezent und Kräftig, ~45 m vor einer
# Bremszone (grün = Gas → gelb = Gas weg → orange/rot = bremsen) nach tests/shots/linie_farben/.
# Prüft: vor dem Auto liegen Gas- und Brems-Abschnitt des Pedal-Plans, Band sichtbar, 0 Seitenfehler.
# Aufruf: python3 tests/linie_farben_shots.py [seed d]   (Standard 4711 3)
import sys, time
sys.path.insert(0, 'tests')
from util import *
from hochformat_util import DEVICES, set_safe

SEED, D = (sys.argv[1], sys.argv[2]) if len(sys.argv) > 2 else ('4711', '3')
fails = []
def check(ok, msg):
    print(('OK   ' if ok else 'FAIL ') + msg, flush=True)
    if not ok: fails.append(msg)

# Stelle suchen: erste Bremszone nach 150 m, davor mindestens 40 m Gas; Ziel 45 m vor dem Bremspunkt
FIND = """async () => {
  const env = window.__game.env, L = env.ideal;
  const { pedalPlan } = await import('./src/ai/profile.js');
  const { cls } = pedalPlan(L, env.prof), s = L.s;
  for (let k = 1; k < L.n; k++) {
    if (cls[k] !== 2 || cls[k - 1] === 2 || s[k] < 150) continue;
    let j = k - 1, green = 0;
    while (j > 0 && s[k] - s[j] < 80 && cls[j] !== 2 && cls[j] !== 3) { if (cls[j] === 0) green += s[j + 1] - s[j]; j--; }
    if (green < 40) continue;
    let t = k; while (t > 0 && s[k] - s[t] < 45) t--;
    let e = k; while (e < L.n - 1 && s[e] - s[k] < 80) e++;
    const seen = new Set(); for (let q = t; q <= e; q++) seen.add(cls[q]);
    return { k, t, sk: s[k], classes: [...seen].sort() };
  }
  return null;
}"""

for dev in ['pixel7q', 'pixel7']:
    D_ = DEVICES[dev]
    with Server() as srv, sync_playwright() as pw:
        s = Session(pw, srv.base, device=D_['ctx'], dpr=D_.get('shot_dpr'))
        s.open(f'?nosw&seed={SEED}&d={D}')
        set_safe(s, D_.get('safe'))
        spot = s.ev(FIND)
        check(spot is not None and 0 in spot['classes'] and 2 in spot['classes'], f'{dev}: Stelle vor Bremszone {spot}')
        for assist in ['easy', 'medium']:
            s.ev(f"__game.setAssist('{assist}')")
            s.ev("__game.start({ autopilot: true })")
            s.frames(4)
            s.ev("__game.sim(1.2)")
            # heranfahren (Autopilot), bis die Vorderachse am Ziel ist
            for _ in range(1200):
                i = s.ev("__game.race.ap.tr.idx")
                if spot['t'] <= i < spot['k']: break
                s.ev("__game.sim(0.05)")
            i = s.ev("__game.race.ap.tr.idx")
            check(spot['t'] <= i < spot['k'], f'{dev} {assist}: Auto vor dem Bremspunkt (idx {i}, Ziel {spot["t"]}…{spot["k"]})')
            s.ev("__game.freeze(true)")
            s.frames(20); time.sleep(0.4)
            for lv in ['soft', 'strong']:
                s.ev(f"__game.setLine('{lv}')")
                s.frames(6); time.sleep(0.2)
                vis = s.ev("__game.scene.getObjectByName('ideal-line').visible")
                check(vis, f'{dev} {assist} {lv}: Band sichtbar')
                print('  Foto', s.shot(f'{dev}_{assist}_{lv}', 'linie_farben'), flush=True)
            s.ev("__game.freeze(false)")
            s.ev("__game.toMenu()")
            s.frames(4)
        # Mittel mit Vollgas (lenkt wie der Autopilot): Brems-Hinweis „▼ Bremsen!“ vor der ersten Bremszone
        s.ev("__game.setAssist('medium')")
        s.ev("__game.setLine('soft')")
        s.ev("__game.start()")
        s.frames(4)
        got = s.ev("""() => { const G = __game, r = G.race; G.freeze(true);
          for (let k = 0; k < 120 * 60; k++) { const o = r.ap.control(r.car);
            r.step(1 / 120, { steer: o.steer, throttle: 1, brake: 0 });
            if (r.state === 'running' && r.hud && r.hud.kind === 'brake') return { t: +r.time.toFixed(2), kmh: Math.round(r.car.fwdSpeed() * 3.6), text: r.hud.text }; }
          return null; }""")
        s.frames(8); time.sleep(0.3)
        el = s.ev("(() => { const e = document.querySelector('#hud .hint2'); if (!e) return null; const r = e.getBoundingClientRect(); return { text: e.textContent, cls: e.className, x: r.left, y: r.top, w: r.width, h: r.height, W: innerWidth, H: innerHeight }; })()")
        ok = bool(got and el and 'Bremsen' in el['text'] and 'brake' in el['cls'] and el['w'] > 0 and el['x'] >= 0 and el['x'] + el['w'] <= el['W'] and el['y'] >= 0 and el['y'] + el['h'] <= el['H'])
        check(ok, f'{dev} Mittel: Brems-Hinweis sichtbar im Bild ({got}, {el})')
        print('  Foto', s.shot(f'{dev}_medium_bremshinweis', 'linie_farben'), flush=True)
        s.ev("__game.freeze(false)")
        s.ev("__game.toMenu()")
        s.frames(4)
        check(not s.errors, f'{dev}: 0 Fehler {s.errors[:5]}')
        s.close()

print('FEHLSCHLÄGE', len(fails))
sys.exit(1 if fails else 0)
