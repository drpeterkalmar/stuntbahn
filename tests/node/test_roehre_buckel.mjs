// n29 Röhre mit Hindernis (Peter 05.10.2026: „Röhre hat normalerweise ein Hindernis in der Mitte am Boden“):
//   A  Buckel in der generierten Röhre: mittig (f = T), Höhe/Länge, Profil, Linie markiert (flach, 3D, Gelände)
//   B  Tempo-Profil bremst vor dem Buckel nicht (Kuppen-/Lastgrenze aus)
//   C  festes Tempo 80 / 150 / 220 km/h: spürbarer Hüpfer, kein Deckentreffer, kein Überschlag, kein Crash
//   D  Autopilot (Prüffahrt) fährt drüber ohne Reset, Zufallsstrecke mit Röhre ohne Entschärfen
//   E  ?roehre=glatt (setTubeHump on: false) baut bitgleich wie bis n28; .TRK „Röhre mit Hindernis“ bleibt bitgleich
//   F  Bestzeiten der Zufallsstrecken einmalig neu (Hinweis), A/B wertet nicht; HUD „Röhre – Buckel!“
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
const mem = new Map();
globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k), get length() { return mem.size; }, key: (i) => [...mem.keys()][i] };
const HERE = path.dirname(fileURLToPath(import.meta.url)), ROOT = path.resolve(HERE, '../..');
const { TILE, TUBE_OBST, TUBE_TAG } = await import('../../src/track/defs.js');
const { tubeGeom, TUBE_HUMP, TUBE_HUMP_TRK, setTubeHump, humpY } = await import('../../src/track/pieces.js');
const { buildTrack } = await import('../../src/track/build.js');
const { generate } = await import('../../src/track/generator.js');
const { verifySync, prepare } = await import('../../src/track/verify.js');
const { Race } = await import('../../src/game/race.js');
const { Store, abMode } = await import('../../src/game/store.js');
const { parseTrk, TRK_BYTES } = await import('../../src/track/trk.js');
const { trkToLayout } = await import('../../src/track/trkimport.js');
const { tracksOf } = await import('../../src/game/sammlung.js');
const { Car } = await import('../../src/physics/car.js');
const { Autopilot } = await import('../../src/ai/autopilot.js');
const { humpWatch } = await import('../../tools/roehre_mess.mjs');
const { chain, setup, drive } = await import('./common.mjs');

let fails = 0;
const check = (ok, msg) => { console.log(`${ok ? 'OK  ' : 'FAIL'} ${msg}`); if (!ok) fails++; };
const f2 = (x) => x.toFixed(2).replace('.', ',');
const DT = 1 / 120;
const FLAT = ['start', 'straight', 'straight', 'straight', 'straight', 'tube', 'straight', 'straight', 'straight'];

