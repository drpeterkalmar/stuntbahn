# n19: 3D-Strecken im Browser – Menü (Code „…-3d“, Karte mit Ebenen, Schalter 3D/flach), alte Codes flach,
# Rennen auf einer 3D-Strecke mit Autopilot ins Ziel, Verfolgerkamera nie hinter Bauteilen (auch unter der
# Überführung), 0 Fehler. Fotos: tests/shots/strecken3d/ (Menü quer/hoch, Kamera unter der Brücke).
# Aufruf: python3 tests/test_strecken3d_ui.py [seed] [stufe]
import sys, time, json
sys.path.insert(0, 'tests')
from util import *
seed = int(sys.argv[1]) if len(sys.argv) > 1 else 4711
diff = int(sys.argv[2]) if len(sys.argv) > 2 else 3
PIXEL7_PORT = dict(PIXEL7_LAND, viewport={"width": 412, "height": 915})
bad = []
def check(c, msg):
    print(('OK   ' if c else 'FEHLER ') + msg, flush=True)
    if not c: bad.append(msg)
with Server() as srv, sync_playwright() as pw:
    s = Session(pw, srv.base)
    s.open('?nosw')
    m = s.ev("__game.env.meta")
    # n22: Standard ist jetzt „Gelände“; Hochstraße (3D) per Schalter
    check(m.get('gel') and m['key'].endswith('-g'), f"Start = Strecke des Tages im Gelände ({m['key']})")
    s.tap('button[data-a=mode][data-v="3d"]'); s.tap('button[data-a=today]')
    s.pg.wait_for_function("__game.env && __game.env.meta.d3", timeout=180000)
    m = s.ev("__game.env.meta")
    check(m.get('d3') and m['key'].endswith('-3d'), f"Schalter Hochstraße → Tages-Strecke in 3D ({m['key']})")
    txt = s.ev("document.querySelector('#menu .tmeta').textContent")
    check('-3d' in txt and 'Ebene' in txt, 'Menü zeigt Code mit -3d und Ebenen: ' + txt)
    px = s.ev("(() => { const c = document.querySelector('#menu canvas.tmap'); if (!c) return 0; const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i] > 150 && d[i+1] > 150) n++; return n; })()")
    check(px > 200, f'Streckenkarte gezeichnet ({px} helle Pixel)')
    s.shot('menu_quer', 'strecken3d')
    # Schalter flach → Tages-Strecke flach (alter Code), zurück auf Gelände
    s.tap('button[data-a=mode][data-v="flat"]'); s.tap('button[data-a=today]')
    s.pg.wait_for_function("__game.env && !__game.env.meta.d3 && !__game.env.meta.gel", timeout=120000)
    check(s.ev("__game.env.meta.key") == s.ev("String(__game.env.meta.seed) + '-2'"), 'flach: Tages-Strecke mit altem Code ' + s.ev("__game.env.meta.key"))
    s.tap('button[data-a=mode][data-v="gel"]')
    check(s.ev("__game.store.settings.trackMode") == 'gel', 'Schalter zurück auf Gelände gespeichert')
    # alter Code bleibt flach, neuer Code mit -3d
    s.ev(f"__game.newTrack({seed}, {diff}, false)"); s.pg.wait_for_function(f"__game.env.meta.key === '{seed}-{diff}'", timeout=120000)
    check(not s.ev("__game.env.layout.pieces.some(p => p.h1 != null)"), f'Code {seed}-{diff} ist flach wie bisher')
    s.ev(f"__game.newTrack({seed}, {diff}, true)"); s.pg.wait_for_function(f"__game.env.meta.key === '{seed}-{diff}-3d'", timeout=180000)
    lv = s.ev("__game.env.meta.levels"); cr = s.ev("__game.env.meta.crossings")
    check(lv >= 1, f'Code {seed}-{diff}-3d: {lv} Ebenen, {cr} Kreuzung(en)')
    s.frames(3); time.sleep(0.5); s.shot('menu_code3d_quer', 'strecken3d')
    # Rennen mit Autopilot; Kamera prüfen: Strahl Auto → Kamera frei (je Bild), Anteil herangezogen
    s.ev("__game.setAssist('easy')"); s.ev("__game.start({ autopilot: true })")
    # Prüfstrahl wie die Kamera: vom Auto aus (geglättetes Kamera-Oben statt Auto-Oben, im Looping verschieden)
    s.ev("__game.sim(3.3)")
    blocked, frames, pulled, enclosed = 0, 0, 0, 0
    for k in range(260):
        st = s.ev("__game.sim(0.5)")
        # nach 0,5 s Vorspulen ohne Bild gleitet die Kamera erst nach – wie im Spiel (jedes Bild) ein paar Bilder abwarten
        # (mit 2 Bildern stand sie an einer Steilrampe noch hinter der Fahrbahn, auch bis n25)
        s.frames(8)
        r = s.ev("""(() => { const g = __game, c = g.camera.position, p = g.race.car.pos, u = g.rig.up, w = g.env.world;
          const o = [p.x + u.x * 1.2, p.y + u.y * 1.2, p.z + u.z * 1.2]; const d = [c.x - o[0], c.y - o[1], c.z - o[2]]; const L = Math.hypot(...d);
          if (L < 0.5) return [0, g.rig.occK || 0]; const h = w.rayTrack(o[0], o[1], o[2], d[0] / L, d[1] / L, d[2] / L, L, false);
          const pc = g.env.layout.pieces[g.env.track.line.piece[g.race.tracker.idx]];
          return [h ? 1 : 0, g.rig.occK || 0, h ? [+h.t.toFixed(2), +L.toFixed(2), h.mat, pc && pc.type, +u.y.toFixed(2)] : null]; })()""")
        if r[0]: print('   verdeckt', r[2])
        # Looping/Röhre/Korkenzieher: die Spurwand liegt direkt neben dem Auto (Strahl-Ursprung) – getrennt gezählt
        inner = bool(r[0]) and r[2][3] in ('loop', 'tube', 'tr_corklr', 'tr_loop')
        frames += 1; pulled += 1 if r[1] > 0.05 else 0
        if inner: enclosed += 1
        else: blocked += r[0]
        if st['state'] == 'finished': break
    check(st['state'] == 'finished', f"3D-Strecke im Ziel: {json.dumps({k: st[k] for k in ['state', 'time', 'crashes', 'cp', 'cps']})}")
    check(blocked == 0, f'Kamera nie hinter Bauteilen: {blocked}/{frames} Bilder verdeckt, {pulled} herangezogen, {enclosed} × Spurwand in Looping/Röhre')
    # Kamera unter der Überführung: Auto auf der unteren Durchfahrt kurz vor der Kreuzung
    idx = s.ev("""(() => { const e = __game.env, L = e.track.line, P = e.layout.pieces; const cells = new Map();
      P.forEach((p, i) => { const k = p.i + ',' + p.j; cells.set(k, [...(cells.get(k) || []), i]); });
      for (const a of cells.values()) if (a.length === 2) { const lo = a.sort((x, y) => (P[x].lvl || 0) - (P[y].lvl || 0))[0]; for (let i = 0; i < L.n; i++) if (L.piece[i] === lo) return i; }
      return -1; })()""")
    if idx >= 0:
        s.ev(f"__game.teleport({idx} - 6, 25)"); s.ev("__game.sim(0.35)"); s.frames(8); time.sleep(0.6)
        s.shot('kamera_unter_bruecke_quer', 'strecken3d')
        r = s.ev("""(() => { const g = __game, c = g.camera.position, p = g.race.car.pos; return [c.y - p.y, g.rig.occK || 0]; })()""")
        check(True, f'Foto Kamera unter der Brücke (Kamera {r[0]:.2f} m über dem Auto, herangezogen {r[1]:.2f})')
    check(not s.errors, 'Fehler: ' + str(s.errors[:5]))
    s.close()
    # Hochformat: Menü
    s = Session(pw, srv.base, device=PIXEL7_PORT)
    s.open('?nosw')
    s.frames(3); time.sleep(0.5); s.shot('menu_hoch', 'strecken3d')
    check(not s.small_buttons(), 'hochkant: keine zu kleinen/abgeschnittenen Knöpfe ' + str(s.small_buttons()[:4]))
    check(not s.errors, 'Fehler hochkant: ' + str(s.errors[:5]))
    s.close()
print('ERGEBNIS', 'OK' if not bad else 'FEHLER: ' + '; '.join(bad))
sys.exit(1 if bad else 0)
