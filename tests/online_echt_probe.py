# n35: Probe echte Partnersuche (Trystero über öffentliche Relays) – zwei Pages, nur die Transportschicht, ohne Spiel.
# Aufruf: python3 tests/online_echt_probe.py [nostr|mqtt|auto] [Sekunden]
import sys, time, json, os
sys.path.insert(0, 'tests')
import util as U
from util import *
U.ARGS = U.ARGS + (['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] if os.environ.get('VPN') != '0' else []) + ['--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding']
STRAT = sys.argv[1] if len(sys.argv) > 1 else 'nostr'
SEK = int(sys.argv[2]) if len(sys.argv) > 2 else 40
JS = """async ([code, strat]) => {
  const t0 = performance.now();
  window.__log = [];
  const { trysteroTransport } = await import('./src/net/trystero.js');
  const T = await trysteroTransport(code, { strategie: strat });
  window.__T = T;
  T.beiBeitritt((p) => __log.push(['join', p, Math.round(performance.now() - t0), JSON.stringify(T.peerRaum.get(p))]));
  T.beiFehler((e) => __log.push(['fehler', JSON.stringify(e), Math.round(performance.now() - t0)]));
  T.bei('m', (d, von) => __log.push(['msg', JSON.stringify(d), Math.round(performance.now() - t0)]));
  return T.id;
}"""
with Server() as srv, sync_playwright() as pw:
    b = pw.chromium.launch(args=U.ARGS)
    # Test-Mac hinter VPN (ProtonVPN): ohne Medien-Erlaubnis sammelt Chrome nur Kandidaten der VPN-Schnittstelle, und die
    # leitet UDP an sich selbst nicht zurück. Mit (Schein-)Mikrofon-Erlaubnis nimmt Chrome alle Schnittstellen (WLAN-IP).
    # Das Spiel selbst braucht das nicht; Handys im selben WLAN verbinden sich über mDNS-Kandidaten, sonst über STUN.
    ctx = b.new_context(permissions=['camera', 'microphone'] if os.environ.get('VPN') != '0' else [])
    code = 'P' + str(int(time.time()) % 1000).zfill(3).replace('0', 'Q').replace('1', 'R')
    pgs = []
    for n in range(2):
        pg = ctx.new_page()
        pg.on('console', lambda m, n=n: print(f'  [{n}] {m.type}: {m.text[:200]}') if m.type in ('error', 'warning') else None)
        pg.goto(srv.base + 'tests/carview.html')
        if os.environ.get('VPN') != '0': pg.evaluate("navigator.mediaDevices.getUserMedia({ audio: true }).then((s) => s.getTracks().forEach((t) => t.stop()))")
        pgs.append(pg)
    ids = [pg.evaluate(JS, [code, STRAT]) for pg in pgs]
    print('Raum', code, 'IDs', ids, flush=True)
    t0 = time.time()
    while time.time() - t0 < SEK:
        logs = [pg.evaluate('__log') for pg in pgs]
        if all(any(e[0] == 'join' for e in L) for L in logs): break
        time.sleep(1)
    print('nach', round(time.time() - t0), 's')
    for n, pg in enumerate(pgs):
        pg.evaluate("__T.senden('m', { hallo: %d, t: Date.now() })" % n)
    time.sleep(2)
    for n, pg in enumerate(pgs):
        print(n, json.dumps(pg.evaluate('__log')))
    for pg in pgs: pg.evaluate('__T.verlassen()')
    b.close()
