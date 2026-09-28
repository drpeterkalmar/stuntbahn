# Extras im Browser (Hüpfer 🦘 + Nitro 🔥): Knöpfe quer/hoch/Desktop (Lage, Größe, Abstand zu Gas/Bremse/Lenken,
# keine Überlappung), Auslösen per Touch/Tastatur, ausgegraut wenn verbraucht/gesperrt, Aufleuchten beim
# Auffüllen, Leicht-Hälften lenken beim Antippen nicht, Cockpit, Replay-Flammen, Option aus, 0 Fehler.
# Aufruf: python3 tests/test_extras_ui.py  → Fotos nach tests/shots/extras/
import sys, time, json
sys.path.insert(0, 'tests')
from util import *
from hochformat_util import DEVICES, set_safe, layout_check

fails = []
def check(ok, msg):
    print(('OK  ' if ok else 'FAIL') + ' ' + msg, flush=True)
    if not ok: fails.append(msg)

SEED = '?nosw&seed=4711&d=2'
GEOM = """(() => { const R = (q) => { const e = document.querySelector(q); if (!e) return null; const r = e.getBoundingClientRect();
  const st = getComputedStyle(e); return r.width && st.display !== 'none' ? { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height, cls: e.className, op: +st.opacity } : null; };
  return { hop: R('#hud .xb.hop'), nitro: R('#hud .xb.nitro'), gas: R('#touch.show .tb.gas'), brake: R('#touch.show .tb.brake'),
    left: R('#touch.show .pad.left'), L: R('#touch.show .pad.left .tb'), W: innerWidth, H: innerHeight }; })()"""

def gap(a, b):
    # kleinster Abstand zweier Rechtecke (0 = berühren/überlappen)
    dx = max(b['l'] - a['r'], a['l'] - b['r'], 0); dy = max(b['t'] - a['b'], a['t'] - b['b'], 0)
    return (dx * dx + dy * dy) ** 0.5

def start(s, assist, cam='chase'):
    s.ev(f"__game.setAssist('{assist}'); __game.store.settings.cam = '{cam}'; __game.store.settings.extras = true; __game.store.settings.autoExtras = false")
    s.ev("__game.start()")
    s.ev(f"__game.cam('{cam}')")
    s.ev("__game.sim(4.2)")
    s.frames(4)

def tap_xb(s, which):
    box = s.pg.locator(f'#hud .xb.{which}').bounding_box()
    s.pg.touchscreen.tap(box['x'] + box['width'] / 2, box['y'] + box['height'] / 2)
    time.sleep(0.15)

