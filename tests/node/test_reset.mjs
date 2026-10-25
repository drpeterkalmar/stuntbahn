// Totalschaden aus (Standard): jeder Crash → Fahrbahn-Reset vor das Element, +5 s, Uhr läuft durch.
// Totalschaden an: bisheriges Verhalten (Wrack, Mittel/Leicht zurückspulen, Original vor das Element).
// Echte Crashs per Physik: Looping zu langsam (Überschlag), Sprung zu langsam (Absturz), quer gegen die
// Brückenwand (Aufprall). Danach fährt der Autopilot (bzw. auf Leicht der „Spieler nichts“) ins Ziel.
import { generate } from '../../src/track/generator.js';
import { verifySync } from '../../src/track/verify.js';
import { Race, PENALTY, REC_HZ, REC_STRIDE } from '../../src/game/race.js';
import { Replay } from '../../src/game/replay.js';
import { modeKey, abMode } from '../../src/game/store.js';
import { fmtTime, rng } from '../../src/core/util.js';

const DT = 1 / 120;
let fails = 0;
const check = (ok, msg) => { if (!ok) fails++; console.log(`${ok ? 'OK  ' : 'FAIL'} ${msg}`); };

function player(kind, race, r) {
  race.ap.control(race.car); // Autopilot-Vorschlag aktualisieren
  const a = race.ap.out;
  if (kind === 'nichts') return { steer: 0, throttle: 0, brake: 0 };
  if (kind === 'zappelig') return { steer: r.range(-1, 1), throttle: 1, brake: 0 };
  return { steer: a.steer, throttle: a.throttle, brake: a.brake }; // perfekt
}

// Crash auslösen: Auto an eine kritische Stelle setzen (echte Physik entscheidet)
function induce(race, kind) {
  const T = race.env.track, L = T.line, car = race.car;
  if (kind === 'Looping') {
    const pc = T.pieces.find((p) => p.type === 'loop');
    race.place(pc.lineStart + Math.round((pc.lineEnd - pc.lineStart) * 0.5), 2); // kopfüber, fast Stillstand
  } else if (kind === 'Sprung') {
    race.place(T.jumps[0].lipIdx - 2, 5); // viel zu langsam über die Kante
  } else {
    const pc = T.pieces.find((p) => p.type === 'bridge');
    const i = pc.lineStart + 4;
    race.place(i, 0);
    car.place([L.px[i], L.py[i], L.pz[i]], [-L.tz[i], 0, L.tx[i]], [0, 1, 0], 22); // quer gegen die Wand
  }
}

function runScenario(v, assist, wreck, kind, who) {
  const race = new Race(v.env, { assist, wreck, countdown: 0.3 });
  const r = rng(7);
  const states = new Set();
  let runT = 0, jumpOk = true, resetInfo = null;
  while (race.state === 'countdown') race.step(DT, { steer: 0, throttle: 0, brake: 0 });
  for (let k = 0; k < 240; k++) { race.step(DT, player(who, race, r)); runT += DT; }
  induce(race, kind);
  const lim = (v.apTime || 80) * 3;
  let firstReason = null, pending = false;
  while (runT < lim && race.state !== 'finished') {
    const t0 = race.time, p0 = race.penalties;
    race.step(DT, player(who, race, r));
    runT += DT;
    states.add(race.state);
    if (race.penalties > p0 && Math.abs(race.time - t0 - DT - PENALTY) > 1e-6) jumpOk = false;
    // Lage einen Physikschritt nach dem Versetzen (Tracker misst den Abstand erst dann neu)
    // Abstand zur Ideallinie: der Reset setzt das Auto auf die Linie, nicht mehr in die Fahrbahnmitte (27.09.)
    if (pending) { const c = race.car; resetInfo = { dist: race.ap.tr.dist, up: c.frame.u.y, v: c.fwdSpeed() }; pending = false; }
    for (const e of race.events) {
      if (e.type === 'crash' && !firstReason) firstReason = e.reason;
      if ((e.type === 'reset' || e.type === 'skip') && !resetInfo) pending = true;
    }
    race.events.length = 0;
  }
  // Rennzeit = gefahrene Zeit + Strafen (Uhr läuft durch, wird nie zurückgedreht)
  const clockOk = race.state === 'finished' && Math.abs(race.finalTime - (runT + race.penalties * PENALTY)) < 1e-3;
  return { race, states, jumpOk, clockOk, resetInfo, firstReason, runT };
}

