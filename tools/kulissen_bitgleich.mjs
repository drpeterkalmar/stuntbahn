// Kulissen (n20): Nachweis „die Fahrbahn ändert sich nicht“ – baut dieselben Strecken (flach, 3D, Gelände, Demo, Galerie) mit
// dem Stand vor n20 (Wurzel als Argument, z. B. eine git-archive-Kopie) und dem jetzigen Stand und vergleicht Linie, Geometrie,
// Kollision, Gelände, Bäume und Sprünge Byte für Byte. Aufruf: node tools/kulissen_bitgleich.mjs [Wurzel vorher]
import crypto from 'crypto';
const roots = [process.argv[2] || "tests/out/n20/head", "."].map((r) => new URL("file://" + (r.startsWith("/") ? r : process.cwd() + "/" + r)).pathname.replace(/\/$/, ""));
const res = [];
for (const r of roots) {
  const { generate, demoLayout, galleryLayout } = await import(r + '/src/track/generator.js');
  const { buildTrack } = await import(r + '/src/track/build.js');
  const out = {};
  const th = (t) => { const H = crypto.createHash('sha1'), L = t.line; for (const k of ['px','py','pz','tx','ty','tz','bx','by','bz','lo','hi','air','wave']) H.update(Buffer.from(L[k].buffer)); for (const b of t.batches) { H.update(b.mat+'|'+b.chunk); H.update(Buffer.from(b.pos.buffer)); H.update(Buffer.from(b.idx.buffer)); } H.update(Buffer.from(t.col.pos.buffer)); H.update(Buffer.from(t.terrain.H.buffer)); H.update(JSON.stringify(t.trees)); H.update(JSON.stringify(t.jumps.map((j)=>[j.lipIdx,j.landIdx,j.endIdx]))); return H.digest('hex').slice(0,16); };
  for (const s of [4711, 20260929, 1038, 25, 17]) for (const d of [1, 2, 3]) for (const o of [{}, { d3: true }, { gel: true }]) { const l = generate(s, d, o); out[l.meta.key] = th(buildTrack(l)); }
  out.demo = th(buildTrack(demoLayout())); out.galerie = th(buildTrack(galleryLayout()));
  res.push(out);
}
const keys = Object.keys(res[0]); let same = 0;
for (const k of keys) if (res[0][k] === res[1][k]) same++; else console.log('ANDERS', k);
console.log(`vorher/nachher: ${same}/${keys.length} Strecken bitgleich (Linie, Geometrie, Kollision, Gelände, Bäume, Sprünge)`);
