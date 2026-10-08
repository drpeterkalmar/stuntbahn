# n30 E2: Qualitäts-Autopilot im echten Browser – künstliche Last rauf und runter (Test-Haken window.__app.testLast = ms
# Arbeit je Bild), Rennen mit Autopilot-Fahrer, Grafik „Automatisch“ (kein ?q). Geprüft:
#   1. ohne Last: in den ersten 10 s kein Schritt nach unten (kein Ruckeln/Umschalten am Start)
#   2. schwere Last: erster Schritt nach unten in ≤ 3 s
#   3. Last weg: erster Schritt nach oben in ≤ 3 s (gerechnet ab dem ersten flüssigen Bild), danach wieder volle Qualität
#   4. Last an der Kante: kein Pendeln (≤ 3 Richtungswechsel in 40 s)
#   5. 0 Fehler
# Browser per `open` (tests/util.py offen=True), sonst drosselt macOS die Zeitgeber einer Hintergrund-Queue auf ~15 Bilder/s.
# Aufruf: python3 tests/test_autopilot.py
import os, sys, time, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from util import Server, Session, PIXEL7_LAND
from playwright.sync_api import sync_playwright

fails = []
def check(c, m):
    print(('OK   ' if c else 'FEHLER ') + m, flush=True)
    if not c: fails.append(m)

Q = '?nosw&startprobe=0&seed=4711&d=3&g=1&blur=off' + (sys.argv[1] if len(sys.argv) > 1 else '')   # n31: z. B. "&taa=1" (TAAU als Stufe)
TAA = "(() => { const t = __game.kino && __game.kino.describe().taa; return t ? t.modus : null; })()"
ZUSTAND = "(() => { const i = __game.info(); return { t: performance.now() / 1000, ap: i.ap, log: i.apLog, tier: i.tier }; })()"

def warte_log(s, bed, max_s):
    # wartet, bis ein neuer Log-Eintrag die Bedingung erfüllt; liefert (Eintrag, Wartezeit in s) oder (None, max_s)
    t0 = s.ev("performance.now() / 1000")
    n0 = s.ev("__game.info().ap.aenderungen")
    while True:
        z = s.ev(ZUSTAND)
        if z['ap']['aenderungen'] > n0:
            neu = z['log'][-(z['ap']['aenderungen'] - n0):]
            for e in neu:
                if bed(e): return e, z['t'] - t0
            n0 = z['ap']['aenderungen']
        if z['t'] - t0 > max_s: return None, max_s
        time.sleep(0.1)

with Server() as srv, sync_playwright() as pw:
    s = Session(pw, srv.base, device=PIXEL7_LAND, offen=True)
    try:
        s.open(Q)
        s.ev("__game.setAssist('easy'); __game.store.settings.fahrstil = 'sauber'")
        s.ev("__game.start({ autopilot: true })"); s.ev("__game.cam('chase')")
        z0 = s.ev(ZUSTAND)
        print('Start', json.dumps(z0['ap'], ensure_ascii=False), 'GPU-Zeit:', s.ev("__game.info().gpuZeit"))
        # 1. ohne Last 10 s
        time.sleep(10)
        z = s.ev(ZUSTAND)
        runter = [e for e in (z['log'] or []) if e['richtung'] < 0]
        check(not runter, f'ohne Last 10 s: kein Schritt nach unten (Log {runter[:3]}), Bildrate {z["ap"]["fps"]}, Stufe {z["tier"]}')
        # 2. schwere Last (45 ms je Bild ≈ 20 Bilder/s)
        s.ev("window.__app.testLast = 45")
        e, dt = warte_log(s, lambda e: e['richtung'] < 0, 8)
        check(e is not None and dt <= 3.0, f'schwere Last: erster Schritt nach unten nach {dt:.2f} s ({e})')
        time.sleep(20)
        z = s.ev(ZUSTAND)
        print('  nach 20 s Last:', json.dumps(z['ap']['stufen']), 'Skala', z['ap']['skala'], 'Engpass', z['ap']['engpass'], 'Stufe', z['tier'], 'TAA', s.ev(TAA))
        # 3. Last weg
        s.ev("window.__app.testLast = 0")
        e, dt = warte_log(s, lambda e: e['richtung'] > 0, 8)
        check(e is not None and dt <= 3.0, f'Last weg: erster Schritt nach oben nach {dt:.2f} s ({e})')
        t0 = time.time()
        while time.time() - t0 < 90:
            z = s.ev(ZUSTAND)
            st = z['ap']['stufen']
            if z['tier'] == 2 and all(v >= 1 for k, v in st.items() if k != 'stufe') and z['ap']['skala'] >= z['ap']['bereich'][1] - 1e-6: break
            time.sleep(0.5)
        check(z['tier'] == 2 and all(v >= 1 for k, v in st.items() if k != 'stufe'), f'wieder volle Qualität nach {time.time() - t0:.1f} s: Stufe {z["tier"]}, {st}, Skala {z["ap"]["skala"]}, TAA {s.ev(TAA)}')
        # 4. Kante: Last so, dass das Bild knapp an 60 Bildern/s liegt
        s.ev("window.__app.testLast = 11")
        time.sleep(5)
        n0 = s.ev("__game.info().ap.aenderungen")
        time.sleep(40)
        z = s.ev(ZUSTAND)
        n = z['ap']['aenderungen'] - n0
        log = (z['log'] or [])[-n:] if n else []
        richt = [e['richtung'] for e in log]
        wechsel = sum(1 for a, b in zip(richt, richt[1:]) if a != b)
        check(wechsel <= 3, f'Kante (11 ms Last), 40 s: {n} Änderungen, {wechsel} Richtungswechsel: {[(e["was"], e["richtung"]) for e in log]}')
        s.ev("window.__app.testLast = 0")
        check(not s.errors, f'0 Fehler ({s.errors[:3]})')
    finally:
        s.close()
print('ALLE OK' if not fails else f'{len(fails)} FEHLER')
sys.exit(1 if fails else 0)
