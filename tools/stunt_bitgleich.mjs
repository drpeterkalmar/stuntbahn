// n26 Stunt-Maßstab: baut ?stunt=1 (STUNT_STUNT=1) Byte für Byte wie vorher? Geometrie-Hash (Fahrlinie, Batches, Kollision,
// Gelände, Bäume, Sprünge) + Tempo-Profil je Strecke; Strecken: flach/3D/Gelände je Stufe, Demo, Galerie, Sammlung.
// Aufruf: node tools/stunt_bitgleich.mjs --out=a.json [--root=Wurzel]   dann   node tools/stunt_bitgleich.mjs --cmp=a.json,b.json
import crypto from 'crypto'; import fs from 'fs'; import path from 'path'; import url from 'url';
const arg = (k, d) => { const a = process.argv.find((s) => s.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
if (arg('cmp')) {
  const [a, b] = arg('cmp').split(',').map((f) => JSON.parse(fs.readFileSync(f, 'utf8')));
  let bad = 0; for (const k of Object.keys(a)) if (a[k] !== b[k]) { bad++; if (bad < 20) console.log('ANDERS', k); }
  console.log(bad ? `${bad} von ${Object.keys(a).length} anders` : `alle ${Object.keys(a).length} Strecken bitgleich`);
  process.exit(bad ? 1 : 0);
}
const ROOT = path.resolve(arg('root', path.join(path.dirname(url.fileURLToPath(import.meta.url)), '..')));
const imp = (p) => import(url.pathToFileURL(path.join(ROOT, p)).href);
const { generate, demoLayout, galleryLayout } = await imp('src/track/generator.js');
const { buildTrack } = await imp('src/track/build.js');
const { computeIdeal } = await imp('src/ai/ideal.js');
const { computeProfile } = await imp('src/ai/profile.js');
const { parseTrk } = await imp('src/track/trk.js');
const { trkToLayout } = await imp('src/track/trkimport.js');
const { tracksOf } = await imp('src/game/sammlung.js');
function trackHash(t, prof) {
  const H = crypto.createHash('sha1'), L = t.line;
  for (const k of ['px', 'py', 'pz', 'tx', 'ty', 'tz', 'bx', 'by', 'bz', 'lo', 'hi', 'air', 'wave', 'loop', 'tube']) H.update(Buffer.from(L[k].buffer));
  for (const b of t.batches) { H.update(b.mat + '|' + b.chunk); H.update(Buffer.from(b.pos.buffer)); H.update(Buffer.from(b.idx.buffer)); }
  H.update(Buffer.from(t.col.pos.buffer));
  H.update(Buffer.from(t.terrain.H.buffer));
  H.update(JSON.stringify(t.trees.slice(0, 80)));
  H.update(JSON.stringify(t.jumps.map((j) => [j.lipIdx, j.landIdx, j.endIdx, j.lipY])));
  if (prof) { H.update(Buffer.from(prof.vt.buffer)); H.update(Buffer.from(prof.vmin.buffer)); }
  return H.digest('hex').slice(0, 16);
}
const cases = [];
for (const s of [4711, 20260929, 1038, 8920, 17, 1030, 42, 777]) for (const d of [1, 2, 3]) {
  cases.push([`${s}-${d}`, () => generate(s, d)]);
  cases.push([`${s}-${d}-3d`, () => generate(s, d, { d3: true })]);
  cases.push([`${s}-${d}-g`, () => generate(s, d, { gel: true })]);
}
cases.push(['demo', demoLayout], ['galerie', galleryLayout]);
const jf = path.join(ROOT, 'assets/sammlung.json'), bf = path.join(ROOT, 'assets/sammlung.bin');
const T = tracksOf(JSON.parse(fs.readFileSync(jf, 'utf8'))), bin = new Uint8Array(fs.readFileSync(bf));
for (let k = 0; k < T.length; k += 10) cases.push([T[k].id, () => trkToLayout(parseTrk(bin.subarray(k * 1802, (k + 1) * 1802), T[k].id)).layout]);
const out = {};
for (const [k, f] of cases) {
  const t = buildTrack(f());
  const id = computeIdeal(t.line, { track: t });
  out[k] = trackHash(t, computeProfile(id, { jumps: t.jumps, startIdx: t.start.idx }));
}
fs.writeFileSync(arg('out', 'stunt_hash.json'), JSON.stringify(out, null, 1));
console.log('geschrieben', Object.keys(out).length, arg('out'));
