// n42 Ruckeln + langsamer Start (26.10.2026): die Umbauten ändern keine Ergebnisse.
//   A  Highlight-Film in Häppchen (buildFilmG, je yield ein Schritt) = buildFilm in einem Stück (gleiches JSON), G-Spur ebenso
//   B  Autopilot-Prüfung über track/pruefung.js (Worker-Weg) = bisherige Schleife in main.js (Variante, Entschärfungen,
//      Referenzzeit, Teile) – flach, 3D, Gelände
//   C  Tunnel-Attribut mit Hüllquader je Batch = bisherige Rechnung Eckpunkt für Eckpunkt (bitgleich)
//   D  Schalter (core/glatt.js): Standard alles an, ?glatt=0 alles aus, einzelne Regler
// Etappe 2 (Generator-Version 3, Code-Zusatz „p“):
//   E  Pflicht-Liste erfüllt (je Modus/Stufe ≥ 95 % von 40 Codes, Ersatz gezählt), Fehlendes nur in meta.pflicht ausgewiesen
//   F  Schlüssel: Version 1/2 wie bisher, Version 3 mit „p“; alte Codes bitgleich prüft test_alte_codes.mjs
//   G  Autopilot-Prüfung: je Modus/Stufe eine Version-3-Strecke lösbar, ohne Entschärfen
//   H  seltene Elemente: Zerlegen in .TRK-Teile lückenlos, Entschärfen als Ganzes, bauen + fahren
//   I  Darstellung: jedes Teil hat Geometrie in seinen Feldern (je Modus 4 Strecken)
// Aufruf: node tests/node/test_n42.mjs
import { RUNS, runRace, marksOf } from '../../tools/kinoreplay_probe.mjs';
import { buildFilm, buildFilmG } from '../../src/game/highlights.js';
import { gTrack, gTrackG } from '../../src/core/gforce.js';
import { generate } from '../../src/track/generator.js';
import { verify } from '../../src/track/verify.js';
import { genOpt, pruefeZufall } from '../../src/track/pruefung.js';
import { tunnelLaeufe, tunnelAttr, lageIm, maskeBei, TUNNEL_LOOK } from '../../src/track/tunnel.js';
import { prepare } from '../../src/track/verify.js';

let fails = 0;
const check = (ok, msg) => { console.log(`${ok ? 'OK  ' : 'FAIL'} ${msg}`); if (!ok) fails++; };

// ---------- A Film in Häppchen ----------
for (const R of RUNS.slice(0, 2)) {
  const env = R.env(), race = runRace(env, R.opts), marks = marksOf(race);
  const a = buildFilm(race.rec, env, marks, { max: 30 });
  const g = buildFilmG(race.rec, env, marks, { max: 30 });
  let r, schritte = 0;
  for (;;) { r = g.next(); if (r.done) break; schritte++; }
  check(JSON.stringify(a) === JSON.stringify(r.value) && schritte > 5, `A ${R.name}: Film in ${schritte} Häppchen gleich dem Film in einem Stück (${a ? a.clips.length : 0} Clips)`);
  const T1 = gTrack(race.rec, [3, 40]), gg = gTrackG(race.rec, [3, 40]);
  let t; for (;;) { t = gg.next(); if (t.done) break; }
  check(['lon', 'lat', 'vert', 'g'].every((k) => T1[k].every((v, i) => v === t.value[k][i])), `A ${R.name}: G-Spur in Häppchen gleich`);
}

// ---------- B Prüfung ----------
// bisheriger Weg (main.js bis 0.14): Variante 0 erzeugen, prüfen, bei Misserfolg (nicht flach) nächste Variante, höchstens 4
async function bisher(seed, diff, mode, gv) {
  const gopt = (variant) => ({ ...(mode === '3d' ? { d3: true, variant } : mode === 'gel' ? { gel: true, variant } : {}), ...(gv >= 2 ? { gv } : {}) });
  let lay = generate(seed, diff, gopt(0));
  for (let variant = 0; ; variant++) {
    if (variant) lay = generate(seed, diff, gopt(variant));
    const res = await verify(lay, null);
    if (res.ok || mode === 'flat' || variant >= 3) return { variant, pieces: res.layout.pieces, ap: res.apTime, fixes: res.fixes };
  }
}
for (const [seed, diff, mode, gv] of [[4711, 3, 'flat', 2], [20261026, 2, 'gel', 2], [2026, 2, '3d', 2], [77, 1, 'gel', 1]]) {
  const a = await bisher(seed, diff, mode, gv);
  const b = await pruefeZufall(seed, diff, mode, gv);
  check(a.variant === b.variant && a.fixes === b.fixes && a.ap === b.apTime && JSON.stringify(a.pieces) === JSON.stringify(b.layout.pieces),
    `B ${seed}-${diff} ${mode} gv${gv}: Prüfung gleich (Variante ${b.variant}, entschärft ${b.fixes}, Referenz ${b.apTime && b.apTime.toFixed(2)} s)`);
}
check(JSON.stringify(genOpt('gel', 2, 2)) === JSON.stringify({ gel: true, variant: 2, gv: 2 }) && JSON.stringify(genOpt('flat', 0, 1)) === '{}', 'B Generator-Optionen wie bisher');

