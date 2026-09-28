// Szenerie importierter Strecken: einfache eigene Modelle aus Grundkörpern (Quader, Zylinder, Dächer),
// eingefärbt über Vertexfarben (Material PAINT) → wenige Draw-Calls, keine Download-Kosten.
// Gebäude/Stämme bekommen Kollision (Aufprall wie im Original). Alles in Weltkoordinaten.
import { TILE, GRID, DIRS, tileX, tileZ, MAT } from './defs.js';
import { WATER_Y } from './trkterrain.js';

const PI = Math.PI;
const C = {
  white: [0.86, 0.85, 0.82], cream: [0.9, 0.84, 0.68], red: [0.55, 0.09, 0.06], darkRed: [0.34, 0.06, 0.04],
  roof: [0.23, 0.22, 0.22], roofRed: [0.45, 0.14, 0.09], wood: [0.36, 0.24, 0.14], bark: [0.33, 0.25, 0.17],
  leaf: [0.16, 0.36, 0.08], leafDark: [0.1, 0.25, 0.05], cactus: [0.2, 0.39, 0.15], court: [0.16, 0.42, 0.24],
  courtOut: [0.55, 0.22, 0.14], line: [0.95, 0.95, 0.92], hull: [0.12, 0.16, 0.24], hullRed: [0.5, 0.1, 0.07],
  steelBlue: [0.25, 0.42, 0.62], yellow: [0.92, 0.72, 0.1], chrome: [0.75, 0.77, 0.8], glassy: [0.2, 0.28, 0.36],
  concrete: [0.62, 0.6, 0.56], brick: [0.52, 0.28, 0.2], sail: [0.84, 0.8, 0.7],
};

const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

