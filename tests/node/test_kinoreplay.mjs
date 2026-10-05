// Kino-Replay (n18): Moment-Finder auf 5 aufgezeichneten Fahrten (flach, 3D, Gelände, Sammlung), Film-Regeln (3–5 Momente,
// zeitlich sortiert, ohne Überlappung, nie über einen Schnitt, Länge), Zeitlupen-Kurve, Abspielen, Kameras gegen Strecke
// und Gelände (über dem Boden, Sicht aufs Auto, Auto im Bild quer und hoch), Crash-Regeln.
// Aufruf: node tests/node/test_kinoreplay.mjs [--alle] (ohne: 5 Fahrten)
import { RUNS, runRace, marksOf } from '../../tools/kinoreplay_probe.mjs';
import { buildFilm, findMoments, FilmPlayer, clipSpeed, HL, poseAt } from '../../src/game/highlights.js';
import { CineCam } from '../../src/game/cinecam.js';
import { REC_HZ, REC_STRIDE } from '../../src/game/race.js';
import { ZIEL } from '../../src/game/zielshow.js';

let fails = 0;
const check = (ok, msg) => { console.log(`${ok ? 'OK  ' : 'FAIL'} ${msg}`); if (!ok) fails++; };
const fmt = (x, d = 1) => x.toFixed(d).replace('.', ',');

// Kamera eines ganzen Films abfahren (60 Hz) und prüfen. aspect: Bildformat; bars: Anteil der Höhe je Balken
export function camCheck(env, rec, film, aspect, bars = 0) {
  const cc = new CineCam(env, rec, film), P = new FilmPlayer(film);
  const st = {};
  const pp = { p: [0, 0, 0], f: [0, 0, -1], u: [0, 1, 0] };
  let n = 0;
  while (!P.done && n < 60 * 60) {
    P.advance(1 / 60);
    const pose = poseAt(rec, P.t, pp);
    const Pz = { pos: { x: pose.p[0], y: pose.p[1], z: pose.p[2] }, frame: { f: { x: pose.f[0], y: pose.f[1], z: pose.f[2] }, u: { x: pose.u[0], y: pose.u[1], z: pose.u[2] } } };
    const shot = P.shot, O = cc.update(1 / 60, P.t, Pz, shot, P.clip, aspect, P.cut);
    // Tele am Looping getrennt (n27): das Stahlgerüst des großen Loopings (n26) kreuzt die Sicht immer wieder kurz
    // (n27: ebenso Fan-Cam und Kran am Looping – sie stehen daneben und sehen durchs Gerüst)
    const key = /^(tele|fan|crane)$/.test(O.cam) && P.clip.kind === 'loop' ? O.cam + '-loop' : O.cam;
    const s = st[key] || (st[key] = { n: 0, ground: 0, vis: 0, inView: 0, dmin: 1e9, dmax: 0 });
    s.n++; n++;
    if (O.pos[1] >= cc.floor(O.pos[0], O.pos[2]) + 0.3) s.ground++;
    // Sicht: Strahl Kamera → Auto (Mitte, 0,5 m über dem Ursprung)
    const car = [pose.p[0] + pose.u[0] * 0.5, pose.p[1] + pose.u[1] * 0.5, pose.p[2] + pose.u[2] * 0.5];
    // Zielbogen-Kamera (n27): Ziel ist der Bogen mit dem Feuerwerk, nicht das (wegfahrende) Auto → Sicht auf den Bogen
    const AR = O.cam === 'arch' ? cc.setupArch() : null;
    if (AR) { const A = [AR.arch[0], AR.arch[1] + 6, AR.arch[2]]; if (cc.ray(O.pos, A) > 0.97) s.vis++; }
    else if (O.cam === 'onboard' || cc.ray(O.pos, car) > 0.97 || cc.ray(car, O.pos) > 0.97) s.vis++;
    // Auto im Bild (innerhalb des sichtbaren Ausschnitts zwischen den Balken)
    const fw = [O.look[0] - O.pos[0], O.look[1] - O.pos[1], O.look[2] - O.pos[2]], fl = Math.hypot(...fw); fw[0] /= fl; fw[1] /= fl; fw[2] /= fl;
    let r = [fw[1] * O.up[2] - fw[2] * O.up[1], fw[2] * O.up[0] - fw[0] * O.up[2], fw[0] * O.up[1] - fw[1] * O.up[0]]; const rl = Math.hypot(...r); r = r.map((x) => x / rl);
    const u = [r[1] * fw[2] - r[2] * fw[1], r[2] * fw[0] - r[0] * fw[2], r[0] * fw[1] - r[1] * fw[0]];
    const th = Math.tan(O.fov * Math.PI / 360);
    // Auto ganz im Bild: Bug und Heck (± 2,2 m) im sichtbaren Ausschnitt; Action-Cam: Mitte (sitzt am Auto)
    const inv = (q) => {
      const d = [q[0] - O.pos[0], q[1] - O.pos[1], q[2] - O.pos[2]], z = d[0] * fw[0] + d[1] * fw[1] + d[2] * fw[2];
      const sy = (d[0] * u[0] + d[1] * u[1] + d[2] * u[2]) / (z * th), sx = (d[0] * r[0] + d[1] * r[1] + d[2] * r[2]) / (z * th * aspect);
      return z > 0 && Math.abs(sx) < 0.97 && Math.abs(sy) < 0.97 * (1 - 2 * bars);
    };
    const carEnds = O.cam === 'action' ? [pose.p] : [-2.2, 2.2].map((k) => [pose.p[0] + pose.f[0] * k, pose.p[1] + pose.f[1] * k, pose.p[2] + pose.f[2] * k]);
    // Zielbogen: zu Beginn des Schwenks das Auto, am Ende Bogen (Fuß und Brücke), dazwischen eins von beiden
    const archEnds = AR ? [[AR.arch[0], AR.arch[1] + 1, AR.arch[2]], [AR.arch[0], AR.arch[1] + 10, AR.arch[2]]] : null;
    const uP = AR ? (P.t - shot.t0) / ZIEL.pan : 0;
    // Heckkamera blickt nach hinten (Auto am Bildrand/außerhalb gewollt), im Reißschwenk ist das Auto kurz weg
    const ok = O.cam === 'onboard' || O.cam === 'rear' || O.whip || (O.cam === 'low' && Math.hypot(pose.p[0] - O.pos[0], pose.p[2] - O.pos[2]) < 6) || (!AR ? carEnds.every(inv) : uP < 0.25 ? carEnds.every(inv) : uP >= 1 ? archEnds.every(inv) : carEnds.every(inv) || archEnds.every(inv));
    if (ok) s.inView++;
    const dd = Math.hypot(pose.p[0] - O.pos[0], pose.p[1] - O.pos[1], pose.p[2] - O.pos[2]); s.dmin = Math.min(s.dmin, dd); s.dmax = Math.max(s.dmax, dd);
  }
  return { st, frames: n, filmT: P.ft };
}

