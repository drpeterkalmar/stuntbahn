// n22: Autopilot-Fahrt auf einer Gelände-Strecke, bei Crash: Ort, Stück, Plan-Flags, Tempo-Verlauf davor
// Aufruf: node tools/gel_crash.mjs seed stufe [assist]
import { generate } from '../src/track/generator.js';
import { prepare } from '../src/track/verify.js';
import { Race } from '../src/game/race.js';
const [seed, diff] = [+process.argv[2], +process.argv[3]];
const lay = generate(seed, diff, { gel: true });
const env = prepare(lay);
const race = new Race(env, { assist: process.argv[4] || 'original', autopilot: true, countdown: 0.05 });
const L = env.track.line, pl = env.track.gel.plan;
const hist = [];
let t = 0;
const desc = (k) => { const p = lay.pieces[k], q = pl.pieces[k]; return `${k}:${p.type}${p.g ? '/' + p.g : ''}${p.tilt0 != null ? '/tilt' : ''}${q.tunnel ? '/TUN' : ''}${q.bridge ? '/BR' : ''}${q.rigid ? '/rig' : ''}`; };
while (t < 300) {
  race.step(1 / 120, { steer: 0, throttle: 0, brake: 0 }); t += 1 / 120;
  const c = race.car, i = race.tracker.idx;
  if (Math.round(t * 120) % 12 === 0) hist.push([t.toFixed(1), i, desc(L.piece[i]), (c.speed() * 3.6).toFixed(0), (env.prof.vt[i] * 3.6).toFixed(0), c.onGround, c.pos.y.toFixed(1), L.py[i].toFixed(1), L.wave[i]]);
  if (race.state === 'finished') { console.log('Ziel', race.finalTime.toFixed(2)); process.exit(0); }
  if (c.crash) {
    console.log('CRASH', c.crash.reason, 't', t.toFixed(2), 'idx', i, desc(L.piece[i]), 'prev', desc(L.piece[i] - 1 >= 0 ? L.piece[i] - 1 : 0), 'next', desc(Math.min(lay.pieces.length - 1, L.piece[i] + 1)));
    for (const h of hist.slice(-(+process.env.N || 14))) console.log('  ', h.join(' '));
    process.exit(1);
  }
}
console.log('Zeitlimit');
