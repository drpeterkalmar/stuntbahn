# Ton-Probe (n16): rendert Szenen offline (OfflineAudioContext im Headless-Chrome) mit der echten src/audio/sound.js –
# einmal mit dem bisherigen Synthesizer (?snd=alt = Stand bis n15) und einmal mit den Aufnahmen – und misst:
# Spitze, Übersteuerung, RMS, und durch einen „Handy-Lautsprecher“ (Hochpass 400 Hz, 2× Butterworth; Web-Audio-Q
# in dB: −3,0103): Anteil der Energie > 2 kHz („Brutzeln“, Ziel der 30-s-Szene ≤ 10 %).
# Szenen: vollgas (Start, Vollgas durch alle Gänge, dann Schiebebetrieb), crash (leicht/mittel/schwer),
# schleifen (Leitplanke), landung (klein/mittel/hoch), szene30 (30 s Rennen, Mittel, Vollgas-Fahrer mit Bremshinweis).
# Schreibt Hörproben als M4A nach ~/Downloads/Stuntbahn-Ton/ und Spektrogramme nach tests/out/n16/ton/.
# Aufruf: python3 tests/ton_probe.py [szene,…]
import sys, os, json, time, base64, subprocess
sys.path.insert(0, 'tests')
from util import *

DAUER = float(sys.argv[2]) if len(sys.argv) > 2 else 0
NZ = float(sys.argv[3]) if len(sys.argv) > 3 else 1.3   # Lenk-Rauschen des Fahrers in szene30 (1,3: Crash + Abkürzung)
SZENEN = (sys.argv[1] if len(sys.argv) > 1 else 'klaenge,vollgas,cockpit,crash,schleifen,landung,szene30').split(',')
DL = os.path.expanduser('~/Downloads/Stuntbahn-Ton'); os.makedirs(DL, exist_ok=True)
OUTD = os.path.join(ROOT, 'tests', 'out', 'n16', 'ton'); os.makedirs(OUTD, exist_ok=True)

