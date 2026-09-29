# Phase 4b im Browser: Touch-Steuerung (Hälften bei Leicht, Tasten bei Mittel/Original), Knopfgrößen, Umschalten.
# Quer (Pixel 7 915×412) und hochkant (412×915, seit dem Hochformat-Umbau); Aufruf ohne Argument = beide.
import sys, time, json
sys.path.insert(0, 'tests')
from util import *
from hochformat_util import layout_check

# n15: Bounding-Boxen der Touch-Tasten (Trefferfläche = Element, sichtbar = 6 px kleiner), Auto im Bild (Box des
# Modells projiziert), Tempo, Extras, HUD oben, Cockpit-Instrumente
BB = r"""async () => {
  const THREE = await import('./lib/three.module.min.js');
  const G = window.__game, cam = G.camera, car = G.carVis.root;
  const R = (e) => { const r = e.getBoundingClientRect(); return [r.left, r.top, r.right, r.bottom]; };
  const vis = (e) => e && e.offsetParent !== null && getComputedStyle(e).display !== 'none' && e.getBoundingClientRect().width > 0;
  const tb = [...document.querySelectorAll('#touch.show .tb')].filter(vis).map((e) => ({ t: e.dataset.t, hit: R(e), vis: R(e).map((v, i) => v + (i < 2 ? 6 : -6)) }));
  // Auto im Bild: Ecken der Modell-Box projiziert (nur Verfolger)
  let carR = null;
  if (G.rig.view === 'chase' && car.visible) {
    const box = new THREE.Box3().setFromObject(car), W = innerWidth, H = innerHeight, xs = [], ys = [];
    for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) {
      const p = new THREE.Vector3(x, y, z).project(cam); xs.push((p.x + 1) / 2 * W); ys.push((1 - p.y) / 2 * H); }
    carR = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
  }
  const one = (q) => { const e = document.querySelector(q); return vis(e) ? R(e) : null; };
  const px = G.rig.view === 'cockpit' && G.cockpit.readout().px;
  return { tb, carR, speed: one('#hud.show .speed'), xb: [...document.querySelectorAll('#hud.show .xb')].filter(vis).map(R), tl: one('#hud.show .tl'), tr: one('#hud.show .tr'),
    gauges: px && px.gd ? px.xs.map((x) => [x - px.gd / 2, px.yc - px.gd / 2, x + px.gd / 2, px.yc + px.gd / 2]) : [], mode: px && px.mode, W: innerWidth, H: innerHeight };
}"""
def inter(a, b): return a and b and min(a[2], b[2]) - max(a[0], b[0]) > 1 and min(a[3], b[3]) - max(a[1], b[1]) > 1
def sz(r): return (round(r[2] - r[0]), round(r[3] - r[1]))
def bb_check(s, orient, tag, want=None):
    b = s.ev(BB)
    T = {t['t']: t for t in b['tb']}
    print(tag, 'sichtbar', {k: sz(v['vis']) for k, v in T.items()}, 'Auto', b['carR'] and [round(v) for v in b['carR']], 'Instrumente', b['mode'], flush=True)
    if want:
        for k, (w, h) in want.items():
            if k in T: expect(abs(sz(T[k]['vis'])[0] - w) <= 2 and abs(sz(T[k]['vis'])[1] - h) <= 2, f'{orient} {tag}: Taste {k} sichtbar {sz(T[k]["vis"])} ≈ {w}×{h}')
    expect(all(sz(t['hit'])[0] - sz(t['vis'])[0] == 12 for t in b['tb']), f'{orient} {tag}: Trefferfläche je Seite 6 px größer als sichtbar')
    gaps = [max(u['vis'][0] - t['vis'][2], t['vis'][0] - u['vis'][2]) for i, t in enumerate(b['tb']) for u in b['tb'][i + 1:]]
    expect(gaps and min(gaps) >= 11.5, f'{orient} {tag}: Abstand zwischen Tasten ≥ 12 px ({min(gaps) if gaps else None})')
    others = [('Auto', b['carR']), ('Tempo', b['speed']), ('HUD oben links', b['tl']), ('HUD oben rechts', b['tr'])] + [('Extra', x) for x in b['xb']] + [('Instrument', g) for g in b['gauges']]
    hits = [f"{t['t']}⟷{n}" for t in b['tb'] for n, r in others if inter(t['hit'], r)]
    expect(not hits, f'{orient} {tag}: Tasten überdecken weder Auto, Tempo, Extras, HUD noch Instrumente {hits}')
    if b['carR']: expect(b['carR'][3] < min(t['hit'][1] for t in b['tb']) or not any(inter(t['hit'], b['carR']) for t in b['tb']), f'{orient} {tag}: Auto frei')
    return b

