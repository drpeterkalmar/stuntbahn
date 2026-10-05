// n25 Leicht „Brachial“: Autopilot auf Leicht driftet am Limit.
// - Option „Autopilot-Fahrstil“: Standard Brachial im Speicher, Umschalten bleibt gespeichert, alte Profile bekommen den
//   Standard; Race ohne Angabe = Sauber (Node-Werkzeuge), Brachial wirkt nur auf Leicht und nicht in der Prüffahrt
// - Profil: Brachial schneller als Sauber, vor Stunts gleich vorsichtig (resPre)
// - Drift-Stellen nie in Looping/Röhre/Schanze/Steilkurve/Stunt-Baustein
// - Regression mit festem Seed (8 Strecken flach/Gelände/3D/Sammlung): alle im Ziel, keine Crashs, Driftanteil in Kurven,
//   Drifts je Runde, größter Winkel, Rundenzeit gegen Sauber
// - Physik: ohne Drift-Hilfen Bit für Bit wie bisher (Mittel/Original), Drift-Regler hält den Soll-Winkel auf der Ebene
// - Kino-Replay: Drift-Momente (Art „drift“/„spin“) in einer Brachial-Fahrt
const mem = new Map();
globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k), get length() { return mem.size; }, key: (i) => [...mem.keys()][i] };
const { Store } = await import('../../src/game/store.js');
const { Race, ASSISTS } = await import('../../src/game/race.js');
const { BRACHIAL, planDrifts } = await import('../../src/ai/drift.js');
const { Car, CAR_DEF } = await import('../../src/physics/car.js');
const { MAT } = await import('../../src/track/defs.js');
const { findMoments } = await import('../../src/game/highlights.js');
const { driftTracks, measureLap } = await import('../../tools/drift_mess.mjs');
const { verifySync } = await import('../../src/track/verify.js');
const { generate } = await import('../../src/track/generator.js');
const { highLine, brachialProfile } = await import('../../src/game/race.js');

let ok = true;
const expect = (c, m) => { console.log((c ? 'OK   ' : 'FAIL ') + m); ok = ok && !!c; };

// ---------- Option ----------
{
  let S = new Store();
  expect(S.settings.fahrstil === 'brachial', 'neues Profil: Fahrstil Brachial');
  S.settings.fahrstil = 'sauber'; S.save();
  S = new Store();
  expect(S.settings.fahrstil === 'sauber', 'Umschalten auf Sauber bleibt gespeichert');
  mem.set('stuntbahn.v1', JSON.stringify({ settings: { assist: 'easy', paint: 1 } }));
  S = new Store();
  expect(S.settings.fahrstil === 'brachial' && S.settings.assist === 'easy', 'altes Profil ohne Fahrstil → Brachial, übrige Einstellungen bleiben');
}

// ---------- Rennlogik: wo wirkt Brachial ----------
const v0 = verifySync(generate(4711, 2));
{
  const st = (o) => { const r = new Race(v0.env, { countdown: 0.05, ...o }); for (let i = 0; i < 400; i++) r.step(1 / 120, { steer: 0, throttle: 0, brake: 0 }); return r; };
  expect(st({ assist: 'easy' }).brachial === false, 'Race ohne Angabe: Sauber (Node-Werkzeuge wie bisher)');
  expect(st({ assist: 'easy', fahrstil: 'brachial' }).brachial === true, 'Leicht + Brachial: aktiv');
  const m = st({ assist: 'medium', fahrstil: 'brachial' }), o = st({ assist: 'original', fahrstil: 'brachial', autopilot: true });
  expect(!m.brachial && !o.brachial && m.car.assist.drift == null && o.car.assist.drift == null, 'Mittel und Prüffahrt (Original-Autopilot): kein Brachial, keine Drift-Physik');
  const r = st({ assist: 'easy', fahrstil: 'brachial' });
  r.setAssist('medium'); r.step(1 / 120, { steer: 0, throttle: 0, brake: 0 });
  expect(!r.brachial && r.ap.P === v0.env.prof && r.car.assist.drift == null && r.ap.extra === 0, 'Umschalten auf Mittel im Rennen: Sauber-Profil, Drift-Physik aus');
}

