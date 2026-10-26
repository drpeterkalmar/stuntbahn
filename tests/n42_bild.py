# n42 Bildvergleich „Optik unverändert“: gleiche Standbilder aus zwei Ständen (vorher = Kopie von main, nachher = dieser
# Stand) – Menü und Rennen (Spiel angehalten, Verfolger, Ideallinie an, Reifenabrieb im Bild), Grafik Kino und Standard,
# dazu der Stand gegen sich selbst (Rauschboden: Wind/Wolken/Wasser laufen mit der Uhr). Ergebnis: mittlere Abweichung
# (0–255) und Anteil Pixel > 8, Collage tests/shots/n42/bildvergleich_<szene>.jpg (links vorher, Mitte nachher, rechts ×8
# verstärkte Differenz).
#   python3 tests/n42_bild.py <vorher-Ordner> [nachher-Ordner]
import os, sys, json, time, base64
HIER = os.path.dirname(os.path.abspath(__file__)); REPO = os.path.dirname(HIER)
sys.path.insert(0, HIER)
from n42_mess import N42Server, browser, INIT, warte, STRECKE
from perf_gate import profil
from playwright.sync_api import sync_playwright
from PIL import Image, ImageChops

SZENEN = [x for x in [
    ('rennen_kino', '&q=2', 'rennen'),
    ('rennen_standard', '&q=1', 'rennen'),
] if not os.environ.get('N42_NUR') or x[0] in os.environ['N42_NUR'].split(',')]
RENNEN = """async () => { const G = __game; G.store.settings.line = 'full';
  G.start({ autopilot: true, seed: 3 }); G.sim(9); G.freeze(true); G.cam('chase');
  const fr = (n) => new Promise((r) => { let k = 0; const f = () => (++k > n ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); });
  await fr(20); G.manuell(true); await fr(2); }"""
# feste Kamera aus dem Auto-Zustand (deterministisch), genau ein Bild zeichnen (keine weiteren rAF-Bilder: manuell)
FEST = """() => { const G = __game, c = G.race.car, f = c.frame.f, u = c.frame.u, C = G.camera;
  C.position.set(c.pos.x - f.x * 7 + u.x * 2.4, c.pos.y - f.y * 7 + u.y * 2.4, c.pos.z - f.z * 7 + u.z * 2.4);
  C.up.set(0, 1, 0); C.fov = 62; C.updateProjectionMatrix(); G.minikarte.acc = 1e9;   // Sichtfeld fest (sonst je nach Bildtakt nachgeführt), Karte neu C.lookAt(c.pos.x + f.x * 6, c.pos.y + f.y * 6 + 0.6, c.pos.z + f.z * 6); C.updateMatrixWorld();
  G.drawOnce({ run: false, speed: 0 }); G.drawOnce({ run: false, speed: 0 });
  return G.renderer.domElement.toDataURL("image/png"); }"""   # im selben Schritt auslesen (Zeichenpuffer gilt nur bis zum Ende der Aufgabe)

ZUSATZ_NACHHER = os.environ.get('N42_ZUSATZ', '')   # z. B. "&vorwaermen=0" (welche Maßnahme macht einen Unterschied?)
def bild(pw, wurzel, q, art, pfad):
    if wurzel == REPO: q = q + ZUSATZ_NACHHER
    with N42Server(wurzel, 0, 0) as srv:
        b = browser(pw, ungedeckelt=False)
        try:
            ctx = b.new_context(**profil('quer', 2.0), service_workers='block', ignore_https_errors=True)
            ctx.add_init_script(INIT); ctx.add_init_script('window.__noKino = true; window.__noShow = true')
            ctx.add_init_script("Object.defineProperty(window, '__app', { configurable: true, set(v) { v.fixTime = 100; Object.defineProperty(window, '__app', { value: v, writable: true, configurable: true }); } })")   # feste Welt-Uhr (Wind, Wolken, Blätter)
            pg = ctx.new_page()
            pg.goto(srv.base + 'index.html?' + STRECKE + '&startprobe=0&autopilot=0&action=0' + q)
            warte(pg, '() => window.__app && window.__app.ready && window.__app.frames > 30', 300)
            time.sleep(2.5)   # Vorwärmen/Erst-Zeichnung durch
            if art == 'rennen':
                pg.evaluate(RENNEN); url = pg.evaluate(FEST); print("   ", pg.evaluate("JSON.stringify([__game.kino.describe(), __game.renderer.getPixelRatio(), __game.minikarte.ziel, __game.minikarte.yaw])")[:400], flush=True)
                open(pfad, 'wb').write(base64.b64decode(url.split(',', 1)[1]))
                return
            # einheitliche Uhr für Wolken/Wind (so weit möglich): Bild ohne UI
            pg.evaluate("() => { document.getElementById('ui').style.visibility = 'hidden'; }")
            pg.wait_for_timeout(400)
            pg.screenshot(path=pfad)
        finally:
            b.close()

def vergleich(a, b):
    A, B = Image.open(a).convert('RGB'), Image.open(b).convert('RGB')
    D = ImageChops.difference(A, B)
    px = list(D.get_flattened_data()) if hasattr(D, 'get_flattened_data') else list(D.getdata()); n = len(px)
    mittel = sum(sum(p) for p in px) / (3 * n)
    gross = sum(1 for p in px if max(p) > 8) / n * 100
    return round(mittel, 3), round(gross, 3), D

def main():
    vorher = os.path.abspath(sys.argv[1]); nachher = os.path.abspath(sys.argv[2]) if len(sys.argv) > 2 else REPO
    out = os.path.join(REPO, 'tests', 'shots', 'n42'); os.makedirs(out, exist_ok=True)
    res = {}
    with sync_playwright() as pw:
        for name, q, art in SZENEN:
            fa, fb, fc = (os.path.join(out, f'{name}_{t}.png') for t in ('vorher', 'nachher', 'nachher2'))
            bild(pw, vorher, q, art, fa); bild(pw, nachher, q, art, fb); bild(pw, nachher, q, art, fc)
            m, g, D = vergleich(fa, fb); m0, g0, _ = vergleich(fb, fc)
            res[name] = {'vorher_nachher': {'mittel': m, 'pixel_ueber_8_prozent': g}, 'nachher_nachher (Rauschen)': {'mittel': m0, 'pixel_ueber_8_prozent': g0}}
            print(name, json.dumps(res[name], ensure_ascii=False), flush=True)
            A, B = Image.open(fa).convert('RGB'), Image.open(fb).convert('RGB')
            Dv = D.point(lambda x: min(255, x * 8))
            w, h = A.size; C = Image.new('RGB', (w * 3, h)); C.paste(A, (0, 0)); C.paste(B, (w, 0)); C.paste(Dv, (2 * w, 0))
            C.thumbnail((2400, 2400)); C.save(os.path.join(out, f'bildvergleich_{name}.jpg'), quality=85)
    json.dump(res, open(os.path.join(out, 'bildvergleich.json'), 'w'), ensure_ascii=False, indent=1)

if __name__ == '__main__':
    main()
