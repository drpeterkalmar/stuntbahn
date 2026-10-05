# Zufall würfelt auch die Landschaft (Peter 05.10.2026): „🎲 Zufall“ gibt der neuen Strecke eine zufällige Landschaft
# (nie dieselbe wie gerade sichtbar), auch wenn in „Landschaft“ ein festes Thema gewählt ist. Eine Wahl im
# Landschafts-Menü hebt die Zufalls-Landschaft auf; Tages-Strecke/Code bekommen wieder Einstellung bzw. „passend“.
# Aufruf: python3 tests/test_zufall_landschaft.py
import os, sys, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from util import Server, Session, PIXEL7_LAND
from playwright.sync_api import sync_playwright

fails = []
def check(c, m):
    print(('OK   ' if c else 'FEHLER ') + m, flush=True)
    if not c: fails.append(m)

INFO = """(() => ({ key: __game.env.meta.key, theme: __game.theme, rnd: !!__game.env.themeRandom, mode: __game.mode,
  label: (document.querySelector('#menu .themebtn') || {}).title || '', tthema: (document.querySelector('#menu .tthema') || {}).textContent || '' }))()"""

def wait_new(s, old_key, timeout=300):
    t0 = time.time()
    while time.time() - t0 < timeout:
        d = s.ev(INFO)
        # env wechselt schon in loadTrack (vor Kulisse/Autos), das Menü kommt erst nach dem Ladebalken → auf beides warten
        if d['key'] != old_key and d['mode'] == 'menu' and not s.ev("document.querySelector('#loading').classList.contains('show')"):
            time.sleep(0.3); d = s.ev(INFO)
            return d
        time.sleep(0.5)
    raise TimeoutError('neue Strecke kam nicht')

with Server() as srv, sync_playwright() as pw:
    s = Session(pw, srv.base, device=PIXEL7_LAND)
    s.open('?nosw')
    # flache Strecken bauen am schnellsten (Autopilot-Prüfung) – Streckenart betrifft die Landschaft nicht
    s.ev("(() => { __game.store.settings.trackMode = 'flat'; __game.store.settings.theme = 'auto'; __game.store.save(); })()")
    d0 = s.ev(INFO)
    check(not d0['rnd'], f"Start (Tages-Strecke): keine Zufalls-Landschaft {d0['theme']}")
    seen, prev = [], d0
    for k in range(4):
        s.tap('#menu button[data-a="random"]')
        d = wait_new(s, prev['key'])
        check(d['rnd'], f"Zufall {k + 1}: Landschaft gewürfelt → {d['theme']} (Strecke {d['key']})")
        check(d['theme'] != prev['theme'], f"Zufall {k + 1}: andere Landschaft als vorher ({prev['theme']} → {d['theme']})")
        check('🎲' in d['label'], f"Zufall {k + 1}: Knopf „Landschaft“ zeigt Zufall: {d['label']}")
        seen.append(d['theme']); prev = d
    check(len(set(seen)) >= 2, f"mehrere Landschaften gewürfelt: {seen}")
    s.shot('zufall_landschaft_quer', 'zufall')

    # festes Thema gewählt → Zufall überstimmt es trotzdem (Wunsch: Zufall ändert die Landschaftsart)
    s.ev("__game.setTheme('winter')")
    s.pg.wait_for_function("__game.theme === 'winter' && !__game.env.themeRandom", timeout=120000)
    check(True, 'Landschafts-Menü „Winter“: Zufalls-Landschaft aufgehoben, Winter sichtbar')
    s.ev("__game.ui.showMenu(__game.env)")
    s.tap('#menu button[data-a="random"]')
    d = wait_new(s, prev['key'])
    check(d['rnd'] and d['theme'] != 'winter', f"Zufall bei festem Thema Winter: trotzdem gewürfelt → {d['theme']}")
    prev = d

    # Tages-Strecke: wieder die Einstellung (Winter)
    s.tap('#menu button[data-a="today"]')
    d = wait_new(s, prev['key'])
    check(not d['rnd'] and d['theme'] == 'winter', f"Tages-Strecke: Einstellung gilt wieder ({d['theme']}, rnd={d['rnd']})")

    check(not s.errors, f"0 Fehler {s.errors[:3]}")
    s.close()

print('ALLES OK' if not fails else f'{len(fails)} FEHLER')
sys.exit(1 if fails else 0)
