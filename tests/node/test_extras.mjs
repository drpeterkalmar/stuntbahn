// Extras (Hüpfer + Nitro, je 1 pro Runde): Ladungen, Auffüllen an Start/Ziel, Sperren, Physik-Werte,
// Aufzeichnung (Replay/Geist), Leicht-Automatik auf Generator-Strecken. Aufruf: node tests/node/test_extras.mjs [Seeds=10]
import { generate, demoLayout } from '../../src/track/generator.js';
import { verifySync, prepare } from '../../src/track/verify.js';
import { Race, REC_HZ } from '../../src/game/race.js';
import { Replay } from '../../src/game/replay.js';
import { parseTrk } from '../../src/track/trk.js';
import { trkToLayout } from '../../src/track/trkimport.js';
import { SHOWCASE, showcaseBytes } from '../../src/track/showcase.js';
import { NITRO, NITRO_TOTAL, nitroLevel, hopModel } from '../../src/physics/extras.js';
import { hopRun, accelAt, runFor, vmax } from '../../tools/extras_measure.mjs';
import { easyLap } from '../../tools/extras_batch.mjs';
import { daySeed } from '../../src/core/util.js';

const N = +(process.argv[2] || 10);
const DT = 1 / 120, zero = { steer: 0, throttle: 0, brake: 0 };
let fails = 0;
const check = (ok, msg) => { console.log(`${ok ? 'OK  ' : 'FAIL'} ${msg}`); if (!ok) fails++; };
const f2 = (x) => x.toFixed(2);

// Rennen auf Mittel, Autopilot-Eingabe als „Spieler“, bis zur Stelle idx vorspulen
function raceAt(env, opts = {}) {
  const race = new Race(env, { assist: 'medium', countdown: 0.05, ...opts });
  const inp = () => { const o = race.ap.control(race.car); return { steer: o.steer, throttle: o.throttle, brake: o.brake }; };
  const run = (sec) => { for (let t = 0; t < sec; t += DT) { race.step(DT, opts.idle ? zero : inp()); } };
  return { race, run, inp };
}
const events = (race, type) => { const e = race.events.filter((x) => x.type === type); return e; };
// erstes Linien-Stück eines Typs (Looping, Röhre …): Linienindex mitten im Stück
function pieceIdx(env, re, frac = 0.5) {
  const T = env.track;
  for (const pc of T.pieces) if (pc && re.test(pc.type || pc.kind || '') && pc.lineEnd > pc.lineStart) return Math.round(pc.lineStart + frac * (pc.lineEnd - pc.lineStart));
  return -1;
}
// Linienindex im Looping selbst (L.loop), nicht im Anlauf des Stücks
function loopIdx(env, key = 'loop', which = 0.5) {
  const L = env.track.line, idx = [];
  for (let i = 0; i < L.n; i++) if (L[key][i]) idx.push(i);
  return idx.length ? idx[Math.floor(which * (idx.length - 1))] : -1;
}

const demo = prepare(demoLayout(), { treeCount: 0 });

