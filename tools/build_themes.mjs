// Kulissen (n20): Boden- und Fels-Texturen der Landschafts-Themen (ambientCG, CC0; tools/fetch_themes.py) als KTX2
// (Basis Universal ETC1S + Mipmaps, wie tools/build_ktx2.mjs: senkrecht gespiegelt, damit sie auf den UVs der WebP-Fassung
// liegen). arm = AO (R), Rauheit (G), Metall 0 (B) wie bei den Poly-Haven-Sätzen.
// Ausgabe: assets/themes/<thema>/ground_{diff,nor,arm}.ktx2, rock_{diff,nor}.ktx2 (Fels nur, wo das Thema eigenen Fels hat)
// Gemeinsam genutzte Sätze liegen nur einmal im Repo (assets/themes/tex/<Name>_*.ktx2), die Themen verweisen darauf.
// Aufruf: node tools/build_themes.mjs [Name …]
import { encodeToKTX2 } from 'ktx2-encoder';
import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const SRC = path.join(ROOT, 'assets_src', 'themes', 'tex');
const OUT = path.join(ROOT, 'assets', 'themes', 'tex');
fs.mkdirSync(OUT, { recursive: true });
// Satz → Größe (Boden 1024, Fels 512: Fels sieht man nur an steilen Hängen)
const SETS = { Ground097: 1024, Grass004: 1024, Grass001: 1024, ScatteredLeaves009: 1024, Snow010A: 1024, Rock029: 512, Rock051: 512, Rock058: 512 };
const want = process.argv.slice(2);
const raw = async (img, size) => { const r = await img.resize(size, size).flip().ensureAlpha().raw().toBuffer({ resolveWithObject: true }); return { width: r.info.width, height: r.info.height, data: new Uint8Array(r.data) }; };
const enc = (img, kind) => encodeToKTX2(new Uint8Array(1), {
  imageDecoder: async () => img, isUASTC: false, generateMipmap: true, isNormalMap: kind === 'nor', isKTX2File: true,
  isSetKTX2SRGBTransferFunc: kind === 'diff', qualityLevel: kind === 'nor' ? 200 : 160, compressionLevel: 2, enableDebug: false,
});
let tot = 0;
for (const [set, size] of Object.entries(SETS)) {
  if (want.length && !want.includes(set)) continue;
  const f = (k) => path.join(SRC, set, `${set}_1K-JPG_${k}.jpg`);
  const has = (k) => fs.existsSync(f(k));
  const out = {};
  out.diff = await raw(sharp(f('Color')), size);
  out.nor = await raw(sharp(f('NormalGL')), size);
  if (!set.startsWith('Rock')) {
    // arm: AO (R), Rauheit (G), 0 (B)
    const ao = has('AmbientOcclusion') ? await sharp(f('AmbientOcclusion')).resize(size, size).flip().greyscale().raw().toBuffer() : Buffer.alloc(size * size, 255);
    const ro = has('Roughness') ? await sharp(f('Roughness')).resize(size, size).flip().greyscale().raw().toBuffer() : Buffer.alloc(size * size, 230);
    // Rauheit auf Gelände-Niveau (Mittel ~180 wie das bisherige Gras): ambientCG-Gras ist teils sehr glatt (Grass004 ~67)
    // und glänzte im Streiflicht wie nass
    let mean = 0; for (let i = 0; i < size * size; i++) mean += ro[i]; mean /= size * size;
    const d = new Uint8Array(size * size * 4);
    for (let i = 0; i < size * size; i++) { d[i * 4] = ao[i]; d[i * 4 + 1] = Math.max(0, Math.min(255, Math.round(180 + (ro[i] - mean) * 0.5))); d[i * 4 + 2] = 0; d[i * 4 + 3] = 255; }
    out.arm = { width: size, height: size, data: d };
  }
  for (const [k, img] of Object.entries(out)) {
    const b = await enc(img, k);
    const p = path.join(OUT, `${set}_${k}.ktx2`);
    fs.writeFileSync(p, b);
    tot += b.length;
    console.log(`${set}_${k}`.padEnd(26), (b.length / 1e6).toFixed(3), 'MB');
  }
}
console.log('Summe', (tot / 1e6).toFixed(2), 'MB');
