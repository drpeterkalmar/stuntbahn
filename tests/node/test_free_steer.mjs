// Leicht – frei lenkbar (27.09.): Spieler hat Vorrang, weiche Rückführung, Abkürzen lohnt nicht,
// Stunts lenkt weiter der Autopilot (mit Ansage im HUD).
//  A: 2 s voll links → > 8 m neben der Fahrbahn; loslassen → in ~5 s ohne Crash zurück auf der Linie
//  B: kleiner Lenkeinschlag (< 0,5) übernimmt nicht – Leicht fährt weiter auf der Linie
//  C: Abkürzen quer durch die Wiese einer Kehre bringt keine Zeit (auch nicht auf Mittel/Original)
//  D: Spieler lenkt dauernd voll – Looping trotzdem sauber, vorher Ansage „Looping voraus – Autopilot lenkt“
import { chain, setup } from './common.mjs';
import { Race, FREE } from '../../src/game/race.js';
import { generate } from '../../src/track/generator.js';
import { verifySync } from '../../src/track/verify.js';

const DT = 1 / 120;
let fails = 0;
const check = (ok, msg) => { console.log(`${ok ? 'OK  ' : 'FAIL'} ${msg}`); if (!ok) fails++; };

// Teststrecke: lange Gerade, Kehre (2 × enge Kurve = 180°), lange Gerade zurück
const lay = chain(3, 12, 0, ['start', ...Array(9).fill('straight'), ['turnS', 1], ['turnS', 1], ...Array(9).fill('straight')]);
const envU = setup({ pieces: lay.pieces, seed: 1 }), env = envU;
const L = env.track.line, I = env.ideal;
const run = (race, t, inp) => { const ev = []; for (let k = 0; k < Math.round(t / DT); k++) { race.step(DT, typeof inp === 'function' ? inp(race) : inp); ev.push(...race.events); race.events.length = 0; } return ev; };
const crashes = (ev) => ev.filter((e) => e.type === 'crash' || e.type === 'shortcut').map((e) => e.reason || e.type);
// Abstand zur Fahrbahnkante (> 0: daneben) und zur Ideallinie
const offRoad = (race) => race.tracker.dist - L.hw[race.tracker.idx];
const offLine = (race) => { const c = race.car.pos, i = race.ap.tr.idx; return Math.hypot(c.x - I.px[i], c.z - I.pz[i]); };

// ---- A: Vorrang + Rückführung ----
{
  const race = new Race(env, { assist: 'easy', countdown: 0.2 });
  const zero = { steer: 0, throttle: 0, brake: 0 };
  run(race, +(process.env.T0 || 2.2), zero);            // anfahren (~80 km/h), auf der Linie
  const v0 = race.car.fwdSpeed();
  let tOwn = null, t = 0;
  const ev1 = [];
  // Tastatur wie im Spiel (input.js): Lenkung rampt mit 3,2/s ein und 6/s aus
  let ks = 0;
  for (let k = 0; k < 2 / DT; k++) {
    ks = Math.max(-1, ks - 3.2 * DT);
    race.step(DT, { steer: ks, throttle: 0, brake: 0 }); t += DT;
    if (tOwn === null && race.own >= 1) tOwn = t;
    ev1.push(...race.events); race.events.length = 0;
  }
  const side = offRoad(race);
  check(tOwn !== null && tOwn <= 0.16 + FREE.hold + 0.3 + 1e-6, `A1 Übernahme: Zug zur Linie nach ${tOwn && tOwn.toFixed(2)} s ganz aus (Richtwert ≤ 0,66 s: Tastatur-Rampe bis 0,5 in 0,16 s, 0,2 s halten, ≤ 0,3 s Ausblenden), Tempo vorher ${(v0 * 3.6).toFixed(0)} km/h`);
  check(side > 8, `A2 nach 2 s voll links: ${side.toFixed(1)} m neben der Fahrbahn (> 8 m)`);
  // loslassen
  let back = null, maxJerk = 0, prevSteer = race.lastInput.steer, jAt = '', maxYaw = 0;
  const ev2 = [];
  const steerLog = [];
  for (let k = 0, t2 = 0; k < 9 / DT; k++) {
    ks = Math.min(0, ks + 6 * DT);
    race.step(DT, { steer: ks, throttle: 0, brake: 0 }); t2 += DT;
    const st = race.lastInput.steer;
    // nur solange die Hilfe mitlenkt (own < 1) und bis 1 s nach der Rückkehr; davor lenkt der Spieler (Tastatur-Rampe)
    const j = race.own < 1 && (back === null || t2 < back + 1) ? Math.abs(st - prevSteer) / DT : 0; if (j > maxJerk) { maxJerk = j; jAt = `${t2.toFixed(2)}s ${prevSteer.toFixed(2)}→${st.toFixed(2)} own ${race.own.toFixed(2)} gnd ${race.car.onGround} ap ${race.ap.out.steer.toFixed(2)}`; } prevSteer = st;
    const F = race.car.frame, w = race.car.w;
    maxYaw = Math.max(maxYaw, Math.abs(w.x * F.u.x + w.y * F.u.y + w.z * F.u.z));
    if (k % 60 === 0) steerLog.push(`${t2.toFixed(1)}s:${offLine(race).toFixed(1)}m`);
    if (process.env.DBG && k % 15 === 0) console.log(`  ${t2.toFixed(2)} Linie ${offLine(race).toFixed(1)} m psi ${(race.ap.psi * 57.3).toFixed(0)}° v ${race.car.fwdSpeed().toFixed(1)} own ${race.own.toFixed(2)} shift ${race.ap.shift.toFixed(1)} st ${race.lastInput.steer.toFixed(2)} ap ${race.ap.out.steer.toFixed(2)} gnd ${race.car.onGround}`);
    ev2.push(...race.events); race.events.length = 0;
    if (back === null && offLine(race) < 1.0 && race.own === 0) back = t2;
  }
  const cr = crashes([...ev1, ...ev2]);
  check(back !== null && back <= 6 && !cr.length, `A3 losgelassen: zurück auf der Linie (< 1 m) nach ${back && back.toFixed(1)} s (Richtwert ~5 s), Crashs/Resets: ${cr.join(', ') || 'keine'}; Verlauf ${steerLog.slice(0, 8).join(' ')}`);
  check(maxJerk <= 4.01 && maxYaw < 1.3, `A4 ohne Ruck: größte Lenkänderung der Hilfe ${maxJerk.toFixed(1)}/s (Grenze 4/s, Tastatur rampt mit 3,2–8/s), größte Gierrate ${maxYaw.toFixed(2)} rad/s`);
  run(race, 60, zero);
  check(race.state === 'finished', `A5 danach fährt Leicht allein ins Ziel (${race.state})`);
}

