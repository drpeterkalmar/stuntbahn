// n34 Schadensmodell: Goblin-Modell (assets/car/goblin.glb) in Node in Auto-Koordinaten umrechnen (gleiche Rechnung wie
// gfx/carmesh.js makeCar: Radmitten → Basis, Maßstab Radstand, Achsmitte → Ruhelage) und die Karosserie nach Bereichen
// zerlegen (physics/schaden.js TEILE: Spiegel, Spoiler, Stoßstangen, Motorhaube). Ausgabe: Ausdehnung, Dreiecke je Teil,
// Querschnitte als Text, damit die Bereichs-Quader ohne Blender und ohne Browser abgestimmt werden können.
// Aufruf: node tools/schaden_teile.mjs [--schnitt=z|x|y] [--json=datei]
import fs from 'fs'; import path from 'path'; import url from 'url';
const HERE = path.dirname(url.fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const imp = (p) => import(url.pathToFileURL(path.join(ROOT, p)).href);
const { CAR_DEF } = await imp('src/physics/car.js');
const { TEILE, teilVon } = await imp('src/physics/schaden.js');
const arg = (k, d) => { const a = process.argv.find((s) => s.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };

// ---- kleine Matrix-Rechnung (4×4, Spalten wie three.js) ----
const ident = () => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
function mul(a, b) { const o = new Array(16).fill(0); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k]; return o; }
function trs(n) {
  if (n.matrix) return n.matrix.slice();
  const [x, y, z, w] = n.rotation || [0, 0, 0, 1], [sx, sy, sz] = n.scale || [1, 1, 1], [tx, ty, tz] = n.translation || [0, 0, 0];
  return [(1 - 2 * (y * y + z * z)) * sx, 2 * (x * y + z * w) * sx, 2 * (x * z - y * w) * sx, 0,
    2 * (x * y - z * w) * sy, (1 - 2 * (x * x + z * z)) * sy, 2 * (y * z + x * w) * sy, 0,
    2 * (x * z + y * w) * sz, 2 * (y * z - x * w) * sz, (1 - 2 * (x * x + y * y)) * sz, 0, tx, ty, tz, 1];
}
const apply = (m, x, y, z) => [m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14]];