JS = r"""
async ({ szene, dauer, nz }) => {
  const NZ = nz || 0.45;
  let seed = 4711; Math.random = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  const SR = 44100, FPS = 60;
  const T = dauer || { vollgas: 21, cockpit: 21, crash: 8, schleifen: 5, landung: 6, szene30: 30 }[szene];
  const { Sound, loadRec } = await import('./src/audio/sound.js');
  const { Car, CAR_DEF } = await import('./src/physics/car.js');
  const { MAT } = await import('./src/track/defs.js');
  const oc = new OfflineAudioContext(1, Math.ceil(T * SR), SR);
  const res0 = oc.resume; oc.resume = () => Promise.resolve();   // unlock() will fortsetzen – offline noch nicht
  const AC0 = window.AudioContext; window.AudioContext = function () { return oc; };
  const S = new Sound({ settings: { sound: true } });
  S.unlock(); window.AudioContext = AC0; oc.resume = res0;
  for (let k = 0; k < 400 && !S.bank; k++) await new Promise((r) => setTimeout(r, 50));
  if (!S.bank) return { err: 'kein Klangvorrat' };
  S.start();
  const rec = !!S.bank.rec;
  const PLANE = { ray(ox, oy, oz, dx, dy, dz, len) { if (dy >= -1e-9) return null; const t = -oy / dy; if (t < 0 || t > len) return null; return { t, x: ox + dx * t, y: 0, z: oz + dz * t, nx: 0, ny: 1, nz: 0, mat: MAT.ROAD }; } };
  let car = null, race = null, step;
  const log = [], errs = [];
  if (szene === 'szene30') {
    // echtes Rennen (Strecke im Seiten-Zustand), Mittel, Spieler: lenkt wie der Autopilot + Rauschen, Vollgas, bremst bei „Bremsen!“
    const G = window.__game; G.setAssist('medium'); G.start(); G.freeze(true);
    race = G.race; car = race.car;
    let noise = 0, nT = 0, ds = 99; const drnd = () => ((ds = (ds * 1664525 + 1013904223) >>> 0) / 4294967296);   // eigener Zufall: gleiche Fahrt alt/neu
    step = (dt) => {
      const n = Math.round(dt * 120);
      for (let i = 0; i < n; i++) {
        const a = race.ap.control(car); nT -= 1 / 120; if (nT <= 0) { noise = drnd() * 2 - 1; nT = 0.3 + drnd(); }
        race.step(1 / 120, { steer: Math.max(-1, Math.min(1, a.steer + NZ * noise)), throttle: race.bhOn ? 0 : 1, brake: race.bhOn ? 1 : 0 });
      }
      for (const e of race.events) { S.event(e); if (e.type !== 'brakehint') log.push([+oc.currentTime.toFixed(2), e.type, e.reason || '']); }
      race.events.length = 0;
      return race.state;
    };
  } else {
    car = new Car(CAR_DEF); car.place([0, 0, 0], [0, 0, -1], [0, 1, 0], 0);
    const drive = (thr, v) => { car.input.throttle = v == null ? thr : Math.max(0, Math.min(1, 0.3 + (v - car.fwdSpeed()) * 0.6)); car.input.brake = 0; car.input.steer = 0; };
    step = (dt) => {
      const t = oc.currentTime;
      if (szene === 'vollgas' || szene === 'cockpit') drive(t < 0.8 ? 0 : t < 14.5 ? 1 : 0);
      else drive(0, szene === 'schleifen' ? 25 : 14);
      for (let i = 0; i < Math.round(dt * 120); i++) { car.step(1 / 120, PLANE); if (car.pos.z < -3000) car.pos.z += 6000; }
      if (szene === 'schleifen') car.scrape = t > 1 && t < 3.5 ? 14 + 4 * Math.sin(t * 7) : 0;
      return 'running';
    };
    const ev = { crash: [[1, { type: 'crash', reason: 'Aufprall', imp: 5, v: 8 }], [3.2, { type: 'crash', reason: 'Aufprall', imp: 13, v: 25 }], [5.4, { type: 'crash', reason: 'Aufprall', imp: 24, v: 45 }]],
                 landung: [[1, { type: 'land', v: 4 }], [2.8, { type: 'land', v: 9 }], [4.4, { type: 'land', v: 15 }]] }[szene] || [];
    for (const [t, e] of ev) oc.suspend(Math.round(t * SR / 128) * 128 / SR).then(() => { try { S.event(e); } catch (x) { errs.push(String(x)); } finally { oc.resume(); } }, () => {});
  }
  let st = 'running';
  for (let k = 1; k < T * FPS; k++) {
    const tt = Math.round(k / FPS * SR / 128) * 128 / SR;
    oc.suspend(tt).then(() => { try { st = step(1 / FPS); S.update(car, 1 / FPS, st, { cockpit: szene === 'cockpit' }); } catch (e) { errs.push(String(e && e.stack || e)); } finally { oc.resume(); } }, () => {});
  }
  const buf = await oc.startRendering();
  const d = buf.getChannelData(0);
  const energy = async (filters) => {
    const o2 = new OfflineAudioContext(1, d.length, SR); const src = o2.createBufferSource(); src.buffer = buf; let node = src;
    for (const [type, f] of filters) { const b = o2.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = -3.0103; node.connect(b); node = b; }
    node.connect(o2.destination); src.start(0); const r = (await o2.startRendering()).getChannelData(0); let e = 0; for (let i = 0; i < r.length; i++) e += r[i] * r[i]; return e;
  };
  const HP = (f) => [['highpass', f], ['highpass', f]], LP = (f) => [['lowpass', f], ['lowpass', f]];
  const tot = await energy([]), phone = await energy(HP(400)), phoneHi = await energy([...HP(400), ...HP(2000)]), lo = await energy(LP(300));
  let peak = 0, clip = 0, sq = 0; for (let i = 0; i < d.length; i++) { const a = Math.abs(d[i]); if (a > peak) peak = a; if (a >= 0.999) clip++; sq += d[i] * d[i]; }
  const n = d.length, ab = new ArrayBuffer(44 + n * 2), dv = new DataView(ab);
  const wr = (o, s) => { for (let i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i)); };
  wr(0, 'RIFF'); dv.setUint32(4, 36 + n * 2, true); wr(8, 'WAVE'); wr(12, 'fmt '); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true);
  dv.setUint32(24, SR, true); dv.setUint32(28, SR * 2, true); dv.setUint16(32, 2, true); dv.setUint16(34, 16, true); wr(36, 'data'); dv.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) dv.setInt16(44 + i * 2, Math.max(-1, Math.min(1, d[i])) * 32767, true);
  let bin = ''; const u8 = new Uint8Array(ab); for (let i = 0; i < u8.length; i += 0x8000) bin += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
  return { rec, wav: btoa(bin), peak, clip, rms: 20 * Math.log10(Math.sqrt(sq / n) + 1e-12), lo: lo / tot, phone: phone / tot, sizzle: phoneHi / phone, log: log.slice(0, 30), errs: errs.slice(0, 3) };
}
"""

