// Zieljubel-Stunt (n40): Ablauf/Zeiten, Figur aus dem Seed, Bodenfreiheit im Flug (keine Ecke im Boden), Landung exakt in
// Fahrtlage, Platz-Prüfung (gerade/Kurve/Kuppe/Stunt/Hindernis/Ende/Decke) an Kunst-Linien; dann echte Fahrten: Rennzeit,
// Geist und Aufzeichnung bis zur Linie bitgleich mit/ohne Stunt, Stunt läuft durch (Nitro → Flug → Landung), Auto nach der
// Landung aufrecht, auf der Fahrbahn, kein Crash, im Replay die volle Drehung, deterministisch.
// Aufruf: node tests/node/test_zielstunt.mjs   (Kurz-Lauf ohne Fahrten: --kurz)
import { ZSTUNT, CAR_BOX, stuntZeit, stuntArt, stuntRaum, stuntStart, stuntFlug, stuntFreiheit, lineAhead, lineAt, qLook, qrot } from '../../src/game/zielstunt.js';
import { ZIEL } from '../../src/game/zielshow.js';

let fails = 0;
const check = (ok, msg) => { console.log(`${ok ? 'OK  ' : 'FAIL'} ${msg}`); if (!ok) fails++; };
const fmt = (x, d = 1) => x.toFixed(d).replace('.', ',');
const KURZ = process.argv.includes('--kurz');

// Kunst-Linie: n Punkte im Meter-Abstand längs +x; opt.curve(i) → Seitenversatz z, opt.hump(i) → Höhe, Flags je Index
function kunstLinie(n, opt = {}) {
  const L = { n, closed: false, px: [], py: [], pz: [], tx: [], ty: [], tz: [], nx: [], ny: [], nz: [], bx: [], by: [], bz: [], s: [], hw: [], air: [], loop: [], tube: [] };
  for (let i = 0; i < n; i++) { L.px.push(i); L.py.push(opt.hump ? opt.hump(i) : 0); L.pz.push(opt.curve ? opt.curve(i) : 0); }
  let s = 0;
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - 1), b = Math.min(n - 1, i + 1);
    let tx = L.px[b] - L.px[a], ty = L.py[b] - L.py[a], tz = L.pz[b] - L.pz[a]; const l = Math.hypot(tx, ty, tz); tx /= l; ty /= l; tz /= l;
    L.tx.push(tx); L.ty.push(ty); L.tz.push(tz);
    // rechts = t × (0, 1, 0) … für Fahrt längs +x: (0, 0, 1); oben = b × t
    let bx = -tz, bz = tx; const lb = Math.hypot(bx, bz); bx /= lb; bz /= lb;
    L.bx.push(bx); L.by.push(0); L.bz.push(bz);
    L.nx.push(-bz * ty); L.ny.push(bz * tx - bx * tz); L.nz.push(bx * ty);
    if (i) s += Math.hypot(L.px[i] - L.px[i - 1], L.py[i] - L.py[i - 1], L.pz[i] - L.pz[i - 1]);
    L.s.push(s); L.hw.push(opt.hw ?? 7.3);
    L.air.push(opt.air && opt.air(i) ? 1 : 0); L.loop.push(opt.loop && opt.loop(i) ? 1 : 0); L.tube.push(0);
  }
  L.total = s;
  return { line: L, jumps: opt.jumps || [], obstacles: opt.obstacles || [] };
}

console.log('--- A: Ablauf ---');
{
  let ok = true, recMax = 0, endMax = 0;
  for (let v = 0; v <= 82; v += 2) {
    const T = stuntZeit(v);
    if (!T.ok || !(T.tB >= 0 && T.tB <= ZSTUNT.tBmax + 1e-9 && T.tJ > T.tB && T.tL > T.tJ && T.cut > T.tL && T.end > T.cut && T.rec > T.end)) { ok = false; console.log('   ', v, T); }
    if (T.ok && T.dec && (T.dec < ZSTUNT.decMin - 1e-9 || T.dec > ZSTUNT.decMax + 1e-9)) ok = false;
    recMax = Math.max(recMax, T.rec || 0); endMax = Math.max(endMax, T.end || 0);
  }
  check(ok, `Zeiten 0 … 295 km/h: Bremsen ≤ ${ZSTUNT.tBmax} s, Nitro → Absprung → Landung → Schnitt → Ende → Aufzeichnung in Reihe`);
  check(endMax <= 8.2 && recMax <= 8.6 && recMax >= ZIEL.rec, `Zielshow höchstens ${fmt(endMax)} s (bisher ${ZIEL.end}), Aufzeichnung höchstens ${fmt(recMax)} s (bisher ${ZIEL.rec})`);
  check(!stuntZeit(83).ok && stuntZeit(83).why === 'tempo', 'schneller als 295 km/h: kein Stunt (Dreher/Ausrollen wie bisher)');
}

