// n33 Original-Stunt-Hindernisse: Fahrbarkeit messen (Node, ohne Browser). Muster: tools/roehre_mess.mjs.
//   fest    – Teststrecke (Start, 4 Geraden, Element, 4 Geraden; flach und auf Ebene 1), Auto 60 m vor dem Element mit
//             festem Tempo (Lenkung Autopilot, Tempo gehalten). Zickzack: Crash, kleinster Abstand Karosserie ↔ Blockfläche.
//             Röhre mit Wand: Crash, Abwurf (längste Zeit ohne Radkontakt in der Rolle), Lage (up.y min, −1 = kopfüber),
//             Abstand Dach ↔ Oberkante der Wand beim Überfahren. Dazu je Element das Tempo-Fenster aus dem Profil
//             (vmin/vt in der Rolle bzw. am Block) und eine Fahrt mit dem Autopiloten (Profil-Tempo).
//   fahrer  – Zufallsstrecken der Generator-Version 2 mit neuen Elementen: Prüffahrt, Leicht Sauber/Brachial (Autopilot),
//             Mittel „mensch-handy“ und Original „normal“ (Seeds), je Element geschafft/gescheitert (stunt_mess.mjs stuntHook).
//   quote   – Lösbarkeit: Prüffahrt mit Entschärfen über Seeds × Stufen × Streckenart, Generator-Version 1 gegen 2
//             (ok, ok ohne Entschärfen, Entschärfungen, neue Elemente gesetzt/entschärft). In Häppchen (--von/--n), weil
//             jeder Aufruf kurz bleiben soll; --json hängt an.
// Aufruf: node tools/hindernis_mess.mjs fest [--el=zigzag,zigzag2,tube_wall] [--kmh=40,60,…]
//         node tools/hindernis_mess.mjs fahrer [--art=flat|3d|gel] [--von=0] [--n=4] [--seeds=7,8] [--json=datei]
//         node tools/hindernis_mess.mjs quote [--art=flat|3d|gel] [--d=1,2,3] [--von=0] [--n=10] [--gv=1,2] [--json=datei]
//         node tools/hindernis_mess.mjs --sum=datei.json (Zusammenfassung quote/fahrer)
import fs from 'fs'; import path from 'path'; import url from 'url';
const HERE = path.dirname(url.fileURLToPath(import.meta.url));
const arg = (k, d) => { const a = process.argv.find((s) => s.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const ROOT = path.resolve(arg('root', path.join(HERE, '..')));
const imp = (p) => import(url.pathToFileURL(path.join(ROOT, p)).href);
const DT = 1 / 120;
const CAR_HW = 1.0, CAR_HL = 2.35, ROOF = 0.78;   // halbe Breite/Länge der Karosserie, Dach über der Wagenmitte (car.js PROBES)
const NEU = ['zigzag', 'zigzag2', 'tube_wall', 'spiral', 'tube', 'loop'];   // dazu Röhre/Looping zum Vergleich

// Beobachter je Simulationsschritt für die Hindernis-Stücke der Strecke (track.obstacles)
export function obstWatch(track) {
  const out = [], HW = track.line.hw ? null : null; void HW;
  const st = new Map();
  const loc = (o, p) => { const dx = p.x - o.E[0], dz = p.z - o.E[2]; return { f: dx * o.F[0] + dz * o.F[2], r: dx * o.R[0] + dz * o.R[2], y: p.y - o.base }; };
  const step = (car, idx, crashes) => {
    for (const o of track.obstacles || []) {
      const inside = idx >= o.idx0 - 5 && idx <= o.idx1 + 5;
      let c = st.get(o);
      if (!c && inside && !car.crash) { c = { o, v0: car.speed(), clear: 1e9, upMin: 1, airRoll: 0, airMax: 0, wallClear: null, vTop: null, vMin: 1e9, vMax: 0, cr: crashes, crash: false }; st.set(o, c); }
      if (!c) continue;
      const q = loc(o, car.pos);
      c.vMin = Math.min(c.vMin, car.speed()); c.vMax = Math.max(c.vMax, car.speed());
      if (o.kind === 'zigzag') {
        // Umriss der Karosserie (Ecken + Kantenmitten, Wagenrahmen) gegen die Blöcke (Rechtecke in Stück-Koordinaten):
        // kleinster Abstand Umriss ↔ Block (< 0 = Überlappung)
        const fr = car.frame, pts = [];
        for (const [a, b] of [[1, 1], [1, -1], [-1, 1], [-1, -1], [1, 0], [-1, 0], [0, 1], [0, -1], [0.5, 1], [-0.5, 1], [0.5, -1], [-0.5, -1]]) {
          pts.push(loc(o, { x: car.pos.x + fr.r.x * a * CAR_HW - fr.f.x * b * CAR_HL, y: 0, z: car.pos.z + fr.r.z * a * CAR_HW - fr.f.z * b * CAR_HL }));
        }
        for (const b of o.blocks) {
          if (Math.abs(q.f - b.f) > b.lb / 2 + CAR_HL + 3) continue;
          const face = track.roadHW - b.d, f0 = b.f - b.lb / 2, f1 = b.f + b.lb / 2;
          for (const p of pts) {
            const dr = b.side > 0 ? face - p.r : p.r + face;          // > 0: auf der freien Seite der Blockfläche
            const df = Math.max(f0 - p.f, p.f - f1);                    // > 0: vor/hinter dem Block
            const d = df > 0 && dr > 0 ? Math.hypot(df, dr) : Math.max(df, dr);
            c.clear = Math.min(c.clear, d);
          }
        }
      } else if (o.kind === 'tube_wall') {
        if (q.f > o.fr0 && q.f < o.fr1) {
          c.upMin = Math.min(c.upMin, car.frame.u.y);
          if (car.onGround === 0) { c.airRoll += DT; c.airMax = Math.max(c.airMax, c.airRoll); } else c.airRoll = 0;
        }
        if (c.wallClear == null && q.f >= o.f) { c.wallClear = q.y - ROOF * Math.max(0, -car.frame.u.y) - o.top; c.vTop = car.speed(); }
      }
      if (crashes > c.cr || car.crash) c.crash = (car.crash && car.crash.reason) || 'Reset';
      if (c.crash || idx > o.idx1 + 5) { out.push({ kind: o.kind, piece: o.piece, v0: c.v0, clear: c.clear, upMin: c.upMin, airMax: c.airMax, wallClear: c.wallClear, vTop: c.vTop, vMin: c.vMin, vMax: c.vMax, crash: c.crash }); st.delete(o); if (c.crash) st.set(o, { done: true, o, cr: 1e9 }); }
    }
  };
  return { step, out };
}

async function fest() {
  const { chain, setup } = await imp('tests/node/common.mjs');
  const { Car } = await imp('src/physics/car.js');
  const { Autopilot } = await imp('src/ai/autopilot.js');
  const { ROAD_HW } = await imp('src/track/defs.js');
  await imp('src/track/generator.js');
  const els = arg('el', 'zigzag,zigzag2,tube_wall').split(',');
  const rows = [];
  for (const el of els) for (const lvl of [0, 1]) {
    const list = lvl ? ['start', 'straight', 'rampUp', 'straight', 'straight', el, 'straight', 'straight', 'rampDown', 'straight', 'straight'] : ['start', 'straight', 'straight', 'straight', 'straight', el, 'straight', 'straight', 'straight', 'straight'];
    const c = chain(3, 15, 0, list);
    const env = setup({ pieces: c.pieces, seed: 1 });
    const { track, world, ideal: L, prof } = env;
    track.roadHW = ROAD_HW;
    const o = track.obstacles[0];
    // Profil: Tempo-Fenster am Element
    let vtMin = 1e9, vmReq = 0, vtMax = 0;
    const r0 = o.kind === 'tube_wall' ? o.idxR0 : o.idx0, r1 = o.kind === 'tube_wall' ? o.idxR1 : o.idx1;
    for (let i = r0; i <= r1; i++) { vtMin = Math.min(vtMin, prof.vt[i]); vtMax = Math.max(vtMax, prof.vmax[i]); vmReq = Math.max(vmReq, prof.vmin[i]); }
    let vmaxMin = 1e9; for (let i = r0; i <= r1; i++) vmaxMin = Math.min(vmaxMin, prof.vmax[i]);
    let offA = 0; for (let i = o.idx0; i <= o.idx1; i++) offA = Math.max(offA, Math.abs(L.off[i]));
    console.log(`\n${el} ${lvl ? 'Ebene 1' : 'flach'}: Profil im Element vmin ${(vmReq * 3.6).toFixed(0)} km/h, vmax ${(vmaxMin * 3.6).toFixed(0)} km/h, Plan-Tempo min ${(vtMin * 3.6).toFixed(0)} km/h, Linien-Versatz bis ${offA.toFixed(2)} m`);
    const kmhs = arg('kmh', o.kind === 'zigzag' ? '40,50,60,70,80,90,100,120' : '40,50,55,60,65,70,80,90,100,110,120').split(',').map(Number);
    const run = (v) => {
      const car = new Car();
      let si = o.idx0; while (si > 0 && L.s[o.idx0] - L.s[si] < 60) si--;
      car.place([L.px[si], L.py[si], L.pz[si]], [L.tx[si], L.ty[si], L.tz[si]], [L.nx[si], L.ny[si], L.nz[si]], v || 0);
      const ap = new Autopilot(L, prof); ap.tr.reset(si);
      const W = obstWatch(track);
      let t = 0;
      while (t < 25 && !W.out.length) {
        const u = ap.control(car), fv = car.fwdSpeed();
        car.input.steer = u.steer;
        if (v) { car.input.throttle = fv < v ? 1 : 0; car.input.brake = fv > v + 1.5 ? 0.4 : 0; } else { car.input.throttle = u.throttle; car.input.brake = u.brake; }
        car.surfaceKind = L.loop[ap.tr.idx] || L.tube[ap.tr.idx] ? 1 : 0;
        car.haftOff = false;
        car.step(DT, world); t += DT;
        W.step(car, ap.tr.idx, 0);
        if (car.crash) { W.step(car, ap.tr.idx, 1); break; }
      }
      return W.out[0] || { kind: o.kind, crash: car.crash ? car.crash.reason : 'nicht erreicht', v0: v };
    };
    for (const kmh of [...kmhs, 0]) {
      const r = run(kmh / 3.6);
      rows.push({ el, lvl, kmh: kmh || 'AP', ...r });
      const head = `${kmh ? String(kmh).padStart(3) + ' km/h' : 'Autopilot'}`;
      if (o.kind === 'zigzag') console.log(`  ${head}  Tempo ${(r.vMin * 3.6).toFixed(0)}–${(r.vMax * 3.6).toFixed(0)} km/h  Abstand zum Block min ${r.clear < 1e8 ? r.clear.toFixed(2) + ' m' : '–'}  ${r.crash ? 'CRASH ' + r.crash : 'ok'}`);
      else console.log(`  ${head}  oben ${r.vTop != null ? (r.vTop * 3.6).toFixed(0) : '–'} km/h  Abwurf (ohne Radkontakt) max ${(r.airMax ?? 0).toFixed(2)} s  up.y min ${(r.upMin ?? 1).toFixed(2)}  Dach über Wand ${r.wallClear != null ? r.wallClear.toFixed(2) + ' m' : '–'}  ${r.crash ? 'CRASH ' + r.crash : 'ok'}`);
    }
  }
  if (arg('json')) fs.writeFileSync(arg('json'), JSON.stringify(rows));
  return rows;
}

// Zufallsstrecken der Version gv mit Element-Typen
function trackList(generate, art, gv) {
  const list = [];
  const D = arg('d', '1,2,3').split(',').map(Number);
  for (let k = 0; k < 400; k++) for (const d of D) {
    const s = 3000 + k * 97;
    const o = art === '3d' ? { d3: true } : art === 'gel' ? { gel: true } : {};
    list.push([`${s}-${d}${art === '3d' ? '-3d' : art === 'gel' ? '-g' : ''}${gv > 1 ? 'h' : ''}`, () => generate(s, d, { ...o, gv }), s, d]);
  }
  return list;
}
const countNew = (pieces) => { const c = {}; for (const p of pieces) if (NEU.includes(p.type)) c[p.type] = (c[p.type] || 0) + 1; return c; };

async function quote() {
  const { generate } = await imp('src/track/generator.js');
  const { verifySync } = await imp('src/track/verify.js');
  const art = arg('art', 'flat'), von = +arg('von', 0), n = +arg('n', 10);
  const res = [];
  for (const gv of arg('gv', '1,2').split(',').map(Number)) {
    for (const [name, mk, s, d] of trackList(generate, art, gv).slice(von, von + n)) {
      const t0 = Date.now(), lay = mk(), c0 = countNew(lay.pieces), lay0 = JSON.parse(JSON.stringify(lay));
      const v0 = verifySync(JSON.parse(JSON.stringify(lay)), 0);
      const v = v0.ok ? v0 : verifySync(lay);
      const c1 = countNew(v.layout.pieces);
      res.push({ art, gv, s, d, name, ok: v.ok, ok0: v0.ok, fixes: v.fixes, ap: v.apTime, neu0: c0, neu1: c1, why0: v0.ok ? null : v0.reason, at0: v0.ok ? null : (lay0.pieces[v0.piece] || {}).type });
      console.log(`${name.padEnd(14)} v${gv} ${v.ok ? 'ok' : 'NEIN'}${v0.ok ? '' : ` (Prüffahrt erst nach ${v.fixes} Entschärfung(en); zuerst ${v0.reason} an ${(lay0.pieces[v0.piece] || {}).type})`} neu ${JSON.stringify(c0)}${JSON.stringify(c1) !== JSON.stringify(c0) ? ' → ' + JSON.stringify(c1) : ''} (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
    }
  }
  if (arg('json')) { const f = arg('json'); const old = fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : []; fs.writeFileSync(f, JSON.stringify(old.concat(res))); }
}

async function fahrer() {
  const { generate } = await imp('src/track/generator.js');
  const { verifySync } = await imp('src/track/verify.js');
  const { Race, MEDIUM_N24 } = await imp('src/game/race.js');
  const { rng } = await imp('src/core/util.js');
  const { ROAD_HW } = await imp('src/track/defs.js');
  const { runBot } = await imp('tools/mittel_probe.mjs');
  const { stuntHook } = await import(url.pathToFileURL(path.join(HERE, 'stunt_mess.mjs')).href);
  const art = arg('art', 'flat'), von = +arg('von', 0), n = +arg('n', 4);
  const SEEDS = arg('seeds', '7,8').split(',').map(Number);
  const normalBot = (seed) => {
    const r = rng(seed); let noise = 0, nT = 0; const q = [];
    return (race) => {
      nT -= DT; if (nT <= 0) { noise = r.range(-1, 1); nT = r.range(0.3, 1.2); }
      q.push(race.ap.out.steer); const st = q.length > 12 ? q.shift() : 0;
      const vt = race.env.prof.vt[race.ap.tr.idx], v = race.car.fwdSpeed();
      return { steer: Math.max(-1, Math.min(1, st + noise * 0.15)), throttle: v < vt * 1.08 ? 1 : 0, brake: v > vt * 1.2 ? 0.7 : 0 };
    };
  };
  // nur Strecken mit neuen Elementen
  const all = trackList(generate, art, 2).filter(([, mk]) => { const c = countNew(mk().pieces); return c.zigzag || c.zigzag2 || c.tube_wall; });
  const res = [];
  for (const [name, mk] of all.slice(von, von + n)) {
    const t0 = Date.now(), v = verifySync(mk());
    const row = { name, ok: v.ok, fixes: v.fixes, ap: v.apTime, neu: countNew(v.layout.pieces), runs: {} };
    if (!v.env) { res.push(row); continue; }
    v.env.track.roadHW = ROAD_HW;
    const lim = Math.max(150, (v.apTime || 80) * 4);
    const drive = (key, mkRace, ctl) => {
      const out = { landungen: [] }, W = obstWatch(v.env.track), sh = stuntHook(out), race = mkRace();
      let t = 0;
      while (t < lim && race.state !== 'finished') { race.ap.control(race.car); race.step(DT, ctl(race)); t += DT; race.events.length = 0; sh(race); W.step(race.car, race.tracker.idx, race.crashes); }
      row.runs[key] = { ok: race.state === 'finished', time: race.finalTime ?? null, crashes: race.crashes, el: Object.fromEntries(NEU.filter((k) => out[k]).map((k) => [k, out[k]])), why: out.why || {}, obst: W.out };
    };
    for (const st of ['sauber', 'brachial']) drive('leicht-' + st, () => new Race(v.env, { assist: 'easy', countdown: 0.5, fahrstil: st, seed: 7 }), () => ({ steer: 0, throttle: 0, brake: 0 }));
    for (const sd of SEEDS) drive('original-' + sd, () => new Race(v.env, { assist: 'original', countdown: 0.5 }), normalBot(sd));
    for (const sd of SEEDS) {
      const out = { landungen: [] }, W = obstWatch(v.env.track), sh = stuntHook(out);
      const r = runBot(v, MEDIUM_N24, 'mensch-handy', sd, (race) => { sh(race); W.step(race.car, race.tracker.idx, race.crashes); });
      row.runs['mittel-handy-' + sd] = { ok: r.ok, time: r.time ?? null, crashes: r.crashes, el: Object.fromEntries(NEU.filter((k) => out[k]).map((k) => [k, out[k]])), why: out.why || {}, obst: W.out };
    }
    res.push(row);
    const brief = Object.entries(row.runs).map(([k, x]) => `${k} ${x.ok ? x.time.toFixed(1) : 'NEIN'} ${Object.entries(x.el).map(([e, q]) => `${e} ${q.ok}/${q.ok + q.fail}`).join(' ')}`).join(' · ');
    console.log(`${name.padEnd(14)} Prüffahrt ${v.ok ? 'ok' : 'NEIN'} neu ${JSON.stringify(row.neu)} | ${brief} (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
  }
  if (arg('json')) { const f = arg('json'); const old = fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : []; fs.writeFileSync(f, JSON.stringify(old.concat(res))); }
}

function summary(file) {
  const S = JSON.parse(fs.readFileSync(file, 'utf8'));
  const pc = (a, b) => (b ? (100 * a / b).toFixed(1).replace('.', ',') + ' %' : '–');
  if (S.length && S[0].runs) {
    const keys = ['leicht-sauber', 'leicht-brachial', 'mittel-handy', 'original'];
    console.log(`Strecken: ${S.length} (Prüffahrt ok ${S.filter((r) => r.ok).length})`);
    console.log('| Fahrer | im Ziel | Crashs/10 Runden | ' + NEU.join(' | ') + ' |');
    console.log('|---|---|---|' + NEU.map(() => '---').join('|') + '|');
    for (const k of keys) {
      let runs = 0, ok = 0, cr = 0; const el = {};
      for (const r of S) for (const [q, x] of Object.entries(r.runs)) if (q === k || q.startsWith(k + '-')) { runs++; if (x.ok) ok++; cr += x.crashes; for (const [e, y] of Object.entries(x.el)) { el[e] ||= { ok: 0, fail: 0 }; el[e].ok += y.ok; el[e].fail += y.fail; } }
      console.log(`| ${k} | ${ok}/${runs} | ${(cr / Math.max(1, runs) * 10).toFixed(1).replace('.', ',')} | ${NEU.map((e) => (el[e] ? `${pc(el[e].ok, el[e].ok + el[e].fail)} (${el[e].ok}/${el[e].ok + el[e].fail})` : '–')).join(' | ')} |`);
    }
    return;
  }
  // quote
  const grp = new Map();
  for (const r of S) { const k = `${r.art} v${r.gv} Stufe ${r.d}`; if (!grp.has(k)) grp.set(k, []); grp.get(k).push(r); }
  console.log('| Art / Version / Stufe | Strecken | im Ziel (mit Entschärfen) | ohne Entschärfen | Entschärfungen | neue Elemente gesetzt → nach Prüffahrt |');
  console.log('|---|---|---|---|---|---|');
  for (const [k, R] of [...grp.entries()].sort()) {
    const n0 = {}, n1 = {};
    for (const r of R) { for (const [e, c] of Object.entries(r.neu0)) n0[e] = (n0[e] || 0) + c; for (const [e, c] of Object.entries(r.neu1)) n1[e] = (n1[e] || 0) + c; }
    console.log(`| ${k} | ${R.length} | ${pc(R.filter((r) => r.ok).length, R.length)} | ${pc(R.filter((r) => r.ok0).length, R.length)} | ${R.reduce((a, r) => a + r.fixes, 0)} | ${Object.keys(n0).map((e) => `${e} ${n0[e]} → ${n1[e] || 0}`).join(', ') || '–'} |`);
  }
}

const mode = process.argv[2];
if (arg('sum')) summary(arg('sum'));
else if (mode === 'fest') await fest();
else if (mode === 'quote') await quote();
else if (mode === 'fahrer') await fahrer();
else if (import.meta.url === url.pathToFileURL(process.argv[1]).href) console.log('Aufruf: node tools/hindernis_mess.mjs fest|quote|fahrer …');
