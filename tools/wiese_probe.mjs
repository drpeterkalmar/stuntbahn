// Wiese-Probe (Hermes 30.09.2026, erweitert n21): Wie stark bremst die Wiese? Auto auf freiem Gelände (MAT.GRASS),
// geradeaus, a) rollen lassen, b) Vollgas, c) Vollbremsung – jeweils ab 150 km/h bzw. 0. Dazu (n21):
//   abkommen – mit 200/300 km/h auf die Wiese (geradeaus, voll gelenkt, mit Vollgas): Zeit bis ≤ 30 km/h, Crash, Neigung
//   rueckweg – aus dem Gelände neben der Strecke (Senken, Hügel, Böschungen der Sammlungs-Strecken) zurück auf die
//              Fahrbahn: im Ziel, Zeit, Höchsttempo auf der Wiese
// Aufruf: node tools/wiese_probe.mjs [--root=<Repo>] [--teil=probe,abkommen,rueckweg]   (alt: STUNT_WIESE=alt node …)
import fs from 'fs';
import path from 'path';
import url from 'url';
const arg = (k, d) => { const a = process.argv.find((s) => s.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const HERE = path.dirname(url.fileURLToPath(import.meta.url));
const ROOT = path.resolve(arg('root', path.join(HERE, '..')));
const imp = (p) => import(url.pathToFileURL(path.join(ROOT, p)).href);
const { chain, setup } = await imp('tests/node/common.mjs');
const { Car } = await imp('src/physics/car.js');
const { MAT } = await imp('src/track/defs.js');
const { Tracker } = await imp('src/ai/autopilot.js');

const DT = 1 / 120;
let env0 = null;
function flat() {
  if (env0) return env0;
  const c = chain(5, 15, 0, ['start', 'straight', 'straight', 'straight']);
  env0 = setup({ pieces: c.pieces, seed: 1 });
  return env0;
}
// Auto 120 m seitlich der Strecke auf die Wiese setzen, Richtung parallel zur Strecke
function placeOff(v0) {
  const env = flat(), L = env.ideal, si = env.track.start.idx;
  const h = Math.hypot(L.tx[si], L.tz[si]);
  const fw = [L.tx[si] / h, 0, L.tz[si] / h], side = [-fw[2], 0, fw[0]];
  const x0 = L.px[si] + side[0] * 120, z0 = L.pz[si] + side[2] * 120;
  const g = env.world.ray(x0, 200, z0, 0, -1, 0, 400, true);
  const car = new Car();
  car.place([x0, g.y, z0], fw, [g.nx, g.ny, g.nz], v0);
  return { car, env };
}

// Geradeaus: km/h je volle Sekunde
export function run(v0, inp, T = 8) {
  const { car, env } = placeOff(v0);
  Object.assign(car.input, inp);
  const out = [];
  let t = 0, mat = null;
  for (let k = 0; t < T; k++) {
    car.step(DT, env.world); t += DT;
    if (!mat) mat = car.wheels.find((w) => w.contact)?.mat;
    if (k % 120 === 119) out.push(Math.round(car.speed() * 3.6));
  }
  return { mat: mat === MAT.GRASS ? 'GRASS' : mat, kmh: out };
}

// Abkommen mit v0 km/h: Zeit bis ≤ 30 km/h, Crash, größte Roll-/Nickneigung (Grad), Tempo nach 3 s
export function abkommen(kmh, { steer = 0, throttle = 0 } = {}) {
  const { car, env } = placeOff(kmh / 3.6);
  car.input.steer = steer; car.input.throttle = throttle;
  let t = 0, t30 = null, tilt = 0, v3 = 0;
  while (t < 6) {
    car.step(DT, env.world); t += DT;
    const v = car.speed() * 3.6;
    if (t30 === null && v <= 30) t30 = t;
    if (Math.abs(t - 3) < DT / 2) v3 = v;
    tilt = Math.max(tilt, Math.acos(Math.max(-1, Math.min(1, car.frame.u.y))) * 180 / Math.PI);
    if (car.crash) break;
  }
  return { t30, crash: car.crash ? car.crash.reason : null, tilt, v3 };
}

// Rückweg aus dem Gelände: Startpunkte 25–60 m neben der Linie (nur Wiese, kein Wasser), Auto steht, schaut ±60°
// zur Strecke; einfacher Fahrer: Vollgas, lenkt auf einen Linienpunkt 15 m voraus. Ziel = ein Rad auf Fahrbahn
// (nicht Wiese) und Wagenmitte innerhalb der Fahrbahn + 1 m.
export function rueckweg(env, n = 24, seed = 1) {
  const L = env.track.line, W = env.world;
  let s = seed * 9301 + 49297;
  const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  const res = [];
  for (let tries = 0; res.length < n && tries < n * 20; tries++) {
    // Startpunkt: Stück + Anteil darin (n26: nicht nach Punktnummer – größere Stunt-Bauwerke haben mehr Punkte und eine
    // längere Fahrlinie, die Auswahl verschob sich sonst auf allen übrigen Stücken)
    const P = env.track.pieces, pc = P[Math.floor(rnd() * P.length)], u = rnd();
    if (!pc || pc.lineEnd < pc.lineStart) continue;
    const i = pc.lineStart + Math.floor(u * (pc.lineEnd - pc.lineStart + 1));
    if (L.air[i] || L.loop[i] || L.tube[i]) continue;
    const side = rnd() < 0.5 ? -1 : 1, off = L.hw[i] + 25 + rnd() * 35;
    const rx = -L.tz[i], rz = L.tx[i], rl = Math.hypot(rx, rz) || 1;
    const x = L.px[i] + side * rx / rl * off, z = L.pz[i] + side * rz / rl * off;
    const g = W.ray(x, 400, z, 0, -1, 0, 800, true);
    if (!g || g.mat !== MAT.GRASS || g.ny < 0.8) continue;
    // nur Startpunkte, deren nächste Fahrbahn wirklich diese ist (nicht unter einer Hochstraße o. ä.)
    const tr = new Tracker(L); tr.update(x, g.y, z, true);
    if (Math.abs(tr.dist - off) > 12 || L.py[tr.idx] - g.y > 6) continue;
    const ang = Math.atan2(-side * rz, -side * rx) + (rnd() - 0.5) * 2 * Math.PI / 3;
    const car = new Car();
    car.place([x, g.y, z], [Math.cos(ang), 0, Math.sin(ang)], [g.nx, g.ny, g.nz], 0);
    const slope = Math.acos(g.ny) * 180 / Math.PI;
    let t = 0, ok = false, vmaxGrass = 0, climb = 0, y0 = car.pos.y, grassT = 0;
    while (t < 40 && !car.crash) {
      tr.update(car.pos.x, car.pos.y, car.pos.z, true);
      let j = tr.idx;
      for (let k = 0; k < 60 && L.s[(j + 1) % L.n] - L.s[tr.idx] < 15 && L.s[(j + 1) % L.n] >= L.s[j]; k++) j = (j + 1) % L.n;
      const F = car.frame, dx = L.px[j] - car.pos.x, dz = L.pz[j] - car.pos.z;
      const err = Math.atan2(dx * F.r.x + dz * F.r.z, dx * F.f.x + dz * F.f.z);
      car.input.steer = Math.max(-1, Math.min(1, err * 2)); car.input.throttle = 1; car.input.brake = 0;
      car.step(DT, W); t += DT;
      climb = Math.max(climb, car.pos.y - y0);
      const contact = car.wheels.filter((w) => w.contact);
      // Höchsttempo auf der Wiese: erst nach 1 s ununterbrochen nur auf Gras (wer von einer Fahrbahn schnell herunterkommt, bremst erst ab)
      grassT = contact.length && contact.every((w) => w.mat === MAT.GRASS) ? grassT + DT : 0;
      if (grassT > 1) vmaxGrass = Math.max(vmaxGrass, car.speed() * 3.6);
      if (contact.some((w) => w.mat !== MAT.GRASS && w.mat !== MAT.WATER) && tr.dist < L.hw[tr.idx] + 1) { ok = true; break; }
    }
    res.push({ ok, t, vmaxGrass, crash: car.crash ? car.crash.reason : null, slope, climb, end: { dist: +tr.dist.toFixed(1), v: +(car.speed() * 3.6).toFixed(0), y: +car.pos.y.toFixed(1), ly: +L.py[tr.idx].toFixed(1), mats: car.wheels.map((w) => w.contact ? w.mat : -1).join(''), x: +car.pos.x.toFixed(0), z: +car.pos.z.toFixed(0) } });
  }
  return res;
}

const main = process.argv[1] && url.pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (main) {
  const TEILE = String(arg('teil', 'probe,abkommen,rueckweg')).split(',');
  if (TEILE.includes('probe')) {
    console.log('rollen ab 150 km/h, km/h je s:', JSON.stringify(run(150 / 3.6, { throttle: 0, brake: 0 }, 10)));
    console.log('Vollgas ab 150 km/h, km/h je s:', JSON.stringify(run(150 / 3.6, { throttle: 1, brake: 0 }, 10)));
    console.log('Vollgas ab 0, km/h je s:     ', JSON.stringify(run(0, { throttle: 1, brake: 0 }, 12)));
    console.log('Vollbremsung ab 150 km/h:    ', JSON.stringify(run(150 / 3.6, { throttle: 0, brake: 1 }, 6)));
  }
  if (TEILE.includes('abkommen')) {
    for (const kmh of [100, 200, 300]) for (const [nm, o] of [['geradeaus', {}], ['voll gelenkt', { steer: 1 }], ['Vollgas+gelenkt', { steer: 0.6, throttle: 1 }]]) {
      const r = abkommen(kmh, o);
      console.log(`abkommen ${kmh} km/h ${nm.padEnd(16)} ≤30 km/h nach ${r.t30 === null ? '–' : r.t30.toFixed(2) + ' s'}  nach 3 s ${r.v3.toFixed(0)} km/h  Neigung max ${r.tilt.toFixed(0)}°  ${r.crash || 'kein Crash'}`);
    }
  }
  if (TEILE.includes('rueckweg')) {
    const { trkToLayout } = await imp('src/track/trkimport.js');
    const { parseTrk } = await imp('src/track/trk.js');
    const { tracksOf } = await imp('src/game/sammlung.js');
    const { generate } = await imp('src/track/generator.js');
    const { prepare } = await imp('src/track/verify.js');
    const T = tracksOf(JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/sammlung.json'), 'utf8')));
    const bin = new Uint8Array(fs.readFileSync(path.join(ROOT, 'assets/sammlung.bin')));
    const strecken = [['S4711/3', () => generate(4711, 3)], ['S42/3', () => generate(42, 3)]];
    for (const k of [3, 40, 77, 120, 199]) strecken.push([T[k].id, () => trkToLayout(parseTrk(bin.subarray(k * 1802, (k + 1) * 1802), T[k].id)).layout]);
    let all = [];
    for (const [nm, lay] of strecken) {
      const env = prepare(lay(), { treeCount: 0 });
      const r = rueckweg(env, 16, nm.length);
      all = all.concat(r);
      const ok = r.filter((q) => q.ok);
      console.log(`rueckweg ${nm.padEnd(8)} ${ok.length}/${r.length} zurück, Ø ${(ok.reduce((a, q) => a + q.t, 0) / Math.max(1, ok.length)).toFixed(1)} s, max Wiese ${Math.max(...r.map((q) => q.vmaxGrass)).toFixed(0)} km/h, Steigung bis ${Math.max(...r.map((q) => q.slope)).toFixed(0)}°, Anstieg bis ${Math.max(...r.map((q) => q.climb)).toFixed(1)} m, Crashs ${r.filter((q) => q.crash).map((q) => q.crash).join(',') || 0}`);
    }
    const ok = all.filter((q) => q.ok);
    console.log(`rueckweg gesamt ${ok.length}/${all.length}, max Wiese ${Math.max(...all.map((q) => q.vmaxGrass)).toFixed(0)} km/h`);
  }
}
