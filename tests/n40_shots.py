# n40 im Browser (VORBAU, ungetestet – vom rog ohne Browser geschrieben; der Heavy-Job führt es aus und passt es an):
#   tiere  – Tier-Zuschauer nah (ruhig, jubelnd, sitzend), Tribüne nah/fern, Gruppen-Karten in der Ferne; dasselbe mit
#            ?zuschauer=mensch zum Vergleich → Collage tests/shots/n40/tiere_<quer|hoch>.jpg (Vision-Gate: „niedlich und als
#            Tiere erkennbar?“)
#   stunt  – Rennen auf Leicht (ohne Autopilot-Prüffahrt: dort gibt es keinen Stunt) bis ins Ziel, dann die Zielshow in
#            Zeitlupe von der Linie bis nach der Landung abfotografieren; je Figur (?zstunt=schraube|front|back) eine Serie
#            → tests/shots/n40/stunt_<figur>_<quer|hoch>.jpg; danach Film: Zieleinlauf-Titel „🏁 Ziel · …“
# Prüft 0 JS-Fehler, app.show.zstunt (Figur) bzw. zstuntWhy (warum keiner), Aufzeichnung nach dem Ziel ≥ Landung + 2 s.
# Strecken mit Platz hinter dem Ziel (Node-Probe am rog, Leicht): 4-2-h (Schraube), 99-2-h, 13-2-gh, 2-2-3dh, 3-2-3dh,
# 12-2-3dh, 4711-2-gh; ohne Platz: 4711-2-h (Looping nach 72 m), 12-2-h/5-2-gh (Steilkurve).
# Aufruf: python3 tests/n40_shots.py tiere|stunt [quer|hoch] [Code, z. B. 4711-2-g | 4-2] [Zusatz-URL]
import sys, time, json, os
sys.path.insert(0, 'tests')
from util import *

WAS = sys.argv[1] if len(sys.argv) > 1 else 'stunt'
DEV = sys.argv[2] if len(sys.argv) > 2 else 'quer'
CODE = sys.argv[3] if len(sys.argv) > 3 else ('4711-2-g' if WAS == 'tiere' else '4-2')
EXTRA = sys.argv[4] if len(sys.argv) > 4 else ''
QSTUFE = os.environ.get('N40_Q', '2')   # Grafik: 2 Kino (feine Figur), 1 Standard (grobe Figur)
KAM = os.environ.get('N40_CAM', 'chase')   # Kamera im Rennen (Stunt: cockpit/bumper → Verfolger ab dem Nitro)
FIGUREN = os.environ.get('N40_FIGUREN', 'schraube,front,back').split(',')
QTAG = '' if QSTUFE == '2' else f'_q{QSTUFE}'
# Code wie im Spiel: 4-2 (flach), 4711-2-g (Gelände), 2-2-3d (Hochstraße), Zusatz „h“ = Generator mit Hindernissen (4-2-h, 13-2-gh)
sd, dd, *rest = CODE.split('-')
fl = rest[0] if rest else ''
Q = f'?nosw&seed={sd}&d={dd}' + ('&g=1' if fl.startswith('g') else '&3d=1' if fl.startswith('3d') else '') + ('&h=1' if fl.endswith('h') else '') + EXTRA
PIXEL7_PORT = dict(PIXEL7_LAND, viewport={"width": 412, "height": 915})
DEVICES = {'quer': PIXEL7_LAND, 'hoch': PIXEL7_PORT, 'desktop': DESKTOP}
SUB = 'n40'
OUT = os.path.join(ROOT, 'tests', 'shots', SUB)
os.makedirs(OUT, exist_ok=True)

