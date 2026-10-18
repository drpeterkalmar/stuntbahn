// n38 Etappe 4 Drift-Turbo – Abschätzung zu Messgröße 9 („Tester treffen Rot in 30–60 % der Versuche am Handy“) und Wirkung.
// Fahrer: lenkt wie der Autopilot, Vollgas außer bei „Bremsen!“/„langsamer ▼“ (Mittel bzw. Original). Tipp-Modell Mensch: sieht das
// Meter rot werden und tippt nach einer Reaktionszeit ~ Normal(mu, sd) Sekunden echter Zeit (negativ = vorausgeahnt, zu früh =
// grün); Spielzeit = echte Zeit × Spieltempo der Stufe. Je Variante driftturbo 0/1 auf geprüften Zufallsstrecken.
// Kennzahlen: Drifts, Tipps, davon rot (Treffer), Turbos, Meter voll gelaufen, Zeit, Crashs.
// Aufruf: node tools/driftturbo_mess.mjs [N je Art und Stufe = 2] [--mu=0.22] [--sd=0.15] [--stufen=medium,original]
import path from 'path'; import url from 'url';
const HERE = path.dirname(url.fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const imp = (p) => import(url.pathToFileURL(path.join(ROOT, p)).href);
const { generate } = await imp('src/track/generator.js');
const { verifySync } = await imp('src/track/verify.js');
const { Race, GAME_SPEEDS } = await imp('src/game/race.js');
const { LOHN, setLohn } = await imp('src/game/lohn.js');
const { rng } = await imp('src/core/util.js');
const arg = (k, d) => { const a = process.argv.find((s) => s.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const N = +(process.argv.find((a) => /^\d+$/.test(a)) || 2), MU = +arg('mu', 0.22), SD = +arg('sd', 0.15);
const STUFEN = arg('stufen', 'medium,original').split(',');
const DT = 1 / 120;
const tracks = [];
for (const o of [{}, { d3: true }, { gel: true }]) for (const d of [2, 3]) for (let k = 0; k < N; k++) {
  const seed = 3000 + k * 7919 % 90000, v = verifySync(generate(seed, d, { ...o, gv: 2 }));
  if (v.ok) tracks.push({ name: `${seed}-${d}`, v });
}
const gauss = (R) => { let u = 0; for (let i = 0; i < 6; i++) u += R(); return (u - 3) / Math.sqrt(0.5); };
function run(v, key, seed) {
  const r = new Race(v.env, { assist: key, countdown: 0.05, brakeHelp: 'hint' }), R = rng(seed), gs = GAME_SPEEDS[key];
  let inp = { steer: 0, throttle: 0, brake: 0 }, tapAt = -1, tapEnd = -1, armed = false, t = 0;
  for (; t < 200 && r.state !== 'finished'; t += DT) {
    r.step(DT, inp); r.events.length = 0;
    const o = r.ap.out, D = r.dturbo;
    inp = { steer: o.steer, throttle: r.bhOn || r.jumpSt === 'hi' ? 0 : 1, brake: r.bhOn ? 1 : 0 };
    if (LOHN.driftturbo === 1) {
      // Meter erscheint → der Mensch plant den Tipp ab Beginn der roten Zone (0,48 s nach dem Drift-Beginn) + Reaktion
      if (D.on && !D.over && !armed && tapAt < 0) { armed = true; tapAt = t + 0.5 * LOHN.dt.fill + gauss(R) * SD * gs + MU * gs - D.m * LOHN.dt.fill; }
      if (!D.on || D.over) { armed = false; if (tapEnd < t) tapAt = -1; }
      if (tapAt > 0 && t >= tapAt) { tapEnd = t + 0.08; tapAt = -1; armed = false; }
      if (t < tapEnd) inp.brake = 1;
    }
  }
  return { ok: r.state === 'finished', time: r.finalTime, crashes: r.crashes, st: { ...r.dturbo.stat } };
}
for (const key of STUFEN) {
  const res = {};
  for (const dtv of [0, 1]) {
    setLohn({ driftturbo: dtv });
    const A = (res[dtv] = { ok: 0, n: 0, crashes: 0, time: {}, st: { drifts: 0, taps: 0, red: 0, green: 0, full: 0, turbos: 0 } });
    for (const T of tracks) for (const sd of [7, 8]) {
      const x = run(T.v, key, sd);
      A.n++; A.ok += x.ok ? 1 : 0; A.crashes += x.crashes; if (x.ok) A.time[T.name + sd] = x.time;
      for (const k in A.st) A.st[k] += x.st[k];
    }
  }
  const a = res[0], b = res[1]; let sa = 0, sb = 0, n = 0;
  for (const k of Object.keys(a.time)) if (b.time[k]) { sa += a.time[k]; sb += b.time[k]; n++; }
  const S = b.st;
  console.log(`${key.padEnd(8)}: aus ${a.ok}/${a.n} Ziel, Crashs ${a.crashes} · an ${b.ok}/${b.n} Ziel, Crashs ${b.crashes} · Drifts ${S.drifts} (${(S.drifts / b.n).toFixed(1)}/Runde), Tipps ${S.taps}, rot ${S.red} (${S.taps ? (S.red / S.taps * 100).toFixed(0) : 0} %), Turbos ${S.turbos}, Meter voll ${S.full} · Zeit ${((1 - sb / sa) * 100).toFixed(2)} % schneller (${n})`);
}
console.log(`${tracks.length} Strecken × 2 Seeds · Reaktion ${MU} ± ${SD} s`);
