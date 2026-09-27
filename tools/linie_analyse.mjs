// Linien-Analyse (Node): Nutzt die Ideallinie die Kurvenscheitel? Laufzeit des Lösers, Abweichung zur
// voll konvergierten Referenz, Autopilot-Runden auf allen drei Fahrhilfe-Stufen (Zeit, Crashs, Sprünge).
// Aufruf: node tools/linie_analyse.mjs [--laps] [--ref=60000] [--json=datei] [--only=Name]
// --ref=N: alte Relaxation (N Schritte) ab der neuen Lösung; „Abw.“ = wie weit sie sich noch bewegt
// Strecken: Demo, Showcase, 5 generierte Seeds, 3 .TRK (Oval, Schotter, größte Korpus-Strecke falls lokal).
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { buildTrack } from '../src/track/build.js';
import { computeIdeal, stuntBounds } from '../src/ai/ideal.js';
import { computeIdeal as computeIdealRelax } from './ideal_relax_alt.mjs';
import { generate, demoLayout } from '../src/track/generator.js';
import { parseTrk } from '../src/track/trk.js';
import { trkToLayout } from '../src/track/trkimport.js';
import { showcaseBytes } from '../src/track/showcase.js';
import { TrackDesigner } from '../src/track/trkdesign.js';
import { prepare } from '../src/track/verify.js';
import { Race } from '../src/game/race.js';
import { fmtTime } from '../src/core/util.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (k, d) => { const a = args.find((x) => x.startsWith('--' + k + '=')); return a ? a.slice(k.length + 3) : (args.includes('--' + k) ? true : d); };
const LAPS = !!opt('laps', false), REF = +opt('ref', 0), ONLY = opt('only', ''), JSON_OUT = opt('json', '');

export function tracks() {
  const trk = (name, bytes) => ({ name, layout: trkToLayout(parseTrk(bytes, name)).layout });
  const rect = (w, h, surf) => {
    const t = new TrackDesigner(5, 5, 0, surf);
    t.put('sf').road(w).put('large', { turn: 'R' }).road(h).put('large', { turn: 'R' }).road(w + 1).put('large', { turn: 'R' }).road(h).put('large', { turn: 'R' });
    return t.bytes(1);
  };
  const list = [
    { name: 'Demo', layout: demoLayout() },
    trk('Showcase', showcaseBytes('demo-rundkurs')),
  ];
  for (const [s, d] of [[7, 2], [42, 3], [20260927, 2], [4711, 3], [1000, 1]]) list.push({ name: `Seed ${s}/${d}`, layout: generate(s, d) });
  list.push(trk('OVAL.TRK', rect(6, 3)), trk('SCHOTTER.TRK', rect(8, 4, 'dirt')));
  // größte Korpus-Strecke (nur lokal, Archiv nie im Repo; 20 km, per Suche über alle Dateien ermittelt)
  const big = path.join(ROOT, 'trk_local/zakpack/Tracks/l/1/LONG_GO2.TRK');
  if (fs.existsSync(big)) list.push(trk('LONG_GO2.TRK (Korpus, 20 km)', fs.readFileSync(big)));
  return ONLY ? list.filter((t) => t.name.includes(ONLY)) : list;
}