// ---------- C Tunnel-Attribut ----------
function tunnelAttrAlt(batches, laeufe) {   // Fassung bis 0.14 (ohne Hüllquader je Batch)
  const res = [];
  for (const b of batches) {
    const P = b.pos, nv = P.length / 3;
    let a = null;
    for (const R of laeufe) {
      const x0 = Math.min(R.A[0], R.A[0] + R.D[0] * R.len) - R.tw - 2, x1 = Math.max(R.A[0], R.A[0] + R.D[0] * R.len) + R.tw + 2;
      const z0 = Math.min(R.A[2], R.A[2] + R.D[1] * R.len) - R.tw - 2, z1 = Math.max(R.A[2], R.A[2] + R.D[1] * R.len) + R.tw + 2;
      for (let v = 0; v < nv; v++) {
        const x = P[v * 3], y = P[v * 3 + 1], z = P[v * 3 + 2];
        if (x < x0 || x > x1 || z < z0 || z > z1) continue;
        const [t, r, h] = lageIm(R, x, y, z);
        if (t < -0.6 || t > R.len + 0.6 || Math.abs(r) > R.tw + 0.4 || h < -0.8 || h > R.H + 0.6) continue;
        if (R.art === 'roehre' && b.nrm && (b.nrm[v * 3] * R.B[0] + b.nrm[v * 3 + 2] * R.B[1]) * -r + b.nrm[v * 3 + 1] * (R.Rr - h) <= 0) continue;
        const m = maskeBei(R, t);
        if (!a) a = new Float32Array(nv * 4);
        const dc = R.art === 'roehre' ? 5 : h - (R.art === 'gel' ? deckeGelTest(r) : R.H);
        a[v * 4] = m; a[v * 4 + 1] = t; a[v * 4 + 2] = r; a[v * 4 + 3] = dc;
      }
    }
    res.push(a);
  }
  return res;
}
const { deckeGel: deckeGelTest } = await import('../../src/track/tunnel.js');
let nT = 0;
for (const [seed, diff, opt] of [[20261026, 2, { gel: true, gv: 2 }], [4711, 3, { gel: true }], [1234, 3, { gel: true }], [4711, 3, { gv: 2 }], [99, 3, { gv: 2 }]]) {
  const env = prepare(generate(seed, diff, opt), { treeCount: 0 });
  const tl = tunnelLaeufe(env.track);
  if (!tl.length) continue;
  // Strecken-Batches wie gfx/world.js: aus der Geometrie der Strecke (build.js liefert sie als track.batches)
  const batches = (env.track.batches || []).map((b) => b.pos ? b : null).filter(Boolean);
  if (!batches.length) continue;
  const a = tunnelAttr(batches, tl), b = tunnelAttrAlt(batches, tl);
  const gleich = a.length === b.length && a.every((x, i) => (x === null && b[i] === null) || (x && b[i] && x.length === b[i].length && x.every((v, k) => Object.is(v, b[i][k]))));
  check(gleich, `C ${seed}-${diff}: Tunnel-Attribut bitgleich (${tl.length} Läufe, ${batches.length} Batches, ${a.filter(Boolean).length} mit Tunnel)`);
  nT++;
}
check(nT >= 1 || !TUNNEL_LOOK.an, `C mindestens eine Strecke mit Tunnel verglichen (${nT})`);

// ---------- D Schalter ----------
const lade = async (q) => { globalThis.location = { search: q }; return (await import(`../../src/core/glatt.js?${encodeURIComponent(q)}`)).GLATT; };
const S0 = await lade(''), S1 = await lade('?glatt=0'), S2 = await lade('?vorwaermen=0&pruefung=alt&swfrueh=1');
check(Object.values(S0).every((v) => v === true), 'D Standard: alle Maßnahmen an');
check(Object.values(S1).every((v) => v === false), 'D ?glatt=0: alle aus (Stand 0.14)');
check(!S2.vorwaermen && !S2.pruefungWorker && !S2.swSpaet && S2.einseitig && S2.schattenfix && S2.filmHaeppchen, 'D einzelne Regler wirken nur auf ihre Maßnahme');
delete globalThis.location;

