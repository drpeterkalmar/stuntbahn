// Gelände importierter Strecken: Höhenfeld aus dem 30×30-Geländeraster der .TRK-Datei.
// Jede Feldecke hat eine Höhe (0 = Ebene, 1 = Hügel = eine Hochstraßen-Ebene); innerhalb eines Feldes
// wird mit Kosinus-Glättung interpoliert – exakt dasselbe Profil wie Straßen/Rampen auf Hängen, damit
// Fahrbahn und Hang zusammenpassen. Wasser: Seebett mit Uferböschung (Distanzfeld auf 1-m-Raster).
// Außerhalb des Rasters: sanfter Übergang in Hügel und Bergkranz (wie bei generierten Strecken).
import { TILE, GRID } from './defs.js';
import { TERRAIN } from './trkelems.js';
import { clamp, smoothstep, makeNoise2 } from '../core/util.js';

export const WATER_Y = -0.9;     // Wasserspiegel
const DEPTH = 2.8, SHORE = 5;    // Seetiefe, Breite der Uferböschung (m)
const HALF = GRID * TILE / 2;
const cs = (t) => 0.5 - 0.5 * Math.cos(Math.PI * t);   // gleiches Profil wie Hang-Straßen

export function buildTrkTerrain(trk, LH, seed = 1, occupied = null) {
  const codes = trk.terr;
  const C = (i, j) => (TERRAIN[codes[j * GRID + i]] || TERRAIN[0]);
  // Wassermaske (1 m) + Abstand zum Land (Chamfer 3-4)
  const R = 1, NW = Math.round(2 * HALF / R);
  const INF = 1e9;
  const dist = new Float32Array(NW * NW).fill(0);
  let anyWater = false;
  for (let y = 0; y < NW; y++) for (let x = 0; x < NW; x++) {
    const px = (x + 0.5) * R, pz = (y + 0.5) * R;
    const i = Math.floor(px / TILE), j = Math.floor(pz / TILE);
    const t = C(i, j);
    let w = false;
    if (t.water) {
      const u = px / TILE - i, v = pz / TILE - j;
      const [a, b, c, d] = t.water; // NW, NE, SW, SE
      if (a && b && c && d) w = true;
      else if (c) w = v > u;          // SW-Hälfte unterhalb der Diagonale NW–SE
      else if (d) w = u + v > 1;      // SE
      else if (b) w = u > v;          // NE
      else if (a) w = u + v < 1;      // NW
    }
    if (w) { dist[y * NW + x] = INF; anyWater = true; }
  }
  if (anyWater) {
    for (let y = 0; y < NW; y++) for (let x = 0; x < NW; x++) {
      const k = y * NW + x; if (!dist[k]) continue;
      let m = dist[k];
      if (x > 0) m = Math.min(m, dist[k - 1] + 1);
      if (y > 0) { m = Math.min(m, dist[k - NW] + 1); if (x > 0) m = Math.min(m, dist[k - NW - 1] + 1.414); if (x < NW - 1) m = Math.min(m, dist[k - NW + 1] + 1.414); }
      dist[k] = m;
    }
    for (let y = NW - 1; y >= 0; y--) for (let x = NW - 1; x >= 0; x--) {
      const k = y * NW + x; if (!dist[k]) continue;
      let m = dist[k];
      if (x < NW - 1) m = Math.min(m, dist[k + 1] + 1);
      if (y < NW - 1) { m = Math.min(m, dist[k + NW] + 1); if (x < NW - 1) m = Math.min(m, dist[k + NW + 1] + 1.414); if (x > 0) m = Math.min(m, dist[k + NW - 1] + 1.414); }
      dist[k] = m;
    }
    for (let k = 0; k < dist.length; k++) if (dist[k] >= INF) dist[k] = 60;
  }
  const waterDepth = (x, z) => {
    if (!anyWater) return 0;
    const fx = (x + HALF) / R - 0.5, fz = (z + HALF) / R - 0.5;
    const i0 = clamp(Math.floor(fx), 0, NW - 2), j0 = clamp(Math.floor(fz), 0, NW - 2);
    const tx = clamp(fx - i0, 0, 1), tz = clamp(fz - j0, 0, 1);
    const a = dist[j0 * NW + i0], b = dist[j0 * NW + i0 + 1], c = dist[(j0 + 1) * NW + i0], d = dist[(j0 + 1) * NW + i0 + 1];
    const dd = (a * (1 - tx) + b * tx) * (1 - tz) + (c * (1 - tx) + d * tx) * tz;
    return dd <= 0 ? 0 : DEPTH * smoothstep(0, SHORE, dd);
  };
  // Höhe innerhalb des Rasters (Ebenen × LH), ohne Wasser
  const gridH = (x, z) => {
    const fx = (x + HALF) / TILE, fz = (z + HALF) / TILE;
    const i = clamp(Math.floor(fx), 0, GRID - 1), j = clamp(Math.floor(fz), 0, GRID - 1);
    const u = clamp(fx - i, 0, 1), v = clamp(fz - j, 0, 1);
    const c = C(i, j).c;
    const su = cs(u), sv = cs(v);
    const top = c[0] + (c[1] - c[0]) * su, bot = c[2] + (c[3] - c[2]) * su;
    return (top + (bot - top) * sv) * LH;
  };
  // Abstand zu belegten Feldern (für AO/Bäume), 8er-Nachbarschaft
  const D = new Float32Array(GRID * GRID).fill(99);
  if (occupied) {
    const q = [];
    for (let k = 0; k < GRID * GRID; k++) if (occupied[k]) { D[k] = 0; q.push(k); }
    for (let h = 0; h < q.length; h++) {
      const k = q[h], i = k % GRID, j = (k / GRID) | 0;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        const ni = i + di, nj = j + dj;
        if (ni < 0 || nj < 0 || ni >= GRID || nj >= GRID) continue;
        const nk = nj * GRID + ni, nd = D[k] + (di && dj ? 1.414 : 1);
        if (nd < D[nk]) { D[nk] = nd; q.push(nk); }
      }
    }
  }
  const distTiles = (x, z) => {
    const fi = (x + HALF) / TILE - 0.5, fj = (z + HALF) / TILE - 0.5;
    const i0 = Math.floor(fi), j0 = Math.floor(fj), tx = fi - i0, tz = fj - j0;
    const g = (i, j) => (i < 0 || j < 0 || i >= GRID || j >= GRID) ? 99 : D[j * GRID + i];
    const out = Math.max(Math.abs(x) - HALF, Math.abs(z) - HALF, 0) / TILE;
    const v = Math.min(99, (g(i0, j0) * (1 - tx) + g(i0 + 1, j0) * tx) * (1 - tz) + (g(i0, j0 + 1) * (1 - tx) + g(i0 + 1, j0 + 1) * tx) * tz);
    return Math.min(v, 30) + out;
  };
  // Außen: Randhöhe des Rasters → sanfte Hügel + Bergkranz
  const noise = makeNoise2(seed * 7 + 3);
  const outside = (x, z) => {
    const r = Math.hypot(x, z);
    const hills = 13 * Math.pow(noise.fbm(x / 230 + 11, z / 230 - 7, 4) * 0.5 + 0.5, 1.6) + 5 * noise.fbm(x / 90, z / 90, 3);
    const rim = 70 * smoothstep(420, 950, r) * (0.7 + 0.3 * noise.fbm(x / 300, z / 300, 2));
    return Math.max(0, hills) + rim;
  };
  const heightFn = (x, z) => {
    const ox = Math.max(Math.abs(x) - HALF, 0), oz = Math.max(Math.abs(z) - HALF, 0);
    if (!ox && !oz) return gridH(x, z) - waterDepth(x, z);
    const d = Math.hypot(ox, oz);
    const edge = gridH(clamp(x, -HALF + 0.01, HALF - 0.01), clamp(z, -HALF + 0.01, HALF - 0.01));
    const k = smoothstep(0, 70, d);
    return edge * (1 - k) + outside(x, z) * smoothstep(10, 90, d);
  };
  // Raster für Grafik (5 m); Physik nutzt die exakte Funktion
  const ext = HALF + 60, step = 5;
  const nx = Math.round(2 * ext / step) + 1;
  const H = new Float32Array(nx * nx);
  for (let j = 0; j < nx; j++) for (let i = 0; i < nx; i++) H[j * nx + i] = heightFn(-ext + i * step, -ext + j * step);
  const waters = anyWater ? [{ E: [0, 0, 0], F: [1, 0, 0], R: [0, 0, 1], f0: -HALF, f1: HALF, r0: -HALF, r1: HALF, y: WATER_Y }] : [];
  return { ext, step, nx, H, Hr: null, height: heightFn, heightFn, distTiles, waters, imported: true, LH };
}

