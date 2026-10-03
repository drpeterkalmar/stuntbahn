# n23 Mittel wieder fahrbar: Browser-Prüfung hoch + quer auf der Demo (Mittel, Ideallinie „Kräftig“), Fotos nach
# tests/shots/mittel2/:
#  1. 30 s Fahrt per Bot (lenkt wie der Autopilot, Vollgas außer bei „Bremsen!“) – Serienbilder bei Tempo: Tacho-Zahl,
#     Hinweis, Spieltempo 1,0 auf Mittel
#  2. dynamische Ideallinie: dieselbe Stelle vor einer Kurve langsam / Plan-Tempo / zu schnell (Collage)
#  3. ?dynlinie=0 (statische Farben) und ?m=n16 (Mittel wie bis n22: Spieltempo 1,25) – Gegenprobe
# Prüft: 0 Seitenfehler, Spieltempo, Linie sichtbar, Farbe vor dem Auto wechselt mit dem Tempo (grün → rot).
# Aufruf: python3 tests/mittel2_shots.py [geräte, z. B. pixel7q,pixel7]
import sys, time, os
sys.path.insert(0, 'tests')
from util import *
from hochformat_util import DEVICES, set_safe

fails = []
def check(ok, msg):
    print(('OK   ' if ok else 'FAIL ') + msg, flush=True)
    if not ok: fails.append(msg)

# Bot: lenkt wie der Autopilot, Vollgas, bremst voll solange „Bremsen!“ steht (Pedale wie ein Spieler, der nur auf den
# Hinweis hört); fährt bis zur Spielzeit T (s)
DRIVE = """([T]) => { const G = __game, r = G.race, DT = 1 / 120; let t = 0, vmax = 0, hints = 0, was = false;
  while (t < T && r.state !== 'finished') { const a = r.ap.control(r.car); const b = !!r.bhOn;
    G.sim(DT, { steer: a.steer, throttle: b ? 0 : 1, brake: b ? 1 : 0 }); t += DT; vmax = Math.max(vmax, r.car.fwdSpeed());
    if (r.bhOn && !was) hints++; was = !!r.bhOn; }
  return { t, idx: r.ap.tr.idx, v: r.car.fwdSpeed(), vmax, hints, crashes: r.crashes, hud: r.hud && r.hud.text, warnR: r.warnR }; }"""
# Stelle für die Collage: ausgeprägte Kurve (Bremsrechnung) nach 150 m, 2,2 s Plan-Fahrt davor
FIND = """() => { const G = __game, r = G.race, W = r.brakeWarn(), L = W.L, P = G.env.prof;
  let k = -1; for (const m of W.mins) if (L.s[m] > 250 && !L.loop[m] && !L.tube[m] && P.vt[m] < 40) { k = m; break; }
  if (k < 0) k = W.mins[1];
  let p = k; while (p > 0 && W.dist(p, k) < 95) p--;
  // „normal“: Tempo, bei dem 30 m voraus gerade „Gas weg“ gilt (Brems-Bedarf 0,35 – gelb)
  let lo = P.vt[k], hi = P.vt[p] * 1.2; for (let q = 0; q < 30; q++) { const m = (lo + hi) / 2; if (W.ratio(p, m, 30) < 0.35) lo = m; else hi = m; }
  return { k, p, vk: P.vt[k], vp: P.vt[p], vn: lo, d: W.dist(p, k) }; }"""
PLACE = """([p, v]) => { const G = __game, r = G.race; r.place(p, v, true); r.state = 'running'; r.bhOn = false;
  G.sim(1 / 120, { steer: r.ap.control(r.car).steer, throttle: 0.4, brake: 0 });
  return { v: r.car.fwdSpeed(), idx: r.ap.tr.idx }; }"""
# Farben des Linienstücks 20 … 60 m vor dem Auto (aus dem Attribut): Rot-Anteil r−g gemittelt
COL = """() => { const G = __game, r = G.race, m = G.scene.getObjectByName('ideal-line'), a = m.geometry.getAttribute('lcol').array, W = r.brakeWarn();
  const i0 = r.ap.tr.idx; let s = 0, n = 0; for (let i = i0, c = 0; c < 400; c++, i++) { const d = W.dist(i0, i); if (d > 60) break; if (d < 15) continue; s += a[i * 6] - a[i * 6 + 1]; n++; }
  return { red: n ? s / n : 0, vis: m.visible }; }"""

