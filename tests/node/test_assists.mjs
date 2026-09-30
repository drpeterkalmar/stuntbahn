// Phase 4b: alle drei Fahrhilfe-Stufen mit simulierten Spielern (Bots) auf mehreren Strecken; n16: Mittel ohne
// Zug zur Ideallinie (Hände weg → Abstand wächst), perfekte Eingabe crasht nicht öfter, Leicht/Original unverändert
import { generate } from '../../src/track/generator.js';
import { verifySync } from '../../src/track/verify.js';
import { Race, ASSISTS, MEDIUM_N15, MEDIUM_N16, BRAKE_HELP } from '../../src/game/race.js';
import { prepare } from '../../src/track/verify.js';
import { parseTrk, TRK_BYTES } from '../../src/track/trk.js';
import { trkToLayout } from '../../src/track/trkimport.js';
import { tracksOf } from '../../src/game/sammlung.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
import { rng, fmtTime } from '../../src/core/util.js';
const DT = 1 / 120;
function bot(kind, seed) {
  const r = rng(seed);
  let noise = 0, nT = 0, delayQ = [];
  return (race) => {
    nT -= DT;
    if (nT <= 0) { noise = r.range(-1, 1); nT = r.range(0.3, 1.2); }
    const ap = race.ap.out;
    switch (kind) {
      case 'nichts': return { steer: 0, throttle: 0, brake: 0 };
      case 'zappelig': return { steer: noise, throttle: 1, brake: 0 };
      case 'normal': { // menschenähnlich: 0,1 s Verzögerung, leichtes Rauschen, Gas/Bremse grob nach Gefühl
        delayQ.push(ap.steer); const st = delayQ.length > 12 ? delayQ.shift() : 0;
        const vt = race.env.prof.vt[race.ap.tr.idx], v = race.car.fwdSpeed();
        return { steer: Math.max(-1, Math.min(1, st + noise * 0.15)), throttle: v < vt * 1.08 ? 1 : 0, brake: v > vt * 1.2 ? 0.7 : 0 };
      }
      case 'schlampig': { // Autopilot-Lenkung verzögert + Rauschen, immer Vollgas außer bei deutlichem Übertempo
        delayQ.push(ap.steer); const st = delayQ.length > 18 ? delayQ.shift() : 0;
        const over = race.car.fwdSpeed() > race.env.prof.vt[race.ap.tr.idx] * 1.25;
        return { steer: Math.max(-1, Math.min(1, st + noise * 0.35)), throttle: over ? 0 : 1, brake: over ? 0.6 : 0 };
      }
      case 'perfekt': return { steer: ap.steer, throttle: ap.throttle, brake: ap.brake };
    }
  };
}
const cases = [['easy', 'nichts'], ['easy', 'zappelig'], ['medium', 'normal'], ['medium', 'schlampig'], ['medium', 'perfekt'], ['original', 'perfekt'], ['original', 'normal'], ['original', 'schlampig']];
let fails = 0;
for (const [seed, diff] of [[20260927, 2], [4711, 3], [1000, 1]]) {
  const v = verifySync(generate(seed, diff));
  for (const [assist, kind] of cases) {
    const race = new Race(v.env, { assist, countdown: 0.5 });
    const b = bot(kind, seed + kind.length);
    let t = 0;
    const lim = (v.apTime || 80) * 4;
    while (t < lim && race.state !== 'finished') {
      race.ap.control(race.car); // Autopilot-Vorschlag aktualisieren (für Bots)
      race.step(DT, b(race)); t += DT;
    }
    const ok = race.state === 'finished';
    const need = !(assist === 'original' && kind !== 'perfekt') && kind !== 'schlampig';  // Stresstests dürfen scheitern
    if (!ok && need) fails++;
    console.log(`${ok ? 'OK  ' : need ? 'FAIL' : 'info'} ${seed}-${diff} ${assist.padEnd(8)} Spieler ${kind.padEnd(9)} Zeit ${ok ? fmtTime(race.finalTime) : '—'} (Autopilot ${fmtTime(v.apTime)})  Crashs ${race.crashes}  Rückspulen ${race.rewinds}  CP ${race.cpNext}/${race.cps.length}`);
  }
}

// ---- n16: Mittel ohne Linien-Magnet, mehr Haftung; Leicht/Original unverändert ----
console.log('--- n16: Mittel ohne Zug zur Linie ---');
const check = (ok, msg) => { console.log(`${ok ? 'OK  ' : 'FAIL'} ${msg}`); if (!ok) fails++; };
check(JSON.stringify(ASSISTS.easy) === JSON.stringify({ name: 'Leicht', icon: '🟢', steerPull: 0.82, autoSpeed: true, autoStunts: true, free: true, magnet: 1, air: 1, autoRewind: true, showLine: true })
  && JSON.stringify(ASSISTS.original) === JSON.stringify({ name: 'Original', icon: '🔴', steerPull: 0, autoSpeed: false, autoStunts: false, magnet: 0, air: 0, autoRewind: false, showLine: false }),
  'Leicht und Original: Fahrhilfe-Werte unverändert (Stand n15)');
