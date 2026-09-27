// Asset-Build: Quell-Assets (assets_src/, nicht im Repo) -> handytaugliche Dateien in assets/.
// Texturen: 1k WebP. Auto: Spec-Gloss -> Metal-Rough, Schattenebene raus, leicht vereinfacht,
// Texturen WebP 1k, Geometrie Meshopt-komprimiert.  Aufruf: node tools/build_assets.mjs [--car] [--tex]
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { metalRough, dedup, prune, weld, simplify, textureCompress, meshopt } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder, MeshoptSimplifier } from 'meshoptimizer';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const SRC = path.join(ROOT, 'assets_src');
const OUT = path.join(ROOT, 'assets');
const args = process.argv.slice(2);
const all = args.length === 0;

const TEX = {
  asphalt: 'asphalt_02', grass: 'leafy_grass', concrete: 'gravel_concrete_03',
  pad: 'concrete_floor_02', metal: 'metal_plate',
};
const MAPS = { Diffuse: ['diff', 80], nor_gl: ['nor', 88], arm: ['arm', 80] };

if (all || args.includes('--tex')) {
  fs.mkdirSync(path.join(OUT, 'tex'), { recursive: true });
  for (const [short, id] of Object.entries(TEX)) {
    for (const [m, [suf, q]] of Object.entries(MAPS)) {
      const src = path.join(SRC, `${id}_${m}_1k.jpg`);
      const dst = path.join(OUT, 'tex', `${short}_${suf}.webp`);
      await sharp(src).resize(1024, 1024).webp({ quality: q, effort: 6 }).toFile(dst);
    }
  }
  for (const v of [0, 1]) {
    await sharp(path.join(SRC, `fir_card_${v}.png`)).webp({ quality: 82, alphaQuality: 90, effort: 6 })
      .toFile(path.join(OUT, 'tex', `fir_card_${v}.webp`));
  }
  fs.mkdirSync(path.join(OUT, 'hdr'), { recursive: true });
  fs.copyFileSync(path.join(SRC, 'kloofendal_48d_partly_cloudy_puresky_1k.hdr'), path.join(OUT, 'hdr', 'sky_1k.hdr'));
  let sum = 0;
  for (const f of fs.readdirSync(path.join(OUT, 'tex'))) sum += fs.statSync(path.join(OUT, 'tex', f)).size;
  console.log('Texturen', (sum / 1e6).toFixed(2), 'MB');
}

if (all || args.includes('--car')) {
  await MeshoptEncoder.ready; await MeshoptDecoder.ready; await MeshoptSimplifier.ready;
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });
  const doc = await io.read(path.join(SRC, 'goblin_src.glb'));
  for (const n of doc.getRoot().listNodes()) if (n.getName().startsWith('car_shadow')) n.dispose();
  let before = 0;
  for (const m of doc.getRoot().listMeshes()) for (const p of m.listPrimitives()) before += (p.getIndices()?.getCount() || 0) / 3;
  await doc.transform(
    metalRough(), dedup(), prune(), weld(),
    simplify({ simplifier: MeshoptSimplifier, ratio: 0.55, error: 0.0006, lockBorder: true }),
    prune(),
    textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [1024, 1024], quality: 82 }),
    meshopt({ encoder: MeshoptEncoder, level: 'medium' }),
  );
  let after = 0;
  for (const m of doc.getRoot().listMeshes()) for (const p of m.listPrimitives()) after += (p.getIndices()?.getCount() || 0) / 3;
  fs.mkdirSync(path.join(OUT, 'car'), { recursive: true });
  await io.write(path.join(OUT, 'car', 'goblin.glb'), doc);
  console.log('Auto: Dreiecke', before, '->', after, 'Datei', (fs.statSync(path.join(OUT, 'car', 'goblin.glb')).size / 1e6).toFixed(2), 'MB');
  for (const mat of doc.getRoot().listMaterials()) console.log('  Material', mat.getName(), 'metal', mat.getMetallicFactor(), 'rough', mat.getRoughnessFactor(), 'color', mat.getBaseColorFactor().map(v => v.toFixed(2)).join(','), mat.getBaseColorTexture() ? 'tex' : '');
}

// Stark vereinfachtes Auto ohne Texturen für geparkte Autos importierter Strecken (wird nur bei Bedarf geladen)
if (all || args.includes('--car-lod')) {
  await MeshoptEncoder.ready; await MeshoptDecoder.ready; await MeshoptSimplifier.ready;
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });
  const doc = await io.read(path.join(SRC, 'goblin_src.glb'));
  for (const n of doc.getRoot().listNodes()) if (n.getName().startsWith('car_shadow')) n.dispose();
  // Texturen weg, Materialien als einfache Farben (Lack, Glas, Reifen, Chrom)
  for (const mat of doc.getRoot().listMaterials()) {
    const n = mat.getName().toLowerCase();
    mat.setBaseColorTexture(null).setNormalTexture(null).setMetallicRoughnessTexture(null).setOcclusionTexture(null).setEmissiveTexture(null);
    for (const ext of mat.listExtensions()) mat.setExtension(ext.extensionName, null);
    if (n.includes('glass')) mat.setBaseColorFactor([0.03, 0.05, 0.05, 1]).setMetallicFactor(0.2).setRoughnessFactor(0.08);
    else if (n.includes('tire')) mat.setBaseColorFactor([0.05, 0.05, 0.05, 1]).setMetallicFactor(0).setRoughnessFactor(0.9);
    else if (n.includes('clearcoat') || n.includes('body')) mat.setBaseColorFactor([0.1, 0.25, 0.7, 1]).setMetallicFactor(0.5).setRoughnessFactor(0.35);
    else mat.setBaseColorFactor([0.5, 0.5, 0.52, 1]).setMetallicFactor(0.6).setRoughnessFactor(0.4);
  }
  let before = 0;
  for (const m of doc.getRoot().listMeshes()) for (const p of m.listPrimitives()) before += (p.getIndices()?.getCount() || 0) / 3;
  await doc.transform(
    dedup(), prune(), weld(),
    simplify({ simplifier: MeshoptSimplifier, ratio: 0.03, error: 0.03, lockBorder: false }),
    prune(),
  );
  for (const t of doc.getRoot().listTextures()) t.dispose();
  await doc.transform(prune(), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
  let after = 0;
  for (const m of doc.getRoot().listMeshes()) for (const p of m.listPrimitives()) after += (p.getIndices()?.getCount() || 0) / 3;
  await io.write(path.join(OUT, 'car', 'goblin_lod.glb'), doc);
  console.log('Auto (LOD, geparkt): Dreiecke', before, '->', after, 'Datei', (fs.statSync(path.join(OUT, 'car', 'goblin_lod.glb')).size / 1e3).toFixed(0), 'KB');
}
