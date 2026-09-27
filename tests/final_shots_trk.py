# Finale Bildschirmfotos Nacht 2 (nur eigene Strecken: Beispielstrecke + eigene Testdateien) → tests/shots/final/
# (danach für das Repo in JPEG gewandelt: sips -s format jpeg -s formatOptions 85)
import os, sys, time, json, subprocess
from util import Server, Session, PIXEL7_LAND, DESKTOP, ROOT
from playwright.sync_api import sync_playwright

OUT = os.path.join(ROOT, 'tests', 'out')
subprocess.run(['node', os.path.join(ROOT, 'tests', 'make_test_trks.mjs')], check=True, capture_output=True)
FINAL = 'final'

def run_until(s, cond_js, max_s=12):
    # Physik in kleinen Schritten vorspulen, bis die Bedingung (JS-Ausdruck mit g = __game, c = Auto) erfüllt ist
    return s.ev(f"""() => {{ const g = window.__game; for (let k = 0; k < {int(max_s * 20)}; k++) {{ g.sim(0.05);
      const c = g.race.car, L = g.env.track.line, idx = g.race.tracker.idx; if ({cond_js}) return true; }} return false; }}""")

def shots(dev, prefix):
    with Server() as srv, sync_playwright() as pw:
        s = Session(pw, srv.base, device=dev)
        s.open('?nosw&trk=demo-rundkurs')
        s.frames(5); time.sleep(2.5)
        s.shot(f'{prefix}_menue_import', FINAL)
        # Bibliothek mit eigenen Testdateien
        s.ev("() => window.__game.ui.showLibrary()")
        with s.pg.expect_file_chooser() as fc:
            s.tap('[data-a=trkpick]')
        fc.value.set_files([os.path.join(OUT, f) for f in ['OVAL.TRK', 'SCHOTTER.TRK', 'PAKET.ZIP']])
        s.pg.wait_for_selector('#sheet .impres', timeout=30000)
        time.sleep(0.8)
        s.shot(f'{prefix}_bibliothek', FINAL)
        s.ev("() => window.__game.ui.showMenu(window.__game.env)")
        s.ev("() => window.__game.setAssist('easy')")
        s.ev("() => window.__game.start()")
        s.frames(3)
        # Korkenzieher-Rolle: kurz vor der Rolle absetzen, bis kopfüber vorspulen
        k = s.ev("() => { const e = window.__game.env; const k = e.layout.pieces.findIndex(p => p.kind === 'corklr'); return e.track.pieces[k].lineStart; }")
        s.ev(f"() => window.__game.teleport({k} - 14, 17)")
        ok = run_until(s, "c.frame.u.y < -0.6", 6)
        s.frames(4); time.sleep(0.5)
        s.shot(f'{prefix}_korkenzieher_kopfueber', FINAL)
        # Sprung über die Scheune: bis in der Luft
        k = s.ev("() => { const e = window.__game.env; const k = e.layout.pieces.findIndex(p => p.kind === 'gap'); return e.track.pieces[k].lineStart; }")
        s.ev(f"() => {{ const g = window.__game; g.teleport({k} - 22, g.env.prof.vt[{k} - 22]); }}")
        run_until(s, "c.onGround === 0 && L.air[idx]", 5)
        s.ev("() => window.__game.sim(0.25)")
        s.frames(4); time.sleep(0.5)
        s.shot(f'{prefix}_sprung', FINAL)
        # Röhre von innen
        k = s.ev("() => { const e = window.__game.env; const k = e.layout.pieces.findIndex(p => p.kind === 'pobst'); return e.track.pieces[k].lineStart; }")
        s.ev(f"() => window.__game.teleport({k} - 16, 14)")
        s.ev("() => window.__game.sim(0.6)")
        s.frames(4); time.sleep(0.5)
        s.shot(f'{prefix}_roehre', FINAL)
        # Wendel (Hochstraße hinunter), Verfolger
        k = s.ev("() => { const e = window.__game.env; const k = e.layout.pieces.findIndex(p => p.kind === 'corkud'); return e.track.pieces[k].lineStart; }")
        s.ev(f"() => window.__game.teleport({k} + 30, 9)")
        s.ev("() => window.__game.sim(0.8)")
        s.frames(4); time.sleep(0.5)
        s.shot(f'{prefix}_wendel', FINAL)
        # Übersicht
        s.ev("""() => { const g = window.__game, b = g.env.track.bounds; g.freeze(true); window.__app.freezeCam = true;
          const cx = (b.minX + b.maxX) / 2, cz = (b.minZ + b.maxZ) / 2;
          g.camera.position.set(cx - 60, 150, cz + 250); g.camera.up.set(0, 1, 0); g.camera.lookAt(cx, 0, cz - 10); }""")
        s.frames(3); time.sleep(0.6)
        s.shot(f'{prefix}_uebersicht', FINAL)
        info = s.ev("() => window.__game.info()")
        print(prefix, 'kopfüber erreicht' if ok else 'kopfüber NICHT erreicht', json.dumps(info), 'Fehler', s.errors[:3])
        s.close()

shots(PIXEL7_LAND, 'nacht2_handy')
if '--desktop' in sys.argv or True:
    shots(DESKTOP, 'nacht2_desktop')
