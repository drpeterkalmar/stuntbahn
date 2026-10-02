// Kino-Look (n17): kachelnde PBR-Texturen zusätzlich als KTX2 (Basis Universal ETC1S, mit Mipmaps). Auf der Grafikkarte
// bleiben sie komprimiert (ETC2/ASTC/BC je Gerät) → ~¼ des Grafikspeichers von RGBA8, Datei kleiner als WebP.
// Das Bild wird vor dem Kodieren senkrecht gespiegelt: komprimierte Texturen lassen sich beim Hochladen nicht spiegeln
// (flipY), so landen sie genau wie die WebP-Fassung (TextureLoader, flipY) auf den UVs – auch die Normalen stimmen.
// Atlanten (Pflanzen, Tannen) bleiben WebP. Aufruf: node tools/build_ktx2.mjs [name …]
import { encodeToKTX2 } from 'ktx2-encoder';
import sharp from 'sharp';
import fs from 'fs';
const SETS = ['asphalt', 'concrete', 'grass', 'pad', 'metal'];   // Kies lädt deco.js (WebP)
const want = process.argv.slice(2);
const imageDecoder = async (buf) => { const r = await sharp(Buffer.from(buf)).flip().ensureAlpha().raw().toBuffer({ resolveWithObject: true }); return { width: r.info.width, height: r.info.height, data: new Uint8Array(r.data) }; };
let tw = 0, tk = 0;
for (const set of SETS) for (const kind of ['diff', 'nor', 'arm']) {
  const name = `${set}_${kind}`, src = `assets/tex/${name}.webp`;
  if (!fs.existsSync(src) || (want.length && !want.some((w) => name.startsWith(w)))) continue;
  const out = await encodeToKTX2(new Uint8Array(fs.readFileSync(src)), {
    imageDecoder, isUASTC: false, generateMipmap: true, isNormalMap: kind === 'nor', isKTX2File: true,
    isSetKTX2SRGBTransferFunc: kind === 'diff', qualityLevel: kind === 'nor' ? 200 : 160, compressionLevel: 2, enableDebug: false,
  });
  fs.writeFileSync(`assets/tex/${name}.ktx2`, out);
  tw += fs.statSync(src).size; tk += out.length;
  console.log(name.padEnd(16), (fs.statSync(src).size / 1e6).toFixed(3), '→', (out.length / 1e6).toFixed(3), 'MB');
}
console.log('Summe WebP', (tw / 1e6).toFixed(2), 'MB → KTX2', (tk / 1e6).toFixed(2), 'MB');
