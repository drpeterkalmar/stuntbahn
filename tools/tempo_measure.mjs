// Tempo-Messung (Node, gleiche Physik wie im Spiel): Vmax und Beschleunigung auf einer unendlichen Ebene
// (Asphalt), Bremsweg, alte gegen neue Abstimmung. Optional Autopilot-Runden auf allen drei Stufen
// (Demo, Showcase, 5 Seeds, Test-.TRK-Strecken) mit Höchsttempo, Crashs/Resets und Sprüngen.
// Aufruf: node tools/tempo_measure.mjs [--laps] [--only=Name] [--def=alt|neu] [--json=datei]
import fs from 'fs';
import { Car, CAR_DEF, CAR_DEF_ALT } from '../src/physics/car.js';
import { MAT } from '../src/track/defs.js';
import { tracks } from './linie_analyse.mjs';
import { TrackDesigner } from '../src/track/trkdesign.js';
import { parseTrk } from '../src/track/trk.js';
import { trkToLayout } from '../src/track/trkimport.js';
import { prepare } from '../src/track/verify.js';
import { Race } from '../src/game/race.js';
import { fmtTime } from '../src/core/util.js';

const args = process.argv.slice(2);
const opt = (k, d) => { const a = args.find((x) => x.startsWith('--' + k + '=')); return a ? a.slice(k.length + 3) : (args.includes('--' + k) ? true : d); };
const DT = 1 / 120;

// Ebene y = 0 (Asphalt) als Kollisionswelt
const PLANE = {
  ray(ox, oy, oz, dx, dy, dz, len) {
    if (dy >= -1e-9) return null;
    const t = -oy / dy;
    if (t < 0 || t > len) return null;
    return { t, x: ox + dx * t, y: 0, z: oz + dz * t, nx: 0, ny: 1, nz: 0, mat: MAT.ROAD };
  },
};

// Vollgas geradeaus bis Vmax (Tempo ändert sich < 0,05 km/h in 2 s), Zwischenzeiten + Wege
export function straightRun(def) {
  const car = new Car(def);
  car.place([0, 0, 0], [0, 0, -1], [0, 1, 0], 0);
  const marks = [100, 200, 300, 400, 500], hit = {};
  let t = 0, dist = 0, prev = 0, tPrev = 0, vmax = 0;
  car.input.throttle = 1;
  while (t < 240) {
    car.step(DT, PLANE); t += DT;
    if (car.pos.z < -500) car.pos.z += 1000; // Ebene ist überall gleich; „Verirrt“ ab 950 m vermeiden
    const kmh = car.fwdSpeed() * 3.6;
    dist += car.fwdSpeed() * DT;
    for (const m of marks) if (!hit[m] && kmh >= m) hit[m] = { t, s: dist };
    vmax = Math.max(vmax, kmh);
    if (t - tPrev >= 2) { if (kmh - prev < 0.05) break; prev = kmh; tPrev = t; }
  }
  return { vmax, hit, gear: car.gear, rpm: car.rpm };
}

// Vollbremsung von v0 (km/h) bis 100 km/h bzw. Stillstand: Weg und mittlere Verzögerung
export function brakeRun(def, v0kmh, v1kmh = 0) {
  const car = new Car(def);
  car.place([0, 0, 0], [0, 0, -1], [0, 1, 0], v0kmh / 3.6);
  for (let k = 0; k < 60; k++) car.step(DT, PLANE); // Federn setzen (Abtrieb)
  car.input.throttle = 0; car.input.brake = 1; car.input.hold = true;
  const va = car.fwdSpeed();
  let t = 0, dist = 0;
  while (car.fwdSpeed() > v1kmh / 3.6 + 0.3 && t < 60) { car.step(DT, PLANE); t += DT; if (car.pos.z < -500) car.pos.z += 1000; dist += car.fwdSpeed() * DT; }
  return { from: va * 3.6, t, s: dist, a: (va - car.fwdSpeed()) / t / 9.81 };
}

