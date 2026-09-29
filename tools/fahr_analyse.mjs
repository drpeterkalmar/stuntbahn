// Fahrgefühl-Analyse (n14, 29.09.2026): Wo verliert der Autopilot Zeit, warum bremst er so lange, was fehlt
// „Original“ an Haftung? Läuft gegen den Arbeitsstand oder eine Kopie (--root=…, z. B. HEAD-Kopie für „vorher“).
//   bremse  – Plan-Bremsverzögerung des Profils gegen die echte Vollbremsung der Physik (Ebene, je Tempo)
//   tempo   – Autopilot-Runde: Bremszeit je Ursache, Gas/Bremse-Wechsel, Zeitverlust je Ursache (1-D-Gegenrechnung
//             auf dem Profil: dieselbe Rechnung ohne die jeweilige Grenze), Tempo an Hindernissen
//   haftung – Bots auf Original (und zum Vergleich mit dem Magnet von Mittel/Leicht): Abheben außerhalb von
//             Sprüngen, Radkontakt, Querbeschleunigung/Rutschwinkel in schnellen Kurven, Landungen, Crashs
// Aufruf: node tools/fahr_analyse.mjs [--root=<Repo>] [--teil=bremse,tempo,haftung] [--gen=6] [--sam=30] [--json=datei]
import fs from 'fs';
import path from 'path';
import url from 'url';