{
  // Option „Zieljubel“ (ui/n40optionen.js): Standard Stunt, Einstellung, ?zieljubel= hat Vorrang; Optionen-Blatt
  const { zieljubelArt, n40OptionenHtml } = await import('../../src/ui/n40optionen.js');
  check(zieljubelArt('', {}) === 'stunt' && zieljubelArt('', { zieljubel: 'aus' }) === 'aus' && zieljubelArt('?zieljubel=dreher', { zieljubel: 'aus' }) === 'dreher' && zieljubelArt('?zieljubel=quatsch', {}) === 'stunt', 'Zieljubel: Standard Stunt, Option, ?zieljubel= vorrangig');
  const h = n40OptionenHtml({}, '');
  check(/data-a="zieljubel" data-v="stunt" class="on"/.test(h) && /data-a="zuschauer" data-v="tiere" class="on"/.test(h) && (h.match(/data-a="zieljubel"/g) || []).length === 3, 'Optionen-Blatt: Zuschauer (Tiere an) und Zieljubel (Stunt an), drei Stufen');
}

console.log('--- B: Figur aus dem Seed ---');
{
  const n = { schraube: 0, front: 0, back: 0 };
  let det = true;
  for (let k = 0; k < 300; k++) { const a = stuntArt(`4711-3|${(80 + k * 0.137).toFixed(3)}`); n[a.art]++; const b = stuntArt(`4711-3|${(80 + k * 0.137).toFixed(3)}`); if (a.art !== b.art || a.sg !== b.sg) det = false; }
  check(det, 'gleicher Seed → gleiche Figur');
  check(n.schraube > 60 && n.front > 60 && n.back > 60, `Mischung über 300 Zielzeiten: Schraube ${n.schraube}, Frontflip ${n.front}, Backflip ${n.back}`);
}

console.log('--- C: Flug ---');
{
  const h0 = 0.539, T = kunstLinie(200), L = T.line;
  let minF = Infinity, worst = '', minA = Infinity, worstA = '', landOk = true, angOk = true, wMax = 0, stepMax = 0;
  for (const art of [{ art: 'schraube', sg: 1 }, { art: 'schraube', sg: -1 }, { art: 'front', sg: -1 }, { art: 'back', sg: 1 }])
    for (const v of [ZSTUNT.vAir[0], 24, ZSTUNT.vAir[1]]) for (const lat of [0, 2.5]) {
      const q0 = qLook([1, 0, 0], [0, 1, 0]), len = v * ZSTUNT.air;
      const land = lineAt(L, lineAhead(L, 20, len)); land.p = [land.p[0], land.p[1], land.p[2] + lat];
      const st = stuntStart([20, h0, lat], q0, v, land, h0, art);
      let prev = null;
      for (let t = 0.02 * st.T; t <= 0.98 * st.T; t += 1 / 120) {
        const f = stuntFreiheit(st, t), u = t / st.T;
        // n40 Heavy (weiche Landung): während der Drehung (bis 4 % danach) Schutzabstand, im Anflug aufrecht nur > 0
        if (u <= ZSTUNT.rot[1] + 0.04) { if (f < minF) { minF = f; worst = `${art.art} ${art.sg > 0 ? '+' : '−'} ${v} m/s bei ${fmt(u * 100, 0)} %`; } }
        else if (f < minA) { minA = f; worstA = `${art.art} ${art.sg > 0 ? '+' : '−'} ${v} m/s bei ${fmt(u * 100, 0)} %`; }
        const F = stuntFlug(st, t);
        wMax = Math.max(wMax, Math.hypot(...F.w));
        if (prev) stepMax = Math.max(stepMax, Math.hypot(F.pos[0] - prev[0], F.pos[1] - prev[1], F.pos[2] - prev[2]));
        prev = F.pos;
      }
      // Ende: volle Drehung, Lage = Landelage (Dach oben, Nase längs der Fahrbahn), Ort = Landepunkt
      const E = stuntFlug(st, st.T);
      const up = qrot(E.q, [0, 1, 0]), fw = qrot(E.q, [0, 0, -1]);
      if (up[1] < 0.999 || fw[0] < 0.999 || Math.hypot(E.pos[0] - st.p1[0], E.pos[1] - st.p1[1], E.pos[2] - st.p1[2]) > 1e-6) landOk = false;
      if (Math.abs(Math.abs(E.ang) - 2 * Math.PI) > 1e-9) angOk = false;
      // Querachse bei den Flips, Längsachse bei der Schraube: Mitte der Drehung = Kopfüber
      const M = stuntFlug(st, st.T * (ZSTUNT.rot[0] + ZSTUNT.rot[1]) / 2), um = qrot(M.q, [0, 1, 0]);
      if (um[1] > -0.99) angOk = false;
    }
  check(minF >= 0.25, `Bodenfreiheit im Flug mindestens ${fmt(minF, 2)} m (tiefste Ecke, schlimmster Fall ${worst})`);
  check(minA > 0.1, `Bodenfreiheit im Anflug (aufrecht) mindestens ${fmt(minA, 2)} m (tiefste Ecke, schlimmster Fall ${worstA})`);
  check(landOk, 'Landung exakt in Fahrtlage am Landepunkt (Dach oben, Nase längs der Fahrbahn)');
  check(angOk, 'volle Drehung 360° (Mitte kopfüber)');
  check(stepMax < ZSTUNT.vAir[1] / 120 * 1.6, `kein Sprung in der Bahn (größter Schritt je 1/120 s ${fmt(stepMax, 2)} m)`);
  check(wMax < 12, `Drehrate höchstens ${fmt(wMax)} rad/s`);   // n40 Heavy: Drehfenster kürzer (weiche Landung) → bis ~11,2
}