console.log('--- A: Buckel mittig in der Röhre ---');
check(TUBE_OBST && TUBE_TAG === '' && TUBE_HUMP.on, 'Standard: Röhre mit Buckel (TUBE_OBST, kein Cache-Zusatz)');
check(TUBE_HUMP.h === 0.45 && TUBE_HUMP.len === 16 && TUBE_HUMP_TRK.h === 0.95 && TUBE_HUMP_TRK.len === 12, `Buckel ${f2(TUBE_HUMP.h)} m hoch, ${TUBE_HUMP.len} m lang (.TRK bleibt ${f2(TUBE_HUMP_TRK.h)} / ${TUBE_HUMP_TRK.len} m)`);
{
  const c = chain(5, 15, 0, FLAT), env = setup({ pieces: c.pieces, seed: 1 }), t = env.track, L = t.line, h = t.humps[0];
  const floor = L.py[h.idx0 - 1], crest = L.py[h.idxC];
  let w4 = 0, tubeGap = false;
  for (let i = h.idx0; i <= h.idx1; i++) { if (L.wave[i] === 4) w4++; if (!L.tube[i]) tubeGap = true; }
  const pi = t.pieces[h.piece];
  check(t.humps.length === 1 && t.pieces[h.piece].type === 'tube' && h.c === TILE && Math.abs(h.f1 - h.f0 - 16) < 1e-9, `ein Buckel, mittig im 2-Feld-Stück (c = ${h.c} m = T, ${h.f0} … ${h.f1} m)`);
  check(Math.abs(crest - floor - 0.45) < 0.01 && Math.abs(L.py[h.idx1] - floor) < 0.005, `Scheitel ${f2(crest - floor)} m über dem Röhrenboden, davor/dahinter eben`);
  check(w4 >= h.idx1 - h.idx0 && !tubeGap && L.tube[pi.lineStart + 3] && L.tube[pi.lineEnd - 3], `Linie über dem Buckel als Röhre markiert, Buckel-Kennung (wave 4) auf ${w4} Punkten`);
  check(Math.abs(humpY(TILE, TILE) - 0.45) < 1e-12 && humpY(TILE - 8, TILE) === 0 && humpY(TILE + 8.01, TILE) === 0, 'Form humpY (sin²) gemeinsam mit .TRK');
  // Kollision: Decke über dem Buckel (Mantel ohne Boden), Boden = Buckel
  const tg = tubeGeom(t.stuntScale), x = L.px[h.idxC], z = L.pz[h.idxC];
  const up = { ...env.world.ray(x, crest + 0.5, z, 0, 1, 0, 30, true) }, down = { ...env.world.ray(x, crest + 0.5, z, 0, -1, 0, 3, true) };   // (ray liefert ein wiederverwendetes Objekt)
  check(up.t != null && Math.abs(crest + 0.5 + up.t - (floor + 2 * tg.R)) < 0.05 && down.t != null && Math.abs(down.t - 0.5) < 0.02, `über dem Buckel Decke auf ${f2(floor + 2 * tg.R - floor)} m (2R), darunter die Buckel-Fahrbahn`);
  // 3D (Ebene 1) und Gelände: jede Röhre hat ihren Buckel
  const d3 = chain(5, 15, 0, ['start', 'rampUp', 'tube', 'straight', 'rampDown', 'straight']);
  const t3 = buildTrack({ pieces: d3.pieces, seed: 1 }, { treeCount: 0 });
  check(t3.humps.length === 1 && Math.abs(t3.line.py[t3.humps[0].idxC] - t3.line.py[t3.humps[0].idx0 - 1] - 0.45) < 0.01, '3D: Röhre auf Ebene 1 mit Buckel');
  let nG = 0, okG = 0;
  for (const [s, d, o] of [[31, 3, { gel: true }], [123, 3, { gel: true }], [5, 3, { d3: true }], [4711, 3, {}]]) {
    const lay = generate(s, d, o), tt = buildTrack(lay, { treeCount: 0 }), nt = lay.pieces.filter((p) => p.type === 'tube').length;
    nG += nt; if (tt.humps.length === nt && tt.humps.every((q) => Math.abs(tt.line.py[q.idxC] - tt.line.py[q.idx0 - 1] - 0.45) < 0.01)) okG += nt;
  }
  check(nG > 0 && okG === nG, `Zufallsstrecken (flach, Gelände, 3D): ${okG}/${nG} Röhren mit Buckel`);

  console.log('--- B: Tempo-Profil ---');
  const vt = env.prof.vt;
  let vMin = 1e9; for (let i = h.idx0 - 20; i <= h.idx1 + 20; i++) vMin = Math.min(vMin, vt[i]);
  check(vMin >= vt[pi.lineStart] * 0.95, `Ziel-Tempo am Buckel ${(vMin * 3.6).toFixed(0)} km/h (Röhren-Einfahrt ${(vt[pi.lineStart] * 3.6).toFixed(0)}) – kein Bremsen vor dem Buckel`);

  console.log('--- C: festes Tempo über den Buckel ---');
  const { world, ideal: LI, prof } = env;
  for (const kmh of [80, 150, 220]) {
    const v = kmh / 3.6, car = new Car();
    let si = h.idx0; while (si > 0 && LI.s[h.idx0] - LI.s[si] < 60) si--;
    car.place([LI.px[si], LI.py[si], LI.pz[si]], [LI.tx[si], LI.ty[si], LI.tz[si]], [LI.nx[si], LI.ny[si], LI.nz[si]], v);
    const ap = new Autopilot(LI, prof); ap.tr.reset(si);
    const W = humpWatch(t, 2 * tg.R);
    let tt = 0;
    while (tt < 8 && !W.out.length && !car.crash) {
      const u = ap.control(car), fv = car.fwdSpeed();
      car.input.steer = u.steer; car.input.throttle = fv < v ? 1 : 0; car.input.brake = fv > v + 1.5 ? 0.4 : 0;
      car.surfaceKind = LI.loop[ap.tr.idx] || LI.tube[ap.tr.idx] ? 1 : 0; car.haftOff = false;
      car.step(DT, world); tt += DT; W.step(car, ap.tr.idx, 0, tt);
    }
    const r = W.out[0];
    const lo = kmh <= 80 ? 0.15 : 0.5, hi = 2.5;
    check(r && !car.crash && !r.crash && r.maxH >= lo && r.maxH <= hi && r.ceilMin > 3 && r.upMin > 0.9,
      `${kmh} km/h: Luft ${r ? f2(r.air) : '–'} s, ${r ? f2(r.maxH) : '–'} m hoch (Ziel ${f2(lo)}–${f2(hi)}), ${r ? r.dist.toFixed(0) : '–'} m weit, Dach ≥ ${r ? f2(r.ceilMin) : '–'} m unter der Decke, Lage ≥ ${r ? f2(r.upMin) : '–'}${car.crash ? ' CRASH ' + car.crash.reason : ''}`);
  }

  console.log('--- D: Autopilot ---');
  const rd = drive(env, { maxTime: 60 });
  check(!rd.crash && rd.idx >= L.n - 4, `Autopilot (Original, Profil) fährt Gerade → Röhre mit Buckel → Gerade ohne Reset (${rd.t.toFixed(1)} s, max ${(rd.maxSp * 3.6).toFixed(0)} km/h)`);
}
{
  let ok = 0, keep = 0, tubes = 0;
  const S = [[4711, 3, {}], [31, 3, { gel: true }], [5, 3, { d3: true }], [9, 3, {}]];
  for (const [s, d, o] of S) {
    const lay = generate(s, d, o), n0 = lay.pieces.filter((p) => p.type === 'tube').length, v = verifySync(lay);
    tubes += n0; if (v.ok && !v.fixes) ok++; keep += v.layout.pieces.filter((p) => p.type === 'tube').length;
  }
  check(ok === S.length && keep === tubes, `Prüffahrt ${ok}/${S.length} Zufallsstrecken mit Röhre ohne Entschärfen, ${keep}/${tubes} Röhren bleiben`);
}

