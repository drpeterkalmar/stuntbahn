// n33 Röhre mit Wand / Zickzack: Kamera-Vorprüfung in Node (ohne Browser) – die echte Kamera-Logik (gfx/camera.js
// CameraRig mit Verdeckungs-Strahlen gegen die Kollisionsgeometrie) fährt mit dem Leicht-Autopiloten durch das Element.
// Je Bild: liegt die Kamera im Röhren-Innenraum (Abstand zur Achse < Radius, Röhre am Portal mit flachem Boden genähert)
// und sieht sie das Auto, ohne dass die Mittelwand bzw. ein Zickzack-Block dazwischen liegt? Verfolger quer und hoch,
// Cockpit, Stoßstange. Ersetzt die Abnahme im Browser nicht (dort: Bild ansehen), findet aber grobe Fehler vorher.
// Aufruf: node tools/hindernis_kamera.mjs [--el=tube_wall,zigzag] [--lvl=0,1]
import path from 'path'; import url from 'url';
const HERE = path.dirname(url.fileURLToPath(import.meta.url)), ROOT = path.resolve(HERE, '..');
const arg = (k, d) => { const a = process.argv.find((s) => s.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const imp = (p) => import(url.pathToFileURL(path.join(ROOT, p)).href);
await import(url.pathToFileURL(path.join(ROOT, 'tests/node/three_haken.mjs')).href);
const THREE = await import('three');
const { CameraRig } = await imp('src/gfx/camera.js');
const { chain } = await imp('tests/node/common.mjs');
await imp('src/track/generator.js');
const { prepare } = await imp('src/track/verify.js');
const { Race } = await imp('src/game/race.js');
const { ROAD_HW } = await imp('src/track/defs.js');
const DT = 1 / 120;

export function kameraCheck(el, lvl = 0, views = [['chase', 16 / 9], ['chase', 9 / 19.5], ['cockpit', 16 / 9], ['bumper', 9 / 19.5]]) {
  const list = lvl ? ['start', 'straight', 'rampUp', 'straight', 'straight', el, 'straight', 'straight', 'rampDown', 'straight', 'straight'] : ['start', 'straight', 'straight', 'straight', 'straight', el, 'straight', 'straight', 'straight', 'straight'];
  const c = chain(3, 15, 0, list), env = prepare({ pieces: c.pieces, seed: 1, closed: false });
  const T = env.track, o = T.obstacles[0];
  const loc = (p) => { const dx = p.x - o.E[0], dz = p.z - o.E[2]; return { f: dx * o.F[0] + dz * o.F[2], r: dx * o.R[0] + dz * o.R[2], y: p.y - o.base }; };
  const res = [];
  for (const [mode, aspect] of views) {
    const cam = new THREE.PerspectiveCamera(62, aspect, 0.1, 3000), rig = new CameraRig(cam);
    rig.setTrackCams(T); rig.mode = mode; rig.init = false;
    const race = new Race(env, { assist: 'easy', countdown: 0.05, fahrstil: 'sauber' });
    const st = { mode, aspect, frames: 0, outside: 0, blocked: 0, outMax: 0, axMax: 0, dist: 0 };
    for (let k = 0; k < 120 * 40 && race.state !== 'finished'; k++) {
      race.step(DT, { steer: 0, throttle: 0, brake: 0 }); race.events.length = 0;
      const car = race.car, pose = { pos: car.pos, q: car.q, frame: car.frame, air: car.onGround === 0 && !car.surfaceKind && !car.crash, wheels: car.wheels, vel: car.v };
      rig.update(DT, pose, !!car.crash, env.world, car.speed() * 3.6);
      const ci = race.tracker.idx;
      if (ci < o.idx0 - 10) continue;
      if (ci > o.idx1 + 10) break;
      const P = cam.position, q = loc(P), a = loc(car.pos);
      if (o.kind === 'tube_wall') {
        if (q.f < o.fr0 - 4 || q.f > o.fr1 + 4) continue;   // Kamera noch vor dem Portal bzw. dahinter
        st.frames++;
        // Innenraum: in der Rolle Kreis um die Achse (Radius R), am Übergang großzügig (flacher Boden ±b)
        const dAx = Math.hypot(q.r, q.y - o.rad), out = dAx - (o.rad - 0.05);
        if (q.f > o.fr0 && q.f < o.fr1) st.axMax = Math.max(st.axMax, dAx);
        st.dist = Math.max(st.dist, Math.hypot(P.x - car.pos.x, P.y - car.pos.y, P.z - car.pos.z));
        if (q.f > o.fr0 && q.f < o.fr1 && out > 0) { st.outside++; st.outMax = Math.max(st.outMax, out); }
        // Sichtlinie Kamera → Auto quer durch die Wand-Ebene f = o.f unterhalb der Oberkante?
        if ((q.f - o.f) * (a.f - o.f) < 0) {
          const t = (o.f - q.f) / (a.f - q.f), y = q.y + (a.y - q.y) * t, r = q.r + (a.r - q.r) * t;
          if (y < o.top && Math.hypot(r, y - o.rad) < o.rad + 0.2) st.blocked++;
        }
      } else if (o.kind === 'zigzag') {
        st.frames++;
        // Sichtlinie gegen die Blöcke (Quader in Stück-Koordinaten, Höhe h): Stichproben entlang der Linie
        for (let s = 0.05; s < 0.95; s += 0.05) {
          const f = q.f + (a.f - q.f) * s, r = q.r + (a.r - q.r) * s, y = q.y + (a.y + 0.6 - q.y) * s;
          if (o.blocks.some((b) => Math.abs(f - b.f) < b.lb / 2 && y < b.h && (b.side > 0 ? r > ROAD_HW - b.d : r < -(ROAD_HW - b.d)))) { st.blocked++; break; }
        }
        if (o.blocks.some((b) => Math.abs(q.f - b.f) < b.lb / 2 && q.y < b.h && (b.side > 0 ? q.r > ROAD_HW - b.d : q.r < -(ROAD_HW - b.d)))) st.outside++;
      }
    }
    res.push(st);
  }
  return res;
}

if (import.meta.url === url.pathToFileURL(process.argv[1]).href) {
  for (const el of arg('el', 'tube_wall,zigzag').split(',')) for (const lvl of arg('lvl', '0,1').split(',').map(Number)) {
    for (const s of kameraCheck(el, lvl)) console.log(`${el} ${lvl ? 'Ebene 1' : 'flach'} ${s.mode.padEnd(7)} ${s.aspect > 1 ? 'quer' : 'hoch'}: ${s.frames} Bilder, Kamera außerhalb ${s.outside}${s.outMax ? ` (bis ${s.outMax.toFixed(2)} m)` : ''}, Sicht aufs Auto verdeckt ${s.blocked}${s.axMax ? `, Kamera bis ${s.axMax.toFixed(2)} m von der Achse (Radius 5,6), bis ${s.dist.toFixed(1)} m hinter dem Auto` : ''}`);
  }
}
