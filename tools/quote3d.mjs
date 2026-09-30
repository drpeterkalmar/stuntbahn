// n19: Lösbarkeit + Bauzeit je Stufe: N Seeds bauen und per Autopilot fahren (wie im Spiel: verifySync mit Entschärfen).
// Aufruf: node tools/quote3d.mjs [N=300] [--3d] [--von=K] → eine Zeile je Stufe + JSON unter tests/out/n19/.
//   ok0 = ohne Entschärfen im Ziel, ok = mit Entschärfen (defuse) im Ziel, fix = Entschärfungen, gen/bau = ms je Strecke
import fs from 'fs';
import { generate } from '../src/track/generator.js';
import { verifySync, prepare } from '../src/track/verify.js';
const N = +(process.argv.find((a) => /^\d+$/.test(a)) || 300);
const d3 = process.argv.includes('--3d');
const von = +((process.argv.find((a) => a.startsWith('--von=')) || '=0').split('=')[1]);
const seeds = Array.from({ length: N }, (_, k) => 1000 + (k + von) * 7919 % 90000);
const out = {};
for (const diff of [1, 2, 3]) {
  const r = { n: 0, ok0: 0, ok: 0, fix: 0, gen: [], bau: [], fails: [], levels: [], cross: 0 };
  for (const seed of seeds) {
    const t0 = performance.now();
    const lay = generate(seed, diff, d3 ? { d3: true } : {});
    const t1 = performance.now();
    prepare(lay);   // Bau (Strecke, Kollision, Ideallinie, Profil) wie beim Laden
    const t2 = performance.now();
    const v = verifySync(lay);
    r.n++; r.gen.push(t1 - t0); r.bau.push(t2 - t1);
    if (v.ok) { r.ok++; if (!v.fixes) r.ok0++; } else r.fails.push(`${seed}: ${v.reason || '?'}`);
    r.fix += v.fixes;
    if (lay.meta.levels != null) r.levels.push(lay.meta.levels);
    if (lay.meta.crossings) r.cross++;
  }
  const med = (a) => { const b = [...a].sort((x, y) => x - y); return +b[b.length >> 1].toFixed(1); };
  const row = { stufe: diff, n: r.n, ok0: r.ok0, ok: r.ok, quote: +(100 * r.ok / r.n).toFixed(1), quote0: +(100 * r.ok0 / r.n).toFixed(1), fixes: r.fix, gen_ms: med(r.gen), bau_ms: med(r.bau), ebenen_max: r.levels.length ? Math.max(...r.levels) : 0, kreuzung: r.cross, fails: r.fails.slice(0, 12) };
  out[diff] = row;
  console.log(JSON.stringify(row));
}
fs.mkdirSync('tests/out/n19', { recursive: true });
fs.writeFileSync(`tests/out/n19/quote_${d3 ? "3d" : "flach"}_${N}_${von}.json`, JSON.stringify(out, null, 1));