console.log('--- D: Platz ---');
{
  const v0 = 45, lenAll = 500;
  const why = (T, o) => { const R = stuntRaum(T, 5, v0, o); return R.ok ? 'ok' : R.why; };
  check(why(kunstLinie(lenAll)) === 'ok', 'gerade, ebene, breite Fahrbahn → Stunt');
  check(why(kunstLinie(150)) === 'ende', 'Strecke endet zu früh → kein Stunt');
  const T0 = stuntZeit(v0);
  const mid = Math.round(5 + T0.dJ + T0.len / 2);
  check(why(kunstLinie(lenAll, { curve: (i) => i > mid - 30 ? (i - (mid - 30)) ** 2 / 100 : 0 })) === 'kurve', 'Kurve unter der Flugbahn → kein Stunt');
  check(why(kunstLinie(lenAll, { hump: (i) => Math.max(0, 1.5 - Math.abs(i - mid) / 8) })) === 'kuppe', 'Kuppe unter der Flugbahn → kein Stunt');
  check(why(kunstLinie(lenAll, { loop: (i) => i > mid + 60 && i < mid + 70 })) === 'stunt', 'Looping kurz nach der Landung → kein Stunt');
  check(why(kunstLinie(lenAll, { jumps: [{ lipIdx: mid + 50, landIdx: mid + 90 }] })) === 'stunt', 'Schanze hinter dem Ziel → kein Stunt');
  check(why(kunstLinie(lenAll, { obstacles: [{ idx0: mid, idx1: mid + 4 }] })) === 'hindernis', 'Hindernis auf der Flugstrecke → kein Stunt');
  check(why(kunstLinie(lenAll, { hw: 4 })) === 'eng', 'schmale Fahrbahn → kein Stunt');
  check(why(kunstLinie(lenAll), { roof: (x) => x > mid && x < mid + 3 }) === 'decke', 'Brücke/Decke über der Flugbahn → kein Stunt');
  check(why(kunstLinie(lenAll), { high: Array.from({ length: lenAll }, (_, i) => i > mid ? 1 : 0) }) === 'hoch', 'Hochstraße → kein Stunt');
}