// ---------- Spieler übernimmt (deutlich weg von der Linie lenken) → Sauber-Tempo ----------
{
  const r = new Race(v0.env, { assist: 'easy', countdown: 0.05, fahrstil: 'brachial', seed: 1 });
  for (let i = 0; i < 600; i++) r.step(1 / 120, { steer: 0, throttle: 0, brake: 0 });
  let took = false, prof = false;
  for (let i = 0; i < 480; i++) { r.step(1 / 120, { steer: 1, throttle: 0, brake: 0 }); if (r.own > 0.9) { took = true; if (r.ap.P === v0.env.prof) prof = true; } }
  expect(took && prof, 'Spieler lenkt deutlich weg → Übernahme, dann Sauber-Tempo');
}

// ---------- Profil ----------
{
  const P = v0.env.prof, B = brachialProfile(v0.env), L = v0.env.ideal;
  let faster = 0, slower = 0, n = 0;
  for (let i = 0; i < L.n; i++) { if (L.air[i]) continue; n++; if (B.vt[i] > P.vt[i] + 0.5) faster++; if (B.vt[i] < P.vt[i] - 0.5) slower++; }
  expect(faster > n * 0.3 && slower < n * 0.02, `Brachial-Profil schneller (${(faster / n * 100).toFixed(0)} % der Punkte schneller, ${slower} langsamer)`);
}

// ---------- Drift-Stellen ----------
{
  let bad = 0, segs = 0;
  for (const [s, d, o] of [[4711, 3, {}], [42, 3, {}], [31, 3, { gel: true }], [1234, 2, { d3: true }]]) {
    const v = verifySync(generate(s, d, o)), T = v.env.track, L = T.line, P = brachialProfile(v.env);
    const S = planDrifts(v.env.ideal, P, T, highLine(T), v.env.world);
    segs += S.length;
    for (const g of S) for (let i = g.i0; i <= g.i1; i++) {
      const pc = T.pieces[L.piece[i]];
      if (L.air[i] || L.loop[i] || L.tube[i] || Math.abs(L.by[i]) > 0.12 || (pc && pc.stunt) || T.jumps.some((j) => i >= j.lipIdx - 30 && i <= (j.endIdx ?? j.landIdx + 12))) bad++;
    }
  }
  expect(segs > 20 && bad === 0, `Drift-Stellen: ${segs} auf 4 Strecken, keine in Looping/Röhre/Schanze/Steilkurve/Stunt-Baustein (${bad})`);
}

// ---------- Physik ----------
{
  const PLANE = { ray(ox, oy, oz, dx, dy, dz, len) { if (dy >= -1e-9) return null; const t = -oy / dy; if (t < 0 || t > len) return null; return { t, x: ox + dx * t, y: 0, z: oz + dz * t, nx: 0, ny: 1, nz: 0, mat: MAT.ROAD }; } };
  const run = (assist, n = 600) => {
    const c = new Car(CAR_DEF); c.assist = { magnet: 1, air: 1, grip: 1, ...assist }; c.place([0, 0, 0], [0, 0, -1], [0, 1, 0], 20);
    for (let k = 0; k < n; k++) { c.input.steer = k > 60 ? -0.6 : 0; c.input.throttle = 0.5; c.step(1 / 120, PLANE); }
    return c;
  };
  const a = run({}), b = run({ drift: null, lock: 0, rearGrip: 0, driveFront: null });
  expect(a.pos.x === b.pos.x && a.pos.z === b.pos.z && a.w.y === b.w.y, 'ohne Drift-Hilfen bitgleich (drift null, lock 0, rearGrip 0, driveFront null)');
  // Drift-Regler auf der Ebene: Soll 25° wird nach 1 s gehalten (± 6°)
  const c = new Car(CAR_DEF); c.assist = { magnet: 1, air: 0, grip: 1, drift: 25 * Math.PI / 180, lock: 0.62, rearGrip: 0.9, driveFront: 0.3 };
  c.place([0, 0, 0], [0, 0, -1], [0, 1, 0], 22);
  let bs = [];
  for (let k = 0; k < 360; k++) {
    const F = c.frame, vf = c.v.x * F.f.x + c.v.z * F.f.z, vr = c.v.x * F.r.x + c.v.z * F.r.z, yaw = c.w.y;
    c.input.steer = Math.max(-1, Math.min(1, Math.atan2(vr - 1.36 * yaw, vf) / 0.62)); c.input.throttle = Math.max(0, Math.min(1, 0.4 + (22 - Math.hypot(vf, vr)) * 0.5));
    c.step(1 / 120, PLANE);
    if (k > 120) bs.push(Math.atan2(vr, vf) * 180 / Math.PI);
  }
  const avg = bs.reduce((x, y) => x + y, 0) / bs.length;
  expect(Math.abs(avg - 25) < 6 && Math.max(...bs) < 40, `Drift-Regler hält den Winkel (Soll 25°, Ø ${avg.toFixed(1)}°, max ${Math.max(...bs).toFixed(1)}°)`);
}