const tracks = [[20260927, 2], [4711, 3], [1000, 1]].map(([s, d]) => ({ seed: s, diff: d, v: verifySync(generate(s, d)) }));
const v0 = tracks[0].v; // Code 20260927-2: Sprung, Brücke, Looping

// ---- A: Totalschaden aus – Looping, Sprung, Wand auf allen drei Stufen ----
console.log('--- A: Totalschaden aus ---');
for (const kind of ['Looping', 'Sprung', 'Wand']) {
  for (const [assist, who] of [['easy', 'nichts'], ['medium', 'perfekt'], ['original', 'perfekt']]) {
    const S = runScenario(v0, assist, false, kind, who);
    const R = S.race, ri = S.resetInfo;
    const ok = R.crashes >= 1 && !S.states.has('wreck') && R.penalties === R.crashes && S.jumpOk && S.clockOk
      && ri && ri.dist < 2.5 && ri.up > 0.9 && ri.v > 4 && R.rewinds === 0;
    check(ok, `${kind.padEnd(7)} ${assist.padEnd(8)} ${S.firstReason} → Reset (Abstand ${ri && ri.dist.toFixed(2)} m, oben ${ri && ri.up.toFixed(2)}, ${ri && (ri.v * 3.6).toFixed(0)} km/h), `
      + `Crashs ${R.crashes}, Strafen ${R.penalties} (+${R.penalties * PENALTY} s, Sprung der Uhr je genau ${PENALTY} s: ${S.jumpOk}), Zustände ${[...S.states].join('/')}, `
      + `Ziel ${R.state === 'finished' ? fmtTime(R.finalTime) : '—'} = gefahren ${fmtTime(S.runT)} + Strafen (${S.clockOk})`);
    // Replay: Rennzeit am Ende = Endzeit, Schnitt am Reset, Geist-Aufzeichnung um Strafzeit verlängert
    const rp = new Replay(R.rec, v0.env, { cuts: R.cuts, pens: R.pens });
    rp.t = rp.duration;
    const gFrames = R.ghostRec().length / REC_STRIDE, rFrames = R.rec.length / REC_STRIDE;
    const repOk = Math.abs(rp.raceTime() - R.finalTime) < 0.05 && R.cuts.length >= 1 && gFrames - rFrames === R.penalties * PENALTY * REC_HZ;
    check(repOk, `   Replay-Zeit am Ende ${fmtTime(rp.raceTime())} (Ziel ${fmtTime(R.finalTime)}), Schnitte ${R.cuts.length}, Geist +${((gFrames - rFrames) / REC_HZ).toFixed(1)} s Stillstand`);
  }
}

// ---- B: Totalschaden an – altes Verhalten ----
console.log('--- B: Totalschaden an ---');
for (const kind of ['Looping', 'Sprung', 'Wand']) {
  for (const [assist, who, after] of [['easy', 'nichts', 'rewind'], ['medium', 'perfekt', 'rewind'], ['original', 'perfekt', 'reset']]) {
    const race = new Race(v0.env, { assist, wreck: true, countdown: 0.3 });
    const r = rng(7);
    while (race.state === 'countdown') race.step(DT, { steer: 0, throttle: 0, brake: 0 });
    for (let k = 0; k < 240; k++) race.step(DT, player(who, race, r));
    race.events.length = 0;
    induce(race, kind);
    const states = new Set(), ev = [];
    let t = 0;
    while (t < 12 && !(ev.includes(after))) { race.step(DT, player(who, race, r)); t += DT; states.add(race.state); for (const e of race.events) ev.push(e.type); race.events.length = 0; }
    const ok = states.has('wreck') && race.penalties === 0 && ev.includes('crash') && ev.includes(after);
    check(ok, `${kind.padEnd(7)} ${assist.padEnd(8)} Wrack → ${after} (Ereignisse ${ev.join(',')}), Strafen ${race.penalties}`);
  }
}

