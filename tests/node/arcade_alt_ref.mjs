// n37: Referenz-Fahrten für „?physik=alt = Fahrgefühl bis n36 bitgleich“. Fährt je Stufe (Leicht/Mittel/Original) 40 s
// Rennen mit Spieler-Eingabe = Autopilot (Gas/Lenken wie die Hilfe rechnet, dazu ein Hüpfer und Nitro) auf zwei Strecken und
// liefert einen Hash über Position/Lage/Tempo alle 0,5 s. Aufruf: node tests/node/arcade_alt_ref.mjs [Wurzel des Repos]
import path from 'path'; import url from 'url';
const ROOT = process.argv[2] || path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), '../..');
const imp = (p) => import(url.pathToFileURL(path.join(ROOT, p)).href);
const { generate } = await imp('src/track/generator.js');
const { verifySync } = await imp('src/track/verify.js');
const { Race } = await imp('src/game/race.js');
try { const A = await imp('src/physics/arcade.js'); A.setArcade({ on: false }); } catch { /* vor n37 */ }
try { const N = await imp('src/game/lohn.js'); N.setLohn(N.LOHN_AUS); } catch { /* vor n38: Stunt-Lohn (eigene Regler, eigener Bitgleich-Test n38_ref.mjs) */ }
const DT = 1 / 120;
const out = {};
for (const [seed, d] of [[4711, 2], [1038, 3]]) {
  const v = verifySync(generate(seed, d));
  const env = v.env || v;
  for (const key of ['easy', 'medium', 'original']) {
    const r = new Race(env, { assist: key, countdown: 0.5 });
    let inp = { steer: 0, throttle: 0, brake: 0 }, h = 0;
    for (let k = 0; k < 40 * 120; k++) {
      r.step(DT, inp); r.events.length = 0;
      const o = r.ap.out; inp = { steer: o.steer, throttle: o.throttle, brake: o.brake };
      if (k === 1200) r.requestNitro();
      if (k === 2400) r.requestHop();
      if (k % 60 === 0) { const c = r.car; for (const x of [c.pos.x, c.pos.y, c.pos.z, c.q.x, c.q.w, c.speed(), r.time]) h = (h * 31 + Math.round(x * 1000)) % 1000000007; }
    }
    out[`${seed}-${d}-${key}`] = h;
  }
}
console.log(JSON.stringify(out));
