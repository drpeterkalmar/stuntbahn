// Kollisionswelt: Strecken-Dreiecke in einem 3D-Raster + Gelände-Höhenfeld.
// Raycasts liefern Treffer mit interpolierter (glatter) Normale → ruhiges Fahren in Loopings.

export class CollisionWorld {
  constructor(track, cell = 4) {
    const { pos, nrm, mat } = track.col;
    this.pos = pos; this.nrm = nrm; this.mat = mat; this.cell = cell;
    this.terrain = track.terrain;
    const nt = mat.length;
    // Grenzen
    let x0 = 1e9, y0 = 1e9, z0 = 1e9, x1 = -1e9, y1 = -1e9, z1 = -1e9;
    for (let i = 0; i < pos.length; i += 3) {
      const x = pos[i], y = pos[i + 1], z = pos[i + 2];
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; if (z < z0) z0 = z; if (z > z1) z1 = z;
    }
    if (!nt) { x0 = y0 = z0 = 0; x1 = y1 = z1 = 1; }
    this.o = [x0 - cell, y0 - cell, z0 - cell];
    this.n = [Math.ceil((x1 - x0) / cell) + 3, Math.ceil((y1 - y0) / cell) + 3, Math.ceil((z1 - z0) / cell) + 3];
    const [nx, ny, nz] = this.n;
    const ncell = nx * ny * nz;
    const count = new Uint32Array(ncell + 1);
    const cellRange = (t, fn) => {
      const b = t * 9;
      let ax = 1e9, ay = 1e9, az = 1e9, bx = -1e9, by = -1e9, bz = -1e9;
      for (let k = 0; k < 9; k += 3) {
        const x = pos[b + k], y = pos[b + k + 1], z = pos[b + k + 2];
        if (x < ax) ax = x; if (x > bx) bx = x; if (y < ay) ay = y; if (y > by) by = y; if (z < az) az = z; if (z > bz) bz = z;
      }
      const i0 = Math.floor((ax - this.o[0]) / cell), i1 = Math.floor((bx - this.o[0]) / cell);
      const j0 = Math.floor((ay - this.o[1]) / cell), j1 = Math.floor((by - this.o[1]) / cell);
      const k0 = Math.floor((az - this.o[2]) / cell), k1 = Math.floor((bz - this.o[2]) / cell);
      for (let k = k0; k <= k1; k++) for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) fn((k * ny + j) * nx + i);
    };
    for (let t = 0; t < nt; t++) cellRange(t, (c) => { count[c + 1]++; });
    for (let c = 0; c < ncell; c++) count[c + 1] += count[c];
    this.start = count;
    this.items = new Int32Array(count[ncell]);
    const fill = new Uint32Array(ncell);
    for (let t = 0; t < nt; t++) cellRange(t, (c) => { this.items[count[c] + fill[c]++] = t; });
    this.stamp = new Uint32Array(nt);
    this.stampId = 1;
    this.hit = { t: 0, x: 0, y: 0, z: 0, nx: 0, ny: 1, nz: 0, mat: 0, tri: -1, terrain: false };
  }

  // Strahl gegen Streckendreiecke. frontOnly: nur Flächen, deren Normale zum Ursprung zeigt.
  rayTrack(ox, oy, oz, dx, dy, dz, maxT, frontOnly = true, out = this.hit) {
    const c = this.cell, O = this.o, [nx, ny, nz] = this.n;
    const ex = ox + dx * maxT, ey = oy + dy * maxT, ez = oz + dz * maxT;
    const i0 = Math.max(0, Math.floor((Math.min(ox, ex) - O[0]) / c)), i1 = Math.min(nx - 1, Math.floor((Math.max(ox, ex) - O[0]) / c));
    const j0 = Math.max(0, Math.floor((Math.min(oy, ey) - O[1]) / c)), j1 = Math.min(ny - 1, Math.floor((Math.max(oy, ey) - O[1]) / c));
    const k0 = Math.max(0, Math.floor((Math.min(oz, ez) - O[2]) / c)), k1 = Math.min(nz - 1, Math.floor((Math.max(oz, ez) - O[2]) / c));
    if (i0 > i1 || j0 > j1 || k0 > k1) return null;
    if ((i1 - i0 + 1) * (j1 - j0 + 1) * (k1 - k0 + 1) > 64) return this.rayTrackDDA(ox, oy, oz, dx, dy, dz, maxT, frontOnly, out);
    const P = this.pos, st = this.stamp, id = ++this.stampId;
    if (id > 4e9) { st.fill(0); this.stampId = 1; }
    let best = maxT, bt = -1, bu = 0, bv = 0;
    for (let k = k0; k <= k1; k++) for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const cc = (k * ny + j) * nx + i;
      for (let q = this.start[cc], qe = this.start[cc + 1]; q < qe; q++) {
        const t = this.items[q];
        if (st[t] === id) continue;
        st[t] = id;
        const r = this._tri(t, ox, oy, oz, dx, dy, dz, best, frontOnly);
        if (r) { best = r[0]; bt = t; bu = r[1]; bv = r[2]; }
      }
    }
    if (bt < 0) return null;
    return this._fill(out, bt, best, bu, bv, ox, oy, oz, dx, dy, dz);
  }

  rayTrackDDA(ox, oy, oz, dx, dy, dz, maxT, frontOnly, out) {
    // Schritte durch das Raster (für lange Strahlen: Kamera, Schatten-Bake)
    const c = this.cell, O = this.o, [nx, ny, nz] = this.n;
    const st = this.stamp; let id = ++this.stampId;
    let best = maxT, bt = -1, bu = 0, bv = 0;
    const stepLen = c * 0.5;
    let lastCell = -1;
    for (let s = 0; s <= maxT + stepLen && s <= best + c; s += stepLen) {
      const x = ox + dx * s, y = oy + dy * s, z = oz + dz * s;
      const i = Math.floor((x - O[0]) / c), j = Math.floor((y - O[1]) / c), k = Math.floor((z - O[2]) / c);
      for (let kk = k - 1; kk <= k + 1; kk++) for (let jj = j - 1; jj <= j + 1; jj++) for (let ii = i - 1; ii <= i + 1; ii++) {
        if (ii < 0 || jj < 0 || kk < 0 || ii >= nx || jj >= ny || kk >= nz) continue;
        const cc = (kk * ny + jj) * nx + ii;
        if (cc === lastCell) continue;
        for (let q = this.start[cc], qe = this.start[cc + 1]; q < qe; q++) {
          const t = this.items[q];
          if (st[t] === id) continue;
          st[t] = id;
          const r = this._tri(t, ox, oy, oz, dx, dy, dz, best, frontOnly);
          if (r) { best = r[0]; bt = t; bu = r[1]; bv = r[2]; }
        }
      }
      lastCell = -1;
    }
    if (bt < 0) return null;
    return this._fill(out, bt, best, bu, bv, ox, oy, oz, dx, dy, dz);
  }

  _tri(t, ox, oy, oz, dx, dy, dz, maxT, frontOnly) {
    const P = this.pos, b = t * 9;
    const ax = P[b], ay = P[b + 1], az = P[b + 2];
    const e1x = P[b + 3] - ax, e1y = P[b + 4] - ay, e1z = P[b + 5] - az;
    const e2x = P[b + 6] - ax, e2y = P[b + 7] - ay, e2z = P[b + 8] - az;
    const px = dy * e2z - dz * e2y, py = dz * e2x - dx * e2z, pz = dx * e2y - dy * e2x;
    const det = e1x * px + e1y * py + e1z * pz;
    // det = −d·(e1×e2): det > 0 ⇔ Fläche zeigt zum Strahl-Ursprung
    if (frontOnly ? det < 1e-9 : Math.abs(det) < 1e-9) return null;
    const inv = 1 / det;
    const tx = ox - ax, ty = oy - ay, tz = oz - az;
    const u = (tx * px + ty * py + tz * pz) * inv;
    if (u < -1e-5 || u > 1 + 1e-5) return null;
    const qx = ty * e1z - tz * e1y, qy = tz * e1x - tx * e1z, qz = tx * e1y - ty * e1x;
    const v = (dx * qx + dy * qy + dz * qz) * inv;
    if (v < -1e-5 || u + v > 1 + 1e-5) return null;
    const tt = (e2x * qx + e2y * qy + e2z * qz) * inv;
    if (tt < 0 || tt >= maxT) return null;
    return [tt, u, v];
  }

  _fill(out, t, tt, u, v, ox, oy, oz, dx, dy, dz) {
    const N = this.nrm, b = t * 9, w = 1 - u - v;
    let nx = N[b] * w + N[b + 3] * u + N[b + 6] * v;
    let ny = N[b + 1] * w + N[b + 4] * u + N[b + 7] * v;
    let nz = N[b + 2] * w + N[b + 5] * u + N[b + 8] * v;
    const l = Math.hypot(nx, ny, nz) || 1;
    out.t = tt; out.x = ox + dx * tt; out.y = oy + dy * tt; out.z = oz + dz * tt;
    out.nx = nx / l; out.ny = ny / l; out.nz = nz / l; out.mat = this.mat[t]; out.tri = t; out.terrain = false;
    return out;
  }

  // Strahl gegen Gelände (Höhenfeld): Abtasten + Bisektion
  rayTerrain(ox, oy, oz, dx, dy, dz, maxT, out = this.hit) {
    const h = this.terrain.height;
    let prevT = 0, prevD = oy - h(ox, oz);
    if (prevD < 0) return null;
    const step = 0.3;
    for (let t = Math.min(step, maxT); ; t = Math.min(t + step, maxT)) {
      const x = ox + dx * t, y = oy + dy * t, z = oz + dz * t;
      const d = y - h(x, z);
      if (d <= 0) {
        let a = prevT, b = t;
        for (let k = 0; k < 10; k++) {
          const m = (a + b) / 2;
          if (oy + dy * m - h(ox + dx * m, oz + dz * m) > 0) a = m; else b = m;
        }
        const tt = (a + b) / 2, hx = ox + dx * tt, hz = oz + dz * tt;
        const e = 0.6;
        const gx = (h(hx + e, hz) - h(hx - e, hz)) / (2 * e), gz = (h(hx, hz + e) - h(hx, hz - e)) / (2 * e);
        const l = Math.hypot(gx, 1, gz);
        out.t = tt; out.x = hx; out.y = oy + dy * tt; out.z = hz;
        out.nx = -gx / l; out.ny = 1 / l; out.nz = -gz / l; out.mat = 8; out.tri = -1; out.terrain = true;
        return out;
      }
      prevT = t; prevD = d;
      if (t >= maxT) break;
    }
    return null;
  }

  // Nächster Treffer (Strecke oder Gelände)
  ray(ox, oy, oz, dx, dy, dz, maxT, frontOnly = true) {
    const a = this.rayTrack(ox, oy, oz, dx, dy, dz, maxT, frontOnly, this._ha || (this._ha = {}));
    const b = this.rayTerrain(ox, oy, oz, dx, dy, dz, a ? a.t : maxT, this._hb || (this._hb = {}));
    return b || a;
  }
}
