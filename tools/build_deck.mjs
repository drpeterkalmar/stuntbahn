// n24 Schanzen-Belag (Peter 03.10.2026: „Textur der Sprungschanze sieht ungustiös aus“): aus dem Poly-Haven-Riffelblech
// (Metal Plate, Rob Tuytel, CC0; assets_src/metal_plate_*_1k.jpg) ein sauberes, helles, neutral graues Stahldeck:
//   – Farbe: nur die Helligkeit der Vorlage, großflächige Flecken (Rost, Grünstich) per Hochpass entfernt (Helligkeit minus
//     stark weichgezeichnete Helligkeit), Kontrast gedämpft → die Rauten bleiben, Rost/Grün/Lila verschwinden; Grundton
//     neutral hellgrau (leicht kühl, kein Blau-Lila-Stich)
//   – Normalen: Vorlage, Neigung auf nStrength gedämpft (weniger Moiré in der Ferne, dazu normalScale im Material)
//   – ARM: Verdeckung aus der Vorlage (gedämpft), Rauheit gleichmäßiger (Hochpass), Metall-Kanal 1
// Ausgabe: assets/tex/metal_{diff,nor,arm}.webp (gleiche Namen wie bisher; danach node tools/build_ktx2.mjs metal).
// Aufruf: node tools/build_deck.mjs
import sharp from 'sharp';
import path from 'path'; import url from 'url';
const ROOT = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), '..');
const SRC = (k) => path.join(ROOT, 'assets_src', `metal_plate_${k}_1k.jpg`);
const OUT = (k) => path.join(ROOT, 'assets', 'tex', `metal_${k}.webp`);
const N = 1024, BASE = [170, 173, 176], SPREAD = 0.4, nStrength = 0.6;

const raw = async (f, ch = 3) => (await sharp(f).resize(N, N).removeAlpha().raw().toBuffer({ resolveWithObject: true })).data;
const blurL = async (lum, sigma) => (await sharp(Buffer.from(lum), { raw: { width: N, height: N, channels: 1 } }).blur(sigma).raw().toBuffer());

// Helligkeit + Hochpass
const d = await raw(SRC('Diffuse'));
const lum = new Uint8Array(N * N);
for (let i = 0; i < N * N; i++) lum[i] = Math.round(0.299 * d[i * 3] + 0.587 * d[i * 3 + 1] + 0.114 * d[i * 3 + 2]);
const low = await blurL(lum, 24), fineL = await blurL(lum, 0.8);   // Korn (Rost-Sprenkel) weg, Rauten bleiben
let sd = 0; const hp = new Float32Array(N * N);
for (let i = 0; i < N * N; i++) { hp[i] = fineL[i] - low[i]; sd += hp[i] * hp[i]; }
sd = Math.sqrt(sd / (N * N)) || 1;
const diff = Buffer.alloc(N * N * 3);
for (let i = 0; i < N * N; i++) {
  const k = 1 + SPREAD * Math.max(-1.6, Math.min(1.6, hp[i] / sd)) * 0.32;
  for (let c = 0; c < 3; c++) diff[i * 3 + c] = Math.max(0, Math.min(255, Math.round(BASE[c] * k)));
}
await sharp(diff, { raw: { width: N, height: N, channels: 3 } }).webp({ quality: 78, effort: 6 }).toFile(OUT('diff'));

// Normalen gedämpft (OpenGL-Normalen: 128 = flach)
const nr = await raw(SRC('nor_gl'));
const nor = Buffer.alloc(N * N * 3);
for (let i = 0; i < N * N; i++) {
  let x = (nr[i * 3] / 255) * 2 - 1, y = (nr[i * 3 + 1] / 255) * 2 - 1;
  x *= nStrength; y *= nStrength;
  const z = Math.sqrt(Math.max(0, 1 - x * x - y * y));
  nor[i * 3] = Math.round((x * 0.5 + 0.5) * 255); nor[i * 3 + 1] = Math.round((y * 0.5 + 0.5) * 255); nor[i * 3 + 2] = Math.round((z * 0.5 + 0.5) * 255);
}
await sharp(nor, { raw: { width: N, height: N, channels: 3 } }).webp({ quality: 86, effort: 6 }).toFile(OUT('nor'));

// ARM: R = Verdeckung (Richtung 1 gedämpft), G = Rauheit gleichmäßig um 0,55 (Rauten etwas glatter), B = Metall 1
const am = await raw(SRC('arm'));
const rl = new Uint8Array(N * N); for (let i = 0; i < N * N; i++) rl[i] = am[i * 3 + 1];
const rlow = await blurL(rl, 24);
const arm = Buffer.alloc(N * N * 3);
for (let i = 0; i < N * N; i++) {
  arm[i * 3] = Math.round(255 - (255 - am[i * 3]) * 0.6);
  arm[i * 3 + 1] = Math.max(60, Math.min(220, Math.round(140 + (rl[i] - rlow[i]) * 0.6)));
  arm[i * 3 + 2] = 255;
}
await sharp(arm, { raw: { width: N, height: N, channels: 3 } }).webp({ quality: 80, effort: 6 }).toFile(OUT('arm'));
for (const k of ['diff', 'nor', 'arm']) console.log(`metal_${k}.webp`, (await import('fs')).statSync(OUT(k)).size);
