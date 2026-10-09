// n33 Original-Stunt-Hindernisse (Peter 08.10.2026: „Zickzack-Barriere, Spirale, Röhre mit Wand in der Mitte, um eine
// Überkopf-Spirale zu erzwingen“):
//   A  Zickzack-Barriere: Blöcke abwechselnd, ragen über die Mitte, kollidieren, Warnflächen; Linie verengt → Ideallinie Slalom
//   B  Röhre mit Wand: Querschnitt am Portal wie die Röhre, in der Rolle kreisrund; Wand sperrt die untere Hälfte; Rolle
//      kopfüber über die Wand; Tempo-Fenster aus dem Profil
//   C  festes Tempo (tools/hindernis_mess.mjs): Zickzack bis 95 km/h ohne Berührung, 120 km/h Aufprall; Röhre 40 km/h fällt
//      von der Decke (Crash), 60–100 km/h hält, Dach ≥ 3 m über der Wand
//   D  Autopilot fährt beide flach und auf Ebene 1 ohne Crash; Zufallsstrecken Version 2 ohne Entschärfen
//   E  Generator: Version 1 bitgleich (flach: test_alte_codes; 3D/Gelände: Layout-Hashes von main n32), Version 2 mit Code-
//      Zusatz „h“, neue Elemente in allen Arten, Spiralen-Hochstraße flach, Schalter je Element, Entschärfen
//   F  Kulissen: Planung alter Codes bitgleich (main n32), Spots an Zickzack/Spirale auf Version 2
//   G  HUD (Leicht/Mittel), Highlights, Warnstreifen-Grafik, Menü-Hinweis, A/B-Regler, Code-Eingabe
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const mem = new Map();
globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k), get length() { return mem.size; }, key: (i) => [...mem.keys()][i] };
const HERE = path.dirname(fileURLToPath(import.meta.url)), ROOT = path.resolve(HERE, '../..');
const { TILE, ROAD_HW, HINDERNIS2, GEN_V, HIND_TAG } = await import('../../src/track/defs.js');
const { generate, defuse, DIFFS2, hindFilter } = await import('../../src/track/generator.js');
const { ZIGZAG, ZIGZAG2, zigzagBlocks, zigzagBounds, TUBE_WALL, tubeWallGeom, tubeWallFloor, tubeWallPhase } = await import('../../src/track/pieces_hind.js');
const { pieceCells } = await import('../../src/track/pieces.js');
const { checkOccupancy } = await import('../../src/track/generator3d.js');
const { verifySync, prepare } = await import('../../src/track/verify.js');
const { Race, MEDIUM_N24, ASSISTS } = await import('../../src/game/race.js');
const { Store, abMode } = await import('../../src/game/store.js');
const { Car } = await import('../../src/physics/car.js');
const { Autopilot } = await import('../../src/ai/autopilot.js');
const { layoutHash, HASH_SEEDS } = await import('./layout_hash.mjs');
const { obstWatch } = await import('../../tools/hindernis_mess.mjs');
const { chain, setup, drive } = await import('./common.mjs');

let fails = 0;
const check = (ok, msg) => { console.log(`${ok ? 'OK  ' : 'FAIL'} ${msg}`); if (!ok) fails++; };
const f2 = (x) => x.toFixed(2).replace('.', ','), kmh = (v) => (v * 3.6).toFixed(0);
const DT = 1 / 120;
const ROW = (el, lvl = 0) => (lvl ? ['start', 'straight', 'rampUp', 'straight', 'straight', el, 'straight', 'straight', 'rampDown', 'straight', 'straight'] : ['start', 'straight', 'straight', 'straight', 'straight', el, 'straight', 'straight', 'straight', 'straight']);
const envOf = (el, lvl = 0) => { const c = chain(3, 15, 0, ROW(el, lvl)); const e = setup({ pieces: c.pieces, seed: 1 }); e.track.roadHW = ROAD_HW; return e; };
// festes Tempo (Lenkung Autopilot), Beobachtung am Hindernis
function fixed(env, v) {
  const { track, world, ideal: L, prof } = env, o = track.obstacles[0], car = new Car();
  let si = o.idx0; while (si > 0 && L.s[o.idx0] - L.s[si] < 60) si--;
  car.place([L.px[si], L.py[si], L.pz[si]], [L.tx[si], L.ty[si], L.tz[si]], [L.nx[si], L.ny[si], L.nz[si]], v);
  const ap = new Autopilot(L, prof); ap.tr.reset(si);
  const W = obstWatch(track);
  for (let t = 0; t < 25 && !W.out.length; t += DT) {
    const u = ap.control(car), fv = car.fwdSpeed();
    car.input.steer = u.steer; car.input.throttle = fv < v ? 1 : 0; car.input.brake = fv > v + 1.5 ? 0.4 : 0;
    car.surfaceKind = L.loop[ap.tr.idx] || L.tube[ap.tr.idx] ? 1 : 0; car.haftOff = false;
    car.step(DT, world); W.step(car, ap.tr.idx, 0);
    if (car.crash) { W.step(car, ap.tr.idx, 1); break; }
  }
  return W.out[0] || { crash: 'nicht erreicht' };
}

