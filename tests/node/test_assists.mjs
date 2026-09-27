// Phase 4b: alle drei Fahrhilfe-Stufen mit simulierten Spielern (Bots) auf mehreren Strecken
import { generate } from '../../src/track/generator.js';
import { verifySync } from '../../src/track/verify.js';
import { Race } from '../../src/game/race.js';
import { rng, fmtTime } from '../../src/core/util.js';
const DT = 1 / 120;
function bot(kind, seed) {
  const r = rng(seed);
  let noise = 0, nT = 0, delayQ = [];
  return (race) => {
    nT -= DT;
    if (nT <= 0) { noise = r.range(-1, 1); nT = r.range(0.3, 1.2); }
    const ap = race.ap.out;
    switch (kind) {
      case 'nichts': return { steer: 0, throttle: 0, brake: 0 };
      case 'zappelig': return { steer: noise, throttle: 1, brake: 0 };
      case 'normal': { // menschenähnlich: 0,1 s Verzögerung, leichtes Rauschen, Gas/Bremse grob nach Gefühl
        delayQ.push(ap.steer); const st = delayQ.length > 12 ? delayQ.shift() : 0;
        const vt = race.env.prof.vt[race.ap.tr.idx], v = race.car.fwdSpeed();
        return { steer: Math.max(-1, Math.min(1, st + noise * 0.15)), throttle: v < vt * 1.08 ? 1 : 0, brake: v > vt * 1.2 ? 0.7 : 0 };
      }
      case 'schlampig': { // Autopilot-Lenkung verzögert + Rauschen, immer Vollgas außer bei deutlichem Übertempo
        delayQ.push(ap.steer); const st = delayQ.length > 18 ? delayQ.shift() : 0;
        const over = race.car.fwdSpeed() > race.env.prof.vt[race.ap.tr.idx] * 1.25;
        return { steer: Math.max(-1, Math.min(1, st + noise * 0.35)), throttle: over ? 0 : 1, brake: over ? 0.6 : 0 };
      }
      case 'perfekt': return { steer: ap.steer, throttle: ap.throttle, brake: ap.brake };
    }
  };
}
const cases = [['easy', 'nichts'], ['easy', 'zappelig'], ['medium', 'normal'], ['medium', 'schlampig'], ['medium', 'perfekt'], ['original', 'perfekt'], ['original', 'normal'], ['original', 'schlampig']];
let fails = 0;
for (const [seed, diff] of [[20260927, 2], [4711, 3], [1000, 1]]) {
  const v = verifySync(generate(seed, diff));
  for (const [assist, kind] of cases) {
    const race = new Race(v.env, { assist, countdown: 0.5 });
    const b = bot(kind, seed + kind.length);
    let t = 0;
    const lim = (v.apTime || 80) * 4;
    while (t < lim && race.state !== 'finished') {
      race.ap.control(race.car); // Autopilot-Vorschlag aktualisieren (für Bots)
      race.step(DT, b(race)); t += DT;
    }
    const ok = race.state === 'finished';
    const need = !(assist === 'original' && kind !== 'perfekt') && kind !== 'schlampig';  // Stresstests dürfen scheitern
    if (!ok && need) fails++;
    console.log(`${ok ? 'OK  ' : need ? 'FAIL' : 'info'} ${seed}-${diff} ${assist.padEnd(8)} Spieler ${kind.padEnd(9)} Zeit ${ok ? fmtTime(race.finalTime) : '—'} (Autopilot ${fmtTime(v.apTime)})  Crashs ${race.crashes}  Rückspulen ${race.rewinds}  CP ${race.cpNext}/${race.cps.length}`);
  }
}
console.log(fails ? `${fails} Fehlschläge` : 'Alle Fahrhilfe-Stufen spielbar');
process.exit(fails ? 1 : 0);
