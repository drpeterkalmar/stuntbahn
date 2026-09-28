// Generator-Strecken auf „Leicht“ (Spieler tut nichts): ohne Extras gegen „Extras automatisch“ (Autopilot
// zündet Nitro und hüpft, wo sicher). Im Ziel? Crashs? Rundenzeit? Aufruf: node tools/extras_batch.mjs [Seeds=10]
// [--json=datei]
import fs from 'fs';
import { generate } from '../src/track/generator.js';
import { verifySync } from '../src/track/verify.js';
import { Race } from '../src/game/race.js';
import { daySeed, fmtTime } from '../src/core/util.js';

const args = process.argv.slice(2);
const N = +(args.find((a) => /^\d+$/.test(a)) || 10);
const jsonOut = (args.find((a) => a.startsWith('--json=')) || '').slice(7);
const seeds = [daySeed(), 4711, ...Array.from({ length: N - 2 }, (_, k) => 1000 + k * 7919 % 90000)];
const DT = 1 / 120, zero = { steer: 0, throttle: 0, brake: 0 };

export function easyLap(env, autoExtras) {
  const race = new Race(env, { assist: 'easy', countdown: 0.05, autoExtras });
  const lim = Math.max(120, env.track.line.total / 6);
  let t = 0, hops = 0, nitros = 0, worst = 0;
  while (t < lim && race.state !== 'finished') {
    race.step(DT, zero); t += DT;
    for (const e of race.events) { if (e.type === 'hop') hops++; if (e.type === 'nitro' && race.state !== 'finished') nitros++; }
    race.events.length = 0;
    worst = Math.max(worst, race.car.lastImpact); race.car.lastImpact = 0;
  }
  return { ok: race.state === 'finished', time: race.finalTime ?? null, crashes: race.crashes, hops, nitros, worst, plan: race.xplan };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const rows = [];
  let ok0 = 0, ok1 = 0, crash0 = 0, crash1 = 0, faster = 0, same = 0, slower = 0, hopN = 0, sum = 0;
  for (const seed of seeds) for (const diff of [1, 2, 3]) {
    const v = verifySync(generate(seed, diff));
    const a = easyLap(v.env, false), b = easyLap(v.env, true);
    ok0 += a.ok && !a.crashes; ok1 += b.ok && !b.crashes; crash0 += a.crashes; crash1 += b.crashes;
    const d = a.ok && b.ok ? b.time - a.time : null;
    if (d !== null) { sum += d; if (d < -0.02) faster++; else if (d > 0.02) slower++; else same++; }
    hopN += b.hops > 0;
    rows.push({ key: `${seed}-${diff}`, a, b, d });
    console.log(`${seed}-${diff}: ohne ${a.ok ? fmtTime(a.time) : '✗'} (${a.crashes} Crashs) · auto ${b.ok ? fmtTime(b.time) : '✗'} (${b.crashes} Crashs, Nitro ${b.nitros}, Hüpfer ${b.hops}) · ${d === null ? '–' : (d > 0 ? '+' : '') + d.toFixed(2) + ' s'}`);
  }
  const tot = rows.length;
  console.log(`\nLeicht ohne Crash im Ziel: ohne Extras ${ok0}/${tot}, mit „Extras automatisch“ ${ok1}/${tot}; Crashs ${crash0} → ${crash1}`);
  console.log(`Zeit: schneller ${faster}, gleich ${same}, langsamer ${slower}; im Mittel ${(sum / tot).toFixed(2)} s; Strecken mit Hüpfer ${hopN}/${tot}`);
  if (jsonOut) fs.writeFileSync(jsonOut, JSON.stringify(rows.map((r) => ({ key: r.key, d: r.d, a: { ...r.a, plan: undefined }, b: { ...r.b, plan: undefined } })), null, 1));
  if (ok1 < ok0 || slower) process.exitCode = 1;
}