// GLB mit EXT_meshopt_compression + KHR_mesh_quantization (tools/build_assets.mjs): Puffer mit dem Meshopt-Decoder aus lib/
// entpacken (WASM, läuft in Node), Zugriffe mit Komponententyp/normalisiert lesen
const { MeshoptDecoder } = await import(url.pathToFileURL(path.join(ROOT, 'lib/addons/libs/meshopt_decoder.module.js')).href);
export async function ladeGoblin(file = path.join(ROOT, 'assets/car/goblin.glb')) {
  const b = fs.readFileSync(file), jl = b.readUInt32LE(12), J = JSON.parse(b.slice(20, 20 + jl).toString());
  const binOff = 20 + jl + 8, binLen = b.readUInt32LE(20 + jl);
  const bin = new Uint8Array(b.buffer, b.byteOffset + binOff, binLen);
  await MeshoptDecoder.ready;
  const bufs = J.buffers.map((B, i) => (i === 0 ? bin : new Uint8Array(B.byteLength)));
  for (const V of J.bufferViews) {
    const E = V.extensions && V.extensions.EXT_meshopt_compression;
    if (!E) continue;
    const src = bufs[E.buffer].subarray(E.byteOffset || 0, (E.byteOffset || 0) + E.byteLength), dst = new Uint8Array(E.count * E.byteStride);
    MeshoptDecoder.decodeGltfBuffer(dst, E.count, E.byteStride, src, E.mode, E.filter);
    bufs[V.buffer].set(dst, V.byteOffset || 0);
  }
  const SZ = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 }, NORM = { 5120: 127, 5121: 255, 5122: 32767, 5123: 65535 };
  const acc = (i) => {
    const A = J.accessors[i], V = J.bufferViews[A.bufferView], B = bufs[V.buffer];
    const dv = new DataView(B.buffer, B.byteOffset + (V.byteOffset || 0) + (A.byteOffset || 0));
    const comp = { VEC2: 2, VEC3: 3, VEC4: 4, SCALAR: 1 }[A.type], cs = SZ[A.componentType], stride = V.byteStride || cs * comp;
    const rd = { 5120: (o) => dv.getInt8(o), 5121: (o) => dv.getUint8(o), 5122: (o) => dv.getInt16(o, true), 5123: (o) => dv.getUint16(o, true), 5125: (o) => dv.getUint32(o, true), 5126: (o) => dv.getFloat32(o, true) }[A.componentType];
    const out = new Array(A.count * comp);
    for (let k = 0; k < A.count; k++) for (let c = 0; c < comp; c++) {
      let x = rd(k * stride + c * cs);
      if (A.normalized && NORM[A.componentType]) x = Math.max(-1, x / NORM[A.componentType]);
      out[k * comp + c] = x;
    }
    return { out, comp };
  };
  // Weltmatrizen aller Knoten
  const world = new Array(J.nodes.length), parent = new Array(J.nodes.length).fill(-1);
  J.nodes.forEach((n, i) => (n.children || []).forEach((c) => { parent[c] = i; }));
  const wm = (i) => world[i] || (world[i] = parent[i] < 0 ? trs(J.nodes[i]) : mul(wm(parent[i]), trs(J.nodes[i])));
  const meshes = [];
  J.nodes.forEach((n, i) => {
    if (n.mesh == null) return;
    const M = wm(i);
    for (const p of J.meshes[n.mesh].primitives) {
      const pa = acc(p.attributes.POSITION), pos = pa.out, idx = p.indices != null ? acc(p.indices).out : null;
      const P = []; for (let k = 0; k < pos.length; k += pa.comp) P.push(apply(M, pos[k], pos[k + 1], pos[k + 2]));
      meshes.push({ name: n.name, mat: (J.materials[p.material] || {}).name, P, idx });
    }
  });
  // wie makeCar: Radmitten (Boxen der Räder), Basis, Maßstab, Ruhelage
  const box = (pts) => { const a = [1e9, 1e9, 1e9], c = [-1e9, -1e9, -1e9]; for (const q of pts) for (let k = 0; k < 3; k++) { a[k] = Math.min(a[k], q[k]); c[k] = Math.max(c[k], q[k]); } return [a, c]; };
  const wheel = (k) => { const pts = meshes.filter((m) => new RegExp(`car_wheel_${k}`).test(m.name)).flatMap((m) => m.P); const [a, c] = box(pts); return { c: [(a[0] + c[0]) / 2, (a[1] + c[1]) / 2, (a[2] + c[2]) / 2], s: [c[0] - a[0], c[1] - a[1], c[2] - a[2]] }; };
  const FL = wheel('FL'), FR = wheel('FR'), BL = wheel('BL'), BR = wheel('BR');
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]], sc = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
  const nrm = (a) => sc(a, 1 / Math.hypot(...a)), cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]], dt = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const front = sc(add(FL.c, FR.c), 0.5), rear = sc(add(BL.c, BR.c), 0.5);
  const fwd = nrm(sub(front, rear)), right0 = nrm(sub(FR.c, FL.c));
  let up = nrm(cross(right0, fwd));
  const right = nrm(cross(fwd, up)); up = nrm(cross(right, fwd));
  const back = sc(fwd, -1);
  const scale = (-CAR_DEF.wheels[0].z + CAR_DEF.wheels[2].z) / Math.hypot(...sub(front, rear));
  const mid = sc(add(front, rear), 0.5);
  const d = CAR_DEF, rVis = Math.max(...FL.s) * scale / 2, comp0 = d.mass * 9.81 / 4 / d.k;
  const wheelY0 = d.mountY - (d.rest + d.wheelR - comp0) + rVis, zMid = (d.wheels[0].z + d.wheels[2].z) / 2;
  const toCar = (q) => { const v = sub(q, mid); return [dt(v, right) * scale, dt(v, up) * scale + wheelY0, dt(v, back) * scale + zMid]; };
  for (const m of meshes) m.C = m.P.map(toCar);
  return { meshes, scale, rVis };
}

