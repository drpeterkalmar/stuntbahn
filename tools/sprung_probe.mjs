// n24 Mittel: Sprünge mit menschenähnlichen Bots messen (tools/mittel_probe.mjs runBot). Je Schanze (n21, nicht Import-
// Lücken): Tempo an der Lippe (echte km/h), Landung relativ zur Landerampe – „ok“ (auf der Rampe), „weit“ (hinter dem Ende
// der Rampe), „kurz“ (Crash „Zu kurz“ bzw. vor der Rampe), dazu Crashs in der Sprung-Zone, Rundenzeit, Ziel.
// Aufruf: node tools/sprung_probe.mjs [--var=n23,n24] [--bot=mensch-handy,mensch-voll] [--n=10] [--seeds=7,8,9] [--json=datei]
import fs from 'fs'; import path from 'path'; import url from 'url';
const HERE = path.dirname(url.fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const imp = (p) => import(url.pathToFileURL(path.join(ROOT, p)).href);
const { runBot, VARS } = await imp('tools/mittel_probe.mjs');
const { generate } = await imp('src/track/generator.js');
const { verifySync } = await imp('src/track/verify.js');
const { MEDIUM_N23, MEDIUM_N24 } = await imp('src/game/race.js');
const { JUMP_PULL } = await imp('src/game/jumpassist.js');
const arg = (k, d) => { const a = process.argv.find((s) => s.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };

// n23 = Stand bis n23: neue Regler ausdrücklich aus (runBot mischt die Werte in ASSISTS.medium)
export const N23_OFF = { vSoft: 0, vTop: 0, thrRamp: 0, jumpPull: 0, jumpHint: 0 };
// Sprung-Hilfe abstimmen: --pull=aH:3.5,gDown:2
for (const kv of (arg('pull', '') || '').split(',').filter(Boolean)) { const [k, v] = kv.split(':'); JUMP_PULL[k] = +v; }
export const SVARS = { n23: { ...MEDIUM_N23, ...N23_OFF }, n24: { ...(MEDIUM_N24 || MEDIUM_N23) } };
for (const x of (arg('extra', '') || '').split(';').filter(Boolean)) { const o = {}; for (const kv of x.split(',')) { const [k, v] = kv.split(':'); o[k] = +v; } SVARS[x.replace(/,/g, ' ')] = { ...(MEDIUM_N24 || MEDIUM_N23), ...o }; }

// Strecken mit Standard-Schanzen: flach (Irre/Sportlich), Hochstraße, Gelände – die ersten n mit mindestens einer Schanze
export function jumpTracks(n = 10) {
  const out = [];
  const cand = [];
  for (const s of [4711, 20260927, 42, 777, 555, 9, 1234, 2026, 31, 88, 123, 5150, 64, 2718, 99]) for (const [d, o] of [[3, {}], [2, {}], [3, { gel: true }], [2, { d3: true }]]) cand.push([s, d, o]);
  for (const [s, d, o] of cand) {
    if (out.length >= n) break;
    const lay = generate(s, d, o);
    const v = verifySync(lay);
    if (!v.env || !v.env.track.jumps.some((j) => !j.gen)) continue;
    out.push([`${s}-${d}${o.gel ? '-g' : o.d3 ? '-3d' : ''}`, v]);
  }
  return out;
}

// Messung je Fahrt: Hook für runBot
function jumpHook(stats) {
  let st = null;
  return (race) => {
    const L = race.env.track.line, J = race.env.track.jumps.filter((j) => !j.gen), car = race.car, ti = race.tracker.idx;
    if (!st || st.race !== race) st = { race, at: null, prevIdx: ti, airT: 0, crashes: race.crashes };
    // Lippe überfahren: Tempo merken, Sprung beginnt
    for (const j of J) if (st.prevIdx < j.lipIdx && ti >= j.lipIdx && ti - st.prevIdx < 20 && race.state === 'running') st.at = { j, v: car.speed(), t: race.time, crashes: race.crashes };
    st.prevIdx = ti;
    if (!st.at) return;
    const j = st.at.j;
    if (car.onGround === 0) st.airT += 1 / 120;
    const ax = L.px[j.landIdx] - L.px[j.lipIdx], az = L.pz[j.landIdx] - L.pz[j.lipIdx], al = Math.hypot(ax, az) || 1;
    const x = ((car.pos.x - L.px[j.lipIdx]) * ax + (car.pos.z - L.pz[j.lipIdx]) * az) / al;
    const done = (kind, fl) => { stats.push({ v: st.at.v * 3.6, kind, fl, air: st.airT, why: car.crash ? car.crash.reason : '' }); st.at = null; st.airT = 0; };
    if (race.crashes > st.at.crashes || race.state !== 'running') { done(car.crash && car.crash.reason === 'Zu kurz' ? 'kurz' : 'crash', null); return; }
    if (car.onGround > 0 && st.airT > 0.3) {
      const fl = x - al;   // Landung relativ zur Vorderkante der Landerampe (m)
      done(fl < 0 ? 'kurz' : fl > j.landLen ? 'weit' : 'ok', fl);
      return;
    }
    if (race.time - st.at.t > 6) { st.at = null; st.airT = 0; }
  };
}

const f0 = (x) => Math.round(x);
if (process.argv[1] && path.resolve(process.argv[1]) === url.fileURLToPath(import.meta.url)) {
  const vars = arg('var', 'n23,n24').split(',').concat(Object.keys(SVARS).filter((k) => k.includes(':'))), bots = arg('bot', 'mensch-handy,mensch-voll').split(',');
  const seeds = arg('seeds', '7,8,9').split(',').map(Number);
  const tracks = jumpTracks(+arg('n', 10));
  console.log('Strecken:', tracks.map(([n, v]) => `${n} (${v.env.track.jumps.filter((j) => !j.gen).length} Schanzen)`).join(', '));
  const out = {};
  for (const bot of bots) for (const k of vars) {
    const stats = [], hook = jumpHook(stats);
    let ok = 0, runs = 0, tsum = 0, cr = 0;
    for (const [, v] of tracks) {
      const r = runBot(v, SVARS[k], bot, seeds, hook);
      ok += r.okN; runs += r.runs; cr += r.crashes; if (r.ok) tsum += r.time / r.ap;
    }
    const n = stats.length, c = (kd) => stats.filter((s) => s.kind === kd).length;
    const vs = stats.map((s) => s.v).sort((a, b) => a - b), q = (p) => vs.length ? vs[Math.min(vs.length - 1, Math.floor(p * vs.length))] : 0;
    const res = { n, ok: c('ok'), weit: c('weit'), kurz: c('kurz'), crash: c('crash'), vMed: q(0.5), v10: q(0.1), v90: q(0.9), vMax: vs[vs.length - 1] || 0, ziel: `${ok}/${runs}`, crashes: cr, zeit: tsum / tracks.length };
    (out[bot] ||= {})[k] = res;
    if (process.argv.includes('--detail')) for (const x of stats) if (x.kind !== 'ok') console.log('   ', x.kind, 'Lippe', f0(x.v), 'km/h', 'Landung', x.fl == null ? '–' : x.fl.toFixed(1), 'm', 'Flug', x.air.toFixed(2), 's', x.why || '');
    console.log(`${bot.padEnd(13)} ${k.padEnd(10)} Sprünge ${n}: ok ${res.ok} (${(res.ok / Math.max(1, n) * 100).toFixed(0)} %), weit ${res.weit}, kurz ${res.kurz}, Crash ${res.crash} · Lippe km/h echt P10/Median/P90/max ${f0(res.v10)}/${f0(res.vMed)}/${f0(res.v90)}/${f0(res.vMax)} · Ziel ${res.ziel}, Crashs ${cr}, Zeit/Autopilot ${res.zeit.toFixed(2)}`);
  }
  if (arg('json')) fs.writeFileSync(arg('json'), JSON.stringify(out, null, 1));
}