// Baukasten in einem lokalen Rahmen (f = vorne, r = rechts, y = oben) um (x0, y0, z0)
function kit(ctx, x0, y0, z0, d) {
  const F = [DIRS[d][0], 0, DIRS[d][1]], R = [DIRS[(d + 1) % 4][0], 0, DIRS[(d + 1) % 4][1]], U = [0, 1, 0];
  const chunk = ctx.chunkOf(x0, z0);
  const W = (f, y, r) => [x0 + F[0] * f + R[0] * r, y0 + y, z0 + F[2] * f + R[2] * r];
  const quad = (q, n, mat, col, collide) => {
    const b = ctx.batch(chunk, mat);
    const ul = Math.hypot(...sub(q[1], q[0])), vl = Math.hypot(...sub(q[3], q[0]));
    const ii = [b.v(q[0], n, 0, 0, null, col), b.v(q[1], n, ul, 0, null, col), b.v(q[2], n, ul, vl, null, col), b.v(q[3], n, 0, vl, null, col)];
    const ok = dot(cross(sub(q[1], q[0]), sub(q[2], q[0])), n) > 0;
    if (ok) b.idx.push(ii[0], ii[1], ii[2], ii[0], ii[2], ii[3]); else b.idx.push(ii[0], ii[2], ii[1], ii[0], ii[3], ii[2]);
    if (collide) {
      if (ok) { ctx.addColTri(q[0], q[1], q[2], n, n, n, mat); ctx.addColTri(q[0], q[2], q[3], n, n, n, mat); }
      else { ctx.addColTri(q[0], q[2], q[1], n, n, n, mat); ctx.addColTri(q[0], q[3], q[2], n, n, n, mat); }
    }
  };
  // Quader: Mittelpunkt (f, y, r), Kanten lf/ly/lr, optional um die Hochachse gedreht (yaw, rechts positiv)
  const box = (f, y, r, lf, ly, lr, mat, col, collide = false, yaw = 0, pitch = 0) => {
    const c = W(f, y, r);
    let A0 = F, A2 = R;
    if (yaw) { const cs = Math.cos(yaw), sn = Math.sin(yaw); A0 = add(mul(F, cs), mul(R, sn)); A2 = add(mul(R, cs), mul(F, -sn)); }
    let A1 = U;
    if (pitch) { const cs = Math.cos(pitch), sn = Math.sin(pitch); const a0 = add(mul(A0, cs), mul(U, sn)); A1 = add(mul(U, cs), mul(A0, -sn)); A0 = a0; }
    const ax = [A0, A1, A2], hs = [lf / 2, ly / 2, lr / 2];
    for (let a = 0; a < 3; a++) for (const sg of [-1, 1]) {
      const a1 = (a + 1) % 3, a2 = (a + 2) % 3;
      const n = mul(ax[a], sg), cF = add(c, mul(ax[a], sg * hs[a]));
      const u = mul(ax[a1], hs[a1]), v = mul(ax[a2], hs[a2]);
      quad([add(add(cF, mul(u, -1)), mul(v, -1)), add(add(cF, u), mul(v, -1)), add(add(cF, u), v), add(add(cF, mul(u, -1)), v)], n, mat, col, collide);
    }
  };
  // Zylinder/Kegelstumpf (Achse senkrecht)
  const cyl = (f, y, r, rad0, rad1, h, seg, mat, col, collide = false, cap = true) => {
    const b = ctx.batch(chunk, mat);
    const c = W(f, y, r);
    const ring = [];
    for (let k = 0; k <= seg; k++) {
      const a = 2 * PI * k / seg, dx = Math.cos(a), dz = Math.sin(a);
      const slope = (rad0 - rad1) / h;
      const n = norm([dx, slope, dz]);
      const i0 = b.v([c[0] + dx * rad0, c[1], c[2] + dz * rad0], n, k / seg * 2 * PI * rad0, 0, null, col);
      const i1 = b.v([c[0] + dx * rad1, c[1] + h, c[2] + dz * rad1], n, k / seg * 2 * PI * rad1, h, null, col);
      ring.push([i0, i1]);
    }
    for (let k = 0; k < seg; k++) b.idx.push(ring[k][0], ring[k][1], ring[k + 1][0], ring[k + 1][0], ring[k][1], ring[k + 1][1]);
    if (cap && rad1 > 0.01) {
      const ic = b.v([c[0], c[1] + h, c[2]], [0, 1, 0], 0, 0, null, col);
      const top = [];
      for (let k = 0; k <= seg; k++) { const a = 2 * PI * k / seg; top.push(b.v([c[0] + Math.cos(a) * rad1, c[1] + h, c[2] + Math.sin(a) * rad1], [0, 1, 0], Math.cos(a), Math.sin(a), null, col)); }
      for (let k = 0; k < seg; k++) b.idx.push(ic, top[k + 1], top[k]);
    }
    if (collide) { const m = Math.max(rad0, rad1) * 1.6; colBox(f, y + h / 2, r, m, h, m); }
  };
  // nur Kollision (unsichtbar): Quader
  const colBox = (f, y, r, lf, ly, lr) => {
    const c = W(f, y, r), hs = [lf / 2, ly / 2, lr / 2], ax = [F, U, R];
    for (let a = 0; a < 3; a++) for (const sg of [-1, 1]) {
      const a1 = (a + 1) % 3, a2 = (a + 2) % 3;
      const n = mul(ax[a], sg), cF = add(c, mul(ax[a], sg * hs[a]));
      const u = mul(ax[a1], hs[a1]), v = mul(ax[a2], hs[a2]);
      const q = [add(add(cF, mul(u, -1)), mul(v, -1)), add(add(cF, u), mul(v, -1)), add(add(cF, u), v), add(add(cF, mul(u, -1)), v)];
      if (dot(cross(sub(q[1], q[0]), sub(q[2], q[0])), n) > 0) { ctx.addColTri(q[0], q[1], q[2], n, n, n, MAT.CONCRETE); ctx.addColTri(q[0], q[2], q[3], n, n, n, MAT.CONCRETE); }
      else { ctx.addColTri(q[0], q[2], q[1], n, n, n, MAT.CONCRETE); ctx.addColTri(q[0], q[3], q[2], n, n, n, MAT.CONCRETE); }
    }
  };
  // Satteldach über Grundfläche lf × lr ab Höhe y, First in Richtung f, Firsthöhe h
  const gable = (f, y, r, lf, lr, h, mat, col, over = 0.4) => {
    const hf = lf / 2 + over, hr = lr / 2 + over;
    const p = (df, dy, dr) => W(f + df, y + dy, r + dr);
    const nl = norm(add(mul(R, -h), mul(U, hr))), nr = norm(add(mul(R, h), mul(U, hr)));
    quad([p(-hf, 0, -hr), p(hf, 0, -hr), p(hf, h, 0), p(-hf, h, 0)], nl, mat, col, false);
    quad([p(-hf, 0, hr), p(-hf, h, 0), p(hf, h, 0), p(hf, 0, hr)], nr, mat, col, false);
    const b = ctx.batch(chunk, mat);
    for (const s of [-1, 1]) {
      const n = mul(F, s), a = p(s * (lf / 2), 0, -lr / 2), bb = p(s * (lf / 2), 0, lr / 2), cc = p(s * (lf / 2), h - over * h / hr, 0);
      const i = [b.v(a, n, 0, 0, null, col), b.v(bb, n, lr, 0, null, col), b.v(cc, n, lr / 2, h, null, col)];
      if (dot(cross(sub(bb, a), sub(cc, a)), n) > 0) b.idx.push(i[0], i[1], i[2]); else b.idx.push(i[0], i[2], i[1]);
    }
  };
  // gebogenes Blatt (Palmwedel): Streifen entlang einer hängenden Kurve
  const frond = (f, y, r, ang, len, width, col) => {
    const b = ctx.batch(chunk, MAT.PAINT);
    const dir = add(mul(F, Math.cos(ang)), mul(R, Math.sin(ang))), side = add(mul(F, -Math.sin(ang)), mul(R, Math.cos(ang)));
    const base = W(f, y, r), N = 6;
    let prev = null;
    for (let k = 0; k <= N; k++) {
      const t = k / N, out = len * t, drop = 1.6 * t * t - 0.5 * t;
      const w = width * Math.sin(PI * Math.min(1, t * 1.1 + 0.05)) * 0.5;
      const c = add(add(base, mul(dir, out)), [0, -drop, 0]);
      const n = norm(add([0, 1, 0], mul(dir, 0.35 * t)));
      const ia = b.v(add(c, mul(side, -w)), n, 0, t, null, col), ib = b.v(add(c, mul(side, w)), n, 1, t, null, col);
      if (prev) b.idx.push(prev[0], ia, prev[1], prev[1], ia, ib, prev[0], prev[1], ia, prev[1], ib, ia);
      prev = [ia, ib];
    }
  };
  return { W, box, cyl, gable, frond, colBox, quad, F, R };
}

