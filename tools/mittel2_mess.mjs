// n23 Mittel wieder fahrbar: Fahrphysik-Messung je Variante (Ebene, Asphalt, gleiche Physik wie im Spiel)
//   – Beschleunigung 0–100 / 0–200 km/h in Spielzeit und in echten Sekunden (Spielzeit / Spieltempo; die Tacho-Zahl
//     zeigt seit n23 auf Mittel das Tempo, das man sieht)
//   – Kurvengrenztempo R 25 / 50 / 100 m (tools/kreisbahn.mjs)
//   – Kurve zu schnell (volle Lenkung + Vollgas bei 20/30/45 m/s): größter Schwimmwinkel (≥ 4° = keine Schiene)
//   – Vollgas aus der Kurve: stationär im Bogen (60 % Lenkung, 70 % des Grenztempos), dann 2,5 s Vollgas –
//     größter Schwimmwinkel und ob das Auto sich dreht (Kurswinkel > 1,2 rad gegen die Bahn)
// Aufruf: node tools/mittel2_mess.mjs [--var=original,n16,n23]
import path from 'path'; import url from 'url';
const HERE = path.dirname(url.fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const imp = (p) => import(url.pathToFileURL(path.join(ROOT, p)).href);
const { Car, CAR_DEF } = await imp('src/physics/car.js');
const { MAT } = await imp('src/track/defs.js');
const { MEDIUM_N15, MEDIUM_N16, MEDIUM_N23, GAME_SPEEDS } = await imp('src/game/race.js');
const { grenztempo } = await imp('tools/kreisbahn.mjs');
const arg = (k, d) => { const a = process.argv.find((s) => s.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const DT = 1 / 120;
const PLANE = { ray(ox, oy, oz, dx, dy, dz, len) { if (dy >= -1e-9) return null; const t = -oy / dy; if (t < 0 || t > len) return null; return { t, x: ox + dx * t, y: 0, z: oz + dz * t, nx: 0, ny: 1, nz: 0, mat: MAT.ROAD }; } };

function mkCar(set, v0) {
  const car = new Car(CAR_DEF);
  car.assist = { level: 0, magnet: set.magnet || 0, air: 0, grip: set.grip || 1, slipK: set.slipK || 1, tcs: set.tcs || 0, drive: set.drive || 1, esc: set.esc || 0, vSoft: set.vSoft, vTop: set.vTop };
  car.place([0, 0, 0], [0, 0, -1], [0, 1, 0], v0);
  return car;
}
const beta = (car) => { const F = car.frame; return Math.abs(Math.atan2(car.v.x * F.r.x + car.v.y * F.r.y + car.v.z * F.r.z, Math.abs(car.fwdSpeed()))) * 180 / Math.PI; };

export function accel(set) {
  const car = mkCar(set, 0), out = {};
  car.input.brake = 1; car.input.hold = true;
  for (let k = 0; k < 120; k++) car.step(DT, PLANE);
  car.input.brake = 0; car.input.hold = false; car.input.throttle = 1;
  // Gas-Rampe (Mittel n24, thrRamp s bis Vollgas – wie race.js) ; Höchsttempo nach 60 s Vollgas
  let t = 0, vmax = 0;
  while (t < 60) {
    car.input.throttle = set.thrRamp ? Math.min(1, t / set.thrRamp) : 1;
    car.step(DT, PLANE); t += DT;
    const kmh = car.fwdSpeed() * 3.6;
    vmax = Math.max(vmax, kmh);
    for (const m of [100, 200, 250, 300]) if (!out[m] && kmh >= m) out[m] = t;
    if (out[300] && t > 30) break;
  }
  out.vmax = vmax;
  return out;
}
export function skid(set, v0) {
  const car = mkCar(set, v0);
  const hold = () => { car.input.throttle = Math.max(0, Math.min(1, 0.3 + (v0 - car.fwdSpeed()) * 0.6)); };
  for (let k = 0; k < 120; k++) { hold(); car.step(DT, PLANE); }
  let b = 0;
  for (let k = 0; k < 180; k++) { car.input.steer = 1; car.input.throttle = 1; car.step(DT, PLANE); b = Math.max(b, beta(car)); }
  return b;
}
// Vollgas aus der Kurve: Bogen mit Lenkung st bei v0 halten (2 s), dann Vollgas bei gleicher Lenkung
export function exitThrottle(set, v0, st = 0.6) {
  const car = mkCar(set, v0);
  const hold = () => { car.input.throttle = Math.max(0, Math.min(1, 0.3 + (v0 - car.fwdSpeed()) * 0.6)); car.input.brake = v0 < car.fwdSpeed() - 1 ? 0.2 : 0; };
  for (let k = 0; k < 240; k++) { car.input.steer = Math.min(st, k / 120 * st); hold(); car.step(DT, PLANE); }
  let b = 0, spun = false;
  for (let k = 0; k < 300; k++) { car.input.steer = st; car.input.throttle = 1; car.input.brake = 0; car.step(DT, PLANE); b = Math.max(b, beta(car)); if (beta(car) > 69) spun = true; }
  return { beta: b, spun };
}

if (process.argv[1] && path.resolve(process.argv[1]) === url.fileURLToPath(import.meta.url)) {
  const VARS = { original: { magnet: 0, grip: 1 }, n15: MEDIUM_N15, n16: MEDIUM_N16, n23: MEDIUM_N23 };
  for (const x of (arg('extra', '') ? arg('extra', '').split(';') : [])) { const o = {}; for (const kv of x.split(',')) { const [k, v] = kv.split(':'); o[k] = +v; } VARS[x.replace(/,/g, ' ')] = { ...MEDIUM_N23, ...o }; }
  const ks = arg('var', '') ? [...arg('var', '').split(','), ...Object.keys(VARS).filter((k) => k.includes(':'))] : Object.keys(VARS);
  const R0 = grenztempo(VARS.original, [25, 50, 100]);
  console.log('| Variante | Spieltempo | 0–100 / 0–200 km/h Spielzeit (s) | 0–200 echte s | Grenztempo R 25/50/100 m (km/h) | gegen Original | Schwimmwinkel Übertempo 20/30/45 m/s | Vollgas aus der Kurve 15/25/35 m/s: Schwimmwinkel (gedreht) |');
  console.log('|---|---|---|---|---|---|---|---|');
  for (const k of ks) {
    const set = VARS[k], gs = k === 'original' ? GAME_SPEEDS.original : set.speed || 1.25;
    const a = accel(set), g = k === 'original' ? R0 : grenztempo(set, [25, 50, 100]);
    const sk = [20, 30, 45].map((v) => skid(set, v).toFixed(1));
    const ex = [15, 25, 35].map((v) => { const e = exitThrottle(set, v); return `${e.beta.toFixed(0)}°${e.spun ? ' DREHT' : ''}`; });
    const kmh = (x) => (x ? Math.round(x * 3.6) : '–');
    const rel = Object.keys(g.v).map((r) => `+${((g.v[r] / R0.v[r] - 1) * 100).toFixed(0)} %`).join(' / ');
    console.log(`| ${k} | ${gs} | ${a[100].toFixed(2)} / ${a[200].toFixed(2)} | ${(a[200] / gs).toFixed(2)} | ${Object.values(g.v).map(kmh).join(' / ')} | ${rel} | ${sk.join(' / ')}° | ${ex.join(' / ')} |`);
  }
}