// Kurven der Basislinie und Scheitel-Nutzung einer Linie: je Kurve der größte Anteil der inneren Hälfte
// bis zur Grenze bnd (100 % = Linie am inneren Sicherheitsabstand) und der Abstand Linie → Innenkante (m).
export function apexUsage(L, off, bnd) {
  const n = L.n, W = 6;
  const kap = new Float32Array(n);
  for (let i = W; i < n - W; i++) {
    const ds = L.s[i + W] - L.s[i - W] || 1;
    kap[i] = ((L.tx[i + W] - L.tx[i - W]) * L.bx[i] + (L.ty[i + W] - L.ty[i - W]) * L.by[i] + (L.tz[i + W] - L.tz[i - W]) * L.bz[i]) / ds;
  }
  const corners = [];
  let i = 0;
  while (i < n) {
    if (Math.abs(kap[i]) > 1 / 60 && !L.loop[i] && !L.tube[i] && !L.air[i]) {
      let j = i, best = i;
      while (j < n && Math.abs(kap[j]) > 1 / 60 && Math.sign(kap[j]) === Math.sign(kap[i]) && !L.loop[j] && !L.tube[j] && !L.air[j]) { if (Math.abs(kap[j]) > Math.abs(kap[best])) best = j; j++; }
      if (L.s[j - 1] - L.s[i] > 6) {
        const sg = Math.sign(kap[best]);
        // nur Kurven auf normaler Fahrbahn (innere Grenze > 1,5 m); in Stunt-/Steilkurven-Abschnitten ist die
        // Linie absichtlich auf die Bausteinspur verengt
        let use = -1, gap = 1e9;
        for (let k = i; k <= j - 1; k++) {
          const inner = sg > 0 ? bnd.hi[k] : -bnd.lo[k];
          if (inner > 1.5) { const u = (off[k] * sg) / inner; if (u > use) use = u; }
          gap = Math.min(gap, L.hw[k] - off[k] * sg);
        }
        if (use > -1) corners.push({ R: 1 / Math.abs(kap[best]), use, gap });
      }
      i = j;
    } else i++;
  }
  return corners;
}

function lineStats(L, off, bnd) {
  const c = apexUsage(L, off, bnd);
  let maxOff = 0;
  for (let i = 0; i < L.n; i++) maxOff = Math.max(maxOff, Math.abs(off[i]));
  const avg = (a) => a.length ? a.reduce((p, q) => p + q, 0) / a.length : NaN;
  const u = c.map((x) => x.use);
  return { corners: c.length, mean: avg(u), touch: u.filter((x) => x >= 0.95).length, tight: avg(c.filter((x) => x.R < 20).map((x) => x.use)), gap: avg(c.map((x) => x.gap)), maxOff };
}

const DT = 1 / 120;
// Autopilot-Runde auf einer Stufe: Leicht ohne Eingabe, Mittel/Original mit Autopilot-Eingabe („perfekter Spieler“)
function lap(env, assist) {
  const race = new Race(env, { assist, countdown: 0.05 });
  const L = env.track.line;
  const maxT = Math.max(90, L.total / 7);
  const jumps = env.track.jumps.map((j, k) => ({ j, w: env.prof.windows[k], vLip: null, ok: null, air: 0 }));
  let t = 0, crashes = [];
  while (t < maxT && race.state !== 'finished') {
    let inp = { steer: 0, throttle: 0, brake: 0 };
    if (assist !== 'easy') { const o = race.ap.control(race.car); inp = { steer: o.steer, throttle: o.throttle, brake: o.brake }; }
    const prev = race.tracker.idx;
    race.step(DT, inp); t += DT;
    const ti = race.tracker.idx;
    for (const J of jumps) {
      if (J.vLip === null && prev <= J.j.lipIdx && ti > J.j.lipIdx && ti < J.j.lipIdx + 200) J.vLip = race.car.speed();
      if (J.vLip !== null && J.ok === null) {
        if (race.car.onGround === 0) J.air += DT;
        else if (J.air > 0.25) J.ok = !L.air[ti] && ti >= J.j.landIdx - 2;
      }
    }
    for (const e of race.events) if (e.type === 'crash') crashes.push(`${e.reason}@${Math.round(L.s[race.tracker.idx])}m`);
    race.events.length = 0;
  }
  const jumpOk = jumps.filter((J) => J.ok).length;
  const inWin = jumps.filter((J) => J.w && J.vLip !== null && J.vLip >= J.w.vmin - 0.3 && J.vLip <= J.w.vmax + 0.3).length;
  return { ok: race.state === 'finished', time: race.state === 'finished' ? race.finalTime : null, crashes, jumps: jumps.length, jumpOk, inWin };
}