console.log('--- A: Zickzack-Barriere ---');
{
  const B = zigzagBlocks('zigzag', 1), B2 = zigzagBlocks('zigzag2', -1);
  check(B.length === ZIGZAG.n && ZIGZAG.n >= 4 && ZIGZAG.n <= 6 && B.every((b, k) => b.side === (k % 2 ? -1 : 1)) && B2.length === ZIGZAG2.n && B2[0].side === -1,
    `${ZIGZAG.n} Blöcke abwechselnd (rechts zuerst; m = −1 links zuerst), kurze Variante ${ZIGZAG2.n}`);
  check(B[0].f > 2 && B[B.length - 1].f < ZIGZAG.cells * TILE - 2 && Math.abs(B[0].f + B[B.length - 1].f - ZIGZAG.cells * TILE) < 1e-6, `mittig im Stück (${f2(B[0].f)} … ${f2(B[B.length - 1].f)} m von ${ZIGZAG.cells * TILE} m)`);
  check(ZIGZAG.d > ROAD_HW && ZIGZAG2.d >= ROAD_HW - 0.05 && 2 * ROAD_HW - ZIGZAG.d > 4.5, `Blöcke ragen über die Mitte (${f2(ZIGZAG.d)} m in die ${f2(2 * ROAD_HW)} m breite Fahrbahn), Gasse ${f2(2 * ROAD_HW - ZIGZAG.d)} m`);
  const bR = zigzagBounds('zigzag', B[0].f, 1), bL = zigzagBounds('zigzag', B[1].f, 1), bF = zigzagBounds('zigzag', (B[0].f + B[1].f) / 2, 1);
  check(bR.hi < -1 && bL.lo > 1 && bF.hi - bF.lo > 2 * ROAD_HW - 3, `Linie am Block verengt (rechts: bis ${f2(bR.hi)} m, links: ab ${f2(bL.lo)} m), dazwischen frei`);
  const env = envOf('zigzag'), T = env.track, L = env.ideal, o = T.obstacles[0];
  check(o && o.kind === 'zigzag' && o.blockIdx.length === ZIGZAG.n, 'Stück meldet Hindernis mit Block-Indizes (track.obstacles)');
  check(T.marks && T.marks.length === 2 * ZIGZAG.n, `Warnflächen: Stirn- und Innenseite je Block (${T.marks.length})`);
  // Kollision: Dreiecke der Blöcke (MAT.WALL) in der Fahrbahn vorhanden
  let wallTris = 0;
  for (let k = 0; k < T.col.mat.length; k++) if (T.col.mat[k] === 4) wallTris++;
  check(wallTris >= ZIGZAG.n * 12, `Blöcke kollidieren (${wallTris} Wand-Dreiecke)`);
  // Ideallinie fährt Slalom: an jedem Block auf der freien Seite
  const sideOk = o.blocks.every((b, k) => { const i = o.blockIdx[k]; return b.side > 0 ? L.off[i] < -1.5 : L.off[i] > 1.5; });
  let vt = 1e9; for (let i = o.blockIdx[0]; i <= o.blockIdx[o.blockIdx.length - 1]; i++) vt = Math.min(vt, env.prof.vt[i]);
  check(sideOk, 'Ideallinie an jedem Block auf der freien Seite (Slalom)');
  check(vt > 60 / 3.6 && vt < 110 / 3.6, `Plan-Tempo im Slalom ${kmh(vt)} km/h (Tempo-Fenster aus der Linie)`);
}