const HERE = path.dirname(url.fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const arg = (k, d) => { const a = args.find((s) => s.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : (args.includes(`--${k}`) ? true : d); };
const ROOT = path.resolve(arg('root', path.join(HERE, '..')));
const imp = (p) => import(url.pathToFileURL(path.join(ROOT, p)).href);
const { generate, demoLayout } = await imp('src/track/generator.js');
const { prepare } = await imp('src/track/verify.js');
const { computeProfile } = await imp('src/ai/profile.js');
const { Race, ASSISTS } = await imp('src/game/race.js');
const { Car, CAR_DEF, driveAccel, brakeDecel } = await imp('src/physics/car.js');
const { G } = await imp('src/physics/air.js');
const { MAT } = await imp('src/track/defs.js');
const { parseTrk } = await imp('src/track/trk.js');
const { trkToLayout } = await imp('src/track/trkimport.js');
const { tracksOf } = await imp('src/game/sammlung.js');
const { rng, fmtTime } = await imp('src/core/util.js');
const PM = await imp('src/ai/profile.js');
const PROF = PM.PROF, speedPasses = PM.speedPasses;
// --var={"d":{…CAR_DEF},"p":{…PROF}}: Physik/Profil für Versuche übersteuern (nur dieser Lauf)
const VAR = JSON.parse(arg('var', '{}'));
Object.assign(CAR_DEF, VAR.d || {});
if (PROF) Object.assign(PROF, VAR.p || {});

const DT = 1 / 120;
const TEILE = String(arg('teil', 'bremse,tempo,haftung')).split(',');
const f1 = (x) => (Number.isFinite(x) ? x.toFixed(1) : '–');
const f2 = (x) => (Number.isFinite(x) ? x.toFixed(2) : '–');
const pct = (a, b) => (b > 0 ? (100 * a / b).toFixed(0) : '–');
const out = { root: ROOT };

// ---------- Strecken ----------
export function streckenListe(nGen = 6, nSam = 30) {
  const list = [{ name: 'Demo', art: 'demo', layout: () => demoLayout() }];
  const seeds = [[20260927, 2], [4711, 3], [1000, 1], [42, 3], [777, 3], [7, 2], [2024, 1], [31337, 2], [555, 3], [88, 1]];
  for (const [s, d] of seeds.slice(0, nGen)) list.push({ name: `S${s}/${d}`, art: 'gen', layout: () => generate(s, d) });
  const jf = path.join(ROOT, 'assets/sammlung.json'), bf = path.join(ROOT, 'assets/sammlung.bin');
  if (nSam > 0 && fs.existsSync(jf) && fs.existsSync(bf)) {
    const T = tracksOf(JSON.parse(fs.readFileSync(jf, 'utf8'))), bin = new Uint8Array(fs.readFileSync(bf));
    for (let q = 0; q < nSam; q++) {
      const k = Math.floor((q + 0.5) * T.length / nSam), t = T[k];
      list.push({ name: t.id, art: 'sam', layout: () => { const L = trkToLayout(parseTrk(bin.subarray(k * 1802, (k + 1) * 1802), t.id)).layout; L.meta.key = t.id; return L; } });
    }
  }
  return list;
}

// ---------- Teil 1: Bremsleistung ----------
const PLANE = { ray(ox, oy, oz, dx, dy, dz, len) { if (dy >= -1e-9) return null; const t = -oy / dy; if (t < 0 || t > len) return null; return { t, x: ox + dx * t, y: 0, z: oz + dz * t, nx: 0, ny: 1, nz: 0, mat: MAT.ROAD }; } };
function vollbremsung(v0) {
  const car = new Car(CAR_DEF);
  car.place([0, 0, 0], [0, 0, -1], [0, 1, 0], v0);
  // Federn setzen, Tempo halten (Gas gegen Luftwiderstand)
  for (let k = 0; k < 90; k++) { car.input.throttle = Math.max(0, Math.min(1, 0.2 + (v0 - car.fwdSpeed()) * 0.5)); car.step(DT, PLANE); if (car.pos.z < -400) car.pos.z += 800; }
  car.input.throttle = 0; car.input.brake = 1; car.input.hold = true;
  const va = car.fwdSpeed();
  for (let k = 0; k < 24; k++) { car.step(DT, PLANE); if (car.pos.z < -400) car.pos.z += 800; }
  const vb = car.fwdSpeed();
  return { v: (va + vb) / 2, a: (va - vb) / (24 * DT) };
}
// Verhältnis echte Vollbremsung / Plan-Grundwert (mittlere Tempi) – für die Gegenrechnung „Bremsen wie die Physik“
let REAL_BRAKE = 19 / 12;
if (TEILE.includes('bremse') || TEILE.includes('tempo')) {
  const P0 = computeProfile({ n: 2, s: new Float32Array([0, 1]), px: new Float32Array(2), py: new Float32Array(2), pz: new Float32Array(2), tx: new Float32Array(2), ty: new Float32Array(2), tz: new Float32Array([-1, -1]), nx: new Float32Array(2), ny: new Float32Array([1, 1]), nz: new Float32Array(2), bx: new Float32Array([1, 1]), by: new Float32Array(2), bz: new Float32Array(2), air: new Uint8Array(2), loop: new Uint8Array(2), tube: new Uint8Array(2), closed: false, total: 1 }, { diag: true });
  const aB = (P0.diag && P0.diag.aBrake) || 8 * CAR_DEF.mu;
  if (TEILE.includes('bremse')) console.log(`\n## Bremsleistung: Plan (Profil, Grundwert ${f1(aB)} m/s²) gegen Vollbremsung der Physik (Ebene, Asphalt)`);
  console.log('| Tempo | Plan m/s² | Vollbremsung m/s² | Plan / echt |\n|---|---|---|---|');
  const rows = [];
  for (const v0 of [12, 20, 30, 45, 60, 80, 100, 130]) {
    const r = vollbremsung(v0), plan = brakeDecel(CAR_DEF, r.v, aB);
    rows.push({ kmh: r.v * 3.6, plan, real: r.a });
    console.log(`| ${Math.round(r.v * 3.6)} km/h | ${f1(plan)} | ${f1(r.a)} | ${pct(plan, r.a)} % |`);
  }
  out.bremse = rows;
  const mid = rows.filter((r) => r.kmh > 60 && r.kmh < 300);
  REAL_BRAKE = mid.reduce((a, r) => a + r.real / r.plan, 0) / mid.length;
  console.log(`Mittel 60–300 km/h: Vollbremsung = ${f2(REAL_BRAKE)} × Plan`);
}

// ---------- Teil 2: Tempo / Bremszeit je Ursache ----------
const URSACHEN = ['kurve', 'vorStunt', 'eng', 'schanze', 'kuppe', 'last', 'rollrate', 'mindest', 'luft', 'top'];
const NAMEN = { kurve: 'Kurve (Querhaftung)', vorStunt: 'Anfahrt Looping/Röhre/Korkenzieher/Engstelle (65 %)', eng: 'Engstelle/Slalom (V_NARROW)', schanze: 'Schanzen-Fenster (vbest)', kuppe: 'Kuppe (Anpressdruck)', last: 'Senke (Höchstlast)', rollrate: 'Rollrate (Korkenzieher)', mindest: 'Mindesttempo (Looping)', luft: 'Luft', top: 'Höchsttempo', halten: 'Halten an einer Grenze (Regler-Pendeln)', vorausschau: 'Vorausschau des Reglers (bremst unter Plan-Tempo)' };

// Einzelgrenzen → vmax wie im Profil (Reihenfolge wie computeProfile), ohne die Grenzen in `ohne`, mit Ersatz `ers`
function rekonstruiere(L, P, ohne = [], ers = {}) {
  const lim = P.diag.lim, n = L.n, v = new Float32Array(n), vTop = P.diag.vTop;
  const g = (k, i) => (ohne.includes(k) ? Infinity : ers[k] ? ers[k][i] : lim[k] ? lim[k][i] : Infinity);
  for (let i = 0; i < n; i++) {
    if (L.air[i]) { v[i] = lim.luft && Number.isFinite(lim.luft[i]) ? lim.luft[i] : P.vmax[i]; continue; }
    let x = Math.min(vTop, g('kurve', i), g('vorStunt', i), g('kuppe', i), g('last', i), g('rollrate', i));
    if (lim.mindest && Number.isFinite(lim.mindest[i]) && !ohne.includes('mindest')) x = Math.max(x, lim.mindest[i]);
    x = Math.min(x, g('eng', i), g('schanze', i));
    v[i] = x;
  }
  return v;
}
// Rückwärts- und Vorwärtslauf wie computeProfile. Neuer Stand: speedPasses (dieselbe Rechnung wie das Spiel, P = Profil
// mit Diagnose); Stand bis n13 (keine speedPasses): nachgebaut mit Grundwert aB und Bremsfunktion `bremse`.
function laeufe(L, vmax, aB, startIdx, bremse = brakeDecel, P = null, circle = null) {
  if (speedPasses && P && P.diag.def && bremse === brakeDecel) {
    const keep = PROF.brakeCircle;
    if (circle != null) PROF.brakeCircle = circle;
    const r = speedPasses(L, vmax, P.vmin, { kA: P.kA, kC: P.kC, def: P.diag.def, dAero: P.diag.dAero, aBrake: aB, startIdx });
    PROF.brakeCircle = keep;
    return { vt: r.vt, vf: r.vf, T: zeit(L, r.vf, startIdx) };
  }
  const n = L.n, closed = L.closed, idx = (i) => (closed ? ((i % n) + n) % n : Math.max(0, Math.min(n - 1, i)));
  const sAt = (j, i) => { if (!closed) return L.s[j]; let s = L.s[j]; const h = L.total / 2; while (s - L.s[i] > h) s -= L.total; while (L.s[i] - s > h) s += L.total; return s; };
  const vt = Float32Array.from(vmax);
  for (let p = 0; p < (closed ? 2 : 1); p++) for (let k = n - 2 + (closed ? 1 : 0); k >= 0; k--) {
    const i = idx(k), j = idx(k + 1);
    if (L.air[i]) continue;
    const ds = Math.max(0, sAt(j, i) - L.s[i]);
    const ab0 = L.grip ? Math.min(aB, aB * L.grip[i] / 1.25) : aB;
    const lim = Math.sqrt(vt[j] * vt[j] + 2 * bremse(CAR_DEF, vt[j], ab0) * ds);
    if (vt[i] > lim) vt[i] = lim;
  }
  const vf = new Float32Array(n);
  const loopsN = closed ? n : n - startIdx;
  let T = 0;
  for (let k = 0; k < loopsN - 1; k++) {
    const i = idx(startIdx + k), j = idx(startIdx + k + 1);
    const ds = Math.max(0, sAt(j, i) - L.s[i]);
    let a = driveAccel(CAR_DEF, Math.max(vf[i], 1)) - G * L.ty[i];
    if (L.air[i]) a = -G * L.ty[i] * 0.2;
    vf[j] = Math.min(Math.sqrt(Math.max(0, vf[i] * vf[i] + 2 * a * ds)), vt[j]);
    T += ds / Math.max(0.5, (vf[i] + vf[j]) / 2);
  }
  return { vt, vf, T };
}
function zeit(L, vf, startIdx) {
  const n = L.n, closed = L.closed, idx = (i) => (closed ? ((i % n) + n) % n : Math.max(0, Math.min(n - 1, i)));
  let T = 0;
  for (let k = 0; k < (closed ? n : n - startIdx) - 1; k++) {
    const i = idx(startIdx + k), j = idx(startIdx + k + 1);
    let ds = L.s[j] - L.s[i]; if (ds < 0) ds = closed ? L.s[1] : 0;
    T += Math.max(0, ds) / Math.max(0.5, (vf[i] + vf[j]) / 2);
  }
  return T;
}

function apRunde(env, P) {
  const L = env.ideal, n = L.n, lim = P.diag.lim;
  const race = new Race(env, { assist: 'easy', countdown: 0.5, autopilot: true });
  const nextI = (k) => (k + 1 >= n ? (L.closed ? 1 : n - 1) : k + 1);
  const bindend = (k) => { let b = 'top', bv = P.vmax[k] + 0.05; for (const u of URSACHEN) { const a = lim[u]; if (a && a[k] <= bv) { bv = a[k]; b = u; } } return b; };
  const brems = {}, halt = { t: 0 };
  let t = 0, runT = 0, brakeT = 0, thrT = 0, coastT = 0, wechsel = 0, last = 0, vmaxSeen = 0;
  const zone = {};   // Tempo je Hindernis-Art: kleinstes Tempo an der Stelle (Lippe, Engstelle, Looping-Einfahrt)
  while (t < Math.max(90, L.total / 7) && race.state !== 'finished') {
    race.step(DT, { steer: 0, throttle: 0, brake: 0 }); t += DT;
    race.events.length = 0;
    if (race.state !== 'running') continue;
    runT += DT;
    const car = race.car, v = car.fwdSpeed(), i = race.ap.tr.idx, I = car.input;
    vmaxSeen = Math.max(vmaxSeen, v);
    const st = I.brake > 0.05 ? -1 : I.throttle > 0.05 ? 1 : 0;
    if (st && last && st !== last) wechsel++;
    if (st) last = st;
    if (st === 1) thrT += DT; else if (st === 0) coastT += DT;
    if (st !== -1) continue;
    brakeT += DT;
    // Ziel des Reglers: kleinstes vt in der Vorausschau (wie Autopilot bis n13: 0,35 s) bzw. was er meldet
    let j = i, jm = i;
    if (race.ap.vtIdx != null) jm = race.ap.vtIdx;
    else { const jv = race.ap.ahead(i, Math.max(3, Math.abs(v) * 0.35)); for (let c = 0; c < 400; c++) { if (P.vt[j] < P.vt[jm]) jm = j; if (j === jv) break; j = nextI(j); } }
    let why;
    if (v < P.vt[i] - 0.5) why = 'vorausschau';
    else if (P.vt[jm] >= P.vt[i] - 0.3 && P.vt[i] >= P.vmax[i] - 0.3) why = 'halten';
    else { let k = jm; for (let c = 0; c < n && P.vt[k] < P.vmax[k] - 0.05; c++) k = nextI(k); why = bindend(k); }
    brems[why] = (brems[why] || 0) + DT;
  }
  return { ok: race.state === 'finished', time: race.finalTime, crashes: race.crashes, runT, brakeT, thrT, coastT, wechsel, brems, vmaxSeen };
}

// Tempo an Hindernissen (Plan): kleinstes vt je Hindernis-Art im Bereich der Grenze, gemittelt
function hindernisTempo(L, P, env) {
  const lim = P.diag.lim, res = {};
  const add = (k, v) => { (res[k] = res[k] || []).push(v); };
  // Schanzen: Tempo an der Lippe
  for (const j of env.track.jumps) add(j.gen ? 'Sprung (Import)' : 'Sprung', P.vt[j.lipIdx]);
  // Looping/Röhre/Korkenzieher-Einfahrt: vt am ersten Punkt
  for (let i = 1; i < L.n; i++) {
    if (L.loop[i] && !L.loop[i - 1]) { const pc = env.track.pieces[L.piece[i]]; add(pc && /cork/.test(pc.type) ? 'Korkenzieher' : 'Looping', P.vt[i]); }
    if (L.tube[i] && !L.tube[i - 1]) add('Röhre', P.vt[i]);
    if (lim.eng && Number.isFinite(lim.eng[i]) && !Number.isFinite(lim.eng[i - 1])) {
      let m = Infinity; for (let k = i; k < L.n && Number.isFinite(lim.eng[k]); k++) m = Math.min(m, P.vt[k]);
      add('Engstelle/Slalom', m);
    }
  }
  return res;
}

if (TEILE.includes('tempo')) {
  const list = streckenListe(+arg('gen', 6), +arg('sam', 30));
  const rows = [], sum = { brakeT: 0, runT: 0, brems: {}, apT: 0, planT: 0, loss: {} }, hind = {};
  console.log(`\n## Autopilot-Runden (Leicht-Rennen, nur Autopilot) – ${list.length} Strecken`);
  console.log('| Strecke | Runde AP | Plan 1-D | Bremsen % | Wechsel Gas↔Bremse | Vmax km/h | Bremszeit je Ursache (s) |\n|---|---|---|---|---|---|---|');
  for (const S of list) {
    const env = prepare(S.layout(), { treeCount: 0 });
    const L = env.ideal;
    const P = computeProfile(L, { jumps: env.track.jumps, startIdx: env.track.start.idx, diag: true });
    // Kontrolle: Diagnose-Profil = Spiel-Profil, Rekonstruktion = vmax
    let dv = 0, dr = 0;
    const rv = rekonstruiere(L, P);
    for (let i = 0; i < L.n; i++) { dv = Math.max(dv, Math.abs(P.vt[i] - env.prof.vt[i])); dr = Math.max(dr, Math.abs(rv[i] - P.vmax[i])); }
    if (dv > 1e-4 || dr > 1e-3) console.log(`   ⚠️ ${S.name}: Diagnose weicht ab (vt ${dv}, vmax ${dr})`);
    const aB = P.diag.aBrake, st = env.track.start.idx;
    const basis = laeufe(L, P.vmax, aB, st, brakeDecel, P);
    let dvt = 0; for (let i = 0; i < L.n; i++) dvt = Math.max(dvt, Math.abs(basis.vt[i] - P.vt[i]));
    if (dvt > 1e-3) console.log(`   ⚠️ ${S.name}: Rückwärtslauf weicht ab (${dvt})`);
    // Gegenrechnung je Ursache: dieselbe Runde ohne diese Grenze (obere Schranke des möglichen Gewinns)
    const loss = {};
    for (const u of ['vorStunt', 'eng', 'schanze', 'kuppe', 'rollrate']) if (P.diag.lim[u]) loss[u] = basis.T - laeufe(L, rekonstruiere(L, P, [u]), aB, st, brakeDecel, P).T;
    // Kurven ohne Reserve (volle Reifenhaftung statt 82 %), Bremsen mit der echten Vollbremsung statt Plan
    const Pk = computeProfile(L, { jumps: env.track.jumps, startIdx: st, diag: true, def: { ...CAR_DEF, mu: CAR_DEF.mu / (PROF ? PROF.res : 0.82) }, abrake: aB });
    loss.kurveReserve = basis.T - laeufe(L, rekonstruiere(L, P, [], { kurve: Pk.diag.lim.kurve || new Float32Array(L.n).fill(Infinity), vorStunt: P.diag.lim.vorStunt ? P.diag.lim.vorStunt.map((x, i) => (Number.isFinite(x) && Pk.diag.lim.vorStunt ? Pk.diag.lim.vorStunt[i] : x)) : undefined }), aB, st, brakeDecel, P).T;
    loss.bremsReserve = basis.T - (PROF && PROF.brakeCircle > 0 ? laeufe(L, P.vmax, aB, st, brakeDecel, P, 1).T : laeufe(L, P.vmax, aB, st, (d, v, a0) => REAL_BRAKE * brakeDecel(d, v, a0)).T);
    const r = apRunde(env, P);
    sum.brakeT += r.brakeT; sum.runT += r.runT;
    for (const [k, x] of Object.entries(r.brems)) sum.brems[k] = (sum.brems[k] || 0) + x;
    for (const [k, x] of Object.entries(loss)) sum.loss[k] = (sum.loss[k] || 0) + x;
    if (r.ok) { sum.apT += r.time; sum.planT += basis.T; }
    for (const [k, a] of Object.entries(hindernisTempo(L, P, env))) (hind[k] = hind[k] || []).push(...a);
    const bz = Object.entries(r.brems).sort((a, b) => b[1] - a[1]).map(([k, x]) => `${k} ${f1(x)}`).join(', ');
    console.log(`| ${S.name} | ${r.ok ? fmtTime(r.time) : 'NEIN'}${r.crashes ? ` (${r.crashes} Crash)` : ''} | ${fmtTime(basis.T)} | ${pct(r.brakeT, r.runT)} % | ${r.wechsel} | ${Math.round(r.vmaxSeen * 3.6)} | ${bz} |`);
    rows.push({ name: S.name, art: S.art, ok: r.ok, time: r.time, crashes: r.crashes, plan: basis.T, brakePct: r.brakeT / r.runT, wechsel: r.wechsel, vmax: r.vmaxSeen * 3.6, brems: r.brems, loss });
  }
  console.log(`\n### Bremszeit je Ursache (alle Strecken, Anteil an der gesamten Bremszeit; Bremsen = ${pct(sum.brakeT, sum.runT)} % der Rennzeit)`);
  console.log('| Ursache | Bremszeit | Anteil |\n|---|---|---|');
  for (const [k, x] of Object.entries(sum.brems).sort((a, b) => b[1] - a[1])) console.log(`| ${NAMEN[k] || k} | ${f1(x)} s | ${pct(x, sum.brakeT)} % |`);
  console.log(`\n### Zeitverlust je Ursache (1-D-Gegenrechnung auf dem Profil, Summe aller Strecken; Plan ${f1(sum.planT)} s, Autopilot ${f1(sum.apT)} s → Regler ${f1(sum.apT - sum.planT)} s)`);
  console.log('| Ursache | Zeit ohne diese Grenze | Anteil am Plan |\n|---|---|---|');
  const LN = { ...NAMEN, kurveReserve: `Kurven mit ${Math.round(100 * (PROF ? PROF.res : 0.82))} % statt voller Querhaftung`, bremsReserve: PROF && PROF.brakeCircle > 0 ? `Plan-Bremse (${Math.round(100 * PROF.brakeCircle)} % des Haftungskreises) statt voll` : 'Plan-Bremse (~63 %) statt Vollbremsung' };
  for (const [k, x] of Object.entries(sum.loss).sort((a, b) => b[1] - a[1])) console.log(`| ${LN[k] || k} | −${f1(x)} s | ${f1(100 * x / sum.planT)} % |`);
  console.log('\n### Plan-Tempo an Hindernissen (Mittel über alle Stellen)');
  console.log('| Hindernis | Anzahl | Tempo km/h (Mittel / min / max) |\n|---|---|---|');
  for (const [k, a] of Object.entries(hind)) { const m = a.reduce((x, y) => x + y, 0) / a.length; console.log(`| ${k} | ${a.length} | ${Math.round(m * 3.6)} / ${Math.round(Math.min(...a) * 3.6)} / ${Math.round(Math.max(...a) * 3.6)} |`); }
  out.tempo = { rows, sum, hind };
}

// ---------- Teil 3: Haftung auf Original ----------
function bot(kind, seed) {
  const r = rng(seed);
  let noise = 0, nT = 0; const q = [];
  return (race) => {
    nT -= DT;
    if (nT <= 0) { noise = r.range(-1, 1); nT = r.range(0.3, 1.2); }
    const ap = race.ap.out;
    if (kind === 'perfekt') return { steer: ap.steer, throttle: ap.throttle, brake: ap.brake };
    // wie test_assists „normal“: 0,1 s Verzögerung, leichtes Rauschen, Gas bis 8 % über Profil, Bremse ab 20 %
    q.push(ap.steer); const st = q.length > 12 ? q.shift() : 0;
    const vt = race.env.prof.vt[race.ap.tr.idx], v = race.car.fwdSpeed();
    return { steer: Math.max(-1, Math.min(1, st + noise * 0.15)), throttle: v < vt * 1.08 ? 1 : 0, brake: v > vt * 1.2 ? 0.7 : 0 };
  };
}
function haftungsRunde(env, kind, magnet, seed) {
  const L = env.track.line;
  const race = new Race(env, { assist: 'original', countdown: 0.5 });
  if (magnet != null) race.assist = { ...ASSISTS.original, magnet };
  const b = bot(kind, seed);
  const lim = Math.max(120, (env.meta?.ap || 80) * 4);
  let t = 0, run = 0, lift = 0, kontakt = 0, abT = 0, ab = null;
  const crashes = {}, abheben = {}, latU = [], slipU = [];
  const art = (i) => { const pc = env.track.pieces[L.piece[i]]; const k = env.prof.kC[i]; return (pc ? pc.type : '?') + (k < -2e-3 ? '/Kuppe' : ''); };
  // Oberbegriff für die Auswertung: Kuppe, Steilkurve (Übergang), Bodenwellen, Looping/Röhre/Korkenzieher, schnelle Kurve
  const gruppe = (i, v) => {
    const pc = env.track.pieces[L.piece[i]], ty = pc ? pc.type : '';
    if (L.loop[i] || L.tube[i] || /cork|pipe|loop|tube/.test(ty)) return 'Looping/Röhre/Korkenzieher';
    if (/bump/.test(ty)) return 'Bodenwellen';
    if (/bank/.test(ty)) return 'Steilkurve';
    if (env.prof.kC[i] < -2e-3) return 'Kuppe';
    if (Math.abs(env.prof.kA[i]) * v * v > 5) return 'schnelle Kurve';
    return 'sonst';
  };
  while (t < lim && race.state !== 'finished') {
    race.ap.control(race.car);
    race.step(DT, b(race)); t += DT;
    for (const e of race.events) if (e.type === 'crash') {
      const i = race.tracker.idx, k = `${e.reason}@${art(i)}`;
      const c = crashes[k] || (crashes[k] = { n: 0, vRel: 0 });
      c.n++; c.vRel = Math.max(c.vRel, race.car.speed() / Math.max(1, env.prof.vt[race.ap.tr.idx]));
    }
    race.events.length = 0;
    if (race.state !== 'running') { ab = null; continue; }
    const car = race.car, i = race.tracker.idx, v = car.fwdSpeed();
    if (L.air[i] || race.isJumpZone(i) || car.hopUp) { ab = null; continue; }
    run += DT;
    kontakt += car.onGround / 4 * DT;
    if (car.onGround < 4) lift += DT;
    // Abheben: höchstens 1 Rad am Boden, mindestens 0,05 s (Bodenwellen-Hüpfer zählen mit, Sprünge nicht)
    if (car.onGround <= 1) { if (!ab) ab = { i, t: 0, v }; ab.t += DT; }
    else if (ab) { if (ab.t >= 0.05) { const k = gruppe(ab.i, ab.v); const x = abheben[k] || (abheben[k] = { n: 0, t: 0, vMax: 0 }); x.n++; x.t += ab.t; x.vMax = Math.max(x.vMax, ab.v); abT += ab.t; } ab = null; }
    // schnelle Kurve: > 25 m/s und Querbeschleunigung des Plans > 5 m/s²: genutzte Querbeschleunigung, Rutschwinkel
    const aq = Math.abs(env.prof.kA[race.ap.tr.idx]) * v * v;
    if (v > 25 && aq > 5 && car.onGround >= 3) {
      const w = car.w, F = car.frame;
      latU.push(Math.abs((w.x * F.u.x + w.y * F.u.y + w.z * F.u.z) * v));
      slipU.push(Math.abs(Math.atan2(car.v.x * F.r.x + car.v.y * F.r.y + car.v.z * F.r.z, Math.max(1, v))) * 180 / Math.PI);
    }
  }
  const q = (a, p) => { if (!a.length) return 0; a.sort((x, y) => x - y); return a[Math.min(a.length - 1, Math.floor(p * a.length))]; };
  const nAb = Object.values(abheben).reduce((s, x) => s + x.n, 0);
  return { ok: race.state === 'finished', time: race.finalTime, crashes: race.crashes, crashArt: crashes, liftPct: 100 * lift / Math.max(1e-9, run), abheben: nAb, abhebenArt: abheben, abT, kontakt: 100 * kontakt / Math.max(1e-9, run), latP90: q(latU, 0.9), slipP90: q(slipU, 0.9), slipP99: q(slipU, 0.99) };
}
if (TEILE.includes('haftung')) {
  const list = streckenListe(+arg('gen', 6), +arg('samh', 10));
  const mags = String(arg('magnet', '0,0.35,1')).split(',').map(Number);
  console.log(`\n## Haftung: Bots auf „Original“ (Magnet 0) gegen Magnet von Mittel (0,35) und Leicht (1) – ${list.length} Strecken`);
  console.log('| Strecke | Bot | Magnet | Ziel | Crashs | Zeit <4 Räder % | Abheben n / s | Querb. p90 m/s² | Rutschwinkel p90/p99 ° |\n|---|---|---|---|---|---|---|---|---|');
  const rows = [], tot = {};
  for (const S of list) {
    const env = prepare(S.layout(), { treeCount: 0 });
    for (const kind of ['normal', 'perfekt']) for (const m of mags) {
      if (kind === 'perfekt' && m > 0) continue;
      const r = haftungsRunde(env, kind, m, 7 + kind.length);
      const key = `${kind}|${m}`;
      const T = tot[key] || (tot[key] = { n: 0, ok: 0, crashes: 0, lift: 0, abheben: 0, abT: 0, lat: [], slip: [], crashArt: {}, abArt: {} });
      T.n++; T.ok += r.ok ? 1 : 0; T.crashes += r.crashes; T.lift += r.liftPct; T.abheben += r.abheben; T.abT += r.abT; T.lat.push(r.latP90); T.slip.push(r.slipP90);
      for (const [k, c] of Object.entries(r.crashArt)) T.crashArt[k] = (T.crashArt[k] || 0) + c.n;
      for (const [k, c] of Object.entries(r.abhebenArt)) { const x = T.abArt[k] || (T.abArt[k] = { n: 0, t: 0 }); x.n += c.n; x.t += c.t; }
      rows.push({ name: S.name, kind, magnet: m, ...r });
      console.log(`| ${S.name} | ${kind} | ${m} | ${r.ok ? fmtTime(r.time) : 'NEIN'} | ${r.crashes}${r.crashes ? ' (' + Object.entries(r.crashArt).map(([k, c]) => `${c.n}× ${k} v/vt ${f2(c.vRel)}`).join(', ') + ')' : ''} | ${f1(r.liftPct)} | ${r.abheben} / ${f2(r.abT)} | ${f1(r.latP90)} | ${f1(r.slipP90)} / ${f1(r.slipP99)} |`);
    }
  }
  console.log('\n### Summe je Bot und Magnet');
  console.log('| Bot | Magnet | im Ziel | Crashs | Zeit <4 Räder % | Abheben n / s | Querb. p90 (Mittel) | Rutschwinkel p90 (Mittel) | Crash-Arten | Abheben wo |\n|---|---|---|---|---|---|---|---|---|---|');
  const avg = (a) => a.reduce((x, y) => x + y, 0) / Math.max(1, a.length);
  for (const [k, T] of Object.entries(tot)) {
    const [kind, m] = k.split('|');
    const ca = Object.entries(T.crashArt).sort((a, b) => b[1] - a[1]).map(([x, n]) => `${n}× ${x}`).join(', ');
    const aa = Object.entries(T.abArt).sort((a, b) => b[1].n - a[1].n).map(([x, c]) => `${c.n}× ${x} (${f1(c.t)} s)`).join(', ');
    console.log(`| ${kind} | ${m} | ${T.ok}/${T.n} | ${T.crashes} | ${f1(T.lift / T.n)} | ${T.abheben} / ${f1(T.abT)} | ${f1(avg(T.lat))} | ${f1(avg(T.slip))} | ${ca} | ${aa} |`);
  }
  out.haftung = { rows, tot };
}

if (arg('json', '')) fs.writeFileSync(arg('json', ''), JSON.stringify(out, null, 1));
