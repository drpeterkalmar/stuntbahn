# Ideallinie Aus/Dezent/Kräftig im Browser (Pixel 7 quer + Desktop): Einstellung (Standard Dezent, gespeichert),
# HUD-Knopf + Taste L schalten zwischen Aus und der gewählten Stufe, Original ausgegraut/ohne Knopf,
# Replay + Menü ohne Band. Fotos an derselben Stelle je Stufe (tests/shots/lineviz/).
import sys, time
sys.path.insert(0, 'tests')
from util import *

fails = []
def check(ok, msg):
    print(('OK   ' if ok else 'FAIL ') + msg, flush=True)
    if not ok: fails.append(msg)

VIS = "__game.scene.getObjectByName('ideal-line').visible"

def same_spot(s):
    # Rennen (Autopilot), dann anhalten: Standbild auf gerader Strecke vor einer Kurve
    s.ev("__game.start({ autopilot: true })")
    s.frames(8)
    s.ev("__game.sim(7)")
    s.ev("__game.freeze(true)")
    s.frames(20); time.sleep(0.3)

def shots(s, tag):
    for lv in ['off', 'soft', 'strong']:
        s.ev(f"__game.setLine('{lv}')")
        s.frames(4); time.sleep(0.15)
        check(s.ev(VIS) == (lv != 'off'), f'{tag}: Stufe {lv} → Band sichtbar {s.ev(VIS)}')
        s.shot(f'{tag}_{lv}', 'lineviz')