// ---------- E–I Etappe 2 ----------
const { pflichtStatus } = await import('../../src/track/pflicht.js');
const { zerlegeSelten, defuseSelten, SELTEN } = await import('../../src/track/selten.js');
const { defuse } = await import('../../src/track/generator.js');
const { verifySync } = await import('../../src/track/verify.js');
const { buildTrack } = await import('../../src/track/build.js');
const { pieceCells } = await import('../../src/track/pieces.js');
const { tileX, tileZ, TILE } = await import('../../src/track/defs.js');
const MODI = [['flat', {}], ['3d', { d3: true }], ['gel', { gel: true }]];
for (const [m, o] of MODI) for (const d of [1, 2, 3]) {
  let ok = 0, ers = 0;
  for (let s = 1; s <= 40; s++) {
    const l = generate(s * 7919 + 13, d, { ...o, gv: 3, variant: 0 }), st = pflichtStatus(l.pieces, l.meta.pflicht.soll);
    if (st.ok) ok++;
    if (st.ersatz.length) ers++;
    if (JSON.stringify(st.fehlt) !== JSON.stringify(l.meta.pflicht.fehlt)) { check(false, `E ${m}/${d} ${s}: meta.pflicht stimmt nicht`); break; }
  }
  check(ok >= 38, `E ${m}/${d}: Pflicht erfüllt in ${ok}/40 (davon mit Ersatz ${ers})`);
}
const k3 = generate(4711, 2, { gv: 3 }).meta.key, k3d = generate(4711, 2, { d3: true, gv: 3 }).meta.key, k3g = generate(4711, 2, { gel: true, gv: 3 }).meta.key;
check(k3 === '4711-2-p' && k3d === '4711-2-3dp' && k3g === '4711-2-gp' && generate(4711, 2, { gv: 2 }).meta.key === '4711-2-h' && generate(4711, 2).meta.key === '4711-2', `F Schlüssel: ${k3}, ${k3d}, ${k3g}; Version 2 „-h“, Version 1 ohne Zusatz`);
for (const [m, o] of MODI) for (const d of [1, 2, 3]) {
  const l = generate(20261027 + d * 31, d, { ...o, gv: 3, variant: 0 }), v = verifySync(l);
  check(v.ok && v.fixes === 0, `G ${m}/${d} ${l.meta.key}: Autopilot ${v.ok ? 'ins Ziel ' + v.apTime.toFixed(1) + ' s' : 'gescheitert'}, entschärft ${v.fixes}`);
}
{
  const F = [[1, 0], [0, 1], [-1, 0], [0, -1]];
  for (const t of Object.keys(SELTEN)) {
    const seq = [{ type: 'start' }, ...Array(5).fill({ type: 'straight' }), { type: t }, ...Array(5).fill({ type: 'straight' })];
    let i = 3, j = 15, dd = 0; const pieces = [];
    for (const q of seq) { const p = { lvl: 0, m: 1, ...q, i, j, d: dd }; pieces.push(p); [i, j, dd] = pieceCells(p.type, i, j, dd, 1).next; }
    const z = zerlegeSelten(pieces);
    let kette = true;
    for (let k = 1; k < z.length; k++) { const nx = pieceCells(z[k - 1].type, z[k - 1].i, z[k - 1].j, z[k - 1].d, z[k - 1].m || 1).next; if (nx[0] !== z[k].i || nx[1] !== z[k].j || nx[2] !== z[k].d) kette = false; }
    const env = setupN(z);
    const lay = { pieces: z.map((p) => ({ ...p })) }, mitte = lay.pieces.findIndex((p) => p.sel) + 1;
    const vorher = lay.pieces.length, ok = defuse(lay, mitte), nSt = lay.pieces.filter((p) => p.type === 'straight').length;
    check(kette && env && ok && !lay.pieces.some((p) => p.sel) && nSt === 10 + SELTEN[t], `H ${t}: ${z.filter((p) => p.sel).map((p) => p.type).join('+')} lückenlos, gebaut (Linie ${env ? env.track.line.n : 0} Punkte), entschärft ${vorher} → ${lay.pieces.length} Teile, nur Geraden`);
    void F;
  }
}
function setupN(pieces) { try { return { track: buildTrack({ pieces }, { treeCount: 0 }) }; } catch (e) { console.log(e.message); return null; } }
for (const [m, o] of MODI) {
  let teile = 0, leer = 0;
  for (let s = 1; s <= 4; s++) {
    const lay = generate(s * 104729 + 7, 1 + (s % 3), { ...o, gv: 3, variant: 0 }), tr = buildTrack(lay, { treeCount: 0 }), zell = new Map();
    for (const b of tr.batches) for (let t = 0; t < b.idx.length; t += 3) {
      const P = b.pos, a = b.idx[t] * 3, c = b.idx[t + 1] * 3, e = b.idx[t + 2] * 3;
      const kk = Math.floor((P[a] + P[c] + P[e]) / 3 / TILE + 1e-6) + ',' + Math.floor((P[a + 2] + P[c + 2] + P[e + 2]) / 3 / TILE + 1e-6);
      zell.set(kk, (zell.get(kk) || 0) + 1);
    }
    for (const p of lay.pieces) {
      if (/^tr_gap/.test(p.type)) continue;
      teile++;
      const n = pieceCells(p.type, p.i, p.j, p.d, p.m || 1).cells.reduce((q, [i, j]) => q + (zell.get(Math.floor(tileX(i) / TILE + 1e-6) + ',' + Math.floor(tileZ(j) / TILE + 1e-6)) || 0), 0);
      if (!n) leer++;
    }
  }
  check(leer === 0, `I ${m}: alle ${teile} Teile mit Geometrie in ihren Feldern`);
}

console.log(fails ? `\n${fails} FEHLER` : '\nalle OK');
process.exit(fails ? 1 : 0);
