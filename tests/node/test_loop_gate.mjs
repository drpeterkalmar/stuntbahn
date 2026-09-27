// GATE Phase 2: Autopilot fährt Ebene → Schanze → Steilkurve → Looping sauber durch.
import { chain, setup, drive } from './common.mjs';
const trace = process.argv.includes('--trace');
function run(name, list, opt = {}) {
  const c = chain(5, 15, 0, list);
  const env = setup({ pieces: c.pieces, seed: 1 });
  const L = env.track.line;
  const r = drive(env, { trace: trace ? 0.25 : 0, maxTime: 60, ...opt });
  const ok = !r.crash && r.idx >= L.n - 4;
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}: t=${r.t.toFixed(1)}s idx ${r.idx}/${L.n - 1} vmax ${(r.maxSp * 3.6).toFixed(0)} km/h maxG ${r.maxG.toFixed(1)} ${r.crash ? 'CRASH ' + r.crash.reason + ' @(' + r.crash.pos.x.toFixed(1) + ',' + r.crash.pos.y.toFixed(1) + ',' + r.crash.pos.z.toFixed(1) + ')' : ''}  [build ${env.times.build}ms grid ${env.times.grid}ms ideal ${env.times.ideal}ms prof ${env.times.prof}ms, tris ${env.track.col.mat.length}]`);
  if (env.prof.infeasible.length) console.log('   unmachbar an', env.prof.infeasible.slice(0, 5));
  if (trace || !ok) for (const l of r.log) console.log('   ', JSON.stringify(l));
  return ok;
}
let all = true;
all &= run('Ebene', ['start', 'straight', 'straight', 'straight', 'straight', 'straight']);
all &= run('Kurven', ['start', 'straight', ['turnS', 1], 'straight', ['turnL', -1], 'straight', 'straight']);
all &= run('Schanze', ['start', 'straight', 'straight', 'jump', 'straight', 'straight']);
all &= run('Steilkurve', ['start', 'straight', 'straight', ['bank', 1], 'straight', 'straight']);
all &= run('Looping', ['start', 'straight', 'straight', 'loop', 'straight', 'straight']);
all &= run('Röhre', ['start', 'straight', 'tube', 'straight', 'straight']);
all &= run('Rampe+Brücke', ['start', 'straight', 'rampUp', 'bridge', 'straight', 'rampDown', 'straight']);
all &= run('Kuppe+Wellen+Schikane', ['start', 'straight', 'crest', 'bumps', ['chicane', 1], 'straight', 'straight']);
all &= run('Alles', ['start', 'straight', 'jump', 'straight', ['bank', 1], 'straight', 'loop', 'straight', ['turnL', 1], 'tube', 'straight']);
console.log(all ? 'GATE BESTANDEN' : 'GATE NICHT BESTANDEN');
process.exit(all ? 0 : 1);