// ---- B: kleiner Einschlag übernimmt nicht ----
{
  const race = new Race(env, { assist: 'easy', countdown: 0.2 });
  run(race, 4, { steer: 0, throttle: 0, brake: 0 });
  run(race, 3, { steer: -0.4, throttle: 0, brake: 0 });
  check(race.own === 0 && offRoad(race) < -1, `B  Lenkeinschlag 0,4 für 3 s: keine Übernahme (Anteil Spieler ${race.own}), Auto bleibt auf der Fahrbahn (${(-offRoad(race)).toFixed(1)} m vor der Kante)`);
}

// ---- C: Abkürzen ----
// Kehre (U) und Schleife (Ω: 180 m Umweg, Abstand der Schenkel 20 m): an A die Fahrbahn verlassen, quer über
// die Wiese nach B. Ohne Regel bringt die Schleife viel Zeit – mit Regel zurück an die Ausfahrt-Stelle.
const omega = setup({ pieces: chain(3, 20, 0, ['start', 'straight', 'straight', ['turnS', -1], 'straight', 'straight', 'straight', ['turnS', -1], 'straight', ['turnS', -1], 'straight', 'straight', ['turnS', 1], 'straight', 'straight', 'straight', 'straight']).pieces, seed: 1 });
let omegaRule = 0, omegaGain = 0;
for (const [name, env, cheatV] of [['Kehre', envU, 9], ['Schleife', omega, 12]]) {
  const L = env.track.line;
  const T = env.track, kinks = T.pieces.filter((p) => p.type === 'turnS');
  const iA = Math.max(0, kinks[0].lineStart - 5), iB = Math.min(L.n - 1, kinks[kinks.length - 1].lineEnd + 25);
  const sB = L.s[iB];
  const timeTo = (race, drive, lim = 60) => {
    let t = 0; const ev = [];
    while (t < lim && race.state !== 'finished') {
      race.step(DT, drive(race)); t += DT; ev.push(...race.events); race.events.length = 0;
      if (race.tracker.progress() >= sB && race.tracker.dist < L.hw[race.tracker.idx]) return { t: race.time, ev };
    }
    return { t: null, ev };
  };
  // Mogel-Bot: ab A quer durch die Wiese direkt auf B zielen (voll einlenken, dann auf das Ziel halten)
  const cheat = (race) => {
    const c = race.car, F = c.frame;
    if (race.tracker.idx < iA - 2 && race.tracker.progress() < L.s[iA]) return race.assistKey === 'easy' ? { steer: 0, throttle: 0, brake: 0 } : { steer: race.ap.out.steer, throttle: race.ap.out.throttle, brake: race.ap.out.brake };
    const dx = L.px[iB] - c.pos.x, dz = L.pz[iB] - c.pos.z;
    const ang = Math.atan2(dx * F.f.z - dz * F.f.x, dx * F.f.x + dz * F.f.z);   // > 0: Ziel links
    let st = Math.max(-1, Math.min(1, -ang * 2.5));
    if (Math.abs(st) < 0.2) st = st < 0 ? -0.2 : 0.2;   // sichtbar weiterlenken, sonst übernimmt die Hilfe
    const v = c.fwdSpeed();
    return { steer: st, throttle: v < 13 ? 1 : 0, brake: v > 16 ? 0.5 : 0 };
  };
  for (const assist of ['easy', 'medium', 'original']) {
    const legit = new Race(env, { assist, countdown: 0.2 });
    const ap = (race) => assist === 'easy' ? { steer: 0, throttle: 0, brake: 0 } : { ...race.ap.control(race.car) };
    const a = timeTo(legit, ap);
    const cr = new Race(env, { assist, countdown: 0.2 });
    const b = timeTo(cr, (race) => { race.ap.control(race.car); return cheat(race); });
    const sc = b.ev.filter((e) => e.type === 'shortcut').length;
    const free = timeTo(new Race(env, { assist, countdown: 0.2, noCutRule: true }), (race) => { race.ap.control(race.car); return cheat(race); });
    if (process.env.DBG) console.log('  ', name, assist, b.ev.map((e) => e.type + (e.reason ? ':' + e.reason : '') + (e.gain ? ':' + e.gain.toFixed(1) : '')).join(' '), 'Abkürz-Ausflüge max. Gewinn', cr.maxGain && cr.maxGain.toFixed(1));
    if (name === 'Schleife' && sc) omegaRule++;
    if (name === 'Schleife' && free.t && free.t < a.t) omegaGain++;
    check(a.t !== null && (b.t === null || b.t >= a.t - 0.05), `C  ${name.padEnd(8)} ${assist.padEnd(8)} auf der Linie ${a.t && a.t.toFixed(2)} s, quer durch die Wiese ${b.t ? b.t.toFixed(2) + ' s' : 'nicht angekommen'} (${sc}× „Abkürzung“ zurückgesetzt; ohne Regel wären es ${free.t ? free.t.toFixed(2) + ' s' : '—'}) – kein Zeitgewinn`);
  }
}