ok = True
def expect(cond, msg):
    global ok
    print(('OK   ' if cond else 'FAIL ') + msg, flush=True)
    ok = ok and bool(cond)

orients = sys.argv[1:] or ['quer', 'hoch']
with Server() as srv, sync_playwright() as pw:
    for orient in orients:
        dev = PIXEL7_LAND if orient == 'quer' else dict(PIXEL7_LAND, viewport={"width": 412, "height": 915})
        print('==', orient, dev['viewport'])
        res = {}
        s = Session(pw, srv.base, device=dev)
        s.open('?nosw&seed=1000&d=1')
        # Leicht: Hälften
        s.ev("__game.setAssist('easy')")
        s.tap('button[data-a=start]')
        s.ev("__game.sim(3.3)")   # Countdown vorbei
        cls = s.ev("document.getElementById('touch').className")
        expect('halves' in cls, f'{orient}: Leicht → Bildschirmhälften ({cls})')
        # linke Hälfte halten: Lenkung des Spielers geht nach links (input.touch.steer = -1)
        s.pg.touchscreen.tap(100, 300)  # kurzer Tap (Kontrolle)
        t = s.ev("""(() => new Promise(res => { const T=document.querySelector('#touch .half.l'); const r=T.getBoundingClientRect();
            const ev=(type)=>new PointerEvent(type,{pointerId:7,pointerType:'touch',clientX:r.left+60,clientY:r.bottom-120,bubbles:true});
            T.dispatchEvent(ev('pointerdown')); setTimeout(()=>{ const st=window.__touchState.steer; T.dispatchEvent(ev('pointerup')); res(st); }, 300); }))()""")
        expect(t == -1, f'{orient}: linke Hälfte → links lenken ({t})')
        # Daumen unten rechts (echter Touch über Playwright)
        W, H = dev['viewport']['width'], dev['viewport']['height']
        s.pg.touchscreen.tap(W - 60, H - 60)
        s.shot(f't_easy_{orient}', 'touch')
        r = layout_check(s)
        expect(not r['overlap'] and not r['out'] and not r['small'], f'{orient}: HUD Leicht sauber {r}')
        # Mittel: Tasten
        s.ev("__game.setAssist('medium'); __game.start({})")
        s.ev("__game.sim(3.3)")
        cls2 = s.ev("document.getElementById('touch').className")
        expect('pads' in cls2, f'{orient}: Mittel → Tasten ({cls2})')
        sp0 = s.ev("__game.race.car.speed()")
        s.ev("""(() => { const G=document.querySelector('#touch .tb.gas'); const r=G.getBoundingClientRect();
            G.dispatchEvent(new PointerEvent('pointerdown',{pointerId:9,pointerType:'touch',clientX:r.left+20,clientY:r.top+20,bubbles:true})); })()""")
        s.frames(20)
        s.ev("__game.sim(1.5, window.__touchState)")
        sp1 = s.ev("__game.race.car.speed()")
        s.shot(f't_medium_gas_{orient}', 'touch')
        s.ev("""(() => { const G=document.querySelector('#touch .tb.gas'); G.dispatchEvent(new PointerEvent('pointerup',{pointerId:9,pointerType:'touch',bubbles:true})); })()""")
        expect(sp1 > sp0 + 3, f'{orient}: Gas-Taste beschleunigt ({sp0:.1f} → {sp1:.1f})')
        # Gas → Bremse wischen (ein Finger gleitet über die Tasten)
        g = s.ev("""(() => { const T=document.getElementById('touch'); const G=document.querySelector('#touch .tb.gas').getBoundingClientRect(), B=document.querySelector('#touch .tb.brake').getBoundingClientRect();
            const ev=(t,r)=>new PointerEvent(t,{pointerId:10,pointerType:'touch',clientX:r.left+r.width/2,clientY:r.top+r.height/2,bubbles:true});
            document.querySelector('#touch .tb.gas').dispatchEvent(ev('pointerdown',G)); const a={...window.__touchState};
            T.dispatchEvent(ev('pointermove',B)); const b={...window.__touchState}; T.dispatchEvent(ev('pointerup',B)); return [a.throttle,b.throttle,b.brake,window.__touchState.active]; })()""")
        expect(g == [1, 0, 1, False], f'{orient}: Gas → Bremse wischen, dann los ({g})')
        # Tasten links/rechts getrennt (nicht versehentlich die andere Seite)
        gap = s.ev("""(() => { const L=document.querySelector('#touch .pad.left').getBoundingClientRect(), R=document.querySelector('#touch .pad.right').getBoundingClientRect(); return R.left - L.right; })()""")
        expect(gap >= 24, f'{orient}: Abstand Lenk- zu Pedaltasten {gap:.0f} px')
        res['kleine_knoepfe_rennen'] = s.small_buttons()
        r = layout_check(s)
        expect(not r['overlap'] and not r['out'] and not r['small'], f'{orient}: HUD Mittel sauber {r}')
        # n15: größere Tasten (Standard „Groß“ = +30 %), Nachweis per Bounding-Box, dann Cockpit mit Tasten, Normal/Riesig
        s.ev("__game.sim(2)"); s.frames(8)
        if orient == 'quer': want = {'L': (112, 112), 'R': (112, 112), 'G': (135, 153), 'B': (120, 112)}
        else: want = {'L': (81, 104), 'R': (81, 104), 'B': (81, 104), 'G': (97, 125)}
        bb_check(s, orient, 'Groß Verfolger', want)
        s.shot(f't_gross_verfolger_{orient}', 'touch')
        s.ev("__game.cam('cockpit')"); s.frames(30); time.sleep(0.3)
        b = bb_check(s, orient, 'Groß Cockpit')
        r = layout_check(s, ['cockpit'])
        expect(not r['overlap'] and not r['out'] and not r['small'] and b['mode'] in ('full', 'compact'), f'{orient}: Cockpit mit großen Tasten sauber ({b["mode"]}) {r}')
        s.shot(f't_gross_cockpit_{orient}', 'touch')
        for size, k in (('normal', 1.0), ('riesig', 1.5)):
            s.ev(f"() => {{ document.body.dataset.tbsize = '{size}'; }}"); s.frames(20); time.sleep(0.3)
            b = bb_check(s, orient, size.capitalize() + ' Cockpit')
            r = layout_check(s, ['cockpit'])
            expect(not r['overlap'] and not r['out'] and not r['small'], f'{orient}: Cockpit {size} sauber ({b["mode"]}) {r}')
            s.shot(f't_{size}_cockpit_{orient}', 'touch')
        s.ev("() => { document.body.dataset.tbsize = 'gross'; __game.cam('chase'); }"); s.frames(5)
        # Pause-Menü + Fahrhilfe umschalten
        s.tap('#hud [data-a=pause]'); time.sleep(0.5)
        res['kleine_knoepfe_pause'] = s.small_buttons()
        s.shot(f't_pause_{orient}', 'touch')
        s.tap('#pause [data-a=assist][data-v=original]'); time.sleep(0.3)
        expect(s.ev("__game.state().assist") == 'original', f'{orient}: Fahrhilfe in der Pause umgeschaltet')
        s.tap('#pause [data-a=resume]'); time.sleep(0.3)
        expect(s.ev("getComputedStyle(document.querySelector('#hud [data-a=rewind]')).display") == 'none', f'{orient}: Original → kein Rückspul-Knopf')
        # Neigen (Tasten ohne Lenkpfeile)
        s.ev("__game.store.settings.tilt = true; __game.ui.setTouchMode(true)")
        expect(s.ev("getComputedStyle(document.querySelector('#touch .pad.left')).display") == 'none', f'{orient}: Neigen → Lenktasten aus')
        s.ev("__game.store.settings.tilt = false; __game.ui.setTouchMode(true)")
        s.ev("__game.toMenu()"); time.sleep(0.5)
        res['kleine_knoepfe_menue'] = s.small_buttons()
        for a in ['settings', 'help', 'credits']:
            s.tap(f'#menu [data-a={a}]'); time.sleep(0.4); s.shot(f't_sheet_{a}_{orient}', 'touch')
            res['kleine_knoepfe_' + a] = s.small_buttons()
            r = layout_check(s)
            expect(not r['overlap'] and not r['out'] and not r['small'], f'{orient}: {a} sauber {r}')
            s.tap('#sheet [data-a=close]'); time.sleep(0.3)
        print(json.dumps(res, ensure_ascii=False, indent=1))
        # Größe überall ≥ 48 px; „außerhalb“ zählt nur ohne Scrollbereich (Karten scrollen, s. layout_check)
        expect(all(b['w'] >= 47.5 and b['h'] >= 47.5 for k, v in res.items() if k.startswith('kleine') for b in v), f'{orient}: alle Knöpfe ≥ 48 px')
        expect(not s.errors, f'{orient}: 0 Fehler {s.errors[:8]}')
        s.close()
print('ERGEBNIS', 'grün' if ok else 'ROT')
sys.exit(0 if ok else 1)
