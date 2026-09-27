// Generator: Geschlossenheit, keine Überlappung, Autopilot-Runde für viele Seeds × 3 Schwierigkeiten
import { generate, defuse } from '../../src/track/generator.js';
import { pieceCells, PIECES } from '../../src/track/pieces.js';
import { setup, drive } from './common.mjs';
const N = +(process.argv[2] || 12);
const verbose = process.argv.includes('-v');
let fails = 0, total = 0;
const stats = {};
for (let seed = 1; seed <= N; seed++) for (const diff of [1, 2, 3]) {
  total++;
  const lay = generate(seed * 1013 + 17, diff);
  // Geschlossen + keine Zellen doppelt
  const cells = new Map();
  let ok = true, msg = '';
  for (const [k, p] of lay.pieces.entries()) {
    const r = pieceCells(p.type, p.i, p.j, p.d, p.m);
    for (const c of r.cells) { const kk = c.join(','); if (cells.has(kk)) { ok = false; msg = `Überlappung ${kk} (${p.type} / ${cells.get(kk)})`; } cells.set(kk, p.type); }
    stats[p.type] = (stats[p.type] || 0) + 1;
  }
  const last = lay.pieces[lay.pieces.length - 1], first = lay.pieces[0];
  const nx = pieceCells(last.type, last.i, last.j, last.d, last.m).next;
  if (nx[0] !== first.i || nx[1] !== first.j || nx[2] !== first.d) { ok = false; msg += ` offen: Ende ${nx} vs Start ${first.i},${first.j},${first.d}`; }
  // Autopilot-Runde mit Entschärfen
  let fixes = 0, res = null, env = null;
  if (ok) {
    for (let it = 0; it < 6; it++) {
      env = setup(lay);
      if (!env.track.line.closed) { ok = false; msg += ' Linie nicht geschlossen'; break; }
      res = drive(env, { maxTime: 150, startIdx: env.track.start.idx - 1 });
      if (!res.crash && res.lap >= 1) break;
      const pi = env.track.line.piece[res.idx];
      const typ = lay.pieces[pi] && lay.pieces[pi].type;
      if (!defuse(lay, pi)) { ok = false; msg += ` Crash an ${typ} (nicht entschärfbar): ${res.crash ? res.crash.reason : 'hängt'}`; break; }
      fixes++;
      if (verbose) console.log('   entschärft', typ, 'wegen', res.crash ? res.crash.reason + ' ' + JSON.stringify(res.crash.info || {}) : 'Zeitlimit');
    }
    if (res && (res.crash || res.lap < 1)) ok = false;
  }
  if (!ok) fails++;
  const types = lay.pieces.map((p) => p.type).filter((t) => PIECES[t] && PIECES[t].stunt);
  console.log(`${ok ? 'OK  ' : 'FAIL'} seed ${seed * 1013 + 17} d${diff} ${lay.meta.name}: ${lay.pieces.length} Teile, Linie ${env ? env.track.line.total.toFixed(0) : '?'} m, Runde ${res ? res.t.toFixed(1) : '?'} s, Fixes ${fixes}, Stunts [${types.join(',')}] ${msg}`);
}
console.log(`${total - fails}/${total} OK`, JSON.stringify(stats));
process.exit(fails ? 1 : 0);
