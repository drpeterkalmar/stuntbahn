// n22: Gelände-Dreiecke (Nahraster wie world.js: feine Blöcke 2·TB² Dreiecke, grobe 2) und Strecken-Batches
// (≈ Draw-Calls der Strecke) – Gelände-Strecken gegen die flache Strecke desselben Codes.
// Aufruf: node tools/gelaende_tris.mjs [Seeds=10]
import { generate } from '../src/track/generator.js';
import { buildTrack } from '../src/track/build.js';
import { TB } from '../src/track/terrgrid.js';
const N = +(process.argv[2] || 10);
const tris = (T) => { let f = 0; for (const v of T.fine) f += v; return f * TB * TB * 2 + (T.fine.length - f) * 2; };
const rows = [];
for (const d of [1, 2, 3]) for (let q = 0; q < N; q++) {
  const s = 1000 + q * 7919 % 90000;
  const a = buildTrack(generate(s, d)), b = buildTrack(generate(s, d, { gel: true }));
  const tt = (t) => t.batches.reduce((x, y) => x + y.idx.length / 3, 0);
  rows.push({ d, flatT: tris(a.terrain), gelT: tris(b.terrain), flatB: a.batches.length, gelB: b.batches.length, flatTr: tt(a), gelTr: tt(b), trees: [a.trees.length, b.trees.length] });
}
const avg = (f) => rows.reduce((x, r) => x + f(r), 0) / rows.length;
console.log(`Gelände-Dreiecke Ø flach ${avg((r) => r.flatT).toFixed(0)} → Gelände ${avg((r) => r.gelT).toFixed(0)} (${((avg((r) => r.gelT) / avg((r) => r.flatT) - 1) * 100).toFixed(0)} %), max ${Math.max(...rows.map((r) => r.gelT / r.flatT)).toFixed(2)}×`);
console.log(`Strecken-Batches Ø flach ${avg((r) => r.flatB).toFixed(1)} → ${avg((r) => r.gelB).toFixed(1)}; Strecken-Dreiecke Ø ${avg((r) => r.flatTr).toFixed(0)} → ${avg((r) => r.gelTr).toFixed(0)}; Bäume Ø ${avg((r) => r.trees[0]).toFixed(0)} → ${avg((r) => r.trees[1]).toFixed(0)}`);
