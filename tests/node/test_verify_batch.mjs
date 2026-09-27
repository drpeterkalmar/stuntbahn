// Phase 4: Generator + Autopilot-Prüfung (gleiche Funktion wie im Browser) für viele Seeds × 3 Schwierigkeiten
import { generate } from '../../src/track/generator.js';
import { verifySync } from '../../src/track/verify.js';
import { PIECES } from '../../src/track/pieces.js';
import { daySeed, fmtTime } from '../../src/core/util.js';
const N = +(process.argv[2] || 10);
const seeds = [daySeed(), 4711, ...Array.from({ length: N - 2 }, (_, k) => 1000 + k * 7919 % 90000)];
let ok = 0, tot = 0, fixes = 0, tms = [];
const cnt = {};
for (const seed of seeds) for (const diff of [1, 2, 3]) {
  const t0 = Date.now();
  const r = verifySync(generate(seed, diff));
  const ms = Date.now() - t0; tms.push(ms);
  tot++; if (r.ok) ok++; fixes += r.fixes;
  for (const p of r.layout.pieces) if (PIECES[p.type].stunt) cnt[p.type] = (cnt[p.type] || 0) + 1;
  console.log(`${r.ok ? 'OK  ' : 'FAIL'} ${seed}-${diff} ${r.layout.meta.name.padEnd(24)} ${(r.env.ideal.total / 1000).toFixed(2)} km  Autopilot ${fmtTime(r.apTime)}  entschärft ${r.fixes}  ${ms} ms${r.reason ? '  ' + r.reason : ''}`);
}
tms.sort((a, b) => a - b);
console.log(`\n${ok}/${tot} lösbar, ${fixes} Entschärfungen, Prüfzeit Median ${tms[tms.length >> 1]} ms (max ${tms[tms.length - 1]} ms), Stunts ${JSON.stringify(cnt)}`);
process.exit(ok === tot ? 0 : 1);
