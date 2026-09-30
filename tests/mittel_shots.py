# Mittel ohne Linien-Magnet (n16): Headless-Fahrt auf der Demo mit Mittel, Fotos hoch + quer nach tests/shots/mittel/:
# eine Kurve mit farbiger Ideallinie und die Ansage „Looping voraus – Spurhilfe“. Der „Spieler“ lenkt und tritt die
# Pedale wie der Autopilot (die Hilfe selbst lenkt nicht mit). Prüft: Mittel aktiv (Haftung ×1,15, kein Zug), Linie
# sichtbar, HUD-Ansage vor dem Looping, 0 Seitenfehler.
# Aufruf: python3 tests/mittel_shots.py
import sys, time
sys.path.insert(0, 'tests')
from util import *
from hochformat_util import DEVICES, set_safe

fails = []
def check(ok, msg):
    print(('OK   ' if ok else 'FAIL ') + msg, flush=True)
    if not ok: fails.append(msg)

# Spieler = Autopilot-Eingabe, Schritt für Schritt; bis zur Stelle idx (Kurve bzw. vor dem Looping)
DRIVE = """([until, maxT, want]) => { const G = __game, r = G.race, DT = 1 / 120; let t = 0;
  while (t < maxT && r.state !== 'finished') { const a = r.ap.control(r.car); G.sim(DT, { steer: a.steer, throttle: a.throttle, brake: a.brake }); t += DT;
    if (r.state === 'running' && r.ap.tr.idx >= until[0] && r.ap.tr.idx <= until[1] && (!want || (r.hud && r.hud.text.includes(want)))) break; }
  return { idx: r.ap.tr.idx, t, hud: r.hud && r.hud.text, v: r.car.fwdSpeed(), grip: r.car.assist.grip, pull: r.assist.steerPull, crashes: r.crashes }; }"""
# Kurve: erste Stelle nach 60 m mit mindestens 60 % der stärksten Krümmung, 25 m davor; Looping: 1,2 s vor dem ersten Looping
FIND = """() => { const G = __game, L = G.env.ideal, P = G.env.prof, r = G.race;
  let mx = 0; for (let k = 1; k < L.n; k++) if (!L.loop[k] && !L.tube[k] && !L.air[k]) mx = Math.max(mx, Math.abs(P.kA[k]));
  let c = null; for (let k = 1; k < L.n; k++) if (L.s[k] > 60 && Math.abs(P.kA[k]) > 0.6 * mx && !L.loop[k]) { c = k; break; }
  let t = c; while (t > 0 && L.s[c] - L.s[t] < 25) t--;
  const z = r.zones.find((q) => q.kinds.includes('loop'));
  let l = z.i0; while (l > 0 && L.s[z.i0] - L.s[l] < 30) l--;
  return { curve: [t, c], loop: [l, z.i0 - 1] }; }"""

for dev in ['pixel7q', 'pixel7']:
    D_ = DEVICES[dev]
    with Server() as srv, sync_playwright() as pw:
        s = Session(pw, srv.base, device=D_['ctx'], dpr=D_.get('shot_dpr'))
        s.open('?nosw&demo')
        set_safe(s, D_.get('safe'))
        s.ev("__game.setAssist('medium')"); s.ev("__game.setLine('strong')")
        s.ev("__game.start()"); s.frames(4)
        spot = s.ev(FIND)
        print(dev, 'Stellen', spot, flush=True)
        # zuerst der Looping (liegt auf der Demo vor der Kurve), dann die Kurve
        st = s.ev(DRIVE, [spot['loop'], 60, 'Spurhilfe'])
        s.ev("__game.freeze(true)"); s.frames(20); time.sleep(0.4)
        hint = s.ev("document.querySelector('#hud .hint2').textContent")
        check('Spurhilfe' in (hint or ''), f"{dev}: HUD vor dem Looping „{hint}“ (idx {st['idx']})")
        print('  Foto', s.shot(f'{dev}_mittel_looping', 'mittel'), flush=True)
        s.ev("__game.freeze(false)")
        st = s.ev(DRIVE, [spot['curve'], 60, ''])
        check(spot['curve'][0] <= st['idx'] <= spot['curve'][1] and st['grip'] == 1.15 and st['pull'] == 0, f"{dev}: Mittel in der Kurve (idx {st['idx']}, {st['v']*3.6:.0f} km/h, Haftung ×{st['grip']}, Zug {st['pull']})")
        s.ev("__game.freeze(true)"); s.frames(20); time.sleep(0.4)
        check(s.ev("__game.scene.getObjectByName('ideal-line').visible"), f'{dev}: farbige Linie sichtbar')
        print('  Foto', s.shot(f'{dev}_mittel_kurve', 'mittel'), flush=True)
        check(not s.errors, f'{dev}: 0 Seitenfehler {s.errors[:3]}')
        s.close()
print('FEHLER: ' + '; '.join(fails) if fails else 'Mittel-Fotos ok')
sys.exit(1 if fails else 0)
