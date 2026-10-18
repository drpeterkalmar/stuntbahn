# n38 Stunt-Lohn im Browser: Mittel mit echter Tastatur über die erste Schanze von 4711-2, in der Luft Gas antippen (Salto).
#   laden  – Nitro lädt gerade nach (4,5 s Rest): der Salto macht ihn sofort bereit („🔥 Nitro sofort bereit!“, Knopf leuchtet)
#   vorrat – Nitro ist bereit: der Salto füllt den Vorrat (goldener Ring um den Knopf)
#   (n38 Etappe 2: Schweif im Flugbild; Luft-Ton: Tiefpass im Flug ≤ 1,5 kHz, nach dem Aufsetzen ≤ 0,1 s wieder offen)
#   ziel   – Leicht bis ins Ziel: Ergebnis zeigt Stunt-Punkte und „Nitro … s früher bereit“
# quer und hochkant, 0 Seitenfehler. Aufruf: python3 tests/lohn_shots.py [quer|hoch] → tests/shots/n38/
import sys, time, json
sys.path.insert(0, 'tests')
from util import *

SEED = '?nosw&seed=4711&d=2'
SLOW = 0.2
PORTRAIT = dict(viewport={"width": 412, "height": 915}, device_scale_factor=2.625, is_mobile=True, has_touch=True,
                user_agent=PIXEL7_LAND['user_agent'])
which = [a for a in sys.argv[1:] if a in ('quer', 'hoch')] or ['quer', 'hoch']
fails = []
ton = {}

def st(s):
    return s.ev("(() => { const r = __game.race, c = r.car, X = r.xstate(), N = document.querySelector('#hud .xb.nitro'), P = document.querySelector('#stuntpop'); return { air: c.onGround === 0, t: c.airTime, crashes: r.crashes, total: r.stunts.total, last: r.stunts.last, nitro: X.nitro, bank: X.bank, cd: r.cd.nitro, cls: N.className, pop: P.innerText, popCls: P.className }; })()")

def jump(s, tag, sub, prep):
    s.ev("__game.setAssist('medium'); __game.setLine && __game.setLine('off')")
    s.ev("__game.start({})")
    s.ev("__game.sim(3.6)")
    j = s.ev("""(() => { const e = __game.env, J = e.track.jumps[0], m = e.track.line.n - 1;
      const i = ((J.lipIdx - 60) % m + m) % m; return { i, v: e.prof.vt[i] }; })()""")
    s.ev(f"__game.teleport({j['i']}, {j['v']})")
    s.ev(prep)
    s.ev("__game.cam('chase')")
    s.ev(f"__game.setTimeScale({SLOW})")
    s.pg.keyboard.down('ArrowUp')
    t0 = time.time(); tapped = False; flew = False; landed = False; shot_air = False; shot_late = False; ton.clear()
    while time.time() - t0 < 60:
        x = st(s)
        if x['air'] and x['t'] > 0.2: flew = True
        if flew and x['air'] and not tapped and x['t'] > 0.4:
            s.pg.keyboard.up('ArrowUp'); time.sleep(0.15)
            s.pg.keyboard.down('ArrowUp'); time.sleep(0.35); s.pg.keyboard.up('ArrowUp')
            tapped = True
        if flew and x['air'] and x['t'] > 1.2 and not shot_air:
            ton['flug'] = s.ev("(() => { const S = __game.sound; return S && S.airLP ? S.airLP.frequency.value : null; })()")
            s.shot(f'{tag}_flug', sub); shot_air = True   # ohne Anhalten: der Schweif altert in Echtzeit
        if flew and x['air'] and x['t'] > 1.8 and not shot_late:
            s.shot(f'{tag}_flug2', sub); shot_late = True
        if flew and not x['air']:
            landed = True
            time.sleep(0.12)
            ton['zurueck'] = s.ev("(() => { const S = __game.sound; if (!S || !S.airLP) return null; const L = S.airLog || [], e = L[L.length - 1]; return { hz: S.airLP.frequency.value, last: e && e.on, ms: e ? performance.now() - e.t : null }; })()")
            break
        time.sleep(0.03)
    s.pg.keyboard.down('ArrowUp')
    # Abrechnung 0,4 s Spielzeit nach dem Aufsetzen, Anzeige steht dann 2,2 s (echte Zeit)
    for k in range(80):
        if 'show' in s.ev("document.querySelector('#stuntpop').className") and not s.ev("document.querySelector('#stuntpop').classList.contains('live')"): break
        time.sleep(0.05)
    s.ev("__game.freeze(true)"); s.frames(3); time.sleep(0.15)
    s.shot(f'{tag}_landung', sub)
    x = st(s)
    s.ev("__game.freeze(false)")
    s.pg.keyboard.up('ArrowUp')
    return x, landed

