// n19 B: Fahrhilfen auf 3D-Strecken mit simulierten Spielern. Leicht (Hände weg / zappelig) kommt ohne Absturz ins
// Ziel; Mittel mit menschenähnlichem Spieler ins Ziel; Absturz von der Hochstraße führt zum Reset (+5 s) wie jeder
// Crash; Crash-Gründe und Absturz-Zahl je Stufe werden ausgegeben (Bericht).
import { generate } from '../../src/track/generator.js';
import { verifySync } from '../../src/track/verify.js';
import { Race } from '../../src/game/race.js';
import { rng, fmtTime } from '../../src/core/util.js';
const DT = 1 / 120;
function bot(kind, seed) {
  const r = rng(seed);
  let noise = 0, nT = 0; const q = [];
  return (race) => {
    nT -= DT;
    if (nT <= 0) { noise = r.range(-1, 1); nT = r.range(0.3, 1.2); }
    const ap = race.ap.out;
    if (kind === 'nichts') return { steer: 0, throttle: 0, brake: 0 };
    if (kind === 'zappelig') return { steer: noise, throttle: 1, brake: 0 };
    q.push(ap.steer); const st = q.length > 12 ? q.shift() : 0;
    const vt = race.env.prof.vt[race.ap.tr.idx], v = race.car.fwdSpeed();
    return { steer: Math.max(-1, Math.min(1, st + noise * 0.15)), throttle: v < vt * 1.08 ? 1 : 0, brake: v > vt * 1.2 ? 0.7 : 0 };
  };
}
const N = +(process.argv[2] || 6);
let fails = 0; const falls = {};
const seeds = [20260930, 4711, ...Array.from({ length: N - 2 }, (_, k) => 3000 + k * 7919 % 90000)];
for (const seed of seeds) for (const diff of [1, 2, 3]) {
  const v = verifySync(generate(seed, diff, { d3: true }));
  for (const [assist, kind] of [['easy', 'nichts'], ['easy', 'zappelig'], ['medium', 'normal']]) {
    const race = new Race(v.env, { assist, countdown: 0.5 });
    const b = bot(kind, seed + kind.length);
    const reasons = {};
    race.on && 0;
    let t = 0, lastCrash = null;
    const lim = (v.apTime || 80) * 4;
    while (t < lim && race.state !== 'finished') {
      race.ap.control(race.car);
      race.step(DT, b(race)); t += DT;
      if (race.car.crash && race.car.crash !== lastCrash) { lastCrash = race.car.crash; reasons[race.car.crash.reason] = (reasons[race.car.crash.reason] || 0) + 1; if (process.env.V && race.car.crash.reason === 'Abgestürzt') { const L = race.env.track.line, i = race.tracker.idx, pc = race.env.layout.pieces[L.piece[i]]; console.log('   Absturz bei', pc.type, pc.lvl, pc.h1, 'Auto y', race.car.pos.y.toFixed(1), 'Linie y', L.py[i].toFixed(1), 'dist', race.tracker.dist.toFixed(1), 'high', race.high[i]); } }
    }
    const ok = race.state === 'finished';
    const fell = reasons['Abgestürzt'] || 0;
    const k = assist + '/' + kind; falls[k] = (falls[k] || 0) + fell;
    const need = ok && (assist !== 'easy' || fell === 0);
    if (!need) fails++;
    console.log(`${need ? 'OK  ' : 'FAIL'} ${seed}-${diff}-3d ${assist.padEnd(7)} ${kind.padEnd(9)} ${ok ? fmtTime(race.finalTime) : '—'} (AP ${fmtTime(v.apTime)}) Crashs ${race.crashes} ${JSON.stringify(reasons)}`);
  }
}
// Echter Absturz: Auto fährt auf der Hochstraße, wird seitlich über die Brüstung versetzt → „Abgestürzt“, Reset +5 s
{
  const v = verifySync(generate(4711, 3, { d3: true }));
  const race = new Race(v.env, { assist: 'medium', countdown: 0.1 });
  let t = 0, done = false, reason = null, pen0 = 0;
  while (t < 200 && !done) {
    race.ap.control(race.car);
    const o = race.ap.out;
    race.step(DT, { steer: o.steer, throttle: o.throttle, brake: o.brake }); t += DT;
    const i = race.tracker.idx, L = race.env.track.line;
    if (!reason && race.high[i] && race.time - (race.upT ?? -9) < 0.05 && L.py[i] > 5.5 && race.car.onGround > 3 && !race.car.crash) {
      pen0 = race.penalties;
      race.car.pos.x += L.bx[i] * 11; race.car.pos.z += L.bz[i] * 11; race.car.pos.y += 0.5;
      for (let k = 0; k < 600 && !race.car.crash; k++) { race.step(DT, { steer: 0, throttle: 0, brake: 0 }); t += DT; }
      reason = race.car.crash ? race.car.crash.reason : 'kein Crash';
      for (let k = 0; k < 600 && race.car.crash; k++) { race.step(DT, { steer: 0, throttle: 0, brake: 0 }); t += DT; }
      done = true;
    }
  }
  const ok = ['Abgestürzt', 'Aufprall', 'Harte Landung'].includes(reason) && race.penalties === pen0 + 1 && race.state === 'running';
  if (!ok) fails++;
  console.log(`${ok ? 'OK  ' : 'FAIL'} Absturz von der Hochstraße: ${reason}, Strafen ${pen0} → ${race.penalties}, danach ${race.state}, Auto wieder auf ${race.car.pos.y.toFixed(1)} m`);
}
console.log(`Abstürze je Fahrhilfe/Spieler: ${JSON.stringify(falls)}`);
console.log(fails ? `${fails} Fälle nicht im Ziel bzw. Absturz auf Leicht` : 'Fahrhilfen auf 3D-Strecken: alle im Ziel, Leicht ohne Absturz');
process.exit(fails ? 1 : 0);
