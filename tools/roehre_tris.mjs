// n29: Dreiecke und Batches (≈ Draw-Calls je Chunk/Material) der Röhre mit und ohne Buckel (Node). Röhren-Anteil =
// Strecke mit Röhre − Strecke mit zwei Geraden statt Röhre; Buckel-Anteil = mit − ohne Buckel. Warnstreifen (gfx/jumpdeck.js)
// je Buckel 12 Dreiecke im gemeinsamen Markierungs-Mesh der Schanzen (+1 Draw-Call nur auf Strecken ohne Schanze).
// Aufruf: node tools/roehre_tris.mjs
import { buildTrack } from '../src/track/build.js';
import { setTubeHump } from '../src/track/pieces.js';
import { chain } from '../tests/node/common.mjs';
import { generate, galleryLayout } from '../src/track/generator.js';
const sg = (x, k = 1) => (x >= 0 ? '+' : '−') + Math.abs(x).toFixed(k);
const tris = (t) => t.batches.reduce((a, b) => a + b.idx.length / 3, 0);
const stat = (lay) => { const t = buildTrack(lay, { treeCount: 0 }); return { tris: tris(t), batches: t.batches.length, col: t.col.mat.length }; };
const mk = (list) => ({ pieces: chain(5, 15, 0, list).pieces, seed: 1 });
const withTube = mk(['start', 'straight', 'tube', 'straight', 'straight']), noTube = mk(['start', 'straight', 'straight', 'straight', 'straight', 'straight']);
const a = stat(withTube), b = stat(noTube);
setTubeHump({ on: false }); const c = stat(withTube), gG = stat(galleryLayout()), rs = [4711, 31, 9].map((s) => stat(generate(s, 3))); setTubeHump({ on: true });
const gH = stat(galleryLayout()), rh = [4711, 31, 9].map((s) => stat(generate(s, 3)));
const tubeTris = c.tris - b.tris, humpTris = a.tris - c.tris;
console.log(`Röhre (glatt) ${tubeTris} Dreiecke Grafik, mit Buckel ${a.tris - b.tris} (${sg(humpTris, 0)}, ${sg(100 * humpTris / tubeTris)} %; +12 Warnstreifen)`);
console.log(`Kollision: Röhre glatt ${c.col - b.col}, mit Buckel ${a.col - b.col} (${sg(100 * (a.col - c.col) / (c.col - b.col))} %)`);
console.log(`Batches (Chunk × Material ≈ Draw-Calls der Strecke): Teststrecke glatt ${c.batches}, mit Buckel ${a.batches}; Galerie ${gG.batches} → ${gH.batches}; Zufall ${rs.map((x) => x.batches).join('/')} → ${rh.map((x) => x.batches).join('/')}`);
console.log(`Dreiecke ganze Strecke: Galerie ${gG.tris} → ${gH.tris} (${sg(100 * (gH.tris / gG.tris - 1), 2)} %)`);