// ---------- Regression mit festem Seed ----------
{
  const list = await driftTracks();
  const pick = ['4711-2', '20260927-3', '42-1', '31-3-g', '88-2-g', '20260930-2-3d', 'sam-032', 'sam-198'];
  const rows = [];
  for (const nm of pick) {
    const [, mk] = list.find(([n]) => n === nm);
    const v = verifySync(mk());
    const s = measureLap(v.env, 'sauber', { mods: { Race }, seed: 11 }), b = measureLap(v.env, 'brachial', { mods: { Race }, seed: 11 });
    rows.push({ nm, s, b });
    console.log(`     ${nm.padEnd(14)} Sauber ${s.time?.toFixed(1)} s · Brachial ${b.time?.toFixed(1)} s, Crashs ${b.crashes}, Drifts ${b.drifts}, Kurve > 10° ${(b.curve10 / Math.max(1e-6, b.curve) * 100).toFixed(0)} %, max ${b.bmax.toFixed(0)}°`);
  }
  expect(rows.every((r) => r.b.ok && r.s.ok), 'alle 8 Strecken im Ziel (Sauber und Brachial)');
  expect(rows.reduce((a, r) => a + r.b.crashes, 0) <= 1, `Crashs Brachial: ${rows.reduce((a, r) => a + r.b.crashes, 0)} in 8 Runden (≤ 1)`);
  const curve = rows.reduce((a, r) => a + r.b.curve, 0), c10 = rows.reduce((a, r) => a + r.b.curve10, 0);
  expect(c10 / curve >= 0.22, `Driftanteil der Kurvenzeit (> 10°): ${(c10 / curve * 100).toFixed(1)} % (≥ 22 %)`);
  const dr = rows.reduce((a, r) => a + r.b.drifts, 0) / rows.length;
  expect(dr >= 3, `Drifts je Runde: ${dr.toFixed(1)} (≥ 3)`);
  const bmax = Math.max(...rows.map((r) => r.b.bmax));
  expect(bmax >= 30 && bmax < 80, `größter Winkel ${bmax.toFixed(0)}° (30 … 80°)`);
  const ts = rows.reduce((a, r) => a + r.s.time, 0), tb = rows.reduce((a, r) => a + r.b.time, 0);
  expect(tb <= ts * 1.08, `Rundenzeit Brachial gegen Sauber: ${((tb / ts - 1) * 100).toFixed(1)} % (≤ +8 %)`);
  expect(rows.every((r) => r.s.drifts === 0), 'Sauber driftet nicht (wie bisher)');
}

// ---------- Kino-Replay ----------
{
  const r = new Race(v0.env, { assist: 'easy', countdown: 0.05, fahrstil: 'brachial', seed: 7, autoExtras: true });
  for (let t = 0; t < 200 && r.state !== 'finished'; t += 1 / 120) { r.step(1 / 120, { steer: 0, throttle: 0, brake: 0 }); r.events.length = 0; }
  const { cands } = findMoments(r.rec, v0.env, { cuts: r.cuts, pens: r.pens, xev: r.xev, crashes: r.crashLog });
  const d = cands.filter((m) => m.kind === 'drift' || m.kind === 'spin');
  expect(d.length >= 1 && d.every((m) => /Drift|Beinahe-Dreher/.test(m.label)), `Kino-Replay erkennt Drifts: ${d.map((m) => m.label).join(' | ')}`);
}

console.log(ok ? 'Drift n25: alle Prüfungen grün' : 'FEHLER');
process.exit(ok ? 0 : 1);
