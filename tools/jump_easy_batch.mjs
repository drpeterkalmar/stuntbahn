// Generator-Strecken mit Fahrhilfe „Leicht“ (Spieler tut nichts) und ohne Hilfen (Autopilot, streng):
// im Ziel? Crashs? Zusätzlich jede Schanze: Flugzeit + Landeaufprall. Aufruf: node tools/jump_easy_batch.mjs [Seeds=10]
// [--gel] (n22: Gelände-Strecken) [--3d]
import { generate } from '../src/track/generator.js';
import { verifySync } from '../src/track/verify.js';
import { Race } from '../src/game/race.js';
import { daySeed } from '../src/core/util.js';
const N = +(process.argv[2] || 10);
const MODE = process.argv.includes('--gel') ? { gel: true } : process.argv.includes('--3d') ? { d3: true } : {};
const seeds = [daySeed(), 4711, ...Array.from({ length: N - 2 }, (_, k) => 1000 + k * 7919 % 90000)];
const DT = 1 / 120, zero = { steer: 0, throttle: 0, brake: 0 };
let easyOk = 0, tot = 0, easyCrash = 0, jumps = 0, airs = [], worst = 0;
for (const seed of seeds) for (const diff of [1, 2, 3]) {
  const v = verifySync(generate(seed, diff, MODE));
  const race = new Race(v.env, { assist: 'easy', countdown: 0.05 });
  let t = 0, air = 0;
  const lim = Math.max(90, v.env.track.line.total / 7);
  while (t < lim && race.state !== 'finished') {
    race.step(DT, zero); t += DT;
    const c = race.car;
    if (c.onGround === 0 && !c.surfaceKind) air += DT; else { if (air > 0.8) { jumps++; airs.push(air); } air = 0; }
    worst = Math.max(worst, c.lastImpact); c.lastImpact = 0;
  }
  tot++;
  const ok = race.state === 'finished' && !race.crashes;
  if (ok) easyOk++; easyCrash += race.crashes;
  if (!ok) console.log(`Leicht ${seed}-${diff}: ${race.state} Crashs ${race.crashes} ${JSON.stringify(race.crashLog || '')}`);
}
airs.sort((a, b) => a - b);
console.log(`Leicht ohne Crash im Ziel: ${easyOk}/${tot}, Crashs gesamt ${easyCrash}; Sprünge ${jumps}, Flugzeit Median ${airs[airs.length >> 1]?.toFixed(2)} s (min ${airs[0]?.toFixed(2)}, max ${airs[airs.length - 1]?.toFixed(2)}), stärkster Karosserie-/Anschlag-Aufprall ${worst.toFixed(1)} m/s`);
