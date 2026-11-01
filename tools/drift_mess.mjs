// n25 Leicht „Brachial“: Autopilot auf Leicht (Hände weg) je Fahrstil messen – Sauber (bis n24) gegen Brachial.
// Strecken: Zufall flach (Sanft/Sportlich/Irre), Gelände, 3D, Sammlung (deterministisch gewählt). Je Strecke eine Runde.
// Kennzahlen: Ziel, Rundenzeit, Crashs/Resets je 10 Runden (Gründe), Anteil Fahrzeit mit Schwimmwinkel > 10° / > 25°
// (am Boden, ab 8 m/s), Anteil der Kurvenzeit (Plan-Querbeschleunigung ≥ 5 m/s², keine Stunts) mit > 10°, Drifts je Runde
// (> 12° mindestens 0,4 s), größter Schwimmwinkel, Beinahe-Dreher (≥ 60°, wieder eingefangen), Lippen-Tempo und Landungen
// an Standard-Schanzen (ok / weit / kurz / Crash), Zeit mit Rädern im Gras.
// Aufruf: node tools/drift_mess.mjs [--stil=sauber,brachial] [--n=42] [--von=0] [--json=datei] [--seed=n] [--set=k:v,…]
//         Teilläufe (Zeitlimit): --von=0 --n=14, dann --von=14 … ; --sum=a.json,b.json fasst Teilläufe zusammen
import fs from 'fs'; import path from 'path'; import url from 'url';
const HERE = path.dirname(url.fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const imp = (p) => import(url.pathToFileURL(path.join(ROOT, p)).href);
const arg = (k, d) => { const a = process.argv.find((s) => s.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const DT = 1 / 120;

// Streckenliste (Name, Layout-Fabrik) – fest, damit vorher/nachher dieselben Strecken laufen
export async function driftTracks() {
  const { generate } = await imp('src/track/generator.js');
  const { parseTrk } = await imp('src/track/trk.js');
  const { trkToLayout } = await imp('src/track/trkimport.js');
  const { tracksOf } = await imp('src/game/sammlung.js');
  const list = [];
  for (const s of [4711, 20260927, 42, 777, 555, 9]) for (const d of [1, 2, 3]) if (list.length < 16) list.push([`${s}-${d}`, () => generate(s, d)]);
  for (const s of [4711, 20261001, 31, 88, 123, 5150, 64, 2718]) list.push([`${s}-${2 + (s % 2)}-g`, () => generate(s, 2 + (s % 2), { gel: true })]);
  for (const s of [20260930, 4711, 1234, 2026, 99, 3141]) list.push([`${s}-${1 + (s % 3)}-3d`, () => generate(s, 1 + (s % 3), { d3: true })]);
  const jf = path.join(ROOT, 'assets/sammlung.json'), bf = path.join(ROOT, 'assets/sammlung.bin');
  if (fs.existsSync(jf)) {
    const T = tracksOf(JSON.parse(fs.readFileSync(jf, 'utf8'))), bin = new Uint8Array(fs.readFileSync(bf));
    for (let q = 0; q < 12; q++) {
      const k = Math.floor((q + 0.5) * T.length / 12), t = T[k];
      list.push([t.id, () => { const L = trkToLayout(parseTrk(bin.subarray(k * 1802, (k + 1) * 1802), t.id)).layout; L.meta.key = t.id; return L; }]);
    }
  }
  return list;
}

// Eine Runde Leicht, Hände weg; liefert Kennzahlen
export function measureLap(env, stil, opt = {}) {
  const { Race } = opt.mods;
  const race = new Race(env, { assist: 'easy', countdown: 0.5, fahrstil: stil, extras: opt.extras ?? true, autoExtras: opt.autoExtras ?? true, seed: opt.seed });
  const L = env.track.line, P = env.prof, car = race.car;
  const zero = { steer: 0, throttle: 0, brake: 0 };
  const lim = Math.max(120, L.total / 6);
  const M = { t: 0, drive: 0, b10: 0, b25: 0, curve: 0, curve10: 0, curve25: 0, drifts: 0, bmax: 0, spins: 0, grass: 0, jumps: [], why: {}, wrong: 0 };
  let ep = 0, epMax = 0, prevIdx = race.tracker.idx, jump = null, airT = 0, lastCrash = null;
  const J = env.track.jumps.filter((j) => !j.gen);
  while (M.t < lim && race.state !== 'finished') {
    race.step(DT, zero); M.t += DT; race.events.length = 0;
    if (car.crash && car.crash !== lastCrash) { lastCrash = car.crash; M.why[car.crash.reason] = (M.why[car.crash.reason] || 0) + 1; }
    if (race.state !== 'running') { ep = 0; continue; }
    const F = car.frame, ti = race.tracker.idx, sp = car.speed();
    const vf = car.v.x * F.f.x + car.v.y * F.f.y + car.v.z * F.f.z, vr = car.v.x * F.r.x + car.v.y * F.r.y + car.v.z * F.r.z;
    const b = Math.abs(Math.atan2(vr, vf)) * 180 / Math.PI;
    if (car.grass > 0 && car.grass < 1) M.grass += DT;
    if (car.onGround >= 3 && sp > 8 && !car.surfaceKind) {
      M.drive += DT;
      if (b > 10) M.b10 += DT;
      if (b > 25) M.b25 += DT;
      const ii = race.ap.tr.idx;
      const stunt = L.loop[ti] || L.tube[ti] || L.air[ti] || race.isJumpZone(ti);
      if (!stunt && Math.abs(P.kA[ii]) * sp * sp >= 5) { M.curve += DT; if (b > 10) M.curve10 += DT; if (b > 25) M.curve25 += DT; }
      M.bmax = Math.max(M.bmax, b);
      if (b > 12) { ep += DT; epMax = Math.max(epMax, b); } else { if (ep >= 0.4) { M.drifts++; if (epMax >= 60) M.spins++; } ep = 0; epMax = 0; }
    }
    // Schanzen: Lippen-Tempo, Landung relativ zur Landerampe
    for (const j of J) if (prevIdx < j.lipIdx && ti >= j.lipIdx && ti - prevIdx < 20) { jump = { j, v: sp, t: race.time, cr: race.crashes }; airT = 0; }
    prevIdx = ti;
    if (jump) {
      const j = jump.j;
      if (car.onGround === 0) airT += DT;
      const ax = L.px[j.landIdx] - L.px[j.lipIdx], az = L.pz[j.landIdx] - L.pz[j.lipIdx], al = Math.hypot(ax, az) || 1;
      const x = ((car.pos.x - L.px[j.lipIdx]) * ax + (car.pos.z - L.pz[j.lipIdx]) * az) / al;
      if (race.crashes > jump.cr) { M.jumps.push({ v: jump.v, kind: 'crash' }); jump = null; }
      else if (car.onGround > 0 && airT > 0.3) { const fl = x - al; M.jumps.push({ v: jump.v, kind: fl < 0 ? 'kurz' : fl > j.landLen ? 'weit' : 'ok', fl }); jump = null; }
      else if (race.time - jump.t > 6) jump = null;
    }
  }
  if (ep >= 0.4) { M.drifts++; if (epMax >= 60) M.spins++; }
  M.ok = race.state === 'finished';
  M.time = race.finalTime ?? null;
  M.crashes = race.crashes; M.penalties = race.penalties; M.skips = race.skips || 0;
  M.nitro = race.used.nitro; M.hop = race.used.hop;
  return M;
}

// n43: ein KI-Gegner allein (GegnerFeld, volle Physik, Stufe assist) – gleiche Kennzahlen wie measureLap, dazu Zeit zur Autopilot-
// Prüffahrt und „Drift-Regler an in einer Stunt-Zone“ (Looping/Röhre/Korkenzieher/Luft/Schanzen-Zone/Steilkurve; muss 0 sein)
export function measureGegner(env, staerke, opt) {
  const { GegnerFeld } = opt.mods;
  const F = new GegnerFeld(env, { anzahl: 1, staerke, seed: opt.seed ?? 3, assist: opt.assist || 'medium', startplatz: 'hinten', schiene: 'nie', drift: opt.drift ?? true });
  const g = F.fahrer[0], car = g.car, L = env.track.line, P = env.prof;
  const lim = (opt.apTime || 100) * 3 + 40;
  const M = { t: 0, drive: 0, b10: 0, b25: 0, curve: 0, curve10: 0, curve25: 0, drifts: 0, bmax: 0, spins: 0, grass: 0, jumps: [], why: {}, stuntDrift: 0 };
  let ep = 0, epMax = 0, nCrash = 0;
  const jz = (i) => env.track.jumps.some((j) => i >= j.lipIdx - 30 && i <= (j.endIdx ?? j.landIdx + 12));
  while (M.t < lim && !g.fertig) {
    F.step(DT); M.t += DT;
    for (const e of F.events) if (e.type === 'gegnerCrash') M.why[e.reason] = (M.why[e.reason] || 0) + 1;
    F.events.length = 0;
    if (g.zustand !== 'fahrt') { ep = 0; continue; }
    const ti = g.ap.tr.idx, sp = car.speed();
    const stunt = L.loop[ti] || L.tube[ti] || L.air[ti] || jz(ti);
    if (g.drift && g.drift.st && (stunt || Math.abs(L.by[ti]) > 0.12 || (L.wave && L.wave[ti]))) M.stuntDrift += DT;
    const Fr = car.frame, vf = car.v.x * Fr.f.x + car.v.y * Fr.f.y + car.v.z * Fr.f.z, vr = car.v.x * Fr.r.x + car.v.y * Fr.r.y + car.v.z * Fr.r.z;
    const b = Math.abs(Math.atan2(vr, vf)) * 180 / Math.PI;
    if (car.grass > 0 && car.grass < 1) M.grass += DT;
    if (car.onGround >= 3 && sp > 8 && !car.surfaceKind) {
      M.drive += DT;
      if (b > 10) M.b10 += DT;
      if (b > 25) M.b25 += DT;
      if (!stunt && Math.abs(P.kA[ti]) * sp * sp >= 5) { M.curve += DT; if (b > 10) M.curve10 += DT; if (b > 25) M.curve25 += DT; }
      M.bmax = Math.max(M.bmax, b);
      if (b > 12) { ep += DT; epMax = Math.max(epMax, b); } else { if (ep >= 0.4) { M.drifts++; if (epMax >= 60) M.spins++; } ep = 0; epMax = 0; }
    }
  }
  M.ok = g.fertig; M.time = g.zeit; M.crashes = g.crashes; M.ap = opt.apTime;
  return M;
}

export function summarize(rows) {
  const S = { laps: rows.length, ok: 0, crashes: 0, why: {}, drive: 0, b10: 0, b25: 0, curve: 0, curve10: 0, curve25: 0, drifts: 0, bmax: 0, spins: 0, grass: 0, jumps: [], bmaxList: [] };
  for (const r of rows) {
    if (r.ok) S.ok++;
    S.crashes += r.crashes;
    for (const k in r.why) S.why[k] = (S.why[k] || 0) + r.why[k];
    for (const k of ['drive', 'b10', 'b25', 'curve', 'curve10', 'curve25', 'drifts', 'spins', 'grass']) S[k] += r[k];
    S.stuntDrift = (S.stuntDrift || 0) + (r.stuntDrift || 0);
    if (r.ap && r.ok) (S.apQ ||= []).push(r.time / r.ap);
    S.bmax = Math.max(S.bmax, r.bmax); S.bmaxList.push(r.bmax);
    S.jumps.push(...r.jumps);
  }
  return S;
}

const f1 = (x) => x.toFixed(1), pc = (a, b) => (b > 0 ? (a / b * 100).toFixed(1) + ' %' : '–');
export function report(name, S) {
  const n = S.jumps.length, c = (k) => S.jumps.filter((j) => j.kind === k).length;
  const vs = S.jumps.map((j) => j.v * 3.6).sort((a, b) => a - b), med = vs.length ? vs[Math.floor(vs.length / 2)] : 0;
  const bm = S.bmaxList.slice().sort((a, b) => a - b), bMed = bm.length ? bm[Math.floor(bm.length / 2)] : 0;
  console.log(`${name.padEnd(9)} Runden ${S.laps}, im Ziel ${S.ok} · Crashs ${S.crashes} (${f1(S.crashes / S.laps * 10)} je 10 Runden) ${JSON.stringify(S.why)}`);
  console.log(`          Schwimmwinkel > 10°: ${pc(S.b10, S.drive)} der Fahrzeit, > 25°: ${pc(S.b25, S.drive)} · Kurvenzeit > 10°: ${pc(S.curve10, S.curve)}, > 25°: ${pc(S.curve25, S.curve)} · Drifts/Runde ${f1(S.drifts / S.laps)} · größter Winkel ${f1(S.bmax)}° (Median je Runde ${f1(bMed)}°) · Beinahe-Dreher ${S.spins} · Gras (teilweise) ${f1(S.grass)} s`);
  if (S.apQ) console.log(`          Zeit zur Autopilot-Prüffahrt Mittel ${((S.apQ.reduce((a, b) => a + b, 0) / S.apQ.length - 1) * 100).toFixed(1)} % · Drift in Stunt-Zonen ${(S.stuntDrift || 0).toFixed(2)} s`);
  console.log(`          Schanzen ${n}: ok ${c('ok')} (${pc(c('ok'), n)}), weit ${c('weit')}, kurz ${c('kurz')}, Crash ${c('crash')} · Lippe Median ${med.toFixed(0)} km/h echt`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === url.fileURLToPath(import.meta.url)) {
  if (arg('sum')) {
    const parts = arg('sum').split(',').map((f) => JSON.parse(fs.readFileSync(f, 'utf8')));
    const all = {};
    for (const p of parts) for (const st in p) (all[st] ||= []).push(...p[st]);
    const byName = {};
    for (const st in all) { report(st, summarize(all[st])); for (const r of all[st]) (byName[r.name] ||= {})[st] = r; }
    // Rundenzeit-Vergleich nur über Strecken, die beide im Ziel haben
    const sts = Object.keys(all);
    if (sts.length === 2) {
      const [a, b] = sts; let ra = 0, rb = 0, k = 0; const q = [];
      for (const nm in byName) { const x = byName[nm][a], y = byName[nm][b]; if (x && y && x.ok && y.ok) { ra += x.time; rb += y.time; k++; q.push(y.time / x.time); } }
      q.sort((u, v) => u - v);
      console.log(`Rundenzeit ${b} gegen ${a} (${k} Strecken, beide im Ziel): Summe ${(rb / ra * 100 - 100).toFixed(1)} %, Median ${((q[Math.floor(q.length / 2)] - 1) * 100).toFixed(1)} %, Spanne ${((q[0] - 1) * 100).toFixed(1)} … ${((q[q.length - 1] - 1) * 100).toFixed(1)} %`);
    }
    process.exit(0);
  }
  const { Race } = await imp('src/game/race.js');
  const { GegnerFeld, GEGNER_DRIFT } = await imp('src/ai/gegner.js');
  // Abstimmen: --gdosis=profi.rDrift:60,locker.grassP:0.2 (GEGNER_DRIFT, ai/gegner.js; beta als a/b: profi.beta:10/18)
  for (const kv of (arg('gdosis', '') || '').split(',').filter(Boolean)) { const [k, x] = kv.split(':'); const [st, f] = k.split('.'); GEGNER_DRIFT[st][f] = x.includes('/') ? x.split('/').map(Number) : +x; }
  // n43: --gegner=locker,ebenbuertig,profi misst KI-Gegner (Stufe --assist=medium|original|easy, --gegnerdrift=0 = ohne Drift)
  // Abstimmen: --set=spinP:1,vSpin:32 (Werte in BRACHIAL, ai/drift.js)
  const { BRACHIAL } = await imp('src/ai/drift.js');
  for (const kv of (arg('set', '') || '').split(',').filter(Boolean)) { const [k, x] = kv.split(':'); BRACHIAL[k] = +x; }
  const { verifySync } = await imp('src/track/verify.js');
  const gegner = arg('gegner') ? arg('gegner').split(',') : null;
  const stile = gegner ? gegner.map((x) => 'g:' + x) : arg('stil', 'sauber,brachial').split(',');
  const list = await driftTracks();
  const von = +arg('von', 0), n = +arg('n', list.length), seed = arg('seed') != null ? +arg('seed') : undefined;
  const out = {};
  for (const [name, mk] of list.slice(von, von + n)) {
    const t0 = Date.now();
    const v = verifySync(mk());
    if (!v.env) { console.log(name, 'nicht baubar'); continue; }
    const line = [];
    for (const st of stile) {
      const M = st.startsWith('g:') ? measureGegner(v.env, st.slice(2), { mods: { GegnerFeld }, seed, assist: arg('assist', 'medium'), apTime: v.apTime, drift: arg('gegnerdrift', '1') !== '0' }) : measureLap(v.env, st, { mods: { Race }, seed });
      M.name = name;
      (out[st] ||= []).push(M);
      line.push(`${st} ${M.ok ? (M.time).toFixed(1) + ' s' + (M.ap ? ` (${((M.time / M.ap - 1) * 100).toFixed(1)} %)` : '') : 'NICHT im Ziel'}${M.stuntDrift ? ' STUNT-DRIFT ' + M.stuntDrift.toFixed(2) + ' s' : ''} cr ${M.crashes}${M.crashes ? ' ' + JSON.stringify(M.why) : ''} >10° ${pc(M.b10, M.drive)} Kurve>10° ${pc(M.curve10, M.curve)} drifts ${M.drifts} max ${f1(M.bmax)}° spins ${M.spins}`);
    }
    console.log(`${name.padEnd(16)} ${line.join(' | ')}  (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
  }
  for (const st of stile) if (out[st]) report(st, summarize(out[st]));
  if (arg('json')) fs.writeFileSync(arg('json'), JSON.stringify(out));
}