// ---- C: Reset nie in einen sicheren Folgecrash; wiederholte Crashs laufen nicht endlos ----
console.log('--- C: jedes Stunt-Element, Crash mitten im Element ---');
for (const { seed, diff, v } of tracks) {
  const T = v.env.track;
  const stunts = T.pieces.filter((p) => p.stunt);
  const tally = {};
  for (const pc of stunts) {
    for (const [assist, who] of [['easy', 'nichts'], ['easy', 'zappelig'], ['medium', 'perfekt'], ['original', 'perfekt']]) {
      const race = new Race(v.env, { assist, wreck: false, countdown: 0 });
      const r = rng(pc.lineStart);
      race.step(DT, { steer: 0, throttle: 0, brake: 0 });
      const mid = pc.lineStart + ((pc.lineEnd - pc.lineStart) >> 1);
      race.place(mid, v.env.prof.vt[mid]);
      race.car.setCrash('Test');
      let t = 0, passed = false;
      const endProg = T.line.s[pc.lineEnd] + 15;
      while (t < 30 && !passed) {
        race.step(DT, player(who, race, r)); t += DT;
        if (race.state === 'running' && race.tracker.lap === 0 && T.line.s[race.tracker.idx] > endProg && race.tracker.idx > pc.lineEnd) passed = true;
      }
      const k = `${assist}/${who}`;
      tally[k] = tally[k] || { n: 0, follow: 0, stuck: 0, maxPen: 0 };
      tally[k].n++;
      if (race.crashes > 1) tally[k].follow++;
      if (!passed) tally[k].stuck++;
      tally[k].maxPen = Math.max(tally[k].maxPen, race.penalties);
      if (assist === 'easy' && (race.crashes > 1 || !passed)) console.log(`     easy/${who} ${pc.type}@${pc.lineStart}: Crashs ${race.crashes}, vorbei ${passed}`);
    }
  }
  for (const [k, s] of Object.entries(tally)) {
    const need = k.startsWith('easy');
    const ok = s.stuck === 0 && (!need || s.follow === 0);
    check(ok || !need, `${seed}-${diff} ${k.padEnd(16)} ${s.n} Stunts: Folgecrash nach Reset ${s.follow}×, hängen geblieben ${s.stuck}×, max. Strafen ${s.maxPen}${need ? '' : ' (Info)'}`);
  }
}

// Wiederholt am selben Looping scheitern: Leicht → beim 2. Crash dahinter, sonst beim 3.; jeder Crash +5 s
console.log('--- C2: immer wieder am selben Looping scheitern ---');
for (const assist of ['easy', 'medium', 'original']) {
  const T = v0.env.track;
  const pc = T.pieces.find((p) => p.type === 'loop');
  const race = new Race(v0.env, { assist, wreck: false, countdown: 0 });
  race.step(DT, { steer: 0, throttle: 0, brake: 0 });
  const ev = [];
  let t = 0;
  while (t < 60 && !(race.tracker.idx > pc.lineEnd + 20 && race.state === 'running')) {
    const i = race.tracker.idx;
    if (race.state === 'running' && i > pc.lineStart + 60 && i < pc.lineEnd) race.car.setCrash('Test'); // im Looping immer Crash
    else if (race.state === 'running' && i < pc.lineStart - 60) race.place(pc.lineStart - 60, v0.env.prof.vt[pc.lineStart - 60]); // Anlauf abkürzen
    race.step(DT, player('perfekt', race, null)); t += DT;
    for (const e of race.events) if (e.type !== 'checkpoint' && e.type !== 'brakehint') ev.push(e.type); race.events.length = 0;   // n23: „Bremsen!“ kommt früher (auch nach dem Versetzen)
  }
  const want = assist === 'easy' ? 2 : 3;
  const ok = race.crashes === want && race.penalties === want && ev[ev.length - 1] === 'skip' && race.tracker.idx > pc.lineEnd;
  check(ok, `${assist.padEnd(8)} ${ev.join(',')} → hinter dem Looping nach ${race.crashes} Crashs, +${race.penalties * PENALTY} s`);
}

// ---- D: Rückspulen per Knopf ohne Totalschaden: Uhr läuft weiter ----
console.log('--- D: ⏪ ohne Totalschaden ---');
{
  const race = new Race(v0.env, { assist: 'medium', wreck: false, countdown: 0 });
  race.step(DT, { steer: 0, throttle: 0, brake: 0 });
  for (let k = 0; k < 120 * 6; k++) race.step(DT, player('perfekt', race, null));
  const t0 = race.time, idx0 = race.tracker.idx, rec0 = race.rec.length;
  race.requestRewind();
  const ok = race.time === t0 && race.tracker.idx < idx0 && race.rec.length === rec0 && race.rewinds === 1 && race.penalties === 0 && race.cuts.length === 1;
  check(ok, `Rückspulen: Uhr ${fmtTime(t0)} → ${fmtTime(race.time)} (unverändert), Position ${idx0} → ${race.tracker.idx}, keine Strafe`);
  const leg = new Race(v0.env, { assist: 'medium', wreck: true, countdown: 0 });
  leg.step(DT, { steer: 0, throttle: 0, brake: 0 });
  for (let k = 0; k < 120 * 6; k++) leg.step(DT, player('perfekt', leg, null));
  const l0 = leg.time; leg.requestRewind();
  check(leg.time < l0 - 2.5, `Totalschaden an (bisher): Rückspulen dreht die Uhr zurück ${fmtTime(l0)} → ${fmtTime(leg.time)}`);
}

