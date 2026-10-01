// Lösbarkeitsprüfung: Autopilot fährt eine Runde; Crash → Element an der Stelle entschärfen, neu prüfen.
// Liefert die (ggf. entschärfte) Strecke + Autopilot-Rundenzeit. Läuft in Häppchen (async), damit die
// Oberfläche flüssig bleibt; in Node synchron nutzbar über verifySync.
import { buildTrack } from './build.js';
import { CollisionWorld } from '../physics/collide.js';
import { computeIdeal } from '../ai/ideal.js';
import { computeProfile } from '../ai/profile.js';
import { Race } from '../game/race.js';
import { defuse } from './generator.js';

const DT = 1 / 120;

export function prepare(layout, opt = {}) {
  const track = buildTrack(layout, opt);
  const world = new CollisionWorld(track);
  const ideal = computeIdeal(track.line, { track });
  const prof = computeProfile(ideal, { jumps: track.jumps, startIdx: track.start.idx });
  return { track, world, ideal, prof, layout };
}

function* lapGen(env, maxTime) {
  const race = new Race(env, { assist: 'original', autopilot: true, countdown: 0.05 });
  let t = 0;
  while (t < maxTime) {
    for (let k = 0; k < 240 && t < maxTime; k++) {
      race.step(DT, { steer: 0, throttle: 0, brake: 0 });
      t += DT;
      if (race.state === 'finished' || race.car.crash || race.state === 'wreck') return { race, t };
    }
    yield t;
  }
  return { race, t };
}

async function runLap(env, maxTime, onProgress) {
  const g = lapGen(env, maxTime);
  for (;;) {
    const r = g.next();
    if (r.done) return r.value;
    onProgress && onProgress(r.value / maxTime);
    await new Promise((res) => setTimeout(res, 0));
  }
}
function runLapSync(env, maxTime) {
  const g = lapGen(env, maxTime);
  for (;;) { const r = g.next(); if (r.done) return r.value; }
}

function evaluate(env, res) {
  const { race, t } = res;
  if (race.state === 'finished') return { ok: true, time: race.finalTime };
  const L = env.track.line;
  const idx = race.tracker.idx;
  return { ok: false, piece: L.piece[idx], reason: race.car.crash ? race.car.crash.reason : 'Zeitlimit', t };
}

export async function verify(layout, onProgress, maxFix = 6) {
  let fixes = 0, env = null;
  for (let it = 0; it <= maxFix; it++) {
    env = prepare(layout);
    const lim = Math.max(60, env.track.line.total / 8);
    const res = await runLap(env, lim, (p) => onProgress && onProgress(p, fixes));
    const ev = evaluate(env, res);
    if (ev.ok) return { env, layout, apTime: ev.time, fixes, ok: true };
    if (!defuse(layout, ev.piece)) return { env, layout, apTime: null, fixes, ok: false, reason: ev.reason };
    fixes++;
  }
  return { env, layout, apTime: null, fixes, ok: false };
}

export function verifySync(layout, maxFix = 6) {
  let fixes = 0, env = null;
  for (let it = 0; it <= maxFix; it++) {
    env = prepare(layout);
    const lim = Math.max(60, env.track.line.total / 8);
    const ev = evaluate(env, runLapSync(env, lim));
    if (ev.ok) return { env, layout, apTime: ev.time, fixes, ok: true };
    if (maxFix === 0 || !defuse(layout, ev.piece)) return { env, layout, apTime: null, fixes, ok: false, reason: ev.reason, piece: ev.piece };
    fixes++;
  }
  return { env, layout, apTime: null, fixes, ok: false };
}

// Probefahrt importierter Strecken: Autopilot ohne Hilfen, ohne Entschärfen (die Strecke bleibt, wie sie
// ist). Liefert Referenzzeit oder die Stelle, an der der Autopilot scheitert.
export async function probeLap(env, onProgress) {
  const lim = Math.max(90, env.track.line.total / 7);
  const ev = evaluate(env, await runLap(env, lim, onProgress));
  if (ev.ok) return { ok: true, time: ev.time };
  const pc = env.layout.pieces[ev.piece];
  return { ok: false, time: null, reason: ev.reason, kind: pc ? pc.kind : '' };
}
