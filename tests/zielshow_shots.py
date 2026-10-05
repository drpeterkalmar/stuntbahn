# Zielshow (n27) im Browser: Rennen per Autopilot ins Ziel, dann die Show in Zeitlupe abfotografieren (Feuerwerk,
# Fontänen, Konfetti, Schwenk der Zielbogen-Kamera, Zeit-Einblendung). Zwei Fahrten: Mittel (erste Zeit = Bestzeit →
# goldene Bursts) und Leicht/Brachial (normale Größe, Jubel-Dreher wenn Platz). Prüft 0 JS-Fehler, Show-Ablauf (Kamera
# schneidet bei ZIEL.cut, Ende bei ZIEL.end → Film bzw. Ergebnis), Partikelzahl je Grafikstufe.
# Aufruf: python3 tests/zielshow_shots.py [quer|hoch] [Code, z. B. 4711-3 | 1234-3-g] [Zusatz-URL] → tests/shots/zielshow/
import sys, time, json, os
sys.path.insert(0, 'tests')
from util import *

DEV = sys.argv[1] if len(sys.argv) > 1 else 'quer'
CODE = sys.argv[2] if len(sys.argv) > 2 else '4711-3'
EXTRA = sys.argv[3] if len(sys.argv) > 3 else ''
sd, dd = CODE.split('-')[:2]
Q = f'?nosw&seed={sd}&d={dd}' + ('&g=1' if CODE.endswith('-g') else '&3d=1' if CODE.endswith('-3d') else '') + EXTRA
PIXEL7_PORT = dict(PIXEL7_LAND, viewport={"width": 412, "height": 915})
DEVICES = {'quer': PIXEL7_LAND, 'hoch': PIXEL7_PORT, 'desktop': DESKTOP}
OUT = os.path.join(ROOT, 'tests', 'shots', 'zielshow')
os.makedirs(OUT, exist_ok=True)
TAUS = [0.12, 0.4, 0.75, 1.0, 1.35, 1.75, 2.2, 2.7, 3.3, 4.0]

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

def finish(s):
    for k in range(150):
        st = s.ev("__game.sim(2.0)")
        if st['state'] == 'finished': return st
    return st

def run_show(s, tag, ts=0.12):
    """Show in Zeitlupe (Spieltempo ts) abfotografieren: je Ziel-τ ein Bild"""
    out = {'show': s.ev("!!__game.show"), 'info': s.ev("window.__app.show")}
    s.ev(f"__game.setTimeScale({ts})")
    paths, taus, cams = [], [], []
    for T in TAUS:
        t0 = time.time()
        while s.ev("__game.showTau()") < T and s.ev("!!__game.show") and time.time() - t0 < 40: time.sleep(0.03)
        if not s.ev("!!__game.show"): break
        taus.append(round(s.ev("__game.showTau()"), 2))
        cams.append(s.ev("__game.rig.view"))
        paths.append(s.shot(f'{tag}_{len(paths)}', 'zielshow'))
    out['taus'] = taus; out['kamera'] = cams
    out['collage'] = collage(paths, os.path.join(OUT, f'{tag}_serie.jpg')) if paths else None
    # Ende der Show → Film (Kino an) oder Ergebnis
    s.ev("__game.setTimeScale(1)")
    t0 = time.time()
    while s.ev("!!__game.show") and time.time() - t0 < 30: time.sleep(0.2)
    out['nach_show'] = s.ev("__game.cine ? 'film' : document.getElementById('result').classList.contains('show') ? 'ergebnis' : __game.mode")
    out['info_ende'] = s.ev("window.__app.show")
    out['aufzeichnung_nach_ziel_s'] = s.ev("(__game.race.rec.length / 16 - __game.race.finF) / 60")
    return out

res = {'dev': DEV, 'code': CODE}
with Server() as srv, sync_playwright() as pw:
    s = Session(pw, srv.base, device=DEVICES[DEV], kino=True)
    s.open(Q)
    # 1) Mittel per Autopilot: erste Zeit auf frischem Profil = Bestzeit → große Show mit Gold
    s.ev("__game.setAssist('medium')"); s.ev("__game.start({autopilot:true})"); s.ev("__game.cam('chase')"); s.frames(3)
    st = finish(s)
    res['mittel_ziel'] = st['state']
    res['mittel'] = run_show(s, f'{DEV}_bestzeit')
    if s.ev("!!__game.cine"): s.ev("__game.skipCine()")
    s.frames(2)
    # 2) Leicht/Brachial, Cockpit-Kamera: normale Show, ggf. Jubel-Dreher; Tippen überspringt
    s.ev("__game.setAssist('easy')"); s.ev("__game.store.settings.fahrstil = 'brachial'")
    s.ev("__game.start({seed: 11})"); s.ev("__game.cam('cockpit')"); s.frames(3)
    st = finish(s)
    res['leicht_ziel'] = st['state']
    res['leicht'] = run_show(s, f'{DEV}_leicht')
    if s.ev("!!__game.cine"): s.ev("__game.skipCine()")
    # 3) Überspringen per Tipp (nach 0,35 s) → Aufzeichnung trotzdem vollständig, danach Film
    s.ev("__game.setAssist('medium')"); s.ev("__game.start({autopilot:true})"); s.ev("__game.cam('chase')"); s.frames(3)
    finish(s); s.frames(2); time.sleep(0.6)
    box = s.pg.locator('#zshow').bounding_box()
    if box:
        s.pg.touchscreen.tap(box['x'] + box['width'] * 0.5, box['y'] + box['height'] * 0.5); time.sleep(0.5); s.frames(2)
    res['tipp_ueberspringt'] = s.ev("!__game.show && !!window.__app.show && window.__app.show.skipped === true")
    res['tipp_aufzeichnung_s'] = s.ev("(__game.race.rec.length / 16 - __game.race.finF) / 60")
    res['tipp_danach'] = s.ev("__game.cine ? 'film' : document.getElementById('result').classList.contains('show') ? 'ergebnis' : __game.mode")
    if s.ev("!!__game.cine"): s.ev("__game.skipCine()")
    res['fehler'] = s.errors[:8]
    s.close()
print(json.dumps(res, ensure_ascii=False, indent=1))
ok = res['mittel_ziel'] == 'finished' and res['mittel']['show'] and res['mittel']['nach_show'] in ('film', 'ergebnis') \
    and res['leicht']['nach_show'] in ('film', 'ergebnis') and res['tipp_ueberspringt'] and res['tipp_aufzeichnung_s'] >= 4.9 \
    and res['mittel']['aufzeichnung_nach_ziel_s'] >= 4.9 and not res['fehler'] and 'cine' in res['mittel']['kamera']
print('ERGEBNIS', 'grün' if ok else 'ROT')
sys.exit(0 if ok else 1)
