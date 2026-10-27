# n42 Etappe 2: Sichtprüfung der seltenen Original-Elemente in Zufallsstrecken der Generator-Version 3 („p“) – je Element
# ein Foto aus der Verfolger-Sicht kurz davor (Spiel angehalten), dazu eine Autopilot-Runde bis ins Ziel (0 Fehler).
# Ergebnis: tests/shots/n42/selten.jpg (Collage) + selten.json
#   python3 tests/n42_selten_fotos.py
import os, sys, json, time, base64
HIER = os.path.dirname(os.path.abspath(__file__)); REPO = os.path.dirname(HIER)
sys.path.insert(0, HIER)
from n42_mess import N42Server, browser, INIT, warte
from perf_gate import profil
from playwright.sync_api import sync_playwright
from PIL import Image, ImageDraw

# (Titel, Query, Teiltyp) – Codes aus tools: erstes Vorkommen je Element (Seeds 100–3000)
FAELLE = [
    ('Lücken-Sprung (1 Feld), flach 129-2-p', 'seed=129&d=2&p=1', 'tr_gap1'),
    ('Lücken-Sprung (2 Felder), flach 447-3-p', 'seed=447&d=3&p=1', 'tr_gap2'),
    ('Röhre, flach 100-3-p', 'seed=100&d=3&p=1', 'tr_pipe'),
    ('Autobahn, flach 100-2-p', 'seed=100&d=2&p=1', 'tr_hwy'),
    ('Korkenzieher, flach 101-2-p', 'seed=101&d=2&p=1', 'tr_corklr'),
    ('Röhre, Gelände 100-2-gp', 'seed=100&d=2&g=1&p=1', 'tr_pipe'),
    ('Autobahn, Gelände 101-2-gp', 'seed=101&d=2&g=1&p=1', 'tr_hwy'),
    ('Autobahn, 3D 100-2-3dp', 'seed=100&d=2&3d=1&p=1', 'tr_hwy'),
]
FOTO = """async (typ) => { const G = __game, T = G.env.track, L = T.line;
  const k = T.pieces.findIndex((p) => p.type === typ); if (k < 0) return { fehler: 'kein ' + typ };
  G.store.settings.line = 'off'; G.start({ autopilot: true, seed: 1 }); G.sim(4);
  let j = T.pieces[k].lineStart, acc = 0; while (acc < 38 && j > 1) { acc += Math.hypot(L.px[j] - L.px[j - 1], L.pz[j] - L.pz[j - 1]); j--; }
  G.teleport(j, 25); G.freeze(true); G.cam('chase');
  await new Promise((r) => { let n = 0; const f = () => (++n > 40 ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); });
  G.manuell(true);
  G.drawOnce({ run: false, speed: 0 });
  return { url: G.renderer.domElement.toDataURL('image/jpeg', 0.85), key: G.env.meta.key, pflicht: G.env.layout.meta && G.env.layout.meta.pflicht }; }"""
RUNDE = """() => { const G = __game; G.manuell(false); G.freeze(false); G.start({ autopilot: true, seed: 2 }); const st = G.sim(400); return { state: st.state, time: st.time, crashes: st.crashes }; }"""

def main():
    out = os.path.join(REPO, 'tests', 'shots', 'n42'); os.makedirs(out, exist_ok=True)
    res, bilder = [], []
    with sync_playwright() as pw, N42Server(REPO, 0, 0) as srv:
        for titel, q, typ in FAELLE:
            b = browser(pw, ungedeckelt=False)
            try:
                ctx = b.new_context(**profil('quer', 1.5), service_workers='block', ignore_https_errors=True)
                ctx.add_init_script(INIT); ctx.add_init_script('window.__noKino = true; window.__noShow = true')
                pg = ctx.new_page(); fehler = []
                pg.on('pageerror', lambda e: fehler.append(str(e)[:200]))
                pg.goto(srv.base + 'index.html?' + q + '&q=2&startprobe=0&action=0')
                warte(pg, '() => window.__app && window.__app.ready && window.__app.frames > 20', 300)
                time.sleep(2)
                r = pg.evaluate(FOTO, typ)
                if r.get('url'):
                    f = os.path.join(out, f'selten_{len(bilder)}.jpg'); open(f, 'wb').write(base64.b64decode(r['url'].split(',', 1)[1])); bilder.append((titel, f))
                rr = pg.evaluate(RUNDE)
                e = {'titel': titel, 'key': r.get('key'), 'pflicht': r.get('pflicht'), 'runde': rr, 'fehler': fehler + ([r['fehler']] if r.get('fehler') else [])}
                res.append(e); print(json.dumps(e, ensure_ascii=False), flush=True)
            finally:
                b.close()
    # Collage 4 × 2
    W, H = 640, 288
    C = Image.new('RGB', (W * 4, (H + 26) * 2), 'white'); d = ImageDraw.Draw(C)
    for k, (t, f) in enumerate(bilder):
        im = Image.open(f).convert('RGB'); im.thumbnail((W, H)); x, y = (k % 4) * W, (k // 4) * (H + 26)
        C.paste(im, (x, y + 26)); d.text((x + 6, y + 6), t, fill=(0, 0, 0))
    C.save(os.path.join(out, 'selten.jpg'), quality=85)
    json.dump(res, open(os.path.join(out, 'selten.json'), 'w'), ensure_ascii=False, indent=1)
    ok = all(e['runde']['state'] == 'finished' and not e['fehler'] for e in res)
    print('ERGEBNIS', 'grün' if ok else 'ROT')

if __name__ == '__main__':
    main()