const MODELS = {
  palm(k, s, low) {
    // Unter Sprunglücken niedrig (wie die übrigen Modelle), sonst streift die höhere Flugbahn den Stamm
    const h = (low ? 4.2 : 8.5) * s, lean = 0.9 * s;
    const N = 5;
    for (let q = 0; q < N; q++) {
      const t0 = q / N, t1 = (q + 1) / N;
      const r0 = 0.3 - 0.1 * t0, r1 = 0.3 - 0.1 * t1;
      k.cyl(lean * t0 * t0, h * t0, 0, r0, r1, h / N + 0.05, 7, MAT.PAINT, C.bark, false, false);
    }
    k.colBox(0.3, h / 2, 0, 0.8, h, 0.8);
    for (let q = 0; q < 9; q++) k.frond(lean, h, 0, q * 2 * PI / 9 + 0.3, (low ? 3.2 : 4.2) * s, 1.5, q % 2 ? C.leaf : C.leafDark);
    k.box(lean, h - 0.3, 0, 0.6, 0.5, 0.6, MAT.PAINT, C.wood);
  },
  cactus(k, s) {
    const h = 5.2 * s;
    k.cyl(0, 0, 0, 0.5, 0.46, h, 10, MAT.PAINT, C.cactus, true);
    k.cyl(0, h, 0, 0.46, 0.05, 0.45, 10, MAT.PAINT, C.cactus, false, false);
    for (const [sr, ah] of [[1, 1.9], [-1, 2.6]]) {
      k.box(0, ah * s, sr * 0.95, 0.62, 0.62, 1.2, MAT.PAINT, C.cactus);
      k.cyl(0, ah * s, sr * 1.45, 0.34, 0.3, 1.9 * s, 8, MAT.PAINT, C.cactus, false);
    }
  },
  tennis(k, s, low, flip) {
    k.box(0, 0.06, 0, 18.5, 0.12, 12.5, MAT.PAINT, C.courtOut, true);
    k.box(0, 0.13, 0, 15.8, 0.04, 8.2, MAT.PAINT, C.court);
    const ln = (f, r, lf, lr) => k.box(f, 0.16, r, lf, 0.02, lr, MAT.PAINT, C.line);
    ln(0, -4.05, 15.8, 0.1); ln(0, 4.05, 15.8, 0.1); ln(-7.85, 0, 0.1, 8.2); ln(7.85, 0, 0.1, 8.2);
    ln(0, -3.0, 15.8, 0.07); ln(0, 3.0, 15.8, 0.07); ln(-4.4, 0, 0.07, 6.0); ln(4.4, 0, 0.07, 6.0); ln(0, 0, 8.8, 0.07);
    for (const r of [-4.6, 4.6]) k.box(0, 0.55, r, 0.1, 1.1, 0.1, MAT.STEEL, null);
    k.box(0, 0.62, 0, 0.04, 0.9, 9.2, MAT.PAINT, [0.08, 0.08, 0.08]);
    // Zaun
    for (const f of [-9.1, 9.1]) for (let r = -6; r <= 6; r += 3) k.box(f, 1.5, r, 0.12, 3, 0.12, MAT.STEEL, null, true);
    for (const r of [-6.1, 6.1]) for (let f = -9; f <= 9; f += 3) k.box(f, 1.5, r, 0.12, 3, 0.12, MAT.STEEL, null, true);
    for (const f of [-9.1, 9.1]) k.box(f, 3, 0, 0.08, 0.08, 12.3, MAT.STEEL, null);
    for (const r of [-6.1, 6.1]) k.box(0, 3, r, 18.3, 0.08, 0.08, MAT.STEEL, null);
    void low; void flip; void s;
  },
  gas(k, s, low) {
    const ch = low ? 3.6 : 4.6;
    k.box(-3.5, ch + 0.35, 0, 9, 0.7, 12, MAT.PAINT, C.white);
    k.box(-3.5, ch + 0.73, 0, 9.1, 0.08, 12.1, MAT.PAINT, C.red);
    for (const f of [-7, 0]) for (const r of [-4.5, 4.5]) k.box(f, ch / 2, r, 0.45, ch, 0.45, MAT.STEEL, null, true);
    for (const r of [-2.4, 2.4]) { k.box(-3.5, 0.15, r, 6, 0.3, 1.4, MAT.PAINT, C.concrete, true); for (const f of [-5, -2]) k.box(f, 0.95, r, 0.7, 1.6, 0.5, MAT.PAINT, C.red, true); }
    // Laden hinten
    k.box(5.5, 1.9, 0, 6, 3.8, 10, MAT.PAINT, C.cream, true);
    k.box(2.47, 1.6, 0, 0.1, 2.2, 7.5, MAT.GLASS, null);
    k.box(5.5, 3.95, 0, 6.3, 0.3, 10.3, MAT.PAINT, C.red);
    // Preismast
    k.box(-8.8, 3, 5.4, 0.3, 6, 0.3, MAT.STEEL, null, true);
    k.box(-8.8, 5.6, 5.4, 0.4, 1.6, 2.4, MAT.PAINT, C.yellow);
  },
  barn(k, s, low) {
    const h = low ? 3.2 : 4.8;
    k.box(0, h / 2, 0, 12, h, 8.5, MAT.PAINT, C.red, true);
    k.gable(0, h, 0, 12, 8.5, low ? 1.4 : 3.2, MAT.PAINT, C.roof);
    k.box(-6.04, h * 0.42, 0, 0.1, h * 0.8, 3.6, MAT.PAINT, C.darkRed);
    for (const r of [-1.8, 0, 1.8]) k.box(-6.07, h * 0.42, r, 0.06, h * 0.8, 0.14, MAT.PAINT, C.white);
    k.box(-6.07, h * 0.82, 0, 0.06, 0.14, 3.7, MAT.PAINT, C.white);
  },
  office(k, s, low) {
    const floors = low ? 1 : 3, fh = 3.1, h = floors * fh;
    k.box(0, h / 2, 0, 12, h, 12, MAT.PAINT, C.concrete, true);
    for (let q = 0; q < floors; q++) {
      const y = q * fh + 1.7;
      for (const [f, r, lf, lr] of [[6.02, 0, 0.06, 10.6], [-6.02, 0, 0.06, 10.6], [0, 6.02, 10.6, 0.06], [0, -6.02, 10.6, 0.06]]) k.box(f, y, r, lf, 1.5, lr, MAT.GLASS, null);
    }
    k.box(0, h + 0.2, 0, 12.4, 0.4, 12.4, MAT.PAINT, C.white);
    if (!low) k.box(2, h + 1.2, -2, 3, 2, 3, MAT.PAINT, C.concrete);
    k.box(-6.3, 1.3, 0, 0.6, 2.6, 3, MAT.GLASS, null);
  },
  windmill(k, s, low) {
    const h = low ? 4 : 9.5;
    k.cyl(0, 0, 0, 3.3, 2.1, h, 8, MAT.PAINT, low ? C.cream : C.brick, true);
    k.cyl(0, h, 0, 2.5, 0.25, 2.6, 8, MAT.PAINT, C.roof, false, false);
    if (low) return;
    const hub = [-2.6, h + 0.9, 0];
    k.box(hub[0] + 0.6, hub[1], 0, 1.6, 0.9, 0.9, MAT.PAINT, C.wood);
    for (let q = 0; q < 4; q++) {
      const a = q * PI / 2 + 0.35, len = 8;
      const cy = hub[1] + Math.sin(a) * len / 2, cr = Math.cos(a) * len / 2;
      // Flügel: Stange + Gitterfläche in der Ebene quer zur Blickrichtung
      k.box(hub[0], cy, cr, 0.25, Math.abs(Math.sin(a)) * len + 0.25, Math.abs(Math.cos(a)) * len + 0.25, MAT.PAINT, C.wood, false, 0);
      const ox = Math.cos(a + PI / 2) * 0.9, oy = Math.sin(a + PI / 2) * 0.9;
      const sc = [hub[1] + Math.sin(a) * len * 0.58 + oy, Math.cos(a) * len * 0.58 + ox];
      const vert = Math.abs(Math.sin(a)) > 0.5;
      k.box(hub[0] - 0.05, sc[0], sc[1], 0.08, vert ? len * 0.62 : 1.5, vert ? 1.5 : len * 0.62, MAT.PAINT, C.sail);
    }
  },
  ship(k, s, low, flip, onWater) {
    const y0 = onWater ? -0.3 : 0.4;
    const len = 18, w = 5.2;
    // Rumpf: unten schmal (zwei Quader + Bugkeil)
    k.box(-1, y0 + 0.7, 0, len - 4, 2.6, w, MAT.PAINT, C.hull, true);
    k.box(-1, y0 - 0.5, 0, len - 4, 0.4, w - 0.3, MAT.PAINT, C.hullRed);
    k.box(len / 2 - 2.4, y0 + 0.8, 0, 4.2, 2.4, w * 0.62, MAT.PAINT, C.hull, true, 0, 0);
    k.box(len / 2 - 0.9, y0 + 1.1, 0, 2.2, 1.8, w * 0.3, MAT.PAINT, C.hull);
    k.box(-1, y0 + 2.05, 0, len - 3.8, 0.12, w + 0.1, MAT.PAINT, C.white);
    if (!low) {
      k.box(-3.5, y0 + 3.4, 0, 6, 2.6, 3.8, MAT.PAINT, C.white, true);
      k.box(-3.4, y0 + 3.6, 0, 6.05, 0.7, 3.85, MAT.GLASS, null);
      k.box(-5, y0 + 5.6, 0, 1.4, 2.2, 1.4, MAT.PAINT, C.red);
      k.box(1.5, y0 + 5, 0, 0.18, 6, 0.18, MAT.STEEL, null);
    }
  },
  diner(k, s, low) {
    const h = 3.6;
    k.box(0, h / 2, 0, 7, h, 13, MAT.PAINT, C.chrome, true);
    k.box(-3.52, 1.8, 0, 0.06, 1.3, 11, MAT.GLASS, null);
    k.box(0, h + 0.15, 0, 7.4, 0.3, 13.4, MAT.PAINT, C.red);
    k.box(-3.6, 0.35, 0, 0.3, 0.7, 13, MAT.PAINT, C.red);
    if (!low) {
      k.box(-5.2, 3.2, 5.5, 0.35, 6.4, 0.35, MAT.STEEL, null, true);
      k.box(-5.2, 6.8, 5.5, 0.6, 1.6, 5.2, MAT.PAINT, C.yellow);
    }
  },
};