console.log('--- A: Physik-Werte (Ebene) ---');
{
  const M = hopModel();
  const h60 = hopRun(60 / 3.6), h200 = hopRun(200 / 3.6);
  check(h60.apex > 3 && h60.apex < 4 && h200.apex > 3 && h200.apex < 4, `Hüpfer-Scheitel 3–4 m: ${f2(h60.apex)} m bei 60 km/h, ${f2(h200.apex)} m bei 200 km/h (Absprung ${f2(M.lift)} m/s)`);
  check(h60.tilt < 3 && h200.tilt < 3 && !h60.crash && !h200.crash, `Auto bleibt waagrecht: größte Neigung ${f2(h60.tilt)}° / ${f2(h200.tilt)}°, kein Crash`);
  check(Math.abs(h200.vEnd - h200.v0) < 0.06 * h200.v0, `Vorwärtstempo bleibt: ${f2(h200.v0 * 3.6)} → ${f2(h200.vEnd * 3.6)} km/h, Flugzeit ${f2(h200.air)} s, Weite ${Math.round(h200.dist)} m`);
  const acc = [100, 200, 300].map((k) => [k, accelAt(k / 3.6, 0), accelAt(k / 3.6, 1)]);
  check(acc.every(([, a0, a1]) => a1 / a0 > 1.55 && a1 / a0 < 2.0), `Nitro-Beschleunigung ${acc.map(([k, a0, a1]) => `${k} km/h ${a0.toFixed(1)} → ${a1.toFixed(1)} m/s² (+${Math.round((a1 / a0 - 1) * 100)} %)`).join(', ')}`);
  const v0 = vmax(0) * 3.6, v1 = vmax(1) * 3.6;
  check(v1 / v0 > 1.15 && v1 / v0 < 1.25, `Vmax ${Math.round(v0)} → ${Math.round(v1)} km/h mit Dauer-Nitro (+${Math.round((v1 / v0 - 1) * 100)} %)`);
  const a = runFor(150 / 3.6, NITRO_TOTAL, false), b = runFor(150 / 3.6, NITRO_TOTAL, true);
  check(b.v > a.v * 1.15, `Gewinn in ${NITRO.dur} + ${NITRO.fade} s ab 150 km/h: ${Math.round(a.v * 3.6)} → ${Math.round(b.v * 3.6)} km/h`);
  check(nitroLevel(0) === 1 && nitroLevel(NITRO.dur - 0.01) === 1 && nitroLevel(NITRO.dur + NITRO.fade / 2) > 0.3 && nitroLevel(NITRO.dur + NITRO.fade / 2) < 0.7 && nitroLevel(NITRO_TOTAL + 0.01) === 0 && nitroLevel(-1) === 0, 'Nitro-Hüllkurve: voll, dann sanft auf 0');
}

console.log('--- B: Ladungen ---');
{
  const { race, run } = raceAt(demo);
  run(1.2);
  check(race.charges.hop === 1 && race.charges.nitro === 1, 'Start: je 1 Hüpfer und 1 Nitro');
  // Hüpfer auf der Startgeraden
  const y0 = race.car.pos.y;
  check(race.hopBlock(race.ap.tr.idx) === null, `Hüpfer auf der Geraden möglich (${Math.round(race.car.fwdSpeed() * 3.6)} km/h)`);
  race.requestHop(); run(DT * 2);
  check(race.charges.hop === 0 && events(race, 'hop').length === 1 && race.car.v.y > 5, `Hüpfer ausgelöst (Steigen ${f2(race.car.v.y)} m/s)`);
  let apex = y0, tilt = 0;
  for (let t = 0; t < 4 && (race.car.onGround === 0 || t < 0.3); t += DT) { run(DT); apex = Math.max(apex, race.car.pos.y); tilt = Math.max(tilt, Math.acos(Math.min(1, race.car.frame.u.y)) * 180 / Math.PI); }
  run(0.3);
  const vy = race.car.v.y;
  race.requestHop(); run(DT * 2);
  check(events(race, 'hop').length === 1 && Math.abs(race.car.v.y - vy) < 3 && events(race, 'xdenied').some((e) => e.k === 'hop' && e.why === 'empty'), `zweiter Hüpfer-Druck wirkungslos (Scheitel des ersten ${f2(apex - y0)} m, Neigung höchstens ${f2(tilt)}°)`);
  race.requestNitro(); run(0.05);
  check(race.charges.nitro === 0 && race.nitroT > 0 && events(race, 'nitro').length === 1, 'Nitro gezündet → Ladung 0, Wirkung läuft');
  const tBefore = race.nitroT;
  race.requestNitro(); run(0.05);
  check(events(race, 'nitro').length === 1 && race.nitroT > tBefore && events(race, 'xdenied').some((e) => e.k === 'nitro' && e.why === 'empty'), 'zweiter Nitro-Druck wirkungslos (verbraucht, Wirkung nicht neu gestartet)');
  run(NITRO_TOTAL);
  check(race.car.boost === 0 && race.nitroT < 0, `Nitro nach ${NITRO_TOTAL} s aus`);
  check(race.crashes === 0, 'dabei kein Crash');
}

