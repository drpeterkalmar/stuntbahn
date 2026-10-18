// QR-Kodierer (src/ui/qr.js): Reed-Solomon gegen das bekannte Beispiel „HELLO WORLD“ 1-M (thonky.com), Format-Bits,
// Struktur (Finder, Takt), und – wenn zbarimg da ist – Rücklesen echter Raum-Links aus einem PNG (tests/qr_png.py).
import { rsPruef, formatBits, qrMatrix, qrSvg } from '../../src/ui/qr.js';
import { spawnSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

let bad = 0;
const ok = (c, m) => { console.log((c ? 'OK   ' : 'FAIL ') + m); if (!c) bad++; };

const daten = [32, 91, 11, 120, 209, 114, 220, 77, 67, 64, 236, 17, 236, 17, 236, 17];
ok(rsPruef(daten, 10).join(' ') === '196 35 39 119 235 215 231 226 93 23', 'Reed-Solomon: „HELLO WORLD“ 1-M → 196 35 39 119 235 215 231 226 93 23');
ok(formatBits('M', 0).toString(2).padStart(15, '0') === '101010000010010' && formatBits('L', 0).toString(2).padStart(15, '0') === '111011111000100', 'Format-Bits M/0 und L/0 wie in der Norm-Tabelle');
const Q = qrMatrix('https://drpeterkalmar.github.io/stuntbahn/?raum=QRST');
const at = (r, c) => Q.m[r * Q.n + c];
const finder = (r0, c0) => [0, 6].every((k) => at(r0 + k, c0 + 3) && at(r0 + 3, c0 + k)) && at(r0 + 3, c0 + 3) && !at(r0 + 1, c0 + 3) && !at(r0 + 3, c0 + 1);
ok(Q.version === 4 && Q.n === 33 && finder(0, 0) && finder(0, Q.n - 7) && finder(Q.n - 7, 0), `Raum-Link → Version ${Q.version} (${Q.n}×${Q.n}), Maske ${Q.maske}, drei Finder`);
let takt = true; for (let i = 8; i < Q.n - 8; i++) if (at(6, i) !== (i % 2 === 0 ? 1 : 0) || at(i, 6) !== (i % 2 === 0 ? 1 : 0)) takt = false;
ok(takt && at(4 * Q.version + 9, 8) === 1, 'Taktlinien und dunkles Modul');
const svg = qrSvg('ABCD');
ok(svg.startsWith('<svg') && svg.includes('viewBox="0 0 29 29"') && svg.length < 8000, `SVG ${svg.length} Zeichen (Version 1, Ruhezone 4)`);

// Rücklesen mit zbarimg (PNG über Python/PIL – ohne Browser)
const zbar = spawnSync('zbarimg', ['--version'], { encoding: 'utf8' });
if (zbar.status === 0) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qr-'));
  const texte = ['https://drpeterkalmar.github.io/stuntbahn/?raum=QRST', 'https://drpeterkalmar.github.io/stuntbahn/?gegner=3&raum=AB2CD', 'WXYZ', 'x'.repeat(100)];
  let gut = 0, versucht = 0;
  for (const [k, t] of texte.entries()) {
    for (const st of ['L', 'M', 'Q', 'H']) {
      let M; try { M = qrMatrix(t, st); } catch { continue; }
      versucht++;
      const f = path.join(dir, `q${k}${st}.json`);
      fs.writeFileSync(f, JSON.stringify({ n: M.n, m: Array.from(M.m) }));
      const r = spawnSync('python3', [path.join(path.dirname(new URL(import.meta.url).pathname), '../qr_png.py'), f, f + '.png'], { encoding: 'utf8' });
      const z = spawnSync('zbarimg', ['-q', '--raw', f + '.png'], { encoding: 'utf8' });
      if (r.status === 0 && z.stdout.trim() === t) gut++; else console.log('      nicht gelesen:', st, t.slice(0, 40), z.stdout.trim().slice(0, 60), r.stderr.slice(0, 200));
    }
  }
  ok(gut === versucht && versucht >= 12, `zbarimg liest ${gut} von ${versucht} Codes (Stufen L/M/Q/H, Version 1–6) richtig zurück`);
  fs.rmSync(dir, { recursive: true, force: true });
} else console.log('      (zbarimg fehlt – Rücklese-Test übersprungen)');

console.log(bad ? `${bad} FEHLER` : 'alle QR-Tests OK');
process.exit(bad ? 1 : 0);