console.log('--- E: ?roehre=glatt und .TRK ---');
{
  // Hashes der glatten Röhre mit dem Stand bis n28 (Build 9dabda4, Werkzeug wie hier) – Linie, Grafik, Kollision
  const REF = { flat: '94d41710b401840b', d3: '07a999e51388bafa', g: '876e101ef930ae07' };
  const hash = (t) => { const H = crypto.createHash('sha1'); const L = t.line; for (const k of ['px', 'py', 'pz', 'tx', 'ty', 'tz', 'nx', 'ny', 'nz', 'lo', 'hi', 'tube', 'wave']) H.update(Buffer.from(L[k].buffer)); for (const b of t.batches) { H.update(b.mat + '|' + b.chunk); H.update(Buffer.from(b.pos.buffer)); H.update(Buffer.from(b.idx.buffer)); } H.update(Buffer.from(t.col.pos.buffer)); return H.digest('hex').slice(0, 16); };
  const flat = chain(5, 15, 0, ['start', 'straight', 'tube', 'straight', 'straight']);
  const d3 = chain(5, 15, 0, ['start', 'rampUp', 'tube', 'straight', 'rampDown', 'straight']);
  const mk = () => ({ flat: hash(buildTrack({ pieces: flat.pieces, seed: 1 }, { treeCount: 0 })), d3: hash(buildTrack({ pieces: d3.pieces, seed: 1 }, { treeCount: 0 })), g: hash(buildTrack(generate(31, 3, { gel: true }), { treeCount: 0 })) });
  const withHump = mk();
  setTubeHump({ on: false });
  const glatt = mk(), tg = buildTrack({ pieces: flat.pieces, seed: 1 }, { treeCount: 0 });
  setTubeHump({ on: true });
  check(JSON.stringify(glatt) === JSON.stringify(REF) && !tg.humps.length, `?roehre=glatt baut bitgleich wie bis n28 (flach, 3D, Gelände: ${Object.values(glatt).join(' ')})`);
  check(Object.keys(REF).every((k) => withHump[k] !== REF[k]), 'mit Buckel ändert sich nur die Geometrie (Hashes anders)');
  // .TRK „Röhre mit Hindernis“ (pobst) aus der Sammlung: Form wie bis n28 (Hash über 12 Strecken), Buckel 0,95 m
  const meta = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/sammlung.json'), 'utf8'));
  const bin = new Uint8Array(fs.readFileSync(path.join(ROOT, 'assets/sammlung.bin')));
  const T = tracksOf(meta), H = crypto.createHash('sha1');
  let n = 0, hOk = 0;
  for (let k = 0; k < T.length && n < 12; k++) {
    const { layout } = trkToLayout(parseTrk(bin.subarray(k * TRK_BYTES, (k + 1) * TRK_BYTES), T[k].id + '.trk'));
    if (!layout.pieces.some((p) => p.obst)) continue;
    n++;
    const t = buildTrack(layout, { treeCount: 0 }), L = t.line;
    for (const q of ['px', 'py', 'pz', 'lo', 'hi', 'tube', 'wave']) H.update(Buffer.from(L[q].buffer));
    for (const b of t.batches) { H.update(b.mat + '|' + b.chunk); H.update(Buffer.from(b.pos.buffer)); H.update(Buffer.from(b.idx.buffer)); }
    H.update(Buffer.from(t.col.pos.buffer));
    if (t.humps.length && t.humps.every((q) => q.h === 0.95 && q.len === 12 && Math.abs(L.py[q.idxC] - L.py[q.idx0] - 0.95) < 0.03)) hOk++;
  }
  const hs = H.digest('hex').slice(0, 16);
  check(hs === '6cd15925af440a5d' && hOk === n, `.TRK-Röhren mit Hindernis (Sammlung, ${n} Strecken) bitgleich wie bis n28 (${hs}), Buckel 0,95 m / 12 m`);
}

