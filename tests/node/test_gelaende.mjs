// n22: Gelände-Strecken (Code „-g“): Determinismus, Schlüssel, Höhenverlauf (Steigung, Fugen ohne Stufe), Gelände nie
// über der Fahrbahn (Physik), Tunnel (Physik unter, Grafik über dem Gewölbe), Schlucht unter dem Sprung, Elemente über
// viele Seeds, Lösbarkeit per Autopilot ohne Entschärfen, Bauzeit, alte Codes bitgleich (build_hash).
// Aufruf: node tests/node/test_gelaende.mjs [Seeds je Stufe=8]
import { spawnSync } from 'child_process';
import { generate, galleryGelLayout, GEL_GALLERY_NEED } from '../../src/track/generator.js';
import { buildTrack } from '../../src/track/build.js';
import { verifySync } from '../../src/track/verify.js';
import { GEL, ENV, HALFPIPE } from '../../src/track/gelaende.js';
import { ROAD_HW } from '../../src/track/defs.js';

const N = +(process.argv[2] || 8);
let checks = 0, bad = 0;
const ok = (c, msg) => { checks++; if (!c) { bad++; console.log('FEHLER', msg); } };
const seeds = Array.from({ length: N }, (_, k) => 1000 + k * 7919 % 90000);

// 1) Schlüssel, Determinismus, alte Codes unberührt
{
  const a = generate(4711, 2, { gel: true }), b = generate(4711, 2, { gel: true });
  ok(a.meta.key === '4711-2-g' && a.meta.gel === true, 'Schlüssel 4711-2-g');
  ok(JSON.stringify(a.pieces) === JSON.stringify(b.pieces) && JSON.stringify(a.gel) === JSON.stringify(b.gel), 'Layout deterministisch');
  const ta = buildTrack(a), tb = buildTrack(b);
  let same = ta.line.n === tb.line.n;
  for (let i = 0; same && i < ta.line.n; i++) if (ta.line.py[i] !== tb.line.py[i] || ta.line.px[i] !== tb.line.px[i]) same = false;
  ok(same, 'Höhenverlauf deterministisch');
  ok(generate(4711, 2).meta.key === '4711-2' && !generate(4711, 2).gel, 'flacher Code ohne Gelände');
  const r = spawnSync(process.execPath, [new URL('./build_hash.mjs', import.meta.url).pathname], { encoding: 'utf8' });
  ok(r.status === 0, 'alte Codes (flach, -3d, Demo, Galerie) bauen bitgleich: ' + (r.stdout || '').trim().split('\n').pop());
}

