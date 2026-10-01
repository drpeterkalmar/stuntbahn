// n22: Messwerte je Gelände-Element (Autopilot ohne Hilfen, Haftung n21 an): Tempo (Ein-/Höchst-), Luftzeit, größte
// Last (g, senkrecht zum Auto), Abheben (Zahl), Crashs. Aufruf: node tools/gelaende_mess.mjs [Seeds je Stufe=12]
import { generate } from '../src/track/generator.js';
import { verifySync } from '../src/track/verify.js';
import { Race } from '../src/game/race.js';
const N = +(process.argv[2] || 12);
const DT = 1 / 120, zero = { steer: 0, throttle: 0, brake: 0 };
const KINDS = ['kuppe', 'serpentine', 'hang', 'mulde', 'tunnel', 'bruecke', 'schlucht', 'drop', 'halfpipe', 'looping'];
const acc = Object.fromEntries(KINDS.map((k) => [k, { n: 0, vin: [], vmax: [], air: [], g: [], lift: 0, crash: 0 }]));
for (const diff of [1, 2, 3]) for (let q = 0; q < N; q++) {
  const seed = 1000 + q * 7919 % 90000;
  const lay = generate(seed, diff, { gel: true });
  const v = verifySync(lay);
  if (!v.ok) continue;
  const env = v.env, L = env.track.line, P = env.layout.pieces, pl = env.track.gel.plan.pieces;
  const serp = new Set();
  for (const sp of (env.layout.gel && env.layout.gel.serp) || []) { const a = P.findIndex((p) => p.i === sp.c0[0] && p.j === sp.c0[1]), b = P.findIndex((p) => p.i === sp.c1[0] && p.j === sp.c1[1]); for (let k = a; k <= b && a >= 0; k++) serp.add(k); }
  const kindOf = (k) => (P[k].g === 'kuppe' || (L.wave && false) ? 'kuppe' : serp.has(k) ? 'serpentine' : P[k].tilt0 != null ? 'hang' : P[k].type === 'bank' ? 'mulde' : pl[k].tunnel ? 'tunnel' : pl[k].bridge ? 'bruecke'
    : P[k].g === 'gorge' ? 'schlucht' : P[k].g === 'drop' ? 'drop' : P[k].type === 'halfpipe' ? 'halfpipe' : P[k].type === 'loop' ? 'looping' : null);
  // Kuppe: ganze Zone (wave 3)
  const zoneKind = (i) => (L.wave[i] === 3 ? 'kuppe' : kindOf(L.piece[i]));
  const race = new Race(env, { assist: 'original', autopilot: true, countdown: 0.05 });
  let t = 0, cur = null, prevV = null, air = 0, wasGround = true, hist = [];
  const lim = Math.max(90, L.total / 7);
  while (t < lim && race.state !== 'finished') {
    race.step(DT, zero); t += DT;
    const c = race.car, i = race.tracker.idx, k = zoneKind(i);
    const vel = [c.v.x, c.v.y, c.v.z];
    if (k !== (cur && cur.k)) { if (cur) { const A = acc[cur.k]; A.n++; A.vin.push(cur.vin); A.vmax.push(cur.vmax); A.air.push(cur.air); A.g.push(cur.g); } cur = k ? { k, vin: c.speed() * 3.6, vmax: 0, air: 0, g: 0 } : null; }
    if (cur) {
      cur.vmax = Math.max(cur.vmax, c.speed() * 3.6);
      const ground = c.onGround > 0;
      if (!ground) { air += DT; } else { if (air > 0.15 && !wasGround) acc[cur.k].lift++; air = 0; }
      cur.air = Math.max(cur.air, air);
      wasGround = ground;
      // Last über 0,1 s gemittelt (Stöße einzelner Schritte zählen nicht)
      const h0 = hist.length >= 12 ? hist[hist.length - 12] : null;
      if (h0 && ground && h0.g) {
        const W = 12 * DT, a = [(vel[0] - h0.v[0]) / W, (vel[1] - h0.v[1]) / W + 9.81, (vel[2] - h0.v[2]) / W], u = c.frame.u;
        cur.g = Math.max(cur.g, (a[0] * u.x + a[1] * u.y + a[2] * u.z) / 9.81);
      }
      if (c.crash) acc[cur.k].crash++;
    }
    prevV = vel; hist.push({ v: vel, g: c.onGround > 0 }); if (hist.length > 20) hist.shift();
  }
}
const med = (a) => { const b = [...a].sort((x, y) => x - y); return b.length ? b[b.length >> 1] : 0; };
const mx = (a) => (a.length ? Math.max(...a) : 0);
console.log('Element      | n  | Tempo ein Ø | Tempo max (max) | Luft max (Median) | Last max g (Median) | Abheben | Crashs');
for (const k of KINDS) { const A = acc[k]; if (!A.n) { console.log(k.padEnd(12), '| 0'); continue; } console.log(`${k.padEnd(12)} | ${String(A.n).padEnd(2)} | ${med(A.vin).toFixed(0).padStart(4)} km/h | ${med(A.vmax).toFixed(0)} (${mx(A.vmax).toFixed(0)}) km/h | ${mx(A.air).toFixed(2)} (${med(A.air).toFixed(2)}) s | ${mx(A.g).toFixed(1)} (${med(A.g).toFixed(1)}) | ${A.lift} | ${A.crash}`); }
