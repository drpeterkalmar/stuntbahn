# Wetter (n32): Menü hoch/quer – Knopfzeile „Strecke laden / Landschaft / Wetter“ bricht nicht um, Blatt „Wetter“,
# Wahl wird gespeichert und gilt nach Neuladen (localStorage), URL ?wetter= hat Vorrang. Fotos: tests/shots/wetter/menu_*.png
import sys, os, json, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from util import *
ok = True
def expect(c, m):
    global ok
    print(('OK   ' if c else 'FAIL ') + m, flush=True); ok = ok and bool(c)
ROW = """(() => { const b = [...document.querySelectorAll('button[data-a="wetterwahl"], button[data-a="themes"], button[data-a="trklib"]')].filter((x) => x.offsetParent);
  const r = b.map((x) => x.getBoundingClientRect()); return { n: b.length, tops: r.map((q) => Math.round(q.top)), h: r.map((q) => Math.round(q.height)), right: Math.max(...r.map((q) => q.right)), W: innerWidth }; })()"""
with Server() as srv, sync_playwright() as pw:
    for mode, vp in (('hoch', {'width': 412, 'height': 915}), ('quer', {'width': 915, 'height': 412})):
        s = Session(pw, srv.base, device=dict(PIXEL7_LAND, viewport=vp))
        s.open('?nosw&seed=25&d=2&g=1&thema=land&q=1&startprobe=0')
        time.sleep(1)
        r = s.ev(ROW); print(mode, r)
        expect(r['n'] == 3 and max(r['tops']) - min(r['tops']) < 4 and r['right'] <= r['W'] + 1, f'{mode}: drei Knöpfe in einer Zeile, im Bild')
        s.ev("document.querySelector('button[data-a=\"wetterwahl\"]').scrollIntoView()"); time.sleep(0.3)
        s.shot(f'menu_{mode}', 'wetter')
        s.tap('button[data-a="wetterwahl"]'); time.sleep(0.4); s.shot(f'menu_blatt_{mode}', 'wetter')
        s.tap('button[data-a="wetter"][data-v="regen"]'); time.sleep(0.6)
        expect(s.ev("__game.wetter") == 'regen', f'{mode}: Wahl Regen wirkt sofort')
        expect(s.ev("__game.store.settings.wetter") == 'regen', f'{mode}: gespeichert')
        st = s.ctx.storage_state(); s.close()
        s = Session(pw, srv.base, device=dict(PIXEL7_LAND, viewport=vp), storage=st)
        s.open('?nosw&seed=25&d=2&g=1&thema=land&q=1&startprobe=0')
        expect(s.ev("__game.wetter") == 'regen', f'{mode}: nach Neuladen Regen (beim Start angewandt)')
        expect(s.ev("__game.wetterLook && __game.wetterLook.wet") > 0, f'{mode}: nasse Fahrbahn aktiv')
        s.close()
        s = Session(pw, srv.base, device=dict(PIXEL7_LAND, viewport=vp), storage=st)
        s.open('?nosw&seed=25&d=2&g=1&thema=land&q=1&startprobe=0&wetter=schnee')
        expect(s.ev("__game.wetter") == 'schnee', f'{mode}: URL ?wetter=schnee hat Vorrang')
        expect(not s.errors, f'{mode}: 0 Fehler {s.errors[:3]}')
        s.close()
print('ERGEBNIS', 'OK' if ok else 'FEHLER')
