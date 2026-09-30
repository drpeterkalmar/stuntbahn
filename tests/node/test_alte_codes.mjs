// n19: Alte Codes bleiben gültig – generate(seed, diff) ohne 3D-Option liefert exakt dieselben Strecken wie vor n19.
// Vergleich des Layout-Hashes (Typ, Feld, Richtung, Spiegelung, Ebene je Stück + Schlüssel + Name) von 83 Seeds × 3
// Stufen gegen tests/node/data/layout_hashes_flach.json (aufgenommen am 30.09.2026 vor der ersten Änderung).
// Mit --verify zusätzlich die vom Autopiloten geprüfte (ggf. entschärfte) Fassung.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { generate } from '../../src/track/generator.js';
import { verifySync } from '../../src/track/verify.js';
import { layoutHash, HASH_SEEDS } from './layout_hash.mjs';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ref = JSON.parse(fs.readFileSync(path.join(HERE, 'data/layout_hashes_flach.json'), 'utf8'));
const ver = process.argv.includes('--verify');
let bad = 0, n = 0, vbad = 0;
for (const s of HASH_SEEDS) for (const d of [1, 2, 3]) {
  const k = `${s}-${d}`, lay = generate(s, d);
  n++;
  if (layoutHash(lay) !== ref[k].gen) { bad++; console.log('ANDERS', k, lay.meta.name); }
  if (ver) { const v = verifySync(lay); if (layoutHash(v.layout) !== ref[k].verified) { vbad++; console.log('geprüft anders', k); } }
  // ohne 3D-Option: kein 3D-Teil, Schlüssel ohne Zusatz
  if (lay.pieces.some((p) => p.h1 != null) || lay.meta.key !== `${s}-${d}`) { bad++; console.log('3D-Spur in flacher Strecke', k); }
}
console.log(`Alte Codes: ${n - bad}/${n} identisch${ver ? `, geprüft ${n - vbad}/${n}` : ''}`);
process.exit(bad || vbad ? 1 : 0);
