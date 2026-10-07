// Fahrbahn-Mikrodetail (n30, tools/build_detail_nor.mjs): Detail-Normalmap kachelt nahtlos, ist im Mittel flach (kein
// Schiefstand der Fahrbahn), hat genug Struktur, und die ausgelieferte Datei ist klein.
import fs from 'node:fs';
import { hoehenfeld, normalen } from '../../tools/build_detail_nor.mjs';

let bad = 0;
const ok = (c, m) => { console.log((c ? 'OK   ' : 'FAIL ') + m); if (!c) bad++; };
const N = 256, h = hoehenfeld(N), px = normalen(h, N);
// Naht: Sprung über den Rand nicht größer als typische Sprünge innen
let innen = 0, rand = 0;
for (let y = 0; y < N; y++) { innen += Math.abs(h[y * N + 100] - h[y * N + 101]); rand += Math.abs(h[y * N + N - 1] - h[y * N]); }
ok(rand < innen * 1.6, `kachelt waagrecht (Randsprung ${(rand / N).toFixed(3)} vs. innen ${(innen / N).toFixed(3)})`);
innen = 0; rand = 0;
for (let x = 0; x < N; x++) { innen += Math.abs(h[100 * N + x] - h[101 * N + x]); rand += Math.abs(h[(N - 1) * N + x] - h[x]); }
ok(rand < innen * 1.6, `kachelt senkrecht (Randsprung ${(rand / N).toFixed(3)} vs. innen ${(innen / N).toFixed(3)})`);
let sx = 0, sy = 0, var_ = 0;
for (let i = 0; i < N * N; i++) { const nx = px[i * 3] / 127.5 - 1, ny = px[i * 3 + 1] / 127.5 - 1; sx += nx; sy += ny; var_ += nx * nx + ny * ny; }
ok(Math.abs(sx / (N * N)) < 0.02 && Math.abs(sy / (N * N)) < 0.02, `im Mittel flach (${(sx / N / N).toFixed(3)}, ${(sy / N / N).toFixed(3)})`);
const rms = Math.sqrt(var_ / (N * N));
ok(rms > 0.15 && rms < 0.7, `Struktur vorhanden, nicht übertrieben (Neigung RMS ${rms.toFixed(2)})`);
const f = new URL('../../assets/tex/asphalt_detail_nor.webp', import.meta.url).pathname;
ok(fs.existsSync(f) && fs.statSync(f).size < 80e3, `assets/tex/asphalt_detail_nor.webp vorhanden, ${(fs.statSync(f).size / 1e3).toFixed(0)} KB (< 80 KB)`);
console.log(bad ? `${bad} FEHLER` : 'alle Detail-Prüfungen OK');
process.exit(bad ? 1 : 0);
