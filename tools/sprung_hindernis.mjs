// Sprung-Hindernisse (n21): jede Variante in der Lücke der Standard-Schanze bei vmin / vbest / vmax überfliegen (kein
// Crash), zu kurz (90 % von vmin) → Crash „Zu kurz“/Aufprall/Abgestürzt und Reset; dazu Scheitel, Flugzeit, Weite
// und Dreiecke je Variante. Fährt mit der Rennlogik (Original, ohne Hilfen): Lenkung vom Autopiloten, Tempo bis zur
// Lippe fest geregelt, in der Luft keine Eingabe.
// Aufruf: node tools/sprung_hindernis.mjs [--json=datei] [--nur=kanal,busse] [--extra=1.2,1.4] (STUNT-Schanze alt: --alt)
import fs from 'fs';
import { chain } from '../tests/node/common.mjs';
import { prepare } from '../src/track/verify.js';
import { Race } from '../src/game/race.js';
import { JUMP, jumpWindow, setSchanze } from '../src/track/pieces.js';
import { OBSTACLES, OBSTACLE_NAMES, gapObstacles } from '../src/track/obstacles.js';

const arg = (k, d) => { const a = process.argv.find((s) => s.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : (process.argv.includes(`--${k}`) ? true : d); };
if (arg('alt')) setSchanze(true);
const DT = 1 / 120;
const kinds = arg('nur') ? String(arg('nur')).split(',') : (JUMP.obstacles ? OBSTACLES : ['ohne']);
const extra = String(arg('extra', '')).split(',').filter(Boolean).map(Number);

// kurz: Bodenwellen direkt vor der Schanze → Schanze mit kurzem Anlauf (pieces.js jumpFor)
export function sprung(kind, vT, kurz = false) {
  const c = chain(5, 15, 0, ['start', 'straight', 'straight', 'straight', kurz ? 'bumps' : 'straight', 'jump', 'straight', 'straight', 'straight']);
  const jp = c.pieces.find((p) => p.type === 'jump');
  if (kind !== 'ohne') jp.obst = kind;
  gapObstacles.lastTris = 0;
  const env = prepare({ pieces: c.pieces, seed: 1 }, { treeCount: 0 });
  const tris = gapObstacles.lastTris;
  const L = env.track.line, J = env.track.jumps[0];
  const race = new Race(env, { assist: 'original', countdown: 0.05 });
  const lip = [L.px[J.lipIdx], L.py[J.lipIdx], L.pz[J.lipIdx]];
  const hl = Math.hypot(L.tx[J.lipIdx], L.tz[J.lipIdx]), fw = [L.tx[J.lipIdx] / hl, L.tz[J.lipIdx] / hl];
  let t = 0, vLip = null, apex = -1e9, air = 0, maxAir = 0, land = null, crash = null, y0 = null, wasAir = false;
  while (t < 40) {
    const a = race.ap.control(race.car);
    const x = (race.car.pos.x - lip[0]) * fw[0] + (race.car.pos.z - lip[2]) * fw[1];
    const v = race.car.fwdSpeed();
    // vT = 'ap': Pedale des Autopiloten (Profil) bis zur Lippe; kurz: bis 60 m vor der Lippe Profil (Bodenwellen), dann vT
    const own = vT !== 'ap' && (!kurz || x > -60);
    const inp = x >= 0 ? { steer: 0, throttle: land ? 1 : 0, brake: 0 } : !own ? { steer: a.steer, throttle: a.throttle, brake: a.brake } : { steer: a.steer, throttle: v < vT - 0.3 ? 1 : v < vT ? 0.3 : 0, brake: v > vT + 0.6 ? 0.5 : 0 };
    race.step(DT, inp); t += DT;
    for (const e of race.events) if (e.type === 'crash' && !crash) crash = e.reason;
    race.events.length = 0;
    const car = race.car;
    if (y0 === null && x > -30 && x < -20) y0 = car.pos.y - L.py[race.tracker.idx];
    if (vLip === null && x >= 0) vLip = car.speed();
    if (x > -2 && !land) apex = Math.max(apex, car.pos.y);
    if (car.onGround === 0 && x > -3) { air += DT; wasAir = true; } else if (wasAir) { maxAir = Math.max(maxAir, air); if (air > 0.3 && !land) land = x; air = 0; wasAir = false; }
    if (crash || (race.state !== 'running' && race.state !== 'countdown')) break;
    if (land && x > land + 40) break;
  }
  return { kind, vT, vLip, apex: apex - lip[1] - (y0 ?? 0), air: maxAir, weite: land, crash, tris, win: J.win, obst: J.obstacle };
}

const main = process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop());
if (main) {
  const w = jumpWindow();
  console.log(`Schanze ${JUMP.lipDeg}° · Lücke ${(JUMP.landF - JUMP.lipF).toFixed(0)} m · Landerampe ${JUMP.landLen} m · Fenster ${(w.vmin * 3.6).toFixed(0)}–${(w.vmax * 3.6).toFixed(0)} km/h, vbest ${(w.vbest * 3.6).toFixed(0)} km/h`);
  console.log('| Hindernis | Tempo | Lippe km/h | Scheitel m | Flug s | Weite m | Ergebnis | Dreiecke |\n|---|---|---|---|---|---|---|---|');
  const rows = [];
  const speeds = [['zu kurz (0,9·vmin)', 0.9 * w.vmin], ['vmin', w.vmin + 0.4], ['vbest', w.vbest], ['vmax', w.vmax - 0.3], ...extra.map((k) => [`${k}·vbest`, k * w.vbest])];
  for (const kind of kinds) for (const [nm, v] of speeds) {
    const r = sprung(kind, v);
    rows.push({ ...r, nm });
    const f1 = (x) => (x == null ? '–' : x.toFixed(1));
    console.log(`| ${OBSTACLE_NAMES[kind] || kind} | ${nm} | ${r.vLip ? (r.vLip * 3.6).toFixed(0) : '–'} | ${f1(r.apex)} | ${f1(r.air)} | ${f1(r.weite)} | ${r.crash ? 'Crash „' + r.crash + '“' : 'ok'} | ${r.tris} |`);
  }
  const bad = rows.filter((r) => (r.nm.startsWith('zu kurz') ? !r.crash : (['vmin', 'vbest', 'vmax'].includes(r.nm) && r.crash)));
  console.log(bad.length ? `FEHLER: ${bad.map((r) => r.kind + '/' + r.nm + ' ' + (r.crash || 'kein Crash')).join(', ')}` : 'alle Varianten: im Fenster ohne Crash, zu kurz = Crash');
  if (arg('json')) fs.writeFileSync(arg('json'), JSON.stringify(rows, null, 1));
  process.exit(bad.length ? 1 : 0);
}