console.log('--- B: Röhre mit Wand ---');
{
  const G = tubeWallGeom(1.6);
  check(Math.abs(tubeWallFloor(G, G.fp0) - G.b) < 1e-6 && tubeWallFloor(G, TILE) < 0.05 && tubeWallFloor(G, G.fr0 + 0.01) < 0.05, `Boden am Portal ${f2(G.b)} m (wie die Röhre), in der Rolle Kreis (Radius ${f2(G.R)} m)`);
  check(Math.abs(tubeWallPhase(0)) < 1e-9 && Math.abs(tubeWallPhase(1) - 1) < 1e-9 && Math.abs(tubeWallPhase(0.5) - 0.5) < 1e-6 && tubeWallPhase(0.02) < 0.005, 'Rollen-Phase 0 → 1, weich anlaufend, symmetrisch');
  const env = envOf('tube_wall'), T = env.track, L = env.track.line, o = T.obstacles[0];
  check(o && o.kind === 'tube_wall' && Math.abs(o.top - G.R * TUBE_WALL.top) < 1e-6 && o.idxW > o.idxR0 && o.idxW < o.idxR1, `Wand in der Mitte, Oberkante ${f2(o.top)} m (halbe Röhrenhöhe ${f2(G.R)} m)`);
  const yW = L.py[o.idxW] - o.base, upW = L.ny[o.idxW];
  check(yW > 2 * G.R - 0.3 && upW < -0.98, `Linie über der Wand an der Decke (${f2(yW)} m, Normale y ${f2(upW)}): kopfüber`);
  let tubeAll = true, unit = true;
  for (let i = o.idxR0; i <= o.idxR1; i++) { if (!L.tube[i]) tubeAll = false; if (Math.abs(Math.hypot(L.nx[i], L.ny[i], L.nz[i]) - 1) > 1e-3) unit = false; }
  check(tubeAll && unit, 'Rolle als Röhre markiert (Spurhilfe, Kamera, Leicht-Autopilot), Normalen Einheitslänge');
  check(T.marks && T.marks.length === 2, 'Warnstreifen: Vorderseite und Oberkante der Wand');
  let vmin = 0, vmax = 1e9;
  for (let i = o.idxR0; i <= o.idxR1; i++) { vmin = Math.max(vmin, env.prof.vmin[i]); vmax = Math.min(vmax, env.prof.vmax[i]); }
  check(vmin > 40 / 3.6 && vmin < 70 / 3.6 && vmax > vmin + 5, `Tempo-Fenster aus dem Profil: oben mindestens ${kmh(vmin)} km/h, höchstens ${kmh(vmax)} km/h`);
}

console.log('--- C: festes Tempo ---');
{
  for (const lvl of [0, 1]) {
    // Plan-Tempo ~75 km/h: bis 95 km/h ohne Berührung, ab ~100–105 km/h Aufprall (tests/out/n33/fest_zickzack.log)
    const env = envOf('zigzag', lvl), R = [60, 80, 95].map((k) => fixed(env, k / 3.6)), hit = fixed(env, 120 / 3.6);
    check(R.every((r) => !r.crash && r.clear > 0.1), `Zickzack ${lvl ? 'Ebene 1' : 'flach'}: 60/80/95 km/h ohne Berührung (Abstand min ${R.map((r) => f2(r.clear)).join(' / ')} m)`);
    check(!!hit.crash, `Zickzack ${lvl ? 'Ebene 1' : 'flach'}: 120 km/h → ${hit.crash || 'kein Crash'} (Blöcke kollidieren)`);
  }
  const env = envOf('tube_wall'), slow = fixed(env, 40 / 3.6), R = [60, 80, 100].map((k) => fixed(env, k / 3.6));
  check(!!slow.crash, `Röhre: 40 km/h fällt von der Decke → ${slow.crash || 'kein Crash'}`);
  check(R.every((r) => !r.crash && r.airMax < 0.1 && r.upMin < -0.95 && r.wallClear > 3), `Röhre: 60/80/100 km/h kopfüber an der Decke (ohne Radkontakt max ${R.map((r) => f2(r.airMax)).join(' / ')} s, Dach über der Wand ${R.map((r) => f2(r.wallClear)).join(' / ')} m)`);
}