devs = (sys.argv[1] if len(sys.argv) > 1 else 'pixel7q,pixel7').split(',')
coll = {}
for dev in devs:
    D_ = DEVICES[dev]
    with Server() as srv, sync_playwright() as pw:
        s = Session(pw, srv.base, device=D_['ctx'], dpr=D_.get('shot_dpr'))
        s.open('?nosw&demo')
        set_safe(s, D_.get('safe'))
        s.ev("__game.setAssist('medium')"); s.ev("__game.setLine('strong')")
        s.ev("__game.start()"); s.frames(4)
        ts = s.ev("__game.timeScale")
        check(abs(ts - 1.0) < 1e-9, f'{dev}: Spieltempo Mittel {ts} (Echtzeit, Tacho = sichtbares Tempo)')
        # 1. Fahrt mit Serienbildern
        tt = 0
        for k in range(6):
            st = s.ev(DRIVE, [5])
            tt += st['t']
            s.ev("__game.freeze(true)"); s.frames(12); time.sleep(0.25)
            kmh = s.ev("document.querySelector('#hud .speed b').textContent")
            check(abs(int(kmh) - st['v'] * 3.6) < 4, f"{dev}: t={tt:.0f} s Tacho {kmh} km/h = Physik {st['v']*3.6:.0f} km/h, Hinweis „{st['hud'] or ''}“, r={st['warnR'] or 0:.2f}, Crashs {st['crashes']}")
            print('  Foto', s.shot(f'{dev}_fahrt_{k}', 'mittel2'), flush=True)
            s.ev("__game.freeze(false)")
            if st['t'] < 4.9: break   # im Ziel
        # 2. Collage: gleiche Stelle langsam / Plan / zu schnell
        s.ev("__game.start()"); s.frames(4)
        spot = s.ev(FIND)
        print(dev, 'Stelle', spot, flush=True)
        reds = []
        for name, v in [('langsam', spot['vk'] * 0.9), ('normal', spot['vn']), ('zu_schnell', spot['vp'] * 1.15)]:
            s.ev(PLACE, [spot['p'], v]); s.frames(2)
            s.ev("__game.freeze(true)"); s.frames(40); time.sleep(0.5)
            c = s.ev(COL)
            reds.append(c['red'])
            f = s.shot(f'{dev}_linie_{name}', 'mittel2')
            coll.setdefault(dev, []).append((f, f'{name}: {v*3.6:.0f} km/h'))
            print(f'  {name}: {v*3.6:.0f} km/h, Rot-Anteil vor dem Auto {c["red"]:.2f}, Foto {f}', flush=True)
            s.ev("__game.freeze(false)")
        check(reds[0] < -0.5 and reds[2] > reds[1] + 0.15 and reds[2] > 0.6, f'{dev}: Linie vor dem Auto langsam grün ({reds[0]:.2f}), normal gelb ({reds[1]:.2f}), zu schnell rot ({reds[2]:.2f})')
        check(s.ev("__game.scene.getObjectByName('ideal-line').visible"), f'{dev}: Linie sichtbar')
        check(not s.errors, f'{dev}: 0 Seitenfehler {s.errors[:3]}')
        s.close()
    # 3. Gegenproben (nur einmal, quer)
    if dev == devs[0]:
        for q, want_ts in [('?nosw&demo&dynlinie=0', 1.0), ('?nosw&demo&m=n16', 1.25)]:
            with Server() as srv, sync_playwright() as pw:
                s = Session(pw, srv.base, device=D_['ctx'], dpr=D_.get('shot_dpr'))
                s.open(q); s.ev("__game.setAssist('medium')"); s.ev("__game.setLine('strong')"); s.ev("__game.start()"); s.frames(4)
                spot = s.ev(FIND); s.ev(PLACE, [spot['p'], spot['vp'] * 1.45]); s.ev("__game.freeze(true)"); s.frames(30); time.sleep(0.4)
                c = s.ev(COL); ts = s.ev("__game.timeScale")
                check(abs(ts - want_ts) < 1e-9 and (c['red'] < 0.5 if 'dynlinie' in q else True), f'{q}: Spieltempo {ts}, Rot-Anteil zu schnell {c["red"]:.2f}')
                print('  Foto', s.shot(f'{dev}_{q.split("&")[-1].replace("=", "_")}', 'mittel2'), flush=True)
                check(not s.errors, f'{q}: 0 Seitenfehler {s.errors[:3]}')
                s.close()

# Collage je Gerät (nebeneinander, beschriftet)
try:
    from PIL import Image, ImageDraw, ImageFont
    for dev, items in coll.items():
        ims = [Image.open(f).convert('RGB') for f, _ in items]
        w = 640; ims = [im.resize((w, int(im.height * w / im.width))) for im in ims]
        H = max(im.height for im in ims)
        out = Image.new('RGB', (w * len(ims) + 10 * (len(ims) - 1), H + 44), (20, 20, 20))
        dr = ImageDraw.Draw(out)
        try: font = ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial Bold.ttf', 26)
        except Exception: font = None
        for k, (im, (_, lab)) in enumerate(zip(ims, items)):
            out.paste(im, (k * (w + 10), 44)); dr.text((k * (w + 10) + 10, 8), lab, fill=(255, 255, 255), font=font)
        p = os.path.join('tests/shots/mittel2', f'{dev}_collage_linie.jpg'); out.save(p, quality=86); print('Collage', p)
except Exception as e:
    print('Collage nicht möglich', e)
print('FEHLER: ' + '; '.join(fails) if fails else 'Mittel n23 Browser ok')
sys.exit(1 if fails else 0)