console.log('--- C: an Start/Ziel wieder voll ---');
{
  const { race, run } = raceAt(demo);
  run(1);
  race.requestHop(); race.requestNitro(); run(0.1);
  check(race.charges.hop === 0 && race.charges.nitro === 0, 'beide verbraucht');
  // kurz vor die Ziellinie (Checkpoints noch offen → kein Zieleinlauf, nur Rundenwechsel)
  const L = demo.track.line;
  race.place(L.n - 40, 20, true);
  let t = 0; while (t < 10 && race.tracker.lap < 1) { run(DT); t += DT; }
  check(race.tracker.lap === 1 && race.charges.hop === 1 && race.charges.nitro === 1 && events(race, 'refill').length === 1 && race.state === 'running', 'Start/Ziel überfahren → beide wieder voll, Anzeige-Ereignis „refill“');
  run(2);
  check(race.charges.hop === 1 && race.charges.nitro === 1 && events(race, 'refill').length === 1, 'nicht ansparen: höchstens je 1, kein zweites Auffüllen ohne neue Runde');
}

console.log('--- D: Hüpfer nur mit Bodenkontakt, gesperrt in Looping/Röhre/Korkenzieher ---');
{
  const { race, run } = raceAt(demo);
  run(1.5);
  race.car.pos.y += 2.5; race.car.v.y = 3;   // in die Luft
  run(DT * 3);
  check(race.car.onGround === 0, 'Auto in der Luft');
  race.requestHop(); run(DT);
  check(race.charges.hop === 1 && events(race, 'xdenied').some((e) => e.why === 'air'), 'Hüpfer in der Luft: gesperrt, Ladung bleibt (keine Rettung vor verpatzter Landung)');
  // Looping (Demo) – mitten drin und kurz davor
  for (const [name, where] of [['im Looping', 0.3], ['am Looping-Scheitel', 0.5]]) {
    const r = raceAt(demo); r.run(1);
    const i = loopIdx(demo, 'loop', where);
    r.race.place(i, 18, true); r.run(DT * 6);
    const st = r.race.hopBlock(r.race.ap.tr.idx);
    r.race.requestHop(); r.run(DT);
    check(r.race.charges.hop === 1 && (st === 'lock' || st === 'air'), `${name}: gesperrt (${st}), Ladung bleibt`);
  }
  {
    const r = raceAt(demo); r.run(1);
    const L = demo.track.line; let i = loopIdx(demo, 'loop', 0);
    // 30 m vor dem Looping-Eingang, mit Tempo: Flug reichte hinein → gesperrt
    let j = i; while (j > 0 && L.s[i] - L.s[j] < 30) j--;
    r.race.place(j, 20, true); r.run(DT * 30);
    const st = r.race.hopBlock(r.race.ap.tr.idx);
    check(st === 'lock', `kurz vor dem Looping (Flug reicht hinein): gesperrt (${st})`);
  }
  {
    // Schanze: im Anlauf gesperrt (der Hüpfer verdürbe den Sprung)
    const r = raceAt(demo); r.run(1);
    const J = demo.track.jumps[0];
    r.race.place(J.lipIdx - 12, 15, true); r.run(DT * 6);
    const st = r.race.hopBlock(r.race.ap.tr.idx);
    check(st === 'lock', `im Schanzen-Anlauf: gesperrt (${st})`);
  }
  // Röhre + Korkenzieher: Beispiel-Rundkurs (Showcase)
  const sc = SHOWCASE[0];
  const lay = trkToLayout(parseTrk(showcaseBytes(sc.id), sc.id)).layout;
  const shw = prepare(lay, { treeCount: 0 });
  for (const [name, key, re] of [['in der Röhre', 'tube', null], ['im Korkenzieher', 'loop', /cork/]]) {
    const r = raceAt(shw); r.run(1);
    let i = -1;
    if (re) { const L = shw.track.line; const cand = []; for (let k = 0; k < L.n; k++) { const pc = shw.track.pieces[L.piece[k]]; if (L.loop[k] && pc && re.test(pc.type || pc.kind || '')) cand.push(k); } i = cand[cand.length >> 1] ?? -1; }
    else i = loopIdx(shw, key, 0.5);
    if (i < 0) { check(false, `${name}: Element nicht gefunden`); continue; }
    r.race.place(i, 15, true); r.run(DT * 6);
    const st = r.race.hopBlock(r.race.ap.tr.idx);
    r.race.requestHop(); r.run(DT);
    check(r.race.charges.hop === 1 && (st === 'lock' || st === 'air'), `${name}: gesperrt (${st}), Ladung bleibt`);
  }
  // Nitro im Looping erlaubt
  const r = raceAt(demo); r.run(1);
  r.race.place(loopIdx(demo, 'loop', 0.2), 22, true); r.run(DT * 4);
  r.race.requestNitro(); r.run(0.3);
  check(r.race.charges.nitro === 0 && r.race.car.boost === 1, 'Nitro im Looping erlaubt (hilft dort)');
}

