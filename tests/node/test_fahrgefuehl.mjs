// Fahrgefühl (n14, 29.09.2026): Leicht mitlenken statt Schienen, Autopilot-Tempo ohne Pendeln, Farben der Ideallinie
// passen zum Autopiloten, Mittel ohne Zwangsbremse (Bremshilfe Hinweis/Sanft, ESP gibt nach), ruhige Räder an
// Steilkurven (verwundene Fahrbahn fein geteilt). Ausführliche Messungen: tools/fahr_analyse.mjs, FAHRGEFUEHL_BERICHT.md
import { generate, demoLayout } from '../../src/track/generator.js';
import { verifySync } from '../../src/track/verify.js';
import { Race, LEICHT, BRAKE_HELP } from '../../src/game/race.js';
import { pedalPlan, PROF } from '../../src/ai/profile.js';
import { CAR_DEF, PHYS } from '../../src/physics/car.js';
import { rng } from '../../src/core/util.js';

const DT = 1 / 120;
let fails = 0;
const check = (ok, msg) => { console.log(`${ok ? 'OK  ' : 'FAIL'} ${msg}`); if (!ok) fails++; };
const f2 = (x) => x.toFixed(2);
const tracks = [['Demo', verifySync(demoLayout())], ['S1000/1', verifySync(generate(1000, 1))], ['S4711/3', verifySync(generate(4711, 3))]];

check(PHYS === 3 && CAR_DEF.mu === 1.7 && CAR_DEF.downK === 2.5 && CAR_DEF.groundFx > 0 && LEICHT.lk > 0 && PROF.brakeCircle > 0, `Stand n14: Physik ${PHYS}, mu ${CAR_DEF.mu}, Abtrieb ${CAR_DEF.downK} (Bodeneffekt ${CAR_DEF.groundFx} m), Leicht lk ${LEICHT.lk}, Bremsplan ${PROF.brakeCircle}`);

// ---- A: Leicht – Hände weg driftet (auf der Fahrbahn, ohne Crash, langsamer), wer mitlenkt, fährt die Linie ----
console.log('--- A: Leicht mitlenken ---');
function leicht(v, who) {
  const r = rng(29), q = [];
  let noise = 0, nT = 0;
  const race = new Race(v.env, { assist: 'easy', countdown: 0.5 });
  const L = v.env.track.line;
  let t = 0, lat = 0, n = 0, off = 0;
  while (t < v.apTime * 3 && race.state !== 'finished') {
    race.ap.control(race.car);
    nT -= DT; if (nT <= 0) { noise = r.range(-1, 1); nT = r.range(0.3, 1.2); }
    let st = 0;
    if (who === 'normal') { q.push(race.ap.out.steer); st = Math.max(-1, Math.min(1, (q.length > 12 ? q.shift() : 0) + noise * 0.15)); }
    if (who === 'daumen') st = 0.3;
    race.step(DT, { steer: st, throttle: 0, brake: 0 }); t += DT; race.events.length = 0;
    if (race.state !== 'running') continue;
    const i = race.ap.tr.idx, ti = race.tracker.idx;
    if (L.air[i] || L.loop[i] || L.tube[i] || race.isJumpZone(i) || race.zoneAhead(i, Math.max(35, race.car.fwdSpeed() * 2.5))) continue;
    lat += Math.abs(race.ap.lat); n++;
    if (race.tracker.dist > L.hw[ti] && race.car.onGround) off += DT;   // Wagenmitte neben dem Asphalt
  }
  return { ok: race.state === 'finished', dt: race.finalTime / v.apTime - 1, lat: lat / Math.max(1, n), crashes: race.crashes, off };
}
for (const [name, v] of tracks.slice(0, 2)) {
  const a = leicht(v, 'nichts'), b = leicht(v, 'normal'), c = leicht(v, 'daumen');
  check(a.ok && !a.crashes && a.off === 0 && a.lat >= 1.0 && a.lat <= 3.5 && a.dt >= 0.04 && a.dt <= 0.25, `${name} Hände weg: Ø ${f2(a.lat)} m neben der Linie (1–3,5), Runde ${(100 * a.dt).toFixed(0)} % langsamer (4–25), Crashs ${a.crashes}, neben dem Asphalt ${f2(a.off)} s`);
  check(b.ok && !b.crashes && b.lat <= 0.6 && b.dt <= 0.03, `${name} mitlenken („normal“): Ø ${f2(b.lat)} m (≤ 0,6), Runde ${(100 * b.dt).toFixed(1)} % (≤ +3)`);
  check(c.ok && !c.crashes && c.lat >= 0.9, `${name} Daumen 0,3: Ø ${f2(c.lat)} m versetzt (≥ 0,9), ohne Übernahme im Ziel`);
}

