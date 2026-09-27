# Ideallinie mit Scheitelpunkten + „Leicht“ frei lenkbar – Fotos (Pixel 7 quer + Desktop) nach tests/shots/linie/:
#  kurve_*   : Blick von schräg oben auf eine Kurve – Linie außen → innen (Scheitel-Keil) → außen, je Dezent/Kräftig
#  fahrt_*   : Verfolgerkamera vor der Kurve (was der Spieler sieht)
#  stunt_*   : Leicht, HUD-Ansage „Looping voraus – Autopilot lenkt“
#  abseits_* : Leicht, frei ins Gelände gelenkt, HUD „Zurück zur Strecke ↺“
# Prüft außerdem: Keile nur bei sichtbarer Linie, 0 Seitenfehler.
import sys, time, json
sys.path.insert(0, 'tests')
from util import *

fails = []
def check(ok, msg):
    print(('OK   ' if ok else 'FAIL ') + msg, flush=True)
    if not ok: fails.append(msg)

VIS = "__game.scene.getObjectByName('ideal-line').visible"

def corner_view(s, k, tag):
    # Auto 30 m vor den Scheitel k, Kamera schräg über der Kurvenaußenseite
    info = s.ev(f"""(() => {{ const g = __game, I = g.env.ideal, B = g.env.track.line, a = I.apex[{k}], i = a.i;
      let j = i; while (j > 0 && B.s[i] - B.s[j] < 30) j--;
      g.teleport(j, 0); g.freeze(true); window.__app.freezeCam = true;
      const sg = a.side, c = g.camera;
      const px = B.px[i], py = B.py[i], pz = B.pz[i];
      c.position.set(px - sg * B.bx[i] * 26 - B.tx[i] * 14, py + 30, pz - sg * B.bz[i] * 26 - B.tz[i] * 14);
      c.up.set(0, 1, 0); c.lookAt(px + sg * B.bx[i] * 2, py, pz + sg * B.bz[i] * 2);
      return {{ i, side: sg, off: I.off[i], hw: B.hw[i], n: I.apex.length }}; }})()""")
    return info

def shots(dev, name):
    s = Session(pw, srv.base, device=dev)
    s.open('?nosw&seed=7&d=2')
    s.ev("__game.setAssist('easy')")
    s.ev("__game.start({ autopilot: true })"); s.frames(6)
    n = s.ev("__game.env.ideal.apex.length")
    check(n >= 3, f'{name}: {n} Scheitelpunkte auf Seed 7')
    # Kurve von oben: zwei verschiedene Scheitel, je Dezent + Kräftig
    for k in [0, 2]:
        info = corner_view(s, k, name)
        for lv in ['soft', 'strong']:
            s.ev(f"__game.setLine('{lv}')"); s.frames(5); time.sleep(0.2)
            check(s.ev(VIS) is True, f'{name}: Kurve {k} Stufe {lv} sichtbar (Versatz am Scheitel {info["off"]:.2f} m, Fahrbahn-Halbbreite {info["hw"]:.1f} m)')
            s.shot(f'kurve{k}_{lv}_{name}', 'linie')
    s.ev("__game.setLine('off')"); s.frames(4); time.sleep(0.15)
    check(s.ev(VIS) is False, f'{name}: Aus → weder Linie noch Keile')
    s.shot(f'kurve2_off_{name}', 'linie')
    # Verfolgerkamera: kurz vor der Kurve anhalten
    s.ev("__game.setLine('soft')")
    s.ev("""(() => { const g = __game, B = g.env.track.line, i = g.env.ideal.apex[0].i; let j = i; while (j > 0 && B.s[i] - B.s[j] < 55) j--;
      window.__app.freezeCam = false; g.freeze(false); g.cam('chase'); g.teleport(j, 16); })()""")
    s.ev("__game.sim(1.1)"); s.ev("__game.freeze(true)"); s.frames(12); time.sleep(0.3)
    s.shot(f'fahrt_dezent_{name}', 'linie')
    s.ev("__game.setLine('strong')"); s.frames(4); time.sleep(0.2)
    s.shot(f'fahrt_kraeftig_{name}', 'linie')
    s.ev("__game.freeze(false)")
    # Leicht: Stunt-Ansage vor dem Looping (Seed 20260927-2)
    s.ev("__game.newTrack(20260927, 2)")
    s.pg.wait_for_function("__game.mode === 'menu'", timeout=120000)
    s.ev("__game.setAssist('easy'); __game.setLine('soft')")
    s.ev("__game.start()"); s.frames(4)
    txt = s.ev("""(() => { const g = __game, B = g.env.track.line, lp = g.env.track.pieces.find((p) => p.type === 'loop'); let j = lp.lineStart; while (j > 0 && B.s[lp.lineStart] - B.s[j] < 70) j--;
      g.race.countdown = 0; g.race.state = 'running'; g.teleport(j, 18);
      for (let k = 0; k < 600 && !(g.race.hud && g.race.hud.kind === 'stunt'); k++) g.sim(1 / 120);
      g.sim(0.3); g.freeze(true); return g.race.hud && g.race.hud.text; })()""")
    s.frames(10); time.sleep(0.3)
    shown = s.ev("document.querySelector('#hud .hint2').classList.contains('show') ? document.querySelector('#hud .hint2').textContent : ''")
    check('Looping' in (shown or ''), f'{name}: HUD-Ansage „{shown}“ ({txt})')
    s.shot(f'stunt_{name}', 'linie')
    s.ev("__game.freeze(false)")
    # Leicht: frei ins Gelände → Hinweis „Zurück zur Strecke ↺“
    s.ev("""(() => { const g = __game; g.teleport(60, 15); g.sim(1.0); g.sim(3.2, { steer: -1, throttle: 0, brake: 0 }); g.sim(0.3, { steer: -1, throttle: 0, brake: 0 }); g.freeze(true); })()""")
    s.frames(10); time.sleep(0.3)
    st = s.ev("({ own: __game.race.own, dist: __game.race.tracker.dist, hud: __game.race.hud && __game.race.hud.text })")
    shown = s.ev("document.querySelector('#hud .hint2').classList.contains('show') ? document.querySelector('#hud .hint2').textContent : ''")
    check(st['own'] == 1 and st['dist'] > 12, f'{name}: frei gelenkt – Spieler-Anteil {st["own"]}, {st["dist"]:.0f} m von der Strecke, HUD „{shown}“')
    s.shot(f'abseits_{name}', 'linie')
    s.ev("__game.freeze(false)")
    check(not s.errors, f'{name}: 0 Seitenfehler {s.errors[:3]}')
    s.close()

with Server() as srv, sync_playwright() as pw:
    shots(PIXEL7_LAND, 'quer')
    shots(DESKTOP, 'desktop')

print(f'{len(fails)} Fehlschläge' if fails else 'Linie + Leicht: Fotos ok')
sys.exit(1 if fails else 0)
