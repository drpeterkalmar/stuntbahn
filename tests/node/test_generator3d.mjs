// n19 B: 3D-Generator – je Seed × Stufe: Rundkurs geschlossen, Belegung (i, j, Ebene) ohne Überlappung außer an
// Kreuzungen (zwei Geraden rechtwinklig, Ebenenabstand ≥ 1), Ebenen ≤ Stufen-Maximum, Ebenenwechsel nur über Rampen/
// Spiralen/Steilrampen/Klippensprünge, Stunts/Steilkurven/Checkpoints nur auf Ebene 0, deterministisch, eigener
// Schlüssel, Autopilot löst die Strecke (mit Entschärfen); Bauzeit höchstens +30 % gegenüber flach (Median).
import { generate } from '../../src/track/generator.js';
import { checkOccupancy, D3 } from '../../src/track/generator3d.js';
import { verifySync, prepare } from '../../src/track/verify.js';
import { pieceCells, PIECES } from '../../src/track/pieces.js';
import { layoutHash } from './layout_hash.mjs';
const N = +(process.argv[2] || 20);
const CHANGE = new Set(['slope2', 'slope3', 'slope4', 'spiral', 'tr_corkud', 'cliff', 'cliff2']);
const GROUND = new Set(['loop', 'jump', 'tube', 'bumps', 'crest', 'chicane', 'waves', 'tr_corklr', 'bank', 'wall', 'tr_bankC', 'checkpoint', 'start']);
let fails = 0, checks = 0;
const ok = (c, msg) => { checks++; if (!c) { fails++; console.log('FEHLER', msg); } };
const tb = { flach: [], d3: [] };
const stats = { 1: {}, 2: {}, 3: {} };
for (let k = 0; k < N; k++) for (const diff of [1, 2, 3]) {
  const seed = 5000 + k * 7919 % 90000, id = `${seed}-${diff}-3d`;
  const lay = generate(seed, diff, { d3: true });
  ok(lay.meta.key === id && lay.meta.d3, `${id}: Schlüssel ${lay.meta.key}`);
  ok(layoutHash(generate(seed, diff, { d3: true })) === layoutHash(lay), `${id}: nicht deterministisch`);
  const P = lay.pieces;
  // geschlossen und lückenlos
  for (let q = 0; q < P.length; q++) {
    const p = P[q], nx = pieceCells(p.type, p.i, p.j, p.d, p.m).next, n = P[(q + 1) % P.length];
    ok(nx[0] === n.i && nx[1] === n.j && nx[2] === n.d, `${id}: Stück ${q} (${p.type}) passt nicht an ${n.type}`);
    ok((p.h1 ?? p.lvl) === n.lvl, `${id}: Ebenensprung zwischen ${p.type} und ${n.type}`);
    if (p.h1 != null && p.h1 !== p.lvl) ok(CHANGE.has(p.type), `${id}: Ebenenwechsel über ${p.type}`);
    if (GROUND.has(p.type)) ok(!p.lvl, `${id}: ${p.type} auf Ebene ${p.lvl}`);
    ok(Math.max(p.lvl, p.h1 ?? 0) <= D3[diff].maxLvl, `${id}: Ebene ${Math.max(p.lvl, p.h1 ?? 0)} > ${D3[diff].maxLvl}`);
    if (/^cliff/.test(p.type)) ok(p.h1 < p.lvl && p.h1 >= 0, `${id}: Klippensprung ${p.lvl}→${p.h1}`);
  }
  ok(P[0].type === 'start' && P[0].lvl === 0, `${id}: Start nicht auf Ebene 0`);
  const occ = checkOccupancy(P);
  ok(occ.ok, `${id}: Belegung doppelt bei ${occ.bad}`);
  ok(occ.crossings === lay.meta.crossings, `${id}: Kreuzungen`);
  ok(lay.meta.levels >= 1, `${id}: keine Höhe`);
  const st = stats[diff];
  st.lv = st.lv || {}; st.lv[lay.meta.levels] = (st.lv[lay.meta.levels] || 0) + 1; st.x = (st.x || 0) + (lay.meta.crossings ? 1 : 0);
  for (const p of P) if (PIECES[p.type].d3 || p.type === 'tr_corkud' || p.type === 'tr_corklr' || p.type === 'tr_bankC') st[p.type] = (st[p.type] || 0) + 1;
  // Bauzeit (Strecke + Kollision + Ideallinie + Profil) gegen die flache Strecke desselben Codes
  const flat = generate(seed, diff);
  let t0 = performance.now(); prepare(flat); tb.flach.push(performance.now() - t0);
  t0 = performance.now(); prepare(lay); tb.d3.push(performance.now() - t0);
  const v = verifySync(lay);
  ok(v.ok, `${id}: Autopilot scheitert (${v.reason})`);
}
const med = (a) => { const b = [...a].sort((x, y) => x - y); return b[b.length >> 1]; };
const r = med(tb.d3) / med(tb.flach);
ok(r <= 1.3, `Bauzeit 3D ${med(tb.d3).toFixed(0)} ms gegen flach ${med(tb.flach).toFixed(0)} ms (×${r.toFixed(2)})`);
for (const d of [1, 2, 3]) console.log(`Stufe ${d}: ${JSON.stringify(stats[d])}`);
console.log(`Bauzeit Median flach ${med(tb.flach).toFixed(0)} ms, 3D ${med(tb.d3).toFixed(0)} ms (×${r.toFixed(2)})`);
console.log(fails ? `${fails}/${checks} Prüfungen fehlgeschlagen` : `3D-Generator: ${checks} Prüfungen ok (${N * 3} Strecken)`);
process.exit(fails ? 1 : 0);
