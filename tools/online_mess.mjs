// n35 Messung (Node, ohne Browser, < 30 s): Wie weit liegt ein fremdes Auto, so wie dieses Gerät es kennt, hinter dem
// echten zurück? Echte Fahrt = Autopilot-Rennen auf einer Generator-Strecke (Race, Stufe Original); gesendet mit 25 Hz über
// das Fake-Netz-Modell (Laufzeit je Richtung, Schwankung, 5 % Verlust), Empfang mit net/puffer.js wie im Spiel.
// Vergleich zur selben Zeit: (a) gezeigte Lage (Puffer, „jetzt − Verzug“), (b) vorausgerechnet um den Verzug wie im
// Spiel (puffer.js abtasten(jetzt, 1): geglättetes Tempo und Drehrate × Verzug). Ausgabe: Tabelle je Ping (Mittel/95 % in m, Verzug ms) – Grundlage für den Bericht
// („wie fühlt sich Rempeln bei 50/150 ms an“).
// Aufruf: node tools/online_mess.mjs [Seed=11] [Stufe=2]
import { generate } from '../src/track/generator.js';
import { verifySync } from '../src/track/verify.js';
import { Race } from '../src/game/race.js';
import { FremdPuffer } from '../src/net/puffer.js';
import { mulberry } from '../src/net/fake.js';

const seed = +(process.argv[2] || 11), stufe = +(process.argv[3] || 2);
const V = verifySync(generate(seed, stufe));
const race = new Race(V.env, { assist: 'original', autopilot: true, countdown: 0 });
const DT = 1 / 120, spur = [];
for (let t = 0; t < V.apTime + 2 && race.state !== 'finished'; t += DT) {
  race.step(DT, { steer: 0, throttle: 0, brake: 0 });
  const c = race.car;
  spur.push({ t, px: c.pos.x, py: c.pos.y, pz: c.pos.z, vx: c.v.x, vy: c.v.y, vz: c.v.z, q: { ...c.q }, v: c.speed() });
}
const bei = (t) => spur[Math.max(0, Math.min(spur.length - 1, Math.round(t / DT)))];
const vMittel = spur.reduce((a, s) => a + s.v, 0) / spur.length;
console.log(`Strecke ${seed}-${stufe}: ${spur.length * DT | 0} s, Tempo im Mittel ${(vMittel * 3.6).toFixed(0)} km/h`);
console.log('Ping (ms) | Verzug (ms) | gezeigt hinter echt: Mittel / 95 % (m) | vorausgerechnet: Mittel / 95 % (m)');
for (const [lat, jit] of [[0, 0], [25, 8], [75, 25], [150, 40]]) {
  const r = mulberry(7 + lat), P = new FremdPuffer(), PV = new FremdPuffer();
  const post = [];
  for (let t = 0.5; t < spur.length * DT; t += 0.04) {
    if (r() < 0.05) continue;
    const s = bei(t);
    post.push({ an: t * 1000 + lat + (r() * 2 - 1) * jit, t: t * 1000, d: { px: s.px, py: s.py, pz: s.pz, vx: s.vx, vy: s.vy, vz: s.vz, q: s.q, sprung: 0 } });
  }
  post.sort((a, b) => a.an - b.an);
  let k = 0;
  const ea = [], eb = [], vz = [];
  for (let now = 2000; now < (spur.length * DT - 1) * 1000; now += 1000 / 60) {
    while (k < post.length && post[k].an <= now) { P.rein(post[k].t, post[k].d, post[k].an); PV.rein(post[k].t, post[k].d, post[k].an); k++; }
    const o = P.abtasten(now), ov = PV.abtasten(now, 1);   // wie im Spiel: ONLINE.voraus = 1 (game/online.js)
    if (!o) continue;
    const w = bei(now / 1000);
    ea.push(Math.hypot(o.px - w.px, o.py - w.py, o.pz - w.pz));
    eb.push(Math.hypot(ov.px - w.px, ov.py - w.py, ov.pz - w.pz));
    vz.push(P.verzug);
  }
  const st = (a) => { const b = a.slice().sort((x, y) => x - y); return [b.reduce((x, y) => x + y, 0) / b.length, b[Math.floor(b.length * 0.95)]]; };
  const [am, a95] = st(ea), [bm, b95] = st(eb), [vm] = st(vz);
  console.log(`${String(2 * lat).padStart(9)} | ${vm.toFixed(0).padStart(11)} | ${am.toFixed(2).padStart(6)} / ${a95.toFixed(2).padEnd(28)} | ${bm.toFixed(2)} / ${b95.toFixed(2)}`);
}