// ---- F: n41 Reset-Knopf (↺, 1 Tipp zurück auf die Strecke, +PENALTY s) ----
console.log('--- F: ↺ Reset-Knopf ---');
const prog = (R) => R.tracker.progress();
const settle = (R, who = 'perfekt') => { let t = 0; while (R.state === 'reset' && t < 2) { R.step(DT, player(who, R, null)); t += DT; } R.step(DT, player(who, R, null)); return t; };
for (const [assist, who] of [['easy', 'nichts'], ['medium', 'perfekt'], ['original', 'perfekt']]) {
  const race = new Race(v0.env, { assist, wreck: false, countdown: 0.3 });
  check(!race.requestReset(), `${assist.padEnd(8)} im Countdown kein Reset`);
  while (race.state === 'countdown') race.step(DT, { steer: 0, throttle: 0, brake: 0 });
  let runT = 0;
  for (let k = 0; k < 120 * 6; k++) { race.step(DT, player(who, race, null)); runT += DT; }
  race.events.length = 0;
  const t0 = race.time, p0 = prog(race), cp0 = race.cpNext, lap0 = race.tracker.lap;
  const first = race.requestReset(), second = race.requestReset();
  const jump = race.time - t0;
  const ev0 = race.events.map((e) => e.type);
  runT += settle(race, who) + DT;
  const c = race.car, ev = race.events.map((e) => e.type);
  const ok = first && !second && Math.abs(jump - PENALTY) < 1e-9 && race.penalties === 1 && race.crashes === 0 && ev0.includes('mreset') && ev.includes('reset') && !ev.includes('skip')
    && race.state === 'running' && race.ap.tr.dist < 2.5 && c.frame.u.y > 0.9 && c.fwdSpeed() > 4 && prog(race) < p0 && race.cpNext === cp0 && race.tracker.lap <= lap0 && race.cuts.length === 1;
  check(ok, `${assist.padEnd(8)} Reset: Uhr +${jump.toFixed(2)} s, 2. Tipp sofort danach gesperrt (${!second}), zurück ${(p0 - prog(race)).toFixed(1)} m auf die Linie (Abstand ${race.ap.tr.dist.toFixed(2)} m, oben ${c.frame.u.y.toFixed(2)}, ${(c.fwdSpeed() * 3.6).toFixed(0)} km/h), Checkpoints ${cp0} → ${race.cpNext}, Ereignisse ${ev.join(',')}`);
  // nach RESET_GAP wieder möglich; dreimal hintereinander an derselben Stelle: nie übersprungen, nie nach vorn
  let skips = 0, fwd = 0;
  for (let n = 0; n < 3; n++) {
    for (let k = 0; k < 120 * 1.2; k++) { race.step(DT, player(who, race, null)); runT += DT; }
    const pb = prog(race);
    race.events.length = 0;
    if (!race.requestReset()) { fwd += 100; continue; }
    runT += settle(race, who) + DT;
    if (race.events.some((e) => e.type === 'skip')) skips++;
    if (prog(race) > pb) fwd++;
  }
  check(skips === 0 && fwd === 0 && race.penalties === 4, `${assist.padEnd(8)} 3 weitere Resets im Abstand von 1,2 s: übersprungen ${skips}×, nach vorn ${fwd}×, Strafen ${race.penalties} (+${race.penalties * PENALTY} s)`);
  // bis ins Ziel: Rennzeit = gefahrene Zeit + Strafen (Reset bringt nie Zeit)
  while (runT < (v0.apTime || 80) * 4 && race.state !== 'finished') { race.step(DT, player(who, race, null)); runT += DT; }
  const clk = race.state === 'finished' && Math.abs(race.finalTime - (runT + race.penalties * PENALTY)) < 0.02;
  check(clk, `${assist.padEnd(8)} Ziel ${race.state === 'finished' ? fmtTime(race.finalTime) : '—'} = gefahren ${fmtTime(runT)} + ${race.penalties} × ${PENALTY} s`);
  check(!race.requestReset(), `${assist.padEnd(8)} nach dem Ziel kein Reset`);
}
// Reset mitten im Looping / über der Sprunglücke → vor das Element mit dessen Anfahrtstempo, dann sauber hindurch
for (const kind of ['loop', 'jump']) {
  for (const [assist, who] of [['easy', 'nichts'], ['medium', 'perfekt']]) {
    const T = v0.env.track, L = T.line;
    const pc = kind === 'loop' ? T.pieces.find((p) => p.type === 'loop') : T.pieces[L.piece[T.jumps[0].lipIdx + 3]];
    const race = new Race(v0.env, { assist, wreck: false, countdown: 0 });
    race.step(DT, { steer: 0, throttle: 0, brake: 0 });
    const mid = kind === 'loop' ? pc.lineStart + ((pc.lineEnd - pc.lineStart) >> 1) : T.jumps[0].lipIdx + 3;
    race.place(mid, v0.env.prof.vt[mid]);
    race.step(DT, player(who, race, null));
    race.requestReset(); settle(race, who);
    const back = L.s[pc.lineStart] - L.s[race.tracker.idx], v = race.car.fwdSpeed(), want = Math.min(v0.env.prof.vt[race.tracker.idx] || 10, 26) * 0.95;
    let t = 0, passed = false;
    while (t < 30 && !passed && race.crashes === 0) { race.step(DT, player(who, race, null)); t += DT; if (race.state === 'running' && race.tracker.idx > pc.lineEnd + 10) passed = true; }
    check(back > 30 && back < 60 && Math.abs(v - want) < 2 && passed && race.crashes === 0, `${kind.padEnd(5)} ${assist.padEnd(8)} Reset im Element → ${back.toFixed(0)} m davor mit ${(v * 3.6).toFixed(0)} km/h (Anlauf ${(want * 3.6).toFixed(0)}), danach hindurch ohne Crash (${passed})`);
  }
}
// Ausflug neben die Fahrbahn: Reset zählt ab der Stelle, an der man sie verlassen hat (keine Abkürzung)
{
  const race = new Race(v0.env, { assist: 'medium', wreck: false, countdown: 0 });
  race.step(DT, { steer: 0, throttle: 0, brake: 0 });
  for (let k = 0; k < 120 * 6; k++) race.step(DT, player('perfekt', race, null));
  const S0 = { ...race.onRoad }, L = v0.env.track.line;
  race.shortcut = { ...race.onRoad, driven: 0 };
  // Ortung schon weit voraus und ein Checkpoint mehr (wie nach einer Fahrt quer durchs Gelände)
  race.tracker.reset(Math.min(L.n - 3, S0.idx + 400)); race.cpNext = Math.min(race.cps.length, S0.cp + 1);
  race.requestReset(); settle(race);
  check(prog(race) < S0.prog && race.cpNext === S0.cp && race.tracker.lap === S0.lap && race.penalties === 1, `Reset im Gelände: zurück vor die Ausfahrt-Stelle (${(S0.prog - prog(race)).toFixed(1)} m davor), Checkpoints wie dort (${race.cpNext}), +${PENALTY} s`);
}
// Totalschaden an: im Wrack nur die Restwartezeit, dann sofort auf die Fahrbahn (kein Zurückspulen)
for (const assist of ['medium', 'original']) {
  const race = new Race(v0.env, { assist, wreck: true, countdown: 0 });
  race.step(DT, { steer: 0, throttle: 0, brake: 0 });
  for (let k = 0; k < 240; k++) race.step(DT, player('perfekt', race, null));
  induce(race, 'Looping');
  let t = 0; while (race.state !== 'wreck' && t < 5) { race.step(DT, player('perfekt', race, null)); t += DT; }
  for (let k = 0; k < 24; k++) race.step(DT, player('perfekt', race, null));
  race.events.length = 0;
  const t0 = race.time, rest = race.wreckWait() - race.crashT;
  const ok0 = race.requestReset();
  const ev = race.events.map((e) => e.type);
  check(ok0 && race.state === 'running' && Math.abs(race.time - t0 - rest) < 1e-9 && race.rewinds === 0 && race.penalties === 0 && ev.includes('reset'),
    `${assist.padEnd(8)} Totalschaden an, Reset im Wrack: sofort auf der Fahrbahn, Uhr +${(race.time - t0).toFixed(2)} s (Restwartezeit), kein Zurückspulen (${race.rewinds}), Ereignisse ${ev.join(',')}`);
}
// KI-Gegner: Reset genau in einen Gegner hinein → Geist-Phase, kein Stoß, kein Crash
{
  const { GegnerFeld } = await import('../../src/ai/gegner.js');
  const race = new Race(v0.env, { assist: 'medium', wreck: false, countdown: 0.5 });
  const F = new GegnerFeld(v0.env, { anzahl: 1, staerke: 'ebenbuertig', seed: 3, assist: 'medium', schiene: 'nie', startplatz: 'hinten' });
  F.spielerAufstellen(race);
  for (let k = 0; k < 120 * 6; k++) { race.step(DT, player('perfekt', race, null)); F.step(DT, race); }
  race.events.length = 0; F.events.length = 0;
  race.requestReset();
  let t = 0, geist = 0, stoss = 0, crash = 0;
  while (t < 4) {
    race.step(DT, player('perfekt', race, null));
    const ev = race.events.splice(0);
    if (ev.some((e) => e.type === 'reset')) {
      // Gegner exakt auf den Rücksetzpunkt (gleiche Lage, gleiches Tempo) – schlimmster Fall
      const g = F.fahrer[0], c = race.car;
      g.car.place([c.pos.x, c.pos.y, c.pos.z], [c.frame.f.x, c.frame.f.y, c.frame.f.z], [c.frame.u.x, c.frame.u.y, c.frame.u.z], c.fwdSpeed());
      g.ap.tr.reset(race.tracker.idx); g.zustand = 'fahrt';
    }
    F.step(DT, race); t += DT;
    if (F.spGeistT > 0) geist = Math.max(geist, t);
    for (const e of F.events.splice(0)) if (e.type === 'stoss' && e.spieler) stoss++;
    if (race.crashes) crash++;
  }
  check(geist > 0.4 && stoss === 0 && race.crashes === 0 && F.fahrer[0].zustand !== 'crash', `KI-Gegner auf dem Rücksetzpunkt: Spieler Geist bis ${geist.toFixed(2)} s, Stöße ${stoss}, Crashs Spieler ${race.crashes}, Gegner ${F.fahrer[0].zustand}`);
}
// Online: eigener Zustand meldet den Reset (Crash-Flag → Geist bei den anderen)
{
  const { zustandEigen } = await import('../../src/game/online.js');
  const race = new Race(v0.env, { assist: 'original', wreck: false, countdown: 0 });
  race.step(DT, { steer: 0, throttle: 0, brake: 0 });
  for (let k = 0; k < 120 * 3; k++) race.step(DT, player('perfekt', race, null));
  race.requestReset();
  const z1 = zustandEigen(race, 0); settle(race); const z2 = zustandEigen(race, 1);
  check(z1.f.crash && !z2.f.crash && race.events.some((e) => e.type === 'reset'), `Online: während des Resets Crash-Flag (${z1.f.crash}), danach Ereignis „reset“ (Sprung-Zähler) und frei (${!z2.f.crash})`);
}

