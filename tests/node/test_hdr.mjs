// HDR-Diät (n30, tools/hdr_diaet.mjs): RGBE lesen/schreiben (RLE) verlustarm, Sonne kappen idempotent, Verkleinern
// energieerhaltend, und die ausgelieferten 512×256-Dateien weichen im Umgebungslicht < 1 % von den 1k-Originalen ab.
import fs from 'node:fs';
import path from 'node:path';
import { readHdr, writeHdr, kappeSonne, halbiere, kennwerte, verkleinere, LUM } from '../../tools/hdr_diaet.mjs';

let bad = 0;
const ok = (c, m) => { console.log((c ? 'OK   ' : 'FAIL ') + m); if (!c) bad++; };
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');

// künstliches Bild: Verlauf + helle „Sonne“
const w = 64, h = 32, data = new Float32Array(w * h * 3);
for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = (y * w + x) * 3; data[i] = 0.2 + x / w; data[i + 1] = 0.3 + y / h * 0.5; data[i + 2] = 0.8 - y / h * 0.6; }
data[(5 * w + 10) * 3] = data[(5 * w + 10) * 3 + 1] = data[(5 * w + 10) * 3 + 2] = 5000;
const img = { w, h, data };
const back = readHdr(writeHdr(img));
let maxRel = 0;
// RGBE teilt den Exponenten: Fehler je Kanal bezogen auf den hellsten Kanal des Pixels (≤ 1/256 Stufe)
for (let i = 0; i < data.length; i++) { const p = i - (i % 3), mx = Math.max(data[p], data[p + 1], data[p + 2]); maxRel = Math.max(maxRel, Math.abs(back.data[i] - data[i]) / mx); }
ok(back.w === w && back.h === h && maxRel < 0.005, `RGBE-Rundreise ${w}×${h}: max. Abweichung ${(maxRel * 100).toFixed(2)} % (RGBE-Genauigkeit)`);
const c1 = { w, h, data: data.slice() }; const n1 = kappeSonne(c1); const c2 = { w, h, data: c1.data.slice() }; const n2 = kappeSonne(c2);
ok(n1 === 1 && n2 === 0, `Sonne kappen: 1 Pixel beim ersten Mal, 0 beim zweiten (idempotent)`);
ok(Math.abs(LUM(c1.data[(5 * w + 10) * 3], c1.data[(5 * w + 10) * 3 + 1], c1.data[(5 * w + 10) * 3 + 2]) - 4) < 1e-4, 'gekappte Sonne hat Leuchtdichte 4');
const half = halbiere(c1);
const sum = (d) => d.reduce((a, v) => a + v, 0);
ok(half.w === 32 && Math.abs(sum(half.data) * 4 - sum(c1.data)) / sum(c1.data) < 1e-6, '2×2-Mittel erhält die Energie');
const v = verkleinere({ w, h, data: data.slice() }, 16);
ok(v.w === 16 && v.h === 8, 'verkleinere bis zur Zielbreite');

// ausgelieferte Dateien
const pairs = [['assets/hdr/sky_1k.hdr', 'assets/hdr/sky_512.hdr']];
for (const t of fs.readdirSync(path.join(ROOT, 'assets/themes'))) if (fs.existsSync(path.join(ROOT, 'assets/themes', t, 'env.hdr'))) pairs.push([`assets/themes/${t}/env.hdr`, `assets/themes/${t}/env_512.hdr`]);
let vor = 0, nach = 0;
for (const [a, b] of pairs) {
  const A = readHdr(fs.readFileSync(path.join(ROOT, a))); kappeSonne(A);
  const fb = path.join(ROOT, b);
  if (!fs.existsSync(fb)) { ok(false, `${b} fehlt (node tools/hdr_diaet.mjs)`); continue; }
  const B = readHdr(fs.readFileSync(fb));
  const ka = kennwerte(A), kb = kennwerte(B);
  const dev = Math.max(...Object.keys(ka).flatMap((k) => ka[k].map((x, i) => Math.abs(kb[k][i] - x) / Math.max(1e-3, x))));
  let maxL = 0; for (let i = 0; i < B.data.length; i += 3) maxL = Math.max(maxL, LUM(B.data[i], B.data[i + 1], B.data[i + 2]));
  ok(B.w === 512 && B.h === 256 && dev < 0.01 && maxL <= 4.05, `${b}: 512×256, Umgebungslicht-Abweichung ${(dev * 100).toFixed(2)} %, Sonne gekappt (max ${maxL.toFixed(2)})`);
  vor += fs.statSync(path.join(ROOT, a)).size; nach += fs.statSync(fb).size;
}
ok(vor - nach > 5e6, `Ladegröße HDR ${(vor / 1e6).toFixed(2)} → ${(nach / 1e6).toFixed(2)} MB (Ziel −5 MB)`);
console.log(bad ? `${bad} FEHLER` : 'alle HDR-Prüfungen OK');
process.exit(bad ? 1 : 0);
