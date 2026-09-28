# Optik (28.09.2026): Erstladung in MB (alle Antworten bis „bereit“, ohne Service-Worker-Cache), vorher/nachher.
# Aufruf: python3 tests/load_mb.py [Wurzel] [Strecken-Parameter]
import os, sys, time, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from util import Server, Session, PIXEL7_LAND, ROOT
from playwright.sync_api import sync_playwright
root = os.path.abspath(sys.argv[1]) if len(sys.argv) > 1 else ROOT
q = sys.argv[2] if len(sys.argv) > 2 else 'seed=20260927&d=2'
with Server(root) as srv, sync_playwright() as pw:
    s = Session(pw, srv.base, device=PIXEL7_LAND)
    sizes = {}
    def on_resp(r):
        try: sizes[r.url] = len(r.body())
        except Exception: pass
    s.pg.on('response', on_resp)
    s.open(f'?nosw&{q}')
    time.sleep(1.0)
    tot = sum(sizes.values())
    big = sorted(((v, k.split('/')[-1]) for k, v in sizes.items()), reverse=True)[:8]
    print(json.dumps({'wurzel': os.path.basename(root), 'dateien': len(sizes), 'mb': round(tot / 1e6, 2), 'groesste': [(n, round(v / 1e6, 2)) for v, n in big], 'fehler': s.errors[:2]}, ensure_ascii=False))
    s.close()