if (import.meta.url === url.pathToFileURL(process.argv[1]).href) {
  const G = await ladeGoblin();
  const body = G.meshes.filter((m) => !/wheel|brake/.test(m.name));
  for (const m of body) {
    const a = [1e9, 1e9, 1e9], c = [-1e9, -1e9, -1e9];
    for (const q of m.C) for (let k = 0; k < 3; k++) { a[k] = Math.min(a[k], q[k]); c[k] = Math.max(c[k], q[k]); }
    console.log(`${m.name.padEnd(24)} ${m.mat.padEnd(10)} Punkte ${String(m.C.length).padStart(6)}  x ${a[0].toFixed(2)}…${c[0].toFixed(2)}  y ${a[1].toFixed(2)}…${c[1].toFixed(2)}  z ${a[2].toFixed(2)}…${c[2].toFixed(2)}`);
  }
  // Dreiecke je Teil (Schwerpunkt im Bereich), je Mesh
  const zaehl = {};
  for (const m of body) {
    const I = m.idx || [...Array(m.C.length).keys()];
    for (let t = 0; t < I.length; t += 3) {
      const A = m.C[I[t]], B = m.C[I[t + 1]], C = m.C[I[t + 2]];
      const s = [(A[0] + B[0] + C[0]) / 3, (A[1] + B[1] + C[1]) / 3, (A[2] + B[2] + C[2]) / 3];
      const k = teilVon(s[0], s[1], s[2]);
      const key = `${k < 0 ? 'Rumpf' : TEILE[k].name} (${m.mat})`;
      zaehl[key] = (zaehl[key] || 0) + 1;
    }
  }
  console.log('\nDreiecke je Teil:'); for (const [k, n] of Object.entries(zaehl).sort()) console.log(`  ${k.padEnd(34)} ${n}`);
  // Querschnitt: Belegung im Raster (Seitenansicht x-Achse zusammengefasst bzw. Draufsicht)
  const ach = arg('schnitt', 'x');
  const [u, v] = ach === 'x' ? [2, 1] : ach === 'y' ? [2, 0] : [0, 1];   // Draufsicht: waagrecht z, senkrecht x
  // Raster 5 cm (Seite/Front) bzw. 10 cm (Draufsicht); Ausschnitt um die Karosserie (x ±1,2, y −0,55 … 0,75, z −2,55 … 2,35)
  const um = ach === 'z' ? [-1.2, 1.2] : [-2.55, 2.35], vm = ach === 'y' ? [-1.2, 1.2] : [-0.55, 0.75];
  const nu = Math.round((um[1] - um[0]) / (ach === 'y' ? 0.05 : 0.05)), nv = Math.round((vm[1] - vm[0]) / (ach === 'y' ? 0.1 : 0.05));
  if (ach === 'y') { um[0] = -2.55; um[1] = 2.35; }
  const grid = Array.from({ length: nv }, () => new Array(nu).fill(' '));
  for (const m of body) for (const q of m.C) {
    const i = Math.floor((q[u] - um[0]) / (um[1] - um[0]) * nu), j = nv - 1 - Math.floor((q[v] - vm[0]) / (vm[1] - vm[0]) * nv);
    if (i < 0 || j < 0 || i >= nu || j >= nv) continue;
    const k = teilVon(q[0], q[1], q[2]);
    const ch = k < 0 ? (m.mat === 'car_glass' ? 'o' : '.') : String.fromCharCode(65 + k);
    if (grid[j][i] === ' ' || grid[j][i] === '.' || grid[j][i] === 'o') grid[j][i] = ch;
  }
  console.log(`\nSchnitt (${ach === 'x' ? 'Seitenansicht: waagrecht z (−vorn … +hinten), senkrecht y' : ach === 'y' ? 'Draufsicht: waagrecht z (−vorn … +hinten), senkrecht x (oben = rechts)' : 'Frontansicht: waagrecht x, senkrecht y'}); Buchstaben = Teile ${TEILE.map((t, k) => String.fromCharCode(65 + k) + '=' + t.name).join(', ')}`);
  for (const r of grid) console.log('|' + r.join('') + '|');
  if (arg('json')) fs.writeFileSync(arg('json'), JSON.stringify(zaehl));
}
