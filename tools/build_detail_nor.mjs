// n30: Detail-Normalmap „Asphaltkorn“ (selbst erzeugt, kein Fremd-Asset → keine Lizenzfrage): kachelbares Höhenfeld aus
// dicht gepacktem Splitt (Worley-Zellen, über den Rand gewickelt) + feinem periodischem Rauschen, daraus Normalen.
// 256² für eine Kachel von ~0,55 m (≈ 2 mm je Pixel, Körner 4–14 mm). Fahrbahn-Shader: materials.js patchRoad (sbDetail*).
// Aufruf: node tools/build_detail_nor.mjs  → assets/tex/asphalt_detail_nor.webp
import path from 'node:path';
import sharp from 'sharp';

export function mulberry32(a) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// periodisches Wertrauschen (Gitter n × n, wickelt bei N)
function periodicNoise(N, n, rnd) {
  const g = new Float32Array(n * n).map(() => rnd());
  const out = new Float32Array(N * N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const fx = (x / N) * n, fy = (y / N) * n, x0 = Math.floor(fx), y0 = Math.floor(fy);
    let tx = fx - x0, ty = fy - y0; tx = tx * tx * (3 - 2 * tx); ty = ty * ty * (3 - 2 * ty);
    const v = (i, j) => g[((j % n) + n) % n * n + (((i % n) + n) % n)];
    out[y * N + x] = (v(x0, y0) * (1 - tx) + v(x0 + 1, y0) * tx) * (1 - ty) + (v(x0, y0 + 1) * (1 - tx) + v(x0 + 1, y0 + 1) * tx) * ty;
  }
  return out;
}
export function hoehenfeld(N = 256, seed = 30) {
  const rnd = mulberry32(seed), h = new Float32Array(N * N);
  // Splitt dicht gepackt: Worley-Zellen (über den Rand gewickelt) = kantige Körner; Höhe je Korn zufällig, zur Kante hin
  // abfallend (F2 − F1 = Abstand zur Zellgrenze), dazwischen schmale Fugen mit Bindemittel
  const G = 32, cell = N / G, pts = [];   // Raster-Eimer für die Suche
  for (let gy = 0; gy < G; gy++) for (let gx = 0; gx < G; gx++) {
    const k = rnd() < 0.55 ? 2 : 1;   // 1–2 Körner je Eimer (~8 px ≈ 16 mm)
    for (let i = 0; i < k; i++) pts.push({ x: (gx + rnd()) * cell, y: (gy + rnd()) * cell, top: 0.45 + 0.55 * rnd(), gx, gy, tilt: [rnd() - 0.5, rnd() - 0.5] });
  }
  const buckets = Array.from({ length: G * G }, () => []);
  for (const p of pts) buckets[p.gy * G + p.gx].push(p);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    let f1 = 1e9, f2 = 1e9, best = null;
    const bx = Math.floor(x / cell), by = Math.floor(y / cell);
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      const gx = (bx + dx + G) % G, gy = (by + dy + G) % G;
      for (const p of buckets[gy * G + gx]) {
        // gewickelte Entfernung
        let ex = Math.abs(p.x - x), ey = Math.abs(p.y - y); ex = Math.min(ex, N - ex); ey = Math.min(ey, N - ey);
        const d = Math.hypot(ex, ey);
        if (d < f1) { f2 = f1; f1 = d; best = p; } else if (d < f2) f2 = d;
      }
    }
    const kante = (f2 - f1) / 2;                    // px bis zur Grenze zum Nachbarkorn
    const rund = Math.min(1, kante / 2.2);          // Kornrand gerundet (~2 px)
    let ex = x - best.x, ey = y - best.y; if (ex > N / 2) ex -= N; if (ex < -N / 2) ex += N; if (ey > N / 2) ey -= N; if (ey < -N / 2) ey += N;
    const schief = (best.tilt[0] * ex + best.tilt[1] * ey) * 0.03;   // Körner liegen leicht schräg
    h[y * N + x] = best.top * Math.sqrt(rund) + schief * rund;
  }
  // Bindemittel/Feinstruktur: feines periodisches Rauschen obendrauf
  const f1 = periodicNoise(N, 64, rnd), f2n = periodicNoise(N, 16, rnd);
  for (let i = 0; i < N * N; i++) h[i] += 0.08 * f1[i] + 0.05 * f2n[i];
  return h;
}
export function normalen(h, N, staerke = 1.6) {
  const px = new Uint8Array(N * N * 3);
  const at = (x, y) => h[((y + N) % N) * N + ((x + N) % N)];
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const dx = (at(x + 1, y) - at(x - 1, y)) * staerke, dy = (at(x, y + 1) - at(x, y - 1)) * staerke;
    let nx = -dx, ny = -dy, nz = 1; const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
    const i = (y * N + x) * 3;
    px[i] = Math.round((nx * 0.5 + 0.5) * 255); px[i + 1] = Math.round((ny * 0.5 + 0.5) * 255); px[i + 2] = Math.round((nz * 0.5 + 0.5) * 255);
  }
  return px;
}

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
if (process.argv[1] && path.resolve(process.argv[1]) === new URL(import.meta.url).pathname) {
  const N = 256;
  const px = normalen(hoehenfeld(N), N);
  const out = path.join(ROOT, 'assets/tex/asphalt_detail_nor.webp');
  const info = await sharp(Buffer.from(px), { raw: { width: N, height: N, channels: 3 } }).webp({ quality: 90, effort: 6 }).toFile(out);
  console.log('Detail-Normalmap', N + '²', (info.size / 1e3).toFixed(0), 'KB →', path.relative(ROOT, out));
}
