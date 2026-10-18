# n35 Messung „Wie fühlt sich Ping an?“ – EIN Browser (stumm), zwei Pages (BroadcastChannel), künstliche Laufzeit je
# Richtung 0/25/75 ms (Ping 0/50/150 ms, Schwankung ±10/±30 ms, 2 % Verlust), zur Laufzeit umgestellt; je Rennen erst
# 12 s mit Vorausrechnen (Standard), dann 12 s ohne (reiner ~100-ms-Puffer wie im Brief).
# Gemessen: Abstand gezeigtes ↔ wahres Auto (beide Seiten loggen je Bild mit gemeinsamer Systemuhr), Rempler je Seite
# (lokal erkannt / von der Gegenseite gemeldet) und wie weit die beiden Rempler-Meldungen zeitlich auseinander liegen.
# Ergebnis: tests/out/online_ping_mess.json + Tabelle. Aufruf: python3 tests/online_ping_mess.py
import sys, time, json, os, math
sys.path.insert(0, 'tests')
import util as U
from util import *
U.ARGS = U.ARGS + ['--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding']
Z = "(() => { const o = __game.online; return o && o.spiel ? o.spiel.zustand() : null; })()"
def warte(pg, js, s=30, schritt=0.25):
    t0 = time.time()
    while time.time() - t0 < s:
        try:
            if pg.evaluate(js): return True
        except Exception: pass
        time.sleep(schritt)
    return False
# je Bild: eigene Lage (wahr) + gezeigte Lage des fremden Menschen; Rempler-Ereignisse mitschreiben
LOG = """(() => {
  window.__L = { ich: [], fremd: [], rempler: [] };
  const gen = window.__gen = (window.__gen || 0) + 1;   // je Rennen nur eine Mess-Schleife
  const R = __game.online.rennen, E = R.events, push = E.push.bind(E);
  E.push = (...a) => { for (const e of a) if (e.type === 'rempler') __L.rempler.push({ t: performance.timeOrigin + performance.now(), lokal: !!e.lokal, v: e.v }); return push(...a); };
  const f = () => {
    const R2 = __game.online.rennen; if (!R2 || gen !== window.__gen) return;
    const t = performance.timeOrigin + performance.now(), c = __game.race.car;
    __L.ich.push([t, c.pos.x, c.pos.y, c.pos.z]);
    for (const X of R2.autos.values()) if (!X.ki && X.auto.gueltig) __L.fremd.push([t, X.auto.pos.x, X.auto.pos.y, X.auto.pos.z]);
    requestAnimationFrame(f);
  };
  requestAnimationFrame(f);
})()"""
def abstand(wahr, gezeigt, t0, t1):
    # wahr: [[t,x,y,z]] der anderen Seite; gezeigt: [[t,x,y,z]] hier – wahre Lage zur Zeit t linear interpoliert
    out, j = [], 0
    for t, x, y, z in gezeigt:
        if t < t0 or t > t1: continue
        while j + 1 < len(wahr) and wahr[j + 1][0] < t: j += 1
        if j + 1 >= len(wahr): break
        a, b = wahr[j], wahr[j + 1]
        if b[0] - a[0] > 0.2e3 or math.dist(a[1:], b[1:]) > 8: continue   # Lücke / Reset
        u = (t - a[0]) / max(1e-6, b[0] - a[0])
        p = [a[k] + (b[k] - a[k]) * u for k in (1, 2, 3)]
        out.append(math.dist(p, (x, y, z)))
    out.sort()
    q = lambda f: out[min(len(out) - 1, int(f * len(out)))] if out else None
    return {'n': len(out), 'mittel': round(sum(out) / len(out), 2) if out else None, 'p50': q(.5) and round(q(.5), 2), 'p95': q(.95) and round(q(.95), 2), 'max': out and round(out[-1], 2)}