console.log('--- D: Autopilot ---');
{
  for (const el of ['zigzag', 'zigzag2', 'tube_wall']) for (const lvl of [0, 1]) {
    const env = envOf(el, lvl), r = drive(env, { maxTime: 50 });
    check(!r.crash && r.idx >= env.ideal.n - 4, `${el} ${lvl ? 'Ebene 1' : 'flach'}: Autopilot ohne Crash durch (${f2(r.t)} s)`);
  }
  // Zufallsstrecken Version 2 mit neuen Elementen: Prüffahrt ohne Entschärfen
  const picks = [[3194, 3, {}], [3097, 2, {}], [3000, 3, { gel: true }], [3291, 2, { d3: true }]];
  for (const [s, d, o] of picks) {
    const lay = generate(s, d, { ...o, gv: 2 }), v = verifySync(lay, 0);
    const neu = lay.pieces.filter((p) => /zigzag|tube_wall/.test(p.type) || (p.type === 'spiral' && !o.d3)).map((p) => p.type);
    check(v.ok, `${lay.meta.key}: Prüffahrt ohne Entschärfen (${neu.join(', ') || '–'})`);
  }
}

console.log('--- E: Generator ---');
{
  check(HINDERNIS2.on && GEN_V === 2 && HIND_TAG === '', 'Standard: Generator-Version 2, alle Elemente an');
  const ref = JSON.parse(fs.readFileSync(path.join(HERE, 'data/layout_hashes_n32.json'), 'utf8'));
  let b3 = 0, bg = 0, n = 0;
  for (const s of HASH_SEEDS.slice(0, 40)) for (const d of [1, 2, 3]) {
    n++;
    if (layoutHash(generate(s, d, { d3: true })) !== ref.d3[`${s}-${d}`]) b3++;
    if (layoutHash(generate(s, d, { gel: true })) !== ref.gel[`${s}-${d}`]) bg++;
  }
  check(!b3 && !bg, `Version 1 (ohne „h“) bitgleich main n32: 3D ${n - b3}/${n}, Gelände ${n - bg}/${n} (flach: test_alte_codes)`);
  const keys = [generate(4711, 2, { gv: 2 }).meta.key, generate(4711, 2, { gv: 2, d3: true }).meta.key, generate(4711, 2, { gv: 2, gel: true }).meta.key];
  check(keys.join(' ') === '4711-2-h 4711-2-3dh 4711-2-gh', `Codes der Version 2: ${keys.join(', ')}`);
  const cnt = {}, add = (t) => { cnt[t] = (cnt[t] || 0) + 1; };
  let occBad = 0, sbOk = 0, sbBad = 0;
  for (let s = 1; s <= 40; s++) for (const d of [1, 2, 3]) {
    const F = generate(s, d, { gv: 2 }), D3 = generate(s, d, { gv: 2, d3: true }), GL = generate(s, d, { gv: 2, gel: true });
    for (const [art, l] of [['flach', F], ['3d', D3], ['gel', GL]]) for (const p of l.pieces) if (/zigzag|tube_wall/.test(p.type) || p.type === 'spiral') add(`${art}:${p.type.replace('zigzag2', 'zigzag')}${p.type === 'spiral' ? '' : ':' + d}`);
    if (!checkOccupancy(D3.pieces).ok) occBad++;
    // flach: Hochstraße mit Spirale = [spiral|slope2 0→1] [bridge 1] [spiral|slope2 1→0], Felder höchstens einmal belegt
    const occ = new Set();
    for (const p of F.pieces) for (const c of pieceCells(p.type, p.i, p.j, p.d, p.m || 1).cells) { const k = c.join(','); if (occ.has(k)) occBad++; occ.add(k); }
    F.pieces.forEach((p, k) => {
      if (p.type !== 'bridge' || !F.pieces.slice(k - 1, k + 2).some((q) => q.type === 'spiral')) return;
      const a = F.pieces[k - 1], b = F.pieces[k + 1];
      if (a.lvl === 0 && a.h1 === 1 && p.lvl === 1 && b.lvl === 1 && b.h1 === 0) sbOk++; else sbBad++;
    });
  }
  check(!occBad, 'Version 2: Belegung gültig (flach jedes Feld einmal, 3D Kreuzungen)');
  check(sbOk >= 10 && !sbBad, `flach: Hochstraße mit Spirale ${sbOk}× (Spirale/Rampe hinauf → Brücke → hinunter)`);
  const need = ['flach:zigzag:1', 'flach:zigzag:2', 'flach:zigzag:3', 'flach:tube_wall:3', 'gel:zigzag:2', 'gel:tube_wall:3', '3d:zigzag:2', '3d:tube_wall:3', 'flach:spiral', '3d:spiral'];
  check(need.every((k) => cnt[k] > 0) && !cnt['flach:tube_wall:1'] && !cnt['gel:tube_wall:1'], `neue Elemente in allen Arten: ${need.map((k) => `${k} ${cnt[k] || 0}`).join(', ')}`);
  // Sanft: höchstens eine kurze Zickzack
  let sanftBad = 0;
  for (let s = 1; s <= 40; s++) for (const o of [{}, { gel: true }, { d3: true }]) { const P = generate(s, 1, { gv: 2, ...o }).pieces; if (P.some((p) => p.type === 'zigzag' || p.type === 'tube_wall') || P.filter((p) => p.type === 'zigzag2').length > 1) sanftBad++; }
  check(!sanftBad, 'Sanft: höchstens eine kurze Zickzack, keine Röhre mit Wand');
  const off = hindFilter(DIFFS2[3], { zickzack: false, roehrewand: false, spirale: false });
  check(!Object.keys(off.types).some((t) => /zigzag|tube_wall|sbridge/.test(t)) && !off.must.some((t) => /zigzag|tube_wall|sbridge/.test(t)) && off.must.includes('bridge'), 'Schalter je Element: ?zickzack=0 / ?roehrewand=0 / ?spirale2=0 nehmen sie aus Gewichten und Pflicht');
  const l1 = { pieces: [{ type: 'zigzag', i: 5, j: 5, d: 0, m: 1, lvl: 0 }, { type: 'tube_wall', i: 8, j: 5, d: 0, m: 1, lvl: 0 }] };
  defuse(l1, 1); defuse(l1, 0);
  check(l1.pieces.map((p) => p.type).join(',') === 'straight,straight,straight,tube', 'Entschärfen: Zickzack → Geraden, Röhre mit Wand → Röhre');
}

