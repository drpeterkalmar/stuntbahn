// Optik (28.09.2026): Felsen und Kies-Textur für die Umgebung aus assets_src/deco/ (Poly Haven, CC0).
//  - assets/deco/rocks.glb: drei Steine aus rock_moss_set_01, stark vereinfacht (je ~230–280 Dreiecke),
//    Texturen 512 px WebP, Meshopt-komprimiert. Jeder Fels ist ein eigenes Mesh (im Spiel instanziert).
//  - assets/tex/gravel_diff.webp / gravel_nor.webp: Kiesbett/Randstreifen (512 px).
// Vorher: python3 tools/fetch_deco.py. Aufruf: node tools/build_deco.mjs
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, weld, simplify, textureCompress, meshopt, flatten, unpartition, mergeDocuments } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder, MeshoptSimplifier } from 'meshoptimizer';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const SRC = path.join(ROOT, 'assets_src', 'deco');
const OUT = path.join(ROOT, 'assets');
fs.mkdirSync(path.join(OUT, 'deco'), { recursive: true });
await MeshoptEncoder.ready; await MeshoptDecoder.ready; await MeshoptSimplifier.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });

// Kies
for (const [m, n, q] of [['Diffuse', 'diff', 80], ['nor_gl', 'nor', 84]]) {
  await sharp(path.join(SRC, `gravel_floor_02_${m}_1k.jpg`)).resize(512, 512).webp({ quality: q, effort: 6 }).toFile(path.join(OUT, 'tex', `gravel_${n}.webp`));
}

// Felsen: aus beiden Quellen die gewünschten Meshes in ein Dokument
const keep = { rock_moss_set_01: ['rock_moss_set_01_rock01', 'rock_moss_set_01_rock04', 'rock_moss_set_01_rock06'] };
const docs = [];
for (const [asset, names] of Object.entries(keep)) {
  const doc = await io.read(path.join(SRC, asset, `${asset}_1k.gltf`));
  const root = doc.getRoot();
  for (const node of root.listNodes()) if (node.getMesh() && !names.includes(node.getName()) && !names.includes(node.getMesh().getName())) node.dispose();
  await doc.transform(flatten(), prune(), dedup(), weld());
  // Zielgröße: ~260 Dreiecke je Fels (die Felsen einer Quelle sind etwa gleich fein → ein Verhältnis je Quelle)
  let tris = 0;
  const meshes = root.listMeshes();
  for (const mesh of meshes) for (const p of mesh.listPrimitives()) tris += (p.getIndices() ? p.getIndices().getCount() : p.getAttribute('POSITION').getCount()) / 3;
  const ratio = Math.min(1, 260 * meshes.length / tris);
  await doc.transform(simplify({ simplifier: MeshoptSimplifier, ratio, error: 1 }));
  console.log(asset, meshes.length, 'Meshes', Math.round(tris), '→ Ziel', Math.round(tris * ratio));
  await doc.transform(prune(), textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [512, 512], quality: 80 }));
  docs.push(doc);
}
// zusammenführen
const main = docs[0];
for (const d of docs.slice(1)) mergeDocuments(main, d);
const scenes = main.getRoot().listScenes();
for (const s of scenes.slice(1)) { for (const n of s.listChildren()) scenes[0].addChild(n); s.dispose(); }
await main.transform(unpartition(), prune(), dedup(), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
for (const m of main.getRoot().listMeshes()) {
  let t = 0; for (const p of m.listPrimitives()) t += p.getIndices().getCount() / 3;
  console.log('Fels', m.getName(), t, 'Dreiecke');
}
await io.write(path.join(OUT, 'deco', 'rocks.glb'), main);
for (const f of ['deco/rocks.glb', 'tex/gravel_diff.webp', 'tex/gravel_nor.webp', 'tex/veg_atlas.webp']) console.log(f, fs.statSync(path.join(OUT, f)).size);
