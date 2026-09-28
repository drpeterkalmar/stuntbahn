// Szene aus den Streckendaten: Strecken-Batches, Gelände (Nah-/Fernraster), Wasser, Bäume, Banner.
import * as THREE from 'three';
import { MAT, ROAD_HW, WORLD_SCALE, TILE } from '../track/defs.js';
import { TB, triLerp } from '../track/terrgrid.js';

const STATIC_LAYER = 1;

function geo(b) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(b.pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(b.nrm, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(b.uv, 2));
  if (b.road) g.setAttribute('aRoad', new THREE.BufferAttribute(b.road, 4));
  if (b.col) g.setAttribute('color', new THREE.BufferAttribute(b.col, 3));
  g.setIndex(new THREE.BufferAttribute(b.idx, 1));
  g.computeBoundingSphere();
  return g;
}

function bannerTexture(text, bg, fg) {
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = bg; g.fillRect(0, 0, 1024, 128);
  g.fillStyle = fg;
  g.font = 'bold 84px system-ui, Arial, sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, 512, 68);
  g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(0, 118, 1024, 10);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

export function buildWorld(track, M, opts = {}) {
  const colWorld = opts.world || null;
  const root = new THREE.Group();
  root.name = 'world';
  const add = (mesh, caster = true) => {
    mesh.receiveShadow = true;
    mesh.castShadow = false;
    mesh.matrixAutoUpdate = false; mesh.updateMatrix();
    if (caster) mesh.layers.enable(STATIC_LAYER);
    root.add(mesh);
    return mesh;
  };
  const stats = { tris: 0, meshes: 0 };
  // Strecke
  for (const b of track.batches) {
    const m = M[b.mat] || M[MAT.CONCRETE];
    const mesh = new THREE.Mesh(geo(b), m);
    mesh.name = 'trk' + b.mat + '@' + b.chunk;
    add(mesh, b.mat !== MAT.ROAD && b.mat !== MAT.KERB);
    stats.tris += b.idx.length / 3; stats.meshes++;
  }
  // Gelände: Nahraster aus dem Physik-Höhenfeld (identisch), Fernring grob. Adaptiv (track/terrgrid.js):
  // feine Blöcke nahe der Strecke mit allen 5-m-Punkten, grobe Blöcke nur als zwei Dreiecke über die
  // Blockecken (die Randpunkte der feinen Nachbarn liegen genau auf deren Kanten → keine Risse)
  const T = track.terrain;
  {
    const nx = T.nx, step = T.step, ext = T.ext, HH = T.Hr || T.Hv || T.H;
    const nb = T.fine ? T.nb : (nx - 1) / TB, fine = T.fine || new Uint8Array(nb * nb).fill(1);
    const used = new Int32Array(nx * nx).fill(-1);
    let nv = 0;
    const want = (i, j) => { const k = j * nx + i; if (used[k] < 0) used[k] = nv++; };
    for (let bj = 0; bj < nb; bj++) for (let bi = 0; bi < nb; bi++) {
      if (fine[bj * nb + bi]) { for (let j = bj * TB; j <= (bj + 1) * TB; j++) for (let i = bi * TB; i <= (bi + 1) * TB; i++) want(i, j); }
      else { want(bi * TB, bj * TB); want((bi + 1) * TB, bj * TB); want(bi * TB, (bj + 1) * TB); want((bi + 1) * TB, (bj + 1) * TB); }
    }
    const pos = new Float32Array(nv * 3), uv = new Float32Array(nv * 2);
    for (let k = 0; k < nx * nx; k++) {
      const v = used[k];
      if (v < 0) continue;
      const x = -ext + (k % nx) * step, z = -ext + ((k / nx) | 0) * step;
      pos[v * 3] = x; pos[v * 3 + 1] = HH[k]; pos[v * 3 + 2] = z;
      uv[v * 2] = x; uv[v * 2 + 1] = z;
    }
    const idx = [];
    const quad = (i0, j0, s) => {
      const a = used[j0 * nx + i0], b = used[j0 * nx + i0 + s], c = used[(j0 + s) * nx + i0], d = used[(j0 + s) * nx + i0 + s];
      idx.push(a, c, b, b, c, d);
    };
    for (let bj = 0; bj < nb; bj++) for (let bi = 0; bi < nb; bi++) {
      if (fine[bj * nb + bi]) { for (let j = bj * TB; j < (bj + 1) * TB; j++) for (let i = bi * TB; i < (bi + 1) * TB; i++) quad(i, j, 1); }
      else quad(bi * TB, bj * TB, TB);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setIndex(new THREE.BufferAttribute(new Uint32Array(idx), 1));
    g.computeVertexNormals();
    // Vorberechnete Umgebungsverdeckung (AO) nahe der Strecke: kurze Halbkugel-Strahlen gegen Bauwerke
    const col = new Float32Array(nv * 3).fill(1);
    let aoRays = 0;
    if (colWorld) {
      const dirs = [];
      for (let k = 0; k < 10; k++) { const a = k * 2.39996, z = 0.25 + 0.7 * (k + 0.5) / 10, r = Math.sqrt(1 - z * z); dirs.push([Math.cos(a) * r, z, Math.sin(a) * r]); }
      for (let k = 0; k < nv; k++) {
        const x = pos[k * 3], y = pos[k * 3 + 1], z = pos[k * 3 + 2];
        if (T.distTiles(x, z) * TILE > 25) continue;   // AO kommt von Bauwerken (Auto-Maßstab): 25-m-Band
        let occ = 0;
        for (const d of dirs) { aoRays++; if (colWorld.rayTrack(x, y + 0.15, z, d[0], d[1], d[2], 9, false)) occ++; }
        const ao = 1 - 0.55 * Math.pow(occ / dirs.length, 0.8);
        col[k * 3] = col[k * 3 + 1] = col[k * 3 + 2] = ao;
      }
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    stats.aoRays = aoRays;
    const mesh = new THREE.Mesh(g, M.grass);
    mesh.name = 'terrain-near';
    add(mesh, true);
    stats.tris += idx.length / 3; stats.meshes++; stats.terrVerts = nv;
  }
  // Fernring bis zum Bergkranz: wächst mit dem Weltmaßstab (gleich viele Dreiecke). Das Nahraster (±ext) muss
  // genau auf dem Ring-Gitter liegen, sonst bleibt am Übergang ein Streifen ohne Gelände
  const ringSt = T.ext / Math.round(T.ext / (40 * WORLD_SCALE)), ringE = ringSt * Math.round(1400 * WORLD_SCALE / ringSt);
  const ringY = (x, z) => (Math.abs(x) < T.ext - 1 && Math.abs(z) < T.ext - 1 ? T.height(x, z) - 2 : T.heightFn(x, z));
  // Höhe der gezeichneten Geländefläche (feine Zellen, grobe Blöcke, Fernring – gleiche Dreiecksteilung wie die
  // Meshes): Bäume stehen darauf statt auf dem exakten Gelände, sonst schweben sie über groben Flächen
  const surfaceY = (x, z) => {
    const ext = T.ext, step = T.step, nx = T.nx, HH = T.Hr || T.Hv || T.H;
    if (Math.abs(x) < ext && Math.abs(z) < ext) {
      const fx = (x + ext) / step, fz = (z + ext) / step, nb = T.fine ? T.nb : (nx - 1) / TB;
      const bi = Math.min(nb - 1, Math.floor(fx / TB)), bj = Math.min(nb - 1, Math.floor(fz / TB));
      if (!T.fine || T.fine[bj * nb + bi]) {
        const i = Math.min(nx - 2, Math.floor(fx)), j = Math.min(nx - 2, Math.floor(fz)), k = j * nx + i;
        return triLerp(HH[k], HH[k + 1], HH[k + nx], HH[k + nx + 1], fx - i, fz - j);
      }
      const k = bj * TB * nx + bi * TB;
      return triLerp(HH[k], HH[k + TB], HH[k + TB * nx], HH[k + TB * nx + TB], fx / TB - bi, fz / TB - bj);
    }
    const i = Math.floor((x + ringE) / ringSt), j = Math.floor((z + ringE) / ringSt), x0 = -ringE + i * ringSt, z0 = -ringE + j * ringSt;
    return triLerp(ringY(x0, z0), ringY(x0 + ringSt, z0), ringY(x0, z0 + ringSt), ringY(x0 + ringSt, z0 + ringSt), (x - x0) / ringSt, (z - z0) / ringSt);
  };
  {
    const ext = T.ext, st = ringSt, E = ringE, n = Math.round(2 * E / st) + 1;
    const pos = [], uv = [], idx = [];
    const vid = new Int32Array(n * n).fill(-1);
    const vtx = (i, j) => {
      const k = j * n + i;
      if (vid[k] >= 0) return vid[k];
      const x = -E + i * st, z = -E + j * st;
      const y = ringY(x, z);
      pos.push(x, y, z); uv.push(x, z);
      vid[k] = pos.length / 3 - 1;
      return vid[k];
    };
    for (let j = 0; j < n - 1; j++) for (let i = 0; i < n - 1; i++) {
      const x0 = -E + i * st, z0 = -E + j * st, x1 = x0 + st, z1 = z0 + st;
      if (x0 >= -ext && x1 <= ext && z0 >= -ext && z1 <= ext) continue;
      const a = vtx(i, j), b = vtx(i + 1, j), c = vtx(i, j + 1), d = vtx(i + 1, j + 1);
      idx.push(a, c, b, b, c, d);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(pos.length).fill(1), 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    const mesh = new THREE.Mesh(g, M.grass);
    mesh.name = 'terrain-far';
    add(mesh, false);
    stats.tris += idx.length / 3; stats.meshes++;
  }
  // Wasser (Gruben, Teiche)
  for (const w of T.waters) {
    const cf = (w.f0 + w.f1) / 2, cr = (w.r0 + w.r1) / 2;
    const g = new THREE.PlaneGeometry(w.f1 - w.f0, w.r1 - w.r0);
    g.rotateX(-Math.PI / 2);
    const mesh = new THREE.Mesh(g, M.water);
    const ang = Math.atan2(-w.F[2], w.F[0]);
    mesh.rotation.y = ang;
    mesh.position.set(w.E[0] + w.F[0] * cf + w.R[0] * cr, w.y, w.E[2] + w.F[2] * cf + w.R[2] * cr);
    mesh.name = 'water';
    add(mesh, false);
  }
  // Banner an Start/Checkpoint-Portalen, Schilder der Szenerie
  const texStart = bannerTexture('START  •  ZIEL', '#10151c', '#f4f4f4');
  const texCp = bannerTexture('CHECKPOINT', '#f2b705', '#10151c');
  // Schilder der Szenerie: je Text ein instanziertes Mesh (1 Draw-Call, egal wie viele)
  const signs = new Map();
  for (const d of track.decals) if (d.type === 'sign') { if (!signs.has(d.text)) signs.set(d.text, []); signs.get(d.text).push(d); }
  for (const [text, list] of signs) {
    const mat = new THREE.MeshStandardMaterial({ map: bannerTexture(text, '#c21d14', '#fff4d6'), roughness: 0.6, metalness: 0 });
    const g = new THREE.PlaneGeometry(list[0].w, list[0].h);
    const im = new THREE.InstancedMesh(g, mat, list.length * 2);
    const o = new THREE.Object3D();
    list.forEach((d, k) => {
      for (const [q, side] of [[0, -1], [1, 1]]) {
        o.rotation.set(0, Math.atan2(side * d.F[0], side * d.F[2]), 0);
        o.position.set(d.p[0] + d.F[0] * side * 0.33, d.p[1], d.p[2] + d.F[2] * side * 0.33);
        o.updateMatrix();
        im.setMatrixAt(k * 2 + q, o.matrix);
      }
    });
    im.computeBoundingSphere();
    im.name = 'signs';
    add(im, false);
  }
  for (const d of track.decals) {
    if (d.type === 'car' || d.type === 'sign') continue;   // Autos setzt main.js, Schilder oben
    const t = d.type === 'start' ? texStart : texCp;
    const mat = new THREE.MeshStandardMaterial({ map: t, roughness: 0.7, metalness: 0 });
    const w = 2 * (ROAD_HW + 1.6) + 0.3, h = 1.05;   // Portalbreite wie pb.gate (build.js)
    const g = new THREE.PlaneGeometry(w, h);
    for (const side of [-1, 1]) {
      const mesh = new THREE.Mesh(g, mat);
      // Normale zeigt entlang ±F (vorn: dem anfahrenden Auto entgegen)
      mesh.rotation.set(0, Math.atan2(side * d.F[0], side * d.F[2]), 0);
      mesh.position.set(d.p[0] + d.F[0] * side * 0.37, d.p[1] + 6.2 + 0.55, d.p[2] + d.F[2] * side * 0.37);
      mesh.name = 'banner';
      add(mesh, false);
    }
  }
  // Bäume: gekreuzte Karten, instanziert
  // Qualitätsstufe 0: jeden zweiten Baum weglassen (die große Welt hat Maßstab² so viele Bäume)
  if (track.trees && track.trees.length) {
    const thin = opts.tier === 0 && WORLD_SCALE > 1 ? 2 : 1;
    for (const v of [0, 1]) {
      const list = track.trees.filter((t, i) => t.v === v && (t.keep || i % thin === 0));   // Tannen der .TRK bleiben
      if (!list.length) continue;
      const g = treeGeometry();
      const im = new THREE.InstancedMesh(g, M.tree[v], list.length);
      const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
      list.forEach((t, i) => {
        q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), t.rot);
        s.set(t.s, t.s * (0.9 + 0.2 * ((i * 37) % 10) / 10), t.s);
        p.set(t.x, surfaceY(t.x, t.z) - 0.3, t.z);
        m4.compose(p, q, s);
        im.setMatrixAt(i, m4);
      });
      im.computeBoundingSphere();
      im.name = 'trees' + v;
      add(im, true);
      stats.tris += (g.index.count / 3) * list.length;
    }
  }
  root.userData.stats = stats;
  return root;
}

function treeGeometry() {
  // 3 senkrechte Karten (60° versetzt), Normale "kugelförmig" vom Stamm weg → weiches Volumen-Licht
  const H = 13, W = 6.6;
  const pos = [], nrm = [], uv = [], idx = [];
  for (let k = 0; k < 3; k++) {
    const a = k * Math.PI / 3, cx = Math.cos(a), cz = Math.sin(a);
    const base = pos.length / 3;
    const pts = [[-W / 2, 0, 0, 1], [W / 2, 0, 1, 1], [W / 2, H, 1, 0], [-W / 2, H, 0, 0]];
    for (const [x, y, u, v] of pts) {
      const px = cx * x, pz = cz * x;
      pos.push(px, y, pz);
      const n = new THREE.Vector3(px * 0.35, 1.0, pz * 0.35).normalize();
      nrm.push(n.x, n.y, n.z);
      uv.push(u, 1 - v);
    }
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.normalizeNormals?.();
  return g;
}

export { STATIC_LAYER };
