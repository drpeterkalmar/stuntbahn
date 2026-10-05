// Zielshow (n27): Auslaufen nach dem Ziel wird aufgezeichnet (≥ 3 s, Rennzeit/Geist unverändert, bis zur Linie bitgleich),
// Auslaufen sicher (kein Crash, auf der Fahrbahn, vor Stunts anhalten), Jubel-Dreher nur mit Platz, Feuerwerk deterministisch
// und im Budget je Grafikstufe, Replay-Zeit bleibt an der Linie stehen, Zielbogen-Kamera frei und mit Sicht.
// Aufruf: node tests/node/test_zielshow.mjs
import { RUNS, runRace, marksOf } from '../../tools/kinoreplay_probe.mjs';
import { REC_HZ, REC_STRIDE, Race } from '../../src/game/race.js';
import { Replay } from '../../src/game/replay.js';
import { ZIEL, pyroGeo, pyroPlan, flashAt, particleAt, KIND } from '../../src/game/zielshow.js';
import { CineCam } from '../../src/game/cinecam.js';
import { generate } from '../../src/track/generator.js';
import { verifySync } from '../../src/track/verify.js';

let fails = 0;
const check = (ok, msg) => { console.log(`${ok ? 'OK  ' : 'FAIL'} ${msg}`); if (!ok) fails++; };
const fmt = (x, d = 1) => x.toFixed(d).replace('.', ',');

console.log('--- A: Aufzeichnung nach dem Ziel ---');
for (const R of RUNS) {
  const env = R.env();
  const a = runRace(env, { ...R.opts, runout: false });
  const b = runRace(env, R.opts);
  const F = b.rec.length / REC_STRIDE, after = (F - b.finF) / REC_HZ;
  check(b.state === 'finished' && after >= 3 && after <= ZIEL.rec + 0.05, `${R.name}: Auslauf aufgezeichnet ${fmt(after, 2)} s (≥ 3 s)`);
  check(a.finalTime === b.finalTime && b.time === b.finalTime, `${R.name}: Rennzeit unverändert ${fmt(b.finalTime, 3)} s (ohne Auslauf ${fmt(a.finalTime, 3)} s), Uhr steht`);
  // (im Schritt über die Linie wird noch ein Bild aufgezeichnet – die Fahrt ohne Auslauf endet dort)
  let same = a.rec.length === b.finF * REC_STRIDE;
  for (let i = 0; same && i < a.rec.length; i++) if (a.rec[i] !== b.rec[i]) same = false;
  check(same, `${R.name}: Aufzeichnung bis zur Linie bitgleich (${b.finF} Bilder)`);
  const g = b.ghostRec();
  check(g.length === b.finF * REC_STRIDE + b.pens.reduce((s, p) => s + Math.round(p.sec * REC_HZ) * REC_STRIDE, 0), `${R.name}: Geist endet an der Linie (${g.length / REC_STRIDE} Bilder)`);
  // Auslaufen: kein Crash, auf der Fahrbahn (Linienabstand), kein Rückwärts-Rasen
  const L = env.track.line;
  let maxOff = 0, crash = !!b.car.crash;
  for (let f = b.finF; f < F; f += 6) {
    const o = f * REC_STRIDE, x = b.rec[o], z = b.rec[o + 2];
    let dm = 1e9, im = 0; for (let i = 0; i < L.n; i += 2) { const d = (L.px[i] - x) ** 2 + (L.pz[i] - z) ** 2 + (L.py[i] - b.rec[o + 1]) ** 2; if (d < dm) { dm = d; im = i; } }
    maxOff = Math.max(maxOff, Math.sqrt(dm) - L.hw[im]);
  }
  check(!crash && maxOff < 1.5, `${R.name}: Auslaufen ohne Crash, auf der Fahrbahn (größter Abstand über die Kante ${fmt(maxOff)} m)`);
  // Replay: Rennzeit bleibt an der Linie stehen
  const rp = new Replay(b.rec, env, marksOf(b));
  rp.t = rp.duration - 0.01;
  const pen = b.pens.reduce((s, p) => s + p.sec, 0);
  check(Math.abs(rp.raceTime() - (b.finF / REC_HZ + pen)) < 1e-6, `${R.name}: Replay-Uhr am Ende ${fmt(rp.raceTime(), 2)} s = Linie`);
}

