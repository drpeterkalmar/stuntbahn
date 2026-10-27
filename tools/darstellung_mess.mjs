// n42 Etappe 2 (3): Darstellungs-Problem? Je Modus N Zufallsstrecken bauen (buildTrack wie im Spiel) und je Teil prüfen, ob
// in seinen Feldern Strecken-Geometrie liegt (Dreiecke der Strecken-Batches mit Schwerpunkt im Feld). Lücken (tr_gap) haben
// absichtlich keine Fahrbahn. Ausgabe: Teile ohne Geometrie je Typ.
//   node tools/darstellung_mess.mjs [N=30] [gv=3]
import { generate } from '../src/track/generator.js';
import { buildTrack } from '../src/track/build.js';
import { pieceCells } from '../src/track/pieces.js';
import { tileX, tileZ, TILE } from '../src/track/defs.js';
const args = process.argv.slice(2);
const N = +(args.find((a) => /^\d+$/.test(a)) || 30), gv = +((args.find((a) => /^gv=/.test(a)) || 'gv=3').slice(3));
const erg = {};
for (const [m, o] of [['flat', {}], ['3d', { d3: true }], ['gel', { gel: true }]]) {
  let teile = 0; const leer = {}, jeTyp = {};
  for (let s = 1; s <= N; s++) {
    const lay = generate(s * 104729 + 7, 1 + (s % 3), { ...o, gv, variant: 0 });
    const tr = buildTrack(lay, { treeCount: 0 });
    // Dreieck-Schwerpunkte je Feld
    const zell = new Map();
    for (const b of tr.batches) {
      const P = b.pos, I = b.idx;
      for (let t = 0; t < I.length; t += 3) {
        const a = I[t] * 3, c = I[t + 1] * 3, d = I[t + 2] * 3;
        const x = (P[a] + P[c] + P[d]) / 3, z = (P[a + 2] + P[c + 2] + P[d + 2]) / 3;
        const k = Math.floor(x / TILE + 1e-6) + ',' + Math.floor(z / TILE + 1e-6);
        zell.set(k, (zell.get(k) || 0) + 1);
      }
    }
    const x0 = tileX(0) - TILE / 2, z0 = tileZ(0) - TILE / 2;
    const feld = (i, j) => zell.get(Math.floor((x0 + i * TILE + TILE / 2) / TILE + 1e-6) + ',' + Math.floor((z0 + j * TILE + TILE / 2) / TILE + 1e-6)) || 0;
    for (const p of lay.pieces) {
      if (/^tr_gap/.test(p.type)) continue;
      teile++; jeTyp[p.type] = (jeTyp[p.type] || 0) + 1;
      const cells = pieceCells(p.type, p.i, p.j, p.d, p.m || 1).cells;
      const n = cells.reduce((q, [i, j]) => q + feld(i, j), 0);
      if (!n) leer[p.type] = (leer[p.type] || 0) + 1;
    }
  }
  erg[m] = { teile, ohneGeometrie: leer, typen: Object.keys(jeTyp).length };
  console.log(m, JSON.stringify(erg[m]));
}