const all = process.argv.includes('--alle');
const camTot = {};
console.log('--- A: Momente und Film auf 5 Fahrten ---');
for (const R of RUNS) {
  const env = R.env();
  const race = runRace(env, R.opts);
  const marks = marksOf(race);
  const film = buildFilm(race.rec, env, marks);
  check(race.state === 'finished' && !!film, `${R.name}: im Ziel (${fmt(race.time)} s), Film gebaut`);
  if (!film) continue;
  const mom = film.clips.filter((c) => c.kind !== 'finish');
  console.log(`     ${mom.map((c) => `${c.label} (${fmt(c.a)} s)`).join(' · ')} · Film ${fmt(film.duration)} s`);
  check(mom.length >= Math.min(3, film.cands.length > 2 ? 3 : film.cands.length) && mom.length <= HL.pick.max, `${R.name}: ${mom.length} Momente (Kandidaten ${film.cands.length})`);
  // n27: Momente höchstens film.max s, dazu der Zieleinlauf mit Zielshow (≤ 10 s)
  const fin = film.clips.find((c) => c.kind === 'finish');
  check(film.momentsT <= HL.film.max + 0.05 && (film.momentsT >= HL.film.min || mom.length < 3) && (!fin || fin.film <= 10), `${R.name}: Filmlänge ${fmt(film.duration)} s (Momente ${fmt(film.momentsT)} s, 15–30 s, + Zieleinlauf ${fin ? fmt(fin.film) : '–'} s)`);
  check(!!fin && fin.fin != null && fin.b - fin.fin >= 3 && fin.shots.some((x) => x.cam === 'arch'), `${R.name}: Zieleinlauf mit Auslauf (${fin ? fmt(fin.b - fin.fin) : '–'} s nach der Linie) und Zielbogen-Kamera`);
  const sorted = film.clips.every((c, k) => k === 0 || c.a >= film.clips[k - 1].b);
  check(sorted, `${R.name}: Clips zeitlich sortiert, ohne Überlappung`);
  const cutT = race.cuts.map((c) => c.f / REC_HZ);
  check(film.clips.every((c) => !cutT.some((tc) => tc > c.a + 1e-6 && tc < c.b - 1e-6)), `${R.name}: kein Clip über einen Schnitt (${cutT.length} Schnitte)`);
  check(film.clips.every((c) => c.c0 >= c.a && c.c1 <= c.b && c.tp >= c.a && c.tp <= c.b && c.shots.length && c.shots[0].t0 === c.a && c.shots[c.shots.length - 1].t1 === c.b), `${R.name}: Kern und Kameras innerhalb der Clips`);
  // Zeitlupen-Kurve: 1 am Rand, smin im Kern, stetig
  const c = mom[0];
  let jump = 0, prev = clipSpeed(c, c.a);
  for (let t = c.a; t < c.b; t += 1 / 240) { const s = clipSpeed(c, t); jump = Math.max(jump, Math.abs(s - prev)); prev = s; }
  check(clipSpeed(c, c.a) >= 1 - 1e-6 && clipSpeed(c, c.a) <= (c.fast || 1) + 1e-6 && Math.abs(clipSpeed(c, (c.c0 + c.c1) / 2) - c.smin) < 1e-6 && jump < 0.02, `${R.name}: Speed-Ramp ${c.fast || 1} → 1 → ${c.smin} → 1 → ${c.fast || 1}, weich (größter Sprung je 1/240 s: ${jump.toFixed(4)})`);
  // Kameras quer (Pixel 7, Balken 9 %) und hoch
  for (const [asp, bars, nm] of [[915 / 412, 0.09, 'quer'], [412 / 915, 0, 'hoch']]) {
    const r = camCheck(env, race.rec, film, asp, bars);
    check(Math.abs(r.filmT - film.duration) < 0.1, `${R.name} ${nm}: abgespielt ${fmt(r.filmT)} s = Film ${fmt(film.duration)} s`);
    for (const [cam, s] of Object.entries(r.st)) {
      const T = camTot[cam + ' ' + nm] || (camTot[cam + ' ' + nm] = { n: 0, ground: 0, vis: 0, inView: 0 });
      T.n += s.n; T.ground += s.ground; T.vis += s.vis; T.inView += s.inView;
      if (all) console.log(`     ${nm} ${cam}: ${s.n} Bilder, über Boden ${s.ground}, Sicht ${s.vis}, im Bild ${s.inView}, Abstand ${fmt(s.dmin)}–${fmt(s.dmax)} m`);
    }
  }
}
console.log('--- B: Kameras (alle Fahrten zusammen) ---');
for (const [k, T] of Object.entries(camTot)) {
  const g = T.ground / T.n, v = T.vis / T.n, i = T.inView / T.n;
  check(g === 1 && v >= (k.includes('-loop') ? 0.72 : 0.95) && i >= 0.97, `${k}: ${T.n} Bilder – über Boden/Wasser ${fmt(g * 100)} %, freie Sicht aufs Auto ${fmt(v * 100)} %, Auto im Bild ${fmt(i * 100)} %`);
}
const kinds = new Set(Object.keys(camTot).map((k) => k.split(' ')[0]));
check(['drone', 'action', 'tele', 'heli', 'onboard', 'arch', 'fan', 'crane', 'rear'].every((k) => kinds.has(k) || kinds.has(k + '-loop')), `Kamera-Arten im Film (n27: + Zielbogen, Fan-Cam, Kran, Heck): ${[...kinds].join(', ')}`);