with Server() as srv, sync_playwright() as pw:
    # ---------- Handy quer + hoch: Lage, Bedienung, Fotos ----------
    for prof in ['pixel7q', 'pixel7', 'kleinq', 'klein']:
        D = DEVICES[prof]
        s = Session(pw, srv.base, device=D['ctx'])
        s.open(SEED)
        set_safe(s, D['safe'])
        start(s, 'medium')
        g = s.ev(GEOM)
        ok = g['hop'] and g['nitro'] and g['gas']
        check(bool(ok), f'{prof}: Knöpfe 🦘 🔥 sichtbar neben den Tasten')
        if ok:
            check(min(g['hop']['w'], g['hop']['h'], g['nitro']['w'], g['nitro']['h']) >= 48, f"{prof}: Knöpfe ≥ 48 px ({round(g['hop']['w'])} px)")
            dg = min(gap(g['nitro'], g['gas']), gap(g['nitro'], g['brake'])); dl = gap(g['hop'], g['left'])
            check(dg >= 16 and dl >= 16, f'{prof}: Abstand Nitro↔Gas/Bremse {round(dg)} px, Hüpfer↔Lenktasten {round(dl)} px (≥ 16, nicht versehentlich)')
            check(g['hop']['l'] < g['W'] / 2 and g['nitro']['r'] > g['W'] / 2, f'{prof}: Hüpfer links (linker Daumen), Nitro rechts (rechter Daumen)')
        L = layout_check(s)
        check(not L['overlap'] and not L['out'] and not L['small'], f"{prof}: HUD-Layout ohne Überlappung/abgeschnitten ({L['n']} Teile) {L['overlap'][:3]} {L['out'][:3]} {L['small'][:3]}")
        s.shot(f'{prof}_voll', 'extras')
        # Nitro per Touch
        tap_xb(s, 'nitro')
        s.ev("__game.sim(0.4)"); s.frames(3)
        st = s.state()
        check(st['x']['nitro'] == 'on' and st['charges']['nitro'] == 0 and s.ev("__game.carVis.flames.grp.visible"), f"{prof}: Touch 🔥 → Nitro brennt, Flammen sichtbar ({round(st['speed'] * 3.6)} km/h)")
        if prof in ('pixel7q', 'pixel7'):
            s.ev("__game.freeze(true)"); s.frames(4); time.sleep(0.2)
            s.shot(f'{prof}_nitro', 'extras')
            s.ev("__game.freeze(false)")
        s.ev("__game.sim(4.2)"); s.frames(4)
        cls = s.ev("document.querySelector('#hud .xb.nitro').className")
        check('empty' in cls, f'{prof}: Nitro verbraucht → ausgegraut ({cls})')
        # Hüpfer per Touch (auf der Geraden: vorher an eine sichere Stelle)
        s.ev("""(() => { const G = __game, r = G.race, L = G.env.track.line; for (let i = 20; i < L.n - 200; i += 10) { r.place(i, 20, true); r.ap.tr.reset(i); r.car.step(1/120, G.env.world);
          if (r.hopBlock(i) === null) return i; } return -1; })()""")
        s.ev("__game.sim(0.3)"); s.frames(2)
        tap_xb(s, 'hop')
        s.ev("__game.sim(0.5)"); s.frames(2)
        st = s.state()
        check(st['charges']['hop'] == 0 and st['used']['hop'] == 1, f"{prof}: Touch 🦘 → Hüpfer ausgelöst")
        s.ev("__game.sim(2.5)"); s.frames(4)
        cls = s.ev("document.querySelector('#hud .xb.hop').className")
        check('empty' in cls, f'{prof}: Hüpfer verbraucht → ausgegraut')
        L = layout_check(s)
        s.shot(f'{prof}_leer', 'extras')
        check(not s.errors, f'{prof}: 0 Fehler {s.errors[:3]}')
        s.close()

    # ---------- Leicht (Bildschirmhälften): Knopf antippen lenkt nicht ----------
    s = Session(pw, srv.base, device=DEVICES['pixel7q']['ctx'])
    s.open(SEED)
    start(s, 'easy')
    box = s.pg.locator('#hud .xb.nitro').bounding_box()
    s.pg.dispatch_event('#hud .xb.nitro', 'pointerdown', {'pointerId': 7, 'clientX': box['x'] + 30, 'clientY': box['y'] + 30, 'isPrimary': True, 'pointerType': 'touch'})
    time.sleep(0.1)
    ts = s.ev("window.__touchState || {steer:0}")
    s.ev("__game.sim(0.3)")
    st = s.state()
    check(st['x']['nitro'] == 'on' and abs(ts.get('steer', 0)) == 0, f"Leicht: 🔥 über der rechten Hälfte zündet, ohne zu lenken (steer {ts.get('steer', 0)})")
    hit = s.ev(f"document.elementFromPoint({box['x'] + 30}, {box['y'] + 30}).closest('.xb') !== null")
    check(hit, 'Leicht: Knopf liegt über der Lenk-Hälfte (bekommt den Finger)')
    # Auffüllen an Start/Ziel: Aufleuchten
    s.ev("__game.hop()"); s.ev("__game.sim(3)")
    s.ev("""(() => { const r = __game.race, L = __game.env.track.line; r.cpNext = 0; r.place(L.n - 60, 25, true); })()""")
    t0 = time.time(); glow = False
    while time.time() - t0 < 20 and not glow:
        s.ev("__game.sim(0.1)"); s.frames(1)
        glow = s.ev("document.querySelector('#hud .xb.nitro').classList.contains('glow')")
    st = s.state()
    check(glow and st['charges'] == {'hop': 1, 'nitro': 1}, f"Start/Ziel überfahren → beide wieder voll, Knöpfe leuchten auf ({st['charges']})")
    s.shot('pixel7q_aufgefuellt', 'extras')
    check(not s.errors, f'Leicht: 0 Fehler {s.errors[:3]}')
    s.close()

    # ---------- Cockpit quer + hoch: Knöpfe sichtbar, Instrumente frei ----------
    for prof in ['pixel7q', 'pixel7']:
        D = DEVICES[prof]
        s = Session(pw, srv.base, device=D['ctx'])
        s.open(SEED)
        set_safe(s, D['safe'])
        start(s, 'medium', 'cockpit')
        s.ev("__game.nitro()"); s.ev("__game.sim(0.5)"); s.frames(6); time.sleep(0.3)
        L = layout_check(s, ['cockpit'])
        g = s.ev(GEOM)
        check(g['hop'] and g['nitro'] and not L['overlap'] and not L['out'], f"Cockpit {prof}: Knöpfe sichtbar, Instrumente frei {L['overlap'][:3]} {L['out'][:3]}")
        s.shot(f'{prof}_cockpit_nitro', 'extras')
        s.close()

    # ---------- Desktop: Tastatur, Hinweise, Replay-Flammen, Option aus ----------
    s = Session(pw, srv.base, device=DESKTOP)
    s.open(SEED)
    start(s, 'medium')
    g = s.ev(GEOM)
    kbd = s.ev("getComputedStyle(document.querySelector('#hud .xb kbd')).display")
    check(g['hop'] and g['nitro'] and g['nitro']['r'] > g['W'] - 100 and g['hop']['b'] > g['H'] - 100 and kbd != 'none', f"Desktop: Knöpfe unten rechts mit Tasten-Hinweis ({kbd})")
    s.pg.keyboard.down('ArrowUp')
    s.pg.keyboard.press('Shift'); time.sleep(0.3)
    st = s.state()
    check(st['x']['nitro'] == 'on', 'Desktop: Shift → Nitro')
    time.sleep(0.8)
    s.shot('desktop_nitro', 'extras')
    s.pg.keyboard.press('Space'); time.sleep(0.4)
    st = s.state()
    s.pg.keyboard.up('ArrowUp')
    check(st['used']['hop'] == 1 or st['x']['hop'] in ('lock', 'air', 'roof', 'tilt'), f"Desktop: Leertaste → Hüpfer ({st['used']}, {st['x']['hop']})")
    s.ev("__game.sim(3)")
    s.ev("__game.sim(200)")   # ins Ziel
    st = s.state()
    check(st['state'] == 'finished', f"Rennen im Ziel ({st['state']})")
    rm = s.ev("document.querySelector('#result .rmeta').textContent")
    check('Extras' in rm, f'Ergebnis nennt die Extras: „{rm}“')
    s.ev("__game.replay()"); s.frames(3)
    f0 = s.ev("__game.replayObj.nitros[0] ? __game.replayObj.nitros[0].t0 : -1")
    s.ev(f"__game.replayObj.t = {f0} + 1.0; __game.replayObj.paused = true"); s.frames(5); time.sleep(0.3)
    check(f0 >= 0 and s.ev("__game.carVis.flames.grp.visible"), f'Replay: Flammen beim Nitro sichtbar (t = {round(f0 + 1, 2)} s)')
    s.shot('desktop_replay_nitro', 'extras')
    s.ev(f"__game.replayObj.t = {f0} + 6; __game.replayObj.paused = true"); s.frames(5)
    check(not s.ev("__game.carVis.flames.grp.visible"), 'Replay: danach keine Flammen')
    # Option aus → Knöpfe weg, eigene Bestzeit-Liste
    s.ev("__game.toMenu(); __game.store.settings.extras = false; __game.start()"); s.ev("__game.sim(4)"); s.frames(3)
    g = s.ev(GEOM)
    check(not g['hop'] and not g['nitro'], 'Option „Hüpfer & Nitro“ aus: keine Knöpfe')
    s.pg.keyboard.press('Space'); s.pg.keyboard.press('KeyN'); time.sleep(0.3)
    st = s.state()
    check(st['used'] == {'hop': 0, 'nitro': 0} and not st['extras'], 'Option aus: Tasten wirkungslos')
    k = s.ev("[__game.modeKey('medium', false), __game.modeKey('medium', false, undefined, undefined, false)]")
    check(k[0].endswith('@x') and not k[1].endswith('@x'), f'Bestzeiten getrennt: mit Extras „{k[0]}“, ohne „{k[1]}“')
    check(not s.errors, f'Desktop: 0 Fehler {s.errors[:3]}')
    s.close()

print(f"{len(fails)} Fehlschläge" if fails else 'Extras-UI: alle Prüfungen grün')
sys.exit(1 if fails else 0)
