// Import-Sprünge messen: Beispielstrecke (oder .TRK aus trk_local/) mit Fahrhilfe „Leicht“ fahren,
// jede Flugphase > 0,5 s: Flugzeit und Höhe über dem Absprung. Aufruf:
// node tools/jump_measure_trk.mjs [demo-rundkurs|pfad/in/trk_local] [--air 1]
import fs from 'fs';
import { parseTrk } from '../src/track/trk.js';
import { trkToLayout } from '../src/track/trkimport.js';
import { prepare } from '../src/track/verify.js';
import { Race } from '../src/game/race.js';
import { showcaseBytes } from '../src/track/showcase.js';
import { setAir, AIR } from '../src/physics/air.js';
const id = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : 'demo-rundkurs';
const ai = process.argv.indexOf('--air'); if (ai > 0) setAir({ factor: +process.argv[ai + 1] });
const bytes = id.startsWith('demo-') ? showcaseBytes(id) : fs.readFileSync(new URL('../trk_local/' + id, import.meta.url));
const { layout } = trkToLayout(parseTrk(bytes, id));
const env = prepare(layout, { treeCount: 0 });
const race = new Race(env, { assist: 'easy', countdown: 0.05 });
const zero = { steer: 0, throttle: 0, brake: 0 };
let t = 0, air = 0, y0 = 0, ymax = 0, v0 = 0;
const out = [];
while (t < 400 && race.state !== 'finished') {
  race.step(1 / 120, zero); t += 1 / 120;
  const c = race.car;
  if (c.onGround === 0 && !c.surfaceKind) { if (!air) { y0 = c.pos.y; v0 = c.speed(); ymax = y0; } air += 1 / 120; ymax = Math.max(ymax, c.pos.y); }
  else { if (air > 0.5) out.push({ t: +t.toFixed(1), v: +v0.toFixed(1), air: +air.toFixed(2), hoch: +(ymax - y0).toFixed(2) }); air = 0; }
}
console.log(`${id} · Luft-Faktor ${AIR.factor} · ${race.state} ${race.state === 'finished' ? race.finalTime.toFixed(1) + ' s' : ''} · Crashs ${race.crashes}`);
for (const o of out) console.log(JSON.stringify(o));