console.log('--- C: Regeln ---');
{
  const R = RUNS[0], env = R.env(), race = runRace(env, R.opts), rec = race.rec, F = rec.length / REC_STRIDE;
  // Crash-Regeln mit künstlichen Marken: Festgefahren nie, mehr als maxCrashes Crashs → kein Crash-Moment (frustrierend)
  const fake = (n, reason) => ({ cuts: Array.from({ length: n }, (_, k) => ({ f: Math.round(F * (k + 1) / (n + 2)) + 25 })), crashes: Array.from({ length: n }, (_, k) => ({ f: Math.round(F * (k + 1) / (n + 2)), reason, v: 30 })) });
  const a = findMoments(rec, env, fake(2, 'Festgefahren')).cands.filter((m) => m.kind === 'crash').length;
  const b = findMoments(rec, env, fake(HL.crash.maxCrashes + 1, 'Abgestürzt')).cands.filter((m) => m.kind === 'crash').length;
  check(a === 0 && b === 0, `kein Crash-Moment bei „Festgefahren“ (${a}) und bei ${HL.crash.maxCrashes + 1} Crashs (${b})`);
  // Moment in einem Crash-Fenster zählt nicht; Clip endet vor dem Schnitt
  const film = buildFilm(rec, env, fake(1, 'Abgestürzt'));
  const tc = fake(1, '').cuts[0].f / REC_HZ;
  check(!!film && film.clips.every((c) => !(c.a < tc && c.b > tc)), 'Film mit Schnitt: kein Clip darüber hinweg');
  // zu kurze Aufzeichnung → kein Film
  check(buildFilm(rec.slice(0, 4 * REC_HZ * REC_STRIDE), env, {}) === null, 'Aufzeichnung unter 5 s → kein Film');
  // Gleiche Art mehrfach abgewertet: höchstens 2 gleiche Momente bei ≥ 3 Arten
  const f2 = buildFilm(rec, env, marksOf(race));
  const cnt = {}; for (const c of f2.clips) cnt[c.kind] = (cnt[c.kind] || 0) + 1;
  check(Object.entries(cnt).every(([k, n]) => k === 'finish' || n <= 2), `Abwechslung: ${JSON.stringify(cnt)}`);
}
console.log(fails ? `${fails} FEHLER` : 'alles grün');
process.exit(fails ? 1 : 0);
