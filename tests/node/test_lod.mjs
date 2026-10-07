// Heldenauto-LOD (n30): Umschalt-Rechnung (src/gfx/carlod.js) und die gebauten Stufen assets/car/goblin_mid.glb /
// goblin_far.glb (tools/build_assets.mjs --car-mid): Dreiecke im Ziel, gleiche Knoten- und Materialnamen wie das
// Heldenauto (carmesh.js ordnet darüber Räder und Materialien zu), UVs vorhanden (Lack-Maske), keine Texturen.
import { lodFor, LOD_DIST } from '../../src/gfx/carlod.js';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';

let bad = 0;
const ok = (c, m) => { console.log((c ? 'OK   ' : 'FAIL ') + m); if (!c) bad++; };

ok(lodFor(5, 62) === 0 && lodFor(20, 62) === 0, 'nah (5/20 m): volles Modell');
ok(lodFor(30, 62) === 1, 'ab ~25 m (30 m): Mittel');
ok(lodFor(80, 62) === 2, 'weit (80 m): Fern');
ok(lodFor(26, 62, 0) === 0 && lodFor(26, 62, 1) === 1, 'Hysterese an der 25-m-Grenze: bleibt, was es war');
ok(lodFor(23, 62, 1) === 1 && lodFor(22, 62, 1) === 0, 'zurück auf voll erst unter ~22,5 m');
ok(lodFor(80, 20) === 0, `Tele (20° Bildwinkel) aus 80 m: volles Modell (wirkt nah)`);
ok(lodFor(40, 90) === 2 || lodFor(40, 90) === 1, 'Weitwinkel rückt die Grenzen näher');
// Flackern: eine Fahrt, die genau um die Grenze pendelt, wechselt nur einmal
{
  let cur = 0, wechsel = 0;
  for (let i = 0; i < 400; i++) { const d = LOD_DIST[0] + Math.sin(i * 0.3) * 1.5; const l = lodFor(d, 62, cur); if (l !== cur) wechsel++; cur = l; }
  ok(wechsel <= 1, `Abstand pendelt ±1,5 m um 25 m: ${wechsel} Wechsel`);
}

await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
const info = async (f) => {
  const d = await io.read(new URL(`../../assets/car/${f}.glb`, import.meta.url).pathname);
  const R = d.getRoot();
  let tris = 0, uvFehlt = 0;
  for (const m of R.listMeshes()) for (const p of m.listPrimitives()) {
    tris += (p.getIndices()?.getCount() || 0) / 3;
    if (/car_body|clearcoat/.test(p.getMaterial()?.getName() || '') && !p.getAttribute('TEXCOORD_0')) uvFehlt++;
  }
  return { tris, nodes: new Set(R.listNodes().filter((n) => n.getMesh()).map((n) => n.getName())), mats: new Set(R.listMaterials().map((m) => m.getName())), tex: R.listTextures().length, uvFehlt };
};
const H = await info('goblin'), Mi = await info('goblin_mid'), Fa = await info('goblin_far');
ok(Mi.tris > 11000 && Mi.tris < 19000, `Mittel-Stufe ${Mi.tris} Dreiecke (~15 k; Held ${H.tris})`);
ok(Fa.tris > 4500 && Fa.tris < 9000, `Fern-Stufe ${Fa.tris} Dreiecke (~6,5 k)`);
for (const [n, X] of [['Mittel', Mi], ['Fern', Fa]]) {
  const fehlt = [...H.nodes].filter((k) => /car_(wheel|brake)_/.test(k) && !X.nodes.has(k));
  ok(!fehlt.length, `${n}: alle Rad-/Bremsknoten des Helden vorhanden${fehlt.length ? ' – fehlt: ' + fehlt.join(',') : ''}`);
  ok([...X.mats].every((m) => H.mats.has(m)), `${n}: nur Materialnamen des Helden (${[...X.mats].join(', ')})`);
  ok(X.tex === 0, `${n}: keine eigenen Texturen (${X.tex})`);
  ok(X.uvFehlt === 0, `${n}: Karosserie hat UVs (Lack-Maske)`);
}
console.log(bad ? `${bad} FEHLER` : 'alle LOD-Prüfungen OK');
process.exit(bad ? 1 : 0);
