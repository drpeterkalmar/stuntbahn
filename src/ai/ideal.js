// Ideallinie: seitliche Versätze zur Basislinie, die die Krümmung minimieren (außen-innen-außen),
// begrenzt durch die befahrbare Breite je Linienpunkt (lo/hi). Ergebnis ist eine eigene Linie mit
// gleichem Index-Raster wie die Basislinie (Tempo-Profil und Autopilot rechnen darauf).

const STEP = 1.5;

export function computeIdeal(L, opts = {}) {
  const n = L.n, closed = L.closed;
  // 1) gleichmäßig neu abtasten
  const total = L.total;
  const m = Math.max(8, Math.round(total / STEP));
  const ds = total / m;
  const cnt = closed ? m : m + 1;
  const P = new Float64Array(cnt * 3), B = new Float64Array(cnt * 3), lo = new Float64Array(cnt), hi = new Float64Array(cnt);
  let j = 0;
  for (let k = 0; k < cnt; k++) {
    const s = Math.min(total, k * ds);
    while (j < n - 2 && L.s[j + 1] < s) j++;
    const s0 = L.s[j], s1 = L.s[j + 1];
    const t = s1 > s0 ? Math.max(0, Math.min(1, (s - s0) / (s1 - s0))) : 0;
    const a = j, b = j + 1;
    P[k * 3] = L.px[a] + (L.px[b] - L.px[a]) * t; P[k * 3 + 1] = L.py[a] + (L.py[b] - L.py[a]) * t; P[k * 3 + 2] = L.pz[a] + (L.pz[b] - L.pz[a]) * t;
    let bx = L.bx[a] + (L.bx[b] - L.bx[a]) * t, by = L.by[a] + (L.by[b] - L.by[a]) * t, bz = L.bz[a] + (L.bz[b] - L.bz[a]) * t;
    const bl = Math.hypot(bx, by, bz) || 1;
    B[k * 3] = bx / bl; B[k * 3 + 1] = by / bl; B[k * 3 + 2] = bz / bl;
    // engere Grenze der beiden Nachbarn
    lo[k] = Math.max(L.lo[a], L.lo[b]); hi[k] = Math.min(L.hi[a], L.hi[b]);
    if (L.air[a] || L.air[b]) { lo[k] = hi[k] = 0; }
    if (lo[k] > hi[k]) lo[k] = hi[k] = (lo[k] + hi[k]) / 2;
  }
  // 2) Minimal-Krümmungs-Glättung (bi-Laplace, iterativ, mit Grenzen)
  const o = new Float64Array(cnt);
  const Q = Float64Array.from(P);
  const idx = (k) => closed ? ((k % cnt) + cnt) % cnt : Math.max(0, Math.min(cnt - 1, k));
  const iters = opts.iters ?? 1400;
  for (let it = 0; it < iters; it++) {
    const w = it < iters * 0.5 ? 0.9 : 0.6;
    for (let k = 0; k < cnt; k++) {
      if (!closed && (k < 2 || k > cnt - 3)) continue;
      if (lo[k] === hi[k]) { o[k] = lo[k]; }
      else {
        const a2 = idx(k - 2), a1 = idx(k - 1), b1 = idx(k + 1), b2 = idx(k + 2);
        let tx = 0, ty = 0, tz = 0;
        for (let c = 0; c < 3; c++) {
          const v = (-Q[a2 * 3 + c] + 4 * Q[a1 * 3 + c] + 4 * Q[b1 * 3 + c] - Q[b2 * 3 + c]) / 6;
          if (c === 0) tx = v; else if (c === 1) ty = v; else tz = v;
        }
        const d = (tx - P[k * 3]) * B[k * 3] + (ty - P[k * 3 + 1]) * B[k * 3 + 1] + (tz - P[k * 3 + 2]) * B[k * 3 + 2];
        let nv = o[k] + w * (d - o[k]);
        if (nv < lo[k]) nv = lo[k]; else if (nv > hi[k]) nv = hi[k];
        o[k] = nv;
      }
      Q[k * 3] = P[k * 3] + B[k * 3] * o[k]; Q[k * 3 + 1] = P[k * 3 + 1] + B[k * 3 + 1] * o[k]; Q[k * 3 + 2] = P[k * 3 + 2] + B[k * 3 + 2] * o[k];
    }
  }
  // 3) Versätze zurück auf die Original-Samples
  const off = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const f = Math.min(cnt - 1 + (closed ? 1 : 0), L.s[i] / ds);
    const k0 = Math.floor(f), t = f - k0;
    const v0 = o[idx(k0)], v1 = o[idx(k0 + 1)];
    let v = v0 + (v1 - v0) * t;
    v = Math.max(L.lo[i], Math.min(L.hi[i], v));
    if (L.air[i]) v = 0;
    off[i] = v;
  }
  return makeLine(L, off);
}

// Neue Linie aus Basislinie + Versätzen (Tangenten/Rahmen/Bogenlänge neu)
export function makeLine(L, off) {
  const n = L.n;
  const I = { ...L };
  for (const k of ['px', 'py', 'pz', 'tx', 'ty', 'tz', 'nx', 'ny', 'nz', 'bx', 'by', 'bz', 's']) I[k] = new Float32Array(n);
  I.off = off;
  for (let i = 0; i < n; i++) {
    I.px[i] = L.px[i] + L.bx[i] * off[i]; I.py[i] = L.py[i] + L.by[i] * off[i]; I.pz[i] = L.pz[i] + L.bz[i] * off[i];
  }
  let acc = 0;
  for (let i = 0; i < n; i++) {
    if (i > 0) acc += Math.hypot(I.px[i] - I.px[i - 1], I.py[i] - I.py[i - 1], I.pz[i] - I.pz[i - 1]);
    I.s[i] = acc;
  }
  I.total = acc;
  for (let i = 0; i < n; i++) {
    let a = i - 1, b = i + 1;
    if (a < 0) a = L.closed ? n - 2 : 0;
    if (b >= n) b = L.closed ? 1 : n - 1;
    // an Luftstrecken einseitig (Schanzenlippe/Landung behalten ihre echte Neigung)
    if (L.air[a] !== L.air[i]) a = i;
    if (L.air[b] !== L.air[i]) b = i;
    let tx = I.px[b] - I.px[a], ty = I.py[b] - I.py[a], tz = I.pz[b] - I.pz[a];
    let l = Math.hypot(tx, ty, tz);
    if (l < 1e-6) { tx = L.tx[i]; ty = L.ty[i]; tz = L.tz[i]; l = 1; }
    tx /= l; ty /= l; tz /= l;
    // Normale aus Basis, orthogonalisiert
    let nx = L.nx[i], ny = L.ny[i], nz = L.nz[i];
    const d = nx * tx + ny * ty + nz * tz;
    nx -= d * tx; ny -= d * ty; nz -= d * tz;
    const nl = Math.hypot(nx, ny, nz) || 1; nx /= nl; ny /= nl; nz /= nl;
    I.tx[i] = tx; I.ty[i] = ty; I.tz[i] = tz; I.nx[i] = nx; I.ny[i] = ny; I.nz[i] = nz;
    I.bx[i] = ty * nz - tz * ny; I.by[i] = tz * nx - tx * nz; I.bz[i] = tx * ny - ty * nx;
  }
  // Grenzen relativ zur neuen Linie
  I.lo = new Float32Array(n); I.hi = new Float32Array(n);
  for (let i = 0; i < n; i++) { I.lo[i] = L.lo[i] - off[i]; I.hi[i] = L.hi[i] - off[i]; }
  return I;
}