def collage(paths, out, cols=None):
    from PIL import Image
    ims = [Image.open(p) for p in paths]
    w, h = ims[0].size; sc = 0.36 if w > h else 0.42
    tw, th = int(w * sc), int(h * sc)
    cols = cols or (4 if w > h else 5)
    rows = (len(ims) + cols - 1) // cols
    C = Image.new('RGB', (tw * cols, th * rows), (20, 20, 20))
    for i, im in enumerate(ims): C.paste(im.convert('RGB').resize((tw, th)), ((i % cols) * tw, (i // cols) * th))
    C.save(out, quality=86); return out

# Kamera wie tests/kulissen2_shots.py: Abstand dist vom Objekt Richtung Straße, Höhe h, Blick auf Objekt + look m
CAM = """([x, z, rot, dist, h, look, side]) => { const g = __game, a = window.__app, T = g.env.track.terrain; a.freezeCam = true; const c = g.camera;
  const dx = Math.sin(rot + side), dz = Math.cos(rot + side), cx = x + dx * dist, cz = z + dz * dist;
  const gy = T.height(x, z), cy = Math.max(T.height(cx, cz) + 1.6, gy + h);
  c.position.set(cx, cy, cz); c.up.set(0, 1, 0); c.lookAt(x, gy + look, z); c.fov = 55; c.updateProjectionMatrix(); }"""
PLAN = "(() => { const p = __game.env.track.decoPlan; return p ? { inst: p.inst, fans: (p.fans || []).map((f) => [f.x, f.z, f.rot, f.pose]) } : null; })()"

def tiere(s, art_tag):
    s.ev("__game.setAssist('easy'); __game.start({ autopilot: true })"); s.ev("__game.sim(4.0)"); s.ev("__game.freeze(true)")
    s.ev("window.__app.fixTime = 20.0")
    P = s.ev(PLAN); paths = []
    if not P: return paths
    U = "__game.decoUniforms.uCheer.value"
    for art in ('ruhig', 'jubel', 'sitzen'):
        F = [f for f in P['fans'] if (f[3] == 4) == (art == 'sitzen')]
        if not F: continue
        best = max(F[:400], key=lambda f: sum(1 for g in F if (g[0] - f[0]) ** 2 + (g[1] - f[1]) ** 2 < 36))
        s.ev(f"{U}.set({best[0]}, {best[1]}, 80, {1 if art == 'jubel' else 0})")
        for dist in ((5, 9) if art != 'sitzen' else (6,)):
            s.ev(CAM, [best[0], best[1], best[2], dist, 1.8 if dist < 7 else 2.2, 1.0, 0.3])
            s.frames(30); time.sleep(0.3)
            # Jubel klingt im Spiel jedes Bild ab (main.js updateCheer) – direkt vor dem Foto wieder voll setzen
            if art == 'jubel':
                for k in range(3): s.ev(f"{U}.set({best[0]}, {best[1]}, 80, 1); window.__app.fixTime = {20.0 + 0.13 * k}"); s.frames(1)
            paths.append(s.shot(f'{art_tag}_{art}_{dist}m_{DEV}{QTAG}', SUB))
    s.ev(f"{U}.set(0, 0, 0, 0)")
    st = (P['inst'].get('stand') or [None])[0]
    if st:
        for dist, h in ((22, 4), (60, 9)):   # Tribüne nah (3D vorn, Karten-Streifen) und fern (nur Karten)
            s.ev(CAM, [st['x'], st['z'], st.get('rot', 0), dist, h, 3, 0.4])
            s.frames(30); time.sleep(0.3)
            paths.append(s.shot(f'{art_tag}_tribuene_{dist}m_{DEV}{QTAG}', SUB))
    cr = (P['inst'].get('crowd') or [None])[0]
    if cr:   # Gruppen-Karten in der Ferne (3D blendet ab ~58–74 m aus)
        s.ev(CAM, [cr['x'], cr['z'], cr.get('rot', 0), 90, 6, 1, 0.3])
        s.frames(30); time.sleep(0.3)
        paths.append(s.shot(f'{art_tag}_fern_90m_{DEV}{QTAG}', SUB))
    s.ev("window.__app.freezeCam = false; __game.freeze(false); __game.toMenu()")
    return paths

def finish(s):
    st = None
    for k in range(150):
        st = s.ev("__game.sim(2.0)")
        if st['state'] == 'finished': return st
    return st

def stunt(s, figur):
    """Leicht (Spieler-Rennen, kein Autopilot-Prüflauf) ins Ziel, Zielshow in Zeitlupe bis nach der Landung"""
    s.ev("__game.setAssist('easy')"); s.ev("__game.start({ seed: 11 })"); s.ev(f"__game.cam('{KAM}')"); s.frames(3)
    st = finish(s)
    out = {'ziel': st and st['state'], 'show': s.ev("window.__app.show"), 'plan': s.ev("(() => { const z = __game.race.zstunt; return z ? { art: z.art, tB: z.tB, tJ: z.tJ, tL: z.tL, cut: z.cut, end: z.end, rec: z.rec } : null; })()")}
    if not out['plan']: return out, []
    Z = out['plan']
    s.ev("__game.setTimeScale(0.15)")
    taus = [0.2, max(0.3, Z['tB'] - 0.2), Z['tJ'] - 0.15] + [Z['tJ'] + (Z['tL'] - Z['tJ']) * k / 7 for k in range(1, 8)] + [Z['tL'] + 0.25, Z['cut'] + 0.3, Z['cut'] + 1.2]
    paths = []
    for T in taus:
        t0 = time.time()
        while s.ev("__game.showTau()") < T and s.ev("!!__game.show") and time.time() - t0 < 60: time.sleep(0.03)
        if not s.ev("!!__game.show"): break
        paths.append(s.shot(f'stunt_{figur}_{len(paths)}_{DEV}' + ('' if KAM == 'chase' else '_' + KAM), SUB))
        out.setdefault('ansicht', []).append(s.ev("__game.rig.view"))
    out['kamera'] = s.ev("__game.rig.view")
    s.ev("__game.setTimeScale(1)")
    t0 = time.time()
    while s.ev("!!__game.show") and time.time() - t0 < 40: time.sleep(0.2)
    out['aufzeichnung_nach_ziel_s'] = s.ev("(__game.race.rec.length / 16 - __game.race.finF) / 60")
    out['film_titel'] = s.ev("__game.cine && __game.cine.film ? __game.cine.film.clips.map((c) => c.label) : null")
    if s.ev("!!__game.cine"): s.ev("__game.skipCine()")
    return out, paths

res = {'was': WAS, 'dev': DEV, 'code': CODE}
with Server() as srv, sync_playwright() as pw:
    if WAS == 'tiere':
        alle = []
        for zu in ('tiere', 'mensch'):
            s = Session(pw, srv.base, device=DEVICES[DEV])
            s.open(Q + f'&zuschauer={zu}&q={QSTUFE}&startprobe=0&blur=off&wetter=klar')
            alle += tiere(s, zu)
            res.setdefault('fehler', []).extend(s.errors[:8])
            s.close()
        res['collage'] = collage(alle, os.path.join(OUT, f'tiere_{DEV}{QTAG}.jpg')) if alle else None
        ok = bool(alle) and not res['fehler']
    else:
        ok = True
        for figur in FIGUREN:
            s = Session(pw, srv.base, device=DEVICES[DEV], kino=True)
            s.open(Q + f'&zieljubel=stunt&zstunt={figur}')
            r, paths = stunt(s, figur)
            r['collage'] = collage(paths, os.path.join(OUT, f'stunt_{figur}_{DEV}' + ('' if KAM == 'chase' else '_' + KAM) + '.jpg')) if paths else None
            r['fehler'] = s.errors[:8]
            res[figur] = r
            ok = ok and bool(r['plan']) and r['plan']['art'] == figur and not r['fehler'] and r['aufzeichnung_nach_ziel_s'] >= r['plan']['tL'] + 2 \
                and bool(r['film_titel']) and any(('Schraube' if figur == 'schraube' else 'Frontflip' if figur == 'front' else 'Backflip') in t for t in r['film_titel'])
            s.close()
print(json.dumps(res, ensure_ascii=False, indent=1))
print('ERGEBNIS', 'grün' if ok else 'ROT')
sys.exit(0 if ok else 1)
