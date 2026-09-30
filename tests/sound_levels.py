# Pegel aller Klänge (Spitze/RMS in dBFS) nach dem Freischalten per Tap. Seit n16 auch die Aufnahmen (assets/snd/):
# geladen, Decoder-Versatz, jede Spitze < 0 dBFS, Motor-Loops gleich laut (± 1,5 dB) und nahtlos (Sprung an der
# Loop-Naht nicht größer als die typischen Sprünge im Loop).
import sys, time, json
sys.path.insert(0, 'tests')
from util import *
fails = []
with Server() as srv, sync_playwright() as pw:
    s = Session(pw, srv.base, device=DESKTOP)
    s.open('?nosw&seed=1000&d=1')
    s.tap('button[data-a=start]'); time.sleep(5)
    lv = s.ev("""(() => { const S = window.__soundRef, B = S.bank; const db = (x) => +(20 * Math.log10(Math.max(1e-9, x))).toFixed(1);
      const m = (buf) => { const a = buf.getChannelData(0); let pk = 0, sq = 0, dd = 0; for (let i = 0; i < a.length; i++) { const v = Math.abs(a[i]); if (v > pk) pk = v; sq += a[i] * a[i]; if (i) dd += Math.abs(a[i] - a[i - 1]); }
        return { peak_dBFS: db(pk), rms_dBFS: db(Math.sqrt(sq / a.length)), s: +(a.length / buf.sampleRate).toFixed(2), naht: +(Math.abs(a[0] - a[a.length - 1]) / (dd / a.length)).toFixed(2) }; };
      const o = {}; B.engine.forEach((e) => o['synth_motor_' + e.rpm] = m(e.buf)); for (const k of ['tire', 'wind', 'crash', 'thump', 'beep', 'go', 'cp', 'finish']) o['synth_' + k] = m(B[k]);
      const R = B.rec; o.rec = !!R;
      if (R) { R.on.forEach((e) => o['last_' + e.name + '_' + e.rpm] = m(e.buf)); R.off.forEach((e) => o['schub_' + e.name + '_' + e.rpm] = m(e.buf));
        for (const k of ['scrape', 'thud', 'hood', 'debris', 'glass']) o[k] = m(R[k]); R.tire.forEach((b, i) => o['reifen' + i] = m(b)); R.crunch.forEach((b, i) => o['blech' + i] = m(b));
        R.land.forEach((b, i) => o['landung' + i] = m(b)); R.pop.forEach((b, i) => o['knall' + i] = m(b)); o.versatz = R.offset; }
      o.ctx = S.ctx.state; o.sampleRate = S.ctx.sampleRate; o.laeuft = S.running; o.stimmen = S.nodes && S.nodes.voices ? S.nodes.voices.size : null; return o; })()""")
    print(json.dumps(lv, indent=1))
    rec = {k: v for k, v in lv.items() if isinstance(v, dict) and not k.startswith('synth_')}
    eng = [v['rms_dBFS'] for k, v in rec.items() if k.startswith(('last_', 'schub_'))]
    loops = {k: v for k, v in rec.items() if k.startswith(('last_', 'schub_', 'reifen')) or k == 'scrape'}
    def check(ok, msg):
        print(('OK   ' if ok else 'FAIL ') + msg)
        if not ok: fails.append(msg)
    check(lv['rec'] and lv['laeuft'], f"Aufnahmen geladen und Ton läuft (Decoder-Versatz {lv.get('versatz')} Samples)")
    check(all(v['peak_dBFS'] < 0 for v in rec.values()), 'keine Aufnahme übersteuert (Spitze < 0 dBFS)')
    check(len(eng) == 11 and max(eng) - min(eng) <= 3.0, f'Motor-Loops gleich laut: {min(eng)} … {max(eng)} dBFS (Spanne ≤ 3 dB nach AAC)')
    check(all(v['naht'] <= 3 for v in loops.values()), 'Loop-Nähte glatt (Sprung ≤ 3× typischer Sprung): ' + ', '.join(f"{k} {v['naht']}" for k, v in loops.items()))
    print('errors', s.errors[:4])
    check(not s.errors, '0 Seitenfehler')
    s.close()
    # Rückfall: Tondatei nicht ladbar → bisheriger Synthesizer spielt; ?snd=alt → Synthesizer (A/B)
    for name, q, block in [('Rückfall (Datei fehlt)', '?nosw&seed=1000&d=1', True), ('?snd=alt', '?nosw&snd=alt&seed=1000&d=1', False)]:
        s = Session(pw, srv.base, device=DESKTOP)
        if block: s.pg.route('**/sfx.m4a', lambda r: r.abort())
        s.open(q); s.tap('button[data-a=start]'); time.sleep(4)
        st = s.ev("(() => { const S = window.__soundRef; return { running: S.running, rec: !!(S.bank && S.bank.rec), synth: !!(S.bank && S.bank.engine.length === 4) }; })()")
        errs = [e for e in s.errors if 'sfx.m4a' not in e and 'Failed to load resource' not in e]   # (der absichtlich blockierte Abruf)
        check(st['running'] and not st['rec'] and st['synth'] and not errs, f'{name}: Synthesizer spielt {st}, Fehler {errs[:2]}')
        s.close()
print('FEHLER: ' + '; '.join(fails) if fails else 'Ton-Pegel ok')
sys.exit(1 if fails else 0)
