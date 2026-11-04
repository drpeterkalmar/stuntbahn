// n44: Generator + prepare für Zufalls-Seeds je Streckenart und Stufe (Hänger-Suche „Strecke bauen …“), Zeit je Strecke.
// node tools/n44_seed_sweep.mjs [anzahl=100] [start=1]
import { generate } from '../src/track/generator.js';
import { prepare } from '../src/track/verify.js';
import { genOpt } from '../src/track/pruefung.js';
import { GEN_V } from '../src/track/defs.js';
const N = +(process.argv[2] || 100), S0 = +(process.argv[3] || 1);
let rnd = 12345 + S0; const r = () => (rnd = (Math.imul(rnd, 1103515245) + 12345) >>> 0);
const seeds = Array.from({ length: N }, () => r() % 1000000);
const out = {};
for (const mode of ['gel', '3d', 'flat']) for (const diff of [1, 2, 3]) {
  let max = 0, sum = 0, fehler = []; const t00 = Date.now();
  for (const seed of seeds) {
    const t0 = Date.now();
    try { prepare(generate(seed, diff, genOpt(mode, 0, GEN_V)), { treeCount: 0 }); } catch (e) { fehler.push(seed + ': ' + String(e && e.message || e).slice(0, 120)); }
    const ms = Date.now() - t0; max = Math.max(max, ms); sum += ms;
    if (ms > 15000) fehler.push(seed + ': ' + ms + ' ms');
  }
  out[mode + '/' + diff] = { n: N, mittel_ms: Math.round(sum / N), max_ms: max, fehler };
  console.log(mode, diff, 'n', N, 'mittel', Math.round(sum / N), 'ms, max', max, 'ms, Fehler', fehler.length, fehler.slice(0, 3).join(' | '), `(${Math.round((Date.now() - t00) / 1000)} s)`);
}
console.log(JSON.stringify(out));