check(ASSISTS.medium.steerPull === 0 && ASSISTS.medium.stuntPull === 0 && ASSISTS.medium.grip > 1 && ASSISTS.medium.magnet > MEDIUM_N15.magnet && ASSISTS.medium.brakeHelp && ASSISTS.medium.air === 0.4 && ASSISTS.medium.autoRewind && ASSISTS.medium.showLine,
  `Mittel: kein Zug zur Linie (bis n15 ${MEDIUM_N15.steerPull}/Stunt ${MEDIUM_N15.stuntPull}), Haftung ×${ASSISTS.medium.grip}, Anpressdruck ${ASSISTS.medium.magnet} (bis n15 ${MEDIUM_N15.magnet}); Bremshilfe, Luft-Lagehilfe, Rückspulen, Farblinie bleiben`);
{
  const v = verifySync(generate(1000, 1));
  for (const a of ['easy', 'original']) {
    const r = new Race(v.env, { assist: a, countdown: 0.05 });
    for (let k = 0; k < 30; k++) { r.ap.control(r.car); r.step(DT, { steer: 0, throttle: 1, brake: 0 }); }
    check(r.car.assist.grip === 1 && r.car.assist.slipK === 1, `${ASSISTS[a].name}: Reifenhaftung wie Original (Faktor ${r.car.assist.grip}, Schräglauf ${r.car.assist.slipK})`);
  }
  // Hände weg: Mittel lenkt nie mit – die Lenkung am Auto ist genau die des Spielers (außer ESP bei großem Kurswinkel
  // und der Spurhilfe im Looping/in der Röhre), der Abstand zur Ideallinie wächst in den Kurven; bis n15 hielt der Zug
  // das Auto nahe der Linie
  const handsOff = (set) => {
    const saved = { ...ASSISTS.medium }; Object.assign(ASSISTS.medium, set);
    const r = new Race(v.env, { assist: 'medium', countdown: 0.05 }), L = v.env.track.line;
    let t = 0, own = true, lat = [];
    while (t < 12 && r.state !== 'finished') {
      const a = r.ap.control(r.car);
      r.step(DT, { steer: 0, throttle: a.throttle, brake: a.brake }); t += DT; r.events.length = 0;
      if (r.state === 'countdown') continue;
      if (r.state !== 'running') break;
      const i = r.ap.tr.idx;
      if (!(L.loop[i] || L.tube[i]) && Math.abs(r.ap.psi) < BRAKE_HELP.espFrom && r.car.input.steer !== 0) own = false;
      lat.push(Math.abs(r.ap.lat));
    }
    Object.keys(ASSISTS.medium).forEach((k) => delete ASSISTS.medium[k]); Object.assign(ASSISTS.medium, saved);
    return { own, max: Math.max(...lat), crashes: r.crashes };
  };
  const h16 = handsOff({}), h15 = handsOff(MEDIUM_N15);
  check(h16.own && h16.max > 3 && h16.max > 2 * h15.max, `Mittel Hände weg: Lenkung = Spieler (0)${h16.own ? '' : ' – NEIN'}, Abstand zur Linie wächst bis ${h16.max.toFixed(1)} m (bis n15 mit Zug höchstens ${h15.max.toFixed(1)} m)`);
}
// Perfekte Eingabe (Autopilot-Lenkung und -Pedale) auf 60 Sammlungs-Strecken: nicht mehr Crashs als bis n15
{
  const meta = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/sammlung.json'), 'utf8')), bin = new Uint8Array(fs.readFileSync(path.join(ROOT, 'assets/sammlung.bin')));
  const T = tracksOf(meta), N = 60, tot = { n15: 0, n16: 0 }, ok = { n15: 0, n16: 0 };
  for (let q = 0; q < N; q++) {
    const k = Math.floor((q + 0.5) * T.length / N);
    const env = prepare(trkToLayout(parseTrk(bin.subarray(k * TRK_BYTES, (k + 1) * TRK_BYTES), T[k].id + '.trk')).layout, { treeCount: 0 });
    for (const [name, set] of [['n15', MEDIUM_N15], ['n16', MEDIUM_N16]]) {
      const saved = { ...ASSISTS.medium }; Object.assign(ASSISTS.medium, set);
      const r = new Race(env, { assist: 'medium', countdown: 0.05 });
      let t = 0;
      while (t < 400 && r.state !== 'finished') { const a = r.ap.control(r.car); r.step(DT, { steer: a.steer, throttle: a.throttle, brake: a.brake }); t += DT; r.events.length = 0; }
      Object.assign(ASSISTS.medium, saved);
      tot[name] += r.crashes; ok[name] += r.state === 'finished';
    }
  }
  check(ok.n16 === N && tot.n16 <= tot.n15, `Mittel perfekte Eingabe, ${N} Sammlungs-Strecken: im Ziel ${ok.n16}/${N}, Crashs ${tot.n16} (bis n15: ${tot.n15})`);
}

console.log(fails ? `${fails} Fehlschläge` : 'Alle Fahrhilfe-Stufen spielbar');
process.exit(fails ? 1 : 0);
