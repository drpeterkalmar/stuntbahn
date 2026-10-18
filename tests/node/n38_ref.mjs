// n38: Referenz-Fahrten für „alle n38-Regler aus (?tank=0&kette=…&landeschub=0&zwischen=0 …) = Stand n37 bitgleich“.
// Fährt je Stufe (Leicht mit „Extras automatisch“, Mittel, Original) 60 s Rennen auf drei Strecken: Spieler-Eingabe = Autopilot,
// dazu Nitro, sobald bereit, ein Hüpfer alle 9 s, auf Mittel in der Luft ein Gas-Tipp (Salto), auf Original 0,4 s Gas halten
// (nicken). Hash über Position/Lage/Tempo/Rennzeit/Stunt-Summe/Nitro-Einsätze alle 0,5 s.
// Aufruf: node tests/node/n38_ref.mjs [Wurzel des Repos]
import path from 'path'; import url from 'url';
const ROOT = process.argv[2] || path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), '../..');
const imp = (p) => import(url.pathToFileURL(path.join(ROOT, p)).href);
const { generate } = await imp('src/track/generator.js');
const { verifySync } = await imp('src/track/verify.js');
const { Race } = await imp('src/game/race.js');
try { const N = await imp('src/game/lohn.js'); N.setLohn(N.LOHN_AUS); } catch { /* vor n38 */ }
const DT = 1 / 120;
const out = {};
for (const [seed, d, o] of [[4711, 2, {}], [1038, 3, {}], [5003, 3, { gel: true, gv: 2 }]]) {
  const v = verifySync(generate(seed, d, o));
  const env = v.env || v;
  for (const key of ['easy', 'medium', 'original']) {
    const r = new Race(env, { assist: key, countdown: 0.5, autoExtras: key === 'easy' });
    let inp = { steer: 0, throttle: 0, brake: 0 }, h = 0, airK = 0;
    for (let k = 0; k < 60 * 120; k++) {
      r.step(DT, inp); r.events.length = 0;
      const o = r.ap.out, c = r.car;
      inp = { steer: o.steer, throttle: o.throttle, brake: o.brake };
      if (c.onGround === 0) airK++; else airK = 0;
      if (key === 'medium' && airK >= 50 && airK < 60) inp = { ...inp, throttle: 0 };
      if (key === 'medium' && airK >= 60 && airK < 66) inp = { ...inp, throttle: 1 };
      if (key === 'original' && airK >= 40 && airK < 88) inp = { ...inp, throttle: 1, brake: 0 };
      if (key !== 'easy' && r.charges.nitro && k % 30 === 0) r.requestNitro();
      if (k % 1080 === 600) r.requestHop();
      if (k % 60 === 0) { for (const x of [c.pos.x, c.pos.y, c.pos.z, c.q.x, c.q.w, c.speed(), r.time, r.stunts ? r.stunts.total : 0, r.used.nitro, r.cd.nitro]) h = (h * 31 + Math.round(x * 1000)) % 1000000007; }
    }
    out[`${seed}-${d}-${key}`] = h;
  }
}
console.log(JSON.stringify(out));