KL = r"""
async () => {
  const { Sound } = await import('./src/audio/sound.js');
  const oc0 = new OfflineAudioContext(1, 1, 44100); const res0 = oc0.resume; oc0.resume = () => Promise.resolve();
  const AC0 = window.AudioContext; window.AudioContext = function () { return oc0; };
  const S = new Sound({ settings: { sound: true } }); S.unlock(); window.AudioContext = AC0;
  for (let k = 0; k < 400 && !S.bank; k++) await new Promise((r) => setTimeout(r, 50));
  const B = S.bank, list = [];
  if (B.rec) { const R = B.rec; R.on.forEach((e) => list.push(['Motor Last ' + e.rpm, e.buf])); R.off.slice(1).forEach((e) => list.push(['Motor Schub ' + e.rpm, e.buf]));
    [['Reifen A', R.tire[0]], ['Reifen B', R.tire[1]], ['Schleifen', R.scrape], ['Wumms', R.thud], ['Haube', R.hood], ['Blech A', R.crunch[0]], ['Blech B', R.crunch[1]], ['Trümmer', R.debris], ['Glas', R.glass],
     ['Landung A', R.land[0]], ['Landung B', R.land[1]], ['Landung C', R.land[2]], ['Knall A', R.pop[0]], ['Knall B', R.pop[1]], ['Nitro', B.nitroLoop]].forEach((x) => list.push(x)); }
  else { B.engine.forEach((e) => list.push(['Motor ' + e.rpm, e.buf])); [['Reifen', B.tire], ['Crash', B.crash], ['Aufsetzen', B.thump], ['Nitro', B.nitroLoop]].forEach((x) => list.push(x)); }
  const energy = async (buf, filters) => { const o = new OfflineAudioContext(1, buf.length, buf.sampleRate); const src = o.createBufferSource(); src.buffer = buf; let node = src;
    for (const [type, f] of filters) { const b = o.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = -3.0103; node.connect(b); node = b; }
    node.connect(o.destination); src.start(0); const d = (await o.startRendering()).getChannelData(0); let e = 0; for (let i = 0; i < d.length; i++) e += d[i] * d[i]; return e; };
  const HP = (f) => [['highpass', f], ['highpass', f]], LP = (f) => [['lowpass', f], ['lowpass', f]];
  const out = [];
  for (const [n, buf] of list) { const tot = await energy(buf, []), phone = await energy(buf, HP(400)); out.push([n, buf.duration, (await energy(buf, LP(300))) / tot, phone / tot, (await energy(buf, [...HP(400), ...HP(2000)])) / phone]); }
  return out;
}
"""
res = {}
with Server() as srv, sync_playwright() as pw:
    s = Session(pw, srv.base, device=DESKTOP)
    for ver, q in [('vorher', '?nosw&snd=alt&seed=4711&d=3'), ('nachher', '?nosw&seed=4711&d=3')]:
        s.open(q)
        for sz in SZENEN:
            t0 = time.time()
            if sz == 'klaenge':
                print(f'--- {ver}: Klang  Dauer  <300 Hz  am Handy hörbar  davon >2 kHz')
                for n, d, lo, ph, hi in s.ev(KL): print(f'    {n:18s} {d:5.2f} s  {100*lo:5.1f} %  {100*ph:5.1f} %  {100*hi:5.1f} %')
                continue
            r = s.ev(JS, {'szene': sz, 'dauer': DAUER, 'nz': NZ})
            if r.get('err'): print(ver, sz, r['err']); continue
            wav = os.path.join(OUTD, f'{ver}_{sz}.wav'); open(wav, 'wb').write(base64.b64decode(r.pop('wav')))
            m4a = os.path.join(DL, f'{ver}_{sz}.m4a')
            subprocess.run(['ffmpeg', '-y', '-v', 'error', '-i', wav, '-c:a', 'aac', '-b:a', '128k', m4a], check=True)
            subprocess.run(['ffmpeg', '-y', '-v', 'error', '-i', wav, '-lavfi', 'showspectrumpic=s=1000x300:legend=1:fscale=log:color=intensity', os.path.join(OUTD, f'{ver}_{sz}.png')], check=True)
            res[f'{ver}_{sz}'] = r
            print(f"{ver:8s} {sz:10s} {'Aufnahmen' if r['rec'] else 'Synth':9s} Spitze {r['peak']:.2f}  übersteuert {r['clip']:4d}  RMS {r['rms']:6.1f} dBFS  "
                  f"<300 Hz {100*r['lo']:5.1f} %  am Handy {100*r['phone']:5.1f} %  davon >2 kHz {100*r['sizzle']:5.1f} %  ({time.time()-t0:.0f} s)", flush=True)
            if r['log']: print('   Ereignisse', r['log'][:12])
            if r['errs']: print('   FEHLER', r['errs'])
    print('Seitenfehler', s.errors[:5])
    s.close()
json.dump(res, open(os.path.join(OUTD, 'ton_probe.json'), 'w'), indent=1)
