# n39 Minikarte: eigene Kosten im Mess-Gate-Profil (Pixel 7, CPU ×4 gedrosselt, DPR 2,6, WebGL über die GPU, Browser per
# `open` gestartet wie tests/perf_gate.py – sonst drosselt macOS die Zeitgeber der Queue)
#   A  GPU-Zeit des ganzen Bilds (?gpumess=1, EXT_disjoint_timer_query um render()) mit Karte gegen ?karte=0, im Wechsel,
#      Median aus je 3 Runden → Differenz = was die Karte das Bild kostet (Karten-Bild 20 Hz + Kopie jedes Bild)
#   B  nur die Karte (?kartemess=1): GPU des Karten-Bilds (Zeitabfrage um das Render-Target vor dem Hauptbild) und CPU je Bild
#      getrennt „Karten-Bild neu“ / „nur Kopie“; ?kartehz=60 = jedes Bild neu (schlechtester Fall)
#   Aufruf: python3 tests/minikarte_mess.py [hoch,quer] [Stufen 1,2] [Runden 3]
import sys, os, json, time, statistics
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from util import Server, Session, PIXEL7_LAND
from playwright.sync_api import sync_playwright
HOCH = dict(PIXEL7_LAND, viewport={"width": 412, "height": 915})
geraete = (sys.argv[1] if len(sys.argv) > 1 else 'hoch,quer').split(',')
stufen = (sys.argv[2] if len(sys.argv) > 2 else '1,2').split(',')
runden = int(sys.argv[3]) if len(sys.argv) > 3 else 3
SEK = 8
def q(L, p): s = sorted(L); return round(s[min(len(s) - 1, int(p * len(s)))], 3) if s else None
SAMMLE = """(() => { window.__gl = []; window.__fz = []; let last = performance.now();
  const k = (now) => { window.__fz.push(now - last); last = now; const g = __game.quality.gpu; if (g && g.ms != null) window.__gl.push(g.ms); if (window.__sammeln) requestAnimationFrame(k); };
  window.__sammeln = true; requestAnimationFrame(k); })()"""

def sitzung(pw, base, g, query):
    s = Session(pw, base, device=HOCH if g == 'hoch' else PIXEL7_LAND, dpr=2.6, offen=True)
    s.open(query)
    s.ev("__game.setAssist('easy'); __game.store.settings.fahrstil = 'sauber'; __game.start({ autopilot: true }); __game.cam('chase')")
    cdp = s.ctx.new_cdp_session(s.pg); cdp.send('Emulation.setCPUThrottlingRate', {'rate': 4})
    time.sleep(2.5)
    return s

erg = {'A': {}, 'B': {}}
with Server() as srv, sync_playwright() as pw:
    # ---------- A: ganzes Bild mit/ohne Karte ----------
    for g in geraete:
        for st in stufen:
            je = {'karte': [], 'ohne': []}
            for k in range(runden):
                for name in (['karte', 'ohne'] if k % 2 == 0 else ['ohne', 'karte']):
                    zus = '' if name == 'karte' else '&karte=0'
                    s = sitzung(pw, srv.base, g, f'?nosw&seed=4711&d=3&g=1&q={st}&startprobe=0&gpumess=1{zus}')
                    try:
                        s.ev(SAMMLE); time.sleep(SEK)
                        r = s.ev("(() => { window.__sammeln = false; return { gpu: window.__gl, fz: window.__fz, calls: __game.info().calls }; })()")
                        je[name].append({'gpu50': q(r['gpu'], .5), 'gpu95': q(r['gpu'], .95), 'p50': q(r['fz'][1:], .5), 'p95': q(r['fz'][1:], .95), 'calls': r['calls'], 'fehler': s.errors[:2]})
                    finally:
                        s.close()
            med = {n: {f: round(statistics.median([x[f] for x in L if x[f] is not None]), 3) for f in ('gpu50', 'gpu95', 'p50', 'p95')} for n, L in je.items()}
            erg['A'][f'{g}_q{st}'] = {'median': med, 'runden': je}
            d = {f: round(med['karte'][f] - med['ohne'][f], 3) for f in med['karte']}
            print('A', g, f'q{st}', 'mit Karte', med['karte'], '| ohne', med['ohne'], '| Differenz', d, flush=True)
    # ---------- B: nur die Karte ----------
    for g in geraete:
        for st in stufen:
            for hz in (20, 60):
                s = sitzung(pw, srv.base, g, f'?nosw&seed=4711&d=3&g=1&q={st}&startprobe=0&kartemess=1&kartehz={hz}')
                try:
                    s.ev("(() => { const k = __game.minikarte.stats; k.cpuNeu = []; k.cpuKopie = []; k.gpuL = []; let b = k.bilder; window.__kg = setInterval(() => { if (k.bilder !== b && k.gpuNeuMs != null) { k.gpuL.push(k.gpuNeuMs); b = k.bilder; } }, 20); })()")
                    time.sleep(SEK)
                    S = s.ev("(() => { clearInterval(window.__kg); const k = __game.minikarte.stats; return { neu: k.cpuNeu, kopie: k.cpuKopie, gpu: k.gpuL, rt: k.rt, draws: k.drawsNeu }; })()")
                    r = {'cpu_neu_p50': q(S['neu'], .5), 'cpu_neu_p95': q(S['neu'], .95), 'cpu_kopie_p50': q(S['kopie'], .5), 'cpu_kopie_p95': q(S['kopie'], .95),
                         'n_neu': len(S['neu']), 'n_kopie': len(S['kopie']), 'gpu_bild_p50': q(S['gpu'], .5), 'gpu_bild_p95': q(S['gpu'], .95), 'rt': S['rt'], 'draws_bild': S['draws'], 'fehler': s.errors[:3]}
                    erg['B'][f'{g}_q{st}_{hz}hz'] = r
                    print('B', g, f'q{st}', f'{hz} Hz', json.dumps(r), flush=True)
                finally:
                    s.close()
os.makedirs('tests/perf', exist_ok=True)
json.dump(erg, open('tests/perf/2026-10-18_n39_karte_eigen.json', 'w'), indent=1)
print('→ tests/perf/2026-10-18_n39_karte_eigen.json')
