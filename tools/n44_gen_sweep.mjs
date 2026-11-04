// n44: Generator + prepare für viele Seeds je Streckenart/Stufe, Zeit je Strecke (Hänger-Suche „Strecke bauen …“).
// node tools/n44_gen_sweep.mjs [seeds…]   ohne Seeds: Tagesstrecken 25.10.–10.11.2026
import { generate } from '../src/track/generator.js';
import { prepare } from '../src/track/verify.js';
import { genOpt } from '../src/track/pruefung.js';
import { GEN_V } from '../src/track/defs.js';
let seeds = process.argv.slice(2).map(Number);
if (!seeds.length) { for (let d = new Date(2026, 9, 25); d <= new Date(2026, 10, 10); d.setDate(d.getDate() + 1)) seeds.push(d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate()); }
let max = 0;
for (const seed of seeds) for (const mode of ['gel', '3d', 'flat']) for (const diff of [1, 2, 3]) {
  const t0 = Date.now(); let err = '';
  try { const lay = generate(seed, diff, genOpt(mode, 0, GEN_V)); prepare(lay, { treeCount: 0 }); } catch (e) { err = String(e && e.stack || e).slice(0, 300); }
  const ms = Date.now() - t0; max = Math.max(max, ms);
  if (err || ms > 3000) console.log('AUFFAELLIG', seed, mode, diff, ms + ' ms', err);
}
console.log('fertig', seeds.length, 'Seeds, max', max, 'ms');
