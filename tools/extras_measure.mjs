// Messung der Extras (Node, gleiche Physik wie im Spiel) auf einer unendlichen Asphalt-Ebene:
// Hüpfer (Scheitel, Flugzeit, Weite, Lage) und Nitro (Beschleunigung mit/ohne, Tempo-Gewinn in 3,7 s, Vmax).
// Aufruf: node tools/extras_measure.mjs [--json=datei]
import fs from 'fs';
import { Car, CAR_DEF } from '../src/physics/car.js';
import { MAT } from '../src/track/defs.js';
import { HOP, NITRO, NITRO_TOTAL, nitroLevel, hopModel } from '../src/physics/extras.js';

const DT = 1 / 120;
const args = process.argv.slice(2);
const opt = (k, d) => { const a = args.find((x) => x.startsWith('--' + k + '=')); return a ? a.slice(k.length + 3) : d; };
export const PLANE = {
  ray(ox, oy, oz, dx, dy, dz, len) {
    if (dy >= -1e-9) return null;
    const t = -oy / dy;
    if (t < 0 || t > len) return null;
    return { t, x: ox + dx * t, y: 0, z: oz + dz * t, nx: 0, ny: 1, nz: 0, mat: MAT.ROAD };
  },
};
const wrap = (car) => { if (car.pos.z < -500) car.pos.z += 1000; };

// Hüpfer bei Tempo v (m/s): Federn setzen, halten (Gas nach Bedarf), hüpfen; Scheitel der Fahrzeugmitte,
// Flugzeit (alle Räder frei), Weite, größte Nick-/Rollabweichung, Aufprall
export function hopRun(v, assistAir = 0) {
  const car = new Car();
  car.place([0, 0, 0], [0, 0, -1], [0, 1, 0], v);
  car.assist.air = assistAir;
  for (let k = 0; k < 120; k++) { car.input.throttle = v > 1 ? 0.3 : 0; car.step(DT, PLANE); wrap(car); }
  const y0 = car.pos.y, z0 = car.pos.z, v0 = car.fwdSpeed();
  car.hop(hopModel().lift);
  let t = 0, apex = y0, air = 0, tilt = 0, landed = false, dist = 0, impact = 0;
  while (t < 6) {
    car.input.throttle = 0; car.step(DT, PLANE); t += DT;
    dist += car.fwdSpeed() * DT; wrap(car);
    apex = Math.max(apex, car.pos.y);
    if (car.onGround === 0) air += DT;
    tilt = Math.max(tilt, Math.acos(Math.min(1, car.frame.u.y)) * 180 / Math.PI);
    impact = Math.max(impact, car.lastImpact); car.lastImpact = 0;
    if (air > 0.3 && car.onGround >= 2 && !landed) { landed = true; break; }
  }
  return { v0, apex: apex - y0, air, dist, tilt, crash: car.crash && car.crash.reason, impact, vEnd: car.fwdSpeed() };
}

// Längsbeschleunigung bei Tempo v mit/ohne Nitro (Vollgas, Mittel über 0,1 s)
export function accelAt(v, boost) {
  const car = new Car();
  car.place([0, 0, 0], [0, 0, -1], [0, 1, 0], v);
  for (let k = 0; k < 60; k++) { car.input.throttle = 0.2; car.step(DT, PLANE); wrap(car); }
  car.place([car.pos.x, 0, car.pos.z], [0, 0, -1], [0, 1, 0], v);
  for (let k = 0; k < 30; k++) { car.input.throttle = 1; car.boost = boost; car.step(DT, PLANE); wrap(car); }
  const va = car.fwdSpeed();
  for (let k = 0; k < 12; k++) { car.input.throttle = 1; car.boost = boost; car.step(DT, PLANE); wrap(car); }
  return (car.fwdSpeed() - va) / (12 * DT);
}

