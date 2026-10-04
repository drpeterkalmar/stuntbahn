// n24 Etappe 1: Show-Tacho (core/showspeed.js) und G-Kräfte (core/gforce.js).
// A: showKmh streng monoton über 0–800 km/h (0,5er-Schritte), Steigung ≥ 0,5, Fixpunkte, 0 → 0, ab 250 identisch, Umkehrung.
// B: G-Kräfte auf aufgezeichneten Runden (flach Irre mit Looping + Schanzen, Gelände Irre): keine NaN, Werte im Band,
//    Stand 0,0 G, Kurve typ. 1–3 G, Looping 3–7 G, Landung > Kurve, nie über 10 G, live (fortlaufend) = Replay (gTrack).
// C: Highlight-Texte mit G und Show-km/h, Schwellen weiter mit echten Werten.
import { showKmh, realKmh, TACHO_SHOW } from '../../src/core/showspeed.js';
import { GMeter, gTrack, showG, showImpact, GF } from '../../src/core/gforce.js';
import { RUNS, runRace, marksOf } from '../../tools/kinoreplay_probe.mjs';
import { findMoments, buildFilm, HL } from '../../src/game/highlights.js';
import { REC_HZ, REC_STRIDE } from '../../src/game/race.js';

let fails = 0;
const check = (ok, msg) => { console.log(`${ok ? 'OK  ' : 'FAIL'} ${msg}`); if (!ok) fails++; };
const f1 = (x) => x.toFixed(1).replace('.', ',');
const pct = (a, p) => { const s = Float32Array.from(a).sort(); return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : 0; };

console.log('--- A: Show-Tacho ---');
{
  let mono = true, minSlope = 1e9, cont = true, prev = showKmh(0);
  for (let v = 0.5; v <= 800; v += 0.5) {
    const s = showKmh(v);
    if (!(s > prev)) mono = false;
    minSlope = Math.min(minSlope, (s - prev) / 0.5);
    if (s - prev > 2) cont = false;
    prev = s;
  }
  check(mono, 'streng monoton über 0–800 km/h (0,5er-Schritte)');
  check(minSlope >= 0.5 - 1e-6, `Steigung überall ≥ 0,5 (kleinste ${minSlope.toFixed(3)})`);
  check(cont, 'stetig (kein Sprung > 2 km/h je 0,5 km/h)');
  check(showKmh(0) === 0, '0 → 0');
  const FIX = [[10, 24], [20, 45], [30, 65], [40, 82], [60, 112], [100, 154], [150, 186], [200, 212], [250, 250]];
  const fx = FIX.map(([v, w]) => [v, w, showKmh(v)]);
  check(fx.every(([, w, s]) => Math.abs(s - w) <= 1), `Fixpunkte ${fx.map(([v, , s]) => `${v}→${Math.round(s)}`).join(', ')}`);
  let ident = true; for (let v = 250; v <= 800; v += 0.5) if (Math.abs(showKmh(v) - v) > 1e-9) ident = false;
  check(ident, `ab ${TACHO_SHOW.vEq} km/h identisch (Vmax ~586, Nitro ~700 unverändert)`);
  check(showKmh(-40) === -showKmh(40), 'rückwärts: Vorzeichen bleibt');
  check([30, 82, 154, 300].every((s) => Math.abs(showKmh(realKmh(s)) - s) < 0.01), `Umkehrung: Tacho 82 = echt ${f1(realKmh(82))} km/h, Wiese echt 30 → Tacho ${Math.round(showKmh(30))}`);
  check(showKmh(40, 0) === 40, '?tacho=echt (k = 0) = echte km/h');
}

