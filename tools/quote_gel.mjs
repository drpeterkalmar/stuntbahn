// n22: Lösbarkeit der Gelände-Strecken je Stufe: N Seeds bauen und per Autopilot fahren (wie im Spiel: verifySync mit
// Entschärfen). ok0 = ohne Entschärfen im Ziel. Fehlschläge mit Grund und Stück. Aufruf:
// node tools/quote_gel.mjs [N=300] [--stufe=2] [--von=K] → Zeile je Stufe + JSON unter tests/out/n22/
import fs from 'fs';
import { generate } from '../src/track/generator.js';
import { verifySync, prepare } from '../src/track/verify.js';
const N = +(process.argv.find((a) => /^\d+$/.test(a)) || 300);
const von = +((process.argv.find((a) => a.startsWith('--von=')) || '=0').split('=')[1]);
const st = process.argv.find((a) => a.startsWith('--stufe='));
const diffs = st ? [+st.split('=')[1]] : [1, 2, 3];
const seeds = Array.from({ length: N }, (_, k) => 1000 + (k + von) * 7919 % 90000);
const out = {};
for (const diff of diffs) {
  const r = { n: 0, ok0: 0, ok: 0, fix: 0, gen: [], bau: [], fails: [], why: {}, ap: [] };
  for (const seed of seeds) {
    const t0 = performance.now();
    const lay = generate(seed, diff, { gel: true });
    const t1 = performance.now();
    prepare(lay);
    const t2 = performance.now();
    const orig = lay.pieces.map((p) => p.type + (p.g ? '/' + p.g : ''));
    const v = verifySync(lay);
    r.n++; r.gen.push(t1 - t0); r.bau.push(t2 - t1);
    if (v.ok) { r.ok++; if (!v.fixes) { r.ok0++; r.ap.push(v.apTime); } }
    if (!v.ok || v.fixes) {
      // erste Ursache: einmal ohne Entschärfen fahren
      const l0 = generate(seed, diff, { gel: true }), v0 = verifySync(l0, 0);
      const p0 = v0.ok ? null : l0.pieces[v0.env ? v0.env.track.line.piece[0] : 0];
      const why = v0.ok ? 'ok' : `${v0.reason || '?'} @ ${(v0.layout.pieces[(v0.piece ?? -1)] || {}).type || '?'}`;
      r.fails.push(`${seed}: ${v.ok ? 'entschärft ' + v.fixes : 'FEHLER ' + v.reason} (${why})`);
      void p0;
    }
    r.fix += v.fixes;
  }
  const med = (a) => { const b = [...a].sort((x, y) => x - y); return b.length ? +b[b.length >> 1].toFixed(1) : 0; };
  const row = { stufe: diff, n: r.n, ok0: r.ok0, ok: r.ok, quote0: +(100 * r.ok0 / r.n).toFixed(1), quote: +(100 * r.ok / r.n).toFixed(1), fixes: r.fix, gen_ms: med(r.gen), bau_ms: med(r.bau), ap_med: med(r.ap), fails: r.fails.slice(0, 20) };
  out[diff] = row;
  console.log(JSON.stringify(row));
}
fs.mkdirSync('tests/out/n22', { recursive: true });
fs.writeFileSync(`tests/out/n22/quote_gel_${N}_${von}_${diffs.join('')}.json`, JSON.stringify(out, null, 1));