const out = [];
if (import.meta.url === `file://${process.argv[1]}`) {
  const list = tracks();
  console.log('| Strecke | Länge | Kurven | Scheitel-Nutzung vorher → nachher | davon ≥ 95 % | eng (R < 20 m) | Abstand Linie–Innenkante am Scheitel | max. Versatz | Löser vorher → nachher | Fixpunkt-Test |');
  console.log('|---|---|---|---|---|---|---|---|---|---|');
  for (const T of list) {
    const track = buildTrack(T.layout, { treeCount: 0 });
    const L = track.line, bnd = stuntBounds(L, track);
    computeIdeal(L, { track }); // Aufwärmen (JIT)
    const ts = [];
    let I;
    for (let r = 0; r < 5; r++) { const t0 = performance.now(); I = computeIdeal(L, { track }); ts.push(performance.now() - t0); }
    ts.sort((a, b) => a - b);
    let t0 = performance.now();
    const O = computeIdealRelax(L);                  // alter Löser, wie bis 27.09. im Spiel (1400 Schritte)
    const tOld = performance.now() - t0;
    const st = lineStats(L, I.off, bnd), so = lineStats(L, O.off, bnd);
    let dev = '';
    if (REF) {
      // Fixpunkt-Test: alte Relaxation, gestartet auf der neuen Lösung – bewegt sie sich, war es kein Optimum
      const at = (s) => { let i = 0; while (i < L.n - 2 && L.s[i + 1] < s) i++; const t = Math.max(0, Math.min(1, (s - L.s[i]) / ((L.s[i + 1] - L.s[i]) || 1))); return I.off[i] + (I.off[i + 1] - I.off[i]) * t; };
      const R = computeIdealRelax({ ...L, ...bnd }, { iters: REF, init: at });
      let d = 0; for (let i = 0; i < L.n; i++) d = Math.max(d, Math.abs(R.off[i] - I.off[i]));
      dev = `${(d * 100).toFixed(1)} cm`;
    }
    const pc = (x) => isNaN(x) ? '–' : `${Math.round(x * 100)} %`;
    const row = { name: T.name, km: L.total / 1000, neu: st, alt: so, ms: ts[2], msOld: tOld, dev };
    console.log(`| ${T.name} | ${Math.round(L.total)} m | ${st.corners} | ${pc(so.mean)} → **${pc(st.mean)}** | ${so.touch} → ${st.touch} | ${pc(so.tight)} → ${pc(st.tight)} | ${so.gap.toFixed(2)} → ${st.gap.toFixed(2)} m | ${so.maxOff.toFixed(2)} → ${st.maxOff.toFixed(2)} m | ${tOld.toFixed(0)} → ${ts[2].toFixed(1)} ms | ${dev} |`);
    if (LAPS) {
      const env = prepare(T.layout, { treeCount: 0 });
      row.laps = {};
      for (const a of ['easy', 'medium', 'original']) row.laps[a] = lap(env, a);
    }
    out.push(row);
  }
  if (LAPS) {
    console.log('\n| Strecke | Leicht | Mittel | Original | Crashs | Sprünge gelandet / im Tempo-Fenster |');
    console.log('|---|---|---|---|---|---|');
    for (const r of out) {
      const f = (x) => x.ok ? fmtTime(x.time) : '✗';
      const cr = ['easy', 'medium', 'original'].map((a) => r.laps[a].crashes.length ? `${a}: ${r.laps[a].crashes.join(', ')}` : '').filter(Boolean).join('; ') || '0';
      const j = ['easy', 'medium', 'original'].map((a) => `${r.laps[a].jumpOk}/${r.laps[a].inWin}/${r.laps[a].jumps}`).join(' · ');
      console.log(`| ${r.name} | ${f(r.laps.easy)} | ${f(r.laps.medium)} | ${f(r.laps.original)} | ${cr} | ${j} |`);
    }
  }
  if (JSON_OUT) fs.writeFileSync(JSON_OUT, JSON.stringify(out, null, 1));
}
