# Bildschirmfotos importierter Strecken: Menü, Verfolgerkamera und freie Ansicht an Sonderteilen.
# Aufruf: python3 tests/trk_shots.py [trk-id oder Pfad zu .TRK] [--desktop] [--out=Unterordner] [--kinds=loop,corklr]
# Pfad zu einer lokalen .TRK-Datei (trk_local/…) → wird per Datei-Auswahl importiert (wie am Handy).
import sys, os, time, json
from util import Server, Session, PIXEL7_LAND, DESKTOP, ROOT
from playwright.sync_api import sync_playwright

args = [a for a in sys.argv[1:] if not a.startswith('--')]
opts = dict(a[2:].split('=', 1) if '=' in a else (a[2:], '1') for a in sys.argv[1:] if a.startswith('--'))
target = args[0] if args else 'demo-rundkurs'
device = DESKTOP if opts.get('desktop') else PIXEL7_LAND
sub = opts.get('out', 'trk/' + os.path.splitext(os.path.basename(target))[0])
KINDS = opts.get('kinds', 'sf,loop,corklr,corkud,pipe,pipeT,hwy,bankC,bankR,gap,bramp,elev,elcorner,chicane,slalom,tunnel,spanroad,large,road').split(',')

with Server() as srv, sync_playwright() as pw:
    s = Session(pw, srv.base, device=device)
    if os.path.isfile(target):
        s.open('?nosw')
        s.ev("() => window.__game.ui.showLibrary()")
        time.sleep(0.5)
        with s.pg.expect_file_chooser() as fc:
            s.tap('[data-a=trkpick]')
        fc.value.set_files(target)
        s.pg.wait_for_function("document.querySelector('#sheet .impres')", timeout=20000)
        s.shot('00_import', sub)
        res = s.ev("() => document.querySelector('#sheet .impres').innerText")
        print('Import:', res)
        tid = s.ev("() => window.__game.trkLib.list[0].id")
        s.tap(f'[data-a=trkplay][data-v="{tid}"]')
        s.pg.wait_for_function("window.__game.mode === 'menu' && document.querySelector('#menu.show')", timeout=300000)
    else:
        s.open(f'?nosw&trk={target}')
    s.frames(10)
    time.sleep(2.5)
    s.shot('01_menu', sub)
    info = s.ev("""() => { const g = window.__game, e = g.env; return { name: e.meta.name, key: e.meta.key, km: e.ideal.total / 1000, ap: e.meta.apTime, apFail: e.meta.apFail, calls: g.info().calls, tris: g.info().tris }; }""")
    print('Strecke', json.dumps(info))
    s.ev("() => window.__game.start()")
    s.frames(5)
    # Stellen je Elementart: Mitte des ersten Stücks dieser Art
    spots = s.ev("""(kinds) => { const e = window.__game.env, out = []; const seen = new Set();
      e.layout.pieces.forEach((pc, k) => { const pi = e.track.pieces[k]; if (!pi || seen.has(pc.kind) || !kinds.includes(pc.kind)) return; seen.add(pc.kind);
        out.push({ kind: pc.kind, a: pi.lineStart, b: pi.lineEnd }); }); return out; }""", KINDS)
    calls = []
    for sp in spots:
        mid = (sp['a'] + sp['b']) // 2
        back = max(0, sp['a'] - 12)
        # Verfolger: kurz vor dem Element absetzen und hineinfahren lassen
        s.ev(f"() => {{ const g = window.__game; g.freeze(false); g.teleport({back}, Math.min(24, g.env.prof.vt[{back}])); g.cam('chase'); }}")
        s.ev("() => window.__game.sim(0.9)")
        s.frames(4); time.sleep(0.6)
        st = s.state()
        s.shot(f"{sp['kind']}_chase", sub)
        calls.append(s.ev("() => window.__game.info().calls"))
        # freie Ansicht: seitlich erhöht auf die Elementmitte
        s.ev(f"""() => {{ const g = window.__game, L = g.env.track.line, i = {mid};
          g.freeze(true); window.__app.freezeCam = true;
          const x = L.px[i], y = L.py[i], z = L.pz[i];
          const bx = L.bx[i], bz = L.bz[i], tx = L.tx[i], tz = L.tz[i];
          g.camera.position.set(x + bx * 26 - tx * 18, y + 13, z + bz * 26 - tz * 18);
          g.camera.up.set(0, 1, 0); g.camera.lookAt(x, y + 2, z); }}""")
        s.frames(3); time.sleep(0.4)
        s.shot(f"{sp['kind']}_view", sub)
        s.ev("() => { window.__app.freezeCam = false; window.__game.freeze(false); }")
        print(f"  {sp['kind']:9s} idx {mid}  state {st['state']} crash {st['crash'] and st['crash']['reason']}")
    # Übersicht aus der Höhe
    s.ev("""() => { const g = window.__game, b = g.env.track.bounds; g.freeze(true); window.__app.freezeCam = true;
      const cx = (b.minX + b.maxX) / 2, cz = (b.minZ + b.maxZ) / 2, r = Math.max(b.maxX - b.minX, b.maxZ - b.minZ);
      g.camera.position.set(cx - r * 0.1, r * 0.62 + 40, cz + r * 0.72); g.camera.up.set(0, 1, 0); g.camera.lookAt(cx, 0, cz); }""")
    s.frames(3); time.sleep(0.6)
    s.shot('99_overview', sub)
    calls.append(s.ev("() => window.__game.info().calls"))
    print('Draw-Calls max', max(calls), 'Fehler', s.errors[:5])
    s.close()
