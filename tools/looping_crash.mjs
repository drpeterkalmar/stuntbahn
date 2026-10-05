// n26: Crashs des Original-Bots („normal“, 12 Seeds) in Loopings der Mess-Strecken (tools/stunt_mess.mjs) nach Ort im
// Looping (Anteil u der Schleife, „vor“ = Anfahrt) und Grund; --v: je Crash Kontaktpunkt im Stück (f, r, Höhe), Tempo,
// Plan-Tempo, Aufprall-Normale. Aufruf: node tools/looping_crash.mjs [--root=Wurzel] [--v]
import path from 'path'; import url from 'url';
const arg = (k, d) => { const a = process.argv.find((s) => s.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const ROOT = path.resolve(arg('root', '.'));
const imp = (p) => import(url.pathToFileURL(path.join(ROOT, p)).href);
const { generate } = await imp('src/track/generator.js');
const { verifySync } = await imp('src/track/verify.js');
const { Race } = await imp('src/game/race.js');
const { rng } = await imp('src/core/util.js');
const { messTracks } = await import(url.pathToFileURL(path.join(path.dirname(url.fileURLToPath(import.meta.url)), 'stunt_mess.mjs')).href);
const DT = 1 / 120;
function normalBot(seed) { const r = rng(seed); let noise = 0, nT = 0; const q = []; return (race) => { nT -= DT; if (nT <= 0) { noise = r.range(-1, 1); nT = r.range(0.3, 1.2); } const ap = race.ap.out; q.push(ap.steer); const st = q.length > 12 ? q.shift() : 0; const vt = race.env.prof.vt[race.ap.tr.idx], v = race.car.fwdSpeed(); return { steer: Math.max(-1, Math.min(1, st + noise * 0.15)), throttle: v < vt * 1.08 ? 1 : 0, brake: v > vt * 1.2 ? 0.7 : 0 }; }; }
const hist = {};
for (const [name, mk] of messTracks(generate)) {
  const lay = mk(); if (!lay.pieces.some((p) => p.type === 'loop')) continue;
  const v = verifySync(lay), L = v.env.track.line, P = v.env.track.pieces;
  for (let sd = 1; sd <= 12; sd++) {
    const race = new Race(v.env, { assist: 'original', countdown: 0.5 }), b = normalBot(sd);
    let t = 0, cr = 0;
    const lim = Math.max(150, (v.apTime || 80) * 4);
    while (t < lim && race.state !== 'finished') {
      race.ap.control(race.car); race.step(DT, b(race)); t += DT; race.events.length = 0;
      if (race.car.crash && race.crashes > cr) {
        cr = race.crashes; const ti = race.tracker.idx, pc = P[L.piece[ti]];
        if (pc && pc.type === 'loop') {
          const c = race.car.crash, inf = c.info || {};
          // Höhe über Stück-Basis und Lage im Looping (Anteil der Schleife)
          let a = pc.lineStart; while (a < pc.lineEnd && !L.loop[a]) a++; let e = a; while (e < pc.lineEnd && L.loop[e + 1]) e++;
          const u = L.loop[ti] ? ((ti - a) / Math.max(1, e - a)).toFixed(2) : (ti < a ? 'vor' : 'nach');
          const key = `${c.reason} ${L.loop[ti] ? 'u' + (Math.round(+u * 10) / 10) : u}`;
          hist[key] = (hist[key] || 0) + 1;
          const lp = v.layout.pieces[L.piece[ti]], D = [[1, 0], [0, 1], [-1, 0], [0, -1]], F = D[lp.d], R = D[(lp.d + 1) % 4], T = 40;
          const Ex = (lp.i - 15) * T + T / 2 - F[0] * T / 2, Ez = (lp.j - 15) * T + T / 2 - F[1] * T / 2;
          const cp = inf.p || [race.car.pos.x, race.car.pos.y, race.car.pos.z], fl = (cp[0] - Ex) * F[0] + (cp[2] - Ez) * F[1], rl = ((cp[0] - Ex) * R[0] + (cp[2] - Ez) * R[1]) * (lp.m || 1);
          hist['f ' + Math.round(fl) + ' r ' + rl.toFixed(1)] = 0;
          if (process.argv.includes('--v')) console.log(name, sd, c.reason, 'Kontakt f', fl.toFixed(1), 'r', rl.toFixed(1), 'y', (cp[1] - L.py[pc.lineStart]).toFixed(1), 'u', u, 'v', race.car.speed().toFixed(1), 'vt', v.env.prof.vt[ti].toFixed(1), 'vn', inf.vn, 'n', JSON.stringify(inf.n), 'kind', inf.kind, 'lat', race.ap.lat.toFixed(2));
        }
      }
    }
  }
}
console.log(JSON.stringify(Object.entries(hist).sort((a, b) => b[1] - a[1])));
