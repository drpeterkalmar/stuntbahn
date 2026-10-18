# n39 Minikarte im Browser: sichtbar im Rennen (auch Countdown), weg in Menü/Pause/Zielshow/Ergebnis/Replay/Kino-Replay,
# Tippen = groß/klein (Touch), Taste M (Desktop), Optionen 3D/2D/Aus + Norden oben, URL ?karte=2d|0 und ?kartenord=1,
# setMarkers (Gegner, n34), 0 Fehler. Aufruf: python3 tests/test_minikarte_ui.py
import sys, os, time, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from util import Server, Session, PIXEL7_LAND, DESKTOP
from playwright.sync_api import sync_playwright

ok_all = True
def check(ok, msg):
    global ok_all
    print(('OK  ' if ok else 'FAIL') + ' ' + msg, flush=True)
    if not ok: ok_all = False

K = "(() => { const k = __game.minikarte, e = document.getElementById('karte'); return { an: k.sichtbar, dom: e.classList.contains('on'), art: k.art, nord: k.nord, gross: k.gross, bilder: k.stats.bilder, kopien: k.stats.kopien, w: __game.ui.karte.w }; })()"
def karte(s):
    s.frames(4); return s.ev(K)

with Server() as srv, sync_playwright() as pw:
    # ---------- Touch quer: Sichtbarkeit über den Ablauf ----------
    s = Session(pw, srv.base, device=PIXEL7_LAND, kino=True)
    s.open('?nosw&seed=4711&d=2&q=1&startprobe=0')
    k = karte(s); check(not k['an'] and not k['dom'], f"Menü: keine Karte {k}")
    s.ev("__game.setAssist('medium')")
    s.ev("__game.start({ autopilot: true })")
    k = karte(s); check(k['an'] and k['dom'] and k['art'] == '3d' and not k['nord'], f"Rennen (Countdown): Karte 3D, mitdrehend {k}")
    s.ev("__game.sim(4)"); k0 = karte(s)['bilder']; time.sleep(1.0); k1 = karte(s)
    check(k1['bilder'] - k0 >= 12 and k1['bilder'] - k0 <= 40, f"Karte zeichnet mit ~20 Hz neu ({k1['bilder'] - k0} Bilder in ~1 s), Kopie jedes Bild ({k1['kopien']})")
    # Tippen = groß/klein
    w0 = k1['w']; s.tap('#karte'); k = karte(s)
    check(k['gross'] and k['w'] > w0 * 2, f"Tippen: groß ({w0} → {k['w']} px)")
    s.tap('#karte'); k = karte(s); check(not k['gross'] and k['w'] == w0, f"nochmal Tippen: klein ({k['w']} px)")
    # Pause
    s.ev("__game.ui.a.pause()"); k = karte(s); check(not k['an'] and not k['dom'], f"Pause: keine Karte {k}")
    s.ev("__game.ui.a.pause()"); k = karte(s); check(k['an'], "weiter: Karte wieder da")
    # Gegner-Schnittstelle (n34)
    s.ev("(() => { const L = __game.env.track.line; __game.minikarte.setMarkers([{ pos: [L.px[300], L.py[300], L.pz[300]], farbe: '#ff3040' }, { pos: { x: L.px[900], y: L.py[900], z: L.pz[900] }, farbe: 0x40ff60 }]); })()")
    time.sleep(0.3); n = s.ev("__game.minikarte.punkte.geometry.drawRange.count")
    check(n >= 6, f"setMarkers: 2 Gegner als Punkte (Punkte gesamt {n})")
    s.ev("__game.minikarte.setMarkers([])")
    # Ziel → Zielshow → Kino-Replay → Ergebnis
    for i in range(150):
        st = s.ev("__game.sim(2.0)")
        if st['state'] == 'finished': break
    k = karte(s); check(not k['an'], f"Zielshow/Ziel: keine Karte {k}")
    t0 = time.time(); film = False
    while time.time() - t0 < 40:
        if s.ev("!!__game.cine"): film = True; break
        time.sleep(0.3)
    if film:
        k = karte(s); check(not k['an'] and not k['dom'], f"Kino-Replay (Fan-Cam/Highlights): keine Karte {k}")
        s.ev("__game.skipCine()")
    k = karte(s); check(not k['an'], f"Ergebnis: keine Karte {k}")
    s.ev("__game.replay()"); k = karte(s); check(not k['an'] and not k['dom'], f"Replay: keine Karte {k}")
    check(not s.errors, f"0 Fehler ({s.errors[:3]})")
    s.close()

    # ---------- Optionen: 2D, Norden oben, Aus ----------
    s = Session(pw, srv.base, device=PIXEL7_LAND)
    s.open('?nosw&seed=4711&d=2&q=1&startprobe=0')
    s.tap('[data-a=settings]')
    seg = s.ev("[...document.querySelectorAll('[data-a=karte]')].map((b) => b.textContent)")
    check(seg == ['3D', '2D', 'Aus'] and 'Standard: 3D' in s.ev("document.querySelector('#sheet').textContent"), f"Optionen: Minikarte 3D (Standard) / 2D / Aus {seg}")
    s.tap('[data-a=karte][data-v="2d"]'); s.tap('[data-a=toggle][data-v=karteNord]')
    check(s.ev("__game.store.settings.karte === '2d' && __game.store.settings.karteNord === true"), "Optionen gespeichert (2D, Norden oben)")
    s.ev("__game.ui.showMenu(__game.env)")
    s.ev("__game.setAssist('easy'); __game.start({ autopilot: true }); __game.sim(3)")
    k = karte(s); check(k['an'] and k['art'] == '2d' and k['nord'], f"Rennen: 2D, Norden oben {k}")
    s.shot('ui_2d_nord', 'n39')
    s.ev("__game.store.settings.karte = 'aus'")
    k = karte(s); check(not k['an'] and not k['dom'], f"Aus: keine Karte {k}")
    calls = s.ev("__game.info().calls")
    s.ev("__game.store.settings.karte = '3d'; __game.store.settings.karteNord = false; __game.store.save()")
    check(not s.errors, f"0 Fehler ({s.errors[:3]})")
    s.close()

    # ---------- URL ----------
    for q, soll in [('&karte=2d', ('2d', False)), ('&karte=0', ('aus', False)), ('&kartenord=1', ('3d', True))]:
        s = Session(pw, srv.base, device=PIXEL7_LAND)
        s.open('?nosw&seed=4711&d=2&q=1&startprobe=0' + q)
        s.ev("__game.setAssist('easy'); __game.start({ autopilot: true }); __game.sim(2)")
        k = karte(s)
        check(k['art'] == soll[0] and k['nord'] == soll[1] and k['an'] == (soll[0] != 'aus'), f"URL {q}: {k['art']}, Norden {k['nord']}, sichtbar {k['an']}")
        check(not s.errors, f"0 Fehler ({s.errors[:3]})")
        s.close()

    # ---------- Desktop: Taste M ----------
    s = Session(pw, srv.base, device=DESKTOP)
    s.open('?nosw&seed=4711&d=2&q=1&startprobe=0')
    s.ev("__game.setAssist('easy'); __game.start({ autopilot: true }); __game.sim(2)")
    k = karte(s); w0 = k['w']
    s.pg.keyboard.press('KeyM'); k = karte(s)
    check(k['gross'] and k['w'] > w0, f"Desktop: Taste M = groß ({w0} → {k['w']} px), klein = {w0} px (25 % von 720 = 180)")
    s.pg.keyboard.press('KeyM'); k = karte(s); check(not k['gross'], "Taste M = wieder klein")
    s.shot('ui_desktop', 'n39')
    check(not s.errors, f"0 Fehler ({s.errors[:3]})")
    s.close()

print('ALLES OK' if ok_all else 'FEHLER')
sys.exit(0 if ok_all else 1)