// ---- B: Autopilot-Tempo und Farben der Linie ----
console.log('--- B: Tempo-Regler, Farben ---');
for (const [name, v] of tracks) {
  const { cls } = pedalPlan(v.env.ideal, v.env.prof);
  const race = new Race(v.env, { assist: 'easy', countdown: 0.5, autopilot: true });
  let t = 0, sw = 0, last = 0, run = 0, brakeRed = 0, brakeAll = 0, gasGreen = 0, gasAll = 0;
  while (t < 300 && race.state !== 'finished') {
    race.step(DT, { steer: 0, throttle: 0, brake: 0 }); t += DT; race.events.length = 0;
    if (race.state !== 'running') continue;
    run += DT;
    const u = race.car.input, s = u.brake > 0.05 ? -1 : u.throttle > 0.05 ? 1 : 0;
    if (s && last && s !== last) sw++;
    if (s) last = s;
    if (race.car.onGround === 0) continue;
    const c = cls[race.ap.tr.idx];
    if (s === -1) { brakeAll++; if (c === 2) brakeRed++; }
    if (s === 1) { gasAll++; if (c === 0) gasGreen++; }
  }
  const perMin = 60 * sw / run;
  check(race.state === 'finished' && !race.crashes && perMin < 90, `${name}: Autopilot im Ziel ohne Crash, Gas↔Bremse-Wechsel ${perMin.toFixed(0)}/min (< 90; bis n13 ~390/min)`);
  check(brakeRed / brakeAll >= 0.9 && gasGreen / gasAll >= 0.8, `${name}: Linie rot, wo der Autopilot bremst: ${(100 * brakeRed / brakeAll).toFixed(0)} % (≥ 90), grün, wo er Gas gibt: ${(100 * gasGreen / gasAll).toFixed(0)} % (≥ 80)`);
}

