# Grafik-Start (02.10.2026): ohne Wahl startet auch das Handy mit Kino; eine gespeicherte Wahl bleibt nach Neuladen erhalten.
# Aufruf: python3 tests/test_grafik_start.py
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from util import Server, Session, PIXEL7_LAND, DESKTOP
from playwright.sync_api import sync_playwright

fails = []
def check(c, m):
    print(('OK   ' if c else 'FEHLER ') + m, flush=True)
    if not c: fails.append(m)

STATE = "({ tier: __game.info().tier, level: __game.kino.describe().level })"
with Server() as srv, sync_playwright() as pw:
    for name, dev in [('Handy', PIXEL7_LAND), ('Desktop', DESKTOP)]:
        s = Session(pw, srv.base, device=dev)
        s.open('?nosw&demo')
        d = s.ev(STATE)
        check(d['tier'] == 2 and d['level'] == 2, f'{name} ohne Wahl: startet mit Kino {d}')
        # Wahl „Standard“ speichern (wie der Knopf in den Optionen) → nach Neuladen bleibt Standard
        s.ev("""(() => { const d = JSON.parse(localStorage.getItem('stuntbahn.v1') || '{}'); d.settings = Object.assign(d.settings || {}, { quality: '1' }); localStorage.setItem('stuntbahn.v1', JSON.stringify(d)); })()""")
        s.open('?nosw&demo')
        d = s.ev(STATE)
        check(d['tier'] == 1 and d['level'] == 1, f'{name} gespeichert Standard: bleibt nach Neuladen Standard {d}')
        s.ev("""(() => { const d = JSON.parse(localStorage.getItem('stuntbahn.v1')); d.settings.quality = 'auto'; localStorage.setItem('stuntbahn.v1', JSON.stringify(d)); })()""")
        s.open('?nosw&demo')
        d = s.ev(STATE)
        check(d['tier'] == 2, f'{name} zurück auf Automatisch: wieder Kino {d}')
        check(not s.errors, f'{name}: 0 Fehler {s.errors[:3]}')
        s.close()

print('ALLES OK' if not fails else f'{len(fails)} FEHLER')
sys.exit(1 if fails else 0)
