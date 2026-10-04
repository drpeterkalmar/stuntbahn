// G-Kräfte (n24 Etappe 1) messen: fährt die Kino-Replay-Fahrten (tools/kinoreplay_probe.mjs) und wertet die Aufzeichnung
// mit src/core/gforce.js aus – echte und angezeigte Werte je Situation (Kurve, Looping, Landung, Flug, Stand, Nitro).
// Aufruf: node tools/gkraft_mess.mjs [--nur=0,2] [--tau=0.2] [--show=1.3]   (STUNT_G=echt → ohne Show-Faktor)
import { RUNS, runRace, marksOf } from './kinoreplay_probe.mjs';
import { gTrack, gPeak, GF } from '../src/core/gforce.js';
import { findMoments } from '../src/game/highlights.js';
import { REC_HZ } from '../src/game/race.js';

const arg = (k) => { const a = process.argv.find((x) => x.startsWith('--' + k + '=')); return a ? a.split('=')[1] : null; };
const only = arg('nur') ? arg('nur').split(',').map(Number) : null;
const opt = {}; if (arg('tau')) opt.tau = +arg('tau'); if (arg('show')) GF.show = +arg('show');
const f1 = (x) => x.toFixed(1).replace('.', ',');
const pct = (a, p) => { const s = Float32Array.from(a).sort(); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };

export function measureRun(R) {
  const env = R.env(), race = runRace(env, R.opts), marks = marksOf(race);
  const T = gTrack(race.rec, race.cuts.map((c) => c.f), opt);
  const { D, cands } = findMoments(race.rec, env, marks);
  const L = env.track.line;
  // Situationen je Bild
  const S = { stand: [], kurve: [], loop: [], flug: [], gerade: [] };
  for (let i = 0; i < T.F; i++) {
    const j = D.idx[i];
    if (D.bad[i]) continue;
    if (Math.abs(D.sp[i]) < 0.3) S.stand.push(T.now[i]);
    else if (D.air[i]) S.flug.push(T.now[i]);
    else if (L.loop[j]) S.loop.push(T.now[i]);
    else if (Math.abs(T.rLat[i]) > 0.5) S.kurve.push(T.now[i]);
    else S.gerade.push(T.now[i]);
  }
  let nan = 0, maxRaw = 0;
  for (let i = 0; i < T.F; i++) { if (!Number.isFinite(T.g[i])) nan++; maxRaw = Math.max(maxRaw, T.raw[i]); }
  const mom = cands.map((m) => { const p = gPeak(T, m.i0, Math.min(T.F - 1, m.i1 + (m.i1 - m.i0 < 30 ? 20 : 8))); return { kind: m.kind, t: m.t0, label: m.label, g: p.g, lat: p.lat, vert: p.vert, raw: T.raw[p.i] }; });
  return { name: R.name, race, T, S, nan, maxRaw, mom, F: T.F };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const agg = { stand: [], kurve: [], loop: [], flug: [], gerade: [] }, kinds = {};
  for (const [k, R] of RUNS.entries()) {
    if (only && !only.includes(k)) continue;
    const r = measureRun(R);
    console.log(`\n=== ${r.name}: ${r.race.state}, ${f1(r.F / REC_HZ)} s, NaN ${r.nan}, roh max ${f1(r.maxRaw)} G`);
    for (const [s, a] of Object.entries(r.S)) { if (a.length) { console.log(`  ${s.padEnd(7)} n=${String(a.length).padStart(5)}  Median ${f1(pct(a, 0.5))}  P90 ${f1(pct(a, 0.9))}  max ${f1(pct(a, 1))} G (angezeigt)`); agg[s].push(...a); } }
    for (const m of r.mom) {
      console.log(`  ${f1(m.t).padStart(6)} s ${m.kind.padEnd(8)} Spitze ${f1(m.g)} G (quer ${f1(m.lat)}, vertikal ${f1(m.vert)}; roh ${f1(m.raw)})  ${m.label}`);
      (kinds[m.kind] || (kinds[m.kind] = [])).push(m.g);
    }
  }
  console.log('\n=== alle Fahrten (angezeigte G) ===');
  for (const [s, a] of Object.entries(agg)) if (a.length) console.log(`  ${s.padEnd(7)} Median ${f1(pct(a, 0.5))}  P90 ${f1(pct(a, 0.9))}  P99 ${f1(pct(a, 0.99))}  max ${f1(pct(a, 1))}`);
  for (const [k, a] of Object.entries(kinds)) console.log(`  ${k.padEnd(8)} Spitzen ${a.map(f1).join(' ')}`);
}
