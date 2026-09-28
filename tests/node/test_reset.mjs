// Totalschaden aus (Standard): jeder Crash → Fahrbahn-Reset vor das Element, +5 s, Uhr läuft durch.
// Totalschaden an: bisheriges Verhalten (Wrack, Mittel/Leicht zurückspulen, Original vor das Element).
// Echte Crashs per Physik: Looping zu langsam (Überschlag), Sprung zu langsam (Absturz), quer gegen die
// Brückenwand (Aufprall). Danach fährt der Autopilot (bzw. auf Leicht der „Spieler nichts“) ins Ziel.
import { generate } from '../../src/track/generator.js';
import { verifySync } from '../../src/track/verify.js';
import { Race, PENALTY, REC_HZ, REC_STRIDE } from '../../src/game/race.js';
import { Replay } from '../../src/game/replay.js';
import { modeKey } from '../../src/game/store.js';
import { WORLD_TAG } from '../../src/track/defs.js';
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
    for (const e of race.events) if (e.type !== 'checkpoint') ev.push(e.type); race.events.length = 0;
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

// ---- E: Wertungs-Schlüssel (Bestzeiten/Geister getrennt, alte Schlüssel behalten ihre Bedeutung) ----
console.log('--- E: Bestzeiten-Schlüssel ---');
{
  const keys = [], old = [], mid = [];
  for (const a of ['easy', 'medium', 'original']) for (const w of [false, true]) { keys.push(modeKey(a, w)); old.push(modeKey(a, w, 1, '')); mid.push(modeKey(a, w, 2, '')); }
  const ok = new Set(old).size === 6 && modeKey('easy', false, 1, '') === 'easy' && modeKey('medium', true, 1, '') === 'medium' && modeKey('original', true, 1, '') === 'original';
  check(ok, `6 getrennte Wertungen (alte Physik): ${old.join(', ')} (bisherige Schlüssel easy/medium/original = Leicht aus, Mittel/Original an)`);
  // Tempo-Umbau 27.09.: neue Physik wertet getrennt (Zusatz @t2), alte Einträge bleiben unberührt
  check(new Set([...mid, ...old]).size === 12 && mid.every((k, i) => k === old[i] + '@t2'), `neue Physik eigene Wertungen: ${mid.join(', ')}`);
  // Weltmaßstab 27.09. (n12): neue Welt wertet nochmals getrennt (Zusatz WORLD_TAG, z. B. @w2); Maßstab 1 = alte Schlüssel
  check(WORLD_TAG === '' ? keys.every((k, i) => k === mid[i]) : new Set([...keys, ...mid, ...old]).size === 18 && keys.every((k, i) => k === mid[i] + WORLD_TAG),
    `neue Welt eigene Wertungen (${WORLD_TAG || 'Maßstab 1: keine'}): ${keys.join(', ')}`);
}

console.log(fails ? `${fails} Fehlschläge` : 'Reset mit Zeitstrafe + Totalschaden-Option ok');
process.exit(fails ? 1 : 0);