// ---- E: Wertungs-Schlüssel (n21: ohne Physik-/Welt-Version – Fahrhilfe × Totalschaden × Extras) ----
console.log('--- E: Bestzeiten-Schlüssel ---');
{
  const keys = [];
  for (const a of ['easy', 'medium', 'original']) for (const w of [false, true]) for (const x of [false, true]) keys.push(modeKey(a, w, x));
  check(new Set(keys).size === 12 && keys.every((k) => !/@t|@w|@m/.test(k)) && modeKey('medium', false) === 'medium+reset@x',
    `12 getrennte Wertungen ohne Versions-Zusatz: ${keys.join(', ')}`);
  check(abMode('?m=n16') && abMode('?breit=alt') && !abMode('?dynlinie=0') && abMode('?wiese=alt') && abMode('?haft=alt') && abMode('?schanze=alt') && abMode('?grip=1') && abMode('?welt=1') && !abMode('?welt=2') && !abMode('?seed=4711&d=3') && !abMode(''),
    'A/B-Links (?wiese=alt, ?haft=alt, ?schanze=alt, ?grip=1, ?welt=1 …) werten nicht, normale Links schon');
}

console.log(fails ? `${fails} Fehlschläge` : 'Reset mit Zeitstrafe + Totalschaden-Option ok');
process.exit(fails ? 1 : 0);