console.log('--- E: Option aus, Aufzeichnung, Replay, Geist ---');
{
  const { race, run } = raceAt(demo, { extras: false });
  run(2); race.requestHop(); race.requestNitro(); run(0.2);
  check(race.charges.hop === 0 && race.charges.nitro === 0 && !events(race, 'hop').length && !events(race, 'nitro').length && race.car.boost === 0 && race.xstate().hop === 'off', 'Option „Hüpfer & Nitro“ aus: keine Ladungen, Drücken wirkungslos');
  const R = raceAt(demo); R.run(2);
  R.race.requestNitro(); R.run(1);
  const f0 = R.race.xev.find((e) => e.k === 'nitro').f;
  R.run(NITRO_TOTAL + 0.5);
  const rp = new Replay(R.race.rec, demo, { cuts: R.race.cuts, pens: R.race.pens, xev: R.race.xev });
  rp.t = f0 / REC_HZ + 0.5; const inN = rp.nitro();
  rp.t = f0 / REC_HZ + NITRO_TOTAL + 0.3; const after = rp.nitro();
  rp.t = f0 / REC_HZ - 0.3; const before = rp.nitro();
  check(inN === 1 && after === 0 && before === 0, `Replay: Flammen genau während des Nitro (Frame ${f0}, Stärke ${inN}/${after}/${before})`);
  check(R.race.nitroLog.length === 1 && Math.abs(R.race.nitroLog[0][1] - R.race.nitroLog[0][0] - NITRO_TOTAL) < 0.02, `Geist: Nitro-Zeit ${f2(R.race.nitroLog[0][0])}–${f2(R.race.nitroLog[0][1])} s (Rennuhr)`);
  // Abbruch durch Crash-Reset: Nitro endet sofort
  const C = raceAt(demo); C.run(2); C.race.requestNitro(); C.run(0.5);
  C.race.car.setCrash('Test'); C.run(1);
  const e = C.race.xev.find((x) => x.k === 'nitro');
  check(C.race.car.boost === 0 && e.end != null && e.end - e.f < NITRO_TOTAL * REC_HZ, 'Crash → Nitro endet sofort (auch im Replay)');
}

console.log('--- F: Mittel/Original nutzen die Extras nie selbst ---');
{
  for (const assist of ['medium', 'original']) {
    const { race, run } = raceAt(demo, { assist, autoExtras: true });
    run(40);
    check(race.used.hop === 0 && race.used.nitro === 0, `${assist}: keine automatischen Extras`);
  }
}

console.log(`--- G: Leicht mit „Extras automatisch“ auf ${N}×3 Generator-Strecken ---`);
{
  const seeds = [daySeed(), 4711, ...Array.from({ length: N - 2 }, (_, k) => 1000 + k * 7919 % 90000)];
  let ok0 = 0, ok1 = 0, faster = 0, slower = 0, sum = 0, tot = 0, hops = 0, nit = 0;
  for (const seed of seeds) for (const diff of [1, 2, 3]) {
    const v = verifySync(generate(seed, diff));
    const a = easyLap(v.env, false), b = easyLap(v.env, true);
    tot++;
    ok0 += a.ok && !a.crashes; ok1 += b.ok && !b.crashes;
    hops += b.hops > 0; nit += b.nitros > 0;
    if (a.ok && b.ok) { const d = b.time - a.time; sum += d; if (d < -0.02) faster++; if (d > 0.02) slower++; }
  }
  check(ok1 === tot && ok1 >= ok0, `im Ziel ohne Crash: ${ok1}/${tot} (ohne Extras ${ok0}/${tot})`);
  check(slower === 0 && faster > 0, `schneller ${faster}, langsamer ${slower}, im Mittel ${f2(sum / tot)} s; Nitro auf ${nit}, Hüpfer auf ${hops} Strecken`);
}

console.log(fails ? `${fails} Fehlschläge` : 'Extras (Hüpfer + Nitro): alle Prüfungen grün');
process.exit(fails ? 1 : 0);
