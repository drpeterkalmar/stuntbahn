// Sprung-Messung (Node): Standard-Schanze auf gerader Strecke, Autopilot fährt an.
// Misst Tempo an der Lippe, Scheitelhöhe über der Lippe (Fahrzeugmitte relativ zur Ruhelage),
// Airtime (alle Räder in der Luft), Weite (Lippe → erster Radkontakt), Aufprall, Crash.
// Aufruf: node tools/jump_measure.mjs [--air 0.7] [--lip 24] [--scale 0.9,1,1.1] [--assist 0|1]
import { chain, setup } from '../tests/node/common.mjs';
import { Car } from '../src/physics/car.js';
import { Autopilot } from '../src/ai/autopilot.js';
import * as pieces from '../src/track/pieces.js';

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
let air = null;
try { air = await import('../src/physics/air.js'); } catch { /* vor der Umstellung: kein Luft-Modul */ }
if (air && arg('air')) air.setAir({ factor: +arg('air') });
if (arg('lip')) pieces.setLip(+arg('lip'));
if (arg('aim')) pieces.JUMP.aim = +arg('aim');
if (arg('landH')) pieces.JUMP.landH = +arg('landH');
if (arg('shape')) pieces.JUMP.landShape = arg('shape');
if (arg('landLen')) pieces.JUMP.landLen = +arg('landLen');
const scales = (arg('scale', '1')).split(',').map(Number);
const assistAir = +arg('assist', '0');

function measure(scale) {
  const c = chain(5, 15, 0, ['start', 'straight', 'straight', 'jump', 'straight', 'straight']);
  const env = setup({ pieces: c.pieces, seed: 1 });
  const L = env.ideal, J = env.track.jumps[0];
  const li = J.lipIdx;
  const lp = [L.px[li], L.py[li], L.pz[li]];
  const h = Math.hypot(L.tx[li], L.tz[li]);
  const fw = [L.tx[li] / h, L.tz[li] / h];
  const car = new Car();
  const si = env.track.start.idx;
  car.place([L.px[si], L.py[si], L.pz[si]], [L.tx[si], L.ty[si], L.tz[si]], [L.nx[si], L.ny[si], L.nz[si]], 0);
  car.assist.air = assistAir; car.assist.magnet = 0;
  const ap = new Autopilot(L, env.prof);
  ap.speedScale = scale;
  ap.tr.reset(si);
  const dt = 1 / 120;
  let t = 0, h0 = null, vLip = null, apex = -1e9, airT = 0, maxAir = 0, land = null, takeoffX = null, lastImpact = 0;
  let prevX = -1e9, pitchLand = null, maxComp = 0, wasAir = false;
  while (t < 30) {
    const o = ap.control(car);
    car.input.steer = o.steer; car.input.throttle = o.throttle; car.input.brake = o.brake;
    car.surfaceKind = L.loop[ap.tr.idx] || L.tube[ap.tr.idx] ? 1 : 0;
    car.step(dt, env.world); t += dt;
    const x = (car.pos.x - lp[0]) * fw[0] + (car.pos.z - lp[2]) * fw[1];
    if (h0 === null && x > -40 && x < -30 && car.onGround === 4) h0 = car.pos.y - L.py[ap.tr.idx]; // Ruhelage über der Fahrbahn
    if (vLip === null && prevX < 0 && x >= 0) vLip = car.speed();
    prevX = x;
    if (x > -2 && !land) apex = Math.max(apex, car.pos.y);
    if (car.onGround === 0 && x > -3) {
      if (!wasAir) takeoffX = x;
      airT += dt; wasAir = true;
    } else if (wasAir) {
      maxAir = Math.max(maxAir, airT);
      if (airT > 0.3 && !land) {
        land = x;
        const F = car.frame; pitchLand = Math.asin(Math.max(-1, Math.min(1, F.f.y))) * 180 / Math.PI;
      }
      airT = 0; wasAir = false;
    }
    if (land && x < land + 25) { lastImpact = Math.max(lastImpact, car.lastImpact); for (const w of car.wheels) maxComp = Math.max(maxComp, w.comp); }
    car.lastImpact = 0;
    if (car.crash) break;
    if (land && x > land + 30) break;
  }
  const lipY = lp[1];
  // Scheitel: Fahrzeugmitte über ihrer Ruhelage auf Lippenhöhe
  const apexOverLip = apex - (lipY + (h0 ?? 0));
  return { scale, vLip: vLip && +vLip.toFixed(1), vbest: +env.prof.jump.vbest.toFixed(1), vmin: +env.prof.jump.vmin.toFixed(1), vmax: +env.prof.jump.vmax.toFixed(1),
    lipY: +lipY.toFixed(2), apex: +apexOverLip.toFixed(2), air: +maxAir.toFixed(2), takeoff: takeoffX && +takeoffX.toFixed(1), weite: land && +land.toFixed(1),
    landAuf: land && +(land - 20).toFixed(1), pitch: pitchLand && +pitchLand.toFixed(0), impact: +lastImpact.toFixed(1), maxComp: +maxComp.toFixed(3), crash: car.crash ? car.crash.reason : '' };
}
const jw = pieces.jumpWindow ? pieces.jumpWindow() : null;
console.log(`Luft-Faktor ${air ? air.AIR.factor : 1} · Lippe ${pieces.JUMP.lipDeg}° · Lippe ${pieces.JUMP.lipH.toFixed(2)} m · Air-Hilfe ${assistAir}` + (jw && jw.air ? ` · Rechnung vbest ${jw.vbest.toFixed(1)}: Flug ${jw.air.toFixed(2)} s, Scheitel ${jw.apex.toFixed(2)} m, Landung ${jw.fl.toFixed(1)} m in der Rampe` : ''));
for (const s of scales) console.log(JSON.stringify(measure(s)));