console.log('--- B: G-Kräfte auf aufgezeichneten Runden ---');
check(showG(100) <= GF.max + 1e-9 && showImpact(100) <= GF.impMax + 1e-9 && showG(0) === 0, `Show-Kurve gedeckelt: 100 G echt → ${f1(showG(100))} (Fahrt) / ${f1(showImpact(100))} (Landung), 0 → 0`);
const agg = { stand: [], kurve: [], loop: [], flug: [] }, peaks = { loop: [], land: [], curve: [] };
const films = [];
for (const k of [0, 2]) {
  const R = RUNS[k], env = R.env(), race = runRace(env, R.opts), marks = marksOf(race);
  const cuts = race.cuts.map((c) => c.f);
  const T = gTrack(race.rec, cuts);
  let nan = 0, mx = 0;
  for (let i = 0; i < T.F; i++) { for (const a of [T.g, T.lat, T.lon, T.vert]) if (!Number.isFinite(a[i])) nan++; mx = Math.max(mx, T.g[i]); }
  check(nan === 0 && T.F > 1000, `${R.name}: ${T.F} Bilder, keine NaN`);
  check(mx <= 10.001, `${R.name}: nie über 10 G (größter Wert ${f1(mx)})`);
  // live = Replay: fortlaufend Bild für Bild (wie main.js gLiveSync) gibt dieselben Werte
  const m = new GMeter(), cs = new Set(cuts);
  let diff = 0;
  for (let i = 0; i < T.F; i++) { if (cs.has(i)) m.reset(); m.push(race.rec, i); diff = Math.max(diff, Math.abs(m.show - T.g[i])); }
  check(diff < 1e-5, `${R.name}: live (fortlaufend) = Replay (größte Abweichung ${diff.toExponential(1)})`);
  const { D, cands } = findMoments(race.rec, env, marks), L = env.track.line;
  for (let i = 0; i < T.F; i++) {
    if (D.bad[i]) continue;
    const j = D.idx[i];
    if (Math.abs(D.sp[i]) < 0.3) agg.stand.push(T.now[i]);
    else if (D.air[i]) agg.flug.push(T.now[i]);
    else if (L.loop[j]) agg.loop.push(T.now[i]);
    else if (Math.abs(T.rLat[i]) > 0.8 && !L.tube[j]) agg.kurve.push(T.now[i]);
  }
  for (const c of cands) {
    if (c.kind === 'loop') peaks.loop.push(c.g);
    if (/^(jump|gorge|hard)$/.test(c.kind)) peaks.land.push(c.g);
    if (c.kind === 'curve') peaks.curve.push(c.g);
  }
  const film = buildFilm(race.rec, env, marks);
  films.push(...film.clips.map((c) => c.label));
  // Schwellen der Highlights weiter mit echten Werten (z. B. Spitzentempo ab 250 echte km/h)
  const top = cands.find((c) => c.kind === 'top');
  if (top) check(top.vmax * 3.6 > HL.top.min, `${R.name}: Spitzentempo-Schwelle mit echten km/h (${Math.round(top.vmax * 3.6)} > ${HL.top.min})`);
}
// Stand: bei 60 Hz kurz vor dem Start; mindestens ein Bild
check(agg.stand.length > 0 && Math.max(...agg.stand) < 0.05, `Stand 0,0 G (${agg.stand.length} Bilder, max ${f1(Math.max(0, ...agg.stand))})`);
const kMed = pct(agg.kurve, 0.5), kP90 = pct(agg.kurve, 0.9);
check(kMed >= 1 && kMed <= 3 && kP90 <= 3.5, `Kurve typ. 1–3 G (Median ${f1(kMed)}, P90 ${f1(kP90)})`);
const lMax = Math.max(...peaks.loop);
check(peaks.loop.length >= 2 && peaks.loop.every((g) => g >= 3 && g <= 7), `Looping 3–7 G (Spitzen ${peaks.loop.map(f1).join(', ')})`);
const landMed = pct(peaks.land, 0.5);
check(peaks.land.length >= 2 && landMed > kP90 && Math.max(...peaks.land) <= 10, `Landung > Kurve: Landungen ${peaks.land.map(f1).join(', ')} G gegen Kurve P90 ${f1(kP90)} G`);
const fMed = pct(agg.flug, 0.5);
check(fMed > 0.4 && fMed < 1.3, `Flug ~0,7 G nach unten (Median ${f1(fMed)})`);

console.log('--- C: Highlight-Texte ---');
console.log('     ' + films.join(' · '));
check(films.some((l) => /Looping · \d+,\d G/.test(l)), 'Looping mit G („🌀 Looping · 6,2 G“)');
check(films.some((l) => /Sprung.* · \d+,\d G/.test(l)), 'Sprung mit Landungs-G');
check(films.filter((l) => /km\/h/.test(l)).every((l) => !/ (\d{1,2}) km\/h/.test(l) || +/ (\d+) km\/h/.exec(l)[1] >= 20), 'km/h-Texte als Show-Tacho');

console.log(fails ? `FEHLER: ${fails}` : 'alle G-/Tacho-Tests OK');
process.exit(fails ? 1 : 0);