console.log('--- F: Kulissen ---');
{
  const { planHashes } = await import('../../tools/kulisse_plan_hash.mjs');
  const ref = JSON.parse(fs.readFileSync(path.join(HERE, 'data/deco_plan_n32.json'), 'utf8'));
  const now = await planHashes(ROOT + '/');
  const diff = Object.keys(ref).filter((k) => ref[k] !== now[k]);
  check(!diff.length && Object.keys(ref).length > 10, `Kulissen-Planung alter Codes bitgleich main n32 (${Object.keys(ref).length - diff.length}/${Object.keys(ref).length})${diff.length ? ' anders: ' + diff.slice(0, 3).join(', ') : ''}`);
  const { hindSpots } = await import('../../src/track/kulisse.js');
  const v = verifySync(generate(3194, 3, { gv: 2 })), sp = hindSpots(v.env.track).map((x) => x.kind);
  const v1 = verifySync(generate(4711, 3, { d3: true }));
  check(sp.includes('zickzack') && sp.includes('spirale') && !hindSpots(v1.env.track).length, `Zuschauer-Plätze an Zickzack und Spirale (Version 2: ${sp.join(', ')}), alte 3D-Strecke ohne neue Plätze`);
}

console.log('--- G: HUD, Highlights, Grafik, Menü ---');
{
  // Leicht: Ansagen; Mittel: Spurhilfe im Zickzack
  const hudTexts = (el, assist) => {
    const c = chain(3, 15, 0, ROW(el)), env = prepare({ pieces: c.pieces, seed: 1, closed: false });
    const r = new Race(env, { assist, countdown: 0.01 }), seen = new Set();
    for (let k = 0; k < 120 * 30 && r.state !== 'finished'; k++) {
      const ap = r.ap.control(r.car);
      r.step(DT, assist === 'medium' ? { steer: ap.steer, throttle: r.car.fwdSpeed() < env.prof.vt[r.ap.tr.idx] ? 1 : 0, brake: 0 } : { steer: 0, throttle: 1, brake: 0 });
      r.events.length = 0;
      if (r.hud && r.hud.text) seen.add(r.hud.text);
    }
    return [...seen];
  };
  const z = hudTexts('zigzag', 'easy'), w = hudTexts('tube_wall', 'easy'), zm = hudTexts('zigzag', 'medium'), wm = hudTexts('tube_wall', 'medium');
  check(z.includes('Zickzack – Autopilot lenkt') && z.includes('Zickzack voraus – Autopilot lenkt'), `Leicht Zickzack: ${z.filter((t) => /Zick/.test(t)).join(' | ')}`);
  check(w.includes('Röhre – Wand! – Überkopf – Autopilot lenkt'), `Leicht Röhre: ${w.filter((t) => /Röhre/.test(t)).join(' | ')}`);
  check(zm.some((t) => /^Zickzack – Spurhilfe/.test(t)) && wm.some((t) => /^Röhre – Wand! – Überkopf – Spurhilfe/.test(t)), `Mittel: ${[...zm, ...wm].filter((t) => /Spurhilfe/.test(t)).join(' | ')}`);
  // Highlights: Leicht-Fahrt über eine Strecke mit Zickzack und Röhre mit Wand
  const { runRace, marksOf } = await import('../../tools/kinoreplay_probe.mjs');
  const { findMoments } = await import('../../src/game/highlights.js');
  const v = verifySync(generate(3194, 3, { gv: 2 })), race = runRace(v.env, { assist: 'easy', fahrstil: 'sauber' });
  const kinds = new Set(findMoments(race.rec, v.env, marksOf(race)).cands.map((m) => m.kind));
  check(race.state === 'finished' && kinds.has('tubewall') && kinds.has('zigzag'), `Highlights: ${[...kinds].filter((k) => /tube|zig|spiral/.test(k)).join(', ')}`);
  // Warnstreifen-Grafik (three.js in Node, Canvas-Attrappe)
  await import('./three_haken.mjs');
  const g2 = new Proxy({}, { get: (t, k) => (k === 'canvas' ? {} : () => {}), set: () => true });
  globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => g2 }) };
  const { buildJumpMarks } = await import('../../src/gfx/jumpdeck.js');
  const ez = envOf('zigzag'), ew = envOf('tube_wall');
  const mz = buildJumpMarks(ez.track), mw = buildJumpMarks(ew.track);
  check(mz && mz.geometry.index.count >= 2 * ZIGZAG.n * 6 && mw && mw.geometry.index.count >= 3 * 15, `Warnstreifen als Dreiecke (Zickzack ${mz && mz.geometry.index.count / 3}, Wand ${mw && mw.geometry.index.count / 3})`);
  // Menü-Hinweis einmal für bisherige Spieler, nicht für neue; Bestzeiten bleiben
  mem.clear();
  mem.set('stuntbahn.v1', JSON.stringify({ settings: {}, reset: 21, medReset: 24, stuntReset: 26, tubeReset: 29, best: { '4711-3|original+reset@x': { time: 50 } } }));
  let S = new Store();
  const first = S.hindNote; S = new Store();
  mem.clear(); const S0 = new Store();
  check(first === 1 && !S.hindNote && S.best['4711-3|original+reset@x'] && !S0.hindNote, 'Menü-Hinweis einmal (bisherige Spieler), Bestzeiten bleiben, neu installiert ohne Hinweis');
  check(abMode('?hindernis2=0') && abMode('?zickzack=0') && abMode('?roehrewand=0') && abMode('?spirale2=0') && !abMode('?hindernis2=1'), 'A/B-Regler werten nicht');
  const ui = fs.readFileSync(path.join(ROOT, 'src/ui/ui.js'), 'utf8');
  const rx = new RegExp(/const m = \/(.+)\/i\.exec\(c\)/.exec(ui)[1], 'i');
  const P = (c) => { const m = rx.exec(c); return m ? [m[1], m[2], m[3] || '', m[4] ? 'h' : ''].join('|') : null; };
  check(P('4711-2-gh') === '4711|2|g|h' && P('4711-2-3dh') === '4711|2|3d|h' && P('4711-2-h') === '4711|2||h' && P('4711-2-g') === '4711|2|g|' && P('4711-2') === '4711|2||' && P('4711') === '4711|||', 'Code-Eingabe: 4711-2-gh / -3dh / -h (Version 2), ohne „h“ Version 1');
}

console.log(fails ? `FEHLER: ${fails}` : 'Hindernisse n33: alle Prüfungen grün');
process.exit(fails ? 1 : 0);
