// n26 Stunt-Maßstab: Fahrten über 80 Zufallsstrecken (30 flach, 25 Gelände, 25 3D, alle Stufen), je Strecke Prüffahrt (Entschärfungen,
// Autopilot-Referenz) und vier Fahrer:
//   leicht-sauber / leicht-brachial – Autopilot auf Leicht (Hände weg), Fahrstil Sauber bzw. Brachial (n25)
//   mittel-handy – Mittel, Bot „mensch-handy“ (tools/mittel_probe.mjs: 0,35 s Reaktion, grobe Lenkstufen, Vollgas außer
//                  bei „Bremsen!“/„langsamer ▼“), Seeds 7 und 8
//   original     – Original ohne Hilfen, Bot „normal“ (tools/fahr_analyse.mjs: 0,1 s Verzögerung, Rauschen, Gas bis 8 %
//                  über Profil, Bremse ab 20 %), Seeds 7 und 8
// Je Stunt-Durchfahrt (Stück-Art) geschafft/gescheitert (Crash, Reset oder Abkürz-Rücksetzer im Stück oder ≤ 25 m danach),
// Schanzen-Landungen (ok/weit/kurz/Crash) und Lippen-Tempo, Crashs je 10 Runden, Rundenzeiten.
// Aufruf: node tools/stunt_mess.mjs [--root=Wurzel] [--von=0] [--n=40] [--json=datei]   (Wurzel = alter Stand zum Vergleich)
//         node tools/stunt_mess.mjs --sum=vorher.json,nachher.json   (Tabelle vorher/nachher)
import fs from 'fs'; import path from 'path'; import url from 'url';
const HERE = path.dirname(url.fileURLToPath(import.meta.url));
const arg = (k, d) => { const a = process.argv.find((s) => s.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const ROOT = path.resolve(arg('root', path.join(HERE, '..')));
const imp = (p) => import(url.pathToFileURL(path.join(ROOT, p)).href);
const DT = 1 / 120;

export const STUNTS = { loop: 'Looping', tube: 'Röhre', tr_corklr: 'Korkenzieher', jump: 'Schanze', waves: 'Wellen', wall: 'Steilwand', halfpipe: 'Halfpipe', crest: 'Kuppe', bumps: 'Bodenwellen', cliff: 'Klippe', cliff2: 'Klippe 2', spiral: 'Spirale', bank: 'Steilkurve', tr_corkud: 'Wendel' };

export function messTracks(generate) {
  const L = [];
  for (const s of [4711, 20260927, 42, 777, 555, 9, 31, 88, 123, 2026]) for (const d of [1, 2, 3]) L.push([`${s}-${d}`, () => generate(s, d)]);
  for (const s of [4711, 20261001, 31, 88, 123, 5150, 64, 2718, 99, 1234, 777, 42, 9, 5, 17, 1000, 2027, 314, 8920, 1038, 1030, 61461, 37704, 26894, 82327])
    L.push([`${s}-${2 + (s % 2)}-g`, () => generate(s, 2 + (s % 2), { gel: true })]);
  for (const s of [20260930, 4711, 1234, 2026, 99, 3141, 42, 555, 777, 88, 64, 31, 5, 17, 1000, 2027, 314, 8920, 1038, 1030, 61461, 37704, 26894, 82327, 11])
    L.push([`${s}-${1 + (s % 3)}-3d`, () => generate(s, 1 + (s % 3), { d3: true })]);
  return L;
}

// Original-Bot „normal“ (wie tools/fahr_analyse.mjs bot('normal'))
function normalBot(rng, seed) {
  const r = rng(seed); let noise = 0, nT = 0; const q = [];
  return (race) => {
    nT -= DT; if (nT <= 0) { noise = r.range(-1, 1); nT = r.range(0.3, 1.2); }
    const ap = race.ap.out;
    q.push(ap.steer); const st = q.length > 12 ? q.shift() : 0;
    const vt = race.env.prof.vt[race.ap.tr.idx], v = race.car.fwdSpeed();
    return { steer: Math.max(-1, Math.min(1, st + noise * 0.15)), throttle: v < vt * 1.08 ? 1 : 0, brake: v > vt * 1.2 ? 0.7 : 0 };
  };
}

// Stunt-Durchfahrten und Schanzen-Landungen mitschreiben (Haken je Schritt nach race.step)
export function stuntHook(out) {
  let s = null;
  return (race) => {
    const env = race.env, L = env.track.line, P = env.track.pieces, ti = race.tracker.idx;
    if (!s || s.race !== race) s = { race, cur: -1, cr: race.crashes, sc: race.shortcuts || 0, left: null, jump: null, prev: ti, air: 0 };
    const pi = L.piece[ti], ty = P[pi] && P[pi].type;
    const failed = race.crashes > s.cr || (race.shortcuts || 0) > s.sc;
    if (failed) {
      // Crash/Rücksetzer: dem Stunt-Stück zuschreiben, in dem das Auto ist, oder dem gerade verlassenen (≤ 25 m)
      const tgt = s.cur >= 0 && STUNTS[P[s.cur].type] ? s.cur : s.left && L.s[s.lastIdx] - s.left.s < 25 ? s.left.pi : -1;
      if (tgt >= 0) {
        const k = P[tgt].type; (out[k] ||= { ok: 0, fail: 0 }).fail++; if (s.left && s.left.pi === tgt && s.left.counted) out[k].ok--;
        const why = race.car.crash ? race.car.crash.reason : (race.shortcuts || 0) > s.sc ? 'Abkürzung' : '?';
        const W = (out.why ||= {}); (W[k] ||= {})[why] = (W[k][why] || 0) + 1;
      }
      s.cr = race.crashes; s.sc = race.shortcuts || 0; s.cur = -1; s.left = null;
      if (s.jump) { out.landungen.push({ v: s.jump.v, kind: 'crash' }); s.jump = null; }
    }
    if (race.state === 'running' && pi !== s.cur) {
      // Stück gewechselt: das verlassene Stunt-Stück vorwärts geschafft
      if (s.cur >= 0 && STUNTS[P[s.cur].type] && (pi === (s.cur + 1) % P.length)) {
        const k = P[s.cur].type; (out[k] ||= { ok: 0, fail: 0 }).ok++;
        s.left = { pi: s.cur, s: L.s[ti], counted: true };
      } else if (s.cur >= 0) s.left = null;
      s.cur = pi;
    }
    s.lastIdx = ti;
    // Schanzen (Standard, nicht Import-Lücken): Lippen-Tempo und Landung relativ zur Landerampe
    for (const j of env.track.jumps) if (!j.gen && (j.landLen || j.cliff) && s.prev < j.lipIdx && ti >= j.lipIdx && ti - s.prev < 20 && race.state === 'running') { s.jump = { j, v: race.car.speed(), t: race.time }; s.air = 0; }
    s.prev = ti;
    if (s.jump) {
      const j = s.jump.j, car = race.car;
      if (car.onGround === 0) s.air += DT;
      else if (s.air > 0.3) {
        const ax = L.px[j.landIdx] - L.px[j.lipIdx], az = L.pz[j.landIdx] - L.pz[j.lipIdx], al = Math.hypot(ax, az);
        const fl = ((car.pos.x - L.px[j.lipIdx]) * ax + (car.pos.z - L.pz[j.lipIdx]) * az) / al - al;
        out.landungen.push({ v: s.jump.v, kind: fl < 0 ? 'kurz' : fl > (j.landLen || 60) ? 'weit' : 'ok', fl, air: s.air, cliff: !!j.cliff }); s.jump = null;
      } else if (race.time - s.jump.t > 7) s.jump = null;
    }
  };
}

async function main() {
  const { generate } = await imp('src/track/generator.js');
  const { verifySync } = await imp('src/track/verify.js');
  const { Race } = await imp('src/game/race.js');
  const { rng } = await imp('src/core/util.js');
  const { runBot } = await imp('tools/mittel_probe.mjs');
  const { MEDIUM_N24 } = await imp('src/game/race.js');
  const list = messTracks(generate), von = +arg('von', 0), n = +arg('n', list.length);
  const res = [];
  for (const [name, mk] of list.slice(von, von + n)) {
    const t0 = Date.now();
    const lay0 = mk();
    if (arg('mit') && !lay0.pieces.some((p) => arg('mit').split(',').includes(p.type))) continue;
    const v = verifySync(lay0);
    const row = { name, ok: v.ok, fixes: v.fixes, ap: v.apTime, runs: {} };
    const types = {}; for (const p of v.layout.pieces) if (STUNTS[p.type]) types[p.type] = (types[p.type] || 0) + 1;
    row.types = types;
    if (!v.env) { res.push(row); continue; }
    const drive = (key, mkRace, ctl, lim) => {
      const out = { landungen: [] }, hook = stuntHook(out), race = mkRace();
      let t = 0;
      while (t < lim && race.state !== 'finished') { race.ap.control(race.car); race.step(DT, ctl(race)); t += DT; race.events.length = 0; hook(race); }
      row.runs[key] = { ok: race.state === 'finished', time: race.finalTime ?? null, crashes: race.crashes, stunts: out };
    };
    const lim = Math.max(150, (v.apTime || 80) * 4);
    const FAHRER = arg('fahrer', 'leicht,original,mittel').split(','), SEEDS = arg('seeds', '7,8').split(',').map(Number);
    if (FAHRER.includes('leicht')) for (const st of ['sauber', 'brachial']) drive('leicht-' + st, () => new Race(v.env, { assist: 'easy', countdown: 0.5, fahrstil: st, seed: 7 }), () => ({ steer: 0, throttle: 0, brake: 0 }), lim);
    if (FAHRER.includes('original')) for (const sd of SEEDS) drive('original-' + sd, () => new Race(v.env, { assist: 'original', countdown: 0.5 }), normalBot(rng, sd), lim);
    if (FAHRER.includes('mittel')) for (const sd of SEEDS) {
      const out = { landungen: [] }, hook = stuntHook(out);
      const r = runBot(v, MEDIUM_N24, 'mensch-handy', sd, (race) => hook(race));
      row.runs['mittel-handy-' + sd] = { ok: r.ok, time: r.time ?? null, crashes: r.crashes, stunts: out };
    }
    res.push(row);
    const brief = Object.entries(row.runs).map(([k, x]) => `${k} ${x.ok ? x.time.toFixed(1) : 'NEIN'}/${x.crashes}`).join(' · ');
    console.log(`${name.padEnd(16)} Prüffahrt ${v.ok ? 'ok' : 'NEIN'} entschärft ${v.fixes} AP ${v.apTime ? v.apTime.toFixed(1) : '–'} | ${brief} (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
  }
  if (arg('json')) fs.writeFileSync(arg('json'), JSON.stringify(res));
}

// Zusammenfassung vorher/nachher
function summary(files) {
  const sets = files.map((f) => JSON.parse(fs.readFileSync(f, 'utf8')).flat());
  const names = ['vorher', 'nachher'];
  const SEEDS = arg('seeds', '7,8').split(',');
  const fahrer = { 'leicht-sauber': ['leicht-sauber'], 'leicht-brachial': ['leicht-brachial'], 'mittel-handy': SEEDS.map((x) => 'mittel-handy-' + x), original: SEEDS.map((x) => 'original-' + x) };
  const pc = (a, b) => (b ? (100 * a / b).toFixed(1).replace('.', ',') + ' %' : '–');
  const lines = [];
  lines.push(`Strecken: ${sets.map((S, i) => `${names[i]} ${S.length} (Prüffahrt ok ${S.filter((r) => r.ok).length}, Entschärfungen ${S.reduce((a, r) => a + r.fixes, 0)})`).join(' · ')}`);
  for (const [fk, keys] of Object.entries(fahrer)) {
    lines.push(`\n### ${fk}`);
    const agg = sets.map((S) => {
      const A = { runs: 0, ok: 0, crashes: 0, st: {}, land: [], time: new Map() };
      for (const r of S) for (const k of keys) { const x = r.runs[k]; if (!x) continue; A.runs++; if (x.ok) { A.ok++; A.time.set(r.name + k, x.time); } A.crashes += x.crashes; for (const [t, o] of Object.entries(x.stunts)) { if (t === 'landungen') { A.land.push(...o); continue; } if (t === 'why') { for (const [st, w] of Object.entries(o)) for (const [rs, c] of Object.entries(w)) { const q = ((A.why ||= {})[st] ||= {}); q[rs] = (q[rs] || 0) + c; } continue; } const a = A.st[t] || (A.st[t] = { ok: 0, fail: 0 }); a.ok += o.ok; a.fail += o.fail; } }
      return A;
    });
    lines.push('| | ' + names.join(' | ') + ' |\n|---|---|---|');
    lines.push(`| im Ziel | ${agg.map((A) => `${A.ok}/${A.runs}`).join(' | ')} |`);
    lines.push(`| Crashs je 10 Runden | ${agg.map((A) => (A.crashes / A.runs * 10).toFixed(1).replace('.', ',')).join(' | ')} |`);
    // Rundenzeit: Summe über Fahrten, die in beiden im Ziel sind
    const both = [...agg[0].time.keys()].filter((k) => agg[1] && agg[1].time.has(k));
    if (agg[1]) { const a = both.reduce((s, k) => s + agg[0].time.get(k), 0), b = both.reduce((s, k) => s + agg[1].time.get(k), 0); lines.push(`| Rundenzeit (Summe, ${both.length} Fahrten in beiden im Ziel) | ${a.toFixed(0)} s | ${b.toFixed(0)} s (${((b / a - 1) * 100).toFixed(1).replace('.', ',')} %) |`); }
    const types = [...new Set(agg.flatMap((A) => Object.keys(A.st)))].sort();
    const W = (A, t) => (process.argv.includes('--why') && A.why && A.why[t] ? ' ' + Object.entries(A.why[t]).map(([k, c]) => k + ' ' + c).join(', ') : '');
    for (const t of types) lines.push(`| ${STUNTS[t] || t}: geschafft | ${agg.map((A) => { const a = A.st[t] || { ok: 0, fail: 0 }; return `${pc(a.ok, a.ok + a.fail)} (${a.ok}/${a.ok + a.fail})${W(A, t)}`; }).join(' | ')} |`);
    lines.push(`| Schanzen-Landungen ok / weit / kurz / Crash | ${agg.map((A) => { const J = A.land.filter((x) => !x.cliff), c = (k) => J.filter((x) => x.kind === k).length; return `${c('ok')} / ${c('weit')} / ${c('kurz')} / ${c('crash')} (${pc(c('ok'), J.length)})`; }).join(' | ')} |`);
    lines.push(`| Klippen-Landungen ok / weit / kurz / Crash | ${agg.map((A) => { const J = A.land.filter((x) => x.cliff), c = (k) => J.filter((x) => x.kind === k).length; return `${c('ok')} / ${c('weit')} / ${c('kurz')} / ${c('crash')}`; }).join(' | ')} |`);
    lines.push(`| Lippen-Tempo Schanze Median (km/h) | ${agg.map((A) => { const v = A.land.filter((x) => !x.cliff).map((x) => x.v * 3.6).sort((a, b) => a - b); return v.length ? v[v.length >> 1].toFixed(0) : '–'; }).join(' | ')} |`);
    lines.push(`| Flugzeit Schanze Median (s) | ${agg.map((A) => { const v = A.land.filter((x) => !x.cliff && x.air).map((x) => x.air).sort((a, b) => a - b); return v.length ? v[v.length >> 1].toFixed(2).replace('.', ',') : '–'; }).join(' | ')} |`);
  }
  console.log(lines.join('\n'));
}

if (process.argv[1] && path.resolve(process.argv[1]) === url.fileURLToPath(import.meta.url)) {
  if (arg('sum')) summary(arg('sum').split(','));
  else await main();
}
