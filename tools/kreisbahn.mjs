// n16: Kurvengrenztempo auf der Kreisbahn (Ebene, Asphalt). Tempo per Gas gehalten, Lenkung steigt langsam
// (0 → voll in 6 s); gemessen wird die höchste stationäre Querbeschleunigung a(v) = v · Gierrate (Mittel über 0,25 s).
// Grenztempo für Radius R: v mit v²/R = a(v) (lineare Interpolation über v).
// Aufruf: node tools/kreisbahn.mjs [--var=n15,zug0,neu]
import path from 'path'; import url from 'url';
const HERE = path.dirname(url.fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const imp = (p) => import(url.pathToFileURL(path.join(ROOT, p)).href);
const { Car, CAR_DEF } = await imp('src/physics/car.js');
const { MAT } = await imp('src/track/defs.js');
const { MEDIUM_N15, MEDIUM_N16, MEDIUM_N23 } = await imp('src/game/race.js');
const arg = (k, d) => { const a = process.argv.find((s) => s.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const DT = 1 / 120;
const PLANE = { ray(ox, oy, oz, dx, dy, dz, len) { if (dy >= -1e-9) return null; const t = -oy / dy; if (t < 0 || t > len) return null; return { t, x: ox + dx * t, y: 0, z: oz + dz * t, nx: 0, ny: 1, nz: 0, mat: MAT.ROAD }; } };

export function latMax(set, v0) {
  const car = new Car(CAR_DEF);
  car.assist = { level: 0, magnet: set.magnet || 0, air: 0, grip: set.grip || 1, slipK: set.slipK || 1, tcs: set.tcs || 0, drive: set.drive || 1, esc: set.esc || 0 };
  car.surfaceKind = 0;
  car.place([0, 0, 0], [0, 0, -1], [0, 1, 0], v0);
  const hold = () => { car.input.throttle = Math.max(0, Math.min(1, 0.3 + (v0 - car.fwdSpeed()) * 0.6)); car.input.brake = v0 < car.fwdSpeed() - 1 ? 0.2 : 0; };
  for (let k = 0; k < 120; k++) { hold(); car.step(DT, PLANE); }
  let best = 0; const win = [];
  for (let k = 0; k < 6 * 120; k++) {
    car.input.steer = Math.min(1, k / (6 * 120)); hold();
    car.step(DT, PLANE);
    const F = car.frame, yaw = car.w.x * F.u.x + car.w.y * F.u.y + car.w.z * F.u.z;
    const vv = Math.hypot(car.v.x, car.v.z);
    win.push(Math.abs(yaw * vv)); if (win.length > 30) win.shift();
    if (win.length === 30 && Math.abs(vv - v0) < 0.08 * v0) best = Math.max(best, win.reduce((a, b) => a + b, 0) / 30);
    if (car.crash) break;
  }
  return best;
}
export function grenztempo(set, radii = [25, 50, 100, 200]) {
  const vs = [], as = [];
  for (let v = 10; v <= 90; v += 5) { vs.push(v); as.push(latMax(set, v)); }
  const res = {};
  for (const R of radii) {
    let out = null;
    for (let i = 1; i < vs.length && out === null; i++) {
      const f0 = vs[i - 1] ** 2 / R - as[i - 1], f1 = vs[i] ** 2 / R - as[i];
      if (f0 <= 0 && f1 > 0) out = vs[i - 1] + (vs[i] - vs[i - 1]) * (-f0) / (f1 - f0);
    }
    res[R] = out;
  }
  return { vs, as, v: res };
}

if (process.argv[1] && path.resolve(process.argv[1]) === url.fileURLToPath(import.meta.url)) {
  const VARS = { original: { magnet: 0, grip: 1 }, n15: MEDIUM_N15, n16: MEDIUM_N16, neu: MEDIUM_N23 };
  for (const x of (arg('extra', '') ? arg('extra', '').split(';') : [])) { const [g, m, sk] = x.split(',').map(Number); VARS[`g${g}m${m}s${sk || 1}`] = { grip: g, magnet: m, slipK: sk || 1 }; }
  const ks = arg('var', Object.keys(VARS).join(',')).split(',');
  const R = {}; for (const k of ks) R[k] = grenztempo(VARS[k]);
  console.log('| Variante | a_quer bei 15 / 30 / 60 m/s (m/s²) | Grenztempo R 25 / 50 / 100 / 200 m (km/h) | gegen n15 |');
  console.log('|---|---|---|---|');
  for (const k of ks) {
    const g = R[k], a = (v) => g.as[g.vs.indexOf(v)].toFixed(1), kmh = (x) => (x ? Math.round(x * 3.6) : '–');
    const rel = R.n15 ? Object.keys(g.v).map((r) => (g.v[r] && R.n15.v[r] ? `${((g.v[r] / R.n15.v[r] - 1) * 100).toFixed(1)} %` : '–')).join(' / ') : '';
    console.log(`| ${k} | ${a(15)} / ${a(30)} / ${a(60)} | ${Object.values(g.v).map(kmh).join(' / ')} | ${rel} |`);
  }
}