if (!KURZ) {
  const { runRace, marksOf } = await import('../../tools/kinoreplay_probe.mjs');
  const { REC_HZ, REC_STRIDE } = await import('../../src/game/race.js');
  const { Replay } = await import('../../src/game/replay.js');
  const { generate } = await import('../../src/track/generator.js');
  const { verifySync } = await import('../../src/track/verify.js');
  const { gTrack } = await import('../../src/core/gforce.js');
  console.log('--- E: echte Fahrten ---');
  let n = 0, done = 0, same = 0, why = {}, probe = null, gMax = 0;
  const arts = {};
  // (Strecken mit und ohne Platz hinter dem Ziel; generate(s, 1 + s % 3) hat bei 3, 4, 12, 3-3d, 7-g, 13-g, 10-g, 8-3d
  // mehrere hundert Meter frei, 2-2 einen Looping nach ~70 m)
  for (const [seed, diff, o, assist] of [[3, 1, {}, 'easy'], [4, 2, {}, 'easy'], [12, 1, {}, 'easy'], [3, 1, { d3: true }, 'easy'], [7, 2, { gel: true }, 'easy'], [13, 2, { gel: true }, 'easy'], [8, 3, { d3: true }, 'easy'], [2, 2, {}, 'easy']]) {
    const env = verifySync(generate(seed, diff, o)).env;
    const t0 = Date.now();
    const a = runRace(env, { assist, autoExtras: false, zieljubel: 'aus' });
    const b = runRace(env, { assist, autoExtras: false, zieljubel: 'stunt' });
    n++;
    const name = `${seed}-${diff}${o.gel ? '-g' : o.d3 ? '-3d' : ''} ${assist}`;
    // bis zur Linie bitgleich, Rennzeit und Geist gleich
    let eq = a.finF === b.finF && a.finalTime === b.finalTime;
    for (let i = 0; eq && i < a.finF * REC_STRIDE; i++) if (a.rec[i] !== b.rec[i]) eq = false;
    const ga = a.ghostRec(), gb = b.ghostRec();
    eq = eq && ga.length === gb.length && ga.every((x, i) => x === gb[i]);
    if (eq) same++;
    const S = b.zstunt;
    if (!S) { why[b.zstuntWhy || '?'] = (why[b.zstuntWhy || '?'] || 0) + 1; console.log(`     ${name}: kein Stunt (${b.zstuntWhy}), Ziel ${fmt(b.finV * 3.6, 0)} km/h, ${((Date.now() - t0) / 1000).toFixed(1)} s`); continue; }
    if (S.ph !== 'roll') { why[S.why || S.ph] = (why[S.why || S.ph] || 0) + 1; console.log(`     ${name}: Stunt abgebrochen (${S.why || S.ph})`); continue; }
    done++; arts[S.art] = (arts[S.art] || 0) + 1;
    if (!probe) probe = { env, b, name };
    // nach der Landung: aufrecht, auf der Fahrbahn, kein Crash; Aufzeichnung bis rec
    const L = env.track.line, F = b.rec.length / REC_STRIDE, fL = b.finF + Math.round(S.tLand * REC_HZ);
    let off = -99, upMin = 1;
    for (let f = fL; f < F; f += 3) {
      const q = f * REC_STRIDE, Q = { x: b.rec[q + 3], y: b.rec[q + 4], z: b.rec[q + 5], w: b.rec[q + 6] };
      let dm = 1e9, im = 0; for (let i = 0; i < L.n; i++) { const d = (L.px[i] - b.rec[q]) ** 2 + (L.pz[i] - b.rec[q + 2]) ** 2 + (L.py[i] - b.rec[q + 1]) ** 2; if (d < dm) { dm = d; im = i; } }
      off = Math.max(off, Math.sqrt(dm) - L.hw[im]);
      const u = qrot(Q, [0, 1, 0]); upMin = Math.min(upMin, u[0] * L.nx[im] + u[1] * L.ny[im] + u[2] * L.nz[im]);
    }
    // Replay: im Flug kopfüber (Flip/Schraube sichtbar), Nitro-Flammen als Ereignis
    const rp = new Replay(b.rec, env, marksOf(b));
    let upside = false;
    for (let t = S.tAir; t < S.tLand; t += 1 / 60) { rp.t = b.finF / REC_HZ + t; const P = rp.pose(); if (P.frame.u.y < -0.9) upside = true; }
    rp.t = b.finF / REC_HZ + S.tN + 0.2;
    const flame = rp.nitro() > 0.5;
    const after = (F - b.finF) / REC_HZ;
    // n40 Heavy: saubere Landung auch im G-Messer (Replay/Film): kein Ruck im Landebild, Anzeige rund um die Landung < 4 G
    const G = gTrack(b.rec, b.cuts || []);
    let gL = 0; for (let f = fL - 3; f < Math.min(F, fL + 30); f++) gL = Math.max(gL, G.g[f]);
    gMax = Math.max(gMax, gL);
    check(!b.car.crash && off < -1 && upMin > 0.9 && upside && flame && after >= S.end - 0.05, `${name}: ${S.art}${S.art === 'schraube' ? (S.sg > 0 ? ' rechts' : ' links') : ''} bei ${fmt(S.v0 * 3.6, 0)} km/h, Absprung ${fmt(S.tAir, 2)} s, Landung ${fmt(S.tLand, 2)} s, danach ${fmt(-off)} m innerhalb der Kante, aufrecht ${fmt(upMin, 3)}, kopfüber im Replay ${upside ? 'ja' : 'nein'}, Flammen ${flame ? 'ja' : 'nein'}, Aufzeichnung ${fmt(after, 2)} s (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
  }
  check(gMax < 4, `Landung im G-Messer höchstens ${fmt(gMax)} G (weiche Landung, kein Ruck im Landebild)`);
  check(same === n, `Rennzeit, Geist und Aufzeichnung bis zur Linie bitgleich mit/ohne Stunt (${same}/${n})`);
  check(done >= 3, `Stunt auf ${done} von ${n} Strecken (${Object.entries(arts).map(([k, v]) => `${k} ${v}`).join(', ')}; ohne: ${Object.entries(why).map(([k, v]) => `${k} ${v}`).join(', ') || '–'})`);
  // Highlight-Film: Zieleinlauf zeigt den Stunt (Tele bis nach der Landung, dann Zielbogen), Name im Titel
  if (probe) {
    const { buildFilm, FilmPlayer } = await import('../../src/game/highlights.js');
    const { env, b } = probe, S = b.zstunt;
    const zst = { f0: b.finF + Math.round(S.tAir * REC_HZ), f1: b.finF + Math.round(S.tLand * REC_HZ), art: S.art };
    const film = buildFilm(b.rec, env, { ...marksOf(b), zstunt: zst });
    const fin = film && film.clips.find((c) => c.kind === 'finish');
    const tele = fin && fin.shots.find((x) => x.cam === 'tele'), arch = fin && fin.shots.find((x) => x.cam === 'arch');
    check(fin && fin.zs && fin.b >= zst.f1 / REC_HZ + 2 && tele && tele.t1 >= zst.f1 / REC_HZ && arch && /Schraube|Frontflip|Backflip/.test(fin.label), `Film: „${fin && fin.label}“ ${fin ? fmt(fin.a, 1) + '–' + fmt(fin.b, 1) : ''} s, Tele bis ${tele ? fmt(tele.t1, 2) : '–'} s (Landung ${fmt(zst.f1 / REC_HZ, 2)} s), dann Zielbogen`);
    const P = new FilmPlayer(film); let k = 0; while (!P.done && k < 20000) { P.advance(1 / 60); k++; }
    check(P.done, `Film läuft durch (${fmt(k / 60)} s)`);
    const ohne = buildFilm(b.rec, env, marksOf(b)), fo = ohne && ohne.clips.find((c) => c.kind === 'finish');
    check(fo && !fo.zs && fo.label === '🏁 Ziel', 'ohne Stunt-Marke: Zieleinlauf wie bisher');
  }
  // deterministisch
  {
    const env = verifySync(generate(2, 2, {})).env;
    const x = runRace(env, { assist: 'easy', autoExtras: false, zieljubel: 'stunt' }), y = runRace(env, { assist: 'easy', autoExtras: false, zieljubel: 'stunt' });
    check(x.rec.length === y.rec.length && x.rec.every((v, i) => v === y.rec[i]), 'zweimal gefahren → Aufzeichnung samt Stunt bitgleich');
  }
  // ohne Angabe (Prüffahrt/ältere Aufrufer): wie bis n39
  {
    const env = verifySync(generate(2, 2, {})).env;
    const r = runRace(env, { assist: 'easy', autoExtras: false });
    check(r.zieljubel === 'dreher' && !r.zstunt, 'Race ohne zieljubel = Dreher-Verhalten wie bisher (kein Stunt)');
  }
}

console.log(fails ? `\n${fails} FEHLER` : '\nalle OK');
process.exit(fails ? 1 : 0);
