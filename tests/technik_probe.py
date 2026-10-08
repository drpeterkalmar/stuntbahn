# n30 Technik: schneller Browser-Check eines Standes – booten, Zustand des Grafik-Kerns (__game.info()), Fehler.
# Aufruf: python3 tests/technik_probe.py "?nosw&q=2" ["?nosw" …]   (je Query ein Browser nacheinander, Pixel 7 quer)
import sys, json, time
from util import Server, Session, sync_playwright
qs = sys.argv[1:] or ['?nosw']
with Server() as srv, sync_playwright() as pw:
    for q in qs:
        s = Session(pw, srv.base)
        try:
            s.open(q)
            s.frames(30)
            time.sleep(4)
            i = s.ev("__game.info()")
            print(q, 'boot', round(s.boot_s, 1), 's')
            print(json.dumps(i, ensure_ascii=False)[:1500] if len(sys.argv) < 2 or not __import__('os').environ.get('KURZ') else json.dumps({k: i.get(k) for k in ('calls', 'fps', 'tier', 'ap', 'apLog', 'startProbe')}, ensure_ascii=False))
            print('FEHLER', s.errors[:6])
            w = [c for c in s.console if 'GL_' in c or 'WebGL' in c]
            print('WARN', len(w), w[:3])
        finally:
            s.close()
