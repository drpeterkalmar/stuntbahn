# Phase 4b im Browser: Touch-Steuerung (Hälften bei Leicht, Tasten bei Mittel/Original), Knopfgrößen, Umschalten
import sys, time, json
sys.path.insert(0, 'tests')
from util import *
res = {}
with Server() as srv, sync_playwright() as pw:
    s = Session(pw, srv.base)
    s.open('?nosw&seed=1000&d=1')
    W, H = 915, 412
    # Leicht: Hälften
    s.ev("__game.setAssist('easy')")
    s.tap('button[data-a=start]')
    s.ev("__game.sim(3.3)")   # Countdown vorbei
    cls = s.ev("document.getElementById('touch').className")
    print('touch-Klasse (Leicht):', cls)
    # linke Hälfte halten: Lenkung des Spielers geht nach links (input.touch.steer = -1)
    s.pg.touchscreen.tap(100, 300)  # kurzer Tap (Kontrolle)
    t = s.ev("""(() => new Promise(res => { const T=document.querySelector('#touch .half.l'); const r=T.getBoundingClientRect();
        const ev=(type)=>new PointerEvent(type,{pointerId:7,pointerType:'touch',clientX:r.left+60,clientY:r.top+120,bubbles:true});
        T.dispatchEvent(ev('pointerdown')); setTimeout(()=>{ const st=window.__touchState.steer; T.dispatchEvent(ev('pointerup')); res(st); }, 300); }))()""")
    res['leicht_links'] = t
    s.shot('t_easy', 'touch')
    # Mittel: Tasten
    s.ev("__game.setAssist('medium'); __game.start({})")
    s.ev("__game.sim(3.3)")
    cls2 = s.ev("document.getElementById('touch').className")
    print('touch-Klasse (Mittel):', cls2)
    sp0 = s.ev("__game.race.car.speed()")
    s.ev("""(() => { const G=document.querySelector('#touch .tb.gas'); const r=G.getBoundingClientRect();
        G.dispatchEvent(new PointerEvent('pointerdown',{pointerId:9,pointerType:'touch',clientX:r.left+20,clientY:r.top+20,bubbles:true})); })()""")
    s.frames(20)
    s.ev("__game.sim(1.5, window.__touchState)")
    sp1 = s.ev("__game.race.car.speed()")
    s.shot('t_medium_gas', 'touch')
    s.ev("""(() => { const G=document.querySelector('#touch .tb.gas'); G.dispatchEvent(new PointerEvent('pointerup',{pointerId:9,pointerType:'touch',bubbles:true})); })()""")
    res['mittel_gas_tempo'] = [round(sp0, 2), round(sp1, 2)]
    res['kleine_knoepfe_rennen'] = s.small_buttons()
    # Pause-Menü + Fahrhilfe umschalten
    s.tap('#hud [data-a=pause]'); time.sleep(0.5)
    res['kleine_knoepfe_pause'] = s.small_buttons()
    s.shot('t_pause', 'touch')
    s.tap('#pause [data-a=assist][data-v=original]'); time.sleep(0.3)
    res['assist_nach_umschalten'] = s.ev("__game.state().assist")
    s.tap('#pause [data-a=resume]'); time.sleep(0.3)
    res['rewind_knopf_sichtbar'] = s.ev("getComputedStyle(document.querySelector('#hud [data-a=rewind]')).display")
    s.ev("__game.toMenu()"); time.sleep(0.5)
    res['kleine_knoepfe_menue'] = s.small_buttons()
    for a in ['settings', 'help', 'credits']:
        s.tap(f'#menu [data-a={a}]'); time.sleep(0.4); s.shot('t_sheet_' + a, 'touch')
        res['kleine_knoepfe_' + a] = s.small_buttons()
        s.tap('#sheet [data-a=close]'); time.sleep(0.3)
    print(json.dumps(res, ensure_ascii=False, indent=1))
    print('errors', s.errors[:8])
    s.close()
