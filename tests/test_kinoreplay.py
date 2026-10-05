# Kino-Replay nach dem Ziel (n18) im Browser: Rennen per Autopilot beenden → Film startet von selbst und läuft durch →
# Ergebnis; „🎬 Highlights“ spielt ihn erneut, Antippen überspringt → Ergebnis; Einstellung aus → direkt Ergebnis.
# Bildrate Film/Rennen nur zur Info (headless ±20 %, Prüfung mit mehreren Runden: tests/perf_kinoreplay.py); Balken quer/hoch; Fotos jeder Kamera-Art (Burst 6 × 160 ms) nach tests/shots/kinoreplay/.
# Aufruf: python3 tests/test_kinoreplay.py [quer|hoch|beide] [seed] [modus: flat|3d|gel]
import sys, time, json, os
sys.path.insert(0, 'tests')
from util import *

ART = sys.argv[1] if len(sys.argv) > 1 else 'beide'
SEED = sys.argv[2] if len(sys.argv) > 2 else '1234'
MODUS = sys.argv[3] if len(sys.argv) > 3 else 'gel'
Q = f"?nosw&seed={SEED}&d=3" + ('&g=1' if MODUS == 'gel' else '&3d=1' if MODUS == '3d' else '')
PORTRAIT = dict(PIXEL7_LAND, viewport={"width": 412, "height": 915})
CAMS = ['drone', 'action', 'tele', 'heli', 'onboard']
OUT = os.path.join(ROOT, 'tests', 'shots', 'kinoreplay')

MEASURE = """(sec) => new Promise((res) => { const t = []; let last = performance.now(); const t0 = last;
  const f = (now) => { t.push(now - last); last = now; if (now - t0 < sec * 1000) requestAnimationFrame(f); else { t.shift(); res(1000 * t.length / t.reduce((a, b) => a + b, 0)); } };
  requestAnimationFrame(f); })"""
def fps(s, sec=8.0):
    # Bildrate im Browser gemessen (requestAnimationFrame-Abstände); headless schwankt sie um ±20 % – Vergleich mit Toleranz,
    # genauer: tests/perf_kinoreplay.py (mehrere Runden)
    return s.ev(f"({MEASURE})({sec})")

def finish(s):
    for k in range(120):
        st = s.ev("__game.sim(2.0)")
        if st['state'] == 'finished': break
    # n27: erst die Zielshow (Auslaufen mit Feuerwerk, ~4 s), dann Film bzw. Ergebnis
    t0 = time.time()
    while s.ev("!!__game.show") and time.time() - t0 < 30: time.sleep(0.2)
    return st