ergebnis = []
with Server() as srv, sync_playwright() as pw:
    s = Session(pw, srv.base, device=PIXEL7_LAND)
    A = s.pg; B = s.ctx.new_page()
    s.open('?nosw&online=1&netz=bc&seed=4711&d=2')
    A.evaluate("__game.store.settings.spielerName = 'Peter'; __game.store.save()")
    s.tap('[data-a=online]'); time.sleep(0.3); s.tap('[data-a=onerstellen]')
    warte(A, f"{Z} && {Z}.code", 20)
    B.goto(A.evaluate(f"{Z}.link")); B.wait_for_function("window.__app && window.__app.ready && window.__app.frames > 3", timeout=400000)
    B.evaluate("document.getElementById('onname').value = 'Ben'; __game.online.aktion('onbeitreten')")
    warte(B, f"{Z} && {Z}.geladen && {Z}.geladen === {Z}.einst.strecke", 90)
    for lag, jit in ((0, 0), (25, 10), (75, 30)):
        for P in (A, B): P.evaluate(f"(() => {{ const o = __game.online.spiel.S.tr.opt; o.latenz = {lag}; o.jitter = {jit}; o.verlust = {0.02 if lag else 0}; }})()")
        for P in (A, B): P.evaluate("import('./src/game/online.js').then((m) => { m.ONLINE.voraus = 1; })")
        time.sleep(3)   # Uhr-Abgleich setzt sich auf die neue Laufzeit
        B.evaluate("__game.online.spiel.setzeBereit(true)")
        warte(A, f"{Z}.start.ok", 15)
        for P in (A, B): P.evaluate("window.__altR = __game.online.rennen")
        A.evaluate("__game.online.aktion('onstart')")
        NEU = "__game.race && __game.race.online && __game.online.rennen && __game.online.rennen !== window.__altR"
        warte(A, NEU, 15); warte(B, NEU, 15)
        for P in (A, B): P.evaluate("__game.race.autopilotOnly = true"); P.evaluate(LOG)
        warte(A, "__game.race.state === 'running'", 15)
        tLos = time.time() * 1000
        time.sleep(12)
        tUm = time.time() * 1000
        for P in (A, B): P.evaluate("import('./src/game/online.js').then((m) => { m.ONLINE.voraus = 0; })")
        time.sleep(12)
        tEnde = time.time() * 1000
        LA, LB = A.evaluate("__L"), B.evaluate("__L")
        r = {'ping_ms': 2 * lag, 'schwankung_ms': jit,
             'voraus': {'A_sieht_B': abstand(LB['ich'], LA['fremd'], tLos + 1500, tUm), 'B_sieht_A': abstand(LA['ich'], LB['fremd'], tLos + 1500, tUm)},
             'puffer': {'A_sieht_B': abstand(LB['ich'], LA['fremd'], tUm + 500, tEnde), 'B_sieht_A': abstand(LA['ich'], LB['fremd'], tUm + 500, tEnde)},
             'rempler': {'A_lokal': sum(1 for e in LA['rempler'] if e['lokal']), 'A_gemeldet': sum(1 for e in LA['rempler'] if not e['lokal']),
                         'B_lokal': sum(1 for e in LB['rempler'] if e['lokal']), 'B_gemeldet': sum(1 for e in LB['rempler'] if not e['lokal'])},
             'rempler_zeiten': {'A': [round(e['t'] - tLos) for e in LA['rempler']], 'B': [round(e['t'] - tLos) for e in LB['rempler']]},
             'uhr_rtt_B': B.evaluate("__game.online.spiel.S.uhr.rtt")}
        print(json.dumps(r, ensure_ascii=False), flush=True)
        ergebnis.append(r)
        if lag == 0: s.shot('ping0_quer', 'n35')
        # zurück in die Lobby (nicht bis ins Ziel)
        A.evaluate("__game.online.spiel.S.abschliessen([])"); time.sleep(1)
        A.evaluate("__game.online.aktion('onlobby')"); time.sleep(2)
        warte(B, f"{Z}.phase === 'lobby'", 10)
    s.close()
os.makedirs('tests/out', exist_ok=True)
json.dump(ergebnis, open('tests/out/online_ping_mess.json', 'w'), ensure_ascii=False, indent=1)
print('\nPing  | gezeigt↔wahr vorausgerechnet (Mittel/p95) | nur Puffer (Mittel/p95) | Rempler A lokal/gemeldet, B lokal/gemeldet')
for r in ergebnis:
    v, p = r['voraus'], r['puffer']
    f = lambda d: f"{d['mittel']}/{d['p95']} m" if d['n'] else '–'
    print(f"{r['ping_ms']:4d}  | A→B {f(v['A_sieht_B'])}, B→A {f(v['B_sieht_A'])} | A→B {f(p['A_sieht_B'])}, B→A {f(p['B_sieht_A'])} | {r['rempler']}")
