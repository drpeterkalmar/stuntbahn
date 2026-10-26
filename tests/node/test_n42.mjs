// n42 Ruckeln + langsamer Start (26.10.2026): die Umbauten ändern keine Ergebnisse.
//   A  Highlight-Film in Häppchen (buildFilmG, je yield ein Schritt) = buildFilm in einem Stück (gleiches JSON), G-Spur ebenso
//   B  Autopilot-Prüfung über track/pruefung.js (Worker-Weg) = bisherige Schleife in main.js (Variante, Entschärfungen,
//      Referenzzeit, Teile) – flach, 3D, Gelände
//   C  Tunnel-Attribut mit Hüllquader je Batch = bisherige Rechnung Eckpunkt für Eckpunkt (bitgleich)
//   D  Schalter (core/glatt.js): Standard alles an, ?glatt=0 alles aus, einzelne Regler
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

console.log(fails ? `\n${fails} FEHLER` : '\nalle OK');
process.exit(fails ? 1 : 0);
