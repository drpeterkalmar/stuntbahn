// Gemeinsame Helfer für Node-Tests (Physik, Generator, Autopilot)
import { buildTrack } from '../../src/track/build.js';
import { pieceCells } from '../../src/track/pieces.js';
import { CollisionWorld } from '../../src/physics/collide.js';
import { Car } from '../../src/physics/car.js';
import { computeProfile } from '../../src/ai/profile.js';
import { Autopilot } from '../../src/ai/autopilot.js';
import { computeIdeal } from '../../src/ai/ideal.js';

export function chain(i, j, d, list, lvl0 = 0) {
  const pieces = [];
  let lvl = lvl0;
  for (const it of list) {
    const [type, m = 1] = Array.isArray(it) ? it : [it];
    pieces.push({ type, i, j, d, m, lvl });
    const r = pieceCells(type, i, j, d, m);
    [i, j, d] = r.next;
    const dl = { rampUp: 1, rampDown: -1 }[type] || 0;
    lvl += dl;
  }
  return { pieces, end: [i, j, d] };
}

export function setup(layout, opt = {}) {
  const t0 = Date.now();
  const track = buildTrack(layout, { treeCount: 0 });
  const t1 = Date.now();
  const world = new CollisionWorld(track);
  const t2 = Date.now();
  const ideal = computeIdeal(track.line);
  const t3 = Date.now();
  const prof = computeProfile(ideal, { jumps: track.jumps, startIdx: track.start.idx, ...opt });
  const t4 = Date.now();
  return { track, world, prof, ideal, times: { build: t1 - t0, grid: t2 - t1, ideal: t3 - t2, prof: t4 - t3 } };
}

export function drive(env, opt = {}) {
  const { track, world, prof, ideal } = env;
  const L = ideal;
  const car = new Car();
  const si = opt.startIdx ?? track.start.idx;
  car.place([L.px[si], L.py[si], L.pz[si]], [L.tx[si], L.ty[si], L.tz[si]], [L.nx[si], L.ny[si], L.nz[si]], opt.v0 || 0);
  const ap = new Autopilot(L, prof);
  ap.tr.reset(si);
  const dt = 1 / 120;
  const log = [];
  let t = 0, maxIdx = si, minNy = 1, maxSp = 0;
  const T = opt.maxTime ?? 60;
  let lastLog = -1;
  while (t < T) {
    const c = ap.control(car);
    car.input.steer = c.steer; car.input.throttle = c.throttle; car.input.brake = c.brake;
    car.surfaceKind = L.loop[ap.tr.idx] || L.tube[ap.tr.idx] ? 1 : 0;
    car.step(dt, world);
    t += dt;
    const idx = ap.tr.idx;
    if (!L.closed) maxIdx = Math.max(maxIdx, idx);
    maxSp = Math.max(maxSp, car.speed());
    if (opt.trace && t - lastLog >= (opt.trace || 0.25)) {
      lastLog = t;
      log.push({ t: +t.toFixed(2), idx, s: +L.s[idx].toFixed(1), v: +car.fwdSpeed().toFixed(1), vt: +prof.vt[idx].toFixed(1), y: +car.pos.y.toFixed(2), upy: +car.frame.u.y.toFixed(2), gnd: car.onGround, d: +ap.tr.dist.toFixed(2), thr: +c.throttle.toFixed(2), st: +c.steer.toFixed(2), g: +car.maxG.toFixed(1) });
    }
    if (car.crash) break;
    if (!L.closed && idx >= L.n - 3) break;
    if (L.closed && ap.tr.lap >= 1 && idx > si) break;
    if (opt.stopIdx && idx >= opt.stopIdx) break;
  }
  return { t, car, crash: car.crash, idx: ap.tr.idx, lap: ap.tr.lap, maxIdx, maxSp, log, maxG: car.maxG };
}
