// n37 Arcade-Fahrgefühl: Messgrößen des Feel-Datenblatts (ARCADE_FEEL.md) in Node, gleiche Physik wie im Spiel.
//   Beschleunigung 0–100 / 0–200 km/h (echte s = Spielzeit / Spieltempo), Höchsttempo ohne/mit Nitro,
//   Kurvengrenztempo R 25 / 50 / 100 m (tools/kreisbahn.mjs), Sprünge (Schanze, Klippe 1 und 2 Ebenen: Lippen-Tempo,
//   Flugzeit, Weite, Scheitel), Drehrate in der Luft (voller Ausschlag Nicken/Rollen), Landung (größte Schräglage ohne
//   Crash), Wiedereinstieg nach Crash (s bis wieder gefahren wird), Wandkontakt (Tempoverlust, Crash) bei 5–60°.
// Je Stufe Mittel/Original; Variante „alt“ = Physik bis n36 (?physik=alt), „neu“ = Arcade-Physik (src/physics/arcade.js).
// Aufruf: node tools/arcade_mess.mjs [--var=alt,neu] [--stufe=medium,original] [--nur=accel,kurve,sprung,luft,landung,respawn,wand] [--json=datei]
import fs from 'fs'; import path from 'path'; import url from 'url';
const HERE = path.dirname(url.fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const imp = (p) => import(url.pathToFileURL(path.join(ROOT, p)).href);
const { Car, CAR_DEF } = await imp('src/physics/car.js');
const { MAT, LEVEL_H } = await imp('src/track/defs.js');
const { Race, ASSISTS, GAME_SPEEDS } = await imp('src/game/race.js');
const { NITRO } = await imp('src/physics/extras.js');
const { prepare } = await imp('src/track/verify.js');
const { pieceCells } = await imp('src/track/pieces.js');
await imp('src/track/pieces_3d.js');
const { grenztempo } = await imp('tools/kreisbahn.mjs');
let AR = null;
try { AR = await imp('src/physics/arcade.js'); } catch { /* vor n37: keine Arcade-Physik */ }
const arg = (k, d) => { const a = process.argv.find((s) => s.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const DT = 1 / 120;
const VARS = (arg('var', AR ? 'alt,neu' : 'alt')).split(',');
const STUFEN = (arg('stufe', 'medium,original')).split(',');
const NUR = arg('nur', 'accel,kurve,sprung,stunt,luft,landung,respawn,wand').split(',');
const kmh = (v) => v * 3.6;
const deg = (r) => r * 180 / Math.PI;

function setVar(v) { if (AR) AR.setArcade({ on: v !== 'alt' }); }

// Welt: Ebene y = 0 (Asphalt), optional eine senkrechte Wand x = wx (Normale −x, Beton-Leitwand)
function world(wx = null) {
  return {
    terrain: { height: () => -50 },
    ray(ox, oy, oz, dx, dy, dz, len) {
      let best = null;
      if (dy < -1e-9) { const t = -oy / dy; if (t >= 0 && t <= len) best = { t, x: ox + dx * t, y: 0, z: oz + dz * t, nx: 0, ny: 1, nz: 0, mat: MAT.ROAD }; }
      if (wx != null && dx > 1e-9 && ox < wx) { const t = (wx - ox) / dx; if (t >= 0 && t <= len && (!best || t < best.t)) best = { t, x: wx, y: oy + dy * t, z: oz + dz * t, nx: -1, ny: 0, nz: 0, mat: MAT.WALL }; }
      return best;
    },
    rayTrack() { return null; },
  };
}
// Fahrhilfen der Stufe aufs Auto (wie race.js step)
function assistCar(car, key) {
  const A = ASSISTS[key];
  if (Race.carAssist) { Race.carAssist(car, A, false); return; }
  Object.assign(car.assist, { magnet: A.magnet || 0, air: A.air || 0, grip: A.grip || 1, slipK: A.slipK || 1, tcs: A.tcs || 0, drive: A.drive || 1, vSoft: A.vSoft || 0, vTop: A.vTop || 0, esc: A.esc || 0 });
}
const gs = (key) => GAME_SPEEDS[key];

// ---- Beschleunigung / Höchsttempo ----
function accel(key, nitro = false) {
  const W = world(), car = new Car(CAR_DEF);
  assistCar(car, key);
  car.place([0, 0, 0], [0, 0, -1], [0, 1, 0], 0);
  const A = ASSISTS[key];
  let t = 0, thr = 0, vmax = 0, prev = 0, tPrev = 0;
  const hit = {};
  while (t < 200) {
    thr = A.thrRamp ? Math.min(1, thr + DT / A.thrRamp) : 1;   // Gas-Rampe (Mittel n24)
    car.input.throttle = thr; car.boost = nitro ? 1 : 0;
    car.step(DT, W); t += DT;
    if (car.pos.z < -500) car.pos.z += 1000;
    const v = kmh(car.fwdSpeed());
    for (const m of [100, 200]) if (!hit[m] && v >= m) hit[m] = t / gs(key);
    vmax = Math.max(vmax, v);
    if (t - tPrev >= 2) { if (v - prev < 0.05) break; prev = v; tPrev = t; }
  }
  return { t100: hit[100], t200: hit[200], vmax };
}

// ---- Sprünge: Rennen mit Stufe key, „Spieler“ = Autopilot-Eingabe (lenkt und hält das Profil-Tempo) ----
function chainL(list, lvl = 0) {
  let i = 3, j = 15, d = 0; const pieces = [];
  for (const it of list) {
    const o = typeof it === 'string' ? { type: it } : it;
    const pc = { type: o.type, i, j, d, m: o.m || 1, lvl };
    if (o.h1 != null) pc.h1 = o.h1;
    pieces.push(pc);
    [i, j, d] = pieceCells(pc.type, i, j, d, pc.m).next;
    if (o.h1 != null) lvl = o.h1;
  }
  return { pieces, seed: 1, diff: 3, closed: false, meta: { key: 'mess' } };
}
const S3 = ['straight', 'straight', 'straight'];
const JUMPS = {
  Schanze: () => chainL(['start', ...S3, 'jump', ...S3]),
  'Klippe 1 Ebene': () => chainL(['start', ...S3, { type: 'cliff', h1: 0 }, 'straight', 'straight'], 1),
  'Klippe 2 Ebenen': () => chainL(['start', ...S3, { type: 'cliff2', h1: 0 }, 'straight', 'straight'], 2),
};
const envCache = {};
function jump(key, name) {
  const env = envCache[name] || (envCache[name] = prepare(JUMPS[name]()));
  const L = env.track.line, J = env.track.jumps[0];
  const r = new Race(env, { assist: key, countdown: 0.05 });
  let vLip = 0, air = 0, top = -1e9, x0 = null, land = null, inp = { steer: 0, throttle: 0, brake: 0 };
  for (let t = 0; t < 40 && !land && !r.car.crash; t += DT) {
    r.step(DT, inp); r.events.length = 0;
    // Spieler: am Boden wie der Autopilot, in der Luft hält er die Eingabe (keine Luftsteuerung)
    const o = r.ap.out; if (r.car.onGround > 0) inp = { steer: o.steer, throttle: o.throttle, brake: o.brake };
    const i = r.tracker.idx, car = r.car;
    if (!vLip && i >= J.lipIdx) { vLip = car.speed(); x0 = { x: car.pos.x, z: car.pos.z }; }
    if (vLip) { if (car.onGround === 0) { air += DT; top = Math.max(top, car.pos.y); } else if (air > 0.3) land = Math.hypot(car.pos.x - x0.x, car.pos.z - x0.z); }
  }
  return { vLip: kmh(vLip), air: air / gs(key), airSim: air, weite: land || 0, apex: top - L.py[J.lipIdx], crash: r.car.crash ? r.car.crash.reason : (r.crashes ? 'Crash' : '') };
}

// ---- Stunt auf einer Sprungschanze: Spieler-Bot fährt an (Autopilot-Eingaben), lässt in der Luft das Gas los und dreht
// dann figur (pitch −1 = Salto vorwärts, +1 = rückwärts, roll = Schraube) um n × 360°. Mittel: n-mal kurz antippen (0,12 s
// drücken, 0,12 s los). Original: Lage-Regler (wie ein geübter Spieler: Ziel-Winkel, Gegenhalten) bis zur Landung.
function stunt(key, name, fig, turns = 1, tapAt = 0.35) {
  const env = envCache[name] || (envCache[name] = prepare(JUMPS[name]()));
  const r = new Race(env, { assist: key, countdown: 0.05 });
  let inp = { steer: 0, throttle: 0, brake: 0 }, ang = 0, air = 0, landed = false, tAfter = 0, maxTilt = 0, nNo = 0, vIn = 0, vOut = 0;
  const target = turns * 2 * Math.PI, sgn = fig === 'vor' ? -1 : 1;
  for (let t = 0; t < 40 && !r.car.crash && r.crashes === 0; t += DT) {
    r.step(DT, inp); nNo += r.events.filter((e) => e.type === 'trickno').length; r.events.length = 0;
    const car = r.car, o = r.ap.out, F = car.frame;
    if (car.onGround > 0 && air < 0.3) { inp = { steer: o.steer, throttle: o.throttle, brake: o.brake }; vIn = car.speed(); continue; }
    if (car.onGround === 0) {
      air += DT;
      const w = fig === 'schraube' ? car.w.x * F.f.x + car.w.y * F.f.y + car.w.z * F.f.z : car.w.x * F.r.x + car.w.y * F.r.y + car.w.z * F.r.z;
      ang += Math.abs(w) * DT;
      let u = 0;
      if (air > tapAt) {
        if (key === 'medium') { const k = Math.floor((air - tapAt) / 0.24); u = k < turns && (air - tapAt) % 0.24 < 0.12 ? 1 : 0; }
        else { const err = target - ang, wa = Math.abs(w); u = Math.max(-1, Math.min(1, 1.6 * err - 0.45 * wa)); if (err < 0.05 && wa < 0.3) u = 0; }
      }
      inp = fig === 'schraube' ? { steer: u, throttle: 0, brake: 0 } : { steer: 0, throttle: sgn < 0 ? Math.max(0, u) : Math.max(0, -u), brake: sgn > 0 ? Math.max(0, u) : Math.max(0, -u) };
    } else if (air > 0.3) {
      landed = true; tAfter += DT; inp = { steer: o.steer, throttle: o.throttle, brake: o.brake };
      maxTilt = Math.max(maxTilt, Math.acos(Math.max(-1, Math.min(1, F.u.y))));
      if (tAfter >= 1 && !vOut) vOut = car.speed();
      if (tAfter > 2) break;
    }
  }
  const no = nNo;
  return { deg: deg(ang), air, ok: landed && !r.car.crash && !r.crashes, crash: r.car.crash ? r.car.crash.reason : r.crashes ? 'Crash' : '', tilt: deg(maxTilt), no, vIn: kmh(vIn), vOut: kmh(vOut) };
}

// ---- Drehrate in der Luft: 40 m über der Ebene, 30 m/s, 1,5 s voller Ausschlag ----
function airRate(key, axis) {
  const W = world(), car = new Car(CAR_DEF);
  assistCar(car, key);
  car.place([0, 40, 0], [0, 0, -1], [0, 1, 0], 30);
  car.wheels.forEach((w) => { w.comp = w.prevComp = 0; w.contact = false; });
  let maxW = 0, ang = 0, t360 = null;
  for (let t = 0; t < 1.6; t += DT) {
    car.input.steer = axis === 'roll' ? 1 : 0; car.input.throttle = axis === 'pitch' ? 1 : 0; car.input.brake = 0;
    if (car.input.air) { car.input.air.pitch = axis === 'pitch' ? -1 : 0; car.input.air.roll = axis === 'roll' ? 1 : 0; }
    if (car.assist.airTap && t === 0) car.startTrick(axis === 'pitch' ? 'p' : 'r', axis === 'pitch' ? -1 : 1, W);
    car.step(DT, W);
    const F = car.frame, w = axis === 'pitch' ? car.w.x * F.r.x + car.w.y * F.r.y + car.w.z * F.r.z : car.w.x * F.f.x + car.w.y * F.f.y + car.w.z * F.f.z;
    maxW = Math.max(maxW, Math.abs(w)); ang += Math.abs(w) * DT;
    if (t360 == null && ang >= 2 * Math.PI) t360 = t;
  }
  return { rate: deg(maxW) * gs(key), t360: t360 == null ? null : t360 / gs(key) };
}

// ---- Landung: Auto fällt mit 30 m/s vorwärts und vz m/s abwärts, um phi gerollt (bzw. genickt) – Crash? ----
function landOnce(key, ang, axis = 'roll', vz = 8) {
  const W = world(), car = new Car(CAR_DEF);
  assistCar(car, key);
  const a = ang * Math.PI / 180;
  // Rollen: Dach nach rechts gekippt; Nicken: Nase nach unten
  const up = axis === 'roll' ? [Math.sin(a), Math.cos(a), 0] : [0, Math.cos(a), -Math.sin(a)];
  const fw = axis === 'roll' ? [0, 0, -1] : [0, -Math.sin(a), -Math.cos(a)];
  car.place([0, 2.6, 0], fw, up, 0);
  car.v.x = 0; car.v.y = -vz; car.v.z = -30;
  car.wheels.forEach((w) => { w.comp = w.prevComp = 0; w.contact = false; });
  car.airTime = 1.5; car.gScale = 0.7;   // wie nach einem langen Flug
  for (let t = 0; t < 3; t += DT) {
    car.input.throttle = 0.5; car.input.steer = 0; car.input.brake = 0;
    car.step(DT, W);
    if (car.crash) return car.crash.reason;
  }
  return car.frame.u.y > 0.7 ? '' : 'liegt schief';
}
function landLimit(key, axis) {
  let lo = 0, hi = 179;
  if (landOnce(key, 0, axis)) return { lim: 0 };
  for (let k = 0; k < 9; k++) { const m = (lo + hi) / 2; if (landOnce(key, m, axis)) hi = m; else lo = m; }
  return { lim: lo };
}
function landVz(key) {
  let lo = 2, hi = 40;
  for (let k = 0; k < 10; k++) { const m = (lo + hi) / 2; if (landOnce(key, 0, 'roll', m)) hi = m; else lo = m; }
  return lo;
}

// ---- Wiedereinstieg: Crash erzwingen, Zeit bis das Rennen wieder läuft (echte s) ----
function respawn(key, wreck) {
  const env = envCache.Schanze || (envCache.Schanze = prepare(JUMPS.Schanze()));
  const r = new Race(env, { assist: key, countdown: 0.05, wreck });
  let t = 0;
  for (; t < 3 && r.state !== 'running'; t += DT) r.step(DT, { steer: 0, throttle: 1, brake: 0 });
  for (let k = 0; k < 240; k++) r.step(DT, { steer: 0, throttle: 1, brake: 0 });
  r.car.setCrash('Test');
  let tc = 0;
  r.step(DT, { steer: 0, throttle: 1, brake: 0 });
  for (; tc < 10 && r.state !== 'running'; tc += DT) r.step(DT, { steer: 0, throttle: 1, brake: 0 });
  return (tc + DT) / gs(key);
}

// ---- Wandkontakt: 150 km/h, ohne Gas, Kurs th° auf eine Leitwand. Tempoverlust 1 s nach dem ersten Kontakt gegen
// dieselbe Fahrt ohne Wand (Luft-/Rollwiderstand herausgerechnet) ----
function wallRun(key, th, wx, v0, tEnd) {
  const W = world(wx), car = new Car(CAR_DEF);
  assistCar(car, key);
  const a = th * Math.PI / 180;
  car.place([0, 0, 0], [Math.sin(a), 0, -Math.cos(a)], [0, 1, 0], v0);
  let tHit = null;
  for (let t = 0; t < 6; t += DT) {
    car.input.throttle = 0; car.input.steer = 0; car.input.brake = 0;
    car.step(DT, W);
    if (car.crash) return { crash: car.crash.reason, tHit };
    if (tHit == null && car._bodyTouch) tHit = t;
    if (tEnd != null ? t >= tEnd : tHit != null && t - tHit >= 1.0) return { v: car.speed(), tHit, t, head: deg(Math.atan2(car.frame.f.x, -car.frame.f.z)) };
  }
  return { v: car.speed(), tHit };
}
function wall(key, th, v0 = 150 / 3.6) {
  const w = wallRun(key, th, 3, v0);
  if (w.crash) return { hit: true, crash: w.crash, loss: null };
  if (w.tHit == null) return { hit: false, crash: '', loss: null };
  const ref = wallRun(key, th, null, v0, w.t);
  return { hit: true, crash: '', loss: 100 * (1 - w.v / ref.v), vAfter: kmh(w.v), head: w.head };
}

const out = {};
const f1 = (x, d = 1) => (x == null ? '–' : typeof x === 'number' ? x.toFixed(d).replace('.', ',') : x);
for (const v of VARS) {
  setVar(v);
  for (const key of STUFEN) {
    const R = (out[`${v}/${key}`] = {});
    const tag = `${v} ${ASSISTS[key].name}`;
    if (NUR.includes('accel')) {
      const a = accel(key), n = accel(key, true);
      Object.assign(R, { t100: a.t100, t200: a.t200, vmax: a.vmax, vmaxNitro: n.vmax, nitroF: n.vmax / a.vmax });
      console.log(`${tag}: 0–100 ${f1(a.t100, 2)} s, 0–200 ${f1(a.t200, 2)} s, Vmax ${f1(a.vmax, 0)} km/h, mit Nitro ${f1(n.vmax, 0)} (×${f1(n.vmax / a.vmax, 2)})`);
    }
    if (NUR.includes('kurve')) {
      const A = ASSISTS[key];
      const g = grenztempo({ magnet: A.magnet, grip: A.grip, slipK: A.slipK, tcs: A.tcs, drive: A.drive, esc: A.esc, ...(Race.carAssist ? { _key: key } : {}) }, [25, 50, 100]);
      R.kurve = g.v;
      console.log(`${tag}: Kurvengrenztempo R25/50/100 ${[25, 50, 100].map((r) => f1(g.v[r] && kmh(g.v[r]), 0)).join(' / ')} km/h`);
    }
    if (NUR.includes('sprung')) {
      R.sprung = {};
      for (const nm of Object.keys(JUMPS)) {
        const j = jump(key, nm);
        R.sprung[nm] = j;
        console.log(`${tag}: ${nm}: Lippe ${f1(j.vLip, 0)} km/h, Flug ${f1(j.air, 2)} s (Spielzeit ${f1(j.airSim, 2)}), Weite ${f1(j.weite, 0)} m, Scheitel ${f1(j.apex, 1)} m ${j.crash}`);
      }
    }
    if (NUR.includes('stunt')) {
      R.stunt = {};
      for (const nm of Object.keys(JUMPS)) for (const [fig, n] of [['vor', 1], ['rueck', 1], ['schraube', 1], ['schraube', 2]]) {
        const st = stunt(key, nm, fig, n); R.stunt[`${nm} ${fig} ${n}`] = st;
        console.log(`${tag}: ${nm} ${fig} ×${n}: ${f1(st.deg, 0)}° in ${f1(st.air, 2)} s → ${st.ok ? 'gelandet' : st.crash || 'nicht gelandet'} (${f1(st.vIn, 0)} → ${f1(st.vOut, 0)} km/h)${st.no ? ` (${st.no}× zu spät)` : ''}`);
      }
    }
    if (NUR.includes('luft')) {
      const p = airRate(key, 'pitch'), r = airRate(key, 'roll');
      R.luft = { pitch: p, roll: r };
      console.log(`${tag}: Luft-Drehrate Nicken ${f1(p.rate, 0)}°/s (360° in ${f1(p.t360, 2)} s), Rollen ${f1(r.rate, 0)}°/s (360° in ${f1(r.t360, 2)} s)`);
    }
    if (NUR.includes('landung')) {
      const lr = landLimit(key, 'roll'), lp = landLimit(key, 'pitch'), vz = landVz(key);
      R.landung = { roll: lr.lim, pitch: lp.lim, vz };
      console.log(`${tag}: Landung ohne Crash bis Rollen ${f1(lr.lim, 0)}°, Nicken ${f1(lp.lim, 0)}°, gerade bis ${f1(vz, 1)} m/s abwärts`);
    }
    if (NUR.includes('respawn')) {
      const a = respawn(key, false), b = respawn(key, true);
      R.respawn = { reset: a, wrack: b };
      console.log(`${tag}: Wiedereinstieg ${f1(a, 2)} s (Totalschaden aus), ${f1(b, 2)} s (Totalschaden an)`);
    }
    if (NUR.includes('wand')) {
      R.wand = {};
      for (const th of [5, 10, 15, 30, 60]) { const w = wall(key, th); R.wand[th] = w; }
      console.log(`${tag}: Wand 150 km/h ` + [5, 10, 15, 30, 60].map((th) => { const w = R.wand[th]; return `${th}°: ${w.crash ? 'Crash' : w.loss == null ? 'kein Kontakt' : '−' + f1(w.loss, 0) + ' %'}`; }).join(', '));
    }
  }
}
if (arg('json')) fs.writeFileSync(arg('json'), JSON.stringify(out, null, 1));
void LEVEL_H; void NITRO;
