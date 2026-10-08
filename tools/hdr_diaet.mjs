// n30 HDR-Diät (Grafik-Kern, Asset-Kette): Umgebungs-HDRs (Radiance RGBE, Equirect) verkleinern, ohne Bibliothek.
//   1. lesen (RLE oder flach), 2. Sonnenscheibe kappen wie zur Laufzeit (env.js: Leuchtdichte > 4 → auf 4), 3. 2×2-Mittel
//   bis zur Zielbreite (Standard 512 → 512×256), 4. als RLE-RGBE schreiben.
// Warum das reicht: der Himmel selbst kommt aus sky.jpg; das HDR liefert nur Umgebungslicht + Spiegelung (PMREM). Das
// Kappen VOR dem Verkleinern ist dasselbe wie bisher zur Laufzeit (Mittel von Werten ≤ 4 bleibt ≤ 4 → idempotent).
// Aufruf: node tools/hdr_diaet.mjs [--breite=512] [--nur=alpen,…]
//   → assets/themes/<thema>/env_512.hdr und assets/hdr/sky_512.hdr (Originale bleiben für ?hdr=1k liegen)
import fs from 'node:fs';
import path from 'node:path';

// ---------- RGBE ----------
export function readHdr(buf) {
  let pos = 0;
  const line = () => { let s = ''; while (pos < buf.length && buf[pos] !== 0x0a) s += String.fromCharCode(buf[pos++]); pos++; return s; };
  const first = line();
  if (!/^#\?(RADIANCE|RGBE)/.test(first)) throw new Error('kein Radiance-HDR');
  let fmt = '';
  for (;;) { const l = line(); if (l === '') break; if (l.startsWith('FORMAT=')) fmt = l.slice(7); if (pos >= buf.length) throw new Error('Kopf ohne Ende'); }
  if (fmt && fmt !== '32-bit_rle_rgbe') throw new Error('Format ' + fmt);
  const m = /^-Y (\d+) \+X (\d+)$/.exec(line());
  if (!m) throw new Error('nur -Y H +X W');
  const h = +m[1], w = +m[2];
  const rgbe = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    const row = y * w * 4;
    if (w >= 8 && w < 32768 && buf[pos] === 2 && buf[pos + 1] === 2 && ((buf[pos + 2] << 8) | buf[pos + 3]) === w) {
      pos += 4;
      for (let c = 0; c < 4; c++) {
        let x = 0;
        while (x < w) {
          let n = buf[pos++];
          if (n > 128) { n -= 128; const v = buf[pos++]; for (let i = 0; i < n; i++) rgbe[row + (x++) * 4 + c] = v; }
          else for (let i = 0; i < n; i++) rgbe[row + (x++) * 4 + c] = buf[pos++];
        }
      }
    } else {
      for (let x = 0; x < w * 4; x++) rgbe[row + x] = buf[pos++];   // flach (alte Dateien ohne RLE)
    }
  }
  const data = new Float32Array(w * h * 3);
  for (let i = 0; i < w * h; i++) {
    const e = rgbe[i * 4 + 3];
    const f = e ? Math.pow(2, e - 136) : 0;   // v/256 · 2^(e−128) (Radiance-Norm; three.js teilt durch 255 – gleich für alt und neu)
    data[i * 3] = rgbe[i * 4] * f; data[i * 3 + 1] = rgbe[i * 4 + 1] * f; data[i * 3 + 2] = rgbe[i * 4 + 2] * f;
  }
  return { w, h, data };
}

function toRgbe(r, g, b, out, o) {
  const v = Math.max(r, g, b);
  if (v < 1e-32) { out[o] = out[o + 1] = out[o + 2] = out[o + 3] = 0; return; }
  let e = Math.ceil(Math.log2(v));
  let f = 256 / Math.pow(2, e);
  if (v * f > 255.5) { e++; f /= 2; }   // Rundung darf 255 nicht überschreiten
  out[o] = Math.min(255, Math.round(r * f)); out[o + 1] = Math.min(255, Math.round(g * f)); out[o + 2] = Math.min(255, Math.round(b * f)); out[o + 3] = e + 128;
}
export function writeHdr({ w, h, data }) {
  const parts = [Buffer.from(`#?RADIANCE\n# n30 HDR-Diaet (Stuntbahn)\nFORMAT=32-bit_rle_rgbe\n\n-Y ${h} +X ${w}\n`, 'latin1')];
  const rgbe = new Uint8Array(w * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) { const i = (y * w + x) * 3; toRgbe(data[i], data[i + 1], data[i + 2], rgbe, x * 4); }
    const out = [2, 2, w >> 8, w & 255];
    for (let c = 0; c < 4; c++) {
      let x = 0;
      while (x < w) {
        // Lauf gleicher Werte?
        let run = 1;
        while (x + run < w && run < 127 && rgbe[(x + run) * 4 + c] === rgbe[x * 4 + c]) run++;
        if (run >= 3) { out.push(128 + run, rgbe[x * 4 + c]); x += run; continue; }
        // sonst Literal bis zum nächsten Lauf (≥ 3) oder 128
        let n = 0;
        while (x + n < w && n < 128) {
          if (x + n + 2 < w && rgbe[(x + n) * 4 + c] === rgbe[(x + n + 1) * 4 + c] && rgbe[(x + n) * 4 + c] === rgbe[(x + n + 2) * 4 + c]) break;
          n++;
        }
        out.push(n); for (let i = 0; i < n; i++) out.push(rgbe[(x + i) * 4 + c]);
        x += n;
      }
    }
    parts.push(Buffer.from(out));
  }
  return Buffer.concat(parts);
}