// ---- C: Mittel – keine Zwangsbremse, Hinweis, Sanft gibt frei, ESP gibt nach ----
console.log('--- C: Mittel ---');
{
  const v = tracks[2][1], P = v.env.prof;
  const race = new Race(v.env, { assist: 'medium', countdown: 0.5 });
  let t = 0, run = 0, braked = 0, hints = 0;
  while (t < 200 && race.state !== 'finished') {
    const o = race.ap.control(race.car);
    race.step(DT, { steer: o.steer, throttle: 1, brake: 0 }); t += DT;
    for (const e of race.events) if (e.type === 'brakehint') hints++;
    race.events.length = 0;
    if (race.state === 'running') { run += DT; if (race.car.input.brake > 0.01) braked += DT; }
  }
  check(braked / run < 0.005 && hints > 3, `Vollgas-Spieler (Standard „Hinweis“): eingebremst ${(100 * braked / run).toFixed(1)} % der Zeit (bis n13 31 %), ${hints} Brems-Hinweise`);
  // Sanft: deutliches Übertempo ohne Vollgas → bremst; Vollgas → in ≤ 0,3 s frei
  const s = new Race(v.env, { assist: 'medium', countdown: 0.05, brakeHelp: 'soft' });
  s.step(DT, { steer: 0, throttle: 0, brake: 0 });
  let i = 0; for (let k = 1; k < s.env.track.line.n; k++) if (P.vt[k] < P.vt[i]) i = k;   // langsamste Stelle
  s.place(Math.max(0, i - 3), P.vt[i] * 1.5, true);
  let softOn = 0;
  for (let k = 0; k < 30; k++) { const o = s.ap.control(s.car); s.step(DT, { steer: o.steer, throttle: 0.5, brake: 0 }); softOn = Math.max(softOn, s.car.input.brake); }
  let tFree = null;
  for (let k = 0; k < 60 && tFree === null; k++) { const o = s.ap.control(s.car); s.step(DT, { steer: o.steer, throttle: 1, brake: 0 }); if (s.car.input.brake < 0.01 && s.car.input.throttle > 0.99) tFree = (k + 1) * DT; }
  check(softOn > 0.1 && tFree !== null && tFree <= BRAKE_HELP.outT + 1e-6, `„Sanft“: bremst bei ${((P.vt[i] * 1.5 / P.vt[i] - 1) * 100).toFixed(0)} % Übertempo mit halbem Gas (Bremse ${f2(softOn)}), Vollgas → frei nach ${tFree && f2(tFree)} s (≤ ${BRAKE_HELP.outT})`);
  // ESP: Auto mit 1 rad Kurswinkel auf der Start-Geraden. Ohne Eingabe lenkt ESP zur Linie; lenkt der Spieler
  // deutlich dagegen, ist ESP nach ≤ espOut s ganz ausgeblendet und seine Lenkrichtung kommt an
  const esp = (who) => {
    const e = new Race(v.env, { assist: 'medium', countdown: 0.05 });
    while (e.state === 'countdown') e.step(DT, { steer: 0, throttle: 0, brake: 0 });
    const L = v.env.track.line, j = e.startIdx + 8, a = 1.0, c = Math.cos(a), s = Math.sin(a);
    const t = [L.tx[j], L.ty[j], L.tz[j]], n = [L.nx[j], L.ny[j], L.nz[j]];
    const b = [n[1] * t[2] - n[2] * t[1], n[2] * t[0] - n[0] * t[2], n[0] * t[1] - n[1] * t[0]];
    e.car.place([L.px[j], L.py[j], L.pz[j]], [t[0] * c + b[0] * s, t[1] * c + b[1] * s, t[2] * c + b[2] * s], n, 14);
    e.tracker.reset(j); e.ap.tr.reset(j);
    let pull = 0, tOut = null;
    for (let k = 0; k < 48; k++) {
      const u = who === 'nichts' ? 0 : -Math.sign(e.ap.control(e.car).steer || 1);
      e.step(DT, { steer: u, throttle: 0.5, brake: 0 }); e.events.length = 0;
      const out = e.espFade >= 1 - 1e-9 && Math.sign(e.car.input.steer) === u;
      if (who === 'nichts') pull = Math.max(pull, Math.abs(e.car.input.steer));
      else if (tOut === null && out) tOut = (k + 1) * DT;
      else if (tOut !== null && !out) tOut = null;
    }
    return { pull, tOut };
  };
  const e0 = esp('nichts'), e1 = esp('gegen');
  check(e0.pull > 0.2 && e1.tOut !== null && e1.tOut <= BRAKE_HELP.espOut + DT + 1e-6, `ESP: 1 rad quer, ohne Eingabe lenkt es mit ${f2(e0.pull)} zurück; deutliches Gegenlenken blendet es in ${e1.tOut && f2(e1.tOut)} s aus (≤ ${BRAKE_HELP.espOut})`);
}

// ---- D: Haftung – ruhige Räder an Steilkurven, der perfekte Fahrer hebt selten ab ----
console.log('--- D: Haftung ---');
{
  const v = tracks[2][1], L = v.env.track.line;
  const race = new Race(v.env, { assist: 'original', countdown: 0.5, autopilot: true });
  let t = 0, bankSteps = 0, jumps = 0, lift = 0, air = 0;
  const stat = CAR_DEF.mass * 9.81 / 4, prev = [0, 0, 0, 0];
  while (t < 200 && race.state !== 'finished') {
    race.step(DT, { steer: 0, throttle: 0, brake: 0 }); t += DT; race.events.length = 0;
    if (race.state !== 'running') continue;
    const i = race.tracker.idx, pc = v.env.track.pieces[L.piece[i]], bank = !L.air[i] && pc && pc.type === 'bank';
    race.car.wheels.forEach((w, q) => { if (bank && Math.abs(w.load - prev[q]) > 2 * stat) jumps++; prev[q] = w.load; });
    if (bank) bankSteps++;
    if (L.air[i] || race.isJumpZone(i)) { air = 0; continue; }
    if (race.car.onGround <= 1) air += DT; else { if (air >= 0.05) lift++; air = 0; }
  }
  // bis n13 sprang die Radlast an Steilkurven im Schnitt 0,5-mal je Schritt um mehr als das Doppelte der Standlast
  // (Sägezahn der verwundenen Fahrbahn-Dreiecke, ~30 Hz)
  check(jumps / bankSteps < 0.1, `S4711/3 Steilkurven: Lastsprünge > 2× Standlast ${(jumps / bankSteps).toFixed(3)} je Schritt (< 0,1; bis n13 0,51)`);
  check(lift <= 6, `S4711/3 perfekter Fahrer auf Original: ${lift}× abgehoben außerhalb von Sprüngen (≤ 6)`);
}

console.log(fails ? `${fails} Fehlschläge` : 'Fahrgefühl n14: alle Prüfungen grün');
process.exit(fails ? 1 : 0);