// Vollgas ab v0 für T s: Tempo am Ende und Weg, mit Nitro-Hüllkurve (ab t = 0) oder ohne
export function runFor(v0, T, nitro) {
  const car = new Car();
  car.place([0, 0, 0], [0, 0, -1], [0, 1, 0], v0);
  let t = 0, s = 0;
  while (t < T) { car.input.throttle = 1; car.boost = nitro ? nitroLevel(t) : 0; car.step(DT, PLANE); t += DT; s += car.fwdSpeed() * DT; wrap(car); }
  return { v: car.fwdSpeed(), s };
}
// Höchsttempo mit dauerhaftem Nitro bzw. ohne
export function vmax(boost) {
  const car = new Car();
  car.place([0, 0, 0], [0, 0, -1], [0, 1, 0], 100);
  let t = 0, prev = 0, tp = 0, vm = 0;
  while (t < 300) {
    car.input.throttle = 1; car.boost = boost; car.step(DT, PLANE); t += DT; wrap(car);
    vm = Math.max(vm, car.fwdSpeed());
    if (t - tp >= 2) { if (Math.abs(vm - prev) < 0.01) break; prev = vm; tp = t; }
  }
  return vm;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const f1 = (x) => x.toFixed(1).replace('.', ','), f2 = (x) => x.toFixed(2).replace('.', ',');
  const out = { hop: [], accel: [], gain: [] };
  const M = hopModel();
  console.log(`Hüpfer: Wunsch-Scheitel ${HOP.h} m, Absprung ${f2(M.lift)} m/s senkrecht; Nitro ${NITRO.dur} s + ${NITRO.fade} s, k = ${NITRO.k}\n`);
  console.log('| Tempo | Scheitel (Mitte) | Flugzeit | Weite | größte Neigung | Aufprall | Crash |');
  console.log('|---|---|---|---|---|---|---|');
  for (const kmh of [0, 60, 120, 200, 300]) {
    const r = hopRun(kmh / 3.6);
    out.hop.push({ kmh, ...r });
    console.log(`| ${kmh} km/h | ${f2(r.apex)} m | ${f2(r.air)} s | ${Math.round(r.dist)} m | ${f1(r.tilt)}° | ${f1(r.impact)} m/s | ${r.crash || '–'} |`);
  }
  console.log('\n| Tempo | Beschleunigung ohne | mit Nitro | Zuwachs |');
  console.log('|---|---|---|---|');
  for (const kmh of [30, 100, 200, 300, 400, 500]) {
    const a0 = accelAt(kmh / 3.6, 0), a1 = accelAt(kmh / 3.6, 1);
    out.accel.push({ kmh, a0, a1 });
    console.log(`| ${kmh} km/h | ${f1(a0)} m/s² | ${f1(a1)} m/s² | **+${Math.round((a1 / a0 - 1) * 100)} %** |`);
  }
  console.log(`\n| Start | ohne Nitro nach ${f1(NITRO_TOTAL)} s | mit Nitro | Weg ohne / mit |`);
  console.log('|---|---|---|---|');
  for (const kmh of [0, 100, 150, 200, 300]) {
    const a = runFor(kmh / 3.6, NITRO_TOTAL, false), b = runFor(kmh / 3.6, NITRO_TOTAL, true);
    out.gain.push({ kmh, v0: a.v * 3.6, v1: b.v * 3.6, s0: a.s, s1: b.s });
    console.log(`| ${kmh} km/h | ${Math.round(a.v * 3.6)} km/h | **${Math.round(b.v * 3.6)} km/h** | ${Math.round(a.s)} / ${Math.round(b.s)} m |`);
  }
  const vm0 = vmax(0) * 3.6, vm1 = vmax(1) * 3.6;
  out.vmax = { vm0, vm1 };
  console.log(`\nVmax ohne ${Math.round(vm0)} km/h, mit Dauer-Nitro ${Math.round(vm1)} km/h (+${Math.round((vm1 / vm0 - 1) * 100)} %)`);
  if (opt('json', '')) fs.writeFileSync(opt('json', ''), JSON.stringify(out, null, 1));
}