// ---------- Bearbeitung ----------
export const LUM = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
// Sonnenscheibe kappen (identisch zu env.js makeEnvironment)
export function kappeSonne(img, max = 4) {
  const d = img.data; let n = 0;
  for (let i = 0; i < d.length; i += 3) {
    const l = LUM(d[i], d[i + 1], d[i + 2]);
    if (l > max) { const k = max / l; d[i] *= k; d[i + 1] *= k; d[i + 2] *= k; n++; }
  }
  return n;
}
// 2×2-Mittel (Energie bleibt erhalten); Breite und Höhe müssen gerade sein
export function halbiere({ w, h, data }) {
  const W = w >> 1, H = h >> 1, out = new Float32Array(W * H * 3);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) for (let c = 0; c < 3; c++) {
    const a = ((2 * y) * w + 2 * x) * 3 + c, b = ((2 * y + 1) * w + 2 * x) * 3 + c;
    out[(y * W + x) * 3 + c] = (data[a] + data[a + 3] + data[b] + data[b + 3]) / 4;
  }
  return { w: W, h: H, data: out };
}
// Kennwerte für den Vergleich: mittlere Strahldichte oben/unten (raumwinkelgewichtet) und gerichtete Mittel (± x/z)
// = grobe Näherung des diffusen Umgebungslichts, das der Lack/Boden bekommt
export function kennwerte({ w, h, data }) {
  const acc = { oben: [0, 0, 0, 0], unten: [0, 0, 0, 0], px: [0, 0, 0, 0], nx: [0, 0, 0, 0], pz: [0, 0, 0, 0], nz: [0, 0, 0, 0] };
  for (let y = 0; y < h; y++) {
    const th = ((y + 0.5) / h) * Math.PI, sw = Math.sin(th), cy = Math.cos(th);
    for (let x = 0; x < w; x++) {
      const ph = ((x + 0.5) / w - 0.5) * 2 * Math.PI;
      const dx = sw * Math.cos(ph), dz = sw * Math.sin(ph);
      const i = (y * w + x) * 3, r = data[i], g = data[i + 1], b = data[i + 2];
      const add = (k, wt) => { if (wt <= 0) return; const a = acc[k]; a[0] += r * wt * sw; a[1] += g * wt * sw; a[2] += b * wt * sw; a[3] += wt * sw; };
      add(cy > 0 ? 'oben' : 'unten', 1);
      add('px', dx); add('nx', -dx); add('pz', dz); add('nz', -dz);
    }
  }
  const o = {};
  for (const [k, a] of Object.entries(acc)) o[k] = [a[0] / a[3], a[1] / a[3], a[2] / a[3]];
  return o;
}
export function verkleinere(img, breite = 512) {
  let cur = img;
  kappeSonne(cur);
  while (cur.w > breite && cur.w % 2 === 0 && cur.h % 2 === 0) cur = halbiere(cur);
  return cur;
}

// ---------- Aufruf ----------
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
if (process.argv[1] && path.resolve(process.argv[1]) === new URL(import.meta.url).pathname) {
  const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.split('=')[1] : d; };
  const breite = +arg('breite', 512), nur = arg('nur', null);
  const jobs = [[path.join(ROOT, 'assets/hdr/sky_1k.hdr'), path.join(ROOT, `assets/hdr/sky_${breite}.hdr`), 'land']];
  const T = path.join(ROOT, 'assets/themes');
  for (const t of fs.readdirSync(T)) { const f = path.join(T, t, 'env.hdr'); if (fs.existsSync(f)) jobs.push([f, path.join(T, t, `env_${breite}.hdr`), t]); }
  let vor = 0, nach = 0;
  for (const [src, dst, name] of jobs) {
    if (nur && !nur.split(',').includes(name)) continue;
    const a = readHdr(fs.readFileSync(src));
    const k0 = kennwerte((() => { const c = { ...a, data: a.data.slice() }; kappeSonne(c); return c; })());
    const b = verkleinere(a, breite);
    fs.writeFileSync(dst, writeHdr(b));
    const k1 = kennwerte(readHdr(fs.readFileSync(dst)));
    const dev = Math.max(...Object.keys(k0).flatMap((k) => k0[k].map((v, i) => Math.abs(k1[k][i] - v) / Math.max(1e-3, v))));
    const s0 = fs.statSync(src).size, s1 = fs.statSync(dst).size;
    vor += s0; nach += s1;
    console.log(`${name.padEnd(8)} ${a.w}×${a.h} → ${b.w}×${b.h}  ${(s0 / 1e3).toFixed(0)} KB → ${(s1 / 1e3).toFixed(0)} KB  Licht-Abweichung max ${(dev * 100).toFixed(2)} %`);
  }
  console.log(`zusammen ${(vor / 1e6).toFixed(2)} MB → ${(nach / 1e6).toFixed(2)} MB (−${((vor - nach) / 1e6).toFixed(2)} MB)`);
}