with Server() as srv, sync_playwright() as pw:
    errs = []
    # ---- Handy quer ----
    s = Session(pw, srv.base)
    s.open('?nosw&seed=1000&d=1')
    check(s.ev("__game.store.settings.line") == 'soft', 'Standard: Dezent')
    check(s.ev(VIS) is False, 'Menü-Kamerafahrt: kein Band')
    s.ev("__game.setAssist('medium')")
    s.tap('button[data-a=settings]')
    check(s.ev("!!document.querySelector('#sheet [data-g=line] [data-v=soft].on')"), 'Optionen: Dezent markiert')
    s.tap('#sheet [data-g=line] [data-v=strong]')
    check(s.ev("__game.store.settings.line") == 'strong' and s.ev("__game.store.settings.lineLast") == 'strong', 'Optionen: Kräftig gewählt + gespeichert')
    s.shot('opt_quer', 'lineviz')
    s.tap('#sheet [data-a=close]')
    same_spot(s)
    check(s.ev("getComputedStyle(document.querySelector('#hud [data-a=linetoggle]')).display") != 'none', 'HUD-Knopf sichtbar (Mittel)')
    s.tap('#hud [data-a=linetoggle]'); s.frames(2)
    check(s.ev("__game.store.settings.line") == 'off' and s.ev(VIS) is False and s.ev("document.querySelector('#hud [data-a=linetoggle]').classList.contains('off')"), 'HUD-Knopf: Kräftig → Aus')
    s.tap('#hud [data-a=linetoggle]'); s.frames(2)
    check(s.ev("__game.store.settings.line") == 'strong' and s.ev(VIS) is True, 'HUD-Knopf: Aus → wieder Kräftig (gewählte Stufe)')
    # Knopf verdeckt keine Touch-Zone: liegt oberhalb der Lenk-Hälften/Pads
    ov = s.ev("""() => { const b = document.querySelector('#hud [data-a=linetoggle]').getBoundingClientRect();
      return [...document.querySelectorAll('#touch .half, #touch .tb')].filter(e => getComputedStyle(e).display !== 'none' && e.offsetParent !== null)
        .map(e => e.getBoundingClientRect()).filter(r => r.width && !(r.bottom <= b.top || r.top >= b.bottom || r.right <= b.left || r.left >= b.right)).length; }""")
    check(ov == 0, f'HUD-Knopf überlappt keine Touch-Zone ({ov})')
    small = s.small_buttons()
    check(not small, f'HUD: alle Knöpfe ≥ 48 px {small}')
    shots(s, 'quer_mittel')
    # Leicht (Bildschirmhälften) mit Dezent
    s.ev("__game.setAssist('easy')"); s.ev("__game.setLine('soft')"); s.frames(4); time.sleep(0.2)
    check(s.ev(VIS) is True, 'Leicht + Dezent: Band sichtbar')
    s.shot('quer_leicht_dezent_hud', 'lineviz')
    # Pause: Auswahl vorhanden
    s.ev("__game.freeze(false)"); s.tap('#hud [data-a=pause]')
    check(s.ev("!!document.querySelector('#pause [data-g=line] [data-v=soft].on')"), 'Pause: Ideallinie-Auswahl (Dezent markiert)')
    s.shot('pause_quer', 'lineviz')
    s.tap('#pause [data-g=line] [data-v=off]')
    check(s.ev("__game.store.settings.line") == 'off' and s.ev("__game.store.settings.lineLast") == 'soft', 'Pause: Aus gewählt, letzte Stufe Dezent gemerkt')
    small = s.small_buttons()
    check(not small, f'Pause: alle Knöpfe ≥ 48 px und im Bild {small}')
    s.tap('#pause [data-a=resume]')
    # Original: kein Knopf, Band aus, Auswahl ausgegraut
    s.ev("__game.setLine('soft')"); s.ev("__game.setAssist('original')"); s.frames(3)
    check(s.ev(VIS) is False and s.ev("getComputedStyle(document.querySelector('#hud [data-a=linetoggle]')).display") == 'none', 'Original: kein Band, kein HUD-Knopf')
    s.tap('#hud [data-a=pause]')
    check(s.ev("document.querySelectorAll('#pause [data-g=line] button:disabled').length") == 3, 'Original: Auswahl in der Pause ausgegraut')
    s.tap('#pause [data-a=menu]')
    s.tap('button[data-a=settings]')
    hint = s.ev("document.querySelector('#sheet [data-g=line]').nextElementSibling.textContent")
    check(s.ev("document.querySelectorAll('#sheet [data-g=line] button:disabled').length") == 3 and 'Original' in hint, f'Original: Optionen ausgegraut mit Hinweis ({hint[:60]!r})')
    s.shot('opt_quer_original', 'lineviz')
    s.tap('#sheet [data-a=close]')
    # Replay: kein Band
    s.ev("__game.setAssist('medium')")
    s.ev("__game.start({ autopilot: true })")
    for k in range(60):
        st = s.ev("__game.sim(3)")
        if st['state'] == 'finished': break
    s.frames(3); time.sleep(0.5)
    s.tap('#result [data-a=replay]'); s.frames(5)
    check(s.ev("__game.mode") == 'replay' and s.ev(VIS) is False, 'Replay: kein Band')
    s.tap('#replayui [data-a=rend]')
    storage = s.ctx.storage_state()
    errs += s.errors
    s.close()

    # ---- Desktop: Taste L, gespeicherte Stufe nach Neuladen, gleiche Fotos ----
    s = Session(pw, srv.base, device=DESKTOP, storage=storage)
    s.open('?nosw&seed=1000&d=1')
    check(s.ev("__game.store.settings.line") == 'soft', f"nach Neuladen: gespeicherte Stufe {s.ev('__game.store.settings.line')!r}")
    s.ev("__game.setAssist('medium')")
    same_spot(s)
    s.pg.keyboard.press('KeyL'); s.frames(3)
    check(s.ev("__game.store.settings.line") == 'off' and s.ev(VIS) is False, 'Taste L: Dezent → Aus')
    s.pg.keyboard.press('KeyL'); s.frames(3)
    check(s.ev("__game.store.settings.line") == 'soft' and s.ev(VIS) is True, 'Taste L: Aus → Dezent')
    shots(s, 'desk_mittel')
    # Streckenkamera (weit weg): Ausblenden richtet sich nach dem Auto, nicht nach der Kamera
    s.ev("__game.freeze(false)"); s.ev("__game.sim(8)"); s.ev("__game.freeze(true)"); s.ev("__game.cam('track')"); s.frames(25); time.sleep(0.2)
    shots(s, 'desk_strecke')
    errs += s.errors
    s.close()

    check(not errs, f'0 Fehler (pageerror/console/request): {errs[:5]}')
print('FEHLSCHLÄGE', len(fails) if fails else 0)
sys.exit(1 if fails else 0)