check(omegaRule === 3 && omegaGain >= 1, `C  Schleife: Regel greift auf allen 3 Stufen (${omegaRule}/3), ohne Regel wäre die Abkürzung auf ${omegaGain} Stufe(n) schneller gewesen`);

// ---- D: Stunt bleibt automatisch, mit Ansage ----
{
  const v = verifySync(generate(20260927, 2));   // Looping weit hinter dem Start
  const race = new Race(v.env, { assist: 'easy', countdown: 0.2 });
  const Ld = v.env.track.line;
  const loop0 = v.env.track.pieces.find((p) => p.type === 'loop');
  let hudBefore = null, t = 0;
  const ev = [];
  const sLoop = Ld.s[loop0.lineStart];
  let tHold = null;
  while (t < 90 && race.state !== 'finished') {
    // bis 40 m vor dem Looping nichts tun, dann voll rechts lenken und nicht mehr loslassen
    const hold = race.tracker.progress() > sLoop - 40;
    if (hold && tHold === null) tHold = t;
    race.step(DT, { steer: hold ? 1 : 0, throttle: 0, brake: 0 }); t += DT;
    ev.push(...race.events); race.events.length = 0;
    if (!hudBefore && race.hud && race.hud.kind === 'stunt' && /Looping/.test(race.hud.text) && race.tracker.idx < loop0.lineStart) hudBefore = { text: race.hud.text, m: Ld.s[loop0.lineStart] - Ld.s[race.tracker.idx] };
    if (race.tracker.idx > loop0.lineEnd + 5) break;
  }
  const loopCrash = ev.filter((e) => e.type === 'crash');
  check(hudBefore && /Looping/.test(hudBefore.text) && race.tracker.idx > loop0.lineEnd && !loopCrash.length, `D  Spieler lenkt ab 40 m vor dem Looping dauernd voll rechts: Ansage „${hudBefore && hudBefore.text}“ ${hudBefore && hudBefore.m.toFixed(0)} m vor dem Looping, Looping durchfahren, Crashs ${loopCrash.map((e) => e.reason).join(', ') || 'keine'}`);
}

console.log(fails ? `${fails} Fehlschläge` : 'Leicht frei lenkbar: Vorrang, Rückführung, Abkürz-Regel, Stunt-Ansage ok');
process.exit(fails ? 1 : 0);