// Autopilot-Runde auf einer Stufe: Leicht ohne Eingabe, Mittel/Original mit Autopilot-Eingabe
// („perfekter Spieler“). Höchsttempo, Crashs (auch ohne Totalschaden: jede Strafe), Sprünge.
function lap(env, assist) {
  const race = new Race(env, { assist, countdown: 0.05 });
  const L = env.track.line;
  const maxT = Math.max(90, L.total / 7);
  const jumps = env.track.jumps.map((j, k) => ({ j, w: env.prof.windows[k], vLip: null, ok: null, air: 0 }));
  let t = 0, vtop = 0;
  const crashes = [];
  while (t < maxT && race.state !== 'finished') {
    let inp = { steer: 0, throttle: 0, brake: 0 };
    if (assist !== 'easy') { const o = race.ap.control(race.car); inp = { steer: o.steer, throttle: o.throttle, brake: o.brake }; }
    const prev = race.tracker.idx;
    race.step(DT, inp); t += DT;
    vtop = Math.max(vtop, race.car.fwdSpeed());
    const ti = race.tracker.idx;
    for (const J of jumps) {
      if (J.vLip === null && prev <= J.j.lipIdx && ti > J.j.lipIdx && ti < J.j.lipIdx + 200) J.vLip = race.car.speed();
      if (J.vLip !== null && J.ok === null) {
        if (race.car.onGround === 0) J.air += DT;
        else if (J.air > 0.25) J.ok = !L.air[ti] && ti >= J.j.landIdx - 2;
      }
    }
    for (const e of race.events) if (e.type === 'crash' || e.type === 'shortcut') crashes.push(`${e.reason || e.type}@${Math.round(L.s[race.tracker.idx])}m`);
    race.events.length = 0;
  }
  const inWin = jumps.filter((J) => J.w && J.vLip !== null && J.vLip >= J.w.vmin - 0.3 && J.vLip <= J.w.vmax + 0.3).length;
  return { ok: race.state === 'finished', time: race.state === 'finished' ? race.finalTime : null, crashes, jumps: jumps.length, jumpOk: jumps.filter((J) => J.ok).length, inWin, vtop: vtop * 3.6 };
}

function lapTracks() {
  const list = tracks().filter((t) => !/LONG_GO2/.test(t.name) || opt('long', false));
  const ring = (w, h, surf) => {
    const t = new TrackDesigner(5, 5, 0, surf);
    t.put('sf').road(w).put('large', { turn: 'R' }).road(h).put('large', { turn: 'R' }).road(w + 1).put('large', { turn: 'R' }).road(h).put('large', { turn: 'R' });
    return trkToLayout(parseTrk(t.bytes(1), 'x')).layout;
  };
  list.push({ name: 'ZIP1.TRK', layout: ring(5, 2) }, { name: 'ZIP2.TRK (Eis)', layout: ring(7, 5, 'icy') });
  const only = opt('only', '');
  return only ? list.filter((t) => t.name.includes(only)) : list;
}

// Versuche: --set=mu:1.4,power:1.8e6 ändert CAR_DEF (wirkt auf Physik, Profil und Autopilot)
for (const kv of String(opt('set', '')).split(',').filter(Boolean)) { const [k, v] = kv.split(':'); CAR_DEF[k] = +v; }

if (import.meta.url === `file://${process.argv[1]}`) {
  const defs = { alt: CAR_DEF_ALT, neu: CAR_DEF };
  const f1 = (x) => x.toFixed(1).replace('.', ',');
  console.log('| Abstimmung | Vmax | 0–100 | 0–200 | 0–300 | 0–400 | 0–500 | Bremsweg 200→0 | Bremsweg Vmax→100 |');
  console.log('|---|---|---|---|---|---|---|---|---|');
  const out = { straight: {} };
  for (const [name, def] of Object.entries(defs)) {
    const r = straightRun(def);
    const b1 = brakeRun(def, 200), b2 = brakeRun(def, r.vmax - 1, 100);
    const h = (m) => r.hit[m] ? `${f1(r.hit[m].t)} s / ${Math.round(r.hit[m].s)} m` : '–';
    console.log(`| ${name} | **${Math.round(r.vmax)} km/h** (Gang ${r.gear}, ${Math.round(r.rpm)} U/min) | ${h(100)} | ${h(200)} | ${h(300)} | ${h(400)} | ${h(500)} | ${Math.round(b1.s)} m (${f1(b1.a)} g) | ${Math.round(b2.s)} m (${f1(b2.a)} g) |`);
    out.straight[name] = { ...r, b1, b2 };
  }
  if (opt('laps', false)) {
    console.log('\n| Strecke | Leicht | Mittel | Original | Höchsttempo L/M/O | Crashs/Resets | Sprünge gelandet / im Fenster / gesamt |');
    console.log('|---|---|---|---|---|---|---|');
    out.laps = [];
    for (const T of lapTracks()) {
      const env = prepare(T.layout, { treeCount: 0 });
      const r = {};
      for (const a of ['easy', 'medium', 'original']) r[a] = lap(env, a);
      const f = (x) => x.ok ? fmtTime(x.time) : '✗';
      const cr = ['easy', 'medium', 'original'].map((a) => r[a].crashes.length ? `${a}: ${r[a].crashes.join(', ')}` : '').filter(Boolean).join('; ') || '0';
      const j = ['easy', 'medium', 'original'].map((a) => `${r[a].jumpOk}/${r[a].inWin}/${r[a].jumps}`).join(' · ');
      console.log(`| ${T.name} (${Math.round(env.track.line.total)} m) | ${f(r.easy)} | ${f(r.medium)} | ${f(r.original)} | ${['easy', 'medium', 'original'].map((a) => Math.round(r[a].vtop)).join(' / ')} km/h | ${cr} | ${j} |`);
      out.laps.push({ name: T.name, ...r });
    }
  }
  if (opt('json', '')) fs.writeFileSync(opt('json', ''), JSON.stringify(out, null, 1));
}
