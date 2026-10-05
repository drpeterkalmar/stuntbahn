// n26 Stunt-Maßstab: Maße und Tempo je Stunt-Art (für den Bericht, vorher/nachher):
//   STUNT_STUNT=1 node tools/stunt_masse.mjs --json=alt.json   ·   node tools/stunt_masse.mjs --json=neu.json
//   node tools/stunt_masse.mjs --cmp=alt.json,neu.json   (Tabelle)
// Gemessen werden Rechenwerte der Bauteile (Höhe, Spurbreite, Länge, Tempo-Fenster) und in der Physik: Looping ohne Gas
// (kleinstes Einfahrt-Tempo, das oben ankommt), Schanze/Klippe mit dem Autopiloten (Lippen-Tempo, Flug, Scheitel, Weite).
import fs from 'fs';
const arg = (k, d) => { const a = process.argv.find((s) => s.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };

if (arg('cmp')) {
  const [A, B] = arg('cmp').split(',').map((f) => JSON.parse(fs.readFileSync(f, 'utf8')));
  const f = (x) => (typeof x === 'number' ? (Math.abs(x) >= 100 ? x.toFixed(0) : x.toFixed(x >= 10 ? 1 : 2)).replace('.', ',') : String(x));
  console.log('| Stunt | Maß | bis n25 | n26 | Faktor |\n|---|---|---|---|---|');
  for (const [k, row] of Object.entries(B)) for (const [m, v] of Object.entries(row)) {
    const a = A[k] ? A[k][m] : undefined;
    const fac = typeof v === 'number' && typeof a === 'number' && a ? '×' + (v / a).toFixed(2).replace('.', ',') : '';
    console.log(`| ${k} | ${m} | ${a == null ? '–' : f(a)} | ${f(v)} | ${fac} |`);
  }
  process.exit(0);
}

const { STUNT_SCALE, ROAD_HW } = await import('../src/track/defs.js');
const { loopGeom, tubeGeom, JUMP, jumpWindow, jumpFor, kickerY } = await import('../src/track/pieces.js');
const { waveGeom, WALL, cliffDesign, CLIFF_KICK } = await import('../src/track/pieces_3d.js');
const { corkGeom } = await import('../src/track/pieces_trk.js');
const { HALFPIPE, ENV } = await import('../src/track/gelaende.js');
const { WORLD_SCALE } = await import('../src/track/defs.js');
const { PROF } = await import('../src/ai/profile.js');
const { prepare } = await import('../src/track/verify.js');
const { Race } = await import('../src/game/race.js');
const { chain } = await import('../tests/node/common.mjs');
const kmh = (v) => v * 3.6, k = STUNT_SCALE, DT = 1 / 120;
const out = {};

// Looping
const LP = loopGeom(k);
// kleinstes Einfahrt-Tempo ohne Gas (Autopilot lenkt), das über den Scheitel kommt
function loopMin() {
  const c = chain(3, 15, 0, ['start', 'straight', 'straight', 'straight', 'loop', 'straight', 'straight', 'straight']);
  const env = prepare({ pieces: c.pieces, seed: 1, closed: false }), L = env.track.line;
  let a = 0; while (!L.loop[a]) a++;
  let lo = 8, hi = 40;
  const ok = (v0) => {
    const r = new Race(env, { assist: 'original', countdown: 0.01 });
    for (let q = 0; q < 3; q++) r.step(DT, { steer: 0, throttle: 0, brake: 0 });
    let j = a; while (L.s[a] - L.s[j] < 6 && j > 0) j--;
    r.place(j, v0, true);
    let top = 0;
    for (let t = 0; t < 8 && !r.car.crash; t += DT) { const c2 = r.ap.control(r.car); r.step(DT, { steer: c2.steer, throttle: 0, brake: 0 }); r.events.length = 0; const i = r.ap.tr.idx; if (L.loop[i]) top = Math.max(top, L.py[i]); if (L.s[i] - L.s[a] > 120) break; }
    return !r.car.crash && top > LP.H - 0.5;
  };
  for (let it = 0; it < 12; it++) { const m = (lo + hi) / 2; if (ok(m)) hi = m; else lo = m; }
  return hi;
}
out.Looping = { 'Höhe (m)': LP.H, 'Bogenlänge (m)': LP.S, 'Spurbreite (m)': 2 * LP.hw, 'Spurversatz (m)': LP.shift, 'Breite beider Spuren (m)': 2 * (LP.shift + LP.hw), 'Radius oben (m)': LP.S / Math.PI / Math.PI, 'Einfahrt ohne Gas mind. (km/h)': kmh(loopMin()) };
const TG = tubeGeom(k);
out['Röhre'] = { 'Boden (m)': 2 * TG.b, 'Höhe innen (m)': 2 * TG.R, 'Breite innen (m)': 2 * (TG.b + TG.R), 'Spielraum Linie ± (m)': TG.lim };
const CK = corkGeom(k);
out.Korkenzieher = { 'Radius (m)': CK.R, 'Höhe (m)': 2 * CK.R, 'Spurbreite (m)': 2 * CK.hw, 'Länge (m)': CK.len, 'Höchsttempo Rollrate (km/h)': kmh(PROF.rollMax * CK.len / (2 * Math.PI)) };
// Schanze
const w = jumpWindow(), Jk = jumpFor('bumps', 'straight'), wk = jumpWindow(Jk);
out.Schanze = { 'Lippe Winkel (°)': JUMP.lipDeg, 'Lippe Höhe (m)': JUMP.lipH, 'Anlauf-Bogen (m)': JUMP.lipF - JUMP.kickStart, 'Landerampe Höhe (m)': JUMP.landH, 'Landerampe Länge (m)': JUMP.landLen, 'Lücke (m)': JUMP.landF - JUMP.lipF,
  'Fenster von (km/h)': kmh(w.vmin), 'Fenster bis (km/h)': kmh(w.vmax), 'Scheitel über Lippe bei vbest (m)': w.apex, 'Scheitel über Grund (m)': w.apex + JUMP.lipH, 'Flug bei vbest (s)': w.air, 'Weite bei vbest (m)': JUMP.landF - JUMP.lipF + w.fl,
  'kurzer Anlauf: Fenster (km/h)': `${kmh(wk.vmin).toFixed(0)}–${kmh(wk.vmax).toFixed(0)}` };
// Schanze in der Physik: Autopilot (Leicht) über eine Schanze mit Anlauf
{
  const c = chain(3, 15, 0, ['start', 'straight', 'straight', 'straight', 'jump', 'straight', 'straight', 'straight']);
  const env = prepare({ pieces: c.pieces, seed: 1, closed: false }), L = env.track.line, J = env.track.jumps[0];
  const r = new Race(env, { assist: 'original', autopilot: true, countdown: 0.05 });
  let vLip = 0, air = 0, top = -1e9, x0 = null, land = null;
  for (let t = 0; t < 30 && !land; t += DT) {
    r.step(DT, { steer: 0, throttle: 0, brake: 0 }); r.events.length = 0;
    const i = r.tracker.idx, car = r.car;
    if (!vLip && i >= J.lipIdx) { vLip = car.speed(); x0 = { x: car.pos.x, z: car.pos.z }; }
    if (vLip) { if (car.onGround === 0) { air += DT; top = Math.max(top, car.pos.y); } else if (air > 0.3) land = Math.hypot(car.pos.x - x0.x, car.pos.z - x0.z); }
  }
  Object.assign(out.Schanze, { 'Autopilot: Lippen-Tempo (km/h)': kmh(vLip), 'Autopilot: Flug (s)': air, 'Autopilot: Scheitel über Lippe (m)': top - L.py[J.lipIdx] - 0.5, 'Autopilot: Weite (m)': land || 0 });
}
const C6 = cliffDesign(6), C12 = cliffDesign(12);
out.Klippe = { 'Lippe Höhe (m)': CLIFF_KICK.lipH, 'Fall 1 Ebene: Fenster (km/h)': `${kmh(C6.win.vmin).toFixed(0)}–${kmh(C6.win.vmax).toFixed(0)}`, 'Fall 2 Ebenen: Fenster (km/h)': `${kmh(C12.win.vmin).toFixed(0)}–${kmh(C12.win.vmax).toFixed(0)}`, 'Felder (1 / 2 Ebenen)': `${C6.cells} / ${C12.cells}` };
const WG = waveGeom(k);
out.Wellen = { 'Anzahl': WG.n, 'Wellenlänge (m)': WG.len, 'Höhe (m)': WG.h, 'Krümmungsradius Kuppe (m)': 1 / (2 * WG.h * (Math.PI / WG.len) ** 2), 'Steigung max': Math.PI * WG.h / WG.len };
const kb = 1 + (k - 1) * 0.5;
out.Bodenwellen = { 'Wellenlänge (m)': 5 * kb, 'Höhe (m)': 0.42 * kb };
out.Kuppe = { 'Höhe (m)': 3.4 * WORLD_SCALE * (1 + (k - 1) * 0.3), 'Länge (m)': 80 };
out.Steilwand = { 'Wandbreite (m)': 2 * WALL.hw, 'Oberkante (m)': 2 * WALL.hw * Math.sin(WALL.bank), 'Neigung (°)': WALL.bank * 180 / Math.PI };
out.Halfpipe = { 'Radius Viertelröhre (m)': HALFPIPE.R, 'Kante hoch (m)': HALFPIPE.R * (1 - Math.cos(HALFPIPE.A)), 'Breite gesamt (m)': 2 * (HALFPIPE.hf + HALFPIPE.R * Math.sin(HALFPIPE.A)) };
out.Schlucht = { 'Tiefe (m)': ENV.gorgeDepth };
out.Fahrbahn = { 'Breite (m)': 2 * ROAD_HW };
if (arg('json')) fs.writeFileSync(arg('json'), JSON.stringify(out, null, 1));
for (const [kk, row] of Object.entries(out)) console.log(kk, JSON.stringify(row));
void kickerY;