// items: [{ kind, i, j, facing, lvl, water, low }]; ctx: { batch, chunkOf, addColTri, groundAt, LH, trees, decals }
export function buildScenery(items, ctx) {
  for (const it of items) {
    const x = tileX(it.i), z = tileZ(it.j);
    const g = ctx.groundAt(x, z);
    const s = 0.9 + ((it.i * 7 + it.j * 13) % 5) * 0.06;
    if (it.kind === 'pine') {
      ctx.trees.push({ x, y: g, z, s: 1.05 * s, rot: (it.i * 1.7 + it.j) % PI, v: (it.i + it.j) % 2, keep: 1 });
      continue;
    }
    if (it.kind === 'ghost' || it.kind === 'ghostop') {
      if (ctx.decals) ctx.decals.push({ type: 'car', p: [x, g + 0.05, z], d: it.facing, color: it.kind === 'ghost' ? 0x2a5bd7 : 0xd7c02a });
      continue;
    }
    const M = MODELS[it.kind];
    if (!M) continue;
    const onWater = it.water && it.kind === 'ship';
    const y0 = onWater ? WATER_Y : g;
    const k = kit(ctx, x, y0, z, it.facing);
    M(k, s, !!it.low, false, onWater);
    if (it.kind === 'diner' && !it.low && ctx.decals) {
      const d = it.facing, F = DIRS[d], R = DIRS[(d + 1) % 4];
      ctx.decals.push({ type: 'sign', text: 'DINER', p: [x - F[0] * 5.2 + R[0] * 5.5 - F[0] * 0.32, y0 + 6.8, z - F[1] * 5.2 + R[1] * 5.5 - F[1] * 0.32], F: [-F[0], 0, -F[1]], w: 5, h: 1.4 });
    }
  }
}
export { GRID };
