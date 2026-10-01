// Geometrie-Hash gebauter Strecken (n22): Fahrlinie, Batches, Kollision, Gelände, Bäume – für den Nachweis „alte Codes
// (flach und -3d), Demo, Galerie und Importe bauen bitgleich wie vorher“. Aufruf: node tests/node/build_hash.mjs [--write]
import crypto from 'crypto';
import fs from 'fs';
import { generate, demoLayout, galleryLayout } from '../../src/track/generator.js';
import { buildTrack } from '../../src/track/build.js';

const h = crypto.createHash.bind(crypto);
function trackHash(t) {
  const H = h('sha1');
  const L = t.line;
  for (const k of ['px', 'py', 'pz', 'tx', 'ty', 'tz', 'bx', 'by', 'bz', 'lo', 'hi', 'air', 'wave']) H.update(Buffer.from(L[k].buffer));
  for (const b of t.batches) { H.update(b.mat + '|' + b.chunk); H.update(Buffer.from(b.pos.buffer)); H.update(Buffer.from(b.idx.buffer)); }
  H.update(Buffer.from(t.col.pos.buffer));
  H.update(Buffer.from(t.terrain.H.buffer));
  H.update(JSON.stringify(t.trees.slice(0, 50)));
  H.update(JSON.stringify(t.jumps.map((j) => [j.lipIdx, j.landIdx, j.endIdx])));
  return H.digest('hex').slice(0, 16);
}
const cases = [];
for (const s of [4711, 20260929, 1038, 8920, 17, 1030]) for (const d of [1, 2, 3]) {
  cases.push([`${s}-${d}`, () => generate(s, d)]);
  cases.push([`${s}-${d}-3d`, () => generate(s, d, { d3: true })]);
}
cases.push(['demo', demoLayout], ['galerie', galleryLayout]);
const out = {};
for (const [k, f] of cases) out[k] = trackHash(buildTrack(f()));
const file = new URL('./data/build_hash_n22.json', import.meta.url);
if (process.argv.includes('--write')) { fs.writeFileSync(file, JSON.stringify(out, null, 1)); console.log('geschrieben', Object.keys(out).length); }
else {
  const ref = JSON.parse(fs.readFileSync(file, 'utf8'));
  let bad = 0;
  for (const k of Object.keys(ref)) if (ref[k] !== out[k]) { bad++; console.log('ANDERS', k); }
  console.log(bad ? `${bad} von ${Object.keys(ref).length} anders` : `alle ${Object.keys(ref).length} Strecken bitgleich`);
  process.exit(bad ? 1 : 0);
}