// Grafik-Raster unter Fahrbahnen absenken: das 5-m-Raster interpoliert linear und würde auf Hängen
// sonst bis zu 0,2 m durch die (exakt geglättete) Fahrbahn stechen. Dreiecke der Fahrbahn werden auf
// das Raster gelegt, Rasterpunkte darunter auf „Fahrbahn − 0,25 m“ begrenzt (nur Grafik).
export function carveUnderRoads(terr, batches, isRoadMat) {
  const { ext, step, nx } = terr;
  const Hr = Float32Array.from(terr.H);
  const pad = 1.2;
  for (const b of batches) {
    if (!isRoadMat(b.mat)) continue;
    const P = b.pos, I = b.idx;
    for (let t = 0; t < I.length; t += 3) {
      const a = I[t] * 3, c = I[t + 1] * 3, d = I[t + 2] * 3;
      const ax = P[a], az = P[a + 2], bx = P[c], bz = P[c + 2], cx = P[d], cz = P[d + 2];
      const x0 = Math.min(ax, bx, cx) - pad, x1 = Math.max(ax, bx, cx) + pad;
      const z0 = Math.min(az, bz, cz) - pad, z1 = Math.max(az, bz, cz) + pad;
      const det = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
      if (Math.abs(det) < 1e-6) continue;
      const i0 = Math.max(0, Math.ceil((x0 + ext) / step)), i1 = Math.min(nx - 1, Math.floor((x1 + ext) / step));
      const j0 = Math.max(0, Math.ceil((z0 + ext) / step)), j1 = Math.min(nx - 1, Math.floor((z1 + ext) / step));
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const px = -ext + i * step, pz = -ext + j * step;
        const l1 = ((bz - cz) * (px - cx) + (cx - bx) * (pz - cz)) / det;
        const l2 = ((cz - az) * (px - cx) + (ax - cx) * (pz - cz)) / det;
        const l3 = 1 - l1 - l2;
        if (l1 < -0.25 || l2 < -0.25 || l3 < -0.25) continue;
        const y = P[a + 1] * l1 + P[c + 1] * l2 + P[d + 1] * l3 - 0.25;
        const k = j * nx + i;
        // nur knapp unter/über der Fahrbahn (Hochstraße darüber: Boden bleibt)
        if (Hr[k] > y && Hr[k] < y + 1.2) Hr[k] = y;
      }
    }
  }
  terr.Hr = Hr;
}