console.log('--- B: Tempo im Auslaufen, Anhalten vor Stunts, Jubel-Dreher ---');
{
  let spins = 0, n = 0, offMax = -99, stopOk = 0, stopN = 0;
  for (const seed of [2, 3, 4, 5, 8, 10, 12]) for (const o of [{}, { gel: true }, { d3: true }]) {
    const env = verifySync(generate(seed, 2, o)).env;
    const race = runRace(env, { assist: 'easy', fahrstil: 'brachial', autoExtras: false });
    n++;
    const S = race.spinPlan, L = env.track.line;
    if (S && S.t0 != null) {
      spins++;
      // während des Drehers bis zum Stillstand: Wagenmitte auf der Fahrbahn (Probe-Dreher prüft das vorab)
      const f0 = race.finF + Math.round(S.t0 * REC_HZ), F = race.rec.length / REC_STRIDE;
      for (let f = f0; f < F; f += 3) {
        const q = f * REC_STRIDE; let dm = 1e9, im = 0;
        for (let i = 0; i < L.n; i++) { const d = (L.px[i] - race.rec[q]) ** 2 + (L.pz[i] - race.rec[q + 2]) ** 2 + (L.py[i] - race.rec[q + 1]) ** 2; if (d < dm) { dm = d; im = i; } }
        offMax = Math.max(offMax, Math.sqrt(dm) - L.hw[im]);
      }
    }
    // vor einem Stunt hinter dem Ziel angehalten (falls der Weg reichte): Tempo am Ende klein oder Stunt durchfahren
    if (race.runZone && !race.runZone.thru) { stopN++; if (Math.abs(race.car.fwdSpeed()) < 30) stopOk++; }
  }
  check(spins >= 3, `Jubel-Dreher auf Leicht/Brachial: ${spins} von ${n} Strecken (wenn Platz ist)`);
  check(offMax < 0, `Jubel-Dreher bleibt auf der Fahrbahn (Wagenmitte mindestens ${fmt(-offMax)} m innerhalb der Kante)`);
  check(stopOk === stopN, `vor Stunts hinter dem Ziel rechtzeitig langsam (${stopOk}/${stopN})`);
  // Mittel/Autopilot: kein Dreher (nur Leicht + Brachial)
  const env = verifySync(generate(4711, 3)).env;
  const m = runRace(env, { assist: 'medium', autopilot: true });
  check(!m.spinPlan, 'Mittel/Autopilot: kein Jubel-Dreher');
}

console.log('--- C: Feuerwerk ---');
{
  const env = RUNS[0].env(), geo = pyroGeo(env.track);
  for (const tier of [0, 1, 2]) for (const best of [false, true]) {
    const P = pyroPlan(geo, { tier, best, seed: 'a' });
    const T = ZIEL.tiers[tier];
    const kinds = {}; for (let i = 0; i < P.n; i++) { const k = P.data[i * 16 + 11]; kinds[k] = (kinds[k] || 0) + 1; }
    check(P.n <= T.max && P.n > 200 && P.end < 11, `Stufe ${tier}${best ? ' Bestzeit' : ''}: ${P.n} Partikel (Budget ${T.max}), ${P.flashes.length} Bursts, Ende ${fmt(P.end)} s, Arten ${JSON.stringify(kinds)}`);
  }
  const nB = pyroPlan(geo, { tier: 2, best: true, seed: 'a' }), nN = pyroPlan(geo, { tier: 2, best: false, seed: 'a' }), nE = pyroPlan(geo, { tier: 2, best: true, easy: true, seed: 'a' });
  check(nB.flashes.length > nN.flashes.length && nB.n > nN.n && nE.n === nN.n, `Bestzeit größer (${nB.flashes.length} gegen ${nN.flashes.length} Raketen), Leicht wie normal`);
  const p1 = pyroPlan(geo, { tier: 2, seed: 'x' }), p2 = pyroPlan(geo, { tier: 2, seed: 'x' }), p3 = pyroPlan(geo, { tier: 2, seed: 'y' });
  check(p1.data.every((v, i) => v === p2.data[i]) && p1.data.some((v, i) => v !== p3.data[i]), 'deterministisch: gleicher Seed = gleiches Feuerwerk, anderer Seed = anderes');
  // Fontänen steigen und fallen, Bursts über dem Ziel, Konfetti fällt langsam
  let up = 0, nf = 0;
  for (let i = 0; i < p1.n; i++) if (p1.data[i * 16 + 11] === KIND.spark && p1.data[i * 16 + 3] < 0.05) { const a = particleAt(p1, i, p1.data[i * 16 + 3] + 0.3); if (a) { nf++; if (a[1] > p1.data[i * 16 + 1] + 2) up++; } }
  check(nf > 0 && up / nf > 0.9, `Fontänen-Funken steigen (${up}/${nf} nach 0,3 s > 2 m hoch)`);
  const hb = p1.flashes.map((f) => f.p[1] - geo.p[1]);
  check(hb.every((h) => h > 15 && h < 40), `Bursts ${fmt(Math.min(...hb))}–${fmt(Math.max(...hb))} m über dem Ziel`);
  let fmax = 0; for (let t = 0; t < 8; t += 0.01) fmax = Math.max(fmax, flashAt(p1, t).k);
  check(fmax > 0.1 && fmax <= 0.6, `Lichtblitz höchstens ${fmt(fmax, 2)} (≤ 0,6)`);
}

console.log('--- D: Zielbogen-Kamera ---');
for (const R of RUNS) {
  const env = R.env(), cc = new CineCam(env, new Float32Array(16 * 10), { clips: [] }), A = cc.setupArch();
  const ok = !A.fallback && cc.offRoad(A.pos) && A.pos[1] >= cc.floor(A.pos[0], A.pos[2]) + 0.5 && cc.ray(A.pos, [A.arch[0], A.arch[1] + 6, A.arch[2]]) > 0.97;
  check(ok, `${R.name}: Standort frei, neben der Fahrbahn, über Boden, Sicht auf den Bogen (Sicht-Wert ${fmt(A.vis, 2)}, ${fmt(Math.hypot(A.pos[0] - A.arch[0], A.pos[2] - A.arch[2]))} m)`);
}
console.log(fails ? `${fails} FEHLER` : 'Zielshow n27: alle Prüfungen grün');
process.exit(fails ? 1 : 0);
