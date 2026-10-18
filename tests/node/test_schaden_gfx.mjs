// Schaden-Darstellung (n34-Nachtrag, gfx/schadenvis.js) ohne Browser: Goblin-Karosserie (tools/schaden_teile.mjs, echte
// Geometrie in Auto-Koordinaten) als Attrappe eines makeCar-Autos. Zerlegen in Rumpf + Teile (keine Dreiecke verloren),
// Teil ab → Teile-Index kleiner, Dellen nur im Umkreis (Lage = Rumpf-Lage + verschiebung), Rückspulen stellt die Lage wieder
// her, Trümmer fliegen und verschwinden, Zeitbedarf eines Treffers.
import './three_haken.mjs';
const THREE = await import('three');
const { schadenVorbereiten, schadenZeigen, TruemmerVis, DELLEN_BUDGET } = await import('../../src/gfx/schadenvis.js');
const { neuerSchaden, treffer, verschiebung, TEILE, kopie } = await import('../../src/physics/schaden.js');
const { ladeGoblin } = await import('../../tools/schaden_teile.mjs');
const { Car } = await import('../../src/physics/car.js');

let bad = 0;
const ok = (c, m) => { console.log((c ? 'OK   ' : 'FAIL ') + m); if (!c) bad++; };

const G = await ladeGoblin();
const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
const lod0 = [];
for (const m of G.meshes.filter((x) => !/wheel|brake/.test(x.name))) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(Float32Array.from(m.C.flat()), 3));
  g.setIndex(new THREE.BufferAttribute(Uint32Array.from(m.idx), 1));
  g.computeVertexNormals();
  const mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial()); mesh.name = m.mat; mesh.userData.lod = 0;
  body.add(mesh); lod0.push(mesh);
}
const cv = { root, body, lodMeshes: [lod0, [], []] };
const dreiecke0 = lod0.reduce((a, m) => a + m.geometry.index.count / 3, 0);
const V = schadenVorbereiten(cv);
const tri = (list) => list.reduce((a, m) => a + m.geometry.index.count / 3, 0);
ok(V.teile.length === 3 && cv.lodMeshes[0].length === 6 && tri(cv.lodMeshes[0]) === dreiecke0, `zerlegt: 3 Karosserie-Meshes → je Rumpf + Teile, ${dreiecke0} Dreiecke vollständig`);
ok(schadenVorbereiten(cv) === V && cv.lodMeshes[0].length === 6, 'zweites Vorbereiten ändert nichts');

const S = neuerSchaden();
let ver = 0;
schadenZeigen(cv, S, ver++);
const teileVorher = tri(V.teile.map((E) => E.T));
// Treffer am linken Spiegel: Spiegel ab
treffer(S, [-0.95, 0.3, -0.75], [-1, 0, 0], 12, 1);
const t0 = performance.now();
const neu = schadenZeigen(cv, S, ver++, true, Infinity);
const ms = performance.now() - t0;
const spiegel = V.teile.reduce((a, E) => a + E.jeTeil[0].length / 3, 0);
ok(neu.length === 1 && neu[0] === 0 && teileVorher - tri(V.teile.map((E) => E.T)) === spiegel, `Spiegel links ab: ${spiegel} Dreiecke aus dem Teile-Index`);
ok(ms < 40, `Treffer darstellen (Dellen im Umkreis + Teile): ${ms.toFixed(1)} ms (Desktop)`);
// Dellen: Punkt nahe der Delle verschoben wie verschiebung(), ferner Punkt unverändert
{
  let maxErr = 0, fernBewegt = 0, nahBewegt = 0;
  const o = [0, 0, 0];
  for (const D of V.dellen) for (let i = 0, P = D.pos.array, O = D.orig; i < D.pos.count; i++) {
    const a = i * 3; verschiebung(S, O[a], O[a + 1], O[a + 2], o);
    maxErr = Math.max(maxErr, Math.abs(P[a] - O[a] - o[0]) + Math.abs(P[a + 1] - O[a + 1] - o[1]) + Math.abs(P[a + 2] - O[a + 2] - o[2]));
    const l = Math.hypot(P[a] - O[a], P[a + 1] - O[a + 1], P[a + 2] - O[a + 2]);
    if (l > 1e-6) { if (Math.hypot(O[a] + 0.95, O[a + 1] - 0.3, O[a + 2] + 0.75) > 1.0) fernBewegt++; else nahBewegt++; }
  }
  ok(maxErr < 1e-5 && nahBewegt > 0 && fernBewegt === 0, `Dellen: ${nahBewegt} Punkte nah verschoben (genau wie verschiebung), ferne unverändert`);
}
// Rückspulen: Zustand ohne Treffer → Lage wieder wie vorher, Spiegel wieder dran
{
  const leer = neuerSchaden();
  // in Häppchen (Budget je Bild): erstes Häppchen höchstens Budget Punkte, nach einigen Bildern alles
  const v0 = ver++;
  const tA = performance.now(); schadenZeigen(cv, leer, v0); const msA = performance.now() - tA;
  let bilder = 1; while (V.warte.length && bilder < 100) { schadenZeigen(cv, leer, v0); bilder++; }
  // (schneller Rechner: passt alles ins Budget, ist es nach einem Bild fertig – das ist richtig)
  ok(V.warte.length === 0 && bilder >= 1 && msA < DELLEN_BUDGET + 3, `Dellen in Häppchen: ${bilder} Bilder, erstes ${msA.toFixed(1)} ms (Budget ${DELLEN_BUDGET} ms + Planung)`);
  const D = V.dellen[0];
  let maxD = 0; for (let i = 0; i < D.pos.array.length; i++) maxD = Math.max(maxD, Math.abs(D.pos.array[i] - D.orig[i]));
  ok(maxD < 1e-7 && tri(V.teile.map((E) => E.T)) === teileVorher, 'Rückspulen auf „heil“: Lage wie vorher, Spiegel wieder dran');
}
// Trümmer
{
  const scene = new THREE.Scene(), TV = new TruemmerVis(scene);
  const car = new Car(); car.place([0, 0, 0], [0, 0, -1], [0, 1, 0], 25);
  const T = TV.wirf(cv, 3, car, 7);   // Stoßstange vorn
  ok(T && scene.children.length === 1 && scene.children[0].children.length >= 1, `Trümmer „${TEILE[3].name}“ in der Szene (${scene.children[0].children.length} Meshes)`);
  const ebene = { ray(ox, oy, oz, dx, dy, dz, maxT) { if (dy > -1e-9) return null; const t = -oy / dy; if (t < 0 || t > maxT) return null; return { t, x: ox + dx * t, y: 0, z: oz + dz * t, nx: 0, ny: 1, nz: 0, mat: 0 }; } };
  for (let t = 0; t < 7; t += 1 / 60) TV.schritt(1 / 60, ebene);
  ok(scene.children.length === 0 && TV.liste.length === 0, 'Trümmer nach 6 s weg (Geometrie freigegeben)');
}
void kopie;
console.log(bad ? `Schaden-Darstellung: ${bad} FEHLER` : 'Schaden-Darstellung: alle Prüfungen grün');
process.exit(bad ? 1 : 0);