console.log('--- F: Bestzeiten, A/B, HUD ---');
{
  mem.clear();
  mem.set('stuntbahn.v1', JSON.stringify({ settings: {}, reset: 21, medReset: 24, stuntReset: 26, best: { '4711-3|original+reset@x': { time: 50 }, '4711-3-g|medium+reset@x': { time: 60 }, 'sam-012|original+reset@x': { time: 70 }, 'trk-abc|medium+reset@x': { time: 80 }, 'demo-rundkurs|original+reset@x': { time: 90 } }, ghostIndex: ['4711-3|original+reset@x', 'sam-012|original+reset@x'] }));
  mem.set('stuntbahn.ghost.4711-3|original+reset@x', 'AAAA'); mem.set('stuntbahn.ghost.sam-012|original+reset@x', 'BBBB');
  let S = new Store();
  check(Object.keys(S.best).sort().join(',') === 'demo-rundkurs|original+reset@x,sam-012|original+reset@x,trk-abc|medium+reset@x' && !mem.has('stuntbahn.ghost.4711-3|original+reset@x') && mem.has('stuntbahn.ghost.sam-012|original+reset@x') && S.tubeNote === 2 && !S.stuntNote,
    `Zufallsstrecken: Bestzeiten + Geister einmalig gelöscht (${S.tubeNote}), Sammlung/.TRK/Beispiel bleiben; Hinweis im Menü`);
  S.best['4711-3|original+reset@x'] = { time: 49 }; S.save();
  S = new Store();
  check(S.best['4711-3|original+reset@x'] && !S.tubeNote, 'zweites Laden löscht nichts mehr');
  check(abMode('?roehre=glatt') && !abMode('?roehre=') && !abMode('?seed=4711'), '?roehre=glatt wertet nicht (A/B)');
  const ui = fs.readFileSync(path.join(ROOT, 'src/ui/ui.js'), 'utf8'), mj = fs.readFileSync(path.join(ROOT, 'src/main.js'), 'utf8');
  check(/tubeNote/.test(ui) && /Buckel/.test(ui) && /TUBE_TAG/.test(mj), 'Hinweis-Toast im Menü, Prüf-Cache mit TUBE_TAG (glatte Röhre getrennt)');
  // Leicht: HUD-Ansage vor dem Buckel
  const c = chain(5, 15, 0, FLAT), env = prepare({ pieces: c.pieces, seed: 1, closed: false });
  const r = new Race(env, { assist: 'easy', countdown: 0.01 });
  let txt = null, seenTube = false;
  for (let k = 0; k < 120 * 25 && !txt && r.state !== 'finished'; k++) {
    r.step(DT, { steer: 0, throttle: 1, brake: 0 }); r.events.length = 0;
    if (r.hud && /Röhre/.test(r.hud.text)) seenTube = true;
    if (r.hud && /Buckel!/.test(r.hud.text)) txt = r.hud.text;
  }
  check(seenTube && txt === 'Röhre – Buckel! – Autopilot lenkt', `Leicht: Ansage „${txt}“`);
}

console.log(fails ? `FEHLER: ${fails}` : 'Röhre mit Buckel: alle Prüfungen grün');
process.exit(fails ? 1 : 0);
