// n29 Röhre mit Hindernis: Fahrbarkeit des Buckels messen (Node, ohne Browser).
//   fest    – Auto mit festem Tempo (80 / 150 / 220 km/h, Lenkung Autopilot, Tempo gehalten) über den Buckel einer geraden
//             Teststrecke (Start, 4 Geraden, Röhre, 3 Geraden), flach, auf Ebene 1 (3D) und als Gelände-Sockel nicht nötig
//             (die Röhre ist überall dasselbe starre Stück)
//   fahrer  – Zufallsstrecken mit Röhre (Liste aus tools/stunt_mess.mjs, flach/Gelände/3D, alle Stufen): Prüffahrt, dann
//             Leicht Sauber/Brachial (Autopilot), Mittel „mensch-handy“ und Original „normal“ (Seeds 7, 8, 9)
// Je Buckel-Überfahrt: Tempo am Buckel, Flugzeit, Flughöhe (Unterboden über der Fahrbahn), Flugweite (Abheben →
// Aufsetzen), kleinster Abstand Dach → Röhrendecke (2R), kleinste Dach-Lage (up.y, < 0 = kopfüber), Crash/Reset.
// Aufruf: node tools/roehre_mess.mjs fest [--buckel=h,len]
//         node tools/roehre_mess.mjs fahrer [--root=Wurzel] [--mehr=60] [--seeds=7,8,9] [--von=0] [--n=80] [--json=datei]
//         node tools/roehre_mess.mjs --sum=vorher.json,nachher.json
// Umgebung: STUNT_BUCKEL=h,len (Form), STUNT_ROEHRE=glatt (glatte Röhre bis n28)
import fs from 'fs'; import path from 'path'; import url from 'url';
const HERE = path.dirname(url.fileURLToPath(import.meta.url));
const arg = (k, d) => { const a = process.argv.find((s) => s.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const ROOT = path.resolve(arg('root', path.join(HERE, '..')));
const imp = (p) => import(url.pathToFileURL(path.join(ROOT, p)).href);
const DT = 1 / 120;
const ROOF = 0.78;   // Dach-Sonde über dem Wagenmittelpunkt (car.js PROBES)

// Buckel-Überfahrten mitschreiben: Haken je Simulationsschritt. get() liefert { car, idx, crashes }
export function humpWatch(track, tubeH) {
  const L = track.line, H = track.humps || pseudoHumps(track), out = [];
  let cur = null, rest = 0.5, restN = 0, last = null;
  const step = (car, idx, crashes, t) => {
    // Ruhelage (Wagenmitte über der Fahrbahn) auf flacher Fahrbahn am Boden mitteln
    if (car.onGround >= 4 && !L.wave[idx] && Math.abs(L.ny[idx] - 1) < 1e-3) { rest = (rest * restN + (car.pos.y - L.py[idx])) / (restN + 1); restN = Math.min(200, restN + 1); }
    if (last && (idx < last.idx0 - 40 || idx > last.idx1 + 400)) last = null;
    if (!cur) {
      // neue Überfahrt: Auto kurz vor dem Buckel (oder schon auf der ersten Hälfte), nicht im Crash/Reset, Buckel seit dem
      // letzten Mal verlassen (sonst zählte ein am Buckel liegendes Auto bei jedem Schritt neu)
      if (car.crash) return;
      for (const h of H) if (idx >= h.idx0 - 15 && idx <= h.idxC && h !== last) {
        let floor = L.py[h.idx0];
        cur = { h, floor, ceil: floor + tubeH, v: car.speed(), t0: t, air: 0, maxH: 0, takeoff: null, land: null, ceilMin: 1e9, upMin: 1, crash: false, cr: crashes, dist: 0, flights: 0 };
        break;
      }
      return;
    }
    const c = cur;
    const airH = car.pos.y - L.py[idx] - rest;
    c.ceilMin = Math.min(c.ceilMin, c.ceil - (car.pos.y + ROOF * Math.max(0, car.frame.u.y)));
    c.upMin = Math.min(c.upMin, car.frame.u.y);
    // nur der erste Flug ab dem Buckel (Abheben → erstes Aufsetzen); kurze Bodenberührung < 0,05 s zählt nicht als Landung
    if (car.onGround === 0 && !c.land) {
      if (!c.inAir) { c.inAir = true; c.flights++; c.gnd = 0; if (!c.takeoff) c.takeoff = { x: car.pos.x, z: car.pos.z, s: L.s[idx] }; }
      c.air += DT; c.maxH = Math.max(c.maxH, airH); c.gnd = 0;
    } else if (c.inAir && !c.land) {
      c.gnd = (c.gnd || 0) + DT;
      if (c.gnd >= 0.05) { c.inAir = false; c.land = { x: car.pos.x, z: car.pos.z, s: L.s[idx] }; }
    }
    if (crashes > c.cr || car.crash) c.crash = (car.crash && car.crash.reason) || 'Reset';
    // Ende (vorher/nachher gleich): Crash/Reset, 6 s, oder 80 m hinter dem Buckel am Boden (Landung auch bei 220 km/h drin)
    const done = c.crash || (t - c.t0 > 6) || (L.s[idx] - L.s[c.h.idx1] > 80 && !c.inAir);
    if (done) {
      if (c.takeoff && c.land) c.dist = Math.hypot(c.land.x - c.takeoff.x, c.land.z - c.takeoff.z);
      last = c.h;
      out.push({ v: c.v, air: c.air, maxH: c.maxH, dist: c.dist, ceilMin: c.ceilMin, upMin: c.upMin, crash: c.crash, flights: c.flights, landS: c.land ? c.land.s - L.s[c.h.idxC] : null });
      cur = null;
    }
  };
  return { step, out };
}

// Stand ohne Buckel (--root, glatte Röhre): dieselbe Stelle (Mitte der 2-Feld-Röhre, ±8 m) als „Buckel“ beobachten – so
// zählen Crashs/Resets im selben Fenster vorher wie nachher
function pseudoHumps(track) {
  const L = track.line, out = [];
  for (const P of track.pieces) {
    if (P.type !== 'tube' || P.lineEnd <= P.lineStart) continue;
    const sm = (L.s[P.lineStart] + L.s[P.lineEnd]) / 2, at = (s) => { let i = P.lineStart; while (i < P.lineEnd && L.s[i] < s) i++; return i; };
    out.push({ idx0: at(sm - 8), idxC: at(sm), idx1: at(sm + 8), len: 16 });
  }
  return out;
}

async function fest() {
  const { chain, setup } = await imp('tests/node/common.mjs');
  const { Car } = await imp('src/physics/car.js');
  const { Autopilot } = await imp('src/ai/autopilot.js');
  const { tubeGeom, setTubeHump, TUBE_HUMP } = await imp('src/track/pieces.js');
  if (arg('buckel')) { const [h, len] = arg('buckel').split(',').map(Number); setTubeHump({ h, len }); }
  const rows = [];
  for (const lvl of [0, 1]) {
    const list = lvl ? ['start', 'straight', 'rampUp', 'straight', 'straight', 'tube', 'straight', 'straight', 'rampDown', 'straight'] : ['start', 'straight', 'straight', 'straight', 'straight', 'tube', 'straight', 'straight', 'straight'];
    const c = chain(5, 15, 0, list);
    const env = setup({ pieces: c.pieces, seed: 1 });
    const { track, world, ideal: L, prof } = env;
    const TG = tubeGeom(track.stuntScale);
    const h = track.humps[0];
    for (const kmh of [80, 150, 220]) {
      const v = kmh / 3.6, car = new Car();
      // 60 m vor dem Buckel-Anfang einsetzen, Tempo gleich voll
      let si = h.idx0; while (si > 0 && L.s[h.idx0] - L.s[si] < 60) si--;
      car.place([L.px[si], L.py[si], L.pz[si]], [L.tx[si], L.ty[si], L.tz[si]], [L.nx[si], L.ny[si], L.nz[si]], v);
      const ap = new Autopilot(L, prof); ap.tr.reset(si);
      const W = humpWatch(track, 2 * TG.R);
      let t = 0;
      while (t < 8 && !W.out.length) {
        const u = ap.control(car);
        const fv = car.fwdSpeed();
        car.input.steer = u.steer; car.input.throttle = fv < v ? 1 : 0; car.input.brake = fv > v + 1.5 ? 0.4 : 0;
        car.surfaceKind = L.loop[ap.tr.idx] || L.tube[ap.tr.idx] ? 1 : 0;
        car.haftOff = false;
        car.step(DT, world); t += DT;
        W.step(car, ap.tr.idx, 0, t);
        if (car.crash) { W.step(car, ap.tr.idx, 1, t); break; }
      }
      const r = W.out[0] || { v, air: 0, maxH: 0, dist: 0, ceilMin: NaN, upMin: NaN, crash: car.crash ? car.crash.reason : 'kein Buckel' };
      rows.push({ lvl, kmh, ...r });
      console.log(`${lvl ? '3D (Ebene 1)' : 'flach       '} ${String(kmh).padStart(3)} km/h  am Buckel ${(r.v * 3.6).toFixed(0).padStart(3)} km/h  Luft ${r.air.toFixed(2)} s  Höhe ${r.maxH.toFixed(2)} m  Weite ${r.dist.toFixed(1)} m  Decke ${r.ceilMin.toFixed(2)} m  up.y min ${r.upMin.toFixed(2)}  ${r.crash ? 'CRASH ' + r.crash : 'ok'}`);
    }
  }
  console.log(`Buckel h ${TUBE_HUMP.h} m, Länge ${TUBE_HUMP.len} m, an ${TUBE_HUMP.on}`);
  if (arg('json')) fs.writeFileSync(arg('json'), JSON.stringify(rows));
  return rows;
}

async function fahrer() {
  const { generate } = await imp('src/track/generator.js');
  const { verifySync } = await imp('src/track/verify.js');
  const { Race, MEDIUM_N24 } = await imp('src/game/race.js');
  const { rng } = await imp('src/core/util.js');
  const { tubeGeom } = await imp('src/track/pieces.js');
  const { runBot } = await imp('tools/mittel_probe.mjs');
  const { messTracks, stuntHook } = await import(url.pathToFileURL(path.join(HERE, 'stunt_mess.mjs')).href);
  const list = messTracks(generate);
  // --mehr=N: weitere Zufallsstrecken (Stufe 2/3, flach/Gelände/3D) – nur solche mit Röhre zählen
  for (let k = 0; k < +arg('mehr', 0); k++) { const s = 7000 + k * 131, d = 2 + (k % 2), o = [{}, { gel: true }, { d3: true }][k % 3]; list.push([`${s}-${d}${o.gel ? '-g' : o.d3 ? '-3d' : ''}`, () => generate(s, d, o)]); }
  const von = +arg('von', 0), n = +arg('n', list.length);
  const SEEDS = arg('seeds', '7,8,9').split(',').map(Number);
  const res = [];
  const normalBot = (seed) => {
    const r = rng(seed); let noise = 0, nT = 0; const q = [];
    return (race) => {
      nT -= DT; if (nT <= 0) { noise = r.range(-1, 1); nT = r.range(0.3, 1.2); }
      q.push(race.ap.out.steer); const st = q.length > 12 ? q.shift() : 0;
      const vt = race.env.prof.vt[race.ap.tr.idx], v = race.car.fwdSpeed();
      return { steer: Math.max(-1, Math.min(1, st + noise * 0.15)), throttle: v < vt * 1.08 ? 1 : 0, brake: v > vt * 1.2 ? 0.7 : 0 };
    };
  };
  for (const [name, mk] of list.slice(von, von + n)) {
    const lay0 = mk();
    if (!lay0.pieces.some((p) => p.type === 'tube')) continue;
    const t0 = Date.now();
    const v = verifySync(lay0);
    const row = { name, ok: v.ok, fixes: v.fixes, ap: v.apTime, tubes: v.layout.pieces.filter((p) => p.type === 'tube').length, tubes0: lay0.pieces.filter((p) => p.type === 'tube').length, runs: {} };
    if (!v.env) { res.push(row); continue; }
    const tubeH = 2 * tubeGeom(v.env.track.stuntScale ?? 1).R;
    const lim = Math.max(150, (v.apTime || 80) * 4);
    const hookAll = (st, hw) => (race) => { st(race); hw.step(race.car, race.tracker.idx, race.crashes, race.time); };
    const drive = (key, mkRace, ctl) => {
      const out = { landungen: [] }, hw = humpWatch(v.env.track, tubeH), hook = hookAll(stuntHook(out), hw), race = mkRace();
      let t = 0;
      while (t < lim && race.state !== 'finished') { race.ap.control(race.car); race.step(DT, ctl(race)); t += DT; race.events.length = 0; hook(race); }
      row.runs[key] = { ok: race.state === 'finished', time: race.finalTime ?? null, crashes: race.crashes, tube: out.tube || { ok: 0, fail: 0 }, why: out.why && out.why.tube, humps: hw.out };
    };
    for (const st of ['sauber', 'brachial']) drive('leicht-' + st, () => new Race(v.env, { assist: 'easy', countdown: 0.5, fahrstil: st, seed: 7 }), () => ({ steer: 0, throttle: 0, brake: 0 }));
    for (const sd of SEEDS) drive('original-' + sd, () => new Race(v.env, { assist: 'original', countdown: 0.5 }), normalBot(sd));
    for (const sd of SEEDS) {
      const out = { landungen: [] }, hw = humpWatch(v.env.track, tubeH), st = stuntHook(out);
      const r = runBot(v, MEDIUM_N24, 'mensch-handy', sd, hookAll(st, hw));
      row.runs['mittel-handy-' + sd] = { ok: r.ok, time: r.time ?? null, crashes: r.crashes, tube: out.tube || { ok: 0, fail: 0 }, why: out.why && out.why.tube, humps: hw.out };
    }
    res.push(row);
    const brief = Object.entries(row.runs).map(([k, x]) => `${k} ${x.ok ? x.time.toFixed(1) : 'NEIN'} Röhre ${x.tube.ok}/${x.tube.ok + x.tube.fail}${x.humps.length ? ' Luft ' + x.humps.map((q) => q.maxH.toFixed(1)).join(',') : ''}`).join(' · ');
    console.log(`${name.padEnd(16)} Prüffahrt ${v.ok ? 'ok' : 'NEIN'} Röhren ${row.tubes}/${row.tubes0} | ${brief} (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
  }
  if (arg('json')) fs.writeFileSync(arg('json'), JSON.stringify(res));
}

function summary(files) {
  const sets = files.map((f) => JSON.parse(fs.readFileSync(f, 'utf8')));
  const names = files.length > 1 ? ['vorher', 'nachher'] : ['nachher'];
  const pc = (a, b) => (b ? (100 * a / b).toFixed(1).replace('.', ',') + ' %' : '–');
  const de = (x, k = 1) => x.toFixed(k).replace('.', ',');
  const med = (a) => { if (!a.length) return NaN; const b = [...a].sort((x, y) => x - y); return b[b.length >> 1]; };
  const q = (a, p) => { if (!a.length) return NaN; const b = [...a].sort((x, y) => x - y); return b[Math.min(b.length - 1, Math.floor(p * b.length))]; };
  const L = [];
  L.push(`Strecken mit Röhre: ${sets.map((S, i) => `${names[i]} ${S.length} (Prüffahrt ok ${S.filter((r) => r.ok).length}, Röhren ${S.reduce((a, r) => a + r.tubes, 0)}/${S.reduce((a, r) => a + r.tubes0, 0)} nach Entschärfen)`).join(' · ')}`);
  L.push('\n| Fahrer | ' + names.map((x) => `${x}: im Ziel · Röhre geschafft · Crashs/10 Runden`).join(' | ') + ' |');
  L.push('|---|' + names.map(() => '---').join('|') + '|');
  const keys = ['leicht-sauber', 'leicht-brachial', 'mittel-handy', 'original'];
  const runsOf = (r, k) => Object.entries(r.runs).filter(([q]) => q === k || q.startsWith(k + '-')).map(([, x]) => x);
  for (const k of keys) {
    L.push(`| ${k} | ` + sets.map((S) => {
      let runs = 0, ok = 0, cr = 0, to = 0, tf = 0;
      for (const r of S) for (const x of runsOf(r, k)) { runs++; if (x.ok) ok++; cr += x.crashes; to += x.tube.ok; tf += x.tube.fail; }
      return `${ok}/${runs} · ${pc(to, to + tf)} (${to}/${to + tf}) · ${de(cr / Math.max(1, runs) * 10)}`;
    }).join(' | ') + ' |');
  }
  L.push('\nCrash/Reset an der Röhren-Mitte (Buckel bzw. vorher dieselbe Stelle: ab kurz davor bis 80 m dahinter, höchstens 6 s)');
  L.push('| Fahrer | ' + names.map((x) => `${x}: Durchfahrten · Crash/Reset`).join(' | ') + ' |');
  L.push('|---|' + names.map(() => '---').join('|') + '|');
  for (const k of keys) L.push(`| ${k} | ` + sets.map((S) => { const H = S.flatMap((r) => runsOf(r, k).flatMap((x) => x.humps)), c = H.filter((x) => x.crash).length; return `${H.length} · ${c} (${pc(c, H.length)})`; }).join(' | ') + ' |');
  const last = sets[sets.length - 1];
  L.push('\nBuckel-Überfahrten (nachher): Tempo, Luft, Höhe, Weite, Decke, Lage');
  L.push('| Fahrer | Überfahrten | Tempo Median (km/h) | Luft Median / max (s) | Höhe Median / max (m) | Weite Median / max (m) | Decke min (m) | up.y min | Crash/Reset am Buckel |');
  L.push('|---|---|---|---|---|---|---|---|---|');
  for (const k of keys) {
    const H = last.flatMap((r) => runsOf(r, k).flatMap((x) => x.humps));
    if (!H.length) continue;
    const cr = H.filter((x) => x.crash);
    L.push(`| ${k} | ${H.length} | ${de(med(H.map((x) => x.v * 3.6)), 0)} (${de(q(H.map((x) => x.v * 3.6), 0.05), 0)}–${de(q(H.map((x) => x.v * 3.6), 0.95), 0)}) | ${de(med(H.map((x) => x.air)), 2)} / ${de(Math.max(...H.map((x) => x.air)), 2)} | ${de(med(H.map((x) => x.maxH)), 2)} / ${de(Math.max(...H.map((x) => x.maxH)), 2)} | ${de(med(H.map((x) => x.dist)))} / ${de(Math.max(...H.map((x) => x.dist)))} | ${de(Math.min(...H.map((x) => x.ceilMin)), 2)} | ${de(Math.min(...H.map((x) => x.upMin)), 2)} | ${cr.length}${cr.length ? ' (' + cr.map((x) => x.crash).join(', ') + ')' : ''} |`);
  }
  console.log(L.join('\n'));
}

if (process.argv[1] && path.resolve(process.argv[1]) === url.fileURLToPath(import.meta.url)) {
  if (arg('sum')) summary(arg('sum').split(','));
  else if (process.argv.includes('fahrer')) await fahrer();
  else await fest();
}