// 2) Geometrie je Strecke
const elems = {}, times = [];
for (const diff of [1, 2, 3]) for (const seed of seeds) {
  const lay = generate(seed, diff, { gel: true });
  for (const k of Object.keys(lay.meta.elems)) elems[k] = (elems[k] || 0) + 1;
  const t0 = performance.now();
  const tr = buildTrack(lay);
  times.push(performance.now() - t0);
  const L = tr.line, T = tr.terrain, pl = tr.gel.plan.pieces, G = GEL[diff], tag = `${seed}-${diff}-g`;
  ok(L.closed, tag + ': Rundkurs geschlossen');
  let hmin = 1e9, hmax = -1e9, gmax = 0, step = 0, above = 0, aboveAt = '';
  for (let i = 1; i < L.n; i++) {
    const ds = L.s[i] - L.s[i - 1], dy = Math.abs(L.py[i] - L.py[i - 1]);
    if (!L.air[i] && !L.air[i - 1] && !L.loop[i] && ds > 1e-3) step = Math.max(step, dy - 0.6 * ds);   // Stufe = mehr als 60 % Steigung
    if (L.loop[i] || L.air[i]) continue;
    hmin = Math.min(hmin, L.py[i]); hmax = Math.max(hmax, L.py[i]);
    const k = L.piece[i];
    if (!pl[k].rigid && i > 2 && !pl[L.piece[i - 2]].rigid && L.s[i] - L.s[i - 2] > 0.5) gmax = Math.max(gmax, Math.abs(L.py[i] - L.py[i - 2]) / (L.s[i] - L.s[i - 2]));
    // Physik-Gelände nie über der Fahrbahn (Mitte und ±(Breite − 0,6 m), entlang der Querneigung)
    // (quer entlang der geneigten Fahrbahn: B ist der Einheitsvektor nach rechts in der Fahrbahn-Ebene)
    for (const q of [-(L.hw[i] - 0.6), 0, L.hw[i] - 0.6]) {
      const x = L.px[i] + L.bx[i] * q, z = L.pz[i] + L.bz[i] * q, y = L.py[i] + L.by[i] * q;
      if (T.height(x, z) > y - 0.03) { above++; if (!aboveAt) aboveAt = `${i} ${lay.pieces[k].type} q=${q.toFixed(1)} ${(T.height(x, z) - y).toFixed(2)}`; }
    }
  }
  ok(hmax - hmin >= 6, `${tag}: Höhenunterschied ${(hmax - hmin).toFixed(0)} m`);
  ok(gmax <= G.grade * 1.15, `${tag}: Steigung ${(gmax * 100).toFixed(0)} % ≤ ${(G.grade * 115).toFixed(0)} %`);
  ok(step < 0.25, `${tag}: keine Stufe in der Fahrbahn (${step.toFixed(2)} m)`);
  ok(above === 0, `${tag}: Gelände nie über der Fahrbahn (${above}× ${aboveAt})`);
  // Tunnel: Physik unter der Fahrbahn, Grafik über dem Gewölbe (Mitte des Tunnels)
  for (let k = 0; k < pl.length; k++) {
    if (!pl[k].tunnel || pl[k].portalIn || pl[k].portalOut) continue;
    const pi = tr.pieces[k], i = (pi.lineStart + pi.lineEnd) >> 1, gi = Math.round((L.pz[i] + T.ext) / T.step) * T.nx + Math.round((L.px[i] + T.ext) / T.step);
    ok(T.height(L.px[i], L.pz[i]) < L.py[i] && T.Hvis[gi] > L.py[i] + ENV.tunnelH, `${tag}: Tunnel ${k} Physik ${(T.height(L.px[i], L.pz[i]) - L.py[i]).toFixed(1)} / Hügel ${(T.Hvis[gi] - L.py[i]).toFixed(1)} m`);
  }
  // Schlucht: Gelände unter der Lücke tief unter der Lippe, Fluss
  for (const j of tr.jumps) {
    if (lay.pieces[j.piece].g !== 'gorge') continue;
    const m = (j.lipIdx + j.landIdx) >> 1;
    ok(L.py[j.lipIdx] - T.height(L.px[m], L.pz[m]) > ENV.gorgeDepth - 4, `${tag}: Schlucht ${(L.py[j.lipIdx] - T.height(L.px[m], L.pz[m])).toFixed(0)} m tief`);
    ok(T.waters.some((w) => w.river), `${tag}: Fluss in der Schlucht`);
  }
  // Halfpipe: Gelände unter den Viertelröhren (sonst Gras durch die Wand / Räder auf Gras)
  for (let k = 0; k < lay.pieces.length; k++) {
    if (lay.pieces[k].type !== 'halfpipe') continue;
    const pi = tr.pieces[k], i = (pi.lineStart + pi.lineEnd) >> 1, bl = Math.hypot(L.bx[i], L.bz[i]) || 1;
    let worst = -1e9;
    for (const fr of [0.3, 0.6, 0.9]) for (const sg of [-1, 1]) {
      const a = HALFPIPE.A * fr, e = HALFPIPE.hf + HALFPIPE.R * Math.sin(a), y = L.py[i] + HALFPIPE.R * (1 - Math.cos(a));
      worst = Math.max(worst, T.height(L.px[i] + L.bx[i] / bl * sg * e, L.pz[i] + L.bz[i] / bl * sg * e) - y);
    }
    ok(worst < 0, `${tag}: Gelände unter der Halfpipe-Wand (${worst.toFixed(2)} m)`);
  }
  void ROAD_HW;
}
console.log('Elemente', JSON.stringify(elems));
for (const k of ['kuppe', 'tilt', 'tunnel', 'gorge', 'serpentine']) ok((elems[k] || 0) >= Math.ceil(N * 0.25), `Element ${k} in ≥ 25 % der Strecken (${elems[k] || 0}/${3 * N})`);
times.sort((a, b) => a - b);
ok(times[times.length >> 1] < 250, `Bauzeit Median ${times[times.length >> 1].toFixed(0)} ms`);

// 3) Gelände-Galerie (?gallery=gel): alle Elemente, Autopilot im Ziel
{
  const g = galleryGelLayout();
  ok(GEL_GALLERY_NEED.every((k) => g.meta.elems[k]) && g.pieces.some((p) => p.type === 'bank') && g.meta.key === 'galerie-g', 'Gelände-Galerie mit allen Elementen (Seed ' + g.meta.gallerySeed + ')');
  const v = verifySync(galleryGelLayout(), 0);
  ok(v.ok, 'Gelände-Galerie: Autopilot im Ziel ' + (v.ok ? v.apTime.toFixed(1) + ' s' : v.reason));
}

// 4) Lösbarkeit: Autopilot ohne Entschärfen
let fine = 0, tot = 0;
for (const diff of [1, 2, 3]) for (const seed of seeds.slice(0, Math.max(3, N >> 1))) {
  const v = verifySync(generate(seed, diff, { gel: true }), 0);
  tot++; if (v.ok) fine++; else console.log('  nicht gelöst', seed, diff, v.reason);
}
ok(fine >= tot - 1, `Autopilot ohne Entschärfen ${fine}/${tot}`);
console.log(bad ? `${bad} von ${checks} Prüfungen FEHLER` : `Gelände: ${checks} Prüfungen ok`);
process.exit(bad ? 1 : 0);