def collage(paths, out):
    try:
        from PIL import Image
    except Exception:
        return None
    ims = [Image.open(p) for p in paths]
    w, h = ims[0].size; sc = 0.4 if w > h else 0.5
    tw, th = int(w * sc), int(h * sc)
    cols = 3 if w > h else 6
    rows = (len(ims) + cols - 1) // cols
    C = Image.new('RGB', (tw * cols, th * rows), (20, 20, 20))
    for i, im in enumerate(ims): C.paste(im.convert('RGB').resize((tw, th)), ((i % cols) * tw, (i // cols) * th))
    C.save(out, quality=85); return out

def bursts(s, tag):
    """Je Kamera-Art eine Einstellung aus dem Film (sonst erzwungen am passenden Clip), 6 Bilder im Abstand 160 ms."""
    info = s.ev("__game.cineInfo()")
    res = {}
    for cam in CAMS:
        pick = None
        for ci, c in enumerate(info['clips']):
            for sh in c['shots']:
                if sh['cam'] == cam and pick is None: pick = (ci, sh['t0'] + 0.3 * (sh['t1'] - sh['t0']), False)
        if pick is None:
            ci = max(range(len(info['clips'])), key=lambda k: info['clips'][k]['b'] - info['clips'][k]['a'] if info['clips'][k]['kind'] != 'finish' else -1)
            c = info['clips'][ci]; pick = (ci, c['a'] + 0.3 * (c['b'] - c['a']), True)
        ci, t, forced = pick
        # Film für den Burst verlangsamen (ein Foto dauert headless ~0,2 s – sonst ist kurze Einstellung vorbei)
        ts0 = s.ev("__game.timeScale"); s.ev("__game.setTimeScale(0.12)")
        s.ev(f"__game.cineSeek({ci}, {t})")
        if forced: s.ev(f"__game.cineForce('{cam}')")
        s.frames(4); time.sleep(0.25)
        paths, states = [], []
        for k in range(6):
            p = s.shot(f'{tag}_{cam}_{k}', 'kinoreplay'); paths.append(p)
            states.append(s.ev("__game.cineState()")); time.sleep(0.16)
        s.ev("__game.cineForce(null)"); s.ev(f"__game.setTimeScale({ts0})")
        col = collage(paths, os.path.join(OUT, f'{tag}_{cam}_burst.jpg'))
        bars = s.ev("[...document.querySelectorAll('#cine .lb')].map(e => Math.round(e.getBoundingClientRect().height))")
        res[cam] = {'clip': info['clips'][ci]['label'], 'erzwungen': forced, 'cam_im_bild': [x['cam'] for x in states], 'fov': round(states[0]['fov'], 1), 'abstand': round(states[0]['focus'], 1), 'balken_px': bars, 'collage': col}
        print(' ', tag, cam, json.dumps(res[cam], ensure_ascii=False), flush=True)
    return res

def run(pw, srv, device, tag):
    out = {}
    s = Session(pw, srv.base, device=device, kino=True)
    s.open(Q)
    s.ev("__game.setAssist('medium')")
    s.ev("__game.start({autopilot:true})")
    time.sleep(2.5)
    out['fps_rennen'] = round(fps(s), 1)
    st = finish(s)
    out['ziel'] = st['state']
    s.frames(3); time.sleep(0.4)
    t_film = time.time()
    out['film_startet'] = s.ev("__game.mode === 'replay' && !!__game.cine && document.getElementById('cine').classList.contains('show')")
    out['ergebnis_waehrend_film'] = s.ev("document.getElementById('result').classList.contains('show')")
    info = s.ev("__game.cineInfo()")
    out['film'] = {'dauer_s': round(info['duration'], 1), 'clips': [f"{c['label']} [{' → '.join(x['cam'] for x in c['shots'])}]" for c in info['clips']]}
    out['aufbau_ms'] = round(s.ev("window.__app.cineBuildMs") + s.ev("window.__app.cineSetupMs"))
    time.sleep(1.0)
    out['fps_film'] = round(fps(s), 1)
    if tag == 'quer':
        # Film ganz durchlaufen lassen → Ergebnis von selbst
        while s.ev("!!__game.cine") and time.time() - t_film < 120: time.sleep(0.5)
        out['durchgelaufen_s'] = round(time.time() - t_film, 1)
        s.frames(3); time.sleep(0.4)
        out['ergebnis_nach_film'] = s.ev("document.getElementById('result').classList.contains('show')")
        out['cine_stats'] = s.ev("window.__app.cine")
        s.shot(f'{tag}_ergebnis', 'kinoreplay')
        # erneut über „🎬 Highlights“, dann Antippen → überspringt
        s.tap('#result [data-a=cine]'); s.frames(3); time.sleep(1.2)
        out['highlights_knopf'] = s.ev("!!__game.cine")
    else:
        out['highlights_knopf'] = True
    out['kameras'] = bursts(s, tag)
    s.frames(2); time.sleep(0.8)
    box = s.pg.locator('#cine').bounding_box()
    s.pg.touchscreen.tap(box['x'] + box['width'] * 0.4, box['y'] + box['height'] * 0.5); time.sleep(0.6); s.frames(2)
    out['ueberspringen'] = s.ev("!__game.cine && document.getElementById('result').classList.contains('show') && window.__app.cine.skipped === true")
    out['kleine_knoepfe_ergebnis'] = s.small_buttons()
    s.shot(f'{tag}_ergebnis_knoepfe', 'kinoreplay')
    if tag == 'quer':
        # Highlights als Video (MediaRecorder): Film läuft mit Aufnahme durch → „Video teilen“ im Ergebnis
        out['video_mime'] = s.ev("(() => { for (const m of ['video/mp4;codecs=avc1','video/mp4','video/webm;codecs=vp9,opus','video/webm']) if (MediaRecorder.isTypeSupported(m)) return m; })()")
        s.tap('#result [data-a=cliprec]'); s.frames(3); time.sleep(1.0)
        out['video_rec_laeuft'] = s.ev("!!(__game.cine && __game.cine.rec)")
        t0 = time.time()
        while s.ev("!!__game.cine") and time.time() - t0 < 120: time.sleep(0.5)
        for k in range(20):
            if s.ev("!!window.__app.clip"): break
            time.sleep(0.5)
        out['video'] = s.ev("window.__app.clip")
        out['video_knopf'] = s.ev("!!document.querySelector('#result [data-a=clipshare]')")
        s.shot(f'{tag}_ergebnis_video', 'kinoreplay')
        if out['video']:
            # Video speichern (Desktop/headless: Download) → Datei prüfen
            with s.pg.expect_download(timeout=20000) as dl:
                s.ev("document.querySelector('#result [data-a=clipshare]').click()")
            p = os.path.join(OUT, 'highlights_video.' + ('mp4' if 'mp4' in out['video']['type'] else 'webm'))
            dl.value.save_as(p)
            out['video_datei'] = {'pfad': p, 'bytes': os.path.getsize(p)}
    # Einstellung aus → nach dem Ziel direkt das Ergebnis
    s.ev("__game.store.settings.cine = false; __game.store.save()")
    s.ev("__game.start({autopilot:true})"); finish(s); s.frames(3); time.sleep(0.4)
    out['aus_direkt_ergebnis'] = s.ev("!__game.cine && document.getElementById('result').classList.contains('show')")
    s.ev("__game.store.settings.cine = true; __game.store.save()")
    out['fehler'] = s.errors[:8]
    s.close()
    return out

res = {}
with Server() as srv, sync_playwright() as pw:
    os.makedirs(OUT, exist_ok=True)
    if ART in ('quer', 'beide'): res['quer'] = run(pw, srv, PIXEL7_LAND, 'quer')
    if ART in ('hoch', 'beide'): res['hoch'] = run(pw, srv, PORTRAIT, 'hoch')
print(json.dumps(res, ensure_ascii=False, indent=1))
ok = True
for tag, r in res.items():
    bars_ok = all((min(v['balken_px']) >= 30) if tag == 'quer' else (max(v['balken_px']) == 0) for v in r['kameras'].values())
    good = r['ziel'] == 'finished' and r['film_startet'] and not r['ergebnis_waehrend_film'] and r['highlights_knopf'] and r['ueberspringen'] \
        and r['aus_direkt_ergebnis'] and not r['fehler'] and bars_ok \
        and all(all(c == k for c in v['cam_im_bild']) for k, v in r['kameras'].items()) and not r['kleine_knoepfe_ergebnis']
    if tag == 'quer': good = good and r['ergebnis_nach_film'] and r['cine_stats'] and r['cine_stats'].get('skipped') is False \
        and r['video_rec_laeuft'] and r['video'] and r['video']['size'] > 100000 and r['video_knopf'] and r.get('video_datei', {}).get('bytes', 0) > 100000
    print(tag, 'Balken ok' if bars_ok else 'Balken FALSCH', 'grün' if good else 'ROT')
    ok = ok and good
print('ERGEBNIS', 'grün' if ok else 'ROT')
sys.exit(0 if ok else 1)