with Server() as srv, sync_playwright() as pw:
    for lay in which:
        dev = PIXEL7_LAND if lay == 'quer' else PORTRAIT
        for case, prep in [('laden', "(() => { const r = __game.race; r.charges.nitro = 0; r.cd.nitro = 4.5; r.nbank = 0; })()"),
                           ('vorrat', "(() => { const r = __game.race; r.charges.nitro = 1; r.cd.nitro = 0; r.nbank = 0; })()")]:
            s = Session(pw, srv.base, device=dev)
            s.open(SEED)
            x, landed = jump(s, f'{lay}_{case}', 'n38', prep)
            print(lay, case, 'gelandet' if landed else 'NICHT gelandet', json.dumps({k: x[k] for k in ['crashes', 'total', 'nitro', 'bank', 'cd', 'cls', 'pop', 'popCls']}, ensure_ascii=False), 'Fehler', s.errors[:5], flush=True)
            if not landed or x['crashes']: fails.append(f'{lay} {case}: nicht sauber gelandet')
            if not (x['last'] and x['last']['flips'] >= 2): fails.append(f'{lay} {case}: kein Salto gewertet')
            if case == 'laden' and not (x['nitro'] == 'ok' and 'sofort bereit' in x['pop']): fails.append(f'{lay} laden: Nitro nicht sofort bereit ({x["nitro"]}, {x["pop"]!r})')
            if case == 'vorrat' and not (x['bank'] > 0.5 and 'bank' in x['cls'] and 'Vorrat' in x['pop']): fails.append(f'{lay} vorrat: kein Vorrat ({x["bank"]}, {x["cls"]}, {x["pop"]!r})')
            if 'show' not in x['popCls']: fails.append(f'{lay} {case}: Stunt-Anzeige nicht im Bild')
            print('   Ton', ton, flush=True)
            if ton.get('flug') is None or ton['flug'] > 1500: fails.append(f'{lay} {case}: Luft-Ton im Flug nicht dumpf ({ton.get("flug")})')
            z = ton.get('zurueck') or {}
            if not (z.get('last') is False and z.get('hz', 0) > 12000): fails.append(f'{lay} {case}: Luft-Ton nach der Landung nicht zurück ({z})')
            if s.errors: fails.append(f'{lay} {case}: Seitenfehler {s.errors[:3]}')
            s.close()
        # Ziel: Leicht mit Autopilot-Hilfe (Spieler lässt los) bis ins Ziel, Ergebnis-Karte
        s = Session(pw, srv.base, device=dev)
        s.open(SEED)
        s.ev("__game.setAssist('easy')")
        s.ev("__game.start({})")
        for k in range(60):
            r = s.ev("__game.sim(2.0)")
            if r['state'] == 'finished': break
        s.frames(10); time.sleep(1.5)
        txt = s.ev("(document.querySelector('#result .rstunt') || {}).innerText || ''")
        s.shot(f'{lay}_ziel', 'n38')
        print(lay, 'ziel', repr(txt), 'Fehler', s.errors[:5], flush=True)
        if 'Stunt-Punkte' not in txt or 'früher bereit' not in txt: fails.append(f'{lay} ziel: Ergebniszeile fehlt ({txt!r})')
        if s.errors: fails.append(f'{lay} ziel: Seitenfehler {s.errors[:3]}')
        s.close()
print('FEHLER' if fails else 'OK', fails)
sys.exit(1 if fails else 0)
